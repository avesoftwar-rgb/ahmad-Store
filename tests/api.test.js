const request = require('supertest');
const app = require('../apps/api/src/server');
const { connectDB, closeDB } = require('../apps/api/src/db');

describe('API Endpoints', () => {
  beforeAll(async () => {
    // Connect to test database
    process.env.MONGODB_URI = process.env.TEST_MONGODB_URI || process.env.MONGODB_URI;
    await connectDB();
  });

  afterAll(async () => {
    await closeDB();
  });

  describe('GET /api/health', () => {
    test('should return health status', async () => {
      const response = await request(app).get('/api/health');
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status', 'healthy');
      expect(response.body).toHaveProperty('timestamp');
    });
  });

  describe('Customer Routes', () => {
    test('GET /api/customers?email=demouser@example.com should return customer', async () => {
      const response = await request(app)
        .get('/api/customers')
        .query({ email: 'demouser@example.com' });
      
      if (response.status === 200) {
        expect(response.body).toHaveProperty('email', 'demouser@example.com');
        expect(response.body).toHaveProperty('name', 'Demo User');
      } else {
        expect(response.status).toBe(404);
      }
    });

    test('GET /api/customers without email should return 400', async () => {
      const response = await request(app).get('/api/customers');
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('MISSING_EMAIL');
    });

    test('GET /api/customers with invalid email should return 404', async () => {
      const response = await request(app)
        .get('/api/customers')
        .query({ email: 'nonexistent@example.com' });
      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe('CUSTOMER_NOT_FOUND');
    });
  });

  describe('Product Routes', () => {
    test('GET /api/products should return products list', async () => {
      const response = await request(app).get('/api/products');
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('products');
      expect(response.body).toHaveProperty('pagination');
      expect(Array.isArray(response.body.products)).toBe(true);
    });

    test('GET /api/products with search parameter', async () => {
      const response = await request(app)
        .get('/api/products')
        .query({ search: 'wireless', limit: 5 });
      expect(response.status).toBe(200);
      expect(response.body.products).toBeDefined();
    });

    test('GET /api/products/:id with invalid ID should return 400', async () => {
      const response = await request(app).get('/api/products/invalid-id');
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('INVALID_ID');
    });

    test('POST /api/products should create product', async () => {
      const newProduct = {
        name: 'Test Product',
        description: 'Test description',
        price: 99.99,
        category: 'test',
        tags: ['test'],
        imageUrl: 'https://example.com/image.jpg',
        stock: 10
      };

      const response = await request(app)
        .post('/api/products')
        .send(newProduct);
      
      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('_id');
      expect(response.body.name).toBe(newProduct.name);
    });

    test('POST /api/products without required fields should return 400', async () => {
      const response = await request(app)
        .post('/api/products')
        .send({ name: 'Incomplete Product' });
      
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('Order Routes', () => {
    let customerId;
    let productId;
    let orderId;

    beforeAll(async () => {
      // Get a customer and product for testing
      const customerRes = await request(app)
        .get('/api/customers')
        .query({ email: 'demouser@example.com' });
      
      if (customerRes.status === 200) {
        customerId = customerRes.body._id;
      }

      const productRes = await request(app).get('/api/products');
      if (productRes.status === 200 && productRes.body.products.length > 0) {
        productId = productRes.body.products[0]._id;
      }
    });

    test('POST /api/orders should create order with valid data', async () => {
      if (!customerId || !productId) {
        console.log('Skipping test - no customer or product found');
        return;
      }

      const newOrder = {
        customerId,
        items: [
          { productId, quantity: 2 }
        ]
      };

      const response = await request(app)
        .post('/api/orders')
        .send(newOrder);
      
      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('_id');
      expect(response.body.customerId).toBe(customerId);
      expect(response.body.status).toBe('PENDING');
      
      orderId = response.body._id;
    });

    test('POST /api/orders without items should return 400', async () => {
      const response = await request(app)
        .post('/api/orders')
        .send({ customerId: '507f1f77bcf86cd799439011' });
      
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    test('GET /api/orders/:id should return order details', async () => {
      if (!orderId) {
        console.log('Skipping test - no order created');
        return;
      }

      const response = await request(app).get(`/api/orders/${orderId}`);
      expect(response.status).toBe(200);
      expect(response.body._id).toBe(orderId);
    });

    test('GET /api/orders with customerId should return customer orders', async () => {
      if (!customerId) {
        console.log('Skipping test - no customer found');
        return;
      }

      const response = await request(app)
        .get('/api/orders')
        .query({ customerId });
      
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('orders');
      expect(response.body).toHaveProperty('pagination');
    });
  });

  describe('Analytics Routes', () => {
    test('GET /api/analytics/daily-revenue should return revenue data', async () => {
      const response = await request(app).get('/api/analytics/daily-revenue');
      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      
      if (response.body.length > 0) {
        expect(response.body[0]).toHaveProperty('date');
        expect(response.body[0]).toHaveProperty('revenue');
        expect(response.body[0]).toHaveProperty('orderCount');
      }
    });

    test('GET /api/analytics/daily-revenue with date range', async () => {
      const from = new Date();
      from.setDate(from.getDate() - 7);
      const to = new Date();

      const response = await request(app)
        .get('/api/analytics/daily-revenue')
        .query({ 
          from: from.toISOString().split('T')[0],
          to: to.toISOString().split('T')[0]
        });
      
      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
    });

    test('GET /api/analytics/dashboard-metrics should return metrics', async () => {
      const response = await request(app).get('/api/analytics/dashboard-metrics');
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('revenue');
      expect(response.body).toHaveProperty('orders');
      expect(response.body).toHaveProperty('products');
      expect(response.body).toHaveProperty('customers');
    });
  });

  describe('Dashboard Routes', () => {
    test('GET /api/dashboard/business-metrics should return business data', async () => {
      const response = await request(app).get('/api/dashboard/business-metrics');
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('summary');
      expect(response.body).toHaveProperty('revenueChart');
      expect(response.body).toHaveProperty('categoryBreakdown');
    });

    test('GET /api/dashboard/performance should return performance metrics', async () => {
      const response = await request(app).get('/api/dashboard/performance');
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('database');
      expect(response.body).toHaveProperty('api');
      expect(response.body).toHaveProperty('sse');
    });

    test('GET /api/dashboard/assistant-stats should return assistant statistics', async () => {
      const response = await request(app).get('/api/dashboard/assistant-stats');
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('totalQueries');
      expect(response.body).toHaveProperty('intentDistribution');
      expect(response.body).toHaveProperty('functionCalls');
    });

    test('GET /api/dashboard/system-health should return health status', async () => {
      const response = await request(app).get('/api/dashboard/system-health');
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('services');
      expect(response.body).toHaveProperty('lastActivity');
    });
  });

  describe('Error Handling', () => {
    test('GET /api/nonexistent should return 404', async () => {
      const response = await request(app).get('/api/nonexistent');
      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe('NOT_FOUND');
    });

    test('Invalid JSON in POST should be handled', async () => {
      const response = await request(app)
        .post('/api/products')
        .set('Content-Type', 'application/json')
        .send('invalid json{');
      
      expect(response.status).toBeGreaterThanOrEqual(400);
    });
  });
});
