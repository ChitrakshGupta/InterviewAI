import { Router } from 'express';
import { inviteMember, listMembers, updateMemberPermissions, removeMember } from '../controllers/iamController';
import { protect, requireOwner, requirePermission } from '../middleware/authMiddleware';

const router = Router();

// All IAM routes require authentication
router.use(protect);

// Invite a new member — owner only
router.post('/invite', requireOwner, inviteMember);

// List all org members — visible to those with manage_team or owner
router.get('/members', requirePermission('manage_team'), listMembers);

// Update a member's permissions — owner only
router.put('/members/:id/permissions', requireOwner, updateMemberPermissions);

// Remove a member — owner only
router.delete('/members/:id', requireOwner, removeMember);

export default router;
