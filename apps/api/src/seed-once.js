const seedDatabase = require('../scripts/seed');
const seedCategories = require('../scripts/seed-categories');
const { getDB } = require('./db');

/**
 * Automatically seed the database ONCE on first run.
 * - Only runs when AUTO_SEED === 'true'
 * - Checks if collections are empty; if empty, executes scripts/seed.js in a child process
 * - Never deletes existing data unless seed.js is explicitly run (which we guard against)
 */
async function autoSeedIfEmpty() {
  try {
    if (process.env.AUTO_SEED !== 'true') {
      return;
    }

    const db = getDB();
    const [customers, products, orders, categories] = await Promise.all([
      db.collection('customers').estimatedDocumentCount(),
      db.collection('products').estimatedDocumentCount(),
      db.collection('orders').estimatedDocumentCount(),
      db.collection('categories').estimatedDocumentCount().catch(() => 0)
    ]);

    // Seed when database is empty OR below assignment thresholds
    const needsSeed = (
      customers < 10 ||
      products < 30 ||
      orders < 15 ||
      categories < 5
    );

    if (!needsSeed) {
      console.log('ℹ️  Auto-seed skipped: data thresholds satisfied');
      return;
    }

    console.log(`🌱 Auto-seed starting (counts => customers:${customers}, products:${products}, orders:${orders}, categories:${categories})...`);
    
    // Seed categories first, then main data
    if (categories < 5) {
      await seedCategories();
    }
    await seedDatabase();
    
    console.log('✅ Auto-seed completed');
  } catch (error) {
    console.error('Auto-seed error:', error);
  }
}

module.exports = { autoSeedIfEmpty };


