"use client";

import { useEffect, useMemo, useState } from "react";
import { getParentTasks, readSetup } from "../../../lib/tasks/taskHelpers";

const DAY_MS = 1000 * 60 * 60 * 24;
const PAIN_THRESHOLD = 8;
const HEAVY_THRESHOLD = 5;

function toLocalMidnight(dateString) {
  if (!dateString) return null;
  const date = new Date(`${dateString}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function fromDate(dateObj) {
  const date = new Date(dateObj);
  date.setHours(0, 0, 0, 0);
  return date;
}

function addDays(dateObj, days) {
  const date = new Date(dateObj);
  date.setDate(date.getDate() + days);
  return date;
}

function clampDate(dateObj, minDate, maxDate) {
  if (dateObj < minDate) return new Date(minDate);
  if (dateObj > maxDate) return new Date(maxDate);
  return new Date(dateObj);
}

function daysInclusive(startDate, endDate) {
  return Math.max(1, Math.floor((fromDate(endDate) - fromDate(startDate)) / DAY_MS) + 1);
}

function overlapDays(firstStart, firstEnd, secondStart, secondEnd) {
  const start = Math.max(fromDate(firstStart).getTime(), fromDate(secondStart).getTime());
  const end = Math.min(addDays(firstEnd, 1).getTime(), addDays(secondEnd, 1).getTime());
  return Math.max(0, Math.ceil((end - start) / DAY_MS));
}

function formatShortDate(dateObj) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(dateObj);
}

function formatLoad(value) {
  return value.toFixed(value >= 10 ? 0 : 1);
}

function getWeekNumber(dateObj, semesterStart) {
  return Math.floor((fromDate(dateObj) - fromDate(semesterStart)) / (DAY_MS * 7)) + 1;
}

function taskWeight(task) {
  const base = Number(task.difficulty) || 2;
  const type = task.type || "other";
  const multiplier = type === "midterm" || type === "final" || type === "exam" ? 1.45 : type === "project" ? 1.18 : 1;
  return base * multiplier;
}

function inferredPrepDays(task) {
  const difficulty = Number(task.difficulty) || 2;
  const type = task.type || "other";

  if (type === "final") return 28;
  if (type === "exam" || type === "midterm") return 21;
  if (type === "project") return 21;
  if (type === "essay" || type === "presentation") return 16;
  if (difficulty >= 5) return 18;
  if (difficulty >= 4) return 14;
  if (difficulty >= 3) return 9;
  return 5;
}

function earliestMilestoneDate(task) {
  const dates = (task.milestones || [])
    .map((milestone) => toLocalMidnight(milestone.date))
    .filter(Boolean)
    .sort((first, second) => first - second);

  return dates[0] || null;
}

function taskPrepStart(task, semesterStart, dueDate) {
  const explicitStart = toLocalMidnight(task.startByDate);
  const milestoneStart = earliestMilestoneDate(task);
  const inferredStart = addDays(dueDate, -inferredPrepDays(task));
  const candidates = [explicitStart, milestoneStart, inferredStart]
    .filter(Boolean)
    .filter((date) => date <= dueDate)
    .sort((first, second) => first - second);

  return clampDate(candidates[0] || inferredStart, semesterStart, dueDate);
}

function buildMitigation(week, semesterStart) {
  if (week.score < PAIN_THRESHOLD || week.items.length === 0) return null;

  const heavyItems = week.items.filter((item) => item.weight >= 4 || item.dueInWeek);
  const candidate = [...(heavyItems.length > 0 ? heavyItems : week.items)]
    .sort((first, second) => second.load - first.load)[0];

  const proposedStart = clampDate(addDays(candidate.prepStart, -7), semesterStart, candidate.dueDate);
  const proposedWeek = Math.max(1, getWeekNumber(proposedStart, semesterStart));
  const heavyCount = Math.max(heavyItems.length, week.items.filter((item) => item.dueInWeek).length);

  return {
    headline: `${heavyCount} heavy item${heavyCount !== 1 ? "s" : ""} converge in Week ${week.weekNumber}.`,
    action: `Start "${candidate.task.title}" by Week ${proposedWeek} (${formatShortDate(proposedStart)}) to pull effort out of the deadline peak.`,
  };
}

function classifyWeek(score) {
  if (score >= PAIN_THRESHOLD) return "pain";
  if (score >= HEAVY_THRESHOLD) return "heavy";
  return "steady";
}

function IconAlert() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

export default function ForecastPage() {
  const [tasks, setTasks] = useState([]);
  const [setup, setSetup] = useState(null);
  const [selectedWeek, setSelectedWeek] = useState(null);

  useEffect(() => {
    setSetup(readSetup());
    getParentTasks().then(setTasks);
  }, []);

  const forecast = useMemo(() => {
    if (!setup?.semester?.startDate || !setup?.semester?.endDate) {
      return { weeks: [], activeTasks: [], painWeeks: [], peakWeek: null, maxScore: 1 };
    }

    const semesterStart = toLocalMidnight(setup.semester.startDate);
    const semesterEnd = toLocalMidnight(setup.semester.endDate);
    if (!semesterStart || !semesterEnd || semesterStart > semesterEnd) {
      return { weeks: [], activeTasks: [], painWeeks: [], peakWeek: null, maxScore: 1 };
    }

    const totalDays = daysInclusive(semesterStart, semesterEnd);
    const totalWeeks = Math.ceil(totalDays / 7);
    const weeks = Array.from({ length: totalWeeks }, (_, index) => {
      const start = addDays(semesterStart, index * 7);
      const end = clampDate(addDays(start, 6), semesterStart, semesterEnd);

      return {
        weekNumber: index + 1,
        start,
        end,
        label: `${formatShortDate(start)} - ${formatShortDate(end)}`,
        score: 0,
        prepScore: 0,
        deadlineScore: 0,
        itemsById: new Map(),
      };
    });

    const activeTasks = tasks
      .filter((task) => task.status !== "done" && !task.isMilestone && task.source !== "milestone" && task.dueDate)
      .map((task) => ({ task, dueDate: toLocalMidnight(task.dueDate) }))
      .filter(({ dueDate }) => dueDate && dueDate >= semesterStart && dueDate <= semesterEnd);

    for (const { task, dueDate } of activeTasks) {
      const weight = taskWeight(task);
      const prepStart = taskPrepStart(task, semesterStart, dueDate);
      const prepDays = daysInclusive(prepStart, dueDate);

      for (const week of weeks) {
        const overlap = overlapDays(prepStart, dueDate, week.start, week.end);
        if (overlap === 0) continue;

        const dueInWeek = dueDate >= week.start && dueDate <= week.end;
        const prepLoad = weight * 0.72 * (overlap / prepDays);
        const deadlineLoad = dueInWeek ? weight * 0.28 : 0;
        const load = prepLoad + deadlineLoad;

        week.score += load;
        week.prepScore += prepLoad;
        week.deadlineScore += deadlineLoad;

        const existing = week.itemsById.get(task.id) || {
          task,
          dueDate,
          prepStart,
          load: 0,
          weight,
          dueInWeek: false,
        };

        existing.load += load;
        existing.dueInWeek = existing.dueInWeek || dueInWeek;
        week.itemsById.set(task.id, existing);
      }
    }

    const hydratedWeeks = weeks.map((week) => {
      const items = [...week.itemsById.values()].sort((first, second) => second.load - first.load);
      const score = Number(week.score.toFixed(2));
      const nextWeek = {
        ...week,
        score,
        prepScore: Number(week.prepScore.toFixed(2)),
        deadlineScore: Number(week.deadlineScore.toFixed(2)),
        items,
        intensity: classifyWeek(score),
      };
      delete nextWeek.itemsById;
      nextWeek.mitigation = buildMitigation(nextWeek, semesterStart);
      return nextWeek;
    });

    const peakWeek = hydratedWeeks.reduce((best, week) => (week.score > (best?.score ?? -1) ? week : best), null);
    const painWeeks = hydratedWeeks.filter((week) => week.score >= PAIN_THRESHOLD);
    const maxScore = Math.max(1, ...hydratedWeeks.map((week) => week.score));

    return { weeks: hydratedWeeks, activeTasks, painWeeks, peakWeek, maxScore };
  }, [tasks, setup]);

  const visibleWeeks = useMemo(() => {
    if (!selectedWeek) return forecast.weeks;
    return forecast.weeks.filter((week) => week.weekNumber === selectedWeek);
  }, [forecast.weeks, selectedWeek]);

  const selectedWeekData = forecast.weeks.find((week) => week.weekNumber === selectedWeek) || null;

  if (!setup) return null;

  return (
    <div className="forecast-shell">
      <header className="forecast-hero">
        <div>
          <div className="forecast-eyebrow">Semester Forecast</div>
          <h1 className="forecast-title">Workload Map</h1>
          <p className="forecast-subtitle">
            A live map of deadline pressure and prep effort across your semester.
          </p>
        </div>

        <div className="forecast-metrics" aria-label="Forecast summary">
          <div className="forecast-metric">
            <span>Peak Load</span>
            <strong>{forecast.peakWeek ? formatLoad(forecast.peakWeek.score) : "0"}</strong>
          </div>
          <div className="forecast-metric">
            <span>Pain Weeks</span>
            <strong>{forecast.painWeeks.length}</strong>
          </div>
          <div className="forecast-metric">
            <span>Active Tasks</span>
            <strong>{forecast.activeTasks.length}</strong>
          </div>
        </div>
      </header>

      {forecast.activeTasks.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state__icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 3v18h18" />
              <path d="m19 9-5 5-4-4-3 3" />
            </svg>
          </div>
          <h2 className="empty-state__title">No data to forecast</h2>
          <p className="empty-state__copy">
            Your Workload Map will automatically generate once you add tasks or extract your syllabus.
          </p>
        </div>
      ) : (
        <>
          <section className="forecast-topography" aria-label="Effort Topography chart">
        <div className="forecast-topography__header">
          <div>
            <h2>Effort Peaks</h2>
            <p>
              Prep load, deadline pressure, and convergence.
            </p>
          </div>

          {selectedWeekData ? (
            <button className="forecast-clear" type="button" onClick={() => setSelectedWeek(null)}>
              Clear Week {selectedWeekData.weekNumber}
            </button>
          ) : (
            <span className="forecast-topography__hint">All weeks</span>
          )}
        </div>

        <div className="forecast-chart" role="list">
          {forecast.weeks.map((week) => {
            const height = Math.max(8, (week.score / forecast.maxScore) * 100);
            const isSelected = selectedWeek === week.weekNumber;

            return (
              <button
                key={week.weekNumber}
                type="button"
                role="listitem"
                className={`forecast-bar forecast-bar--${week.intensity}${isSelected ? " forecast-bar--selected" : ""}`}
                style={{ "--bar-height": `${height}%` }}
                onClick={() => setSelectedWeek(isSelected ? null : week.weekNumber)}
                aria-label={`Week ${week.weekNumber}, load ${formatLoad(week.score)}`}
              >
                <span className="forecast-bar__value">{formatLoad(week.score)}</span>
                <span className="forecast-bar__track">
                  <span className="forecast-bar__fill" />
                </span>
                <span className="forecast-bar__label">W{week.weekNumber}</span>
              </button>
            );
          })}
        </div>
      </section>

      {forecast.painWeeks.length > 0 && (
        <section className="forecast-mitigation-strip" aria-label="Week of Pain mitigations">
          {forecast.painWeeks.slice(0, 2).map((week) => (
            <article key={week.weekNumber} className="forecast-mitigation">
              <span className="forecast-mitigation__icon"><IconAlert /></span>
              <div>
                <h3>{week.mitigation?.headline}</h3>
                <p>{week.mitigation?.action}</p>
              </div>
            </article>
          ))}
        </section>
      )}

      <div className="forecast-section-head">
        <div>
          <h2>{selectedWeekData ? `Week ${selectedWeekData.weekNumber}` : "Weekly Load"}</h2>
          <p>{selectedWeekData ? selectedWeekData.label : "Distributed effort, deadlines, and recommended pressure release."}</p>
        </div>
      </div>

      <section className="forecast-week-grid">
        {visibleWeeks.map((week) => (
          <article key={week.weekNumber} className={`forecast-week-card forecast-week-card--${week.intensity}`}>
            <div className="forecast-week-card__top">
              <div>
                <h3>Week {week.weekNumber}</h3>
                <p>{week.label}</p>
              </div>
              <div className="forecast-week-card__load">
                <span>Load</span>
                <strong>{formatLoad(week.score)}</strong>
              </div>
            </div>

            <div className="forecast-week-card__meter" aria-hidden="true">
              <span style={{ width: `${Math.min((week.score / PAIN_THRESHOLD) * 100, 100)}%` }} />
            </div>

            <div className="forecast-week-card__split">
              <span>Prep {formatLoad(week.prepScore)}</span>
              <span>Deadline {formatLoad(week.deadlineScore)}</span>
            </div>

            {week.mitigation && (
              <div className="forecast-week-card__advice">
                <IconAlert />
                <span>{week.mitigation.action}</span>
              </div>
            )}

            <div className="forecast-task-list">
              {week.items.length > 0 ? (
                week.items.slice(0, 5).map((item) => (
                  <div key={item.task.id} className="forecast-task">
                    <div className="forecast-task__dot" />
                    <div className="forecast-task__body">
                      <div className="forecast-task__title">{item.task.title}</div>
                      <div className="forecast-task__meta">
                        {item.task.course || "Unmapped"} · {item.dueInWeek ? "due" : "prep"} · {formatLoad(item.load)} pts
                      </div>
                    </div>
                    {item.task.difficulty ? (
                      <span className="forecast-task__difficulty">{item.task.difficulty}</span>
                    ) : null}
                  </div>
                ))
              ) : (
                <div className="forecast-week-card__empty">No active effort scheduled.</div>
              )}
            </div>
          </article>
        ))}
      </section>
        </>
      )}
    </div>
  );
}
