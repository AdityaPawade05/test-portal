"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import { Spinner } from "@/components/ui/spinner";

export interface CandidateDrawerItem {
  id: string;
  name: string;
  email: string;
  rollNumber: string;
  branch: string;
  cgpa: number | null;
  passingYear: number | null;
  labSlot: string | null;
  shortlistDecision: "PENDING" | "SHORTLISTED" | "WAITLISTED" | "REJECTED";
  recruiterNotes: string | null;
  isEligible: boolean;
  eligibilityWarnings: string[];
  testStatus: string;
  token: string | null;
  takeUrl: string | null;
  invitationExpiresAt?: string | null;
  score: {
    total: number;
    percentile: number | null;
    passed: boolean | null;
    breakdown: Record<string, number>;
  } | null;
  violations: number;
}

interface CandidateInvitationDrawerProps {
  candidate: CandidateDrawerItem | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdated: () => void;
  driveId: string;
  companyName: string;
  testName?: string;
}

export function CandidateInvitationDrawer({
  candidate,
  isOpen,
  onClose,
  onUpdated,
  driveId,
  companyName,
  testName,
}: CandidateInvitationDrawerProps) {
  const [resending, setResending] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [customNote, setCustomNote] = useState("");
  const [feedback, setFeedback] = useState<{ text: string; type: "success" | "error" } | null>(
    null,
  );

  if (!isOpen || !candidate) return null;

  async function handleResendInvite() {
    if (!candidate) return;
    setResending(true);
    setFeedback(null);

    try {
      const res = await fetch(`/api/drives/${driveId}/invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          candidateId: candidate.id,
          customNote: customNote.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to resend invitation");

      setFeedback({
        text: `Invitation email sent successfully to ${candidate.email}!`,
        type: "success",
      });
      onUpdated();
    } catch (err: unknown) {
      setFeedback({
        text: err instanceof Error ? err.message : "Error sending email",
        type: "error",
      });
    } finally {
      setResending(false);
    }
  }

  async function handleDeleteCandidate() {
    if (!candidate) return;
    if (
      !confirm(
        `Are you sure you want to remove ${candidate.name} (${candidate.rollNumber}) from this placement drive?`,
      )
    ) {
      return;
    }

    setDeleting(true);
    setFeedback(null);

    try {
      const res = await fetch(`/api/drives/${driveId}/candidates/${candidate.id}`, {
        method: "DELETE",
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to remove candidate");

      onUpdated();
      onClose();
    } catch (err: unknown) {
      setFeedback({
        text: err instanceof Error ? err.message : "Error removing candidate",
        type: "error",
      });
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="relative w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl border border-slate-100 animate-in fade-in zoom-in-95 duration-200 space-y-5 max-h-[92vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600 font-black text-white text-lg shadow-sm">
              {candidate.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">{candidate.name}</h3>
              <p className="text-xs text-slate-500 font-mono">
                PRN: <strong className="text-slate-800">{candidate.rollNumber}</strong> • {candidate.email}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            ✕
          </button>
        </div>

        {/* Feedback message */}
        {feedback && (
          <div
            className={`rounded-xl p-3 text-xs font-semibold border ${
              feedback.type === "success"
                ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                : "bg-red-50 text-red-800 border-red-200"
            }`}
          >
            {feedback.text}
          </div>
        )}

        {/* Student Academic & Placement Details */}
        <div className="grid grid-cols-2 gap-3 text-xs bg-slate-50 p-3.5 rounded-xl border border-slate-200">
          <div>
            <span className="text-slate-500 block text-[10px] font-bold uppercase tracking-wider">
              Branch & CGPA
            </span>
            <span className="font-bold text-slate-900">
              {candidate.branch} • {candidate.cgpa != null ? candidate.cgpa.toFixed(2) : "—"}
            </span>
          </div>

          <div>
            <span className="text-slate-500 block text-[10px] font-bold uppercase tracking-wider">
              Allocated Lab / Slot
            </span>
            <span className="font-semibold text-slate-800">
              {candidate.labSlot || "Unassigned"}
            </span>
          </div>

          <div>
            <span className="text-slate-500 block text-[10px] font-bold uppercase tracking-wider">
              Eligibility Status
            </span>
            <span
              className={`font-bold ${
                candidate.isEligible ? "text-emerald-700" : "text-amber-700"
              }`}
            >
              {candidate.isEligible ? "✓ Eligible" : "⚠️ Cutoff Warning"}
            </span>
          </div>

          <div>
            <span className="text-slate-500 block text-[10px] font-bold uppercase tracking-wider">
              Passing Batch
            </span>
            <span className="font-semibold text-slate-800">
              {candidate.passingYear || "—"}
            </span>
          </div>
        </div>

        {/* Invitation Link & Magic URL Card */}
        <div className="rounded-xl border border-blue-100 bg-blue-50/40 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-blue-950 uppercase tracking-wider">
              Candidate Test Invitation
            </span>
            <span
              className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                candidate.testStatus === "SUBMITTED"
                  ? "bg-emerald-100 text-emerald-800"
                  : candidate.testStatus === "STARTED"
                    ? "bg-blue-100 text-blue-800"
                    : candidate.testStatus === "SENT"
                      ? "bg-slate-200 text-slate-800"
                      : "bg-rose-100 text-rose-800"
              }`}
            >
              {candidate.testStatus}
            </span>
          </div>

          {candidate.takeUrl ? (
            <div className="space-y-2">
              <span className="block text-[11px] font-semibold text-slate-600">
                Personalized Magic Link:
              </span>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={candidate.takeUrl}
                  className="flex-1 rounded-lg bg-white border border-slate-200 px-2.5 py-1.5 text-xs font-mono text-slate-700 select-all"
                />
                <CopyButton value={candidate.takeUrl} />
              </div>

              <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1">
                <span>
                  {candidate.invitationExpiresAt
                    ? `Expires: ${new Date(candidate.invitationExpiresAt).toLocaleDateString()}`
                    : "No expiry configured"}
                </span>
                <a
                  href={candidate.takeUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="font-bold text-blue-600 hover:underline inline-flex items-center gap-1"
                >
                  Open Test Preview ↗
                </a>
              </div>
            </div>
          ) : (
            <p className="text-xs text-slate-600">
              No active test token generated yet. Click &quot;Send Invitation Email&quot; below to generate a token and email the candidate.
            </p>
          )}
        </div>

        {/* Resend / Invite Form */}
        <div className="space-y-3 pt-2">
          <label className="block text-xs font-bold text-slate-700">
            Custom Note to {candidate.name} (Optional):
          </label>
          <input
            type="text"
            placeholder="e.g. Please be present at Lab 1 with your resume copy."
            value={customNote}
            onChange={(e) => setCustomNote(e.target.value)}
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium text-slate-800 focus:border-blue-500 focus:outline-hidden"
          />

          <div className="flex items-center justify-between gap-3 pt-2">
            <button
              type="button"
              onClick={handleDeleteCandidate}
              disabled={deleting}
              className="text-xs font-bold text-rose-600 hover:text-rose-800 hover:bg-rose-50 px-3 py-2 rounded-xl transition-colors"
            >
              {deleting ? "Removing..." : "🗑️ Remove Student"}
            </button>

            <Button
              onClick={handleResendInvite}
              disabled={resending}
              className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-4 py-2 rounded-xl shadow-xs"
            >
              {resending ? (
                <span className="flex items-center gap-1.5">
                  <Spinner className="h-3 w-3" /> Sending...
                </span>
              ) : (
                `✉️ ${candidate.token ? "Resend Invitation" : "Send Invitation"}`
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
