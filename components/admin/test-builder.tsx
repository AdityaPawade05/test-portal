"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import {
  ChevronDownIcon,
  ChevronUpIcon,
  PencilIcon,
  TrashIcon,
  UploadIcon,
  PlusIcon,
  XIcon,
  DownloadIcon,
  CheckIcon,
} from "@/components/ui/icons";
import {
  QuestionFields,
  type OptionRow,
  type QuestionType,
} from "@/components/admin/question-fields";
import { DeviceQuestionUploadModal } from "./device-question-upload-modal";

export type QuestionOption = {
  id?: string;
  label: string;
  isCorrect: boolean;
  order?: number;
};

export type Question = {
  id: string;
  stem: string;
  type: string;
  tags?: string[];
  createdAt?: string | Date;
  options?: QuestionOption[];
};

export type Bank = {
  id: string;
  name: string;
  questions: Question[];
};

export type Section = {
  id?: string;
  name: string;
  order: number;
  timeLimitSec: number;
  questionCount: number;
  poolStrategy: "FIXED" | "RANDOM_POOL";
  questionIds: string[];
};

export type TestData = {
  id: string;
  name: string;
  published: boolean;
  cutoffPercent: number | null;
  invitationCount: number;
  sections: Section[];
};

const EMPTY_FORM = {
  name: "",
  time: 600,
  strategy: "FIXED" as const,
  randomCount: 1,
};

const TIME_PRESETS = [
  { label: "5 min", sec: 300 },
  { label: "10 min", sec: 600 },
  { label: "15 min", sec: 900 },
  { label: "20 min", sec: 1200 },
  { label: "30 min", sec: 1800 },
  { label: "45 min", sec: 2700 },
  { label: "60 min", sec: 3600 },
];

/**
 * Determines whether a question was uploaded via file/device or manually typed
 */
export function getQuestionOrigin(question: Question): "UPLOADED" | "TYPED" {
  const tags = (question.tags || []).map((t) => t.toLowerCase());
  if (
    tags.some(
      (t) =>
        t === "uploaded" ||
        t === "source:uploaded" ||
        t === "bulk" ||
        t === "imported" ||
        t === "file" ||
        t === "device" ||
        t.startsWith("file:")
    )
  ) {
    return "UPLOADED";
  }
  return "TYPED";
}

function formatDuration(sec: number): string {
  if (sec <= 0) return "0s";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m > 0 && s > 0) return `${m}m ${s}s`;
  if (m > 0) return `${m} min${m > 1 ? "s" : ""}`;
  return `${s} sec${s > 1 ? "s" : ""}`;
}

