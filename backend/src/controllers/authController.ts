import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import HR from '../models/HR';

const generateToken = (id: string): string => {
  return jwt.sign({ id }, process.env.JWT_SECRET as string, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
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

    const hr = await HR.create({ name, email, password, companyName: companyName || '' });
    const token = generateToken(hr._id.toString());

    res.status(201).json({
      success: true,
      message: 'Account created successfully',
      data: {
        token,
        hr: {
          id: hr._id,
          name: hr.name,
          email: hr.email,
          companyName: hr.companyName,
          profileComplete: hr.profileComplete,
        },
      },
    });
  } catch (error: unknown) {
    console.error('Register error:', error);
    res.status(500).json({ success: false, message: 'Server error during registration' });
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
    const hrId = (req as Express.Request & { hr: { _id: string } }).hr._id;
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
