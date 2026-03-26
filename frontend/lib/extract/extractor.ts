import { findDateMatches } from "./datePatterns";
import type { ExtractionResult, DeadlineCandidate, DeadlineType } from "./models";
import { findKeywordHits, scoreCandidate } from "./scoring";

interface IndexedLine {
  text: string;
  start: number;
  end: number;
}

interface EvaluatedContext {
  context: string;
  confidence: number;
  flags: string[];
  matchedKeywords: string[];
  typeGuess: DeadlineType;
}

const DEADLINE_CHUNK_REGEX =
  /\b(in-class\s+writing|assignment\s*\d+|assignment|midterm|final\s*exam|final\s*examination|final|quiz\s*\d+|quiz|test|project|lab|homework|hw|exam|reading|chapter|proposal|presentation)\b/gi;

function makeId(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return `cand_${h.toString(16)}`;
}

function normalizeNewlines(rawText: string): string {
  return rawText.replace(/\r\n/g, "\n");
}

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function indexLines(text: string): IndexedLine[] {
  const lines: IndexedLine[] = [];
  let lineStart = 0;

  for (let i = 0; i <= text.length; i++) {
    if (i === text.length || text[i] === "\n") {
      lines.push({
        text: text.slice(lineStart, i),
        start: lineStart,
        end: i,
      });
      lineStart = i + 1;
    }
  }

  return lines;
}

function findLineIndexForPosition(lines: IndexedLine[], index: number, startAt = 0) {
  let cursor = startAt;

  while (cursor < lines.length) {
    if (index >= lines[cursor].start && index <= lines[cursor].end) {
      return cursor;
    }
    if (index < lines[cursor].start) {
      break;
    }
    cursor += 1;
  }

  return Math.max(0, Math.min(lines.length - 1, cursor));
}

function nearestNonEmptyLine(lines: IndexedLine[], startIndex: number, direction: -1 | 1) {
  let index = startIndex + direction;

  while (index >= 0 && index < lines.length) {
    const text = normalizeWhitespace(lines[index].text);
    if (text) return text;
    index += direction;
  }

  return "";
}

function buildContextCandidates(lines: IndexedLine[], lineIndex: number): string[] {
  const line = normalizeWhitespace(lines[lineIndex]?.text ?? "");
  const prevLine = nearestNonEmptyLine(lines, lineIndex, -1);
  const nextLine = nearestNonEmptyLine(lines, lineIndex, 1);

  return Array.from(
    new Set(
      [line, `${prevLine} ${line}`.trim(), `${line} ${nextLine}`.trim(), `${prevLine} ${line} ${nextLine}`.trim()]
        .map(normalizeWhitespace)
        .filter(Boolean)
    )
  );
}

function splitIntoAssessmentChunks(context: string): Array<{ chunk: string; start: number; end: number }> {
  const matches: Array<{ idx: number }> = [];
  DEADLINE_CHUNK_REGEX.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = DEADLINE_CHUNK_REGEX.exec(context)) !== null) {
    matches.push({ idx: match.index });
  }

  if (matches.length === 0) {
    return [{ chunk: context.trim(), start: 0, end: context.length }];
  }

  const chunks: Array<{ chunk: string; start: number; end: number }> = [];

  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].idx;
    const end = i + 1 < matches.length ? matches[i + 1].idx : context.length;
    const chunk = normalizeWhitespace(context.slice(start, end));
    if (chunk) {
      chunks.push({ chunk, start, end });
    }
  }

  return chunks.length > 0 ? chunks : [{ chunk: context.trim(), start: 0, end: context.length }];
}

function pickChunkContainingDate(
  chunks: Array<{ chunk: string; start: number; end: number }>,
  dateRaw: string,
  context: string
) {
  const needle = dateRaw.toLowerCase();

  for (const chunk of chunks) {
    if (chunk.chunk.toLowerCase().includes(needle)) {
      return chunk;
    }
  }

  const dateIndex = context.toLowerCase().indexOf(needle);
  if (dateIndex === -1) return null;

  return (
    chunks.find((chunk) => dateIndex >= chunk.start && dateIndex <= chunk.end) ??
    chunks.reduce<{ chunk: string; start: number; end: number } | null>((closest, chunk) => {
      const center = chunk.start + (chunk.end - chunk.start) / 2;
      if (!closest) return chunk;

      const closestCenter = closest.start + (closest.end - closest.start) / 2;
      return Math.abs(center - dateIndex) < Math.abs(closestCenter - dateIndex) ? chunk : closest;
    }, null)
  );
}

