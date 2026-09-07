import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { executeCodeAgainstTestCases, type TestCaseInput } from "@/lib/code-runner";

const runCodeSchema = z.object({
  code: z.string().min(1, "Code cannot be empty"),
  language: z.enum(["javascript", "python", "js", "py"]).default("javascript"),
  questionId: z.string().optional(),
  customTestCases: z
    .array(
      z.object({
        input: z.string(),
        expectedOut: z.string(),
      }),
    )
    .optional(),
  token: z.string().optional(), // attempt invitation token
});

export async function POST(req: NextRequest) {
  try {
    const body = runCodeSchema.parse(await req.json());
    let testCasesToRun: TestCaseInput[] = [];

    if (body.questionId) {
      // Fetch public (visible) test cases from database
      const dbTestCases = await db.testCase.findMany({
        where: { questionId: body.questionId, isHidden: false },
        orderBy: { order: "asc" },
      });

      testCasesToRun = dbTestCases.map((tc) => ({
        id: tc.id,
        input: tc.input,
        expectedOut: tc.expectedOut,
        isHidden: false,
      }));
    }

    if (body.customTestCases && body.customTestCases.length > 0) {
      testCasesToRun = [
        ...testCasesToRun,
        ...body.customTestCases.map((tc) => ({
          input: tc.input,
          expectedOut: tc.expectedOut,
          isHidden: false,
        })),
      ];
    }

    // Default sample if no testcases provided
    if (testCasesToRun.length === 0) {
      testCasesToRun = [
        {
          input: "5",
          expectedOut: "10",
          isHidden: false,
        },
      ];
    }

    const result = await executeCodeAgainstTestCases(
      body.code,
      body.language,
      testCasesToRun,
    );

    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues }, { status: 400 });
    }
    console.error("Code execution error:", err);
    return NextResponse.json(
      { error: "Code execution runner failed" },
      { status: 500 },
    );
  }
}
