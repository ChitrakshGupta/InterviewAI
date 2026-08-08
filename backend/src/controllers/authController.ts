import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import HR from '../models/HR';
import {
  generateRawToken,
  hashToken,
  storeVerificationToken,
  getVerificationUserId,
  deleteVerificationToken,
  setResendCooldown,
  checkResendCooldown,
} from '../services/tokenService';
import { sendHRVerificationEmail } from '../services/emailService';

const generateToken = (id: string): string => {
  return jwt.sign({ id }, process.env.JWT_SECRET as string, {
    expiresIn: process.env.JWT_EXPIRES_IN as any,
  });
};

// POST /api/auth/register
export const register = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, email, password, companyName } = req.body;

    if (!name || !email || !password) {
      res.status(400).json({ success: false, message: 'Name, email and password are required' });
      return;
    }

    const existingHR = await HR.findOne({ email });
    if (existingHR) {
      res.status(409).json({ success: false, message: 'An account with this email already exists' });
      return;
    }

    // Step 1: Save owner account — organizationId will be set to own _id after creation
    const hr = await HR.create({
      name,
      email,
      password,
      companyName: companyName || '',
      isVerified: false,
      role: 'owner',
      permissions: [],
    });

    // Self-reference as organization root
    hr.organizationId = hr._id;
    await hr.save();

    const userId = hr._id.toString();

    // Step 2: Generate CSPRNG rawToken & SHA-256 hashedToken
    const rawToken = generateRawToken();
    const hashedToken = hashToken(rawToken);

    // Step 3: Store verify:<hashedToken> -> userId in Redis (30 mins EX 1800)
    await storeVerificationToken(hashedToken, userId, 1800);

    // Set user:<userId>:resend_cooldown -> 1 in Redis (2 mins EX 120)
    await setResendCooldown(userId, 120);

    // Step 4: Send Email containing rawToken link
    await sendHRVerificationEmail(hr.email, hr.name, rawToken);

    res.status(201).json({
      success: true,
      message: 'Account created! Please check your email to verify your account.',
      data: {
        requiresVerification: true,
        email: hr.email,
      },
    });
  } catch (error: unknown) {
    console.error('Register error:', error);
    res.status(500).json({ success: false, message: 'Server error during registration' });
  }
};

// POST /api/auth/verify-email
export const verifyEmail = async (req: Request, res: Response): Promise<void> => {
  try {
    const { token } = req.body; // rawToken from frontend

    if (!token) {
      res.status(400).json({ success: false, message: 'Verification token is required' });
      return;
    }

    // Step 5: Backend hashes token & looks up verify:<hashedToken> in Redis
    const hashedToken = hashToken(token);
    const userId = await getVerificationUserId(hashedToken);

    if (!userId) {
      res.status(400).json({
        success: false,
        message: 'Invalid or expired verification token. Please request a new verification email.',
      });
      return;
    }

    const hr = await HR.findById(userId);
    if (!hr) {
      res.status(404).json({ success: false, message: 'User not found' });
      return;
    }

    // Step 6: Update MongoDB isVerified = true, delete verify:<hashedToken> key from Redis
    hr.isVerified = true;
    await hr.save();

    await deleteVerificationToken(hashedToken);

    // Generate JWT token for successful login
    const jwtToken = generateToken(hr._id.toString());

    res.json({
      success: true,
      message: 'Email address verified successfully!',
      data: {
        token: jwtToken,
        hr: {
          id: hr._id,
          name: hr.name,
          email: hr.email,
          companyName: hr.companyName,
          companyLogo: hr.companyLogo,
          profileComplete: hr.profileComplete,
          isVerified: hr.isVerified,
          role: hr.role,
          permissions: hr.permissions,
        },
      },
    });
  } catch (error: unknown) {
    console.error('Verify email error:', error);
    res.status(500).json({ success: false, message: 'Server error during email verification' });
  }
};

