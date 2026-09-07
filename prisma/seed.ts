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

  // Add a Coding Question Bank & Questions
  const codingBank = await db.questionBank.create({
    data: { name: "Data Structures & Algorithms", organizationId: org.id },
  });

  const codingQ = await db.question.create({
    data: {
      bankId: codingBank.id,
      type: "CODING",
      stem: "### Problem: Two Sum\nGiven an array of integers `nums` and an integer `target`, return indices of the two numbers such that they add up to `target` as a JSON array `[i, j]`.\n\n**Example 1:**\n- Input: `[[2, 7, 11, 15], 9]`\n- Output: `[0, 1]`",
      starterCode: `function solution(nums, target) {
  const map = new Map();
  for (let i = 0; i < nums.length; i++) {
    const diff = target - nums[i];
    if (map.has(diff)) {
      return [map.get(diff), i];
    }
    map.set(nums[i], i);
  }
  return [];
}`,
      tags: ["algorithms", "dsa", "arrays"],
      testCases: {
        create: [
          {
            input: "[[2,7,11,15], 9]",
            expectedOut: "[0,1]",
            isHidden: false,
            order: 0,
          },
          {
            input: "[[3,2,4], 6]",
            expectedOut: "[1,2]",
            isHidden: false,
            order: 1,
          },
          {
            input: "[[3,3], 6]",
            expectedOut: "[0,1]",
            isHidden: true,
            order: 2,
          },
        ],
      },
    },
  });

  const techTest = await db.test.create({
    data: {
      name: "Google SWE Campus Assessment 2026",
      organizationId: org.id,
      published: true,
      cutoffPercent: 60,
      sections: {
        create: [
          {
            name: "CS & Aptitude Core",
            order: 0,
            timeLimitSec: 300,
            questionCount: Math.min(3, geographyIds.length),
            poolStrategy: "FIXED",
            questionIds: geographyIds.slice(0, 3),
          },
          {
            name: "Hands-on Coding Round",
            order: 1,
            timeLimitSec: 600,
            questionCount: 1,
            poolStrategy: "FIXED",
            questionIds: [codingQ.id],
          },
        ],
      },
    },
  });

  // Create a Demo Placement Drive
  const drive = await db.placementDrive.create({
    data: {
      organizationId: org.id,
      companyName: "Google",
      jobRole: "Software Engineer (SDE-1)",
      ctcPackage: "18.5 LPA",
      driveDate: new Date(Date.now() + 2 * 86400000),
      status: "SCHEDULED",
      eligibilityMinCgpa: 7.5,
      eligibleBranches: ["CSE", "IT", "ECE"],
      accessPasscode: "google-2026",
      testId: techTest.id,
    },
  });

  // Seed sample placement candidates
  const sampleCandidates = [
    { name: "Aarav Sharma", email: "aarav.sharma@college.edu", rollNumber: "2022BCSE001", branch: "CSE", cgpa: 8.95, labSlot: "Lab 1 - 09:00 AM", status: "SHORTLISTED" as const },
    { name: "Priya Patel", email: "priya.patel@college.edu", rollNumber: "2022BIT015", branch: "IT", cgpa: 9.10, labSlot: "Lab 1 - 09:00 AM", status: "SHORTLISTED" as const },
    { name: "Rohan Verma", email: "rohan.verma@college.edu", rollNumber: "2022BECE034", branch: "ECE", cgpa: 7.80, labSlot: "Lab 2 - 11:30 AM", status: "PENDING" as const },
    { name: "Ananya Iyer", email: "ananya.iyer@college.edu", rollNumber: "2022BCSE088", branch: "CSE", cgpa: 8.45, labSlot: "Lab 1 - 09:00 AM", status: "WAITLISTED" as const },
    { name: "Vikram Singh", email: "vikram.singh@college.edu", rollNumber: "2022BME052", branch: "ME", cgpa: 7.10, labSlot: "Lab 2 - 11:30 AM", status: "REJECTED" as const },
  ];

  for (const cand of sampleCandidates) {
    const inv = await db.invitation.create({
      data: {
        testId: techTest.id,
        email: cand.email,
        candidateName: cand.name,
        token: `token-${cand.rollNumber.toLowerCase()}`,
        expiresAt: new Date(Date.now() + 14 * 86400000),
      },
    });

    await db.driveCandidate.create({
      data: {
        driveId: drive.id,
        invitationId: inv.id,
        name: cand.name,
        email: cand.email,
        rollNumber: cand.rollNumber,
        branch: cand.branch,
        cgpa: cand.cgpa,
        passingYear: 2026,
        labSlot: cand.labSlot,
        shortlistDecision: cand.status,
      },
    });
  }

  console.log("Seeded demo data & Placement Drive.");
  console.log("  Admin login:          admin@example.com / password123");
  console.log("  Placement Drives:     /drives");
  console.log("  Recruiter Portal:     /recruiter/" + drive.id + "?passkey=google-2026");
  console.log("  Candidate Demo Test:  /take/token-2022bcse001");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
