"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import {
  CheckIcon,
  WarningIcon,
  PencilIcon,
  TrashIcon,
  PlusIcon,
  XIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  UploadIcon,
} from "@/components/ui/icons";
import {
  type ScannedQuestion,
  validateScannedQuestion,
} from "@/lib/bulk-import";
import { QUESTION_TYPES, type QuestionType } from "@/lib/schemas/question";

export function ScannedQuestionsPanel({
  bankId,
  bankName,
  fileName,
  initialQuestions,
  onReset,
}: {
  bankId: string;
  bankName: string;
  fileName: string;
  initialQuestions: ScannedQuestion[];
  onReset: () => void;
}) {
  const router = useRouter();
  const [questions, setQuestions] = useState<ScannedQuestion[]>(initialQuestions);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => {
    // Select all valid questions by default
    return new Set(initialQuestions.filter((q) => q.isValid).map((q) => q.id));
  });
  const [filter, setFilter] = useState<"ALL" | "VALID" | "ERRORS">("ALL");
  const [editingQuestion, setEditingQuestion] = useState<ScannedQuestion | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<number | null>(null);

  // Derived metrics
  const totalCount = questions.length;
  const validQuestions = questions.filter((q) => q.isValid);
  const errorQuestions = questions.filter((q) => !q.isValid);
  const validCount = validQuestions.length;
  const errorCount = errorQuestions.length;

  const filteredQuestions = questions.filter((q) => {
    if (filter === "VALID") return q.isValid;
    if (filter === "ERRORS") return !q.isValid;
    return true;
  });

  const selectedCount = selectedIds.size;
  const selectedValidCount = questions.filter((q) => selectedIds.has(q.id) && q.isValid).length;
  const selectedHasErrors = questions.some((q) => selectedIds.has(q.id) && !q.isValid);

  function toggleSelectAll(selectValidOnly = true) {
    if (selectValidOnly) {
      const validIds = new Set(validQuestions.map((q) => q.id));
      setSelectedIds(validIds);
    } else {
      if (selectedIds.size === questions.length) {
        setSelectedIds(new Set());
      } else {
        setSelectedIds(new Set(questions.map((q) => q.id)));
      }
    }
  }

  function toggleSelectQuestion(id: string) {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  }

  function handleDeleteQuestion(id: string) {
    setQuestions((prev) => prev.filter((q) => q.id !== id));
    const next = new Set(selectedIds);
    next.delete(id);
    setSelectedIds(next);
  }

  function handleSaveEdit(updated: ScannedQuestion) {
    const val = validateScannedQuestion(updated);
    const checkedItem: ScannedQuestion = {
      ...updated,
      isValid: val.isValid,
      errors: val.errors,
    };

    setQuestions((prev) => prev.map((q) => (q.id === updated.id ? checkedItem : q)));

    // Auto select if it became valid
    if (checkedItem.isValid && !selectedIds.has(checkedItem.id)) {
      const next = new Set(selectedIds);
      next.add(checkedItem.id);
      setSelectedIds(next);
    }

    setEditingQuestion(null);
  }

  function handleAddNewQuestion() {
    const newId = `manual_${Date.now()}`;
    const newQ: ScannedQuestion = {
      id: newId,
      originalRow: questions.length + 1,
      type: "MCQ_SINGLE",
      stem: "",
      tags: [],
      options: [
        { label: "Option 1", isCorrect: true },
        { label: "Option 2", isCorrect: false },
      ],
      isValid: false,
      errors: ["Question stem is required"],
    };
    setQuestions((prev) => [...prev, newQ]);
    setEditingQuestion(newQ);
  }

  async function handleConfirmUpload() {
    const questionsToUpload = questions.filter((q) => selectedIds.has(q.id));

    if (questionsToUpload.length === 0) {
      setUploadError("Please select at least one valid question to upload.");
      return;
    }

    if (questionsToUpload.some((q) => !q.isValid)) {
      setUploadError("Selected questions contain validation errors. Fix or uncheck invalid items before uploading.");
      return;
    }

    setUploading(true);
    setUploadError(null);
    setUploadSuccess(null);

    const res = await fetch("/api/questions/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bankId, questions: questionsToUpload }),
    });

    setUploading(false);

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setUploadError(typeof body?.error === "string" ? body.error : "Failed to upload questions.");
      return;
    }

    const body = await res.json();
    setUploadSuccess(body.created ?? questionsToUpload.length);
    router.refresh();
  }

  if (uploadSuccess !== null) {
    return (
      <Card className="p-8 text-center border-emerald-200 bg-emerald-50/50">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 ring-8 ring-emerald-50">
          <CheckIcon className="h-8 w-8 text-emerald-600" />
        </div>
        <h2 className="mt-4 text-xl font-bold text-slate-900">Questions Uploaded Successfully!</h2>
        <p className="mt-2 text-sm text-slate-600">
          Imported <span className="font-semibold text-emerald-700">{uploadSuccess} question{uploadSuccess === 1 ? "" : "s"}</span> into{" "}
          <span className="font-semibold text-slate-800">{bankName}</span>.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Button type="button" variant="secondary" onClick={onReset}>
            Upload Another File
          </Button>
          <Button type="button" onClick={() => router.push(`/banks/${bankId}`)}>
            View Bank Questions
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <Card className="p-5 border-slate-200">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded bg-indigo-100 px-2 py-0.5 text-xs font-semibold text-indigo-700">
                Scanned from {fileName}
              </span>
              <span className="text-xs text-slate-400">•</span>
              <span className="text-xs font-medium text-slate-500">{totalCount} Questions Detected</span>
            </div>
            <h2 className="mt-1 text-lg font-bold text-slate-900">Question Scan & Review Panel</h2>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onReset}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
            >
              Scan New File
            </button>
            <button
              type="button"
              onClick={handleAddNewQuestion}
              className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 transition-colors hover:bg-indigo-100"
            >
              <PlusIcon className="h-3.5 w-3.5" />
              Add Manual Question
            </button>
          </div>
        </div>

        {/* Metrics Badges & Filters */}
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setFilter("ALL")}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                filter === "ALL"
                  ? "bg-slate-900 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              All ({totalCount})
            </button>
            <button
              type="button"
              onClick={() => setFilter("VALID")}
              className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                filter === "VALID"
                  ? "bg-emerald-600 text-white"
                  : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
              }`}
            >
              <CheckIcon className="h-3 w-3" />
              Valid ({validCount})
            </button>
            <button
              type="button"
              onClick={() => setFilter("ERRORS")}
              className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                filter === "ERRORS"
                  ? "bg-red-600 text-white"
                  : "bg-red-50 text-red-700 hover:bg-red-100"
              }`}
            >
              <WarningIcon className="h-3 w-3" />
              Needs Attention ({errorCount})
            </button>
          </div>

          {/* Quick Selection Actions */}
          <div className="flex items-center gap-2 text-xs">
            <button
              type="button"
              onClick={() => toggleSelectAll(true)}
              className="text-indigo-600 hover:underline font-medium"
            >
              Select All Valid ({validCount})
            </button>
            <span className="text-slate-300">|</span>
            <button
              type="button"
              onClick={() => setSelectedIds(new Set())}
              className="text-slate-500 hover:underline"
            >
              Deselect All
            </button>
          </div>
        </div>
      </Card>

      {/* Questions List */}
      <div className="space-y-3">
        {filteredQuestions.length === 0 ? (
          <Card className="p-8 text-center text-slate-500">
            <p className="text-sm">No questions match the current filter.</p>
          </Card>
        ) : (
          filteredQuestions.map((q) => (
            <ScannedQuestionRow
              key={q.id}
              question={q}
              isSelected={selectedIds.has(q.id)}
              onToggleSelect={() => toggleSelectQuestion(q.id)}
              onEdit={() => setEditingQuestion(q)}
              onDelete={() => handleDeleteQuestion(q.id)}
            />
          ))
        )}
      </div>

      {/* Upload Action Sticky Footer */}
      <Card className="p-4 border-slate-300 bg-white sticky bottom-4 shadow-lg ring-1 ring-slate-900/5">
        {uploadError && (
          <div className="mb-3 flex items-center gap-2 rounded-lg bg-red-50 p-3 text-xs text-red-800 border border-red-200">
            <WarningIcon className="h-4 w-4 text-red-600 shrink-0" />
            <span>{uploadError}</span>
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-slate-900">
              Ready to Upload {selectedCount} Question{selectedCount === 1 ? "" : "s"}
            </p>
            <p className="text-xs text-slate-500">
              {selectedValidCount} valid • {selectedCount - selectedValidCount} invalid selected
              {selectedHasErrors && (
                <span className="ml-1 text-red-600 font-semibold">(Please fix invalid items before uploading)</span>
              )}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Button
              type="button"
              size="md"
              disabled={uploading || selectedCount === 0 || selectedHasErrors}
              onClick={handleConfirmUpload}
              className="px-6"
            >
              {uploading && <Spinner className="h-4 w-4 text-white mr-2" />}
              <UploadIcon className="h-4 w-4 mr-1.5" />
              {uploading ? "Uploading Questions..." : `Upload ${selectedCount} Questions to Bank`}
            </Button>
          </div>
        </div>
      </Card>

      {/* Question Edit Modal */}
      {editingQuestion && (
        <EditScannedQuestionModal
          question={editingQuestion}
          onSave={handleSaveEdit}
          onClose={() => setEditingQuestion(null)}
        />
      )}
    </div>
  );
}

