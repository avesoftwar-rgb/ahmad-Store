# Week 5 LLM Deployment Guide

## Overview

This guide explains how to deploy your LLM with both RAG (Week 3) and simple generation (Week 5) endpoints using Google Colab and integrate it with your Week 5 backend.

## Architecture

```
Your Backend (Node.js)
    ↓
    ├── /generate endpoint → Simple text completion (Week 5)
    └── /chat endpoint → RAG-based responses (Week 3)
    ↓
LLM Service (Colab + Ngrok)
```

## Step 1: Deploy LLM on Google Colab

### Option A: Using the Python Script

1. **Open Google Colab**: https://colab.research.google.com
2. **Create a new notebook**
3. **Upload the script**: Upload `llm_week5_deployment.py` to Colab
4. **Install dependencies**:
```python
!pip install -q transformers torch sentence-transformers faiss-cpu
!pip install -q fastapi uvicorn pyngrok nest-asyncio
!pip install -q accelerate bitsandbytes
```

5. **Run the script**:
```python
exec(open('llm_week5_deployment.py').read())
```

### Option B: Using the Notebook

1. **Upload** `llm_week5_deployment.ipynb` to Colab
2. **Run cells sequentially** from top to bottom
3. **Enter your ngrok token** when prompted

### Getting Ngrok Token

1. Sign up at https://ngrok.com (free)
2. Get your auth token from https://dashboard.ngrok.com/auth
3. Copy the token and paste when prompted

## Step 2: Test Your Endpoints

Once deployed, you'll get a public URL like: `https://abc123.ngrok.io`

### Test with curl:

```bash
# Test health
curl https://abc123.ngrok.io/health

# Test RAG endpoint (Week 3)
curl -X POST https://abc123.ngrok.io/chat \
  -H "Content-Type: application/json" \
  -d '{"question": "How do I return a product?"}'

# Test generation endpoint (Week 5)
curl -X POST https://abc123.ngrok.io/generate \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Hello, I am", "max_tokens": 50}'
```

## Step 3: Integrate with Your Backend

### Add to your `.env` file:

```env
# LLM Configuration
LLM_API_URL=https://abc123.ngrok.io
LLM_TIMEOUT=30000
```

### Backend Integration Code

Create `src/services/llm-service.js`:

```javascript
const axios = require('axios');

class LLMService {
  constructor() {
    this.baseURL = process.env.LLM_API_URL;
    this.timeout = parseInt(process.env.LLM_TIMEOUT) || 30000;
  }

  // Week 5: Simple text generation
  async generateText(prompt, maxTokens = 200, temperature = 0.7) {
    try {
      const response = await axios.post(
        `${this.baseURL}/generate`,
        {
          prompt,
          max_tokens: maxTokens,
          temperature
        },
        { timeout: this.timeout }
      );
      return response.data.text;
    } catch (error) {
      console.error('LLM generate error:', error);
      throw new Error('Failed to generate text');
    }
  }

  // Week 3: RAG-based chat
  async chatWithRAG(question) {
    try {
      const response = await axios.post(
        `${this.baseURL}/chat`,
        { question },
        { timeout: this.timeout }
      );
      return response.data;
    } catch (error) {
      console.error('LLM chat error:', error);
      throw new Error('Failed to get chat response');
    }
  }

  // Check if LLM is available
  async checkHealth() {
    try {
      const response = await axios.get(
        `${this.baseURL}/health`,
        { timeout: 5000 }
      );
      return response.data;
    } catch (error) {
      return { status: 'offline', error: error.message };
    }
  }
}

module.exports = new LLMService();
```

### Using in Your Assistant

