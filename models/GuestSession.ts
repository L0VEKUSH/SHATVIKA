import mongoose, { Schema, type Model } from 'mongoose';

const guestSessionSchema = new Schema(
  {
    tokenHash: {
      type: String,
      required: true,
      unique: true,
      minlength: 64,
      maxlength: 64,
      select: false,
    },
    expiresAt: { type: Date, required: true },
    lastSeenAt: { type: Date, required: true, default: Date.now },
    revokedAt: { type: Date, default: null },
    claimedByUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    claimedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

// MongoDB removes expired bearer records without application cleanup. The
// cookie uses the same lifetime, while explicit logout/claim revokes early.
guestSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

guestSessionSchema.set('toJSON', {
  transform: (_doc, ret) => {
    const value = ret as Record<string, unknown>;
    if (value._id) value.id = String(value._id);
    delete value._id;
    delete value.__v;
    delete value.tokenHash;
    return value;
  },
});

export const GuestSession: Model<any> =
  (mongoose.models.GuestSession as Model<any> | undefined) ??
  mongoose.model('GuestSession', guestSessionSchema);
