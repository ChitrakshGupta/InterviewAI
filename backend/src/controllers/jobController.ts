import { Response } from 'express';
import { AuthRequest } from '../middleware/authMiddleware';
import Job from '../models/Job';
import Candidate from '../models/Candidate';
import mongoose from 'mongoose';

/**
 * Returns the set of hrIds that belong to the same organization as the caller.
 * For owners: all their own sub-HRs + themselves.
 * For members: the owner + all sibling members (via organizationId).
 *
 * This ensures sub-HRs can see org-wide jobs/candidates, not just their own.
 */
const getOrgHrIds = async (hr: AuthRequest['hr']): Promise<mongoose.Types.ObjectId[]> => {
  if (!hr) return [];

  // Owners created before IAM: organizationId may be null — self-heal with their own _id
  const orgId = hr.organizationId ?? hr._id;

  if (hr.role === 'owner') {
    // Return owner _id + all member _ids in this org
    const { default: HR } = await import('../models/HR');
    const members = await HR.find({ organizationId: orgId }).select('_id');
    const ids = members.map((m) => m._id as mongoose.Types.ObjectId);
    // Include the owner's own _id (in case org members only contain sub-HRs)
    if (!ids.some((id) => id.equals(hr._id))) {
      ids.unshift(hr._id);
    }
    return ids;
  } else {
    // Member: return all hrIds in the org (owner + other members)
    const { default: HR } = await import('../models/HR');
    const members = await HR.find({ organizationId: orgId }).select('_id');
    // Also include the owner's _id (stored as organizationId for owner-scoped records)
    return [...members.map((m) => m._id as mongoose.Types.ObjectId), orgId as mongoose.Types.ObjectId];
  }
};

// POST /api/jobs
export const createJob = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const {
      title,
      department,
      experienceLevel,
      description,
      requirements,
      preferredQuestions,
      language,
      interviewSettings,
    } = req.body;

    if (!title || !description) {
      res.status(400).json({ success: false, message: 'Job title and description are required' });
      return;
    }

    // Sub-HRs create jobs under the organization owner's hrId for unified scoping
    const ownerHrId = req.hr!.role === 'owner'
      ? req.hr!._id
      : (req.hr!.organizationId ?? req.hr!._id);

    const job = await Job.create({
      hrId: ownerHrId,
      title,
      department: department || '',
      experienceLevel: experienceLevel || '',
      description,
      requirements: requirements || '',
      preferredQuestions: Array.isArray(preferredQuestions) ? preferredQuestions : [],
      language: language || 'en-IN',
      interviewSettings: interviewSettings || {},
    });

    res.status(201).json({
      success: true,
      message: 'Job created successfully',
      data: { job },
    });
  } catch (error) {
    console.error('Create job error:', error);
    if (error && (error as any).name === 'ValidationError') {
      const messages = Object.values((error as any).errors).map((err: any) => err.message);
      res.status(400).json({ success: false, message: messages.join(', ') });
      return;
    }
    res.status(500).json({ success: false, message: 'Failed to create job' });
  }
};

// GET /api/jobs
export const getJobs = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const orgHrIds = await getOrgHrIds(req.hr);
    const jobs = await Job.find({ hrId: { $in: orgHrIds } }).sort({ createdAt: -1 });

    // Enrich with candidate counts
    const jobsWithCounts = await Promise.all(
      jobs.map(async (job) => {
        const counts = await Candidate.aggregate([
          { $match: { jobId: job._id } },
          { $group: { _id: '$status', count: { $sum: 1 } } },
        ]);
        const statusMap: Record<string, number> = {};
        counts.forEach((c) => { statusMap[c._id] = c.count; });
        return { ...job.toObject(), candidateStats: statusMap };
      })
    );

    res.json({ success: true, data: { jobs: jobsWithCounts } });
  } catch (error) {
    console.error('Get jobs error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch jobs' });
  }
};

// GET /api/jobs/:id
export const getJob = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const orgHrIds = await getOrgHrIds(req.hr);
    const job = await Job.findOne({ _id: req.params.id, hrId: { $in: orgHrIds } });
    if (!job) {
      res.status(404).json({ success: false, message: 'Job not found' });
      return;
    }
    const candidates = await Candidate.find({ jobId: job._id }).sort({ createdAt: -1 });
    res.json({ success: true, data: { job, candidates } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch job' });
  }
};

// PUT /api/jobs/:id
export const updateJob = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const orgHrIds = await getOrgHrIds(req.hr);
    const job = await Job.findOneAndUpdate(
      { _id: req.params.id, hrId: { $in: orgHrIds } },
      req.body,
      { new: true }
    );
    if (!job) {
      res.status(404).json({ success: false, message: 'Job not found' });
      return;
    }
    res.json({ success: true, message: 'Job updated successfully', data: { job } });
  } catch (error) {
    console.error('Update job error:', error);
    if (error && (error as any).name === 'ValidationError') {
      const messages = Object.values((error as any).errors).map((err: any) => err.message);
      res.status(400).json({ success: false, message: messages.join(', ') });
      return;
    }
    res.status(500).json({ success: false, message: 'Failed to update job' });
  }
};

// DELETE /api/jobs/:id
export const deleteJob = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const orgHrIds = await getOrgHrIds(req.hr);
    const job = await Job.findOneAndDelete({ _id: req.params.id, hrId: { $in: orgHrIds } });
    if (!job) {
      res.status(404).json({ success: false, message: 'Job not found' });
      return;
    }
    res.json({ success: true, message: 'Job deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to delete job' });
  }
};
