import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdminSession, ApiAuthError } from "@/lib/api-auth";
import { scanQuestionsFromFile } from "@/lib/bulk-scan-server";
import { MAX_BULK_ROWS } from "@/lib/bulk-import";

export async function POST(req: NextRequest) {
  try {
    const user = await requireAdminSession();
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
      select: { id: true, name: true },
    });

    if (!bank) {
      return NextResponse.json({ error: "Question bank not found" }, { status: 404 });
    }

    let questions;
    try {
      questions = await scanQuestionsFromFile(file);
    } catch (err) {
      if (err instanceof Error && err.message === "UNSUPPORTED_FILE_TYPE") {
        return NextResponse.json(
          { error: "Unsupported file format — please upload a .csv, .xlsx, .xlsm, .xls, .docx, or .doc file" },
          { status: 400 },
        );
      }
      return NextResponse.json(
        { error: "Could not scan the document — please make sure it is a valid CSV, Excel, or Word file." },
        { status: 400 },
      );
    }

    if (questions.length === 0) {
      return NextResponse.json(
        { error: "No questions could be scanned from this document. Please check the document format." },
        { status: 400 },
      );
    }

    if (questions.length > MAX_BULK_ROWS) {
      return NextResponse.json(
        { error: `Document contains too many questions — max ${MAX_BULK_ROWS} questions allowed per upload.` },
        { status: 400 },
      );
    }

    const validCount = questions.filter((q) => q.isValid).length;
    const errorCount = questions.length - validCount;

    return NextResponse.json({
      success: true,
      bankName: bank.name,
      total: questions.length,
      validCount,
      errorCount,
      questions,
    });
  } catch (err) {
    if (err instanceof ApiAuthError) return err.response;
    console.error("Scanning error:", err);
    return NextResponse.json({ error: "An unexpected error occurred while scanning the document." }, { status: 500 });
  }
}
