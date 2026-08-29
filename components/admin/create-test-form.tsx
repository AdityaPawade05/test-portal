"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { PlusIcon } from "@/components/ui/icons";

export function CreateTestForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    setError(null);

    const res = await fetch("/api/tests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), sections: [] }),
    });

    setSubmitting(false);

    if (!res.ok) {
      setError("Could not create assessment.");
      return;
    }

    const { test } = await res.json();
    router.push(`/tests/${test.id}/builder`);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-center gap-2">
      <Input
        type="text"
        required
        placeholder="e.g. Software Engineer Evaluation, Sales Aptitude"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="flex-1 min-w-[200px] h-9 text-xs font-semibold bg-white"
      />
      <Button type="submit" size="sm" disabled={submitting || !name.trim()} className="h-9 px-3.5 text-xs font-bold shrink-0">
        {submitting ? <Spinner className="h-3.5 w-3.5 mr-1" /> : <PlusIcon className="h-3.5 w-3.5 mr-1" />}
        {submitting ? "Creating…" : "Create Assessment"}
      </Button>
      {error && <p className="w-full text-xs font-semibold text-red-600 mt-1">{error}</p>}
    </form>
  );
}
