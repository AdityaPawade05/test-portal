"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { CreateDriveModal } from "@/components/admin/create-drive-modal";

interface DriveSummary {
  id: string;
  companyName: string;
  companyLogoUrl: string | null;
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
    cutoffPercent: number | null;
    _count: { sections: number };
  } | null;
  stats: {
    totalCandidates: number;
    startedCount: number;
    submittedCount: number;
    shortlistedCount: number;
  };
}

export default function PlacementDrivesPage() {
  const [drives, setDrives] = useState<DriveSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const fetchDrives = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/drives");
      const data = await res.json();
      if (data.drives) {
        setDrives(data.drives);
      }
    } catch (err) {
      console.error("Failed to load drives:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDrives();
  }, [fetchDrives]);

  const filteredDrives = drives.filter(
    (d) =>
      d.companyName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      d.jobRole.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  function copyRecruiterLink(drive: DriveSummary) {
    const origin = window.location.origin;
    const url = `${origin}/recruiter/${drive.id}?passkey=${drive.accessPasscode}`;
    navigator.clipboard.writeText(url);
    setCopiedId(drive.id);
    setTimeout(() => setCopiedId(null), 2500);
  }

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
      {/* Header Banner */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 p-8 text-white shadow-xl mb-8">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full bg-blue-500/20 px-3 py-1 text-xs font-semibold text-blue-200 backdrop-blur-md border border-blue-400/20">
              <span>🎓</span> Training & Placement Cell Command Center
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              On-Campus Placement Drives
            </h1>
            <p className="text-sm text-blue-100/80 max-w-2xl">
              Host visiting company technical assessments, manage candidate batches with Roll Numbers & Lab Slots, live proctor exams, and share real-time shortlists with company recruiters.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <a
              href="/placement-candidates-template.csv"
              download
              className="inline-flex items-center gap-2 rounded-xl bg-white/10 hover:bg-white/20 px-4 py-2.5 text-xs font-semibold text-white backdrop-blur-md border border-white/20 transition-all"
            >
              <span>📥</span> Download Roster Template
            </a>
            <Button
              onClick={() => setIsCreateOpen(true)}
              className="bg-blue-500 hover:bg-blue-600 text-white font-bold shadow-lg shadow-blue-500/30 px-5 py-2.5 rounded-xl transition-all"
            >
              <span>+</span> Host New Drive
            </Button>
          </div>
        </div>

        {/* Decorative background glow */}
        <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-blue-500/20 blur-3xl" />
        <div className="absolute -left-20 -bottom-20 h-64 w-64 rounded-full bg-indigo-500/20 blur-3xl" />
      </div>

      {/* Search & Stats Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div className="relative flex-1 max-w-md">
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-sm">🔍</span>
          <input
            type="text"
            placeholder="Search by company or job role..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white pl-10 pr-4 py-2 text-sm font-medium text-slate-800 placeholder:text-slate-400 focus:border-blue-500 focus:outline-hidden focus:ring-2 focus:ring-blue-100"
          />
        </div>

        <div className="flex items-center gap-4 text-xs font-semibold text-slate-600">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-100">
            <span className="h-2 w-2 rounded-full bg-blue-600" />
            <span>Total Drives: <strong>{drives.length}</strong></span>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            <span>Shortlisted Students: <strong>{drives.reduce((a, b) => a + b.stats.shortlistedCount, 0)}</strong></span>
          </div>
        </div>
      </div>

      {/* Drives Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-pulse">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-64 rounded-2xl bg-slate-100 border border-slate-200" />
          ))}
        </div>
      ) : filteredDrives.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-slate-200 p-12 text-center bg-slate-50/50">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-2xl">
            💼
          </div>
          <h3 className="mt-4 text-base font-bold text-slate-900">No Placement Drives Found</h3>
          <p className="mt-1 text-sm text-slate-500 max-w-md mx-auto">
            {searchTerm
              ? "No drives match your search query."
              : "Create your first placement drive for a visiting company to start inviting students and conducting technical screenings."}
          </p>
          <Button
            onClick={() => setIsCreateOpen(true)}
            className="mt-5 bg-blue-600 hover:bg-blue-700 text-white font-semibold"
          >
            + Create Drive
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredDrives.map((drive) => {
            const formattedDate = new Date(drive.driveDate).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            });

            return (
              <div
                key={drive.id}
                className="group relative flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-6 shadow-xs hover:border-blue-300 hover:shadow-xl transition-all duration-200"
              >
                <div>
                  {/* Top Bar: Company & Status */}
                  <div className="flex items-start justify-between gap-3 mb-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 text-lg font-bold text-white shadow-sm">
                        {drive.companyName.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <h3 className="text-base font-bold text-slate-900 group-hover:text-blue-600 transition-colors">
                          {drive.companyName}
                        </h3>
                        <p className="text-xs font-semibold text-slate-500">{drive.jobRole}</p>
                      </div>
                    </div>

                    <span
                      className={`rounded-full px-2.5 py-1 text-[10px] font-bold tracking-wider uppercase ${
                        drive.status === "LIVE"
                          ? "bg-emerald-100 text-emerald-800 animate-pulse"
                          : drive.status === "COMPLETED"
                            ? "bg-slate-100 text-slate-700"
                            : "bg-blue-50 text-blue-700 border border-blue-200/60"
                      }`}
                    >
                      {drive.status}
                    </span>
                  </div>

                  {/* Badges: Package & Eligibility */}
                  <div className="flex flex-wrap gap-2 mb-4">
                    {drive.ctcPackage && (
                      <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700 border border-emerald-200/60">
                        💰 {drive.ctcPackage}
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
                      📅 {formattedDate}
                    </span>
                    {drive.eligibilityMinCgpa && (
                      <span className="inline-flex items-center gap-1 rounded-lg bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700 border border-amber-200/60">
                        ⭐ Min {drive.eligibilityMinCgpa} CGPA
                      </span>
                    )}
                  </div>

                  {/* Assigned Test Banner */}
                  <div className="rounded-xl bg-slate-50 p-3 text-xs text-slate-700 mb-4 border border-slate-100">
                    <span className="font-semibold text-slate-500 block mb-0.5">Assigned Test:</span>
                    <strong className="text-slate-900 font-bold">
                      {drive.test?.name || "⚠️ No test linked"}
                    </strong>
                    {drive.test?.cutoffPercent && (
                      <span className="text-slate-500 text-[11px] block mt-0.5">
                        Cutoff: {drive.test.cutoffPercent}%
                      </span>
                    )}
                  </div>

                  {/* Candidate Metrics */}
                  <div className="grid grid-cols-3 gap-2 rounded-xl bg-slate-50/80 p-3 text-center mb-5 border border-slate-100">
                    <div>
                      <span className="block text-base font-extrabold text-slate-900">
                        {drive.stats.totalCandidates}
                      </span>
                      <span className="text-[10px] font-semibold text-slate-500 uppercase">Roster</span>
                    </div>
                    <div>
                      <span className="block text-base font-extrabold text-blue-600">
                        {drive.stats.submittedCount}
                      </span>
                      <span className="text-[10px] font-semibold text-slate-500 uppercase">Completed</span>
                    </div>
                    <div>
                      <span className="block text-base font-extrabold text-emerald-600">
                        {drive.stats.shortlistedCount}
                      </span>
                      <span className="text-[10px] font-semibold text-slate-500 uppercase">Shortlisted</span>
                    </div>
                  </div>
                </div>

                {/* Bottom Action Footer */}
                <div className="space-y-2 pt-2 border-t border-slate-100">
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/drives/${drive.id}`}
                      className="flex-1 text-center rounded-xl bg-slate-900 hover:bg-slate-800 text-white px-3 py-2 text-xs font-bold transition-colors"
                    >
                      Manage Roster →
                    </Link>

                    <Link
                      href={`/drives/${drive.id}`}
                      className="rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 px-3 py-2 text-xs font-bold transition-colors border border-blue-200"
                    >
                      ✉️ Invite
                    </Link>

                    <button
                      onClick={() => copyRecruiterLink(drive)}
                      title="Copy Recruiter Command Center link to share with visiting company"
                      className="rounded-xl border border-slate-200 bg-white hover:bg-slate-50 p-2 text-xs text-slate-700 font-semibold transition-colors flex items-center gap-1 cursor-pointer"
                    >
                      <span>{copiedId === drive.id ? "✓" : "🔗"}</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal */}
      <CreateDriveModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onSuccess={fetchDrives}
      />
    </div>
  );
}
