"use client";

import { useCallback, useEffect, useState } from "react";
import { getAllSemesterTasks, getTaskUrgency, toggleTaskCompletion } from "../../../lib/tasks/taskHelpers";

function getMonthMatrix(year, month) {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const days = [];

  const startOffset = firstDay.getDay();
  for (let i = startOffset - 1; i >= 0; i--) {
    days.push(new Date(year, month, -i));
  }
  for (let i = 1; i <= lastDay.getDate(); i++) {
    days.push(new Date(year, month, i));
  }
  const endOffset = 42 - days.length;
  for (let i = 1; i <= endOffset; i++) {
    days.push(new Date(year, month + 1, i));
  }
  return days;
}

function formatISO(dateObj) {
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, "0");
  const d = String(dateObj.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export default function CalendarPage() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());

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

  function goPrev() {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(viewYear - 1); }
    else setViewMonth(viewMonth - 1);
  }
  function goNext() {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(viewYear + 1); }
    else setViewMonth(viewMonth + 1);
  }
  function goToday() {
    setViewYear(today.getFullYear());
    setViewMonth(today.getMonth());
  }

  if (loading) {
    return (
      <>
        <header className="page-header"><h1 className="page-title">Calendar</h1></header>
        <div className="calendar-view">
          <p className="cell-placeholder" style={{ padding: 40 }}>Loading...</p>
        </div>
      </>
    );
  }

  const daysGrid = getMonthMatrix(viewYear, viewMonth);
  const monthName = new Intl.DateTimeFormat("en-US", { month: "long" }).format(new Date(viewYear, viewMonth, 1));
  const weekDays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const todayIso = formatISO(today);

  const tasksByDate = {};
  for (const task of tasks) {
    const key = task.dueDate;
    if (!key) continue;
    if (!tasksByDate[key]) tasksByDate[key] = [];
    tasksByDate[key].push(task);
  }

  return (
    <>
      <header className="page-header">
        <h1 className="page-title">Calendar</h1>
      </header>

      <div className="calendar-view">
        <div className="calendar-header">
          <h2 className="calendar-title">{monthName} {viewYear}</h2>
          <div className="calendar-nav">
            <button className="btn-ghost" onClick={goToday}>Today</button>
            <button className="btn-ghost" onClick={goPrev} aria-label="Previous month" style={{ padding: "0 8px" }}>←</button>
            <button className="btn-ghost" onClick={goNext} aria-label="Next month" style={{ padding: "0 8px" }}>→</button>
          </div>
        </div>

        <div className="calendar-grid">
          {weekDays.map((day) => (
            <div key={day} className="calendar-day-header">{day}</div>
          ))}

          {daysGrid.map((dateObj, i) => {
            const iso = formatISO(dateObj);
            const isOther = dateObj.getMonth() !== viewMonth;
            const isToday = iso === todayIso;
            const dayTasks = tasksByDate[iso] || [];

            return (
              <div key={iso + i} className={`calendar-cell${isOther ? " calendar-cell--other-month" : ""}${isToday ? " calendar-cell--today" : ""}`}>
                <div className="calendar-cell__date">{dateObj.getDate()}</div>
                <div className="calendar-cell__events">
                  {dayTasks.map((task) => {
                    const isDone = task.status === "done";
                    const urgency = getTaskUrgency(task.dueDate, task.status);
                    return (
                      <div
                        key={task.id}
                        className={`calendar-event calendar-event--${urgency.color}${isDone ? " calendar-event--done" : ""}`}
                        title={`[${task.course || "—"}] ${task.title}`}
                        onClick={() => handleToggle(task)}
                      >
                        {task.title}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
