import nodemailer from "nodemailer";

const globalForMailer = globalThis as unknown as {
  mailer: nodemailer.Transporter | undefined;
};

export function isSmtpConfigured(): boolean {
  const host = process.env.SMTP_HOST || "smtp.gmail.com";
  const user = process.env.SMTP_USER || process.env.EMAIL_USER;
  const pass = process.env.SMTP_PASS || process.env.EMAIL_PASS;
  return Boolean(user && user.trim() && pass && pass.trim() && host && host.trim());
}

function getTransport(): nodemailer.Transporter | null {
  if (globalForMailer.mailer) return globalForMailer.mailer;
  if (!isSmtpConfigured()) return null;

  const host = process.env.SMTP_HOST || "smtp.gmail.com";
  const port = Number(process.env.SMTP_PORT || 465);
  const user = (process.env.SMTP_USER || process.env.EMAIL_USER || "").trim();
  const pass = (process.env.SMTP_PASS || process.env.EMAIL_PASS || "").replace(/\s+/g, "");

  const transport = nodemailer.createTransport({
    host,
    port,
    // Port 465 = SSL/TLS (recommended for Gmail), 587/25 = STARTTLS
    secure: port === 465,
    auth: { user, pass },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
    ...(port === 587 && { requireTLS: true }),
  });

  // Cache the transport globally so we don't recreate it on every request
  globalForMailer.mailer = transport;
  return transport;
}

export type EmailTemplateParams = {
  to: string;
  testName: string;
  link: string;
  expiresAt: Date;
  customNote?: string | null;
  organizationName?: string | null;
  timeLimitSec?: number | null;
  candidateName?: string | null;
};

