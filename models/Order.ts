import mongoose, { Schema, type Model } from 'mongoose';
import { legacyRupeesOrPaise, paiseToRupees } from '@/lib/money';
import { ORDER_STATUSES } from '@/lib/orders/stateMachine';

const isNullableSafeInteger = (value: unknown) => value === null || Number.isSafeInteger(value);
const costBreakdownSchema = new Schema({
  ingredientPaise: { type: Number, min: 0, default: 0, validate: Number.isSafeInteger },
  productPaise: { type: Number, min: 0, default: 0, validate: Number.isSafeInteger },
  packagingPaise: { type: Number, min: 0, default: 0, validate: Number.isSafeInteger },
}, { _id: false });

const orderItemSchema = new Schema(
  {
    menuItemId: { type: mongoose.Schema.Types.ObjectId, ref: 'MenuItem', required: true },
    name: { type: String, required: true },
    productName: { type: String, default: null },
    variantId: { type: String, default: 'base' },
    variantName: { type: String, default: 'Regular' },
    categoryId: { type: String, default: 'unknown', index: true },
    categoryName: { type: String, default: 'Unknown' },
    quantity: { type: Number, required: true, min: 1, validate: Number.isSafeInteger },
    unitPrice: { type: Number, required: true, min: 0 },
    totalPrice: { type: Number, required: true, min: 0 },
    unitPricePaise: { type: Number, min: 0, validate: Number.isSafeInteger },
    totalPricePaise: { type: Number, min: 0, validate: Number.isSafeInteger },
    unitCostPaise: { type: Number, min: 0, default: null, validate: isNullableSafeInteger },
    unitCostBreakdown: { type: costBreakdownSchema, default: null },
  },
  { _id: false },
);

const deliveryAddressSchema = new Schema(
  {
    label: { type: String, default: null, trim: true },
    street: { type: String, required: true, trim: true },
    city: { type: String, required: true, trim: true },
    state: { type: String, required: true, trim: true },
    zipCode: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },
  },
  { _id: false },
);

const customerSnapshotSchema = new Schema(
  {
    name: { type: String, default: null },
    email: { type: String, default: null },
    phone: { type: String, default: null },
  },
  { _id: false },
);

const couponSnapshotSchema = new Schema(
  {
    couponId: { type: mongoose.Schema.Types.ObjectId, default: null },
    code: { type: String, default: null },
    discountType: { type: String, enum: ['percentage', 'fixed', null], default: null },
    discountValue: { type: Number, default: null },
    eligibleSubtotalPaise: { type: Number, min: 0, default: null },
  },
  { _id: false },
);

const statusHistorySchema = new Schema(
  {
    fromStatus: { type: String, enum: [...ORDER_STATUSES, null], default: null },
    status: { type: String, enum: ORDER_STATUSES, required: true },
    timestamp: { type: Date, default: Date.now, required: true },
    actorType: { type: String, enum: ['customer', 'worker', 'admin', 'system'], default: 'system' },
    actorId: { type: String, default: null },
    reason: { type: String, default: null, maxlength: 300 },
    note: { type: String, default: null, maxlength: 500 },
  },
  { _id: false },
);

