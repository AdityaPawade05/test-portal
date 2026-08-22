import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { CreateBankForm } from "@/components/admin/create-bank-form";
import { CreateTestForm } from "@/components/admin/create-test-form";
import { BankRow } from "@/components/admin/bank-row";
import { TestRow } from "@/components/admin/test-row";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { BankIcon, DocumentIcon, UsersIcon } from "@/components/ui/icons";

export default async function AdminDashboardPage() {
  const session = await auth();
  const organizationId = session!.user.organizationId;

  const [banks, tests] = await Promise.all([
    db.questionBank.findMany({
      where: { organizationId },
      include: { _count: { select: { questions: true } } },
      orderBy: { name: "asc" },
    }),
    db.test.findMany({
      where: { organizationId },
      include: { _count: { select: { sections: true, invitations: true } } },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const publishedCount = tests.filter((t) => t.published).length;
  const totalInvites = tests.reduce((sum, t) => sum + t._count.invitations, 0);

  const stats = [
    { label: "Question banks", value: banks.length, icon: BankIcon },
    { label: "Published tests", value: publishedCount, icon: DocumentIcon },
    { label: "Candidates invited", value: totalInvites, icon: UsersIcon },
  ];

  return (
    <main className="mx-auto max-w-5xl px-6 py-10 sm:px-8">
      <h1 className="text-2xl font-semibold text-slate-900">Dashboard</h1>
      <p className="mt-1 text-sm text-slate-500">
        Manage question banks, build tests, and review candidate results.
      </p>

      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {stats.map((stat) => (
          <Card key={stat.label} className="flex items-center gap-3 p-4">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
              <stat.icon className="h-4.5 w-4.5" />
            </span>
            <div>
              <p className="text-lg font-semibold leading-tight text-slate-900">{stat.value}</p>
              <p className="text-xs text-slate-500">{stat.label}</p>
            </div>
          </Card>
        ))}
      </div>

      <section className="mt-10">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">Question banks</h2>
          <span className="text-sm text-slate-400">
            {banks.length} bank{banks.length === 1 ? "" : "s"}
          </span>
        </div>

        <Card className="mt-3 divide-y divide-slate-100">
          {banks.length === 0 && (
            <EmptyState
              icon={<BankIcon className="h-5 w-5" />}
              title="No banks yet"
              description="Create one to start authoring questions."
            />
          )}
          {banks.map((bank) => (
            <BankRow
              key={bank.id}
              bank={{ id: bank.id, name: bank.name, questionCount: bank._count.questions }}
            />
          ))}
        </Card>
        <div className="mt-4">
          <CreateBankForm />
        </div>
      </section>

      <section className="mt-12">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">Tests</h2>
          <span className="text-sm text-slate-400">
            {tests.length} test{tests.length === 1 ? "" : "s"}
          </span>
        </div>

        <Card className="mt-3 divide-y divide-slate-100">
          {tests.length === 0 && (
            <EmptyState
              icon={<DocumentIcon className="h-5 w-5" />}
              title="No tests yet"
              description="Create one to get started."
            />
          )}
          {tests.map((test) => (
            <TestRow
              key={test.id}
              test={{
                id: test.id,
                name: test.name,
                published: test.published,
                sectionCount: test._count.sections,
                inviteCount: test._count.invitations,
              }}
            />
          ))}
        </Card>
        <div className="mt-4">
          <CreateTestForm />
        </div>
      </section>
    </main>
  );
}
