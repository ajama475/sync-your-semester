"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type KeyboardEvent as ReactKeyboardEvent } from "react";
import {
  AlertCircle,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Download,
  FileSearch,
  FileText,
  Pencil,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Upload,
} from "lucide-react";
import { buildICS, downloadICS } from "@/lib/calendar/ics";
import { extractDeadlines } from "@/lib/extract/extractor";
import type { DeadlineCandidate } from "@/lib/extract/models";
import { parsePDF, type ParsedPDFPage } from "@/lib/parser/pdfParser";
import { cn } from "@/lib/utils";
import { Inspector } from "./Inspector";

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function normalizeSpace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function formatDate(dateISO: string) {
  const date = new Date(`${dateISO}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return {
      month: "Date",
      day: dateISO,
      detail: "Unrecognized date",
    };
  }

  return {
    month: date.toLocaleDateString("en-US", { month: "short" }),
    day: date.toLocaleDateString("en-US", { day: "2-digit" }),
    detail: date.toLocaleDateString("en-US", {
      weekday: "short",
      month: "long",
      day: "numeric",
      year: "numeric",
    }),
  };
}

function confidenceMeta(confidence: number) {
  if (confidence >= 80) {
    return {
      label: "High confidence",
      detail: "Ready to export",
      tone: "border-emerald-200 bg-emerald-50 text-emerald-700",
    };
  }

  if (confidence >= 60) {
    return {
      label: "Review",
      detail: "Quick check recommended",
      tone: "border-amber-200 bg-amber-50 text-amber-700",
    };
  }

  return {
    label: "Unclear",
    detail: "Needs manual check",
    tone: "border-rose-200 bg-rose-50 text-rose-700",
  };
}

function confidenceSnippetTone(confidence: number) {
  if (confidence >= 80) {
    return "border-emerald-200 border-l-4 border-l-emerald-500 bg-[#f7fbf7]";
  }

  if (confidence >= 60) {
    return "border-amber-200 border-l-4 border-l-amber-500 bg-[#fff8eb]";
  }

  return "border-[#efc4b6] border-l-4 border-l-[#d65e46] bg-[#fff3ee]";
}

function confidenceCue(confidence: number) {
  if (confidence >= 80) {
    return {
      label: "Safe to export",
      tone: "text-emerald-700",
    };
  }

  if (confidence >= 60) {
    return {
      label: "Check once, then keep moving",
      tone: "text-amber-700",
    };
  }

  return {
    label: "Check source text before export",
    tone: "text-[#b45309]",
  };
}

function typeTone(type: DeadlineCandidate["type"]) {
  switch (type) {
    case "exam":
    case "midterm":
    case "final":
      return "bg-rose-50 text-rose-700";
    case "assignment":
    case "project":
      return "bg-sky-50 text-sky-700";
    case "quiz":
    case "lab":
      return "bg-emerald-50 text-emerald-700";
    case "reading":
      return "bg-amber-50 text-amber-700";
    default:
      return "bg-slate-100 text-slate-700";
  }
}

function isLikelyPDF(file: File) {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

function segmentPreviewText(text: string, maxLength = 260) {
  const normalized = normalizeSpace(text);
  if (!normalized) return [];

  const sentences = normalized.match(/[^.!?]+[.!?]?/g) ?? [normalized];
  const blocks: string[] = [];
  let current = "";

  for (const sentence of sentences) {
    if ((current + sentence).length > maxLength && current) {
      blocks.push(current.trim());
      current = sentence;
    } else {
      current = `${current} ${sentence}`.trim();
    }
  }

  if (current) {
    blocks.push(current.trim());
  }

  return blocks;
}

function evidenceSnippet(candidate: DeadlineCandidate) {
  return candidate.evidence.context || candidate.evidence.snippet || "No supporting context captured.";
}

function findPageForIndex(pages: ParsedPDFPage[], index: number) {
  if (index < 0) return null;
  return pages.find((page) => index >= page.indexStart && index < page.indexEnd) ?? null;
}

function addFlag(flags: string[], flag: string) {
  return flags.includes(flag) ? flags : [...flags, flag];
}

function matchingNeedle(pageText: string, candidate: DeadlineCandidate | null) {
  if (!candidate) return null;

  const haystack = normalizeSpace(pageText).toLowerCase();
  const needles = [
    candidate.evidence.context,
    candidate.evidence.matchedDateText,
    candidate.evidence.snippet,
  ]
    .map((value) => normalizeSpace(value || ""))
    .filter(Boolean);

  for (const needle of needles) {
    if (haystack.includes(needle.toLowerCase())) {
      return needle;
    }
  }

  return needles[0] ?? null;
}

export default function PanicUpload() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [status, setStatus] = useState("");
  const [pages, setPages] = useState<number | null>(null);
  const [rawText, setRawText] = useState("");
  const [parsedPages, setParsedPages] = useState<ParsedPDFPage[]>([]);
  const [loading, setLoading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [lastExport, setLastExport] = useState<{ kind: "ics" | "csv"; count: number } | null>(null);

  const [defaultYear, setDefaultYear] = useState<number>(() => new Date().getFullYear());
  const [minConfidence, setMinConfidence] = useState(45);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activePageNumber, setActivePageNumber] = useState<number | null>(null);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"date-asc" | "date-desc" | "confidence-desc">("date-asc");

  const [manualEdits, setManualEdits] = useState<Record<string, Partial<DeadlineCandidate>>>({});
  const [manualCandidates, setManualCandidates] = useState<DeadlineCandidate[]>([]);

  async function onFileChange(file: File) {
    if (!isLikelyPDF(file)) {
      setStatus("Use a syllabus PDF.");
      return;
    }

    setLoading(true);
    setDragActive(false);
    setLastExport(null);
    setStatus("Reading syllabus PDF...");
    setPages(null);
    setRawText("");
    setParsedPages([]);
    setActiveId(null);
    setActivePageNumber(null);
    setInspectorOpen(false);
    setManualEdits({});
    setManualCandidates([]);

    try {
      const result = await parsePDF(file);
      setPages(result.metadata.pages);
      setParsedPages(result.pages);

      if (!result.hasExtractableText) {
        setStatus(result.warnings[0]?.message ?? "No extractable text found in this PDF.");
        return;
      }

      setRawText(result.text);
      setActivePageNumber(result.pages[0]?.pageNumber ?? null);
      setStatus(result.warnings.length > 0 ? "Triage ready with parser warnings" : "Triage ready");
    } catch (err) {
      console.error(err);
      setStatus("Could not read this PDF.");
    } finally {
      setLoading(false);
    }
  }

  const extraction = useMemo(() => {
    if (!rawText) return null;

    try {
      return extractDeadlines(rawText, defaultYear);
    } catch (err) {
      console.error("Extraction error:", err);
      return null;
    }
  }, [rawText, defaultYear]);

  const sourceCandidates = useMemo(
    () => [...(extraction?.candidates ?? []), ...manualCandidates],
    [extraction, manualCandidates]
  );

  const mergedCandidates: DeadlineCandidate[] = useMemo(
    () =>
      sourceCandidates.map((candidate) => ({
        ...candidate,
        ...(manualEdits[candidate.id] ?? {}),
        evidence: {
          ...candidate.evidence,
          ...((manualEdits[candidate.id]?.evidence as Partial<DeadlineCandidate["evidence"]>) ?? {}),
        },
        flags: (manualEdits[candidate.id]?.flags as string[] | undefined) ?? candidate.flags,
      })),
    [manualEdits, sourceCandidates]
  );

  const filteredCandidates = useMemo(
    () => mergedCandidates.filter((candidate) => candidate.confidence >= minConfidence),
    [mergedCandidates, minConfidence]
  );

  const visibleCandidates = useMemo(
    () => filteredCandidates.filter((candidate) => candidate.confidence >= 0),
    [filteredCandidates]
  );

  const displayCandidates = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = !q
      ? visibleCandidates
      : visibleCandidates.filter((candidate) =>
          [candidate.title, candidate.dateISO, candidate.type, evidenceSnippet(candidate)]
            .filter(Boolean)
            .join(" ")
            .toLowerCase()
            .includes(q)
        );

    const sorted = [...filtered];
    sorted.sort((a, b) => {
      if (sort === "confidence-desc") return b.confidence - a.confidence;
      if (sort === "date-desc") return b.dateISO.localeCompare(a.dateISO);
      return a.dateISO.localeCompare(b.dateISO);
    });

    return sorted;
  }, [query, sort, visibleCandidates]);

  const candidatePageMap = useMemo(() => {
    const map = new Map<string, number>();

    mergedCandidates.forEach((candidate) => {
      if (candidate.flags.includes("manual_entry")) return;
      const page = findPageForIndex(parsedPages, candidate.evidence.indexStart);
      if (page) {
        map.set(candidate.id, page.pageNumber);
      }
    });

    return map;
  }, [mergedCandidates, parsedPages]);

  const pageCounts = useMemo(() => {
    const counts = new Map<number, number>();

    displayCandidates.forEach((candidate) => {
      const pageNumber = candidatePageMap.get(candidate.id);
      if (pageNumber) {
        counts.set(pageNumber, (counts.get(pageNumber) ?? 0) + 1);
      }
    });

    return counts;
  }, [candidatePageMap, displayCandidates]);

  const activeCandidate = useMemo(() => {
    if (!activeId) return null;
    return mergedCandidates.find((candidate) => candidate.id === activeId) ?? null;
  }, [activeId, mergedCandidates]);

  const originalActiveCandidate = useMemo(() => {
    if (!activeId) return null;
    return sourceCandidates.find((candidate) => candidate.id === activeId) ?? null;
  }, [activeId, sourceCandidates]);

  const exportableCandidates = useMemo(
    () => displayCandidates.filter((candidate) => /^\d{4}-\d{2}-\d{2}$/.test(candidate.dateISO) && candidate.confidence >= 0),
    [displayCandidates]
  );

  const highConfidenceCount = displayCandidates.filter((candidate) => candidate.confidence >= 80).length;
  const reviewCount = displayCandidates.filter((candidate) => candidate.confidence >= 60 && candidate.confidence < 80).length;
  const unclearCount = displayCandidates.filter((candidate) => candidate.confidence < 60).length;

  const activePage = useMemo(
    () => parsedPages.find((page) => page.pageNumber === activePageNumber) ?? null,
    [activePageNumber, parsedPages]
  );

  const activeCandidatePageNumber = activeCandidate ? candidatePageMap.get(activeCandidate.id) ?? null : null;
  const activePageNeedle =
    activePage && activeCandidatePageNumber === activePage.pageNumber ? matchingNeedle(activePage.text, activeCandidate) : null;

  const pageSegments = useMemo(() => {
    if (!activePage) return [];
    return segmentPreviewText(activePage.text, 320);
  }, [activePage]);

  const pageCandidates = useMemo(() => {
    if (!activePageNumber) return [];
    return displayCandidates.filter((candidate) => candidatePageMap.get(candidate.id) === activePageNumber);
  }, [activePageNumber, candidatePageMap, displayCandidates]);

  useEffect(() => {
    if (displayCandidates.length === 0) {
      setActiveId(null);
      setInspectorOpen(false);
      return;
    }

    if (!activeId || !displayCandidates.some((candidate) => candidate.id === activeId)) {
      setActiveId(displayCandidates[0].id);
    }
  }, [activeId, displayCandidates]);

  useEffect(() => {
    if (parsedPages.length === 0) {
      setActivePageNumber(null);
      return;
    }

    if (!activePageNumber || !parsedPages.some((page) => page.pageNumber === activePageNumber)) {
      setActivePageNumber(parsedPages[0].pageNumber);
    }
  }, [activePageNumber, parsedPages]);

  useEffect(() => {
    if (!activeCandidatePageNumber) return;
    setActivePageNumber(activeCandidatePageNumber);
  }, [activeCandidatePageNumber]);

  const updateCandidate = useCallback((id: string, patch: Partial<DeadlineCandidate>) => {
    setManualEdits((prev) => ({
      ...prev,
      [id]: {
        ...(prev[id] ?? {}),
        ...patch,
      },
    }));
  }, []);

  function addManualDeadline() {
    const today = new Date().toISOString().slice(0, 10);
    const id = `manual_${Date.now()}`;

    const newCandidate: DeadlineCandidate = {
      id,
      title: "Manual deadline",
      type: "other",
      dateISO: today,
      time24h: undefined,
      confidence: 100,
      flags: ["manual_entry", "manually_reviewed"],
      evidence: {
        snippet: "Manually added by user",
        context: "",
        indexStart: -1,
        indexEnd: -1,
        matchedDateText: "",
        matchedKeywords: [],
      },
    };

    setManualCandidates((prev) => [...prev, newCandidate]);
    setActiveId(id);
    setInspectorOpen(true);
  }

  const removeCandidate = useCallback((id: string) => {
    setManualCandidates((prev) => prev.filter((candidate) => candidate.id !== id));
    updateCandidate(id, { confidence: -1 });

    if (activeId === id) {
      setActiveId(null);
      setInspectorOpen(false);
    }
  }, [activeId, updateCandidate]);

  const markCandidateChecked = useCallback((id: string) => {
    const candidate = mergedCandidates.find((item) => item.id === id);
    if (!candidate) return;

    updateCandidate(id, {
      confidence: Math.max(candidate.confidence, 100),
      flags: addFlag(candidate.flags, "manually_reviewed"),
    });
    setStatus("Marked as checked");
  }, [mergedCandidates, updateCandidate]);

  useEffect(() => {
    if (!rawText || displayCandidates.length === 0 || inspectorOpen) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      const target = event.target as HTMLElement | null;
      const tagName = target?.tagName ?? "";
      if (target?.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(tagName)) {
        return;
      }

      const lowerKey = event.key.toLowerCase();
      const activeIndex = displayCandidates.findIndex((candidate) => candidate.id === activeId);
      const safeIndex = activeIndex === -1 ? 0 : activeIndex;

      if (lowerKey === "j" || event.key === "ArrowDown") {
        event.preventDefault();
        const next = displayCandidates[Math.min(displayCandidates.length - 1, safeIndex + 1)];
        if (next) setActiveId(next.id);
        return;
      }

      if (lowerKey === "k" || event.key === "ArrowUp") {
        event.preventDefault();
        const prev = displayCandidates[Math.max(0, safeIndex - 1)];
        if (prev) setActiveId(prev.id);
        return;
      }

      if (lowerKey === "e" || event.key === "Enter") {
        if (activeId) {
          event.preventDefault();
          setInspectorOpen(true);
        }
        return;
      }

      if (lowerKey === "a" && activeId) {
        event.preventDefault();
        markCandidateChecked(activeId);
        return;
      }

      if (lowerKey === "x" && activeId) {
        event.preventDefault();
        removeCandidate(activeId);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeId, displayCandidates, inspectorOpen, markCandidateChecked, rawText, removeCandidate]);

  function exportICS() {
    if (exportableCandidates.length === 0) return;
    const icsContent = buildICS(exportableCandidates);
    downloadICS("cueforth-deadlines.ics", icsContent);
    setLastExport({ kind: "ics", count: exportableCandidates.length });
    setStatus("Calendar file downloaded");
  }

  function exportCSV() {
    if (exportableCandidates.length === 0) return;

    const lines = [
      ["title", "type", "dateISO", "time24h", "confidence"].join(","),
      ...exportableCandidates.map((candidate) =>
        [candidate.title ?? "", candidate.type, candidate.dateISO, candidate.time24h ?? "", String(candidate.confidence)]
          .map((value) => `"${String(value).replace(/"/g, '""')}"`)
          .join(",")
      ),
    ];

    const csv = lines.join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "cueforth-deadlines.csv";
    anchor.click();
    URL.revokeObjectURL(url);

    setLastExport({ kind: "csv", count: exportableCandidates.length });
    setStatus("CSV downloaded");
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragActive(false);
    const file = event.dataTransfer.files?.[0];
    if (file) {
      void onFileChange(file);
    }
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    if (!dragActive) {
      setDragActive(true);
    }
  }

  function handleDragLeave(event: DragEvent<HTMLDivElement>) {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
      return;
    }

    setDragActive(false);
  }

  function handleUploadKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      fileInputRef.current?.click();
    }
  }

  function movePage(direction: -1 | 1) {
    if (!activePageNumber) return;
    const nextPageNumber = clamp(activePageNumber + direction, 1, parsedPages.length);
    setActivePageNumber(nextPageNumber);
  }

  const triageSummary = [
    {
      label: "High confidence",
      value: String(highConfidenceCount),
      detail: "Strong enough to export",
      tone: "text-emerald-700",
    },
    {
      label: "Review",
      value: String(reviewCount),
      detail: "Worth one quick check",
      tone: "text-amber-700",
    },
    {
      label: "Unclear",
      value: String(unclearCount),
      detail: "Fix before calendar export",
      tone: "text-rose-700",
    },
  ];

  return (
    <div className="app-surface relative overflow-hidden">
      <div className={cn("border-b border-[#dfd6c8] bg-[#f6f0e7] px-6 sm:px-8", rawText ? "py-4" : "py-6")}>
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
          <div className="max-w-3xl">
            <div className="flex flex-wrap items-center gap-3">
              <div className="metric-pill">Cueforth · PanicButton</div>
              {rawText ? (
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                  Review desk loaded
                </div>
              ) : null}
            </div>
            <h1
              className={cn(
                "font-display leading-tight tracking-[-0.03em] text-slate-950",
                rawText ? "mt-4 text-3xl sm:text-[2.4rem]" : "mt-5 text-4xl sm:text-5xl"
              )}
            >
              Deadline triage for one course outline.
            </h1>
            <p
              className={cn(
                "max-w-2xl text-slate-600",
                rawText ? "mt-3 text-sm leading-7 sm:text-base" : "mt-4 text-base leading-8"
              )}
            >
              {rawText
                ? "Scan the ledger, verify the uncertain rows, and get this course into a calendar without dragging the panic with it."
                : "Upload the syllabus, move row by row, correct what matters, and leave with a calendar file that feels safe."}
            </p>

            <div className={cn("flex flex-wrap items-center gap-3", rawText ? "mt-4" : "mt-6")}>
              <button onClick={() => fileInputRef.current?.click()} className="action-primary">
                <Upload className="h-4 w-4" />
                Upload PDF
              </button>
              {rawText ? (
                <button onClick={addManualDeadline} className="action-secondary">
                  <Pencil className="h-4 w-4" />
                  Add manual entry
                </button>
              ) : null}
              {status ? <div className="metric-pill">{loading ? "Processing" : status}</div> : null}
            </div>
          </div>

          <div className="paper-panel px-5 py-5">
            <div className="flex items-center justify-between gap-4">
              <div className="eyebrow">{rawText ? "Ledger status" : "Triage status"}</div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                {pages ? `${pages} pages read` : "Awaiting upload"}
              </div>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              {triageSummary.map((item) => (
                <div
                  key={item.label}
                  className="rounded-[18px] border border-[#e6ddd0] bg-[#fbf7f1] px-4 py-3"
                >
                  <div className="text-sm font-semibold text-slate-900">{item.label}</div>
                  <div className={cn("mt-3 text-2xl font-semibold", item.tone)}>{item.value}</div>
                  <div className="mt-1 text-xs uppercase tracking-[0.14em] text-slate-500">{item.detail}</div>
                </div>
              ))}
            </div>

            {rawText ? (
              <div className="mt-4 annotation-note px-4 py-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Keyboard review</div>
                <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-700">
                  <span className="rounded-[999px] border border-[#ddd4c7] bg-[#fffdfa] px-3 py-1.5">J/K move</span>
                  <span className="rounded-[999px] border border-[#ddd4c7] bg-[#fffdfa] px-3 py-1.5">E edit</span>
                  <span className="rounded-[999px] border border-[#ddd4c7] bg-[#fffdfa] px-3 py-1.5">A checked</span>
                  <span className="rounded-[999px] border border-[#ddd4c7] bg-[#fffdfa] px-3 py-1.5">X dismiss</span>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf"
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) {
            void onFileChange(file);
          }
        }}
      />

      <div className="px-6 py-6 sm:px-8">
        {!rawText ? (
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.18fr)_320px]">
            <div
              role="button"
              tabIndex={0}
              onClick={() => fileInputRef.current?.click()}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onKeyDown={handleUploadKeyDown}
              className={cn(
                "paper-panel ruled-paper relative overflow-hidden border-2 border-[#cdc2b3] px-6 py-7 text-left outline-none transition-all duration-200 sm:px-8 sm:py-8",
                dragActive && "upload-zone-active"
              )}
            >
              <div className="absolute right-6 top-6 rounded-[14px] border border-[#d8cec0] bg-[#f7f1e8] px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600">
                Drag or browse
              </div>

              <div className="flex h-14 w-14 items-center justify-center rounded-[18px] bg-slate-950 text-white shadow-[0_12px_32px_rgba(24,33,51,0.14)]">
                <Upload className="h-6 w-6" />
              </div>

              <div className="mt-8 max-w-2xl">
                <div className="eyebrow">Emergency upload desk</div>
                <div className="font-display mt-3 text-5xl leading-[0.95] tracking-[-0.04em] text-slate-950 sm:text-6xl">
                  Drop the course outline here.
                </div>
                <p className="mt-4 max-w-xl text-base leading-8 text-slate-600">
                  Find assignment, midterm, lab, and exam dates from your syllabus. PanicButton is built for the
                  moment the document feels larger than your week.
                </p>
              </div>

              <div className="mt-8 grid gap-3 sm:grid-cols-3">
                {[
                  "Upload the syllabus PDF.",
                  "Review surfaced dates with context.",
                  "Export a calendar that feels safe.",
                ].map((step, index) => (
                  <div key={step} className="annotation-note px-4 py-4">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">0{index + 1}</div>
                    <div className="mt-3 text-sm font-semibold leading-6 text-slate-900">{step}</div>
                  </div>
                ))}
              </div>

              <div className="mt-8 rounded-[22px] border border-[#e6ddd0] bg-[#fffdfa]/95 px-5 py-5">
                <div className="eyebrow">Looks for</div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {["Assignments", "Midterms", "Finals", "Labs", "Projects", "Readings"].map((label) => (
                    <span
                      key={label}
                      className="rounded-[999px] border border-[#e2d8ca] bg-[#f7f1e8] px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-700"
                    >
                      {label}
                    </span>
                  ))}
                </div>
              </div>

              <div className="mt-8 flex items-center gap-2 text-sm font-semibold text-slate-950">
                Open file picker
                <ArrowRight className="h-4 w-4" />
              </div>
            </div>

            <div className="space-y-4">
              <div className="paper-panel px-5 py-5">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <FileText className="h-4 w-4 text-slate-600" />
                  Syllabus cues
                </div>
                <div className="mt-5 space-y-3">
                  {[
                    { date: "Sep 18", text: "Lab 1 due before class begins." },
                    { date: "Oct 06", text: "Midterm exam covers weeks 1 through 5." },
                    { date: "Nov 21", text: "Project checkpoint presentation." },
                  ].map((item) => (
                    <div key={item.text} className="rounded-[18px] border border-[#e5ddd0] bg-[#fbf7f1] px-4 py-3">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0 text-sm leading-6 text-slate-700">{item.text}</div>
                        <div className="rounded-[999px] bg-[#f4d7cf] px-3 py-1.5 text-xs font-semibold text-[#8b3f2f]">
                          {item.date}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="annotation-note px-5 py-5">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <ShieldCheck className="h-4 w-4 text-emerald-700" />
                  Practical trust
                </div>
                <p className="mt-3 text-sm leading-7 text-slate-600">
                  The point is not to guess. The point is to surface likely deadlines fast, keep uncertainty visible,
                  and make correction easy.
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.28fr)_360px]">
            <section className="space-y-4">
              <div className="paper-panel px-4 py-4">
                <div className="grid gap-3 xl:grid-cols-[1.25fr_repeat(3,minmax(0,0.8fr))]">
                  <label className="space-y-2">
                    <div className="eyebrow">Search</div>
                    <div className="field-shell flex items-center gap-3">
                      <Search className="h-4 w-4 text-slate-400" />
                      <input
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder="Title, type, date, or snippet"
                        className="w-full bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400"
                      />
                    </div>
                  </label>

                  <label className="space-y-2">
                    <div className="eyebrow">Sort</div>
                    <div className="relative">
                      <SlidersHorizontal className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <select
                        value={sort}
                        onChange={(event) => setSort(event.target.value as "date-asc" | "date-desc" | "confidence-desc")}
                        className="field-shell-select w-full pl-11"
                      >
                        <option value="date-asc">Date (earliest)</option>
                        <option value="date-desc">Date (latest)</option>
                        <option value="confidence-desc">Confidence (high)</option>
                      </select>
                    </div>
                  </label>

                  <label className="space-y-2">
                    <div className="eyebrow">Min confidence</div>
                    <div className="field-shell">
                      <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                        <span>Threshold</span>
                        <span>{minConfidence}%</span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={minConfidence}
                        onChange={(event) => setMinConfidence(clamp(Number(event.target.value), 0, 100))}
                        className="mt-3 w-full accent-slate-950"
                      />
                    </div>
                  </label>

                  <label className="space-y-2">
                    <div className="eyebrow">Assumed year</div>
                    <div className="field-shell flex items-center justify-between gap-3">
                      <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Year</span>
                      <input
                        type="number"
                        value={defaultYear}
                        onChange={(event) => setDefaultYear(clamp(Number(event.target.value || defaultYear), 1900, 2100))}
                        className="w-24 bg-transparent text-right text-sm font-semibold text-slate-900 outline-none"
                      />
                    </div>
                  </label>
                </div>
              </div>

              {displayCandidates.length === 0 ? (
                <div className="paper-panel px-8 py-12 text-center">
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-[18px] bg-amber-100 text-amber-700">
                    <FileSearch className="h-6 w-6" />
                  </div>
                  <div className="mt-5 text-2xl font-semibold text-slate-950">No rows match the current filters.</div>
                  <p className="mx-auto mt-3 max-w-xl text-sm leading-7 text-slate-600">
                    Lower the confidence threshold, widen the search, or add a manual row if the syllabus still has
                    something important missing.
                  </p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {displayCandidates.map((candidate) => {
                    const date = formatDate(candidate.dateISO);
                    const isActive = activeId === candidate.id;
                    const confidence = confidenceMeta(candidate.confidence);
                    const cue = confidenceCue(candidate.confidence);
                    const pageNumber = candidatePageMap.get(candidate.id);

                    return (
                      <div
                        key={candidate.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => setActiveId(candidate.id)}
                        onFocus={() => setActiveId(candidate.id)}
                        onKeyDown={(event) => {
                          const key = event.key.toLowerCase();
                          if (event.key === "Enter") {
                            event.preventDefault();
                            setActiveId(candidate.id);
                            setInspectorOpen(true);
                          } else if (event.key === " ") {
                            event.preventDefault();
                            setActiveId(candidate.id);
                          } else if (key === "a") {
                            event.preventDefault();
                            markCandidateChecked(candidate.id);
                          } else if (key === "x") {
                            event.preventDefault();
                            removeCandidate(candidate.id);
                          } else if (key === "e") {
                            event.preventDefault();
                            setActiveId(candidate.id);
                            setInspectorOpen(true);
                          }
                        }}
                        className={cn(
                          "triage-row outline-none",
                          candidate.confidence < 60 && "border-[#efc4b6] bg-[#fffdf9]",
                          isActive && "triage-row-active"
                        )}
                      >
                        <div className="grid gap-4 lg:grid-cols-[82px_minmax(0,1fr)_188px]">
                          <div className="border-b border-[#ece3d7] pb-3 lg:border-b-0 lg:border-r lg:pb-0 lg:pr-4">
                            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{date.month}</div>
                            <div className="font-display mt-1.5 text-4xl leading-none tracking-[-0.04em] text-slate-950">
                              {date.day}
                            </div>
                            <div className="mt-2 text-[11px] leading-5 text-slate-500">{date.detail}</div>
                            {candidate.time24h ? (
                              <div className="mt-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-600">
                                <Clock3 className="h-3.5 w-3.5" />
                                {candidate.time24h}
                              </div>
                            ) : null}
                            {pageNumber ? (
                              <div className="mt-2.5 rounded-[999px] bg-[#eef2f7] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-700">
                                Page {pageNumber}
                              </div>
                            ) : null}
                          </div>

                          <div className="min-w-0">
                            <div className="text-lg font-semibold tracking-tight text-slate-950">
                              {candidate.title || "Untitled deadline"}
                            </div>
                            <div className="mt-2.5 flex flex-wrap gap-2">
                              <div
                                className={cn(
                                  "rounded-[999px] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em]",
                                  typeTone(candidate.type)
                                )}
                              >
                                {candidate.type}
                              </div>
                              {candidate.flags.includes("manual_entry") ? (
                                <div className="rounded-[999px] bg-slate-100 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-700">
                                  Manual
                                </div>
                              ) : null}
                              {candidate.flags.includes("conditional_event") ? (
                                <div className="rounded-[999px] bg-amber-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-700">
                                  Conditional
                                </div>
                              ) : null}
                              {candidate.flags.includes("manually_reviewed") ? (
                                <div className="rounded-[999px] bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-700">
                                  Checked
                                </div>
                              ) : null}
                            </div>

                            <div className={cn("mt-3 rounded-[14px] border px-4 py-3", confidenceSnippetTone(candidate.confidence))}>
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                                  Matched in syllabus
                                </div>
                                <div className={cn("text-[10px] font-semibold uppercase tracking-[0.16em]", cue.tone)}>
                                  {cue.label}
                                </div>
                              </div>
                              <p className="mt-2 text-sm leading-6 text-slate-700">{evidenceSnippet(candidate)}</p>
                            </div>

                            <div className="mt-2.5 flex flex-wrap gap-2 text-xs text-slate-500">
                              {candidate.evidence.matchedDateText ? (
                                <span className="rounded-[999px] border border-[#ddd4c7] bg-[#f7f1e8] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-700">
                                  {candidate.evidence.matchedDateText}
                                </span>
                              ) : null}
                              {candidate.evidence.matchedKeywords.slice(0, 3).map((keyword) => (
                                <span
                                  key={keyword}
                                  className="rounded-[999px] bg-[#edf2fb] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-sky-800"
                                >
                                  {keyword}
                                </span>
                              ))}
                              {candidate.evidence.matchedKeywords.length > 3 ? (
                                <span className="rounded-[999px] bg-slate-100 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-600">
                                  +{candidate.evidence.matchedKeywords.length - 3}
                                </span>
                              ) : null}
                            </div>
                          </div>

                          <div className="flex flex-col gap-2.5 lg:items-end">
                            <div className={cn("confidence-pill", confidence.tone)}>
                              <span className="h-2 w-2 rounded-full bg-current" />
                              {confidence.label}
                            </div>
                            <div className="text-sm font-semibold text-slate-900">{candidate.confidence}%</div>
                            <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500">{confidence.detail}</div>

                            <div className="mt-1 flex flex-wrap gap-2 lg:justify-end">
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  markCandidateChecked(candidate.id);
                                }}
                                className="rounded-[12px] border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-700 transition-colors hover:bg-emerald-100"
                              >
                                A Checked
                              </button>
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setActiveId(candidate.id);
                                  setInspectorOpen(true);
                                }}
                                className="rounded-[12px] border border-[#ddd4c7] bg-[#f7f1e8] px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-700 transition-colors hover:bg-[#f1eadf]"
                              >
                                E Edit
                              </button>
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  removeCandidate(candidate.id);
                                }}
                                className="rounded-[12px] border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-rose-700 transition-colors hover:bg-rose-100"
                              >
                                X Dismiss
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            <aside className="space-y-4">
              <div className={cn("paper-panel px-5 py-5", lastExport?.kind === "ics" && "border-emerald-200 bg-[#f8fcf8]")}>
                {lastExport ? (
                  <>
                    <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                      <CheckCircle2 className="h-4 w-4 text-emerald-700" />
                      Calendar secured
                    </div>
                    <h3 className="mt-4 text-2xl font-semibold tracking-tight text-slate-950">
                      The course dates are out of the document now.
                    </h3>
                    <p className="mt-3 text-sm leading-7 text-slate-600">
                      {lastExport.count} deadline{lastExport.count === 1 ? "" : "s"} exported as{" "}
                      {lastExport.kind === "ics" ? ".ics" : "CSV"}. Next step: import it into Google Calendar, Apple
                      Calendar, or Outlook and get this course off your mental stack.
                    </p>
                  </>
                ) : (
                  <>
                    <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                      <CalendarClock className="h-4 w-4 text-slate-700" />
                      Release desk
                    </div>
                    <h3 className="mt-4 text-2xl font-semibold tracking-tight text-slate-950">
                      Send the reviewed rows somewhere safe.
                    </h3>
                    <p className="mt-3 text-sm leading-7 text-slate-600">
                      {exportableCandidates.length} visible deadline{exportableCandidates.length === 1 ? "" : "s"} are ready to leave the
                      page. Export `.ics` first if you want the cleanest handoff.
                    </p>
                  </>
                )}

                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  <button
                    onClick={exportICS}
                    disabled={exportableCandidates.length === 0}
                    className="action-primary w-full disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Download className="h-4 w-4" />
                    Export .ics
                  </button>
                  <button
                    onClick={exportCSV}
                    disabled={exportableCandidates.length === 0}
                    className="action-secondary w-full disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Download CSV
                  </button>
                </div>

                <div className="mt-5 annotation-note px-4 py-4">
                  <div className="flex items-start gap-3">
                    <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-slate-700" />
                    <div className="text-sm leading-7 text-slate-600">
                      Export is based on the rows currently visible in triage. Tighten filters first if you want a smaller release.
                    </div>
                  </div>
                </div>
              </div>

              <div className="paper-panel px-5 py-5">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                    <FileText className="h-4 w-4 text-slate-700" />
                    Course document
                  </div>
                  {activePage ? (
                    <div className="rounded-[999px] bg-[#eef2f7] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-700">
                      Page {activePage.pageNumber}
                    </div>
                  ) : null}
                </div>

                {parsedPages.length > 0 ? (
                  <>
                    <div className="mt-4 flex items-center gap-2">
                      <button
                        onClick={() => movePage(-1)}
                        disabled={!activePageNumber || activePageNumber <= 1}
                        className="rounded-[14px] border border-[#ddd4c7] bg-[#fffdfa] p-2 text-slate-700 transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </button>
                      <div className="flex-1 overflow-x-auto">
                        <div className="flex gap-2 pb-1">
                          {parsedPages.map((page) => {
                            const count = pageCounts.get(page.pageNumber) ?? 0;
                            const isCurrentPage = activePageNumber === page.pageNumber;

                            return (
                              <button
                                key={page.pageNumber}
                                onClick={() => setActivePageNumber(page.pageNumber)}
                                className={cn(
                                  "min-w-fit rounded-[14px] border px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] transition-colors",
                                  isCurrentPage
                                    ? "border-slate-950 bg-slate-950 text-white"
                                    : "border-[#ddd4c7] bg-[#fffdfa] text-slate-700 hover:bg-white"
                                )}
                              >
                                Page {page.pageNumber}
                                {count > 0 ? ` · ${count}` : ""}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                      <button
                        onClick={() => movePage(1)}
                        disabled={!activePageNumber || activePageNumber >= parsedPages.length}
                        className="rounded-[14px] border border-[#ddd4c7] bg-[#fffdfa] p-2 text-slate-700 transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </button>
                    </div>

                    <div className="mt-4 grid gap-3">
                      <div className="annotation-note px-4 py-4">
                        <div className="eyebrow">
                          {activeCandidate && activeCandidatePageNumber === activePage?.pageNumber
                            ? "Pinned evidence on this page"
                            : "Page note"}
                        </div>
                        <p className="mt-2 text-sm leading-7 text-slate-700">
                          {activeCandidate && activeCandidatePageNumber === activePage?.pageNumber
                            ? evidenceSnippet(activeCandidate)
                            : pageCandidates.length > 0
                              ? `${pageCandidates.length} extracted row${pageCandidates.length === 1 ? "" : "s"} currently map to this page.`
                              : "No extracted deadlines are currently pinned to this page."}
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 max-h-[460px] overflow-y-auto pr-1">
                      <div className="document-sheet px-4 py-4">
                        <div className="pointer-events-none absolute inset-y-0 left-12 w-px bg-[#d9cebe]" />
                        <div className="pointer-events-none absolute right-4 top-4 rounded-[999px] border border-[#e1d8ca] bg-[#fffdfa] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                          Extracted page text
                        </div>
                        <div className="space-y-3">
                          {pageSegments.map((segment, index) => {
                            const isHighlighted =
                              !!activePageNeedle && normalizeSpace(segment).toLowerCase().includes(activePageNeedle.toLowerCase());

                            return (
                              <div key={`${index}-${segment.slice(0, 24)}`} className="grid grid-cols-[32px_minmax(0,1fr)] gap-3">
                                <div className="pt-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                                  {String(index + 1).padStart(2, "0")}
                                </div>
                                <div
                                  className={cn(
                                    "rounded-r-[14px] border px-4 py-3 text-sm leading-7 transition-colors",
                                    isHighlighted
                                      ? "border-[#f0ba75] bg-[#fff1dc] text-slate-900 shadow-[inset_4px_0_0_0_#f0ba75]"
                                      : "border-[#e8dfd3] bg-[#fffdfa]/88 text-slate-700"
                                  )}
                                >
                                  {segment}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    <div className="mt-4">
                      <div className="eyebrow">Rows on this page</div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {pageCandidates.length > 0 ? (
                          pageCandidates.map((candidate) => (
                            <button
                              key={candidate.id}
                              onClick={() => setActiveId(candidate.id)}
                              className={cn(
                                "rounded-[999px] border px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] transition-colors",
                                activeId === candidate.id
                                  ? "border-slate-950 bg-slate-950 text-white"
                                  : "border-[#ddd4c7] bg-[#fffdfa] text-slate-700 hover:bg-white"
                              )}
                            >
                              {candidate.title}
                            </button>
                          ))
                        ) : (
                          <div className="text-sm text-slate-500">No extracted deadlines currently mapped to this page.</div>
                        )}
                      </div>
                    </div>
                  </>
                ) : (
                  <p className="mt-4 text-sm leading-7 text-slate-600">Upload a document to open the page viewer.</p>
                )}
              </div>

              {unclearCount > 0 ? (
                <div className="annotation-note px-5 py-5">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
                    <div>
                      <div className="text-sm font-semibold text-slate-900">Keep uncertain rows moving</div>
                      <p className="mt-2 text-sm leading-7 text-slate-600">
                        Start with the rows marked unclear. The review panel keeps the detected value visible while you
                        make the correction.
                      </p>
                    </div>
                  </div>
                </div>
              ) : null}
            </aside>
          </div>
        )}
      </div>

      <Inspector
        selected={inspectorOpen ? activeCandidate : null}
        original={inspectorOpen ? originalActiveCandidate : null}
        onUpdate={updateCandidate}
        onRemove={removeCandidate}
        onClose={() => setInspectorOpen(false)}
      />
    </div>
  );
}
