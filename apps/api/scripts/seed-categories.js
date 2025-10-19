const { MongoClient, ObjectId } = require('mongodb');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env') });

// Categories data with more details
const categories = [
  {
    name: 'Electronics',
    slug: 'electronics',
    description: 'Latest gadgets and electronic devices',
    icon: '💻',
    image: 'https://picsum.photos/seed/electronics/800/400',
    order: 1,
    isActive: true
  },
  {
    name: 'Home & Kitchen',
    slug: 'home',
    description: 'Everything for your home and kitchen',
    icon: '🏠',
    image: 'https://picsum.photos/seed/home/800/400',
    order: 2,
    isActive: true
  },
  {
    name: 'Apparel',
    slug: 'apparel',
    description: 'Fashion and clothing for all',
    icon: '👕',
    image: 'https://picsum.photos/seed/apparel/800/400',
    order: 3,
    isActive: true
  },
  {
    name: 'Accessories',
    slug: 'accessories',
    description: 'Accessories to complement your style',
    icon: '👜',
    image: 'https://picsum.photos/seed/accessories/800/400',
    order: 4,
    isActive: true
  },
  {
    name: 'Tools & Hardware',
    slug: 'tools',
    description: 'Professional tools and hardware',
    icon: '🔧',
    image: 'https://picsum.photos/seed/tools/800/400',
    order: 5,
    isActive: true
  },
  {
    name: 'Sports & Outdoors',
    slug: 'sports',
    description: 'Sports equipment and outdoor gear',
    icon: '⚽',
    image: 'https://picsum.photos/seed/sports/800/400',
    order: 6,
    isActive: true
  },
  {
    name: 'Books',
    slug: 'books',
    description: 'Books for every reader',
    icon: '📚',
    image: 'https://picsum.photos/seed/books/800/400',
    order: 7,
    isActive: true
  },
  {
    name: 'Beauty & Health',
    slug: 'beauty',
    description: 'Beauty and health products',
    icon: '💄',
    image: 'https://picsum.photos/seed/beauty/800/400',
    order: 8,
    isActive: true
  }
];

async function seedCategories() {
  let client;
  
  try {
    console.log('🌱 Starting categories seed...');
    
    // Connect to MongoDB
    const uri = process.env.MONGODB_URI;
    if (!uri) {
      throw new Error('MONGODB_URI environment variable is not set');
    }
    
    client = new MongoClient(uri);
    await client.connect();
    console.log('✅ Connected to MongoDB');
    
    const db = client.db();
    
    // Clear existing categories
    console.log('🗑️  Clearing existing categories...');
    await db.collection('categories').deleteMany({});
    
    // Insert categories
    console.log('📂 Inserting categories...');
    const categoryDocs = categories.map(c => ({
      ...c,
      productCount: 0, // Will be updated after products are inserted
      createdAt: new Date(),
      updatedAt: new Date()
    }));
    
    const result = await db.collection('categories').insertMany(categoryDocs);
    console.log(`✅ Inserted ${result.insertedCount} categories`);
    
    // Create index
    await db.collection('categories').createIndex({ slug: 1 }, { unique: true });
    await db.collection('categories').createIndex({ order: 1 });
    console.log('✅ Created category indexes');
    
    // Update product counts
    console.log('📊 Updating product counts...');
    const productCounts = await db.collection('products').aggregate([
      { $group: { _id: '$category', count: { $sum: 1 } } }
    ]).toArray();
    
    for (const item of productCounts) {
      await db.collection('categories').updateOne(
        { slug: item._id },
        { $set: { productCount: item.count } }
      );
    }
    
    console.log('\n✨ Categories seeded successfully!');
    
    // Show summary
    const finalCategories = await db.collection('categories').find({}).toArray();
    console.log('\n📊 Category Summary:');
    finalCategories.forEach(c => {
      console.log(`  - ${c.name}: ${c.productCount} products`);
    });
    
  } catch (error) {
    console.error('❌ Seed error:', error);
    process.exit(1);
  } finally {
    if (client) {
      await client.close();
      console.log('👋 Disconnected from MongoDB');
    }
  }
}

// Export for reuse
module.exports = seedCategories;

if (require.main === module) {
  // Run seed when executed directly
  seedCategories();
}
