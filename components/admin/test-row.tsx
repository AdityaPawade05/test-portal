"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { TrashIcon } from "@/components/ui/icons";

type Test = {
  id: string;
  name: string;
  published: boolean;
  sectionCount: number;
  inviteCount: number;
};

export function TestRow({ test }: { test: Test }) {
  const router = useRouter();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setDeleting(true);
    setError(null);

    const res = await fetch(`/api/tests/${test.id}`, { method: "DELETE" });

    setDeleting(false);

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(typeof body?.error === "string" ? body.error : "Could not delete test.");
      setConfirmingDelete(false);
      return;
    }

    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 transition-colors hover:bg-slate-50/80">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-center gap-2 flex-wrap">
          <Link
            href={`/tests/${test.id}/builder`}
            className="truncate text-sm font-bold text-slate-900 hover:text-indigo-600 transition-colors"
          >
            {test.name}
          </Link>
          <Badge variant={test.published ? "success" : "neutral"} className="font-bold text-[10px]">
            {test.published ? "Live" : "Draft"}
          </Badge>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <span>📑 {test.sectionCount} {test.sectionCount === 1 ? "section" : "sections"}</span>
          <span>•</span>
          <span>👥 {test.inviteCount} {test.inviteCount === 1 ? "candidate" : "candidates"}</span>
        </div>
      </div>

      {confirmingDelete ? (
        <div className="flex shrink-0 items-center gap-2 bg-red-50 p-1.5 rounded-xl border border-red-200">
          <span className="text-xs font-bold text-red-800 px-1">Delete test?</span>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={deleting}
            onClick={() => setConfirmingDelete(false)}
            className="h-7 text-xs px-2"
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="danger"
            size="sm"
            disabled={deleting}
            onClick={handleDelete}
            className="h-7 text-xs px-2"
          >
            {deleting && <Spinner className="h-3 w-3 text-white mr-1" />}
            {deleting ? "Deleting…" : "Confirm"}
          </Button>
        </div>
      ) : (
        <div className="flex shrink-0 flex-wrap items-center gap-1.5 text-xs font-semibold">
          <Link
            href={`/tests/${test.id}/builder`}
            className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition-colors"
            title="Configure test sections and questions"
          >
            🛠️ Builder
          </Link>
          <Link
            href={`/tests/${test.id}/results`}
            className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors"
            title="View candidate scores and results"
          >
            📊 Results
          </Link>
          <Link
            href={`/tests/${test.id}/proctoring`}
            className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 bg-rose-50 text-rose-700 hover:bg-rose-100 transition-colors"
            title="Review live proctoring & AI telemetry"
          >
            👁️ Proctoring
          </Link>
          <button
            type="button"
            onClick={() => setConfirmingDelete(true)}
            disabled={test.inviteCount > 0}
            title={
              test.inviteCount > 0
                ? "Already sent to candidates — cannot be deleted"
                : "Delete this test"
            }
            className="flex items-center rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-30 transition-colors"
          >
            <TrashIcon className="h-4 w-4" />
          </button>
        </div>
      )}

      {error && <p className="w-full text-xs font-medium text-red-600">{error}</p>}
    </div>
  );
}
