import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { TestResultsNav } from "@/components/admin/test-results-nav";
import { ProctoringPortal } from "@/components/admin/proctoring-portal";

export default async function TestProctoringPage({
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
        include: {
          attempt: {
            include: {
              events: {
                orderBy: { occurredAt: "asc" },
              },
            },
          },
        },
      },
    },
  });

  if (!test) notFound();

  const attemptsData = test.invitations.map((inv) => {
    const events = inv.attempt?.events ?? [];
    const tabBlurCount = events.filter((e) => e.type === "TAB_BLUR").length;
    const pasteCount = events.filter((e) => e.type === "PASTE").length;
    const totalAnomalies = events.length;

    let severity: "HIGH" | "MEDIUM" | "CLEAN" = "CLEAN";
    if (totalAnomalies > 3) severity = "HIGH";
    else if (totalAnomalies > 0) severity = "MEDIUM";

    return {
      invitationId: inv.id,
      email: inv.email,
      status: inv.status,
      attemptId: inv.attempt?.id ?? null,
      tabBlurCount,
      pasteCount,
      anomalyCount: totalAnomalies,
      severity,
      events: events.map((e) => ({
        id: e.id,
        type: e.type,
        payload: e.payload,
        occurredAt: e.occurredAt.toISOString(),
      })),
    };
  });

  return (
    <main className="mx-auto max-w-4xl px-6 py-10 sm:px-8">
      <TestResultsNav testId={test.id} testName={test.name} />
      <ProctoringPortal attempts={attemptsData} />
    </main>
  );
}
