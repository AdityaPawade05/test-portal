import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { TestResultsNav } from "@/components/admin/test-results-nav";
import { UsersIcon, DocumentIcon, CheckIcon } from "@/components/ui/icons";

import { calculateCronbachAlpha } from "@/lib/psychometrics";

export default async function TestAnalyticsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  const organizationId = session!.user.organizationId;

  const test = await db.test.findFirst({
    where: { id, organizationId },
    include: {
      sections: { orderBy: { order: "asc" } },
      invitations: {
        include: {
          attempt: {
            include: { score: true, responses: true },
          },
        },
      },
    },
  });

  if (!test) notFound();

  const invitations = test.invitations;
  const totalInvited = invitations.length;
  const startedCount = invitations.filter((i) => i.status !== "SENT").length;
  const completedCount = invitations.filter((i) => i.status === "SUBMITTED").length;
  const expiredCount = invitations.filter((i) => i.status === "EXPIRED").length;

  const scores = invitations
    .map((i) => i.attempt?.score)
    .filter((s): s is NonNullable<typeof s> => Boolean(s));

  const passedCount = scores.filter((s) => s.passed === true).length;
  const failedCount = scores.filter((s) => s.passed === false).length;

  const completionRate = totalInvited > 0 ? Math.round((completedCount / totalInvited) * 100) : 0;
  const passRate = completedCount > 0 ? Math.round((passedCount / completedCount) * 100) : 0;

  const rawTotals = scores.map((s) => s.rawTotal);
  const avgScore =
    rawTotals.length > 0
      ? (rawTotals.reduce((sum, v) => sum + v, 0) / rawTotals.length).toFixed(1)
      : "—";

  const sortedTotals = [...rawTotals].sort((a, b) => a - b);
  const medianScore =
    sortedTotals.length > 0
      ? sortedTotals[Math.floor(sortedTotals.length / 2)].toFixed(1)
      : "—";

  // Score distribution buckets (0-20%, 21-40%, 41-60%, 61-80%, 81-100%)
  const buckets = [
    { label: "0–20%", count: 0 },
    { label: "21–40%", count: 0 },
    { label: "41–60%", count: 0 },
    { label: "61–80%", count: 0 },
    { label: "81–100%", count: 0 },
  ];

  scores.forEach((s) => {
    const raw = s.rawTotal;
    if (raw <= 20) buckets[0].count++;
    else if (raw <= 40) buckets[1].count++;
    else if (raw <= 60) buckets[2].count++;
    else if (raw <= 80) buckets[3].count++;
    else buckets[4].count++;
  });

  const maxBucketCount = Math.max(...buckets.map((b) => b.count), 1);

  // Section difficulty metrics & Cronbach's Alpha (Phase 3)
  const sectionMetrics = test.sections.map((section) => {
    let sectionTotalScore = 0;
    let sectionAttemptsCount = 0;

    // Collect matrix for Cronbach's alpha
    const responsesMatrix: number[][] = [];

    invitations.forEach((inv) => {
      if (!inv.attempt) return;
      const responses = inv.attempt.responses;
      const sectionResponses = responses.filter((r) =>
        section.questionIds.includes(r.questionId),
      );

      if (sectionResponses.length > 0) {
        const row = sectionResponses.map((r) =>
          r.chosenOptionIds.length > 0 ? 1 : 0,
        );
        responsesMatrix.push(row);
      }
    });

    const alphaResult = calculateCronbachAlpha(responsesMatrix);

    scores.forEach((s) => {
      const rawBySection = (s.rawBySection ?? {}) as Record<string, number>;
      if (section.id in rawBySection) {
        sectionTotalScore += rawBySection[section.id];
        sectionAttemptsCount++;
      }
    });

    const avgSectionScore =
      sectionAttemptsCount > 0
        ? (sectionTotalScore / sectionAttemptsCount).toFixed(1)
        : "—";

    return {
      id: section.id,
      name: section.name,
      timeLimitMin: Math.round(section.timeLimitSec / 60),
      questionCount: section.questionCount,
      avgScore: avgSectionScore,
      cronbachAlpha: alphaResult.alpha,
      cronbachGrade: alphaResult.grade,
      cronbachLabel: alphaResult.label,
    };
  });

  return (
    <main className="mx-auto max-w-4xl px-6 py-10 sm:px-8">
      <TestResultsNav testId={test.id} testName={test.name} />

      {/* Top Overview Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
              <UsersIcon className="h-4.5 w-4.5" />
            </span>
            <div>
              <p className="text-xl font-bold text-slate-900">{totalInvited}</p>
              <p className="text-xs text-slate-500">Total Candidates</p>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
              <CheckIcon className="h-4.5 w-4.5" />
            </span>
            <div>
              <p className="text-xl font-bold text-slate-900">{completionRate}%</p>
              <p className="text-xs text-slate-500">Completion Rate ({completedCount})</p>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
              <DocumentIcon className="h-4.5 w-4.5" />
            </span>
            <div>
              <p className="text-xl font-bold text-slate-900">{avgScore}</p>
              <p className="text-xs text-slate-500">Average Raw Score</p>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
              <CheckIcon className="h-4.5 w-4.5" />
            </span>
            <div>
              <p className="text-xl font-bold text-slate-900">{passRate}%</p>
              <p className="text-xs text-slate-500">Pass Rate ({passedCount} passed)</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Score Distribution & Status Breakdown */}
      <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
        {/* Score Distribution Chart */}
        <Card className="p-6">
          <h2 className="text-base font-semibold text-slate-900">Score Distribution</h2>
          <p className="mt-0.5 text-xs text-slate-500">Candidate score distribution by percentage brackets</p>
          <div className="mt-6 flex h-40 items-end justify-between gap-3 pt-6 border-b border-slate-100">
            {buckets.map((bucket) => {
              const heightPercent = Math.round((bucket.count / maxBucketCount) * 100);
              return (
                <div key={bucket.label} className="flex flex-1 flex-col items-center gap-2">
                  <span className="text-xs font-semibold text-slate-700">{bucket.count}</span>
                  <div className="w-full bg-slate-100 rounded-t-md relative flex items-end justify-center h-28">
                    <div
                      className="w-full bg-indigo-600 rounded-t-md transition-all duration-300"
                      style={{ height: `${Math.max(heightPercent, 4)}%` }}
                    />
                  </div>
                  <span className="text-xs text-slate-500 font-medium">{bucket.label}</span>
                </div>
              );
            })}
          </div>
        </Card>

        {/* Candidate Status Summary */}
        <Card className="p-6">
          <h2 className="text-base font-semibold text-slate-900">Candidate Status</h2>
          <p className="mt-0.5 text-xs text-slate-500">Cohort completion and attempt progress</p>
          <div className="mt-6 space-y-4">
            <div>
              <div className="flex justify-between text-xs font-medium mb-1">
                <span className="text-slate-600">Submitted ({completedCount})</span>
                <span className="text-slate-900 font-semibold">{completionRate}%</span>
              </div>
              <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${completionRate}%` }} />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs font-medium mb-1">
                <span className="text-slate-600">In Progress ({startedCount - completedCount})</span>
                <span className="text-slate-900 font-semibold">
                  {totalInvited > 0 ? Math.round(((startedCount - completedCount) / totalInvited) * 100) : 0}%
                </span>
              </div>
              <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                <div
                  className="h-full bg-blue-500 rounded-full"
                  style={{
                    width: `${totalInvited > 0 ? Math.round(((startedCount - completedCount) / totalInvited) * 100) : 0}%`,
                  }}
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs font-medium mb-1">
                <span className="text-slate-600">Expired ({expiredCount})</span>
                <span className="text-slate-900 font-semibold">
                  {totalInvited > 0 ? Math.round((expiredCount / totalInvited) * 100) : 0}%
                </span>
              </div>
              <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                <div
                  className="h-full bg-rose-500 rounded-full"
                  style={{
                    width: `${totalInvited > 0 ? Math.round((expiredCount / totalInvited) * 100) : 0}%`,
                  }}
                />
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* Section Difficulty Metrics Table */}
      <Card className="mt-6 p-6">
        <h2 className="text-base font-semibold text-slate-900">Section Performance Metrics</h2>
        <p className="mt-0.5 text-xs text-slate-500">Average candidate scores across assessment sections</p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-max border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs font-medium uppercase tracking-wide text-slate-400">
                <th className="py-2.5 px-3">Section Name</th>
                <th className="py-2.5 px-3">Questions</th>
                <th className="py-2.5 px-3">Time Limit</th>
                <th className="py-2.5 px-3">Avg Raw Score</th>
                <th className="py-2.5 px-3">Cronbach&apos;s Alpha (α)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sectionMetrics.map((sec) => (
                <tr key={sec.id} className="hover:bg-slate-50">
                  <td className="py-3 px-3 font-medium text-slate-900">{sec.name}</td>
                  <td className="py-3 px-3 text-slate-600">{sec.questionCount} questions</td>
                  <td className="py-3 px-3 text-slate-600">{sec.timeLimitMin} mins</td>
                  <td className="py-3 px-3 font-semibold text-indigo-600">{sec.avgScore}</td>
                  <td className="py-3 px-3">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="font-mono font-bold text-slate-900">{sec.cronbachAlpha}</span>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          sec.cronbachGrade === "HIGH"
                            ? "bg-emerald-100 text-emerald-800"
                            : sec.cronbachGrade === "GOOD"
                              ? "bg-blue-100 text-blue-800"
                              : "bg-amber-100 text-amber-800"
                        }`}
                      >
                        {sec.cronbachLabel}
                      </span>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </main>
  );
}
