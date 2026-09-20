import mongoose, { Schema, type Model } from 'mongoose';

export type MediaAssetScope = 'review' | 'admin-gallery';
export type MediaAssetStatus = 'active' | 'deleting' | 'deleted';

const mediaAssetSchema = new Schema(
  {
    provider: { type: String, enum: ['cloudinary'], required: true, immutable: true },
    publicId: { type: String, required: true, immutable: true, select: false },
    url: { type: String, required: true, immutable: true },
    resourceType: { type: String, enum: ['image', 'video'], required: true, immutable: true },
    mimeType: {
      type: String,
      enum: ['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm'],
      required: true,
      immutable: true,
    },
    bytes: { type: Number, required: true, min: 1, immutable: true },
    scope: { type: String, enum: ['review', 'admin-gallery'], required: true, immutable: true },
    ownerType: { type: String, enum: ['customer', 'admin'], required: true, immutable: true },
    ownerId: { type: String, required: true, immutable: true },
    status: { type: String, enum: ['active', 'deleting', 'deleted'], default: 'active', index: true },
    linkedResourceType: { type: String, enum: ['review', 'gallery', null], default: null },
    linkedResourceId: { type: String, default: null },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

mediaAssetSchema.index({ provider: 1, publicId: 1 }, { unique: true });
mediaAssetSchema.index({ ownerType: 1, ownerId: 1, scope: 1, status: 1, createdAt: -1 });
mediaAssetSchema.index({ linkedResourceType: 1, linkedResourceId: 1 }, { sparse: true });

mediaAssetSchema.set('toJSON', {
  transform: (_document, returned) => {
    const safe = returned as Record<string, unknown>;
    if (safe._id) safe.id = String(safe._id);
    delete safe._id;
    delete safe.publicId;
    delete safe.ownerId;
    delete safe.__v;
    return safe;
  },
});

export const MediaAsset: Model<any> =
  (mongoose.models.MediaAsset as Model<any> | undefined) ?? mongoose.model('MediaAsset', mediaAssetSchema);
