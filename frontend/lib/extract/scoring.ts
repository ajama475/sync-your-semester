import type { DeadlineType } from "./models";

export const KEYWORDS: Array<{ type: DeadlineType; words: string[] }> = [
  { type: "exam", words: ["exam", "first exam", "second exam", "third exam"] },
  { type: "midterm", words: ["midterm", "mid-term"] },
  { type: "final", words: ["final", "final exam", "final examination", "deferred final", "make-up final"] },
  { type: "quiz", words: ["quiz", "test"] },
  { type: "assignment", words: ["assignment", "in-class writing", "paper", "essay", "hw", "homework", "problem set", "pset"] },
  { type: "lab", words: ["lab", "laboratory"] },
  { type: "project", words: ["project", "presentation", "proposal"] },
  { type: "reading", words: ["reading", "read", "chapter"] },
];

const STRONG_SIGNAL = ["due", "deadline", "submit", "submission", "by"];
const WEIGHT_SIGNAL = ["weight", "%", "worth"];
const NEGATIVE_SIGNAL = [
  "office hour",
  "office hours",
  "contact",
  "email",
  "phone",
  "textbook",
  "lecture topic",
  "tutorial",
  "course website",
  "instructor",
  "location",
  "room",
  "reading week",
  "holiday",
  "statutory holiday",
  "exam outline",
  "preparation",
];
const WEEKLY_SCHEDULE_SIGNAL = ["week of", "week ", "module ", "schedule of classes", "reading overview"];

export interface KeywordHit {
  type: DeadlineType;
  matched: string;
  index: number; 
}

export function findKeywordHits(haystack: string): KeywordHit[] {
  const lower = haystack.toLowerCase();
  const hits: KeywordHit[] = [];

  for (const bucket of KEYWORDS) {
    for (const w of bucket.words) {
      let idx = lower.indexOf(w);
      while (idx !== -1) {
        hits.push({ type: bucket.type, matched: w, index: idx });
        idx = lower.indexOf(w, idx + w.length);
      }
    }
  }

  return hits.sort((a, b) => a.index - b.index);
}

export function scoreCandidate(params: {
  context: string;
  dateIndexInContext: number;
  keywordHits: KeywordHit[];
  dateFlags: string[];
}): { confidence: number; flags: string[]; matchedKeywords: string[]; typeGuess: DeadlineType } {
  const { context, dateIndexInContext, keywordHits, dateFlags } = params;
  const lower = context.toLowerCase();

  const flags: string[] = [...dateFlags];
  let score = 22;
  const hasStrongSignal = STRONG_SIGNAL.some((signal) => lower.includes(signal));

  for (const s of STRONG_SIGNAL) if (lower.includes(s)) score += 10;
  for (const w of WEIGHT_SIGNAL) if (lower.includes(w)) score += 6;
  for (const n of NEGATIVE_SIGNAL) if (lower.includes(n)) score -= hasStrongSignal ? 4 : 12;
  if (!hasStrongSignal && WEEKLY_SCHEDULE_SIGNAL.some((signal) => lower.includes(signal))) {
    score -= 18;
    flags.push("weekly_schedule_context");
  }

  let bestType: DeadlineType = "other";
  let bestProximity = Number.POSITIVE_INFINITY;

  for (const hit of keywordHits) {
    const dist = Math.abs(hit.index - dateIndexInContext);
    if (dist < bestProximity) {
      bestProximity = dist;
      bestType = hit.type;
    }
  }

  if (keywordHits.length > 0) {
    score += 20;
    if (bestProximity <= 16) score += 30;
    else if (bestProximity <= 40) score += 22;
    else if (bestProximity <= 90) score += 12;
    else score += 4;
  } else {
    flags.push("no_deadline_keyword_in_chunk");
    score -= 18;
  }

  if (dateFlags.includes("ambiguous_slash_format")) score -= 18;
  if (dateFlags.includes("date_range_start_only")) {
    score -= hasStrongSignal ? 4 : 12;
  }
  if (dateFlags.includes("year_outlier_from_default")) {
    score -= 28;
  }
  if (!hasStrongSignal && bestType === "other") score -= 10;
  if (/\b(mon|monday|tue|tuesday|wed|wednesday|thu|thursday|fri|friday)\b/.test(lower) && !hasStrongSignal) {
    score -= 8;
  }
  if (bestType === "reading" && !hasStrongSignal && (lower.includes("week") || lower.includes("module") || lower.includes("pp."))) {
    score -= 22;
    flags.push("reading_schedule_context");
  }

  score = Math.max(0, Math.min(100, score));
  if (score < 55) flags.push("low_confidence");

  const matchedKeywords = Array.from(
    new Set(keywordHits.filter(h => h.type === bestType).map(h => h.matched))
  );

  return { confidence: score, flags, matchedKeywords, typeGuess: bestType };
}
