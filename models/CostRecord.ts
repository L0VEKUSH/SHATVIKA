import mongoose, { Schema, type Model } from 'mongoose';

const costRecordSchema = new Schema({
  menuItemId: { type: Schema.Types.ObjectId, ref: 'MenuItem', required: true, index: true },
  variantId: { type: String, required: true, default: 'base', maxlength: 120 },
  ingredientPaise: { type: Number, min: 0, required: true, validate: Number.isSafeInteger },
  productPaise: { type: Number, min: 0, required: true, validate: Number.isSafeInteger },
  packagingPaise: { type: Number, min: 0, required: true, validate: Number.isSafeInteger },
  totalCostPaise: { type: Number, min: 0, required: true, validate: Number.isSafeInteger },
  effectiveAt: { type: Date, required: true, default: Date.now, index: true },
  note: { type: String, required: true, trim: true, maxlength: 500 },
  recordedById: { type: String, required: true, maxlength: 64 },
}, { timestamps: true });

costRecordSchema.index({ menuItemId: 1, variantId: 1, effectiveAt: -1 });

export const CostRecord: Model<any> =
  (mongoose.models.CostRecord as Model<any> | undefined) ?? mongoose.model('CostRecord', costRecordSchema);
