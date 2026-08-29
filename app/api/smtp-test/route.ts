import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession, ApiAuthError } from "@/lib/api-auth";
import { isSmtpConfigured, sendInvitationEmail } from "@/lib/mailer";

export async function POST(req: NextRequest) {
  try {
    await requireAdminSession();

    if (!isSmtpConfigured()) {
      const missing: string[] = [];
      if (!process.env.SMTP_HOST?.trim()) missing.push("SMTP_HOST");
      if (!process.env.SMTP_USER?.trim()) missing.push("SMTP_USER");
      if (!process.env.SMTP_PASS?.trim()) missing.push("SMTP_PASS");
      return NextResponse.json(
        {
          ok: false,
          error: `SMTP is not configured. Missing: ${missing.join(", ")}. Fill in your .env file and restart the dev server.`,
          configured: false,
        },
        { status: 400 }
      );
    }

    const { to } = await req.json();
    if (!to || typeof to !== "string" || !to.includes("@")) {
      return NextResponse.json({ ok: false, error: "Provide a valid email address as { to: '...' }" }, { status: 400 });
    }

    const result = await sendInvitationEmail({
      to,
      testName: "SMTP Connection Test",
      link: `${req.nextUrl.origin}/take/smtp-test`,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      organizationName: "Assessment Portal",
      customNote: "This is a test email to verify your SMTP configuration is working correctly. If you received this, email delivery is fully operational!",
    });

    if (result.success) {
      return NextResponse.json({ ok: true, message: `Test email successfully sent to ${to}` });
    }
    return NextResponse.json({ ok: false, error: result.error, configured: true }, { status: 500 });
  } catch (err) {
    if (err instanceof ApiAuthError) return err.response;
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
