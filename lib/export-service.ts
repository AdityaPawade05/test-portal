import ExcelJS from "exceljs";

export type ExportSection = {
  id: string;
  name: string;
  order: number;
  timeLimitSec: number;
  questionCount: number;
};

export type ExportEvent = {
  id: string;
  type: string;
  payload: unknown;
  occurredAt: Date | string;
};

export type ExportScore = {
  rawTotal: number;
  rawBySection: unknown;
  percentile: number | null;
  passed: boolean | null;
};

export type ExportAttempt = {
  id: string;
  startedAt: Date | string | null;
  submittedAt: Date | string | null;
  score: ExportScore | null;
  events: ExportEvent[];
};

export type ExportInvitation = {
  id: string;
  email: string;
  candidateName: string | null;
  status: string;
  expiresAt: Date | string;
  createdAt: Date | string;
  attempt: ExportAttempt | null;
};

export type ExportTestData = {
  id: string;
  name: string;
  cutoffPercent: number | null;
  sections: ExportSection[];
  invitations: ExportInvitation[];
};

function formatDate(val: Date | string | null | undefined): string {
  if (!val) return "—";
  const d = typeof val === "string" ? new Date(val) : val;
  if (isNaN(d.getTime())) return "—";
  return d.toISOString().replace("T", " ").substring(0, 19);
}

function calculateSeverity(events: ExportEvent[]): {
  severity: "HIGH RISK" | "MEDIUM" | "CLEAN";
  anomalyCount: number;
  tabBlurs: number;
  objectAnomalies: number;
  gazeAnomalies: number;
  webcamAnomalies: number;
  micAnomalies: number;
} {
  const tabBlurs = events.filter((e) => e.type === "TAB_BLUR").length;
  const objectAnomalies = events.filter((e) =>
    [
      "OBJECT_PHONE_DETECTED",
      "PROHIBITED_BOOK_DETECTED",
      "PROHIBITED_SCREEN_DETECTED",
      "PROHIBITED_AUDIO_DEVICE_DETECTED",
      "PROHIBITED_OBJECT_DETECTED",
      "UNAUTHORIZED_PERSON_DETECTED",
    ].includes(e.type),
  ).length;

  const gazeAnomalies = events.filter((e) =>
    [
      "FACE_LOOKING_AWAY",
      "FACE_EXCESSIVE_MOVEMENT",
      "MULTIPLE_FACES_DETECTED",
      "WEBCAM_NO_FACE_DETECTED",
    ].includes(e.type),
  ).length;

  const webcamAnomalies = events.filter(
    (e) =>
      e.type.startsWith("WEBCAM_") &&
      e.type !== "WEBCAM_SNAPSHOT" &&
      e.type !== "WEBCAM_VERIFICATION_INITIAL",
  ).length;

  const micAnomalies = events.filter((e) => e.type.startsWith("MIC_")).length;

  const significantAnomalies = events.filter(
    (e) => !["WEBCAM_SNAPSHOT", "WEBCAM_VERIFICATION_INITIAL"].includes(e.type),
  ).length;

  let severity: "HIGH RISK" | "MEDIUM" | "CLEAN" = "CLEAN";
  if (objectAnomalies > 0 || significantAnomalies > 3) {
    severity = "HIGH RISK";
  } else if (significantAnomalies > 0) {
    severity = "MEDIUM";
  }

  return {
    severity,
    anomalyCount: events.length,
    tabBlurs,
    objectAnomalies,
    gazeAnomalies,
    webcamAnomalies,
    micAnomalies,
  };
}

/**
 * Generate a beautifully styled, multi-tab Excel Workbook for Test Results & Proctoring
 */
