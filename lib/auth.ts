import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { authConfig } from "@/lib/auth.config";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      id: "credentials",
      name: "Admin",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      authorize: async (credentials) => {
        const email = typeof credentials?.email === "string" ? credentials.email.trim().toLowerCase() : "";
        const password = typeof credentials?.password === "string" ? credentials.password : "";
        if (!email || !password) return null;

        let user = await db.user.findUnique({ where: { email } });

        // Auto-create demo admin if missing
        if (!user && email === "admin@example.com" && password === "password123") {
          try {
            let org = await db.organization.findFirst({ where: { id: "demo-org" } });
            if (!org) {
              org = await db.organization.create({ data: { id: "demo-org", name: "Ailexity Demo" } });
            }
            const passwordHash = await bcrypt.hash("password123", 10);
            user = await db.user.create({
              data: {
                email: "admin@example.com",
                passwordHash,
                role: "OWNER",
                organizationId: org.id,
              },
            });
          } catch (err) {
            console.error("Auto-creation of demo admin failed:", err);
          }
        }

        if (!user) return null;

        let valid = await bcrypt.compare(password, user.passwordHash);

        // Auto-fix password hash for demo admin if out of sync
        if (!valid && email === "admin@example.com" && password === "password123") {
          try {
            const passwordHash = await bcrypt.hash("password123", 10);
            user = await db.user.update({
              where: { id: user.id },
              data: { passwordHash },
            });
            valid = true;
          } catch (err) {
            console.error("Auto-fix demo admin password failed:", err);
          }
        }

        if (!valid) return null;

        return {
          id: user.id,
          email: user.email,
          kind: "admin",
          role: user.role,
          organizationId: user.organizationId,
        };
      },
    }),
    Credentials({
      id: "candidate",
      name: "Candidate",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      authorize: async (credentials) => {
        const email = credentials?.email;
        const password = credentials?.password;
        if (typeof email !== "string" || typeof password !== "string") {
          return null;
        }

        const candidate = await db.candidate.findUnique({ where: { email } });
        if (!candidate) return null;

        const valid = await bcrypt.compare(password, candidate.passwordHash);
        if (!valid) return null;

        return {
          id: candidate.id,
          email: candidate.email,
          name: candidate.name,
          kind: "candidate",
        };
      },
    }),
  ],
});
