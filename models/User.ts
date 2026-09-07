import mongoose, { Schema, type Model } from 'mongoose';

export type UserDoc = {
  _id: mongoose.Types.ObjectId;
  email: string;
  password: string;
  passwordVersion: number;
  fullName: string;
  phone?: string;
  profilePhoto?: string;
  addresses?: Array<{
    label: string;
    street: string;
    city: string;
    state: string;
    zipCode: string;
    phone: string;
    isDefault: boolean;
  }>;
  savedPaymentMethods?: Array<{
    id: string;
    type: 'card' | 'upi' | 'wallet';
    lastFour: string;
  }>;
  cart?: {
    items?: Array<{
      menuItemId: string;
      variantId: string;
      quantity: number;
    }>;
    couponCode?: string;
    lastUpdated?: Date;
  };
  joinedDate: Date;
  preference?: {
    currency: string;
    language: string;
  };
  createdAt?: Date;
  updatedAt?: Date;
};


const cartItemSchema = new Schema(
  {
    menuItemId: { type: mongoose.Schema.Types.ObjectId, ref: 'MenuItem', required: true },
    variantId: { type: String, required: true },
    quantity: { type: Number, required: true, min: 1 },
  },
  { _id: false }
);

const cartSchema = new Schema(
  {
    items: { type: [cartItemSchema], default: [] },
    couponCode: { type: String, default: null, trim: true },
    lastUpdated: { type: Date, default: Date.now },
  },
  { _id: false }
);



const addressSchema = new Schema(
  {
    label: { type: String, required: true, trim: true },
    street: { type: String, required: true, trim: true },
    city: { type: String, required: true, trim: true },
    state: { type: String, required: true, trim: true },
    zipCode: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },
    isDefault: { type: Boolean, default: false },
  },
  { timestamps: false }
);

const paymentMethodSchema = new Schema(
  {
    id: { type: String, required: true },
    type: { type: String, enum: ['card', 'upi', 'wallet'], required: true },
    lastFour: { type: String, required: true, trim: true },
  },
  { _id: false }
);

const preferenceSchema = new Schema(
  {
    currency: { type: String, default: 'INR' },
    language: { type: String, default: 'EN' },
  },
  { _id: false }
);

const userSchema = new Schema(
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
    passwordResetToken: { type: String, default: null, select: false },
    passwordResetExpires: { type: Date, default: null, select: false },
    // Incremented when password changes; used in fingerprint to invalidate old tokens
    passwordVersion: { type: Number, default: 0 },
    fullName: { type: String, required: true, trim: true },
    phone: {
      type: String,
      trim: true,
      minlength: 10,
      maxlength: 15,
      index: true,
    },
    profilePhoto: { type: String, default: null },
    addresses: { type: [addressSchema], default: [] },
    savedPaymentMethods: { type: [paymentMethodSchema], default: [] },
    cart: { type: cartSchema, default: () => ({ items: [] }) },
    joinedDate: { type: Date, default: Date.now },
    preference: { type: preferenceSchema, default: () => ({}) },
  },
  { timestamps: true }

);

// Enforce single default address per user
userSchema.pre('save', function(this: any, next: any) {
  if (this.addresses && this.addresses.length > 0) {
    const defaultAddresses = this.addresses.filter((a: any) => a.isDefault);
    
    if (defaultAddresses.length > 1) {
      // Keep only first as default, reset others
      this.addresses.forEach((addr: any, idx: number) => {
        addr.isDefault = idx === 0;
      });
    } else if (defaultAddresses.length === 0 && this.addresses.length > 0) {
      // No default set, make first one default
      this.addresses[0].isDefault = true;
    }
  }
  next();
});


userSchema.set('toJSON', {
  transform: (_doc, ret) => {
    const anyRet = ret as any;
    if (anyRet._id) anyRet.id = anyRet._id.toString();
    delete anyRet._id;
    delete anyRet.password;
    delete anyRet.passwordVersion;
    delete anyRet.__v;
    return anyRet;
  },
});

// Indexes for common queries
userSchema.index({ email: 1 });
userSchema.index({ phone: 1 });
userSchema.index({ createdAt: -1 });

export const User: Model<any> =
  (mongoose.models.User as Model<any> | undefined) ?? mongoose.model('User', userSchema);
