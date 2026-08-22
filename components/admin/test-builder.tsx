"use client";

import { useRef, useState } from "react";
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

type Question = { id: string; stem: string; type: string };
type Bank = { id: string; name: string; questions: Question[] };
type Section = {
  id?: string;
  name: string;
  order: number;
  timeLimitSec: number;
  questionCount: number;
  poolStrategy: "FIXED" | "RANDOM_POOL";
  questionIds: string[];
};

type TestData = {
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

const TEMPLATE_ROWS = [
  ["type", "stem", "mediaUrl", "tags", "options", "correctOptions"],
  ["MCQ_SINGLE", "What is the capital of France?", "", "geography", "Paris;London;Berlin;Madrid", "1"],
  ["MCQ_MULTI", "Which of these are prime numbers?", "", "math", "2;3;4;5", "1;2;4"],
  ["NUMERIC", "What is 12 times 8?", "", "math", "", ""],
  ["LIKERT", "I enjoy working as part of a team.", "", "", "Strongly disagree;Disagree;Neutral;Agree;Strongly agree", ""],
];

function downloadTemplateCsv() {
  const csv = TEMPLATE_ROWS.map((row) =>
    row.map((v) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)).join(","),
  ).join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "question-import-template.csv";
  a.click();
  URL.revokeObjectURL(url);
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

  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [newSectionName, setNewSectionName] = useState(EMPTY_FORM.name);
  const [newSectionTime, setNewSectionTime] = useState<number>(EMPTY_FORM.time);
  const [newSectionStrategy, setNewSectionStrategy] = useState<"FIXED" | "RANDOM_POOL">(
    EMPTY_FORM.strategy,
  );
  const [selectedBankId, setSelectedBankId] = useState(banks[0]?.id ?? "");
  const [selectedQuestionIds, setSelectedQuestionIds] = useState<string[]>([]);
  const [randomCount, setRandomCount] = useState(EMPTY_FORM.randomCount);

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

  // File upload state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadFileName, setUploadFileName] = useState<string | null>(null);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadRowErrors, setUploadRowErrors] = useState<{ row: number; error: string }[]>([]);

  const selectedBank = banks.find((b) => b.id === selectedBankId);

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
                  questions: data.bank.questions.map((q: { id: string; stem: string; type: string }) => ({
                    id: q.id,
                    stem: q.stem,
                    type: q.type,
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

  function toggleSelectAll() {
    if (!selectedBank) return;
    const allIds = selectedBank.questions.map((q) => q.id);
    const areAllSelected = allIds.every((id) => selectedQuestionIds.includes(id));
    if (areAllSelected) {
      setSelectedQuestionIds((prev) => prev.filter((id) => !allIds.includes(id)));
    } else {
      setSelectedQuestionIds((prev) => Array.from(new Set([...prev, ...allIds])));
    }
  }

  function resetForm() {
    setEditingIndex(null);
    setNewSectionName(EMPTY_FORM.name);
    setNewSectionTime(EMPTY_FORM.time);
    setNewSectionStrategy(EMPTY_FORM.strategy);
    setSelectedQuestionIds([]);
    setRandomCount(EMPTY_FORM.randomCount);
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
        tags: writeTags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
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

  // Handle Quick File Upload Submit
  async function handleFileUploadSubmit(e: React.FormEvent) {
    e.preventDefault();
    const file = fileInputRef.current?.files?.[0];
    if (!file || !selectedBankId) return;

    setUploadingFile(true);
    setUploadError(null);
    setUploadRowErrors([]);

    const formData = new FormData();
    formData.append("bankId", selectedBankId);
    formData.append("file", file);

    const res = await fetch("/api/questions/bulk", { method: "POST", body: formData });
    setUploadingFile(false);

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setUploadError(typeof body?.error === "string" ? body.error : "Could not import questions.");
      if (Array.isArray(body?.rowErrors)) {
        setUploadRowErrors(body.rowErrors);
      } else {
        setUploadRowErrors([]);
      }
      return;
    }

    // Refresh bank & select all questions
    const updatedQuestions = await fetchUpdatedBank(selectedBankId);
    if (updatedQuestions?.length) {
      setSelectedQuestionIds(updatedQuestions.map((q) => q.id));
    }

    setUploadFileName(null);
    setUploadRowErrors([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
    setShowDeviceUpload(false);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-8">
      <Card className="flex flex-wrap items-center justify-between gap-4 p-5">
        <div className="flex flex-wrap items-center gap-3">
          <Badge variant={test.published ? "success" : "neutral"}>
            {test.published ? "Published" : "Draft"}
          </Badge>
          {!test.published && sections.length === 0 && (
            <span className="text-xs text-slate-500">Add at least one section to publish.</span>
          )}
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Button
            variant={test.published ? "secondary" : "primary"}
            size="sm"
            onClick={togglePublish}
            disabled={saving || (!test.published && sections.length === 0)}
          >
            {saving && <Spinner className="h-3.5 w-3.5" />}
            {test.published ? "Unpublish" : "Publish"}
          </Button>
          {confirmingDeleteTest ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500">Delete this test?</span>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={deletingTest}
                onClick={() => setConfirmingDeleteTest(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="danger"
                size="sm"
                disabled={deletingTest}
                onClick={handleDeleteTest}
              >
                {deletingTest && <Spinner className="h-3.5 w-3.5 text-white" />}
                {deletingTest ? "Deleting…" : "Delete"}
              </Button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmingDeleteTest(true)}
              disabled={test.invitationCount > 0}
              title={
                test.invitationCount > 0
                  ? "Already sent to candidates — can't be deleted"
                  : "Delete this test"
              }
              className="flex items-center gap-1 rounded-md px-2 py-1.5 text-sm font-medium text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-slate-400"
            >
              <TrashIcon className="h-4 w-4" />
              Delete test
            </button>
          )}
        </div>
      </Card>

      <Card className="p-5">
        <Field
          label="Cutoff pass %"
          hint={`Leave blank for no pass/fail — "screening-grade" only`}
          className="max-w-xs"
        >
          <div className="flex gap-2">
            <Input
              type="number"
              min={0}
              max={100}
              value={cutoffPercent}
              onChange={(e) => setCutoffPercent(e.target.value)}
              className="w-24"
            />
            <Button variant="secondary" size="sm" onClick={saveCutoff} disabled={saving}>
              {saving && <Spinner className="h-3.5 w-3.5" />}
              Save
            </Button>
          </div>
        </Field>
      </Card>

      <section>
        <h2 className="text-base font-semibold text-slate-900">Sections</h2>
        <div className="mt-3 flex flex-col gap-2">
          {sections.map((s, i) => (
            <Card
              key={i}
              className={`flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm ${
                editingIndex === i ? "ring-2 ring-indigo-200" : ""
              }`}
            >
              <span className="min-w-0 break-words text-slate-800">
                <strong className="font-medium text-slate-900">{s.name}</strong>
                <span className="text-slate-400"> — </span>
                {s.timeLimitSec}s · {s.questionCount} question{s.questionCount === 1 ? "" : "s"} ·{" "}
                {s.poolStrategy} (pool of {s.questionIds.length})
              </span>
              <div className="flex shrink-0 items-center gap-0.5">
                <button
                  type="button"
                  onClick={() => moveSection(i, -1)}
                  disabled={saving || i === 0}
                  title="Move up"
                  className="flex items-center rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
                >
                  <ChevronUpIcon className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => moveSection(i, 1)}
                  disabled={saving || i === sections.length - 1}
                  title="Move down"
                  className="flex items-center rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
                >
                  <ChevronDownIcon className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => startEditSection(i)}
                  disabled={saving}
                  className="flex items-center gap-1 rounded-md px-1.5 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                >
                  <PencilIcon className="h-3.5 w-3.5" />
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => removeSection(i)}
                  disabled={saving}
                  className="flex items-center gap-1 rounded-md px-1.5 py-1 text-xs font-medium text-slate-400 hover:bg-red-50 hover:text-red-600"
                >
                  <TrashIcon className="h-3.5 w-3.5" />
                  Remove
                </button>
              </div>
            </Card>
          ))}
          {sections.length === 0 && (
            <p className="text-sm text-slate-500">No sections yet.</p>
          )}
        </div>
      </section>

      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-900">
            {editingIndex !== null ? `Edit section: ${sections[editingIndex]?.name}` : "Add section"}
          </h3>
          {editingIndex !== null && (
            <button
              type="button"
              onClick={resetForm}
              className="text-xs font-medium text-slate-500 hover:text-slate-700"
            >
              Cancel edit
            </button>
          )}
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Name">
            <Input
              type="text"
              value={newSectionName}
              onChange={(e) => setNewSectionName(e.target.value)}
            />
          </Field>
          <Field label="Time limit (sec)">
            <Input
              type="number"
              min={30}
              value={newSectionTime}
              onChange={(e) => setNewSectionTime(Number(e.target.value))}
            />
          </Field>
          <Field label="Pool strategy" className={newSectionStrategy === "RANDOM_POOL" ? "" : "sm:col-span-2"}>
            <Select
              value={newSectionStrategy}
              onChange={(e) => setNewSectionStrategy(e.target.value as "FIXED" | "RANDOM_POOL")}
            >
              <option value="FIXED">FIXED — serve all selected, in order</option>
              <option value="RANDOM_POOL">RANDOM_POOL — sample from selected</option>
            </Select>
          </Field>
          {newSectionStrategy === "RANDOM_POOL" && (
            <Field label="# to serve">
              <Input
                type="number"
                min={1}
                max={selectedQuestionIds.length || 1}
                value={randomCount}
                onChange={(e) => setRandomCount(Number(e.target.value))}
              />
            </Field>
          )}
        </div>

        <div className="mt-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Field label="Bank" className="max-w-xs flex-1">
              <Select
                value={selectedBankId}
                onChange={(e) => {
                  setSelectedBankId(e.target.value);
                  setSelectedQuestionIds([]);
                }}
              >
                {banks.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </Select>
            </Field>

            {/* Quick Question Creation Actions */}
            <div className="flex items-center gap-2 pt-5 sm:pt-0">
              <button
                type="button"
                onClick={() => setShowDeviceUpload(true)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50/70 px-3 py-1.5 text-xs font-semibold text-indigo-700 transition-colors hover:bg-indigo-100"
                title="Upload CSV/Excel file from device"
              >
                <UploadIcon className="h-3.5 w-3.5" />
                Upload questions (Device)
              </button>
              <button
                type="button"
                onClick={() => setShowWriteQuestion(true)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
                title="Write a new question directly"
              >
                <PlusIcon className="h-3.5 w-3.5" />
                Write question
              </button>
            </div>
          </div>

          <div className="mt-3 flex items-center justify-between px-1">
            <span className="text-xs font-medium text-slate-500">
              Select questions for this section:
            </span>
            {selectedBank?.questions.length ? (
              <button
                type="button"
                onClick={toggleSelectAll}
                className="text-xs font-semibold text-indigo-600 hover:text-indigo-800"
              >
                {selectedBank.questions.every((q) => selectedQuestionIds.includes(q.id))
                  ? "Deselect All"
                  : "Select All"}
              </button>
            ) : null}
          </div>

          <div className="mt-1 max-h-52 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50/50 p-3">
            {selectedBank?.questions.length ? (
              <div className="flex flex-col gap-0.5">
                {selectedBank.questions.map((q) => (
                  <label
                    key={q.id}
                    className="flex items-start gap-2.5 rounded-md px-2 py-1.5 text-sm hover:bg-white cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selectedQuestionIds.includes(q.id)}
                      onChange={() => toggleQuestion(q.id)}
                      className="mt-0.5 h-4 w-4 shrink-0 accent-indigo-600"
                    />
                    <span className="min-w-0 break-words">
                      <span className="mr-1.5 text-xs font-mono font-medium text-indigo-600 bg-indigo-50 px-1 py-0.5 rounded">
                        [{q.type}]
                      </span>
                      {q.stem}
                    </span>
                  </label>
                ))}
              </div>
            ) : (
              <div className="py-4 text-center">
                <p className="text-sm text-slate-500">This bank has no questions yet.</p>
                <div className="mt-2 flex justify-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowDeviceUpload(true)}
                    className="text-xs font-medium text-indigo-600 hover:underline"
                  >
                    Upload CSV/Excel
                  </button>
                  <span className="text-xs text-slate-300">•</span>
                  <button
                    type="button"
                    onClick={() => setShowWriteQuestion(true)}
                    className="text-xs font-medium text-indigo-600 hover:underline"
                  >
                    Write question
                  </button>
                </div>
              </div>
            )}
          </div>
          <p className="mt-1.5 text-xs text-slate-500">
            {selectedQuestionIds.length} question{selectedQuestionIds.length === 1 ? "" : "s"} selected
          </p>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            onClick={submitSectionForm}
            disabled={saving || !newSectionName.trim() || selectedQuestionIds.length === 0}
          >
            {saving && <Spinner className="h-4 w-4 text-white" />}
            {saving ? "Saving…" : editingIndex !== null ? "Save section" : "Add section"}
          </Button>
          {editingIndex !== null && (
            <Button type="button" variant="secondary" disabled={saving} onClick={resetForm}>
              Cancel
            </Button>
          )}
        </div>
      </Card>

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      {/* Device File Upload Modal */}
      {showDeviceUpload && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <Card className="w-full max-w-lg p-6 shadow-xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">Upload Questions from Device</h3>
                <p className="text-xs text-slate-500">
                  Target Bank: <span className="font-semibold text-slate-700">{selectedBank?.name}</span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowDeviceUpload(false);
                  setUploadError(null);
                  setUploadRowErrors([]);
                }}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <XIcon className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleFileUploadSubmit} className="mt-4 space-y-4">
              <label className="flex min-h-[120px] cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-slate-50/50 p-4 text-center hover:border-indigo-400 hover:bg-indigo-50/30 transition-colors">
                <UploadIcon className="h-8 w-8 text-indigo-600 mb-2" />
                <span className="text-sm font-medium text-slate-700">
                  {uploadFileName ? uploadFileName : "Click or drag & drop .CSV / .XLSX / .DOCX file"}
                </span>
                <span className="text-xs text-slate-400 mt-1">Up to 500 rows per spreadsheet</span>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.xlsx,.xlsm,.xls,.docx,.doc"
                  className="sr-only"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) setUploadFileName(f.name);
                  }}
                />
              </label>

              <div className="flex items-center justify-between text-xs text-slate-500">
                <button
                  type="button"
                  onClick={downloadTemplateCsv}
                  className="inline-flex items-center gap-1 font-semibold text-indigo-600 hover:underline"
                >
                  <DownloadIcon className="h-3.5 w-3.5" /> Download CSV Template
                </button>
              </div>

              {uploadError && (
                <div className="rounded-lg bg-red-50 p-3 text-xs text-red-700 space-y-1.5 border border-red-200">
                  <p className="font-semibold">{uploadError}</p>
                  {uploadRowErrors.length > 0 && (
                    <ul className="max-h-36 overflow-y-auto space-y-1 pl-4 list-disc text-red-600">
                      {uploadRowErrors.map((err, i) => (
                        <li key={i}>
                          <span className="font-medium">Row {err.row}:</span> {err.error}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setShowDeviceUpload(false);
                    setUploadError(null);
                    setUploadRowErrors([]);
                  }}
                >
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={uploadingFile || !uploadFileName}>
                  {uploadingFile && <Spinner className="h-3.5 w-3.5 text-white mr-1" />}
                  {uploadingFile ? "Uploading…" : "Upload & Select All"}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}

      {/* Write Question Modal */}
      {showWriteQuestion && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm overflow-y-auto">
          <Card className="w-full max-w-xl p-6 shadow-xl my-8 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">Write New Question</h3>
                <p className="text-xs text-slate-500">
                  Adding to: <span className="font-semibold text-slate-700">{selectedBank?.name}</span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowWriteQuestion(false);
                  setWriteError(null);
                }}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
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