export async function generateTestResultsExcel(data: ExportTestData): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Assessment Portal";
  workbook.lastModifiedBy = "Assessment Portal Export Engine";
  workbook.created = new Date();
  workbook.modified = new Date();

  // ---------------------------------------------------------------------------
  // Sheet 1: Assessment Summary & Candidate Scores
  // ---------------------------------------------------------------------------
  const summarySheet = workbook.addWorksheet("Candidates & Scores", {
    views: [{ showGridLines: true }],
  });

  summarySheet.columns = [
    { header: "Candidate Email", key: "email", width: 32 },
    { header: "Candidate Name", key: "name", width: 22 },
    { header: "Status", key: "status", width: 14 },
    { header: "Raw Score", key: "rawScore", width: 12 },
    { header: "Percentile", key: "percentile", width: 12 },
    { header: "Passed", key: "passed", width: 10 },
    { header: "📦 Objects", key: "objectFlags", width: 14 },
    { header: "👀 Gaze / Pose", key: "gazeFlags", width: 15 },
    { header: "Tab Blurs", key: "tabBlurs", width: 12 },
    { header: "📹 Webcam", key: "webcamFlags", width: 13 },
    { header: "🎤 Mic", key: "micFlags", width: 11 },
    { header: "Total Events", key: "totalEvents", width: 13 },
    { header: "Integrity Risk", key: "severity", width: 15 },
    { header: "Invited At", key: "createdAt", width: 20 },
    { header: "Started At", key: "startedAt", width: 20 },
    { header: "Submitted At", key: "submittedAt", width: 20 },
  ];

  // Header style
  const headerRow1 = summarySheet.getRow(1);
  headerRow1.height = 28;
  headerRow1.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF4F46E5" }, // Indigo 600
    };
    cell.alignment = { vertical: "middle", horizontal: "left" };
  });

  data.invitations.forEach((inv, index) => {
    const score = inv.attempt?.score;
    const events = inv.attempt?.events ?? [];
    const stats = calculateSeverity(events);

    const passedLabel =
      score?.passed === true ? "Passed" : score?.passed === false ? "Failed" : "—";

    const row = summarySheet.addRow({
      email: inv.email,
      name: inv.candidateName || "—",
      status: inv.status,
      rawScore: score ? score.rawTotal : "—",
      percentile: score?.percentile != null ? `${score.percentile}th` : "—",
      passed: passedLabel,
      objectFlags: stats.objectAnomalies,
      gazeFlags: stats.gazeAnomalies,
      tabBlurs: stats.tabBlurs,
      webcamFlags: stats.webcamAnomalies,
      micFlags: stats.micAnomalies,
      totalEvents: stats.anomalyCount,
      severity: stats.severity,
      createdAt: formatDate(inv.createdAt),
      startedAt: formatDate(inv.attempt?.startedAt),
      submittedAt: formatDate(inv.attempt?.submittedAt),
    });

    row.height = 22;
    row.alignment = { vertical: "middle" };

    // Zebra striping
    if (index % 2 === 1) {
      row.eachCell((cell) => {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFF8FAFC" },
        };
      });
    }

    // Highlight severity
    const severityCell = row.getCell("severity");
    if (stats.severity === "HIGH RISK") {
      severityCell.font = { bold: true, color: { argb: "FFE11D48" } }; // Rose 600
    } else if (stats.severity === "MEDIUM") {
      severityCell.font = { bold: true, color: { argb: "FFD97706" } }; // Amber 600
    } else {
      severityCell.font = { color: { argb: "FF059669" } }; // Emerald 600
    }

    // Highlight pass/fail
    const passedCell = row.getCell("passed");
    if (passedLabel === "Passed") {
      passedCell.font = { bold: true, color: { argb: "FF059669" } };
    } else if (passedLabel === "Failed") {
      passedCell.font = { bold: true, color: { argb: "FFE11D48" } };
    }
  });

  // ---------------------------------------------------------------------------
  // Sheet 2: Section Breakdown Scores
  // ---------------------------------------------------------------------------
  const sectionSheet = workbook.addWorksheet("Section Breakdown", {
    views: [{ showGridLines: true }],
  });

  sectionSheet.columns = [
    { header: "Candidate Email", key: "email", width: 32 },
    { header: "Candidate Name", key: "name", width: 24 },
    { header: "Section Name", key: "sectionName", width: 28 },
    { header: "Section Order", key: "sectionOrder", width: 14 },
    { header: "Section Score", key: "sectionScore", width: 16 },
    { header: "Time Limit (Mins)", key: "timeLimit", width: 18 },
    { header: "Question Count", key: "qCount", width: 16 },
  ];

  const headerRow2 = sectionSheet.getRow(1);
  headerRow2.height = 28;
  headerRow2.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF3730A3" }, // Indigo 800
    };
    cell.alignment = { vertical: "middle", horizontal: "left" };
  });

  let sectionRowIdx = 0;
  data.invitations.forEach((inv) => {
    const rawBySection = (inv.attempt?.score?.rawBySection ?? {}) as Record<string, number>;

    data.sections.forEach((sec) => {
      const secScore = sec.id in rawBySection ? rawBySection[sec.id] : "—";
      const row = sectionSheet.addRow({
        email: inv.email,
        name: inv.candidateName || "—",
        sectionName: sec.name,
        sectionOrder: sec.order + 1,
        sectionScore: secScore,
        timeLimit: Math.round(sec.timeLimitSec / 60),
        qCount: sec.questionCount,
      });

      row.height = 20;
      row.alignment = { vertical: "middle" };
      if (sectionRowIdx % 2 === 1) {
        row.eachCell((cell) => {
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FFF8FAFC" },
          };
        });
      }
      sectionRowIdx++;
    });
  });

  // ---------------------------------------------------------------------------
  // Sheet 3: AI Proctoring & Behavioral Audit Log
  // ---------------------------------------------------------------------------
  const proctorSheet = workbook.addWorksheet("Proctoring Audit Log", {
    views: [{ showGridLines: true }],
  });

  proctorSheet.columns = [
    { header: "Incident ID", key: "id", width: 28 },
    { header: "Candidate Email", key: "email", width: 32 },
    { header: "Category", key: "category", width: 20 },
    { header: "Event Type", key: "type", width: 34 },
    { header: "Threat Level", key: "threat", width: 16 },
    { header: "Occurred At", key: "occurredAt", width: 22 },
    { header: "Details / Payload", key: "payload", width: 44 },
  ];

  const headerRow3 = proctorSheet.getRow(1);
  headerRow3.height = 28;
  headerRow3.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFBE123C" }, // Rose 700
    };
    cell.alignment = { vertical: "middle", horizontal: "left" };
  });

  function getEventCategory(type: string): string {
    if (
      [
        "OBJECT_PHONE_DETECTED",
        "PROHIBITED_BOOK_DETECTED",
        "PROHIBITED_SCREEN_DETECTED",
        "PROHIBITED_AUDIO_DEVICE_DETECTED",
        "PROHIBITED_OBJECT_DETECTED",
        "UNAUTHORIZED_PERSON_DETECTED",
      ].includes(type)
    ) {
      return "📦 Objects";
    }
    if (
      [
        "FACE_LOOKING_AWAY",
        "FACE_EXCESSIVE_MOVEMENT",
        "MULTIPLE_FACES_DETECTED",
        "WEBCAM_NO_FACE_DETECTED",
      ].includes(type)
    ) {
      return "👀 Gaze / Pose";
    }
    if (type === "TAB_BLUR" || type === "FULLSCREEN_EXIT") {
      return "Tab Blurs";
    }
    if (type.startsWith("WEBCAM_")) {
      return "📹 Webcam";
    }
    if (type.startsWith("MIC_")) {
      return "🎤 Mic";
    }
    if (type === "PROCTORING_VIOLATION" || type === "AUTO_SUBMIT_VIOLATIONS") {
      return "🚨 Violation";
    }
    return "ℹ️ Telemetry";
  }

  let eventRowIdx = 0;
  data.invitations.forEach((inv) => {
    const events = inv.attempt?.events ?? [];
    events.forEach((ev) => {
      let threat: "CRITICAL" | "HIGH" | "WARNING" | "INFO" = "INFO";
      if (
        [
          "OBJECT_PHONE_DETECTED",
          "PROHIBITED_BOOK_DETECTED",
          "PROHIBITED_SCREEN_DETECTED",
          "UNAUTHORIZED_PERSON_DETECTED",
          "AUTO_SUBMIT_VIOLATIONS",
        ].includes(ev.type)
      ) {
        threat = "CRITICAL";
      } else if (
        [
          "PROHIBITED_AUDIO_DEVICE_DETECTED",
          "MULTIPLE_FACES_DETECTED",
          "DEVTOOLS_ATTEMPT",
          "PRINTSCREEN_ATTEMPT",
        ].includes(ev.type)
      ) {
        threat = "HIGH";
      } else if (
        ["TAB_BLUR", "PASTE", "FACE_LOOKING_AWAY", "WEBCAM_NO_FACE_DETECTED"].includes(ev.type)
      ) {
        threat = "WARNING";
      }

      let payloadStr = "";
      if (ev.payload) {
        try {
          payloadStr =
            typeof ev.payload === "string" ? ev.payload : JSON.stringify(ev.payload);
        } catch {
          payloadStr = String(ev.payload);
        }
      }

      const row = proctorSheet.addRow({
        id: ev.id,
        email: inv.email,
        category: getEventCategory(ev.type),
        type: ev.type,
        threat,
        occurredAt: formatDate(ev.occurredAt),
        payload: payloadStr,
      });

      row.height = 20;
      row.alignment = { vertical: "middle" };

      if (eventRowIdx % 2 === 1) {
        row.eachCell((cell) => {
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FFF8FAFC" },
          };
        });
      }

      const threatCell = row.getCell("threat");
      if (threat === "CRITICAL") {
        threatCell.font = { bold: true, color: { argb: "FFE11D48" } };
      } else if (threat === "HIGH") {
        threatCell.font = { bold: true, color: { argb: "FFD97706" } };
      } else if (threat === "WARNING") {
        threatCell.font = { color: { argb: "FFCA8A04" } };
      }

      eventRowIdx++;
    });
  });

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return new Uint8Array(arrayBuffer);
}

