import { notFound } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { BulkImportForm } from "@/components/admin/bulk-import-form";
import { ChevronLeftIcon } from "@/components/ui/icons";

export default async function QuestionUploadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  const organizationId = session!.user.organizationId;

  const bank = await db.questionBank.findFirst({
    where: { id, organizationId },
    select: { id: true, name: true, _count: { select: { questions: true } } },
  });

  if (!bank) notFound();

  return (
    <main className="mx-auto max-w-4xl px-6 py-10 sm:px-8">
      <Link
        href={`/banks/${bank.id}`}
        className="inline-flex items-center gap-1 text-sm font-medium text-slate-500 transition-colors hover:text-slate-800"
      >
        <ChevronLeftIcon className="h-4 w-4" />
        Back to {bank.name}
      </Link>

      <div className="mt-4 flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Bulk Question Upload
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Import multiple questions into <span className="font-semibold text-slate-700">{bank.name}</span> using CSV, Excel, or Word documents.
          </p>
        </div>
        <span className="inline-flex items-center rounded-full bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700">
          Currently {bank._count.questions} questions in bank
        </span>
      </div>

      <div className="mt-8">
        <BulkImportForm bankId={bank.id} />
      </div>
    </main>
  );
}
