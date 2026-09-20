import mongoose, { Schema, type Model } from 'mongoose';

const couponUsageSchema = new Schema(
  {
    couponId: { type: mongoose.Schema.Types.ObjectId, ref: 'Coupon', required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    count: { type: Number, default: 0, min: 0, validate: Number.isSafeInteger },
  },
  { timestamps: true },
);

couponUsageSchema.index({ couponId: 1, userId: 1 }, { unique: true });

export const CouponUsage: Model<any> =
  (mongoose.models.CouponUsage as Model<any> | undefined) ??
  mongoose.model('CouponUsage', couponUsageSchema);
