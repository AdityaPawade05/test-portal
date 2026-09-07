"use client";

import { useState, useEffect, useCallback, use } from "react";
import { Button } from "@/components/ui/button";

interface CandidateRecord {
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
  invitation?: {
    status: string;
    attempt?: {
      startedAt: string | null;
      submittedAt: string | null;
      score?: {
        rawTotal: number;
        passed: boolean | null;
        percentile: number | null;
      } | null;
      events?: { id: string; type: string }[];
    } | null;
  } | null;
}

interface DriveInfo {
  id: string;
  companyName: string;
  jobRole: string;
  ctcPackage: string | null;
  driveDate: string;
  accessPasscode: string | null;
  organization: { name: string };
  test?: {
    name: string;
    cutoffPercent: number | null;
  } | null;
  candidates: CandidateRecord[];
}

export default function RecruiterPortalPage({
  params,
}: {
  params: Promise<{ driveId: string }>;
}) {
  const { driveId } = use(params);

  const [passkey, setPasskey] = useState<string>("");
  const [drive, setDrive] = useState<DriveInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  // Shortlist dynamic filters
  const [minScore, setMinScore] = useState<number>(0);
  const [minCgpa, setMinCgpa] = useState<number>(0);
  const [branchFilter, setBranchFilter] = useState<string>("ALL");
  const [cleanOnly, setCleanOnly] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [decisionFilter, setDecisionFilter] = useState<string>("ALL");

  const [savingId, setSavingId] = useState<string | null>(null);

  const fetchDrive = useCallback(async (key?: string) => {
    setLoading(true);
    setAuthError(null);

    const activeKey = key ?? passkey;
    try {
      const res = await fetch(`/api/drives/${driveId}?passkey=${encodeURIComponent(activeKey)}`);
      const data = await res.json();

      if (!res.ok) {
        setAuthError(data.error || "Authentication required. Please enter passkey.");
        setDrive(null);
      } else {
        setDrive(data.drive);
        setPasskey(activeKey);
      }
    } catch {
      setAuthError("Failed to connect to placement server.");
    } finally {
      setLoading(false);
    }
  }, [driveId, passkey]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const urlParams = new URLSearchParams(window.location.search);
      const urlKey = urlParams.get("passkey");
      if (urlKey) {
        setPasskey(urlKey);
        fetchDrive(urlKey);
        return;
      }
    }
    fetchDrive("");
  }, [fetchDrive]);

  async function handleUpdateDecision(
    candidateId: string,
    decision: CandidateRecord["shortlistDecision"],
    notes?: string,
  ) {
    setSavingId(candidateId);
    try {
      await fetch(`/api/drives/${driveId}/shortlist`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          candidateIds: [candidateId],
          decision,
          recruiterNotes: notes,
          passcode: passkey,
        }),
      });

      // Update locally
      if (drive) {
        setDrive({
          ...drive,
          candidates: drive.candidates.map((c) =>
            c.id === candidateId
              ? {
                  ...c,
                  shortlistDecision: decision,
                  ...(notes !== undefined ? { recruiterNotes: notes } : {}),
                }
              : c,
          ),
        });
      }
    } catch (err) {
      console.error("Failed to update candidate decision:", err);
    } finally {
      setSavingId(null);
    }
  }

  // Filter candidates based on recruiter's live parameters
  const candidateList = drive?.candidates || [];

  const filteredList = candidateList.filter((c) => {
    const score = c.invitation?.attempt?.score?.rawTotal ?? 0;
    const cgpa = c.cgpa ?? 0;
    const violations = c.invitation?.attempt?.events?.length ?? 0;

    const matchesSearch =
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.rollNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.branch.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesScore = score >= minScore;
    const matchesCgpa = cgpa >= minCgpa;
    const matchesBranch = branchFilter === "ALL" || c.branch === branchFilter;
    const matchesClean = !cleanOnly || violations === 0;
    const matchesDecision =
      decisionFilter === "ALL" || c.shortlistDecision === decisionFilter;

    return (
      matchesSearch &&
      matchesScore &&
      matchesCgpa &&
      matchesBranch &&
      matchesClean &&
      matchesDecision
    );
  });

  const allBranches = Array.from(new Set(candidateList.map((c) => c.branch)));
  const shortlistedTotal = candidateList.filter((c) => c.shortlistDecision === "SHORTLISTED").length;

  if (loading && !drive) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-400 font-medium">
        Connecting to Recruiter Command Center...
      </div>
    );
  }

  if (authError && !drive) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 p-4">
        <div className="w-full max-w-md rounded-2xl bg-slate-900 border border-slate-800 p-8 shadow-2xl text-center space-y-5">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-600/20 text-3xl text-blue-400 border border-blue-500/30">
            🔒
          </div>
          <div className="space-y-1">
            <h2 className="text-xl font-bold text-white">Recruiter Access Verification</h2>
            <p className="text-xs text-slate-400">
              Enter the passkey provided by the College Placement Cell (TPO).
            </p>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              fetchDrive();
            }}
            className="space-y-4"
          >
            <input
              type="text"
              placeholder="e.g. recruiter-4921"
              value={passkey}
              onChange={(e) => setPasskey(e.target.value)}
              className="w-full rounded-xl border border-slate-700 bg-slate-800/80 px-4 py-3 text-center text-sm font-mono text-white placeholder:text-slate-500 focus:border-blue-500 focus:outline-hidden"
            />
            <Button
              type="submit"
              className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-2.5 rounded-xl shadow-lg shadow-blue-600/30"
            >
              Access Drive Dashboard →
            </Button>
          </form>
        </div>
      </div>
    );
  }

  if (!drive) return null;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 pb-16">
      {/* Top Header */}
      <header className="border-b border-slate-800/80 bg-slate-900/60 backdrop-blur-md sticky top-0 z-30">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 text-xl font-black text-white shadow-md">
              {drive.companyName.charAt(0).toUpperCase()}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-black text-white">{drive.companyName}</h1>
                <span className="rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-extrabold uppercase">
                  Recruiter Portal
                </span>
              </div>
              <p className="text-xs text-slate-400 font-medium">
                {drive.jobRole} • {drive.organization.name}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-800/80 border border-slate-700/80 text-xs font-bold text-slate-300">
              <span>🎯 Shortlisted:</span>
              <strong className="text-emerald-400 text-sm">{shortlistedTotal}</strong>
            </div>

            <a
              href={`/api/drives/${drive.id}/export?passkey=${encodeURIComponent(passkey)}`}
              download
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 text-xs font-bold shadow-lg shadow-emerald-600/20 transition-all"
            >
              <span>📊</span> Export Interview Sheet (Excel)
            </a>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Dynamic Multi-Filter Card */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-5 shadow-xl space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                <span>⚡</span> Candidate Filter & Shortlist Matrix
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Adjust cutoffs to filter candidates in real-time and review AI proctoring integrity.
              </p>
            </div>

            {/* Quick Batch Shortlist matching candidates */}
            {filteredList.length > 0 && (
              <button
                onClick={async () => {
                  const matchingIds = filteredList.map((c) => c.id);
                  if (
                    !confirm(
                      `Shortlist all ${matchingIds.length} candidate(s) currently matching your filters for Interview Round 2?`,
                    )
                  )
                    return;

                  for (const id of matchingIds) {
                    await handleUpdateDecision(id, "SHORTLISTED");
                  }
                }}
                className="rounded-xl bg-blue-600 hover:bg-blue-500 text-white px-3.5 py-2 text-xs font-bold transition-all shadow-md shadow-blue-600/30 flex items-center gap-1.5"
              >
                <span>⚡</span>
                <span>Shortlist All Filtered ({filteredList.length})</span>
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3 pt-2">
            {/* Search */}
            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">Search</label>
              <input
                type="text"
                placeholder="Roll No, Name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-white placeholder:text-slate-500 focus:border-blue-500 focus:outline-hidden"
              />
            </div>

            {/* Min Score */}
            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
                Min Score: <span className="text-blue-400 font-extrabold">{minScore}</span>
              </label>
              <input
                type="range"
                min="0"
                max="50"
                value={minScore}
                onChange={(e) => setMinScore(Number(e.target.value))}
                className="w-full accent-blue-500 cursor-pointer"
              />
            </div>

            {/* Min CGPA */}
            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
                Min CGPA: <span className="text-emerald-400 font-extrabold">{minCgpa}</span>
              </label>
              <input
                type="range"
                min="0"
                max="10"
                step="0.5"
                value={minCgpa}
                onChange={(e) => setMinCgpa(Number(e.target.value))}
                className="w-full accent-emerald-500 cursor-pointer"
              />
            </div>

            {/* Branch */}
            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">Branch</label>
              <select
                value={branchFilter}
                onChange={(e) => setBranchFilter(e.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-white focus:border-blue-500 focus:outline-hidden"
              >
                <option value="ALL">All Branches</option>
                {allBranches.map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
            </div>

            {/* Clean Only Switch */}
            <div className="flex items-end pb-1">
              <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-300">
                <input
                  type="checkbox"
                  checked={cleanOnly}
                  onChange={(e) => setCleanOnly(e.target.checked)}
                  className="rounded-sm border-slate-700 text-blue-600 focus:ring-blue-500"
                />
                <span>Clean Integrity Only</span>
              </label>
            </div>
          </div>

          {/* Decision Status Pill Tabs */}
          <div className="flex items-center gap-2 pt-2 border-t border-slate-800 text-xs font-semibold">
            <span className="text-slate-500 text-[11px] uppercase">Decision:</span>
            {["ALL", "SHORTLISTED", "WAITLISTED", "REJECTED", "PENDING"].map((d) => (
              <button
                key={d}
                onClick={() => setDecisionFilter(d)}
                className={`px-3 py-1 rounded-lg text-xs transition-all ${
                  decisionFilter === d
                    ? "bg-blue-600 text-white font-bold"
                    : "bg-slate-800 text-slate-400 hover:text-white"
                }`}
              >
                {d}
              </button>
            ))}
          </div>
        </div>

        {/* Candidate Evaluation Grid / Table */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900 shadow-xl overflow-hidden">
          <div className="p-4 border-b border-slate-800 flex items-center justify-between text-xs text-slate-400">
            <span>Showing <strong>{filteredList.length}</strong> of {candidateList.length} candidate(s)</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-950/60 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  <th className="p-3.5">Roll No / PRN</th>
                  <th className="p-3.5">Candidate Name</th>
                  <th className="p-3.5">Branch & CGPA</th>
                  <th className="p-3.5">Test Score</th>
                  <th className="p-3.5">AI Proctoring Integrity</th>
                  <th className="p-3.5">Recruiter Notes</th>
                  <th className="p-3.5 text-right">Shortlist Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-xs">
                {filteredList.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-12 text-center text-slate-500">
                      No candidates match the specified filter criteria.
                    </td>
                  </tr>
                ) : (
                  filteredList.map((cand) => {
                    const attempt = cand.invitation?.attempt;
                    const score = attempt?.score;
                    const events = attempt?.events ?? [];
                    const violationsCount = events.length;

                    const isShortlisted = cand.shortlistDecision === "SHORTLISTED";
                    const isRejected = cand.shortlistDecision === "REJECTED";
                    const isWaitlisted = cand.shortlistDecision === "WAITLISTED";

                    return (
                      <tr
                        key={cand.id}
                        className={`hover:bg-slate-800/40 transition-colors ${
                          isShortlisted ? "bg-emerald-950/20" : ""
                        }`}
                      >
                        <td className="p-3.5 font-mono font-bold text-white">
                          {cand.rollNumber}
                        </td>

                        <td className="p-3.5">
                          <div className="font-bold text-white">{cand.name}</div>
                          <div className="text-[11px] text-slate-400">{cand.email}</div>
                        </td>

                        <td className="p-3.5">
                          <div className="font-semibold text-slate-200">
                            {cand.branch} • <span className="font-extrabold text-blue-400">{cand.cgpa?.toFixed(2) ?? "—"}</span>
                          </div>
                        </td>

                        <td className="p-3.5">
                          {score ? (
                            <div className="flex items-center gap-2">
                              <span className="text-base font-black text-white">
                                {score.rawTotal}
                              </span>
                              {score.passed !== null && (
                                <span
                                  className={`rounded-sm px-1.5 py-0.2 text-[10px] font-extrabold uppercase ${
                                    score.passed
                                      ? "bg-emerald-500/20 text-emerald-400"
                                      : "bg-rose-500/20 text-rose-400"
                                  }`}
                                >
                                  {score.passed ? "Pass" : "Fail"}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-500 font-medium italic">
                              {cand.invitation?.status === "STARTED" ? "Taking test..." : "Not completed"}
                            </span>
                          )}
                        </td>

                        <td className="p-3.5">
                          <span
                            className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-bold ${
                              violationsCount > 3
                                ? "bg-rose-500/20 text-rose-400 border border-rose-500/30 font-extrabold"
                                : violationsCount > 0
                                  ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                                  : "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                            }`}
                          >
                            {violationsCount > 3
                              ? `🚨 High Risk (${violationsCount})`
                              : violationsCount > 0
                                ? `⚠️ ${violationsCount} Anomalies`
                                : "🛡️ Clean Integrity"}
                          </span>
                        </td>

                        <td className="p-3.5">
                          <input
                            type="text"
                            placeholder="Add recruiter note..."
                            defaultValue={cand.recruiterNotes || ""}
                            onBlur={(e) => {
                              if (e.target.value !== (cand.recruiterNotes || "")) {
                                handleUpdateDecision(
                                  cand.id,
                                  cand.shortlistDecision,
                                  e.target.value,
                                );
                              }
                            }}
                            className="w-full max-w-[200px] rounded-lg border border-slate-700 bg-slate-800/80 px-2 py-1 text-[11px] text-slate-200 placeholder:text-slate-600 focus:border-blue-500 focus:outline-hidden"
                          />
                        </td>

                        <td className="p-3.5 text-right">
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              disabled={savingId === cand.id}
                              onClick={() =>
                                handleUpdateDecision(
                                  cand.id,
                                  isShortlisted ? "PENDING" : "SHORTLISTED",
                                )
                              }
                              className={`rounded-lg px-2.5 py-1 text-xs font-bold transition-all ${
                                isShortlisted
                                  ? "bg-emerald-600 text-white shadow-xs"
                                  : "bg-slate-800 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-600/30"
                              }`}
                            >
                              {isShortlisted ? "✓ Shortlisted" : "Shortlist"}
                            </button>

                            <button
                              disabled={savingId === cand.id}
                              onClick={() =>
                                handleUpdateDecision(
                                  cand.id,
                                  isWaitlisted ? "PENDING" : "WAITLISTED",
                                )
                              }
                              className={`rounded-lg px-2 py-1 text-xs font-semibold transition-all ${
                                isWaitlisted
                                  ? "bg-amber-600 text-white"
                                  : "bg-slate-800 hover:bg-slate-700 text-amber-400"
                              }`}
                            >
                              ⏱️
                            </button>

                            <button
                              disabled={savingId === cand.id}
                              onClick={() =>
                                handleUpdateDecision(
                                  cand.id,
                                  isRejected ? "PENDING" : "REJECTED",
                                )
                              }
                              className={`rounded-lg px-2 py-1 text-xs font-semibold transition-all ${
                                isRejected
                                  ? "bg-rose-600 text-white"
                                  : "bg-slate-800 hover:bg-slate-700 text-rose-400"
                              }`}
                            >
                              ✕
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
      </main>
    </div>
  );
}
