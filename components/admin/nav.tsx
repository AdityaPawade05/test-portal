"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { buttonVariants } from "@/components/ui/button";

export function AdminNav() {
  const { data: session } = useSession();
  const pathname = usePathname();

  const isDashboard = pathname === "/dashboard";
  const isInvitations = pathname === "/invitations";

  return (
    <nav className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8 py-3.5">
        <div className="flex items-center gap-6">
          <Link href="/dashboard" className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-sm font-bold text-white">
              A
            </span>
            <span className="font-semibold text-slate-900">Assessment Portal</span>
          </Link>

          <div className="flex items-center gap-1 text-xs font-semibold">
            <Link
              href="/dashboard"
              className={`px-3 py-1.5 rounded-lg transition-colors ${
                isDashboard
                  ? "bg-indigo-50 text-indigo-700 font-bold"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              Dashboard
            </Link>
            <Link
              href="/invitations"
              className={`px-3 py-1.5 rounded-lg transition-colors ${
                isInvitations
                  ? "bg-indigo-50 text-indigo-700 font-bold"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              Invitations
            </Link>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {session?.user?.email && (
            <span className="hidden text-sm text-slate-500 sm:inline">
              {session.user.email}
            </span>
          )}
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className={buttonVariants({ variant: "ghost", size: "sm" })}
          >
            Sign out
          </button>
        </div>
      </div>
    </nav>
  );
}
