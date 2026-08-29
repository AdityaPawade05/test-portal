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
        className="flex flex-wrap items-center gap-2 px-5 py-3.5 bg-indigo-50/30"
      >
        <Input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="min-w-0 flex-1 sm:max-w-xs h-8.5 text-xs font-semibold"
        />
        <div className="flex shrink-0 gap-1.5">
          <Button type="submit" size="sm" disabled={saving} className="h-8.5 text-xs font-bold">
            {saving && <Spinner className="h-3 w-3 text-white mr-1" />}
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
            className="h-8.5 text-xs"
          >
            Cancel
          </Button>
        </div>
        {error && <p className="w-full text-xs text-red-600 font-medium">{error}</p>}
      </form>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 transition-colors hover:bg-slate-50/80">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <Link
          href={`/banks/${bank.id}`}
          className="truncate text-sm font-bold text-slate-900 hover:text-indigo-600 transition-colors"
        >
          {bank.name}
        </Link>
        <span className="text-xs text-slate-400 font-medium">
          📋 {bank.questionCount} {bank.questionCount === 1 ? "question" : "questions"}
        </span>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        {confirmingDelete ? (
          <div className="flex items-center gap-1.5 bg-red-50 p-1 rounded-xl border border-red-200">
            <span className="text-xs font-bold text-red-800 px-1">Delete bank?</span>
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
          <div className="flex items-center gap-1 text-xs">
            <Link
              href={`/banks/${bank.id}`}
              className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 bg-indigo-50 text-indigo-700 font-bold hover:bg-indigo-100 transition-colors"
              title="View and manage questions"
            >
              Manage
            </Link>
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
              aria-label="Rename bank"
              title="Rename bank"
            >
              <PencilIcon className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setConfirmingDelete(true)}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors"
              aria-label="Delete bank"
              title="Delete bank"
            >
              <TrashIcon className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>
      {error && !confirmingDelete && (
        <p className="w-full text-xs font-medium text-red-600">{error}</p>
      )}
    </div>
  );
}
