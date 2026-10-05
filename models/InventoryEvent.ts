import mongoose, { Schema, type Model } from 'mongoose';

const inventoryEventSchema = new Schema({
  menuItemId: { type: Schema.Types.ObjectId, ref: 'MenuItem', required: true, index: true },
  variantId: { type: String, default: 'base', maxlength: 120 },
  orderId: { type: Schema.Types.ObjectId, ref: 'Order', default: null, index: true },
  type: { type: String, enum: ['stock_reserved', 'stock_released', 'wastage', 'adjustment'], required: true, index: true },
  quantity: { type: Number, required: true, min: 1, validate: Number.isSafeInteger },
  quantityDelta: { type: Number, required: true, validate: Number.isSafeInteger },
  reason: { type: String, required: true, trim: true, maxlength: 300 },
  actorType: { type: String, enum: ['customer', 'guest', 'worker', 'admin', 'system'], required: true },
  actorId: { type: String, default: null, maxlength: 64 },
  occurredAt: { type: Date, default: Date.now, required: true, index: true },
}, { timestamps: true });

inventoryEventSchema.index({ occurredAt: -1, type: 1 });
inventoryEventSchema.index({ orderId: 1, type: 1, menuItemId: 1 });

export const InventoryEvent: Model<any> =
  (mongoose.models.InventoryEvent as Model<any> | undefined) ??
  mongoose.model('InventoryEvent', inventoryEventSchema);
