import mongoose, { Schema, type Model } from 'mongoose';

export type ReviewStatus = 'pending' | 'approved' | 'rejected';

const reviewSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    rating: { type: Number, required: true, min: 1, max: 5 },

    // Overall experience text (when menuItemId is null)
    text: { type: String, trim: true, maxlength: 1000 },

    imageUrl: { type: String, required: false },

    // Private (never render publicly)
    email: { type: String, required: false, trim: true, maxlength: 120 },

    // null means overall experience
    menuItemId: { type: String, required: false, default: null },

    status: {
      type: String,
      required: true,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
      index: true,
    },
  },
  { timestamps: true }
);

reviewSchema.set('toJSON', {
  transform: (_doc, ret) => {
    // ret._id exists at runtime but mongoose's typings can be strict.
    const anyRet = ret as any;
    if (anyRet._id) anyRet.id = anyRet._id.toString();
    delete anyRet._id;
    return anyRet;
  },
});


// Keep model typing simple to avoid mongoose type duplication issues.
export const Review: Model<any> =
  (mongoose.models.Review as Model<any> | undefined) ?? mongoose.model('Review', reviewSchema);