export function TestBuilder({ test, banks: initialBanks }: { test: TestData; banks: Bank[] }) {
  const router = useRouter();
  const [banks, setBanks] = useState<Bank[]>(initialBanks);
  const [sections, setSections] = useState<Section[]>(test.sections);
  const [cutoffPercent, setCutoffPercent] = useState<string>(
    test.cutoffPercent?.toString() ?? "",
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Section Form state
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [newSectionName, setNewSectionName] = useState(EMPTY_FORM.name);
  const [newSectionTime, setNewSectionTime] = useState<number>(EMPTY_FORM.time);
  const [newSectionStrategy, setNewSectionStrategy] = useState<"FIXED" | "RANDOM_POOL">(
    EMPTY_FORM.strategy,
  );
  const [selectedBankId, setSelectedBankId] = useState(banks[0]?.id ?? "");
  const [selectedQuestionIds, setSelectedQuestionIds] = useState<string[]>([]);
  const [randomCount, setRandomCount] = useState(EMPTY_FORM.randomCount);

  // Question Selector Filters & Search
  const [searchQuery, setSearchQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState<"ALL" | "UPLOADED" | "TYPED" | "SELECTED">("ALL");
  const [typeFilter, setTypeFilter] = useState<string>("ALL");
  const [expandedQuestionIds, setExpandedQuestionIds] = useState<Set<string>>(new Set());

  // Test Delete Confirmation
  const [confirmingDeleteTest, setConfirmingDeleteTest] = useState(false);
  const [deletingTest, setDeletingTest] = useState(false);

  // Quick Question creation modals inside Section builder
  const [showDeviceUpload, setShowDeviceUpload] = useState(false);
  const [showWriteQuestion, setShowWriteQuestion] = useState(false);

  // Write question form state
  const [writeType, setWriteType] = useState<QuestionType>("MCQ_SINGLE");
  const [writeStem, setWriteStem] = useState("");
  const [writeMediaUrl, setWriteMediaUrl] = useState("");
  const [writeTags, setWriteTags] = useState("");
  const [writeOptions, setWriteOptions] = useState<OptionRow[]>([
    { label: "", isCorrect: false },
    { label: "", isCorrect: false },
  ]);
  const [writingQuestion, setWritingQuestion] = useState(false);
  const [writeError, setWriteError] = useState<string | null>(null);

  const selectedBank = banks.find((b) => b.id === selectedBankId);

  // Filter questions for the selected bank
  const bankQuestions = selectedBank?.questions || [];

  const questionStats = useMemo(() => {
    let uploaded = 0;
    let typed = 0;
    for (const q of bankQuestions) {
      if (getQuestionOrigin(q) === "UPLOADED") uploaded++;
      else typed++;
    }
    return { total: bankQuestions.length, uploaded, typed };
  }, [bankQuestions]);

  const filteredQuestions = useMemo(() => {
    return bankQuestions.filter((q) => {
      const origin = getQuestionOrigin(q);
      if (sourceFilter === "UPLOADED" && origin !== "UPLOADED") return false;
      if (sourceFilter === "TYPED" && origin !== "TYPED") return false;
      if (sourceFilter === "SELECTED" && !selectedQuestionIds.includes(q.id)) return false;
      if (typeFilter !== "ALL" && q.type !== typeFilter) return false;
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const stemMatch = q.stem.toLowerCase().includes(query);
        const tagMatch = (q.tags || []).some((t) => t.toLowerCase().includes(query));
        const optionMatch = (q.options || []).some((o) => o.label.toLowerCase().includes(query));
        if (!stemMatch && !tagMatch && !optionMatch) return false;
      }
      return true;
    });
  }, [bankQuestions, sourceFilter, typeFilter, searchQuery, selectedQuestionIds]);

  // Selected questions breakdown
  const selectedCounts = useMemo(() => {
    const selectedSet = new Set(selectedQuestionIds);
    let uploaded = 0;
    let typed = 0;
    for (const q of bankQuestions) {
      if (selectedSet.has(q.id)) {
        if (getQuestionOrigin(q) === "UPLOADED") uploaded++;
        else typed++;
      }
    }
    return { total: selectedQuestionIds.length, uploaded, typed };
  }, [bankQuestions, selectedQuestionIds]);

  // Total assessment stats
  const totalTimeSec = sections.reduce((sum, s) => sum + s.timeLimitSec, 0);
  const totalQuestions = sections.reduce((sum, s) => sum + s.questionCount, 0);

  async function fetchUpdatedBank(bankId: string) {
    const res = await fetch(`/api/banks/${bankId}`);
    if (res.ok) {
      const data = await res.json();
      if (data.bank) {
        setBanks((prev) =>
          prev.map((b) =>
            b.id === bankId
              ? {
                  ...b,
                  questions: data.bank.questions.map((q: any) => ({
                    id: q.id,
                    stem: q.stem,
                    type: q.type,
                    tags: q.tags,
                    createdAt: q.createdAt,
                    options: q.options,
                  })),
                }
              : b,
          ),
        );
        return data.bank.questions as { id: string }[];
      }
    }
    return null;
  }

  async function saveSections(next: Section[]) {
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/tests/${test.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sections: next }),
    });
    setSaving(false);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(body?.error ?? "Could not save.");
      return;
    }
    setSections(next);
    router.refresh();
  }

  function toggleQuestion(id: string) {
    setSelectedQuestionIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function selectAllFiltered() {
    const ids = filteredQuestions.map((q) => q.id);
    setSelectedQuestionIds((prev) => Array.from(new Set([...prev, ...ids])));
  }

  function selectUploadedOnly() {
    const ids = bankQuestions.filter((q) => getQuestionOrigin(q) === "UPLOADED").map((q) => q.id);
    setSelectedQuestionIds((prev) => Array.from(new Set([...prev, ...ids])));
  }

  function selectTypedOnly() {
    const ids = bankQuestions.filter((q) => getQuestionOrigin(q) === "TYPED").map((q) => q.id);
    setSelectedQuestionIds((prev) => Array.from(new Set([...prev, ...ids])));
  }

  function deselectAllFiltered() {
    const idsToDeselect = new Set(filteredQuestions.map((q) => q.id));
    setSelectedQuestionIds((prev) => prev.filter((id) => !idsToDeselect.has(id)));
  }

  function toggleExpandQuestion(id: string) {
    setExpandedQuestionIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function resetForm() {
    setEditingIndex(null);
    setNewSectionName(EMPTY_FORM.name);
    setNewSectionTime(EMPTY_FORM.time);
    setNewSectionStrategy(EMPTY_FORM.strategy);
    setSelectedQuestionIds([]);
    setRandomCount(EMPTY_FORM.randomCount);
    setSearchQuery("");
    setSourceFilter("ALL");
    setTypeFilter("ALL");
  }

  function startEditSection(index: number) {
    const s = sections[index];
    setEditingIndex(index);
    setNewSectionName(s.name);
    setNewSectionTime(s.timeLimitSec);
    setNewSectionStrategy(s.poolStrategy);
    setRandomCount(s.poolStrategy === "RANDOM_POOL" ? s.questionCount : 1);
    setSelectedQuestionIds(s.questionIds);
    const matchingBank = banks.find((b) =>
      s.questionIds.every((id) => b.questions.some((q) => q.id === id)),
    );
    setSelectedBankId(matchingBank?.id ?? banks[0]?.id ?? "");
    window.scrollTo({ top: document.getElementById("section-editor-anchor")?.offsetTop || 600, behavior: "smooth" });
  }

  async function submitSectionForm() {
    if (!newSectionName.trim() || selectedQuestionIds.length === 0) return;
    const questionCount =
      newSectionStrategy === "FIXED" ? selectedQuestionIds.length : randomCount;

    if (editingIndex !== null) {
      const next = sections.map((s, i) =>
        i === editingIndex
          ? {
              ...s,
              name: newSectionName.trim(),
              timeLimitSec: newSectionTime,
              questionCount,
              poolStrategy: newSectionStrategy,
              questionIds: selectedQuestionIds,
            }
          : s,
      );
      await saveSections(next);
    } else {
      const section: Section = {
        name: newSectionName.trim(),
        order: sections.length,
        timeLimitSec: newSectionTime,
        questionCount,
        poolStrategy: newSectionStrategy,
        questionIds: selectedQuestionIds,
      };
      await saveSections([...sections, section]);
    }
    resetForm();
  }

  async function removeSection(index: number) {
    const next = sections
      .filter((_, i) => i !== index)
      .map((s, i) => ({ ...s, order: i }));
    await saveSections(next);
    if (editingIndex === index) resetForm();
  }

  async function moveSection(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= sections.length) return;
    const next = [...sections];
    [next[index], next[target]] = [next[target], next[index]];
    await saveSections(next.map((s, i) => ({ ...s, order: i })));
    if (editingIndex === index) setEditingIndex(target);
    else if (editingIndex === target) setEditingIndex(index);
  }

  async function saveCutoff() {
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/tests/${test.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cutoffPercent: cutoffPercent === "" ? null : Number(cutoffPercent),
      }),
    });
    setSaving(false);
    if (!res.ok) setError("Could not save cutoff.");
    router.refresh();
  }

  async function togglePublish() {
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/tests/${test.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ published: !test.published }),
    });
    setSaving(false);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(body?.error ?? "Could not update.");
      return;
    }
    router.refresh();
  }

  async function handleDeleteTest() {
    setDeletingTest(true);
    setError(null);
    const res = await fetch(`/api/tests/${test.id}`, { method: "DELETE" });
    setDeletingTest(false);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(typeof body?.error === "string" ? body.error : "Could not delete test.");
      setConfirmingDeleteTest(false);
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  // Handle Quick Write Question Submit
  async function handleWriteQuestionSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedBankId) return;
    setWritingQuestion(true);
    setWriteError(null);

    const res = await fetch("/api/questions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bankId: selectedBankId,
        type: writeType,
        stem: writeStem,
        mediaUrl: writeMediaUrl || null,
        tags: Array.from(
          new Set([
            ...writeTags
              .split(",")
              .map((t) => t.trim())
              .filter(Boolean),
            "typed",
          ]),
        ),
        options: writeType !== "NUMERIC" ? writeOptions.filter((o) => o.label.trim()) : [],
      }),
    });

    setWritingQuestion(false);

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setWriteError(
        typeof body?.error === "string"
          ? body.error
          : (body?.error?.[0]?.message ?? "Could not create question."),
      );
      return;
    }

    const data = await res.json();
    const createdId = data.question?.id;

    // Refresh bank & select newly created question
    const updatedQuestions = await fetchUpdatedBank(selectedBankId);
    if (createdId) {
      setSelectedQuestionIds((prev) => Array.from(new Set([...prev, createdId])));
    } else if (updatedQuestions?.length) {
      setSelectedQuestionIds((prev) => Array.from(new Set([...prev, ...updatedQuestions.map((q) => q.id)])));
    }

    // Reset write form & close modal
    setWriteStem("");
    setWriteMediaUrl("");
    setWriteTags("");
    setWriteOptions([
      { label: "", isCorrect: false },
      { label: "", isCorrect: false },
    ]);
    setShowWriteQuestion(false);
    router.refresh();
  }

  // Handle Questions Imported from Device Modal
  async function handleDeviceQuestionsImported(createdIds: string[]) {
    if (!selectedBankId) return;
    const updatedQuestions = await fetchUpdatedBank(selectedBankId);
    if (createdIds.length > 0) {
      setSelectedQuestionIds((prev) => Array.from(new Set([...prev, ...createdIds])));
    } else if (updatedQuestions?.length) {
      setSelectedQuestionIds((prev) => Array.from(new Set([...prev, ...updatedQuestions.map((q) => q.id)])));
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-8">
      {/* ─── 1. ASSESSMENT SUMMARY & STATUS HERO CARD ─── */}
      <Card className="overflow-hidden border border-slate-200/90 shadow-sm rounded-2xl bg-gradient-to-b from-white to-slate-50/50">
        <div className="p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-5">
            <div className="flex items-center gap-3 flex-wrap">
              <div
                className={`flex h-10 w-10 items-center justify-center rounded-xl font-bold text-lg shadow-inner ${
                  test.published
                    ? "bg-emerald-100 text-emerald-700 ring-2 ring-emerald-300"
                    : "bg-amber-100 text-amber-700 ring-2 ring-amber-300"
                }`}
              >
                {test.published ? "✓" : "✎"}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-bold text-slate-900">{test.name}</h2>
                  <Badge variant={test.published ? "success" : "neutral"} className="font-bold">
                    {test.published ? "Live / Published" : "Draft Mode"}
                  </Badge>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  {test.published
                    ? "Assessment is active and ready for candidate invitations."
                    : "Test is in draft mode. Complete sections and publish when ready."}
                </p>
              </div>
            </div>

            {/* Top Action Controls */}
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <Button
                variant={test.published ? "secondary" : "primary"}
                size="sm"
                onClick={togglePublish}
                disabled={saving || (!test.published && sections.length === 0)}
                className="font-bold shadow-sm"
              >
                {saving && <Spinner className="h-3.5 w-3.5 mr-1" />}
                {test.published ? "Unpublish Test" : "🚀 Publish Test"}
              </Button>

              {confirmingDeleteTest ? (
                <div className="flex items-center gap-1.5 bg-red-50 p-1 rounded-xl border border-red-200">
                  <span className="text-xs font-semibold text-red-800 px-1">Delete test?</span>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={deletingTest}
                    onClick={() => setConfirmingDeleteTest(false)}
                    className="h-7 text-xs px-2"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    variant="danger"
                    size="sm"
                    disabled={deletingTest}
                    onClick={handleDeleteTest}
                    className="h-7 text-xs px-2"
                  >
                    {deletingTest ? "Deleting…" : "Confirm"}
                  </Button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmingDeleteTest(true)}
                  disabled={test.invitationCount > 0}
                  title={
                    test.invitationCount > 0
                      ? "Already sent to candidates — cannot be deleted"
                      : "Delete this test"
                  }
                  className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40 transition-colors"
                >
                  <TrashIcon className="h-3.5 w-3.5" />
                  Delete
                </button>
              )}
            </div>
          </div>

          {/* Quick Metrics Bar */}
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="p-3 rounded-xl bg-white border border-slate-200/80 shadow-2xs">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Total Duration</span>
              <p className="text-base font-extrabold text-slate-800 mt-0.5">⏱️ {formatDuration(totalTimeSec)}</p>
            </div>
            <div className="p-3 rounded-xl bg-white border border-slate-200/80 shadow-2xs">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Questions Count</span>
              <p className="text-base font-extrabold text-indigo-600 mt-0.5">📋 {totalQuestions} Questions</p>
            </div>
            <div className="p-3 rounded-xl bg-white border border-slate-200/80 shadow-2xs">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Sections</span>
              <p className="text-base font-extrabold text-slate-800 mt-0.5">📑 {sections.length} Sections</p>
            </div>
            <div className="p-3 rounded-xl bg-white border border-slate-200/80 shadow-2xs">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Cutoff Pass %</span>
              <div className="flex items-center gap-1.5 mt-0.5">
                <input
                  type="number"
                  min={0}
                  max={100}
                  placeholder="None"
                  value={cutoffPercent}
                  onChange={(e) => setCutoffPercent(e.target.value)}
                  className="w-14 h-7 text-xs font-bold rounded border border-slate-300 px-1.5 text-center focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                />
                <Button variant="secondary" size="sm" onClick={saveCutoff} disabled={saving} className="h-7 text-xs px-2">
                  Save
                </Button>
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* ─── 2. SECTIONS OVERVIEW LIST ─── */}
      <section>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900">Configured Sections ({sections.length})</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Sections are administered in sequential order during candidate test sessions.
            </p>
          </div>
          {sections.length > 0 && (
            <button
              type="button"
              onClick={() => {
                resetForm();
                window.scrollTo({ top: document.getElementById("section-editor-anchor")?.offsetTop || 700, behavior: "smooth" });
              }}
              className="inline-flex items-center gap-1 text-xs font-bold text-indigo-600 hover:text-indigo-800 bg-indigo-50 px-2.5 py-1 rounded-lg border border-indigo-200 hover:bg-indigo-100 transition-colors"
            >
              <PlusIcon className="h-3.5 w-3.5" />
              Add Another Section
            </button>
          )}
        </div>

        <div className="mt-3 flex flex-col gap-2.5">
          {sections.map((s, i) => (
            <Card
              key={i}
              className={`p-4 text-sm transition-all border rounded-2xl ${
                editingIndex === i
                  ? "ring-2 ring-indigo-500 border-indigo-300 bg-indigo-50/25 shadow-md"
                  : "hover:border-slate-300 shadow-sm bg-white"
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-indigo-600 font-bold text-xs text-white shadow-sm">
                    {i + 1}
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <strong className="text-sm font-bold text-slate-900">{s.name}</strong>
                      <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
                        ⏱️ {formatDuration(s.timeLimitSec)}
                      </span>
                      <span className="rounded-md bg-indigo-50 px-2 py-0.5 text-xs font-bold text-indigo-700 border border-indigo-100">
                        {s.questionCount} {s.questionCount === 1 ? "question" : "questions"}
                      </span>
                      <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                        {s.poolStrategy === "FIXED" ? "⚡ Fixed Order" : `🎲 Random Sample of ${s.questionIds.length}`}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => moveSection(i, -1)}
                    disabled={saving || i === 0}
                    title="Move up"
                    className="flex items-center rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    <ChevronUpIcon className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveSection(i, 1)}
                    disabled={saving || i === sections.length - 1}
                    title="Move down"
                    className="flex items-center rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    <ChevronDownIcon className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => startEditSection(i)}
                    disabled={saving}
                    className="flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors"
                  >
                    <PencilIcon className="h-3.5 w-3.5" />
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => removeSection(i)}
                    disabled={saving}
                    className="flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-bold text-red-600 bg-red-50 hover:bg-red-100 transition-colors"
                  >
                    <TrashIcon className="h-3.5 w-3.5" />
                    Remove
                  </button>
                </div>
              </div>
            </Card>
          ))}

          {sections.length === 0 && (
            <div className="rounded-2xl border-2 border-dashed border-slate-300 p-8 text-center bg-slate-50/60">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 font-bold text-xl mb-2">
                📑
              </div>
              <p className="text-sm font-bold text-slate-700">No assessment sections configured yet</p>
              <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                Add your first section below by selecting questions from your bank or uploading a document from your device.
              </p>
            </div>
          )}
        </div>
      </section>

      {/* ─── 3. INTERACTIVE SECTION BUILDER CARD ─── */}
      <div id="section-editor-anchor" />
      <Card className="p-6 shadow-md border border-slate-200 rounded-3xl bg-white">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-600 text-xs font-bold text-white shadow-sm">
                {editingIndex !== null ? "✎" : "+"}
              </span>
              <h3 className="text-base font-bold text-slate-900">
                {editingIndex !== null
                  ? `Editing Section: ${sections[editingIndex]?.name}`
                  : "Add Section to Test"}
              </h3>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Set section duration, pool strategy, and choose questions from uploaded files or typed bank items.
            </p>
          </div>
          {editingIndex !== null && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={resetForm}
              className="text-xs text-slate-600 hover:text-slate-900 font-semibold"
            >
              Cancel editing
            </Button>
          )}
        </div>

        {/* Section Basic Configuration Form */}
        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          {/* Section Name */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700">Section Title / Subject</label>
            <Input
              type="text"
              placeholder="e.g. General Aptitude, Quantitative Math, Technical MCQ"
              value={newSectionName}
              onChange={(e) => setNewSectionName(e.target.value)}
              className="h-10 text-sm font-medium"
            />
            <p className="text-[11px] text-slate-400">Candidates will see this section name during the exam.</p>
          </div>

          {/* Time Limit with Presets */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-700">Section Time Limit</label>
              <span className="text-xs font-extrabold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-100">
                = {formatDuration(newSectionTime)}
              </span>
            </div>
            <Input
              type="number"
              min={30}
              value={newSectionTime}
              onChange={(e) => setNewSectionTime(Number(e.target.value))}
              className="h-10 text-sm font-medium"
            />
            <div className="flex flex-wrap gap-1 pt-1">
              {TIME_PRESETS.map((preset) => (
                <button
                  key={preset.sec}
                  type="button"
                  onClick={() => setNewSectionTime(preset.sec)}
                  className={`px-2 py-0.5 text-[11px] font-bold rounded-md border transition-all ${
                    newSectionTime === preset.sec
                      ? "bg-indigo-600 text-white border-indigo-600 shadow-sm"
                      : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── Visual Pool Strategy Selector Cards ── */}
        <div className="mt-5 space-y-2">
          <label className="text-xs font-bold text-slate-700">Question Delivery &amp; Pool Strategy</label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Strategy 1: Fixed Order */}
            <div
              onClick={() => setNewSectionStrategy("FIXED")}
              className={`p-3.5 rounded-2xl border-2 cursor-pointer transition-all ${
                newSectionStrategy === "FIXED"
                  ? "border-indigo-600 bg-indigo-50/40 ring-1 ring-indigo-500 shadow-sm"
                  : "border-slate-200 hover:border-slate-300 bg-white"
              }`}
            >
              <div className="flex items-start gap-2.5">
                <div
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-sm font-bold ${
                    newSectionStrategy === "FIXED" ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600"
                  }`}
                >
                  ⚡
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-900">Fixed Sequence (All Selected)</p>
                  <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                    Every candidate receives all selected questions in the exact order specified.
                  </p>
                </div>
              </div>
            </div>

            {/* Strategy 2: Random Pool Sampling */}
            <div
              onClick={() => setNewSectionStrategy("RANDOM_POOL")}
              className={`p-3.5 rounded-2xl border-2 cursor-pointer transition-all ${
                newSectionStrategy === "RANDOM_POOL"
                  ? "border-indigo-600 bg-indigo-50/40 ring-1 ring-indigo-500 shadow-sm"
                  : "border-slate-200 hover:border-slate-300 bg-white"
              }`}
            >
              <div className="flex items-start gap-2.5">
                <div
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-sm font-bold ${
                    newSectionStrategy === "RANDOM_POOL" ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600"
                  }`}
                >
                  🎲
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-900">Random Pool (Anti-Cheat Sampling)</p>
                  <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                    Randomly draws a subset of N questions per candidate to prevent answer sharing.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Random Pool Config Sub-Panel */}
          {newSectionStrategy === "RANDOM_POOL" && (
            <div className="mt-3 p-3.5 rounded-2xl bg-amber-50/80 border border-amber-200 text-xs animate-in fade-in duration-150">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <span className="font-bold text-amber-900"># Questions to serve each candidate:</span>
                  <p className="text-[11px] text-amber-800 mt-0.5">
                    Will randomly pick {randomCount} questions out of the {selectedQuestionIds.length} questions selected below.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    max={selectedQuestionIds.length || 1}
                    value={randomCount}
                    onChange={(e) => setRandomCount(Number(e.target.value))}
                    className="w-20 h-9 rounded-xl border border-amber-300 bg-white px-2 text-center text-sm font-extrabold text-amber-950 shadow-inner focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                  <span className="text-xs font-bold text-amber-900">/ {selectedQuestionIds.length} Total</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ─── 4. QUESTION BANK & SELECTION SECTION ─── */}
        <div className="mt-6 border-t border-slate-100 pt-5">
          <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 p-3 rounded-2xl border border-slate-200/80">
            <div className="flex items-center gap-2 flex-1 min-w-[240px]">
              <span className="text-xs font-bold text-slate-700 shrink-0">📁 Choose Question Bank:</span>
              <select
                value={selectedBankId}
                onChange={(e) => {
                  setSelectedBankId(e.target.value);
                  setSelectedQuestionIds([]);
                  setSearchQuery("");
                }}
                className="flex-1 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-800 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {banks.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} ({b.questions?.length || 0} questions)
                  </option>
                ))}
              </select>
            </div>

            {/* Quick Action Buttons: Upload from Device & Write Question */}
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setShowDeviceUpload(true)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-bold text-indigo-700 transition-all hover:bg-indigo-100 hover:border-indigo-300 shadow-sm"
                title="Upload Word, Excel, or CSV file from device"
              >
                <UploadIcon className="h-3.5 w-3.5" />
                Upload questions (Device)
              </button>
              <button
                type="button"
                onClick={() => setShowWriteQuestion(true)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 shadow-sm transition-all hover:bg-slate-100"
                title="Write a new question manually"
              >
                <PlusIcon className="h-3.5 w-3.5" />
                Write question
              </button>
            </div>
          </div>

          {/* Search & Origin Filter Bar */}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            {/* Search Input */}
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <input
                type="text"
                placeholder="🔍 Search questions in this bank…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full h-8.5 rounded-xl border border-slate-300 bg-white pl-3.5 pr-8 text-xs font-medium text-slate-800 placeholder-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-2xs"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
                >
                  <XIcon className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* Filter Tabs (All, Uploaded, Typed, Selected) */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                type="button"
                onClick={() => setSourceFilter("ALL")}
                className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${
                  sourceFilter === "ALL"
                    ? "bg-slate-900 text-white shadow-sm"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                All ({questionStats.total})
              </button>

              <button
                type="button"
                onClick={() => setSourceFilter("UPLOADED")}
                className={`inline-flex items-center gap-1 px-3 py-1 text-xs font-bold rounded-lg border transition-all ${
                  sourceFilter === "UPLOADED"
                    ? "bg-sky-600 text-white border-sky-600 shadow-sm"
                    : "bg-sky-50 text-sky-700 border-sky-200 hover:bg-sky-100"
                }`}
              >
                <span>📤 Uploaded</span>
                <span className="opacity-90 font-mono text-[11px]">({questionStats.uploaded})</span>
              </button>

              <button
                type="button"
                onClick={() => setSourceFilter("TYPED")}
                className={`inline-flex items-center gap-1 px-3 py-1 text-xs font-bold rounded-lg border transition-all ${
                  sourceFilter === "TYPED"
                    ? "bg-violet-600 text-white border-violet-600 shadow-sm"
                    : "bg-violet-50 text-violet-700 border-violet-200 hover:bg-violet-100"
                }`}
              >
                <span>✍️ Typed</span>
                <span className="opacity-90 font-mono text-[11px]">({questionStats.typed})</span>
              </button>

              {selectedQuestionIds.length > 0 && (
                <button
                  type="button"
                  onClick={() => setSourceFilter("SELECTED")}
                  className={`inline-flex items-center gap-1 px-3 py-1 text-xs font-bold rounded-lg border transition-all ${
                    sourceFilter === "SELECTED"
                      ? "bg-indigo-600 text-white border-indigo-600 shadow-sm"
                      : "bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100"
                  }`}
                >
                  <span>✓ Selected</span>
                  <span className="opacity-90 font-mono text-[11px]">({selectedQuestionIds.length})</span>
                </button>
              )}
            </div>

            {/* Quick Bulk Selection Controls */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={selectAllFiltered}
                disabled={filteredQuestions.length === 0}
                className="text-xs font-bold text-indigo-600 hover:text-indigo-800 disabled:opacity-40"
              >
                Select All
              </button>
              <span className="text-slate-300">|</span>
              <button
                type="button"
                onClick={deselectAllFiltered}
                disabled={filteredQuestions.length === 0}
                className="text-xs font-medium text-slate-500 hover:text-slate-700 disabled:opacity-40"
              >
                Deselect All
              </button>
            </div>
          </div>

          {/* ─── Question Items List with Origin Tags & Option Previews ─── */}
          <div className="mt-3 max-h-80 overflow-y-auto rounded-2xl border border-slate-200 bg-slate-50/40 p-2.5 shadow-inner">
            {filteredQuestions.length > 0 ? (
              <div className="flex flex-col gap-1.5">
                {filteredQuestions.map((q) => {
                  const isSelected = selectedQuestionIds.includes(q.id);
                  const isExpanded = expandedQuestionIds.has(q.id);
                  const origin = getQuestionOrigin(q);
                  const isUploaded = origin === "UPLOADED";

                  return (
                    <div
                      key={q.id}
                      className={`rounded-xl border p-3 transition-all ${
                        isSelected
                          ? "bg-white border-indigo-400 shadow-sm ring-1 ring-indigo-200"
                          : "bg-white/90 border-slate-200/90 hover:bg-white hover:border-slate-300"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        {/* Checkbox */}
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleQuestion(q.id)}
                          className="mt-1 h-4 w-4 shrink-0 rounded accent-indigo-600 cursor-pointer"
                        />

                        {/* Question Content */}
                        <div className="flex-1 min-w-0 cursor-pointer" onClick={() => toggleQuestion(q.id)}>
                          <div className="flex items-center gap-1.5 flex-wrap mb-1">
                            {/* Source Badge: Uploaded vs Typed */}
                            {isUploaded ? (
                              <span className="inline-flex items-center gap-1 rounded-md bg-sky-50 border border-sky-200 px-2 py-0.5 text-[10px] font-bold text-sky-700 shadow-2xs">
                                <span>📤</span>
                                <span>Uploaded</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded-md bg-violet-50 border border-violet-200 px-2 py-0.5 text-[10px] font-bold text-violet-700 shadow-2xs">
                                <span>✍️</span>
                                <span>Typed</span>
                              </span>
                            )}

                            {/* Question Type Badge */}
                            <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-mono font-bold text-slate-700 border border-slate-200">
                              {q.type}
                            </span>

                            {/* Tags */}
                            {(q.tags || [])
                              .filter((t) => !["uploaded", "typed", "source:uploaded", "source:typed"].includes(t.toLowerCase()))
                              .map((tag) => (
                                <span
                                  key={tag}
                                  className="rounded bg-slate-100/70 px-1.5 py-0.2 text-[10px] text-slate-500"
                                >
                                  #{tag}
                                </span>
                              ))}
                          </div>

                          <p className="text-sm font-medium text-slate-900 leading-snug break-words">
                            {q.stem}
                          </p>
                        </div>

                        {/* Expand Options Toggle */}
                        {q.options && q.options.length > 0 && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleExpandQuestion(q.id);
                            }}
                            className="shrink-0 text-[11px] font-semibold text-slate-400 hover:text-indigo-600 px-2 py-1 rounded-lg hover:bg-slate-100 flex items-center gap-1 transition-colors"
                            title="Preview options and answer"
                          >
                            <span>{q.options.length} choices</span>
                            {isExpanded ? (
                              <ChevronUpIcon className="h-3.5 w-3.5" />
                            ) : (
                              <ChevronDownIcon className="h-3.5 w-3.5" />
                            )}
                          </button>
                        )}
                      </div>

                      {/* Expanded Option List Preview */}
                      {isExpanded && q.options && q.options.length > 0 && (
                        <div className="mt-2.5 pt-2.5 border-t border-slate-100 pl-7 space-y-1.5 animate-in fade-in duration-100">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                            Answer Choices Preview:
                          </p>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                            {q.options.map((opt, optIdx) => (
                              <div
                                key={opt.id || optIdx}
                                className={`flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg text-xs ${
                                  opt.isCorrect
                                    ? "bg-emerald-50 text-emerald-900 font-semibold border border-emerald-200"
                                    : "bg-slate-50 text-slate-700 border border-slate-100"
                                }`}
                              >
                                <span className="truncate">
                                  <span className="font-bold text-slate-400 mr-1.5">
                                    {String.fromCharCode(65 + optIdx)})
                                  </span>
                                  {opt.label}
                                </span>
                                {opt.isCorrect && (
                                  <span className="shrink-0 flex items-center gap-0.5 text-[9px] font-bold bg-emerald-600 text-white px-1.5 py-0.5 rounded-full">
                                    <CheckIcon className="h-2.5 w-2.5" /> Correct
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="py-8 text-center">
                <p className="text-sm font-semibold text-slate-600">
                  {searchQuery || sourceFilter !== "ALL"
                    ? "No questions match the current search / filter."
                    : "This question bank has no questions yet."}
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  Upload questions from your device or write them manually.
                </p>
                <div className="mt-3 flex justify-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowDeviceUpload(true)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-indigo-600 bg-indigo-50 rounded-xl hover:bg-indigo-100"
                  >
                    <UploadIcon className="h-3 w-3" />
                    Upload from Device
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowWriteQuestion(true)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-slate-700 bg-slate-100 rounded-xl hover:bg-slate-200"
                  >
                    <PlusIcon className="h-3 w-3" />
                    Write Question
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Selection Breakdown Status Counter Bar */}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 px-1">
            <div className="flex items-center gap-2 flex-wrap text-xs font-medium text-slate-600">
              <span className="font-extrabold text-slate-900 bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200">
                {selectedCounts.total} of {bankQuestions.length} selected
              </span>
              <span>•</span>
              <span className="text-sky-700 font-bold bg-sky-50 px-2 py-0.5 rounded-md border border-sky-200">
                📤 {selectedCounts.uploaded} Uploaded
              </span>
              <span>•</span>
              <span className="text-violet-700 font-bold bg-violet-50 px-2 py-0.5 rounded-md border border-violet-200">
                ✍️ {selectedCounts.typed} Typed
              </span>
            </div>

            {selectedQuestionIds.length === 0 && (
              <span className="text-xs font-semibold text-amber-600">
                ⚠️ Select at least 1 question to add this section.
              </span>
            )}
          </div>
        </div>

        {/* Action Button */}
        <div className="mt-6 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
          <Button
            onClick={submitSectionForm}
            disabled={saving || !newSectionName.trim() || selectedQuestionIds.length === 0}
            className="h-11 px-6 font-extrabold rounded-xl shadow-md bg-indigo-600 hover:bg-indigo-700 text-white"
          >
            {saving && <Spinner className="h-4 w-4 text-white mr-1.5" />}
            {saving
              ? "Saving Section…"
              : editingIndex !== null
              ? "Update Section"
              : "Add Section to Test"}
          </Button>
          {editingIndex !== null && (
            <Button type="button" variant="secondary" disabled={saving} onClick={resetForm} className="h-11 rounded-xl">
              Cancel
            </Button>
          )}
        </div>
      </Card>

      {error && (
        <p className="rounded-2xl bg-red-50 p-4 text-sm font-semibold text-red-700 border border-red-200">
          {error}
        </p>
      )}

      {/* Device File Upload Modal */}
      <DeviceQuestionUploadModal
        bankId={selectedBankId}
        bankName={selectedBank?.name ?? "Question Bank"}
        isOpen={showDeviceUpload}
        onClose={() => setShowDeviceUpload(false)}
        onQuestionsImported={handleDeviceQuestionsImported}
      />

      {/* Write Question Modal */}
      {showWriteQuestion && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm overflow-y-auto">
          <Card className="w-full max-w-xl p-6 shadow-2xl my-8 animate-in fade-in zoom-in-95 duration-150 rounded-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">✍️ Write New Question</h3>
                <p className="text-xs text-slate-500">
                  Adding to bank: <span className="font-semibold text-slate-700">{selectedBank?.name}</span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowWriteQuestion(false);
                  setWriteError(null);
                }}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <XIcon className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleWriteQuestionSubmit} className="mt-4 space-y-4">
              <QuestionFields
                type={writeType}
                onTypeChange={setWriteType}
                stem={writeStem}
                onStemChange={setWriteStem}
                mediaUrl={writeMediaUrl}
                onMediaUrlChange={setWriteMediaUrl}
                tags={writeTags}
                onTagsChange={setWriteTags}
                options={writeOptions}
                onOptionsChange={setWriteOptions}
              />

              {writeError && (
                <p className="rounded-lg bg-red-50 p-2.5 text-xs text-red-700">{writeError}</p>
              )}

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setShowWriteQuestion(false);
                    setWriteError(null);
                  }}
                >
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={writingQuestion || !writeStem.trim()}>
                  {writingQuestion && <Spinner className="h-3.5 w-3.5 text-white mr-1" />}
                  {writingQuestion ? "Saving…" : "Save & Select Question"}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}
