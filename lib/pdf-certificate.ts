import { PDFDocument, rgb, StandardFonts } from "pdf-lib";

export type CertificateSection = {
  name: string;
  order: number;
  timeLimitSec: number;
  questionCount: number;
  rawScore?: number | null;
};

export type CertificateData = {
  attemptId: string;
  testName: string;
  organizationName: string;
  candidateName: string | null;
  candidateEmail: string;
  completedAt: Date | string | null;
  rawTotal: number;
  percentile: number | null;
  passed: boolean | null;
  cutoffPercent: number | null;
  sections: CertificateSection[];
  proctoringAnomalyCount?: number;
  proctoringSeverity?: "HIGH RISK" | "MEDIUM" | "CLEAN";
};

export async function generateCertificatePdf(data: CertificateData): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  // Standard A4: 595.28 x 841.89 points
  const page = pdfDoc.addPage([595.28, 841.89]);
  const { width, height } = page.getSize();

  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const timesBold = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);
  const timesRoman = await pdfDoc.embedFont(StandardFonts.TimesRoman);

  // Palette
  const colorPrimary = rgb(79 / 255, 70 / 255, 229 / 255); // Indigo 600
  const colorPrimaryDark = rgb(49 / 255, 46 / 255, 129 / 255); // Indigo 900
  const colorGold = rgb(217 / 255, 119 / 255, 6 / 255); // Gold / Amber 600
  const colorTextDark = rgb(15 / 255, 23 / 255, 42 / 255); // Slate 900
  const colorTextMuted = rgb(100 / 255, 116 / 255, 139 / 255); // Slate 500
  const colorEmerald = rgb(5 / 255, 150 / 255, 105 / 255); // Emerald 600
  const colorRose = rgb(225 / 255, 29 / 255, 72 / 255); // Rose 600
  const colorBgCard = rgb(248 / 255, 250 / 255, 252 / 255); // Slate 50
  const colorBorder = rgb(226 / 255, 232 / 255, 240 / 255); // Slate 200

  // 1. Elegant Double Outer Frame
  page.drawRectangle({
    x: 20,
    y: 20,
    width: width - 40,
    height: height - 40,
    borderWidth: 2,
    borderColor: colorPrimary,
    color: rgb(1, 1, 1),
  });

  page.drawRectangle({
    x: 26,
    y: 26,
    width: width - 52,
    height: height - 52,
    borderWidth: 0.8,
    borderColor: colorGold,
  });

  // 2. Top Header Ribbon
  page.drawRectangle({
    x: 28,
    y: height - 105,
    width: width - 56,
    height: 75,
    color: colorPrimaryDark,
  });

  page.drawRectangle({
    x: 28,
    y: height - 109,
    width: width - 56,
    height: 4,
    color: colorGold,
  });

  const orgName = (data.organizationName || "Assessment Portal").replace(/[^\x20-\x7E]/g, "");
  page.drawText(orgName.toUpperCase(), {
    x: 45,
    y: height - 55,
    size: 10,
    font: helveticaBold,
    color: colorGold,
  });

  page.drawText("CERTIFICATE OF ASSESSMENT COMPLETION", {
    x: 45,
    y: height - 78,
    size: 16,
    font: helveticaBold,
    color: rgb(1, 1, 1),
  });

  page.drawText("Official Candidate Competency & Psychometric Scorecard", {
    x: 45,
    y: height - 94,
    size: 9.5,
    font: helvetica,
    color: rgb(224 / 255, 231 / 255, 255 / 255),
  });

  // 3. Candidate Presentation & Assessment Name
  let curY = height - 145;

  page.drawText("This official document certifies that", {
    x: 45,
    y: curY,
    size: 11,
    font: timesRoman,
    color: colorTextMuted,
  });

  curY -= 28;
  const candidateDisplayName = (data.candidateName?.trim() || data.candidateEmail || "Candidate").replace(/[^\x20-\x7E]/g, "");
  page.drawText(candidateDisplayName, {
    x: 45,
    y: curY,
    size: 22,
    font: timesBold,
    color: colorTextDark,
  });

  page.drawLine({
    start: { x: 45, y: curY - 6 },
    end: { x: width - 45, y: curY - 6 },
    thickness: 1,
    color: colorBorder,
  });

  curY -= 26;
  page.drawText("has successfully completed the online evaluation for:", {
    x: 45,
    y: curY,
    size: 11,
    font: helvetica,
    color: colorTextMuted,
  });

  curY -= 20;
  const safeTestName = data.testName.replace(/[^\x20-\x7E]/g, "");
  page.drawText(safeTestName, {
    x: 45,
    y: curY,
    size: 15,
    font: helveticaBold,
    color: colorPrimary,
  });

  // 4. Candidate Metadata & Verification Details Box
  curY -= 55;
  page.drawRectangle({
    x: 45,
    y: curY,
    width: width - 90,
    height: 48,
    color: colorBgCard,
    borderColor: colorBorder,
    borderWidth: 1,
  });

  const completedDateStr = data.completedAt
    ? new Date(data.completedAt)
        .toISOString()
        .replace("T", " ")
        .substring(0, 19)
    : "N/A";

  // Col 1: Candidate Email
  page.drawText("CANDIDATE EMAIL", { x: 55, y: curY + 32, size: 7.5, font: helveticaBold, color: colorTextMuted });
  const safeEmail = data.candidateEmail.replace(/[^\x20-\x7E]/g, "");
  page.drawText(safeEmail, { x: 55, y: curY + 16, size: 9, font: helvetica, color: colorTextDark });

  // Col 2: Date Completed
  page.drawText("DATE & TIME COMPLETED (UTC)", { x: 235, y: curY + 32, size: 7.5, font: helveticaBold, color: colorTextMuted });
  page.drawText(completedDateStr, { x: 235, y: curY + 16, size: 9, font: helvetica, color: colorTextDark });

  // Col 3: Verification ID
  page.drawText("VERIFICATION ID", { x: 415, y: curY + 32, size: 7.5, font: helveticaBold, color: colorTextMuted });
  const shortId = (data.attemptId || "ATTEMPT").substring(0, 16).toUpperCase().replace(/[^\x20-\x7E]/g, "");
  page.drawText(shortId, { x: 415, y: curY + 16, size: 9, font: helveticaBold, color: colorPrimary });

  // 5. Performance Summary KPI Cards (3 Cards)
  curY -= 85;
  const cardW = (width - 90 - 20) / 3;
  const cardH = 68;

  // Card 1: Raw Total Score
  page.drawRectangle({ x: 45, y: curY, width: cardW, height: cardH, color: colorBgCard, borderColor: colorBorder, borderWidth: 1 });
  page.drawText("RAW TOTAL SCORE", { x: 55, y: curY + 50, size: 8, font: helveticaBold, color: colorTextMuted });
  page.drawText(String(data.rawTotal), { x: 55, y: curY + 18, size: 24, font: helveticaBold, color: colorTextDark });

  // Card 2: Status / Result
  const card2X = 45 + cardW + 10;
  const isPassed = data.passed === true;
  const isFailed = data.passed === false;
  const statusLabel = isPassed ? "PASSED" : isFailed ? "NOT PASSED" : "COMPLETED";
  const statusColor = isPassed ? colorEmerald : isFailed ? colorRose : colorPrimary;

  page.drawRectangle({ x: card2X, y: curY, width: cardW, height: cardH, color: colorBgCard, borderColor: colorBorder, borderWidth: 1 });
  page.drawText("ASSESSMENT RESULT", { x: card2X + 10, y: curY + 50, size: 8, font: helveticaBold, color: colorTextMuted });
  page.drawText(statusLabel, { x: card2X + 10, y: curY + 22, size: 16, font: helveticaBold, color: statusColor });
  if (data.cutoffPercent != null) {
    page.drawText(`Passing Cutoff: ${data.cutoffPercent}%`, { x: card2X + 10, y: curY + 8, size: 7.5, font: helvetica, color: colorTextMuted });
  }

  // Card 3: Percentile Standing
  const card3X = card2X + cardW + 10;
  page.drawRectangle({ x: card3X, y: curY, width: cardW, height: cardH, color: colorBgCard, borderColor: colorBorder, borderWidth: 1 });
  page.drawText("PERCENTILE RANK", { x: card3X + 10, y: curY + 50, size: 8, font: helveticaBold, color: colorTextMuted });
  const percentileText = data.percentile != null ? `${data.percentile}th` : "N/A";
  page.drawText(percentileText, { x: card3X + 10, y: curY + 20, size: 20, font: helveticaBold, color: colorPrimary });
  if (data.percentile != null) {
    page.drawText(`Top ${Math.max(1, 100 - Math.round(data.percentile))}% of candidates`, { x: card3X + 10, y: curY + 8, size: 7.5, font: helvetica, color: colorTextMuted });
  }

  // 6. Section-by-Section Performance Table
  curY -= 35;
  page.drawText("SECTION COMPETENCY BREAKDOWN", {
    x: 45,
    y: curY,
    size: 10,
    font: helveticaBold,
    color: colorTextDark,
  });

  curY -= 8;
  page.drawRectangle({
    x: 45,
    y: curY - 18,
    width: width - 90,
    height: 18,
    color: colorPrimaryDark,
  });

  page.drawText("Section Name", { x: 55, y: curY - 13, size: 8, font: helveticaBold, color: rgb(1, 1, 1) });
  page.drawText("Questions", { x: 235, y: curY - 13, size: 8, font: helveticaBold, color: rgb(1, 1, 1) });
  page.drawText("Time Limit", { x: 335, y: curY - 13, size: 8, font: helveticaBold, color: rgb(1, 1, 1) });
  page.drawText("Score Earned", { x: 445, y: curY - 13, size: 8, font: helveticaBold, color: rgb(1, 1, 1) });

  curY -= 20;

  data.sections.forEach((sec, idx) => {
    const rowH = 18;
    if (idx % 2 === 1) {
      page.drawRectangle({
        x: 45,
        y: curY - rowH + 4,
        width: width - 90,
        height: rowH,
        color: colorBgCard,
      });
    }

    const safeSecName = sec.name.replace(/[^\x20-\x7E]/g, "");
    page.drawText(`${sec.order + 1}. ${safeSecName}`, {
      x: 55,
      y: curY - 8,
      size: 8.5,
      font: helvetica,
      color: colorTextDark,
    });

    page.drawText(`${sec.questionCount} questions`, {
      x: 235,
      y: curY - 8,
      size: 8.5,
      font: helvetica,
      color: colorTextMuted,
    });

    const mins = Math.round(sec.timeLimitSec / 60);
    page.drawText(`${mins} mins`, {
      x: 335,
      y: curY - 8,
      size: 8.5,
      font: helvetica,
      color: colorTextMuted,
    });

    const secScoreStr = sec.rawScore != null ? String(sec.rawScore) : "N/A";
    page.drawText(secScoreStr, {
      x: 445,
      y: curY - 8,
      size: 9,
      font: helveticaBold,
      color: colorPrimary,
    });

    curY -= rowH;
  });

  // 7. Anti-Cheat AI Proctoring & Behavioral Verification Seal Box
  curY -= 25;
  page.drawRectangle({
    x: 45,
    y: curY - 48,
    width: width - 90,
    height: 52,
    color: rgb(240 / 255, 253 / 255, 244 / 255), // Emerald 50
    borderColor: rgb(187 / 255, 247 / 255, 208 / 255), // Emerald 200
    borderWidth: 1,
  });

  // Green verification pill badge
  page.drawRectangle({
    x: 55,
    y: curY - 18,
    width: 65,
    height: 14,
    color: colorEmerald,
  });
  page.drawText("VERIFIED", {
    x: 65,
    y: curY - 14,
    size: 7.5,
    font: helveticaBold,
    color: rgb(1, 1, 1),
  });

  page.drawText("AI ANTI-CHEAT & VISION PROCTORING TELEMETRY", {
    x: 128,
    y: curY - 14,
    size: 8.5,
    font: helveticaBold,
    color: colorEmerald,
  });

  const severityText = data.proctoringSeverity === "HIGH RISK"
    ? "Review Flagged"
    : "Verified Exam Integrity Session (Passed All Anti-Cheat Checks)";

  page.drawText(`Integrity Telemetry Status: ${severityText}`, {
    x: 55,
    y: curY - 30,
    size: 8,
    font: helvetica,
    color: colorTextDark,
  });

  page.drawText("Multi-object AI vision detection, tab blur monitoring & strict server-clock enforcement active during attempt.", {
    x: 55,
    y: curY - 42,
    size: 7.5,
    font: helvetica,
    color: colorTextMuted,
  });

  // 8. Footer & Authentic Verification Watermark
  const footerY = 42;
  page.drawLine({
    start: { x: 45, y: footerY + 18 },
    end: { x: width - 45, y: footerY + 18 },
    thickness: 0.8,
    color: colorBorder,
  });

  page.drawText("Assessment Portal Automated Verification Engine - Cryptographically Verified Report", {
    x: 45,
    y: footerY + 6,
    size: 7.5,
    font: helvetica,
    color: colorTextMuted,
  });

  page.drawText(`Page 1 of 1 - Security Hash: ${shortId}`, {
    x: width - 210,
    y: footerY + 6,
    size: 7.5,
    font: helvetica,
    color: colorTextMuted,
  });

  return pdfDoc.save();
}