function inferTypeFromChunk(chunk: string): DeadlineType {
  const lower = chunk.toLowerCase();
  if (lower.includes("midterm") || lower.includes("mid-term")) return "midterm";
  if (lower.includes("final")) return "final";
  if (lower.includes("exam")) return "exam";
  if (lower.includes("assignment") || lower.includes("homework") || /\bhw\b/.test(lower)) return "assignment";
  if (lower.includes("quiz") || lower.includes("test")) return "quiz";
  if (lower.includes("lab")) return "lab";
  if (lower.includes("project") || lower.includes("proposal") || lower.includes("presentation")) return "project";
  if (lower.includes("reading") || lower.includes("chapter")) return "reading";
  return "other";
}

function fallbackTitle(type: DeadlineType) {
  if (type === "exam") return "Exam";
  if (type === "midterm") return "Midterm";
  if (type === "final") return "Final Exam";
  if (type === "lab") return "Lab";
  if (type === "project") return "Project";
  if (type === "reading") return "Reading";
  return "Deadline";
}

function cleanTitlePhrase(value: string, dateRaw: string) {
  let cleaned = value;
  cleaned = cleaned.replace(new RegExp(escapeRegExp(dateRaw), "ig"), " ");
  cleaned = cleaned.replace(/\b\d{1,3}\s*%/g, " ");
  cleaned = cleaned.replace(/\b(worth|weighted)\s+\d{1,3}\s*%?/gi, " ");
  cleaned = cleaned.replace(/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)\b/gi, " ");
  cleaned = cleaned.replace(/\b(written\s+on|held\s+on|due|deadline|submit|submission|available|opens?|closes?|until|by|on|at|before|after)\b/gi, " ");
  cleaned = cleaned.replace(/\b([01]?\d|2[0-3]):[0-5]\d\b/gi, " ");
  cleaned = cleaned.replace(/\b(1[0-2]|0?[1-9])(?::[0-5]\d)?\s*(am|pm)\b/gi, " ");
  cleaned = cleaned.replace(/[|]/g, " ");
  cleaned = cleaned.replace(/\s*[-:–—]\s*/g, " ");
  cleaned = normalizeWhitespace(cleaned);
  return cleaned.replace(/\b(of|for|the|and)\b$/i, "").trim();
}

function inferTitleFromChunk(chunk: string, type: DeadlineType, dateRaw: string): string {
  const ordinalExamMatch = /\b(first|second|third|fourth)\s+exam(?:\s*[:\-]\s*|\s+)?(.+)?/i.exec(chunk);
  if (ordinalExamMatch) {
    const suffix = cleanTitlePhrase(ordinalExamMatch[2] ?? "", dateRaw);
    const label = `${ordinalExamMatch[1][0].toUpperCase()}${ordinalExamMatch[1].slice(1).toLowerCase()} Exam`;
    return suffix ? `${label} ${suffix}` : label;
  }

  const genericExamMatch = /\bexam(?:ination)?(?:\s*[:\-]\s*|\s+)?(.+)?/i.exec(chunk);
  if (genericExamMatch && type === "exam") {
    const suffix = cleanTitlePhrase(genericExamMatch[1] ?? "", dateRaw);
    return suffix ? `Exam ${suffix}` : "Exam";
  }

  const inClassWritingMatch = /\bin-class writing(?:\s*[:\-]\s*|\s+)?(.+)?/i.exec(chunk);
  if (inClassWritingMatch) {
    const suffix = cleanTitlePhrase(inClassWritingMatch[1] ?? "", dateRaw);
    return suffix ? `In-class writing ${suffix}` : "In-class writing";
  }

  const assignmentMatch = /\bassignment\s*(\d{1,2})(?:\s*[:\-]\s*|\s+)?(.+)?/i.exec(chunk);
  if (assignmentMatch) {
    const suffix = cleanTitlePhrase(assignmentMatch[2] ?? "", dateRaw);
    return suffix ? `Assignment ${assignmentMatch[1]} ${suffix}` : `Assignment ${assignmentMatch[1]}`;
  }

  const quizMatch = /\bquiz\s*(\d{1,2})(?:\s*[:\-]\s*|\s+)?(.+)?/i.exec(chunk);
  if (quizMatch) {
    const suffix = cleanTitlePhrase(quizMatch[2] ?? "", dateRaw);
    return suffix ? `Quiz ${quizMatch[1]} ${suffix}` : `Quiz ${quizMatch[1]}`;
  }

  const title = cleanTitlePhrase(chunk, dateRaw);

  const typeKeywordPatterns: Record<DeadlineType, RegExp[]> = {
    exam: [/\b(?:first|second|third|fourth)\s+exam(?:\s+[a-z0-9][a-z0-9\s]*)?/i, /\bexam(?:ination)?(?:\s+[a-z0-9][a-z0-9\s]*)?/i],
    midterm: [/\bmidterm(?:\s+[a-z0-9][a-z0-9\s]*)?/i],
    final: [/\bfinal(?:\s+exam)?(?:\s+[a-z0-9][a-z0-9\s]*)?/i],
    quiz: [/\bquiz(?:\s*\d+)?(?:\s+[a-z0-9][a-z0-9\s]*)?/i, /\btest(?:\s+[a-z0-9][a-z0-9\s]*)?/i],
    assignment: [/\bassignment(?:\s*\d+)?(?:\s+[a-z0-9][a-z0-9\s]*)?/i, /\bhomework(?:\s*\d+)?(?:\s+[a-z0-9][a-z0-9\s]*)?/i],
    lab: [/\blab(?:\s*\d+)?(?:\s+[a-z0-9][a-z0-9\s]*)?/i],
    project: [/\bproject(?:\s+[a-z0-9][a-z0-9\s]*)?/i, /\bproposal(?:\s+[a-z0-9][a-z0-9\s]*)?/i, /\bpresentation(?:\s+[a-z0-9][a-z0-9\s]*)?/i],
    reading: [/\breading(?:\s+[a-z0-9][a-z0-9\s]*)?/i, /\bchapter(?:\s+[a-z0-9][a-z0-9\s]*)?/i],
    other: [],
  };

  for (const pattern of typeKeywordPatterns[type] ?? []) {
    const match = pattern.exec(title);
    if (match?.[0]) {
      const phrase = normalizeWhitespace(match[0]);
      if (phrase.length >= 4) {
        return phrase;
      }
    }
  }

  if (title.length >= 4) {
    return title;
  }

  return fallbackTitle(type);
}

