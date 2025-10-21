const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { connectDB } = require('./db');
const { autoSeedIfEmpty } = require('./seed-once');
const { globalErrorHandler, notFoundHandler } = require('./middleware/error-handler');

// Load environment variables
dotenv.config();

// Import routes
const customersRouter = require('./routes/customers');
const productsRouter = require('./routes/products');
const categoriesRouter = require('./routes/categories');
const ordersRouter = require('./routes/orders');
const analyticsRouter = require('./routes/analytics');
const dashboardRouter = require('./routes/dashboard');
const orderSSE = require('./sse/order-status');
const { assistantRouter } = require('./assistant/engine');

const app = express();
const PORT = process.env.PORT || 3001;
const PUBLIC_DIR = path.join(__dirname, '../public');

// Function to build frontend if needed
async function buildFrontendIfNeeded() {
  const indexPath = path.join(PUBLIC_DIR, 'index.html');
  
  // Check if frontend is already built
  if (fs.existsSync(indexPath)) {
    console.log('✅ Frontend already built');
    return;
  }

  console.log('🔨 Building frontend...');
  
  try {
    // Build frontend
    await new Promise((resolve, reject) => {
      const storefrontDir = path.join(__dirname, '../../storefront');
      const buildProcess = spawn('npm', ['run', 'build'], {
        cwd: storefrontDir,
        stdio: 'inherit',
        shell: true
      });
      
      buildProcess.on('close', (code) => {
        if (code === 0) {
          console.log('✅ Frontend build completed');
          resolve();
        } else {
          reject(new Error(`Frontend build failed with exit code ${code}`));
        }
      });
      
      buildProcess.on('error', reject);
    });

    // Copy built files to public directory
    const distDir = path.join(__dirname, '../../storefront/dist');
    if (fs.existsSync(distDir)) {
      // Create public directory if it doesn't exist
      if (!fs.existsSync(PUBLIC_DIR)) {
        fs.mkdirSync(PUBLIC_DIR, { recursive: true });
      }
      
      // Copy files
      const files = fs.readdirSync(distDir);
      for (const file of files) {
        const srcPath = path.join(distDir, file);
        const destPath = path.join(PUBLIC_DIR, file);
        
        if (fs.statSync(srcPath).isDirectory()) {
          // Copy directory recursively
          fs.cpSync(srcPath, destPath, { recursive: true });
        } else {
          // Copy file
          fs.copyFileSync(srcPath, destPath);
        }
      }
      
      console.log('✅ Frontend files copied to public directory');
    }
  } catch (error) {
    console.error('❌ Frontend build failed:', error);
    // Don't exit, just serve API without frontend
  }
}

// Middleware
// Robust CORS: supports comma-separated origins with spaces and simple wildcard like https://*.vercel.app
const rawOrigins = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map(o => o.trim())
  .filter(Boolean);
const defaultOrigins = ['http://localhost:5173'];
const allowlist = rawOrigins.length ? rawOrigins : defaultOrigins;

function isOriginAllowed(origin, list) {
  if (!origin) return true; // allow non-browser tools
  return list.some(entry => {
    if (entry === '*') return true;
    // wildcard subdomains: https://*.vercel.app
    const wildcardHttps = entry.startsWith('https://*.');
    const wildcardHttp = entry.startsWith('http://*.');
    if (wildcardHttps || wildcardHttp) {
      const base = entry.replace('https://*.', '').replace('http://*.', '');
      return origin.endsWith('.' + base) || origin.endsWith('://' + base);
    }
    return origin === entry;
  });
}

const corsOptions = {
  origin: (origin, callback) => {
    const allowed = isOriginAllowed(origin, allowlist);
    if (allowed) return callback(null, true);
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization','Accept']
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve prebuilt frontend if present (single-domain deployment)
app.use(express.static(PUBLIC_DIR));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Performance tracking middleware
const performanceStats = {
  requests: {},
  latencies: []
};

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    performanceStats.latencies.push({ path, duration, timestamp: new Date() });
    performanceStats.requests[path] = (performanceStats.requests[path] || 0) + 1;
  });
  
  next();
});

// Routes
app.use('/api/customers', customersRouter);
app.use('/api/products', productsRouter);
app.use('/api/categories', categoriesRouter);
app.use('/api/orders', ordersRouter);
app.use('/api/analytics', analyticsRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/assistant', assistantRouter);

// SSE endpoint for order tracking
app.get('/api/orders/:id/stream', orderSSE.streamOrderStatus);

// Root info endpoint to avoid 404 on '/'
app.get('/', (req, res) => {
  res.json({
    service: 'ahmad store API',
    version: '1.0.0',
    status: 'ok',
    uptime: process.uptime(),
    docs: '/api/health'
  });
});

// Support HEAD / to avoid NOT_FOUND on health checks
app.head('/', (req, res) => res.status(204).end());

// Favicon placeholder to reduce log noise
app.get('/favicon.ico', (req, res) => res.status(204).end());

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV 
  });
});

// Performance stats endpoint
app.get('/api/performance', (req, res) => {
  const recentLatencies = performanceStats.latencies.slice(-100);
  const avgLatency = recentLatencies.reduce((sum, l) => sum + l.duration, 0) / (recentLatencies.length || 1);
  
  res.json({
    totalRequests: Object.values(performanceStats.requests).reduce((a, b) => a + b, 0),
    requestsByEndpoint: performanceStats.requests,
    averageLatency: Math.round(avgLatency),
    activeSSEConnections: orderSSE.getActiveConnections()
  });
});

// 404 handler
// SPA fallback: send index.html for non-API routes
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  
  const indexPath = path.join(PUBLIC_DIR, 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    // If no frontend built, return API info
    res.json({
      service: 'ahmad store API',
      message: 'Frontend not built yet. Please wait for frontend build to complete.',
      api: {
        health: '/api/health',
        products: '/api/products',
        customers: '/api/customers',
        orders: '/api/orders'
      }
    });
  }
});

app.use(notFoundHandler);

// Global error handling middleware
app.use(globalErrorHandler);

// Start server
async function startServer() {
  try {
    await connectDB();
    console.log('✅ Connected to MongoDB');
    
    // Build frontend if needed
    await buildFrontendIfNeeded();
    
    // Auto-seed once if database is empty (controlled by env)
    await autoSeedIfEmpty();
    
    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`📍 Environment: ${process.env.NODE_ENV || 'development'}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Export for testing
module.exports = app;

// Only start server if not in test environment
if (process.env.NODE_ENV !== 'test') {
  startServer();
}
