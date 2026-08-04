import { Router } from 'express';
import { getProfile, updateProfile } from '../controllers/hrController';
import { protect } from '../middleware/authMiddleware';
import { uploadLogo } from '../middleware/uploadMiddleware';

const router = Router();

router.use(protect);

router.get('/profile', getProfile);
router.put('/profile', uploadLogo, updateProfile);

export default router;
