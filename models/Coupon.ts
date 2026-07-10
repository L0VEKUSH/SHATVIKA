import mongoose, { Schema, type Model } from 'mongoose';

const couponSchema = new Schema(
  {
    code:            { type: String, required: true, unique: true, uppercase: true, trim: true },
    discountPercent: { type: Number, required: true, min: 1, max: 100 },
    active:          { type: Boolean, default: true, index: true },
    usageCount:      { type: Number, default: 0, min: 0 },
    expiry:          { type: String, required: true },
    visibility:      {
      type: String,
      required: true,
      enum: ['public', 'private'],
      default: 'public',
    },
  },
  { timestamps: true }
);

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
