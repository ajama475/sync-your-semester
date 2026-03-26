"use client";

import React from "react";
import { X, Trash2, ShieldCheck, AlertCircle, ExternalLink, Calendar as CalendarIcon, Type, Clock, Info } from "lucide-react";
import { DeadlineCandidate, DeadlineType } from "@/lib/extract/models";
import { cn } from "@/lib/utils";

interface InspectorProps {
    selected: DeadlineCandidate | null;
    onUpdate: (id: string, patch: Partial<DeadlineCandidate>) => void;
    onRemove: (id: string) => void;
    onClose: () => void;
    className?: string;
}

export const Inspector = ({
    selected,
    onUpdate,
    onRemove,
    onClose,
    className,
}: InspectorProps) => {
    if (!selected) return null;

    const isLowConfidence = selected.confidence < 60;

    return (
        <div className={cn(
            "inspector-shell fixed inset-y-0 right-0 z-50 flex w-full flex-col sm:w-[430px]",
            className
        )}>
            <div className="flex items-start justify-between border-b border-[#dfd6c8] px-6 py-6">
                <div>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">Inspector</div>
                    <h2 className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">Verify and refine</h2>
                    <p className="mt-2 text-sm text-slate-500">Review the evidence, then correct what matters.</p>
                </div>
                <button
                    onClick={onClose}
                    className="rounded-2xl border border-[#ddd4c7] bg-white/75 p-3 text-slate-500 transition-colors hover:bg-white hover:text-slate-900"
                >
                    <X className="w-5 h-5" />
                </button>
            </div>

            <div className="flex-1 space-y-8 overflow-y-auto px-6 py-6 scrollbar-none">
                {isLowConfidence && (
                    <div className="rounded-[24px] border border-amber-200 bg-amber-50 px-5 py-5">
                        <div className="flex gap-3">
                        <AlertCircle className="h-5 w-5 shrink-0 text-amber-600" />
                        <div className="space-y-1">
                            <p className="text-sm font-semibold text-amber-800">Manual review recommended</p>
                            <p className="text-sm leading-7 text-amber-700">This candidate looks plausible, but the evidence is not strong enough to trust blindly.</p>
                        </div>
                        </div>
                    </div>
                )}

                <section className="space-y-4">
                    <div className="space-y-2">
                        <label className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                            <Type className="w-3 h-3" />
                            Event Title
                        </label>
                        <input
                            value={selected.title}
                            onChange={(e) => onUpdate(selected.id, { title: e.target.value })}
                            className="field-shell w-full"
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                            <ShieldCheck className="w-3 h-3" />
                            Category
                        </label>
                        <select
                            value={selected.type}
                            onChange={(e) => onUpdate(selected.id, { type: e.target.value as DeadlineType })}
                            className="field-shell-select w-full"
                        >
                            {[
                                "midterm", "final", "quiz", "assignment", "lab", "project", "reading", "other"
                            ].map((t) => (
                                <option key={t} value={t}>{t.toUpperCase()}</option>
                            ))}
                        </select>
                    </div>
                </section>

                <section className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <label className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                            <CalendarIcon className="w-3 h-3" />
                            Date (ISO)
                        </label>
                        <input
                            value={selected.dateISO}
                            onChange={(e) => onUpdate(selected.id, { dateISO: e.target.value })}
                            className="field-shell w-full"
                        />
                    </div>
                    <div className="space-y-2">
                        <label className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                            <Clock className="w-3 h-3" />
                            Time
                        </label>
                        <input
                            value={selected.time24h ?? ""}
                            onChange={(e) => onUpdate(selected.id, { time24h: e.target.value || undefined })}
                            placeholder="e.g. 23:59"
                            className="field-shell w-full"
                        />
                    </div>
                </section>

                <section className="space-y-3">
                    <label className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                        <Info className="w-3 h-3" />
                        Found Evidence
                    </label>
                    <div className="rounded-[24px] border border-[#e5ddd0] bg-[#fcfaf6] p-5 text-sm leading-7 text-slate-600">
                        {selected.evidence.snippet}
                    </div>
                    <div className="flex flex-wrap gap-2 pt-2">
                        <span className="rounded-full border border-[#ded4c7] bg-white/80 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                            Match: <span className="text-slate-900">{selected.evidence.matchedDateText}</span>
                        </span>
                        {selected.evidence.matchedKeywords.map((kw) => (
                            <span key={kw} className="rounded-full bg-[#eef4ff] px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-sky-700">
                                {kw}
                            </span>
                        ))}
                    </div>
                </section>
            </div>

            <div className="flex gap-3 border-t border-[#dfd6c8] px-6 py-6">
                <button
                    onClick={() => onRemove(selected.id)}
                    className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700 transition-colors hover:bg-rose-100"
                >
                    <Trash2 className="w-4 h-4" />
                    Remove
                </button>
                <button
                    onClick={onClose}
                    className="action-primary flex-1 rounded-2xl px-4 py-3"
                >
                    <ExternalLink className="w-4 h-4" />
                    Save
                </button>
            </div>
        </div>
    );
};
