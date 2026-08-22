"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { PencilIcon, TrashIcon, UploadIcon } from "@/components/ui/icons";

export function BankHeader({
  bank,
  questionCount,
}: {
  bank: { id: string; name: string };
  questionCount: number;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [name, setName] = useState(bank.name);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleRename(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || name.trim() === bank.name) {
      setEditing(false);
      setName(bank.name);
      return;
    }
    setSaving(true);
    setError(null);

    const res = await fetch(`/api/banks/${bank.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim() }),
    });

    setSaving(false);

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(typeof body?.error === "string" ? body.error : "Could not rename bank.");
      return;
    }

    setEditing(false);
    router.refresh();
  }

  async function handleDelete() {
    setDeleting(true);
    setError(null);

    const res = await fetch(`/api/banks/${bank.id}`, { method: "DELETE" });

    setDeleting(false);

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(typeof body?.error === "string" ? body.error : "Could not delete bank.");
      setConfirmingDelete(false);
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  if (editing) {
    return (
      <form onSubmit={handleRename} className="mt-2 flex flex-wrap items-center gap-2">
        <Input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="min-w-0 flex-1 text-lg sm:max-w-sm"
        />
        <div className="flex shrink-0 gap-2">
          <Button type="submit" size="sm" disabled={saving}>
            {saving && <Spinner className="h-3.5 w-3.5 text-white" />}
            Save
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={saving}
            onClick={() => {
              setEditing(false);
              setName(bank.name);
              setError(null);
            }}
          >
            Cancel
          </Button>
        </div>
        {error && <p className="w-full text-sm text-red-600">{error}</p>}
      </form>
    );
  }

  return (
    <div>
      <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
        <h1 className="min-w-0 break-words text-2xl font-semibold text-slate-900">{bank.name}</h1>
        {confirmingDelete ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <span className="text-xs text-slate-500">Delete this bank?</span>
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
          <div className="flex shrink-0 items-center gap-2">
            <Link
              href={`/banks/${bank.id}/upload`}
              className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1"
            >
              <UploadIcon className="h-3.5 w-3.5" />
              Upload Questions
            </Link>
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-700"
            >
              <PencilIcon className="h-3.5 w-3.5" />
              Rename
            </button>
            <button
              type="button"
              onClick={() => setConfirmingDelete(true)}
              className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-slate-400 hover:bg-red-50 hover:text-red-600"
            >
              <TrashIcon className="h-3.5 w-3.5" />
              Delete
            </button>
          </div>
        )}
      </div>
      <p className="text-sm text-slate-500">
        {questionCount} question{questionCount === 1 ? "" : "s"}
      </p>
      {error && !confirmingDelete && (
        <p className="mt-1 text-sm text-red-600">{error}</p>
      )}
    </div>
  );
}
