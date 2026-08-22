"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { CheckIcon, PencilIcon, TrashIcon } from "@/components/ui/icons";
import { OptionRow, QuestionFields, QuestionType } from "@/components/admin/question-fields";

type Question = {
  id: string;
  type: QuestionType;
  stem: string;
  mediaUrl: string | null;
  tags: string[];
  options: { id: string; label: string; isCorrect: boolean }[];
};

export function QuestionCard({ question }: { question: Question }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [type, setType] = useState<QuestionType>(question.type);
  const [stem, setStem] = useState(question.stem);
  const [mediaUrl, setMediaUrl] = useState(question.mediaUrl ?? "");
  const [tags, setTags] = useState(question.tags.join(", "));
  const [options, setOptions] = useState<OptionRow[]>(
    question.options.length
      ? question.options.map((o) => ({ label: o.label, isCorrect: o.isCorrect }))
      : [
          { label: "", isCorrect: false },
          { label: "", isCorrect: false },
        ],
  );
  const [saving, setSaving] = useState(false);

  function resetEdits() {
    setType(question.type);
    setStem(question.stem);
    setMediaUrl(question.mediaUrl ?? "");
    setTags(question.tags.join(", "));
    setOptions(
      question.options.length
        ? question.options.map((o) => ({ label: o.label, isCorrect: o.isCorrect }))
        : [
            { label: "", isCorrect: false },
            { label: "", isCorrect: false },
          ],
    );
    setError(null);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const res = await fetch(`/api/questions/${question.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type,
        stem,
        mediaUrl: mediaUrl || null,
        tags: tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
        options: type !== "NUMERIC" ? options.filter((o) => o.label.trim()) : [],
      }),
    });

    setSaving(false);

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(
        typeof body?.error === "string"
          ? body.error
          : (body?.error?.[0]?.message ?? "Could not save changes."),
      );
      return;
    }

    setEditing(false);
    router.refresh();
  }

  async function handleDelete() {
    setDeleting(true);
    setError(null);

    const res = await fetch(`/api/questions/${question.id}`, { method: "DELETE" });

    setDeleting(false);

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(typeof body?.error === "string" ? body.error : "Could not delete question.");
      setConfirmingDelete(false);
      return;
    }

    router.refresh();
  }

  if (editing) {
    return (
      <Card className="p-4">
        <form onSubmit={handleSave} className="flex flex-col gap-4">
          <QuestionFields
            type={type}
            onTypeChange={setType}
            stem={stem}
            onStemChange={setStem}
            mediaUrl={mediaUrl}
            onMediaUrlChange={setMediaUrl}
            tags={tags}
            onTagsChange={setTags}
            options={options}
            onOptionsChange={setOptions}
          />
          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" size="sm" disabled={saving}>
              {saving && <Spinner className="h-3.5 w-3.5 text-white" />}
              {saving ? "Saving…" : "Save"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={saving}
              onClick={() => {
                resetEdits();
                setEditing(false);
              }}
            >
              Cancel
            </Button>
          </div>
        </form>
      </Card>
    );
  }

  return (
    <Card className="p-4 transition-shadow hover:shadow-md">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Badge variant="info">{question.type}</Badge>
          <code
            className="truncate text-xs text-slate-300"
            title="Question ID — used when building test sections"
          >
            {question.id}
          </code>
        </div>
        {confirmingDelete ? (
          <div className="flex shrink-0 items-center gap-2">
            <span className="text-xs text-slate-500">Delete this question?</span>
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
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-700"
            >
              <PencilIcon className="h-3.5 w-3.5" />
              Edit
            </button>
            <button
              type="button"
              onClick={() => setConfirmingDelete(true)}
              className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium text-slate-400 hover:bg-red-50 hover:text-red-600"
            >
              <TrashIcon className="h-3.5 w-3.5" />
              Delete
            </button>
          </div>
        )}
      </div>

      <p className="mt-2.5 text-sm text-slate-800">{question.stem}</p>
      {question.options.length > 0 && (
        <ul className="mt-2.5 flex flex-col gap-1">
          {question.options.map((o) => (
            <li
              key={o.id}
              className={`flex items-center gap-1.5 text-sm ${
                o.isCorrect ? "font-medium text-emerald-700" : "text-slate-500"
              }`}
            >
              {o.isCorrect ? (
                <CheckIcon className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
              ) : (
                <span className="h-3.5 w-3.5 shrink-0 text-center text-slate-300">·</span>
              )}
              <span className="min-w-0 break-words">{o.label}</span>
            </li>
          ))}
        </ul>
      )}

      {error && !confirmingDelete && (
        <p className="mt-2.5 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}
    </Card>
  );
}
