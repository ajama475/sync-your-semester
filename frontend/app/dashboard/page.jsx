"use client";

import { useMemo, useState } from "react";

/* ---- SVG Icons (lightweight, inline) ---- */

function IconCalendar() {
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

function IconCheckCircle() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 11.08V12a10 10 0 11-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  );
}

function IconList() {
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

function IconCalendarDays() {
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

/* ---- Nav config ---- */

const navItems = [
  { label: "Scheduling", icon: IconCalendar },
  { label: "Upload Syllabus", icon: IconUpload },
  { label: "Review Syllabus", icon: IconCheckCircle },
  { label: "Organized Schedule", icon: IconList },
  { label: "Calendar", icon: IconCalendarDays },
];

/* ---- Sample data ---- */

const initialTaskRows = [
  {
    id: 1,
    task: "Assignment 1 — Binary Search Trees",
    dueDate: "2026-09-18",
    urgency: "High",
    difficulty: 4,
    status: "Not Started",
    isNew: false,
  },
  {
    id: 2,
    task: "Problem Set 2 — Linear Algebra",
    dueDate: "2026-09-21",
    urgency: "Medium",
    difficulty: 3,
    status: "In Progress",
    isNew: false,
  },
  {
    id: 3,
    task: "Quiz 1 — Intro Psych",
    dueDate: "2026-09-24",
    urgency: "Low",
    difficulty: 2,
    status: "Scheduled",
    isNew: false,
  },
  {
    id: 4,
    task: "Midterm Review Plan",
    dueDate: "2026-09-28",
    urgency: "High",
    difficulty: 5,
    status: "Done",
    isNew: false,
  },
];

/* ---- Helpers ---- */

function formatDate(dateString) {
  if (!dateString) return "";
  const date = new Date(`${dateString}T00:00:00`);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(date);
}

/* ---- Badge Components ---- */

function UrgencyTag({ value }) {
  if (!value) return <span className="cell-placeholder">—</span>;

  const map = {
    High: "tag tag--red",
    Medium: "tag tag--orange",
    Low: "tag tag--blue",
  };

  return <span className={map[value]}>{value}</span>;
}

function StatusTag({ value }) {
  if (!value) return <span className="cell-placeholder">—</span>;

  const map = {
    "Not Started": "tag tag--gray",
    "In Progress": "tag tag--yellow",
    Scheduled: "tag tag--blue",
    Done: "tag tag--green",
  };

  return <span className={map[value]}>{value}</span>;
}

function DifficultyDots({ value }) {
  if (!value) return <span className="cell-placeholder">—</span>;

  return (
    <div className="dots" aria-label={`Difficulty ${value} of 5`}>
      {[1, 2, 3, 4, 5].map((dot) => (
        <span
          key={dot}
          className={`dots__dot${dot <= value ? " dots__dot--filled" : ""}`}
        />
      ))}
    </div>
  );
}

/* ---- Inline Editors ---- */

function InlineText({ value, onSave, autoFocus, ariaLabel }) {
  const [draft, setDraft] = useState(value ?? "");
  return (
    <input
      autoFocus={autoFocus}
      className="inline-input"
      type="text"
      value={draft}
      aria-label={ariaLabel}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => onSave(draft)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          onSave(draft);
          e.currentTarget.blur();
        }
      }}
    />
  );
}

function InlineDate({ value, onSave, autoFocus, ariaLabel }) {
  return (
    <input
      autoFocus={autoFocus}
      className="inline-input"
      type="date"
      value={value ?? ""}
      aria-label={ariaLabel}
      onChange={(e) => onSave(e.target.value)}
      onBlur={(e) => onSave(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          onSave(e.currentTarget.value);
          e.currentTarget.blur();
        }
      }}
    />
  );
}

function InlineSelect({ value, options, onSave, autoFocus, ariaLabel }) {
  return (
    <select
      autoFocus={autoFocus}
      className="inline-select"
      value={value}
      aria-label={ariaLabel}
      onChange={(e) => {
        const v = e.target.value;
        onSave(typeof options[0] === "number" ? Number(v) : v);
        e.target.blur();
      }}
      onBlur={(e) => {
        const v = e.target.value;
        onSave(typeof options[0] === "number" ? Number(v) : v);
      }}
    >
      {options.map((opt) => (
        <option key={opt} value={opt}>
          {opt}
        </option>
      ))}
    </select>
  );
}

/* ---- Page Component ---- */

