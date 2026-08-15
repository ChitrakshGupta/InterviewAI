import mongoose, { Document, Schema } from 'mongoose';
import bcrypt from 'bcryptjs';

export type HRRole = 'owner' | 'member';

export const IAM_PERMISSIONS = [
  'view_jobs',
  'manage_jobs',
  'schedule_interviews',
  'view_candidates',
  'view_reports',
  'manage_team',
] as const;

export type IAMPermission = typeof IAM_PERMISSIONS[number];

export interface IHR extends Document {
  _id: mongoose.Types.ObjectId;
  /** Clerk's user ID — primary key for session-to-DB lookups */
  clerkUserId?: string;
  name: string;
  email: string;
  /** Optional: Clerk owns credentials; kept for legacy migration only */
  password?: string;
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
  role: HRRole;
  permissions: IAMPermission[];
  parentHrId?: mongoose.Types.ObjectId;
  organizationId?: mongoose.Types.ObjectId;
  mustChangePassword: boolean;
  createdAt: Date;
  updatedAt: Date;
  comparePassword(candidatePassword: string): Promise<boolean>;
}

const HRSchema = new Schema<IHR>(
  {
    /** Clerk user ID — used to look up the HR profile from a Clerk session token */
    clerkUserId: {
      type: String,
      index: true,
      sparse: true,   // allows multiple docs with no clerkUserId (legacy)
      default: null,
    },
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
    /** Optional — Clerk manages credentials; kept for legacy migration */
    password: {
      type: String,
      required: false,
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
    role: {
      type: String,
      enum: ['owner', 'member'],
      default: 'owner',
    },
    permissions: {
      type: [String],
      default: [],
    },
    parentHrId: {
      type: Schema.Types.ObjectId,
      ref: 'HR',
      default: null,
    },
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: 'HR',
      default: null,
    },
    mustChangePassword: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

// Native MongoDB Partial TTL index — cleans up self-registered unverified owners after 24h.
// Invited members (role: 'member') are pre-verified so they are NOT affected.
HRSchema.index(
  { createdAt: 1 },
  {
    expireAfterSeconds: 86400,
    partialFilterExpression: { isVerified: false, role: 'owner' },
  }
);

// Hash password before save (only for legacy local-auth accounts)
HRSchema.pre<IHR>('save', async function (next) {
  if (!this.isModified('password') || !this.password) return next();
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
