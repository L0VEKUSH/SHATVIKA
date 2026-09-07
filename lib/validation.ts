import { z } from 'zod';

// Review validation
export const reviewSubmitSchema = z.object({
  menuItemId: z.string().min(1, 'Menu item required').optional().nullable(),
  name: z.string().min(1, 'Name required').max(80, 'Name too long'),
  rating: z.number().int().min(1, 'Rating must be 1-5').max(5, 'Rating must be 1-5'),
  text: z.string().min(0).max(1000, 'Review too long').optional().nullable(),
  email: z.string().email('Valid email required').optional().nullable(),
  imageUrl: z.string().url('Valid image URL required').optional().nullable(),
  website: z.string().optional(), // Honeypot
});

// Menu item validation
export const menuItemSchema = z.object({
  name: z.string().min(1, 'Name required').max(100),
  description: z.string().max(500).optional(),
  category: z.enum(['Momos', 'Fries', 'Burgers', 'Patties', 'Sandwiches', 'South Indian', 'Shakes', 'Drinks', 'Desserts', 'Pizza']),
  emoji: z.string().length(2, 'Emoji required'),
  variants: z.array(z.object({
    id: z.string(),
    name: z.string().min(1),
    price: z.number().positive(),
    available: z.boolean(),
  })).min(1, 'At least one variant required'),
  rating: z.number().min(0).max(5).optional(),
  reviewCount: z.number().nonnegative().optional(),
  popular: z.boolean().optional(),
  spicy: z.boolean().optional(),
  vegetarian: z.boolean().optional(),
  isNew: z.boolean().optional(),
  gradientClass: z.string().optional(),
});

// Order validation
export const orderSchema = z.object({
  items: z.array(z.object({
    menuItemId: z.string(),
    variantId: z.string(),
    quantity: z.number().positive(),
  })).min(1),
  total: z.number().positive(),
  status: z.enum(['Pending', 'Cooking', 'Ready', 'Out for Delivery', 'Delivered', 'Cancelled']),
  deliveryAddress: z.object({
    street: z.string().min(1),
    city: z.string().min(1),
    state: z.string().min(1),
    zipCode: z.string().min(1),
    phone: z.string().min(10),
  }).optional(),
});

// Coupon validation
export const couponSchema = z.object({
  code: z.string().min(3).max(20).toUpperCase(),
  discountPercent: z.number().min(0).max(100),
  expiry: z.string().datetime().optional(),
});

// User profile validation
export const userProfileSchema = z.object({
  fullName: z.string().min(1).max(100),
  email: z.string().email(),
  phone: z.string().min(10).max(15).optional(),
  profilePhoto: z.string().url().optional(),
});

export type ReviewSubmit = z.infer<typeof reviewSubmitSchema>;
export type MenuItem = z.infer<typeof menuItemSchema>;
export type Order = z.infer<typeof orderSchema>;
export type Coupon = z.infer<typeof couponSchema>;
export type UserProfile = z.infer<typeof userProfileSchema>;
