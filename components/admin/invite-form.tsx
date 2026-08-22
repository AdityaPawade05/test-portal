"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea, Input, Select } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { CopyButton } from "@/components/ui/copy-button";
import { Badge } from "@/components/ui/badge";
import {
  CheckIcon,
  DownloadIcon,
  ExternalLinkIcon,
  InboxIcon,
  UploadIcon,
  WarningIcon,
  PencilIcon,
  XIcon,
} from "@/components/ui/icons";

type InviteResult = {
  email: string;
  link: string;
  emailSent: boolean;
  emailError: string | null;
};

type InvalidRow = { row: number; value: string };

function downloadCsvTemplate() {
  const csv = "email\r\ncandidate1@example.com\r\ncandidate2@example.com\r\n";
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "invite-candidates-template.csv";
  a.click();
  URL.revokeObjectURL(url);
}

export function InviteForm({ testId, published }: { testId: string; published: boolean }) {
  const [emails, setEmails] = useState("");
  const [expiresInDays, setExpiresInDays] = useState<number>(14);
  const [customNote, setCustomNote] = useState("");
  const [showCustomNote, setShowCustomNote] = useState(false);
  const [showEmailPreview, setShowEmailPreview] = useState(false);

  const [fileName, setFileName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const dragDepth = useRef(0);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<InviteResult[] | null>(null);
  const [invalidRows, setInvalidRows] = useState<InvalidRow[]>([]);
  const [copiedAll, setCopiedAll] = useState(false);

  // Email count detection
  const parsedEmailList = emails
    .split(/[\n,;]/)
    .map((e) => e.trim())
    .filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));

  function assignFile(file: File) {
    if (!file.name.toLowerCase().endsWith(".csv")) {
      setError("Please upload a valid .csv file");
      return;
    }
    const dt = new DataTransfer();
    dt.items.add(file);
    if (fileInputRef.current) fileInputRef.current.files = dt.files;
    setFileName(file.name);
    setError(null);
  }

  function clearFile() {
    setFileName(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const file = fileInputRef.current?.files?.[0];
    if (!file && !emails.trim()) {
      setError("Enter at least one email address or upload a CSV file.");
      return;
    }

    setSubmitting(true);
    setError(null);
    setResults(null);
    setInvalidRows([]);

    let res: Response;
    if (file) {
      const formData = new FormData();
      formData.append("testId", testId);
      formData.append("file", file);
      formData.append("expiresInDays", String(expiresInDays));
      if (customNote.trim()) formData.append("customNote", customNote.trim());
      res = await fetch("/api/invitations", { method: "POST", body: formData });
    } else {
      const emailList = emails
        .split(/[\n,;]/)
        .map((e) => e.trim())
        .filter(Boolean);
      res = await fetch("/api/invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          testId,
          emails: emailList,
          expiresInDays,
          customNote: customNote.trim() || undefined,
        }),
      });
    }

    setSubmitting(false);

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(typeof body?.error === "string" ? body.error : "Could not create invitations.");
      return;
    }

    const body = await res.json();
    setResults(
      body.invitations.map((i: InviteResult) => ({
        email: i.email,
        link: i.link,
        emailSent: i.emailSent,
        emailError: i.emailError,
      })),
    );
    if (Array.isArray(body.invalidRows)) setInvalidRows(body.invalidRows);
    setEmails("");
    clearFile();
  }

  function handleCopyAllLinks() {
    if (!results || results.length === 0) return;
    const formatted = results.map((r) => `${r.email},${r.link}`).join("\n");
    navigator.clipboard.writeText(`Email,Invitation Link\n${formatted}`);
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 2500);
  }

  if (!published) {
    return (
      <Card className="flex flex-col items-center justify-center gap-3 p-10 text-center bg-slate-50/50 border border-slate-200">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
          <InboxIcon className="h-6 w-6" />
        </div>
        <div>
          <h3 className="text-base font-bold text-slate-800">Test Not Published Yet</h3>
          <p className="mt-1 max-w-sm text-xs text-slate-500">
            Publish this test from the test builder to start sending candidate invitations and generating unique assessment links.
          </p>
        </div>
      </Card>
    );
  }

  const sentCount = results?.filter((r) => r.emailSent).length ?? 0;
  const failedCount = results?.filter((r) => !r.emailSent).length ?? 0;

  return (
    <Card className="p-6 shadow-sm border border-slate-200/80">
      <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-5">
        <div>
          <h3 className="text-base font-bold text-slate-900">Invite Candidates</h3>
          <p className="text-xs text-slate-500">
            Send email invitations with secure, single-use access links.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowEmailPreview(true)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-50 transition-colors"
        >
          <PencilIcon className="h-3.5 w-3.5 text-indigo-600" />
          Preview Email Template
        </button>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        {/* Email Textarea */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-slate-700">
              Candidate Email Addresses
            </label>
            {parsedEmailList.length > 0 && (
              <span className="text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200/60">
                {parsedEmailList.length} valid email{parsedEmailList.length === 1 ? "" : "s"} detected
              </span>
            )}
          </div>
          <Textarea
            rows={3}
            placeholder="candidate1@example.com, candidate2@example.com&#10;(comma separated or one per line)"
            value={emails}
            disabled={!!fileName}
            onChange={(e) => setEmails(e.target.value)}
            className="font-mono text-xs focus:ring-indigo-500"
          />
        </div>

        {/* Divider */}
        <div className="flex items-center gap-3 text-xs text-slate-400">
          <div className="h-px flex-1 bg-slate-200" />
          or upload spreadsheet
          <div className="h-px flex-1 bg-slate-200" />
        </div>

        {/* File Upload Row */}
        <div className="flex flex-wrap items-center gap-3">
          <label
            onDragEnter={handleDragEnter}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`flex min-w-0 flex-1 cursor-pointer items-center justify-between gap-3 rounded-xl border border-dashed p-3 text-xs transition-colors ${
              isDragOver
                ? "border-indigo-500 bg-indigo-50/80 text-indigo-700"
                : "border-slate-300 text-slate-600 hover:border-indigo-400 hover:bg-indigo-50/30"
            }`}
          >
            <div className="flex items-center gap-2 truncate">
              <UploadIcon className="h-4 w-4 shrink-0 text-indigo-600" />
              <span className="truncate font-medium">
                {fileName ?? (isDragOver ? "Drop CSV file here…" : "Upload candidate list (.CSV)")}
              </span>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) assignFile(file);
              }}
            />
            {fileName && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  clearFile();
                }}
                className="text-xs font-semibold text-red-600 hover:underline"
              >
                Remove
              </button>
            )}
          </label>

          <button
            type="button"
            onClick={downloadCsvTemplate}
            className="flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <DownloadIcon className="h-3.5 w-3.5 text-indigo-600" />
            CSV Template
          </button>
        </div>

        {/* Options Row (Expiry & Custom Note Toggle) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 rounded-xl border border-slate-200/70 bg-slate-50/50 p-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Link Expiration Window
            </label>
            <Select
              value={expiresInDays}
              onChange={(e) => setExpiresInDays(Number(e.target.value))}
              className="bg-white text-xs"
            >
              <option value={3}>3 Days</option>
              <option value={7}>7 Days</option>
              <option value={14}>14 Days (Default)</option>
              <option value={30}>30 Days</option>
              <option value={60}>60 Days</option>
            </Select>
          </div>

          <div className="flex flex-col justify-end">
            <button
              type="button"
              onClick={() => setShowCustomNote(!showCustomNote)}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-700 py-2"
            >
              <PencilIcon className="h-3.5 w-3.5" />
              {showCustomNote ? "Hide custom message" : "+ Add custom message / instructions"}
            </button>
          </div>

          {showCustomNote && (
            <div className="sm:col-span-2 space-y-1 pt-2 border-t border-slate-200/60">
              <label className="text-xs font-semibold text-slate-700">
                Custom Message from Evaluator (Optional)
              </label>
              <Textarea
                rows={2}
                placeholder="e.g. Good luck on your technical screening test! Please complete this before Friday."
                value={customNote}
                onChange={(e) => setCustomNote(e.target.value)}
                className="bg-white text-xs"
              />
            </div>
          )}
        </div>

        {/* Submit Button */}
        <div className="flex items-center gap-3 pt-1">
          <Button type="submit" disabled={submitting}>
            {submitting && <Spinner className="h-4 w-4 text-white mr-1.5" />}
            {submitting ? "Processing & Sending…" : "Send Invitations"}
          </Button>
        </div>

        {error && (
          <p className="rounded-lg bg-red-50 p-3 text-xs text-red-700 border border-red-200 font-medium">
            {error}
          </p>
        )}
      </form>

      {/* Invalid CSV Rows Warning */}
      {invalidRows.length > 0 && (
        <p className="mt-4 flex items-center gap-1.5 text-xs font-medium text-amber-800 bg-amber-50 p-3 rounded-lg border border-amber-200">
          <WarningIcon className="h-4 w-4 shrink-0 text-amber-600" />
          {`Skipped ${invalidRows.length} row${invalidRows.length === 1 ? "" : "s"} with invalid email format (rows: ${invalidRows.map((r) => r.row).join(", ")}).`}
        </p>
      )}

      {/* Results Section */}
      {results && results.length > 0 && (
        <div className="mt-6 pt-5 border-t border-slate-200 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                Generated Invitations ({results.length})
              </h4>
              <p className="text-xs text-slate-500">
                {sentCount > 0 && (
                  <span className="text-emerald-600 font-semibold">{sentCount} sent via email. </span>
                )}
                {failedCount > 0 && (
                  <span className="text-amber-600 font-semibold">
                    {failedCount} manual share link{failedCount === 1 ? "" : "s"} ready.
                  </span>
                )}
              </p>
            </div>

            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleCopyAllLinks}
              className="text-xs"
            >
              {copiedAll ? (
                <>
                  <CheckIcon className="h-3.5 w-3.5 text-emerald-600 mr-1" />
                  Copied All Links!
                </>
              ) : (
                "Copy All Links (CSV)"
              )}
            </Button>
          </div>

          {failedCount > 0 && (
            <div className="rounded-lg bg-amber-50 p-3 text-xs text-amber-800 border border-amber-200/80 space-y-1">
              <p className="font-semibold flex items-center gap-1.5">
                <WarningIcon className="h-4 w-4 text-amber-600" />
                SMTP Email Delivery Notice
              </p>
              <p className="text-amber-700">
                Some or all email invitations could not be dispatched via SMTP (e.g. SMTP environment variables are unconfigured or blocked). You can copy and share the unique access links below directly with candidates!
              </p>
            </div>
          )}

          <div className="max-h-64 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50/50 divide-y divide-slate-100">
            {results.map((r) => (
              <div key={r.link} className="flex items-center justify-between gap-3 p-3 text-xs hover:bg-white transition-colors">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 truncate">
                    <span className="font-bold text-slate-800">{r.email}</span>
                    {r.emailSent ? (
                      <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 border border-emerald-200">
                        <CheckIcon className="h-3 w-3" /> Sent
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700 border border-amber-200">
                        <WarningIcon className="h-3 w-3" /> Direct Link
                      </span>
                    )}
                  </div>
                  <p className="truncate font-mono text-[11px] text-slate-400 mt-0.5">{r.link}</p>
                </div>

                <div className="flex shrink-0 items-center gap-1.5">
                  <CopyButton value={r.link} />
                  <a
                    href={r.link}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-indigo-600 hover:bg-indigo-50 shadow-2xs"
                  >
                    <ExternalLinkIcon className="h-3.5 w-3.5" />
                    Open
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Email Template Preview Modal */}
      {showEmailPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <Card className="w-full max-w-xl p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-150 my-6 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">Email Template Preview</h3>
                <p className="text-xs text-slate-500">
                  This is how candidate invitation emails will appear in inbox.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowEmailPreview(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <XIcon className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto my-4 p-4 rounded-xl border border-slate-200 bg-slate-100/70">
              <div className="max-w-md mx-auto bg-white rounded-2xl shadow-lg border border-slate-200 overflow-hidden text-slate-800 text-xs">
                {/* Top Accent */}
                <div className="h-1.5 bg-gradient-to-r from-indigo-500 via-indigo-600 to-indigo-700" />
                
                <div className="p-6 space-y-4">
                  <span className="inline-block bg-indigo-50 text-indigo-600 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full">
                    Assessment Portal
                  </span>
                  
                  <div>
                    <h4 className="text-base font-bold text-slate-900">You're invited to take an assessment</h4>
                    <p className="text-slate-500 mt-1">
                      You have been selected to complete the <strong className="text-slate-800">Sample Assessment</strong> test.
                    </p>
                  </div>

                  {customNote.trim() && (
                    <div className="bg-slate-100 border-l-4 border-indigo-600 p-3 rounded-r-lg text-slate-700">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-0.5">Note from evaluator:</span>
                      "{customNote.trim()}"
                    </div>
                  )}

                  <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 flex justify-between text-slate-500">
                    <span>📅 <strong>Expires:</strong> {expiresInDays} Days</span>
                    <span>⏱️ <strong>Time Limit:</strong> Timed Assessment</span>
                  </div>

                  <div className="pt-2">
                    <div className="w-full bg-gradient-to-r from-indigo-600 to-indigo-700 text-white text-center font-semibold py-2.5 rounded-xl shadow-sm cursor-pointer">
                      Start Assessment →
                    </div>
                  </div>

                  <div className="pt-3 border-t border-slate-100 text-[11px] text-slate-400 space-y-1">
                    <p className="font-semibold text-slate-500 uppercase text-[9px] tracking-wider">Direct Link:</p>
                    <div className="bg-slate-50 border border-slate-200 p-2 rounded-lg font-mono text-[10px] text-indigo-600 truncate">
                      http://localhost:3000/take/sample-candidate-token-123
                    </div>
                  </div>
                </div>

                <div className="bg-slate-50 p-4 text-center border-t border-slate-100 text-[10px] text-slate-400">
                  This invitation was sent automatically by Assessment Portal.
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-100">
              <Button type="button" size="sm" onClick={() => setShowEmailPreview(false)}>
                Close Preview
              </Button>
            </div>
          </Card>
        </div>
      )}
    </Card>
  );
}
