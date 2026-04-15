import * as pdfjs from "pdfjs-dist/legacy/build/pdf";

if (typeof window !== "undefined") {
  pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/legacy/build/pdf.worker.min.js`;
}

interface TextRun {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
  hasEOL: boolean;
}

interface TextItemLike {
  str?: string;
  transform?: unknown;
  width?: number;
  height?: number;
  hasEOL?: boolean;
}

export interface ParsedPDFChunk {
  pageNumber: number;
  text: string;
  indexStart: number;
  indexEnd: number;
}

export interface ParsedPDFPage {
  pageNumber: number;
  text: string;
  lines: ParsedPDFChunk[];
  indexStart: number;
  indexEnd: number;
}

export interface ParseWarning {
  code: "page_has_no_extractable_text" | "pdf_has_no_extractable_text" | "page_has_poor_line_structure";
  message: string;
  pageNumber?: number;
}

export interface ParseResult {
  text: string;
  pages: ParsedPDFPage[];
  chunks: ParsedPDFChunk[];
  warnings: ParseWarning[];
  hasExtractableText: boolean;
  metadata: {
    pages: number;
  };
}

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function toTextRuns(items: Array<unknown>): TextRun[] {
  return items
    .map((item) => {
      if (!item || typeof item !== "object" || !("str" in item) || !("transform" in item)) {
        return null;
      }

      const textItem = item as TextItemLike;
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
    .filter((run): run is TextRun => run !== null && run.str.trim().length > 0);
}

function isSameLine(previous: TextRun, current: TextRun) {
  const lineTolerance = Math.max(2, Math.min(Math.abs(previous.height) || 8, Math.abs(current.height) || 8) * 0.6);
  return Math.abs(previous.y - current.y) <= lineTolerance;
}

function shouldInsertSpace(previous: TextRun, current: TextRun) {
  if (previous.str.endsWith("-")) return false;
  if (/^[,.;:!?%)]/.test(current.str)) return false;
  if (/[(/]$/.test(previous.str)) return false;

  const gap = current.x - (previous.x + previous.width);
  return gap > Math.max(1.5, Math.min(Math.abs(previous.height) || 8, 6) * 0.15);
}

function joinLineRuns(runs: TextRun[]) {
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

function groupRunsIntoLines(runs: TextRun[]) {
  const lines: TextRun[][] = [];
  let current: TextRun[] = [];

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

export async function parsePDF(file: File): Promise<ParseResult> {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const documentParams: Parameters<typeof pdfjs.getDocument>[0] & { disableWorker?: boolean } = {
      data: arrayBuffer,
    };

    if (typeof window === "undefined") {
      documentParams.disableWorker = true;
    }

    const loadingTask = pdfjs.getDocument(documentParams);
    const pdf = await loadingTask.promise;

    let fullText = "";
    const pages: ParsedPDFPage[] = [];
    const chunks: ParsedPDFChunk[] = [];
    const warnings: ParseWarning[] = [];

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const runs = toTextRuns(textContent.items as Array<unknown>);
      const lineRuns = groupRunsIntoLines(runs);
      const pageIndexStart = fullText.length;
      const pageLines: ParsedPDFChunk[] = [];

      for (const runGroup of lineRuns) {
        const lineText = joinLineRuns(runGroup);
        if (!lineText) continue;

        const indexStart = fullText.length;
        fullText += `${lineText}\n`;
        const indexEnd = fullText.length;

        const lineChunk: ParsedPDFChunk = {
          pageNumber: i,
          text: lineText,
          indexStart,
          indexEnd,
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
