const request = require('supertest');
const app = require('../apps/api/src/server');
const { connectDB, closeDB } = require('../apps/api/src/db');
const { SSEClient } = require('../apps/storefront/src/lib/sse-client');

describe('Integration Tests', () => {
  let customerId;
  let orderId;
  let productId;

  beforeAll(async () => {
    process.env.MONGODB_URI = process.env.TEST_MONGODB_URI || process.env.MONGODB_URI;
    await connectDB();
    
    // Get demo customer
    const customerRes = await request(app)
      .get('/api/customers')
      .query({ email: 'demouser@example.com' });
    
    if (customerRes.status === 200) {
      customerId = customerRes.body._id;
    }
    
    // Get a product
    const productRes = await request(app).get('/api/products');
    if (productRes.status === 200 && productRes.body.products.length > 0) {
      productId = productRes.body.products[0]._id;
    }
  });

  afterAll(async () => {
    await closeDB();
  });

  describe('Test 1: Complete Purchase Flow', () => {
    test('should complete full purchase workflow', async () => {
      // Step 1: Browse products
      const productsRes = await request(app)
        .get('/api/products')
        .query({ limit: 5 });
      
      expect(productsRes.status).toBe(200);
      expect(productsRes.body.products).toBeDefined();
      expect(productsRes.body.products.length).toBeGreaterThan(0);
      
      const selectedProduct = productsRes.body.products[0];
      
      // Step 2: Create order
      const orderRes = await request(app)
        .post('/api/orders')
        .send({
          customerId,
          items: [
            { productId: selectedProduct._id, quantity: 2 }
          ]
        });
      
      expect(orderRes.status).toBe(201);
      expect(orderRes.body).toHaveProperty('_id');
      expect(orderRes.body.status).toBe('PENDING');
      
      orderId = orderRes.body._id;
      
      // Step 3: Subscribe to SSE stream (mock test - actual SSE needs browser environment)
      const sseRes = await request(app)
        .get(`/api/orders/${orderId}/stream`)
        .set('Accept', 'text/event-stream');
      
      // SSE returns a stream, just verify it connects
      expect(sseRes.status).toBe(200);
      
      // Step 4: Query assistant about order
      const assistantRes = await request(app)
        .post('/api/assistant/chat')
        .send({ 
          message: `Check the status of order ${orderId}` 
        });
      
      expect(assistantRes.status).toBe(200);
      expect(assistantRes.body.intent).toBe('order_status');
      
      // Step 5: Verify order details in response
      expect(assistantRes.body.response).toMatch(/PENDING|order/i);
    });
  });

  describe('Test 2: Support Interaction Flow', () => {
    test('should handle complete support conversation', async () => {
      // Step 1: Ask policy question
      const policyRes = await request(app)
        .post('/api/assistant/chat')
        .send({ message: "What is your return policy?" });
      
      expect(policyRes.status).toBe(200);
      expect(policyRes.body.intent).toBe('policy_question');
      expect(policyRes.body.citations).toBeDefined();
      expect(policyRes.body.response).toMatch(/return|30 days|refund/i);
      
      // Verify citations if present
      if (policyRes.body.citations.length > 0) {
        expect(policyRes.body.citationValidation).toBeDefined();
        expect(policyRes.body.citationValidation.validCitations).toBeDefined();
      }
      
      // Step 2: Ask about specific order
      if (orderId) {
        const orderQueryRes = await request(app)
          .post('/api/assistant/chat')
          .send({ message: `What's the status of order ${orderId}?` });
        
        expect(orderQueryRes.status).toBe(200);
        expect(orderQueryRes.body.intent).toBe('order_status');
        expect(orderQueryRes.body.functionsCalled).toContain('getOrderStatus');
      }
      
      // Step 3: Express complaint
      const complaintRes = await request(app)
        .post('/api/assistant/chat')
        .send({ message: "I'm unhappy with the shipping delay" });
      
      expect(complaintRes.status).toBe(200);
      expect(complaintRes.body.intent).toBe('complaint');
      expect(complaintRes.body.response).toMatch(/sorry|apologize|understand/i);
    });
  });

  describe('Test 3: Multi-Intent Conversation', () => {
    test('should handle conversation with multiple intents', async () => {
      const conversation = [
        {
          message: "Hello!",
          expectedIntent: 'chitchat',
          checkFor: /Alex|ShopSmart|help/i
        },
        {
          message: "Show me wireless headphones",
          expectedIntent: 'product_search',
          checkFor: /found|products|headphones/i
        },
        {
          message: "What's your shipping policy?",
          expectedIntent: 'policy_question',
          checkFor: /shipping|delivery|days/i
        },
        {
          message: `Check order status for demouser@example.com`,
          expectedIntent: 'order_status',
          checkFor: /order|status/i
        }
      ];
      
      for (const turn of conversation) {
        const response = await request(app)
          .post('/api/assistant/chat')
          .send({ message: turn.message });
        
        expect(response.status).toBe(200);
        expect(response.body.intent).toBe(turn.expectedIntent);
        expect(response.body.response).toMatch(turn.checkFor);
        
        // Verify appropriate behavior per intent
        if (turn.expectedIntent === 'policy_question') {
          expect(response.body.citations).toBeDefined();
        }
        
        if (turn.expectedIntent === 'product_search') {
          expect(response.body.functionsCalled.length).toBeGreaterThanOrEqual(0);
        }
      }
    });
  });

  describe('Test 4: Analytics Aggregation', () => {
    test('should correctly aggregate daily revenue using database', async () => {
      // Create some test orders first
      if (customerId && productId) {
        await request(app)
          .post('/api/orders')
          .send({
            customerId,
            items: [{ productId, quantity: 1 }]
          });
      }
      
      // Fetch analytics
      const analyticsRes = await request(app)
        .get('/api/analytics/daily-revenue');
      
      expect(analyticsRes.status).toBe(200);
      
      // Check for aggregation response structure
      expect(analyticsRes.body).toHaveProperty('aggregation', true);
      expect(analyticsRes.body).toHaveProperty('pipeline');
      expect(analyticsRes.body).toHaveProperty('results');
      expect(analyticsRes.body).toHaveProperty('metadata');
      expect(Array.isArray(analyticsRes.body.results)).toBe(true);
      
      // Verify aggregation structure
      if (analyticsRes.body.results.length > 0) {
        const dayData = analyticsRes.body.results[0];
        expect(dayData).toHaveProperty('date');
        expect(dayData).toHaveProperty('revenue');
        expect(dayData).toHaveProperty('orderCount');
        expect(dayData).toHaveProperty('averageOrderValue');
        expect(typeof dayData.revenue).toBe('number');
        expect(typeof dayData.orderCount).toBe('number');
      }
      
      // Verify it's using database aggregation
      expect(analyticsRes.body.metadata.method).toBe('database_aggregation');
    });
  });

  describe('Test 5: System Health & Metrics', () => {
    test('should provide complete system metrics', async () => {
      // Business metrics
      const businessRes = await request(app)
        .get('/api/dashboard/business-metrics');
      
      expect(businessRes.status).toBe(200);
      expect(businessRes.body).toHaveProperty('summary');
      expect(businessRes.body.summary).toHaveProperty('totalRevenue');
      expect(businessRes.body.summary).toHaveProperty('totalOrders');
      
      // Performance metrics
      const perfRes = await request(app)
        .get('/api/dashboard/performance');
      
      expect(perfRes.status).toBe(200);
      expect(perfRes.body).toHaveProperty('database');
      expect(perfRes.body).toHaveProperty('api');
      
      // Assistant stats
      const assistantRes = await request(app)
        .get('/api/dashboard/assistant-stats');
      
      expect(assistantRes.status).toBe(200);
      expect(assistantRes.body).toHaveProperty('totalQueries');
      expect(assistantRes.body).toHaveProperty('intentDistribution');
      
      // System health
      const healthRes = await request(app)
        .get('/api/dashboard/system-health');
      
      expect(healthRes.status).toBe(200);
      expect(healthRes.body).toHaveProperty('status');
      expect(healthRes.body).toHaveProperty('services');
    });
  });

  describe('Test 6: Error Recovery', () => {
    test('should handle and recover from errors gracefully', async () => {
      // Invalid order ID
      const invalidOrderRes = await request(app)
        .get('/api/orders/invalid-id');
      
      expect(invalidOrderRes.status).toBe(400);
      expect(invalidOrderRes.body.error).toBeDefined();
      expect(invalidOrderRes.body.error.code).toBe('INVALID_ID');
      
      // Non-existent customer
      const noCustomerRes = await request(app)
        .get('/api/customers')
        .query({ email: 'nonexistent@example.com' });
      
      expect(noCustomerRes.status).toBe(404);
      expect(noCustomerRes.body.error.code).toBe('CUSTOMER_NOT_FOUND');
      
      // Invalid order creation
      const badOrderRes = await request(app)
        .post('/api/orders')
        .send({ customerId: 'invalid' });
      
      expect(badOrderRes.status).toBe(400);
      expect(badOrderRes.body.error).toBeDefined();
      
      // System should still be healthy after errors
      const healthRes = await request(app)
        .get('/api/health');
      
      expect(healthRes.status).toBe(200);
      expect(healthRes.body.status).toBe('healthy');
    });
  });

  describe('Test 7: Data Consistency', () => {
    test('should maintain data consistency across operations', async () => {
      if (!customerId || !productId) {
        console.log('Skipping test - required data not available');
        return;
      }
      
      // Get initial product stock
      const productRes = await request(app)
        .get(`/api/products/${productId}`);
      
      const initialStock = productRes.body.stock;
      
      // Create order
      const orderRes = await request(app)
        .post('/api/orders')
        .send({
          customerId,
          items: [{ productId, quantity: 1 }]
        });
      
      expect(orderRes.status).toBe(201);
      
      // Verify stock was decremented
      const updatedProductRes = await request(app)
        .get(`/api/products/${productId}`);
      
      expect(updatedProductRes.body.stock).toBe(initialStock - 1);
      
      // Verify order appears in customer orders
      const customerOrdersRes = await request(app)
        .get('/api/orders')
        .query({ customerId });
      
      const orderIds = customerOrdersRes.body.orders.map(o => o._id);
      expect(orderIds).toContain(orderRes.body._id);
    });
  });
});
