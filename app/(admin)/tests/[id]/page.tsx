import { redirect } from "next/navigation";

export default async function TestIndexPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/tests/${id}/builder`);
}
