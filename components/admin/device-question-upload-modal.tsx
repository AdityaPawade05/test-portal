"use client";

import { useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import {
  UploadIcon,
  DownloadIcon,
  CheckIcon,
  WarningIcon,
  PencilIcon,
  TrashIcon,
  PlusIcon,
  XIcon,
  DocumentIcon,
} from "@/components/ui/icons";
import { type ScannedQuestion, validateScannedQuestion } from "@/lib/bulk-import";
import type { QuestionType } from "@/lib/schemas/question";

const SAMPLE_CSV_CONTENT = `type,stem,mediaUrl,tags,options,correctOptions
MCQ_SINGLE,"What is the synonym of 'Candid'?",,"english,vocabulary","Honest;Deceitful;Secretive;Hesitant","1"
MCQ_MULTI,"Which of the following are prime numbers?",,"math","2;3;4;5","1;2;4"
NUMERIC,"What is 15 multiplied by 8?",,"math","","120"
MCQ_SINGLE,"Which planet is closest to the Sun?",,"science","Mercury;Venus;Earth;Mars","Mercury"`;

const SAMPLE_WORD_CONTENT = `QUESTION 1
What is the primary synonym for "Eloquent"?
A) Articulate
B) Incoherent
C) Silent
D) Hesitant
Answer: Option A
Type: MCQ_SINGLE
Tags: english, verbal

QUESTION 2
Which of the following are prime numbers?
A) 2
B) 3
C) 4
D) 5
Answer: A, B, D
Type: MCQ_MULTI
Tags: math

QUESTION 3
Calculate 15 multiplied by 8.
Answer: 120
Type: NUMERIC
Tags: math

QUESTION 4
Select the sentence with correct punctuation:
* A) It's a sunny day, isn't it?
  B) Its a sunny day, isnt it?
  C) It's a sunny day isnt it?
  D) Its a sunny day isn't it?
Type: MCQ_SINGLE
Tags: grammar`;

function downloadSampleTemplate(format: "csv" | "txt") {
  const isCsv = format === "csv";
  const content = isCsv ? SAMPLE_CSV_CONTENT : SAMPLE_WORD_CONTENT;
  const filename = isCsv ? "question-upload-template.csv" : "question-upload-word-template.txt";
  const mimeType = isCsv ? "text/csv;charset=utf-8" : "text/plain;charset=utf-8";

  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function DeviceQuestionUploadModal({
  bankId,
  bankName,
  isOpen,
  onClose,
  onQuestionsImported,
}: {
  bankId: string;
  bankName: string;
  isOpen: boolean;
  onClose: () => void;
  onQuestionsImported: (createdIds: string[]) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileSize, setFileSize] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);

  // Scanned questions state
  const [scannedQuestions, setScannedQuestions] = useState<ScannedQuestion[] | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<"ALL" | "VALID" | "ERRORS">("ALL");
  const [editingQuestion, setEditingQuestion] = useState<ScannedQuestion | null>(null);
  const [showFormatGuide, setShowFormatGuide] = useState(false);

  // Submitting state
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const dragDepth = useRef(0);

  if (!isOpen) return null;

  // Process & Scan File
  async function processAndScanFile(file: File) {
    const ext = file.name.toLowerCase();
    const validExtensions = [".csv", ".xlsx", ".xlsm", ".xls", ".docx", ".doc"];
    if (!validExtensions.some((e) => ext.endsWith(e))) {
      setScanError("Unsupported file type. Please upload a .docx, .xlsx, .xls, or .csv file.");
      return;
    }

    setFileName(file.name);
    setFileSize(`${(file.size / 1024).toFixed(1)} KB`);
    setScanError(null);
    setUploadError(null);
    setScanning(true);

    const formData = new FormData();
    formData.append("bankId", bankId);
    formData.append("file", file);

    try {
      const res = await fetch("/api/questions/scan", {
        method: "POST",
        body: formData,
      });

      setScanning(false);

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setScanError(typeof body?.error === "string" ? body.error : "Could not scan questions from document.");
        return;
      }

      const body = await res.json();
      const questions: ScannedQuestion[] = body.questions || [];
      setScannedQuestions(questions);

      // By default, select all valid questions (or all questions if all valid)
      const validIds = new Set(questions.filter((q) => q.isValid).map((q) => q.id));
      setSelectedIds(validIds.size > 0 ? validIds : new Set(questions.map((q) => q.id)));
    } catch (err) {
      setScanning(false);
      setScanError("Network or server error while scanning document.");
    }
  }

  function handleFileDrop(e: React.DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    dragDepth.current = 0;
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processAndScanFile(file);
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) processAndScanFile(file);
  }

  function handleReset() {
    setFileName(null);
    setFileSize(null);
    setScannedQuestions(null);
    setSelectedIds(new Set());
    setScanError(null);
    setUploadError(null);
    setEditingQuestion(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  // Option toggling directly from question preview card
  function handleOptionCorrectToggle(questionId: string, optionIndex: number) {
    if (!scannedQuestions) return;

    setScannedQuestions((prev) => {
      if (!prev) return prev;
      return prev.map((q) => {
        if (q.id !== questionId) return q;

        let nextOptions = [...q.options];
        if (q.type === "MCQ_SINGLE" || !q.type) {
          nextOptions = nextOptions.map((opt, idx) => ({
            ...opt,
            isCorrect: idx === optionIndex,
          }));
        } else if (q.type === "MCQ_MULTI") {
          nextOptions = nextOptions.map((opt, idx) =>
            idx === optionIndex ? { ...opt, isCorrect: !opt.isCorrect } : opt,
          );
        }

        const val = validateScannedQuestion({ ...q, options: nextOptions });
        const updated: ScannedQuestion = {
          ...q,
          options: nextOptions,
          isValid: val.isValid,
          errors: val.errors,
        };

        // If it became valid, auto select it
        if (updated.isValid) {
          setSelectedIds((s) => new Set([...s, updated.id]));
        }

        return updated;
      });
    });
  }

  // Auto-fix all invalid MCQ questions by defaulting option 1 as correct
  function handleAutoFixAllInvalid() {
    if (!scannedQuestions) return;

    setScannedQuestions((prev) => {
      if (!prev) return prev;
      return prev.map((q) => {
        if (q.isValid || q.options.length === 0 || (q.type !== "MCQ_SINGLE" && q.type !== "MCQ_MULTI")) {
          return q;
        }
        const nextOptions = q.options.map((opt, idx) => ({
          ...opt,
          isCorrect: idx === 0,
        }));
        const val = validateScannedQuestion({ ...q, options: nextOptions });
        return {
          ...q,
          options: nextOptions,
          isValid: val.isValid,
          errors: val.errors,
        };
      });
    });

    // Select all questions
    setSelectedIds(new Set(scannedQuestions.map((q) => q.id)));
  }

  function handleToggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleToggleSelectAll(validOnly = true) {
    if (!scannedQuestions) return;
    if (validOnly) {
      const valid = scannedQuestions.filter((q) => q.isValid).map((q) => q.id);
      setSelectedIds(new Set(valid));
    } else {
      if (selectedIds.size === scannedQuestions.length) {
        setSelectedIds(new Set());
      } else {
        setSelectedIds(new Set(scannedQuestions.map((q) => q.id)));
      }
    }
  }

  function handleDeleteQuestion(id: string) {
    if (!scannedQuestions) return;
    setScannedQuestions((prev) => (prev ? prev.filter((q) => q.id !== id) : null));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }

  function handleSaveEdit(updated: ScannedQuestion) {
    if (!scannedQuestions) return;
    const val = validateScannedQuestion(updated);
    const item: ScannedQuestion = {
      ...updated,
      isValid: val.isValid,
      errors: val.errors,
    };

    setScannedQuestions((prev) => (prev ? prev.map((q) => (q.id === updated.id ? item : q)) : null));
    if (item.isValid) {
      setSelectedIds((s) => new Set([...s, item.id]));
    }
    setEditingQuestion(null);
  }

  async function handleFinalUpload() {
    if (!scannedQuestions) return;
    const questionsToUpload = scannedQuestions.filter((q) => selectedIds.has(q.id));

    if (questionsToUpload.length === 0) {
      setUploadError("Please select at least one question to import.");
      return;
    }

    if (questionsToUpload.some((q) => !q.isValid)) {
      setUploadError("Some selected questions contain errors. Please click an option to mark the correct answer or uncheck them before uploading.");
      return;
    }

    setUploading(true);
    setUploadError(null);

    try {
      const res = await fetch("/api/questions/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bankId, questions: questionsToUpload }),
      });

      setUploading(false);

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setUploadError(typeof body?.error === "string" ? body.error : "Failed to import questions.");
        return;
      }

      const body = await res.json();
      const createdIds: string[] = body.createdIds || [];

      // Reset and notify parent
      handleReset();
      onQuestionsImported(createdIds);
      onClose();
    } catch (err) {
      setUploading(false);
      setUploadError("Network error while importing questions.");
    }
  }

  // Derived metrics
  const totalCount = scannedQuestions?.length || 0;
  const validCount = scannedQuestions?.filter((q) => q.isValid).length || 0;
  const errorCount = totalCount - validCount;

  const filteredQuestions = (scannedQuestions || []).filter((q) => {
    if (filter === "VALID") return q.isValid;
    if (filter === "ERRORS") return !q.isValid;
    return true;
  });

  const selectedCount = selectedIds.size;
  const selectedHasErrors = (scannedQuestions || []).some((q) => selectedIds.has(q.id) && !q.isValid);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm overflow-y-auto">
      <div className="w-full max-w-3xl rounded-2xl bg-white shadow-2xl ring-1 ring-slate-900/10 my-6 flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-slate-900">Upload Questions from Device</h3>
              <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-semibold text-indigo-700">
                Target Bank: {bankName}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Supports Word (.docx, .doc), Excel (.xlsx, .xls), and CSV files.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
          >
            <XIcon className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-5">
          {!scannedQuestions ? (
            /* Upload Dropzone & Templates Screen */
            <div className="space-y-5">
              <label
                onDragEnter={(e) => {
                  e.preventDefault();
                  dragDepth.current += 1;
                  setIsDragOver(true);
                }}
                onDragOver={(e) => e.preventDefault()}
                onDragLeave={(e) => {
                  e.preventDefault();
                  dragDepth.current = Math.max(0, dragDepth.current - 1);
                  if (dragDepth.current === 0) setIsDragOver(false);
                }}
                onDrop={handleFileDrop}
                className={`flex min-h-[190px] w-full cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-6 text-center transition-all ${
                  isDragOver
                    ? "border-indigo-600 bg-indigo-50/80 scale-[0.99]"
                    : "border-slate-300 bg-slate-50/60 hover:border-indigo-400 hover:bg-indigo-50/30"
                }`}
              >
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white shadow-sm ring-1 ring-slate-900/5 mb-3">
                  {scanning ? (
                    <Spinner className="h-7 w-7 text-indigo-600" />
                  ) : (
                    <UploadIcon className="h-7 w-7 text-indigo-600" />
                  )}
                </div>

                <p className="text-sm font-semibold text-slate-800">
                  {scanning
                    ? "Scanning document & analyzing questions…"
                    : fileName
                    ? `${fileName} (${fileSize})`
                    : "Drop your question document here or click to browse"}
                </p>

                <p className="mt-1 text-xs text-slate-400 max-w-sm">
                  Smart parsing for Word (.docx), Excel (.xlsx/.xls), and CSV files with automatic answer detection.
                </p>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.xlsx,.xlsm,.xls,.docx,.doc"
                  className="sr-only"
                  disabled={scanning}
                  onChange={handleFileSelect}
                />
              </label>

              {scanError && (
                <div className="rounded-xl bg-red-50 p-3.5 text-xs text-red-700 border border-red-200 flex items-start gap-2.5">
                  <WarningIcon className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold">{scanError}</p>
                    <p className="mt-0.5 text-red-600">
                      Check your document format below or download a sample template.
                    </p>
                  </div>
                </div>
              )}

              {/* Sample Templates & Guide Bar */}
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-50 p-3.5 border border-slate-200">
                <div className="text-xs">
                  <span className="font-semibold text-slate-700">Need a starting template?</span>
                  <p className="text-slate-500">Download formatted sample files</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => downloadSampleTemplate("csv")}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 transition-colors"
                  >
                    <DownloadIcon className="h-3.5 w-3.5 text-slate-500" />
                    CSV / Excel Template
                  </button>
                  <button
                    type="button"
                    onClick={() => downloadSampleTemplate("txt")}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 transition-colors"
                  >
                    <DocumentIcon className="h-3.5 w-3.5 text-slate-500" />
                    Word Q&A Template
                  </button>
                </div>
              </div>

              {/* Formatting Helper Accordion */}
              <div>
                <button
                  type="button"
                  onClick={() => setShowFormatGuide(!showFormatGuide)}
                  className="text-xs font-semibold text-indigo-600 hover:underline flex items-center gap-1"
                >
                  {showFormatGuide ? "Hide supported document formats" : "View supported document formats & styles"}
                </button>

                {showFormatGuide && (
                  <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50/50 p-4 text-xs text-slate-700 space-y-3">
                    <div>
                      <span className="font-bold text-slate-900">1. Standard Q&A Format (Word / Text):</span>
                      <pre className="mt-1 rounded bg-white p-2 border border-slate-200 text-[11px] font-mono text-slate-800">
{`1. What is the synonym for "Eloquent"?
A) Articulate
B) Incoherent
C) Silent
D) Hesitant
Answer: Option A`}
                      </pre>
                    </div>
                    <div>
                      <span className="font-bold text-slate-900">2. Inline Asterisk Format:</span>
                      <pre className="mt-1 rounded bg-white p-2 border border-slate-200 text-[11px] font-mono text-slate-800">
{`1. What is the capital of France?
* A) Paris
  B) Berlin
  C) Madrid`}
                      </pre>
                    </div>
                    <div>
                      <span className="font-bold text-slate-900">3. Table Columns (Excel / Word):</span>
                      <p className="mt-1 text-slate-600">
                        Columns: <code className="font-mono bg-white px-1 py-0.5 rounded">Question</code>, <code className="font-mono bg-white px-1 py-0.5 rounded">Option A</code>, <code className="font-mono bg-white px-1 py-0.5 rounded">Option B</code>, <code className="font-mono bg-white px-1 py-0.5 rounded">Option C</code>, <code className="font-mono bg-white px-1 py-0.5 rounded">Option D</code>, <code className="font-mono bg-white px-1 py-0.5 rounded">Answer</code>.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* Interactive Scanned Questions Review Screen */
            <div className="space-y-4">
              {/* Scan Summary & Filters */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <span className="rounded-lg bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700">
                    {fileName} ({totalCount} detected)
                  </span>
                  <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${validCount === totalCount ? "bg-emerald-100 text-emerald-800" : "bg-emerald-50 text-emerald-700"}`}>
                    <CheckIcon className="h-3 w-3" /> {validCount} Ready
                  </span>
                  {errorCount > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-900">
                      <WarningIcon className="h-3 w-3" /> {errorCount} Need Answer
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleReset}
                    className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                  >
                    Scan Different File
                  </button>
                </div>
              </div>

              {/* Filter Tabs & Quick Fix Actions */}
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setFilter("ALL")}
                    className={`rounded-full px-3 py-1 font-medium transition-colors ${
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
                    className={`rounded-full px-3 py-1 font-medium transition-colors ${
                      filter === "VALID"
                        ? "bg-emerald-600 text-white"
                        : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                    }`}
                  >
                    Ready ({validCount})
                  </button>
                  {errorCount > 0 && (
                    <button
                      type="button"
                      onClick={() => setFilter("ERRORS")}
                      className={`rounded-full px-3 py-1 font-medium transition-colors ${
                        filter === "ERRORS"
                          ? "bg-amber-600 text-white"
                          : "bg-amber-50 text-amber-800 hover:bg-amber-100"
                      }`}
                    >
                      Needs Attention ({errorCount})
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {errorCount > 0 && (
                    <button
                      type="button"
                      onClick={handleAutoFixAllInvalid}
                      className="rounded-lg bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800 border border-amber-200 hover:bg-amber-100 transition-colors"
                      title="Sets the first option as the correct answer for any questions missing one"
                    >
                      Auto-set 1st option for invalid
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleToggleSelectAll(true)}
                    className="text-indigo-600 hover:underline font-medium"
                  >
                    Select All Ready
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

              {/* Questions List */}
              <div className="space-y-3 max-h-[380px] overflow-y-auto pr-1">
                {filteredQuestions.length === 0 ? (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-6 text-center text-xs text-slate-500">
                    No questions in this filter.
                  </div>
                ) : (
                  filteredQuestions.map((q) => (
                    <Card
                      key={q.id}
                      className={`p-4 transition-all ${
                        !q.isValid
                          ? "border-amber-200 bg-amber-50/20 shadow-sm"
                          : selectedIds.has(q.id)
                          ? "border-indigo-300 bg-indigo-50/15"
                          : "border-slate-200 bg-white"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(q.id)}
                          onChange={() => handleToggleSelect(q.id)}
                          className="mt-1 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                        />

                        <div className="flex-1 min-w-0">
                          {/* Row Badges */}
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-xs font-semibold text-slate-400">
                                #{q.originalRow}
                              </span>
                              <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                                {q.type}
                              </span>
                              {!q.isValid ? (
                                <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                                  <WarningIcon className="h-3 w-3" /> Needs Answer
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
                                  <CheckIcon className="h-3 w-3" /> Ready
                                </span>
                              )}
                              {q.tags.length > 0 && (
                                <span className="text-[10px] text-slate-400">
                                  {q.tags.map((t) => `#${t}`).join(" ")}
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => setEditingQuestion(q)}
                                className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-semibold text-indigo-600 hover:bg-indigo-50"
                              >
                                <PencilIcon className="h-3.5 w-3.5" />
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteQuestion(q.id)}
                                className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                              >
                                <TrashIcon className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>

                          {/* Stem */}
                          <p className="mt-2 text-sm font-medium text-slate-900 whitespace-pre-wrap">
                            {q.stem}
                          </p>

                          {/* Error notice & 1-click instruction */}
                          {!q.isValid && (
                            <div className="mt-2 rounded-lg bg-amber-100/70 p-2 text-xs text-amber-900 font-medium flex items-center justify-between">
                              <span>👆 Click an option below to set it as the correct answer:</span>
                            </div>
                          )}

                          {/* Option Pills (Click to toggle correct answer!) */}
                          {q.options.length > 0 && (
                            <div className="mt-2.5 grid grid-cols-1 sm:grid-cols-2 gap-2">
                              {q.options.map((opt, i) => (
                                <button
                                  key={i}
                                  type="button"
                                  onClick={() => handleOptionCorrectToggle(q.id, i)}
                                  className={`flex items-center gap-2 rounded-lg p-2 text-left text-xs transition-all border ${
                                    opt.isCorrect
                                      ? "border-emerald-500 bg-emerald-50 text-emerald-950 font-semibold shadow-sm ring-1 ring-emerald-500/20"
                                      : "border-slate-200 bg-slate-50/70 text-slate-700 hover:border-indigo-300 hover:bg-indigo-50/40 cursor-pointer"
                                  }`}
                                >
                                  <span
                                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                                      opt.isCorrect
                                        ? "bg-emerald-600 text-white"
                                        : "bg-slate-200 text-slate-600"
                                    }`}
                                  >
                                    {String.fromCharCode(65 + i)}
                                  </span>
                                  <span className="flex-1 truncate">{opt.label}</span>
                                  {opt.isCorrect && (
                                    <span className="shrink-0 text-[10px] font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded">
                                      ✓ Correct
                                    </span>
                                  )}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </Card>
                  ))
                )}
              </div>
            </div>
          )}

          {uploadError && (
            <div className="rounded-xl bg-red-50 p-3 text-xs text-red-700 border border-red-200 font-medium">
              {uploadError}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-6 py-4 bg-slate-50/50 rounded-b-2xl">
          <div>
            {scannedQuestions && (
              <p className="text-xs text-slate-500">
                <span className="font-semibold text-slate-800">{selectedCount}</span> of {totalCount} questions selected to import.
              </p>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={onClose} disabled={uploading}>
              Cancel
            </Button>

            {scannedQuestions && (
              <Button
                type="button"
                size="sm"
                disabled={uploading || selectedCount === 0 || selectedHasErrors}
                onClick={handleFinalUpload}
              >
                {uploading && <Spinner className="h-3.5 w-3.5 text-white mr-1.5" />}
                {uploading
                  ? "Importing Questions…"
                  : `Import & Add ${selectedCount} Question${selectedCount === 1 ? "" : "s"} to Section`}
              </Button>
            )}
          </div>
        </div>

        {/* Detailed Question Edit Modal */}
        {editingQuestion && (
          <EditScannedQuestionModal
            question={editingQuestion}
            onSave={handleSaveEdit}
            onClose={() => setEditingQuestion(null)}
          />
        )}
      </div>
    </div>
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
    q.options.length > 0 ? q.options : [{ label: "", isCorrect: true }],
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
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm overflow-y-auto">
      <div className="w-full max-w-xl rounded-2xl bg-white shadow-2xl ring-1 ring-slate-900/10 my-8">
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

          {type !== "NUMERIC" && (
            <div className="space-y-3 pt-2 border-t border-slate-100">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-semibold text-slate-700">
                  Options & Correct Answer
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

          {!validation.isValid && (
            <div className="rounded-lg bg-red-50 p-3 text-xs text-red-700 space-y-1">
              {validation.errors.map((err, i) => (
                <p key={i} className="font-medium">• {err}</p>
              ))}
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
            <Button type="button" variant="secondary" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" size="sm">
              Save & Validate
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