export default function DashboardPage() {
  const [activeNav, setActiveNav] = useState("Scheduling");
  const [taskRows, setTaskRows] = useState(initialTaskRows);
  const [editingCell, setEditingCell] = useState(null);

  /* Done tasks sink to the bottom, everything else keeps its order */
  const sortedRows = useMemo(
    () => [...taskRows].sort((a, b) => {
      const aDone = a.status === "Done" ? 1 : 0;
      const bDone = b.status === "Done" ? 1 : 0;
      return aDone - bDone;
    }),
    [taskRows]
  );

  function handleAddTask() {
    const newId = Date.now();
    setTaskRows((prev) => [
      ...prev,
      {
        id: newId,
        task: "",
        dueDate: "",
        urgency: "Low",
        difficulty: 1,
        status: "Scheduled",
        isNew: true,
      },
    ]);
    setEditingCell({ rowId: newId, field: "task" });
  }

  function updateTaskRow(id, field, value) {
    setTaskRows((prev) =>
      prev.map((row) =>
        row.id === id ? { ...row, [field]: value, isNew: false } : row
      )
    );
    setEditingCell(null);
  }

  function startEditing(rowId, field) {
    setEditingCell({ rowId, field });
  }

  function isEditing(rowId, field) {
    return editingCell?.rowId === rowId && editingCell?.field === field;
  }

  function renderCell(row, field) {
    /* Editing state */
    if (isEditing(row.id, field)) {
      if (field === "task")
        return (
          <InlineText
            autoFocus
            value={row.task}
            ariaLabel="Task name"
            onSave={(v) => updateTaskRow(row.id, "task", v)}
          />
        );
      if (field === "dueDate")
        return (
          <InlineDate
            autoFocus
            value={row.dueDate}
            ariaLabel="Due date"
            onSave={(v) => updateTaskRow(row.id, "dueDate", v)}
          />
        );
      if (field === "urgency")
        return (
          <InlineSelect
            autoFocus
            value={row.urgency}
            ariaLabel="Urgency"
            options={["High", "Medium", "Low"]}
            onSave={(v) => updateTaskRow(row.id, "urgency", v)}
          />
        );
      if (field === "difficulty")
        return (
          <InlineSelect
            autoFocus
            value={row.difficulty}
            ariaLabel="Difficulty"
            options={[1, 2, 3, 4, 5]}
            onSave={(v) => updateTaskRow(row.id, "difficulty", v)}
          />
        );
      if (field === "status")
        return (
          <InlineSelect
            autoFocus
            value={row.status}
            ariaLabel="Status"
            options={["Not Started", "In Progress", "Scheduled", "Done"]}
            onSave={(v) => updateTaskRow(row.id, "status", v)}
          />
        );
    }

    /* Display state */
    if (field === "task")
      return row.task ? (
        <span className="cell-task">{row.task}</span>
      ) : (
        <span className="cell-placeholder">Untitled</span>
      );

    if (field === "dueDate")
      return row.dueDate ? (
        <span className="cell-date">{formatDate(row.dueDate)}</span>
      ) : (
        <span className="cell-placeholder">Empty</span>
      );

    if (field === "urgency") return <UrgencyTag value={row.urgency} />;
    if (field === "difficulty") return <DifficultyDots value={row.difficulty} />;
    if (field === "status") return <StatusTag value={row.status} />;

    return null;
  }

  const columns = [
    { key: "task", label: "Task" },
    { key: "dueDate", label: "Due date" },
    { key: "urgency", label: "Urgency" },
    { key: "difficulty", label: "Difficulty" },
    { key: "status", label: "Status" },
  ];

  return (
    <main className="dashboard">
      {/* ---- Sidebar ---- */}
      <aside className="sidebar">
        <div className="sidebar-brand">
          <span className="sidebar-brand__icon">
            <BrandIcon />
          </span>
          <span className="sidebar-brand__text">Sync Your Semester</span>
        </div>

        <div className="sidebar-section">
          <div className="sidebar-section__label">Planning</div>
          <nav className="sidebar-nav" aria-label="Dashboard navigation">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.label}
                  className={`sidebar-nav__item${
                    activeNav === item.label
                      ? " sidebar-nav__item--active"
                      : ""
                  }`}
                  type="button"
                  onClick={() => setActiveNav(item.label)}
                >
                  <span className="sidebar-nav__icon">
                    <Icon />
                  </span>
                  {item.label}
                </button>
              );
            })}
          </nav>
        </div>
      </aside>

      {/* ---- Main ---- */}
      <section className="main-content">
        <header className="page-header">
          <h1 className="page-title">Scheduling</h1>
          <button className="btn-primary" type="button" onClick={handleAddTask}>
            + New task
          </button>
        </header>

        <div className="database-view">
          <div className="database-toolbar">
            <div className="database-toolbar__left">
              <span className="database-toolbar__title">All tasks</span>
              <span className="database-toolbar__count">
                · {taskRows.length}
              </span>
            </div>
          </div>

          <div className="db-table-wrap">
            <table className="db-table">
              <thead>
                <tr>
                  {columns.map((col) => (
                    <th key={col.key}>{col.label}</th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {sortedRows.map((row) => (
                  <tr key={row.id} className={row.isNew ? "row-new" : ""}>
                    {columns.map((col) => (
                      <td
                        key={col.key}
                        className="cell-clickable"
                        onClick={() => startEditing(row.id, col.key)}
                      >
                        {renderCell(row, col.key)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>

            <button
              className="db-add-row"
              type="button"
              onClick={handleAddTask}
            >
              <span className="db-add-row__plus">+</span>
              New
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}