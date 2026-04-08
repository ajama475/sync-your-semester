import Link from "next/link";

export function DashboardShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="border-b border-[#d9ddd6] bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <div>
            <div className="text-lg font-semibold tracking-tight text-slate-950">Cueforth</div>
            <div className="text-sm text-slate-500">PanicButton</div>
          </div>

          <Link href="/" className="text-sm font-medium text-[#2f5e3d] transition-colors hover:text-[#244a30]">
            Home
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">{children}</main>
    </div>
  );
}
