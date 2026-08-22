import ExcelJS from "exceljs";
import mammoth from "mammoth";
import {
  parseCsv,
  rowsToRecords,
  normalizeBulkRow,
  validateScannedQuestion,
  type ScannedQuestion,
} from "@/lib/bulk-import";
import type { QuestionType } from "@/lib/schemas/question";

export async function scanQuestionsFromFile(file: File): Promise<ScannedQuestion[]> {
  const fileName = file.name.toLowerCase();
  const buffer = Buffer.from(await file.arrayBuffer());

  if (fileName.endsWith(".csv")) {
    const text = buffer.toString("utf-8");
    const records = rowsToRecords(parseCsv(text));
    return recordsToScannedQuestions(records);
  }

  if (fileName.endsWith(".xlsx") || fileName.endsWith(".xlsm") || fileName.endsWith(".xls")) {
    return scanExcelSpreadsheet(buffer);
  }

  if (fileName.endsWith(".docx") || fileName.endsWith(".doc")) {
    return scanWordDocument(buffer);
  }

  throw new Error("UNSUPPORTED_FILE_TYPE");
}

function recordsToScannedQuestions(records: Record<string, string>[]): ScannedQuestion[] {
  return records.map((record, index) => {
    const originalRow = index + 2; // Row 1 is header
    const normalized = normalizeBulkRow(record);
    const id = `scan_${index}_${Date.now()}`;

    if (!normalized.ok) {
      return {
        id,
        originalRow,
        type: (record.type as QuestionType) || "MCQ_SINGLE",
        stem: record.stem || "",
        mediaUrl: record.mediaurl || null,
        tags: (record.tags || "").split(/[,;]/).map((t) => t.trim()).filter(Boolean),
        options: (record.options || "").split(";").map((o) => ({ label: o.trim(), isCorrect: false })),
        isValid: false,
        errors: [normalized.error],
      };
    }

    const validation = validateScannedQuestion(normalized.row);

    return {
      id,
      originalRow,
      type: normalized.row.type,
      stem: normalized.row.stem,
      mediaUrl: normalized.row.mediaUrl,
      tags: normalized.row.tags,
      options: normalized.row.options,
      isValid: validation.isValid,
      errors: validation.errors,
    };
  });
}

function getCellValueString(val: any): string {
  if (val == null) return "";
  if (typeof val === "object") {
    if (val.result !== undefined && val.result !== null) return getCellValueString(val.result);
    if (Array.isArray(val.richText)) {
      return val.richText.map((rt: any) => rt.text || "").join("").trim();
    }
    if (val.text !== undefined && val.text !== null) return getCellValueString(val.text);
    if (val.hyperlink && val.text) return String(val.text).trim();
  }
  return String(val).trim();
}

async function scanExcelSpreadsheet(buffer: Buffer): Promise<ScannedQuestion[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as never);
  const worksheet = workbook.worksheets[0];
  if (!worksheet) return [];

  // 1. Detect header row by scanning first 10 rows for header keywords
  let headerRowNumber = 1;
  const keywords = ["stem", "question", "prompt", "type", "option", "choice", "answer", "correct", "tag"];

  let foundHeader = false;
  for (let r = 1; r <= Math.min(worksheet.rowCount, 10); r++) {
    const row = worksheet.getRow(r);
    let matches = 0;
    row.eachCell({ includeEmpty: false }, (cell) => {
      const txt = getCellValueString(cell.value).toLowerCase().trim();
      if (txt.length < 40 && keywords.some((kw) => txt.includes(kw))) {
        matches++;
      }
    });
    if (matches >= 2 || (matches >= 1 && r > 1)) {
      headerRowNumber = r;
      foundHeader = true;
      break;
    }
  }

  if (!foundHeader) {
    // If no row matched header keywords, find the first non-empty row as header
    for (let r = 1; r <= Math.min(worksheet.rowCount, 10); r++) {
      const row = worksheet.getRow(r);
      let cellCount = 0;
      row.eachCell({ includeEmpty: false }, () => cellCount++);
      if (cellCount >= 2) {
        headerRowNumber = r;
        break;
      }
    }
  }

  // 2. Extract header row names
  const headers: string[] = [];
  worksheet.getRow(headerRowNumber).eachCell({ includeEmpty: true }, (cell, colNumber) => {
    headers[colNumber - 1] = getCellValueString(cell.value).toLowerCase();
  });

  // 3. Extract records from rows following headerRowNumber
  const records: Record<string, string>[] = [];
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber <= headerRowNumber) return;
    const record: Record<string, string> = {};
    headers.forEach((h, i) => {
      const value = getCellValueString(row.getCell(i + 1).value);
      const key = h || `col_${i + 1}`;
      record[key] = value;
    });
    if (Object.values(record).some((v) => v !== "")) {
      records.push(record);
    }
  });

  return recordsToScannedQuestions(records);
}

