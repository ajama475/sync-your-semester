"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

function IconLedger() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

function IconChart() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3v18h18" />
      <path d="M18 9l-5 5-4-4-5 5" />
    </svg>
  );
}

function IconUpload() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}

function IconReview() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 11.08V12a10 10 0 11-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  );
}

function IconCourseTasks() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <line x1="3" y1="6" x2="3.01" y2="6" />
      <line x1="3" y1="12" x2="3.01" y2="12" />
      <line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
  );
}

function IconCalendar() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
      <rect x="7" y="14" width="3" height="3" rx="0.5" />
      <rect x="14" y="14" width="3" height="3" rx="0.5" />
    </svg>
  );
}

function IconFocus() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function BrandIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 8a4 4 0 0 1 8 0c0 4-8 4-8 8a4 4 0 0 0 8 0" />
      <path d="M16 11l-4 4-2-2" />
    </svg>
  );
}

function IconSun() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="5" />
      <line x1="12" y1="1" x2="12" y2="3" />
      <line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="1" y1="12" x2="3" y2="12" />
      <line x1="21" y1="12" x2="23" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>
  );
}

function IconMoon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
    </svg>
  );
}

const navSections = [
  {
    label: "Execution",
    items: [
      { label: "What Matters", href: "/dashboard", icon: IconFocus },
    ],
  },
  {
    label: "Planning",
    items: [
      { label: "Task Ledger", href: "/dashboard/ledger", icon: IconLedger },
      { label: "Calendar", href: "/dashboard/calendar", icon: IconCalendar },
      { label: "Semester Forecast", href: "/dashboard/forecast", icon: IconChart },
    ],
  },
  {
    label: "Setup",
    items: [
      { label: "Syllabus Lab", href: "/dashboard/sources", icon: IconUpload },
    ],
  },
];

const pageNames = {
  "/dashboard": "What Matters",
  "/dashboard/ledger": "Task Ledger",
  "/dashboard/forecast": "Semester Forecast",
  "/dashboard/calendar": "Calendar",
  "/dashboard/sources": "Syllabus Lab",
  "/dashboard/review": "Verification Queue",
};

function IconSidebar() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect width="18" height="18" x="3" y="3" rx="2" />
      <path d="M9 3v18" />
    </svg>
  );
}

function useTheme() {
  const [theme, setTheme] = useState("dark");

  useEffect(() => {
    // Read current state from the DOM (set by the init script in layout.jsx)
    const current = document.documentElement.getAttribute("data-theme");
    setTheme(current === "light" ? "light" : "dark");
  }, []);

  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    if (next === "light") {
      document.documentElement.setAttribute("data-theme", "light");
    } else {
      document.documentElement.removeAttribute("data-theme");
    }
    try { localStorage.setItem("sys-theme", next); } catch {}
  }

  return { theme, toggle };
}

