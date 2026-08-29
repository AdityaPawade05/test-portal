import { NextResponse } from "next/server";
import { getNextQuestion } from "@/lib/session-engine";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const result = await getNextQuestion(id);
    return NextResponse.json(result);
  } catch (err) {
    console.error("[GET /api/attempt/[id]/next] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 },
    );
  }
}
