"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  getParentTasks,
  getAllSemesterTasks,
  sortByEffortPriority,
  getNextAction,
  isPrepWindowOpen,
  toggleTaskCompletion,
  isMajorTask,
} from "../../lib/tasks/taskHelpers";

/**
 * Focus Mode — distraction-free single-task view.
 *
 * Surfaces the highest-priority active task using the same effort-aware
 * scoring as What Matters. For major tasks with open prep windows, it shows
 * the next concrete action from the start plan. The goal is to answer:
 * "If I can only do one thing right now, what should it be?"
 */

function formatDate(isoDate) {
  if (!isoDate) return "";
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(new Date(`${isoDate}T00:00:00`));
}

function formatShortDate(isoDate) {
  if (!isoDate) return "";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(new Date(`${isoDate}T00:00:00`));
}

function DifficultyIndicator({ value }) {
  if (!value) return null;
  return (
    <span className="focus-difficulty" aria-label={`Difficulty ${value} of 5`}>
      {[1, 2, 3, 4, 5].map((dot) => (
        <span
          key={dot}
          className={`focus-difficulty__dot${dot <= value ? " focus-difficulty__dot--filled" : ""}`}
        />
      ))}
    </span>
  );
}

export default function FocusModePage() {
  const [loading, setLoading] = useState(true);
  const [task, setTask] = useState(null);
  const [nextAction, setNextAction] = useState(null);
  const [completing, setCompleting] = useState(false);

  const loadTopTask = useCallback(async () => {
    setLoading(true);

    // Use parent tasks for major tasks (they carry milestone data),
    // plus all tasks for the complete effort-priority picture
    const [parentTasks, allTasks] = await Promise.all([
      getParentTasks(),
      getAllSemesterTasks(),
    ]);

    // Filter to active, non-milestone tasks and sort by effort priority
    const active = allTasks
      .filter((t) => t.status !== "done" && !t.isMilestone)
      .slice(); // copy before sort

    const sorted = sortByEffortPriority(active);
    const top = sorted[0] || null;

    if (top) {
      // Find the parent version of this task if it has milestones
      const parentVersion = parentTasks.find((p) => p.id === top.id);
      const taskWithMilestones = parentVersion || top;
      const action = taskWithMilestones.milestones
        ? getNextAction(taskWithMilestones)
        : null;
      const prepOpen = isPrepWindowOpen(taskWithMilestones);

      setTask(top);
      setNextAction(action && prepOpen ? action : null);
    } else {
      setTask(null);
      setNextAction(null);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    loadTopTask();
  }, [loadTopTask]);

  async function handleMarkDone() {
    if (!task || completing) return;
    setCompleting(true);

    await toggleTaskCompletion(task);

    // Brief pause for UX feedback before loading next task
    setTimeout(() => {
      loadTopTask().finally(() => setCompleting(false));
    }, 400);
  }

  if (loading) {
    return (
      <div className="focus-shell">
        <div className="focus-loading">Focusing…</div>
      </div>
    );
  }

  return (
    <div className="focus-shell">
      <Link
        href="/dashboard"
        className="focus-exit"
        aria-label="Exit Focus Mode"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="19" y1="12" x2="5" y2="12" />
          <polyline points="12 19 5 12 12 5" />
        </svg>
        <span>Exit Focus</span>
      </Link>

      <div className="focus-content">
        {!task ? (
          <div className="focus-clear">
            <svg className="focus-clear__icon" width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
            <h1 className="focus-clear__heading">Everything is captured.</h1>
            <p className="focus-clear__body">
              Your agenda is currently clear. Enjoy the quiet.
            </p>
          </div>
        ) : (
          <div className="focus-task">
            <div className="focus-task__eyebrow">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              <span>Current Priority</span>
            </div>

            <h1 className="focus-task__title">{task.title}</h1>

            <div className="focus-task__meta">
              {task.course && task.course !== "—" && (
                <span className="focus-task__course">{task.course}</span>
              )}
              {task.type && task.type !== "other" && (
                <span className="focus-task__type">
                  {task.type.charAt(0).toUpperCase() + task.type.slice(1)}
                </span>
              )}
              <DifficultyIndicator value={task.difficulty} />
            </div>

            {nextAction && (
              <div className="focus-task__action">
                <span className="focus-task__action-label">Next action</span>
                <span className="focus-task__action-value">{nextAction.label}</span>
                {nextAction.why && (
                  <span className="focus-task__action-why">
                    &ldquo;{nextAction.why}&rdquo;
                  </span>
                )}
              </div>
            )}

            <button
              className="focus-task__done-btn"
              onClick={handleMarkDone}
              disabled={completing}
            >
              {completing ? "Saving…" : "I finished this"}
            </button>

            {task.dueDate && (
              <div className="focus-task__deadline">
                Deadline: {formatDate(task.dueDate)}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
