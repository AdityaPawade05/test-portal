import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { submitAnswer } from "@/lib/session-engine";

const answerSchema = z.object({
  questionId: z.string().min(1),
  chosenOptionIds: z.array(z.string()).default([]),
  numericValue: z.number().nullish(),
  // Stored for analytics only — never trusted for timing enforcement (spec section 5).
  timeSpentMs: z.number().int().min(0),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    let body: z.infer<typeof answerSchema>;
    try {
      body = answerSchema.parse(await req.json());
    } catch (err) {
      if (err instanceof z.ZodError) {
        return NextResponse.json({ error: err.issues }, { status: 400 });
      }
      throw err;
    }

    const result = await submitAnswer(id, body.questionId, {
      chosenOptionIds: body.chosenOptionIds,
      numericValue: body.numericValue ?? undefined,
      timeSpentMs: body.timeSpentMs,
    });

    if (result.status === "section_expired") {
      return NextResponse.json({ rejected: "SECTION_EXPIRED" }, { status: 409 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[POST /api/attempt/[id]/answer] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 },
    );
  }
}
