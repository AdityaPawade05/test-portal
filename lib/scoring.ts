import { db } from "@/lib/db";
import { calculatePercentileRank } from "@/lib/psychometrics";

type SectionState = {
  sectionStartedAt: number;
  timeLimitSec: number;
  servedQuestionIds: string[];
};

// Raw scoring only — see spec section 6. No percentile until a real norm
// group exists (Phase 3+); Score.percentile is simply never written here.
export async function computeScore(attemptId: string) {
  const attempt = await db.attempt.findUniqueOrThrow({
    where: { id: attemptId },
    include: {
      responses: true,
      invitation: {
        include: { test: { include: { sections: { orderBy: { order: "asc" } } } } },
      },
    },
  });

  const sectionState = (attempt.sectionState ?? {}) as Record<
    string,
    SectionState
  >;
  const sections = attempt.invitation.test.sections;

  const servedIds = new Set<string>();
  for (const section of sections) {
    const state = sectionState[String(section.order)];
    if (state) for (const qid of state.servedQuestionIds) servedIds.add(qid);
  }

  const questions = await db.question.findMany({
    where: { id: { in: [...servedIds] } },
    include: { options: true },
  });
  const questionsById = new Map(questions.map((q) => [q.id, q]));
  const responseByQuestionId = new Map(
    attempt.responses.map((r) => [r.questionId, r]),
  );

  const rawBySection: Record<string, number> = {};
  let rawTotal = 0;
  let maxPossible = 0;

  for (const section of sections) {
    const state = sectionState[String(section.order)];
    if (!state) continue;

    let sectionScore = 0;
    let sectionMax = 0;

    for (const qid of state.servedQuestionIds) {
      const question = questionsById.get(qid);
      if (!question) continue;
      if (question.type === "LIKERT") {
        const sortedOptions = [...question.options].sort((a, b) => a.order - b.order);
        const maxPoints = sortedOptions.length > 0
          ? Math.max(...sortedOptions.map((o) => o.order + 1))
          : 5;
        sectionMax += maxPoints;

        const chosenOptionId = responseByQuestionId.get(qid)?.chosenOptionIds?.[0];
        if (chosenOptionId) {
          const chosenOption = sortedOptions.find((o) => o.id === chosenOptionId);
          if (chosenOption) {
            sectionScore += chosenOption.order + 1;
          }
        }
        continue;
      }

      if (question.type !== "MCQ_SINGLE" && question.type !== "MCQ_MULTI") {
        continue;
      }

      sectionMax += 1;
      const correctIds = question.options
        .filter((o) => o.isCorrect)
        .map((o) => o.id)
        .sort();
      const chosenIds = [
        ...(responseByQuestionId.get(qid)?.chosenOptionIds ?? []),
      ].sort();
      const isCorrect =
        correctIds.length === chosenIds.length &&
        correctIds.every((id, i) => id === chosenIds[i]);
      if (isCorrect) sectionScore += 1;
    }

    rawBySection[section.id] = sectionScore;
    rawTotal += sectionScore;
    maxPossible += sectionMax;
  }

  const cutoffPercent = attempt.invitation.test.cutoffPercent;
  const passed =
    cutoffPercent != null && maxPossible > 0
      ? (rawTotal / maxPossible) * 100 >= cutoffPercent
      : null;

  // Phase 3 Norming Engine: calculate empirical percentile rank
  const existingScores = await db.score.findMany({
    where: {
      attempt: {
        invitation: { testId: attempt.invitation.testId },
      },
    },
    select: { rawTotal: true },
  });

  const normGroup = existingScores.map((s) => s.rawTotal);
  const percentile = calculatePercentileRank(normGroup, rawTotal);

  return db.score.upsert({
    where: { attemptId },
    create: { attemptId, rawBySection, rawTotal, percentile, passed },
    update: { rawBySection, rawTotal, percentile, passed, computedAt: new Date() },
  });
}
