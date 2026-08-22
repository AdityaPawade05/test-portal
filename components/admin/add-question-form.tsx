"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { OptionRow, QuestionFields, QuestionType } from "@/components/admin/question-fields";

export function AddQuestionForm({ bankId }: { bankId: string }) {
  const router = useRouter();
  const [type, setType] = useState<QuestionType>("MCQ_SINGLE");
  const [stem, setStem] = useState("");
  const [mediaUrl, setMediaUrl] = useState("");
  const [tags, setTags] = useState("");
  const [options, setOptions] = useState<OptionRow[]>([
    { label: "", isCorrect: false },
    { label: "", isCorrect: false },
  ]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const res = await fetch("/api/questions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bankId,
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

    setSubmitting(false);

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(
        typeof body?.error === "string"
          ? body.error
          : (body?.error?.[0]?.message ?? "Could not create question."),
      );
      return;
    }

    setStem("");
    setMediaUrl("");
    setTags("");
    setOptions([
      { label: "", isCorrect: false },
      { label: "", isCorrect: false },
    ]);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
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

      <Button type="submit" disabled={submitting} className="self-start">
        {submitting && <Spinner className="h-4 w-4 text-white" />}
        {submitting ? "Adding…" : "Add question"}
      </Button>
    </form>
  );
}
