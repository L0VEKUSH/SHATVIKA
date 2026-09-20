import mongoose, { Schema, type Model } from 'mongoose';

export interface RateLimitBucketRecord {
  keyHash: string;
  windowId: number;
  count: number;
  expiresAt: Date;
}

const rateLimitBucketSchema = new Schema<RateLimitBucketRecord>({
  keyHash: { type: String, required: true },
  windowId: { type: Number, required: true },
  count: { type: Number, required: true, min: 0 },
  expiresAt: { type: Date, required: true },
}, { timestamps: false });

rateLimitBucketSchema.index({ keyHash: 1, windowId: 1 }, { unique: true });
rateLimitBucketSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const RateLimitBucket: Model<RateLimitBucketRecord> =
  (mongoose.models.RateLimitBucket as Model<RateLimitBucketRecord> | undefined) ??
  mongoose.model<RateLimitBucketRecord>('RateLimitBucket', rateLimitBucketSchema);
