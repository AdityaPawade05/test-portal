import { NextResponse } from "next/server";
import { getNextQuestion } from "@/lib/session-engine";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const result = await getNextQuestion(id);
  return NextResponse.json(result);
}
