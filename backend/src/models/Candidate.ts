import mongoose, { Document, Schema } from 'mongoose';

export type CandidateStatus = 'SCHEDULED' | 'LINK_SENT' | 'VERIFIED' | 'IN_PROGRESS' | 'COMPLETED' | 'EXPIRED';

export interface ITranscriptTurn {
  role: 'ai' | 'candidate';
  content: string;
  timestamp: Date;
}

export interface IEvaluationReport {
  overallScore: number;
  strengths: string[];
  weaknesses: string[];
  summary: string;
  recommendation: 'STRONGLY_RECOMMENDED' | 'RECOMMENDED' | 'NEUTRAL' | 'NOT_RECOMMENDED';
  generatedAt: Date;
}

export interface ICandidate extends Document {
  _id: mongoose.Types.ObjectId;
  hrId: mongoose.Types.ObjectId;
  jobId: mongoose.Types.ObjectId;
  name: string;
  email: string;
  phone?: string;
  resumeUrl: string;
  resumeOriginalName: string;
  verificationToken: string;
  verificationTokenExpiry: Date;
  verificationPhotoUrl?: string;
  status: CandidateStatus;
  transcript: ITranscriptTurn[];
  evaluationReport?: IEvaluationReport;
  scheduledAt: Date;
  verifiedAt?: Date;
  interviewStartedAt?: Date;
  interviewCompletedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const TranscriptTurnSchema = new Schema<ITranscriptTurn>(
  {
    role: { type: String, enum: ['ai', 'candidate'], required: true },
    content: { type: String, required: true },
    timestamp: { type: Date, default: Date.now },
  },
  { _id: false }
);

const EvaluationReportSchema = new Schema<IEvaluationReport>(
  {
    overallScore: { type: Number, min: 0, max: 10 },
    strengths: [String],
    weaknesses: [String],
    summary: String,
    recommendation: {
      type: String,
      enum: ['STRONGLY_RECOMMENDED', 'RECOMMENDED', 'NEUTRAL', 'NOT_RECOMMENDED'],
    },
    generatedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const CandidateSchema = new Schema<ICandidate>(
  {
    hrId: { type: Schema.Types.ObjectId, ref: 'HR', required: true },
    jobId: { type: Schema.Types.ObjectId, ref: 'Job', required: true },
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    phone: { type: String, default: '' },
    resumeUrl: { type: String, required: true },
    resumeOriginalName: { type: String, required: true },
    verificationToken: { type: String, required: true, unique: true },
    verificationTokenExpiry: { type: Date, required: true },
    verificationPhotoUrl: { type: String },
    status: {
      type: String,
      enum: ['SCHEDULED', 'LINK_SENT', 'VERIFIED', 'IN_PROGRESS', 'COMPLETED', 'EXPIRED'],
      default: 'SCHEDULED',
    },
    transcript: [TranscriptTurnSchema],
    evaluationReport: EvaluationReportSchema,
    scheduledAt: { type: Date, default: Date.now },
    verifiedAt: Date,
    interviewStartedAt: Date,
    interviewCompletedAt: Date,
  },
  { timestamps: true }
);

// Index for token lookups
CandidateSchema.index({ verificationToken: 1 });
CandidateSchema.index({ email: 1, jobId: 1 });

const Candidate = mongoose.model<ICandidate>('Candidate', CandidateSchema);
export default Candidate;
