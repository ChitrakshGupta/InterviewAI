import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import HR, { IHR, IAMPermission } from '../models/HR';

export interface AuthRequest extends Request {
  hr?: IHR;
}

export const protect = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    let token: string | undefined;

    if (req.headers.authorization?.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      res.status(401).json({ success: false, message: 'Not authorized, no token provided' });
      return;
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as { id: string };
    const hr = await HR.findById(decoded.id).select('-password');

    if (!hr) {
      res.status(401).json({ success: false, message: 'User no longer exists' });
      return;
    }

    req.hr = hr;
    next();
  } catch (error) {
    res.status(401).json({ success: false, message: 'Not authorized, invalid token' });
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
