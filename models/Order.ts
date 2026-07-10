import mongoose, { Schema, type Model } from 'mongoose';

const orderItemSchema = new Schema(
  {
    name:        { type: String, required: true },
    qty:         { type: Number, required: true, min: 1 },
    price:       { type: Number, required: true, min: 0 },
    variantName: { type: String, default: '' },
    variantId:   { type: String, default: '' },
  },
  { _id: false }
);

const orderSchema = new Schema(
  {
    token:    { type: Number, required: true },
    customer: { type: String, required: true, trim: true },
    avatar:   { type: String, required: true },
    items:    { type: [orderItemSchema], required: true },
    total:    { type: Number, required: true, min: 0 },
    status:   {
      type: String,
      required: true,
      enum: ['Pending', 'Cooking', 'Out for Delivery', 'Delivered', 'Cancelled'],
      default: 'Pending',
      index: true,
    },
    time:     { type: String, required: true },
    address:  { type: String, default: '' },
  },
  { timestamps: true }
);

orderSchema.set('toJSON', {
  transform: (_doc, ret) => {
    const r = ret as Record<string, unknown>;
    if (r._id) r.id = String(r._id);
    delete r._id;
    delete r.__v;
    return r;
  },
});

orderSchema.index({ status: 1, createdAt: -1 });

export const Order: Model<any> =
  (mongoose.models.Order as Model<any> | undefined) ??
  mongoose.model('Order', orderSchema);
