import { Response } from 'express';
import { AuthRequest } from '../middleware/authMiddleware';
import HR from '../models/HR';
import { uploadToCloudinary, deleteFromCloudinary } from '../services/cloudinaryService';

// GET /api/hr/profile
export const getProfile = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const hr = await HR.findById(req.hr!._id);
    if (!hr) {
      res.status(404).json({ success: false, message: 'HR profile not found' });
      return;
    }
    res.json({ success: true, data: { hr } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch profile' });
  }
};

// PUT /api/hr/profile
export const updateProfile = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const {
      name,
      companyName,
      companyDescription,
      website,
      industry,
      companySize,
      location,
    } = req.body;

    const updateData: Partial<{
      name: string;
      companyName: string;
      companyDescription: string;
      website: string;
      industry: string;
      companySize: string;
      location: string;
      companyLogo: string;
      companyLogoPublicId: string;
      profileComplete: boolean;
    }> = {};

    if (name) updateData.name = name;
    if (companyName) updateData.companyName = companyName;
    if (companyDescription !== undefined) updateData.companyDescription = companyDescription;
    if (website !== undefined) updateData.website = website;
    if (industry !== undefined) updateData.industry = industry;
    if (companySize !== undefined) updateData.companySize = companySize;
    if (location !== undefined) updateData.location = location;

    // If a new logo was uploaded, push it to Cloudinary and clean up the old one
    if (req.file) {
      const currentHR = await HR.findById(req.hr!._id);

      // Delete old logo from Cloudinary if we have its public ID
      if (currentHR?.companyLogoPublicId) {
        await deleteFromCloudinary(currentHR.companyLogoPublicId, 'image');
      }

      // Upload new logo
      const cloudinaryResult = await uploadToCloudinary(req.file.buffer, {
        folder: 'ai-interview/logos',
        resource_type: 'image',
      });

      updateData.companyLogo = cloudinaryResult.url;
      updateData.companyLogoPublicId = cloudinaryResult.publicId;
    }

    const updatedHR = await HR.findByIdAndUpdate(req.hr!._id, updateData, { new: true });
    if (!updatedHR) {
      res.status(404).json({ success: false, message: 'HR not found' });
      return;
    }

    // Mark profile as complete if essential fields are present
    const isComplete = !!(
      updatedHR.name &&
      updatedHR.companyName &&
      updatedHR.companyDescription &&
      updatedHR.industry
    );

    if (isComplete !== updatedHR.profileComplete) {
      updatedHR.profileComplete = isComplete;
      await updatedHR.save();
    }

    res.json({ success: true, message: 'Profile updated successfully', data: { hr: updatedHR } });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ success: false, message: 'Failed to update profile' });
  }
};
