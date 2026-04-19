"use client";

import { useCallback, useEffect, useState } from "react";
import {
  getParentTasks,
  getTaskBucket,
  getTaskUrgency,
  getNextAction,
  isPrepWindowOpen,
  getEffortPriorityScore,
  getHeavyWeekSignal,
  sortByEffortPriority,
  toggleTaskCompletion,
  getAllSemesterTasks,
} from "../../../lib/tasks/taskHelpers";

function formatDate(isoDate) {
  if (!isoDate) return "";
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(new Date(`${isoDate}T00:00:00`));
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

function StartNowCard({ task, nextAction }) {
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
    </div>
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

export default function WhatMattersPage() {
  const [tasks, setTasks] = useState([]);
  const [parentTasks, setParentTasks] = useState([]);
  const [loading, setLoading] = useState(true);

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

  return (
    <>
      <header className="page-header">
        <h1 className="page-title">What Matters</h1>
      </header>

      {startNowItems.length > 0 && (
        <div className="start-now-section">
          <div className="start-now-section__header">
            <h2 className="start-now-section__title">Start now</h2>
            <span className="start-now-section__subtitle">Major tasks with open preparation windows</span>
          </div>
          <div className="start-now-section__grid">
            {startNowItems.map(({ task, nextAction }) => (
              <StartNowCard key={task.id} task={task} nextAction={nextAction} />
            ))}
          </div>
        </div>
      )}

      <HeavyWeekCard signal={heavyWeek} />

      <div className="horizon-board">
        {buckets.Overdue.length > 0 && (
          <BucketColumn title="Overdue" tasks={buckets.Overdue} onToggle={handleToggle} />
        )}
        <BucketColumn title="Today" tasks={buckets.Today} onToggle={handleToggle} />
        <BucketColumn title="This Week" tasks={buckets["This Week"]} onToggle={handleToggle} />
        <BucketColumn title="Next Week" tasks={buckets["Next Week"]} onToggle={handleToggle} />
      </div>
    </>
  );
}
