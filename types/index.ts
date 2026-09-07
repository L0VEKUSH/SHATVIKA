/* ── Shared TypeScript types for SHATVIKA CORNER ── */

export interface Variant {
  id: string;
  name: string;
  price: number;
  available: boolean;
}

export interface MenuItem {
  id: string;
  name: string;
  description: string;
  ingredients?: string[];
  images?: string[];
  variants: Variant[];
  basePrice?: number;
  rating: number;
  reviewCount: number;
  category: Category;
  emoji: string;
  gradientClass: string; // Tailwind/CSS class for card background
  popular?: boolean;
  spicy?: boolean;
  vegetarian?: boolean;
  isNew?: boolean;
}

export type Category =
  | 'All'
  | 'Momos'
  | 'Fries'
  | 'Burgers'
  | 'Patties'
  | 'Sandwiches'
  | 'South Indian'
  | 'Shakes'
  | 'Drinks'
  | 'Desserts'
  | 'Pizza';

export interface CartItem {
  id: string; // Add id for cart operations
  menuItemId: string;
  menuItemName: string;
  variantId: string;
  variantName: string;
  variantPrice: number;
  quantity: number;

  // UI fields
  emoji: string;
  gradientClass: string;
}


export type ReviewStatus = 'pending' | 'approved' | 'rejected';

export interface Review {
  id: string;
  name: string;
  rating: number;

  // Public-facing text (used by customer reviews section)
  text: string | null;
  imageUrl: string | null;



  // Admin/content editors in this repo historically also referenced these fields.
  // Keep them optional so both public API shape and legacy admin editing compile.
  avatar?: string;
  location?: string;
  date?: string;
  comment?: string;

  // If not tied to a specific menu item, this is null (overall experience)
  menuItemId?: string | null;

  status?: ReviewStatus;
  createdAt?: string;
}








export interface Offer {
  id: string;
  title: string;
  description: string;
  discount: string;
  code: string;
  gradient: string;      // CSS gradient string
  emoji: string;
  badgeText: string;
}

export interface GalleryItem {
  id: string;
  title: string;
  description?: string;
  category: string; // 'Food' | 'Restaurant' | 'Team' | 'Events'
  imageUrl: string;
  imageType: 'image' | 'video' | 'youtube';
  youtubeId?: string;
  featured?: boolean;
  order?: number;
  // Legacy fields for backward compatibility
  emoji?: string;
  label?: string;
  gradient?: string;
  tall?: boolean;
}


export interface TeamMember {
  id: string;
  name: string;
  role: string;
  emoji: string;
  gradient: string;
}

export interface Stat {
  id: string;
  value: string;
  label: string;
  emoji: string;
}

export interface Feature {
  id: string;
  emoji: string;
  title: string;
  description: string;
  gradient: string;
}
