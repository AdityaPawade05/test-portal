import { QUESTION_TYPES, questionFieldsSchema, requireCorrectOptionForMcq, type OptionRow, type QuestionType } from "@/lib/schemas/question";

export const MAX_BULK_ROWS = 500;

export type ScannedQuestion = {
  id: string;
  originalRow: number;
  type: QuestionType;
  stem: string;
  mediaUrl?: string | null;
  tags: string[];
  options: OptionRow[];
  isValid: boolean;
  errors: string[];
};

type NormalizedRow = {
  type: QuestionType;
  stem: string;
  mediaUrl: string | null;
  tags: string[];
  options: OptionRow[];
};

export type BulkRowResult =
  | { ok: true; row: NormalizedRow }
  | { ok: false; error: string };

// Minimal RFC4180 CSV parser: handles quoted fields, embedded commas/newlines,
// and doubled-quote escaping.
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }
    if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (c === "\r") {
      // swallow — the following \n (if any) terminates the row
    } else {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

export function rowsToRecords(rows: string[][]): Record<string, string>[] {
  const [headerRow, ...dataRows] = rows;
  if (!headerRow) return [];
  const headers = headerRow.map((h) => h.trim().toLowerCase());

  return dataRows
    .map((r) => {
      const record: Record<string, string> = {};
      headers.forEach((h, i) => {
        if (h) record[h] = (r[i] ?? "").trim();
      });
      return record;
    })
    .filter((record) => Object.values(record).some((v) => v !== ""));
}

export function normalizeBulkRow(raw: Record<string, string>): BulkRowResult {
  const findValue = (...keys: string[]) => {
    for (const key of keys) {
      const target = key.toLowerCase().replace(/[\s_.]+/g, "");
      for (const [rawKey, rawVal] of Object.entries(raw)) {
        const cleanKey = rawKey.toLowerCase().replace(/[\s_.]+/g, "");
        if (
          (cleanKey === target || cleanKey.includes(target)) &&
          rawVal !== undefined &&
          rawVal !== null &&
          String(rawVal).trim() !== ""
        ) {
          return String(rawVal).trim();
        }
      }
    }
    return "";
  };

  let stem = findValue(
    "stem",
    "question",
    "questionstem",
    "questiontext",
    "qtext",
    "prompt",
    "title",
    "q",
    "problem",
    "statement",
    "item",
    "description",
    "content",
    "text",
    "details",
    "questiondetails",
    "query",
  );

  if (!stem) {
    const firstVal = Object.values(raw).find((v) => v && String(v).trim() !== "");
    if (firstVal) {
      stem = String(firstVal).trim();
    }
  }

  if (!stem) {
    return { ok: false, error: "Question stem is required" };
  }

  let typeRaw = findValue("type", "questiontype", "qtype", "kind").toUpperCase();
  if (!typeRaw) {
    const hasOptions =
      findValue("options", "option", "choices", "answers") !== "" ||
      Object.keys(raw).some((k) => /^(option|choice)[_\s]*[a-d1-9]/i.test(k.trim()));
    typeRaw = hasOptions ? "MCQ_SINGLE" : "NUMERIC";
  }

  if (!QUESTION_TYPES.includes(typeRaw as QuestionType)) {
    return {
      ok: false,
      error: `invalid type "${typeRaw}" — expected one of ${QUESTION_TYPES.join(", ")}`,
    };
  }
  const type = typeRaw as QuestionType;

  const mediaUrl = findValue("mediaurl", "media_url", "image", "imageurl") || null;
  const tagsRaw = findValue("tags", "tag", "category", "subject", "topic");
  const tags = tagsRaw
    .split(/[,;]/)
    .map((t) => t.trim())
    .filter(Boolean);

  if (type === "NUMERIC") {
    return { ok: true, row: { type, stem, mediaUrl, tags, options: [] } };
  }

  let optionLabels: string[] = [];
  const optionsRaw = findValue("options", "option", "choices", "answers");
  if (optionsRaw) {
    optionLabels = optionsRaw
      .split(/[;\n|]/)
      .map((o) => o.trim())
      .filter(Boolean);
  } else {
    const optionEntries: { index: number; label: string }[] = [];
    for (const [rawKey, rawVal] of Object.entries(raw)) {
      if (!rawVal || !String(rawVal).trim()) continue;
      const cleanKey = rawKey.toLowerCase().replace(/[\s_]+/g, "");
      const matchLetter = cleanKey.match(/^option([a-z])$/);
      const matchNum = cleanKey.match(/^option([1-9])$/);
      if (matchLetter) {
        const idx = "abcdefghijklmnopqrstuvwxyz".indexOf(matchLetter[1]);
        optionEntries.push({ index: idx, label: String(rawVal).trim() });
      } else if (matchNum) {
        const idx = parseInt(matchNum[1], 10) - 1;
        optionEntries.push({ index: idx, label: String(rawVal).trim() });
      }
    }
    optionEntries.sort((a, b) => a.index - b.index);
    optionLabels = optionEntries.map((e) => e.label);
  }

  if (optionLabels.length === 0) {
    return { ok: false, error: `options are required for type ${type}` };
  }

  const correctRaw = findValue(
    "correctoptions",
    "correctoption",
    "correct_options",
    "correct_option",
    "correct",
    "answer",
    "correctanswer",
    "rightanswer",
  );
  const correctTokens = correctRaw
    .split(/[,;|\n]/)
    .map((c) => c.trim())
    .filter(Boolean);
  const correctIndices: number[] = [];

  for (const token of correctTokens) {
    const n = Number(token);
    if (Number.isInteger(n) && n >= 1 && n <= optionLabels.length) {
      correctIndices.push(n);
    } else {
      const letterIndex = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".indexOf(token.toUpperCase());
      if (letterIndex >= 0 && letterIndex < optionLabels.length) {
        correctIndices.push(letterIndex + 1);
      } else {
        const labelIdx = optionLabels.findIndex((l) => l.toLowerCase() === token.toLowerCase());
        if (labelIdx >= 0) {
          correctIndices.push(labelIdx + 1);
        } else {
          return {
            ok: false,
            error: `correctOptions must be 1-based indices (1-${optionLabels.length}), letters (A, B...), or option text, got "${token}"`,
          };
        }
      }
    }
  }

  if (type === "MCQ_SINGLE" && correctIndices.length > 1) {
    return { ok: false, error: "MCQ_SINGLE allows only one correct option" };
  }

  const options: OptionRow[] = optionLabels.map((label, i) => ({
    label,
    isCorrect: correctIndices.includes(i + 1),
  }));

  return { ok: true, row: { type, stem, mediaUrl, tags, options } };
}

export function validateScannedQuestion(q: Partial<ScannedQuestion>): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!q.stem || !q.stem.trim()) {
    errors.push("Question stem is required");
  }

  if (!q.type || !QUESTION_TYPES.includes(q.type)) {
    errors.push(`Invalid type "${q.type ?? ""}" — expected one of ${QUESTION_TYPES.join(", ")}`);
  }

  const type = q.type || "MCQ_SINGLE";
  const options = q.options || [];

  if (type === "MCQ_SINGLE" || type === "MCQ_MULTI") {
    if (options.length === 0) {
      errors.push(`At least one option is required for ${type}`);
    } else {
      if (options.some((o) => !o.label.trim())) {
        errors.push("Option labels cannot be empty");
      }
      const mcqError = requireCorrectOptionForMcq(type, options);
      if (mcqError) {
        errors.push(mcqError);
      }
      if (type === "MCQ_SINGLE" && options.filter((o) => o.isCorrect).length > 1) {
        errors.push("MCQ_SINGLE allows only one correct option");
      }
    }
  }

  if (q.mediaUrl) {
    try {
      new URL(q.mediaUrl);
    } catch {
      errors.push("Media URL must be a valid URL (http://... or https://...)");
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

