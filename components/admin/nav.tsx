"use client";

import Link from "next/link";
import { signOut, useSession } from "next-auth/react";
import { buttonVariants } from "@/components/ui/button";

export function AdminNav() {
  const { data: session } = useSession();

  return (
    <nav className="sticky top-0 z-10 border-b border-slate-200 bg-white/80 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3.5 sm:px-8">
        <Link href="/dashboard" className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-sm font-bold text-white">
            A
          </span>
          <span className="font-semibold text-slate-900">Assessment Portal</span>
        </Link>
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
