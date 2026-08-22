import type { NextAuthConfig } from "next-auth";

// Edge-safe subset of the auth config — no providers (those touch Prisma,
// which can't run in the Edge runtime). Used directly by proxy.ts;
// lib/auth.ts extends this with the real Credentials providers for use in
// route handlers and server components (Node runtime).
export const authConfig: NextAuthConfig = {
  secret: process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || "dev-only-secret-change-me",
  basePath: "/api/auth",
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.kind = user.kind;
        token.role = user.role;
        token.organizationId = user.organizationId;
      }
      return token;
    },
    session({ session, token }) {
      if (token.kind === "admin") {
        session.user = {
          ...session.user,
          id: token.sub!,
          kind: "admin",
          role: token.role as string,
          organizationId: token.organizationId as string,
        };
      } else {
        session.user = {
          ...session.user,
          id: token.sub!,
          kind: "candidate",
        };
      }
      return session;
    },
  },
};
