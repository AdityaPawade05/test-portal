import { notFound } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { AddQuestionForm } from "@/components/admin/add-question-form";
import { BulkImportForm } from "@/components/admin/bulk-import-form";
import { QuestionCard } from "@/components/admin/question-card";
import { BankHeader } from "@/components/admin/bank-header";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ChevronLeftIcon, DocumentIcon } from "@/components/ui/icons";

export default async function BankPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  const organizationId = session!.user.organizationId;

  const bank = await db.questionBank.findFirst({
    where: { id, organizationId },
    include: {
      questions: {
        include: { options: { orderBy: { order: "asc" } } },
        orderBy: { createdAt: "desc" },
      },
    },
  });
  if (!bank) notFound();

  return (
    <main className="mx-auto max-w-3xl px-6 py-10 sm:px-8">
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-1 text-sm text-slate-500 transition-colors hover:text-slate-700"
      >
        <ChevronLeftIcon className="h-4 w-4" />
        Dashboard
      </Link>
      <BankHeader bank={{ id: bank.id, name: bank.name }} questionCount={bank.questions.length} />

      <div className="mt-6 flex flex-col gap-3">
        {bank.questions.map((q) => (
          <QuestionCard key={q.id} question={q} />
        ))}
        {bank.questions.length === 0 && (
          <Card>
            <EmptyState
              icon={<DocumentIcon className="h-5 w-5" />}
              title="No questions yet"
              description="Add the first one below."
            />
          </Card>
        )}
      </div>

      <h2 className="mt-10 text-base font-semibold text-slate-900">Add a question</h2>
      <Card className="mt-3 p-5">
        <AddQuestionForm bankId={bank.id} />
      </Card>

      <div className="mt-6">
        <BulkImportForm bankId={bank.id} />
      </div>
    </main>
  );
}
