import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";
import { PrismaClient } from "../lib/generated/prisma/client";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const db = new PrismaClient({ adapter });

const CAPITALS: [string, string][] = [
  ["France", "Paris"],
  ["Japan", "Tokyo"],
  ["Egypt", "Cairo"],
  ["Australia", "Canberra"],
  ["Canada", "Ottawa"],
  ["Brazil", "Brasília"],
  ["Germany", "Berlin"],
  ["India", "New Delhi"],
  ["Italy", "Rome"],
  ["Spain", "Madrid"],
];

const ARITHMETIC: [string, string][] = [
  ["12 + 15 = ?", "27"],
  ["9 × 7 = ?", "63"],
  ["144 ÷ 12 = ?", "12"],
  ["17 − 8 = ?", "9"],
  ["6² = ?", "36"],
  ["100 − 37 = ?", "63"],
  ["8 × 11 = ?", "88"],
  ["50% of 80 = ?", "40"],
  ["13 + 29 = ?", "42"],
  ["7 × 6 = ?", "42"],
];

async function main() {
  const org = await db.organization.upsert({
    where: { id: "demo-org" },
    update: {},
    create: { id: "demo-org", name: "Ailexity Demo" },
  });

  const passwordHash = await bcrypt.hash("password123", 10);
  await db.user.upsert({
    where: { email: "admin@example.com" },
    update: {},
    create: {
      email: "admin@example.com",
      passwordHash,
      role: "OWNER",
      organizationId: org.id,
    },
  });

  const bank = await db.questionBank.create({
    data: { name: "General Aptitude", organizationId: org.id },
  });

  const geographyIds: string[] = [];
  for (const [prompt, answer] of CAPITALS) {
    const wrongPool = CAPITALS.map(([, c]) => c).filter((c) => c !== answer);
    const distractors = wrongPool.sort(() => Math.random() - 0.5).slice(0, 3);
    const options = [answer, ...distractors].sort(() => Math.random() - 0.5);

    const q = await db.question.create({
      data: {
        bankId: bank.id,
        type: "MCQ_SINGLE",
        stem: `What is the capital of ${prompt}?`,
        tags: ["geography"],
        options: {
          create: options.map((label, i) => ({
            label,
            isCorrect: label === answer,
            order: i,
          })),
        },
      },
    });
    geographyIds.push(q.id);
  }

  const arithmeticIds: string[] = [];
  for (const [prompt, answer] of ARITHMETIC) {
    const answerNum = Number(answer);
    const distractors = new Set<number>();
    while (distractors.size < 3) {
      const delta = Math.floor(Math.random() * 10) - 5;
      const candidate = answerNum + (delta === 0 ? 1 : delta);
      if (candidate !== answerNum) distractors.add(candidate);
    }
    const options = [answerNum, ...distractors].sort(() => Math.random() - 0.5);

    const q = await db.question.create({
      data: {
        bankId: bank.id,
        type: "MCQ_SINGLE",
        stem: prompt,
        tags: ["arithmetic"],
        options: {
          create: options.map((n, i) => ({
            label: String(n),
            isCorrect: n === answerNum,
            order: i,
          })),
        },
      },
    });
    arithmeticIds.push(q.id);
  }

  const test = await db.test.create({
    data: {
      name: "Aptitude Screening",
      organizationId: org.id,
      published: true,
      cutoffPercent: 50,
      sections: {
        create: [
          {
            name: "Geography",
            order: 0,
            timeLimitSec: 300,
            questionCount: geographyIds.length,
            poolStrategy: "FIXED",
            questionIds: geographyIds,
          },
          {
            name: "Arithmetic",
            order: 1,
            timeLimitSec: 300,
            questionCount: arithmeticIds.length,
            poolStrategy: "FIXED",
            questionIds: arithmeticIds,
          },
        ],
      },
    },
  });

  const token = "demo-token";
  await db.invitation.upsert({
    where: { token },
    update: {},
    create: {
      testId: test.id,
      email: "candidate@example.com",
      token,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
  });

  console.log("Seeded demo data.");
  console.log("  Admin login:      admin@example.com / password123");
  console.log(`  Candidate link:   /take/${token}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
