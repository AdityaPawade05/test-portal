// Pool selection & question ordering for a section, run once when a candidate
// first reaches that section (spec section 3, "Test Assembly").

type SectionPool = {
  poolStrategy: "FIXED" | "RANDOM_POOL";
  questionIds: string[];
  questionCount: number;
};

export function assembleQuestionOrder(section: SectionPool): string[] {
  if (section.poolStrategy === "FIXED") {
    return section.questionIds.slice(0, section.questionCount);
  }

  // RANDOM_POOL: per-attempt random sample of questionCount from the pool.
  const shuffled = [...section.questionIds];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, section.questionCount);
}
