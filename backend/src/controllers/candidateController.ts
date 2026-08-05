import { Request, Response } from 'express';
import { AuthRequest } from '../middleware/authMiddleware';
import Candidate from '../models/Candidate';
import Job from '../models/Job';
import HR from '../models/HR';
import { sendInterviewInvitation } from '../services/emailService';
import { uploadToCloudinary } from '../services/cloudinaryService';
import { v4 as uuidv4 } from 'uuid';

// POST /api/candidates/schedule
export const scheduleCandidate = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { name, email, phone, jobId } = req.body;

    if (!name || !email || !jobId) {
      res.status(400).json({ success: false, message: 'Candidate name, email, and job ID are required' });
      return;
    }

    if (!req.file) {
      res.status(400).json({ success: false, message: 'Resume file is required' });
      return;
    }

    // Verify job belongs to this HR
    const job = await Job.findOne({ _id: jobId, hrId: req.hr!._id });
    if (!job) {
      res.status(404).json({ success: false, message: 'Job not found' });
      return;
    }

    // Check if candidate already scheduled for this job
    const existing = await Candidate.findOne({ email, jobId });
    if (existing) {
      res.status(409).json({ success: false, message: 'Candidate already scheduled for this position' });
      return;
    }

    // Upload resume to Cloudinary
    const cloudinaryResult = await uploadToCloudinary(req.file.buffer, {
      folder: 'ai-interview/resumes',
      resource_type: 'raw', // PDFs and Word docs are raw resources
    });

    // Generate unique verification token — valid for 48 hours (2 days)
    const verificationToken = uuidv4();
    const tokenExpiry = new Date(Date.now() + 48 * 60 * 60 * 1000);

    const candidate = await Candidate.create({
      hrId: req.hr!._id,
      jobId,
      name,
      email,
      phone: phone || '',
      resumeUrl: cloudinaryResult.url,
      resumeOriginalName: req.file.originalname,
      verificationToken,
      verificationTokenExpiry: tokenExpiry,
      status: 'SCHEDULED',
    });

    // Update job candidate count
    await Job.findByIdAndUpdate(jobId, { $inc: { totalCandidates: 1 } });

    // Get HR info for email
    const hr = await HR.findById(req.hr!._id);
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const verificationLink = `${frontendUrl}/interview/verify/${verificationToken}`;

    // Send invitation email
    await sendInterviewInvitation({
      to: email,
      candidateName: name,
      companyName: hr?.companyName || 'The Company',
      jobTitle: job.title,
      verificationLink,
    });

    // Update status to LINK_SENT
    await Candidate.findByIdAndUpdate(candidate._id, { status: 'LINK_SENT' });

    res.status(201).json({
      success: true,
      message: 'Candidate scheduled and invitation sent successfully',
      data: {
        candidate: {
          ...candidate.toObject(),
          status: 'LINK_SENT',
          verificationLink,
          linkExpiresAt: tokenExpiry.toISOString(),
        },
      },
    });
  } catch (error) {
    console.error('Schedule candidate error:', error);
    res.status(500).json({ success: false, message: 'Failed to schedule candidate' });
  }
};

// GET /api/candidates — List all candidates for this HR
export const getCandidates = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { jobId, status } = req.query;
    const filter: Record<string, unknown> = { hrId: req.hr!._id };
    if (jobId) filter.jobId = jobId;
    if (status) filter.status = status;

    const candidates = await Candidate.find(filter)
      .populate('jobId', 'title language department')
      .sort({ createdAt: -1 });

    res.json({ success: true, data: { candidates } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch candidates' });
  }
};

// GET /api/candidates/:id
export const getCandidate = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const candidate = await Candidate.findOne({ _id: req.params.id, hrId: req.hr!._id })
      .populate('jobId', 'title description language');
    if (!candidate) {
      res.status(404).json({ success: false, message: 'Candidate not found' });
      return;
    }
    res.json({ success: true, data: { candidate } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch candidate' });
  }
};

