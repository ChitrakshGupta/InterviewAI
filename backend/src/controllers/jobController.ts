import { Response } from 'express';
import { AuthRequest } from '../middleware/authMiddleware';
import Job from '../models/Job';
import Candidate from '../models/Candidate';

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

    const job = await Job.create({
      hrId: req.hr!._id,
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
    const jobs = await Job.find({ hrId: req.hr!._id }).sort({ createdAt: -1 });

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
    const job = await Job.findOne({ _id: req.params.id, hrId: req.hr!._id });
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
    const job = await Job.findOneAndUpdate(
      { _id: req.params.id, hrId: req.hr!._id },
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
    const job = await Job.findOneAndDelete({ _id: req.params.id, hrId: req.hr!._id });
    if (!job) {
      res.status(404).json({ success: false, message: 'Job not found' });
      return;
    }
    res.json({ success: true, message: 'Job deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to delete job' });
  }
};