// POST /api/auth/resend-verification
export const resendVerification = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email } = req.body;

    if (!email) {
      res.status(400).json({ success: false, message: 'Email address is required' });
      return;
    }

    const hr = await HR.findOne({ email });
    if (!hr) {
      // Don't leak existence
      res.json({ success: true, message: 'If an account exists, a new verification link has been sent.' });
      return;
    }

    if (hr.isVerified) {
      res.status(400).json({ success: false, message: 'Account is already verified. Please log in.' });
      return;
    }

    const userId = hr._id.toString();

    // Check 2-minute resend cooldown
    const isCoolingDown = await checkResendCooldown(userId);
    if (isCoolingDown) {
      res.status(429).json({
        success: false,
        message: 'Please wait 2 minutes before requesting another verification email.',
      });
      return;
    }

    // Generate new CSPRNG rawToken & hashedToken
    const rawToken = generateRawToken();
    const hashedToken = hashToken(rawToken);

    // Store in Redis (30 mins EX 1800) & set 2-min cooldown (EX 120)
    await storeVerificationToken(hashedToken, userId, 1800);
    await setResendCooldown(userId, 120);

    // Send email
    await sendHRVerificationEmail(hr.email, hr.name, rawToken);

    res.json({
      success: true,
      message: 'A new verification link has been sent to your email address.',
    });
  } catch (error: unknown) {
    console.error('Resend verification error:', error);
    res.status(500).json({ success: false, message: 'Server error during resend verification' });
  }
};

// POST /api/auth/login
export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({ success: false, message: 'Email and password are required' });
      return;
    }

    const hr = await HR.findOne({ email }).select('+password');
    if (!hr) {
      res.status(401).json({ success: false, message: 'Invalid credentials' });
      return;
    }

    const isMatch = await hr.comparePassword(password);
    if (!isMatch) {
      res.status(401).json({ success: false, message: 'Invalid credentials' });
      return;
    }

    // Require email verification before logging in
    if (!hr.isVerified) {
      res.status(403).json({
        success: false,
        requiresVerification: true,
        message: 'Please verify your email address before logging in.',
        email: hr.email,
      });
      return;
    }

    // Sub-HR must change their temp password on first login
    if (hr.mustChangePassword) {
      // Issue a short-lived temp token only usable on /auth/set-password
      const tempToken = jwt.sign(
        { id: hr._id.toString(), scope: 'set_password' },
        process.env.JWT_SECRET as string,
        { expiresIn: '15m' }
      );
      res.status(200).json({
        success: true,
        mustChangePassword: true,
        tempToken,
        message: 'You must set a new password before continuing.',
      });
      return;
    }

    const token = generateToken(hr._id.toString());

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        token,
        hr: {
          id: hr._id,
          name: hr.name,
          email: hr.email,
          companyName: hr.companyName,
          companyLogo: hr.companyLogo,
          profileComplete: hr.profileComplete,
          isVerified: hr.isVerified,
          role: hr.role,
          permissions: hr.permissions,
          organizationId: hr.organizationId,
        },
      },
    });
  } catch (error: unknown) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, message: 'Server error during login' });
  }
};

// GET /api/auth/me
export const getMe = async (req: Request, res: Response): Promise<void> => {
  try {
    const hrId = (req as unknown as { hr: { _id: string } }).hr._id;
    const hr = await HR.findById(hrId);
    if (!hr) {
      res.status(404).json({ success: false, message: 'User not found' });
      return;
    }
    res.json({ success: true, data: { hr } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// POST /api/auth/set-password
export const setFirstPassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const { tempToken, newPassword } = req.body;

    if (!tempToken || !newPassword) {
      res.status(400).json({ success: false, message: 'Temp token and new password are required' });
      return;
    }

    if (newPassword.length < 8) {
      res.status(400).json({ success: false, message: 'Password must be at least 8 characters' });
      return;
    }

    // Verify the short-lived temp token
    let decoded: { id: string; scope: string };
    try {
      decoded = jwt.verify(tempToken, process.env.JWT_SECRET as string) as { id: string; scope: string };
    } catch {
      res.status(401).json({ success: false, message: 'Invalid or expired session. Please log in again.' });
      return;
    }

    if (decoded.scope !== 'set_password') {
      res.status(403).json({ success: false, message: 'Invalid token scope' });
      return;
    }

    const hr = await HR.findById(decoded.id).select('+password');
    if (!hr) {
      res.status(404).json({ success: false, message: 'User not found' });
      return;
    }

    // Update password — the pre-save hook will hash it
    hr.password = newPassword;
    hr.mustChangePassword = false;
    await hr.save();

    const token = generateToken(hr._id.toString());

    res.json({
      success: true,
      message: 'Password updated successfully.',
      data: {
        token,
        hr: {
          id: hr._id,
          name: hr.name,
          email: hr.email,
          companyName: hr.companyName,
          companyLogo: hr.companyLogo,
          profileComplete: hr.profileComplete,
          isVerified: hr.isVerified,
          role: hr.role,
          permissions: hr.permissions,
          organizationId: hr.organizationId,
        },
      },
    });
  } catch (error: unknown) {
    console.error('Set first password error:', error);
    res.status(500).json({ success: false, message: 'Server error during password setup' });
  }
};