const orderSchema = new Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    // Missing fulfillmentType means a historical delivery order. New orders must
    // set `counter` explicitly; migration never rewrites legacy delivery meaning.
    fulfillmentType: { type: String, enum: ['counter', 'delivery', null], default: null, index: true },
    fulfillmentLocationId: { type: String, default: null, trim: true, maxlength: 64, index: true },
    fulfillmentLocationName: { type: String, default: null, trim: true, maxlength: 120 },
    tokenBusinessDate: { type: String, default: null, match: /^\d{4}-\d{2}-\d{2}$/, index: true },
    tokenSequence: { type: Number, default: null, min: 1, validate: isNullableSafeInteger },
    tokenNumber: { type: String, default: null, trim: true, maxlength: 32, index: true },
    customerSnapshot: { type: customerSnapshotSchema, default: null },
    items: {
      type: [orderItemSchema],
      required: true,
      validate: { validator: (items: unknown[]) => items.length > 0, message: 'Order must have at least one item' },
    },
    // Legacy rupee fields are retained for compatibility and migration.
    subtotal: { type: Number, required: true, min: 0 },
    discount: { type: Number, default: 0, min: 0 },
    tax: { type: Number, required: true, min: 0 },
    deliveryCharge: { type: Number, default: 0, min: 0 },
    totalAmount: { type: Number, required: true, min: 0, index: true },
    subtotalPaise: { type: Number, min: 0, validate: Number.isSafeInteger },
    discountPaise: { type: Number, min: 0, validate: Number.isSafeInteger },
    taxPaise: { type: Number, min: 0, validate: Number.isSafeInteger },
    deliveryChargePaise: { type: Number, min: 0, validate: Number.isSafeInteger },
    totalPaise: { type: Number, min: 0, index: true, validate: Number.isSafeInteger },
    couponCode: { type: String, default: null, trim: true },
    couponId: { type: mongoose.Schema.Types.ObjectId, ref: 'Coupon', default: null },
    couponSnapshot: { type: couponSnapshotSchema, default: null },
    // `unknown` is deliberate for legacy rows: absence of historical evidence
    // must not trigger coupon compensation during cancellation.
    couponState: { type: String, enum: ['none', 'redeemed', 'released', 'unknown'], default: 'unknown' },
    idempotencyKey: { type: String, default: null, minlength: 8, maxlength: 128 },
    requestFingerprint: { type: String, default: null, minlength: 64, maxlength: 64 },
    paymentMethod: { type: String, enum: ['counter', 'card', 'upi', 'wallet', 'cash'], required: true },
    paymentStatus: {
      type: String,
      enum: ['pending', 'paid', 'failed', 'partially_refunded', 'refunded'],
      default: 'pending',
      index: true,
    },
    // Presence indicates ledger coverage. Legacy rows intentionally remain absent.
    collectedPaise: { type: Number, min: 0, validate: Number.isSafeInteger },
    refundedPaise: { type: Number, min: 0, validate: Number.isSafeInteger },
    refundDuePaise: { type: Number, min: 0, default: 0, validate: Number.isSafeInteger },
    orderStatus: { type: String, enum: ORDER_STATUSES, default: 'pending', index: true },
    stateVersion: { type: Number, default: 0, min: 0, validate: Number.isSafeInteger },
    statusHistory: { type: [statusHistorySchema], default: [] },
    // New checkout transactions set `committed` explicitly. Legacy rows default
    // to `unknown`, so a later cancellation cannot silently add guessed stock.
    inventoryState: { type: String, enum: ['committed', 'released', 'consumed', 'unknown'], default: 'unknown' },
    deliveryAddress: {
      type: deliveryAddressSchema,
      default: null,
      required: function (this: { fulfillmentType?: 'counter' | 'delivery' | null }) {
        return this.fulfillmentType !== 'counter';
      },
    },
    specialInstructions: { type: String, default: null, trim: true, maxlength: 500 },
    estimatedDeliveryTime: { type: Date, default: null },
    estimatedReadyTime: { type: Date, default: null },
    actualDeliveryTime: { type: Date, default: null, index: true },
    servedAt: { type: Date, default: null, index: true },
    servedById: { type: String, default: null, maxlength: 64 },
    servedByName: { type: String, default: null, maxlength: 120 },
    unpaidServeException: { type: Boolean, default: false },
    unpaidServeExceptionBy: { type: String, default: null, maxlength: 64 },
    unpaidServeExceptionReason: { type: String, default: null, maxlength: 300 },
    cancelledAt: { type: Date, default: null },
    cancellationReason: { type: String, default: null, maxlength: 300 },
    customerNotes: { type: String, default: null, trim: true, maxlength: 500 },
    adminNotes: { type: String, default: null, trim: true, maxlength: 1000 },
  },
  { timestamps: true },
);

orderSchema.pre('validate', function () {
  this.subtotalPaise = legacyRupeesOrPaise(this.subtotalPaise, this.subtotal, 'subtotal');
  this.discountPaise = legacyRupeesOrPaise(this.discountPaise, this.discount, 'discount');
  this.taxPaise = legacyRupeesOrPaise(this.taxPaise, this.tax, 'tax');
  this.deliveryChargePaise = legacyRupeesOrPaise(this.deliveryChargePaise, this.deliveryCharge, 'deliveryCharge');
  if (this.fulfillmentType === 'counter') this.deliveryChargePaise = 0;

  for (const item of this.items ?? []) {
    item.unitPricePaise = legacyRupeesOrPaise(item.unitPricePaise, item.unitPrice, 'items.unitPrice');
    item.totalPricePaise = item.unitPricePaise * item.quantity;
    item.productName ||= item.name;
  }

  const calculated = this.subtotalPaise + this.taxPaise + this.deliveryChargePaise - this.discountPaise;
  this.totalPaise = Math.max(0, calculated);
  this.subtotal = paiseToRupees(this.subtotalPaise);
  this.discount = paiseToRupees(this.discountPaise);
  this.tax = paiseToRupees(this.taxPaise);
  this.deliveryCharge = paiseToRupees(this.deliveryChargePaise);
  this.totalAmount = paiseToRupees(this.totalPaise);
});

orderSchema.set('toJSON', {
  transform: (_doc, ret) => {
    const value = ret as Record<string, unknown>;
    if (value._id) value.id = String(value._id);
    delete value._id;
    delete value.__v;
    delete value.requestFingerprint;
    delete value.idempotencyKey;
    return value;
  },
});

orderSchema.index({ userId: 1, createdAt: -1 });
orderSchema.index({ orderStatus: 1, createdAt: -1 });
orderSchema.index({ paymentStatus: 1, createdAt: -1 });
orderSchema.index({ actualDeliveryTime: -1, orderStatus: 1 });
orderSchema.index({ fulfillmentLocationId: 1, tokenBusinessDate: -1, tokenSequence: 1 }, {
  unique: true,
  partialFilterExpression: {
    fulfillmentLocationId: { $type: 'string' },
    tokenBusinessDate: { $type: 'string' },
    tokenSequence: { $type: 'number' },
  },
});
orderSchema.index({ fulfillmentLocationId: 1, tokenBusinessDate: -1, tokenNumber: 1 });
orderSchema.index(
  { userId: 1, idempotencyKey: 1 },
  { unique: true, partialFilterExpression: { idempotencyKey: { $type: 'string' } } },
);

export const Order: Model<any> =
  (mongoose.models.Order as Model<any> | undefined) ?? mongoose.model('Order', orderSchema);
