const request = require('supertest');
const app = require('../apps/api/src/server');
const { connectDB, closeDB } = require('../apps/api/src/db');
const { INTENTS, classifyIntent } = require('../apps/api/src/assistant/intent-classifier');
const functionRegistry = require('../apps/api/src/assistant/function-registry');

describe('Assistant Tests', () => {
  beforeAll(async () => {
    process.env.MONGODB_URI = process.env.TEST_MONGODB_URI || process.env.MONGODB_URI;
    await connectDB();
  });

  afterAll(async () => {
    await closeDB();
  });

  describe('Intent Classification', () => {
    test('should classify policy questions correctly', () => {
      const testCases = [
        "What is your return policy?",
        "How long does shipping take?",
        "Do you offer warranties?",
        "Can I cancel my order?",
        "What payment methods do you accept?"
      ];

      testCases.forEach(query => {
        const result = classifyIntent(query);
        expect(result.intent).toBe(INTENTS.POLICY_QUESTION);
        expect(result.confidence).toBeGreaterThan(0.5);
      });
    });

    test('should classify order status queries correctly', () => {
      const testCases = [
        "Where is my order?",
        "Track order 507f1f77bcf86cd799439011",
        "Check my recent orders",
        "When will my package arrive?",
        "Has my order shipped?"
      ];

      testCases.forEach(query => {
        const result = classifyIntent(query);
        expect(result.intent).toBe(INTENTS.ORDER_STATUS);
        expect(result.confidence).toBeGreaterThan(0.5);
      });
    });

    test('should classify product searches correctly', () => {
      const testCases = [
        "Show me wireless headphones",
        "Looking for a laptop",
        "What products do you have under $50?",
        "Do you have iPhone cases?",
        "Search for gaming keyboards"
      ];

      testCases.forEach(query => {
        const result = classifyIntent(query);
        expect(result.intent).toBe(INTENTS.PRODUCT_SEARCH);
        expect(result.confidence).toBeGreaterThan(0.5);
      });
    });

    test('should classify complaints correctly', () => {
      const testCases = [
        "This product is broken",
        "I'm very disappointed with my order",
        "I want to file a complaint",
        "The item I received is damaged",
        "This is terrible service"
      ];

      testCases.forEach(query => {
        const result = classifyIntent(query);
        expect(result.intent).toBe(INTENTS.COMPLAINT);
        expect(result.confidence).toBeGreaterThan(0.5);
      });
    });

    test('should classify chitchat correctly', () => {
      const testCases = [
        "Hello",
        "Hi",
        "How are you?",
        "What's your name?",
        "Thank you"
      ];

      testCases.forEach(query => {
        const result = classifyIntent(query);
        expect(result.intent).toBe(INTENTS.CHITCHAT);
        expect(result.confidence).toBeGreaterThan(0.3);
      });
    });

    test('should classify off-topic correctly', () => {
      const testCases = [
        "What's the weather today?",
        "Tell me a joke",
        "Who won the game last night?",
        "Help me with my homework",
        "What's the capital of France?"
      ];

      testCases.forEach(query => {
        const result = classifyIntent(query);
        expect(result.intent).toBe(INTENTS.OFF_TOPIC);
        expect(result.confidence).toBeGreaterThan(0.3);
      });
    });

    test('should classify violations correctly', () => {
      const testCases = [
        "You're stupid",
        "This company sucks",
        "Go to hell",
        "I hate this",
        "You idiot"
      ];

      testCases.forEach(query => {
        const result = classifyIntent(query);
        expect(result.intent).toBe(INTENTS.VIOLATION);
        expect(result.confidence).toBeGreaterThan(0.3);
      });
    });
  });

  describe('Identity Tests', () => {
    test('should not reveal AI identity when asked about name', async () => {
      const response = await request(app)
        .post('/api/assistant/chat')
        .send({ message: "What's your name?" });

      expect(response.status).toBe(200);
      expect(response.body.response).not.toMatch(/ChatGPT|GPT|Claude|Llama|AI|artificial intelligence/i);
      expect(response.body.response).toMatch(/Alex/i);
    });

    test('should not reveal being a robot when asked', async () => {
      const response = await request(app)
        .post('/api/assistant/chat')
        .send({ message: "Are you a robot?" });

      expect(response.status).toBe(200);
      expect(response.body.response).not.toMatch(/yes.*robot|I am.*AI|artificial intelligence/i);
      expect(response.body.response).not.toMatch(/ChatGPT|Claude|Llama/i);
    });

    test('should not mention AI creators when asked', async () => {
      const response = await request(app)
        .post('/api/assistant/chat')
        .send({ message: "Who created you?" });

      expect(response.status).toBe(200);
      expect(response.body.response).not.toMatch(/OpenAI|Anthropic|Meta|Google/i);
      expect(response.body.response).toMatch(/ShopSmart|team|company/i);
    });
  });

  describe('Function Calling Tests', () => {
    test('function registry should have required functions', () => {
      const schemas = functionRegistry.getAllSchemas();
      const functionNames = schemas.map(s => s.name);
      
      expect(functionNames).toContain('getOrderStatus');
      expect(functionNames).toContain('searchProducts');
      expect(functionNames).toContain('getCustomerOrders');
    });

    test('searchProducts function should work correctly', async () => {
      const result = await functionRegistry.execute('searchProducts', {
        query: 'headphones',
        limit: 3
      });

      expect(result.success).toBe(true);
      expect(result.result).toHaveProperty('products');
      expect(result.result).toHaveProperty('count');
    });

    test('getCustomerOrders should handle invalid email', async () => {
      const result = await functionRegistry.execute('getCustomerOrders', {
        email: 'nonexistent@example.com'
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    test('should call function for order status query', async () => {
      const response = await request(app)
        .post('/api/assistant/chat')
        .send({ message: "Check order status for 507f1f77bcf86cd799439011" });

      expect(response.status).toBe(200);
      expect(response.body.intent).toBe('order_status');
      // Function may or may not be called depending on order existence
      expect(response.body.functionsCalled).toBeDefined();
    });

    test('should not call function for policy questions', async () => {
      const response = await request(app)
        .post('/api/assistant/chat')
        .send({ message: "What is your return policy?" });

      expect(response.status).toBe(200);
      expect(response.body.intent).toBe('policy_question');
      expect(response.body.functionsCalled).toEqual([]);
    });
  });

  describe('Citation Tests', () => {
    test('should include citations for policy questions', async () => {
      const response = await request(app)
        .post('/api/assistant/chat')
        .send({ message: "What is your return policy?" });

      expect(response.status).toBe(200);
      expect(response.body.citations).toBeDefined();
      expect(Array.isArray(response.body.citations)).toBe(true);
      
      // If citations exist, they should be valid
      if (response.body.citations.length > 0) {
        expect(response.body.citationValidation).toBeDefined();
        expect(response.body.citationValidation.isValid).toBeDefined();
      }
    });

    test('citations should match PolicyID format', async () => {
      const response = await request(app)
        .post('/api/assistant/chat')
        .send({ message: "Tell me about shipping options" });

      if (response.body.citations && response.body.citations.length > 0) {
        response.body.citations.forEach(citation => {
          expect(citation).toMatch(/^[A-Z][a-z]+\d+\.\d+$/);
        });
      }
    });
  });

  describe('Assistant Info Endpoint', () => {
    test('GET /api/assistant/info should return assistant information', async () => {
      const response = await request(app).get('/api/assistant/info');
      
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('identity');
      expect(response.body.identity).toHaveProperty('name');
      expect(response.body.identity).toHaveProperty('role');
      expect(response.body).toHaveProperty('supportedIntents');
      expect(response.body).toHaveProperty('availableFunctions');
      expect(response.body).toHaveProperty('knowledgeBaseSize');
    });
  });

  describe('Response Behavior Tests', () => {
    test('should provide empathetic response for complaints', async () => {
      const response = await request(app)
        .post('/api/assistant/chat')
        .send({ message: "My order arrived damaged and I'm very upset" });

      expect(response.status).toBe(200);
      expect(response.body.intent).toBe('complaint');
      expect(response.body.response).toMatch(/sorry|apologize|understand/i);
    });

    test('should politely decline off-topic requests', async () => {
      const response = await request(app)
        .post('/api/assistant/chat')
        .send({ message: "Can you help me with my math homework?" });

      expect(response.status).toBe(200);
      expect(response.body.intent).toBe('off_topic');
      expect(response.body.response).toMatch(/shopping|ShopSmart|store/i);
    });

    test('should set boundaries for violations', async () => {
      const response = await request(app)
        .post('/api/assistant/chat')
        .send({ message: "You're an idiot" });

      expect(response.status).toBe(200);
      expect(response.body.intent).toBe('violation');
      expect(response.body.response).toMatch(/professional|help.*shopping/i);
    });
  });

  describe('Error Handling', () => {
    test('should handle missing message parameter', async () => {
      const response = await request(app)
        .post('/api/assistant/chat')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('MISSING_MESSAGE');
    });

    test('should handle very long messages gracefully', async () => {
      const longMessage = 'test '.repeat(500);
      const response = await request(app)
        .post('/api/assistant/chat')
        .send({ message: longMessage });

      expect(response.status).toBe(200);
      expect(response.body.responseTime).toBeLessThan(5000);
    });
  });
});
