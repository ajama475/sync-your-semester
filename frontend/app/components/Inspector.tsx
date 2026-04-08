"use client";

import { AlertCircle, Calendar as CalendarIcon, Clock, Info, Pencil, ShieldCheck, Trash2, Type, X } from "lucide-react";
import { DeadlineCandidate, DeadlineType } from "@/lib/extract/models";
import { cn } from "@/lib/utils";

interface InspectorProps {
  selected: DeadlineCandidate | null;
  original: DeadlineCandidate | null;
  onUpdate: (id: string, patch: Partial<DeadlineCandidate>) => void;
  onRemove: (id: string) => void;
  onClose: () => void;
  className?: string;
}

function changedLabel(current: string | undefined, original: string | undefined) {
  return current !== original && original;
}

export const Inspector = ({ selected, original, onUpdate, onRemove, onClose, className }: InspectorProps) => {
  if (!selected) return null;

  const isLowConfidence = selected.confidence < 60;
  const titleChanged = changedLabel(selected.title, original?.title);
  const typeChanged = changedLabel(selected.type, original?.type);
  const dateChanged = changedLabel(selected.dateISO, original?.dateISO);
  const timeChanged = changedLabel(selected.time24h ?? "", original?.time24h ?? "");

  const changes = [
    titleChanged ? `Title: ${original?.title} → ${selected.title}` : null,
    typeChanged ? `Type: ${original?.type} → ${selected.type}` : null,
    dateChanged ? `Date: ${original?.dateISO} → ${selected.dateISO}` : null,
    timeChanged ? `Time: ${original?.time24h || "none"} → ${selected.time24h || "none"}` : null,
  ].filter(Boolean) as string[];

  return (
    <div className={cn("inspector-shell fixed inset-y-0 right-0 z-50 flex w-full flex-col sm:w-[460px]", className)}>
      <div className="border-b border-[#d9e0d7] px-6 py-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">Review panel</div>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">Verify and correct</h2>
            <p className="mt-2 text-sm text-slate-500">Compare the detected record with the final value you want to export.</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-[16px] border border-[#d7ddd4] bg-white p-3 text-slate-500 transition-colors hover:bg-[#f8faf7] hover:text-slate-900"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <div
            className={cn(
              "confidence-pill",
              selected.confidence >= 80
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : selected.confidence >= 60
                  ? "border-amber-200 bg-amber-50 text-amber-700"
                  : "border-rose-200 bg-rose-50 text-rose-700"
            )}
          >
            <span className="h-2 w-2 rounded-full bg-current" />
            {selected.confidence}% confidence
          </div>
          <div className="metric-pill">{selected.flags.includes("manual_entry") ? "Manual entry" : "Detected from syllabus"}</div>
        </div>
      </div>

      <div className="flex-1 space-y-6 overflow-y-auto px-6 py-6 scrollbar-none">
        {isLowConfidence ? (
          <div className="annotation-note px-5 py-5">
            <div className="flex gap-3">
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
              <div>
                <p className="text-sm font-semibold text-slate-900">Review recommended</p>
                <p className="mt-1 text-sm leading-7 text-slate-600">
                  This row is worth checking manually. The match looks plausible, but the supporting signal is not strong.
                </p>
              </div>
            </div>
          </div>
        ) : null}

        <section className="paper-panel px-5 py-5">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <ShieldCheck className="h-4 w-4 text-[#2f5e3d]" />
            Detected record
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-[18px] border border-[#dfe5dc] bg-[#f8fbf7] px-4 py-3">
              <div className="eyebrow">Title</div>
              <div className="mt-2 text-sm font-semibold text-slate-900">{original?.title || selected.title}</div>
            </div>
            <div className="rounded-[18px] border border-[#dfe5dc] bg-[#f8fbf7] px-4 py-3">
              <div className="eyebrow">Type</div>
              <div className="mt-2 text-sm font-semibold uppercase text-slate-900">{original?.type || selected.type}</div>
            </div>
            <div className="rounded-[18px] border border-[#dfe5dc] bg-[#f8fbf7] px-4 py-3">
              <div className="eyebrow">Date</div>
              <div className="mt-2 text-sm font-semibold text-slate-900">{original?.dateISO || selected.dateISO}</div>
            </div>
            <div className="rounded-[18px] border border-[#dfe5dc] bg-[#f8fbf7] px-4 py-3">
              <div className="eyebrow">Time</div>
              <div className="mt-2 text-sm font-semibold text-slate-900">{original?.time24h || "Not specified"}</div>
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <Pencil className="h-4 w-4 text-[#2f5e3d]" />
            Final values
          </div>

          <div className="space-y-2">
            <label className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
              <Type className="h-3 w-3" />
              Event title
            </label>
            <input
              value={selected.title}
              onChange={(event) => onUpdate(selected.id, { title: event.target.value })}
              className="field-shell w-full"
            />
            {titleChanged ? <div className="text-xs text-slate-500">Detected: {original?.title}</div> : null}
          </div>

          <div className="space-y-2">
            <label className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
              <ShieldCheck className="h-3 w-3" />
              Category
            </label>
            <select
              value={selected.type}
              onChange={(event) => onUpdate(selected.id, { type: event.target.value as DeadlineType })}
              className="field-shell-select w-full"
            >
              {["exam", "midterm", "final", "quiz", "assignment", "lab", "project", "reading", "other"].map((type) => (
                <option key={type} value={type}>
                  {type.toUpperCase()}
                </option>
              ))}
            </select>
            {typeChanged ? <div className="text-xs text-slate-500">Detected: {original?.type}</div> : null}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                <CalendarIcon className="h-3 w-3" />
                Date
              </label>
              <input
                value={selected.dateISO}
                onChange={(event) => onUpdate(selected.id, { dateISO: event.target.value })}
                className="field-shell w-full"
              />
              {dateChanged ? <div className="text-xs text-slate-500">Detected: {original?.dateISO}</div> : null}
            </div>

            <div className="space-y-2">
              <label className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                <Clock className="h-3 w-3" />
                Time
              </label>
              <input
                value={selected.time24h ?? ""}
                onChange={(event) => onUpdate(selected.id, { time24h: event.target.value || undefined })}
                placeholder="e.g. 23:59"
                className="field-shell w-full"
              />
              {timeChanged ? <div className="text-xs text-slate-500">Detected: {original?.time24h || "none"}</div> : null}
            </div>
          </div>
        </section>

        {changes.length > 0 ? (
          <section className="annotation-note px-5 py-5">
            <div className="eyebrow">What changed</div>
            <div className="mt-3 space-y-2">
              {changes.map((change) => (
                <div key={change} className="text-sm leading-6 text-slate-700">
                  {change}
                </div>
              ))}
            </div>
          </section>
        ) : null}

        <section className="space-y-3">
          <label className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
            <Info className="h-3 w-3" />
            Evidence
          </label>
          <div className="paper-panel px-5 py-5 text-sm leading-7 text-slate-600">
            {selected.evidence.context || selected.evidence.snippet}
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="metric-pill">Matched date: {selected.evidence.matchedDateText || "not captured"}</span>
            {selected.evidence.matchedKeywords.map((keyword) => (
              <span key={keyword} className="rounded-[999px] bg-[#eef4ec] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#2f5e3d]">
                {keyword}
              </span>
            ))}
          </div>
        </section>
      </div>

      <div className="flex gap-3 border-t border-[#d9e0d7] px-6 py-6">
        <button
          onClick={() => onRemove(selected.id)}
          className="inline-flex flex-1 items-center justify-center gap-2 rounded-[16px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700 transition-colors hover:bg-rose-100"
        >
          <Trash2 className="h-4 w-4" />
          Remove
        </button>
        <button onClick={onClose} className="action-primary flex-1">
          Done reviewing
        </button>
      </div>
    </div>
  );
};
