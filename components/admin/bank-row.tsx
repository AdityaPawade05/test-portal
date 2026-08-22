"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { PencilIcon, TrashIcon, UploadIcon } from "@/components/ui/icons";

type Bank = { id: string; name: string; questionCount: number };

export function BankRow({ bank }: { bank: Bank }) {
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

    router.refresh();
  }

  if (editing) {
    return (
      <form
        onSubmit={handleRename}
        className="flex flex-wrap items-center gap-2 px-5 py-3"
      >
        <Input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="min-w-0 flex-1 sm:max-w-xs"
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
    <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3.5 transition-colors hover:bg-slate-50">
      <Link
        href={`/banks/${bank.id}`}
        className="min-w-0 flex-1 truncate text-sm font-medium text-slate-900 hover:text-indigo-600"
      >
        {bank.name}
      </Link>
      <div className="flex shrink-0 items-center gap-3">
        <span className="text-sm text-slate-400">
          {bank.questionCount} question{bank.questionCount === 1 ? "" : "s"}
        </span>
        {confirmingDelete ? (
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">Delete bank?</span>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={deleting}
              onClick={() => setConfirmingDelete(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="danger"
              size="sm"
              disabled={deleting}
              onClick={handleDelete}
            >
              {deleting && <Spinner className="h-3.5 w-3.5 text-white" />}
              {deleting ? "Deleting…" : "Delete"}
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-1">
            <Link
              href={`/banks/${bank.id}/upload`}
              className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-indigo-600 hover:bg-indigo-50"
              title="Upload Questions"
            >
              <UploadIcon className="h-3.5 w-3.5" />
              Upload
            </Link>
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-700"
              aria-label="Rename bank"
            >
              <PencilIcon className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setConfirmingDelete(true)}
              className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium text-slate-400 hover:bg-red-50 hover:text-red-600"
              aria-label="Delete bank"
            >
              <TrashIcon className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>
      {error && !confirmingDelete && (
        <p className="w-full text-sm text-red-600">{error}</p>
      )}
    </div>
  );
}
