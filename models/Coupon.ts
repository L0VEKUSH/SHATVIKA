import mongoose, { Schema, type Model } from 'mongoose';

const couponSchema = new Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      index: true,
    },
    discountType: {
      type: String,
      enum: ['percentage', 'fixed'],
      required: true,
    },
    discountValue: { type: Number, required: true, min: 0 },
    minOrderValue: { type: Number, default: 0, min: 0 },
    maxDiscount: { type: Number, default: null, min: 0 },
    applicableCategories: { type: [String], default: [] }, // empty = all categories
    usageLimit: { type: Number, default: null }, // null = unlimited
    usageCount: { type: Number, default: 0, min: 0, index: true },
    usedBy: { type: [mongoose.Schema.Types.ObjectId], default: [] }, // user IDs
    expiresAt: { type: Date, required: true, index: true },
    isActive: { type: Boolean, default: true, index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
  },
  { timestamps: true }
);

// Validation: discountValue > 0
couponSchema.pre('save', function (next: any) {
  if (this.discountValue <= 0) {
    return next(new Error('Discount value must be greater than 0'));
  }
  if (this.expiresAt <= new Date()) {
    return next(new Error('Expiry date must be in the future'));
  }
  next();
});

couponSchema.set('toJSON', {
  transform: (_doc, ret) => {
    const r = ret as Record<string, unknown>;
    if (r._id) r.id = String(r._id);
    delete r._id;
    delete r.__v;
    return r;
  },
});

export const Coupon: Model<any> =
  (mongoose.models.Coupon as Model<any> | undefined) ??
  mongoose.model('Coupon', couponSchema);
