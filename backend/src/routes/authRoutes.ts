/**
 * authRoutes.ts — Simplified for Clerk authentication.
 *
 * Removed:
 *   POST /register       — Clerk handles user creation via SDK
 *   POST /login          — Clerk handles sign-in via SDK
 *   POST /verify-email   — Clerk handles email verification
 *   POST /resend-verification — Clerk handles resending
 *   POST /set-password   — Clerk handles password management
 *
 * Kept:
 *   GET /me — Returns the HR profile from MongoDB, identified via Clerk token.
 *             Used by the frontend AuthContext to load app-specific profile data.
 */
import { Router } from 'express';
import { getMe } from '../controllers/authController';
import { protect } from '../middleware/authMiddleware';

const router = Router();

// Returns the MongoDB HR profile for the currently authenticated Clerk user
router.get('/me', protect, getMe);

export default router;
