import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAdminSession, ApiAuthError } from "@/lib/api-auth";

const createBankSchema = z.object({
  name: z.string().min(1).max(200),
});

export async function GET() {
  try {
    const user = await requireAdminSession();
    const banks = await db.questionBank.findMany({
      where: { organizationId: user.organizationId },
      include: { _count: { select: { questions: true } } },
      orderBy: { name: "asc" },
    });
    return NextResponse.json({ banks });
  } catch (err) {
    if (err instanceof ApiAuthError) return err.response;
    throw err;
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAdminSession();
    const body = createBankSchema.parse(await req.json());

    const bank = await db.questionBank.create({
      data: { name: body.name, organizationId: user.organizationId },
    });
    return NextResponse.json({ bank }, { status: 201 });
  } catch (err) {
    if (err instanceof ApiAuthError) return err.response;
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues }, { status: 400 });
    }
    throw err;
  }
}
