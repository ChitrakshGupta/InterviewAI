/**
 * webhookRoutes.ts — Clerk webhook handler.
 *
 * Clerk sends webhook events when users / organizations are created/updated.
 * We use these to keep our MongoDB HR collection in sync with Clerk's user store.
 *
 * Setup in Clerk Dashboard:
 *   Configure → Webhooks → Add Endpoint
 *   URL: https://<your-backend-domain>/api/webhooks/clerk
 *   Events to subscribe: user.created, user.updated
 *
 * The CLERK_WEBHOOK_SECRET is the "Signing Secret" shown after you create
 * the webhook endpoint in the Clerk Dashboard.
 */
import { Router, Request, Response } from 'express';
import { Webhook } from 'svix';
import HR from '../models/HR';

const router = Router();

// ── Clerk Webhook Handler ──────────────────────────────────────────────────────
router.post('/clerk', async (req: Request, res: Response): Promise<void> => {
  const secret = process.env.CLERK_WEBHOOK_SECRET;

  if (!secret) {
    console.warn('CLERK_WEBHOOK_SECRET is not set — skipping webhook verification');
    res.status(200).json({ received: true });
    return;
  }

  // Verify the webhook signature using Svix
  const svix = new Webhook(secret);
  const headers = {
    'svix-id': req.headers['svix-id'] as string,
    'svix-timestamp': req.headers['svix-timestamp'] as string,
    'svix-signature': req.headers['svix-signature'] as string,
  };

  let event: {
    type: string;
    data: {
      id: string;
      email_addresses: { email_address: string; id: string }[];
      primary_email_address_id: string;
      first_name: string | null;
      last_name: string | null;
      unsafe_metadata?: { companyName?: string };
    };
  };

  try {
    // req.body is raw Buffer when express.raw() is used (see app.ts)
    event = svix.verify(req.body, headers) as typeof event;
  } catch (err) {
    console.error('Webhook signature verification failed:', err);
    res.status(400).json({ error: 'Invalid webhook signature' });
    return;
  }

  const { type, data } = event;
  console.log(`Clerk webhook received: ${type} for user ${data.id}`);

  // ── user.created ─────────────────────────────────────────────────────────────
  if (type === 'user.created') {
    try {
      const primaryEmail = data.email_addresses.find(
        (e) => e.id === data.primary_email_address_id,
      )?.email_address;

      const name = `${data.first_name ?? ''} ${data.last_name ?? ''}`.trim() || 'Unknown';
      const companyName = data.unsafe_metadata?.companyName ?? '';

      // Check if an HR doc already exists (created by protect middleware on first login)
      const existing = await HR.findOne({ clerkUserId: data.id });
      if (!existing) {
        // Also check by email (legacy migration path)
        const byEmail = primaryEmail ? await HR.findOne({ email: primaryEmail }) : null;
        if (byEmail) {
          // Link the legacy account to Clerk
          byEmail.clerkUserId = data.id;
          await byEmail.save();
          console.log(`Linked existing HR ${byEmail._id} to Clerk user ${data.id}`);
        } else {
          // Create a fresh HR profile
          const hr = await HR.create({
            clerkUserId: data.id,
            name,
            email: primaryEmail ?? `${data.id}@unknown.local`,
            companyName,
            profileComplete: false,
            isVerified: true,
            role: 'owner',
            permissions: [],
          });
          console.log(`Created HR profile ${hr._id} for Clerk user ${data.id}`);
        }
      }
    } catch (err) {
      console.error('Error handling user.created webhook:', err);
      // Return 500 so Clerk retries
      res.status(500).json({ error: 'Failed to sync user' });
      return;
    }
  }

  // ── user.updated ─────────────────────────────────────────────────────────────
  if (type === 'user.updated') {
    try {
      const primaryEmail = data.email_addresses.find(
        (e) => e.id === data.primary_email_address_id,
      )?.email_address;
      const name = `${data.first_name ?? ''} ${data.last_name ?? ''}`.trim();
      const companyName = data.unsafe_metadata?.companyName;

      const updateFields: Record<string, string> = {};
      if (name) updateFields.name = name;
      if (primaryEmail) updateFields.email = primaryEmail;
      if (companyName !== undefined) updateFields.companyName = companyName;

      if (Object.keys(updateFields).length > 0) {
        await HR.findOneAndUpdate({ clerkUserId: data.id }, updateFields);
      }
    } catch (err) {
      console.error('Error handling user.updated webhook:', err);
    }
  }

  res.status(200).json({ received: true });
});

export default router;
