"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { DocumentIcon, DownloadIcon } from "@/components/ui/icons";

interface ExportDropdownProps {
  testId: string;
  testName?: string;
  className?: string;
  size?: "sm" | "md";
}

export function ExportDropdown({
  testId,
  testName = "Assessment",
  className = "",
  size = "sm",
}: ExportDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isOpen]);

  async function handleDownload(format: "xlsx" | "csv", type = "all") {
    try {
      setDownloading(`${format}-${type}`);
      const query = new URLSearchParams({ format, type }).toString();
      const url = `/api/tests/${testId}/export?${query}`;

      const res = await fetch(url);
      if (!res.ok) {
        throw new Error("Export download failed");
      }

      // Extract filename from header if present
      const disposition = res.headers.get("Content-Disposition");
      let filename = `${testName.replace(/\s+/g, "_")}_Export.${format}`;
      if (disposition && disposition.includes("filename=")) {
        const match = disposition.match(/filename="?([^"]+)"?/);
        if (match && match[1]) filename = match[1];
      }

      const blob = await res.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = downloadUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(downloadUrl);
      setIsOpen(false);
    } catch (err) {
      console.error("Export error:", err);
      alert("Could not export data. Please try again.");
    } finally {
      setDownloading(null);
    }
  }

  return (
    <div className={`relative inline-block text-left ${className}`} ref={menuRef}>
      <Button
        type="button"
        variant="secondary"
        size={size}
        onClick={() => setIsOpen(!isOpen)}
        disabled={Boolean(downloading)}
        className="inline-flex items-center gap-1.5 border-slate-300 bg-white font-medium text-slate-700 shadow-2xs hover:bg-slate-50 hover:text-slate-900"
      >
        {downloading ? (
          <Spinner className="h-4 w-4 text-indigo-600" />
        ) : (
          <DownloadIcon className="h-4 w-4 text-indigo-600" />
        )}
        <span>{downloading ? "Exporting…" : "Export Data"}</span>
        <svg
          className={`h-4 w-4 text-slate-400 transition-transform ${isOpen ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </Button>

      {isOpen && (
        <div className="absolute right-0 z-30 mt-2 w-72 origin-top-right rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl ring-1 ring-black/5 animate-fade-in">
          <div className="px-3 py-2 border-b border-slate-100">
            <p className="text-xs font-semibold text-slate-900">Download Assessment Data</p>
            <p className="text-[11px] text-slate-500">Formatted reports for hiring & audits</p>
          </div>

          <div className="py-1">
            {/* Full Excel Workbook */}
            <button
              type="button"
              onClick={() => handleDownload("xlsx", "all")}
              disabled={Boolean(downloading)}
              className="flex w-full items-start gap-2.5 rounded-lg px-3 py-2.5 text-left text-xs transition-colors hover:bg-indigo-50/80 group"
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-emerald-50 text-emerald-600 font-bold text-xs border border-emerald-200">
                📊
              </span>
              <div>
                <p className="font-semibold text-slate-900 group-hover:text-indigo-900">
                  Full Excel Report (.xlsx)
                </p>
                <p className="text-[11px] text-slate-500">
                  Multi-tab: Scores, section breakdown & proctoring audit
                </p>
              </div>
            </button>

            {/* Candidate Scores CSV */}
            <button
              type="button"
              onClick={() => handleDownload("csv", "scores")}
              disabled={Boolean(downloading)}
              className="flex w-full items-start gap-2.5 rounded-lg px-3 py-2.5 text-left text-xs transition-colors hover:bg-slate-100 group"
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-blue-50 text-blue-600 font-bold text-xs border border-blue-200">
                📄
              </span>
              <div>
                <p className="font-semibold text-slate-900 group-hover:text-blue-900">
                  Candidate Scores (.csv)
                </p>
                <p className="text-[11px] text-slate-500">
                  Flat scores, percentages & pass/fail statuses
                </p>
              </div>
            </button>

            {/* Proctoring Incident CSV */}
            <button
              type="button"
              onClick={() => handleDownload("csv", "proctoring")}
              disabled={Boolean(downloading)}
              className="flex w-full items-start gap-2.5 rounded-lg px-3 py-2.5 text-left text-xs transition-colors hover:bg-rose-50/80 group"
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-rose-50 text-rose-600 font-bold text-xs border border-rose-200">
                🛡️
              </span>
              <div>
                <p className="font-semibold text-slate-900 group-hover:text-rose-900">
                  Proctoring Audit Log (.csv)
                </p>
                <p className="text-[11px] text-slate-500">
                  Full security incident & anomaly timeline
                </p>
              </div>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
