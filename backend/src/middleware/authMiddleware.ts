/**
 * authMiddleware.ts — Clerk-powered session verification.
 *
 * What changed from the original JWT approach:
 *  - Instead of verifying our own JWT (jwt.verify + JWT_SECRET), we now call
 *    Clerk's createClerkClient().verifyToken() which validates against Clerk's
 *    public JWKS endpoint automatically.
 *  - req.hr is still attached (looked up from MongoDB by clerkUserId) so all
 *    downstream controllers continue to work with zero changes.
 *  - requirePermission and requireOwner are unchanged.
 */
import { Request, Response, NextFunction } from 'express';
import { createClerkClient, verifyToken } from '@clerk/backend';
import HR, { IHR, IAMPermission } from '../models/HR';

// Initialise Clerk once (uses CLERK_SECRET_KEY from env)
const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY! });

export interface AuthRequest extends Request {
  hr?: IHR;
  /** Clerk's user ID extracted directly from the verified session token */
  clerkUserId?: string;
}

export const protect = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    // 1. Extract the Bearer token from the Authorization header
    let token: string | undefined;
    if (req.headers.authorization?.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      res.status(401).json({ success: false, message: 'Not authorized, no token provided' });
      return;
    }

    // 2. Verify the token with Clerk (validates signature + expiry via JWKS)
    let payload: { sub: string };
    try {
      const result = await verifyToken(token, { secretKey: process.env.CLERK_SECRET_KEY! });
      payload = result as unknown as { sub: string };
    } catch {
      res.status(401).json({ success: false, message: 'Not authorized, invalid or expired token' });
      return;
    }

    const clerkUserId = payload.sub;
    req.clerkUserId = clerkUserId;

    // 3. Load the HR profile from MongoDB using the Clerk user ID
    //    On first sign-in after webhook hasn't fired yet, fall back to creating
    //    a minimal record so the app doesn't hard-fail.
    let hr = await HR.findOne({ clerkUserId });

    if (!hr) {
      // If no record found by clerkUserId, attempt to find by email as a
      // migration fallback for any pre-existing accounts.
      const clerkUser = await clerk.users.getUser(clerkUserId);
      const primaryEmail = clerkUser.emailAddresses.find(
        (e) => e.id === clerkUser.primaryEmailAddressId,
      )?.emailAddress;

      if (primaryEmail) {
        hr = await HR.findOne({ email: primaryEmail });
        if (hr && !hr.clerkUserId) {
          // Link the legacy account to Clerk
          hr.clerkUserId = clerkUserId;
          await hr.save();
        }
      }

      // If still no HR doc, create a minimal one so protected routes work
      if (!hr) {
        hr = await HR.create({
          clerkUserId,
          name: `${clerkUser.firstName ?? ''} ${clerkUser.lastName ?? ''}`.trim() || 'Unknown',
          email: primaryEmail ?? `${clerkUserId}@unknown.local`,
          companyName: (clerkUser.unsafeMetadata as { companyName?: string })?.companyName ?? '',
          profileComplete: false,
          isVerified: true,
          role: 'owner',
          permissions: [],
        });
      }
    }

    req.hr = hr;
    next();
  } catch (error) {
    console.error('protect middleware error:', error);
    res.status(401).json({ success: false, message: 'Not authorized' });
  }
};

/**
 * Middleware factory — requires a specific IAM permission.
 * Owners bypass all permission checks.
 * Members must have the flag in their permissions array.
 */
export const requirePermission = (flag: IAMPermission) => {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    const hr = req.hr;
    if (!hr) {
      res.status(401).json({ success: false, message: 'Not authorized' });
      return;
    }
    // Owners have all permissions
    if (hr.role === 'owner') {
      next();
      return;
    }
    // Members must have the specific permission
    if (hr.permissions.includes(flag)) {
      next();
      return;
    }
    res.status(403).json({
      success: false,
      message: `You do not have permission to perform this action (requires: ${flag})`,
    });
  };
};

/**
 * Middleware — requires owner role.
 */
export const requireOwner = (req: AuthRequest, res: Response, next: NextFunction): void => {
  const hr = req.hr;
  if (!hr || hr.role !== 'owner') {
    res.status(403).json({ success: false, message: 'Only the organization owner can perform this action' });
    return;
  }
  next();
};
