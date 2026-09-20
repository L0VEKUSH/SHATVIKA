import mongoose, { Schema, type Model } from 'mongoose';

export type AdminDoc = {
  _id: mongoose.Types.ObjectId;
  email: string;
  password: string;
  passwordVersion: number;
  role?: 'admin';
  permissions?: string[];
  isActive?: boolean;
  bootstrapMarker?: string;
  createdAt?: Date;
  updatedAt?: Date;
};

const adminSchema = new Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email address'],
      index: true,
    },
    password: { type: String, required: true, select: false },
    passwordVersion: { type: Number, default: 0, select: false },
    role: { type: String, enum: ['admin'], default: 'admin', immutable: true },
    permissions: { type: [String], default: ['*'] },
    isActive: { type: Boolean, default: true },
    // Sparse unique marker closes concurrent initial-bootstrap races.
    bootstrapMarker: { type: String, select: false },
  },
  { timestamps: true },
);

adminSchema.index({ bootstrapMarker: 1 }, { unique: true, sparse: true });

adminSchema.set('toJSON', {
  transform: (_doc, ret) => {
    const safe = ret as Record<string, unknown>;
    if (safe._id) safe.id = String(safe._id);
    delete safe._id;
    delete safe.password;
    delete safe.passwordVersion;
    delete safe.bootstrapMarker;
    delete safe.__v;
    return safe;
  },
});

export const Admin: Model<AdminDoc> =
  (mongoose.models.Admin as Model<AdminDoc> | undefined) ?? mongoose.model<AdminDoc>('Admin', adminSchema);

