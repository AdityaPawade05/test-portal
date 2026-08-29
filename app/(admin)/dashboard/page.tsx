import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { CreateBankForm } from "@/components/admin/create-bank-form";
import { CreateTestForm } from "@/components/admin/create-test-form";
import { BankRow } from "@/components/admin/bank-row";
import { TestRow } from "@/components/admin/test-row";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { BankIcon, DocumentIcon, UsersIcon, CheckIcon } from "@/components/ui/icons";
import Link from "next/link";

export default async function AdminDashboardPage() {
  const session = await auth();
  const organizationId = session!.user.organizationId;

  const [banks, tests, invitations] = await Promise.all([
    db.questionBank.findMany({
      where: { organizationId },
      include: { _count: { select: { questions: true } } },
      orderBy: { name: "asc" },
    }),
    db.test.findMany({
      where: { organizationId },
      include: {
        _count: { select: { sections: true, invitations: true } },
        sections: { select: { questionCount: true, timeLimitSec: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    db.invitation.findMany({
      where: { test: { organizationId } },
      select: { status: true },
    }),
  ]);

  const publishedCount = tests.filter((t) => t.published).length;
  const draftCount = tests.length - publishedCount;
  const totalQuestionsInBanks = banks.reduce((sum, b) => sum + b._count.questions, 0);
  const totalInvites = invitations.length;
  const submittedInvites = invitations.filter((i) => i.status === "SUBMITTED").length;
  const completionRate = totalInvites > 0 ? Math.round((submittedInvites / totalInvites) * 100) : 0;

  return (
    <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* ─── Hero Welcome Banner ─── */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-900 via-indigo-800 to-slate-900 p-6 sm:p-8 text-white shadow-xl">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2 max-w-xl">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-bold text-indigo-200 backdrop-blur-md border border-white/15">
              <span>⚡</span>
              <span>Assessment &amp; Proctoring Portal</span>
            </span>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
              Assessment Management Command Center
            </h1>
            <p className="text-xs sm:text-sm text-indigo-200/90 leading-relaxed">
              Create structured assessments, manage multi-format question banks, upload question files from devices, and monitor live AI anti-cheat proctoring telemetry.
            </p>
          </div>

          {/* Quick Actions in Hero */}
          <div className="flex flex-wrap gap-2.5 shrink-0">
            <Link
              href="/invitations"
              className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-xs font-extrabold text-indigo-900 shadow-md hover:bg-indigo-50 transition-all transform hover:-translate-y-0.5"
            >
              <UsersIcon className="h-4 w-4 text-indigo-600" />
              Invite Candidates
            </Link>
          </div>
        </div>

        {/* Decorative backdrop shapes */}
        <div className="absolute -right-10 -bottom-10 h-64 w-64 rounded-full bg-indigo-500/20 blur-3xl pointer-events-none" />
        <div className="absolute left-1/2 -top-12 h-48 w-48 rounded-full bg-blue-500/15 blur-2xl pointer-events-none" />
      </div>

      {/* ─── Modern Key Performance Indicator (KPI) Grid ─── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: Assessments */}
        <Card className="p-5 rounded-2xl border border-slate-200/90 bg-white shadow-xs hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 font-bold text-lg">
              📑
            </span>
            <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-bold text-emerald-700 border border-emerald-200">
              {publishedCount} Live
            </span>
          </div>
          <div className="mt-3">
            <p className="text-2xl font-extrabold text-slate-900">{tests.length}</p>
            <p className="text-xs font-semibold text-slate-500 mt-0.5">
              Total Assessments ({draftCount} Drafts)
            </p>
          </div>
        </Card>

        {/* KPI 2: Question Banks */}
        <Card className="p-5 rounded-2xl border border-slate-200/90 bg-white shadow-xs hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-50 text-sky-600 font-bold text-lg">
              📁
            </span>
            <span className="rounded-full bg-sky-50 px-2.5 py-0.5 text-[11px] font-bold text-sky-700 border border-sky-200">
              {totalQuestionsInBanks} Items
            </span>
          </div>
          <div className="mt-3">
            <p className="text-2xl font-extrabold text-slate-900">{banks.length}</p>
            <p className="text-xs font-semibold text-slate-500 mt-0.5">
              Question Banks ({totalQuestionsInBanks} Total Questions)
            </p>
          </div>
        </Card>

        {/* KPI 3: Candidates */}
        <Card className="p-5 rounded-2xl border border-slate-200/90 bg-white shadow-xs hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-50 text-violet-600 font-bold text-lg">
              👥
            </span>
            <span className="rounded-full bg-violet-50 px-2.5 py-0.5 text-[11px] font-bold text-violet-700 border border-violet-200">
              {completionRate}% Completed
            </span>
          </div>
          <div className="mt-3">
            <p className="text-2xl font-extrabold text-slate-900">{totalInvites}</p>
            <p className="text-xs font-semibold text-slate-500 mt-0.5">
              Candidates Invited ({submittedInvites} Submitted)
            </p>
          </div>
        </Card>

        {/* KPI 4: AI Proctoring Status */}
        <Card className="p-5 rounded-2xl border border-slate-200/90 bg-white shadow-xs hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-50 text-rose-600 font-bold text-lg">
              🛡️
            </span>
            <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-bold text-emerald-700 border border-emerald-200 flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Active
            </span>
          </div>
          <div className="mt-3">
            <p className="text-2xl font-extrabold text-slate-900">Multi-Object</p>
            <p className="text-xs font-semibold text-slate-500 mt-0.5">
              AI Vision &amp; Device Detection Ready
            </p>
          </div>
        </Card>
      </div>

      {/* ─── 2-Column Grid: Active Assessments & Question Banks ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: Assessments & Tests (7 cols) */}
        <div className="lg:col-span-7 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-900">Assessments &amp; Tests ({tests.length})</h2>
              <p className="text-xs text-slate-500">Configure test sections, passing cutoff grades, and view submissions.</p>
            </div>
          </div>

          <Card className="divide-y divide-slate-100 rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
            {tests.length === 0 && (
              <EmptyState
                icon={<DocumentIcon className="h-6 w-6 text-slate-400" />}
                title="No assessments created yet"
                description="Create your first test below to get started."
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

          {/* Quick Create Test Card */}
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/90 shadow-2xs">
            <p className="text-xs font-bold text-slate-700 mb-2.5">➕ Create New Assessment</p>
            <CreateTestForm />
          </div>
        </div>

        {/* Right Column: Question Banks (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-900">Question Banks ({banks.length})</h2>
              <p className="text-xs text-slate-500">Organize questions by subject and bulk upload from devices.</p>
            </div>
          </div>

          <Card className="divide-y divide-slate-100 rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
            {banks.length === 0 && (
              <EmptyState
                icon={<BankIcon className="h-6 w-6 text-slate-400" />}
                title="No question banks yet"
                description="Create a bank to store and manage questions."
              />
            )}
            {banks.map((bank) => (
              <BankRow
                key={bank.id}
                bank={{ id: bank.id, name: bank.name, questionCount: bank._count.questions }}
              />
            ))}
          </Card>

          {/* Quick Create Bank Card */}
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/90 shadow-2xs">
            <p className="text-xs font-bold text-slate-700 mb-2.5">📁 Create Question Bank</p>
            <CreateBankForm />
          </div>
        </div>
      </div>
    </main>
  );
}
