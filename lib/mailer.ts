import nodemailer from "nodemailer";

const globalForMailer = globalThis as unknown as {
  mailer: nodemailer.Transporter | undefined;
};

export function isSmtpConfigured(): boolean {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  return Boolean(SMTP_HOST && SMTP_PORT && SMTP_USER && SMTP_PASS);
}

function getTransport(): nodemailer.Transporter | null {
  if (globalForMailer.mailer) return globalForMailer.mailer;
  if (!isSmtpConfigured()) return null;

  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;

  const transport = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT),
    secure: Number(SMTP_PORT) === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });

  if (process.env.NODE_ENV !== "production") globalForMailer.mailer = transport;
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
};

export function generateEmailHtml({
  to: _to,
  testName,
  link,
  expiresAt,
  customNote,
  organizationName = "Assessment Portal",
  timeLimitSec,
}: EmailTemplateParams): { subject: string; text: string; html: string } {
  const formattedExpiry = expiresAt.toLocaleDateString(undefined, {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  const durationStr = timeLimitSec ? `${Math.round(timeLimitSec / 60)} mins` : null;
  const orgTitle = organizationName || "Assessment Portal";

  const subject = `You're invited to take the "${testName}" assessment`;

  const text = `Hello,

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
              <h1 style="margin: 20px 0 8px 0; font-size: 22px; font-weight: 700; color: #0f172a; line-height: 1.3;">
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
                <strong style="color: #1e293b; display: block; margin-bottom: 4px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Note from the evaluator:</strong>
                "${escapeHtml(customNote)}"
              </div>
            </td>
          </tr>
          `
              : ""
          }

          <!-- Details Pills -->
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
              <a href="${link}" target="_blank" style="display: inline-block; width: 100%; box-sizing: border-box; background: linear-gradient(135deg, #4f46e5 0%, #4338ca 100%); color: #ffffff; text-align: center; padding: 14px 24px; border-radius: 10px; text-decoration: none; font-weight: 600; font-size: 16px; shadow: 0 4px 12px rgba(79, 70, 229, 0.25);">
                Start Assessment →
              </a>
            </td>
          </tr>

          <!-- Fallback Direct Link -->
          <tr>
            <td style="padding: 0 32px 32px 32px; border-t: 1px solid #f1f5f9; text-align: left;">
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
              <p style="margin: 0 0 4px 0;">This invitation was sent automatically by <strong>${escapeHtml(orgTitle)}</strong>.</p>
              <p style="margin: 0;">Please do not reply directly to this email.</p>
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
      console.warn(`[Mailer] SMTP not configured — link generated for manual sharing: ${params.link}`);
      return {
        success: false,
        error: "SMTP not configured in .env (Share candidate link directly)",
      };
    }

    const from = process.env.SMTP_FROM || process.env.SMTP_USER!;
    const { subject, text, html } = generateEmailHtml(params);

    await transport.sendMail({
      from,
      to: params.to,
      subject,
      text,
      html,
    });

    return { success: true };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`[Mailer] Failed to send email to ${params.to}:`, errorMsg);
    return { success: false, error: errorMsg };
  }
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
