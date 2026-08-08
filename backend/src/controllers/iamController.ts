import { Response } from 'express';
import crypto from 'crypto';
import HR, { IAM_PERMISSIONS, IAMPermission } from '../models/HR';
import { AuthRequest } from '../middleware/authMiddleware';
import { sendSubHRInviteEmail } from '../services/emailService';

// ── POST /api/iam/invite ───────────────────────────────────────────────────────
export const inviteMember = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const owner = req.hr!;
    const { name, email, permissions } = req.body;

    if (!name || !email) {
      res.status(400).json({ success: false, message: 'Name and email are required' });
      return;
    }

    // Validate permissions array
    const validPermissions: IAMPermission[] = [];
    if (Array.isArray(permissions)) {
      for (const p of permissions) {
        if ((IAM_PERMISSIONS as readonly string[]).includes(p)) {
          validPermissions.push(p as IAMPermission);
        }
      }
    }

    // Check if email already exists
    const existing = await HR.findOne({ email: email.toLowerCase() });
    if (existing) {
      res.status(409).json({ success: false, message: 'An account with this email already exists' });
      return;
    }

    // Generate a secure temporary password
    const tempPassword = crypto.randomBytes(8).toString('hex'); // 16-char hex

    // Auto-heal: if owner was created before IAM, set their organizationId now
    if (!owner.organizationId) {
      owner.organizationId = owner._id;
      await owner.save();
    }

    // Create sub-HR — isVerified: true (invited), mustChangePassword: true
    const member = await HR.create({
      name,
      email: email.toLowerCase(),
      password: tempPassword,
      companyName: owner.companyName,
      companyLogo: owner.companyLogo,
      isVerified: true,
      role: 'member',
      permissions: validPermissions,
      parentHrId: owner._id,
      organizationId: owner.organizationId,
      mustChangePassword: true,
      profileComplete: false,
    });

    // Send invite email with temp password
    await sendSubHRInviteEmail({
      to: email,
      name,
      tempPassword,
      inviterName: owner.name,
      companyName: owner.companyName,
      permissions: validPermissions,
    });

    res.status(201).json({
      success: true,
      message: `Invitation sent to ${email}`,
      data: {
        member: {
          id: member._id,
          name: member.name,
          email: member.email,
          role: member.role,
          permissions: member.permissions,
          createdAt: member.createdAt,
        },
      },
    });
  } catch (error: unknown) {
    console.error('Invite member error:', error);
    res.status(500).json({ success: false, message: 'Server error sending invitation' });
  }
};

// ── GET /api/iam/members ──────────────────────────────────────────────────────
export const listMembers = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const hr = req.hr!;

    // Auto-heal: if owner logged in before IAM was added, set organizationId now
    if (hr.role === 'owner' && !hr.organizationId) {
      await HR.findByIdAndUpdate(hr._id, { organizationId: hr._id });
    }

    const orgId = hr.organizationId ?? hr._id;

    // Guard: if orgId is still null/undefined somehow, refuse to list (prevents cross-org data leak)
    if (!orgId) {
      res.status(400).json({ success: false, message: 'Organization not set up yet. Please re-login.' });
      return;
    }

    // Find all members in the org (excluding the owner's own document — we fetch it separately)
    const ownerObjId = hr.role === 'owner' ? hr._id : hr.parentHrId;
    const members = await HR.find({
      organizationId: orgId,
      _id: { $ne: ownerObjId },
    }).select('name email role permissions mustChangePassword createdAt');

    // Fetch the owner to display at top
    const owner = await HR.findById(ownerObjId).select('name email role permissions createdAt');

    const allMembers = owner
      ? [{ ...owner.toObject(), isOwner: true }, ...members.map((m) => ({ ...m.toObject(), isOwner: false }))]
      : members.map((m) => ({ ...m.toObject(), isOwner: false }));

    res.json({ success: true, data: { members: allMembers } });
  } catch (error: unknown) {
    console.error('List members error:', error);
    res.status(500).json({ success: false, message: 'Server error fetching team members' });
  }
};

// ── PUT /api/iam/members/:id/permissions ──────────────────────────────────────
export const updateMemberPermissions = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const owner = req.hr!;
    const { id } = req.params;
    const { permissions } = req.body;

    // Validate target is within the same org
    const member = await HR.findOne({
      _id: id,
      organizationId: owner.organizationId,
      role: 'member',
    });

    if (!member) {
      res.status(404).json({ success: false, message: 'Member not found in your organization' });
      return;
    }

    // Validate and filter permissions
    const validPermissions: IAMPermission[] = [];
    if (Array.isArray(permissions)) {
      for (const p of permissions) {
        if ((IAM_PERMISSIONS as readonly string[]).includes(p)) {
          validPermissions.push(p as IAMPermission);
        }
      }
    }

    member.permissions = validPermissions;
    await member.save();

    res.json({
      success: true,
      message: 'Permissions updated successfully',
      data: {
        member: {
          id: member._id,
          name: member.name,
          email: member.email,
          permissions: member.permissions,
        },
      },
    });
  } catch (error: unknown) {
    console.error('Update permissions error:', error);
    res.status(500).json({ success: false, message: 'Server error updating permissions' });
  }
};

// ── DELETE /api/iam/members/:id ───────────────────────────────────────────────
export const removeMember = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const owner = req.hr!;
    const { id } = req.params;

    const member = await HR.findOneAndDelete({
      _id: id,
      organizationId: owner.organizationId,
      role: 'member',
    });

    if (!member) {
      res.status(404).json({ success: false, message: 'Member not found in your organization' });
      return;
    }

    res.json({ success: true, message: `${member.name} has been removed from the team` });
  } catch (error: unknown) {
    console.error('Remove member error:', error);
    res.status(500).json({ success: false, message: 'Server error removing member' });
  }
};
