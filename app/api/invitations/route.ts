import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAdminSession, ApiAuthError, type AdminUser } from "@/lib/api-auth";
import { sendInvitationEmail } from "@/lib/mailer";
import { parseCsv, rowsToRecords } from "@/lib/bulk-import";
import { enqueueJob, isSqsEnabled } from "@/lib/sqs";
import { getAppBaseUrl } from "@/lib/utils";

const MAX_EMAILS = 1000;

// Accept either a plain email string or an { email, name } object
const emailEntrySchema = z.union([
  z.string().email(),
  z.object({ email: z.string().email(), name: z.string().optional() }),
]);

const emailsBodySchema = z.object({
  testId: z.string().min(1),
  email: z.string().email().optional(),
  emails: z.array(emailEntrySchema).optional(),
  expiresInHours: z.number().positive().optional(),
  expiresInDays: z.number().positive().optional(),
  customNote: z.string().optional(),
  allowDuplicate: z.boolean().optional(),
});

type EmailEntry = { email: string; name?: string };

function normaliseEntries(raw: z.infer<typeof emailsBodySchema>): EmailEntry[] {
  const result: EmailEntry[] = [];
  if (raw.email) {
    result.push({ email: raw.email.trim() });
  }
  if (raw.emails && raw.emails.length > 0) {
    raw.emails.forEach((e) => {
      if (typeof e === "string") {
        result.push({ email: e.trim() });
      } else {
        result.push({ email: e.email.trim(), name: e.name?.trim() });
      }
    });
  }
  return result;
}

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
  entries,
  expiresAt,
  customNote,
  baseUrl,
}: {
  testId: string;
  testName: string;
  orgName: string;
  timeLimitSec: number;
  entries: EmailEntry[];
  expiresAt: Date;
  customNote?: string;
  baseUrl: string;
}) {
  const invitations = await db.$transaction(
    entries.map(({ email, name }) =>
      db.invitation.create({
        data: { testId, email, candidateName: name ?? null, token: randomUUID(), expiresAt },
      }),
    ),
  );

  if (isSqsEnabled()) {
    const bulkPayload = invitations.map((inv, i) => ({
      to: inv.email,
      testName,
      link: `${baseUrl}/invite/${inv.token}`,
      expiresAt: inv.expiresAt.toISOString(),
      customNote,
      organizationName: orgName,
      timeLimitSec,
      candidateName: entries[i].name ?? null,
    }));
    await enqueueJob({ type: "BULK_INVITE", invitations: bulkPayload });

    return invitations.map((inv) => ({
      ...inv,
      link: `${baseUrl}/invite/${inv.token}`,
      takeLink: `${baseUrl}/take/${inv.token}`,
      emailSent: true,
      emailError: null,
    }));
  }

  const results = await Promise.all(
    invitations.map((inv, i) =>
      sendInvitationEmail({
        to: inv.email,
        testName,
        link: `${baseUrl}/invite/${inv.token}`,
        expiresAt: inv.expiresAt,
        customNote,
        organizationName: orgName,
        timeLimitSec,
        candidateName: entries[i].name ?? null,
      }),
    ),
  );

  return invitations.map((inv, i) => {
    const res = results[i];
    return {
      ...inv,
      link: `${baseUrl}/invite/${inv.token}`,
      takeLink: `${baseUrl}/take/${inv.token}`,
      emailSent: res.success,
      emailError: res.error || null,
    };
  });
}

