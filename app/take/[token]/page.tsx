"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { cn } from "@/lib/utils";
import type { CandidateScore } from "@/lib/candidate-serializer";
import { Spinner } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";
import { CheckIcon, ClockIcon, ExpandIcon, WarningIcon } from "@/components/ui/icons";
import { WebcamProctor } from "@/components/candidate/webcam-proctor";
import { CodeEditor, type TestCase } from "@/components/candidate/code-editor";

type CandidateOption = { id: string; label: string };
type CandidateQuestion = {
  id: string;
  type: "MCQ_SINGLE" | "MCQ_MULTI" | "NUMERIC" | "LIKERT" | "CODING";
  stem: string;
  mediaUrl: string | null;
  starterCode?: string | null;
  options: CandidateOption[];
  testCases?: TestCase[];
};

type NextResult =
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

type Phase =
  | "loading"
  | "expired"
  | "ready"
  | "in-progress"
  | "submitting"
  | "submitted"
  | "already-submitted"
  | "error";

function formatClock(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function TakeTestPage() {
  const { token } = useParams<{ token: string }>();

  const [phase, setPhase] = useState<Phase>("loading");
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [testName, setTestName] = useState("");
  const [sectionCount, setSectionCount] = useState(0);
  const [score, setScore] = useState<CandidateScore | null>(null);
  const [next, setNext] = useState<Extract<NextResult, { done: false }> | null>(null);
  const [remainingMs, setRemainingMs] = useState(0);
  const [chosenOptionIds, setChosenOptionIds] = useState<string[]>([]);
  const [numericValue, setNumericValue] = useState("");
  const [codeSubmission, setCodeSubmission] = useState("");
  const [codeLanguage, setCodeLanguage] = useState("javascript");
  const [testCasesPassed, setTestCasesPassed] = useState(0);
  const [testCasesTotal, setTestCasesTotal] = useState(0);
  const [submittingAnswer, setSubmittingAnswer] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [inFullscreen, setInFullscreen] = useState(true);
  const [webcamVerified, setWebcamVerified] = useState(false);

  const questionShownAt = useRef(0);
  const attemptIdRef = useRef<string | null>(null);
  const phaseRef = useRef<Phase>("loading");
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  const logEvent = useCallback((type: string, payload?: unknown) => {
    if (!attemptIdRef.current) return;
    fetch(`/api/attempt/${attemptIdRef.current}/event`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, payload }),
    }).catch(() => {});
  }, []);

  const fetchNext = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/attempt/${id}/next`);
      if (!res.ok) {
        setErrorMessage("Could not load the next question. Please try refreshing.");
        setPhase("error");
        return;
      }
      const data: NextResult = await res.json();

      if (data.done) {
        setPhase("submitting");
        try {
          const submitRes = await fetch(`/api/attempt/${id}/submit`, { method: "POST" });
          if (submitRes.ok) {
            const submitData = await submitRes.json();
            setScore(submitData.score ?? null);
            setPhase("submitted");
          } else {
            setErrorMessage("Could not submit your test. Please contact the organizer.");
            setPhase("error");
          }
        } catch {
          setErrorMessage("Network error while submitting your test.");
          setPhase("error");
        }
        return;
      }

      setNext(data);
      setRemainingMs(data.remainingMs);
      setChosenOptionIds([]);
      setNumericValue("");
      questionShownAt.current = Date.now();
      setPhase("in-progress");
    } catch (err) {
      console.error("[fetchNext] Error:", err);
      setErrorMessage("Network error while fetching the question.");
      setPhase("error");
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch(`/api/take/${token}`);
      if (cancelled) return;

      if (res.status === 410) {
        setPhase("expired");
        return;
      }
      if (!res.ok) {
        setErrorMessage("This invitation link is invalid.");
        setPhase("error");
        return;
      }

      const data = await res.json();
      setAttemptId(data.attemptId);
      attemptIdRef.current = data.attemptId;
      setTestName(data.testName);

      if (data.submitted) {
        setScore(data.score ?? null);
        setPhase("already-submitted");
        return;
      }
      setSectionCount(data.sectionCount ?? 0);
      setPhase("ready");
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  // Full-screen is requested from the "Start test" click — browsers require
  // a user gesture for it, which is also why the section timer can't start
  // until here (see the "ready" screen below): starting it on page load
  // would silently burn section time on network/render latency.
  async function beginTest() {
    let entered = false;
    if (document.fullscreenEnabled && !document.fullscreenElement) {
      try {
        await document.documentElement.requestFullscreen();
        entered = true;
      } catch {
        entered = false;
      }
    } else {
      entered = document.fullscreenElement != null;
    }
    setInFullscreen(entered);
    if (attemptId) await fetchNext(attemptId);
  }

  async function reenterFullscreen() {
    try {
      await document.documentElement.requestFullscreen();
    } catch {
      // best effort — exits are still recorded either way
    }
  }

  // Display-only countdown — the server re-derives the authoritative remaining
  // time from sectionStartedAt on every request; this just ticks the UI. When
  // the display clock hits zero, ask the server for the next question — it
  // will reject/auto-advance based on its own clock, not this one.
  useEffect(() => {
    if (phase !== "in-progress") return;
    const interval = setInterval(() => {
      setRemainingMs((ms) => {
        const next = Math.max(0, ms - 1000);
        if (next <= 0 && attemptId) fetchNext(attemptId);
        return next;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [phase, attemptId, fetchNext]);

  const [violationsCount, setViolationsCount] = useState(0);
  const [showViolationModal, setShowViolationModal] = useState(false);
  const [violationReason, setViolationReason] = useState("");

  const MAX_VIOLATIONS = 3;

  const triggerAutoSubmit = useCallback(
    async (reason: string) => {
      if (!attemptIdRef.current || phaseRef.current === "submitted" || phaseRef.current === "submitting") return;
      setErrorMessage(reason);
      setPhase("submitting");
      logEvent("AUTO_SUBMIT_VIOLATIONS", { reason });
      try {
        const submitRes = await fetch(`/api/attempt/${attemptIdRef.current}/submit`, { method: "POST" });
        if (submitRes.ok) {
          const submitData = await submitRes.json();
          setScore(submitData.score ?? null);
          setPhase("submitted");
        } else {
          setPhase("error");
        }
      } catch {
        setPhase("error");
      }
    },
    [logEvent]
  );

  const registerViolation = useCallback(
    (reason: string) => {
      if (phaseRef.current !== "in-progress") return;
      logEvent("PROCTORING_VIOLATION", { reason });
      setViolationReason(reason);
      setViolationsCount((prev) => {
        const nextCount = prev + 1;
        if (nextCount >= MAX_VIOLATIONS) {
          triggerAutoSubmit(`Assessment automatically submitted due to multiple proctoring violations (${nextCount}/${MAX_VIOLATIONS}).`);
        } else {
          setShowViolationModal(true);
        }
        return nextCount;
      });
    },
    [logEvent, triggerAutoSubmit]
  );

  // ── HTTPS Heartbeat Sync with API & Session Engine ────────────────────────
  useEffect(() => {
    if (phase !== "in-progress" || !attemptId) return;

    async function sendHeartbeat() {
      if (!attemptId) return;
      try {
        const res = await fetch(`/api/attempt/${attemptId}/heartbeat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fullscreen: document.fullscreenElement != null,
            tabFocused: document.visibilityState === "visible",
            webcamActive: webcamVerified,
            faceDetected: true,
            currentSection: next?.sectionIndex,
            questionId: next?.question?.id,
            timestamp: new Date().toISOString(),
          }),
        });

        if (res.ok) {
          const data = await res.json();
          if (data.shouldAutoSubmit) {
            triggerAutoSubmit("Section time limit expired");
          }
        }
      } catch (err) {
        console.warn("[Heartbeat] Sync failed:", err);
      }
    }

    const hbInterval = setInterval(sendHeartbeat, 12_000);
    sendHeartbeat();

    return () => clearInterval(hbInterval);
  }, [phase, attemptId, webcamVerified, next, triggerAutoSubmit]);

  useEffect(() => {
    function handleVisibility() {
      if (document.visibilityState === "hidden") {
        registerViolation("Switched browser tab or minimized window");
      }
    }
    function handleWindowBlur() {
      if (phaseRef.current === "in-progress") {
        registerViolation("Lost window focus (switched app or secondary monitor)");
      }
    }
    function handlePaste(e: ClipboardEvent) {
      e.preventDefault();
      logEvent("PASTE_PREVENTED");
    }
    function handleCopyCut(e: ClipboardEvent) {
      e.preventDefault();
      logEvent("COPY_CUT_PREVENTED");
    }
    function handleContextMenu(e: MouseEvent) {
      e.preventDefault();
      logEvent("RIGHT_CLICK_PREVENTED");
    }
    function handleSelectStart(e: Event) {
      // Allow input field selection, block test question selection
      const target = e.target as HTMLElement;
      if (target && target.tagName !== "INPUT" && target.tagName !== "TEXTAREA") {
        e.preventDefault();
      }
    }
    function handleDragStart(e: DragEvent) {
      e.preventDefault();
      logEvent("DRAG_PREVENTED");
    }
    function handleFullscreenChange() {
      const active = document.fullscreenElement != null;
      setInFullscreen(active);
      if (!active && phaseRef.current === "in-progress") {
        registerViolation("Exited full-screen mode");
      }
    }

    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("blur", handleWindowBlur);
    document.addEventListener("paste", handlePaste);
    document.addEventListener("copy", handleCopyCut);
    document.addEventListener("cut", handleCopyCut);
    document.addEventListener("contextmenu", handleContextMenu);
    document.addEventListener("selectstart", handleSelectStart);
    document.addEventListener("dragstart", handleDragStart);
    document.addEventListener("fullscreenchange", handleFullscreenChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("blur", handleWindowBlur);
      document.removeEventListener("paste", handlePaste);
      document.removeEventListener("copy", handleCopyCut);
      document.removeEventListener("cut", handleCopyCut);
      document.removeEventListener("contextmenu", handleContextMenu);
      document.removeEventListener("selectstart", handleSelectStart);
      document.removeEventListener("dragstart", handleDragStart);
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, [registerViolation, logEvent]);

  // Exit fullscreen cleanly on completion
  useEffect(() => {
    if (
      (phase === "submitted" ||
        phase === "already-submitted" ||
        phase === "expired" ||
        phase === "error") &&
      document.fullscreenElement
    ) {
      document.exitFullscreen().catch(() => {});
    }
  }, [phase]);

  // Keyboard shortcuts & Anti-DevTools / Anti-Screenshot guard
  useEffect(() => {
    if (phase !== "in-progress" || !next) return;

    function handleKeydown(e: KeyboardEvent) {
      const isCmdOrCtrl = e.ctrlKey || e.metaKey;
      const keyUpper = e.key.toUpperCase();

      // Guard against Screenshot (PrintScreen)
      if (e.key === "PrintScreen" || e.key === "Snapshot") {
        e.preventDefault();
        logEvent("PRINTSCREEN_ATTEMPT");
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText("").catch(() => {});
        }
        return;
      }

      // Guard against Developer Tools & Inspect Element shortcuts
      if (
        e.key === "F12" ||
        (isCmdOrCtrl && e.shiftKey && (keyUpper === "I" || keyUpper === "J" || keyUpper === "C")) ||
        (isCmdOrCtrl && (keyUpper === "U" || keyUpper === "S" || keyUpper === "P"))
      ) {
        e.preventDefault();
        logEvent("DEVTOOLS_ATTEMPT", { key: e.key });
        return;
      }

      if (e.key === "Enter" && next?.question.type !== "CODING") {
        e.preventDefault();
        submitAnswer();
        return;
      }

      if ((e.target as HTMLElement).tagName === "INPUT" || (e.target as HTMLElement).tagName === "TEXTAREA") return;

      const option = next!.question.options[Number(e.key) - 1];
      if (!option) return;

      if (next!.question.type === "MCQ_SINGLE") {
        setChosenOptionIds([option.id]);
      } else if (next!.question.type === "MCQ_MULTI" || next!.question.type === "LIKERT") {
        setChosenOptionIds((prev) =>
          prev.includes(option.id) ? prev.filter((x) => x !== option.id) : [...prev, option.id],
        );
      }
    }

    document.addEventListener("keydown", handleKeydown);
    return () => document.removeEventListener("keydown", handleKeydown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, next, logEvent]);

  async function submitAnswer() {
    if (!attemptId || !next) return;
    setSubmittingAnswer(true);
    setErrorMessage(null);

    const timeSpentMs = Date.now() - questionShownAt.current;
    try {
      const res = await fetch(`/api/attempt/${attemptId}/answer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          questionId: next.question.id,
          chosenOptionIds,
          numericValue: numericValue === "" ? undefined : Number(numericValue),
          codeSubmission: next.question.type === "CODING" ? codeSubmission : undefined,
          codeLanguage: next.question.type === "CODING" ? codeLanguage : undefined,
          testCasesPassed: next.question.type === "CODING" ? testCasesPassed : undefined,
          testCasesTotal: next.question.type === "CODING" ? testCasesTotal : undefined,
          timeSpentMs,
        }),
      });

      setSubmittingAnswer(false);
      await fetchNext(attemptId);
      if (!res.ok && res.status !== 409) {
        setErrorMessage("Could not save that answer — it may not have been recorded.");
      }
    } catch (err) {
      console.error("[submitAnswer] Error:", err);
      setSubmittingAnswer(false);
      setErrorMessage("Network error while saving answer.");
    }
  }

  if (phase === "loading") {
    return (
      <StatusScreen>
        <Spinner className="h-6 w-6 text-indigo-600" />
        <p className="text-slate-500">Loading your test…</p>
      </StatusScreen>
    );
  }
  if (phase === "expired") {
    return (
      <StatusScreen>
        <IconCircle tone="amber">
          <ClockIcon className="h-6 w-6" />
        </IconCircle>
        <p className="text-lg font-medium text-slate-900">This invitation has expired</p>
        <p className="text-sm text-slate-500">Contact the organizer for a new link.</p>
      </StatusScreen>
    );
  }
  if (phase === "error") {
    return (
      <StatusScreen>
        <IconCircle tone="red">
          <WarningIcon className="h-6 w-6" />
        </IconCircle>
        <p className="text-lg font-medium text-slate-900">{errorMessage || "Something went wrong"}</p>
        <Button variant="outline" onClick={() => window.location.reload()}>
          Retry
        </Button>
      </StatusScreen>
    );
  }
  if (phase === "already-submitted") {
    return (
      <StatusScreen>
        <IconCircle tone="emerald">
          <CheckIcon className="h-6 w-6" />
        </IconCircle>
        <p className="text-lg font-medium text-slate-900">Test already completed</p>
        <p className="text-sm text-slate-500">You submitted this assessment on a previous visit.</p>
        {score && <ScoreCard score={score} />}
      </StatusScreen>
    );
  }
  if (phase === "submitted") {
    return (
      <StatusScreen>
        <IconCircle tone="emerald">
          <CheckIcon className="h-6 w-6" />
        </IconCircle>
        <p className="text-lg font-medium text-slate-900">Test submitted</p>
        <p className="text-sm text-slate-500">Thanks for completing the assessment.</p>
        {score && <ScoreCard score={score} />}
      </StatusScreen>
    );
  }
  if (phase === "submitting") {
    return (
      <StatusScreen>
        <Spinner className="h-6 w-6 text-indigo-600" />
        <p className="text-slate-500">Submitting your test…</p>
      </StatusScreen>
    );
  }

  // Ready Phase: System Check & Verification
  if (phase === "ready") {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-slate-50 p-6">
        <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 font-bold text-indigo-600">
              🎓
            </span>
            <div>
              <h1 className="text-xl font-bold text-slate-900">{testName}</h1>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                {sectionCount} {sectionCount === 1 ? "Section" : "Sections"} • Proctored Assessment
              </p>
            </div>
          </div>

          <div className="mt-6 space-y-3 rounded-xl bg-slate-50 p-4 text-xs leading-relaxed text-slate-600">
            <h3 className="font-bold uppercase tracking-wider text-slate-900">Test & Anti-Cheat Rules:</h3>
            <ul className="list-disc space-y-1.5 pl-4">
              <li>You must grant <strong>Webcam permission</strong> for real-time AI proctoring.</li>
              <li>The test will automatically enter <strong>Full-Screen mode</strong>.</li>
              <li>Tab switching, window unfocusing, and prohibited items (cellphones, secondary screens) are flagged.</li>
              <li>Exceeding <strong>{MAX_VIOLATIONS} violations</strong> will auto-submit your test.</li>
            </ul>
          </div>

          {/* Verification webcam placeholder / starter */}
          <div className="mt-6 flex flex-col items-center justify-center rounded-xl border border-slate-200 bg-slate-900 p-4 text-center">
            <p className="text-xs font-medium text-slate-300 mb-3">
              Webcam AI Proctoring System Check:
            </p>
            {attemptId && (
              <WebcamProctor
                attemptId={attemptId}
                verified={webcamVerified}
                onVerified={() => setWebcamVerified(true)}
                onViolation={registerViolation}
              />
            )}
          </div>

          {errorMessage && (
            <p className="mt-4 rounded-lg bg-red-50 p-3 text-xs font-semibold text-red-700">{errorMessage}</p>
          )}

          <Button
            onClick={beginTest}
            disabled={!webcamVerified}
            className="mt-6 w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 text-sm rounded-xl shadow-md"
          >
            {webcamVerified ? "Enter Fullscreen & Begin Assessment →" : "Verify Webcam to Start..."}
          </Button>
        </div>
      </main>
    );
  }

  // Active in-progress phase
  if (!next) return null;
  const question = next.question;
  const sectionProgress = Math.round(((next.questionIndex + 1) / next.questionCount) * 100);

  return (
    <main className="flex min-h-screen flex-col bg-slate-50">
      {/* Dynamic Floating Webcam PiP HUD */}
      {attemptId && (
        <WebcamProctor
          attemptId={attemptId}
          verified={true}
          onViolation={registerViolation}
        />
      )}

      {/* Fullscreen Enforcer Impassable Barrier Overlay */}
      {!inFullscreen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/95 backdrop-blur-md p-6 text-center animate-in fade-in duration-200">
          <div className="max-w-md w-full bg-slate-900 border border-rose-500/40 rounded-3xl p-8 shadow-2xl space-y-6 text-white">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-500/20 text-rose-400 text-3xl border border-rose-500/30 animate-pulse">
              🔒
            </div>

            <div>
              <div className="inline-block px-3 py-1 rounded-full bg-rose-500/20 text-rose-300 text-xs font-bold uppercase tracking-wider mb-2 border border-rose-500/30">
                Fullscreen Enforcer Active
              </div>
              <h2 className="text-xl font-black tracking-tight text-white">
                Full-Screen Mode Required
              </h2>
              <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                You have exited full-screen mode. The assessment interface is locked and all questions are hidden until you return to full-screen mode.
              </p>
            </div>

            <div className="p-3.5 bg-slate-950/80 rounded-xl border border-slate-800 text-xs text-slate-400 font-mono text-left">
              <span className="text-amber-400 font-bold block mb-1">⚠️ Proctoring Notice:</span>
              Exiting full-screen triggers a security infraction log. Multiple infractions will cause automatic submission.
            </div>

            <button
              onClick={reenterFullscreen}
              className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 text-xs rounded-xl shadow-lg shadow-blue-600/30 transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <ExpandIcon className="h-4 w-4" />
              <span>Okay, Re-enter Full-Screen Mode</span>
            </button>
          </div>
        </div>
      )}

      {/* Header Bar */}
      <header className="border-b border-slate-200 bg-white shadow-xs sticky top-0 z-20">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-3.5">
          <div className="flex items-center gap-3">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-600 text-xs font-bold text-white">
              🎓
            </span>
            <div>
              <h2 className="text-sm font-bold text-slate-900 leading-tight">{testName}</h2>
              <span className="text-[11px] font-semibold text-indigo-600">
                Section {next.sectionIndex + 1}: {next.sectionName}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5 rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700">
              <span>Question {next.questionIndex + 1} of {next.questionCount}</span>
            </div>

            <div
              className={cn(
                "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-mono font-bold shadow-xs",
                remainingMs < 60000
                  ? "bg-rose-50 text-rose-700 border border-rose-200 animate-pulse"
                  : "bg-indigo-50 text-indigo-700 border border-indigo-100",
              )}
            >
              <ClockIcon className="h-4 w-4" />
              <span>{formatClock(remainingMs)}</span>
            </div>
          </div>
        </div>

        {/* Progress Bars */}
        {next.sectionCount > 1 && (
          <div className="mx-auto flex max-w-4xl gap-1.5 px-6 pt-1 pb-2">
            {Array.from({ length: next.sectionCount }).map((_, i) => (
              <span
                key={i}
                className={cn(
                  "h-1.5 flex-1 rounded-full transition-colors",
                  i < next.sectionIndex
                    ? "bg-indigo-600"
                    : i === next.sectionIndex
                      ? "bg-indigo-300"
                      : "bg-slate-100",
                )}
              />
            ))}
          </div>
        )}
        <div className="h-1 w-full bg-slate-100">
          <div
            className="h-1 bg-indigo-600 transition-all duration-300"
            style={{ width: `${sectionProgress}%` }}
          />
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col justify-center px-6 py-8">
        <div key={question.id} className="animate-fade-in select-none rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-100">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
              {question.type === "CODING" ? "💻 Coding Challenge" : question.type}
            </span>
            <span className="text-xs font-semibold text-slate-500">
              Question {next.questionIndex + 1} of {next.questionCount}
            </span>
          </div>

          <p className="text-base leading-relaxed text-slate-900 font-medium whitespace-pre-wrap">{question.stem}</p>
          {question.mediaUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={question.mediaUrl}
              alt=""
              className="mt-4 max-h-80 rounded-lg border border-slate-200"
            />
          )}

          {/* Question Interaction Area */}
          <div className="mt-6 flex flex-col gap-2.5">
            {question.type === "MCQ_SINGLE" &&
              question.options.map((o) => (
                <SelectableOption
                  key={o.id}
                  selected={chosenOptionIds[0] === o.id}
                  onClick={() => setChosenOptionIds([o.id])}
                  shape="round"
                >
                  {o.label}
                </SelectableOption>
              ))}

            {(question.type === "MCQ_MULTI" || question.type === "LIKERT") &&
              question.options.map((o) => (
                <SelectableOption
                  key={o.id}
                  selected={chosenOptionIds.includes(o.id)}
                  onClick={() =>
                    setChosenOptionIds((prev) =>
                      prev.includes(o.id) ? prev.filter((x) => x !== o.id) : [...prev, o.id],
                    )
                  }
                  shape="square"
                >
                  {o.label}
                </SelectableOption>
              ))}

            {question.type === "NUMERIC" && (
              <input
                type="number"
                value={numericValue}
                onChange={(e) => setNumericValue(e.target.value)}
                className="w-48 rounded-lg border border-slate-300 px-4 py-2.5 text-base shadow-sm focus:border-indigo-500 focus:outline-hidden focus:ring-4 focus:ring-indigo-500/10"
                autoFocus
              />
            )}

            {question.type === "CODING" && (
              <div className="mt-2">
                <CodeEditor
                  questionId={question.id}
                  starterCode={question.starterCode}
                  testCases={question.testCases}
                  onCodeChange={(code, lang, passed, total) => {
                    setCodeSubmission(code);
                    setCodeLanguage(lang);
                    setTestCasesPassed(passed);
                    setTestCasesTotal(total);
                  }}
                />
              </div>
            )}
          </div>

          {errorMessage && (
            <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{errorMessage}</p>
          )}

          <div className="mt-8 flex items-center justify-between pt-4 border-t border-slate-100">
            {question.type !== "NUMERIC" && question.type !== "CODING" ? (
              <p className="text-xs text-slate-400">
                Press 1–{question.options.length} to select · Enter to continue
              </p>
            ) : <div />}
            <Button
              onClick={submitAnswer}
              disabled={submittingAnswer}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-6 py-2.5 rounded-xl shadow-sm"
            >
              {submittingAnswer && <Spinner className="h-4 w-4 text-white mr-2" />}
              {submittingAnswer ? "Saving…" : "Submit & Continue →"}
            </Button>
          </div>
        </div>
      </div>

      {showViolationModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl text-center border border-rose-100">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-100 text-rose-600 text-2xl font-bold shadow-inner">
              ⚠️
            </div>
            <h3 className="mt-3 text-lg font-bold text-slate-900">
              Proctoring Violation Warning ({violationsCount}/{MAX_VIOLATIONS})
            </h3>
            <p className="mt-2 text-sm text-slate-600">
              An action violating test integrity rules was detected:
            </p>
            <p className="mt-1 rounded-xl bg-amber-50 border border-amber-200 p-2.5 text-xs font-semibold text-amber-900 shadow-xs">
              &quot;{violationReason}&quot;
            </p>
            <p className="mt-3 text-xs text-slate-500 leading-relaxed">
              Exceeding <span className="font-bold text-rose-600">{MAX_VIOLATIONS} violations</span> will result in the immediate automatic submission of your assessment attempt.
            </p>
            <Button
              className="mt-5 w-full bg-rose-600 hover:bg-rose-700 text-white font-bold py-2.5 rounded-xl shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
              onClick={() => {
                setShowViolationModal(false);
                reenterFullscreen();
              }}
            >
              <span>✓</span>
              <span>Okay, I Understand</span>
            </Button>
          </div>
        </div>
      )}
    </main>
  );
}

function SelectableOption({
  selected,
  onClick,
  children,
  shape,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
  shape: "round" | "square";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 rounded-lg border px-4 py-3 text-left text-sm transition-colors",
        selected
          ? "border-indigo-500 bg-indigo-50 text-indigo-900"
          : "border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-slate-50",
      )}
    >
      <span
        className={cn(
          "flex h-4 w-4 shrink-0 items-center justify-center border-2",
          shape === "round" ? "rounded-full" : "rounded",
          selected ? "border-indigo-600 bg-indigo-600" : "border-slate-300 bg-white",
        )}
      >
        {selected && (
          <svg viewBox="0 0 12 12" className="h-2.5 w-2.5 fill-white">
            <path d="M4.6 8.6 2 6l-1 1 3.6 3.6L11 3.2l-1-1z" />
          </svg>
        )}
      </span>
      {children}
    </button>
  );
}

function StatusScreen({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-slate-50 p-8 text-center">
      {children}
    </main>
  );
}

function IconCircle({
  tone,
  children,
}: {
  tone: "emerald" | "amber" | "red";
  children: React.ReactNode;
}) {
  const tones = {
    emerald: "bg-emerald-50 text-emerald-600",
    amber: "bg-amber-50 text-amber-600",
    red: "bg-red-50 text-red-600",
  };
  return (
    <span className={cn("flex h-12 w-12 items-center justify-center rounded-full", tones[tone])}>
      {children}
    </span>
  );
}

function ScoreCard({ score }: { score: CandidateScore }) {
  return (
    <div className="mt-4 w-full max-w-sm rounded-xl border border-slate-200 bg-white p-5 text-left shadow-sm">
      <p className="text-xs text-slate-400">
        Assessment score summary:
      </p>
      <div className="mt-3 flex items-center justify-between">
        <span className="text-sm font-medium text-slate-700">Raw Total Score</span>
        <span className="text-lg font-bold text-slate-900">{score.rawTotal}</span>
      </div>
      {score.passed !== null && (
        <div className="mt-2 flex items-center justify-between">
          <span className="text-sm font-medium text-slate-700">Result</span>
          <span
            className={cn(
              "text-sm font-semibold",
              score.passed ? "text-emerald-600" : "text-red-600",
            )}
          >
            {score.passed ? "Passed" : "Not passed"}
          </span>
        </div>
      )}
      {score.sections && score.sections.length > 0 && (
        <div className="mt-4 border-t border-slate-200 pt-3">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
            Section Breakdown
          </p>
          <ul className="mt-2 space-y-1.5">
            {score.sections.map((s) => (
              <li key={s.name} className="flex items-center justify-between text-sm">
                <span className="text-slate-600">{s.name}</span>
                <span className="font-medium text-slate-900">{s.raw}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
