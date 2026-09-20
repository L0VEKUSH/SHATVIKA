import mongoose, { Schema, type Model } from 'mongoose';

export type TokenCounterDoc = {
  _id: string;
  locationId: string;
  businessDate: string;
  sequence: number;
  createdAt: Date;
  updatedAt: Date;
};

const tokenCounterSchema = new Schema<TokenCounterDoc>({
  _id: { type: String, required: true },
  locationId: { type: String, required: true, maxlength: 64, index: true },
  businessDate: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/, index: true },
  sequence: { type: Number, required: true, min: 0, validate: Number.isSafeInteger },
}, { timestamps: true });

tokenCounterSchema.index({ locationId: 1, businessDate: 1 }, { unique: true });

export const TokenCounter: Model<TokenCounterDoc> =
  (mongoose.models.TokenCounter as Model<TokenCounterDoc> | undefined) ??
  mongoose.model<TokenCounterDoc>('TokenCounter', tokenCounterSchema);
