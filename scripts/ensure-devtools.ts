import { execSync, spawn } from "child_process";
import net from "net";
import path from "path";
import fs from "fs";

export function isPortOpen(port: number, host = "127.0.0.1"): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(1000);
    socket.on("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.on("timeout", () => {
      socket.destroy();
      resolve(false);
    });
    socket.on("error", () => {
      socket.destroy();
      resolve(false);
    });
    socket.connect(port, host);
  });
}

export async function waitForPort(port: number, timeoutMs = 10000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await isPortOpen(port)) return true;
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

export async function ensureDevtools(verbose = true): Promise<void> {
  const rootDir = process.cwd();

  // 1. PostgreSQL (Port 5433)
  const pgOpen = await isPortOpen(5433);
  if (pgOpen) {
    if (verbose) console.log("✅ PostgreSQL is running on port 5433");
  } else {
    if (verbose) console.log("⚡ Starting local PostgreSQL on port 5433...");
    const pgBin = path.join(rootDir, ".devtools", "postgres", "bin", "pg_ctl.exe");
    const pgData = path.join(rootDir, ".devtools", "pgdata");
    const pgLog = path.join(rootDir, ".devtools", "pglogs", "postgres.log");
    const pidFile = path.join(pgData, "postmaster.pid");

    if (fs.existsSync(pidFile)) {
      try {
        fs.unlinkSync(pidFile);
        if (verbose) console.log("  Removed stale postmaster.pid");
      } catch (e) {}
    }

    if (fs.existsSync(pgBin)) {
      try {
        execSync(`"${pgBin}" -D "${pgData}" -l "${pgLog}" start`, { stdio: "ignore" });
      } catch (err) {
        // Fallback: spawn detached
        const child = spawn(pgBin, ["-D", pgData, "-l", pgLog, "start"], {
          cwd: rootDir,
          detached: true,
          stdio: "ignore",
        });
        child.unref();
      }
      const ready = await waitForPort(5433, 10000);
      if (ready) {
        if (verbose) console.log("✅ PostgreSQL started successfully");
      } else if (verbose) {
        console.warn("⚠️ PostgreSQL port 5433 not ready after 10s");
      }
    } else if (verbose) {
      console.warn("⚠️ Local PostgreSQL binary not found at:", pgBin);
    }
  }

  // 2. Redis (Port 6379)
  const redisOpen = await isPortOpen(6379);
  if (redisOpen) {
    if (verbose) console.log("✅ Redis is running on port 6379");
  } else {
    if (verbose) console.log("⚡ Starting local Redis on port 6379...");
    const redisDir = path.join(rootDir, ".devtools", "redis", "Redis-8.8.0-Windows-x64-msys2");
    const redisBin = path.join(redisDir, "redis-server.exe");

    if (fs.existsSync(redisBin)) {
      const child = spawn(redisBin, [], {
        cwd: redisDir,
        detached: true,
        stdio: "ignore",
      });
      child.unref();

      const ready = await waitForPort(6379, 5000);
      if (ready) {
        if (verbose) console.log("✅ Redis started successfully");
      } else if (verbose) {
        console.warn("⚠️ Redis port 6379 not ready after 5s");
      }
    } else if (verbose) {
      console.warn("⚠️ Local Redis binary not found at:", redisBin);
    }
  }
}

async function runStandalone() {
  await ensureDevtools(true);

  // 3. Ensure DB seed if needed
  try {
    const { PrismaPg } = await import("@prisma/adapter-pg");
    const { PrismaClient } = await import("../lib/generated/prisma/client");
    const adapter = new PrismaPg({
      connectionString:
        process.env.DATABASE_URL ||
        "postgresql://postgres@127.0.0.1:5433/assessment_portal?schema=public",
    });
    const db = new PrismaClient({ adapter });
    const user = await db.user.findFirst({ where: { email: "admin@example.com" } });
    if (!user) {
      console.log("🌱 Database missing demo admin user, running seed...");
      execSync("npx tsx prisma/seed.ts", { stdio: "inherit" });
    }
    await db.$disconnect();
  } catch (err) {
    console.warn("⚠️ Database check/seed warning:", (err as Error).message);
  }
}

if (require.main === module) {
  runStandalone().catch(console.error);
}
