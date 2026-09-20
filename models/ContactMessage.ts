import mongoose, { Schema, type Model } from 'mongoose';

export type ContactMessageDoc = {
  _id: mongoose.Types.ObjectId;
  name: string;
  email: string;
  phone: string;
  subject: 'order' | 'feedback' | 'catering' | 'press' | 'other';
  message: string;
  status: 'new' | 'read' | 'replied';
  adminNote?: string | null;
  handledAt?: Date | null;
  handledBy?: mongoose.Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
};

const contactMessageSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    email: { type: String, required: true, trim: true, lowercase: true, maxlength: 120 },
    phone: { type: String, trim: true, maxlength: 20, default: '' },
    subject: { type: String, trim: true, maxlength: 120, default: 'General Inquiry' },
    message: { type: String, required: true, trim: true, maxlength: 2000 },
    status: { type: String, enum: ['new', 'read', 'replied'], default: 'new', index: true },
    adminNote: { type: String, trim: true, maxlength: 1000, default: null },
    handledAt: { type: Date, default: null },
    handledBy: { type: Schema.Types.ObjectId, ref: 'Admin', default: null },
  },
  { timestamps: true }
);

contactMessageSchema.set('toJSON', {
  transform: (_doc, ret) => {
    const anyRet = ret as Record<string, unknown>;
    if (anyRet._id) anyRet.id = String(anyRet._id);
    delete anyRet._id;
    delete anyRet.__v;
    return anyRet;
  },
});

export const ContactMessage: Model<ContactMessageDoc> =
  (mongoose.models.ContactMessage as Model<ContactMessageDoc> | undefined) ??
  mongoose.model<ContactMessageDoc>('ContactMessage', contactMessageSchema);
