import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { CheckIcon, ClockIcon, ExternalLinkIcon, InboxIcon, WarningIcon } from "@/components/ui/icons";
import { MarkInvitationsViewed } from "@/components/candidate/mark-viewed";

const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;

function statusInfo(status: string, isExpired: boolean) {
  if (isExpired) return { label: "Expired", icon: WarningIcon, className: "text-slate-400" };
  if (status === "SUBMITTED") return { label: "Completed", icon: CheckIcon, className: "text-emerald-600" };
  if (status === "STARTED") return { label: "In progress", icon: ClockIcon, className: "text-amber-600" };
  return { label: "Not started", icon: InboxIcon, className: "text-indigo-600" };
}

export default async function CandidateDashboardPage() {
  const session = await auth();
  const email = session!.user.email!;

  const invitations = await db.invitation.findMany({
    where: { email },
    include: { test: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
  });

  const newInvitationIds = invitations.filter((inv) => inv.viewedAt === null).map((inv) => inv.id);
  const now = new Date();

  return (
    <main className="mx-auto max-w-3xl px-6 py-10 sm:px-8">
      <MarkInvitationsViewed ids={newInvitationIds} />
      <h1 className="text-2xl font-semibold text-slate-900">Your invitations</h1>
      <p className="mt-1 text-sm text-slate-500">Tests you&apos;ve been invited to take.</p>

      {newInvitationIds.length > 0 && (
        <div className="mt-6 flex items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm font-medium text-indigo-700">
          <InboxIcon className="h-4 w-4 shrink-0" />
          {`You have ${newInvitationIds.length} new test invitation${newInvitationIds.length === 1 ? "" : "s"}.`}
        </div>
      )}

      <Card className="mt-6 divide-y divide-slate-100">
        {invitations.length === 0 && (
          <EmptyState
            icon={<InboxIcon className="h-5 w-5" />}
            title="No invitations yet"
            description="When you're invited to take a test, it'll show up here."
          />
        )}
        {invitations.map((inv) => {
          const isNew = newInvitationIds.includes(inv.id);
          const isExpired = inv.status === "EXPIRED" || inv.expiresAt < now;
          const canStart = !isExpired && inv.status !== "SUBMITTED";
          const status = statusInfo(inv.status, isExpired);

          // "Expires soon" if active and expiring within 3 days
          const msUntilExpiry = inv.expiresAt.getTime() - now.getTime();
          const isExpiringSoon = !isExpired && inv.status !== "SUBMITTED" && msUntilExpiry > 0 && msUntilExpiry <= THREE_DAYS_MS;

          return (
            <div key={inv.id} className="flex items-center justify-between gap-3 px-5 py-4">
              <div className="min-w-0">
                <p className="flex items-center gap-2 truncate font-medium text-slate-800">
                  {inv.test.name}
                  {isNew && (
                    <span className="shrink-0 rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700">
                      New
                    </span>
                  )}
                </p>
                <p className={`mt-0.5 flex items-center gap-1.5 flex-wrap text-xs ${status.className}`}>
                  <span className="flex items-center gap-1">
                    <status.icon className="h-3.5 w-3.5" />
                    {status.label}
                  </span>
                  <span className="text-slate-400">
                    · Expires {inv.expiresAt.toLocaleDateString()}
                  </span>
                  {isExpiringSoon && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700 border border-amber-200">
                      <WarningIcon className="h-3 w-3" />
                      Expires soon
                    </span>
                  )}
                </p>
              </div>
              {canStart && (
                <a
                  href={`/take/${inv.token}`}
                  className={buttonVariants({ variant: "primary", size: "sm", className: "shrink-0" })}
                >
                  {inv.status === "STARTED" ? "Continue" : "Start"}
                  <ExternalLinkIcon className="h-3.5 w-3.5" />
                </a>
              )}
              {inv.status === "SUBMITTED" && (
                <a
                  href={`/api/take/${inv.token}/certificate`}
                  download
                  className={buttonVariants({ variant: "secondary", size: "sm", className: "shrink-0 gap-1.5" })}
                >
                  <span>📄</span> Certificate (PDF)
                </a>
              )}
            </div>
          );
        })}
      </Card>
    </main>
  );
}