export default function DashboardLayout({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const [setupValid, setSetupValid] = useState(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const { theme, toggle: toggleTheme } = useTheme();

  useEffect(() => {
    // Check local storage for collapsed state
    try {
      const saved = localStorage.getItem("sys-sidebar-collapsed");
      if (saved === "true") setIsSidebarCollapsed(true);
    } catch {}

    try {
      const raw = localStorage.getItem("sys-semester-setup");
      if (!raw) { setSetupValid(false); return; }
      const parsed = JSON.parse(raw);
      const hasDates = parsed?.semesterDates?.startDate && parsed?.semesterDates?.endDate;
      const hasCourses = Array.isArray(parsed?.courses) && parsed.courses.some((c) => c.code?.trim() || c.name?.trim());
      setSetupValid(hasDates && hasCourses);
    } catch {
      setSetupValid(false);
    }
  }, []);

  useEffect(() => {
    if (setupValid === false) {
      router.replace("/");
    }
  }, [setupValid, router]);

  async function handleReset() {
    // 1. Clear localStorage
    localStorage.removeItem("sys-semester-setup");

    // 2. Clear IndexedDB
    try {
      const DB_NAME = "sync-your-semester";
      const request = window.indexedDB.open(DB_NAME);
      request.onsuccess = () => {
        const db = request.result;
        const storeNames = Array.from(db.objectStoreNames);
        if (storeNames.length > 0) {
          const tx = db.transaction(storeNames, "readwrite");
          for (const name of storeNames) {
            tx.objectStore(name).clear();
          }
          tx.oncomplete = () => {
            db.close();
            router.replace("/");
          };
          tx.onerror = () => {
            db.close();
            router.replace("/");
          };
        } else {
          db.close();
          router.replace("/");
        }
      };
      request.onerror = () => {
        router.replace("/");
      };
    } catch {
      router.replace("/");
    }
  }

  function toggleSidebar() {
    const next = !isSidebarCollapsed;
    setIsSidebarCollapsed(next);
    try { localStorage.setItem("sys-sidebar-collapsed", String(next)); } catch {}
  }

  if (setupValid === null || setupValid === false) {
    return (
      <div className="dashboard" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ color: "var(--text-tertiary)" }}>Preparing your semester...</p>
      </div>
    );
  }

  function isActive(href) {
    if (href === "/dashboard") return pathname === "/dashboard";
    return pathname.startsWith(href);
  }

  // Derive current page name for breadcrumb
  const currentPageName = pageNames[pathname] || "Dashboard";

  return (
    <div className={`dashboard${isSidebarCollapsed ? " dashboard--collapsed" : ""}`}>
      <aside className={`sidebar${isSidebarCollapsed ? " sidebar--collapsed" : ""}`}>
        <div className="sidebar-header">
          <Link href="/dashboard" className="sidebar-brand">
            <span className="sidebar-brand__icon"><BrandIcon /></span>
            <span className="sidebar-brand__text">Sync Your Semester</span>
          </Link>
          <button 
            className="sidebar-toggle-btn" 
            onClick={toggleSidebar} 
            title="Collapse Sidebar"
            aria-label="Collapse Sidebar"
          >
            <IconSidebar />
          </button>
        </div>

        {navSections.map((section) => (
          <div className="sidebar-section" key={section.label}>
            <div className="sidebar-section__label">{section.label}</div>
            <nav className="sidebar-nav">
              {section.items.map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`sidebar-nav__item${isActive(item.href) ? " sidebar-nav__item--active" : ""}`}
                  >
                    <span className="sidebar-nav__icon"><Icon /></span>
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>
        ))}

        <div className="sidebar-footer">
          <button
            className="sidebar-nav__item sidebar-reset-button"
            onClick={() => setShowResetConfirm(true)}
          >
            Reset semester
          </button>
        </div>
      </aside>

      <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
        {/* Top bar */}
        <div className="topbar">
          <div className="topbar__left">
            {isSidebarCollapsed && (
              <button 
                className="topbar__restore-btn" 
                onClick={toggleSidebar}
                title="Restore Sidebar"
                aria-label="Restore Sidebar"
              >
                <IconSidebar />
              </button>
            )}
            <div className="topbar__breadcrumb">
              <span>Sync Your Semester</span>
              <span className="topbar__breadcrumb-sep">/</span>
              <span className="topbar__breadcrumb-current">{currentPageName}</span>
            </div>
          </div>
          <div className="topbar__actions">
            <Link
              href="/focus"
              className="topbar__calm-link"
              aria-label="Enter Calm Mode"
              title="Focus on one thing"
            >
              <IconFocus />
              <span>Calm Mode</span>
            </Link>
            <button
              className="theme-toggle"
              onClick={toggleTheme}
              aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
              title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
            >
              {theme === "dark" ? <IconSun /> : <IconMoon />}
            </button>
          </div>
        </div>

        <section className="main-content">{children}</section>
      </div>

      {showResetConfirm && (
        <div className="modal-backdrop" onClick={() => setShowResetConfirm(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 400 }}>
            <div className="modal__header">
              <h2 className="modal__title">Reset all data?</h2>
              <button className="modal__close" onClick={() => setShowResetConfirm(false)}>×</button>
            </div>
            <div className="modal__body">
              <p style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.6, margin: 0 }}>
                This will permanently remove your semester setup, all courses, uploaded syllabi, approved tasks,
                manual tasks, recurring tasks, and completion history. You will return to a fresh start.
              </p>
              <p style={{ fontSize: 13, color: "var(--text-tertiary)", margin: 0 }}>
                This action cannot be undone.
              </p>
            </div>
            <div className="modal__footer">
              <button className="btn-ghost" onClick={() => setShowResetConfirm(false)}>Cancel</button>
              <button
                className="btn-primary"
                style={{ background: "var(--tag-red-text)" }}
                onClick={handleReset}
              >
                Reset everything
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
