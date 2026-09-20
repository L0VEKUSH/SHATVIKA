import mongoose, { Schema, type Model } from 'mongoose';
import { rupeesToPaise } from '@/lib/money';

const CATEGORIES = [
  'Momos', 'Fries', 'Burgers', 'Patties', 'Sandwiches', 'South Indian',
  'Shakes', 'Drinks', 'Desserts', 'Pizza',
] as const;

const isNullableSafeInteger = (value: unknown) => value === null || Number.isSafeInteger(value);

const costBreakdownSchema = new Schema({
  ingredientPaise: { type: Number, min: 0, default: 0, validate: Number.isSafeInteger },
  productPaise: { type: Number, min: 0, default: 0, validate: Number.isSafeInteger },
  packagingPaise: { type: Number, min: 0, default: 0, validate: Number.isSafeInteger },
}, { _id: false });

function categoryId(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

const variantSchema = new Schema(
  {
    id: { type: String, required: true, default: () => new mongoose.Types.ObjectId().toString() },
    name: { type: String, required: true, trim: true, maxlength: 60 },
    // Legacy rupee display field. Financial calculations use pricePaise.
    price: { type: Number, required: true, min: 0 },
    pricePaise: { type: Number, min: 0, validate: Number.isSafeInteger },
    costPaise: { type: Number, min: 0, default: null, validate: isNullableSafeInteger },
    costBreakdown: { type: costBreakdownSchema, default: null },
    available: { type: Boolean, default: true },
  },
  { _id: false },
);

const menuItemSchema = new Schema(
  {
    name: { type: String, required: true, unique: true, trim: true, maxlength: 120, index: true },
    description: { type: String, default: '', maxlength: 1000 },
    ingredients: { type: [String], default: [] },
    images: { type: [String], default: [] },
    variants: { type: [variantSchema], default: [] },
    basePrice: { type: Number, min: 0 },
    basePricePaise: { type: Number, min: 0, validate: Number.isSafeInteger },
    costPaise: { type: Number, min: 0, default: null, validate: isNullableSafeInteger },
    costBreakdown: { type: costBreakdownSchema, default: null },
    rating: { type: Number, default: 0, min: 0, max: 5 },
    reviewCount: { type: Number, default: 0, min: 0 },
    category: { type: String, required: true, enum: CATEGORIES, index: true },
    categoryId: { type: String, required: true, index: true },
    emoji: { type: String, required: true },
    gradientClass: { type: String, required: true },
    popular: { type: Boolean, default: false, index: true },
    spicy: { type: Boolean, default: false },
    vegetarian: { type: Boolean, default: false },
    available: { type: Boolean, default: true, index: true },
    isNewItem: { type: Boolean, default: false },
    // Inventory is shared by variants for the current product contract.
    quantity: { type: Number, default: 0, min: 0, validate: Number.isSafeInteger },
    quantitySold: { type: Number, default: 0, min: 0, validate: Number.isSafeInteger },
    quantityWasted: { type: Number, default: 0, min: 0, validate: Number.isSafeInteger },
    reorderPoint: { type: Number, default: 5, min: 0, validate: Number.isSafeInteger },
    archivedAt: { type: Date, default: null, index: true },
  },
  { timestamps: true },
);

function normalizeMoneyFields(target: Record<string, any>): void {
  if (typeof target.category === 'string') target.categoryId = categoryId(target.category);
  if (target.basePrice !== undefined && target.basePrice !== null) {
    target.basePricePaise = rupeesToPaise(target.basePrice, 'basePrice');
  }
  if (Array.isArray(target.variants)) {
    target.variants.forEach((variant: Record<string, unknown>) => {
      if (variant.price !== undefined) variant.pricePaise = rupeesToPaise(variant.price, 'variant.price');
    });
  }
}

menuItemSchema.pre('validate', function () {
  normalizeMoneyFields(this as unknown as Record<string, any>);
  const hasBasePrice = this.basePrice !== undefined && this.basePrice !== null;
  if (!hasBasePrice && (!this.variants || this.variants.length === 0)) {
    throw new Error('MenuItem must have either basePrice or at least one variant');
  }
});

menuItemSchema.pre('findOneAndUpdate', function () {
  const update = this.getUpdate() as Record<string, any> | null;
  if (!update) return;
  normalizeMoneyFields(update.$set ?? update);
});

menuItemSchema.set('toJSON', {
  transform: (_doc, ret) => {
    const value = ret as Record<string, unknown>;
    if (value._id) value.id = String(value._id);
    delete value._id;
    delete value.__v;
    return value;
  },
});

menuItemSchema.index({ name: 'text', description: 'text' });
menuItemSchema.index({ categoryId: 1, available: 1 });
menuItemSchema.index({ quantity: 1, available: 1 });

export const MenuItem: Model<any> =
  (mongoose.models.MenuItem as Model<any> | undefined) ?? mongoose.model('MenuItem', menuItemSchema);
