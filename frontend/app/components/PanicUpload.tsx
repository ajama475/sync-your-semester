"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type KeyboardEvent as ReactKeyboardEvent } from "react";
import {
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
  SlidersHorizontal,
  Upload,
} from "lucide-react";
import { buildICS, downloadICS } from "@/lib/calendar/ics";
import { extractDeadlines } from "@/lib/extract/extractor";
import type { DeadlineCandidate } from "@/lib/extract/models";
import type { ParsedPDFPage } from "@/lib/parser/pdfParser";
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
      const { parsePDF } = await import("@/lib/parser/pdfParser");
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

  return (
    <div className="space-y-6">
      <div className="paper-panel px-6 py-6 sm:px-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-2xl">
            <div className="metric-pill">Cueforth PanicButton</div>
            <h1 className="font-display mt-4 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
              {rawText ? "Review the extracted deadlines." : "Upload your syllabus."}
            </h1>
            <p className="mt-3 text-sm leading-7 text-slate-600 sm:text-base">
              {rawText
                ? "Check the dates, fix anything uncertain, and export a calendar file when it looks right."
                : "Drop in a PDF and PanicButton will pull out likely deadlines for you to review."}
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <button onClick={() => fileInputRef.current?.click()} className="action-primary">
              <Upload className="h-4 w-4" />
              Upload PDF
            </button>
            {rawText ? (
              <button onClick={addManualDeadline} className="action-secondary">
                <Pencil className="h-4 w-4" />
                Add item
              </button>
            ) : null}
          </div>
        </div>

        {(status || rawText) ? (
          <div className="mt-5 flex flex-wrap gap-2">
            {status ? <div className="metric-pill">{loading ? "Processing" : status}</div> : null}
            {rawText ? <div className="metric-pill">{displayCandidates.length} deadlines found</div> : null}
            {rawText ? <div className="metric-pill">{reviewCount + unclearCount} need review</div> : null}
          </div>
        ) : null}
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

      {!rawText ? (
        <div className="mx-auto max-w-3xl">
          <div
            role="button"
            tabIndex={0}
            onClick={() => fileInputRef.current?.click()}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onKeyDown={handleUploadKeyDown}
            className={cn(
              "paper-panel border-2 border-dashed border-[#cfd6ce] px-6 py-14 text-center outline-none transition-all duration-200 sm:px-10",
              dragActive && "upload-zone-active"
            )}
          >
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-[18px] bg-[#2f5e3d] text-white">
              <Upload className="h-6 w-6" />
            </div>
            <h2 className="mt-6 text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">
              Drop in a syllabus PDF.
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-7 text-slate-600 sm:text-base">
              PanicButton looks for assignment, exam, lab, and project dates so you can review them in one place.
            </p>

            <div className="mt-6 flex flex-wrap justify-center gap-2">
              {["Assignments", "Midterms", "Finals", "Labs", "Projects"].map((label) => (
                <span key={label} className="metric-pill">
                  {label}
                </span>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
          <section className="space-y-4">
            <div className="paper-panel px-4 py-4">
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <label className="space-y-2">
                  <div className="eyebrow">Search</div>
                  <div className="field-shell flex items-center gap-3">
                    <Search className="h-4 w-4 text-slate-400" />
                    <input
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder="Search deadlines"
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
                      className="mt-3 w-full accent-[#2f5e3d]"
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
                <div className="mt-5 text-2xl font-semibold text-slate-950">No deadlines match the current filters.</div>
                <p className="mx-auto mt-3 max-w-xl text-sm leading-7 text-slate-600">
                  Lower the confidence threshold, change the search, or add an item manually.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
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
                      <div className="grid gap-4 lg:grid-cols-[84px_minmax(0,1fr)_170px]">
                        <div className="border-b border-[#e5e9e3] pb-3 lg:border-b-0 lg:border-r lg:pb-0 lg:pr-4">
                          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{date.month}</div>
                          <div className="font-display mt-1 text-4xl leading-none tracking-[-0.04em] text-slate-950">{date.day}</div>
                          {candidate.time24h ? (
                            <div className="mt-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-600">
                              <Clock3 className="h-3.5 w-3.5" />
                              {candidate.time24h}
                            </div>
                          ) : null}
                        </div>

                        <div className="min-w-0">
                          <div className="text-lg font-semibold tracking-tight text-slate-950">
                            {candidate.title || "Untitled deadline"}
                          </div>

                          <div className="mt-2 flex flex-wrap gap-2">
                            <div
                              className={cn(
                                "rounded-[999px] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em]",
                                typeTone(candidate.type)
                              )}
                            >
                              {candidate.type}
                            </div>
                            {pageNumber ? <div className="metric-pill">Page {pageNumber}</div> : null}
                            {candidate.flags.includes("manual_entry") ? <div className="metric-pill">Manual</div> : null}
                          </div>

                          <div className={cn("mt-3 rounded-[14px] border px-4 py-3", confidenceSnippetTone(candidate.confidence))}>
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                                Evidence
                              </div>
                              <div className={cn("text-[10px] font-semibold uppercase tracking-[0.16em]", cue.tone)}>{cue.label}</div>
                            </div>
                            <p className="mt-2 text-sm leading-6 text-slate-700">{evidenceSnippet(candidate)}</p>
                          </div>
                        </div>

                        <div className="flex flex-col gap-2 lg:items-end">
                          <div className={cn("confidence-pill", confidence.tone)}>
                            <span className="h-2 w-2 rounded-full bg-current" />
                            {confidence.label}
                          </div>

                          <div className="flex flex-wrap gap-2 lg:justify-end">
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                setActiveId(candidate.id);
                                setInspectorOpen(true);
                              }}
                              className="rounded-[12px] border border-[#cfd6ce] bg-white px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-700 transition-colors hover:bg-[#fafbf9]"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                markCandidateChecked(candidate.id);
                              }}
                              className="rounded-[12px] border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-emerald-700 transition-colors hover:bg-emerald-100"
                            >
                              Confirm
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
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                {lastExport ? <CheckCircle2 className="h-4 w-4 text-emerald-700" /> : <CalendarClock className="h-4 w-4 text-[#2f5e3d]" />}
                {lastExport ? "Export complete" : "Export"}
              </div>

              <p className="mt-4 text-sm leading-7 text-slate-600">
                {lastExport
                  ? `${lastExport.count} deadline${lastExport.count === 1 ? "" : "s"} exported as ${lastExport.kind === "ics" ? ".ics" : "CSV"}.`
                  : `${highConfidenceCount} ready, ${reviewCount} to review, ${unclearCount} unclear.`}
              </p>

              <div className="mt-5 grid gap-3">
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
            </div>

            <div className="paper-panel px-5 py-5">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <FileText className="h-4 w-4 text-[#2f5e3d]" />
                  Source document
                </div>
                {activePage ? <div className="metric-pill">Page {activePage.pageNumber}</div> : null}
              </div>

              {parsedPages.length > 0 ? (
                <>
                  <div className="mt-4 flex items-center gap-2">
                    <button
                      onClick={() => movePage(-1)}
                      disabled={!activePageNumber || activePageNumber <= 1}
                      className="rounded-[12px] border border-[#cfd6ce] bg-white p-2 text-slate-700 transition-colors hover:bg-[#fafbf9] disabled:cursor-not-allowed disabled:opacity-40"
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
                                "min-w-fit rounded-[12px] border px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] transition-colors",
                                isCurrentPage
                                  ? "border-[#2f5e3d] bg-[#2f5e3d] text-white"
                                  : "border-[#cfd6ce] bg-white text-slate-700 hover:bg-[#fafbf9]"
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
                      className="rounded-[12px] border border-[#cfd6ce] bg-white p-2 text-slate-700 transition-colors hover:bg-[#fafbf9] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="mt-4 max-h-[460px] overflow-y-auto">
                    <div className="document-sheet px-4 py-4">
                      <div className="space-y-3">
                        {pageSegments.map((segment, index) => {
                          const isHighlighted =
                            !!activePageNeedle && normalizeSpace(segment).toLowerCase().includes(activePageNeedle.toLowerCase());

                          return (
                            <div key={`${index}-${segment.slice(0, 24)}`} className="grid grid-cols-[28px_minmax(0,1fr)] gap-3">
                              <div className="pt-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                                {String(index + 1).padStart(2, "0")}
                              </div>
                              <div
                                className={cn(
                                  "rounded-[12px] border px-4 py-3 text-sm leading-7 transition-colors",
                                  isHighlighted ? "border-[#f0ba75] bg-[#fff4e3] text-slate-900" : "border-[#dde2db] bg-white text-slate-700"
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
                </>
              ) : (
                <p className="mt-4 text-sm leading-7 text-slate-600">Upload a document to open the source text.</p>
              )}
            </div>
          </aside>
        </div>
      )}

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
