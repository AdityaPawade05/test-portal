import { CandidateNav } from "@/components/candidate/nav";

export default function CandidateDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <CandidateNav />
      <div className="flex-1">{children}</div>
    </div>
  );
}
