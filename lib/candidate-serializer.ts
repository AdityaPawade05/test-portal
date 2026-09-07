// Security boundary: every question object sent to the candidate must pass
// through this. isCorrect and difficulty must never leak via network inspection.

type OptionRecord = {
  id: string;
  label: string;
  order: number;
  isCorrect: boolean;
};

type TestCaseRecord = {
  id: string;
  input: string;
  expectedOut: string;
  isHidden: boolean;
  order: number;
};

type QuestionRecord = {
  id: string;
  type: string;
  stem: string;
  mediaUrl: string | null;
  starterCode?: string | null;
  options: OptionRecord[];
  testCases?: TestCaseRecord[];
};

export type CandidateOption = {
  id: string;
  label: string;
};

export type CandidateTestCase = {
  id: string;
  input: string;
  expectedOut: string;
  order: number;
};

export type CandidateQuestion = {
  id: string;
  type: string;
  stem: string;
  mediaUrl: string | null;
  starterCode?: string | null;
  options: CandidateOption[];
  testCases?: CandidateTestCase[];
};

export function serializeQuestionForCandidate(
  question: QuestionRecord,
): CandidateQuestion {
  return {
    id: question.id,
    type: question.type,
    stem: question.stem,
    mediaUrl: question.mediaUrl,
    starterCode: question.starterCode || null,
    options: [...(question.options || [])]
      .sort((a, b) => a.order - b.order)
      .map((o) => ({ id: o.id, label: o.label })),
    testCases: (question.testCases || [])
      .filter((tc) => !tc.isHidden)
      .sort((a, b) => a.order - b.order)
      .map((tc) => ({
        id: tc.id,
        input: tc.input,
        expectedOut: tc.expectedOut,
        order: tc.order,
      })),
  };
}

// Same boundary applies to scores: rawBySection is keyed by internal section
// id and Score carries no per-question detail, but route this through one
// place anyway so a future field never leaks by accident.
export type CandidateScore = {
  rawTotal: number;
  passed: boolean | null;
  sections: { name: string; raw: number }[];
};

export function serializeScoreForCandidate(
  score: { rawTotal: number; passed: boolean | null; rawBySection: unknown },
  sections: { id: string; name: string; order: number }[],
): CandidateScore {
  const rawBySection = score.rawBySection as Record<string, number>;
  return {
    rawTotal: score.rawTotal,
    passed: score.passed,
    sections: [...sections]
      .sort((a, b) => a.order - b.order)
      .map((s) => ({ name: s.name, raw: rawBySection[s.id] ?? 0 })),
  };
}
