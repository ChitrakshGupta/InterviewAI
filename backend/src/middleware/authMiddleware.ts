import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import HR, { IHR } from '../models/HR';

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
