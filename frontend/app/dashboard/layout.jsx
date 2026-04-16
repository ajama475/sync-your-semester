"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

function IconSchedule() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
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

function IconThisWeek() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function BrandIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

const navSections = [
  {
    label: "Semester",
    items: [
      { label: "Semester Schedule", href: "/dashboard", icon: IconSchedule },
      { label: "This Week", href: "/dashboard/thisweek", icon: IconThisWeek },
      { label: "Calendar", href: "/dashboard/calendar", icon: IconCalendar },
    ],
  },
  {
    label: "Syllabi",
    items: [
      { label: "Upload", href: "/dashboard/upload", icon: IconUpload },
      { label: "Review", href: "/dashboard/review", icon: IconReview },
      { label: "Course Tasks", href: "/dashboard/coursetasks", icon: IconCourseTasks },
    ],
  },
];

export default function DashboardLayout({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const [setupValid, setSetupValid] = useState(null);

  useEffect(() => {
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

  if (setupValid === null) return null;
  if (setupValid === false) return null;

  function isActive(href) {
    if (href === "/dashboard") return pathname === "/dashboard";
    return pathname.startsWith(href);
  }

  return (
    <div className="dashboard">
      <aside className="sidebar">
        <Link href="/dashboard" className="sidebar-brand">
          <span className="sidebar-brand__icon"><BrandIcon /></span>
          <span className="sidebar-brand__text">Sync Your Semester</span>
        </Link>

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
      </aside>

      <section className="main-content">{children}</section>
    </div>
  );
}