function takeSnippet(text: string, indexStart: number, indexEnd: number): string {
  const radius = 120;
  const start = Math.max(0, indexStart - radius);
  const end = Math.min(text.length, indexEnd + radius);
  return normalizeWhitespace(text.slice(start, end));
}

function detectConditional(chunk: string): string[] {
  const lower = chunk.toLowerCase();
  const flags: string[] = [];

  if (lower.includes("if granted") || lower.includes("deferred") || lower.includes("make-up") || lower.includes("make up")) {
    flags.push("conditional_event");
  }

  return flags;
}

function detectNonDeadlineSignals(chunk: string): string[] {
  const lower = chunk.toLowerCase();
  const flags: string[] = [];
  const negativeSignals = [
    "office hour",
    "office hours",
    "contact",
    "email",
    "phone",
    "textbook",
    "instructor",
    "room",
    "location",
    "lecture topic",
    "tutorial",
    "class meets",
    "no class",
    "reading week",
    "holiday",
  ];

  const strongDeadlineSignal =
    /\b(due|deadline|submit|submission|exam|midterm|final|quiz|assignment|project|lab|homework|proposal|presentation|in-class writing)\b/.test(
      lower
    );

  if (!strongDeadlineSignal && negativeSignals.some((signal) => lower.includes(signal))) {
    flags.push("non_deadline_context");
  }

  return flags;
}

function parseTime24h(chunk: string): string | undefined {
  const lower = chunk.toLowerCase();

  const time24 = /\b([01]?\d|2[0-3]):([0-5]\d)\b/.exec(lower);
  if (time24) {
    return `${String(time24[1]).padStart(2, "0")}:${time24[2]}`;
  }

  const time12 = /@?\s*\b(1[0-2]|0?[1-9])(?::([0-5]\d))?\s*(am|pm)\b/.exec(lower);
  if (time12) {
    let hour = Number(time12[1]);
    const minute = Number(time12[2] ?? "0");
    const half = time12[3];

    if (half === "pm" && hour !== 12) hour += 12;
    if (half === "am" && hour === 12) hour = 0;

    return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  }

  return undefined;
}

