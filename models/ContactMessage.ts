import mongoose, { Schema, type Model } from 'mongoose';

const contactMessageSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    email: { type: String, required: true, trim: true, lowercase: true, maxlength: 120 },
    phone: { type: String, trim: true, maxlength: 20, default: '' },
    subject: { type: String, trim: true, maxlength: 120, default: 'General Inquiry' },
    message: { type: String, required: true, trim: true, maxlength: 2000 },
    status: { type: String, enum: ['new', 'read', 'replied'], default: 'new', index: true },
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

export const ContactMessage: Model<any> =
  (mongoose.models.ContactMessage as Model<any> | undefined) ??
  mongoose.model('ContactMessage', contactMessageSchema);
