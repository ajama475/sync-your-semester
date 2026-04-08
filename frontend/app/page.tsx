import Link from "next/link";
import type { Metadata } from "next";
import {
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  FileSearch,
  LayoutList,
  ShieldCheck,
  Upload,
} from "lucide-react";

const featuredServices = [
  {
    title: "Upload a syllabus",
    description: "Start from the exact PDF students already have open in another tab.",
    icon: Upload,
  },
  {
    title: "Review module-style rows",
    description: "See extracted deadlines in a course-layout pattern that feels immediately familiar.",
    icon: LayoutList,
  },
  {
    title: "Verify evidence",
    description: "Keep the source text visible so students trust the review instead of guessing.",
    icon: FileSearch,
  },
  {
    title: "Export a working plan",
    description: "Move confirmed dates into calendar tools without rebuilding the course by hand.",
    icon: CalendarClock,
  },
];

const modulePreview = [
  {
    title: "Start Here - Upload Course Outline",
    detail: "Drop a syllabus PDF and let PanicButton build the first pass.",
    status: "Action needed",
    tint: "bg-[#edf3eb] text-[#2f5e3d]",
  },
  {
    title: "Detected Deadlines",
    detail: "Assignments, labs, midterms, finals, and project milestones appear as review rows.",
    status: "Module list",
    tint: "bg-[#eef2fb] text-[#295a86]",
  },
  {
    title: "Evidence + Corrections",
    detail: "Open the side panel, compare against source text, and fix anything uncertain.",
    status: "Review flow",
    tint: "bg-[#fff3de] text-[#8b6410]",
  },
  {
    title: "Calendar Export",
    detail: "Leave with an `.ics` file or CSV once the course dates look right.",
    status: "Ready last",
    tint: "bg-[#eef7f1] text-[#2d6942]",
  },
];

export const metadata: Metadata = {
  title: "Cueforth",
  description: "Cueforth PanicButton helps students upload a syllabus, review extracted deadlines, and export a working calendar.",
};

