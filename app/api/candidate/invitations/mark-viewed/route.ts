import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireCandidateSession, ApiAuthError } from "@/lib/api-auth";

const markViewedSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(1000),
});

export async function POST(req: NextRequest) {
  try {
    const candidate = await requireCandidateSession();
    const { ids } = markViewedSchema.parse(await req.json());

    await db.invitation.updateMany({
      where: { id: { in: ids }, email: candidate.email!, viewedAt: null },
      data: { viewedAt: new Date() },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof ApiAuthError) return err.response;
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues }, { status: 400 });
    }
    throw err;
  }
}
