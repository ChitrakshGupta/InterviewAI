import { Resend } from 'resend';

const RESEND_API_KEY = process.env.RESEND_API_KEY as string;

// Initialize Resend client
const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;

export interface EmailPayload {
  to: string;
  candidateName: string;
  companyName: string;
  jobTitle: string;
  verificationLink: string;
  scheduledDate?: string;
}

const buildEmailHtml = (payload: EmailPayload): string => {
  const { candidateName, companyName, jobTitle, verificationLink } = payload;

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Interview Invitation</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0f0f13;
      color: #e2e8f0;
      padding: 40px 20px;
    }
    .container {
      max-width: 600px;
      margin: 0 auto;
      background: #1a1a2e;
      border-radius: 16px;
      overflow: hidden;
      border: 1px solid rgba(99, 102, 241, 0.2);
    }
    .header {
      background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
      padding: 40px 40px 30px;
      text-align: center;
    }
    .header h1 { font-size: 28px; font-weight: 700; color: white; margin-bottom: 8px; }
    .header p { color: rgba(255,255,255,0.8); font-size: 15px; }
    .badge {
      display: inline-block;
      background: rgba(255,255,255,0.2);
      border-radius: 50px;
      padding: 6px 16px;
      font-size: 13px;
      color: white;
      margin-top: 12px;
      backdrop-filter: blur(10px);
    }
    .body { padding: 40px; }
    .greeting { font-size: 18px; font-weight: 600; color: #e2e8f0; margin-bottom: 16px; }
    .text { color: #94a3b8; font-size: 15px; line-height: 1.7; margin-bottom: 20px; }
    .info-card {
      background: rgba(99, 102, 241, 0.08);
      border: 1px solid rgba(99, 102, 241, 0.2);
      border-radius: 12px;
      padding: 20px;
      margin: 24px 0;
    }
    .info-card-title { font-size: 12px; text-transform: uppercase; letter-spacing: 1px; color: #6366f1; margin-bottom: 12px; font-weight: 600; }
    .info-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid rgba(99, 102, 241, 0.1); }
    .info-row:last-child { border-bottom: none; }
    .info-label { color: #64748b; font-size: 14px; }
    .info-value { color: #e2e8f0; font-size: 14px; font-weight: 500; }
    .cta-btn {
      display: block;
      background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
      color: white;
      text-decoration: none;
      text-align: center;
      padding: 16px 32px;
      border-radius: 12px;
      font-size: 16px;
      font-weight: 600;
      margin: 28px 0;
      letter-spacing: 0.5px;
      transition: opacity 0.2s;
    }
    .link-backup { font-size: 12px; color: #64748b; word-break: break-all; }
    .link-backup a { color: #6366f1; text-decoration: none; }
    .footer { padding: 24px 40px; border-top: 1px solid rgba(99, 102, 241, 0.1); text-align: center; }
    .footer p { font-size: 12px; color: #475569; }
    .steps {
      background: rgba(16, 185, 129, 0.05);
      border: 1px solid rgba(16, 185, 129, 0.15);
      border-radius: 12px;
      padding: 20px;
      margin: 20px 0;
    }
    .steps-title { font-size: 13px; font-weight: 600; color: #10b981; margin-bottom: 12px; text-transform: uppercase; letter-spacing: 1px; }
    .step { display: flex; align-items: flex-start; gap: 12px; margin-bottom: 12px; }
    .step-num {
      width: 24px; height: 24px; border-radius: 50%;
      background: linear-gradient(135deg, #6366f1, #8b5cf6);
      color: white; font-size: 12px; font-weight: 700;
      display: flex; align-items: center; justify-content: center; flex-shrink: 0;
    }
    .step-text { font-size: 14px; color: #94a3b8; line-height: 1.5; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🎯 Interview Invitation</h1>
      <p>You've been selected for an AI-powered interview</p>
      <span class="badge">✨ Powered by AI</span>
    </div>
    <div class="body">
      <p class="greeting">Hello, ${candidateName}!</p>
      <p class="text">
        Congratulations! <strong>${companyName}</strong> has invited you to participate in an AI-powered interview for the following position. Please follow the steps below to complete your interview.
      </p>

      <div class="info-card">
        <div class="info-card-title">📋 Interview Details</div>
        <div class="info-row">
          <span class="info-label">Company</span>
          <span class="info-value">${companyName}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Position</span>
          <span class="info-value">${jobTitle}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Interview Type</span>
          <span class="info-value">AI Voice Interview</span>
        </div>
      </div>

      <div class="steps">
        <div class="steps-title">📌 How to Proceed</div>
        <div class="step">
          <div class="step-num">1</div>
          <div class="step-text">Click the button below to access your personalized interview link.</div>
        </div>
        <div class="step">
          <div class="step-num">2</div>
          <div class="step-text">Verify your identity by entering your email address (${payload.to}).</div>
        </div>
        <div class="step">
          <div class="step-num">3</div>
          <div class="step-text">Allow camera access and take a quick snapshot for identity verification.</div>
        </div>
        <div class="step">
          <div class="step-num">4</div>
          <div class="step-text">Your AI interview will begin. Answer each question clearly and confidently.</div>
        </div>
      </div>

      <a href="${verificationLink}" class="cta-btn">🚀 Start My Interview</a>

      <p class="link-backup">
        If the button doesn't work, copy and paste this link:<br/>
        <a href="${verificationLink}">${verificationLink}</a>
      </p>

      <p class="text" style="font-size: 13px; margin-top: 20px; color: #64748b;">
        ⚠️ This link is unique to you and expires in <strong>48 hours</strong>. Do not share this link with anyone.
      </p>
    </div>
    <div class="footer">
      <p>© ${new Date().getFullYear()} ${companyName}. This is an automated message — please do not reply.</p>
    </div>
  </div>
</body>
</html>
  `;
};

export const sendInterviewInvitation = async (payload: EmailPayload): Promise<void> => {
  const subject = `Interview Invitation: ${payload.jobTitle} at ${payload.companyName}`;

  if (!resend) {
    // Log to console when Resend is not configured
    console.log('\n' + '═'.repeat(60));
    console.log('📧  EMAIL (Console Mode — Resend API Key not configured)');
    console.log('═'.repeat(60));
    console.log(`TO:      ${payload.to}`);
    console.log(`SUBJECT: ${subject}`);
    console.log(`\n🔗 VERIFICATION LINK:\n   ${payload.verificationLink}`);
    console.log('═'.repeat(60) + '\n');
    return;
  }

  const result = await resend.emails.send({
    from: `"${payload.companyName} Interviews" <noreply@chitrakshgupta.tech>`,
    to: payload.to,
    subject,
    html: buildEmailHtml(payload),
  });

  if (result.error) {
    throw new Error(`Resend email error: ${result.error.message}`);
  }

  console.log(`✅ Interview invitation sent to ${payload.to} via Resend`);
};

export const sendHRVerificationEmail = async (
  to: string,
  name: string,
  rawToken: string
): Promise<void> => {
  const frontendUrl = process.env.FRONTEND_URL as string;
  const verifyLink = `${frontendUrl}/verify-email?token=${rawToken}`;
  const subject = 'Verify your email address';

  if (!resend) {
    console.log('\n' + '═'.repeat(60));
    console.log('📧  HR VERIFICATION EMAIL (Console Mode)');
    console.log(`TO:   ${to}`);
    console.log(`LINK: ${verifyLink}`);
    console.log('═'.repeat(60) + '\n');
    return;
  }

  const result = await resend.emails.send({
    from: 'noreply@chitrakshgupta.tech',
    to,
    subject,
    html: `
      <div style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:500px;margin:0 auto;padding:24px;background:#1a1b1e;color:#e8eaed;border-radius:12px;">
        <h2 style="color:#8ab4f8;margin-bottom:12px;">Hello ${name},</h2>
        <p style="color:#9aa0a6;font-size:15px;line-height:1.6;">Thank you for registering. Please click the button below to verify your email address and activate your account:</p>
        <div style="margin:24px 0;">
          <a href="${verifyLink}" style="display:inline-block;padding:12px 24px;background:#1a73e8;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:700;font-size:15px;">Verify Email Address →</a>
        </div>
        <p style="color:#6b7280;font-size:13px;">This verification link expires in <strong>30 minutes</strong>.</p>
      </div>
    `,
  });

  if (result.error) {
    throw new Error(`Resend verification error: ${result.error.message}`);
  }
};

// ── sendSubHRInviteEmail ───────────────────────────────────────────────────────
export interface SubHRInvitePayload {
  to: string;
  name: string;
  tempPassword: string;
  inviterName: string;
  companyName: string;
  permissions: string[];
}

const PERMISSION_LABELS: Record<string, string> = {
  view_jobs: '👁 View Jobs',
  manage_jobs: '🛠 Manage Jobs',
  schedule_interviews: '📅 Schedule Interviews',
  view_candidates: '👤 View Candidates',
  view_reports: '📊 View Reports',
  manage_team: '🔑 Manage Team',
};

export const sendSubHRInviteEmail = async (payload: SubHRInvitePayload): Promise<void> => {
  const { to, name, tempPassword, inviterName, companyName, permissions } = payload;
  const frontendUrl = process.env.FRONTEND_URL as string;
  const loginUrl = `${frontendUrl}/login`;
  const subject = `You've been invited to join ${companyName} on HireAI`;

  const permissionBadges = permissions
    .map((p) => `<span style="display:inline-block;background:rgba(99,102,241,0.15);border:1px solid rgba(99,102,241,0.3);border-radius:20px;padding:4px 12px;font-size:12px;color:#a5b4fc;margin:3px;">${PERMISSION_LABELS[p] ?? p}</span>`)
    .join('');

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Team Invitation</title>
</head>
<body style="margin:0;padding:40px 20px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#0f0f13;color:#e2e8f0;">
  <div style="max-width:560px;margin:0 auto;background:#1a1a2e;border-radius:16px;overflow:hidden;border:1px solid rgba(99,102,241,0.2);">
    <div style="background:linear-gradient(135deg,#6366f1 0%,#8b5cf6 100%);padding:36px 40px;text-align:center;">
      <div style="font-size:40px;margin-bottom:12px;">🤝</div>
      <h1 style="margin:0;font-size:24px;font-weight:700;color:white;">You're invited!</h1>
      <p style="margin:8px 0 0;color:rgba(255,255,255,0.8);font-size:14px;">${inviterName} has added you to <strong>${companyName}</strong> on HireAI</p>
    </div>
    <div style="padding:36px 40px;">
      <p style="font-size:17px;font-weight:600;color:#e2e8f0;margin:0 0 12px;">Hello, ${name}!</p>
      <p style="color:#94a3b8;font-size:14px;line-height:1.7;margin:0 0 24px;">
        You have been invited to join the <strong style="color:#e2e8f0;">${companyName}</strong> team. Use the credentials below to log in for the first time. You will be asked to set a new password after logging in.
      </p>

      <div style="background:rgba(99,102,241,0.08);border:1px solid rgba(99,102,241,0.2);border-radius:12px;padding:20px;margin-bottom:24px;">
        <div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#6366f1;font-weight:600;margin-bottom:14px;">🔐 Your Login Credentials</div>
        <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid rgba(99,102,241,0.1);">
          <span style="color:#64748b;font-size:14px;">Email</span>
          <span style="color:#e2e8f0;font-size:14px;font-weight:500;">${to}</span>
        </div>
        <div style="display:flex;justify-content:space-between;padding:8px 0;">
          <span style="color:#64748b;font-size:14px;">Temporary Password</span>
          <span style="color:#a5b4fc;font-size:14px;font-weight:700;letter-spacing:1px;font-family:monospace;">${tempPassword}</span>
        </div>
      </div>

      ${permissions.length > 0 ? `
      <div style="margin-bottom:24px;">
        <div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#6366f1;font-weight:600;margin-bottom:10px;">✅ Your Permissions</div>
        <div>${permissionBadges}</div>
      </div>` : ''}

      <a href="${loginUrl}" style="display:block;background:linear-gradient(135deg,#6366f1 0%,#8b5cf6 100%);color:white;text-decoration:none;text-align:center;padding:14px 32px;border-radius:10px;font-size:15px;font-weight:600;margin-bottom:20px;">
        🚀 Log in to HireAI →
      </a>

      <p style="font-size:12px;color:#475569;text-align:center;">You will be asked to set a new password on your first login.</p>
    </div>
    <div style="padding:20px 40px;border-top:1px solid rgba(99,102,241,0.1);text-align:center;">
      <p style="font-size:12px;color:#475569;margin:0;">© ${new Date().getFullYear()} ${companyName}. This is an automated message — please do not reply.</p>
    </div>
  </div>
</body>
</html>`;

  if (!resend) {
    console.log('\n' + '═'.repeat(60));
    console.log('📧  SUB-HR INVITE EMAIL (Console Mode)');
    console.log(`TO:       ${to}`);
    console.log(`PASSWORD: ${tempPassword}`);
    console.log(`PERMS:    ${permissions.join(', ')}`);
    console.log('═'.repeat(60) + '\n');
    return;
  }

  const result = await resend.emails.send({
    from: 'noreply@chitrakshgupta.tech',
    to,
    subject,
    html,
  });

  if (result.error) {
    throw new Error(`Resend invite error: ${result.error.message}`);
  }

  console.log(`✅ Invite email sent to ${to} via Resend`);
};