// POST /api/candidates/:id/resend-link
export const resendLink = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const candidate = await Candidate.findOne({ _id: req.params.id, hrId: req.hr!._id })
      .populate<{ jobId: { title: string } }>('jobId', 'title');
    if (!candidate) {
      res.status(404).json({ success: false, message: 'Candidate not found' });
      return;
    }

    if (candidate.status === 'COMPLETED') {
      res.status(400).json({ success: false, message: 'Interview already completed' });
      return;
    }

    // Generate a new token — valid for 48 hours (2 days)
    const newToken = uuidv4();
    const newExpiry = new Date(Date.now() + 48 * 60 * 60 * 1000);
    candidate.verificationToken = newToken;
    candidate.verificationTokenExpiry = newExpiry;
    candidate.status = 'LINK_SENT';
    await candidate.save();

    const hr = await HR.findById(req.hr!._id);
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const verificationLink = `${frontendUrl}/interview/verify/${newToken}`;

    await sendInterviewInvitation({
      to: candidate.email,
      candidateName: candidate.name,
      companyName: hr?.companyName || 'The Company',
      jobTitle: (candidate.jobId as unknown as { title: string }).title,
      verificationLink,
    });

    res.json({
      success: true,
      message: 'Invitation link resent successfully',
      data: {
        verificationLink,
        linkExpiresAt: newExpiry.toISOString(),
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to resend link' });
  }
};

// GET /api/interview/verify/:token — Public endpoint for candidate verification
export const verifyToken = async (req: Request, res: Response): Promise<void> => {
  try {
    const { token } = req.params;
    const { email } = req.body;

    const candidate = await Candidate.findOne({ verificationToken: token })
      .populate<{ jobId: { title: string; language: string; description: string } }>(
        'jobId',
        'title language description'
      )
      .populate<{ hrId: { companyName: string; companyLogo: string } }>(
        'hrId',
        'companyName companyLogo'
      );

    if (!candidate) {
      res.status(404).json({ success: false, message: 'Invalid verification link' });
      return;
    }

    if (candidate.verificationTokenExpiry < new Date()) {
      candidate.status = 'EXPIRED';
      await candidate.save();
      res.status(410).json({
        success: false,
        message: 'This interview link has expired (valid for 2 days). Please contact the HR to resend.',
        expiredAt: candidate.verificationTokenExpiry.toISOString(),
      });
      return;
    }

    if (candidate.status === 'COMPLETED') {
      res.status(400).json({ success: false, message: 'Interview has already been completed' });
      return;
    }

    if (candidate.status === 'IN_PROGRESS') {
      res.status(400).json({ success: false, message: 'Interview is already in progress' });
      return;
    }

    // Compute remaining time for UI feedback
    const msLeft = candidate.verificationTokenExpiry.getTime() - Date.now();
    const hoursLeft = Math.floor(msLeft / (1000 * 60 * 60));
    const minutesLeft = Math.floor((msLeft % (1000 * 60 * 60)) / (1000 * 60));

    // If email provided (verification step), validate it
    if (email) {
      if (candidate.email !== email.toLowerCase().trim()) {
        res.status(401).json({ success: false, message: 'Email does not match our records' });
        return;
      }

      res.json({
        success: true,
        message: 'Email verified successfully',
        data: {
          candidateName: candidate.name,
          jobTitle: (candidate.jobId as unknown as { title: string }).title,
          companyName: (candidate.hrId as unknown as { companyName: string }).companyName,
          companyLogo: (candidate.hrId as unknown as { companyLogo: string }).companyLogo,
          language: (candidate.jobId as unknown as { language: string }).language,
          requiresPhoto: !candidate.verificationPhotoUrl,
          linkExpiresAt: candidate.verificationTokenExpiry.toISOString(),
          hoursLeft,
          minutesLeft,
        },
      });
      return;
    }

    // Initial load — just confirm token is valid (don't reveal email)
    res.json({
      success: true,
      message: 'Token is valid',
      data: {
        candidateName: candidate.name,
        jobTitle: (candidate.jobId as unknown as { title: string }).title,
        companyName: (candidate.hrId as unknown as { companyName: string }).companyName,
        companyLogo: (candidate.hrId as unknown as { companyLogo: string }).companyLogo,
        linkExpiresAt: candidate.verificationTokenExpiry.toISOString(),
        hoursLeft,
        minutesLeft,
      },
    });
  } catch (error) {
    console.error('Verify token error:', error);
    res.status(500).json({ success: false, message: 'Verification failed' });
  }
};

// POST /api/interview/verify/:token/photo — Upload webcam photo to Cloudinary
export const uploadVerificationPhoto = async (req: Request, res: Response): Promise<void> => {
  try {
    const { token } = req.params;

    const candidate = await Candidate.findOne({ verificationToken: token });
    if (!candidate) {
      res.status(404).json({ success: false, message: 'Invalid token' });
      return;
    }

    if (!req.file) {
      res.status(400).json({ success: false, message: 'Photo is required' });
      return;
    }

    // Upload verification photo to Cloudinary
    const cloudinaryResult = await uploadToCloudinary(req.file.buffer, {
      folder: 'ai-interview/verifications',
      resource_type: 'image',
      format: 'jpg',
    });

    candidate.verificationPhotoUrl = cloudinaryResult.url;
    candidate.status = 'VERIFIED';
    candidate.verifiedAt = new Date();
    await candidate.save();

    res.json({
      success: true,
      message: 'Verification complete. You are ready to start the interview.',
      data: {
        candidateId: candidate._id,
        token: candidate.verificationToken,
      },
    });
  } catch (error) {
    console.error('Upload verification photo error:', error);
    res.status(500).json({ success: false, message: 'Failed to upload verification photo' });
  }
};

// GET /api/dashboard/stats
export const getDashboardStats = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const hrId = req.hr!._id;

    const [totalJobs, totalCandidates, statusCounts] = await Promise.all([
      Job.countDocuments({ hrId }),
      Candidate.countDocuments({ hrId }),
      Candidate.aggregate([
        { $match: { hrId } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
    ]);

    const statusMap: Record<string, number> = {};
    statusCounts.forEach((s) => { statusMap[s._id] = s.count; });

    const recentCandidates = await Candidate.find({ hrId })
      .populate('jobId', 'title')
      .sort({ createdAt: -1 })
      .limit(5);

    res.json({
      success: true,
      data: {
        stats: {
          totalJobs,
          totalCandidates,
          scheduled: statusMap['SCHEDULED'] || 0,
          linkSent: statusMap['LINK_SENT'] || 0,
          verified: statusMap['VERIFIED'] || 0,
          inProgress: statusMap['IN_PROGRESS'] || 0,
          completed: statusMap['COMPLETED'] || 0,
          expired: statusMap['EXPIRED'] || 0,
        },
        recentCandidates,
      },
    });
  } catch (error) {
    console.error('Dashboard stats error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch dashboard stats' });
  }
};
