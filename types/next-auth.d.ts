import { DefaultSession } from "next-auth";

type AdminSessionUser = {
  kind: "admin";
  role: string;
  organizationId: string;
};

type CandidateSessionUser = {
  kind: "candidate";
};

declare module "next-auth" {
  interface User {
    kind: "admin" | "candidate";
    role?: string;
    organizationId?: string;
  }

  interface Session {
    user: (AdminSessionUser | CandidateSessionUser) & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    kind?: "admin" | "candidate";
    role?: string;
    organizationId?: string;
  }
}
