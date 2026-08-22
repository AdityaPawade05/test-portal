import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAdminSession, ApiAuthError } from "@/lib/api-auth";
import { questionFieldsSchema, requireCorrectOptionForMcq } from "@/lib/schemas/question";

async function findOwnedQuestion(id: string, organizationId: string) {
  return db.question.findFirst({
    where: { id, bank: { organizationId } },
    select: { id: true },
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireAdminSession();
    const { id } = await params;
    const body = questionFieldsSchema.parse(await req.json());

    const existing = await findOwnedQuestion(id, user.organizationId);
    if (!existing) {
      return NextResponse.json({ error: "Question not found" }, { status: 404 });
    }

    const mcqError = requireCorrectOptionForMcq(body.type, body.options);
    if (mcqError) {
      return NextResponse.json({ error: mcqError }, { status: 400 });
    }

    const question = await db.$transaction(async (tx) => {
      await tx.option.deleteMany({ where: { questionId: id } });
      return tx.question.update({
        where: { id },
        data: {
          type: body.type,
          stem: body.stem,
          mediaUrl: body.mediaUrl,
          tags: body.tags,
          options: {
            create: body.options.map((o, i) => ({
              label: o.label,
              isCorrect: o.isCorrect,
              order: i,
            })),
          },
        },
        include: { options: { orderBy: { order: "asc" } } },
      });
    });

    return NextResponse.json({ question });
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

    const existing = await findOwnedQuestion(id, user.organizationId);
    if (!existing) {
      return NextResponse.json({ error: "Question not found" }, { status: 404 });
    }

    const [sectionUsingIt, responseUsingIt] = await Promise.all([
      db.section.findFirst({ where: { questionIds: { has: id } }, select: { id: true } }),
      db.response.findFirst({ where: { questionId: id }, select: { id: true } }),
    ]);
    if (sectionUsingIt) {
      return NextResponse.json(
        { error: "This question is used in a test section — remove it from the section first" },
        { status: 409 },
      );
    }
    if (responseUsingIt) {
      return NextResponse.json(
        { error: "This question already has candidate responses recorded and can't be deleted" },
        { status: 409 },
      );
    }

    await db.$transaction([
      db.option.deleteMany({ where: { questionId: id } }),
      db.question.delete({ where: { id } }),
    ]);

    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof ApiAuthError) return err.response;
    throw err;
  }
}
