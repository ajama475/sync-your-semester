"use client";

import { useCallback, useEffect, useState } from "react";
import { getApprovedTasks, getTaskUrgency, toggleTaskCompletion } from "../../../lib/tasks/taskHelpers";

function formatDate(isoDate) {
  if (!isoDate) return "";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(`${isoDate}T00:00:00`));
}

function UrgencyTag({ urgency }) {
  if (!urgency) return null;
  return <span className={`tag tag--${urgency.color}`}>{urgency.label}</span>;
}

function TypeTag({ type }) {
  if (!type || type === "other") return null;
  return <span className="tag tag--purple">{type.charAt(0).toUpperCase() + type.slice(1)}</span>;
}

export default function CourseTasksPage() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadTasks = useCallback(async () => {
    const data = await getApprovedTasks();
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
        <header className="page-header"><h1 className="page-title">Course Tasks</h1></header>
        <div className="database-view">
          <p className="cell-placeholder" style={{ padding: 40 }}>Loading...</p>
        </div>
      </>
    );
  }

  return (
    <>
      <header className="page-header">
        <h1 className="page-title">Course Tasks</h1>
      </header>

      <div className="database-view">
        <div className="database-toolbar">
          <div className="database-toolbar__left">
            <span className="database-toolbar__title">From approved syllabi</span>
            <span className="database-toolbar__count">· {tasks.length}</span>
          </div>
        </div>

        {tasks.length === 0 ? (
          <div className="upload-panel__section" style={{ marginTop: 12 }}>
            <p className="upload-panel__empty">
              No approved course tasks yet. Upload a syllabus and review the extracted tasks to see them here.
            </p>
          </div>
        ) : (
          <div className="db-table-wrap">
            <table className="db-table">
              <thead>
                <tr>
                  <th style={{ width: 36 }}></th>
                  <th>Task</th>
                  <th>Course</th>
                  <th>Due</th>
                  <th>Type</th>
                  <th>Urgency</th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((task) => {
                  const isDone = task.status === "done";
                  const urgency = getTaskUrgency(task.dueDate, task.status);

                  return (
                    <tr key={task.id} className={isDone ? "db-table-row--done" : ""}>
                      <td>
                        <input
                          type="checkbox"
                          className="horizon-card__checkbox"
                          checked={isDone}
                          onChange={() => handleToggle(task)}
                          style={{ margin: 0 }}
                        />
                      </td>
                      <td><span className="cell-task">{task.title}</span></td>
                      <td><span className="review-card__course">{task.course}</span></td>
                      <td className="cell-date">{formatDate(task.dueDate)}</td>
                      <td><TypeTag type={task.type} /></td>
                      <td><UrgencyTag urgency={urgency} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
