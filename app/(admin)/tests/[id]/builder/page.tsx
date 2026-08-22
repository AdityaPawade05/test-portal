import { notFound } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { TestBuilder } from "@/components/admin/test-builder";
import { InviteForm } from "@/components/admin/invite-form";
import { ChevronLeftIcon } from "@/components/ui/icons";

export default async function TestBuilderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  const organizationId = session!.user.organizationId;

  const [test, banks] = await Promise.all([
    db.test.findFirst({
      where: { id, organizationId },
      include: {
        sections: { orderBy: { order: "asc" } },
        _count: { select: { invitations: true } },
      },
    }),
    db.questionBank.findMany({
      where: { organizationId },
      include: { questions: { select: { id: true, stem: true, type: true } } },
      orderBy: { name: "asc" },
    }),
  ]);
  if (!test) notFound();

  return (
    <main className="mx-auto max-w-3xl px-6 py-10 sm:px-8">
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-1 text-sm text-slate-500 transition-colors hover:text-slate-700"
      >
        <ChevronLeftIcon className="h-4 w-4" />
        Dashboard
      </Link>
      <h1 className="mt-2 text-2xl font-semibold text-slate-900">{test.name}</h1>

      <div className="mt-6">
        <TestBuilder
          test={{ ...test, invitationCount: test._count.invitations }}
          banks={banks}
        />
      </div>

      <section className="mt-12">
        <h2 className="text-base font-semibold text-slate-900">Invite candidates</h2>
        <div className="mt-3">
          <InviteForm testId={test.id} published={test.published} />
        </div>
      </section>
    </main>
  );
}
