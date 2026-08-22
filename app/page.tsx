import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-slate-50 p-8 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-600 text-2xl font-bold text-white shadow-sm">
        A
      </span>
      <div>
        <h1 className="text-3xl font-semibold text-slate-900">Assessment Portal</h1>
        <p className="mt-2 max-w-md text-slate-500">
          Screening-grade skills &amp; psychometric test delivery. Build tests, invite
          candidates, and review results — all under strict server-enforced timing.
        </p>
      </div>
      <Link href="/login" className={buttonVariants({ size: "md" })}>
        Admin sign in
      </Link>
    </main>
  );
}
