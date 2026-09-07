"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import { Spinner } from "@/components/ui/spinner";

interface InviteDriveCandidateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  driveId: string;
  companyName: string;
  jobRole: string;
  testName?: string;
  testPublished?: boolean;
  hasTest: boolean;
  selectedCandidateIds?: string[];
  totalCandidatesCount: number;
}

const COMMON_BRANCHES = ["CSE", "IT", "AI & DS", "ECE", "EEE", "MECH", "CIVIL", "MCA"];

export function InviteDriveCandidateModal({
  isOpen,
  onClose,
  onSuccess,
  driveId,
  companyName,
  jobRole,
  testName,
  testPublished,
  hasTest,
  selectedCandidateIds = [],
  totalCandidatesCount,
}: InviteDriveCandidateModalProps) {
  const [activeTab, setActiveTab] = useState<"single" | "batch">("single");

  // Single Student Form State
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [rollNumber, setRollNumber] = useState("");
  const [branch, setBranch] = useState("CSE");
  const [cgpa, setCgpa] = useState("");
  const [passingYear, setPassingYear] = useState(new Date().getFullYear().toString());
  const [labSlot, setLabSlot] = useState("");
  const [customNote, setCustomNote] = useState("");
  const [expiryDays, setExpiryDays] = useState("14");
  const [sendEmailImmediately, setSendEmailImmediately] = useState(true);

  // Batch Form State
  const [batchTarget, setBatchTarget] = useState<"ALL" | "SELECTED" | "UNINVITED">(
    selectedCandidateIds.length > 0 ? "SELECTED" : "ALL",
  );
  const [batchCustomNote, setBatchCustomNote] = useState("");
  const [batchExpiryDays, setBatchExpiryDays] = useState("14");

  // Operation status
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successResult, setSuccessResult] = useState<{
    message: string;
    takeUrl?: string | null;
    token?: string | null;
    candidateName?: string;
    candidateEmail?: string;
  } | null>(null);

  if (!isOpen) return null;

  async function handleSingleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccessResult(null);

    if (!name.trim() || !email.trim() || !rollNumber.trim() || !branch.trim()) {
      setError("Please fill in all required fields (Name, Email, Roll No, Branch).");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/drives/${driveId}/candidates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim().toLowerCase(),
          rollNumber: rollNumber.trim().toUpperCase(),
          branch: branch.trim(),
          cgpa: cgpa ? parseFloat(cgpa) : null,
          passingYear: passingYear ? parseInt(passingYear, 10) : null,
          labSlot: labSlot.trim() || null,
          customNote: customNote.trim() || undefined,
          sendEmail: sendEmailImmediately,
          expiresInDays: parseInt(expiryDays, 10) || 14,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to invite student");
      }

      setSuccessResult({
        message: data.message || "Student added and invited successfully!",
        takeUrl: data.takeUrl,
        token: data.token,
        candidateName: name.trim(),
        candidateEmail: email.trim(),
      });

      // Clear form
      setName("");
      setEmail("");
      setRollNumber("");
      setCgpa("");
      setLabSlot("");
      setCustomNote("");

      onSuccess();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleBatchSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccessResult(null);

    setSubmitting(true);
    try {
      const res = await fetch(`/api/drives/${driveId}/invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          candidateIds: batchTarget === "SELECTED" ? selectedCandidateIds : undefined,
          target: batchTarget,
          customNote: batchCustomNote.trim() || undefined,
          expiresInDays: parseInt(batchExpiryDays, 10) || 14,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to dispatch batch invitations");
      }

      setSuccessResult({
        message: data.message || `Dispatched ${data.sentCount || 0} invitation emails successfully!`,
      });

      onSuccess();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "An error occurred during batch dispatch");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="relative w-full max-w-2xl rounded-2xl bg-white p-6 sm:p-7 shadow-2xl border border-slate-100 animate-in fade-in zoom-in-95 duration-200 max-h-[92vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-start justify-between pb-4 border-b border-slate-100">
          <div>
            <div className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-0.5 text-[11px] font-bold text-blue-700 uppercase tracking-wider mb-1">
              <span>✉️</span> Placement Invitation Center
            </div>
            <h2 className="text-xl font-bold text-slate-900">
              Invite Students to {companyName} Drive
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Role: <strong className="text-slate-700">{jobRole}</strong>
              {testName && (
                <> • Assessment: <strong className="text-blue-700">{testName}</strong></>
              )}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Warning if no test linked or published */}
        {!hasTest ? (
          <div className="mt-4 rounded-xl bg-amber-50 border border-amber-200 p-3.5 text-xs text-amber-800">
            <strong>⚠️ No Assessment Test Linked:</strong> You can register students to the roster now, but invitation links and emails can only be generated once you assign a published test to this drive.
          </div>
        ) : !testPublished ? (
          <div className="mt-4 rounded-xl bg-amber-50 border border-amber-200 p-3.5 text-xs text-amber-800">
            <strong>⚠️ Test Not Published:</strong> The linked test <em>{testName}</em> is currently in draft mode. Publish the test to allow students to take their assessment.
          </div>
        ) : null}

        {/* Tabs */}
        <div className="flex border-b border-slate-200 mt-4">
          <button
            type="button"
            onClick={() => {
              setActiveTab("single");
              setError(null);
              setSuccessResult(null);
            }}
            className={`flex-1 py-2.5 text-xs font-bold transition-all border-b-2 ${
              activeTab === "single"
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            ➕ Invite Single Student
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab("batch");
              setError(null);
              setSuccessResult(null);
            }}
            className={`flex-1 py-2.5 text-xs font-bold transition-all border-b-2 ${
              activeTab === "batch"
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            ✉️ Batch Dispatch Invitations ({totalCandidatesCount})
          </button>
        </div>

        {/* Feedback Messages */}
        {error && (
          <div className="mt-4 rounded-xl bg-red-50 border border-red-200 p-3 text-xs font-semibold text-red-700 flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600">✕</button>
          </div>
        )}

        {successResult && (
          <div className="mt-4 rounded-xl bg-emerald-50 border border-emerald-200 p-4 space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold text-emerald-800">
              <span className="text-base">✓</span>
              <span>{successResult.message}</span>
            </div>

            {successResult.takeUrl && (
              <div className="bg-white border border-emerald-200 rounded-xl p-3 space-y-1.5 shadow-xs">
                <span className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                  Direct Student Magic Assessment Link:
                </span>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={successResult.takeUrl}
                    className="flex-1 rounded-lg bg-slate-50 border border-slate-200 px-2.5 py-1.5 text-xs font-mono text-slate-700 select-all"
                  />
                  <CopyButton value={successResult.takeUrl} />
                </div>
                <p className="text-[11px] text-slate-500">
                  Share this link directly with the student if they don&apos;t receive the email.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Tab 1: Single Student Invitation Form */}
        {activeTab === "single" && (
          <form onSubmit={handleSingleSubmit} className="mt-4 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Full Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Rahul Sharma"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium text-slate-800 focus:border-blue-500 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Student Email <span className="text-rose-500">*</span>
                </label>
                <input
                  type="email"
                  required
                  placeholder="e.g. rahul.sharma@college.edu"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium text-slate-800 focus:border-blue-500 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  PRN / Roll Number <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. 2022BCSE045"
                  value={rollNumber}
                  onChange={(e) => setRollNumber(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium text-slate-800 focus:border-blue-500 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Branch / Department <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Computer Science"
                  value={branch}
                  onChange={(e) => setBranch(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium text-slate-800 focus:border-blue-500 focus:outline-hidden"
                />
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {COMMON_BRANCHES.map((b) => (
                    <button
                      key={b}
                      type="button"
                      onClick={() => setBranch(b)}
                      className={`text-[10px] px-2 py-0.5 rounded-md font-semibold transition-colors ${
                        branch === b
                          ? "bg-blue-600 text-white"
                          : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                      }`}
                    >
                      {b}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  CGPA (Optional)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="10"
                  placeholder="e.g. 8.75"
                  value={cgpa}
                  onChange={(e) => setCgpa(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium text-slate-800 focus:border-blue-500 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Passing Year (Batch)
                </label>
                <input
                  type="number"
                  placeholder="e.g. 2026"
                  value={passingYear}
                  onChange={(e) => setPassingYear(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium text-slate-800 focus:border-blue-500 focus:outline-hidden"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Lab & Slot Allocation (Optional)
              </label>
              <input
                type="text"
                placeholder="e.g. Lab 3 - Slot A (09:30 AM - 11:00 AM)"
                value={labSlot}
                onChange={(e) => setLabSlot(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium text-slate-800 focus:border-blue-500 focus:outline-hidden"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Link Expiry Window
                </label>
                <select
                  value={expiryDays}
                  onChange={(e) => setExpiryDays(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-800 focus:border-blue-500 focus:outline-hidden"
                >
                  <option value="1">24 Hours (1 Day)</option>
                  <option value="2">48 Hours (2 Days)</option>
                  <option value="7">7 Days (1 Week)</option>
                  <option value="14">14 Days (2 Weeks)</option>
                  <option value="30">30 Days (1 Month)</option>
                </select>
              </div>

              <div className="flex items-center pt-5">
                <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-700">
                  <input
                    type="checkbox"
                    checked={sendEmailImmediately}
                    onChange={(e) => setSendEmailImmediately(e.target.checked)}
                    className="h-4 w-4 rounded-sm border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span>Dispatch invitation email immediately</span>
                </label>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Custom Instructions / Note to Student (Optional)
              </label>
              <textarea
                rows={2}
                placeholder="e.g. Please bring your college ID card and join the designated lab 15 minutes before test start time."
                value={customNote}
                onChange={(e) => setCustomNote(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium text-slate-800 focus:border-blue-500 focus:outline-hidden"
              />
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
              >
                Close
              </button>
              <Button
                type="submit"
                disabled={submitting}
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs px-5 py-2 rounded-xl shadow-xs"
              >
                {submitting ? (
                  <span className="flex items-center gap-1.5">
                    <Spinner className="h-3 w-3" /> Sending...
                  </span>
                ) : (
                  "➕ Add & Invite Student"
                )}
              </Button>
            </div>
          </form>
        )}

        {/* Tab 2: Batch Dispatch Invitations Form */}
        {activeTab === "batch" && (
          <form onSubmit={handleBatchSubmit} className="mt-4 space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-2">
                Select Recipient Group:
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <button
                  type="button"
                  onClick={() => setBatchTarget("ALL")}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    batchTarget === "ALL"
                      ? "border-blue-500 bg-blue-50/50 text-blue-900 ring-2 ring-blue-100"
                      : "border-slate-200 bg-white hover:bg-slate-50 text-slate-700"
                  }`}
                >
                  <span className="block font-bold text-xs">All Students</span>
                  <span className="text-[11px] text-slate-500">
                    Total: {totalCandidatesCount} candidate(s)
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setBatchTarget("SELECTED")}
                  disabled={selectedCandidateIds.length === 0}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    batchTarget === "SELECTED"
                      ? "border-blue-500 bg-blue-50/50 text-blue-900 ring-2 ring-blue-100"
                      : selectedCandidateIds.length === 0
                        ? "opacity-50 border-slate-100 bg-slate-50 cursor-not-allowed text-slate-400"
                        : "border-slate-200 bg-white hover:bg-slate-50 text-slate-700"
                  }`}
                >
                  <span className="block font-bold text-xs">Selected Checkboxes</span>
                  <span className="text-[11px] text-slate-500">
                    {selectedCandidateIds.length} candidate(s) selected
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setBatchTarget("UNINVITED")}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    batchTarget === "UNINVITED"
                      ? "border-blue-500 bg-blue-50/50 text-blue-900 ring-2 ring-blue-100"
                      : "border-slate-200 bg-white hover:bg-slate-50 text-slate-700"
                  }`}
                >
                  <span className="block font-bold text-xs">Uninvited / Pending</span>
                  <span className="text-[11px] text-slate-500">
                    Re-send & uninvited only
                  </span>
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Link Expiry Window
              </label>
              <select
                value={batchExpiryDays}
                onChange={(e) => setBatchExpiryDays(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-800 focus:border-blue-500 focus:outline-hidden"
              >
                <option value="1">24 Hours (1 Day)</option>
                <option value="2">48 Hours (2 Days)</option>
                <option value="7">7 Days (1 Week)</option>
                <option value="14">14 Days (2 Weeks)</option>
                <option value="30">30 Days (1 Month)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Custom Broadcast Note / Placement Message (Optional)
              </label>
              <textarea
                rows={3}
                placeholder="e.g. This is the official screening round for visiting recruiters. Please ensure a stable internet connection or appear at the allocated campus lab."
                value={batchCustomNote}
                onChange={(e) => setBatchCustomNote(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium text-slate-800 focus:border-blue-500 focus:outline-hidden"
              />
            </div>

            <div className="rounded-xl bg-slate-50 p-3 border border-slate-200 text-xs text-slate-600">
              <span className="font-bold text-slate-800 block mb-0.5">ℹ️ Invitation Summary:</span>
              Each candidate will receive an email branded with <strong>{companyName}</strong>, their PRN / Roll Number, their assigned Lab Slot, and a personalized magic link to take the test.
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <Button
                type="submit"
                disabled={submitting || totalCandidatesCount === 0 || !hasTest}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs px-5 py-2 rounded-xl shadow-xs"
              >
                {submitting ? (
                  <span className="flex items-center gap-1.5">
                    <Spinner className="h-3 w-3" /> Dispatching...
                  </span>
                ) : (
                  `✉️ Send Batch Invitations`
                )}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
