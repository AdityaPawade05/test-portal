"use client";

import { useState, useEffect, useCallback, use } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { CopyButton } from "@/components/ui/copy-button";
import { InviteDriveCandidateModal } from "@/components/admin/invite-drive-candidate-modal";
import {
  CandidateInvitationDrawer,
  type CandidateDrawerItem,
} from "@/components/admin/candidate-invitation-drawer";

interface CandidateItem extends CandidateDrawerItem {
  invitationCreatedAt?: string | null;
}

interface DriveDetail {
  id: string;
  companyName: string;
  jobRole: string;
  ctcPackage: string | null;
  driveDate: string;
  status: "DRAFT" | "SCHEDULED" | "LIVE" | "COMPLETED";
  eligibilityMinCgpa: number | null;
  eligibleBranches: string[];
  accessPasscode: string | null;
  test: {
    id: string;
    name: string;
    published: boolean;
    cutoffPercent: number | null;
    sections: { id: string; name: string; timeLimitSec: number }[];
  } | null;
}

export default function DriveDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: driveId } = use(params);

  const [drive, setDrive] = useState<DriveDetail | null>(null);
  const [candidates, setCandidates] = useState<CandidateItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [filterDecision, setFilterDecision] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [selectedCandidateForDrawer, setSelectedCandidateForDrawer] = useState<CandidateItem | null>(null);
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedRowId, setCopiedRowId] = useState<string | null>(null);

  const loadDriveData = useCallback(async () => {
    setLoading(true);
    try {
      const [driveRes, candRes] = await Promise.all([
        fetch(`/api/drives/${driveId}`),
        fetch(`/api/drives/${driveId}/candidates`),
      ]);

      const driveJson = await driveRes.json();
      const candJson = await candRes.json();

      if (driveJson.drive) setDrive(driveJson.drive);
      if (candJson.candidates) setCandidates(candJson.candidates);
    } catch (err) {
      console.error("Failed to load drive details:", err);
    } finally {
      setLoading(false);
    }
  }, [driveId]);

  useEffect(() => {
    loadDriveData();
  }, [loadDriveData]);

  // Handle CSV file upload
  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setActionMessage(null);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch(`/api/drives/${driveId}/candidates`, {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");

      setActionMessage({ text: data.message || "Roster uploaded successfully!", type: "success" });
      loadDriveData();
    } catch (err: unknown) {
      setActionMessage({
        text: err instanceof Error ? err.message : "Failed to upload roster",
        type: "error",
      });
    } finally {
      setIsUploading(false);
      e.target.value = "";
    }
  }

  // Handle direct single candidate invite / resend from table row
  async function handleSingleRowInvite(candidate: CandidateItem) {
    setResendingId(candidate.id);
    setActionMessage(null);

    try {
      const res = await fetch(`/api/drives/${driveId}/invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          candidateId: candidate.id,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to send invitation");

      setActionMessage({
        text: data.message || `Invitation dispatched to ${candidate.name} (${candidate.email})!`,
        type: "success",
      });
      loadDriveData();
    } catch (err: unknown) {
      setActionMessage({
        text: err instanceof Error ? err.message : "Failed to send invitation",
        type: "error",
      });
    } finally {
      setResendingId(null);
    }
  }

  // Handle batch shortlist update
  async function handleBatchShortlist(decision: "SHORTLISTED" | "WAITLISTED" | "REJECTED" | "PENDING") {
    if (selectedIds.length === 0) return;

    try {
      const res = await fetch(`/api/drives/${driveId}/shortlist`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          candidateIds: selectedIds,
          decision,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Update failed");

      setActionMessage({ text: `Updated ${data.count} candidate(s) to ${decision}`, type: "success" });
      setSelectedIds([]);
      loadDriveData();
    } catch (err: unknown) {
      setActionMessage({
        text: err instanceof Error ? err.message : "Failed to update shortlist",
        type: "error",
      });
    }
  }

  function toggleSelectAll() {
    if (selectedIds.length === filteredCandidates.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredCandidates.map((c) => c.id));
    }
  }

  function toggleSelectOne(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  }

  function handleCopyRowLink(candidate: CandidateItem) {
    if (!candidate.takeUrl) return;
    navigator.clipboard.writeText(candidate.takeUrl);
    setCopiedRowId(candidate.id);
    setTimeout(() => setCopiedRowId(null), 2000);
  }

  const filteredCandidates = candidates.filter((c) => {
    const matchesSearch =
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.rollNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.branch.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesFilter =
      filterDecision === "ALL" || c.shortlistDecision === filterDecision;

    return matchesSearch && matchesFilter;
  });

  const completedCount = candidates.filter((c) => c.testStatus === "SUBMITTED").length;
  const shortlistedCount = candidates.filter((c) => c.shortlistDecision === "SHORTLISTED").length;
  const invitedCount = candidates.filter((c) => c.testStatus !== "NOT_INVITED").length;

  if (loading && !drive) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-12 text-center text-slate-500 animate-pulse">
        Loading Placement Drive Command Center...
      </div>
    );
  }

  if (!drive) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-12 text-center text-slate-700">
        Drive not found. <Link href="/drives" className="text-blue-600 font-bold">Return to drives</Link>
      </div>
    );
  }

  const recruiterUrl = typeof window !== "undefined"
    ? `${window.location.origin}/recruiter/${drive.id}?passkey=${drive.accessPasscode}`
    : "";

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Breadcrumb Navigation */}
      <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
        <Link href="/drives" className="hover:text-slate-800 transition-colors">
          Placement Drives
        </Link>
        <span>/</span>
        <span className="text-slate-900 font-bold">{drive.companyName}</span>
      </div>

      {/* Drive Command Header Card */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div className="flex items-start gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 text-2xl font-black text-white shadow-md">
              {drive.companyName.charAt(0).toUpperCase()}
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-black text-slate-900">{drive.companyName}</h1>
                <span className="rounded-full bg-blue-100 px-3 py-0.5 text-xs font-bold text-blue-800 uppercase tracking-wider">
                  {drive.status}
                </span>
              </div>
              <p className="text-sm font-semibold text-slate-600 mt-0.5">
                {drive.jobRole} {drive.ctcPackage && <span className="text-emerald-600 font-bold">• {drive.ctcPackage}</span>}
              </p>
              <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 mt-2 font-medium">
                <span>📅 Drive Date: <strong>{new Date(drive.driveDate).toLocaleDateString()}</strong></span>
                <span>•</span>
                <span>⭐ Min CGPA: <strong>{drive.eligibilityMinCgpa ?? "Open"}</strong></span>
                <span>•</span>
                <span>🎓 Branches: <strong>{drive.eligibleBranches.join(", ") || "All"}</strong></span>
                <span>•</span>
                <span>
                  📝 Test:{" "}
                  <strong className={drive.test ? "text-blue-700 font-bold" : "text-amber-600 font-bold"}>
                    {drive.test?.name || "None Assigned"}
                  </strong>
                  {drive.test && !drive.test.published && (
                    <span className="ml-1 text-[10px] text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded-full font-bold">
                      Draft
                    </span>
                  )}
                </span>
              </div>
            </div>
          </div>

          {/* Quick Recruiter Share Box */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
            <div className="text-xs">
              <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Recruiter Command Link
              </span>
              <span className="font-mono text-xs font-bold text-blue-700 truncate max-w-[200px] block">
                Passcode: {drive.accessPasscode}
              </span>
            </div>
            <button
              onClick={() => {
                navigator.clipboard.writeText(recruiterUrl);
                setCopiedLink(true);
                setTimeout(() => setCopiedLink(false), 2000);
              }}
              className="rounded-lg bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 text-xs font-bold transition-all flex items-center justify-center gap-1 shadow-xs cursor-pointer"
            >
              <span>{copiedLink ? "✓ Copied!" : "📋 Copy Link for Recruiter"}</span>
            </button>
          </div>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6 pt-6 border-t border-slate-100 text-center">
          <div className="p-3 rounded-xl bg-slate-50">
            <span className="block text-2xl font-black text-slate-900">{candidates.length}</span>
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Registered Roster</span>
          </div>
          <div className="p-3 rounded-xl bg-indigo-50">
            <span className="block text-2xl font-black text-indigo-700">{invitedCount}</span>
            <span className="text-xs font-semibold text-indigo-700 uppercase tracking-wider">Invitations Active</span>
          </div>
          <div className="p-3 rounded-xl bg-blue-50">
            <span className="block text-2xl font-black text-blue-700">{completedCount}</span>
            <span className="text-xs font-semibold text-blue-700 uppercase tracking-wider">Tests Completed</span>
          </div>
          <div className="p-3 rounded-xl bg-emerald-50">
            <span className="block text-2xl font-black text-emerald-700">{shortlistedCount}</span>
            <span className="text-xs font-semibold text-emerald-700 uppercase tracking-wider">Shortlisted (R2)</span>
          </div>
        </div>
      </div>

      {/* Action Notification Toast */}
      {actionMessage && (
        <div
          className={`rounded-xl p-4 text-xs font-bold border flex items-center justify-between ${
            actionMessage.type === "success"
              ? "bg-emerald-50 text-emerald-800 border-emerald-200"
              : "bg-red-50 text-red-800 border-red-200"
          }`}
        >
          <span>{actionMessage.text}</span>
          <button onClick={() => setActionMessage(null)} className="text-slate-400 hover:text-slate-600">✕</button>
        </div>
      )}

      {/* Main Roster Toolbar */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Candidate Placement Roster</h2>
            <p className="text-xs text-slate-500">
              Invite students individually or in batch, assign lab slots, track test invitations, and shortlist for Round 2.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Primary Action: Add & Invite Single Student */}
            <Button
              onClick={() => setIsInviteModalOpen(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-xs cursor-pointer flex items-center gap-1.5"
            >
              <span>➕</span>
              <span>Invite Student</span>
            </Button>

            {/* CSV Import */}
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 px-3.5 py-2 text-xs font-bold text-slate-700 transition-colors shadow-xs">
              <span>📤</span>
              <span>{isUploading ? "Uploading..." : "Upload CSV"}</span>
              <input
                type="file"
                accept=".csv"
                disabled={isUploading}
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>

            {/* Template Download */}
            <a
              href="/placement-candidates-template.csv"
              download
              className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600 transition-colors"
            >
              <span>📥</span> Template
            </a>

            {/* Batch Dispatch Invitations Modal Trigger */}
            <Button
              onClick={() => setIsInviteModalOpen(true)}
              disabled={candidates.length === 0}
              className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-xs cursor-pointer"
            >
              <span>✉️</span>
              <span>{selectedIds.length ? `Batch Invite (${selectedIds.length})` : "Batch Invitations"}</span>
            </Button>

            {/* Export Excel */}
            <a
              href={`/api/drives/${drive.id}/export`}
              download
              className="inline-flex items-center gap-1 rounded-xl bg-slate-900 hover:bg-slate-800 px-3.5 py-2 text-xs font-bold text-white transition-colors shadow-xs"
            >
              <span>📊</span> Export Excel
            </a>
          </div>
        </div>

        {/* Filter and Search Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
          <div className="relative flex-1 max-w-sm">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs">🔍</span>
            <input
              type="text"
              placeholder="Search by name, roll no, email, branch..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50/50 pl-9 pr-3 py-1.5 text-xs font-medium text-slate-800 placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:outline-hidden"
            />
          </div>

          {/* Decision Filter Tabs */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl text-xs font-semibold text-slate-600">
            {["ALL", "SHORTLISTED", "WAITLISTED", "REJECTED", "PENDING"].map((status) => (
              <button
                key={status}
                onClick={() => setFilterDecision(status)}
                className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                  filterDecision === status
                    ? "bg-white text-slate-900 font-bold shadow-xs"
                    : "hover:text-slate-900"
                }`}
              >
                {status}
              </button>
            ))}
          </div>
        </div>

        {/* Selected Batch Action Bar */}
        {selectedIds.length > 0 && (
          <div className="flex flex-wrap items-center justify-between bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs gap-3 animate-in fade-in">
            <span className="font-bold text-blue-900">
              {selectedIds.length} candidate(s) selected
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => setIsInviteModalOpen(true)}
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-lg font-bold transition-colors cursor-pointer flex items-center gap-1"
              >
                <span>✉️</span> Invite Selected ({selectedIds.length})
              </button>
              <button
                onClick={() => handleBatchShortlist("SHORTLISTED")}
                className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg font-bold transition-colors cursor-pointer"
              >
                ✓ Shortlist for R2
              </button>
              <button
                onClick={() => handleBatchShortlist("WAITLISTED")}
                className="bg-amber-600 hover:bg-amber-700 text-white px-3 py-1.5 rounded-lg font-bold transition-colors cursor-pointer"
              >
                ⏱️ Waitlist
              </button>
              <button
                onClick={() => handleBatchShortlist("REJECTED")}
                className="bg-rose-600 hover:bg-rose-700 text-white px-3 py-1.5 rounded-lg font-bold transition-colors cursor-pointer"
              >
                ✕ Reject
              </button>
              <button
                onClick={() => setSelectedIds([])}
                className="text-slate-600 hover:text-slate-900 px-2 py-1 cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Candidates Roster Table */}
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                <th className="p-3 w-10 text-center">
                  <input
                    type="checkbox"
                    checked={
                      filteredCandidates.length > 0 &&
                      selectedIds.length === filteredCandidates.length
                    }
                    onChange={toggleSelectAll}
                    className="rounded-sm border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                </th>
                <th className="p-3">Roll No / PRN</th>
                <th className="p-3">Student Name</th>
                <th className="p-3">Branch & CGPA</th>
                <th className="p-3">Lab / Slot</th>
                <th className="p-3">Test Status</th>
                <th className="p-3">Score</th>
                <th className="p-3">Shortlist Decision</th>
                <th className="p-3 text-right">Invitation & Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {filteredCandidates.length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-slate-500">
                    No candidates found. Click <strong>&quot;+ Invite Student&quot;</strong> or upload a CSV roster to get started.
                  </td>
                </tr>
              ) : (
                filteredCandidates.map((cand) => {
                  const isSelected = selectedIds.includes(cand.id);
                  const isThisResending = resendingId === cand.id;
                  const isThisCopied = copiedRowId === cand.id;

                  return (
                    <tr
                      key={cand.id}
                      className={`hover:bg-slate-50/60 transition-colors ${
                        isSelected ? "bg-blue-50/40" : ""
                      }`}
                    >
                      <td className="p-3 text-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelectOne(cand.id)}
                          className="rounded-sm border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                      </td>

                      <td className="p-3 font-mono font-bold text-slate-900">
                        {cand.rollNumber}
                      </td>

                      <td className="p-3">
                        <div className="font-bold text-slate-900">{cand.name}</div>
                        <div className="text-[11px] text-slate-500">{cand.email}</div>
                      </td>

                      <td className="p-3">
                        <div className="flex items-center gap-1.5">
                          <span className="font-semibold text-slate-800">{cand.branch}</span>
                          <span className="text-slate-400">•</span>
                          <span className="font-bold text-slate-900">
                            {cand.cgpa != null ? cand.cgpa.toFixed(2) : "—"}
                          </span>
                        </div>
                        {!cand.isEligible && (
                          <span className="inline-block mt-0.5 text-[10px] font-bold text-amber-700 bg-amber-50 px-1.5 py-0.2 rounded-sm">
                            ⚠️ Ineligible
                          </span>
                        )}
                      </td>

                      <td className="p-3">
                        <span className="font-medium text-slate-700 bg-slate-100 px-2 py-1 rounded-md text-[11px]">
                          {cand.labSlot || "Unassigned"}
                        </span>
                      </td>

                      <td className="p-3">
                        <span
                          className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                            cand.testStatus === "SUBMITTED"
                              ? "bg-emerald-100 text-emerald-800"
                              : cand.testStatus === "STARTED"
                                ? "bg-blue-100 text-blue-800 animate-pulse"
                                : cand.testStatus === "SENT"
                                  ? "bg-slate-100 text-slate-700"
                                  : "bg-rose-50 text-rose-700"
                          }`}
                        >
                          {cand.testStatus === "SENT" ? "✉️ Sent" : cand.testStatus}
                        </span>
                      </td>

                      <td className="p-3">
                        {cand.score ? (
                          <div>
                            <span className="font-extrabold text-slate-900 text-sm">
                              {cand.score.total}
                            </span>
                            {cand.score.passed !== null && (
                              <span
                                className={`ml-1.5 text-[10px] font-bold ${
                                  cand.score.passed ? "text-emerald-600" : "text-rose-600"
                                }`}
                              >
                                {cand.score.passed ? "✓ PASS" : "✗ FAIL"}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>

                      <td className="p-3">
                        <select
                          value={cand.shortlistDecision}
                          onChange={async (e) => {
                            const newDecision = e.target.value as CandidateItem["shortlistDecision"];
                            await fetch(`/api/drives/${driveId}/shortlist`, {
                              method: "PATCH",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({
                                candidateIds: [cand.id],
                                decision: newDecision,
                              }),
                            });
                            loadDriveData();
                          }}
                          className={`rounded-lg border px-2 py-1 text-xs font-bold cursor-pointer ${
                            cand.shortlistDecision === "SHORTLISTED"
                              ? "bg-emerald-50 border-emerald-300 text-emerald-800"
                              : cand.shortlistDecision === "REJECTED"
                                ? "bg-rose-50 border-rose-300 text-rose-800"
                                : cand.shortlistDecision === "WAITLISTED"
                                  ? "bg-amber-50 border-amber-300 text-amber-800"
                                  : "bg-white border-slate-200 text-slate-700"
                          }`}
                        >
                          <option value="PENDING">Pending</option>
                          <option value="SHORTLISTED">✓ Shortlist (R2)</option>
                          <option value="WAITLISTED">⏱️ Waitlist</option>
                          <option value="REJECTED">✕ Reject</option>
                        </select>
                      </td>

                      {/* In-Row Invitation & Management Actions */}
                      <td className="p-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* 1-Click Send / Resend Email */}
                          <button
                            type="button"
                            onClick={() => handleSingleRowInvite(cand)}
                            disabled={isThisResending || !drive.test || !drive.test.published}
                            title={
                              cand.token
                                ? `Resend invitation email to ${cand.email}`
                                : `Generate token & send invitation email to ${cand.email}`
                            }
                            className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition-all flex items-center gap-1 cursor-pointer ${
                              cand.testStatus === "SENT"
                                ? "bg-slate-100 hover:bg-slate-200 text-slate-700"
                                : "bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200"
                            }`}
                          >
                            {isThisResending ? (
                              <Spinner className="h-3 w-3" />
                            ) : (
                              <span>✉️ {cand.token ? "Resend" : "Invite"}</span>
                            )}
                          </button>

                          {/* Quick Copy Link */}
                          {cand.takeUrl && (
                            <button
                              type="button"
                              onClick={() => handleCopyRowLink(cand)}
                              title="Copy student magic assessment URL to clipboard"
                              className="rounded-lg border border-slate-200 bg-white hover:bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-600 transition-colors flex items-center gap-1 cursor-pointer"
                            >
                              <span>{isThisCopied ? "✓" : "📋"}</span>
                              <span>{isThisCopied ? "Copied" : "Link"}</span>
                            </button>
                          )}

                          {/* Open Full Details Drawer */}
                          <button
                            type="button"
                            onClick={() => setSelectedCandidateForDrawer(cand)}
                            title="View student profile and invitation details"
                            className="rounded-lg bg-slate-100 hover:bg-slate-200 p-1.5 text-slate-600 transition-colors cursor-pointer"
                          >
                            👁️
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Invite Candidate Modal */}
      <InviteDriveCandidateModal
        isOpen={isInviteModalOpen}
        onClose={() => setIsInviteModalOpen(false)}
        onSuccess={loadDriveData}
        driveId={drive.id}
        companyName={drive.companyName}
        jobRole={drive.jobRole}
        testName={drive.test?.name}
        testPublished={drive.test?.published}
        hasTest={Boolean(drive.test)}
        selectedCandidateIds={selectedIds}
        totalCandidatesCount={candidates.length}
      />

      {/* Candidate Details & Invitation Drawer */}
      <CandidateInvitationDrawer
        candidate={selectedCandidateForDrawer}
        isOpen={Boolean(selectedCandidateForDrawer)}
        onClose={() => setSelectedCandidateForDrawer(null)}
        onUpdated={loadDriveData}
        driveId={drive.id}
        companyName={drive.companyName}
        testName={drive.test?.name}
      />
    </div>
  );
}
