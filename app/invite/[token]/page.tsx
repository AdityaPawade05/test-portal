"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  CheckIcon,
  ClockIcon,
  ExternalLinkIcon,
  InboxIcon,
  WarningIcon,
} from "@/components/ui/icons";

type InvitationState =
  | { status: "loading" }
  | { status: "valid"; testName: string; expiresAt: string; timeLimitMins: number | null; organizationName: string }
  | { status: "expired" }
  | { status: "completed"; testName: string }
  | { status: "invalid"; errorMsg?: string };

export default function CandidateInviteLandingPage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const [state, setState] = useState<InvitationState>({ status: "loading" });
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    let active = true;
    async function loadInvitation() {
      try {
        const res = await fetch(`/api/take/${token}`);
        if (!active) return;

        if (res.status === 410) {
          setState({ status: "expired" });
          return;
        }

        if (!res.ok) {
          const body = await res.json().catch(() => null);
          setState({
            status: "invalid",
            errorMsg: typeof body?.error === "string" ? body.error : "Invalid invitation link",
          });
          return;
        }

        const data = await res.json();
        if (data.submitted) {
          setState({ status: "completed", testName: data.testName || "Assessment" });
          return;
        }

        setState({
          status: "valid",
          testName: data.testName || "Assessment",
          expiresAt: data.expiresAt || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          timeLimitMins: data.timeLimitSec ? Math.round(data.timeLimitSec / 60) : null,
          organizationName: data.organizationName || "Assessment Portal",
        });
      } catch {
        if (active) {
          setState({ status: "invalid", errorMsg: "Could not connect to server" });
        }
      }
    }

    loadInvitation();
    return () => {
      active = false;
    };
  }, [token]);

  function handleStartTest() {
    setStarting(true);
    // Redirect to test taking page /take/[token]
    router.push(`/take/${token}`);
  }

  if (state.status === "loading") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <Card className="flex flex-col items-center justify-center p-8 text-center shadow-lg border border-slate-200/80 max-w-md w-full">
          <Spinner className="h-8 w-8 text-indigo-600 mb-4" />
          <h2 className="text-base font-semibold text-slate-800">Verifying Invitation...</h2>
          <p className="text-xs text-slate-500 mt-1">Please wait while we check your assessment link.</p>
        </Card>
      </main>
    );
  }

  if (state.status === "invalid") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <Card className="flex flex-col items-center justify-center p-8 text-center shadow-xl border border-red-200/80 max-w-md w-full bg-white">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-red-50 text-red-600 mb-4">
            <WarningIcon className="h-7 w-7" />
          </div>
          <h1 className="text-xl font-bold text-slate-900">Invalid Invitation</h1>
          <p className="mt-2 text-sm text-slate-600 leading-relaxed">
            {state.errorMsg || "This invitation link is invalid, corrupted, or does not exist."}
          </p>
          <p className="mt-4 text-xs text-slate-400">
            Please check the link provided by your test administrator or request a new invitation.
          </p>
        </Card>
      </main>
    );
  }

  if (state.status === "expired") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <Card className="flex flex-col items-center justify-center p-8 text-center shadow-xl border border-amber-200/80 max-w-md w-full bg-white">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-600 mb-4">
            <ClockIcon className="h-7 w-7" />
          </div>
          <h1 className="text-xl font-bold text-slate-900">Invitation Expired</h1>
          <p className="mt-2 text-sm text-slate-600 leading-relaxed">
            This assessment invitation link has expired and is no longer active.
          </p>
          <p className="mt-4 text-xs text-slate-400">
            Please contact your evaluator or organizer to request a fresh invitation link.
          </p>
        </Card>
      </main>
    );
  }

  if (state.status === "completed") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <Card className="flex flex-col items-center justify-center p-8 text-center shadow-xl border border-emerald-200/80 max-w-md w-full bg-white">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 mb-4">
            <CheckIcon className="h-7 w-7" />
          </div>
          <h1 className="text-xl font-bold text-slate-900">This Test Has Already Been Submitted</h1>
          <p className="mt-2 text-sm text-slate-600 leading-relaxed">
            You have already completed and submitted your response for <strong className="text-slate-800">{state.testName}</strong>.
          </p>
          <div className="mt-6 pt-4 border-t border-slate-100 text-xs text-slate-400">
            Each invitation link can only be used once. Thank you for completing the test!
          </div>
        </Card>
      </main>
    );
  }

  const formattedExpiry = new Date(state.expiresAt).toLocaleDateString(undefined, {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-b from-slate-50 to-slate-100 p-6">
      <Card className="w-full max-w-lg overflow-hidden shadow-2xl border border-slate-200 bg-white rounded-2xl">
        {/* Header Banner */}
        <div className="bg-gradient-to-r from-indigo-600 via-indigo-700 to-indigo-800 p-6 text-white text-center">
          <span className="inline-block bg-white/20 text-white text-[11px] font-bold uppercase tracking-wider px-3 py-1 rounded-full mb-3 backdrop-blur-xs">
            {state.organizationName}
          </span>
          <h1 className="text-2xl font-extrabold tracking-tight">You&apos;re Invited</h1>
          <p className="text-indigo-100 text-xs mt-1">Single-use secure assessment access link</p>
        </div>

        {/* Details Content */}
        <div className="p-6 space-y-6">
          <div className="space-y-1 text-center sm:text-left">
            <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-600 block">Assessment Name</span>
            <h2 className="text-xl font-bold text-slate-900">{state.testName}</h2>
          </div>

          {/* Key Details Card */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200/80 text-xs text-slate-700">
            <div className="flex items-center gap-2">
              <span className="text-base">📅</span>
              <div>
                <span className="font-semibold block text-slate-900">Invitation Expires:</span>
                <span className="text-slate-600">{formattedExpiry}</span>
              </div>
            </div>
            {state.timeLimitMins && (
              <div className="flex items-center gap-2">
                <span className="text-base">⏱️</span>
                <div>
                  <span className="font-semibold block text-slate-900">Time Limit:</span>
                  <span className="text-slate-600">{state.timeLimitMins} Minutes</span>
                </div>
              </div>
            )}
          </div>

          {/* Instructions Box */}
          <div className="bg-amber-50/70 border border-amber-200/80 rounded-xl p-4 text-xs text-amber-900 space-y-1.5">
            <p className="font-bold flex items-center gap-1.5">
              <WarningIcon className="h-4 w-4 text-amber-600 shrink-0" />
              Before starting:
            </p>
            <ul className="list-disc list-inside space-y-1 text-amber-800 text-[11px] leading-relaxed pl-1">
              <li>Ensure a stable internet connection before launching the test.</li>
              <li>The timer begins as soon as you launch the assessment.</li>
              <li>Do not close or refresh the browser window during your test.</li>
            </ul>
          </div>

          {/* Action CTA */}
          <div className="pt-2">
            <Button
              onClick={handleStartTest}
              disabled={starting}
              className="w-full py-3.5 text-base font-bold bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 text-white shadow-md rounded-xl transition-all"
            >
              {starting ? (
                <>
                  <Spinner className="h-5 w-5 text-white mr-2" />
                  Starting Assessment...
                </>
              ) : (
                <>
                  Start Test
                  <ExternalLinkIcon className="h-4 w-4 ml-2" />
                </>
              )}
            </Button>
          </div>

          <p className="text-[11px] text-center text-slate-400">
            Powered securely by Assessment Portal
          </p>
        </div>
      </Card>
    </main>
  );
}
