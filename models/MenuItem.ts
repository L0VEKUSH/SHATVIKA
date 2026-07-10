import mongoose, { Schema, type Model } from 'mongoose';

/* ── Variant sub-document ─────────────────────────────────────── */
const variantSchema = new Schema(
  {
    id:        { type: String, required: true, default: () => new mongoose.Types.ObjectId().toString() },
    name:      { type: String, required: true, trim: true, maxlength: 60 },
    price:     { type: Number, required: true, min: 0 },
    available: { type: Boolean, default: true },
  },
  { _id: false }
);

/* ── MenuItem schema ──────────────────────────────────────────── */
const menuItemSchema = new Schema(
  {
    name:          { type: String, required: true, trim: true, maxlength: 120 },
    description:   { type: String, default: '', maxlength: 500 },
    variants:      { type: [variantSchema], default: [] },
    rating:        { type: Number, default: 5, min: 0, max: 5 },
    reviewCount:   { type: Number, default: 0, min: 0 },
    category:      {
      type: String,
      required: true,
      enum: ['Burgers', 'Pizza', 'Sandwiches', 'Fries', 'Drinks', 'Desserts'],
      index: true,
    },
    emoji:         { type: String, required: true },
    gradientClass: { type: String, required: true },
    popular:       { type: Boolean, default: false, index: true },
    spicy:         { type: Boolean, default: false },
    vegetarian:    { type: Boolean, default: false },
    // NOTE: renamed from 'isNew' to avoid collision with Mongoose's own isNew property
    isNewItem:     { type: Boolean, default: false },
  },
  { timestamps: true }
);

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

export const MenuItem: Model<any> =
  (mongoose.models.MenuItem as Model<any> | undefined) ??
  mongoose.model('MenuItem', menuItemSchema);
