import mongoose, { Document, Schema } from 'mongoose';
import bcrypt from 'bcryptjs';

export interface IHR extends Document {
  _id: mongoose.Types.ObjectId;
  name: string;
  email: string;
  password: string;
  companyName: string;
  companyLogo?: string;
  companyLogoPublicId?: string;
  companyDescription?: string;
  website?: string;
  industry?: string;
  companySize?: string;
  location?: string;
  profileComplete: boolean;
  isVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
  comparePassword(candidatePassword: string): Promise<boolean>;
}

const HRSchema = new Schema<IHR>(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: 8,
      select: false,
    },
    companyName: {
      type: String,
      default: '',
      trim: true,
    },
    companyLogo: {
      type: String,
      default: '',
    },
    companyLogoPublicId: {
      type: String,
      default: '',
    },
    companyDescription: {
      type: String,
      default: '',
    },
    website: {
      type: String,
      default: '',
    },
    industry: {
      type: String,
      default: '',
    },
    companySize: {
      type: String,
      enum: ['1-10', '11-50', '51-200', '201-500', '501-1000', '1000+', ''],
      default: '',
    },
    location: {
      type: String,
      default: '',
    },
    profileComplete: {
      type: Boolean,
      default: false,
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

// Native MongoDB Partial TTL index to clean up unverified users after 24 hours (86400s)
HRSchema.index(
  { createdAt: 1 },
  {
    expireAfterSeconds: 86400,
    partialFilterExpression: { isVerified: false },
  }
);

// Hash password before save
HRSchema.pre<IHR>('save', async function (next) {
  if (!this.isModified('password')) return next();
  const salt = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Instance method to compare passwords
HRSchema.methods.comparePassword = async function (candidatePassword: string): Promise<boolean> {
  return bcrypt.compare(candidatePassword, this.password);
};

const HR = mongoose.model<IHR>('HR', HRSchema);
export default HR;
