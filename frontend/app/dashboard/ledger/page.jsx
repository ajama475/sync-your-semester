"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getAllSemesterTasks,
  getParentTasks,
  getTaskUrgency,
  generateMilestones,
  getStartByDateFromMilestones,
  shouldRegenerateStartPlan,
  toggleTaskCompletion,
  createTask,
  updateTask,
  updateMilestone,
  deleteMilestone,
  removeTask,
  readSetup,
} from "../../../lib/tasks/taskHelpers";
import { listSyllabusRecords, patchSyllabusRecord } from "../../../lib/storage/syllabusStore";

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

function DifficultyDots({ value }) {
  if (!value) return <span className="cell-placeholder">—</span>;
  return (
    <div className="dots" aria-label={`Difficulty ${value} of 5`}>
      {[1, 2, 3, 4, 5].map((dot) => (
        <span key={dot} className={`dots__dot${dot <= value ? " dots__dot--filled" : ""}`} />
      ))}
    </div>
  );
}

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function IconTrash() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18m-2 0v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6m3 0V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
      <line x1="10" y1="11" x2="10" y2="17" /><line x1="14" y1="11" x2="14" y2="17" />
    </svg>
  );
}

function TaskModal({ open, onClose, onCreated, onSave, onDelete, courses, semester, taskToEdit }) {
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [courseId, setCourseId] = useState("");
  const [type, setType] = useState("other");
  const [difficulty, setDifficulty] = useState(0);
  const [isLoop, setIsLoop] = useState(false);
  const [loopDays, setLoopDays] = useState([]);
  const [loopStart, setLoopStart] = useState("");
  const [loopEnd, setLoopEnd] = useState("");
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState("active");
  const [deleteArmed, setDeleteArmed] = useState(false);

  const isEditing = !!taskToEdit;
  const isMilestoneEdit = !!taskToEdit?.isMilestone;

  function reset() {
    setTitle(""); setDueDate(""); setCourseId(""); setType("other");
    setDifficulty(0); setIsLoop(false); setLoopDays([]);
    setLoopStart(semester?.startDate || ""); setLoopEnd(semester?.endDate || "");
    setNotes("");
    setStatus("active");
    setDeleteArmed(false);
  }

  useEffect(() => {
    if (taskToEdit) {
      setTitle(taskToEdit.isMilestone ? (taskToEdit.milestoneLabel || taskToEdit.title?.replace(/^↳\s*/, "") || "") : (taskToEdit.title || ""));
      setDueDate(taskToEdit.dueDate || "");
      setCourseId(taskToEdit.courseId || "");
      setType(taskToEdit.type || "other");
      setDifficulty(taskToEdit.difficulty || 0);
      setIsLoop(!!taskToEdit.recurrence);
      setLoopDays(taskToEdit.recurrence?.days || []);
      setLoopStart(taskToEdit.recurrence?.startDate || semester?.startDate || "");
      setLoopEnd(taskToEdit.recurrence?.endDate || semester?.endDate || "");
      setNotes(taskToEdit.isMilestone ? (taskToEdit.milestoneWhy || "") : (taskToEdit.notes || ""));
      setStatus(taskToEdit.status === "done" ? "done" : "active");
      setDeleteArmed(false);
    } else {
      reset();
    }
  }, [taskToEdit, open]);

  function toggleDay(day) {
    setLoopDays((prev) => prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]);
  }

  async function handleSubmit() {
    if (!title.trim()) return;
    if (isMilestoneEdit) {
      await onSave(taskToEdit, {
        label: title.trim(),
        date: dueDate || null,
        why: notes.trim(),
        status,
      });
      reset();
      onCreated();
      onClose();
      return;
    }

    const courseEntry = courses.find((c) => c.id === courseId);
    const courseLabel = courseEntry ? (courseEntry.code || courseEntry.name) : "—";

    const taskData = {
      title: title.trim(),
      dueDate: isLoop ? null : (dueDate || null),
      courseId: courseId || null,
      courseLabel,
      type,
      difficulty: difficulty || null,
      notes: notes.trim(),
      status,
      recurrence: isLoop && loopDays.length > 0 ? {
        days: loopDays,
        startDate: loopStart,
        endDate: loopEnd,
      } : null,
    };

    if (isEditing) {
      await onSave(taskToEdit, taskData);
    } else {
      await createTask(taskData);
    }
    reset();
    onCreated();
    onClose();
  }

  async function handleDeleteClick() {
    if (!isEditing || !taskToEdit) return;
    if (!deleteArmed) {
      setDeleteArmed(true);
      return;
    }
    await onDelete(taskToEdit);
    reset();
    onCreated();
    onClose();
  }

  if (!open) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal__header">
          <h2 className="modal__title">{isMilestoneEdit ? "Edit prep step" : isEditing ? "Edit task" : "New task"}</h2>
          <button className="modal__close" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="modal__body">
          {isMilestoneEdit && (
            <div className="modal-context">
              <span className="modal-context__label">Parent task</span>
              <span className="modal-context__value">{taskToEdit.parentTitle || "Major task"}</span>
            </div>
          )}

          <label className="field">
            <span className="field__label">{isMilestoneEdit ? "Prep step" : "Title"}</span>
            <input className="field__input" type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Assignment 2, Gym, Office Hours" autoFocus />
          </label>

          {isMilestoneEdit ? (
            <div className="setup-form__row">
              <label className="field">
                <span className="field__label">Date</span>
                <input className="field__input" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
              </label>
              <label className="field">
                <span className="field__label">Status</span>
                <select className="field__input" value={status} onChange={(e) => setStatus(e.target.value)}>
                  <option value="active">Active</option>
                  <option value="done">Done</option>
                </select>
              </label>
            </div>
          ) : (
            <>
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
                <option value="essay">Essay</option>
                <option value="reading">Reading</option>
              </select>
            </label>
              </div>

          <label className="field">
            <span className="field__label">Difficulty</span>
            <div className="dots dots--input" aria-label="Set difficulty">
              {[1, 2, 3, 4, 5].map((dot) => (
                <button
                  key={dot}
                  type="button"
                  className={`dots__dot dots__dot--clickable${dot <= difficulty ? " dots__dot--filled" : ""}`}
                  onClick={() => setDifficulty(dot === difficulty ? 0 : dot)}
                  aria-label={`Difficulty ${dot}`}
                />
              ))}
            </div>
          </label>

          {isEditing && (
            <label className="field">
              <span className="field__label">Status</span>
              <select className="field__input" value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="active">Active</option>
                <option value="done">Done</option>
              </select>
            </label>
          )}

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
            </>
          )}

          <label className="field">
            <span className="field__label">{isMilestoneEdit ? "Why now (optional)" : "Notes (optional)"}</span>
            <textarea className="field__input field__textarea" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder={isMilestoneEdit ? "Why this prep step matters..." : "Any extra context..."} />
          </label>
        </div>

        <div className="modal__footer modal__footer--split">
          <div className="modal__footer-left">
            {isEditing && (
              <button className={`modal-delete${deleteArmed ? " modal-delete--armed" : ""}`} type="button" onClick={handleDeleteClick}>
                <IconTrash /> {deleteArmed ? "Confirm delete" : "Delete"}
              </button>
            )}
          </div>
          <div className="modal__footer-right">
            <button className="btn-ghost" type="button" onClick={onClose}>Cancel</button>
            <button className="btn-primary" type="button" onClick={handleSubmit} disabled={!title.trim()}>
              {isEditing ? "Save changes" : (isLoop ? "Create recurring task" : "Add task")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ===========================================
   Page
   =========================================== */

export default function TaskLedgerPage() {
  const [tasks, setTasks] = useState([]);
  const [parentTasks, setParentTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [taskToEdit, setTaskToEdit] = useState(null);
  const [filter, setFilter] = useState("all"); // 'all' | 'syllabus' | 'personal'

  const { courses, semester } = useMemo(() => readSetup(), []);

  const loadTasks = useCallback(async () => {
    const [data, parents] = await Promise.all([
      getAllSemesterTasks(),
      getParentTasks(),
    ]);
    setTasks(data);
    setParentTasks(parents);
    setLoading(false);
  }, []);

  useEffect(() => { loadTasks(); }, [loadTasks]);

  async function handleToggle(task) {
    await toggleTaskCompletion(task);
    loadTasks();
  }

  async function handleSaveTask(task, taskData) {
    if (task.isMilestone && task.parentTaskId && task.milestoneId) {
      await updateMilestone(task.parentTaskId, task.milestoneId, taskData);
      return;
    }

    if (task.source === "syllabus" && task.recordId && task.taskId) {
      await patchSyllabusRecord(task.recordId, (record) => ({
        ...record,
        reviewItems: (record.reviewItems || []).map((item) => {
          if (item.id !== task.taskId) return item;

          const nextType = taskData.type || "other";
          const nextDueDate = taskData.dueDate;
          const nextDifficulty = taskData.difficulty ?? null;
          const shouldRefreshPlan =
            nextType !== item.type ||
            nextDueDate !== item.dueDateRaw ||
            nextDifficulty !== (item.difficulty ?? null);

          let milestones = item.milestones || null;
          let startByDate = item.startByDate || null;
          let milestonesCustomized = item.milestonesCustomized || false;

          if (shouldRefreshPlan) {
            if (shouldRegenerateStartPlan(item)) {
              const regen = generateMilestones({
                type: nextType,
                dueDate: nextDueDate,
                difficulty: nextDifficulty,
              }, semester?.startDate);
              milestones = regen.milestones.length > 0 ? regen.milestones : null;
              startByDate = regen.startByDate;
              milestonesCustomized = false;
            } else {
              startByDate = getStartByDateFromMilestones(milestones);
              milestonesCustomized = true;
            }
          }

          return {
            ...item,
            title: taskData.title,
            type: nextType,
            dueDateRaw: nextDueDate,
            difficulty: nextDifficulty,
            notes: taskData.notes ?? item.notes ?? "",
            status: taskData.status === "done" ? "done" : "approved",
            milestones,
            startByDate,
            milestonesCustomized,
          };
        }),
      }));
      return;
    }

    await updateTask(task.id, taskData);
  }

  async function handleDeleteTask(task) {
    if (task.isMilestone && task.parentTaskId && task.milestoneId) {
      await deleteMilestone(task.parentTaskId, task.milestoneId);
      return;
    }

    if (task.source === "syllabus" && task.recordId && task.taskId) {
      await patchSyllabusRecord(task.recordId, (record) => ({
        ...record,
        reviewItems: (record.reviewItems || []).map((item) =>
          item.id === task.taskId ? { ...item, status: "rejected" } : item
        ),
      }));
      return;
    }

    await removeTask(task.id);
  }

  function resolveEditableTask(task) {
    if (task.isMilestone) {
      return task;
    }
    if (task.isOccurrence && task.parentId) {
      return parentTasks.find((parent) => parent.id === task.parentId) || task;
    }
    return task;
  }

  function handleOpenTask(task) {
    const editableTask = resolveEditableTask(task);
    setTaskToEdit(editableTask);
    setModalOpen(true);
  }

  const filteredTasks = useMemo(() => {
    if (filter === "syllabus") {
      return tasks.filter((t) => 
        t.source === "syllabus" || 
        (t.isMilestone && t.parentTaskId?.startsWith("syl::"))
      );
    }
    if (filter === "personal") {
      return tasks.filter((t) => 
        t.source === "manual" || 
        t.source === "recurring-instance" ||
        (t.isMilestone && !t.parentTaskId?.startsWith("syl::"))
      );
    }
    return tasks;
  }, [tasks, filter]);

  const activeCount = filteredTasks.filter((t) => t.status !== "done").length;

  const renderRow = (task) => {
    const isDone = task.status === "done";
    const urgency = getTaskUrgency(task.dueDate, task.status);
    const isMilestone = task.isMilestone;

    return (
      <tr
        key={task.id}
        className={`db-table-row--clickable${isDone ? " db-table-row--done" : ""}${isMilestone ? " db-table-row--milestone" : ""}`}
        role="button"
        tabIndex={0}
        onClick={() => handleOpenTask(task)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            handleOpenTask(task);
          }
        }}
      >
        <td
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
        >
          <input
            type="checkbox"
            className="horizon-card__checkbox"
            checked={isDone}
            onChange={(event) => {
              event.stopPropagation();
              handleToggle(task);
            }}
            style={{ margin: 0 }}
          />
        </td>
        <td>
          <div className="cell-task-wrapper">
            <span className={`cell-task${isMilestone ? " cell-task--milestone" : ""}`} title={task.title}>
              {task.title}
            </span>
            {task.isOccurrence && <span className="tag tag--gray" style={{ fontSize: 10 }}>recurring</span>}
            {!groupByCourse && task.course && task.course !== "—" && !isMilestone && (
              <span className="cell-course-badge">{task.course}</span>
            )}
            {isMilestone && task.milestoneWhy && (
              <span className="cell-why-hint">{task.milestoneWhy}</span>
            )}
          </div>
        </td>
        <td className="cell-date">{formatDate(task.dueDate)}</td>
        <td className="cell-date cell-date--start">{!isMilestone && task.startByDate ? formatDate(task.startByDate) : ""}</td>
        <td>{!isMilestone && <TypeTag type={task.type} />}</td>
        <td><DifficultyDots value={task.difficulty} /></td>
        <td><UrgencyTag urgency={urgency} /></td>
      </tr>
    );
  };

  const renderTableBody = () => {
    if (!groupByCourse) {
      return filteredTasks.map(renderRow);
    }
    
    const groups = {};
    for (const task of filteredTasks) {
      const course = (!task.course || task.course === "—") ? "Other Tasks" : task.course;
      if (!groups[course]) groups[course] = [];
      groups[course].push(task);
    }
    
    const courseNames = Object.keys(groups).sort((a, b) => {
      if (a === "Other Tasks") return 1;
      if (b === "Other Tasks") return -1;
      return a.localeCompare(b);
    });

    return courseNames.flatMap((course) => [
      <tr key={`group-${course}`} className="db-table-group-header">
        <td colSpan="7">{course}</td>
      </tr>,
      ...groups[course].map(renderRow)
    ]);
  };

  if (loading) {
    return (
      <>
        <header className="page-header">
          <h1 className="page-title">Task Ledger</h1>
        </header>
        <div className="database-view">
          <p className="cell-placeholder" style={{ padding: 40 }}>Loading...</p>
        </div>
      </>
    );
  }

  return (
    <>
      <header className="page-header">
        <div>
          <h1 className="page-title">Task Ledger</h1>
          <p className="page-subtitle">{activeCount} active task{activeCount !== 1 ? "s" : ""} across all sources</p>
        </div>
        <button
          className="btn-primary"
          type="button"
          onClick={() => {
            setSelectedTask(null);
            setModalOpen(true);
          }}
        >
          + New task
        </button>
      </header>

      <div className="database-view">

        <div className="database-toolbar">
          <div className="database-toolbar__left">
            <div className="filter-tabs">
              <button 
                className={`filter-tab${filter === "all" ? " filter-tab--active" : ""}`}
                onClick={() => setFilter("all")}
              >
                All
              </button>
              <button 
                className={`filter-tab${filter === "syllabus" ? " filter-tab--active" : ""}`}
                onClick={() => setFilter("syllabus")}
              >
                Syllabus
              </button>
              <button 
                className={`filter-tab${filter === "personal" ? " filter-tab--active" : ""}`}
                onClick={() => setFilter("personal")}
              >
                Personal
              </button>
            </div>
            <span className="database-toolbar__count">· {activeCount} active</span>
          </div>
          <div className="database-toolbar__right">
            <label className="group-by-toggle">
              <input
                type="checkbox"
                checked={groupByCourse}
                onChange={(e) => setGroupByCourse(e.target.checked)}
              />
              <span>Group by course</span>
            </label>
          </div>
        </div>

        {tasks.length === 0 ? (
          <div className="empty-state" style={{ marginTop: 0, borderTop: "none", borderRadius: "0 0 var(--radius-lg) var(--radius-lg)" }}>
            <div className="empty-state__icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
            </div>
            <h2 className="empty-state__title">Your Ledger is empty</h2>
            <p className="empty-state__copy">
              Upload a syllabus to automatically extract deadlines, or manually add tasks to begin populating your database.
            </p>
          </div>
        ) : (
          <div className="db-table-wrap">
            <table className="db-table">
              <thead>
                <tr>
                  <th style={{ width: 40 }}></th>
                  <th>Task</th>
                  <th style={{ width: 90 }}>Due</th>
                  <th style={{ width: 90 }}>Start by</th>
                  <th style={{ width: 100 }}>Type</th>
                  <th style={{ width: 110 }}>Difficulty</th>
                  <th style={{ width: 120 }}>Urgency</th>
                </tr>
              </thead>
              <tbody>
                {renderTableBody()}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <TaskModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreated={loadTasks}
        onSave={handleSaveTask}
        onDelete={handleDeleteTask}
        courses={courses}
        semester={semester}
        taskToEdit={selectedTask}
      />
    </>
  );
}
