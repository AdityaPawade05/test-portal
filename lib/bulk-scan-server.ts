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
        stem: record.stem || Object.values(record)[0] || "",
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
  const keywords = ["stem", "question", "prompt", "type", "option", "choice", "answer", "correct", "tag", "ans", "key"];

  let foundHeader = false;
  for (let r = 1; r <= Math.min(worksheet.rowCount, 10); r++) {
    const row = worksheet.getRow(r);
    let matches = 0;
    row.eachCell({ includeEmpty: false }, (cell) => {
      const txt = getCellValueString(cell.value).toLowerCase().trim();
      if (txt.length < 50 && keywords.some((kw) => txt.includes(kw))) {
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
    // If no row matched header keywords, find the first row with at least 2 non-empty cells
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
    headers[colNumber - 1] = getCellValueString(cell.value).toLowerCase().trim();
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
  // Extract HTML (for tables & formatting) and raw text (for Q&A patterns)
  const htmlResult = await mammoth.convertToHtml({ buffer });
  const rawTextResult = await mammoth.extractRawText({ buffer });

  const html = htmlResult.value || "";
  const rawText = rawTextResult.value || "";

  // 1. First check if Word document has an HTML table with question columns
  const tableRecords = extractRecordsFromWordHtmlTable(html);
  if (tableRecords.length > 0) {
    const tableQuestions = recordsToScannedQuestions(tableRecords);
    if (tableQuestions.length > 0) {
      return tableQuestions;
    }
  }

  // 2. Otherwise, parse structured Q&A text format
  return parseWordTextQuestions(rawText, html);
}

function extractRecordsFromWordHtmlTable(html: string): Record<string, string>[] {
  const records: Record<string, string>[] = [];
  const tableMatches = html.match(/<table[\s\S]*?<\/table>/gi);
  if (!tableMatches) return records;

  for (const tableHtml of tableMatches) {
    const rowMatches = tableHtml.match(/<tr[\s\S]*?<\/tr>/gi);
    if (!rowMatches || rowMatches.length < 2) continue;

    // Extract headers from the first row
    const headers: string[] = [];
    const firstRowCells = rowMatches[0].match(/<t[dh][\s\S]*?<\/t[dh]>/gi);
    if (firstRowCells) {
      firstRowCells.forEach((cell) => {
        const text = cell.replace(/<[^>]+>/g, "").trim().toLowerCase();
        headers.push(text);
      });
    }

    const hasStemHeader = headers.some(
      (h) =>
        h.includes("stem") ||
        h.includes("question") ||
        h.includes("prompt") ||
        h.includes("problem") ||
        h === "q" ||
        h.includes("title"),
    );

    if (!hasStemHeader && headers.length < 2) {
      continue;
    }

    for (let r = 1; r < rowMatches.length; r++) {
      const cells = rowMatches[r].match(/<t[dh][\s\S]*?<\/t[dh]>/gi);
      if (!cells) continue;

      const record: Record<string, string> = {};

      headers.forEach((h, i) => {
        if (!cells[i]) return;
        const text = cells[i]
          .replace(/<br\s*\/?>/gi, "\n")
          .replace(/<\/p>/gi, "\n")
          .replace(/<[^>]+>/g, "")
          .trim();
        if (!text) return;

        const cleanH = h.replace(/[\s_.-]+/g, "");

        if (cleanH.includes("stem") || cleanH.includes("question") || cleanH.includes("prompt") || cleanH.includes("problem") || cleanH === "q") {
          record["stem"] = text;
        } else if (cleanH.includes("type") || cleanH === "kind") {
          record["type"] = text;
        } else if (cleanH.includes("media") || cleanH.includes("image")) {
          record["mediaurl"] = text;
        } else if (cleanH.includes("tag") || cleanH.includes("topic") || cleanH.includes("subject") || cleanH.includes("category")) {
          record["tags"] = text;
        } else if (
          cleanH.includes("correct") ||
          cleanH.includes("answer") ||
          cleanH.includes("key") ||
          cleanH.includes("ans") ||
          cleanH.includes("solution")
        ) {
          record["correctoptions"] = text;
        } else if (/^(?:option|choice)?([a-h])$/i.test(cleanH)) {
          const letter = cleanH.match(/^(?:option|choice)?([a-h])$/i)![1].toLowerCase();
          record[`option${letter}`] = text;
        } else if (/^(?:option|choice)?([1-8])$/i.test(cleanH)) {
          const num = cleanH.match(/^(?:option|choice)?([1-8])$/i)![1];
          record[`option${num}`] = text;
        } else if (cleanH.includes("option") || cleanH.includes("choice") || cleanH.includes("choices")) {
          record["options"] = text;
        } else {
          record[h || `col_${i + 1}`] = text;
        }
      });

      if (record["stem"] || Object.values(record).some((v) => v !== "")) {
        records.push(record);
      }
    }
  }

  return records;
}

function parseWordTextQuestions(rawText: string, htmlContent?: string): ScannedQuestion[] {
  // Normalize text: handle non-breaking spaces, CRLF, smart quotes
  const normalizedText = rawText
    .replace(/\u00A0/g, " ")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'");

  const lines = normalizedText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  // 1. Check for global Answer Key section at the bottom/top of document
  const answerKeyMap = extractAnswerKeySection(lines);

  const scannedItems: ScannedQuestion[] = [];
  let currentStem = "";
  let currentOptions: { label: string; isCorrect: boolean }[] = [];
  let currentAnswers: string[] = [];
  let currentTags: string[] = [];
  let currentType: QuestionType | null = null;
  let currentMediaUrl: string | null = null;
  let itemCounter = 0;

  function pushCurrentQuestion() {
    if (!currentStem.trim()) return;

    itemCounter++;
    const id = `scan_doc_${itemCounter}_${Date.now()}`;

    // If answers were not found in the question block, look up in global Answer Key map
    if (currentAnswers.length === 0 && answerKeyMap.has(itemCounter)) {
      currentAnswers.push(...(answerKeyMap.get(itemCounter) || []));
    }

    // Determine question type automatically
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

    // Match answer indicators to options
    if (currentAnswers.length > 0 && currentOptions.length > 0) {
      currentAnswers.forEach((ans) => {
        const rawAns = ans.trim();
        const cleaned = rawAns
          .replace(/^(?:option|choice)\s*/i, "")
          .replace(/^[\(\[\{]([^\)\]\}]+)[\)\]\}]$/, "$1")
          .replace(/[\.:]$/, "")
          .toUpperCase()
          .trim();

        // 1. Check letter index: A -> 0, B -> 1, C -> 2, D -> 3...
        const letterIdx = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".indexOf(cleaned);
        if (letterIdx >= 0 && letterIdx < currentOptions.length) {
          currentOptions[letterIdx].isCorrect = true;
          return;
        }

        // 2. Check 1-based number: 1 -> 0, 2 -> 1...
        const num = parseInt(cleaned, 10);
        if (!isNaN(num) && num >= 1 && num <= currentOptions.length) {
          currentOptions[num - 1].isCorrect = true;
          return;
        }

        // 3. Check exact or prefix match against option labels
        let matched = false;
        currentOptions.forEach((opt) => {
          const optLabel = opt.label.trim().toLowerCase();
          const cleanAnsLower = cleaned.toLowerCase();
          const rawAnsLower = rawAns.toLowerCase();
          if (optLabel === cleanAnsLower || optLabel === rawAnsLower) {
            opt.isCorrect = true;
            matched = true;
          }
        });

        if (matched) return;

        // 4. Check if answer starts with a letter like "A) Articulate"
        const prefixMatch = rawAns.match(/^([A-Ha-h])[\.\)\:\-]\s*(.*)/);
        if (prefixMatch) {
          const pIdx = "abcdefgh".indexOf(prefixMatch[1].toLowerCase());
          if (pIdx >= 0 && pIdx < currentOptions.length) {
            currentOptions[pIdx].isCorrect = true;
          }
        }
      });
    }

    const item: Partial<ScannedQuestion> = {
      id,
      originalRow: itemCounter,
      type,
      stem: currentStem.trim(),
      mediaUrl: currentMediaUrl,
      tags: currentTags,
      options: currentOptions,
    };

    const validation = validateScannedQuestion(item);

    scannedItems.push({
      id,
      originalRow: itemCounter,
      type,
      stem: currentStem.trim(),
      mediaUrl: currentMediaUrl,
      tags: currentTags,
      options: currentOptions,
      isValid: validation.isValid,
      errors: validation.errors,
    });

    // Reset accumulator for next question
    currentStem = "";
    currentOptions = [];
    currentAnswers = [];
    currentTags = [];
    currentType = null;
    currentMediaUrl = null;
  }

  // Regex patterns for Q&A structures
  const questionHeaderRegex = /^(?:q(?:uestion)?\s*[\.\:\-\#]?\s*\d+[\.\:\-\)]|\b\d+[\.\)\:\-]|\[\d+\]|\(\d+\))\s*(.*)/i;
  const standaloneQuestionRegex = /^(?:question\s*\d+|q\s*\d+)$/i;

  // Option prefixes: A), a), (A), [A], Option A:, Choice A, 1), A.
  const optionRegex = /^(?:(?:\*|\(correct\)|\(ans\))\s*)?(?:\(([a-h0-9])\)|\[([a-h0-9])\]|([a-h0-9])[\.\)\:\-]|\b(?:option|choice)\s+([a-h0-9])[\.\)\:\-]?)\s*(.*)/i;
  const inlineCorrectIndicatorRegex = /(?:\*|\(correct\)|\[correct\]|\(ans\)|\(answer\)|\(correct\s*option\))\s*$/i;

  // Answer indicators: Answer: A, Ans. A, Correct Answer: Option A, Right Answer: B, Ans: [C]
  const answerRegex = /^(?:answer|correct\s*answer|correct\s*option|correct\s*choice|right\s*answer|correct|ans|key|solution)\s*(?:is|\=|\:|\-|\.)\s*(.*)/i;
  const typeRegex = /^(?:type|question\s*type|kind)\s*[:\-.]\s*(.*)/i;
  const tagsRegex = /^(?:tags?|category|topic|subject)\s*[:\-.]\s*(.*)/i;
  const mediaRegex = /^(?:media(?:url)?|image(?:url)?)\s*[:\-.]\s*(.*)/i;
  const explanationRegex = /^(?:explanation|rationale|solution\s*notes?|note)\s*[:\-.]\s*(.*)/i;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Skip section divider markers like "---", "===", or Answer Key section lines
    if (line.match(/^[\=\-\_]{3,}$/) || line.match(/^(?:answer\s*key|answers\s*:?|answer\s*sheet)\b/i)) {
      continue;
    }

    const ansMatch = line.match(answerRegex);
    const typeMatch = line.match(typeRegex);
    const tagsMatch = line.match(tagsRegex);
    const mediaMatch = line.match(mediaRegex);
    const expMatch = line.match(explanationRegex);
    const optMatch = line.match(optionRegex);
    const qMatch = line.match(questionHeaderRegex);
    const isStandaloneQ = line.match(standaloneQuestionRegex);

    if (ansMatch) {
      const rawAns = ansMatch[1].trim();
      // Split multiple answers (e.g. "A, B, C" or "A and B" or "1;2")
      const tokens = rawAns
        .split(/[,;&]|\band\b/i)
        .map((a) => a.trim())
        .filter(Boolean);
      currentAnswers.push(...tokens);
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
    } else if (expMatch) {
      // Explanation lines: skip or ignore gracefully
      continue;
    } else if (isStandaloneQ) {
      // Handle "QUESTION 1" on its own line
      pushCurrentQuestion();
      // Lookahead to take next line as stem
      if (i + 1 < lines.length && !lines[i + 1].match(optionRegex) && !lines[i + 1].match(answerRegex)) {
        currentStem = lines[i + 1].trim();
        i++;
      }
    } else if (qMatch && !isOptionLine(line, currentOptions.length)) {
      // New question detected
      pushCurrentQuestion();
      currentStem = qMatch[1].trim() || line;
    } else if (optMatch) {
      // Option line detected
      const labelText = (optMatch[5] || "").trim();
      const hasInlineCorrect =
        line.startsWith("*") ||
        line.toLowerCase().startsWith("(correct)") ||
        line.toLowerCase().startsWith("(ans)") ||
        inlineCorrectIndicatorRegex.test(line);

      const cleanedLabel = labelText.replace(inlineCorrectIndicatorRegex, "").trim();

      currentOptions.push({
        label: cleanedLabel || labelText || line,
        isCorrect: hasInlineCorrect,
      });
    } else {
      // Text continuity
      if (!currentStem) {
        currentStem = line;
      } else if (currentOptions.length === 0 && currentAnswers.length === 0) {
        // Multi-line question stem (e.g. comprehension passages or code snippets)
        currentStem += "\n" + line;
      } else if (currentOptions.length > 0 && currentAnswers.length === 0) {
        // Append multi-line option text
        currentOptions[currentOptions.length - 1].label += " " + line;
      }
    }
  }

  // Push the final question
  pushCurrentQuestion();

  return scannedItems;
}