export default function Home() {
  return (
    <main className="min-h-screen pb-16">
      <header>
        <div className="campus-topbar">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-5 sm:px-6 lg:px-8">
            <div>
              <div className="text-3xl font-semibold tracking-tight">Cueforth</div>
              <div className="text-sm text-white/70">Student tools that feel familiar on first visit</div>
            </div>

            <div className="flex flex-wrap items-center gap-3 text-sm text-white/85">
              <div className="rounded-full border border-white/20 px-3 py-1.5">PanicButton</div>
              <div className="rounded-full border border-white/20 px-3 py-1.5">Syllabus review</div>
              <div className="rounded-full border border-white/20 px-3 py-1.5">Calendar export</div>
            </div>
          </div>
        </div>

        <div className="campus-subbar">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-6 px-4 py-4 sm:px-6 lg:px-8">
            <div className="text-sm font-semibold text-slate-800">Library-style entry</div>
            <div className="text-sm text-slate-500">Course familiarity</div>
            <div className="text-sm text-slate-500">Modules</div>
            <div className="text-sm text-slate-500">Verification</div>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <section className="library-hero px-6 py-8 sm:px-8 sm:py-10">
          <div className="relative z-10 grid gap-8 lg:grid-cols-[minmax(0,1.1fr)_320px] lg:gap-10">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-white/85">
                Cueforth PanicButton
              </div>

              <h1 className="font-display mt-6 max-w-3xl text-4xl leading-[0.94] tracking-[-0.04em] text-white sm:text-6xl">
                Find what matters next.
              </h1>
              <p className="mt-5 max-w-2xl text-base leading-8 text-white/82 sm:text-lg">
                PanicButton now leans into the visual language students already recognize: a strong campus-style
                header, module-inspired sections, and clear review actions that feel closer to an LMS than a generic tool.
              </p>

              <div className="library-search-shell mt-8 grid overflow-hidden md:grid-cols-[minmax(0,1fr)_240px]">
                <div className="flex items-center gap-4 px-5 py-5 sm:px-6">
                  <div className="flex h-12 w-12 items-center justify-center rounded-[16px] bg-[#edf3eb] text-[#2f5e3d]">
                    <Upload className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="text-base font-semibold text-slate-950">Upload a syllabus PDF</div>
                    <div className="text-sm leading-6 text-slate-500">
                      Start with one course outline and populate a reviewable module list.
                    </div>
                  </div>
                </div>

                <div className="border-t border-[#e4e9e2] bg-[#f8faf7] p-4 md:border-l md:border-t-0">
                  <Link href="/panic" className="action-primary flex w-full items-center justify-center">
                    Open PanicButton
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
              </div>

              <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {featuredServices.map((service) => {
                  const Icon = service.icon;

                  return (
                    <div
                      key={service.title}
                      className="rounded-[18px] border border-white/15 bg-white/10 px-4 py-4 text-white shadow-[0_12px_26px_rgba(12,22,16,0.08)] backdrop-blur"
                    >
                      <Icon className="h-5 w-5 text-[#f0d67f]" />
                      <div className="mt-3 text-base font-semibold">{service.title}</div>
                      <div className="mt-2 text-sm leading-6 text-white/72">{service.description}</div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="relative z-10 space-y-4">
              <div className="paper-panel px-5 py-5">
                <div className="eyebrow">Student-first familiarity</div>
                <div className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">
                  Looks like a course space instead of a random upload form.
                </div>
                <p className="mt-3 text-sm leading-7 text-slate-600">
                  The first impression matters. A familiar structure lowers the mental load before students even start reviewing dates.
                </p>
              </div>

              <div className="rounded-[22px] border border-white/15 bg-white/10 px-5 py-5 text-white shadow-[0_12px_30px_rgba(10,18,13,0.14)] backdrop-blur">
                <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/72">What changes</div>
                <div className="mt-4 space-y-3">
                  <div className="flex items-start gap-3">
                    <LayoutList className="mt-0.5 h-4 w-4 shrink-0 text-[#f0d67f]" />
                    <div className="text-sm leading-6 text-white/82">Module-style rows make the extracted deadlines easier to scan.</div>
                  </div>
                  <div className="flex items-start gap-3">
                    <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#f0d67f]" />
                    <div className="text-sm leading-6 text-white/82">Verification stays visible so the UI feels trustworthy, not magical.</div>
                  </div>
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#f0d67f]" />
                    <div className="text-sm leading-6 text-white/82">Export becomes the obvious final step instead of another hidden control.</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="paper-panel mt-8 px-6 py-6 sm:px-8">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="eyebrow">Featured services</div>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
                Built for the moment you need clarity most.
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-600 sm:text-base">
                The tool keeps the student mental model simple: upload the course document, review the surfaced rows,
                and leave with a working calendar.
              </p>
            </div>

            <Link href="/panic" className="action-secondary">
              Go to workspace
            </Link>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {featuredServices.map((service) => {
              const Icon = service.icon;

              return (
                <Link key={service.title} href="/panic" className="service-tile">
                  <Icon className="h-5 w-5 text-[#2f5e3d]" />
                  <div className="mt-4 text-lg font-semibold tracking-tight text-slate-950">{service.title}</div>
                  <p className="mt-2 text-sm leading-7 text-slate-600">{service.description}</p>
                </Link>
              );
            })}
          </div>
        </section>

        <section className="mt-8 grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
          <aside className="campus-sidebar">
            <div className="eyebrow">Course navigation preview</div>
            <div className="mt-3 text-lg font-semibold tracking-tight text-slate-950">What students recognize</div>

            <div className="mt-5 space-y-1">
              <div className="campus-sidebar-link">Home</div>
              <div className="campus-sidebar-link">Announcements</div>
              <div className="campus-sidebar-link campus-sidebar-link-active">Modules</div>
              <div className="campus-sidebar-link">Calendar</div>
              <div className="campus-sidebar-link">Grades</div>
            </div>
          </aside>

          <div className="paper-panel overflow-hidden">
            <div className="border-b border-[#dde3d9] bg-[#eef3ec] px-6 py-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-lg font-semibold text-slate-950">Modules</div>
                  <div className="mt-1 text-sm text-slate-500">Structured the way students already expect to navigate a course.</div>
                </div>
                <div className="metric-pill">First visit feels lighter</div>
              </div>
            </div>

            <div className="divide-y divide-[#e5e9e3]">
              {modulePreview.map((item) => (
                <div key={item.title} className="flex flex-col gap-4 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-start gap-4">
                    <div className={`flex h-11 w-11 items-center justify-center rounded-[16px] ${item.tint}`}>
                      <LayoutList className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-lg font-semibold tracking-tight text-slate-950">{item.title}</div>
                      <div className="mt-1 text-sm leading-6 text-slate-600">{item.detail}</div>
                    </div>
                  </div>

                  <div className="metric-pill w-fit">{item.status}</div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
