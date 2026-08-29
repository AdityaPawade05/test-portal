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
  onOpenDeviceUpload,
}: {
  bank: { id: string; name: string };
  questionCount: number;
  onOpenDeviceUpload?: () => void;
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
      <form onSubmit={handleRename} className="mt-3 flex flex-wrap items-center gap-2 p-4 rounded-2xl bg-indigo-50/40 border border-indigo-200">
        <Input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="min-w-0 flex-1 text-sm font-bold bg-white sm:max-w-sm h-9"
        />
        <div className="flex shrink-0 gap-1.5">
          <Button type="submit" size="sm" disabled={saving} className="h-9 px-3 text-xs font-bold">
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
            className="h-9 text-xs"
          >
            Cancel
          </Button>
        </div>
        {error && <p className="w-full text-xs font-semibold text-red-600 mt-1">{error}</p>}
      </form>
    );
  }

  return (
    <div className="mt-3 p-5 rounded-2xl bg-white border border-slate-200 shadow-xs">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sky-600 font-bold text-xl shadow-inner">
            📁
          </span>
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-xl font-extrabold text-slate-900">{bank.name}</h1>
              <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-bold text-slate-700">
                {questionCount} {questionCount === 1 ? "question" : "questions"}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Author questions, configure multiple options, or upload directly from Word/Excel files.
            </p>
          </div>
        </div>

        {confirmingDelete ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2 bg-red-50 p-1.5 rounded-xl border border-red-200">
            <span className="text-xs font-bold text-red-800 px-1">Delete this bank?</span>
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
            <Button type="button" variant="danger" size="sm" disabled={deleting} onClick={handleDelete} className="h-7 text-xs px-2 font-bold">
              {deleting && <Spinner className="h-3 w-3 text-white mr-1" />}
              {deleting ? "Deleting…" : "Confirm"}
            </Button>
          </div>
        ) : (
          <div className="flex shrink-0 items-center gap-2 text-xs font-semibold">
            {onOpenDeviceUpload ? (
              <button
                type="button"
                onClick={onOpenDeviceUpload}
                className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 py-2 text-xs font-bold text-white shadow-sm hover:bg-indigo-700 transition-colors"
              >
                <UploadIcon className="h-3.5 w-3.5" />
                Upload from Device
              </button>
            ) : (
              <Link
                href={`/banks/${bank.id}/upload`}
                className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 py-2 text-xs font-bold text-white shadow-sm hover:bg-indigo-700 transition-colors"
              >
                <UploadIcon className="h-3.5 w-3.5" />
                Upload from Device
              </Link>
            )}

            <button
              type="button"
              onClick={() => setEditing(true)}
              className="flex items-center gap-1 rounded-xl px-2.5 py-2 bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors"
            >
              <PencilIcon className="h-3.5 w-3.5" />
              Rename
            </button>
            <button
              type="button"
              onClick={() => setConfirmingDelete(true)}
              className="flex items-center rounded-xl p-2 text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors"
              title="Delete bank"
            >
              <TrashIcon className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      {error && !confirmingDelete && (
        <p className="mt-2 text-xs font-semibold text-red-600">{error}</p>
      )}
    </div>
  );
}
