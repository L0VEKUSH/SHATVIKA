import mongoose, { Schema, type Model } from 'mongoose';

const expensePeriodSchema = new Schema({
  locationId: { type: String, required: true, maxlength: 64 },
  month: { type: String, required: true, match: /^\d{4}-\d{2}$/ },
  complete: { type: Boolean, required: true, default: false },
  note: { type: String, default: null, maxlength: 500 },
  updatedById: { type: String, required: true, maxlength: 64 },
  completedAt: { type: Date, default: null },
}, { timestamps: true });

expensePeriodSchema.index({ locationId: 1, month: 1 }, { unique: true });

export const ExpensePeriod: Model<any> =
  (mongoose.models.ExpensePeriod as Model<any> | undefined) ?? mongoose.model('ExpensePeriod', expensePeriodSchema);
