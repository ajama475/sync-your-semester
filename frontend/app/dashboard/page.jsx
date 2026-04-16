"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getAllSemesterTasks,
  getTaskUrgency,
  toggleTaskCompletion,
  createTask,
  readSetup,
} from "../../lib/tasks/taskHelpers";

function formatDate(isoDate) {
  if (!isoDate) return "";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
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

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function TaskModal({ open, onClose, onCreated, courses, semester }) {
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [courseId, setCourseId] = useState("");
  const [type, setType] = useState("other");
  const [isLoop, setIsLoop] = useState(false);
  const [loopDays, setLoopDays] = useState([]);
  const [loopStart, setLoopStart] = useState(semester?.startDate || "");
  const [loopEnd, setLoopEnd] = useState(semester?.endDate || "");
  const [notes, setNotes] = useState("");

  function reset() {
    setTitle(""); setDueDate(""); setCourseId(""); setType("other");
    setIsLoop(false); setLoopDays([]); setLoopStart(semester?.startDate || "");
    setLoopEnd(semester?.endDate || ""); setNotes("");
  }

  function toggleDay(day) {
    setLoopDays((prev) => prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]);
  }

  async function handleSubmit() {
    if (!title.trim()) return;
    const courseEntry = courses.find((c) => c.id === courseId);
    const courseLabel = courseEntry ? (courseEntry.code || courseEntry.name) : "—";

    const taskData = {
      title: title.trim(),
      dueDate: isLoop ? null : dueDate,
      courseId: courseId || null,
      courseLabel,
      type,
      notes: notes.trim(),
      recurrence: isLoop && loopDays.length > 0 ? {
        days: loopDays,
        startDate: loopStart,
        endDate: loopEnd,
      } : null,
    };

    await createTask(taskData);
    reset();
    onCreated();
    onClose();
  }

  if (!open) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal__header">
          <h2 className="modal__title">New task</h2>
          <button className="modal__close" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="modal__body">
          <label className="field">
            <span className="field__label">Title</span>
            <input className="field__input" type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Assignment 2, Gym, Office Hours" autoFocus />
          </label>

          <div className="setup-form__row">
            {courses.length > 0 && (
              <label className="field">
                <span className="field__label">Course (optional)</span>
                <select className="field__input" value={courseId} onChange={(e) => setCourseId(e.target.value)}>
                  <option value="">None</option>
                  {courses.map((c) => <option key={c.id} value={c.id}>{c.code || c.name}</option>)}
                </select>
              </label>
            )}
            <label className="field">
              <span className="field__label">Type</span>
              <select className="field__input" value={type} onChange={(e) => setType(e.target.value)}>
                <option value="other">General</option>
                <option value="assignment">Assignment</option>
                <option value="quiz">Quiz</option>
                <option value="exam">Exam</option>
                <option value="midterm">Midterm</option>
                <option value="project">Project</option>
                <option value="lab">Lab</option>
                <option value="presentation">Presentation</option>
                <option value="reading">Reading</option>
              </select>
            </label>
          </div>

          <label className="field" style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: 8 }}>
            <input type="checkbox" checked={isLoop} onChange={(e) => setIsLoop(e.target.checked)} className="horizon-card__checkbox" />
            <span className="field__label" style={{ margin: 0 }}>Recurring task</span>
          </label>

          {isLoop ? (
            <div className="modal__loop-section">
              <div className="field">
                <span className="field__label">Repeats on</span>
                <div className="loop-days">
                  {DAY_LABELS.map((label, idx) => (
                    <button
                      key={idx}
                      type="button"
                      className={`loop-day${loopDays.includes(idx) ? " loop-day--active" : ""}`}
                      onClick={() => toggleDay(idx)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="setup-form__row">
                <label className="field">
                  <span className="field__label">From</span>
                  <input className="field__input" type="date" value={loopStart} onChange={(e) => setLoopStart(e.target.value)} />
                </label>
                <label className="field">
                  <span className="field__label">Until</span>
                  <input className="field__input" type="date" value={loopEnd} onChange={(e) => setLoopEnd(e.target.value)} />
                </label>
              </div>
            </div>
          ) : (
            <label className="field">
              <span className="field__label">Due date</span>
              <input className="field__input" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </label>
          )}

          <label className="field">
            <span className="field__label">Notes (optional)</span>
            <textarea className="field__input field__textarea" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Any extra context..." />
          </label>
        </div>

        <div className="modal__footer">
          <button className="btn-ghost" type="button" onClick={onClose}>Cancel</button>
          <button className="btn-primary" type="button" onClick={handleSubmit} disabled={!title.trim()}>
            {isLoop ? "Create recurring task" : "Add task"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function SemesterSchedulePage() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);

  const { courses, semester } = useMemo(() => readSetup(), []);

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

  const activeCount = tasks.filter((t) => t.status !== "done").length;

  if (loading) {
    return (
      <>
        <header className="page-header">
          <h1 className="page-title">Semester Schedule</h1>
        </header>
        <div className="database-view">
          <p className="cell-placeholder" style={{ padding: 40 }}>Loading your semester...</p>
        </div>
      </>
    );
  }

  return (
    <>
      <header className="page-header">
        <h1 className="page-title">Semester Schedule</h1>
        <button className="btn-primary" type="button" onClick={() => setModalOpen(true)}>
          + New task
        </button>
      </header>

      <div className="database-view">
        <div className="database-toolbar">
          <div className="database-toolbar__left">
            <span className="database-toolbar__title">All semester tasks</span>
            <span className="database-toolbar__count">· {activeCount} active, {tasks.length} total</span>
          </div>
        </div>

        {tasks.length === 0 ? (
          <div className="upload-panel__section" style={{ marginTop: 12 }}>
            <p className="upload-panel__empty">
              No tasks yet. Upload a syllabus and approve extracted tasks, or add tasks manually.
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
                      <td>
                        <span className="cell-task">{task.title}</span>
                        {task.isOccurrence && <span className="tag tag--gray" style={{ marginLeft: 6, fontSize: 10 }}>recurring</span>}
                      </td>
                      <td>
                        <span className="review-card__course">{task.course || "—"}</span>
                      </td>
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

      <TaskModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreated={loadTasks}
        courses={courses}
        semester={semester}
      />
    </>
  );
}