function evaluateBestContext(contexts: string[], dateRaw: string, dateFlags: string[]): EvaluatedContext | null {
  let best: EvaluatedContext | null = null;

  for (const context of contexts) {
    const chunks = splitIntoAssessmentChunks(context);
    const chosenChunk = pickChunkContainingDate(chunks, dateRaw, context);
    const chunk = chosenChunk?.chunk ?? context;
    const dateIndex = chunk.toLowerCase().indexOf(dateRaw.toLowerCase());
    const dateIndexInContext = dateIndex >= 0 ? dateIndex : Math.min(Math.max(chunk.length - 1, 0), 0);
    const keywordHits = findKeywordHits(chunk);
    const scored = scoreCandidate({
      context: chunk,
      dateIndexInContext,
      keywordHits,
      dateFlags,
    });

    const negativeFlags = detectNonDeadlineSignals(chunk);
    const confidence = Math.max(0, scored.confidence - (negativeFlags.includes("non_deadline_context") ? 25 : 0));
    const flags = Array.from(new Set([...scored.flags, ...negativeFlags]));

    const hasExplicitDeadline = /\b(due|deadline|submit|exam|midterm|final|quiz|assignment|in-class writing)\b/i.test(chunk);
    const explicitBoost = hasExplicitDeadline ? 6 : 0;
    const effectiveScore = confidence + explicitBoost;
    const bestEffectiveScore = best ? best.confidence + (/\b(due|deadline|submit|exam|midterm|final|quiz|assignment|in-class writing)\b/i.test(best.context) ? 6 : 0) : -1;

    if (!best || effectiveScore > bestEffectiveScore || (effectiveScore === bestEffectiveScore && chunk.length < best.context.length)) {
      best = {
        context: chunk,
        confidence,
        flags,
        matchedKeywords: scored.matchedKeywords,
        typeGuess: scored.typeGuess,
      };
    }
  }

  return best;
}

export function extractDeadlines(rawText: string, defaultYear?: number): ExtractionResult {
  const text = normalizeNewlines(rawText);
  const dateMatches = findDateMatches(text, defaultYear);
  const lines = indexLines(text);

  let totalDatesFound = 0;
  const candidates: DeadlineCandidate[] = [];
  let lineCursor = 0;

  for (const match of dateMatches) {
    totalDatesFound += 1;
    if (!match.dateISO) continue;

    lineCursor = findLineIndexForPosition(lines, match.indexStart, lineCursor);
    const contexts = buildContextCandidates(lines, lineCursor);
    const bestContext = evaluateBestContext(contexts, match.raw, match.flags);

    if (!bestContext) continue;

    const typeFromContext = inferTypeFromChunk(bestContext.context);
    const type: DeadlineType = typeFromContext !== "other" ? typeFromContext : bestContext.typeGuess;
    const title = inferTitleFromChunk(bestContext.context, type, match.raw);

    const conditionalFlags = detectConditional(bestContext.context);
    const flags = Array.from(new Set([...(bestContext.flags ?? []), ...conditionalFlags]));

    let confidence = bestContext.confidence;
    if (conditionalFlags.includes("conditional_event")) {
      confidence = Math.max(0, confidence - 15);
    }

    const shouldEmit = confidence >= 40 && !flags.includes("no_deadline_keyword_in_chunk") && !flags.includes("non_deadline_context");
    if (!shouldEmit) continue;

    const snippet = takeSnippet(text, match.indexStart, match.indexEnd);
    const time24h = parseTime24h(bestContext.context);
    const seed = `${match.dateISO}|${type}|${match.indexStart}`;

    candidates.push({
      id: makeId(seed),
      title,
      type,
      dateISO: match.dateISO,
      time24h,
      confidence,
      evidence: {
        snippet,
        context: bestContext.context,
        indexStart: match.indexStart,
        indexEnd: match.indexEnd,
        matchedDateText: match.raw,
        matchedKeywords: bestContext.matchedKeywords,
      },
      flags,
    });
  }

  const dedupedCandidates = candidates.filter((candidate, index) => {
    const key = `${candidate.dateISO}|${candidate.type}|${candidate.title.toLowerCase()}`;
    const duplicateIndex = candidates.findIndex((other) => {
      const otherKey = `${other.dateISO}|${other.type}|${other.title.toLowerCase()}`;
      if (otherKey !== key) return false;
      if (other.confidence > candidate.confidence) return true;
      if (other.confidence < candidate.confidence) return false;
      return other.evidence.indexStart <= candidate.evidence.indexStart;
    });

    return duplicateIndex === index;
  });

  dedupedCandidates.sort((a, b) => a.dateISO.localeCompare(b.dateISO) || b.confidence - a.confidence);

  return {
    candidates: dedupedCandidates,
    stats: {
      totalDatesFound,
      candidatesEmitted: dedupedCandidates.length,
      lowConfidence: dedupedCandidates.filter((candidate) => candidate.confidence < 55).length,
    },
  };
}
