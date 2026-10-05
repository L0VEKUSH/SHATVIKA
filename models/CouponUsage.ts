import mongoose, { Schema, type Model } from 'mongoose';

const couponUsageSchema = new Schema(
  {
    couponId: { type: mongoose.Schema.Types.ObjectId, ref: 'Coupon', required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    guestSessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'GuestSession', default: null },
    count: { type: Number, default: 0, min: 0, validate: Number.isSafeInteger },
  },
  { timestamps: true },
);

couponUsageSchema.pre('validate', function () {
  if (!this.userId && !this.guestSessionId) {
    this.invalidate('userId', 'A customer account or guest session is required');
  }
});

couponUsageSchema.index(
  { couponId: 1, userId: 1 },
  { unique: true, partialFilterExpression: { userId: { $type: 'objectId' } } },
);
couponUsageSchema.index(
  { couponId: 1, guestSessionId: 1 },
  { unique: true, partialFilterExpression: { guestSessionId: { $type: 'objectId' } } },
);

export const CouponUsage: Model<any> =
  (mongoose.models.CouponUsage as Model<any> | undefined) ??
  mongoose.model('CouponUsage', couponUsageSchema);
