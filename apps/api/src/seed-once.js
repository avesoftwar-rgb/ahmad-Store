const seedDatabase = require('../scripts/seed');
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
    const [customers, products, orders] = await Promise.all([
      db.collection('customers').estimatedDocumentCount(),
      db.collection('products').estimatedDocumentCount(),
      db.collection('orders').estimatedDocumentCount()
    ]);

    if (customers > 0 || products > 0 || orders > 0) {
      console.log('ℹ️  Auto-seed skipped: database already has data');
      return;
    }

    console.log('🌱 Auto-seed starting (database is empty)...');
    await seedDatabase();
    console.log('✅ Auto-seed completed');
  } catch (error) {
    console.error('Auto-seed error:', error);
  }
}

module.exports = { autoSeedIfEmpty };