export function generateEmailHtml({
  to: _to,
  testName,
  link,
  expiresAt,
  customNote,
  organizationName = "Assessment Portal",
  timeLimitSec,
  candidateName,
}: EmailTemplateParams): { subject: string; text: string; html: string } {
  const formattedExpiry = expiresAt.toLocaleDateString(undefined, {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  const durationStr = timeLimitSec ? `${Math.round(timeLimitSec / 60)} mins` : null;
  const orgTitle = organizationName || "Assessment Portal";

  // Personalise first name — use the part before first space
  const firstName = candidateName?.trim().split(/\s+/)[0] ?? null;

  const subject = firstName
    ? `${firstName}, you're invited to take the "${testName}" assessment`
    : `You're invited to take the "${testName}" assessment`;

  const greeting = firstName ? `Hi ${firstName},` : "Hello,";

  const text = `${greeting}

You have been invited to complete the "${testName}" assessment by ${orgTitle}.

${customNote ? `Message from host:\n"${customNote}"\n\n` : ""}Start Assessment: ${link}

This link is unique to you and expires on ${formattedExpiry}.${durationStr ? ` Time limit: ${durationStr}.` : ""}

Good luck!
${orgTitle}`;

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b;">
  <!-- Hidden Pre-header text for Inbox list preview -->
  <span style="display:none;font-size:1px;color:#f8fafc;line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;">
    You are invited to take the ${escapeHtml(testName)} assessment by ${escapeHtml(orgTitle)}.${durationStr ? ` Time limit: ${durationStr}.` : ""}
  </span>

  <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f8fafc; padding: 40px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 540px; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.05), 0 8px 10px -6px rgba(0, 0, 0, 0.03); border: 1px solid #e2e8f0;">

          <!-- Top Gradient Accent -->
          <tr>
            <td style="height: 6px; background: linear-gradient(90deg, #6366f1 0%, #4f46e5 50%, #4338ca 100%);"></td>
          </tr>

          <!-- Header -->
          <tr>
            <td style="padding: 32px 32px 24px 32px; text-align: left;">
              <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0">
                <tr>
                  <td>
                    <span style="display: inline-block; background-color: #eef2ff; color: #4f46e5; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; padding: 6px 12px; border-radius: 20px;">
                      ${escapeHtml(orgTitle)}
                    </span>
                  </td>
                </tr>
              </table>
              ${firstName
                ? `<p style="margin: 20px 0 4px 0; font-size: 15px; color: #475569;">Hi <strong style="color: #0f172a;">${escapeHtml(firstName)}</strong>,</p>`
                : ""}
              <h1 style="margin: ${firstName ? "0" : "20px"} 0 8px 0; font-size: 22px; font-weight: 700; color: #0f172a; line-height: 1.3;">
                You're invited to take an assessment
              </h1>
              <p style="margin: 0; font-size: 15px; color: #475569; line-height: 1.5;">
                You have been selected to complete the <strong style="color: #0f172a;">${escapeHtml(testName)}</strong> test.
              </p>
            </td>
          </tr>

          ${
            customNote
              ? `
          <!-- Custom Message Box -->
          <tr>
            <td style="padding: 0 32px 24px 32px;">
              <div style="background-color: #f1f5f9; border-left: 4px solid #4f46e5; border-radius: 6px; padding: 16px; font-size: 14px; color: #334155; line-height: 1.6;">
                <strong style="color: #1e293b; display: block; margin-bottom: 4px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Note from host:</strong>
                "${escapeHtml(customNote)}"
              </div>
            </td>
          </tr>
          `
              : ""
          }

          <!-- Details Card -->
          <tr>
            <td style="padding: 0 32px 24px 32px;">
              <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f8fafc; border-radius: 12px; border: 1px solid #f1f5f9; padding: 16px;">
                <tr>
                  <td style="padding: 4px 8px; font-size: 13px; color: #64748b;">
                    📅 <strong>Expires:</strong> ${formattedExpiry}
                  </td>
                  ${
                    durationStr
                      ? `<td style="padding: 4px 8px; font-size: 13px; color: #64748b; text-align: right;">
                    ⏱️ <strong>Time Limit:</strong> ${durationStr}
                  </td>`
                      : ""
                  }
                </tr>
              </table>
            </td>
          </tr>

          <!-- Primary CTA Button -->
          <tr>
            <td align="center" style="padding: 0 32px 32px 32px;">
              <a href="${link}" target="_blank" style="display: inline-block; width: 100%; box-sizing: border-box; background: linear-gradient(135deg, #4f46e5 0%, #4338ca 100%); color: #ffffff; text-align: center; padding: 14px 24px; border-radius: 10px; text-decoration: none; font-weight: 600; font-size: 16px; box-shadow: 0 4px 12px rgba(79, 70, 229, 0.25);">
                Start Assessment →
              </a>
            </td>
          </tr>

          <!-- Fallback Direct Link -->
          <tr>
            <td style="padding: 0 32px 32px 32px; border-top: 1px solid #f1f5f9; text-align: left;">
              <p style="margin: 16px 0 6px 0; font-size: 12px; font-weight: 600; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px;">
                Or copy and paste this link in your browser:
              </p>
              <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 12px; word-break: break-all; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 12px; color: #475569;">
                <a href="${link}" style="color: #4f46e5; text-decoration: none;">${link}</a>
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f8fafc; padding: 24px 32px; text-align: center; border-top: 1px solid #f1f5f9; font-size: 12px; color: #94a3b8; line-height: 1.5;">
              <p style="margin: 0 0 4px 0;">This assessment invitation was sent by <strong>${escapeHtml(orgTitle)}</strong>.</p>
              <p style="margin: 0;">Please do not reply directly to this automated email.</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;

  return { subject, text, html };
}

export async function sendInvitationEmail(params: EmailTemplateParams): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    const transport = getTransport();
    if (!transport) {
      const user = process.env.SMTP_USER || process.env.EMAIL_USER;
      const pass = process.env.SMTP_PASS || process.env.EMAIL_PASS;
      const missing: string[] = [];
      if (!user?.trim()) missing.push("SMTP_USER / EMAIL_USER");
      if (!pass?.trim()) missing.push("SMTP_PASS / EMAIL_PASS");
      const missingList = missing.length ? ` (missing: ${missing.join(", ")})` : "";
      console.warn(`[Mailer] SMTP not configured${missingList} — link for manual sharing: ${params.link}`);
      return {
        success: false,
        error: `SMTP not configured${missingList}. Fill in your .env file and restart the server.`,
      };
    }

    const from = process.env.SMTP_FROM?.trim() || process.env.SMTP_USER || process.env.EMAIL_USER || "Assessment Portal <noreply@assessmentportal.com>";
    const { subject, text, html } = generateEmailHtml(params);

    await transport.sendMail({
      from,
      replyTo: process.env.SMTP_USER || from,
      to: params.to,
      subject,
      text,
      html,
      headers: {
        "X-Entity-Ref-ID": params.link,
        "X-Auto-Response-Suppress": "OOF, AutoReply",
        "Precedence": "bulk",
      },
    });

    console.info(`[Mailer] Email sent to ${params.to}`);
    return { success: true };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    // Invalidate cached transport on auth errors so next request retries with fresh credentials
    const isAuthError = errorMsg.includes("535") || errorMsg.includes("EAUTH") || errorMsg.toLowerCase().includes("invalid login") || errorMsg.toLowerCase().includes("username and password");
    const isNetworkError = errorMsg.includes("ECONNREFUSED") || errorMsg.includes("ETIMEDOUT") || errorMsg.includes("ENOTFOUND");

    if (isAuthError || isNetworkError) {
      // Clear cached transporter so next attempt rebuilds it (useful after .env update)
      globalForMailer.mailer = undefined;
    }

    let userFacingError = errorMsg;
    if (isAuthError) {
      userFacingError = "Gmail authentication failed. Check that SMTP_USER is your Gmail address and SMTP_PASS is a valid App Password (not your regular Gmail password). App Passwords are generated at myaccount.google.com → Security → 2-Step Verification → App passwords.";
    } else if (isNetworkError) {
      userFacingError = "Cannot connect to SMTP server. Check SMTP_HOST and SMTP_PORT in your .env, and ensure your network allows outbound SMTP connections on port 587.";
    }

    console.error(`[Mailer] Failed to send email to ${params.to}:`, errorMsg);
    return { success: false, error: userFacingError };
  }
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
