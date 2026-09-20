import mongoose, { Schema, type Model } from 'mongoose';

export const OPERATING_EXPENSE_CATEGORIES = ['rent', 'electricity', 'wages', 'other'] as const;

const expenseSchema = new Schema({
  incurredAt: { type: Date, required: true, index: true },
  category: { type: String, enum: OPERATING_EXPENSE_CATEGORIES, required: true, index: true },
  amountPaise: { type: Number, required: true, min: 1, validate: Number.isSafeInteger },
  note: { type: String, required: true, trim: true, minlength: 3, maxlength: 500 },
  status: { type: String, enum: ['active', 'voided'], default: 'active', index: true },
  stateVersion: { type: Number, default: 0, min: 0, validate: Number.isSafeInteger },
  recordedById: { type: String, required: true, maxlength: 64 },
  voidedAt: { type: Date, default: null },
  voidedById: { type: String, default: null, maxlength: 64 },
  voidReason: { type: String, default: null, maxlength: 300 },
}, { timestamps: true });

expenseSchema.index({ incurredAt: -1, status: 1, category: 1 });

export const Expense: Model<any> =
  (mongoose.models.Expense as Model<any> | undefined) ?? mongoose.model('Expense', expenseSchema);
