#!/usr/bin/env node
/**
 * Deployment Fix Script
 * Diagnoses and fixes common deployment issues
 */

const { MongoClient } = require('mongodb');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env') });

const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

async function checkEnvironment() {
  log('\n🔍 Checking Environment Variables...', 'blue');
  
  const required = ['MONGODB_URI'];
  const missing = [];
  
  required.forEach(key => {
    if (!process.env[key]) {
      missing.push(key);
      log(`  ❌ ${key} is missing`, 'red');
    } else {
      const value = key.includes('PASSWORD') || key.includes('URI') 
        ? '***hidden***' 
        : process.env[key];
      log(`  ✅ ${key} = ${value}`, 'green');
    }
  });
  
  if (missing.length > 0) {
    log('\n⚠️  Missing environment variables detected!', 'yellow');
    log('Add these to your .env file or Render dashboard:', 'yellow');
    missing.forEach(key => {
      log(`  ${key}=your_value_here`, 'yellow');
    });
    return false;
  }
  
  return true;
}

async function testMongoConnection() {
  log('\n🔍 Testing MongoDB Connection...', 'blue');
  
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    log('  ❌ MONGODB_URI not set', 'red');
    return false;
  }
  
  let client;
  try {
    client = new MongoClient(uri, {
      serverSelectionTimeoutMS: 5000
    });
    
    await client.connect();
    await client.db().admin().ping();
    
    log('  ✅ Successfully connected to MongoDB', 'green');
    
    // Get database stats
    const db = client.db(process.env.MONGODB_DB_NAME || 'shopmart');
    const collections = await db.listCollections().toArray();
    log(`  📊 Database: ${db.databaseName}`, 'blue');
    log(`  📁 Collections: ${collections.map(c => c.name).join(', ') || 'none'}`, 'blue');
    
    // Check document counts
    const counts = {};
    for (const col of ['customers', 'products', 'orders', 'categories']) {
      try {
        counts[col] = await db.collection(col).estimatedDocumentCount();
      } catch {
        counts[col] = 0;
      }
    }
    
    log('\n  📈 Document Counts:', 'blue');
    Object.entries(counts).forEach(([col, count]) => {
      const icon = count > 0 ? '✅' : '⚠️';
      const color = count > 0 ? 'green' : 'yellow';
      log(`    ${icon} ${col}: ${count}`, color);
    });
    
    return true;
  } catch (error) {
    log(`  ❌ MongoDB connection failed: ${error.message}`, 'red');
    
    if (error.message.includes('authentication failed')) {
      log('\n  💡 Fix: Check your username and password in MONGODB_URI', 'yellow');
    } else if (error.message.includes('ENOTFOUND')) {
      log('\n  💡 Fix: Check your cluster URL in MONGODB_URI', 'yellow');
    } else if (error.message.includes('whitelist')) {
      log('\n  💡 Fix: Add 0.0.0.0/0 to IP whitelist in MongoDB Atlas', 'yellow');
    }
    
    return false;
  } finally {
    if (client) {
      await client.close();
    }
  }
}

async function checkDataIntegrity() {
  log('\n🔍 Checking Data Integrity...', 'blue');
  
  let client;
  try {
    const uri = process.env.MONGODB_URI;
    client = new MongoClient(uri);
    await client.connect();
    
    const db = client.db(process.env.MONGODB_DB_NAME || 'shopmart');
    const issues = [];
    
    // Check for categories
    const categoriesCount = await db.collection('categories').estimatedDocumentCount();
    if (categoriesCount === 0) {
      issues.push('No categories found');
    }
    
    // Check for products with invalid categories
    const products = await db.collection('products').find({}).limit(10).toArray();
    const categories = await db.collection('categories').find({}).toArray();
    const categorySlug = categories.map(c => c.slug);
    
    const invalidProducts = products.filter(p => 
      p.category && !categorySlug.includes(p.category) && 
      !['electronics', 'home', 'apparel', 'accessories', 'tools', 'sports'].includes(p.category)
    );
    
    if (invalidProducts.length > 0) {
      issues.push(`${invalidProducts.length} products have invalid categories`);
    }
    
    // Check for demo user
    const demoUser = await db.collection('customers').findOne({ 
      email: 'demouser@example.com' 
    });
    if (!demoUser) {
      issues.push('Demo user not found');
    }
    
    if (issues.length > 0) {
      log('  ⚠️  Data issues found:', 'yellow');
      issues.forEach(issue => log(`    - ${issue}`, 'yellow'));
      return false;
    } else {
      log('  ✅ Data integrity check passed', 'green');
      return true;
    }
  } catch (error) {
    log(`  ❌ Data check failed: ${error.message}`, 'red');
    return false;
  } finally {
    if (client) {
      await client.close();
    }
  }
}

async function offerFix() {
  log('\n🔧 Would you like to fix these issues automatically?', 'magenta');
  log('  This will:', 'blue');
  log('    1. Seed categories if missing', 'blue');
  log('    2. Seed sample data if below thresholds', 'blue');
  log('    3. Update product categories to match', 'blue');
  
  log('\n  ⚠️  WARNING: This will modify your database!', 'yellow');
  log('  Type "yes" to continue, or anything else to skip:', 'yellow');
  
  // In non-interactive environments, skip
  if (process.env.CI || process.env.RENDER) {
    log('  Auto-fix enabled for deployment environment', 'green');
    return true;
  }
  
  const readline = require('readline').createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  return new Promise(resolve => {
    readline.question('  > ', answer => {
      readline.close();
      resolve(answer.toLowerCase() === 'yes');
    });
  });
}

async function applyFixes() {
  log('\n🔧 Applying Fixes...', 'blue');
  
  try {
    // Run seed scripts
    const seedCategories = require('./seed-categories');
    const seedDatabase = require('./seed');
    
    log('  🌱 Seeding categories...', 'blue');
    await seedCategories();
    
    log('  🌱 Seeding main data...', 'blue');
    await seedDatabase();
    
    log('  ✅ Fixes applied successfully!', 'green');
    return true;
  } catch (error) {
    log(`  ❌ Fix failed: ${error.message}`, 'red');
    return false;
  }
}

async function main() {
  log('\n🚀 Deployment Diagnostics Tool', 'magenta');
  log('================================\n', 'magenta');
  
  const checks = {
    environment: await checkEnvironment(),
    connection: false,
    integrity: false
  };
  
  if (checks.environment) {
    checks.connection = await testMongoConnection();
  }
  
  if (checks.connection) {
    checks.integrity = await checkDataIntegrity();
  }
  
  log('\n📊 Summary:', 'magenta');
  log('  Environment: ' + (checks.environment ? '✅' : '❌'), checks.environment ? 'green' : 'red');
  log('  Connection:  ' + (checks.connection ? '✅' : '❌'), checks.connection ? 'green' : 'red');
  log('  Data:        ' + (checks.integrity ? '✅' : '❌'), checks.integrity ? 'green' : 'red');
  
  if (!checks.integrity && checks.connection) {
    const shouldFix = await offerFix();
    if (shouldFix) {
      await applyFixes();
    }
  }
  
  if (Object.values(checks).every(c => c)) {
    log('\n✨ Everything looks good! Your deployment should work.', 'green');
  } else {
    log('\n⚠️  Some issues detected. Please fix them and try again.', 'yellow');
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main().catch(error => {
    log(`\n❌ Fatal error: ${error.message}`, 'red');
    process.exit(1);
  });
}

module.exports = { checkEnvironment, testMongoConnection, checkDataIntegrity };
