// Security boundary: every question object sent to the candidate must pass
// through this. isCorrect and difficulty must never leak via network inspection.

type OptionRecord = {
  id: string;
  label: string;
  order: number;
  isCorrect: boolean;
};

type QuestionRecord = {
  id: string;
  type: string;
  stem: string;
  mediaUrl: string | null;
  options: OptionRecord[];
};

export type CandidateOption = {
  id: string;
  label: string;
};

export type CandidateQuestion = {
  id: string;
  type: string;
  stem: string;
  mediaUrl: string | null;
  options: CandidateOption[];
};

export function serializeQuestionForCandidate(
  question: QuestionRecord,
): CandidateQuestion {
  return {
    id: question.id,
    type: question.type,
    stem: question.stem,
    mediaUrl: question.mediaUrl,
    options: [...question.options]
      .sort((a, b) => a.order - b.order)
      .map((o) => ({ id: o.id, label: o.label })),
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
