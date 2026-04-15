import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";

if (typeof window !== "undefined") {
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/legacy/build/pdf.worker.min.mjs",
    import.meta.url
  ).toString();
}

/*
  This module is intentionally split into two layers:

  1. PDF text extraction
     We first turn the PDF into clean page + line structures. That gives the parser
     something deterministic to reason about.

  2. Syllabus task extraction
     This is the "AI replacement" layer. Instead of asking a model to infer deadlines,
     we explicitly encode what we trust:
     - strong date patterns
     - academic task keywords
     - helpful section headings such as "Important Dates" or "Assignments"
     - semester bounds when available

  The parser is conservative by design. A smaller review queue with strong candidates
  is better than a noisy list that makes students do transcription work again.
*/

/**
 * @typedef {Object} TextRun
 * @property {string} str
 * @property {number} x
 * @property {number} y
 * @property {number} width
 * @property {number} height
 * @property {boolean} hasEOL
 */

/**
 * @typedef {Object} DateMatch
 * @property {string} rawText
 * @property {string} isoDate
 * @property {number} index
 * @property {"month_first" | "day_first" | "numeric"} kind
 */

/**
 * @typedef {"important_dates" | "schedule" | "assignments" | "assessment" | "policy" | "neutral"} SectionHint
 */

/**
 * @typedef {Object} ParsedPDFChunk
 * @property {number} pageNumber
 * @property {string} text
 * @property {number} indexStart
 * @property {number} indexEnd
 * @property {{ left: number, top: number, width: number, height: number }} bounds
 */

/**
 * @typedef {Object} ParsedPDFPage
 * @property {number} pageNumber
 * @property {string} text
 * @property {ParsedPDFChunk[]} lines
 * @property {number} indexStart
 * @property {number} indexEnd
 * @property {number} width
 * @property {number} height
 */

/**
 * @typedef {Object} ParseWarning
 * @property {"page_has_no_extractable_text" | "pdf_has_no_extractable_text" | "page_has_poor_line_structure"} code
 * @property {string} message
 * @property {number | undefined} [pageNumber]
 */

/**
 * @typedef {Object} ParseResult
 * @property {string} text
 * @property {ParsedPDFPage[]} pages
 * @property {ParsedPDFChunk[]} chunks
 * @property {ParseWarning[]} warnings
 * @property {boolean} hasExtractableText
 * @property {{ pages: number }} metadata
 */

/**
 * @typedef {Object} SemesterAnchor
 * @property {string | undefined} [startDateISO]
 * @property {string | undefined} [endDateISO]
 * @property {number | undefined} [defaultYear]
 */

/**
 * @typedef {"assignment" | "quiz" | "lab" | "project" | "midterm" | "final" | "exam" | "reading" | "presentation" | "other"} AcademicTaskType
 */

/**
 * @typedef {Object} ParserReason
 * @property {string} code
 * @property {"positive" | "negative" | "neutral"} impact
 * @property {string} detail
 */

/**
 * @typedef {Object} TaskCandidate
 * @property {string} id
 * @property {string} title
 * @property {AcademicTaskType} type
 * @property {string} dueDateISO
 * @property {number} confidence
 * @property {number} pageNumber
 * @property {string} sourceText
 * @property {number} sourceIndexStart
 * @property {number} sourceIndexEnd
 * @property {string} matchedDateText
 * @property {string[]} matchedKeywords
 * @property {SectionHint} sectionHint
 * @property {ParserReason[]} reasons
 * @property {{ left: number, top: number, width: number, height: number }} sourceBounds
 */

/**
 * @typedef {Object} SyllabusParseOptions
 * @property {SemesterAnchor | undefined} [semester]
 * @property {number | undefined} [minConfidence]
 */

/**
 * @typedef {ParseResult & { tasks: TaskCandidate[] }} SyllabusParseResult
 */

/**
 * @typedef {Object} LineContext
 * @property {number} pageNumber
 * @property {string} text
 * @property {string} normalizedText
 * @property {number} indexStart
 * @property {number} indexEnd
 * @property {SectionHint} sectionHint
 * @property {{ left: number, top: number, width: number, height: number }} bounds
 */

/**
 * @typedef {Object} CandidateWindow
 * @property {number} pageNumber
 * @property {string} text
 * @property {string} normalizedText
 * @property {number} indexStart
 * @property {number} indexEnd
 * @property {SectionHint} sectionHint
 * @property {{ left: number, top: number, width: number, height: number }} bounds
 */

const MONTH_INDEX_BY_TOKEN = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

