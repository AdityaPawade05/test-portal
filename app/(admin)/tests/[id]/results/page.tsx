import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { InboxIcon } from "@/components/ui/icons";
import { TestResultsNav } from "@/components/admin/test-results-nav";

const STATUS_VARIANT = {
  SENT: "neutral",
  STARTED: "info",
  SUBMITTED: "success",
  EXPIRED: "danger",
} as const;

export default async function TestResultsPage({
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
      invitations: {
        orderBy: { createdAt: "desc" },
        include: {
          attempt: {
            include: { score: true, events: { select: { type: true } } },
          },
        },
      },
    },
  });
  if (!test) notFound();

  return (
    <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
      <TestResultsNav testId={test.id} testName={test.name} />

      <Card className="mt-6 overflow-x-auto">
        <table className="w-full min-w-max border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs font-medium uppercase tracking-wide text-slate-400">
              <th className="px-5 py-3">Candidate</th>
              <th className="px-5 py-3">Status</th>
              <th className="px-5 py-3">Raw score</th>
              <th className="px-5 py-3">Percentile</th>
              <th className="px-5 py-3">Section breakdown</th>
              <th className="px-5 py-3">Passed</th>
              <th className="px-5 py-3">Tab blurs</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {test.invitations.map((inv) => {
              const score = inv.attempt?.score;
              const tabBlurs =
                inv.attempt?.events.filter((e) => e.type === "TAB_BLUR").length ?? 0;
              return (
                <tr key={inv.id} className="transition-colors hover:bg-slate-50">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2.5">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-xs font-medium text-indigo-700">
                        {inv.email.slice(0, 1).toUpperCase()}
                      </span>
                      <span className="font-medium text-slate-900">{inv.email}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    <Badge variant={STATUS_VARIANT[inv.status]}>{inv.status}</Badge>
                  </td>
                  <td className="px-5 py-3 text-slate-700">{score ? score.rawTotal : "—"}</td>
                  <td className="px-5 py-3 font-semibold text-indigo-600">
                    {score?.percentile != null ? `${score.percentile}th` : "—"}
                  </td>
                  <td className="px-5 py-3 text-slate-500">
                    {score
                      ? Object.entries(score.rawBySection as Record<string, number>)
                          .map(([, v]) => v)
                          .join(" / ")
                      : "—"}
                  </td>
                  <td className="px-5 py-3">
                    {score?.passed === null || score?.passed === undefined ? (
                      <span className="text-slate-400">—</span>
                    ) : (
                      <Badge variant={score.passed ? "success" : "danger"}>
                        {score.passed ? "Yes" : "No"}
                      </Badge>
                    )}
                  </td>
                  <td className="px-5 py-3 text-slate-700">{tabBlurs}</td>
                </tr>
              );
            })}
            {test.invitations.length === 0 && (
              <tr>
                <td colSpan={7}>
                  <div className="flex flex-col items-center gap-2 px-5 py-10 text-center">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                      <InboxIcon className="h-5 w-5" />
                    </span>
                    <p className="text-sm font-medium text-slate-700">No invitations sent yet</p>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </main>
  );
}
