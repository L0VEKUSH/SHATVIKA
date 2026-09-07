import mongoose, { Schema, type Model } from 'mongoose';

export type ReviewStatus = 'pending' | 'approved' | 'rejected';

const reviewSchema = new Schema(
  {
    title: { type: String, trim: true, maxlength: 100 },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    rating: { type: Number, required: true, min: 1, max: 5 },
    text: { type: String, trim: true, maxlength: 1000 },

    // Image URLs - imageUrl is the primary single image for backward compatibility
    imageUrl: { type: String, default: null },
    mediaUrls: [{ type: String }], // Array of image/video URLs

    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', default: null },

    isAnonymous: { type: Boolean, default: false },
    verifiedPurchase: { type: Boolean, default: false },
    helpfulCount: { type: Number, default: 0 },
    helpfulVoters: [{ type: String }],

    // Private (never render publicly)
    email: { type: String, trim: true, maxlength: 120, index: true },

    // null means overall experience
    menuItemId: { type: mongoose.Schema.Types.ObjectId, ref: 'MenuItem', default: null },

    status: {
      type: String,
      required: true,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
      index: true,
    },

    // Admin reply fields
    replyBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
    replyText: { type: String, default: null, trim: true },
    replyDate: { type: Date, default: null },
  },
  { timestamps: true }
);

reviewSchema.set('toJSON', {
  transform: (_doc, ret) => {
    const anyRet = ret as any;
    if (anyRet._id) anyRet.id = anyRet._id.toString();
    delete anyRet._id;
    return anyRet;
  },
});

// Indexes for common review queries
reviewSchema.index({ menuItemId: 1, status: 1 });
reviewSchema.index({ userId: 1 });
reviewSchema.index({ orderId: 1 });

// Keep model typing simple to avoid mongoose type duplication issues.
export const Review: Model<any> =
  (mongoose.models.Review as Model<any> | undefined) ?? mongoose.model('Review', reviewSchema);
