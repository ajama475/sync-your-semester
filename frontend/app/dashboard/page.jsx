"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getParentTasks,
  getTaskBucket,
  getTaskUrgency,
  getNextAction,
  isPrepWindowOpen,
  getEffortPriorityScore,
  getHeavyWeekSignal,
  sortByEffortPriority,
  saveStartCommitment,
  toggleTaskCompletion,
  getAllSemesterTasks,
  readSetup,
  formatISO,
} from "../../lib/tasks/taskHelpers";

/* ===========================================
   SEMESTER CONTEXT
   Week number + progress through the term
   =========================================== */

/**
 * Derives the current week number and total weeks from semester dates.
 * Week 1 starts on the semester start date regardless of weekday.
 * Returns null values if semester dates are missing.
 */
function getSemesterProgress(semester) {
  if (!semester?.startDate || !semester?.endDate) return null;

  const start = new Date(`${semester.startDate}T00:00:00`);
  const end = new Date(`${semester.endDate}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (start >= end) return null;

  const totalMs = end - start;
  const elapsedMs = today - start;
  const totalWeeks = Math.ceil(totalMs / (7 * 24 * 60 * 60 * 1000));
  const currentWeek = Math.max(1, Math.min(
    totalWeeks,
    Math.ceil(elapsedMs / (7 * 24 * 60 * 60 * 1000))
  ));
  const progressPct = Math.max(0, Math.min(100, (elapsedMs / totalMs) * 100));

  if (Number.isNaN(currentWeek) || Number.isNaN(totalWeeks)) return null;

  return { currentWeek, totalWeeks, progressPct };
}

function formatTodayHeading() {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(new Date());
}

/* ===========================================
   UTILITY FORMATTERS
   =========================================== */

function toDateTimeLocal(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const h = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${d}T${h}:${min}`;
}

function defaultSessionTime() {
  const next = new Date();
  next.setHours(next.getHours() + 2, 0, 0, 0);
  if (next.getHours() > 21) {
    next.setDate(next.getDate() + 1);
    next.setHours(10, 0, 0, 0);
  }
  return toDateTimeLocal(next);
}

function formatDate(isoDate) {
  if (!isoDate) return "";
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(new Date(`${isoDate}T00:00:00`));
}

function formatSessionTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

/* ===========================================
   COMPONENTS
   =========================================== */

function SemesterBar({ semester }) {
  const progress = getSemesterProgress(semester);
  if (!progress) return null;

  return (
    <div className="semester-bar" aria-label="Semester progress">
      <div className="semester-bar__text">
        <span className="semester-bar__week">
          Week {progress.currentWeek} of {progress.totalWeeks}
        </span>
        <span className="semester-bar__pct">
          {Math.round(progress.progressPct)}% through
        </span>
      </div>
      <div className="semester-bar__track" aria-hidden="true">
        <div
          className="semester-bar__fill"
          style={{ width: `${progress.progressPct}%` }}
        />
      </div>
    </div>
  );
}

function TaskCard({ task, onToggle }) {
  const isDone = task.status === "done";
  const urgency = getTaskUrgency(task.dueDate, task.status);

  return (
    <div className={`horizon-card${isDone ? " horizon-card--done" : ""}`}>
      <input
        type="checkbox"
        className="horizon-card__checkbox"
        checked={isDone}
        onChange={() => onToggle(task)}
      />
      <div className="horizon-card__content">
        <h4 className="horizon-card__title" title={task.title}>{task.title}</h4>
        <div className="horizon-card__meta">
          <span className="horizon-card__course">{task.course || "—"}</span>
          {!isDone && urgency.color === "red" && (
            <span className={`tag tag--${urgency.color} horizon-card__urgency`}>
              {urgency.label}
            </span>
          )}
          <span className="horizon-card__date">{formatDate(task.dueDate)}</span>
        </div>
      </div>
    </div>
  );
}

function DifficultyMark({ value }) {
  if (!value) return null;
  return <span className="difficulty-mark" aria-label={`Difficulty ${value} of 5`}>{value}/5</span>;
}

function StartNowCard({ task, nextAction, onSaveCommitment }) {
  const existing = task.startCommitment;
  const [isEditingCommitment, setIsEditingCommitment] = useState(!existing);
  const [scheduledAt, setScheduledAt] = useState(existing?.scheduledAt || defaultSessionTime());
  const [place, setPlace] = useState(existing?.place || "");
  const [firstStep, setFirstStep] = useState(existing?.firstStep || nextAction.label || "");

  async function handleSave() {
    await onSaveCommitment(task, { scheduledAt, place, firstStep });
    setIsEditingCommitment(false);
  }

  return (
    <div className="start-now-card">
      <div className="start-now-card__head">
        <span className="start-now-card__type">{task.type}</span>
        {task.course && task.course !== "—" && (
          <span className="cell-course-badge">{task.course}</span>
        )}
      </div>
      <h4 className="start-now-card__title">{task.title}</h4>
      <div className="start-now-card__action">
        <span className="start-now-card__action-label">Next action</span>
        <span className="start-now-card__action-value">{nextAction.label}</span>
      </div>
      {nextAction.why && (
        <p className="start-now-card__why">Start now — {nextAction.why}</p>
      )}
      <div className="start-now-card__due">
        Due {formatDate(task.dueDate)}
      </div>

      {existing && !isEditingCommitment ? (
        <div className="start-now-card__commitment">
          <div>
            <span className="start-now-card__commitment-label">Planned start</span>
            <strong>{formatSessionTime(existing.scheduledAt) || "Time not set"}</strong>
            {(existing.place || existing.firstStep) && (
              <span>{[existing.place, existing.firstStep].filter(Boolean).join(" · ")}</span>
            )}
          </div>
          <button type="button" className="start-now-card__edit" onClick={() => setIsEditingCommitment(true)}>
            Change
          </button>
        </div>
      ) : (
        <div className="start-now-card__commitment-form">
          <div className="start-now-card__form-row">
            <label className="start-now-card__field">
              <span>When</span>
              <input type="datetime-local" value={scheduledAt} onChange={(event) => setScheduledAt(event.target.value)} />
            </label>
            <label className="start-now-card__field">
              <span>Where</span>
              <input type="text" value={place} onChange={(event) => setPlace(event.target.value)} placeholder="Library, desk, cafe" />
            </label>
          </div>
          <label className="start-now-card__field">
            <span>First move</span>
            <input type="text" value={firstStep} onChange={(event) => setFirstStep(event.target.value)} placeholder="Open rubric, outline first section" />
          </label>
          <div className="start-now-card__form-actions">
            {existing && (
              <button type="button" className="btn-ghost" onClick={() => setIsEditingCommitment(false)}>
                Cancel
              </button>
            )}
            <button type="button" className="btn-primary" onClick={handleSave}>
              Save start plan
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function PlanningBrief({ startNowItems, heavyWeek, buckets, todayHeading, completedThisWeek }) {
  const leadItem = startNowItems[0];
  const dueSoonCount = buckets.Today.length + buckets["This Week"].length;
  const nextMove = leadItem
    ? `${leadItem.task.title}: ${leadItem.nextAction.label}`
    : dueSoonCount > 0
      ? `${dueSoonCount} item${dueSoonCount !== 1 ? "s" : ""} due this week`
      : "No urgent academic work today";

  return (
    <section className="planning-brief" aria-label="Today planning brief">
      <div className="planning-brief__main">
        <span className="planning-brief__eyebrow">{todayHeading}</span>
        <h2 className="planning-brief__title">{nextMove}</h2>
        <p className="planning-brief__copy">
          Commit to one start session before reacting to the rest of the list.
        </p>
      </div>
      <div className="planning-brief__stats" aria-label="Planning totals">
        <div>
          <strong>{startNowItems.length}</strong>
          <span>Start now</span>
        </div>
        <div>
          <strong>{dueSoonCount}</strong>
          <span>Due soon</span>
        </div>
        <div>
          <strong>{completedThisWeek}</strong>
          <span>Done this week</span>
        </div>
      </div>
    </section>
  );
}

function QuickAddTask({ onCreated }) {
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [type, setType] = useState("other");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!title.trim() || isSubmitting) return;

    setIsSubmitting(true);
    await createTask({
      title: title.trim(),
      dueDate: dueDate || null,
      type,
      difficulty: 0,
    });
    
    setTitle("");
    setDueDate("");
    setType("other");
    setIsSubmitting(false);
    if (onCreated) onCreated();
  }

  return (
    <form className="quick-add-task" onSubmit={handleSubmit} aria-label="Quick add task">
      <div className="quick-add-task__input-wrapper">
        <svg className="quick-add-task__icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
        <input
          type="text"
          className="quick-add-task__input"
          placeholder="Add a new task..."
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>
      <input
        type="date"
        className="quick-add-task__date"
        value={dueDate}
        onChange={(e) => setDueDate(e.target.value)}
        aria-label="Due date"
      />
      <select
        className="quick-add-task__type"
        value={type}
        onChange={(e) => setType(e.target.value)}
        aria-label="Task type"
      >
        <option value="other">General</option>
        <option value="assignment">Assignment</option>
        <option value="reading">Reading</option>
        <option value="quiz">Quiz</option>
        <option value="project">Project</option>
        <option value="essay">Essay</option>
        <option value="exam">Exam</option>
      </select>
      <button type="submit" className="quick-add-task__submit" disabled={!title.trim() || isSubmitting}>
        {isSubmitting ? "Adding…" : "Add"}
      </button>
    </form>
  );
}

function HeavyWeekCard({ signal }) {
  if (!signal) return null;

  const suggestion = signal.suggestionTask;
  const actionText = signal.suggestionAction?.label;

  return (
    <section className="heavy-week-card" aria-label="Heavy week ahead">
      <div className="heavy-week-card__copy">
        <span className="heavy-week-card__eyebrow">Heavy week ahead</span>
        <h2 className="heavy-week-card__title">
          {signal.count} major item{signal.count !== 1 ? "s" : ""} in {signal.windowLabel}
        </h2>
        {suggestion && (
          <p className="heavy-week-card__suggestion">
            Consider starting <strong>{suggestion.title}</strong>{actionText ? `: ${actionText}` : ""}.
          </p>
        )}
      </div>
      <div className="heavy-week-card__list">
        {signal.items.map((task) => (
          <div key={task.id} className="heavy-week-card__item">
            <div>
              <span className="heavy-week-card__item-title">{task.title}</span>
              <span className="heavy-week-card__item-date">{formatDate(task.dueDate)}</span>
            </div>
            <DifficultyMark value={task.difficulty} />
          </div>
        ))}
      </div>
    </section>
  );
}

function BucketColumn({ title, tasks, onToggle }) {
  return (
    <div className="horizon-bucket">
      <div className="horizon-bucket__header">
        <h3 className="horizon-bucket__title">{title}</h3>
        <span className="horizon-bucket__count">{tasks.length}</span>
      </div>
      <div className="horizon-bucket__list">
        {tasks.length > 0 ? (
          tasks.map((task) => (
            <TaskCard key={task.id} task={task} onToggle={onToggle} />
          ))
        ) : (
          <p className="horizon-bucket__empty">
            Nothing here
          </p>
        )}
      </div>
    </div>
  );
}

/* ===========================================
   PAGE
   =========================================== */

export default function WhatMattersPage() {
  const [tasks, setTasks] = useState([]);
  const [parentTasks, setParentTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const { semester } = useMemo(() => readSetup(), []);

  const loadTasks = useCallback(async () => {
    const [allData, parentData] = await Promise.all([
      getAllSemesterTasks(),
      getParentTasks(),
    ]);
    setTasks(allData);
    setParentTasks(parentData);
    setLoading(false);
  }, []);

  useEffect(() => { loadTasks(); }, [loadTasks]);

  async function handleToggle(task) {
    await toggleTaskCompletion(task);
    loadTasks();
  }

  async function handleSaveCommitment(task, commitment) {
    await saveStartCommitment(task, commitment);
    loadTasks();
  }

  const todayHeading = useMemo(() => formatTodayHeading(), []);

  if (loading) {
    return (
      <>
        <header className="page-header"><h1 className="page-title">What Matters</h1></header>
        <div className="horizon-board">
          <p className="cell-placeholder" style={{ padding: 40 }}>Loading...</p>
        </div>
      </>
    );
  }

  // Derive "Start Now" items: parent tasks with open prep windows and an active next action
  const startNowItems = [];
  for (const task of parentTasks) {
    if (task.status === "done" || !task.milestones) continue;
    if (!isPrepWindowOpen(task)) continue;
    const action = getNextAction(task);
    if (action && action.active) {
      startNowItems.push({ task, nextAction: action });
    }
  }
  startNowItems.sort((a, b) => getEffortPriorityScore(b.task) - getEffortPriorityScore(a.task));

  const heavyWeek = getHeavyWeekSignal(parentTasks);

  // Standard buckets from all tasks (excluding milestone rows for cleaner display)
  const buckets = { Overdue: [], Today: [], "This Week": [], "Next Week": [] };
  for (const task of tasks) {
    if (task.status === "done" || task.isMilestone) continue;
    const bucket = getTaskBucket(task.dueDate, task.status);
    if (bucket !== "Done" && bucket !== "Later" && buckets[bucket]) {
      buckets[bucket].push(task);
    }
  }
  for (const key of Object.keys(buckets)) {
    buckets[key] = sortByEffortPriority(buckets[key]);
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const startOfWeek = new Date(today);
  startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay()); // Sunday
  
  let completedThisWeek = 0;
  for (const task of tasks) {
    if (task.status === "done" && task.completedAt && new Date(task.completedAt) >= startOfWeek) {
      completedThisWeek++;
    }
  }

  return (
    <>
      <header className="page-header page-header--planning">
        <div>
          <h1 className="page-title">What Matters</h1>
          <p className="page-subtitle">Your planning surface for deadlines, start windows, and the next real move.</p>
        </div>
      </header>

      <div className="what-matters-page">
        <SemesterBar semester={semester} />

        <PlanningBrief
          startNowItems={startNowItems}
          heavyWeek={heavyWeek}
          buckets={buckets}
          todayHeading={todayHeading}
          completedThisWeek={completedThisWeek}
        />

        <QuickAddTask onCreated={loadTasks} />

        <div className="what-matters-top-grid">
          {startNowItems.length > 0 ? (
            <section className="start-now-section">
              <div className="start-now-section__header">
                <h2 className="start-now-section__title">Start now</h2>
                <span className="start-now-section__subtitle">Major tasks with open preparation windows</span>
              </div>
              <div className="start-now-section__grid">
                {startNowItems.map(({ task, nextAction }) => (
                  <StartNowCard key={task.id} task={task} nextAction={nextAction} onSaveCommitment={handleSaveCommitment} />
                ))}
              </div>
            </section>
          ) : (
            <section className="start-now-section start-now-section--empty">
              <div className="start-now-section__header">
                <h2 className="start-now-section__title">Start now</h2>
              </div>
              <p className="start-now-section__empty">No major prep windows are open right now.</p>
            </section>
          )}

          <HeavyWeekCard signal={heavyWeek} />
        </div>

        <section className="due-soon-section">
          <div className="due-soon-section__header">
            <h2 className="start-now-section__title">Due soon</h2>
            <span className="start-now-section__subtitle">Sorted by effort-aware urgency</span>
          </div>
          <div className="horizon-board">
            {buckets.Overdue.length > 0 && (
              <BucketColumn title="Overdue" tasks={buckets.Overdue} onToggle={handleToggle} />
            )}
            <BucketColumn title="Today" tasks={buckets.Today} onToggle={handleToggle} />
            <BucketColumn title="This Week" tasks={buckets["This Week"]} onToggle={handleToggle} />
            <BucketColumn title="Next Week" tasks={buckets["Next Week"]} onToggle={handleToggle} />
          </div>
        </section>
      </div>
    </>
  );
}
