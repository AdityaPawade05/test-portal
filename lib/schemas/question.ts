import { z } from "zod";

export const QUESTION_TYPES = ["MCQ_SINGLE", "MCQ_MULTI", "NUMERIC", "LIKERT"] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];
export type OptionRow = { label: string; isCorrect: boolean };

export const optionSchema = z.object({
  label: z.string().min(1).max(500),
  isCorrect: z.boolean().default(false),
});

export const questionFieldsSchema = z.object({
  type: z.enum(QUESTION_TYPES),
  stem: z.string().min(1),
  mediaUrl: z.string().url().nullish(),
  tags: z.array(z.string()).default([]),
  options: z.array(optionSchema).default([]),
});

export function requireCorrectOptionForMcq(
  type: z.infer<typeof questionFieldsSchema>["type"],
  options: z.infer<typeof optionSchema>[],
) {
  if ((type === "MCQ_SINGLE" || type === "MCQ_MULTI") && !options.some((o) => o.isCorrect)) {
    return "MCQ questions need at least one correct option";
  }
  return null;
}
