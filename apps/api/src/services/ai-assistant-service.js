const fetch = require('node-fetch');

class AIAssistantService {
  constructor() {
    this.baseURL = process.env.AI_ASSISTANT_URL || 'http://localhost:8000';
    this.timeout = 30000; // 30 seconds timeout
  }

  async makeRequest(endpoint, data) {
    try {
      const response = await fetch(`${this.baseURL}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
        timeout: this.timeout
      });

      if (!response.ok) {
        throw new Error(`AI Assistant API error: ${response.status} ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('AI Assistant request failed:', error);
      throw error;
    }
  }

  // RAG-based chat for customer support
  async chatWithRAG(question) {
    try {
      const result = await this.makeRequest('/chat', { question });
      return {
        success: true,
        data: result
      };
    } catch (error) {
      console.error('RAG chat failed:', error);
      return {
        success: false,
        error: error.message,
        fallback: "I apologize, but I'm having trouble accessing our knowledge base right now. Please contact our support team directly for assistance."
      };
    }
  }

  // Simple text generation
  async generateText(prompt, maxTokens = 200, temperature = 0.7) {
    try {
      const result = await this.makeRequest('/generate', {
        prompt,
        max_tokens: maxTokens,
        temperature
      });
      return {
        success: true,
        data: result
      };
    } catch (error) {
      console.error('Text generation failed:', error);
      return {
        success: false,
        error: error.message,
        fallback: "I'm sorry, I'm having trouble generating a response right now. Please try again later."
      };
    }
  }

  // Check if AI assistant is available
  async checkHealth() {
    try {
      const response = await fetch(`${this.baseURL}/health`, {
        method: 'GET',
        timeout: 5000
      });

      if (response.ok) {
        const data = await response.json();
        return {
          available: true,
          data: data
        };
      } else {
        return {
          available: false,
          error: `Health check failed: ${response.status}`
        };
      }
    } catch (error) {
      return {
        available: false,
        error: error.message
      };
    }
  }

  // Enhanced response generation with fallback
  async generateEnhancedResponse(userInput, intent, context = {}) {
    try {
      // Try RAG-based response first for policy questions
      if (intent === 'policy_question' || intent === 'complaint') {
        const ragResult = await this.chatWithRAG(userInput);
        if (ragResult.success) {
          return {
            text: ragResult.data.answer,
            sources: ragResult.data.sources || [],
            confidence: ragResult.data.confidence || 'medium',
            method: 'rag'
          };
        }
      }

      // Fallback to simple generation
      const prompt = this.buildPrompt(userInput, intent, context);
      const genResult = await this.generateText(prompt, 150, 0.7);
      
      if (genResult.success) {
        return {
          text: genResult.data.text,
          sources: [],
          confidence: 'medium',
          method: 'generation'
        };
      }

      // Final fallback
      return {
        text: this.getFallbackResponse(intent),
        sources: [],
        confidence: 'low',
        method: 'fallback'
      };

    } catch (error) {
      console.error('Enhanced response generation failed:', error);
      return {
        text: this.getFallbackResponse(intent),
        sources: [],
        confidence: 'low',
        method: 'fallback',
        error: error.message
      };
    }
  }

  buildPrompt(userInput, intent, context) {
    const basePrompt = `You are Alex, a helpful customer support specialist for ahmad store. `;
    
    switch (intent) {
      case 'policy_question':
        return `${basePrompt}Answer this policy question professionally: ${userInput}`;
      
      case 'order_status':
        return `${basePrompt}Help with this order inquiry: ${userInput}`;
      
      case 'product_search':
        return `${basePrompt}Help find products for this request: ${userInput}`;
      
      case 'complaint':
        return `${basePrompt}Address this customer concern with empathy: ${userInput}`;
      
      case 'chitchat':
        return `${basePrompt}Respond warmly to this greeting: ${userInput}`;
      
      default:
        return `${basePrompt}Help with this customer request: ${userInput}`;
    }
  }

  getFallbackResponse(intent) {
    const responses = {
      'policy_question': "I'd be happy to help with your policy question. Please contact our support team for detailed information.",
      'order_status': "I can help you check your order status. Please provide your order ID or contact our support team.",
      'product_search': "I can help you find products! What are you looking for today?",
      'complaint': "I sincerely apologize for any inconvenience. Our support team will help resolve this issue for you.",
      'chitchat': "Hello! I'm Alex, your customer support specialist. How can I help you today?",
      'default': "I'm here to help! How can I assist you with your shopping needs today?"
    };
    
    return responses[intent] || responses.default;
  }
}

module.exports = new AIAssistantService();