"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export type ProctoringEventData = {
  id: string;
  type: string;
  payload: unknown;
  occurredAt: string;
};

export type AttemptProctoringData = {
  invitationId: string;
  email: string;
  status: string;
  attemptId: string | null;
  tabBlurCount: number;
  pasteCount: number;
  phoneAnomalyCount: number;
  objectAnomalyCount?: number;
  gazeAnomalyCount: number;
  webcamAnomalyCount: number;
  micAnomalyCount: number;
  anomalyCount: number;
  severity: "HIGH" | "MEDIUM" | "CLEAN";
  events: ProctoringEventData[];
};

// ─── Event type classification ─────────────────────────────────────────────

function getEventBadgeStyle(type: string): {
  bg: string;
  text: string;
  label: string;
  icon: string;
} {
  if (type === "OBJECT_PHONE_DETECTED") {
    return { bg: "bg-rose-100 border border-rose-300", text: "text-rose-800", label: "PHONE DETECTED", icon: "📱" };
  }
  if (type === "PROHIBITED_BOOK_DETECTED") {
    return { bg: "bg-amber-100 border border-amber-300", text: "text-amber-800", label: "NOTES / BOOK DETECTED", icon: "📚" };
  }
  if (type === "PROHIBITED_SCREEN_DETECTED") {
    return { bg: "bg-rose-100 border border-rose-300", text: "text-rose-800", label: "2ND SCREEN / LAPTOP", icon: "💻" };
  }
  if (type === "PROHIBITED_AUDIO_DEVICE_DETECTED") {
    return { bg: "bg-purple-100 border border-purple-300", text: "text-purple-800", label: "HEADPHONES / AUDIO", icon: "🎧" };
  }
  if (type === "PROHIBITED_OBJECT_DETECTED") {
    return { bg: "bg-orange-100 border border-orange-300", text: "text-orange-800", label: "PROHIBITED OBJECT", icon: "⚠️" };
  }
  if (type === "FACE_LOOKING_AWAY") {
    return { bg: "bg-amber-100 border border-amber-300", text: "text-amber-800", label: "LOOKING AWAY", icon: "👀" };
  }
  if (type === "MULTIPLE_FACES_DETECTED" || type === "UNAUTHORIZED_PERSON_DETECTED") {
    return { bg: "bg-rose-100 border border-rose-300", text: "text-rose-800", label: "MULTIPLE PEOPLE", icon: "👥" };
  }
  if (type === "FACE_EXCESSIVE_MOVEMENT") {
    return { bg: "bg-amber-100 border border-amber-300", text: "text-amber-800", label: "FACE MOVEMENT", icon: "🔀" };
  }
  if (type.startsWith("WEBCAM_")) {
    return { bg: "bg-blue-100", text: "text-blue-800", label: type, icon: "📹" };
  }
  if (type.startsWith("MIC_")) {
    return { bg: "bg-purple-100", text: "text-purple-800", label: type, icon: "🎤" };
  }
  if (type === "PROCTORING_VIOLATION" || type === "AUTO_SUBMIT_VIOLATIONS") {
    return { bg: "bg-rose-100", text: "text-rose-800", label: type, icon: "🚨" };
  }
  if (type === "TAB_BLUR" || type === "FULLSCREEN_EXIT") {
    return { bg: "bg-amber-100", text: "text-amber-800", label: type, icon: "⚠️" };
  }
  return { bg: "bg-slate-100", text: "text-slate-700", label: type, icon: "ℹ️" };
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ProctoringPortal({
  attempts,
}: {
  attempts: AttemptProctoringData[];
}) {
  const [filter, setFilter] = useState<"ALL" | "HIGH" | "OBJECTS" | "PHONE" | "GAZE" | "MEDIUM" | "CLEAN">("ALL");
  const [selectedAttemptId, setSelectedAttemptId] = useState<string | null>(null);

  const highCount = attempts.filter((a) => a.severity === "HIGH").length;
  const objectCount = attempts.filter((a) => (a.objectAnomalyCount || a.phoneAnomalyCount || 0) > 0).length;
  const phoneCount = attempts.filter((a) => (a.phoneAnomalyCount || 0) > 0).length;
  const gazeCount = attempts.filter((a) => (a.gazeAnomalyCount || 0) > 0).length;
  const cleanCount = attempts.filter((a) => a.severity === "CLEAN").length;

  const filteredAttempts = attempts.filter((a) => {
    if (filter === "ALL") return true;
    if (filter === "OBJECTS") return (a.objectAnomalyCount || a.phoneAnomalyCount || 0) > 0;
    if (filter === "PHONE") return (a.phoneAnomalyCount || 0) > 0;
    if (filter === "GAZE") return (a.gazeAnomalyCount || 0) > 0;
    return a.severity === filter;
  });

  const selectedAttempt = attempts.find((a) => a.attemptId === selectedAttemptId);

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <button
          onClick={() => setFilter("OBJECTS")}
          className={`text-left transition-all ${filter === "OBJECTS" ? "ring-2 ring-rose-500" : ""}`}
        >
          <Card className="p-4 border-l-4 border-l-rose-500 hover:bg-slate-50">
            <p className="text-2xl font-bold text-rose-600">📦 {objectCount}</p>
            <p className="text-xs font-medium text-slate-600">Prohibited Objects Detected</p>
          </Card>
        </button>

        <button
          onClick={() => setFilter("GAZE")}
          className={`text-left transition-all ${filter === "GAZE" ? "ring-2 ring-amber-500" : ""}`}
        >
          <Card className="p-4 border-l-4 border-l-amber-500 hover:bg-slate-50">
            <p className="text-2xl font-bold text-amber-600">👀 {gazeCount}</p>
            <p className="text-xs font-medium text-slate-600">Face / Gaze Anomalies</p>
          </Card>
        </button>

        <button
          onClick={() => setFilter("HIGH")}
          className={`text-left transition-all ${filter === "HIGH" ? "ring-2 ring-red-500" : ""}`}
        >
          <Card className="p-4 border-l-4 border-l-red-500 hover:bg-slate-50">
            <p className="text-2xl font-bold text-red-600">🚨 {highCount}</p>
            <p className="text-xs font-medium text-slate-600">High Risk (&gt;3 events)</p>
          </Card>
        </button>

        <button
          onClick={() => setFilter("CLEAN")}
          className={`text-left transition-all ${filter === "CLEAN" ? "ring-2 ring-emerald-500" : ""}`}
        >
          <Card className="p-4 border-l-4 border-l-emerald-500 hover:bg-slate-50">
            <p className="text-2xl font-bold text-emerald-600">✅ {cleanCount}</p>
            <p className="text-xs font-medium text-slate-600">Clean Attempts (0 events)</p>
          </Card>
        </button>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-xs text-slate-500 font-medium mr-1">AI Detected Categories:</span>
        {[
          { bg: "bg-rose-100 text-rose-800 border border-rose-300", label: "📱 Phone" },
          { bg: "bg-amber-100 text-amber-800 border border-amber-300", label: "📚 Books / Notes" },
          { bg: "bg-rose-100 text-rose-800 border border-rose-300", label: "💻 2nd Screen" },
          { bg: "bg-purple-100 text-purple-800 border border-purple-300", label: "🎧 Audio / Headphones" },
          { bg: "bg-amber-100 text-amber-800 border border-amber-300", label: "👀 Gaze / Head Pose" },
          { bg: "bg-rose-100 text-rose-800 border border-rose-300", label: "👥 Multi-Person" },
          { bg: "bg-blue-100 text-blue-800", label: "📹 Webcam" },
          { bg: "bg-purple-100 text-purple-800", label: "🎤 Mic" },
        ].map((b) => (
          <span key={b.label} className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${b.bg}`}>
            {b.label}
          </span>
        ))}
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center justify-between">
        <div className="flex gap-2 flex-wrap">
          {(["ALL", "OBJECTS", "PHONE", "GAZE", "HIGH", "CLEAN"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                filter === f
                  ? "bg-indigo-600 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {f === "ALL"
                ? "All Attempts"
                : f === "OBJECTS"
                ? "📦 All Prohibited Objects"
                : f === "PHONE"
                ? "📱 Phone Flags"
                : f === "GAZE"
                ? "👀 Gaze / Face Movement"
                : f === "HIGH"
                ? "🚨 High Severity"
                : "✅ Clean"}
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
              <th className="px-5 py-3">Risk Level</th>
              <th className="px-5 py-3 text-rose-600">📦 Objects</th>
              <th className="px-5 py-3 text-amber-600">👀 Gaze / Pose</th>
              <th className="px-5 py-3">Tab Blurs</th>
              <th className="px-5 py-3 text-blue-600">📹 Webcam</th>
              <th className="px-5 py-3 text-purple-600">🎤 Mic</th>
              <th className="px-5 py-3">Total Events</th>
              <th className="px-5 py-3">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredAttempts.map((item) => {
              const totalObjAnomalies = item.objectAnomalyCount || item.phoneAnomalyCount || 0;
              return (
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
                    {item.severity === "HIGH" && <Badge variant="danger">HIGH RISK</Badge>}
                    {item.severity === "MEDIUM" && <Badge variant="warning">MEDIUM</Badge>}
                    {item.severity === "CLEAN" && <Badge variant="success">CLEAN</Badge>}
                  </td>
                  {/* Prohibited Objects Pill */}
                  <td className="px-5 py-3">
                    {totalObjAnomalies > 0 ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 text-xs font-bold border border-rose-200">
                        <span>📦</span>
                        {totalObjAnomalies}
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400">0</span>
                    )}
                  </td>
                  {/* Gaze / Pose Anomaly Pill */}
                  <td className="px-5 py-3">
                    {(item.gazeAnomalyCount || 0) > 0 ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 text-xs font-semibold border border-amber-200">
                        <span>👀</span>
                        {item.gazeAnomalyCount}
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400">0</span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-slate-700 font-medium">{item.tabBlurCount}</td>
                  <td className="px-5 py-3">
                    {item.webcamAnomalyCount > 0 ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 text-xs font-semibold">
                        <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                        {item.webcamAnomalyCount}
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400">0</span>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    {item.micAnomalyCount > 0 ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 text-xs font-semibold">
                        <span className="h-1.5 w-1.5 rounded-full bg-purple-500" />
                        {item.micAnomalyCount}
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400">0</span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-slate-700 font-medium">{item.events.length}</td>
                  <td className="px-5 py-3">
                    {item.events.length > 0 ? (
                      <button
                        onClick={() => setSelectedAttemptId(item.attemptId)}
                        className="text-xs font-medium text-indigo-600 hover:text-indigo-800 underline"
                      >
                        View AI Timeline
                      </button>
                    ) : (
                      <span className="text-xs text-slate-400">No telemetry</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {filteredAttempts.length === 0 && (
              <tr>
                <td colSpan={9} className="px-5 py-8 text-center text-slate-500 text-sm">
                  No candidate attempts match the selected proctoring filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      {/* AI Telemetry Timeline Modal */}
      {selectedAttempt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <Card className="w-full max-w-xl p-6 max-h-[80vh] overflow-y-auto bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-semibold text-slate-900">Proctoring AI Telemetry Timeline</h3>
                <p className="text-xs text-slate-500">{selectedAttempt.email}</p>
              </div>
              {/* Event summary badges */}
              <div className="flex gap-1.5 flex-wrap justify-end max-w-xs">
                {(selectedAttempt.objectAnomalyCount || selectedAttempt.phoneAnomalyCount || 0) > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 text-[10px] font-bold">
                    📦 {selectedAttempt.objectAnomalyCount || selectedAttempt.phoneAnomalyCount} Objects
                  </span>
                )}
                {selectedAttempt.gazeAnomalyCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[10px] font-bold">
                    👀 {selectedAttempt.gazeAnomalyCount} Gaze/Pose
                  </span>
                )}
              </div>
              <button
                onClick={() => setSelectedAttemptId(null)}
                className="text-slate-400 hover:text-slate-600 text-sm font-semibold ml-3"
              >
                ✕
              </button>
            </div>

            <div className="mt-4 space-y-3">
              {selectedAttempt.events.map((evt, idx) => {
                const badge = getEventBadgeStyle(evt.type);
                return (
                  <div
                    key={evt.id || idx}
                    className="flex items-start gap-3 p-3 rounded-lg bg-slate-50 border border-slate-100"
                  >
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase shrink-0 flex items-center gap-1 ${badge.bg} ${badge.text}`}
                    >
                      <span>{badge.icon}</span>
                      <span>{badge.label}</span>
                    </span>
                    <div className="flex-1 text-xs min-w-0">
                      <p className="text-slate-700 font-medium">
                        Event detected at {new Date(evt.occurredAt).toLocaleTimeString()}
                      </p>
                      {evt.payload ? (
                        <pre className="mt-1 p-1.5 rounded bg-slate-200/60 font-mono text-[11px] text-slate-800 overflow-x-auto">
                          {JSON.stringify(evt.payload, null, 2)}
                        </pre>
                      ) : null}
                    </div>
                  </div>
                );
              })}
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

