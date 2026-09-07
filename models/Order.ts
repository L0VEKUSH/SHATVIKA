import mongoose, { Schema, type Model } from 'mongoose';

const orderItemSchema = new Schema(
  {
    menuItemId: { type: mongoose.Schema.Types.ObjectId, ref: 'MenuItem', required: true },
    name: { type: String, required: true },
    variantId: { type: String, default: '' },
    variantName: { type: String, default: '' },
    quantity: { type: Number, required: true, min: 1 },
    unitPrice: { type: Number, required: true, min: 0 },
    totalPrice: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const deliveryAddressSchema = new Schema(
  {
    street: { type: String, required: true, trim: true },
    city: { type: String, required: true, trim: true },
    state: { type: String, required: true, trim: true },
    zipCode: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },
  },
  { _id: false }
);

const statusHistorySchema = new Schema(
  {
    status: { type: String, required: true },
    timestamp: { type: Date, default: Date.now },
    note: { type: String, default: null },
  },
  { _id: false }
);

const orderSchema = new Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    items: {
      type: [orderItemSchema],
      required: true,
      validate: {
        validator: (arr: any[]) => arr.length > 0,
        message: 'Order must have at least one item',
      },
    },
    subtotal: { type: Number, required: true, min: 0 },
    discount: { type: Number, default: 0, min: 0 },
    couponCode: { type: String, default: null, trim: true },
    tax: { type: Number, required: true, min: 0 },
    deliveryCharge: { type: Number, default: 0, min: 0 },
    totalAmount: {
      type: Number,
      required: true,
      min: 0,
      index: true,
    },
    paymentMethod: {
      type: String,
      enum: ['card', 'upi', 'wallet', 'cash'],
      required: true,
    },
    paymentStatus: {
      type: String,
      enum: ['pending', 'paid', 'failed', 'refunded'],
      default: 'pending',
      index: true,
    },
    orderStatus: {
      type: String,
      enum: ['pending', 'accepted', 'preparing', 'ready', 'out_for_delivery', 'delivered', 'cancelled'],
      default: 'pending',
      index: true,
    },
    statusHistory: { type: [statusHistorySchema], default: [] },
    deliveryAddress: { type: deliveryAddressSchema, required: true },
    specialInstructions: { type: String, default: null, trim: true },
    estimatedDeliveryTime: { type: Date, default: null },
    actualDeliveryTime: { type: Date, default: null },
    customerNotes: { type: String, default: null, trim: true },
    adminNotes: { type: String, default: null, trim: true },
  },
  { timestamps: true }
);

// Validate and recalculate totalAmount pre-save
orderSchema.pre('save', function(this: any, next: any) {
  const calculatedTotal = (this.subtotal || 0) + (this.tax || 0) + (this.deliveryCharge || 0) - (this.discount || 0);
  if (Math.abs(calculatedTotal - this.totalAmount) > 0.01) {
    this.totalAmount = Math.max(0, Number(calculatedTotal.toFixed(2)));
  }
  next();
});

orderSchema.set('toJSON', {
  transform: (_doc, ret) => {
    const r = ret as Record<string, unknown>;
    if (r._id) r.id = String(r._id);
    delete r._id;
    delete r.__v;
    return r;
  },
});

// Compound indexes for common queries
orderSchema.index({ userId: 1, createdAt: -1 });
orderSchema.index({ paymentStatus: 1 });
orderSchema.index({ orderStatus: 1 });

export const Order: Model<any> =
  (mongoose.models.Order as Model<any> | undefined) ??
  mongoose.model('Order', orderSchema);
