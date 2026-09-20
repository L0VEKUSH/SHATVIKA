import mongoose, { Schema, type Model } from 'mongoose';
import { rupeesToPaise } from '@/lib/money';

const isNullableSafeInteger = (value: unknown) => value === null || Number.isSafeInteger(value);

const couponSchema = new Schema(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true, index: true },
    discountType: { type: String, enum: ['percentage', 'fixed'], required: true },
    // Percentage for percentage coupons, rupees for legacy fixed coupons.
    discountValue: { type: Number, required: true, min: 0 },
    fixedDiscountPaise: { type: Number, min: 0, default: null, validate: isNullableSafeInteger },
    minOrderValue: { type: Number, default: 0, min: 0 },
    minOrderPaise: { type: Number, min: 0, default: 0, validate: Number.isSafeInteger },
    maxDiscount: { type: Number, default: null, min: 0 },
    maxDiscountPaise: { type: Number, default: null, min: 0, validate: isNullableSafeInteger },
    applicableCategories: { type: [String], default: [] },
    // Private coupons remain redeemable by code but are never advertised publicly.
    visibility: { type: String, enum: ['public', 'private'], default: 'public', index: true },
    usageLimit: { type: Number, default: null, min: 1 },
    perCustomerLimit: { type: Number, default: 1, min: 1, max: 100 },
    usageCount: { type: Number, default: 0, min: 0, index: true },
    usedBy: { type: [mongoose.Schema.Types.ObjectId], default: [] },
    startsAt: { type: Date, default: null, index: true },
    expiresAt: { type: Date, required: true, index: true },
    isActive: { type: Boolean, default: true, index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
  },
  { timestamps: true },
);

function normalizeCouponMoney(target: Record<string, any>): void {
  if (target.minOrderValue !== undefined) {
    target.minOrderPaise = rupeesToPaise(target.minOrderValue, 'minOrderValue');
  }
  if (target.maxDiscount !== undefined) {
    target.maxDiscountPaise = target.maxDiscount === null
      ? null
      : rupeesToPaise(target.maxDiscount, 'maxDiscount');
  }
  if (target.discountType === 'fixed' && target.discountValue !== undefined) {
    target.fixedDiscountPaise = rupeesToPaise(target.discountValue, 'discountValue');
  }
  if (target.discountType === 'percentage' && target.discountValue > 100) {
    throw new Error('Percentage discount cannot exceed 100');
  }
}

couponSchema.pre('validate', function () {
  normalizeCouponMoney(this as unknown as Record<string, any>);
  if (this.discountValue <= 0) throw new Error('Discount value must be greater than 0');
});

couponSchema.pre('findOneAndUpdate', function () {
  const update = this.getUpdate() as Record<string, any> | null;
  if (!update) return;
  normalizeCouponMoney(update.$set ?? update);
});

couponSchema.set('toJSON', {
  transform: (_doc, ret) => {
    const value = ret as Record<string, unknown>;
    if (value._id) value.id = String(value._id);
    delete value._id;
    delete value.__v;
    return value;
  },
});

couponSchema.index({ isActive: 1, startsAt: 1, expiresAt: 1 });
couponSchema.index({ visibility: 1, isActive: 1, startsAt: 1, expiresAt: 1 });

export const Coupon: Model<any> =
  (mongoose.models.Coupon as Model<any> | undefined) ?? mongoose.model('Coupon', couponSchema);
