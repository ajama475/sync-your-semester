export const MONTHS: Record<string, number> = {
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

const MONTH_PATTERN =
  "(Jan(?:uary)?\\.?|Feb(?:ruary)?\\.?|Mar(?:ch)?\\.?|Apr(?:il)?\\.?|May\\.?|Jun(?:e)?\\.?|Jul(?:y)?\\.?|Aug(?:ust)?\\.?|Sep(?:t(?:ember)?)?\\.?|Oct(?:ober)?\\.?|Nov(?:ember)?\\.?|Dec(?:ember)?\\.?)";

export const DATE_REGEXES: RegExp[] = [
  new RegExp(`\\b${MONTH_PATTERN}\\s+(\\d{1,2})(?:,\\s*|\\s+)?(\\d{4})?\\b`, "gi"),
  new RegExp(`\\b(\\d{1,2})\\s+${MONTH_PATTERN}(?:,\\s*|\\s+)?(\\d{4})?\\b`, "gi"),
  new RegExp(`\\b${MONTH_PATTERN}\\s+(\\d{1,2})\\s*(?:-|to)\\s*(\\d{1,2})(?:,\\s*|\\s+)?(\\d{4})?\\b`, "gi"),
  /\b(\d{4})-(\d{2})-(\d{2})\b/g,
  /\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/g,
  /\b(\d{1,2})\/(\d{1,2})\b/g,
];

export interface DateMatch {
  raw: string;
  indexStart: number;
  indexEnd: number;
  dateISO: string | null;
  flags: string[];
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function toISO(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12) return null;
  if (d < 1 || d > 31) return null;
  if (y < 1900 || y > 2100) return null;
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

function interpretSlashDate(a: number, b: number, y: number, flags: string[]) {
  if (a <= 12 && b <= 12) {
    flags.push("ambiguous_slash_format");
    return toISO(y, a, b);
  }

  if (a > 12 && b <= 12) {
    flags.push("slash_format_interpreted_as_dd_mm");
    return toISO(y, b, a);
  }

  return toISO(y, a, b);
}

export function findDateMatches(text: string, defaultYear?: number): DateMatch[] {
  const allMatches: DateMatch[] = [];
  const currentYear = defaultYear ?? new Date().getFullYear();

  DATE_REGEXES.forEach((regex, patternIndex) => {
    regex.lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(text)) !== null) {
      const raw = match[0];
      const indexStart = match.index;
      const indexEnd = match.index + raw.length;
      const flags: string[] = [];
      let dateISO: string | null = null;

      if (patternIndex === 2) {
        const normalizedMonth = match[1].toLowerCase().replace(/\./g, "");
        const month = MONTHS[normalizedMonth];
        const startDay = Number(match[2]);
        const endDay = Number(match[3]);
        const yearToken = match[4];
        const year = yearToken ? Number(yearToken) : currentYear;

        flags.push("date_range_start_only");
        if (!yearToken) {
          flags.push("year_missing_assumed_default");
        }
        if (endDay > startDay) {
          flags.push("date_range_multi_day");
        }

        dateISO = toISO(year, month, startDay);
      } else if (patternIndex === 3) {
        dateISO = toISO(Number(match[1]), Number(match[2]), Number(match[3]));
      } else if (patternIndex === 4 || patternIndex === 5) {
        const a = Number(match[1]);
        const b = Number(match[2]);
        const yearToken = patternIndex === 4 ? match[3] : undefined;
        const y = yearToken ? Number(yearToken.length === 2 ? `20${yearToken}` : yearToken) : currentYear;

        if (!yearToken) {
          flags.push("year_missing_assumed_default");
        } else if (Math.abs(y - currentYear) > 1) {
          flags.push("year_outlier_from_default");
        }

        dateISO = interpretSlashDate(a, b, y, flags);
      } else {
        const hasMonthFirst = Number.isNaN(Number(match[1]));
        const monthToken = hasMonthFirst ? match[1] : match[2];
        const dayToken = hasMonthFirst ? match[2] : match[1];
        const yearToken = hasMonthFirst ? match[3] : match[3];

        const normalizedMonth = monthToken.toLowerCase().replace(/\./g, "");
        const month = MONTHS[normalizedMonth];
        const day = Number(dayToken);
        const year = yearToken ? Number(yearToken) : currentYear;

        if (!yearToken) {
          flags.push("year_missing_assumed_default");
        } else if (Math.abs(year - currentYear) > 1) {
          flags.push("year_outlier_from_default");
        }

        dateISO = toISO(year, month, day);
      }

      allMatches.push({ raw, indexStart, indexEnd, dateISO, flags });
    }
  });

  allMatches.sort((a, b) => a.indexStart - b.indexStart || b.raw.length - a.raw.length);

  return allMatches.filter((match, index) => {
    if (index === 0) return true;
    const previous = allMatches[index - 1];
    return match.indexStart >= previous.indexEnd;
  });
}
