import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession, ApiAuthError } from "@/lib/api-auth";
import { z } from "zod";

const bodySchema = z.object({
  emails: z.array(z.string()).min(1).max(50),
});

type AbstractEmailResult = {
  email: string;
  deliverability: "DELIVERABLE" | "UNDELIVERABLE" | "UNKNOWN" | "RISKY";
  quality_score: number;
  is_valid_format: { value: boolean };
  is_free_email: { value: boolean };
  is_disposable_email: { value: boolean };
  is_role_email: { value: boolean };
  is_catchall_email: { value: boolean };
  is_mx_found: { value: boolean };
  is_smtp_valid: { value: boolean };
  autocorrect: string;
};

export type EmailValidationResult = {
  email: string;
  status: "valid" | "invalid" | "risky" | "unknown";
  reason: string | null;
  autocorrect: string | null;
};

function classifyResult(data: AbstractEmailResult): EmailValidationResult {
  const autocorrect = data.autocorrect && data.autocorrect !== data.email ? data.autocorrect : null;

  if (!data.is_valid_format?.value) {
    return { email: data.email, status: "invalid", reason: "Invalid email format", autocorrect };
  }
  if (data.is_disposable_email?.value) {
    return { email: data.email, status: "invalid", reason: "Disposable / temporary email address", autocorrect };
  }
  if (!data.is_mx_found?.value) {
    return { email: data.email, status: "invalid", reason: "Domain has no mail server (MX records missing)", autocorrect };
  }

  switch (data.deliverability) {
    case "DELIVERABLE":
      return { email: data.email, status: "valid", reason: null, autocorrect };
    case "UNDELIVERABLE":
      return { email: data.email, status: "invalid", reason: "Mailbox does not exist", autocorrect };
    case "RISKY":
      return {
        email: data.email,
        status: "risky",
        reason: data.is_catchall_email?.value
          ? "Catch-all domain (cannot verify specific inbox)"
          : "Inbox may not receive email reliably",
        autocorrect,
      };
    default:
      return { email: data.email, status: "unknown", reason: "Could not verify — sending anyway", autocorrect };
  }
}

async function validateOne(email: string, apiKey: string): Promise<EmailValidationResult> {
  try {
    const url = `https://emailvalidation.abstractapi.com/v1/?api_key=${apiKey}&email=${encodeURIComponent(email)}`;
    const res = await fetch(url, { next: { revalidate: 0 } });
    if (!res.ok) {
      const text = await res.text();
      console.error(`[EmailValidation] AbstractAPI error for ${email}: ${res.status} ${text}`);
      return { email, status: "unknown", reason: "Verification service unavailable", autocorrect: null };
    }
    const data: AbstractEmailResult = await res.json();
    return classifyResult(data);
  } catch (err) {
    console.error(`[EmailValidation] Network error for ${email}:`, err);
    return { email, status: "unknown", reason: "Verification service unavailable", autocorrect: null };
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireAdminSession();

    const apiKey = process.env.ABSTRACT_EMAIL_API_KEY?.trim();
    if (!apiKey) {
      return NextResponse.json(
        {
          error: "Email validation is not configured. Add ABSTRACT_EMAIL_API_KEY to your .env file.",
          configured: false,
        },
        { status: 503 }
      );
    }

    const body = bodySchema.parse(await req.json());

    // Validate in parallel with a concurrency limit of 5 to respect rate limits
    const concurrency = 5;
    const results: EmailValidationResult[] = [];
    for (let i = 0; i < body.emails.length; i += concurrency) {
      const batch = body.emails.slice(i, i + concurrency);
      const batchResults = await Promise.all(batch.map((email) => validateOne(email, apiKey)));
      results.push(...batchResults);
    }

    return NextResponse.json({ results });
  } catch (err) {
    if (err instanceof ApiAuthError) return err.response;
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues }, { status: 400 });
    }
    console.error("[EmailValidation] Unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