```javascript
// src/assistant/engine.js
const llmService = require('../services/llm-service');
const knowledgeBase = require('../../docs/ground-truth.json');

class AssistantEngine {
  async generateResponse(userInput, intent, context = {}) {
    try {
      switch (intent) {
        case 'policy_question':
          // Ground locally first
          const relevantPolicies = this.findRelevantPolicies(userInput);
          if (relevantPolicies.length > 0) {
            const prompt = this.buildGroundedPrompt(userInput, relevantPolicies);
            const response = await llmService.generateText(prompt, 150, 0.3);
            return {
              text: response,
              intent,
              citations: relevantPolicies.map(p => p.id),
              functionsCalled: []
            };
          }
          return {
            text: "I couldn't find information about this policy.",
            intent,
            citations: [],
            functionsCalled: []
          };

        case 'order_status':
          // Call function then generate response
          const orderData = await this.getOrderStatus(context.orderId);
          const prompt = `Customer asks about order ${context.orderId}. 
            Order status: ${orderData.status}. 
            Provide a helpful response:`;
          const response = await llmService.generateText(prompt, 100, 0.5);
          return {
            text: response,
            intent,
            citations: [],
            functionsCalled: ['getOrderStatus']
          };

        case 'chitchat':
          // Simple generation for casual conversation
          const response = await llmService.generateText(
            `Respond briefly and professionally to: ${userInput}`,
            50,
            0.7
          );
          return {
            text: response,
            intent,
            citations: [],
            functionsCalled: []
          };

        default:
          return {
            text: "How can I help you today?",
            intent: 'unknown',
            citations: [],
            functionsCalled: []
          };
      }
    } catch (error) {
      console.error('Assistant error:', error);
      return {
        text: "I'm having trouble processing your request. Please try again.",
        intent,
        citations: [],
        functionsCalled: [],
        error: error.message
      };
    }
  }

  findRelevantPolicies(query) {
    // Simple keyword matching for grounding
    const keywords = query.toLowerCase().split(' ');
    return knowledgeBase.filter(policy => {
      const content = (policy.question + ' ' + policy.answer).toLowerCase();
      return keywords.some(keyword => content.includes(keyword));
    }).slice(0, 3);
  }

  buildGroundedPrompt(query, policies) {
    const context = policies.map(p => 
      `[${p.id}] ${p.question}: ${p.answer}`
    ).join('\n\n');
    
    return `You are a Shoplite support assistant. 
      Answer based on these policies:
      ${context}
      
      Customer asks: ${query}
      
      Provide a helpful answer and cite the policy IDs:`;
  }
}

module.exports = AssistantEngine;
```

## Step 4: Testing the Integration

### Create a test script:

```javascript
// test-llm-integration.js
require('dotenv').config();
const llmService = require('./src/services/llm-service');

async function testIntegration() {
  console.log('Testing LLM Integration...\n');

  // Check health
  const health = await llmService.checkHealth();
  console.log('Health:', health);

  // Test generation
  const generated = await llmService.generateText(
    'List 3 benefits of online shopping:',
    100,
    0.7
  );
  console.log('\nGenerated text:', generated);

  // Test RAG
  const ragResponse = await llmService.chatWithRAG(
    'How do I return a product?'
  );
  console.log('\nRAG response:', ragResponse);
}

testIntegration().catch(console.error);
```

## Troubleshooting

### Common Issues

1. **Colab disconnects**: 
   - Click "Reconnect" button
   - Re-run all cells
   - Consider using Colab Pro for longer sessions

2. **Ngrok URL changes**:
   - Update your `.env` file with new URL
   - Restart your backend server

3. **Out of memory**:
   - Use smaller model (phi-2 instead of llama-2)
   - Reduce batch size
   - Clear GPU memory: `torch.cuda.empty_cache()`

4. **Slow responses**:
   - Reduce `max_tokens`
   - Use lower temperature for faster generation
   - Consider caching frequent responses

### Model Options for Different Resources

**Low Memory (Colab Free)**:
- microsoft/phi-2 (2.7B params)
- google/flan-t5-base (250M params)

**Medium Memory**:
- NousResearch/Llama-2-7b-hf (7B params)
- mistralai/Mistral-7B-v0.1 (7B params)

**High Memory**:
- meta-llama/Llama-2-13b-hf (13B params)

## Performance Optimization

1. **Cache frequent queries**:
```javascript
const cache = new Map();
const CACHE_TTL = 3600000; // 1 hour

async function generateWithCache(prompt) {
  const cached = cache.get(prompt);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.response;
  }
  
  const response = await llmService.generateText(prompt);
  cache.set(prompt, { response, timestamp: Date.now() });
  return response;
}
```

2. **Batch requests** when possible
3. **Use streaming** for long responses
4. **Implement retry logic** for network failures

## Security Considerations

1. **Never expose** your ngrok URL publicly
2. **Add authentication** in production:
```javascript
// Add API key validation
app.use((req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  if (apiKey !== process.env.LLM_API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
});
```

3. **Rate limiting** to prevent abuse
4. **Input validation** and sanitization
5. **Monitor usage** and costs

## Next Steps

1. ✅ Deploy LLM on Colab
2. ✅ Get ngrok public URL
3. ✅ Add URL to backend `.env`
4. ✅ Implement LLM service
5. ✅ Integrate with assistant
6. ✅ Test all endpoints
7. ✅ Deploy backend with LLM integration

## Resources

- [Google Colab](https://colab.research.google.com)
- [Ngrok Dashboard](https://dashboard.ngrok.com)
- [Hugging Face Models](https://huggingface.co/models)
- [FastAPI Docs](https://fastapi.tiangolo.com)
