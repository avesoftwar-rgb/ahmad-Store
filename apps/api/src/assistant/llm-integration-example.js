/**
 * Week 5 LLM Integration Example
 * This shows how to connect your backend assistant with the deployed LLM
 */

const axios = require('axios');
const yaml = require('js-yaml');
const fs = require('fs');
const path = require('path');

// Load configuration
const promptsConfig = yaml.load(
  fs.readFileSync(path.join(__dirname, '../../../docs/prompts.yaml'), 'utf8')
);
const groundTruth = require('../../../docs/ground-truth.json');

class LLMIntegration {
  constructor() {
    this.llmUrl = process.env.LLM_API_URL || 'http://localhost:8000';
    this.timeout = 30000;
  }

  /**
   * Call the /generate endpoint for simple text completion
   */
  async generateText(prompt, maxTokens = 200, temperature = 0.7) {
    try {
      const response = await axios.post(
        `${this.llmUrl}/generate`,
        {
          prompt,
          max_tokens: maxTokens,
          temperature
        },
        { 
          timeout: this.timeout,
          headers: { 'Content-Type': 'application/json' }
        }
      );
      return response.data.text;
    } catch (error) {
      console.error('LLM Generation Error:', error.message);
      // Fallback response if LLM is unavailable
      return this.getFallbackResponse(prompt);
    }
  }

  /**
   * Build a grounded prompt with context from your knowledge base
   */
  buildGroundedPrompt(userQuery, relevantDocs, intent) {
    // Get personality and tone from config
    const personality = promptsConfig.assistant.personality;
    const intentConfig = promptsConfig.intents[intent];
    
    // Build context from relevant documents
    const context = relevantDocs.map(doc => 
      `[${doc.id}] ${doc.question}: ${doc.answer}`
    ).join('\n\n');

    // Construct the prompt based on intent
    let prompt = `You are ${personality.name}, a ${personality.role} for Shoplite.\n`;
    prompt += `Your personality: ${personality.traits.join(', ')}.\n`;
    prompt += `Tone for this interaction: ${intentConfig.tone}.\n\n`;
    
    if (context) {
      prompt += `Relevant information:\n${context}\n\n`;
    }
    
    prompt += `Customer: ${userQuery}\n`;
    prompt += `${personality.name}: `;
    
    return prompt;
  }

  /**
   * Generate response for policy questions with grounding
   */
  async handlePolicyQuestion(userQuery) {
    // Find relevant policies using keyword matching
    const relevantPolicies = this.findRelevantPolicies(userQuery);
    
    if (relevantPolicies.length === 0) {
      return {
        text: "I couldn't find specific information about that policy. Please contact our support team for detailed assistance.",
        citations: [],
        grounded: false
      };
    }

    // Build grounded prompt
    const prompt = this.buildGroundedPrompt(
      userQuery,
      relevantPolicies,
      'policy_question'
    );

    // Generate response
    const generatedText = await this.generateText(prompt, 150, 0.3);

    // Extract and validate citations
    const citations = this.extractCitations(generatedText);
    const validCitations = this.validateCitations(citations);

    return {
      text: generatedText,
      citations: validCitations,
      grounded: true,
      sourceDocs: relevantPolicies.map(p => p.id)
    };
  }

  /**
   * Generate response for order status with function calling
   */
  async handleOrderStatus(userQuery, orderData) {
    const prompt = `You are a helpful Shoplite support agent.
      
Customer asks: ${userQuery}

Order Information:
- Order ID: ${orderData.id}
- Status: ${orderData.status}
- Carrier: ${orderData.carrier || 'Standard'}
- Estimated Delivery: ${orderData.estimatedDelivery || 'Within 5-7 business days'}
- Items: ${orderData.items.length} items totaling $${orderData.total}

Provide a friendly, informative response about their order status:`;

    const response = await this.generateText(prompt, 100, 0.5);
    
    return {
      text: response,
      functionsCalled: ['getOrderStatus'],
      orderData: orderData
    };
  }

  /**
   * Generate response for product search
   */
  async handleProductSearch(userQuery, searchResults) {
    if (!searchResults || searchResults.length === 0) {
      return {
        text: "I couldn't find any products matching your search. Try different keywords or browse our categories.",
        functionsCalled: ['searchProducts'],
        products: []
      };
    }

    const prompt = `You are a helpful Shoplite shopping assistant.
      
Customer searches for: ${userQuery}

Found ${searchResults.length} products:
${searchResults.slice(0, 3).map(p => 
  `- ${p.name}: $${p.price} (${p.category})`
).join('\n')}

Provide a helpful response highlighting these products:`;

    const response = await this.generateText(prompt, 100, 0.6);
    
    return {
      text: response,
      functionsCalled: ['searchProducts'],
      products: searchResults.slice(0, 3)
    };
  }

  /**
   * Handle complaint with empathetic response
   */
  async handleComplaint(userQuery) {
    const prompt = `You are an empathetic Shoplite support specialist.
      
A customer has expressed the following complaint or concern:
"${userQuery}"

Provide an empathetic, solution-focused response that:
1. Acknowledges their frustration
2. Apologizes for the inconvenience
3. Offers to help resolve the issue
4. Suggests next steps

Response:`;

    const response = await this.generateText(prompt, 150, 0.7);
    
    return {
      text: response,
      intent: 'complaint',
      escalate: this.shouldEscalate(userQuery)
    };
  }

