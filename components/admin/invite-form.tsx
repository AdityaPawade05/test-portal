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
  id?: string;
  email: string;
  link: string;
  emailSent: boolean;
  emailError: string | null;
  expiresAt?: string;
  candidateName?: string | null;
};

type InvalidRow = { row: number; value: string };

type ValidationStatus = "valid" | "invalid" | "risky" | "unknown";

type EmailValidation = {
  email: string;
  status: ValidationStatus;
  reason: string | null;
  autocorrect: string | null;
};

function downloadCsvTemplate() {
  const csv = "email,name\r\ncandidate1@example.com,Alice Smith\r\ncandidate2@example.com,Bob Jones\r\n";
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "invite-candidates-template.csv";
  a.click();
  URL.revokeObjectURL(url);
}

function formatShortDate(value: string | Date | undefined): string | null {
  if (!value) return null;
  try {
    return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch {
    return null;
  }
}

const STATUS_STYLES: Record<ValidationStatus, { pill: string; label: string; icon: string }> = {
  valid:   { pill: "bg-emerald-50 border-emerald-200 text-emerald-700", label: "Verified", icon: "✓" },
  risky:   { pill: "bg-amber-50 border-amber-200 text-amber-700",       label: "Risky",    icon: "⚠" },
  unknown: { pill: "bg-slate-50 border-slate-200 text-slate-500",       label: "Unknown",  icon: "?" },
  invalid: { pill: "bg-red-50 border-red-200 text-red-700",             label: "Invalid",  icon: "✗" },
};

export function InviteForm({ testId, published }: { testId: string; published: boolean }) {
  const [emails, setEmails] = useState("");
  const [expiresInDays, setExpiresInDays] = useState<number>(14);
  const [customNote, setCustomNote] = useState("");
  const [showCustomNote, setShowCustomNote] = useState(false);
  const [showEmailPreview, setShowEmailPreview] = useState(false);
  const [showSmtpGuide, setShowSmtpGuide] = useState(false);

  const [fileName, setFileName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const dragDepth = useRef(0);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<InviteResult[] | null>(null);
  const [invalidRows, setInvalidRows] = useState<InvalidRow[]>([]);
  const [copiedAll, setCopiedAll] = useState(false);

  // Validation state
  const [validating, setValidating] = useState(false);
  const [validationMap, setValidationMap] = useState<Map<string, EmailValidation>>(new Map());
  const [validationDone, setValidationDone] = useState(false);

  // Email count & duplicate detection
  const rawEmailList = emails
    .split(/[\n,;]/)
    .map((e) => e.trim())
    .filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
  const uniqueEmailSet = new Set(rawEmailList.map((e) => e.toLowerCase()));
  const parsedEmailList = [...uniqueEmailSet];
  const duplicateCount = rawEmailList.length - uniqueEmailSet.size;

  // Reset validation when emails change
  function handleEmailsChange(value: string) {
    setEmails(value);
    setValidationDone(false);
    setValidationMap(new Map());
  }

  // Summary counts from validation
  const verifiedCount  = [...validationMap.values()].filter((v) => v.status === "valid").length;
  const riskyCount     = [...validationMap.values()].filter((v) => v.status === "risky").length;
  const invalidCount   = [...validationMap.values()].filter((v) => v.status === "invalid").length;
  const unknownCount   = [...validationMap.values()].filter((v) => v.status === "unknown").length;

  // Emails that will actually be sent (valid + risky + unknown, not invalid)
  const sendableEmails = parsedEmailList.filter((e) => {
    const v = validationMap.get(e.toLowerCase());
    return !v || v.status !== "invalid";
  });

  async function handleVerifyEmails() {
    if (parsedEmailList.length === 0) return;
    setValidating(true);
    setValidationDone(false);

    try {
      const res = await fetch("/api/validate-emails", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emails: parsedEmailList }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 503) {
          setError(data.error || "Email validation service not configured.");
        } else {
          setError("Verification failed. You can still send invitations.");
        }
        return;
      }

      const map = new Map<string, EmailValidation>();
      for (const r of data.results as EmailValidation[]) {
        map.set(r.email.toLowerCase(), r);
      }
      setValidationMap(map);
      setValidationDone(true);
    } catch {
      setError("Could not connect to verification service. You can still send without verifying.");
    } finally {
      setValidating(false);
    }
  }

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
    setValidationDone(false);
    setValidationMap(new Map());
  }

  function clearFile() {
    setFileName(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    setValidationDone(false);
    setValidationMap(new Map());
  }

  function handleDragEnter(e: React.DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    if (e.dataTransfer.types.includes("Files")) { dragDepth.current += 1; setIsDragOver(true); }
  }
  function handleDragOver(e: React.DragEvent<HTMLLabelElement>) { e.preventDefault(); }
  function handleDragLeave(e: React.DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setIsDragOver(false);
  }
  function handleDrop(e: React.DragEvent<HTMLLabelElement>) {
    e.preventDefault(); dragDepth.current = 0; setIsDragOver(false);
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

    // If validation done and ALL emails are invalid, block send
    if (validationDone && invalidCount > 0 && sendableEmails.length === 0) {
      setError("All email addresses failed verification. Fix or remove them before sending.");
      return;
    }

    setSubmitting(true);
    setError(null);
    setResults(null);
    setInvalidRows([]);

    const expiresAtDate = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString();

    let res: Response;
    if (file) {
      const formData = new FormData();
      formData.append("testId", testId);
      formData.append("file", file);
      formData.append("expiresInDays", String(expiresInDays));
      if (customNote.trim()) formData.append("customNote", customNote.trim());
      res = await fetch("/api/invitations", { method: "POST", body: formData });
    } else {
      // Only send validated-sendable emails (skip "invalid" ones)
      const emailsToSend = validationDone ? sendableEmails : parsedEmailList;
      res = await fetch("/api/invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          testId,
          emails: emailsToSend,
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
      body.invitations.map((i: { id?: string; email: string; link: string; emailSent: boolean; emailError: string | null; candidateName?: string | null }) => ({
        id: i.id,
        email: i.email,
        link: i.link,
        emailSent: i.emailSent,
        emailError: i.emailError,
        expiresAt: expiresAtDate,
        candidateName: i.candidateName ?? null,
      })),
    );
    if (Array.isArray(body.invalidRows)) setInvalidRows(body.invalidRows);
    setEmails("");
    setValidationDone(false);
    setValidationMap(new Map());
    clearFile();
  }

  const [resendingId, setResendingId] = useState<string | null>(null);

  async function handleResendEmail(invitationId: string, email: string) {
    setResendingId(invitationId);
    try {
      const res = await fetch(`/api/invitations/${invitationId}/resend`, { method: "POST" });
      if (res.ok) {
        setResults((prev) =>
          prev ? prev.map((item) => item.id === invitationId ? { ...item, emailSent: true, emailError: null } : item) : null
        );
      } else {
        const data = await res.json().catch(() => null);
        alert(data?.error || `Failed to resend email to ${email}`);
      }
    } catch {
      alert(`Error resending email to ${email}`);
    } finally {
      setResendingId(null);
    }
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

  const sentCount   = results?.filter((r) => r.emailSent).length ?? 0;
  const failedCount = results?.filter((r) => !r.emailSent).length ?? 0;
  const previewFirstName = parsedEmailList[0]?.split("@")[0]?.split(/[._-]/)[0] ?? null;

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
            <label className="text-xs font-semibold text-slate-700">Candidate Email Addresses</label>
            <div className="flex items-center gap-2">
              {duplicateCount > 0 && (
                <span className="text-xs font-medium text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200/60">
                  {duplicateCount} duplicate{duplicateCount === 1 ? "" : "s"} will be skipped
                </span>
              )}
              {parsedEmailList.length > 0 && !validationDone && (
                <span className="text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200/60">
                  {parsedEmailList.length} valid format{parsedEmailList.length === 1 ? "" : "s"} detected
                </span>
              )}
            </div>
          </div>
          <Textarea
            rows={3}
            placeholder={"candidate1@example.com, candidate2@example.com\n(comma separated or one per line)"}
            value={emails}
            disabled={!!fileName}
            onChange={(e) => handleEmailsChange(e.target.value)}
            className="font-mono text-xs focus:ring-indigo-500"
          />

          {/* Verify button — only shown when emails are typed and not yet verified */}
          {parsedEmailList.length > 0 && !fileName && (
            <div className="flex items-center gap-3 pt-1">
              {!validationDone ? (
                <button
                  type="button"
                  disabled={validating}
                  onClick={handleVerifyEmails}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-300 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 transition-colors disabled:opacity-60"
                >
                  {validating ? (
                    <><Spinner className="h-3.5 w-3.5 text-indigo-700" /> Verifying {parsedEmailList.length} email{parsedEmailList.length === 1 ? "" : "s"}…</>
                  ) : (
                    <>🔍 Verify Email Addresses</>
                  )}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => { setValidationDone(false); setValidationMap(new Map()); }}
                  className="text-xs text-slate-500 hover:text-slate-700 underline"
                >
                  Re-verify
                </button>
              )}
            </div>
          )}

          {/* Validation results per email */}
          {validationDone && parsedEmailList.length > 0 && (
            <div className="space-y-1.5 pt-1">
              {/* Summary bar */}
              <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold">
                {verifiedCount > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-emerald-700">
                    ✓ {verifiedCount} verified
                  </span>
                )}
                {riskyCount > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-amber-700">
                    ⚠ {riskyCount} risky
                  </span>
                )}
                {unknownCount > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 border border-slate-200 px-2 py-0.5 text-slate-500">
                    ? {unknownCount} unknown
                  </span>
                )}
                {invalidCount > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-red-50 border border-red-200 px-2 py-0.5 text-red-700">
                    ✗ {invalidCount} invalid — will be skipped
                  </span>
                )}
              </div>

              {/* Per-email rows */}
              <div className="rounded-xl border border-slate-200 bg-slate-50 divide-y divide-slate-100 overflow-hidden">
                {parsedEmailList.map((email) => {
                  const v = validationMap.get(email.toLowerCase());
                  const status: ValidationStatus = v?.status ?? "unknown";
                  const style = STATUS_STYLES[status];
                  return (
                    <div key={email} className="flex items-center justify-between gap-3 px-3 py-2">
                      <div className="min-w-0">
                        <span className="text-xs font-mono text-slate-700 truncate block">{email}</span>
                        {v?.reason && (
                          <span className="text-[10px] text-slate-500">{v.reason}</span>
                        )}
                        {v?.autocorrect && (
                          <span className="text-[10px] text-indigo-600">
                            Did you mean <strong>{v.autocorrect}</strong>?
                          </span>
                        )}
                      </div>
                      <span className={`shrink-0 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold ${style.pill}`}>
                        {style.icon} {style.label}
                      </span>
                    </div>
                  );
                })}
              </div>

              {invalidCount > 0 && sendableEmails.length > 0 && (
                <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  ⚠ {invalidCount} invalid email{invalidCount === 1 ? "" : "s"} will be skipped. {sendableEmails.length} email{sendableEmails.length === 1 ? "" : "s"} will receive invitations.
                </p>
              )}
            </div>
          )}
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
              onChange={(e) => { const file = e.target.files?.[0]; if (file) assignFile(file); }}
            />
            {fileName && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); clearFile(); }}
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

        <p className="text-[11px] text-slate-400 -mt-3">
          CSV supports two columns: <code className="font-mono">email</code> (required) and <code className="font-mono">name</code> (optional — used to personalise the greeting).
        </p>

        {/* Options Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 rounded-xl border border-slate-200/70 bg-slate-50/50 p-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">Link Expiration Window</label>
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
              <label className="text-xs font-semibold text-slate-700">Custom Message from Evaluator (Optional)</label>
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
          <Button type="submit" disabled={submitting || validating}>
            {submitting && <Spinner className="h-4 w-4 text-white mr-1.5" />}
            {submitting
              ? "Processing & Sending…"
              : validationDone && invalidCount > 0 && sendableEmails.length > 0
                ? `Send to ${sendableEmails.length} Valid Email${sendableEmails.length === 1 ? "" : "s"}`
                : "Send Invitations"}
          </Button>
          {!validationDone && parsedEmailList.length > 0 && !fileName && (
            <span className="text-[11px] text-slate-400">
              💡 Click <strong>Verify</strong> first to check if mailboxes exist
            </span>
          )}
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
        <div className="mt-8 pt-6 border-t border-slate-200 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                  Generated Invitations ({results.length})
                </h4>
                {sentCount > 0 && (
                  <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 border border-emerald-200">
                    {sentCount} Email Sent
                  </span>
                )}
                {failedCount > 0 && (
                  <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700 border border-amber-200">
                    {failedCount} Link{failedCount === 1 ? "" : "s"} Ready
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Share these single-use access links directly with candidates or via automated email dispatch.
              </p>
            </div>
            <div className="flex items-center gap-2">
              {failedCount > 0 && (
                <button
                  type="button"
                  onClick={() => setShowSmtpGuide(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-100 transition-colors shadow-2xs"
                >
                  <WarningIcon className="h-3.5 w-3.5 text-amber-600" /> SMTP Setup Guide
                </button>
              )}
              <Button type="button" variant="secondary" size="sm" onClick={handleCopyAllLinks} className="text-xs">
                {copiedAll ? (
                  <><CheckIcon className="h-3.5 w-3.5 text-emerald-600 mr-1" />Copied All Links!</>
                ) : "Copy All Links (CSV)"}
              </Button>
            </div>
          </div>

          {failedCount > 0 && (
            <div className="relative overflow-hidden rounded-xl border border-amber-200/80 bg-gradient-to-r from-amber-50/80 to-amber-50/30 p-4 border-l-4 border-l-amber-500 shadow-2xs">
              <div className="flex items-start justify-between gap-3">
                <div className="flex gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
                    <WarningIcon className="h-4 w-4" />
                  </div>
                  <div>
                    <h5 className="text-xs font-bold text-amber-900">Automated SMTP Email Delivery Paused — Manual Links Ready</h5>
                    <p className="mt-1 text-xs text-amber-800 leading-relaxed">
                      SMTP credentials are not configured in your <code className="rounded bg-amber-100 px-1 font-mono text-[11px] text-amber-900">.env</code> file. Candidates can still access their test immediately using the secure direct links below!
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowSmtpGuide(true)}
                  className="shrink-0 text-xs font-semibold text-amber-900 hover:text-amber-950 underline decoration-amber-400 decoration-2 underline-offset-2"
                >Configure SMTP →</button>
              </div>
            </div>
          )}

          <div className="max-h-80 overflow-y-auto space-y-2.5 pr-0.5">
            {results.map((r) => {
              const expiryLabel = formatShortDate(r.expiresAt);
              return (
                <div key={r.link} className="group flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl border border-slate-200 bg-white hover:border-indigo-200 hover:shadow-xs transition-all">
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-xs font-bold text-indigo-700">
                        {(r.candidateName ?? r.email).slice(0, 1).toUpperCase()}
                      </span>
                      <div className="min-w-0">
                        {r.candidateName && (
                          <span className="block font-semibold text-slate-900 text-xs truncate leading-tight">{r.candidateName}</span>
                        )}
                        <span className={`${r.candidateName ? "text-slate-500" : "font-semibold text-slate-900"} text-xs truncate block`}>{r.email}</span>
                      </div>
                      {r.emailSent ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 border border-emerald-200">
                          <CheckIcon className="h-3 w-3" /> Email Sent
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-800 border border-amber-200">
                          <WarningIcon className="h-3 w-3 text-amber-600" /> Direct Link
                        </span>
                      )}
                      {expiryLabel && (
                        <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500 border border-slate-200">
                          📅 Expires {expiryLabel}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs text-slate-600 font-mono">
                      <span className="truncate flex-1 text-[11px] text-slate-500">{r.link}</span>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100 justify-end">
                    {r.id && !r.emailSent && (
                      <button
                        type="button"
                        disabled={resendingId === r.id}
                        onClick={() => handleResendEmail(r.id!, r.email)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-100 shadow-2xs transition-colors"
                      >
                        {resendingId === r.id ? <Spinner className="h-3.5 w-3.5 text-amber-800" /> : "Resend Email"}
                      </button>
                    )}
                    <CopyButton value={r.link} />
                    <a href={r.link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-indigo-600 hover:bg-indigo-50 shadow-2xs transition-colors">
                      <ExternalLinkIcon className="h-3.5 w-3.5" /> Open Test
                    </a>
                  </div>
                </div>
              );
            })}
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
                <p className="text-xs text-slate-500">This is how candidate invitation emails will appear in inbox.</p>
              </div>
              <button type="button" onClick={() => setShowEmailPreview(false)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
                <XIcon className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto my-4 p-4 rounded-xl border border-slate-200 bg-slate-100/70">
              <div className="max-w-md mx-auto bg-white rounded-2xl shadow-lg border border-slate-200 overflow-hidden text-slate-800 text-xs">
                <div className="h-1.5 bg-gradient-to-r from-indigo-500 via-indigo-600 to-indigo-700" />
                <div className="p-6 space-y-4">
                  <span className="inline-block bg-indigo-50 text-indigo-600 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full">Assessment Portal</span>
                  <div>
                    {previewFirstName && (
                      <p className="text-slate-500 mb-1">Hi <strong className="text-slate-800">{previewFirstName.charAt(0).toUpperCase() + previewFirstName.slice(1)}</strong>,</p>
                    )}
                    <h4 className="text-base font-bold text-slate-900">You're invited to take an assessment</h4>
                    <p className="text-slate-500 mt-1">You have been selected to complete the <strong className="text-slate-800">Sample Assessment</strong> test.</p>
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
                    <div className="w-full bg-gradient-to-r from-indigo-600 to-indigo-700 text-white text-center font-semibold py-2.5 rounded-xl shadow-sm cursor-pointer">Start Assessment →</div>
                  </div>
                  <div className="pt-3 border-t border-slate-100 text-[11px] text-slate-400 space-y-1">
                    <p className="font-semibold text-slate-500 uppercase text-[9px] tracking-wider">Direct Link:</p>
                    <div className="bg-slate-50 border border-slate-200 p-2 rounded-lg font-mono text-[10px] text-indigo-600 truncate">http://localhost:3000/take/sample-candidate-token-123</div>
                  </div>
                </div>
                <div className="bg-slate-50 p-4 text-center border-t border-slate-100 text-[10px] text-slate-400">This invitation was sent automatically by Assessment Portal.</div>
              </div>
            </div>
            <div className="flex justify-end pt-2 border-t border-slate-100">
              <Button type="button" size="sm" onClick={() => setShowEmailPreview(false)}>Close Preview</Button>
            </div>
          </Card>
        </div>
      )}

      {/* SMTP Setup Guide Modal */}
      {showSmtpGuide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <Card className="w-full max-w-lg p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-150 my-6 bg-white rounded-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 font-bold text-sm">✉️</div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">SMTP Email Server Setup</h3>
                  <p className="text-xs text-slate-500">Configure automated email delivery for test invitations</p>
                </div>
              </div>
              <button type="button" onClick={() => setShowSmtpGuide(false)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
                <XIcon className="h-5 w-5" />
              </button>
            </div>
            <div className="my-4 space-y-4 text-xs text-slate-600">
              <p className="leading-relaxed">
                Add the following environment variables to your <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-800 border border-slate-200">.env</code> file in the project root to activate automated email dispatching:
              </p>
              <div className="relative rounded-xl border border-slate-800 bg-slate-900 p-4 font-mono text-xs text-slate-200 shadow-inner">
                <div className="absolute top-2.5 right-2.5">
                  <CopyButton value={`SMTP_HOST=smtp.gmail.com\nSMTP_PORT=587\nSMTP_USER=your-email@gmail.com\nSMTP_PASS=your-app-password\nSMTP_FROM="Assessment Portal <your-email@gmail.com>"`} />
                </div>
                <pre className="overflow-x-auto text-[11px] leading-relaxed text-indigo-300">
{`# SMTP Email Provider Configuration
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM="Assessment Portal <your-email@gmail.com>"`}
                </pre>
              </div>
              <div className="rounded-xl bg-slate-50 p-3.5 border border-slate-200/80 space-y-1.5">
                <p className="font-semibold text-slate-800">💡 Quick Tip for Gmail users:</p>
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  Generate a 16-character <strong>App Password</strong> in your Google Account settings (Security &rarr; 2-Step Verification &rarr; App passwords) and set it as <code className="font-mono text-slate-700">SMTP_PASS</code>.
                </p>
              </div>
            </div>
            <div className="flex justify-end pt-3 border-t border-slate-100">
              <Button type="button" size="sm" onClick={() => setShowSmtpGuide(false)}>Done & Close</Button>
            </div>
          </Card>
        </div>
      )}
    </Card>
  );
}
