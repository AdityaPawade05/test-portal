"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { CopyButton } from "@/components/ui/copy-button";
import { EmptyState } from "@/components/ui/empty-state";
import {
  CheckIcon,
  ClockIcon,
  ExternalLinkIcon,
  InboxIcon,
  PencilIcon,
  WarningIcon,
} from "@/components/ui/icons";

type PublishedTest = {
  id: string;
  name: string;
};

type InvitationItem = {
  id: string;
  email: string;
  candidateName?: string | null;
  testId: string;
  testName: string;
  token: string;
  inviteUrl: string;
  takeUrl: string;
  status: "Pending" | "Completed" | "Expired" | "In Progress" | string;
  rawStatus: string;
  expiresAt: string;
  createdAt: string;
};

export function InvitationsManager({
  publishedTests,
}: {
  publishedTests: PublishedTest[];
}) {
  const [selectedTestId, setSelectedTestId] = useState<string>(
    publishedTests[0]?.id || ""
  );
  const [email, setEmail] = useState("");
  const [candidateName, setCandidateName] = useState("");
  const [expiryOption, setExpiryOption] = useState<string>("48"); // 48 hours default
  const [customNote, setCustomNote] = useState("");
  const [showCustomNote, setShowCustomNote] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Invitations table state
  const [invitations, setInvitations] = useState<InvitationItem[]>([]);
  const [loadingInvitations, setLoadingInvitations] = useState(true);
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function loadInvitations() {
    setLoadingInvitations(true);
    try {
      const res = await fetch("/api/invitations");
      if (res.ok) {
        const data = await res.json();
        setInvitations(data.invitations || []);
      }
    } catch {
      // best effort
    } finally {
      setLoadingInvitations(false);
    }
  }

  useEffect(() => {
    loadInvitations();
  }, []);

  async function handleSendInvite(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);

    if (!selectedTestId) {
      setError("Please select a test.");
      return;
    }

    if (!email.trim()) {
      setError("Please enter a candidate email address.");
      return;
    }

    setSubmitting(true);

    try {
      const hours = Number(expiryOption);
      const res = await fetch("/api/invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          testId: selectedTestId,
          email: email.trim(),
          candidateName: candidateName.trim() || undefined,
          expiresInHours: hours,
          customNote: customNote.trim() || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to send invitation.");
        setSubmitting(false);
        return;
      }

      setSuccessMessage(
        data.message || `Invitation sent successfully to ${email.trim()}`
      );
      setEmail("");
      setCandidateName("");
      setCustomNote("");
      setShowCustomNote(false);
      await loadInvitations();
    } catch {
      setError("Could not connect to server to send invitation.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResend(id: string, inviteEmail: string) {
    setResendingId(id);
    try {
      const res = await fetch(`/api/invitations/${id}/resend`, {
        method: "POST",
      });
      if (res.ok) {
        setSuccessMessage(`Invitation resent successfully to ${inviteEmail}`);
        await loadInvitations();
      } else {
        const data = await res.json().catch(() => null);
        alert(data?.error || `Failed to resend email to ${inviteEmail}`);
      }
    } catch {
      alert(`Error resending email to ${inviteEmail}`);
    } finally {
      setResendingId(null);
    }
  }

  async function handleDelete(id: string, inviteEmail: string) {
    if (!confirm(`Are you sure you want to delete the invitation for ${inviteEmail}?`)) {
      return;
    }
    setDeletingId(id);
    try {
      const res = await fetch(`/api/invitations/${id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setSuccessMessage(`Invitation for ${inviteEmail} deleted.`);
        await loadInvitations();
      } else {
        const data = await res.json().catch(() => null);
        alert(data?.error || `Failed to delete invitation.`);
      }
    } catch {
      alert(`Error deleting invitation.`);
    } finally {
      setDeletingId(null);
    }
  }

  function renderStatusBadge(status: string) {
    switch (status) {
      case "Completed":
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 border border-emerald-200">
            <CheckIcon className="h-3 w-3" /> Completed
          </span>
        );
      case "Expired":
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-500 border border-slate-200">
            <ClockIcon className="h-3 w-3" /> Expired
          </span>
        );
      case "In Progress":
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700 border border-amber-200">
            <ClockIcon className="h-3 w-3 text-amber-600" /> In Progress
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-semibold text-indigo-700 border border-indigo-200">
            <InboxIcon className="h-3 w-3" /> Pending
          </span>
        );
    }
  }

  return (
    <div className="space-y-8">
      {/* Invite Candidate Form Card */}
      <Card className="p-6 shadow-sm border border-slate-200">
        <div className="border-b border-slate-100 pb-4 mb-5">
          <h3 className="text-lg font-bold text-slate-900">Invite Candidate</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Send an assessment invitation email with a secure, single-use access link.
          </p>
        </div>

        {publishedTests.length === 0 ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-800 flex items-center gap-2">
            <WarningIcon className="h-4 w-4 shrink-0 text-amber-600" />
            <span>
              You do not have any published tests yet. Please publish a test in the Test Builder before inviting candidates.
            </span>
          </div>
        ) : (
          <form onSubmit={handleSendInvite} className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Candidate Email */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700">
                  Candidate Email <span className="text-red-500">*</span>
                </label>
                <Input
                  type="email"
                  placeholder="candidate@gmail.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="bg-white text-xs"
                  required
                />
              </div>

              {/* Select Test Dropdown */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700">
                  Select Test <span className="text-red-500">*</span>
                </label>
                <Select
                  value={selectedTestId}
                  onChange={(e) => setSelectedTestId(e.target.value)}
                  className="bg-white text-xs"
                  required
                >
                  {publishedTests.map((test) => (
                    <option key={test.id} value={test.id}>
                      {test.name}
                    </option>
                  ))}
                </Select>
              </div>

              {/* Candidate Name (Optional) */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700">
                  Candidate Name (Optional)
                </label>
                <Input
                  type="text"
                  placeholder="e.g. John Smith"
                  value={candidateName}
                  onChange={(e) => setCandidateName(e.target.value)}
                  className="bg-white text-xs"
                />
              </div>

              {/* Expiry Options Dropdown */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700">
                  Invitation Expiry <span className="text-red-500">*</span>
                </label>
                <Select
                  value={expiryOption}
                  onChange={(e) => setExpiryOption(e.target.value)}
                  className="bg-white text-xs"
                >
                  <option value="24">24 Hours (1 Day)</option>
                  <option value="48">48 Hours (2 Days)</option>
                  <option value="168">7 Days (1 Week)</option>
                  <option value="336">14 Days (Default)</option>
                </Select>
              </div>
            </div>

            {/* Custom Message Toggle */}
            <div>
              <button
                type="button"
                onClick={() => setShowCustomNote(!showCustomNote)}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-700 py-1"
              >
                <PencilIcon className="h-3.5 w-3.5" />
                {showCustomNote ? "Hide custom message" : "+ Add custom message / instructions"}
              </button>

              {showCustomNote && (
                <div className="mt-2 space-y-1 pt-2 border-t border-slate-100">
                  <label className="text-xs font-semibold text-slate-700">
                    Custom Message from Evaluator (Optional)
                  </label>
                  <Textarea
                    rows={2}
                    placeholder="e.g. Good luck on your technical screening test! Please complete this before Friday."
                    value={customNote}
                    onChange={(e) => setCustomNote(e.target.value)}
                    className="bg-white text-xs"
                  />
                </div>
              )}
            </div>

            {/* Success Message Banner */}
            {successMessage && (
              <div className="flex items-center gap-2 rounded-xl bg-emerald-50 p-3 text-xs font-medium text-emerald-800 border border-emerald-200">
                <CheckIcon className="h-4 w-4 shrink-0 text-emerald-600" />
                <span>{successMessage}</span>
              </div>
            )}

            {/* Error Banner */}
            {error && (
              <div className="flex items-center gap-2 rounded-xl bg-red-50 p-3 text-xs font-medium text-red-800 border border-red-200">
                <WarningIcon className="h-4 w-4 shrink-0 text-red-600" />
                <span>{error}</span>
              </div>
            )}

            {/* Submit Button */}
            <div className="pt-2">
              <Button type="submit" disabled={submitting}>
                {submitting && <Spinner className="h-4 w-4 text-white mr-2" />}
                {submitting ? "Sending Invitation..." : "Send Invitation"}
              </Button>
            </div>
          </form>
        )}
      </Card>

      {/* Invitations Table Section */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-slate-900">Sent Invitations</h3>
            <p className="text-xs text-slate-500">
              Track, resend, or delete test invitations for candidates.
            </p>
          </div>
          <Button variant="secondary" size="sm" onClick={loadInvitations} className="text-xs">
            Refresh List
          </Button>
        </div>

        <Card className="overflow-hidden border border-slate-200">
          {loadingInvitations ? (
            <div className="flex items-center justify-center p-12 text-slate-500">
              <Spinner className="h-6 w-6 text-indigo-600 mr-2" />
              <span className="text-xs font-medium">Loading invitations...</span>
            </div>
          ) : invitations.length === 0 ? (
            <EmptyState
              icon={<InboxIcon className="h-6 w-6" />}
              title="No invitations yet"
              description="Send an invitation above to get started."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-700">
                <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3">Candidate Email</th>
                    <th className="px-4 py-3">Test Name</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Sent Date</th>
                    <th className="px-4 py-3">Expiry Date</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {invitations.map((inv) => (
                    <tr key={inv.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-4 py-3 font-medium text-slate-900">
                        <div>
                          {inv.candidateName && (
                            <span className="block font-bold text-slate-900">{inv.candidateName}</span>
                          )}
                          <span className={inv.candidateName ? "text-slate-500 text-[11px]" : "font-semibold text-slate-800"}>
                            {inv.email}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-800 font-medium">{inv.testName}</td>
                      <td className="px-4 py-3">{renderStatusBadge(inv.status)}</td>
                      <td className="px-4 py-3 text-slate-500">
                        {new Date(inv.createdAt).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </td>
                      <td className="px-4 py-3 text-slate-500">
                        {new Date(inv.expiresAt).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </td>
                      <td className="px-4 py-3 text-right space-x-2">
                        {inv.status !== "Completed" && (
                          <button
                            type="button"
                            disabled={resendingId === inv.id}
                            onClick={() => handleResend(inv.id, inv.email)}
                            className="inline-flex items-center text-xs font-semibold text-indigo-600 hover:text-indigo-800 disabled:opacity-50"
                          >
                            {resendingId === inv.id ? "Resending..." : "Resend"}
                          </button>
                        )}
                        <CopyButton value={inv.inviteUrl} />
                        {inv.status !== "Completed" && (
                          <button
                            type="button"
                            disabled={deletingId === inv.id}
                            onClick={() => handleDelete(inv.id, inv.email)}
                            className="inline-flex items-center text-xs font-semibold text-red-600 hover:text-red-800 disabled:opacity-50 ml-1"
                          >
                            {deletingId === inv.id ? "Deleting..." : "Delete"}
                          </button>
                        )}
                        <a
                          href={inv.inviteUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center text-xs font-semibold text-slate-600 hover:text-indigo-600 ml-1"
                        >
                          <ExternalLinkIcon className="h-3 w-3" />
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </section>
    </div>
  );
}
