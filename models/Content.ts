import mongoose, { Schema, type Model } from 'mongoose';

/* ── Shared toJSON transform ─────────────────────────────────── */
const toJSON = {
  transform: (_doc: unknown, ret: Record<string, unknown>) => {
    if (ret._id) ret.id = String(ret._id);
    delete ret._id;
    delete ret.__v;
    return ret;
  },
};

/* ── Feature ─────────────────────────────────────────────────── */
const featureSchema = new Schema(
  {
    title:       { type: String, required: true, trim: true },
    description: { type: String, required: true },
    emoji:       { type: String, required: true },
    gradient:    { type: String, required: true },
  },
  { timestamps: true }
);
featureSchema.set('toJSON', toJSON);

/* ── Stat ────────────────────────────────────────────────────── */
const statSchema = new Schema(
  {
    value: { type: String, required: true },
    label: { type: String, required: true },
    emoji: { type: String, required: true },
  },
  { timestamps: true }
);
statSchema.set('toJSON', toJSON);

/* ── TeamMember ──────────────────────────────────────────────── */
const teamMemberSchema = new Schema(
  {
    name:     { type: String, required: true, trim: true },
    role:     { type: String, required: true },
    emoji:    { type: String, required: true },
    gradient: { type: String, required: true },
  },
  { timestamps: true }
);
teamMemberSchema.set('toJSON', toJSON);

/* ── GalleryItem ─────────────────────────────────────────────── */
const galleryItemSchema = new Schema(
  {
    title: { type: String, required: true, trim: true, minlength: 1, maxlength: 120 },
    description: { type: String, trim: true, maxlength: 500, default: '' },
    category: {
      type: String,
      enum: ['Food', 'Restaurant', 'Team', 'Events'],
      default: 'Food',
      index: true,
    },
    imageUrl: { type: String, required: true, trim: true },
    imageType: {
      type: String,
      enum: ['image', 'video', 'youtube'],
      default: 'image',
    },
    youtubeId: { type: String, trim: true, default: null },
    featured: { type: Boolean, default: false, index: true },
    order: { type: Number, default: 0, index: true },
    // Legacy fields for backward compatibility
    label: { type: String, default: '' },
    emoji: { type: String, default: '' },
    gradient: { type: String, default: '' },
    tall: { type: Boolean, default: false },
  },
  { timestamps: true }
);
galleryItemSchema.set('toJSON', toJSON);

/* ── Exports ─────────────────────────────────────────────────── */
export const Feature: Model<any> =
  (mongoose.models.Feature as Model<any> | undefined) ??
  mongoose.model('Feature', featureSchema);

export const Stat: Model<any> =
  (mongoose.models.Stat as Model<any> | undefined) ??
  mongoose.model('Stat', statSchema);

export const TeamMember: Model<any> =
  (mongoose.models.TeamMember as Model<any> | undefined) ??
  mongoose.model('TeamMember', teamMemberSchema);

export const GalleryItem: Model<any> =
  (mongoose.models.GalleryItem as Model<any> | undefined) ??
  mongoose.model('GalleryItem', galleryItemSchema);
