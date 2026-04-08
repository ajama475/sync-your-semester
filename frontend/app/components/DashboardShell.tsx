import Link from "next/link";
import { Bell, CalendarDays, FileStack, GraduationCap, House, Search } from "lucide-react";

const navItems = [
  { label: "Home", icon: House },
  { label: "Announcements", icon: Bell },
  { label: "Modules", icon: FileStack, active: true },
  { label: "Calendar Export", icon: CalendarDays },
];

export function DashboardShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <header>
        <div className="campus-topbar">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-5 sm:px-6 lg:px-8">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-[16px] border border-white/20 bg-white/10 text-white">
                <GraduationCap className="h-6 w-6" />
              </div>
              <div>
                <div className="text-2xl font-semibold tracking-tight">Cueforth</div>
                <div className="text-sm text-white/70">PanicButton student workspace</div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 text-sm text-white/80">
              <div className="hidden rounded-full border border-white/20 px-3 py-1.5 sm:inline-flex">
                Familiar course-page layout
              </div>
              <Link href="/" className="rounded-full border border-white/20 px-3 py-1.5 transition-colors hover:bg-white/10">
                Marketing page
              </Link>
              <div className="flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-white/10">
                <Search className="h-4 w-4" />
              </div>
            </div>
          </div>
        </div>

        <div className="campus-subbar">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-6 px-4 py-4 sm:px-6 lg:px-8">
            <div className="text-sm font-semibold text-slate-800">Current term workspace</div>
            <div className="text-sm text-slate-500">Course home</div>
            <div className="text-sm text-slate-500">Announcements</div>
            <div className="text-sm font-semibold text-[#2f5e3d]">Modules</div>
            <div className="text-sm text-slate-500">Calendar export</div>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 pb-10 pt-6 sm:px-6 lg:px-8">
        <div className="grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
          <aside className="campus-sidebar h-fit lg:sticky lg:top-6">
            <div className="eyebrow">Winter term workspace</div>
            <div className="mt-3 text-lg font-semibold tracking-tight text-slate-950">Student tools</div>

            <nav className="mt-5 space-y-1">
              {navItems.map((item) => {
                const Icon = item.icon;

                return (
                  <div
                    key={item.label}
                    className={`campus-sidebar-link ${item.active ? "campus-sidebar-link-active" : ""}`}
                  >
                    <Icon className="h-4 w-4" />
                    <span>{item.label}</span>
                  </div>
                );
              })}
            </nav>

            <div className="mt-6 rounded-[18px] border border-[#dbe3d8] bg-[#f3f7f1] px-4 py-4">
              <div className="text-sm font-semibold text-slate-900">Why it feels familiar</div>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Clear left navigation, module-style sections, and obvious next actions help students orient fast.
              </p>
            </div>
          </aside>

          <main>{children}</main>
        </div>
      </div>
    </div>
  );
}