// Helper to check if a numbered line like "1) ..." is an option rather than a new question
function isOptionLine(line: string, currentOptionsCount: number): boolean {
  // If we already have options and the line starts with an option letter (e.g. B, C, D)
  const letterMatch = line.match(/^([a-hA-H])[\.\)\:\-]\s+/);
  if (letterMatch && currentOptionsCount > 0) {
    return true;
  }
  return false;
}

// Helper to extract a separate Answer Key block at bottom of document
function extractAnswerKeySection(lines: string[]): Map<number, string[]> {
  const map = new Map<number, string[]>();
  let inKeySection = false;

  for (const line of lines) {
    if (line.match(/^(?:answer\s*key|answers|answer\s*sheet|keys?)\s*[:\-]?$/i)) {
      inKeySection = true;
      continue;
    }

    if (inKeySection) {
      // Match patterns like "1. A", "1-A", "1: A", "1) B", "1. (A)", "Q1: A"
      const pairMatches = line.matchAll(/(?:q(?:uestion)?\s*)?(\d+)[\.\:\-\)\s]+(?:\(([a-h0-9]+)\)|\[([a-h0-9]+)\]|([a-h0-9]+))/gi);
      for (const m of pairMatches) {
        const qNum = parseInt(m[1], 10);
        const ans = m[2] || m[3] || m[4];
        if (!isNaN(qNum) && ans) {
          map.set(qNum, [ans.trim()]);
        }
      }
    }
  }

  return map;
}
