import { Router } from 'express';
import { register, login, getMe, verifyEmail, resendVerification, setFirstPassword } from '../controllers/authController';
import { protect } from '../middleware/authMiddleware';

const router = Router();

router.post('/register', register);
router.post('/login', login);
router.post('/verify-email', verifyEmail);
router.post('/resend-verification', resendVerification);
router.post('/set-password', setFirstPassword);
router.get('/me', protect, getMe);

export default router;
