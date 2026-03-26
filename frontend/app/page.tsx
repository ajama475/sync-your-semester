import Link from "next/link";
import type { Metadata } from "next";
import {
  ArrowRight,
  CalendarClock,
  Grid2x2Plus,
  ShieldCheck,
  Sparkles,
  WandSparkles,
} from "lucide-react";

const pillars = [
  {
    icon: ShieldCheck,
    title: "Reviewable by design",
    description: "Deadlines are surfaced with evidence and context, so the product feels reliable instead of magical.",
  },
  {
    icon: Sparkles,
    title: "Calm under pressure",
    description: "The experience is built for the exact moment students need clarity most, without adding more noise.",
  },
  {
    icon: Grid2x2Plus,
    title: "Structured to expand",
    description: "Cueforth starts with syllabi, then grows into reminders, workload visibility, and semester planning.",
  },
];

const steps = [
  "Upload a syllabus or course document.",
  "PanicButton surfaces deadlines, dates, and timing signals.",
  "Review what matters and export a working plan.",
];

const previewItems = [
  { title: "Assignment 3", date: "Mar 31", tone: "bg-sky-100 text-sky-700" },
  { title: "Midterm review", date: "Apr 2", tone: "bg-emerald-100 text-emerald-700" },
  { title: "Final project brief", date: "Apr 7", tone: "bg-amber-100 text-amber-700" },
];

const metrics = [
  { label: "Workflow", value: "PanicButton" },
  { label: "Model", value: "Review-first" },
  { label: "Export", value: ".ics + CSV" },
];

export const metadata: Metadata = {
  title: "Cueforth",
  description: "Cueforth helps students turn course chaos into a plan. Start with PanicButton to extract reviewable deadlines from a syllabus.",
};

export default function Home() {
  return (
    <main className="min-h-screen px-4 pb-16 pt-4 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <header className="ambient-shell flex items-center justify-between rounded-[28px] px-5 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-950 text-white shadow-[0_12px_28px_rgba(15,23,42,0.18)]">
              C
            </div>
            <div>
              <div className="text-sm font-semibold text-slate-900">Cueforth</div>
              <div className="text-xs text-slate-500">PanicButton by Cueforth</div>
            </div>
          </div>

          <Link href="/panic" className="action-secondary">
            Open PanicButton
          </Link>
        </header>

        <section className="mt-6 grid gap-6 lg:grid-cols-[1.08fr_0.92fr]">
          <div className="app-surface px-6 py-8 sm:px-10 sm:py-10">
            <div className="metric-pill">Find what matters next</div>
            <h1 className="font-display mt-6 max-w-4xl text-5xl leading-[0.95] tracking-[-0.03em] text-slate-950 sm:text-6xl lg:text-7xl">
              A student planning product that feels deliberate.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-600 sm:text-xl">
              Cueforth turns scattered course information into clear next actions. Start with PanicButton to extract
              reviewable deadlines from a syllabus in minutes.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/panic" className="action-primary">
                Try PanicButton
                <ArrowRight className="h-4 w-4" />
              </Link>
              <a href="#why-cueforth" className="action-secondary">
                See the product logic
              </a>
            </div>

            <div className="mt-10 grid gap-3 sm:grid-cols-3">
              {metrics.map((metric) => (
                <div key={metric.label} className="soft-card-muted px-4 py-4">
                  <div className="eyebrow">{metric.label}</div>
                  <div className="mt-3 text-lg font-semibold text-slate-900">{metric.value}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="app-surface relative overflow-hidden px-6 py-8 sm:px-8">
            <div className="absolute inset-x-10 top-0 h-36 rounded-full bg-sky-200/40 blur-3xl" />
            <div className="absolute bottom-8 right-0 h-36 w-36 rounded-full bg-amber-200/50 blur-3xl" />

            <div className="relative">
              <div className="metric-pill">
                <CalendarClock className="h-3.5 w-3.5" />
                Preview
              </div>

              <div className="soft-card mt-5 p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-sm font-semibold text-slate-900">This week in PanicButton</div>
                    <div className="mt-1 text-sm text-slate-500">Reviewable deadlines, not raw PDF text.</div>
                  </div>
                  <div className="rounded-full bg-slate-950 px-3 py-1 text-xs font-semibold text-white">Live</div>
                </div>

                <div className="mt-5 space-y-3">
                  {previewItems.map((item) => (
                    <div
                      key={item.title}
                      className="flex items-center justify-between rounded-2xl border border-[#e5ded2] bg-[#fcfaf6] px-4 py-3"
                    >
                      <div>
                        <div className="text-sm font-semibold text-slate-900">{item.title}</div>
                        <div className="mt-1 text-xs text-slate-500">Evidence available · ready to review</div>
                      </div>
                      <div className={`rounded-full px-3 py-1 text-xs font-semibold ${item.tone}`}>{item.date}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div className="soft-card px-5 py-5">
                  <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                    <ShieldCheck className="h-4 w-4 text-emerald-600" />
                    Trust the evidence
                  </div>
                  <p className="mt-3 text-sm leading-7 text-slate-600">
                    Every surfaced item should be inspectable, editable, and easy to confirm under pressure.
                  </p>
                </div>
                <div className="soft-card px-5 py-5">
                  <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                    <WandSparkles className="h-4 w-4 text-sky-600" />
                    Keep the motion
                  </div>
                  <p className="mt-3 text-sm leading-7 text-slate-600">
                    Export what matters now, then grow into a broader semester workflow without losing the calm.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="why-cueforth" className="mt-8 grid gap-4 lg:grid-cols-3">
          {pillars.map((pillar) => {
            const Icon = pillar.icon;
            return (
              <div key={pillar.title} className="soft-card px-6 py-6">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-950 text-white">
                  <Icon className="h-5 w-5" />
                </div>
                <h2 className="mt-5 text-xl font-semibold text-slate-950">{pillar.title}</h2>
                <p className="mt-3 text-sm leading-7 text-slate-600">{pillar.description}</p>
              </div>
            );
          })}
        </section>

        <section className="mt-8 app-surface px-6 py-8 sm:px-10">
          <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr]">
            <div>
              <div className="metric-pill">Workflow</div>
              <h2 className="font-display mt-5 text-4xl leading-tight tracking-[-0.03em] text-slate-950 sm:text-5xl">
                Start with PanicButton. Build from there.
              </h2>
              <p className="mt-4 max-w-xl text-base leading-8 text-slate-600">
                The first product surface is intentionally narrow: extract what matters from a syllabus, review it with
                proof, and move forward with a cleaner calendar.
              </p>
            </div>

            <div className="grid gap-4">
              {steps.map((step, index) => (
                <div key={step} className="soft-card flex gap-4 px-5 py-5">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-950 text-sm font-semibold text-white">
                    0{index + 1}
                  </div>
                  <div className="pt-1 text-base leading-7 text-slate-700">{step}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mt-8 app-surface px-6 py-8 sm:px-10">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="eyebrow">Cueforth PanicButton</div>
              <h2 className="font-display mt-4 text-4xl leading-tight tracking-[-0.03em] text-slate-950 sm:text-5xl">
                Open the workflow and turn one syllabus into a working plan.
              </h2>
            </div>

            <Link href="/panic" className="action-primary">
              Open PanicButton
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
