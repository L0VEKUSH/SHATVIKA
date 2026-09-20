import mongoose, { Schema, type Model } from 'mongoose';

export type WorkerDoc = {
  _id: mongoose.Types.ObjectId;
  name: string;
  email: string;
  password: string;
  passwordVersion: number;
  role: 'worker';
  locationId: string;
  permissions: string[];
  isActive: boolean;
  createdAt?: Date;
  updatedAt?: Date;
};

const workerSchema = new Schema<WorkerDoc>({
  name: { type: String, required: true, trim: true, maxlength: 120 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 120, index: true },
  password: { type: String, required: true, select: false },
  passwordVersion: { type: Number, default: 0, select: false },
  role: { type: String, enum: ['worker'], default: 'worker', immutable: true },
  locationId: { type: String, required: true, trim: true, maxlength: 64, index: true },
  permissions: { type: [String], default: ['counter:operate'] },
  isActive: { type: Boolean, default: true, index: true },
}, { timestamps: true });

workerSchema.set('toJSON', {
  transform: (_document, returned) => {
    const row = returned as unknown as Record<string, unknown>;
    if (row._id) row.id = String(row._id);
    delete row._id;
    delete row.__v;
    delete row.password;
    delete row.passwordVersion;
    return row;
  },
});

export const Worker: Model<WorkerDoc> =
  (mongoose.models.Worker as Model<WorkerDoc> | undefined) ??
  mongoose.model<WorkerDoc>('Worker', workerSchema);