function dedupeEntries(entries: EmailEntry[]): EmailEntry[] {
  const seen = new Set<string>();
  return entries.filter(({ email }) => {
    const key = email.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function GET(req: NextRequest) {
  try {
    const user = await requireAdminSession();

    const now = new Date();
    // Update status to EXPIRED for invitations that passed expiresAt
    await db.invitation.updateMany({
      where: {
        test: { organizationId: user.organizationId },
        status: "SENT",
        expiresAt: { lt: now },
      },
      data: { status: "EXPIRED" },
    });

    const searchParams = req.nextUrl.searchParams;
    const testIdFilter = searchParams.get("testId");

    const invitations = await db.invitation.findMany({
      where: {
        test: {
          organizationId: user.organizationId,
          ...(testIdFilter ? { id: testIdFilter } : {}),
        },
      },
      include: {
        test: { select: { id: true, name: true } },
        attempt: { select: { id: true, startedAt: true, submittedAt: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    const baseUrl = getAppBaseUrl(req.nextUrl.origin);

    const formatted = invitations.map((inv) => {
      const isExpired = inv.status === "EXPIRED" || inv.expiresAt < now;
      let displayStatus = "Pending";
      if (inv.attempt?.submittedAt || inv.status === "SUBMITTED") {
        displayStatus = "Completed";
      } else if (isExpired) {
        displayStatus = "Expired";
      } else if (inv.status === "STARTED") {
        displayStatus = "In Progress";
      }

      return {
        id: inv.id,
        email: inv.email,
        candidateName: inv.candidateName,
        testId: inv.testId,
        testName: inv.test.name,
        token: inv.token,
        inviteUrl: `${baseUrl}/invite/${inv.token}`,
        takeUrl: `${baseUrl}/take/${inv.token}`,
        status: displayStatus,
        rawStatus: inv.status,
        expiresAt: inv.expiresAt,
        createdAt: inv.createdAt,
      };
    });

    return NextResponse.json({ invitations: formatted });
  } catch (err) {
    if (err instanceof ApiAuthError) return err.response;
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

async function handleJson(req: NextRequest, user: AdminUser) {
  const body = emailsBodySchema.parse(await req.json());

  const { test, error } = await loadPublishedTest(body.testId, user);
  if (error || !test) return error!;

  const entries = dedupeEntries(normaliseEntries(body));
  if (entries.length === 0) {
    return NextResponse.json({ error: "Provide at least one valid candidate email address." }, { status: 400 });
  }

  // Calculate expiry Date based on hours or days
  let durationMs = 14 * 24 * 60 * 60 * 1000; // default 14 days
  if (body.expiresInHours) {
    durationMs = body.expiresInHours * 60 * 60 * 1000;
  } else if (body.expiresInDays) {
    durationMs = body.expiresInDays * 24 * 60 * 60 * 1000;
  }
  const expiresAt = new Date(Date.now() + durationMs);

  // Check for duplicate active invitation for single invite
  if (entries.length === 1 && !body.allowDuplicate) {
    const activeInvite = await db.invitation.findFirst({
      where: {
        testId: test.id,
        email: entries[0].email,
        status: { notIn: ["EXPIRED", "SUBMITTED"] },
        expiresAt: { gt: new Date() },
      },
    });

    if (activeInvite) {
      return NextResponse.json(
        { error: `An active invitation already exists for ${entries[0].email} on this test.` },
        { status: 409 },
      );
    }
  }

  const baseUrl = getAppBaseUrl(req.nextUrl.origin);

  const invitations = await createAndSendInvitations({
    testId: test.id,
    testName: test.name,
    orgName: test.orgName,
    timeLimitSec: test.timeLimitSec,
    entries,
    expiresAt,
    customNote: body.customNote,
    baseUrl,
  });

  const successMessage = entries.length === 1
    ? `Invitation sent successfully to ${entries[0].email}`
    : `Invitations created successfully for ${entries.length} candidate(s)`;

  return NextResponse.json({ message: successMessage, invitations }, { status: 201 });
}

async function handleCsv(req: NextRequest, user: AdminUser) {
  const formData = await req.formData();
  const testId = formData.get("testId");
  const file = formData.get("file");
  const expiresInDaysRaw = formData.get("expiresInDays");
  const expiresInHoursRaw = formData.get("expiresInHours");
  const customNote = formData.get("customNote") ? String(formData.get("customNote")) : undefined;

  let durationMs = 14 * 24 * 60 * 60 * 1000;
  if (expiresInHoursRaw) {
    durationMs = Math.max(1, Number(expiresInHoursRaw)) * 60 * 60 * 1000;
  } else if (expiresInDaysRaw) {
    durationMs = Math.max(1, Number(expiresInDaysRaw)) * 24 * 60 * 60 * 1000;
  }
  const expiresAt = new Date(Date.now() + durationMs);

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
  const validEntries: EmailEntry[] = [];
  const invalidRows: { row: number; value: string }[] = [];

  records.forEach((record, i) => {
    const value = (record.email ?? "").trim();
    const parsed = emailSchema.safeParse(value);
    if (parsed.success) {
      const name = record.name?.trim() || undefined;
      validEntries.push({ email: parsed.data, name });
    } else {
      invalidRows.push({ row: i + 2, value });
    }
  });

  const entries = dedupeEntries(validEntries).slice(0, MAX_EMAILS);
  if (entries.length === 0) {
    return NextResponse.json(
      { error: "No valid email addresses found — make sure the CSV has an \"email\" column" },
      { status: 400 },
    );
  }

  const baseUrl = getAppBaseUrl(req.nextUrl.origin);

  const invitations = await createAndSendInvitations({
    testId: test.id,
    testName: test.name,
    orgName: test.orgName,
    timeLimitSec: test.timeLimitSec,
    entries,
    expiresAt,
    customNote,
    baseUrl,
  });

  return NextResponse.json(
    {
      message: `Invitations sent successfully to ${entries.length} candidates`,
      invitations,
      invalidRows,
    },
    { status: 201 },
  );
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
