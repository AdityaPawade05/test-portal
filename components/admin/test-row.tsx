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
    <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 transition-colors hover:bg-slate-50">
      <div className="flex min-w-0 flex-wrap items-center gap-2.5">
        <span className="truncate text-sm font-medium text-slate-900">{test.name}</span>
        <Badge variant={test.published ? "success" : "neutral"}>
          {test.published ? "Published" : "Draft"}
        </Badge>
        <span className="text-xs text-slate-400">
          {test.sectionCount} section{test.sectionCount === 1 ? "" : "s"} ·{" "}
          {test.inviteCount} invite{test.inviteCount === 1 ? "" : "s"}
        </span>
      </div>

      {confirmingDelete ? (
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-xs text-slate-500">Delete test?</span>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={deleting}
            onClick={() => setConfirmingDelete(false)}
          >
            Cancel
          </Button>
          <Button type="button" variant="danger" size="sm" disabled={deleting} onClick={handleDelete}>
            {deleting && <Spinner className="h-3.5 w-3.5 text-white" />}
            {deleting ? "Deleting…" : "Delete"}
          </Button>
        </div>
      ) : (
        <div className="flex shrink-0 flex-wrap items-center gap-4 text-sm font-medium">
          <Link
            href={`/tests/${test.id}/builder`}
            className="text-indigo-600 transition-colors hover:text-indigo-700"
          >
            Builder
          </Link>
          <Link
            href={`/tests/${test.id}/results`}
            className="text-indigo-600 transition-colors hover:text-indigo-700"
          >
            Results
          </Link>
          <button
            type="button"
            onClick={() => setConfirmingDelete(true)}
            disabled={test.inviteCount > 0}
            title={
              test.inviteCount > 0
                ? "Already sent to candidates — can't be deleted"
                : "Delete this test"
            }
            className="flex items-center gap-1 rounded-md px-1 py-0.5 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-slate-400"
          >
            <TrashIcon className="h-4 w-4" />
          </button>
        </div>
      )}

      {error && <p className="w-full text-sm text-red-600">{error}</p>}
    </div>
  );
}
