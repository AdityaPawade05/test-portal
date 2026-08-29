import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-slate-50 p-8 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-50 text-3xl font-bold text-indigo-600 shadow-sm">
        404
      </span>
      <div>
        <h1 className="text-3xl font-semibold text-slate-900">Page not found</h1>
        <p className="mt-2 max-w-md text-sm text-slate-500">
          The page you are looking for doesn&apos;t exist, has been moved, or the link may be invalid.
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Link href="/dashboard" className={buttonVariants({ size: "md" })}>
          Go to Dashboard
        </Link>
        <Link href="/" className={buttonVariants({ variant: "secondary", size: "md" })}>
          Return Home
        </Link>
      </div>
    </main>
  );
}
