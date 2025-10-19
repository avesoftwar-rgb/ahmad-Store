// Categories API functions
import { API_URL } from './api';

export interface Category {
  _id: string;
  name: string;
  slug: string;
  description?: string;
  icon?: string;
  image?: string;
  order: number;
  isActive: boolean;
  productCount: number;
}

export interface CategoriesResponse {
  categories: Category[];
  total: number;
  fallback?: boolean;
}

export interface CategoryWithProducts {
  category: Category;
  products: any[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// Fetch all categories
export async function fetchCategories(): Promise<Category[]> {
  try {
    const response = await fetch(`${API_URL}/api/categories`);
    
    if (!response.ok) {
      console.error('Failed to fetch categories:', response.status);
      return getDefaultCategories();
    }
    
    const data: CategoriesResponse = await response.json();
    
    // If API returns fallback categories, use them
    if (data.fallback) {
      console.log('Using fallback categories from API');
    }
    
    return data.categories || [];
  } catch (error) {
    console.error('Error fetching categories:', error);
    return getDefaultCategories();
  }
}

// Fetch single category with products
export async function fetchCategoryWithProducts(
  slug: string,
  page: number = 1,
  limit: number = 12
): Promise<CategoryWithProducts | null> {
  try {
    const response = await fetch(
      `${API_URL}/api/categories/${slug}?page=${page}&limit=${limit}`
    );
    
    if (!response.ok) {
      console.error('Failed to fetch category:', response.status);
      return null;
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error fetching category:', error);
    return null;
  }
}

// Default categories for fallback
function getDefaultCategories(): Category[] {
  return [
    {
      _id: '1',
      name: 'Electronics',
      slug: 'electronics',
      description: 'Latest gadgets and electronic devices',
      icon: '💻',
      image: 'https://picsum.photos/seed/electronics/800/400',
      order: 1,
      isActive: true,
      productCount: 0
    },
    {
      _id: '2',
      name: 'Home & Kitchen',
      slug: 'home',
      description: 'Everything for your home and kitchen',
      icon: '🏠',
      image: 'https://picsum.photos/seed/home/800/400',
      order: 2,
      isActive: true,
      productCount: 0
    },
    {
      _id: '3',
      name: 'Apparel',
      slug: 'apparel',
      description: 'Fashion and clothing for all',
      icon: '👕',
      image: 'https://picsum.photos/seed/apparel/800/400',
      order: 3,
      isActive: true,
      productCount: 0
    },
    {
      _id: '4',
      name: 'Accessories',
      slug: 'accessories',
      description: 'Accessories to complement your style',
      icon: '👜',
      image: 'https://picsum.photos/seed/accessories/800/400',
      order: 4,
      isActive: true,
      productCount: 0
    },
    {
      _id: '5',
      name: 'Tools & Hardware',
      slug: 'tools',
      description: 'Professional tools and hardware',
      icon: '🔧',
      image: 'https://picsum.photos/seed/tools/800/400',
      order: 5,
      isActive: true,
      productCount: 0
    },
    {
      _id: '6',
      name: 'Sports & Outdoors',
      slug: 'sports',
      description: 'Sports equipment and outdoor gear',
      icon: '⚽',
      image: 'https://picsum.photos/seed/sports/800/400',
      order: 6,
      isActive: true,
      productCount: 0
    }
  ];
}

// Helper to get category by slug
export function getCategoryBySlug(categories: Category[], slug: string): Category | undefined {
  return categories.find(cat => cat.slug === slug);
}

// Helper to format category name for display
export function formatCategoryName(category: string): string {
  const categoryMap: { [key: string]: string } = {
    'electronics': 'Electronics',
    'home': 'Home & Kitchen',
    'apparel': 'Apparel',
    'accessories': 'Accessories',
    'tools': 'Tools & Hardware',
    'sports': 'Sports & Outdoors',
    'books': 'Books',
    'beauty': 'Beauty & Health'
  };
  
  return categoryMap[category] || category.charAt(0).toUpperCase() + category.slice(1);
}
