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
    const phoneAnomalyCount = events.filter((e) => e.type === "OBJECT_PHONE_DETECTED").length;
    const objectAnomalyCount = events.filter((e) =>
      [
        "OBJECT_PHONE_DETECTED",
        "PROHIBITED_BOOK_DETECTED",
        "PROHIBITED_SCREEN_DETECTED",
        "PROHIBITED_AUDIO_DEVICE_DETECTED",
        "PROHIBITED_OBJECT_DETECTED",
        "UNAUTHORIZED_PERSON_DETECTED",
      ].includes(e.type)
    ).length;

    const gazeAnomalyCount = events.filter((e) =>
      [
        "FACE_LOOKING_AWAY",
        "FACE_EXCESSIVE_MOVEMENT",
        "MULTIPLE_FACES_DETECTED",
        "WEBCAM_NO_FACE_DETECTED",
      ].includes(e.type)
    ).length;

    const webcamAnomalyCount = events.filter(
      (e) =>
        e.type.startsWith("WEBCAM_") &&
        e.type !== "WEBCAM_SNAPSHOT" &&
        e.type !== "WEBCAM_VERIFICATION_INITIAL"
    ).length;

    const micAnomalyCount = events.filter((e) => e.type.startsWith("MIC_")).length;
    const totalAnomalies = events.length;

    // Severity factors in object detection, gaze anomalies, webcam + mic anomalies
    const significantAnomalies = events.filter(
      (e) => !["WEBCAM_SNAPSHOT", "WEBCAM_VERIFICATION_INITIAL"].includes(e.type)
    ).length;

    let severity: "HIGH" | "MEDIUM" | "CLEAN" = "CLEAN";
    if (objectAnomalyCount > 0 || significantAnomalies > 3) severity = "HIGH";
    else if (significantAnomalies > 0) severity = "MEDIUM";

    return {
      invitationId: inv.id,
      email: inv.email,
      status: inv.status,
      attemptId: inv.attempt?.id ?? null,
      tabBlurCount,
      pasteCount,
      phoneAnomalyCount,
      objectAnomalyCount,
      gazeAnomalyCount,
      webcamAnomalyCount,
      micAnomalyCount,
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
    <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
      <TestResultsNav testId={test.id} testName={test.name} />
      <ProctoringPortal attempts={attemptsData} />
    </main>
  );
}
