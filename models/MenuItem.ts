import mongoose, { Schema, type Model } from 'mongoose';

/* ── Variant sub-document ─────────────────────────────────────── */
const variantSchema = new Schema(
  {
    id: { type: String, required: true, default: () => new mongoose.Types.ObjectId().toString() },
    name: { type: String, required: true, trim: true, maxlength: 60 },
    price: { type: Number, required: true, min: 0 },
    available: { type: Boolean, default: true },
  },
  { _id: false }
);

/* ── MenuItem schema ──────────────────────────────────────────── */
const menuItemSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      maxlength: 120,
      index: true,
    },
    description: { type: String, default: '', maxlength: 1000 },
    ingredients: { type: [String], default: [] },
    images: { type: [String], default: [] },
    variants: { type: [variantSchema], default: [] },
    basePrice: { type: Number, min: 0 }, // If no variants
    rating: { type: Number, default: 0, min: 0, max: 5 },
    reviewCount: { type: Number, default: 0, min: 0 },
    category: {
      type: String,
      required: true,
      enum: ['Momos', 'Fries', 'Burgers', 'Patties', 'Sandwiches', 'South Indian', 'Shakes', 'Drinks', 'Desserts', 'Pizza'],
      index: true,
    },
    emoji: { type: String, required: true },
    gradientClass: { type: String, required: true },
    popular: { type: Boolean, default: false, index: true },
    spicy: { type: Boolean, default: false },
    vegetarian: { type: Boolean, default: false },
    available: { type: Boolean, default: true },
    // NOTE: renamed from 'isNew' to avoid collision with Mongoose's own isNew property
    isNewItem: { type: Boolean, default: false },
    // Inventory management
    quantity: { type: Number, default: 999, min: 0 }, // Stock available
    quantitySold: { type: Number, default: 0, min: 0 }, // For analytics
  },
  { timestamps: true }
);

// Validation: ensure either basePrice or variants exist
menuItemSchema.pre('save', function(this: any, next: any) {
  if (!this.basePrice && (!this.variants || this.variants.length === 0)) {
    throw new Error('MenuItem must have either basePrice or at least one variant');
  }
  next();
});


// Serialise _id → id in all JSON responses
menuItemSchema.set('toJSON', {
  transform: (_doc, ret) => {
    const r = ret as Record<string, unknown>;
    if (r._id) r.id = String(r._id);
    delete r._id;
    delete r.__v;
    return r;
  },
});

// Text index for search
menuItemSchema.index({ name: 'text', description: 'text' });
// Compound indexes for common queries
menuItemSchema.index({ category: 1, available: 1 });

export const MenuItem: Model<any> =
  (mongoose.models.MenuItem as Model<any> | undefined) ??
  mongoose.model('MenuItem', menuItemSchema);
