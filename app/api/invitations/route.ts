import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAdminSession, ApiAuthError, type AdminUser } from "@/lib/api-auth";
import { sendInvitationEmail } from "@/lib/mailer";
import { parseCsv, rowsToRecords } from "@/lib/bulk-import";

const MAX_EMAILS = 1000;

const emailsBodySchema = z.object({
  testId: z.string().min(1),
  emails: z.array(z.string().email()).min(1).max(MAX_EMAILS),
  expiresInDays: z.number().int().min(1).max(90).default(14),
  customNote: z.string().optional(),
});

async function loadPublishedTest(testId: string, user: AdminUser) {
  const test = await db.test.findFirst({
    where: { id: testId, organizationId: user.organizationId },
    select: {
      id: true,
      name: true,
      published: true,
      sections: { select: { timeLimitSec: true } },
      organization: { select: { name: true } },
    },
  });
  if (!test) {
    return { error: NextResponse.json({ error: "Test not found" }, { status: 404 }) };
  }
  if (!test.published) {
    return {
      error: NextResponse.json(
        { error: "Publish the test before inviting candidates" },
        { status: 400 },
      ),
    };
  }

  const totalTimeLimitSec = test.sections.reduce((acc, s) => acc + s.timeLimitSec, 0);

  return {
    test: {
      id: test.id,
      name: test.name,
      orgName: test.organization?.name || "Assessment Portal",
      timeLimitSec: totalTimeLimitSec,
    },
  };
}

async function createAndSendInvitations({
  testId,
  testName,
  orgName,
  timeLimitSec,
  emails,
  expiresInDays,
  customNote,
  origin,
}: {
  testId: string;
  testName: string;
  orgName: string;
  timeLimitSec: number;
  emails: string[];
  expiresInDays: number;
  customNote?: string;
  origin: string;
}) {
  const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000);

  const invitations = await db.$transaction(
    emails.map((email) =>
      db.invitation.create({
        data: { testId, email, token: randomUUID(), expiresAt },
      }),
    ),
  );

  const results = await Promise.all(
    invitations.map((inv) =>
      sendInvitationEmail({
        to: inv.email,
        testName,
        link: `${origin}/take/${inv.token}`,
        expiresAt: inv.expiresAt,
        customNote,
        organizationName: orgName,
        timeLimitSec,
      }),
    ),
  );

  return invitations.map((inv, i) => {
    const res = results[i];
    return {
      ...inv,
      link: `${origin}/take/${inv.token}`,
      emailSent: res.success,
      emailError: res.error || null,
    };
  });
}

function dedupe(emails: string[]) {
  return [...new Set(emails.map((e) => e.toLowerCase()))];
}

async function handleJson(req: NextRequest, user: AdminUser) {
  const body = emailsBodySchema.parse(await req.json());

  const { test, error } = await loadPublishedTest(body.testId, user);
  if (error || !test) return error!;

  const invitations = await createAndSendInvitations({
    testId: test.id,
    testName: test.name,
    orgName: test.orgName,
    timeLimitSec: test.timeLimitSec,
    emails: dedupe(body.emails),
    expiresInDays: body.expiresInDays,
    customNote: body.customNote,
    origin: req.nextUrl.origin,
  });

  return NextResponse.json({ invitations }, { status: 201 });
}

async function handleCsv(req: NextRequest, user: AdminUser) {
  const formData = await req.formData();
  const testId = formData.get("testId");
  const file = formData.get("file");
  const expiresInDaysRaw = formData.get("expiresInDays");
  const customNote = formData.get("customNote") ? String(formData.get("customNote")) : undefined;

  const expiresInDays = expiresInDaysRaw ? Math.min(90, Math.max(1, Number(expiresInDaysRaw))) : 14;

  if (typeof testId !== "string" || !testId) {
    return NextResponse.json({ error: "Missing testId" }, { status: 400 });
  }
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing file" }, { status: 400 });
  }
  if (!file.name.toLowerCase().endsWith(".csv")) {
    return NextResponse.json({ error: "Upload a .csv file" }, { status: 400 });
  }

  const { test, error } = await loadPublishedTest(testId, user);
  if (error || !test) return error!;

  const records = rowsToRecords(parseCsv(await file.text()));
  if (records.length === 0) {
    return NextResponse.json({ error: "No data rows found in the file" }, { status: 400 });
  }

  const emailSchema = z.string().email();
  const validEmails: string[] = [];
  const invalidRows: { row: number; value: string }[] = [];

  records.forEach((record, i) => {
    const value = (record.email ?? "").trim();
    const parsed = emailSchema.safeParse(value);
    if (parsed.success) {
      validEmails.push(parsed.data);
    } else {
      invalidRows.push({ row: i + 2, value }); // header is row 1
    }
  });

  const emails = dedupe(validEmails).slice(0, MAX_EMAILS);
  if (emails.length === 0) {
    return NextResponse.json(
      { error: "No valid email addresses found — make sure the CSV has an \"email\" column" },
      { status: 400 },
    );
  }

  const invitations = await createAndSendInvitations({
    testId: test.id,
    testName: test.name,
    orgName: test.orgName,
    timeLimitSec: test.timeLimitSec,
    emails,
    expiresInDays,
    customNote,
    origin: req.nextUrl.origin,
  });

  return NextResponse.json({ invitations, invalidRows }, { status: 201 });
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAdminSession();
    const contentType = req.headers.get("content-type") ?? "";

    if (contentType.includes("multipart/form-data")) {
      return await handleCsv(req, user);
    }
    return await handleJson(req, user);
  } catch (err) {
    if (err instanceof ApiAuthError) return err.response;
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues }, { status: 400 });
    }
    throw err;
  }
}
