// Thin wrapper around Brevo's transactional email API
// (https://developers.brevo.com/reference/send-transac-email), chosen since
// it needs nothing but fetch() — no SMTP, no SDK. Unlike every other
// integration in this app, the API key and sender address aren't a Worker
// secret/env var — they're admin-configurable at runtime (Admin → Email),
// stored in app_settings with the key AES-GCM encrypted at rest (see
// settings.js's getBrevoConfig/setBrevoConfig). Without it configured (e.g.
// a fresh deploy before an admin has filled it in), falls back to logging
// the email to the console — the same "no provider wired up yet" behavior
// this app had for password resets originally, now shared by every email
// this app sends.
import { getBrevoConfig } from "./settings.js";

const BREVO_URL = "https://api.brevo.com/v3/smtp/email";

export async function sendEmail(env, { to, subject, html, logLabel }) {
  const config = await getBrevoConfig(env);
  if (!config) {
    console.log(`[email:${logLabel || "send"}] Brevo not configured — would have sent to ${to}: "${subject}"\n${html}`);
    return { sent: false, reason: "no-provider" };
  }

  try {
    const res = await fetch(BREVO_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": config.apiKey,
      },
      body: JSON.stringify({
        sender: { email: config.senderEmail, name: config.senderName || "ExamStreak" },
        to: [{ email: to }],
        subject,
        htmlContent: html,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(`[email:${logLabel || "send"}] Brevo returned ${res.status}: ${body.slice(0, 500)}`);
      return { sent: false, reason: "provider-error" };
    }
    return { sent: true };
  } catch (err) {
    console.error(`[email:${logLabel || "send"}] request failed: ${err && err.message ? err.message : err}`);
    return { sent: false, reason: "network-error" };
  }
}

function emailShell(bodyHtml) {
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1f2937">
    <h1 style="font-size:18px;margin:0 0 16px">ExamStreak</h1>
    ${bodyHtml}
    <p style="margin-top:32px;font-size:12px;color:#6b7280">If you didn't request this, you can safely ignore this email.</p>
  </div>`;
}

export function sendVerificationEmail(env, { to, verifyLink }) {
  return sendEmail(env, {
    to,
    subject: "Verify your ExamStreak email address",
    logLabel: "verify-email",
    html: emailShell(
      `<p>Confirm this is your email address to finish setting up your ExamStreak account.</p>
       <p><a href="${verifyLink}" style="display:inline-block;background:#3730a3;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600">Verify email</a></p>
       <p style="font-size:13px;color:#6b7280">Or paste this link into your browser: ${verifyLink}</p>`,
    ),
  });
}

export function sendPasswordResetEmail(env, { to, resetLink }) {
  return sendEmail(env, {
    to,
    subject: "Reset your ExamStreak password",
    logLabel: "password-reset",
    html: emailShell(
      `<p>Someone requested a password reset for this account. This link expires in 30 minutes and can only be used once.</p>
       <p><a href="${resetLink}" style="display:inline-block;background:#3730a3;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600">Reset password</a></p>
       <p style="font-size:13px;color:#6b7280">Or paste this link into your browser: ${resetLink}</p>`,
    ),
  });
}

export function sendAccountDeletionRequestedEmail(env, { to, cancelLink, purgeDate }) {
  return sendEmail(env, {
    to,
    subject: "Your ExamStreak account is scheduled for deletion",
    logLabel: "deletion-requested",
    html: emailShell(
      `<p>We've received a request to delete this account. It will be permanently deleted on <strong>${purgeDate}</strong> unless you sign back in before then to cancel it.</p>
       <p><a href="${cancelLink}" style="display:inline-block;background:#3730a3;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600">Sign in to cancel</a></p>`,
    ),
  });
}
