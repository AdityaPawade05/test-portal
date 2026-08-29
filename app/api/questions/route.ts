import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAdminSession, ApiAuthError } from "@/lib/api-auth";
import { questionFieldsSchema, requireCorrectOptionForMcq } from "@/lib/schemas/question";

const createQuestionSchema = questionFieldsSchema.extend({
  bankId: z.string().min(1),
});

export async function POST(req: NextRequest) {
  try {
    const user = await requireAdminSession();
    const body = createQuestionSchema.parse(await req.json());

    // Verify the bank belongs to the caller's org before writing into it —
    // organizationId is never trusted from the request body.
    const bank = await db.questionBank.findFirst({
      where: { id: body.bankId, organizationId: user.organizationId },
      select: { id: true },
    });
    if (!bank) {
      return NextResponse.json({ error: "Bank not found" }, { status: 404 });
    }

    const mcqError = requireCorrectOptionForMcq(body.type, body.options);
    if (mcqError) {
      return NextResponse.json({ error: mcqError }, { status: 400 });
    }

    const question = await db.question.create({
      data: {
        bankId: body.bankId,
        type: body.type,
        stem: body.stem,
        mediaUrl: body.mediaUrl,
        tags: Array.from(new Set([...(body.tags || []), "typed"])),
        options: {
          create: body.options.map((o, i) => ({
            label: o.label,
            isCorrect: o.isCorrect,
            order: i,
          })),
        },
      },
      include: { options: true },
    });

    return NextResponse.json({ question }, { status: 201 });
  } catch (err) {
    if (err instanceof ApiAuthError) return err.response;
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues }, { status: 400 });
    }
    throw err;
  }
}
