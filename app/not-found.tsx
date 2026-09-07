import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-slate-50 to-slate-100 p-6 text-center">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-xl">
        <span className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-50 text-3xl font-extrabold text-indigo-600 shadow-sm mb-4">
          404
        </span>

        <h1 className="text-2xl font-bold text-slate-900">Page not found</h1>
        <p className="mt-2 text-sm text-slate-500 leading-relaxed">
          The page you are looking for doesn&apos;t exist, has been moved, or the link may be invalid.
        </p>

        <div className="mt-6 flex flex-col gap-2.5">
          <Link
            href="/dashboard"
            className={buttonVariants({
              size: "md",
              className: "w-full justify-center bg-indigo-600 hover:bg-indigo-700 text-white font-medium shadow-sm",
            })}
          >
            Go to Admin Dashboard
          </Link>
          <Link
            href="/candidate/dashboard"
            className={buttonVariants({
              variant: "secondary",
              size: "md",
              className: "w-full justify-center bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium",
            })}
          >
            Go to Candidate Portal
          </Link>
          <Link
            href="/"
            className={buttonVariants({
              variant: "ghost",
              size: "sm",
              className: "w-full justify-center text-slate-500 hover:text-slate-700 text-xs",
            })}
          >
            Return to Home Page
          </Link>
        </div>

        <div className="mt-6 border-t border-slate-100 pt-4 text-xs text-slate-400">
          If you are looking for a test invitation link, please check the email sent by your evaluator.
        </div>
      </div>
    </main>
  );
}

