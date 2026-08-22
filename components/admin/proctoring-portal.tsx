"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type ProctoringEventData = {
  id: string;
  type: string;
  payload: unknown;
  occurredAt: string;
};

type AttemptProctoringData = {
  invitationId: string;
  email: string;
  status: string;
  attemptId: string | null;
  tabBlurCount: number;
  pasteCount: number;
  anomalyCount: number;
  severity: "HIGH" | "MEDIUM" | "CLEAN";
  events: ProctoringEventData[];
};

export function ProctoringPortal({
  attempts,
}: {
  attempts: AttemptProctoringData[];
}) {
  const [filter, setFilter] = useState<"ALL" | "HIGH" | "MEDIUM" | "CLEAN">("ALL");
  const [selectedAttemptId, setSelectedAttemptId] = useState<string | null>(null);

  const highCount = attempts.filter((a) => a.severity === "HIGH").length;
  const mediumCount = attempts.filter((a) => a.severity === "MEDIUM").length;
  const cleanCount = attempts.filter((a) => a.severity === "CLEAN").length;

  const filteredAttempts = attempts.filter((a) => {
    if (filter === "ALL") return true;
    return a.severity === filter;
  });

  const selectedAttempt = attempts.find((a) => a.attemptId === selectedAttemptId);

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <button
          onClick={() => setFilter("HIGH")}
          className={`text-left transition-all ${filter === "HIGH" ? "ring-2 ring-rose-500" : ""}`}
        >
          <Card className="p-4 border-l-4 border-l-rose-500 hover:bg-slate-50">
            <p className="text-2xl font-bold text-rose-600">{highCount}</p>
            <p className="text-xs font-medium text-slate-600">High Anomaly Flagged (&gt;3 events)</p>
          </Card>
        </button>

        <button
          onClick={() => setFilter("MEDIUM")}
          className={`text-left transition-all ${filter === "MEDIUM" ? "ring-2 ring-amber-500" : ""}`}
        >
          <Card className="p-4 border-l-4 border-l-amber-500 hover:bg-slate-50">
            <p className="text-2xl font-bold text-amber-600">{mediumCount}</p>
            <p className="text-xs font-medium text-slate-600">Medium Anomaly (1–3 events)</p>
          </Card>
        </button>

        <button
          onClick={() => setFilter("CLEAN")}
          className={`text-left transition-all ${filter === "CLEAN" ? "ring-2 ring-emerald-500" : ""}`}
        >
          <Card className="p-4 border-l-4 border-l-emerald-500 hover:bg-slate-50">
            <p className="text-2xl font-bold text-emerald-600">{cleanCount}</p>
            <p className="text-xs font-medium text-slate-600">Clean Attempts (0 events)</p>
          </Card>
        </button>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          {(["ALL", "HIGH", "MEDIUM", "CLEAN"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                filter === f
                  ? "bg-indigo-600 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {f === "ALL" ? "All Attempts" : f}
            </button>
          ))}
        </div>
        <span className="text-xs text-slate-500">
          Showing {filteredAttempts.length} of {attempts.length} candidates
        </span>
      </div>

      {/* Attempts Table */}
      <Card className="overflow-x-auto">
        <table className="w-full min-w-max border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs font-medium uppercase tracking-wide text-slate-400">
              <th className="px-5 py-3">Candidate</th>
              <th className="px-5 py-3">Severity</th>
              <th className="px-5 py-3">Tab Blurs</th>
              <th className="px-5 py-3">Paste Events</th>
              <th className="px-5 py-3">Total Events</th>
              <th className="px-5 py-3">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredAttempts.map((item) => (
              <tr key={item.invitationId} className="hover:bg-slate-50">
                <td className="px-5 py-3">
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-xs font-medium text-indigo-700">
                      {item.email.slice(0, 1).toUpperCase()}
                    </span>
                    <span className="font-medium text-slate-900">{item.email}</span>
                  </div>
                </td>
                <td className="px-5 py-3">
                  {item.severity === "HIGH" && <Badge variant="danger">HIGH SEVERITY</Badge>}
                  {item.severity === "MEDIUM" && <Badge variant="warning">MEDIUM</Badge>}
                  {item.severity === "CLEAN" && <Badge variant="success">CLEAN</Badge>}
                </td>
                <td className="px-5 py-3 text-slate-700 font-medium">{item.tabBlurCount}</td>
                <td className="px-5 py-3 text-slate-700 font-medium">{item.pasteCount}</td>
                <td className="px-5 py-3 text-slate-700 font-medium">{item.events.length}</td>
                <td className="px-5 py-3">
                  {item.events.length > 0 ? (
                    <button
                      onClick={() => setSelectedAttemptId(item.attemptId)}
                      className="text-xs font-medium text-indigo-600 hover:text-indigo-800 underline"
                    >
                      View Timeline
                    </button>
                  ) : (
                    <span className="text-xs text-slate-400">No telemetry</span>
                  )}
                </td>
              </tr>
            ))}
            {filteredAttempts.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-8 text-center text-slate-500 text-sm">
                  No candidate attempts match the selected proctoring filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      {/* Timeline Modal / Drawer */}
      {selectedAttempt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <Card className="w-full max-w-xl p-6 max-h-[80vh] overflow-y-auto bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-semibold text-slate-900">Proctoring Telemetry Timeline</h3>
                <p className="text-xs text-slate-500">{selectedAttempt.email}</p>
              </div>
              <button
                onClick={() => setSelectedAttemptId(null)}
                className="text-slate-400 hover:text-slate-600 text-sm font-semibold"
              >
                ✕
              </button>
            </div>

            <div className="mt-4 space-y-3">
              {selectedAttempt.events.map((evt, idx) => (
                <div
                  key={evt.id || idx}
                  className="flex items-start gap-3 p-3 rounded-lg bg-slate-50 border border-slate-100"
                >
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-amber-100 text-amber-800">
                    {evt.type}
                  </span>
                  <div className="flex-1 text-xs">
                    <p className="text-slate-700 font-medium">
                      Event detected at {new Date(evt.occurredAt).toLocaleTimeString()}
                    </p>
                    {evt.payload ? (
                      <pre className="mt-1 p-1.5 rounded bg-slate-200/60 font-mono text-[11px] text-slate-800">
                        {JSON.stringify(evt.payload, null, 2)}
                      </pre>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-6 flex justify-end">
              <button
                onClick={() => setSelectedAttemptId(null)}
                className="px-4 py-2 text-xs font-medium rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200"
              >
                Close Timeline
              </button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
