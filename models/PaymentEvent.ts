import mongoose, { Schema, type Model } from 'mongoose';

const paymentEventSchema = new Schema(
  {
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: {
      type: String,
      enum: ['cash_collected', 'payment_captured', 'payment_failed', 'refund_succeeded', 'refund_failed'],
      required: true,
    },
    status: { type: String, enum: ['succeeded', 'failed', 'pending'], required: true },
    method: { type: String, enum: ['cash', 'card', 'upi', 'wallet'], required: true },
    amountPaise: { type: Number, required: true, min: 0, validate: Number.isSafeInteger },
    provider: { type: String, default: 'manual' },
    providerReference: { type: String, default: null, select: false },
    idempotencyKey: { type: String, required: true, minlength: 8, maxlength: 128 },
    requestFingerprint: {
      type: String,
      required: true,
      minlength: 64,
      maxlength: 64,
      select: false,
    },
    occurredAt: { type: Date, default: Date.now, required: true, index: true },
    recordedByType: { type: String, enum: ['admin', 'worker', 'system', 'provider'], required: true },
    recordedById: { type: String, default: null },
    recordedByName: { type: String, default: null, maxlength: 120 },
    note: { type: String, default: null, maxlength: 500 },
  },
  { timestamps: true },
);

paymentEventSchema.index({ orderId: 1, idempotencyKey: 1 }, { unique: true });
paymentEventSchema.index({ occurredAt: -1, status: 1, type: 1 });

paymentEventSchema.set('toJSON', {
  transform: (_doc, ret) => {
    const value = ret as Record<string, unknown>;
    if (value._id) value.id = String(value._id);
    delete value._id;
    delete value.__v;
    delete value.providerReference;
    delete value.requestFingerprint;
    return value;
  },
});

export const PaymentEvent: Model<any> =
  (mongoose.models.PaymentEvent as Model<any> | undefined) ??
  mongoose.model('PaymentEvent', paymentEventSchema);
