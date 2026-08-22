import { db } from "@/lib/db";
import { redis } from "@/lib/redis";
import { assembleQuestionOrder } from "@/lib/assembly";
import {
  serializeQuestionForCandidate,
  type CandidateQuestion,
} from "@/lib/candidate-serializer";

// The Timing/Session Engine — spec section 5. Non-negotiable rules:
// server time is the sole source of truth, no pausing within a section,
// and every write here is idempotent so retries/duplicate requests are safe.

type SectionState = {
  sectionStartedAt: number; // server epoch ms
  timeLimitSec: number;
  servedQuestionIds: string[];
  cursor: number;
};

function redisKey(attemptId: string, sectionOrder: number) {
  return `attempt:${attemptId}:section:${sectionOrder}`;
}

function lockKey(attemptId: string, questionId: string) {
  return `lock:${attemptId}:${questionId}`;
}

async function loadContext(attemptId: string) {
  return db.attempt.findUniqueOrThrow({
    where: { id: attemptId },
    include: {
      invitation: {
        include: {
          test: { include: { sections: { orderBy: { order: "asc" } } } },
        },
      },
      responses: true,
    },
  });
}

// Durable mirror lives in Attempt.sectionState (see schema comment). Only
// sectionStartedAt/timeLimitSec/servedQuestionIds are persisted there —
// cursor is re-derived from Response rows on rehydration, per the spec's
// "Redis durability caveat" (section 13): Response is the append-only truth.
async function getOrInitSectionState(
  attemptId: string,
  section: {
    id: string;
    order: number;
    timeLimitSec: number;
    poolStrategy: "FIXED" | "RANDOM_POOL";
    questionIds: string[];
    questionCount: number;
  },
  responses: { questionId: string }[],
  durableSectionState: Record<string, Omit<SectionState, "cursor">>,
): Promise<SectionState> {
  const key = redisKey(attemptId, section.order);
  const cached = await redis.get(key);
  if (cached) return JSON.parse(cached) as SectionState;

  const durable = durableSectionState[String(section.order)];
  if (durable) {
    const answeredIds = new Set(responses.map((r) => r.questionId));
    const cursor = durable.servedQuestionIds.filter((id) =>
      answeredIds.has(id),
    ).length;
    const state: SectionState = { ...durable, cursor };
    await redis.set(key, JSON.stringify(state));
    return state;
  }

  // Brand new section for this attempt.
  const servedQuestionIds = assembleQuestionOrder(section);
  const state: SectionState = {
    sectionStartedAt: Date.now(),
    timeLimitSec: section.timeLimitSec,
    servedQuestionIds,
    cursor: 0,
  };

  await db.attempt.update({
    where: { id: attemptId },
    data: {
      sectionState: {
        ...durableSectionState,
        [String(section.order)]: {
          sectionStartedAt: state.sectionStartedAt,
          timeLimitSec: state.timeLimitSec,
          servedQuestionIds: state.servedQuestionIds,
        },
      },
    },
  });
  await redis.set(key, JSON.stringify(state));
  return state;
}

async function advanceSection(attemptId: string, fromOrder: number) {
  await redis.del(redisKey(attemptId, fromOrder));
  await db.attempt.update({
    where: { id: attemptId },
    data: { currentSection: { increment: 1 } },
  });
}

export type NextQuestionResult =
  | { done: true }
  | {
      done: false;
      question: CandidateQuestion;
      remainingMs: number;
      sectionName: string;
      sectionIndex: number;
      sectionCount: number;
      questionIndex: number;
      questionCount: number;
    };

export async function getNextQuestion(
  attemptId: string,
): Promise<NextQuestionResult> {
  for (;;) {
    const attempt = await loadContext(attemptId);
    const sections = attempt.invitation.test.sections;

    if (attempt.submittedAt || attempt.currentSection >= sections.length) {
      return { done: true };
    }

    const section = sections[attempt.currentSection];
    const durable = (attempt.sectionState ?? {}) as Record<
      string,
      Omit<SectionState, "cursor">
    >;
    const state = await getOrInitSectionState(
      attemptId,
      section,
      attempt.responses,
      durable,
    );

    const elapsed = Date.now() - state.sectionStartedAt;
    if (elapsed >= state.timeLimitSec * 1000) {
      await advanceSection(attemptId, section.order);
      continue;
    }
    if (state.cursor >= state.servedQuestionIds.length) {
      await advanceSection(attemptId, section.order);
      continue;
    }

    const questionId = state.servedQuestionIds[state.cursor];
    const question = await db.question.findUniqueOrThrow({
      where: { id: questionId },
      include: { options: true },
    });

    return {
      done: false,
      question: serializeQuestionForCandidate(question),
      remainingMs: state.timeLimitSec * 1000 - elapsed,
      sectionName: section.name,
      sectionIndex: attempt.currentSection,
      sectionCount: sections.length,
      questionIndex: state.cursor,
      questionCount: state.servedQuestionIds.length,
    };
  }
}

export type SubmitAnswerResult =
  | { status: "ok" }
  | { status: "section_expired" }
  | { status: "not_current_question" };

export async function submitAnswer(
  attemptId: string,
  questionId: string,
  payload: { chosenOptionIds?: string[]; numericValue?: number; timeSpentMs: number },
): Promise<SubmitAnswerResult> {
  const attempt = await loadContext(attemptId);
  const sections = attempt.invitation.test.sections;

  if (attempt.submittedAt || attempt.currentSection >= sections.length) {
    return { status: "not_current_question" };
  }

  const section = sections[attempt.currentSection];
  const durable = (attempt.sectionState ?? {}) as Record<
    string,
    Omit<SectionState, "cursor">
  >;
  const state = await getOrInitSectionState(
    attemptId,
    section,
    attempt.responses,
    durable,
  );

  const elapsed = Date.now() - state.sectionStartedAt;
  if (elapsed >= state.timeLimitSec * 1000) {
    return { status: "section_expired" };
  }

  // Idempotent write regardless of lock/race outcome — safe to upsert even
  // if this is a client retry of an already-recorded answer.
  await db.response.upsert({
    where: { attemptId_questionId: { attemptId, questionId } },
    create: {
      attemptId,
      questionId,
      chosenOptionIds: payload.chosenOptionIds ?? [],
      numericValue: payload.numericValue,
      timeSpentMs: payload.timeSpentMs,
    },
    update: {
      chosenOptionIds: payload.chosenOptionIds ?? [],
      numericValue: payload.numericValue,
      timeSpentMs: payload.timeSpentMs,
    },
  });

  // Only advance the cursor if this answer is for the expected next
  // question, guarded by a short lock to prevent a double-click racing
  // itself into a double-advance.
  if (state.servedQuestionIds[state.cursor] !== questionId) {
    return { status: "ok" };
  }

  const lock = lockKey(attemptId, questionId);
  const acquired = await redis.set(lock, "1", "PX", 5000, "NX");
  if (!acquired) return { status: "ok" };

  try {
    const fresh = await redis.get(redisKey(attemptId, section.order));
    const freshState: SectionState = fresh
      ? JSON.parse(fresh)
      : { ...state };
    if (freshState.servedQuestionIds[freshState.cursor] === questionId) {
      freshState.cursor += 1;
      await redis.set(
        redisKey(attemptId, section.order),
        JSON.stringify(freshState),
      );
    }
  } finally {
    await redis.del(lock);
  }

  return { status: "ok" };
}

export async function logProctoringEvent(
  attemptId: string,
  type: string,
  payload?: unknown,
) {
  await db.proctoringEvent.create({
    data: { attemptId, type, payload: payload as never },
  });
}
