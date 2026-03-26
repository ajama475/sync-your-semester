import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, CalendarClock, FileSearch, ShieldCheck, Upload } from "lucide-react";

const steps = [
  {
    number: "01",
    title: "Drop the course outline",
    description: "Start with the PDF you are staring at right now. PanicButton is built for that exact moment.",
  },
  {
    number: "02",
    title: "Review the surfaced dates",
    description: "Assignments, labs, midterms, finals, and readings are pulled into a triage list with evidence.",
  },
  {
    number: "03",
    title: "Export a working calendar",
    description: "Fix anything uncertain, then leave with a calendar file you can trust.",
  },
];

const syllabusMarks = [
  { date: "Sep 18", label: "Lab 1 due", tone: "bg-sky-100 text-sky-700" },
  { date: "Oct 06", label: "Midterm", tone: "bg-rose-100 text-rose-700" },
  { date: "Nov 21", label: "Project checkpoint", tone: "bg-amber-100 text-amber-700" },
  { date: "Dec 09", label: "Final exam", tone: "bg-emerald-100 text-emerald-700" },
];

export const metadata: Metadata = {
  title: "Cueforth",
  description: "Cueforth PanicButton helps students upload a syllabus, review extracted deadlines, and export a working calendar.",
};

export default function Home() {
  return (
    <main className="min-h-screen px-4 pb-14 pt-4 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <header className="ambient-shell flex items-center justify-between rounded-[20px] px-5 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-[14px] bg-slate-950 text-sm font-semibold text-white">
              C
            </div>
            <div>
              <div className="text-sm font-semibold text-slate-950">Cueforth</div>
              <div className="text-xs text-slate-500">PanicButton</div>
            </div>
          </div>

          <Link href="/panic" className="action-secondary">
            Open workspace
          </Link>
        </header>

        <section className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1.18fr)_320px]">
          <div className="app-surface px-6 py-7 sm:px-8 sm:py-8">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="metric-pill">Cueforth · PanicButton</div>
              <div className="text-xs font-medium uppercase tracking-[0.2em] text-slate-500">Emergency syllabus intake</div>
            </div>

            <div className="mt-8 max-w-3xl">
              <h1 className="font-display text-5xl leading-[0.94] tracking-[-0.04em] text-slate-950 sm:text-6xl">
                Open the course outline. Recover the semester.
              </h1>
              <p className="mt-5 max-w-2xl text-base leading-8 text-slate-600 sm:text-lg">
                Find assignment, midterm, lab, and exam dates from your syllabus. Review the uncertain ones. Export
                the rest before the panic spreads.
              </p>
            </div>

            <Link href="/panic" className="mt-8 block">
              <div className="paper-panel ruled-paper relative overflow-hidden border-2 border-[#cdc2b3] px-6 py-7 transition-transform duration-200 hover:-translate-y-0.5">
                <div className="absolute right-6 top-6 rounded-[14px] border border-[#d8cec0] bg-[#f7f1e8] px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600">
                  PDF only
                </div>

                <div className="flex h-14 w-14 items-center justify-center rounded-[18px] bg-slate-950 text-white shadow-[0_12px_32px_rgba(24,33,51,0.14)]">
                  <Upload className="h-6 w-6" />
                </div>

                <div className="mt-8 max-w-2xl">
                  <div className="eyebrow">Main action</div>
                  <div className="mt-3 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
                    Drop a syllabus PDF.
                  </div>
                  <p className="mt-3 max-w-xl text-sm leading-7 text-slate-600 sm:text-base">
                    PanicButton reads the outline, marks likely deadlines, and gives you a review desk instead of a wall of text.
                  </p>
                </div>

                <div className="mt-8 flex flex-wrap gap-2">
                  <span className="metric-pill">Assignment dates</span>
                  <span className="metric-pill">Midterms</span>
                  <span className="metric-pill">Labs</span>
                  <span className="metric-pill">Finals</span>
                </div>

                <div className="mt-10 flex items-center gap-2 text-sm font-semibold text-slate-950">
                  Open PanicButton
                  <ArrowRight className="h-4 w-4" />
                </div>
              </div>
            </Link>

            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              {steps.map((step) => (
                <div key={step.number} className="annotation-note px-4 py-4">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">{step.number}</div>
                  <div className="mt-3 text-base font-semibold text-slate-900">{step.title}</div>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{step.description}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-4">
            <div className="paper-panel px-5 py-5">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <FileSearch className="h-4 w-4 text-slate-600" />
                Deadline marks
              </div>
              <div className="mt-5 space-y-3">
                {syllabusMarks.map((item) => (
                  <div key={item.label} className="rounded-[18px] border border-[#e5ddd0] bg-[#fbf7f1] px-4 py-3">
                    <div className="flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-slate-900">{item.label}</div>
                        <div className="mt-1 text-xs uppercase tracking-[0.16em] text-slate-500">Found in syllabus text</div>
                      </div>
                      <div className={`rounded-[999px] px-3 py-1.5 text-xs font-semibold ${item.tone}`}>{item.date}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="annotation-note px-5 py-5">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <ShieldCheck className="h-4 w-4 text-emerald-700" />
                Trust statement
              </div>
              <p className="mt-3 text-sm leading-7 text-slate-600">
                The point is not magic. The point is to show likely dates fast, keep the uncertain ones visible, and
                let you leave with control.
              </p>
            </div>

            <div className="paper-panel px-5 py-5">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <CalendarClock className="h-4 w-4 text-sky-700" />
                End state
              </div>
              <p className="mt-3 text-sm leading-7 text-slate-600">
                Upload PDF → review candidates → export calendar. No browsing, no setup maze, no fake dashboard.
              </p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
