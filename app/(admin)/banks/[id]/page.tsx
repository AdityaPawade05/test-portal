import { notFound } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { BankDetailView } from "@/components/admin/bank-detail-view";
import { ChevronLeftIcon } from "@/components/ui/icons";

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
    <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-1 text-sm font-semibold text-slate-500 transition-colors hover:text-slate-800"
      >
        <ChevronLeftIcon className="h-4 w-4" />
        Back to Dashboard
      </Link>

      <BankDetailView bank={bank as any} />
    </main>
  );
}
