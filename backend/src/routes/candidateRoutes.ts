import { Router } from 'express';
import { protect } from '../middleware/authMiddleware';
import { uploadResume, uploadVerificationPhoto } from '../middleware/uploadMiddleware';
import {
  scheduleCandidate,
  getCandidates,
  getCandidate,
  resendLink,
  verifyToken,
  uploadVerificationPhoto as uploadVerificationPhotoController,
  getDashboardStats,
} from '../controllers/candidateController';

const router = Router();

// Protected HR routes
router.get('/dashboard/stats', protect, getDashboardStats);
router.post('/schedule', protect, uploadResume, scheduleCandidate);
router.get('/', protect, getCandidates);
router.get('/:id', protect, getCandidate);
router.post('/:id/resend-link', protect, resendLink);

// Public interview routes (no auth - candidate facing)
router.post('/verify/:token', verifyToken);
router.post('/verify/:token/photo', uploadVerificationPhoto, uploadVerificationPhotoController);

export default router;
