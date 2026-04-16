"use client";

import { useCallback, useEffect, useState } from "react";
import { getAllSemesterTasks, getTaskBucket, getTaskUrgency, toggleTaskCompletion } from "../../../lib/tasks/taskHelpers";

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
            <span className={`tag tag--${urgency.color}`} style={{ padding: "0 4px", height: "16px", fontSize: "10px" }}>
              {urgency.label}
            </span>
          )}
          <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{formatDate(task.dueDate)}</span>
        </div>
      </div>
    </div>
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
          <p style={{ textAlign: "center", padding: "16px 0", color: "var(--text-tertiary)", fontSize: 13 }}>
            Nothing here
          </p>
        )}
      </div>
    </div>
  );
}

export default function ThisWeekPage() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadTasks = useCallback(async () => {
    const data = await getAllSemesterTasks();
    setTasks(data);
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
        <header className="page-header"><h1 className="page-title">This Week</h1></header>
        <div className="horizon-board">
          <p className="cell-placeholder" style={{ padding: 40 }}>Loading...</p>
        </div>
      </>
    );
  }

  const buckets = { Overdue: [], Today: [], "This Week": [], "Next Week": [], Later: [] };
  for (const task of tasks) {
    if (task.status === "done") continue;
    const bucket = getTaskBucket(task.dueDate, task.status);
    if (bucket !== "Done" && buckets[bucket]) {
      buckets[bucket].push(task);
    }
  }

  return (
    <>
      <header className="page-header">
        <h1 className="page-title">This Week</h1>
      </header>

      <div className="horizon-board">
        {buckets.Overdue.length > 0 && (
          <BucketColumn title="Overdue" tasks={buckets.Overdue} onToggle={handleToggle} />
        )}
        <BucketColumn title="Today" tasks={buckets.Today} onToggle={handleToggle} />
        <BucketColumn title="This Week" tasks={buckets["This Week"]} onToggle={handleToggle} />
        <BucketColumn title="Next Week" tasks={buckets["Next Week"]} onToggle={handleToggle} />
        <BucketColumn title="Later" tasks={buckets.Later} onToggle={handleToggle} />
      </div>
    </>
  );
}
