// Pool selection & question ordering for a section, run once when a candidate
// first reaches that section (spec section 3, "Test Assembly").

type SectionPool = {
  poolStrategy: "FIXED" | "RANDOM_POOL";
  questionIds: string[];
  questionCount: number;
};

/**
 * Deterministic pseudo-random generator from seed string
 */
function createSeededRandom(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  return function () {
    hash = Math.sin(hash++) * 10000;
    return hash - Math.floor(hash);
  };
}

export function assembleQuestionOrder(
  section: SectionPool,
  seed?: string,
): string[] {
  if (section.poolStrategy === "FIXED") {
    return section.questionIds.slice(0, section.questionCount);
  }

  // RANDOM_POOL: per-attempt random sample of questionCount from the pool
  const random = seed ? createSeededRandom(seed) : Math.random;
  const shuffled = [...section.questionIds];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, section.questionCount);
}
