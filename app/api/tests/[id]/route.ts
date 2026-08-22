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

const patchTestSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  cutoffPercent: z.number().min(0).max(100).nullish(),
  published: z.boolean().optional(),
  sections: z.array(sectionSchema).optional(),
});

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireAdminSession();
    const { id } = await params;

    const test = await db.test.findFirst({
      where: { id, organizationId: user.organizationId },
      include: { sections: { orderBy: { order: "asc" } } },
    });
    if (!test) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ test });
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
    const body = patchTestSchema.parse(await req.json());

    const existing = await db.test.findFirst({
      where: { id, organizationId: user.organizationId },
    });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (body.sections) {
      for (const section of body.sections) {
        if (section.questionCount > section.questionIds.length) {
          return NextResponse.json(
            { error: `Section "${section.name}" asks for more questions than its pool has` },
            { status: 400 },
          );
        }
      }
    }

    if (body.published && !body.sections) {
      const sectionCount = await db.section.count({ where: { testId: id } });
      if (sectionCount === 0) {
        return NextResponse.json(
          { error: "Add at least one section before publishing" },
          { status: 400 },
        );
      }
    }

    const test = await db.$transaction(async (tx) => {
      if (body.sections) {
        await tx.section.deleteMany({ where: { testId: id } });
        await tx.section.createMany({
          data: body.sections.map((s) => ({ ...s, testId: id })),
        });
      }
      return tx.test.update({
        where: { id },
        data: {
          name: body.name,
          cutoffPercent: body.cutoffPercent,
          published: body.published,
        },
        include: { sections: { orderBy: { order: "asc" } } },
      });
    });

    return NextResponse.json({ test });
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

    const test = await db.test.findFirst({
      where: { id, organizationId: user.organizationId },
      select: { _count: { select: { invitations: true } } },
    });
    if (!test) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (test._count.invitations > 0) {
      return NextResponse.json(
        { error: "This test has already been sent to candidates and can't be deleted" },
        { status: 409 },
      );
    }

    await db.$transaction([
      db.section.deleteMany({ where: { testId: id } }),
      db.test.delete({ where: { id } }),
    ]);

    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof ApiAuthError) return err.response;
    throw err;
  }
}