  /**
   * Handle chitchat briefly
   */
  async handleChitchat(userQuery) {
    const prompt = `You are a professional Shoplite assistant. 
Respond briefly and professionally to this greeting or casual comment, 
then redirect to how you can help with shopping:
"${userQuery}"

Response (max 2 sentences):`;

    const response = await this.generateText(prompt, 50, 0.8);
    
    return {
      text: response,
      intent: 'chitchat',
      redirect: true
    };
  }

  /**
   * Find relevant policies using keyword matching
   */
  findRelevantPolicies(query) {
    const queryLower = query.toLowerCase();
    const keywords = queryLower.split(/\s+/);
    
    // Score each policy based on keyword matches
    const scoredPolicies = groundTruth.map(policy => {
      const content = (policy.question + ' ' + policy.answer).toLowerCase();
      let score = 0;
      
      // Check for exact phrase matches
      if (content.includes(queryLower)) {
        score += 10;
      }
      
      // Check for individual keyword matches
      keywords.forEach(keyword => {
        if (keyword.length > 3 && content.includes(keyword)) {
          score += 1;
        }
      });
      
      // Check category match
      const categoryKeywords = {
        'returns': ['return', 'refund', 'exchange'],
        'shipping': ['ship', 'delivery', 'carrier'],
        'payment': ['pay', 'card', 'checkout'],
        'account': ['register', 'login', 'password']
      };
      
      for (const [category, catKeywords] of Object.entries(categoryKeywords)) {
        if (policy.category === category) {
          catKeywords.forEach(kw => {
            if (queryLower.includes(kw)) score += 2;
          });
        }
      }
      
      return { ...policy, score };
    });
    
    // Return top 3 policies with score > 0
    return scoredPolicies
      .filter(p => p.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);
  }

  /**
   * Extract policy citations from generated text
   */
  extractCitations(text) {
    const citationPattern = /\[([A-Za-z0-9.]+)\]/g;
    const citations = [];
    let match;
    
    while ((match = citationPattern.exec(text)) !== null) {
      citations.push(match[1]);
    }
    
    return [...new Set(citations)]; // Remove duplicates
  }

  /**
   * Validate citations against ground truth
   */
  validateCitations(citations) {
    const validIds = groundTruth.map(p => p.id);
    return {
      valid: citations.filter(c => validIds.includes(c)),
      invalid: citations.filter(c => !validIds.includes(c))
    };
  }

  /**
   * Determine if complaint should be escalated
   */
  shouldEscalate(query) {
    const escalationKeywords = [
      'legal', 'lawsuit', 'fraud', 'stolen',
      'urgent', 'emergency', 'immediately'
    ];
    const queryLower = query.toLowerCase();
    return escalationKeywords.some(kw => queryLower.includes(kw));
  }

  /**
   * Fallback responses when LLM is unavailable
   */
  getFallbackResponse(prompt) {
    // Simple fallback responses based on keywords
    if (prompt.includes('order') && prompt.includes('status')) {
      return "Your order is being processed. You can track its status in your account dashboard.";
    }
    if (prompt.includes('return')) {
      return "You can return items within 14 days of receipt. Please visit your account to initiate a return.";
    }
    if (prompt.includes('shipping')) {
      return "We offer standard (5-7 days) and express (2-3 days) shipping options.";
    }
    return "I'm here to help with your Shoplite shopping needs. How can I assist you today?";
  }

  /**
   * Check if LLM service is available
   */
  async checkHealth() {
    try {
      const response = await axios.get(
        `${this.llmUrl}/health`,
        { timeout: 5000 }
      );
      return response.data;
    } catch (error) {
      return { 
        status: 'offline', 
        error: error.message,
        fallbackMode: true
      };
    }
  }
}

// Example usage
async function testLLMIntegration() {
  const llm = new LLMIntegration();
  
  // Check health
  console.log('Checking LLM health...');
  const health = await llm.checkHealth();
  console.log('Health:', health);
  
  // Test policy question
  console.log('\nTesting policy question...');
  const policyResponse = await llm.handlePolicyQuestion(
    "What is your return policy?"
  );
  console.log('Policy Response:', policyResponse);
  
  // Test order status (mock data)
  console.log('\nTesting order status...');
  const mockOrder = {
    id: 'ORD-12345',
    status: 'SHIPPED',
    carrier: 'FedEx',
    estimatedDelivery: '2025-10-25',
    items: [
      { name: 'Laptop', price: 999.99 },
      { name: 'Mouse', price: 29.99 }
    ],
    total: 1029.98
  };
  const orderResponse = await llm.handleOrderStatus(
    "Where is my order?",
    mockOrder
  );
  console.log('Order Response:', orderResponse);
  
  // Test chitchat
  console.log('\nTesting chitchat...');
  const chatResponse = await llm.handleChitchat("Hello! How are you?");
  console.log('Chat Response:', chatResponse);
}

// Run tests if this file is executed directly
if (require.main === module) {
  testLLMIntegration().catch(console.error);
}

module.exports = LLMIntegration;
