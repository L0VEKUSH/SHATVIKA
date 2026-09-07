import mongoose, { Schema, type Model } from 'mongoose';

export type AdminDoc = {
  _id: mongoose.Types.ObjectId;
  email: string;
  password: string;
  passwordVersion: number;
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
    // bcrypt hash string
    password: { type: String, required: true },
    // Incremented when password changes; used in fingerprint to invalidate old tokens
    passwordVersion: { type: Number, default: 0 },
  },
  { timestamps: true }
);

adminSchema.set('toJSON', {
  transform: (_doc, ret) => {
    const anyRet = ret as any;
    if (anyRet._id) anyRet.id = anyRet._id.toString();
    delete anyRet._id;
    delete anyRet.password;
    return anyRet;
  },
});

export const Admin: Model<any> =
  (mongoose.models.Admin as Model<any> | undefined) ??
  mongoose.model('Admin', adminSchema);

