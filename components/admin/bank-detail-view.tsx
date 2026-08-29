"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { BankHeader } from "./bank-header";
import { QuestionCard } from "./question-card";
import { AddQuestionForm } from "./add-question-form";
import { DeviceQuestionUploadModal } from "./device-question-upload-modal";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { DocumentIcon, PlusIcon, UploadIcon, XIcon } from "@/components/ui/icons";
import { QuestionType } from "./question-fields";

export type QuestionData = {
  id: string;
  type: QuestionType;
  stem: string;
  mediaUrl: string | null;
  tags: string[];
  options: { id: string; label: string; isCorrect: boolean }[];
};

export type BankData = {
  id: string;
  name: string;
  questions: QuestionData[];
};

export function BankDetailView({ bank }: { bank: BankData }) {
  const router = useRouter();
  const [showDeviceUpload, setShowDeviceUpload] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState<"ALL" | "UPLOADED" | "TYPED">("ALL");
  const [typeFilter, setTypeFilter] = useState<string>("ALL");

  const questionStats = useMemo(() => {
    let uploaded = 0;
    let typed = 0;
    for (const q of bank.questions) {
      const isUploaded = (q.tags || []).some(
        (t) =>
          t.toLowerCase() === "uploaded" ||
          t.toLowerCase() === "source:uploaded" ||
          t.toLowerCase() === "bulk" ||
          t.toLowerCase() === "imported" ||
          t.toLowerCase() === "file" ||
          t.toLowerCase() === "device" ||
          t.toLowerCase().startsWith("file:")
      );
      if (isUploaded) uploaded++;
      else typed++;
    }
    return { total: bank.questions.length, uploaded, typed };
  }, [bank.questions]);

  const filteredQuestions = useMemo(() => {
    return bank.questions.filter((q) => {
      const isUploaded = (q.tags || []).some(
        (t) =>
          t.toLowerCase() === "uploaded" ||
          t.toLowerCase() === "source:uploaded" ||
          t.toLowerCase() === "bulk" ||
          t.toLowerCase() === "imported" ||
          t.toLowerCase() === "file" ||
          t.toLowerCase() === "device" ||
          t.toLowerCase().startsWith("file:")
      );

      if (sourceFilter === "UPLOADED" && !isUploaded) return false;
      if (sourceFilter === "TYPED" && isUploaded) return false;
      if (typeFilter !== "ALL" && q.type !== typeFilter) return false;

      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const stemMatch = q.stem.toLowerCase().includes(query);
        const tagMatch = (q.tags || []).some((t) => t.toLowerCase().includes(query));
        const optMatch = (q.options || []).some((o) => o.label.toLowerCase().includes(query));
        if (!stemMatch && !tagMatch && !optMatch) return false;
      }
      return true;
    });
  }, [bank.questions, sourceFilter, typeFilter, searchQuery]);

  return (
    <div className="space-y-6">
      {/* Bank Header */}
      <BankHeader
        bank={{ id: bank.id, name: bank.name }}
        questionCount={bank.questions.length}
        onOpenDeviceUpload={() => setShowDeviceUpload(true)}
      />

      {/* Filter & Search Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3.5 rounded-2xl border border-slate-200 shadow-2xs">
        {/* Search Bar */}
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <input
            type="text"
            placeholder="🔍 Search questions in this bank…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-8.5 rounded-xl border border-slate-300 bg-white pl-3.5 pr-8 text-xs font-medium text-slate-800 placeholder-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
            >
              <XIcon className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Source & Type Filter Pills */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            type="button"
            onClick={() => setSourceFilter("ALL")}
            className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${
              sourceFilter === "ALL"
                ? "bg-slate-900 text-white shadow-sm"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            All ({questionStats.total})
          </button>
          <button
            type="button"
            onClick={() => setSourceFilter("UPLOADED")}
            className={`inline-flex items-center gap-1 px-3 py-1 text-xs font-bold rounded-lg border transition-all ${
              sourceFilter === "UPLOADED"
                ? "bg-sky-600 text-white border-sky-600 shadow-sm"
                : "bg-sky-50 text-sky-700 border-sky-200 hover:bg-sky-100"
            }`}
          >
            <span>📤 Uploaded</span>
            <span className="opacity-90 font-mono text-[11px]">({questionStats.uploaded})</span>
          </button>
          <button
            type="button"
            onClick={() => setSourceFilter("TYPED")}
            className={`inline-flex items-center gap-1 px-3 py-1 text-xs font-bold rounded-lg border transition-all ${
              sourceFilter === "TYPED"
                ? "bg-violet-600 text-white border-violet-600 shadow-sm"
                : "bg-violet-50 text-violet-700 border-violet-200 hover:bg-violet-100"
            }`}
          >
            <span>✍️ Typed</span>
            <span className="opacity-90 font-mono text-[11px]">({questionStats.typed})</span>
          </button>
        </div>

        {/* Quick Action to toggle inline authoring */}
        <button
          type="button"
          onClick={() => setShowAddForm((prev) => !prev)}
          className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-50 border border-indigo-200 px-3 py-1.5 text-xs font-bold text-indigo-700 hover:bg-indigo-100 transition-colors"
        >
          <PlusIcon className="h-3.5 w-3.5" />
          {showAddForm ? "Hide Form" : "Add Question"}
        </button>
      </div>

      {/* Collapsible Add Question Form */}
      {showAddForm && (
        <Card className="p-6 rounded-2xl border-indigo-200 bg-indigo-50/20 shadow-sm animate-in fade-in duration-150">
          <div className="flex items-center justify-between mb-4 border-b border-indigo-100 pb-3">
            <h2 className="text-sm font-extrabold text-slate-900">✍️ Author New Question</h2>
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              className="text-xs text-slate-400 hover:text-slate-600 font-semibold"
            >
              Close
            </button>
          </div>
          <AddQuestionForm bankId={bank.id} />
        </Card>
      )}

      {/* Questions List */}
      <div className="flex flex-col gap-3">
        {filteredQuestions.map((q) => (
          <QuestionCard key={q.id} question={q} />
        ))}

        {filteredQuestions.length === 0 && (
          <Card className="p-8 text-center rounded-2xl border-dashed">
            <EmptyState
              icon={<DocumentIcon className="h-6 w-6 text-slate-400" />}
              title={
                searchQuery || sourceFilter !== "ALL"
                  ? "No matching questions found"
                  : "No questions in this bank yet"
              }
              description={
                searchQuery || sourceFilter !== "ALL"
                  ? "Try clearing your search query or filter tags."
                  : "Upload a Word/Excel document or author questions manually."
              }
            />
            <div className="mt-4 flex justify-center gap-2">
              <button
                type="button"
                onClick={() => setShowDeviceUpload(true)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 py-2 text-xs font-bold text-white shadow-sm hover:bg-indigo-700 transition-colors"
              >
                <UploadIcon className="h-3.5 w-3.5" />
                Upload from Device
              </button>
              <button
                type="button"
                onClick={() => setShowAddForm(true)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-slate-100 px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-200 transition-colors"
              >
                <PlusIcon className="h-3.5 w-3.5" />
                Write Question
              </button>
            </div>
          </Card>
        )}
      </div>

      {/* Device Question Upload Modal */}
      <DeviceQuestionUploadModal
        bankId={bank.id}
        bankName={bank.name}
        isOpen={showDeviceUpload}
        onClose={() => setShowDeviceUpload(false)}
        onQuestionsImported={() => {
          router.refresh();
        }}
      />
    </div>
  );
}
