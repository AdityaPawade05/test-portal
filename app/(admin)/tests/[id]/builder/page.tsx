import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { TestBuilder } from "@/components/admin/test-builder";
import { InviteForm } from "@/components/admin/invite-form";
import { TestResultsNav } from "@/components/admin/test-results-nav";

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
      include: {
        questions: {
          select: {
            id: true,
            stem: true,
            type: true,
            tags: true,
            createdAt: true,
            options: {
              select: { id: true, label: true, isCorrect: true },
              orderBy: { order: "asc" },
            },
          },
          orderBy: { createdAt: "desc" },
        },
      },
      orderBy: { name: "asc" },
    }),
  ]);
  if (!test) notFound();

  return (
    <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
      <TestResultsNav testId={test.id} testName={test.name} />

      <div className="mt-4">
        <TestBuilder
          test={{ ...test, invitationCount: test._count.invitations }}
          banks={banks}
        />
      </div>

      <section className="mt-14 border-t border-slate-200 pt-8">
        <div className="mb-4">
          <h2 className="text-lg font-bold text-slate-900">✉️ Candidate Invitations &amp; Access Links</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Invite candidates via email or generate single-use assessment access links.
          </p>
        </div>
        <InviteForm testId={test.id} published={test.published} />
      </section>
    </main>
  );
}