function ScannedQuestionRow({
  question: q,
  isSelected,
  onToggleSelect,
  onEdit,
  onDelete,
}: {
  question: ScannedQuestion;
  isSelected: boolean;
  onToggleSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Card
      className={`p-4 transition-colors ${
        !q.isValid
          ? "border-red-200 bg-red-50/20"
          : isSelected
          ? "border-indigo-300 bg-indigo-50/20"
          : "border-slate-200 bg-white"
      }`}
    >
      <div className="flex items-start gap-3">
        {/* Checkbox */}
        <input
          type="checkbox"
          checked={isSelected}
          onChange={onToggleSelect}
          className="mt-1 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
        />

        <div className="min-w-0 flex-1">
          {/* Top badges */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-semibold text-slate-400">
                #{q.originalRow}
              </span>
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                  q.isValid
                    ? "bg-emerald-100 text-emerald-800"
                    : "bg-red-100 text-red-800"
                }`}
              >
                {q.isValid ? (
                  <>
                    <CheckIcon className="h-3 w-3" /> Valid
                  </>
                ) : (
                  <>
                    <WarningIcon className="h-3 w-3" /> Needs Attention
                  </>
                )}
              </span>

              <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
                {q.type}
              </span>

              {q.tags.length > 0 && (
                <div className="flex flex-wrap items-center gap-1">
                  {q.tags.map((tag, i) => (
                    <span key={i} className="rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-medium text-indigo-700">
                      #{tag}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={onEdit}
                className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-semibold text-indigo-600 hover:bg-indigo-50"
              >
                <PencilIcon className="h-3.5 w-3.5" />
                Edit
              </button>
              <button
                type="button"
                onClick={onDelete}
                className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-semibold text-slate-400 hover:bg-red-50 hover:text-red-600"
              >
                <TrashIcon className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setExpanded(!expanded)}
                className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                {expanded ? <ChevronUpIcon className="h-4 w-4" /> : <ChevronDownIcon className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {/* Question Stem */}
          <p className="mt-2 text-sm font-medium text-slate-900 whitespace-pre-wrap">
            {q.stem || <span className="text-red-500 italic">Missing Question Stem</span>}
          </p>

          {/* Validation Errors list */}
          {q.errors.length > 0 && (
            <div className="mt-2 rounded-lg bg-red-100/60 p-2.5 text-xs text-red-800 space-y-1">
              {q.errors.map((err, i) => (
                <div key={i} className="flex items-start gap-1.5">
                  <span className="font-bold">•</span>
                  <span>{err}</span>
                </div>
              ))}
            </div>
          )}

          {/* Options Preview */}
          {(expanded || q.options.length > 0) && (
            <div className="mt-3 space-y-1.5 border-t border-slate-100 pt-2">
              {q.options.map((opt, i) => (
                <div
                  key={i}
                  className={`flex items-center gap-2 rounded px-2.5 py-1 text-xs ${
                    opt.isCorrect
                      ? "bg-emerald-50 text-emerald-900 border border-emerald-200 font-semibold"
                      : "bg-slate-50 text-slate-700"
                  }`}
                >
                  <span className="font-mono text-slate-400">{String.fromCharCode(65 + i)})</span>
                  <span className="flex-1">{opt.label}</span>
                  {opt.isCorrect && (
                    <span className="inline-flex items-center gap-0.5 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] text-emerald-800">
                      <CheckIcon className="h-3 w-3" /> Correct Answer
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

function EditScannedQuestionModal({
  question: q,
  onSave,
  onClose,
}: {
  question: ScannedQuestion;
  onSave: (updated: ScannedQuestion) => void;
  onClose: () => void;
}) {
  const [type, setType] = useState<QuestionType>(q.type);
  const [stem, setStem] = useState(q.stem);
  const [mediaUrl, setMediaUrl] = useState(q.mediaUrl || "");
  const [tagsInput, setTagsInput] = useState(q.tags.join(", "));
  const [options, setOptions] = useState<{ label: string; isCorrect: boolean }[]>(
    q.options.length > 0 ? q.options : [{ label: "", isCorrect: true }]
  );

  const validation = validateScannedQuestion({
    ...q,
    type,
    stem,
    mediaUrl: mediaUrl || null,
    tags: tagsInput.split(",").map((t) => t.trim()).filter(Boolean),
    options,
  });

  function handleOptionLabelChange(index: number, label: string) {
    const next = [...options];
    next[index].label = label;
    setOptions(next);
  }

  function handleToggleOptionCorrect(index: number) {
    const next = options.map((opt, i) => {
      if (type === "MCQ_SINGLE") {
        return { ...opt, isCorrect: i === index };
      }
      if (i === index) {
        return { ...opt, isCorrect: !opt.isCorrect };
      }
      return opt;
    });
    setOptions(next);
  }

  function handleAddOption() {
    setOptions((prev) => [...prev, { label: `Option ${prev.length + 1}`, isCorrect: false }]);
  }

  function handleRemoveOption(index: number) {
    setOptions((prev) => prev.filter((_, i) => i !== index));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const updatedTags = tagsInput.split(/[,;]/).map((t) => t.trim()).filter(Boolean);
    onSave({
      ...q,
      type,
      stem,
      mediaUrl: mediaUrl.trim() || null,
      tags: updatedTags,
      options: type === "NUMERIC" ? [] : options,
      isValid: validation.isValid,
      errors: validation.errors,
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm overflow-y-auto">
      <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl ring-1 ring-slate-900/10 my-8">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h3 className="text-base font-bold text-slate-900">
            Edit Scanned Question (Row #{q.originalRow})
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <XIcon className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
          {/* Question Type */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Question Type</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as QuestionType)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white font-medium text-slate-800 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="MCQ_SINGLE">MCQ Single Answer</option>
              <option value="MCQ_MULTI">MCQ Multiple Answers</option>
              <option value="NUMERIC">Numeric Answer</option>
              <option value="LIKERT">Likert Scale</option>
            </select>
          </div>

          {/* Question Stem */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Question Stem</label>
            <textarea
              rows={3}
              value={stem}
              onChange={(e) => setStem(e.target.value)}
              placeholder="Enter question text..."
              className="w-full rounded-lg border border-slate-300 p-3 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          {/* Tags & Media URL */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Tags (comma separated)</label>
              <Input
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                placeholder="e.g. math, algebra, geometry"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Media URL (optional)</label>
              <Input
                value={mediaUrl}
                onChange={(e) => setMediaUrl(e.target.value)}
                placeholder="https://..."
              />
            </div>
          </div>

          {/* Options list for MCQs and Likert */}
          {type !== "NUMERIC" && (
            <div className="space-y-3 pt-2 border-t border-slate-100">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-semibold text-slate-700">
                  Options & Correct Answer Selection
                </label>
                <button
                  type="button"
                  onClick={handleAddOption}
                  className="text-xs font-semibold text-indigo-600 hover:underline flex items-center gap-1"
                >
                  <PlusIcon className="h-3.5 w-3.5" /> Add Option
                </button>
              </div>

              {options.map((opt, i) => (
                <div key={i} className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleToggleOptionCorrect(i)}
                    title={opt.isCorrect ? "Correct answer" : "Mark as correct answer"}
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition-colors ${
                      opt.isCorrect
                        ? "border-emerald-600 bg-emerald-600 text-white"
                        : "border-slate-300 bg-white text-transparent hover:border-emerald-400"
                    }`}
                  >
                    <CheckIcon className="h-3.5 w-3.5" />
                  </button>

                  <Input
                    value={opt.label}
                    onChange={(e) => handleOptionLabelChange(i, e.target.value)}
                    placeholder={`Option ${i + 1}`}
                    className="flex-1 text-sm"
                  />

                  {options.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveOption(i)}
                      className="p-1 text-slate-400 hover:text-red-600"
                    >
                      <TrashIcon className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Validation Feedback */}
          {!validation.isValid && (
            <div className="rounded-lg bg-red-50 p-3 text-xs text-red-700 space-y-1">
              {validation.errors.map((err, i) => (
                <p key={i} className="font-medium">• {err}</p>
              ))}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" size="md" className="px-5">
              Save & Validate Question
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