async function scanWordDocument(buffer: Buffer): Promise<ScannedQuestion[]> {
  // Extract both HTML (for tables) and raw text (for Q&A text patterns)
  const htmlResult = await mammoth.convertToHtml({ buffer });
  const rawTextResult = await mammoth.extractRawText({ buffer });

  const html = htmlResult.value || "";
  const rawText = rawTextResult.value || "";

  // 1. Check if Word document has HTML tables
  const tableRecords = extractRecordsFromWordHtmlTable(html);
  if (tableRecords.length > 0) {
    return recordsToScannedQuestions(tableRecords);
  }

  // 2. Parse text blocks (Q1. Stem, A) Option 1, Answer: A)
  return parseWordTextQuestions(rawText);
}

function extractRecordsFromWordHtmlTable(html: string): Record<string, string>[] {
  const records: Record<string, string>[] = [];
  const tableMatches = html.match(/<table[\s\S]*?<\/table>/gi);
  if (!tableMatches) return records;

  for (const tableHtml of tableMatches) {
    const rowMatches = tableHtml.match(/<tr[\s\S]*?<\/tr>/gi);
    if (!rowMatches || rowMatches.length < 2) continue;

    const headers: string[] = [];
    const firstRowCells = rowMatches[0].match(/<t[dh][\s\S]*?<\/t[dh]>/gi);
    if (firstRowCells) {
      firstRowCells.forEach((cell) => {
        const text = cell.replace(/<[^>]+>/g, "").trim().toLowerCase();
        headers.push(text);
      });
    }

    if (!headers.some((h) => h.includes("stem") || h.includes("question"))) {
      continue;
    }

    for (let r = 1; r < rowMatches.length; r++) {
      const cells = rowMatches[r].match(/<t[dh][\s\S]*?<\/t[dh]>/gi);
      if (!cells) continue;

      const record: Record<string, string> = {};
      headers.forEach((h, i) => {
        if (!h || !cells[i]) return;
        const text = cells[i].replace(/<[^>]+>/g, "").trim();
        if (h.includes("stem") || h.includes("question")) record["stem"] = text;
        else if (h.includes("type")) record["type"] = text;
        else if (h.includes("media")) record["mediaurl"] = text;
        else if (h.includes("tag")) record["tags"] = text;
        else if (h.includes("correct") || h.includes("answer")) record["correctoptions"] = text;
        else if (h.includes("option")) record["options"] = text;
      });

      if (record["stem"]) {
        records.push(record);
      }
    }
  }

  return records;
}

