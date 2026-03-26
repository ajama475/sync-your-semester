export function DashboardShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen px-4 pb-10 pt-4 sm:px-6 lg:px-8">
      <main className="mx-auto max-w-7xl">
        {children}
      </main>
    </div>
  );
}
