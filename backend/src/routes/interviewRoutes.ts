import { Router } from 'express';
import {
  startInterview,
  processTurn,
  endInterview,
  getInterviewStatus,
  recordFaceWarning,
  uploadAudio,
} from '../controllers/interviewController';

const router = Router();

// All routes are public — candidate-facing, authenticated by session token in URL
router.post('/start/:token', startInterview);
router.post('/turn/:token', uploadAudio, processTurn);
router.post('/end/:token', endInterview);
router.get('/status/:token', getInterviewStatus);
router.post('/face-warning/:token', recordFaceWarning);

export default router;
