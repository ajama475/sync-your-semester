import * as pdfjs from "pdfjs-dist/legacy/build/pdf";

pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/legacy/build/pdf.worker.min.js`;

export interface ParsedPDFPage {
  pageNumber: number;
  text: string;
  indexStart: number;
  indexEnd: number;
}

export interface ParseResult {
  text: string;
  pages: ParsedPDFPage[];
  metadata: {
    pages: number;
  };
}

export async function parsePDF(file: File): Promise<ParseResult> {
  try {
    const arrayBuffer = await file.arrayBuffer();

    const loadingTask = pdfjs.getDocument({ data: arrayBuffer });
    const pdf = await loadingTask.promise;

    let fullText = "";
    const pages: ParsedPDFPage[] = [];

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();

      const pageText = textContent.items
        .map((item) => ("str" in item ? item.str || "" : ""))
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();

      const indexStart = fullText.length;
      const pageWithBreak = `${pageText}\n`;
      fullText += pageWithBreak;
      const indexEnd = fullText.length;

      pages.push({
        pageNumber: i,
        text: pageText,
        indexStart,
        indexEnd,
      });
    }

    return {
      text: fullText,
      pages,
      metadata: { pages: pdf.numPages },
    };
  } catch (error) {
    console.error("PDF Parsing Error:", error);
    throw error;
  }
}
