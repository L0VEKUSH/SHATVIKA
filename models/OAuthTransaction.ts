import mongoose, { Schema, type Model } from 'mongoose';

const oauthTransactionSchema = new Schema(
  {
    stateHash: { type: String, required: true, unique: true, minlength: 64, maxlength: 64, select: false },
    codeVerifier: { type: String, required: true, select: false },
    nonce: { type: String, required: true, select: false },
    provider: { type: String, enum: ['google'], required: true },
    purpose: { type: String, enum: ['signin', 'link'], required: true },
    returnTo: { type: String, required: true, default: '/' },
    linkUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    guestSessionId: { type: Schema.Types.ObjectId, ref: 'GuestSession', default: null },
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

oauthTransactionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const OAuthTransaction: Model<any> =
  (mongoose.models.OAuthTransaction as Model<any> | undefined) ??
  mongoose.model('OAuthTransaction', oauthTransactionSchema);
