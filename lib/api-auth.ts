import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import type { Session } from "next-auth";

export type AdminUser = Extract<Session["user"], { kind: "admin" }>;
export type CandidateUser = Extract<Session["user"], { kind: "candidate" }>;

export class ApiAuthError extends Error {
  constructor(public response: NextResponse) {
    super("Unauthorized");
  }
}

const unauthorized = () =>
  new ApiAuthError(NextResponse.json({ error: "Unauthorized" }, { status: 401 }));

// Every admin API route must scope its queries by the caller's
// organizationId — never trust an organizationId in the request body.
export async function requireAdminSession(): Promise<AdminUser> {
  const session = await auth();
  if (!session?.user || session.user.kind !== "admin") {
    throw unauthorized();
  }
  return session.user;
}

export async function requireCandidateSession(): Promise<CandidateUser> {
  const session = await auth();
  if (!session?.user || session.user.kind !== "candidate") {
    throw unauthorized();
  }
  return session.user;
}
