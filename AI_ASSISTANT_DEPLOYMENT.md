# 🤖 AI Assistant Deployment Guide

This guide explains how to deploy your AI assistant model on Render and integrate it with your existing backend.

## 📋 Overview

The AI assistant is deployed as a separate Python FastAPI service on Render, providing:
- **RAG-based chat** for customer support questions
- **Simple text generation** for general queries
- **Knowledge base integration** with your store policies
- **Seamless integration** with your existing Node.js backend

## 🏗️ Architecture

```
Frontend (Vercel) 
    ↓
Backend API (Render) 
    ↓
AI Assistant Service (Render)
    ↓
Hugging Face Models (microsoft/phi-2)
```

## 🚀 Deployment Steps

### Step 1: Deploy AI Assistant Service

1. **Go to Render Dashboard**: https://render.com
2. **Create New Web Service**:
   - **Name**: `shopmart-ai-assistant`
   - **Environment**: `Python`
   - **Region**: `Frankfurt (EU Central)`
   - **Plan**: `Free`
   - **Root Directory**: `apps/ai-assistant`
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `python main.py`

3. **Environment Variables**:
   ```
   PORT=8000
   PYTHON_VERSION=3.11.0
   ```

4. **Deploy**: Click "Create Web Service" and wait for deployment

### Step 2: Update Backend Configuration

1. **Get AI Assistant URL** from Render dashboard (e.g., `https://shopmart-ai-assistant.onrender.com`)

2. **Update Backend Environment Variables** in Render:
   ```
   AI_ASSISTANT_URL=https://shopmart-ai-assistant.onrender.com
   ```

3. **Redeploy Backend** (or it will auto-deploy if connected to GitHub)

### Step 3: Verify Deployment

Run the test script to verify everything works:

```bash
# Set environment variables
export BACKEND_URL=https://shopmart-api.onrender.com
export AI_ASSISTANT_URL=https://shopmart-ai-assistant.onrender.com

# Run tests
node test-ai-integration.js
```

## 🔧 Configuration

### AI Assistant Service

The AI assistant service (`apps/ai-assistant/main.py`) includes:

- **Model**: microsoft/phi-2 (lightweight, CPU-friendly)
- **Knowledge Base**: Pre-configured with store policies
- **Endpoints**:
  - `GET /health` - Health check
  - `POST /chat` - RAG-based customer support
  - `POST /generate` - Simple text generation

### Backend Integration

The backend (`apps/api/src/services/ai-assistant-service.js`) provides:

- **Automatic fallback** if AI service is unavailable
- **Enhanced responses** using AI for better customer support
- **Health monitoring** of AI service status

## 📊 API Endpoints

### AI Assistant Service

```bash
# Health check
GET https://shopmart-ai-assistant.onrender.com/health

# RAG-based chat
POST https://shopmart-ai-assistant.onrender.com/chat
{
  "question": "How do I return a product?"
}

# Simple generation
POST https://shopmart-ai-assistant.onrender.com/generate
{
  "prompt": "List 3 benefits of online shopping:",
  "max_tokens": 100,
  "temperature": 0.7
}
```

### Backend Integration

```bash
# AI health check through backend
GET https://shopmart-api.onrender.com/api/assistant/ai-health

# Enhanced chat with AI integration
POST https://shopmart-api.onrender.com/api/assistant/chat
{
  "message": "How do I return a product?",
  "context": {}
}
```

## 🛠️ Customization

### Adding Knowledge Base Entries

Edit `apps/ai-assistant/main.py` and add to the `KNOWLEDGE_BASE` array:

```python
KNOWLEDGE_BASE = [
    # ... existing entries ...
    {
        "id": "doc6",
        "title": "Your New Policy",
        "content": "Your policy content here..."
    }
]
```

### Changing the AI Model

Update the `LLM_MODEL` variable in `main.py`:

```python
# For better quality (requires more memory)
LLM_MODEL = "microsoft/phi-3-mini"

# For faster responses (lower quality)
LLM_MODEL = "distilgpt2"
```

### Customizing Responses

Modify the prompt templates in `ai-assistant-service.js`:

```javascript
buildPrompt(userInput, intent, context) {
  const basePrompt = `You are Alex, a helpful customer support specialist...`;
  // Add your customizations here
}
```

## 🔍 Monitoring

### Health Checks

- **AI Service**: `https://shopmart-ai-assistant.onrender.com/health`
- **Backend Integration**: `https://shopmart-api.onrender.com/api/assistant/ai-health`

### Logs

Check Render dashboard logs for:
- AI service startup and model loading
- Backend integration errors
- Response generation issues

## 🚨 Troubleshooting

### Common Issues

1. **AI Service Won't Start**:
   - Check Python version (3.11 required)
   - Verify all dependencies in requirements.txt
   - Check memory limits (free tier has 512MB)

2. **Model Loading Fails**:
   - The service will fallback to distilgpt2
   - Check logs for specific error messages
   - Consider using a smaller model

3. **Backend Can't Connect**:
   - Verify AI_ASSISTANT_URL environment variable
   - Check CORS settings
   - Ensure both services are deployed

4. **Slow Responses**:
   - Free tier has CPU limitations
   - Consider upgrading to paid plan
   - Reduce max_tokens parameter

### Performance Optimization

1. **Caching**: Implement response caching for frequent queries
2. **Model Optimization**: Use quantized models for faster inference
3. **Load Balancing**: Deploy multiple AI service instances
4. **CDN**: Use CDN for static assets

## 📈 Scaling

### Free Tier Limitations

- **Memory**: 512MB RAM
- **CPU**: Shared resources
- **Uptime**: May sleep after inactivity
- **Bandwidth**: 100GB/month

### Paid Tier Benefits

- **Memory**: Up to 8GB RAM
- **CPU**: Dedicated resources
- **Uptime**: Always available
- **Bandwidth**: Unlimited

## 🔒 Security

### Production Considerations

1. **API Keys**: Add authentication to AI service
2. **Rate Limiting**: Implement request throttling
3. **Input Validation**: Sanitize all user inputs
4. **CORS**: Configure proper origins
5. **HTTPS**: Ensure all communications are encrypted

### Example Security Implementation

```python
# In main.py
from fastapi import HTTPException, Depends
from fastapi.security import HTTPBearer

security = HTTPBearer()

async def verify_token(token: str = Depends(security)):
    if token.credentials != os.getenv("API_KEY"):
        raise HTTPException(status_code=401, detail="Invalid API key")
    return token

@app.post("/chat")
async def chat_endpoint(request: ChatRequest, token = Depends(verify_token)):
    # ... existing code ...
```

## 🎯 Next Steps

1. ✅ Deploy AI Assistant Service
2. ✅ Update Backend Configuration
3. ✅ Test Integration
4. 🔄 Monitor Performance
5. 🔄 Optimize Responses
6. 🔄 Add More Knowledge Base Entries
7. 🔄 Implement Caching
8. 🔄 Add Authentication

## 📚 Resources

- [Render Python Documentation](https://render.com/docs/python)
- [FastAPI Documentation](https://fastapi.tiangolo.com)
- [Hugging Face Models](https://huggingface.co/models)
- [Transformers Library](https://huggingface.co/docs/transformers)

---

**Your AI Assistant is now ready to provide intelligent customer support! 🎉**