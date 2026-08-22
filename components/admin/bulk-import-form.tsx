"use client";

import { useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { DownloadIcon, UploadIcon, WarningIcon, DocumentIcon } from "@/components/ui/icons";
import { type ScannedQuestion } from "@/lib/bulk-import";
import { ScannedQuestionsPanel } from "./scanned-questions-panel";

const ACCEPTED_EXTENSIONS = [".csv", ".xlsx", ".xlsm", ".xls", ".docx", ".doc"];

function hasAcceptedExtension(name: string) {
  const lower = name.toLowerCase();
  return ACCEPTED_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

const SAMPLE_CSV_CONTENT = `type,stem,mediaUrl,tags,options,correctOptions
MCQ_SINGLE,"What is the capital of France?",,"geography,europe","Paris;London;Berlin;Madrid","1"
MCQ_MULTI,"Which of the following are prime numbers?",,"math","2;3;4;5","1;2;4"
NUMERIC,"What is 15 multiplied by 8?",,"math","","120"
LIKERT,"I enjoy working as part of a team.",,"personality","Strongly disagree;Disagree;Neutral;Agree;Strongly agree",""`;

const SAMPLE_WORD_CONTENT = `QUESTION 1
What is the primary function of a web router?
A) Directing network traffic
B) Storing web pages
C) Translating domain names
D) Providing wireless signal only
Answer: A
Type: MCQ_SINGLE
Tags: networking, hardware

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
Calculate 12 times 8.
Answer: 96
Type: NUMERIC
Tags: math`;

function downloadTemplate(format: "csv" | "txt") {
  let content = SAMPLE_CSV_CONTENT;
  let filename = "question-import-template.csv";
  let mimeType = "text/csv;charset=utf-8";

  if (format === "txt") {
    content = SAMPLE_WORD_CONTENT;
    filename = "question-import-word-template.txt";
    mimeType = "text/plain;charset=utf-8";
  }

  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function BulkImportForm({ bankId }: { bankId: string }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileSize, setFileSize] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [scannedResult, setScannedResult] = useState<{
    bankName: string;
    questions: ScannedQuestion[];
  } | null>(null);

  const dragDepth = useRef(0);

  function assignFile(file: File) {
    if (!hasAcceptedExtension(file.name)) {
      setError("Unsupported file type — upload a CSV, Excel (.xlsx, .xls), or Word (.docx, .doc) file.");
      return;
    }
    const dt = new DataTransfer();
    dt.items.add(file);
    if (fileInputRef.current) fileInputRef.current.files = dt.files;
    setFileName(file.name);
    const kb = (file.size / 1024).toFixed(1);
    setFileSize(`${kb} KB`);
    setError(null);
    setScannedResult(null);
  }

  function handleDragEnter(e: React.DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    if (e.dataTransfer.types.includes("Files")) {
      dragDepth.current += 1;
      setIsDragOver(true);
    }
  }

  function handleDragOver(e: React.DragEvent<HTMLLabelElement>) {
    e.preventDefault();
  }

  function handleDragLeave(e: React.DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setIsDragOver(false);
  }

  function handleDrop(e: React.DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    dragDepth.current = 0;
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) assignFile(file);
  }

  function clearFile() {
    setFileName(null);
    setFileSize(null);
    setError(null);
    setScannedResult(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleScanDocument(e: React.FormEvent) {
    e.preventDefault();
    const file = fileInputRef.current?.files?.[0];
    if (!file) return;

    setScanning(true);
    setError(null);

    const formData = new FormData();
    formData.append("bankId", bankId);
    formData.append("file", file);

    const res = await fetch("/api/questions/scan", {
      method: "POST",
      body: formData,
    });

    setScanning(false);

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(typeof body?.error === "string" ? body.error : "Could not scan questions from document.");
      return;
    }

    const body = await res.json();
    setScannedResult({
      bankName: body.bankName,
      questions: body.questions,
    });
  }

  // If questions have been scanned, display the interactive Scan & Upload Panel
  if (scannedResult && fileName) {
    return (
      <ScannedQuestionsPanel
        bankId={bankId}
        bankName={scannedResult.bankName}
        fileName={fileName}
        initialQuestions={scannedResult.questions}
        onReset={clearFile}
      />
    );
  }

  return (
    <Card className="p-6">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-4">
        <div>
          <h3 className="text-base font-semibold text-slate-900">Scan & Upload Questions</h3>
          <p className="mt-1 text-sm text-slate-500">
            Upload CSV spreadsheets, Excel workbooks (.xlsx, .xls), or Word documents (.docx, .doc) to scan questions.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => downloadTemplate("csv")}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50/50 px-3 py-1.5 text-xs font-semibold text-indigo-700 transition-colors hover:bg-indigo-100"
          >
            <DownloadIcon className="h-4 w-4" />
            CSV / Excel Sample Template
          </button>
          <button
            type="button"
            onClick={() => downloadTemplate("txt")}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50/50 px-3 py-1.5 text-xs font-semibold text-indigo-700 transition-colors hover:bg-indigo-100"
          >
            <DocumentIcon className="h-4 w-4" />
            Word / Text Sample Template
          </button>
        </div>
      </div>

      <form onSubmit={handleScanDocument} className="mt-5 space-y-4">
        <label
          onDragEnter={handleDragEnter}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`flex min-h-[160px] w-full cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 text-center transition-colors ${
            isDragOver
              ? "border-indigo-500 bg-indigo-50/80 text-indigo-700"
              : fileName
              ? "border-emerald-300 bg-emerald-50/30 text-emerald-900"
              : "border-slate-300 bg-slate-50/50 text-slate-600 hover:border-indigo-400 hover:bg-indigo-50/30"
          }`}
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-slate-900/5">
            <UploadIcon className={`h-6 w-6 ${fileName ? "text-emerald-600" : "text-indigo-600"}`} />
          </div>
          <p className="mt-3 text-sm font-medium">
            {fileName ? (
              <span className="text-emerald-700 font-semibold">{fileName} ({fileSize})</span>
            ) : isDragOver ? (
              "Drop your document here..."
            ) : (
              "Click to browse or drag & drop your Excel, CSV, or Word file"
            )}
          </p>
          <p className="mt-1 text-xs text-slate-400">
            Supported formats: .CSV, .XLSX, .XLS, .DOCX, .DOC (up to 500 questions per document)
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.xlsx,.xlsm,.xls,.docx,.doc"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) assignFile(file);
            }}
          />
        </label>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          {fileName && (
            <button
              type="button"
              onClick={clearFile}
              className="text-xs font-medium text-slate-500 hover:text-slate-700"
            >
              Clear file selection
            </button>
          )}
          <div className="flex items-center gap-3 ml-auto">
            <Button type="submit" size="md" disabled={scanning || !fileName} className="px-6">
              {scanning && <Spinner className="h-4 w-4 text-white mr-2" />}
              {scanning ? "Scanning Questions..." : "Scan & Review Questions"}
            </Button>
          </div>
        </div>
      </form>

      {error && (
        <div className="mt-5 flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <WarningIcon className="h-5 w-5 shrink-0 text-red-600 mt-0.5" />
          <div>
            <p className="font-semibold font-sans">Document Scanning Error</p>
            <p className="text-xs text-red-700 mt-0.5">{error}</p>
          </div>
        </div>
      )}
    </Card>
  );
}
