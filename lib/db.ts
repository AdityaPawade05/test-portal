import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/lib/generated/prisma/client";
import { ensureDevtools } from "@/scripts/ensure-devtools";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const connectionString =
  process.env.DATABASE_URL || "postgresql://postgres@127.0.0.1:5433/assessment_portal?schema=public";

const adapter = new PrismaPg({ connectionString });

export const db = globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;

// Helper to guarantee PostgreSQL & Redis are started if a query is triggered when devtools were closed
export async function ensureDatabaseReady(): Promise<void> {
  try {
    await ensureDevtools(false);
  } catch (err) {
    console.warn("Auto-start devtools check failed:", err);
  }
}
