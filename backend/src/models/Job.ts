import mongoose, { Document, Schema } from 'mongoose';

export const SARVAM_LANGUAGES = [
  { code: 'en-IN', name: 'English (India)' },
  { code: 'hi-IN', name: 'Hindi' },
  { code: 'bn-IN', name: 'Bengali' },
  { code: 'gu-IN', name: 'Gujarati' },
  { code: 'kn-IN', name: 'Kannada' },
  { code: 'ml-IN', name: 'Malayalam' },
  { code: 'mr-IN', name: 'Marathi' },
  { code: 'od-IN', name: 'Odia' },
  { code: 'pa-IN', name: 'Punjabi' },
  { code: 'ta-IN', name: 'Tamil' },
  { code: 'te-IN', name: 'Telugu' },
] as const;

export type SarvamLanguageCode = typeof SARVAM_LANGUAGES[number]['code'];

export interface IInterviewSettings {
  maxQuestions: number;
  maxFaceWarnings: number;
  timeLimitMinutes: number;
}

export interface IJob extends Document {
  _id: mongoose.Types.ObjectId;
  hrId: mongoose.Types.ObjectId;
  title: string;
  department?: string;
  experienceLevel?: string;
  description: string;
  requirements?: string;
  preferredQuestions: string[];
  language: SarvamLanguageCode;
  isActive: boolean;
  totalCandidates: number;
  interviewSettings: IInterviewSettings;
  createdAt: Date;
  updatedAt: Date;
}

const JobSchema = new Schema<IJob>(
  {
    hrId: {
      type: Schema.Types.ObjectId,
      ref: 'HR',
      required: true,
    },
    title: {
      type: String,
      required: [true, 'Job title is required'],
      trim: true,
    },
    department: {
      type: String,
      default: '',
    },
    experienceLevel: {
      type: String,
      enum: ['Internship', 'Entry Level', 'Mid Level', 'Senior Level', 'Lead', 'Manager', 'Director', 'Executive', ''],
      default: '',
    },
    description: {
      type: String,
      required: [true, 'Job description is required'],
    },
    requirements: {
      type: String,
      default: '',
    },
    preferredQuestions: {
      type: [String],
      default: [],
    },
    language: {
      type: String,
      enum: SARVAM_LANGUAGES.map((l) => l.code),
      default: 'en-IN',
      required: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    totalCandidates: {
      type: Number,
      default: 0,
    },
    interviewSettings: {
      maxQuestions: { type: Number, default: 8, min: 4, max: 20 },
      maxFaceWarnings: { type: Number, default: 3, min: 1, max: 5 },
      timeLimitMinutes: { type: Number, default: 20, min: 10, max: 60 },
    },
  },
  { timestamps: true }
);

const Job = mongoose.model<IJob>('Job', JobSchema);
export default Job;
