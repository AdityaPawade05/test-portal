import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAdminSession, ApiAuthError } from "@/lib/api-auth";

const sectionSchema = z.object({
  name: z.string().min(1).max(200),
  order: z.number().int().min(0),
  timeLimitSec: z.number().int().min(30),
  questionCount: z.number().int().min(1),
  poolStrategy: z.enum(["FIXED", "RANDOM_POOL"]).default("FIXED"),
  questionIds: z.array(z.string()).min(1),
});

const createTestSchema = z.object({
  name: z.string().min(1).max(200),
  cutoffPercent: z.number().min(0).max(100).nullish(),
  sections: z.array(sectionSchema).default([]),
});

export async function GET() {
  try {
    const user = await requireAdminSession();
    const tests = await db.test.findMany({
      where: { organizationId: user.organizationId },
      include: { _count: { select: { sections: true, invitations: true } } },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ tests });
  } catch (err) {
    if (err instanceof ApiAuthError) return err.response;
    throw err;
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAdminSession();
    const body = createTestSchema.parse(await req.json());

    for (const section of body.sections) {
      if (section.questionCount > section.questionIds.length) {
        return NextResponse.json(
          { error: `Section "${section.name}" asks for more questions than its pool has` },
          { status: 400 },
        );
      }
    }

    const test = await db.test.create({
      data: {
        name: body.name,
        organizationId: user.organizationId,
        cutoffPercent: body.cutoffPercent,
        sections: { create: body.sections },
      },
      include: { sections: { orderBy: { order: "asc" } } },
    });

    return NextResponse.json({ test }, { status: 201 });
  } catch (err) {
    if (err instanceof ApiAuthError) return err.response;
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues }, { status: 400 });
    }
    throw err;
  }
}