const TASK_TYPE_SIGNALS = {
  assignment: ["assignment", "homework", "problem set", "pset"],
  quiz: ["quiz", "test"],
  lab: ["lab", "laboratory"],
  project: ["project", "proposal", "essay", "paper"],
  midterm: ["midterm", "mid-term"],
  final: ["final exam", "final project", "final paper", "final presentation"],
  exam: ["exam", "examination"],
  reading: ["response paper", "reading response", "reading quiz", "reading check"],
  presentation: ["presentation", "present"],
  other: [],
};

const DIRECT_DUE_SIGNALS = [
  "due",
  "deadline",
  "submit",
  "submission",
  "uploaded",
  "upload",
  "held on",
  "scheduled for",
  "takes place",
];

const NEGATIVE_CONTEXT_PATTERNS = [
  /\boffice hours\b/i,
  /\bcontact\b/i,
  /\bemail\b/i,
  /\battendance\b/i,
  /\bacademic integrity\b/i,
  /\blate policy\b/i,
  /\bgrading scale\b/i,
  /\blecture\b/i,
  /\bclass meets\b/i,
  /\bwebsite\b/i,
  /\bdiscussion section\b/i,
  /\breading week\b/i,
  /\bno classes\b/i,
  /\buniversity closed\b/i,
  /\bif granted\b/i,
  /\bdeferred\b/i,
  /\bexam outline\b/i,
  /\bkeywords?\b/i,
  /\bapply\b/i,
  /\bapplication\b/i,
  /\bhome faculty\b/i,
  /\bdean'?s office\b/i,
];

const HARD_SUPPRESSION_PATTERNS = [
  /\bpp?\.\s*\d+\s*[-–]\s*\d+\b/i,
  /\breading week\b/i,
  /\bno classes\b/i,
  /\buniversity closed\b/i,
];

const TABLE_HEADER_PATTERNS = [
  /\bassessment weighting\b/gi,
  /\bassessment weight(?:ing)?\b/gi,
  /\bexam date\b/gi,
  /\bdue date\b/gi,
  /\bdate\b/gi,
  /\bweight\b/gi,
];

const MONTH_NAME_PATTERN =
  "(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";

const WEEKDAY_PATTERN =
  "(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tues?|wed|thu(?:rs)?|fri|sat|sun)";

