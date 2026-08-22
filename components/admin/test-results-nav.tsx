"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronLeftIcon } from "@/components/ui/icons";

export function TestResultsNav({
  testId,
  testName,
}: {
  testId: string;
  testName: string;
}) {
  const pathname = usePathname();

  const tabs = [
    { label: "Candidate Results", href: `/tests/${testId}/results` },
    { label: "Analytics Dashboard", href: `/tests/${testId}/analytics` },
    { label: "Proctoring Review", href: `/tests/${testId}/proctoring` },
  ];

  return (
    <header className="mb-6">
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-1 text-sm text-slate-500 transition-colors hover:text-slate-700"
      >
        <ChevronLeftIcon className="h-4 w-4" />
        Dashboard
      </Link>
      <div className="mt-2 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">{testName}</h1>
          <p className="mt-0.5 text-xs text-slate-500">
            Screening-grade evaluation & behavioral integrity metrics
          </p>
        </div>
      </div>

      <nav className="mt-6 flex border-b border-slate-200 gap-6">
        {tabs.map((tab) => {
          const isActive = pathname === tab.href;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`pb-3 text-sm font-medium transition-colors border-b-2 -mb-px ${
                isActive
                  ? "border-indigo-600 text-indigo-600"
                  : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
