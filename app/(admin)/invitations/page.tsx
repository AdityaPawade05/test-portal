import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { InvitationsManager } from "@/components/admin/invitations-manager";

export default async function AdminInvitationsPage() {
  const session = await auth();
  const organizationId = session!.user.organizationId;

  const publishedTests = await db.test.findMany({
    where: { organizationId, published: true },
    select: { id: true, name: true },
    orderBy: { createdAt: "desc" },
  });

  return (
    <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900">Candidate Invitations</h1>
        <p className="mt-1 text-sm text-slate-500">
          Send candidate test invitations and manage access tokens.
        </p>
      </div>

      <InvitationsManager publishedTests={publishedTests} />
    </main>
  );
}
