"use client";

import { useMemo, useRef, useState } from "react";
import {
  CalendarClock,
  Clock3,
  Download,
  FileSearch,
  Search,
  SlidersHorizontal,
  Sparkles,
  Upload,
} from "lucide-react";
import { parsePDF } from "@/lib/parser/pdfParser";
import { buildICS, downloadICS } from "@/lib/calendar/ics";
import { extractDeadlines } from "@/lib/extract/extractor";
import type { DeadlineCandidate } from "@/lib/extract/models";
import { cn } from "@/lib/utils";
import { Inspector } from "./Inspector";

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
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

function confidenceTone(confidence: number) {
  if (confidence >= 80) {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  if (confidence >= 60) {
    return "border-sky-200 bg-sky-50 text-sky-700";
  }

  return "border-amber-200 bg-amber-50 text-amber-700";
}

function typeTone(type: DeadlineCandidate["type"]) {
  switch (type) {
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

export default function PanicUpload() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [status, setStatus] = useState("");
  const [pages, setPages] = useState<number | null>(null);
  const [rawText, setRawText] = useState("");
  const [loading, setLoading] = useState(false);

  const [defaultYear, setDefaultYear] = useState<number>(() => new Date().getFullYear());
  const [minConfidence, setMinConfidence] = useState(45);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"date-asc" | "date-desc" | "confidence-desc">("date-asc");

  const [manualEdits, setManualEdits] = useState<Record<string, Partial<DeadlineCandidate>>>({});
  const [manualCandidates, setManualCandidates] = useState<DeadlineCandidate[]>([]);

  async function onFileChange(file: File) {
    setLoading(true);
    setStatus("Reading PDF...");
    setPages(null);
    setRawText("");
    setSelectedId(null);
    setManualEdits({});
    setManualCandidates([]);

    try {
      const result = await parsePDF(file);
      setPages(result.metadata.pages);
      setRawText(result.text);
      setStatus("Ready for review");
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

  const mergedCandidates: DeadlineCandidate[] = useMemo(() => {
    const base = [...(extraction?.candidates ?? []), ...manualCandidates];

    return base.map((candidate) => ({
      ...candidate,
      ...(manualEdits[candidate.id] ?? {}),
      evidence: {
        ...candidate.evidence,
        ...((manualEdits[candidate.id]?.evidence as Partial<DeadlineCandidate["evidence"]>) ?? {}),
      },
      flags: (manualEdits[candidate.id]?.flags as string[] | undefined) ?? candidate.flags,
    }));
  }, [extraction, manualCandidates, manualEdits]);

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
          [candidate.title, candidate.dateISO, candidate.type].filter(Boolean).join(" ").toLowerCase().includes(q)
        );

    const sorted = [...filtered];
    sorted.sort((a, b) => {
      if (sort === "confidence-desc") return b.confidence - a.confidence;
      if (sort === "date-desc") return b.dateISO.localeCompare(a.dateISO);
      return a.dateISO.localeCompare(b.dateISO);
    });

    return sorted;
  }, [query, sort, visibleCandidates]);

  const selected = useMemo(() => {
    if (!selectedId) return null;
    return mergedCandidates.find((candidate) => candidate.id === selectedId) ?? null;
  }, [mergedCandidates, selectedId]);

  const exportableCandidates = useMemo(
    () => displayCandidates.filter((candidate) => /^\d{4}-\d{2}-\d{2}$/.test(candidate.dateISO) && candidate.confidence >= 0),
    [displayCandidates]
  );

  function updateCandidate(id: string, patch: Partial<DeadlineCandidate>) {
    setManualEdits((prev) => ({
      ...prev,
      [id]: {
        ...(prev[id] ?? {}),
        ...patch,
      },
    }));
  }

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
      flags: ["manual_entry"],
      evidence: {
        snippet: "Manually added by user",
        context: "",
        indexStart: 0,
        indexEnd: 0,
        matchedDateText: "",
        matchedKeywords: [],
      },
    };

    setManualCandidates((prev) => [...prev, newCandidate]);
    setSelectedId(id);
  }

  function removeCandidate(id: string) {
    setManualCandidates((prev) => prev.filter((candidate) => candidate.id !== id));
    updateCandidate(id, { confidence: -1 });

    if (selectedId === id) {
      setSelectedId(null);
    }
  }

  function exportICS() {
    if (exportableCandidates.length === 0) return;
    const icsContent = buildICS(exportableCandidates);
    downloadICS("cueforth-deadlines.ics", icsContent);
  }

  function exportCSV() {
    const lines = [
      ["title", "type", "dateISO", "time24h", "confidence"].join(","),
      ...exportableCandidates.map((candidate) =>
        [
          candidate.title ?? "",
          candidate.type,
          candidate.dateISO,
          candidate.time24h ?? "",
          String(candidate.confidence),
        ]
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
  }

  const stats = [
    {
      label: "Pages parsed",
      value: pages ? String(pages) : "0",
      detail: pages ? "Ready to review" : "Upload a syllabus",
    },
    {
      label: "Visible deadlines",
      value: String(displayCandidates.length),
      detail: extraction ? `${extraction.stats.totalDatesFound} dates found` : "No extraction yet",
    },
    {
      label: "Needs review",
      value: String(displayCandidates.filter((candidate) => candidate.confidence < 60).length),
      detail: rawText ? "Low-confidence candidates" : "Manual review stays visible",
    },
  ];

  return (
    <div className="app-surface relative overflow-hidden">
      <div className="border-b border-black/5 px-6 py-6 sm:px-8">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-2xl">
            <div className="metric-pill">Cueforth · PanicButton</div>
            <h1 className="font-display mt-5 text-4xl leading-tight tracking-[-0.03em] text-slate-950 sm:text-5xl">
              Turn a syllabus into a working calendar.
            </h1>
            <p className="mt-4 max-w-xl text-base leading-8 text-slate-600">
              PanicButton surfaces likely deadlines, then lets you review every decision before anything leaves the page.
            </p>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <button onClick={() => fileInputRef.current?.click()} className="action-primary">
                <Upload className="h-4 w-4" />
                Upload PDF
              </button>
              {rawText ? (
                <button onClick={addManualDeadline} className="action-secondary">
                  Add manual entry
                </button>
              ) : null}
              {status ? <div className="metric-pill">{loading ? "Processing" : status}</div> : null}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3 xl:min-w-[470px]">
            {stats.map((stat) => (
              <div key={stat.label} className="soft-card-muted px-4 py-4">
                <div className="eyebrow">{stat.label}</div>
                <div className="mt-3 text-2xl font-semibold text-slate-950">{stat.value}</div>
                <div className="mt-2 text-sm text-slate-500">{stat.detail}</div>
              </div>
            ))}
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
          if (file) onFileChange(file);
        }}
      />

      <div className="px-6 py-6 sm:px-8">
        {!rawText ? (
          <div className="grid gap-6 xl:grid-cols-[1.08fr_0.92fr]">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="soft-card group relative overflow-hidden p-8 text-left transition-all duration-200 hover:-translate-y-1"
            >
              <div className="absolute inset-x-10 top-0 h-32 rounded-full bg-sky-200/40 blur-3xl transition-transform duration-300 group-hover:scale-110" />
              <div className="relative">
                <div className="flex h-14 w-14 items-center justify-center rounded-[20px] bg-slate-950 text-white shadow-[0_16px_40px_rgba(15,23,42,0.18)]">
                  <Upload className="h-6 w-6" />
                </div>
                <div className="mt-6 text-3xl font-semibold text-slate-950">Bring in a syllabus.</div>
                <p className="mt-4 max-w-xl text-base leading-8 text-slate-600">
                  Upload a course PDF and let PanicButton turn dense academic text into a reviewable timeline.
                </p>

                <div className="mt-8 flex flex-wrap gap-3">
                  <div className="metric-pill">Private by default</div>
                  <div className="metric-pill">Review before export</div>
                  <div className="metric-pill">.ics ready</div>
                </div>

                <div className="mt-10 inline-flex items-center gap-2 text-sm font-semibold text-slate-900">
                  Open file picker
                  <Sparkles className="h-4 w-4 text-sky-600" />
                </div>
              </div>
            </button>

            <div className="grid gap-4">
              <div className="soft-card px-6 py-6">
                <div className="flex items-center gap-3 text-slate-900">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-sky-100 text-sky-700">
                    <FileSearch className="h-5 w-5" />
                  </div>
                  <div className="text-lg font-semibold">Readable output, not raw extraction</div>
                </div>
                <p className="mt-4 text-sm leading-7 text-slate-600">
                  Titles, dates, times, and evidence are surfaced in one place so the workflow feels grounded and fast.
                </p>
              </div>

              <div className="soft-card px-6 py-6">
                <div className="flex items-center gap-3 text-slate-900">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
                    <CalendarClock className="h-5 w-5" />
                  </div>
                  <div className="text-lg font-semibold">Calendar export when you are ready</div>
                </div>
                <p className="mt-4 text-sm leading-7 text-slate-600">
                  Keep control of the review step, then export a clean `.ics` file or lightweight CSV.
                </p>
              </div>

              <div className="soft-card px-6 py-6">
                <div className="eyebrow">What PanicButton looks for</div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {["Assignments", "Midterms", "Finals", "Labs", "Projects", "Readings"].map((label) => (
                    <div key={label} className="rounded-full bg-[#f5efe5] px-3 py-2 text-sm font-medium text-slate-700">
                      {label}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="soft-card px-5 py-5">
              <div className="grid gap-3 xl:grid-cols-[1.25fr_repeat(3,minmax(0,0.8fr))_160px]">
                <label className="flex items-center gap-3 field-shell">
                  <Search className="h-4 w-4 text-slate-400" />
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search deadlines, types, or dates..."
                    className="w-full bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400"
                  />
                </label>

                <label className="flex items-center gap-3 field-shell">
                  <SlidersHorizontal className="h-4 w-4 text-slate-400" />
                  <select
                    value={sort}
                    onChange={(event) => setSort(event.target.value as "date-asc" | "date-desc" | "confidence-desc")}
                    className="w-full bg-transparent text-sm text-slate-800 outline-none"
                  >
                    <option value="date-asc">Date (earliest)</option>
                    <option value="date-desc">Date (latest)</option>
                    <option value="confidence-desc">Confidence (high)</option>
                  </select>
                </label>

                <label className="field-shell flex flex-col justify-center gap-2">
                  <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                    <span>Min confidence</span>
                    <span>{minConfidence}%</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={minConfidence}
                    onChange={(event) => setMinConfidence(clamp(Number(event.target.value), 0, 100))}
                    className="w-full accent-slate-900"
                  />
                </label>

                <label className="field-shell flex items-center justify-between gap-3">
                  <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Assumed year</span>
                  <input
                    type="number"
                    value={defaultYear}
                    onChange={(event) => setDefaultYear(clamp(Number(event.target.value || defaultYear), 1900, 2100))}
                    className="w-24 bg-transparent text-right text-sm font-semibold text-slate-900 outline-none"
                  />
                </label>

                <div className="flex flex-wrap items-center justify-end gap-3 xl:justify-start">
                  <button onClick={exportCSV} disabled={exportableCandidates.length === 0} className="action-secondary disabled:opacity-50">
                    CSV
                  </button>
                  <button onClick={exportICS} disabled={exportableCandidates.length === 0} className="action-primary disabled:opacity-50">
                    <Download className="h-4 w-4" />
                    Export .ics
                  </button>
                </div>
              </div>
            </div>

            {displayCandidates.length === 0 ? (
              <div className="soft-card px-8 py-12 text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-[20px] bg-amber-100 text-amber-700">
                  <FileSearch className="h-6 w-6" />
                </div>
                <div className="mt-5 text-2xl font-semibold text-slate-950">No deadlines match the current filters.</div>
                <p className="mx-auto mt-3 max-w-xl text-sm leading-7 text-slate-600">
                  Lower the confidence threshold, search less narrowly, or add an item manually if the parser missed something important.
                </p>
              </div>
            ) : (
              <div className="grid gap-4 xl:grid-cols-2">
                {displayCandidates.map((candidate) => {
                  const date = formatDate(candidate.dateISO);
                  const isActive = selectedId === candidate.id;

                  return (
                    <button
                      key={candidate.id}
                      onClick={() => setSelectedId(candidate.id)}
                      className={cn("candidate-card text-left", isActive && "candidate-card-active")}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <div className="eyebrow">{
                            candidate.flags.includes("manual_entry") ? "Manual entry" : candidate.type
                          }</div>
                          <div className="mt-3 text-2xl font-semibold text-slate-950">{candidate.title || "Untitled deadline"}</div>
                        </div>
                        <div className={cn("confidence-pill", confidenceTone(candidate.confidence))}>
                          <span className="h-2 w-2 rounded-full bg-current" />
                          {candidate.confidence}% match
                        </div>
                      </div>

                      <div className="mt-6 flex items-end justify-between gap-6">
                        <div>
                          <div className="text-sm font-medium uppercase tracking-[0.2em] text-slate-500">{date.month}</div>
                          <div className="font-display mt-1 text-5xl leading-none tracking-[-0.03em] text-slate-950">
                            {date.day}
                          </div>
                          <div className="mt-2 text-sm text-slate-500">{date.detail}</div>
                        </div>

                        {candidate.time24h ? (
                          <div className="rounded-2xl bg-[#f5efe5] px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                              <Clock3 className="h-3.5 w-3.5" />
                              Time
                            </div>
                            <div className="mt-2 text-base font-semibold text-slate-900">{candidate.time24h}</div>
                          </div>
                        ) : null}
                      </div>

                      <div className="mt-5 flex flex-wrap gap-2">
                        <div className={cn("rounded-full px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em]", typeTone(candidate.type))}>
                          {candidate.type}
                        </div>
                        {candidate.flags.includes("conditional_event") ? (
                          <div className="rounded-full bg-amber-50 px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-amber-700">
                            Conditional
                          </div>
                        ) : null}
                        {candidate.flags.includes("manual_entry") ? (
                          <div className="rounded-full bg-slate-100 px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-700">
                            Manual
                          </div>
                        ) : null}
                      </div>

                      <div className="mt-5 rounded-[22px] border border-[#e6dfd2] bg-[#fbf8f3] px-4 py-4">
                        <div className="eyebrow">Evidence</div>
                        <p className="mt-3 max-h-24 overflow-hidden text-sm leading-7 text-slate-600">
                          {candidate.evidence.snippet}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      <Inspector
        selected={selected}
        onUpdate={updateCandidate}
        onRemove={removeCandidate}
        onClose={() => setSelectedId(null)}
      />
    </div>
  );
}