function normalizeWhitespace(value) {
  return value.replace(/\s+/g, " ").trim();
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

/**
 * @param {ParserReason[]} reasons
 * @param {"positive" | "negative" | "neutral"} impact
 * @param {string} code
 * @param {string} detail
 */
function addReason(reasons, impact, code, detail) {
  reasons.push({ impact, code, detail });
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizeForKey(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function unionBounds(first, second) {
  const left = Math.min(first.left, second.left);
  const top = Math.min(first.top, second.top);
  const right = Math.max(first.left + first.width, second.left + second.width);
  const bottom = Math.max(first.top + first.height, second.top + second.height);

  return {
    left,
    top,
    width: right - left,
    height: bottom - top,
  };
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function safeISODate(year, month, day) {
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    Number.isNaN(date.getTime()) ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() + 1 !== month ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return `${year}-${pad2(month)}-${pad2(day)}`;
}

function parseExplicitYear(rawYear) {
  if (!rawYear) return null;
  const numeric = Number(rawYear);
  if (!Number.isFinite(numeric)) return null;
  if (rawYear.length === 2) {
    return numeric >= 70 ? 1900 + numeric : 2000 + numeric;
  }
  return numeric;
}

function parseMonthToken(token) {
  const cleaned = token.toLowerCase().replace(/\./g, "");
  return MONTH_INDEX_BY_TOKEN[cleaned] ?? null;
}

function parseSemesterDate(value) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * @param {string} isoDate
 * @param {SemesterAnchor | undefined} semester
 */
function isWithinSemester(isoDate, semester) {
  const start = parseSemesterDate(semester?.startDateISO);
  const end = parseSemesterDate(semester?.endDateISO);
  if (!start || !end) return null;

  const date = parseSemesterDate(isoDate);
  if (!date) return null;
  return date >= start && date <= end;
}

/**
 * @param {number} month
 * @param {number} day
 * @param {number | null} explicitYear
 * @param {SemesterAnchor | undefined} semester
 */
function resolveYear(month, day, explicitYear, semester) {
  if (explicitYear) {
    return explicitYear;
  }

  const start = parseSemesterDate(semester?.startDateISO);
  const end = parseSemesterDate(semester?.endDateISO);
  const nowYear = new Date().getFullYear();
  const candidateYears = Array.from(
    new Set([semester?.defaultYear, start?.getUTCFullYear(), end?.getUTCFullYear(), nowYear, nowYear + 1].filter(Boolean))
  );

  if (start && end) {
    for (const year of candidateYears) {
      const isoDate = safeISODate(year, month, day);
      if (!isoDate) continue;
      if (isWithinSemester(isoDate, semester)) return year;
    }
  }

  return candidateYears[0] ?? nowYear;
}

function containsSignal(text, signal) {
  const escaped = escapeRegExp(signal);
  return new RegExp(`\\b${escaped}\\b`, "i").test(text);
}

function hasDirectDueSignal(text) {
  return DIRECT_DUE_SIGNALS.some((signal) => containsSignal(text, signal));
}

function hasStrongTaskType(type) {
  return type !== "other" && type !== "reading";
}

function matchedTaskSignals(text) {
  const matches = [];

  for (const signal of DIRECT_DUE_SIGNALS) {
    if (containsSignal(text, signal)) {
      matches.push(signal);
    }
  }

  for (const signals of Object.values(TASK_TYPE_SIGNALS)) {
    for (const signal of signals) {
      if (containsSignal(text, signal)) {
        matches.push(signal);
      }
    }
  }

  return Array.from(new Set(matches));
}

/**
 * @param {string} text
 * @returns {AcademicTaskType}
 */
function inferTaskType(text) {
  for (const [type, signals] of Object.entries(TASK_TYPE_SIGNALS)) {
    if (signals.some((signal) => containsSignal(text, signal))) {
      return type;
    }
  }

  return "other";
}

/**
 * @param {AcademicTaskType} type
 */
function fallbackTitle(type) {
  switch (type) {
    case "assignment":
      return "Assignment";
    case "quiz":
      return "Quiz";
    case "lab":
      return "Lab";
    case "project":
      return "Project";
    case "midterm":
      return "Midterm";
    case "final":
      return "Final";
    case "exam":
      return "Exam";
    case "reading":
      return "Reading";
    case "presentation":
      return "Presentation";
    default:
      return "Academic task";
  }
}

function looksLikeHeading(text) {
  const normalized = normalizeWhitespace(text);
  if (!normalized || normalized.length > 72) return false;
  if (/[.?!]$/.test(normalized)) return false;
  if (/\d{1,2}[/-]\d{1,2}/.test(normalized)) return false;

  const lettersOnly = normalized.replace(/[^a-z]/gi, "");
  const uppercaseRatio =
    lettersOnly.length === 0
      ? 0
      : lettersOnly.split("").filter((char) => char === char.toUpperCase()).length / lettersOnly.length;

  return uppercaseRatio > 0.75 || /^[A-Z][A-Za-z/&,\- ]+$/.test(normalized);
}

/**
 * @param {string} text
 * @returns {SectionHint}
 */
function classifySectionHint(text) {
  const lower = text.toLowerCase();

  if (/(important dates|key dates|due dates|deadlines)/i.test(lower)) return "important_dates";
  if (/(course schedule|weekly schedule|calendar|timeline|schedule)/i.test(lower)) return "schedule";
  if (/(assignments|projects|labs|problem sets|quizzes)/i.test(lower)) return "assignments";
  if (/(evaluation|assessment|grading breakdown|assessments)/i.test(lower)) return "assessment";
  if (/(policy|attendance|integrity|communication|contact|resources|deferred final|missed term work|absence from exams)/i.test(lower)) return "policy";
  return "neutral";
}

/**
 * @param {string} text
 * @param {SemesterAnchor | undefined} semester
 * @returns {DateMatch[]}
 */
function extractDateMatches(text, semester) {
  const matches = [];

  const monthFirst = new RegExp(
    `\\b(?:${WEEKDAY_PATTERN}\\s*,?\\s+)?(${MONTH_NAME_PATTERN})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:\\s*[-–]\\s*(\\d{1,2})(?:st|nd|rd|th)?)?(?:,?\\s*(\\d{2,4}))?\\b`,
    "gi"
  );
  const dayFirst = new RegExp(
    `\\b(\\d{1,2})(?:st|nd|rd|th)?(?:\\s*[-–]\\s*(\\d{1,2})(?:st|nd|rd|th)?)?\\s+(${MONTH_NAME_PATTERN})\\.?\\s*(\\d{2,4})?\\b`,
    "gi"
  );
  const numeric = /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/g;

  let match;

  while ((match = monthFirst.exec(text)) !== null) {
    const month = parseMonthToken(match[1]);
    const day = Number(match[2]);
    const year = resolveYear(month ?? 0, day, parseExplicitYear(match[4]), semester);
    if (!month) continue;
    const isoDate = safeISODate(year, month, day);
    if (!isoDate) continue;

    matches.push({
      rawText: match[0],
      isoDate,
      index: match.index,
      kind: "month_first",
    });
  }

  while ((match = dayFirst.exec(text)) !== null) {
    const day = Number(match[1]);
    const month = parseMonthToken(match[3]);
    const year = resolveYear(month ?? 0, day, parseExplicitYear(match[4]), semester);
    if (!month) continue;
    const isoDate = safeISODate(year, month, day);
    if (!isoDate) continue;

    matches.push({
      rawText: match[0],
      isoDate,
      index: match.index,
      kind: "day_first",
    });
  }

  while ((match = numeric.exec(text)) !== null) {
    const month = Number(match[1]);
    const day = Number(match[2]);
    if (month > 12 || day > 31) continue;
    const year = resolveYear(month, day, parseExplicitYear(match[3]), semester);
    const isoDate = safeISODate(year, month, day);
    if (!isoDate) continue;

    matches.push({
      rawText: match[0],
      isoDate,
      index: match.index,
      kind: "numeric",
    });
  }

  return matches.sort((a, b) => a.index - b.index);
}

/**
 * @param {string} sourceText
 * @param {string} matchedDateText
 * @param {AcademicTaskType} type
 */
function deriveTitle(sourceText, matchedDateText, type) {
  let cleaned = sourceText;

  cleaned = cleaned.replace(new RegExp(escapeRegExp(matchedDateText), "ig"), " ");
  cleaned = cleaned.replace(new RegExp(`\\b${WEEKDAY_PATTERN}\\b`, "gi"), " ");
  for (const pattern of TABLE_HEADER_PATTERNS) {
    cleaned = cleaned.replace(pattern, " ");
  }
  cleaned = cleaned.replace(/\b(due|deadline|submit|submission|uploaded|upload|on|by|at|before|after|held|scheduled)\b/gi, " ");
  cleaned = cleaned.replace(/\b\d{1,3}\s*%/g, " ");
  cleaned = cleaned.replace(/\bworth\s+\d{1,3}\s*%?/gi, " ");
  cleaned = cleaned.replace(/\b([01]?\d|2[0-3]):[0-5]\d\b/gi, " ");
  cleaned = cleaned.replace(/\b(1[0-2]|0?[1-9])(?::[0-5]\d)?\s*(am|pm)\b/gi, " ");
  cleaned = cleaned.replace(/[|•●▪■]/g, " ");
  cleaned = cleaned.replace(/\(\s*\d{1,3}\s*%?\s*\)/gi, " ");
  cleaned = cleaned.replace(/\bweek\s+\d+(?:\s*(?:to|-)\s*\d+)?\b/gi, " ");
  cleaned = cleaned.replace(/\bmodule\s+\d+\b/gi, " ");
  cleaned = cleaned.replace(/\b\d+\s*hours?\b/gi, " ");
  cleaned = cleaned.replace(/\b(?:tentative date|tentative|location tba|exam week)\b/gi, " ");
  cleaned = cleaned.replace(/\b(?:can be completed during|duration of)\b/gi, " ");
  cleaned = cleaned.replace(/[()]/g, " ");
  cleaned = cleaned.replace(/\s*,\s*/g, " ");
  cleaned = cleaned.replace(/\s+\.\s*/g, " ");
  cleaned = cleaned.replace(/\s*[-:–—]\s*/g, " ");
  cleaned = normalizeWhitespace(cleaned);
  cleaned = cleaned.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, "");

  if (!cleaned) return fallbackTitle(type);
  if (cleaned.length > 90) {
    cleaned = `${cleaned.slice(0, 87).trim()}...`;
  }

  return cleaned;
}

function isLowSignalTitle(title) {
  const normalized = normalizeForKey(title);
  const tokens = normalized.split(" ").filter(Boolean);

  if (tokens.length === 0) return true;
  if (normalized.length < 4) return true;
  if (tokens.length === 1 && tokens[0].length < 4) return true;
  if (!/[a-z0-9]/i.test(title)) return true;

  return false;
}

function titlesLookEquivalent(firstTitle, secondTitle) {
  const first = normalizeForKey(firstTitle);
  const second = normalizeForKey(secondTitle);

  if (!first || !second) return false;
  if (first === second) return true;
  if (first.startsWith(second) || second.startsWith(first)) return true;

  const firstTokens = new Set(first.split(" ").filter(Boolean));
  const secondTokens = new Set(second.split(" ").filter(Boolean));
  const sharedCount = [...firstTokens].filter((token) => secondTokens.has(token)).length;
  const smallerSize = Math.min(firstTokens.size, secondTokens.size);

  return smallerSize > 0 && sharedCount / smallerSize >= 0.75;
}

function shouldMergeAdjacentLines(current, next, semester) {
  if (!next || next.pageNumber !== current.pageNumber || current.normalizedText.length > 96) {
    return false;
  }

  const currentDateCount = extractDateMatches(current.normalizedText, semester).length;
  const nextDateCount = extractDateMatches(next.normalizedText, semester).length;
  const currentSignalCount = matchedTaskSignals(current.normalizedText).length;
  const nextSignalCount = matchedTaskSignals(next.normalizedText).length;

  const currentIsStandalone = currentDateCount > 0 && currentSignalCount > 0;
  const nextIsStandalone = nextDateCount > 0 && nextSignalCount > 0;

  if (currentIsStandalone || nextIsStandalone) {
    return false;
  }

  const oneSideCarriesDate = (currentDateCount === 0 && nextDateCount === 1) || (currentDateCount === 1 && nextDateCount === 0);
  const oneSideCarriesTaskSignal = (currentSignalCount === 0 && nextSignalCount > 0) || (currentSignalCount > 0 && nextSignalCount === 0);

  return oneSideCarriesDate && oneSideCarriesTaskSignal;
}

/**
 * @param {ParseResult} result
 * @returns {LineContext[]}
 */
function buildLineContexts(result) {
  const contexts = [];

  for (const page of result.pages) {
    let activeSection = "neutral";

    for (const line of page.lines) {
      const normalizedText = normalizeWhitespace(line.text);
      if (!normalizedText) continue;

      if (looksLikeHeading(normalizedText)) {
        const hintedSection = classifySectionHint(normalizedText);
        if (hintedSection !== "neutral") {
          activeSection = hintedSection;
        }
      }

      contexts.push({
        pageNumber: page.pageNumber,
        text: line.text,
        normalizedText,
        indexStart: line.indexStart,
        indexEnd: line.indexEnd,
        sectionHint: activeSection,
        bounds: line.bounds,
      });
    }
  }

  return contexts;
}

/**
 * @param {LineContext[]} lines
 * @returns {CandidateWindow[]}
 */
function buildCandidateWindows(lines, semester) {
  const windows = [];

  for (let index = 0; index < lines.length; index++) {
    const current = lines[index];
    windows.push({
      pageNumber: current.pageNumber,
      text: current.text,
      normalizedText: current.normalizedText,
      indexStart: current.indexStart,
      indexEnd: current.indexEnd,
      sectionHint: current.sectionHint,
      bounds: current.bounds,
    });

    const next = lines[index + 1];

    /*
      A lot of syllabi split meaning across two adjacent lines:
      - line 1: "Assignment 2"
      - line 2: "Due Oct 14"

      We merge short neighboring lines on the same page so the parser can recover
      that structure without needing layout AI.
    */
    if (shouldMergeAdjacentLines(current, next, semester)) {
      windows.push({
        pageNumber: current.pageNumber,
        text: `${current.text} ${next.text}`,
        normalizedText: normalizeWhitespace(`${current.text} ${next.text}`),
        indexStart: current.indexStart,
        indexEnd: next.indexEnd,
        sectionHint: current.sectionHint !== "neutral" ? current.sectionHint : next.sectionHint,
        bounds: unionBounds(current.bounds, next.bounds),
      });
    }
  }

  return windows;
}

/**
 * @param {CandidateWindow} window
 * @param {DateMatch} dateMatch
 * @param {string} title
 * @param {AcademicTaskType} type
 * @param {string[]} matchedKeywords
 * @param {SemesterAnchor | undefined} semester
 */
function scoreCandidate(window, dateMatch, title, type, matchedKeywords, semester) {
  const reasons = [];
  let score = 26;

  addReason(reasons, "neutral", "date_detected", `Matched date pattern "${dateMatch.rawText}".`);

  if (matchedKeywords.some((keyword) => DIRECT_DUE_SIGNALS.includes(keyword))) {
    score += 18;
    addReason(reasons, "positive", "direct_due_signal", "Found explicit due language near the date.");
  }

  if (type !== "other") {
    score += 14;
    addReason(reasons, "positive", "task_keyword", `Detected a recognizable academic task type (${type}).`);
  }

  if (window.sectionHint === "important_dates" || window.sectionHint === "assignments" || window.sectionHint === "assessment") {
    score += 12;
    addReason(reasons, "positive", "helpful_section", `The line appears inside a high-signal section (${window.sectionHint}).`);
  }

  if (window.sectionHint === "schedule") {
    score += 7;
    addReason(reasons, "positive", "schedule_section", "The line appears inside a schedule-like section.");
  }

  if (window.sectionHint === "policy") {
    score -= 22;
    addReason(reasons, "negative", "policy_section", "Policy sections often mention dates that are not actionable tasks.");
  }

  if (HARD_SUPPRESSION_PATTERNS.some((pattern) => pattern.test(window.text))) {
    score -= 36;
    addReason(reasons, "negative", "non_actionable_window", "This looks like a schedule marker or page range rather than a real deadline.");
  }

  if (/\bweek(?:\s+of|\s+\d+)\b/i.test(window.text) && !hasDirectDueSignal(window.normalizedText) && !hasStrongTaskType(type)) {
    score -= 24;
    addReason(reasons, "negative", "week_range_context", "Week-range lines are usually planning context, not actionable tasks.");
  }

  if (type === "reading" && !hasDirectDueSignal(window.normalizedText)) {
    score -= 28;
    addReason(reasons, "negative", "reading_context", "Weekly reading references create too much noise unless they have an explicit due signal.");
  }

  const semesterFit = isWithinSemester(dateMatch.isoDate, semester);
  if (semesterFit === true) {
    score += 12;
    addReason(reasons, "positive", "within_semester", "The detected date falls inside the semester anchor.");
  } else if (semesterFit === false) {
    score -= 18;
    addReason(reasons, "negative", "outside_semester", "The detected date sits outside the provided semester range.");
  }

  if (title !== fallbackTitle(type) && title.length >= 4 && title.length <= 70) {
    score += 8;
    addReason(reasons, "positive", "clean_title", "The extracted task title looks short and readable.");
  } else {
    score -= 8;
    addReason(reasons, "negative", "weak_title", "The title had to fall back to a generic label.");
  }

  if (isLowSignalTitle(title)) {
    score -= 26;
    addReason(reasons, "negative", "low_signal_title", "The extracted title is too fragmentary to trust.");
  }

  if (window.normalizedText.length >= 10 && window.normalizedText.length <= 160) {
    score += 6;
    addReason(reasons, "positive", "good_line_shape", "The source line looks like a structured schedule entry.");
  }

  const negativeSignals = NEGATIVE_CONTEXT_PATTERNS.filter((pattern) => pattern.test(window.text));
  if (negativeSignals.length > 0) {
    score -= 28;
    addReason(reasons, "negative", "policy_like_language", "The line also contains signals commonly found in non-task policy text.");
  }

  const dateCount = extractDateMatches(window.normalizedText, semester).length;
  if (dateCount > 1) {
    score -= 14;
    addReason(reasons, "negative", "multiple_dates", "Multiple dates in the same window usually make the line more ambiguous.");
  } else {
    score += 6;
    addReason(reasons, "positive", "single_date", "A single date is easier to map to one actionable task.");
  }

  if (matchedKeywords.length === 0 && window.sectionHint === "neutral") {
    score -= 18;
    addReason(reasons, "negative", "weak_task_signal", "There is a date here, but not enough academic task language around it.");
  }

  if (window.normalizedText.length > 220) {
    score -= 10;
    addReason(reasons, "negative", "long_paragraph", "Long paragraphs are more likely to hide contextual dates than direct tasks.");
  }

  return {
    confidence: clamp(score, 0, 100),
    reasons,
  };
}

function shouldSuppressCandidate(window, dateMatch, type, matchedKeywords, title) {
  if (HARD_SUPPRESSION_PATTERNS.some((pattern) => pattern.test(window.text)) && !hasStrongTaskType(type)) {
    return true;
  }

  if (/\bif granted\b/i.test(window.text) || /\bdeferred\b/i.test(window.text)) {
    return true;
  }

  if (/\bweek(?:\s+of|\s+\d+)\b/i.test(window.text) && !hasDirectDueSignal(window.normalizedText) && !hasStrongTaskType(type)) {
    return true;
  }

  if (type === "reading" && !hasDirectDueSignal(window.normalizedText)) {
    return true;
  }

  if (dateMatch.kind === "numeric" && /\bpp?\.\s*\d+\s*[-–]\s*\d+\b/i.test(window.text)) {
    return true;
  }

  if (/\bexam outline\b/i.test(window.text) && type === "exam") {
    return true;
  }

  if (matchedKeywords.length === 0 && /\b(tentative date|location tba)\b/i.test(window.text)) {
    return true;
  }

  if (isLowSignalTitle(title)) {
    return true;
  }

  if (/\bthis exam will be\b/i.test(window.text) || /\bcan be completed during\b/i.test(window.text)) {
    return true;
  }

  return false;
}

/**
 * @param {TaskCandidate[]} candidates
 * @returns {TaskCandidate[]}
 */
function dedupeCandidates(candidates) {
  const deduped = [];

  for (const candidate of candidates) {
    const existingIndex = deduped.findIndex((existing) => {
      if (existing.dueDateISO !== candidate.dueDateISO) return false;
      if (existing.type !== candidate.type) return false;
      return titlesLookEquivalent(existing.title, candidate.title);
    });

    if (existingIndex === -1) {
      deduped.push(candidate);
      continue;
    }

    const existing = deduped[existingIndex];
    const shouldReplace =
      candidate.confidence > existing.confidence ||
      (candidate.confidence === existing.confidence && candidate.title.length < existing.title.length);

    if (shouldReplace) {
      deduped[existingIndex] = candidate;
    }
  }

  return deduped.sort((a, b) => {
    if (a.dueDateISO === b.dueDateISO) {
      return b.confidence - a.confidence;
    }

    return a.dueDateISO.localeCompare(b.dueDateISO);
  });
}

/**
 * @param {unknown[]} items
 * @returns {TextRun[]}
 */
function toTextRuns(items) {
  return items
    .map((item) => {
      if (!item || typeof item !== "object" || !("str" in item) || !("transform" in item)) {
        return null;
      }

      const textItem = item;
      const transform = Array.isArray(textItem.transform) ? textItem.transform : null;
      const x = transform?.[4];
      const y = transform?.[5];

      return {
        str: typeof textItem.str === "string" ? textItem.str : "",
        x: typeof x === "number" ? x : 0,
        y: typeof y === "number" ? y : 0,
        width: typeof textItem.width === "number" ? textItem.width : 0,
        height: typeof textItem.height === "number" ? textItem.height : 0,
        hasEOL: textItem.hasEOL === true,
      };
    })
    .filter((run) => run !== null && run.str.trim().length > 0);
}

/**
 * @param {TextRun} previous
 * @param {TextRun} current
 */
function isSameLine(previous, current) {
  const lineTolerance = Math.max(2, Math.min(Math.abs(previous.height) || 8, Math.abs(current.height) || 8) * 0.6);
  return Math.abs(previous.y - current.y) <= lineTolerance;
}

/**
 * @param {TextRun} previous
 * @param {TextRun} current
 */
function shouldInsertSpace(previous, current) {
  if (previous.str.endsWith("-")) return false;
  if (/^[,.;:!?%)]/.test(current.str)) return false;
  if (/[(/]$/.test(previous.str)) return false;

  const gap = current.x - (previous.x + previous.width);
  return gap > Math.max(1.5, Math.min(Math.abs(previous.height) || 8, 6) * 0.15);
}

/**
 * @param {TextRun[]} runs
 */
function joinLineRuns(runs) {
  if (runs.length === 0) return "";

  const ordered = [...runs].sort((a, b) => a.x - b.x);
  let text = ordered[0].str;

  for (let i = 1; i < ordered.length; i++) {
    const previous = ordered[i - 1];
    const current = ordered[i];
    text += shouldInsertSpace(previous, current) ? ` ${current.str}` : current.str;
  }

  return normalizeWhitespace(text);
}

/**
 * @param {TextRun[]} runs
 * @returns {TextRun[][]}
 */
function groupRunsIntoLines(runs) {
  const lines = [];
  let current = [];

  for (const run of runs) {
    const previous = current[current.length - 1];

    if (!previous) {
      current = [run];
    } else if (isSameLine(previous, run)) {
      current.push(run);
    } else {
      lines.push(current);
      current = [run];
    }

    if (run.hasEOL && current.length > 0) {
      lines.push(current);
      current = [];
    }
  }

  if (current.length > 0) {
    lines.push(current);
  }

  return lines;
}

/**
 * @param {TextRun[]} runs
 * @param {number} pageHeight
 */
function getLineBounds(runs, pageHeight) {
  const boxes = runs.map((run) => {
    const height = Math.max(Math.abs(run.height) || 0, 10);
    const top = pageHeight - run.y - height;

    return {
      left: run.x,
      top,
      width: Math.max(run.width || 0, 6),
      height,
    };
  });

  const left = Math.min(...boxes.map((box) => box.left));
  const top = Math.min(...boxes.map((box) => box.top));
  const right = Math.max(...boxes.map((box) => box.left + box.width));
  const bottom = Math.max(...boxes.map((box) => box.top + box.height));

  return {
    left,
    top,
    width: right - left,
    height: bottom - top,
  };
}

/**
 * @param {ParseResult} result
 * @param {SyllabusParseOptions} [options={}]
 * @returns {TaskCandidate[]}
 */
export function extractAcademicTasks(result, options = {}) {
  const minConfidence = options.minConfidence ?? 52;
  const lineContexts = buildLineContexts(result);
  const windows = buildCandidateWindows(lineContexts, options.semester);
  const candidates = [];

  for (const window of windows) {
    const dateMatches = extractDateMatches(window.normalizedText, options.semester);
    if (dateMatches.length === 0) continue;

    /*
      We only treat a date as a task candidate when there is some academic evidence
      nearby. This is the main anti-noise rule that keeps policy dates, meeting times,
      and other course metadata from flooding the review queue.
    */
    const matchedKeywords = matchedTaskSignals(window.normalizedText);
    const type = inferTaskType(window.normalizedText);

    for (const dateMatch of dateMatches) {
      const title = deriveTitle(window.normalizedText, dateMatch.rawText, type);
      if (shouldSuppressCandidate(window, dateMatch, type, matchedKeywords, title)) {
        continue;
      }
      const scored = scoreCandidate(window, dateMatch, title, type, matchedKeywords, options.semester);

      if (scored.confidence < minConfidence) {
        continue;
      }

      candidates.push({
        id: `task-${window.pageNumber}-${window.indexStart}-${dateMatch.isoDate}-${normalizeForKey(title).slice(0, 24)}`,
        title,
        type,
        dueDateISO: dateMatch.isoDate,
        confidence: scored.confidence,
        pageNumber: window.pageNumber,
        sourceText: window.text,
        sourceIndexStart: window.indexStart,
        sourceIndexEnd: window.indexEnd,
        matchedDateText: dateMatch.rawText,
        matchedKeywords,
        sectionHint: window.sectionHint,
        reasons: scored.reasons,
        sourceBounds: window.bounds,
      });
    }
  }

  return dedupeCandidates(candidates);
}

/**
 * @param {File} file
 * @returns {Promise<ParseResult>}
 */
export async function parsePDF(file) {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const documentParams = {
      data: arrayBuffer,
      disableWorker: true,
    };

    const loadingTask = pdfjs.getDocument(documentParams);
    const pdf = await loadingTask.promise;

    let fullText = "";
    const pages = [];
    const chunks = [];
    const warnings = [];

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: 1 });
      const textContent = await page.getTextContent();
      const runs = toTextRuns(textContent.items);
      const lineRuns = groupRunsIntoLines(runs);
      const pageIndexStart = fullText.length;
      const pageLines = [];

      for (const runGroup of lineRuns) {
        const lineText = joinLineRuns(runGroup);
        if (!lineText) continue;
        const bounds = getLineBounds(runGroup, viewport.height);

        const indexStart = fullText.length;
        fullText += `${lineText}\n`;
        const indexEnd = fullText.length;

        const lineChunk = {
          pageNumber: i,
          text: lineText,
          indexStart,
          indexEnd,
          bounds,
        };

        pageLines.push(lineChunk);
        chunks.push(lineChunk);
      }

      if (pageLines.length === 0) {
        warnings.push({
          code: "page_has_no_extractable_text",
          message: `Page ${i} has no extractable text.`,
          pageNumber: i,
        });
      }

      if (pageLines.length === 1 && pageLines[0].text.length > 180) {
        warnings.push({
          code: "page_has_poor_line_structure",
          message: `Page ${i} collapsed into a single long line. Extraction quality may be lower.`,
          pageNumber: i,
        });
      }

      fullText += "\n";
      const pageIndexEnd = fullText.length;

      pages.push({
        pageNumber: i,
        text: pageLines.map((line) => line.text).join("\n"),
        lines: pageLines,
        indexStart: pageIndexStart,
        indexEnd: pageIndexEnd,
        width: viewport.width,
        height: viewport.height,
      });
    }

    const hasExtractableText = chunks.length > 0 && normalizeWhitespace(fullText).length > 0;

    if (!hasExtractableText) {
      warnings.push({
        code: "pdf_has_no_extractable_text",
        message: "This PDF does not appear to contain selectable text.",
      });
    }

    return {
      text: fullText,
      pages,
      chunks,
      warnings,
      hasExtractableText,
      metadata: { pages: pdf.numPages },
    };
  } catch (error) {
    console.error("PDF Parsing Error:", error);
    throw error;
  }
}

/**
 * @param {File} file
 * @param {SyllabusParseOptions} [options={}]
 * @returns {Promise<SyllabusParseResult>}
 */
export async function parseSyllabus(file, options = {}) {
  const parsedPdf = await parsePDF(file);
  const tasks = extractAcademicTasks(parsedPdf, options);

  return {
    ...parsedPdf,
    tasks,
  };
}
