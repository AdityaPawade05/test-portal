"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";

interface TestOption {
  id: string;
  name: string;
  published: boolean;
}

interface CreateDriveModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function CreateDriveModal({ isOpen, onClose, onSuccess }: CreateDriveModalProps) {
  const [tests, setTests] = useState<TestOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [companyName, setCompanyName] = useState("");
  const [jobRole, setJobRole] = useState("");
  const [ctcPackage, setCtcPackage] = useState("");
  const [driveDate, setDriveDate] = useState(
    new Date(Date.now() + 86400000).toISOString().split("T")[0],
  );
  const [eligibilityMinCgpa, setEligibilityMinCgpa] = useState("7.0");
  const [eligibleBranches, setEligibleBranches] = useState("CSE, IT, ECE");
  const [testId, setTestId] = useState("");
  const [accessPasscode, setAccessPasscode] = useState("");

  useEffect(() => {
    if (isOpen) {
      setLoading(true);
      fetch("/api/tests")
        .then((res) => res.json())
        .then((data) => {
          if (data.tests) {
            setTests(data.tests);
            const published = data.tests.find((t: { published: boolean }) => t.published);
            if (published) setTestId(published.id);
          }
        })
        .catch(console.error)
        .finally(() => setLoading(false));

      // Generate random recruiter passkey
      setAccessPasscode(`recruiter-${Math.floor(1000 + Math.random() * 9000)}`);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const branches = eligibleBranches
        .split(",")
        .map((b) => b.trim())
        .filter(Boolean);

      const res = await fetch("/api/drives", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName,
          jobRole,
          ctcPackage: ctcPackage || null,
          driveDate: new Date(driveDate).toISOString(),
          eligibilityMinCgpa: eligibilityMinCgpa ? parseFloat(eligibilityMinCgpa) : null,
          eligibleBranches: branches,
          accessPasscode: accessPasscode || null,
          testId: testId || null,
          status: "SCHEDULED",
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.[0]?.message || data.error || "Failed to create drive");
      }

      onSuccess();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error creating drive");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="relative w-full max-w-xl rounded-2xl bg-white p-6 shadow-2xl border border-slate-100 animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600 text-xl font-bold">
              💼
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">Create Placement Drive</h2>
              <p className="text-xs text-slate-500">Configure visiting company assessment & eligibility</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
          >
            ✕
          </button>
        </div>

        {error && (
          <div className="mt-4 rounded-xl bg-red-50 p-3 text-xs font-semibold text-red-700 border border-red-200">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Company Name *
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Google, Microsoft, TCS"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-hidden focus:ring-2 focus:ring-blue-100 transition-all"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Job Role / Designation *
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Software Engineer, SDE-1"
                value={jobRole}
                onChange={(e) => setJobRole(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-hidden focus:ring-2 focus:ring-blue-100 transition-all"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                CTC Package (Optional)
              </label>
              <input
                type="text"
                placeholder="e.g. 14.5 LPA or ₹12,00,000"
                value={ctcPackage}
                onChange={(e) => setCtcPackage(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-hidden focus:ring-2 focus:ring-blue-100 transition-all"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Drive Date *
              </label>
              <input
                type="date"
                required
                value={driveDate}
                onChange={(e) => setDriveDate(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm font-medium text-slate-900 focus:border-blue-500 focus:outline-hidden focus:ring-2 focus:ring-blue-100 transition-all"
              />
            </div>
          </div>

          {/* Eligibility Rules */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
              <span>🎯</span> Eligibility Filters
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Minimum CGPA Cutoff
                </label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="10"
                  placeholder="e.g. 7.5"
                  value={eligibilityMinCgpa}
                  onChange={(e) => setEligibilityMinCgpa(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-900 focus:border-blue-500 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Eligible Branches (Comma separated)
                </label>
                <input
                  type="text"
                  placeholder="CSE, IT, ECE, EE"
                  value={eligibleBranches}
                  onChange={(e) => setEligibleBranches(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-900 focus:border-blue-500 focus:outline-hidden"
                />
              </div>
            </div>
          </div>

          {/* Assigned Test */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Assigned Technical Assessment *
            </label>
            <select
              value={testId}
              onChange={(e) => setTestId(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm font-medium text-slate-900 focus:border-blue-500 focus:outline-hidden focus:ring-2 focus:ring-blue-100 transition-all bg-white"
            >
              <option value="">-- Select Test --</option>
              {tests.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} {!t.published ? "(Draft - needs publish)" : "✓ (Published)"}
                </option>
              ))}
            </select>
          </div>

          {/* Recruiter Passcode */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                Recruiter Portal Access Passkey
              </label>
              <span className="text-[11px] text-blue-600 font-semibold">
                Share this with Company HR / Panel
              </span>
            </div>
            <input
              type="text"
              value={accessPasscode}
              onChange={(e) => setAccessPasscode(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 font-mono px-3.5 py-2 text-xs text-slate-800 focus:border-blue-500 focus:outline-hidden"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
            <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={submitting || loading || !companyName || !jobRole}
              className="bg-blue-600 hover:bg-blue-700 text-white font-semibold"
            >
              {submitting ? "Creating Drive..." : "Create Placement Drive →"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