/**
 * Generate Universal Flat CSV for Candidate Scores & Results
 */
export function generateTestResultsCsv(data: ExportTestData): string {
  const headers = [
    "Candidate Email",
    "Candidate Name",
    "Invitation Status",
    "Raw Total Score",
    "Percentile Rank",
    "Passed",
    "Prohibited Objects Detected",
    "Gaze / Pose Anomalies",
    "Tab Blur Count",
    "Webcam Anomalies",
    "Mic Anomalies",
    "Total Anomaly Count",
    "Integrity Risk Level",
    "Invited At",
    "Started At",
    "Submitted At",
  ];

  // Add individual section score columns
  data.sections.forEach((sec) => {
    headers.push(`Section ${sec.order + 1}: ${sec.name} Score`);
  });

  const rows: string[][] = [headers];

  data.invitations.forEach((inv) => {
    const score = inv.attempt?.score;
    const events = inv.attempt?.events ?? [];
    const stats = calculateSeverity(events);
    const rawBySection = (score?.rawBySection ?? {}) as Record<string, number>;

    const passedLabel =
      score?.passed === true ? "Passed" : score?.passed === false ? "Failed" : "N/A";

    const row = [
      inv.email,
      inv.candidateName || "",
      inv.status,
      score ? String(score.rawTotal) : "",
      score?.percentile != null ? `${score.percentile}%` : "",
      passedLabel,
      String(stats.objectAnomalies),
      String(stats.gazeAnomalies),
      String(stats.tabBlurs),
      String(stats.webcamAnomalies),
      String(stats.micAnomalies),
      String(stats.anomalyCount),
      stats.severity,
      formatDate(inv.createdAt),
      formatDate(inv.attempt?.startedAt),
      formatDate(inv.attempt?.submittedAt),
    ];

    data.sections.forEach((sec) => {
      const secScore = sec.id in rawBySection ? String(rawBySection[sec.id]) : "";
      row.push(secScore);
    });

    rows.push(row);
  });

  return rows
    .map((r) =>
      r
        .map((field) => {
          const clean = field.replace(/"/g, '""');
          return `"${clean}"`;
        })
        .join(","),
    )
    .join("\r\n");
}

/**
 * Generate Universal Flat CSV for Proctoring Incident Events
 */
export function generateProctoringAuditCsv(data: ExportTestData): string {
  const headers = [
    "Incident ID",
    "Candidate Email",
    "Candidate Name",
    "Test Name",
    "Category",
    "Event Type",
    "Occurred At",
    "Payload Details",
  ];

  function getEventCategory(type: string): string {
    if (
      [
        "OBJECT_PHONE_DETECTED",
        "PROHIBITED_BOOK_DETECTED",
        "PROHIBITED_SCREEN_DETECTED",
        "PROHIBITED_AUDIO_DEVICE_DETECTED",
        "PROHIBITED_OBJECT_DETECTED",
        "UNAUTHORIZED_PERSON_DETECTED",
      ].includes(type)
    ) {
      return "Objects";
    }
    if (
      [
        "FACE_LOOKING_AWAY",
        "FACE_EXCESSIVE_MOVEMENT",
        "MULTIPLE_FACES_DETECTED",
        "WEBCAM_NO_FACE_DETECTED",
      ].includes(type)
    ) {
      return "Gaze / Pose";
    }
    if (type === "TAB_BLUR" || type === "FULLSCREEN_EXIT") {
      return "Tab Blurs";
    }
    if (type.startsWith("WEBCAM_")) {
      return "Webcam";
    }
    if (type.startsWith("MIC_")) {
      return "Mic";
    }
    if (type === "PROCTORING_VIOLATION" || type === "AUTO_SUBMIT_VIOLATIONS") {
      return "Violation";
    }
    return "Telemetry";
  }

  const rows: string[][] = [headers];

  data.invitations.forEach((inv) => {
    const events = inv.attempt?.events ?? [];
    events.forEach((ev) => {
      let payloadStr = "";
      if (ev.payload) {
        try {
          payloadStr =
            typeof ev.payload === "string" ? ev.payload : JSON.stringify(ev.payload);
        } catch {
          payloadStr = String(ev.payload);
        }
      }

      rows.push([
        ev.id,
        inv.email,
        inv.candidateName || "",
        data.name,
        getEventCategory(ev.type),
        ev.type,
        formatDate(ev.occurredAt),
        payloadStr,
      ]);
    });
  });

  return rows
    .map((r) =>
      r
        .map((field) => {
          const clean = field.replace(/"/g, '""');
          return `"${clean}"`;
        })
        .join(","),
    )
    .join("\r\n");
}

export type ExportDriveCandidate = {
  rollNumber: string;
  name: string;
  email: string;
  branch: string;
  cgpa: number | null;
  passingYear: number | null;
  labSlot: string | null;
  shortlistDecision: string;
  recruiterNotes: string | null;
  status: string;
  totalScore: number | string;
  percentile: number | string;
  passed: string;
  integrityRisk: string;
  tabBlurs: number;
  objectFlags: number;
  violationsCount: number;
};

export type ExportPlacementDriveData = {
  companyName: string;
  jobRole: string;
  ctcPackage: string | null;
  driveDate: Date | string;
  collegeName: string;
  candidates: ExportDriveCandidate[];
};

/**
 * Generate beautifully styled Placement Drive Recruiter Shortlist & Results Excel
 */
export async function generatePlacementDriveExcel(data: ExportPlacementDriveData): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Campus Placement Cell";
  workbook.lastModifiedBy = `${data.companyName} Recruitment Panel`;
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("Placement Shortlist", {
    views: [{ showGridLines: true }],
  });

  sheet.columns = [
    { header: "Roll No / PRN", key: "rollNumber", width: 16 },
    { header: "Candidate Name", key: "name", width: 24 },
    { header: "Email", key: "email", width: 30 },
    { header: "Branch", key: "branch", width: 12 },
    { header: "CGPA", key: "cgpa", width: 10 },
    { header: "Batch", key: "passingYear", width: 10 },
    { header: "Lab / Slot", key: "labSlot", width: 22 },
    { header: "Shortlist Decision", key: "shortlistDecision", width: 20 },
    { header: "Test Status", key: "status", width: 14 },
    { header: "Score", key: "totalScore", width: 12 },
    { header: "Percentile", key: "percentile", width: 12 },
    { header: "Pass/Fail", key: "passed", width: 12 },
    { header: "Integrity Flag", key: "integrityRisk", width: 16 },
    { header: "Tab Switches", key: "tabBlurs", width: 14 },
    { header: "Recruiter Notes", key: "recruiterNotes", width: 30 },
  ];

  const headerRow = sheet.getRow(1);
  headerRow.height = 30;
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF1E293B" }, // Slate 800
    };
    cell.alignment = { vertical: "middle", horizontal: "left" };
  });

  data.candidates.forEach((cand, index) => {
    const row = sheet.addRow({
      rollNumber: cand.rollNumber,
      name: cand.name,
      email: cand.email,
      branch: cand.branch,
      cgpa: cand.cgpa != null ? cand.cgpa.toFixed(2) : "—",
      passingYear: cand.passingYear ?? "—",
      labSlot: cand.labSlot || "—",
      shortlistDecision: cand.shortlistDecision,
      status: cand.status,
      totalScore: cand.totalScore,
      percentile: cand.percentile,
      passed: cand.passed,
      integrityRisk: cand.integrityRisk,
      tabBlurs: cand.tabBlurs,
      recruiterNotes: cand.recruiterNotes || "",
    });

    row.height = 24;
    row.alignment = { vertical: "middle" };

    if (index % 2 === 1) {
      row.eachCell((cell) => {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFF8FAFC" },
        };
      });
    }

    const decisionCell = row.getCell("shortlistDecision");
    if (cand.shortlistDecision === "SHORTLISTED") {
      decisionCell.font = { bold: true, color: { argb: "FF059669" } };
      decisionCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFECFDF5" } };
    } else if (cand.shortlistDecision === "REJECTED") {
      decisionCell.font = { color: { argb: "FFE11D48" } };
    } else if (cand.shortlistDecision === "WAITLISTED") {
      decisionCell.font = { color: { argb: "FFD97706" } };
    }
  });

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return new Uint8Array(arrayBuffer);
}

