import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAdminSession, ApiAuthError } from "@/lib/api-auth";
import { questionFieldsSchema, requireCorrectOptionForMcq } from "@/lib/schemas/question";
import { MAX_BULK_ROWS, normalizeBulkRow, validateScannedQuestion, type ScannedQuestion } from "@/lib/bulk-import";
import { scanQuestionsFromFile } from "@/lib/bulk-scan-server";

export async function POST(req: NextRequest) {
  try {
    const user = await requireAdminSession();
    const contentType = req.headers.get("content-type") || "";

    // 1. JSON Payload from Interactive Scan Panel
    if (contentType.includes("application/json")) {
      const body = await req.json();
      const { bankId, questions } = body as { bankId: string; questions: ScannedQuestion[] };

      if (!bankId || typeof bankId !== "string") {
        return NextResponse.json({ error: "Missing bankId" }, { status: 400 });
      }
      if (!Array.isArray(questions) || questions.length === 0) {
        return NextResponse.json({ error: "No questions provided for import" }, { status: 400 });
      }
      if (questions.length > MAX_BULK_ROWS) {
        return NextResponse.json(
          { error: `Too many questions — maximum ${MAX_BULK_ROWS} questions allowed per import batch.` },
          { status: 400 },
        );
      }

      const bank = await db.questionBank.findFirst({
        where: { id: bankId, organizationId: user.organizationId },
        select: { id: true },
      });
      if (!bank) {
        return NextResponse.json({ error: "Question bank not found" }, { status: 404 });
      }

      const rowErrors: { row: number; error: string }[] = [];
      const validRows: z.infer<typeof questionFieldsSchema>[] = [];

      questions.forEach((q, idx) => {
        const rowNumber = q.originalRow || idx + 1;
        const validation = validateScannedQuestion(q);
        if (!validation.isValid) {
          rowErrors.push({ row: rowNumber, error: validation.errors.join("; ") });
          return;
        }

        const parsed = questionFieldsSchema.safeParse({
          type: q.type,
          stem: q.stem,
          mediaUrl: q.mediaUrl || null,
          tags: q.tags || [],
          options: q.options || [],
        });

        if (!parsed.success) {
          rowErrors.push({ row: rowNumber, error: parsed.error.issues[0]?.message ?? "Invalid question fields" });
          return;
        }

        validRows.push(parsed.data);
      });

      if (rowErrors.length > 0) {
        return NextResponse.json(
          { error: "Some questions failed validation. Please fix them in the scan panel before uploading.", rowErrors },
          { status: 400 },
        );
      }

      const createdQuestions = await db.$transaction(
        validRows.map((row) =>
          db.question.create({
            data: {
              bankId,
              type: row.type,
              stem: row.stem,
              mediaUrl: row.mediaUrl,
              tags: Array.from(new Set([...(row.tags || []), "uploaded"])),
              options: {
                create: row.options.map((o, i) => ({
                  label: o.label,
                  isCorrect: o.isCorrect,
                  order: i,
                })),
              },
            },
            select: { id: true },
          }),
        ),
      );

      return NextResponse.json(
        { created: validRows.length, createdIds: createdQuestions.map((q) => q.id) },
        { status: 201 },
      );
    }

    // 2. FormData Direct File Upload (Fallback / Legacy)
    const formData = await req.formData();
    const bankId = formData.get("bankId");
    const file = formData.get("file");

    if (typeof bankId !== "string" || !bankId) {
      return NextResponse.json({ error: "Missing bankId" }, { status: 400 });
    }
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Missing file" }, { status: 400 });
    }

    const bank = await db.questionBank.findFirst({
      where: { id: bankId, organizationId: user.organizationId },
      select: { id: true },
    });
    if (!bank) {
      return NextResponse.json({ error: "Bank not found" }, { status: 404 });
    }

    let scannedQuestions: ScannedQuestion[];
    try {
      scannedQuestions = await scanQuestionsFromFile(file);
    } catch (err) {
      if (err instanceof Error && err.message === "UNSUPPORTED_FILE_TYPE") {
        return NextResponse.json(
          { error: "Unsupported file format — please upload a .csv, .xlsx, .xlsm, .xls, .docx, or .doc file" },
          { status: 400 },
        );
      }
      return NextResponse.json(
        { error: "Could not parse the file — make sure it's a valid CSV, Excel, or Word document" },
        { status: 400 },
      );
    }

    if (scannedQuestions.length === 0) {
      return NextResponse.json({ error: "No data rows found in the file" }, { status: 400 });
    }
    if (scannedQuestions.length > MAX_BULK_ROWS) {
      return NextResponse.json(
        { error: `Too many rows — max ${MAX_BULK_ROWS} per import` },
        { status: 400 },
      );
    }

    const rowErrors: { row: number; error: string }[] = [];
    const validRows: z.infer<typeof questionFieldsSchema>[] = [];

    scannedQuestions.forEach((q) => {
      if (!q.isValid) {
        rowErrors.push({ row: q.originalRow, error: q.errors.join("; ") });
      } else {
        validRows.push({
          type: q.type,
          stem: q.stem,
          mediaUrl: q.mediaUrl,
          tags: q.tags,
          options: q.options,
        });
      }
    });

    if (rowErrors.length > 0) {
      return NextResponse.json({ error: "Fix the errors below and re-upload", rowErrors }, { status: 400 });
    }

    const createdQuestions = await db.$transaction(
      validRows.map((row) =>
        db.question.create({
          data: {
            bankId,
            type: row.type,
            stem: row.stem,
            mediaUrl: row.mediaUrl,
            tags: Array.from(new Set([...(row.tags || []), "uploaded"])),
            options: {
              create: row.options.map((o, i) => ({
                label: o.label,
                isCorrect: o.isCorrect,
                order: i,
              })),
            },
          },
          select: { id: true },
        }),
      ),
    );

    return NextResponse.json(
      { created: validRows.length, createdIds: createdQuestions.map((q) => q.id) },
      { status: 201 },
    );
  } catch (err) {
    if (err instanceof ApiAuthError) return err.response;
    console.error("Bulk upload error:", err);
    return NextResponse.json({ error: "Failed to upload questions." }, { status: 500 });
  }
}

