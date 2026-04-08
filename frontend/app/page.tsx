import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, Upload } from "lucide-react";

export const metadata: Metadata = {
  title: "Cueforth",
  description: "Cueforth PanicButton helps students upload a syllabus, review extracted deadlines, and export a working calendar.",
};

export default function Home() {
  return (
    <main className="min-h-screen">
      <header className="border-b border-[#d9ddd6] bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <div>
            <div className="text-lg font-semibold tracking-tight text-slate-950">Cueforth</div>
            <div className="text-sm text-slate-500">PanicButton</div>
          </div>

          <Link href="/panic" className="text-sm font-medium text-[#2f5e3d] transition-colors hover:text-[#244a30]">
            Open app
          </Link>
        </div>
      </header>

      <section className="mx-auto max-w-5xl px-4 py-20 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <div className="eyebrow">Syllabus to calendar</div>
          <h1 className="font-display mt-4 text-4xl font-semibold tracking-tight text-slate-950 sm:text-6xl">
            Turn a syllabus into a clear deadline list.
          </h1>
          <p className="mt-5 text-base leading-8 text-slate-600 sm:text-lg">
            Upload a course outline, review the dates that matter, and export a calendar file when it looks right.
          </p>

          <div className="mt-8 flex justify-center">
            <Link href="/panic" className="action-primary">
              <Upload className="h-4 w-4" />
              Upload a syllabus
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>

        <div className="mx-auto mt-12 grid max-w-3xl gap-4 md:grid-cols-3">
          {[
            "Upload a PDF.",
            "Review extracted deadlines.",
            "Export `.ics` or CSV.",
          ].map((step, index) => (
            <div key={step} className="paper-panel px-5 py-5 text-left">
              <div className="text-sm font-semibold text-slate-950">0{index + 1}</div>
              <div className="mt-2 text-sm leading-6 text-slate-600">{step}</div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