function parseWordTextQuestions(rawText: string): ScannedQuestion[] {
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const scannedItems: ScannedQuestion[] = [];
  let currentStem = "";
  let currentOptions: { label: string; isCorrect: boolean }[] = [];
  let currentAnswers: string[] = [];
  let currentTags: string[] = [];
  let currentType: QuestionType | null = null;
  let currentMediaUrl: string | null = null;
  let itemCounter = 0;

  function pushCurrentQuestion() {
    if (!currentStem) return;

    itemCounter++;
    const id = `scan_doc_${itemCounter}_${Date.now()}`;

    // Determine type automatically if not set
    let type: QuestionType = currentType || "MCQ_SINGLE";
    if (!currentType) {
      if (currentOptions.length === 0) {
        type = "NUMERIC";
      } else if (currentAnswers.length > 1) {
        type = "MCQ_MULTI";
      } else {
        type = "MCQ_SINGLE";
      }
    }

    // Match answer letters/indices to options
    if (currentAnswers.length > 0 && currentOptions.length > 0) {
      currentAnswers.forEach((ans) => {
        const cleaned = ans.toUpperCase().trim();
        // Check if letter A, B, C, D...
        const letterIdx = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".indexOf(cleaned);
        if (letterIdx >= 0 && letterIdx < currentOptions.length) {
          currentOptions[letterIdx].isCorrect = true;
        }
        // Check if 1-based number
        const num = parseInt(cleaned, 10);
        if (!isNaN(num) && num >= 1 && num <= currentOptions.length) {
          currentOptions[num - 1].isCorrect = true;
        }
        // Check if exact option label text match
        currentOptions.forEach((opt) => {
          if (opt.label.trim().toLowerCase() === cleaned.toLowerCase()) {
            opt.isCorrect = true;
          }
        });
      });
    }

    const item: Partial<ScannedQuestion> = {
      id,
      originalRow: itemCounter,
      type,
      stem: currentStem,
      mediaUrl: currentMediaUrl,
      tags: currentTags,
      options: currentOptions,
    };

    const validation = validateScannedQuestion(item);

    scannedItems.push({
      id,
      originalRow: itemCounter,
      type,
      stem: currentStem,
      mediaUrl: currentMediaUrl,
      tags: currentTags,
      options: currentOptions,
      isValid: validation.isValid,
      errors: validation.errors,
    });

    // Reset accumulator
    currentStem = "";
    currentOptions = [];
    currentAnswers = [];
    currentTags = [];
    currentType = null;
    currentMediaUrl = null;
  }

  const questionHeaderRegex = /^(?:q(?:uestion)?\s*\d*[\.\:\-]|[\d]+[\.\)])\s*(.*)/i;
  const optionRegex = /^(?:[A-Da-d0-9][\.\)]|\([A-Da-d0-9]\))\s*(.*)/;
  const answerRegex = /^(?:answer|correct answer|correct|ans|key)\s*[:\-]\s*(.*)/i;
  const typeRegex = /^type\s*[:\-]\s*(.*)/i;
  const tagsRegex = /^tags?\s*[:\-]\s*(.*)/i;
  const mediaRegex = /^media(?:url)?\s*[:\-]\s*(.*)/i;

  for (const line of lines) {
    const qMatch = line.match(questionHeaderRegex);
    const optMatch = line.match(optionRegex);
    const ansMatch = line.match(answerRegex);
    const typeMatch = line.match(typeRegex);
    const tagsMatch = line.match(tagsRegex);
    const mediaMatch = line.match(mediaRegex);

    if (ansMatch) {
      const rawAns = ansMatch[1].trim();
      currentAnswers.push(...rawAns.split(/[,;]/).map((a) => a.trim()).filter(Boolean));
    } else if (typeMatch) {
      const t = typeMatch[1].trim().toUpperCase() as QuestionType;
      if (["MCQ_SINGLE", "MCQ_MULTI", "NUMERIC", "LIKERT"].includes(t)) {
        currentType = t;
      }
    } else if (tagsMatch) {
      const rawTags = tagsMatch[1].trim();
      currentTags.push(...rawTags.split(/[,;]/).map((t) => t.trim()).filter(Boolean));
    } else if (mediaMatch) {
      currentMediaUrl = mediaMatch[1].trim() || null;
    } else if (qMatch) {
      pushCurrentQuestion();
      currentStem = qMatch[1].trim() || line;
    } else if (optMatch) {
      currentOptions.push({
        label: optMatch[1].trim(),
        isCorrect: false,
      });
    } else {
      if (!currentStem) {
        currentStem = line;
      } else if (currentOptions.length === 0 && !currentAnswers.length) {
        currentStem += "\n" + line;
      }
    }
  }

  pushCurrentQuestion();

  return scannedItems;
}
