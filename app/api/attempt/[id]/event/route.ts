import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { logProctoringEvent } from "@/lib/session-engine";

const eventSchema = z.object({
  type: z.string().min(1).max(50),
  payload: z.unknown().optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  let body: z.infer<typeof eventSchema>;
  try {
    body = eventSchema.parse(await req.json());
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues }, { status: 400 });
    }
    throw err;
  }

  await logProctoringEvent(id, body.type, body.payload);
  return NextResponse.json({ ok: true });
}
