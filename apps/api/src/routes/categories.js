const express = require('express');
const { ObjectId } = require('mongodb');
const { getDB } = require('../db');

const router = express.Router();

// GET /api/categories - List all categories
router.get('/', async (req, res) => {
  try {
    const db = getDB();
    
    // Get all active categories sorted by order
    const categories = await db.collection('categories')
      .find({ isActive: true })
      .sort({ order: 1 })
      .toArray();
    
    // Update product counts in real-time
    const productCounts = await db.collection('products').aggregate([
      { $group: { _id: '$category', count: { $sum: 1 } } }
    ]).toArray();
    
    // Create a map for quick lookup
    const countMap = {};
    productCounts.forEach(item => {
      countMap[item._id] = item.count;
    });
    
    // Update categories with current counts
    const categoriesWithCounts = categories.map(cat => ({
      ...cat,
      productCount: countMap[cat.slug] || 0
    }));
    
    res.json({
      categories: categoriesWithCounts,
      total: categoriesWithCounts.length
    });
  } catch (error) {
    console.error('Categories list error:', error);
    
    // If categories collection doesn't exist, return default categories
    if (error.message?.includes('categories')) {
      const defaultCategories = [
        { _id: '1', name: 'Electronics', slug: 'electronics', productCount: 0, icon: '💻', order: 1 },
        { _id: '2', name: 'Home & Kitchen', slug: 'home', productCount: 0, icon: '🏠', order: 2 },
        { _id: '3', name: 'Apparel', slug: 'apparel', productCount: 0, icon: '👕', order: 3 },
        { _id: '4', name: 'Accessories', slug: 'accessories', productCount: 0, icon: '👜', order: 4 },
        { _id: '5', name: 'Tools & Hardware', slug: 'tools', productCount: 0, icon: '🔧', order: 5 },
        { _id: '6', name: 'Sports & Outdoors', slug: 'sports', productCount: 0, icon: '⚽', order: 6 }
      ];
      
      return res.json({
        categories: defaultCategories,
        total: defaultCategories.length,
        fallback: true
      });
    }
    
    res.status(500).json({
      error: {
        code: 'LIST_ERROR',
        message: 'Failed to retrieve categories'
      }
    });
  }
});

// GET /api/categories/:slug - Get single category with products
router.get('/:slug', async (req, res) => {
  try {
    const { slug } = req.params;
    const { page = 1, limit = 12 } = req.query;
    
    const db = getDB();
    
    // Find category
    const category = await db.collection('categories').findOne({ slug });
    
    if (!category) {
      return res.status(404).json({
        error: {
          code: 'CATEGORY_NOT_FOUND',
          message: 'Category not found'
        }
      });
    }
    
    // Pagination
    const pageNum = parseInt(page) || 1;
    const pageLimit = Math.min(parseInt(limit) || 12, 100);
    const skip = (pageNum - 1) * pageLimit;
    
    // Get products in this category
    const [products, totalCount] = await Promise.all([
      db.collection('products')
        .find({ category: slug })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(pageLimit)
        .toArray(),
      db.collection('products').countDocuments({ category: slug })
    ]);
    
    res.json({
      category: {
        ...category,
        productCount: totalCount
      },
      products,
      pagination: {
        page: pageNum,
        limit: pageLimit,
        total: totalCount,
        totalPages: Math.ceil(totalCount / pageLimit)
      }
    });
  } catch (error) {
    console.error('Category fetch error:', error);
    res.status(500).json({
      error: {
        code: 'FETCH_ERROR',
        message: 'Failed to fetch category'
      }
    });
  }
});

// POST /api/categories - Create new category (admin)
router.post('/', async (req, res) => {
  try {
    const {
      name,
      slug,
      description,
      icon,
      image,
      order
    } = req.body;
    
    // Validation
    if (!name || !slug) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Name and slug are required'
        }
      });
    }
    
    const db = getDB();
    
    // Check if slug already exists
    const existing = await db.collection('categories').findOne({ slug });
    if (existing) {
      return res.status(409).json({
        error: {
          code: 'DUPLICATE_SLUG',
          message: 'Category with this slug already exists'
        }
      });
    }
    
    // Get max order if not provided
    let categoryOrder = order;
    if (!categoryOrder) {
      const maxOrderDoc = await db.collection('categories')
        .findOne({}, { sort: { order: -1 } });
      categoryOrder = (maxOrderDoc?.order || 0) + 1;
    }
    
    const newCategory = {
      name,
      slug,
      description: description || '',
      icon: icon || '📦',
      image: image || `https://picsum.photos/seed/${slug}/800/400`,
      order: categoryOrder,
      isActive: true,
      productCount: 0,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    const result = await db.collection('categories').insertOne(newCategory);
    
    res.status(201).json({
      ...newCategory,
      _id: result.insertedId
    });
  } catch (error) {
    console.error('Category creation error:', error);
    res.status(500).json({
      error: {
        code: 'CREATE_ERROR',
        message: 'Failed to create category'
      }
    });
  }
});

// PUT /api/categories/:id - Update category
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        error: {
          code: 'INVALID_ID',
          message: 'Invalid category ID format'
        }
      });
    }
    
    const db = getDB();
    
    // Remove fields that shouldn't be updated
    delete updates._id;
    delete updates.createdAt;
    
    const result = await db.collection('categories').findOneAndUpdate(
      { _id: new ObjectId(id) },
      { 
        $set: {
          ...updates,
          updatedAt: new Date()
        }
      },
      { returnDocument: 'after' }
    );
    
    if (!result) {
      return res.status(404).json({
        error: {
          code: 'CATEGORY_NOT_FOUND',
          message: 'Category not found'
        }
      });
    }
    
    res.json(result);
  } catch (error) {
    console.error('Category update error:', error);
    res.status(500).json({
      error: {
        code: 'UPDATE_ERROR',
        message: 'Failed to update category'
      }
    });
  }
});

// DELETE /api/categories/:id - Delete category
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        error: {
          code: 'INVALID_ID',
          message: 'Invalid category ID format'
        }
      });
    }
    
    const db = getDB();
    
    // Check if category has products
    const category = await db.collection('categories').findOne({ _id: new ObjectId(id) });
    if (!category) {
      return res.status(404).json({
        error: {
          code: 'CATEGORY_NOT_FOUND',
          message: 'Category not found'
        }
      });
    }
    
    const productCount = await db.collection('products').countDocuments({ category: category.slug });
    if (productCount > 0) {
      return res.status(400).json({
        error: {
          code: 'CATEGORY_HAS_PRODUCTS',
          message: `Cannot delete category with ${productCount} products`
        }
      });
    }
    
    // Delete category
    await db.collection('categories').deleteOne({ _id: new ObjectId(id) });
    
    res.json({ message: 'Category deleted successfully' });
  } catch (error) {
    console.error('Category deletion error:', error);
    res.status(500).json({
      error: {
        code: 'DELETE_ERROR',
        message: 'Failed to delete category'
      }
    });
  }
});

module.exports = router;
