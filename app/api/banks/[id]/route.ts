import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAdminSession, ApiAuthError } from "@/lib/api-auth";

const patchBankSchema = z.object({
  name: z.string().min(1).max(200),
});

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireAdminSession();
    const { id } = await params;

    const bank = await db.questionBank.findFirst({
      where: { id, organizationId: user.organizationId },
      include: {
        questions: {
          include: { options: { orderBy: { order: "asc" } } },
          orderBy: { createdAt: "desc" },
        },
      },
    });
    if (!bank) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ bank });
  } catch (err) {
    if (err instanceof ApiAuthError) return err.response;
    throw err;
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireAdminSession();
    const { id } = await params;
    const body = patchBankSchema.parse(await req.json());

    const existing = await db.questionBank.findFirst({
      where: { id, organizationId: user.organizationId },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const bank = await db.questionBank.update({
      where: { id },
      data: { name: body.name },
    });
    return NextResponse.json({ bank });
  } catch (err) {
    if (err instanceof ApiAuthError) return err.response;
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues }, { status: 400 });
    }
    throw err;
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireAdminSession();
    const { id } = await params;

    const bank = await db.questionBank.findFirst({
      where: { id, organizationId: user.organizationId },
      select: { questions: { select: { id: true } } },
    });
    if (!bank) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const questionIds = bank.questions.map((q) => q.id);
    if (questionIds.length > 0) {
      const [sectionUsingOne, responseUsingOne] = await Promise.all([
        db.section.findFirst({
          where: { questionIds: { hasSome: questionIds } },
          select: { id: true },
        }),
        db.response.findFirst({
          where: { questionId: { in: questionIds } },
          select: { id: true },
        }),
      ]);
      if (sectionUsingOne) {
        return NextResponse.json(
          {
            error:
              "This bank has a question used in a test section — remove it from the section first",
          },
          { status: 409 },
        );
      }
      if (responseUsingOne) {
        return NextResponse.json(
          {
            error:
              "This bank has a question with candidate responses recorded and can't be deleted",
          },
          { status: 409 },
        );
      }
    }

    await db.$transaction([
      db.option.deleteMany({ where: { questionId: { in: questionIds } } }),
      db.question.deleteMany({ where: { bankId: id } }),
      db.questionBank.delete({ where: { id } }),
    ]);

    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof ApiAuthError) return err.response;
    throw err;
  }
}
