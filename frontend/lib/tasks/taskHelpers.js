import { listSyllabusRecords, patchSyllabusRecord } from "../storage/syllabusStore";
import { listTasks, putTask, patchTask, deleteTask } from "../storage/taskStore";

const SETUP_STORAGE_KEY = "sys-semester-setup";
const MAX_RECURRING_OCCURRENCES = 220;

function readSetup() {
  if (typeof window === "undefined") return { courses: [], semester: {} };
  try {
    const raw = localStorage.getItem(SETUP_STORAGE_KEY);
    if (!raw) return { courses: [], semester: {} };
    const parsed = JSON.parse(raw);
    return {
      courses: Array.isArray(parsed?.courses) ? parsed.courses : [],
      semester: parsed?.semesterDates ?? {},
    };
  } catch {
    return { courses: [], semester: {} };
  }
}

export function stripExtension(filename) {
  if (!filename) return "";
  return filename.replace(/\.[^/.]+$/, "");
}

export function extractCourseCode(text) {
  if (!text) return "";
  const match = text.match(/([A-Z]{2,5})\s*(\d{2,5})/i);
  if (match) {
    return `${match[1].toUpperCase()} ${match[2]}`;
  }
  return text;
}

export function courseLabel(courseId, courses, fallback) {
  const course = courses.find((c) => c.id === courseId);
  if (!course) return extractCourseCode(fallback) || "—";
  return course.code || course.name || extractCourseCode(fallback) || "—";
}

function toLocalMidnight(isoDate) {
  return new Date(`${isoDate}T00:00:00`);
}

function isValidDate(dateObj) {
  return dateObj instanceof Date && !Number.isNaN(dateObj.getTime());
}

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

export function formatISO(dateObj) {
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, "0");
  const d = String(dateObj.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function getTaskUrgency(dueDateISO, status) {
  if (status === "done") return { label: "Done", color: "green", sortValue: 99 };
  if (!dueDateISO) return { label: "—", color: "gray", sortValue: 50 };

  const target = toLocalMidnight(dueDateISO);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.ceil((target - today) / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return { label: "Overdue", color: "red", sortValue: 0 };
  if (diffDays <= 2) return { label: "Urgent", color: "red", sortValue: 1 };
  if (diffDays <= 7) return { label: "Soon", color: "orange", sortValue: 2 };
  return { label: "Upcoming", color: "blue", sortValue: 3 };
}

export function getTaskBucket(dueDateISO, status) {
  if (status === "done") return "Done";
  if (!dueDateISO) return "Later";

  const target = toLocalMidnight(dueDateISO);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.ceil((target - today) / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return "Overdue";
  if (diffDays === 0) return "Today";
  if (diffDays <= 7) return "This Week";
  if (diffDays <= 14) return "Next Week";
  return "Later";
}

function materializeRecurring(task, semesterEnd) {
  if (!task.recurrence || !task.recurrence.days?.length) return [task];

  const endStr = task.recurrence.endDate || semesterEnd;
  if (!endStr) return [task];

  const start = toLocalMidnight(task.recurrence.startDate || task.dueDate || new Date().toISOString().slice(0, 10));
  const end = toLocalMidnight(endStr);
  if (!isValidDate(start) || !isValidDate(end) || start > end) return [task];

  const daySet = new Set(
    task.recurrence.days
      .map((day) => Number(day))
      .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
  );
  if (daySet.size === 0) return [task];

  const completedDates = new Set(task.completedDates || []);
  const occurrences = [];

  const cursor = new Date(start);
  while (cursor <= end && occurrences.length < MAX_RECURRING_OCCURRENCES) {
    if (daySet.has(cursor.getDay())) {
      const isoDate = formatISO(cursor);
      occurrences.push({
        ...task,
        id: `${task.id}::${isoDate}`,
        parentId: task.id,
        dueDate: isoDate,
        status: task.status === "done" || completedDates.has(isoDate) ? "done" : "active",
        isOccurrence: true,
      });
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return occurrences.length > 0 ? occurrences : [task];
}

function sortTasks(tasks) {
  return [...tasks].sort((a, b) => {
    if (a.status === "done" && b.status !== "done") return 1;
    if (b.status === "done" && a.status !== "done") return -1;
    const dateA = a.dueDate || "";
    const dateB = b.dueDate || "";
    if (!dateA && !dateB) return 0;
    if (!dateA) return 1;
    if (!dateB) return -1;
    return dateA.localeCompare(dateB);
  });
}

/* ===========================================
   START PLAN / MILESTONE GENERATION
   =========================================== */

const MILESTONE_ELIGIBLE_TYPES = new Set([
  "exam", "midterm", "final", "project", "essay", "assignment", "presentation",
]);

const MAJOR_TASK_TYPES = new Set([
  "exam", "midterm", "final", "project", "essay", "presentation",
]);

const MILESTONE_TEMPLATES = {
  exam:         [{ label: "Start review",        offset: 0.75, why: "gives you time to identify gaps" },
                 { label: "Deep review",         offset: 0.4,  why: "helps avoid cramming" },
                 { label: "Final review",        offset: 0.1,  why: "one last pass before the exam" }],
  midterm:      [{ label: "Start review",        offset: 0.75, why: "gives you time to identify gaps" },
                 { label: "Deep review",         offset: 0.4,  why: "helps avoid cramming" },
                 { label: "Final review",        offset: 0.1,  why: "one last pass before the exam" }],
  final:        [{ label: "Start review",        offset: 0.8,  why: "finals need longer preparation" },
                 { label: "Practice problems",   offset: 0.5,  why: "active recall beats re-reading" },
                 { label: "Deep review",         offset: 0.25, why: "identify remaining weak spots" },
                 { label: "Final review",        offset: 0.08, why: "light refresh before the exam" }],
  essay:        [{ label: "Start research",      offset: 0.8,  why: "gives you time to find sources" },
                 { label: "Write draft",         offset: 0.5,  why: "first drafts don't need to be perfect" },
                 { label: "Revise",              offset: 0.2,  why: "revision is where grades improve" }],
  project:      [{ label: "Plan & begin",        offset: 0.8,  why: "get the structure in place early" },
                 { label: "Main work session",   offset: 0.45, why: "do the core work with time to spare" },
                 { label: "Polish & test",       offset: 0.12, why: "catch issues before submission" }],
  presentation: [{ label: "Outline slides",      offset: 0.7,  why: "structure first, details later" },
                 { label: "Draft slides",        offset: 0.35, why: "fill in the content" },
                 { label: "Practice run",        offset: 0.1,  why: "rehearsing reduces anxiety" }],
  assignment:   [{ label: "Start working",       offset: 0.65, why: "gives you time if you hit a snag" },
                 { label: "Final check",         offset: 0.12, why: "catch small mistakes before submitting" }],
};

function shouldGenerateMilestones(type, difficulty) {
  if (!MILESTONE_ELIGIBLE_TYPES.has(type)) return false;
  if (type === "assignment" && (difficulty ?? 0) < 3) return false;
  return true;
}

function daysUntilDate(dueDateISO) {
  if (!dueDateISO) return null;
  const target = toLocalMidnight(dueDateISO);
  if (!isValidDate(target)) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((target - today) / (1000 * 60 * 60 * 24));
}

function effortWeight(task) {
  const difficulty = Number(task?.difficulty) || 0;
  if (task?.type === "final") return Math.max(difficulty, 5);
  if (task?.type === "exam" || task?.type === "midterm") return Math.max(difficulty, 5);
  if (MAJOR_TASK_TYPES.has(task?.type)) return Math.max(difficulty, 4);
  if (task?.type === "assignment" && difficulty >= 4) return difficulty;
  return difficulty;
}

function normalizeStartCommitment(commitment) {
  if (!commitment) return null;
  const scheduledAt = typeof commitment.scheduledAt === "string" ? commitment.scheduledAt : "";
  const place = typeof commitment.place === "string" ? commitment.place.trim() : "";
  const firstStep = typeof commitment.firstStep === "string" ? commitment.firstStep.trim() : "";

  if (!scheduledAt && !place && !firstStep) return null;

  return {
    scheduledAt,
    place,
    firstStep,
    updatedAt: Date.now(),
  };
}

/** Returns true for task types that deserve Start Plan or heavy-week treatment. */
export function isMajorTask(task) {
  return MAJOR_TASK_TYPES.has(task?.type) || (task?.type === "assignment" && (task?.difficulty ?? 0) >= 4);
}

/**
 * Returns true when a task's Start Plan can be safely regenerated from task
 * fields. Once a student edits or deletes a prep milestone, we preserve their
 * plan instead of replacing it during due-date, type, or difficulty edits.
 */
export function shouldRegenerateStartPlan(task) {
  if (task?.milestonesCustomized) return false;
  const milestones = task?.milestones;
  if (!Array.isArray(milestones) || milestones.length === 0) return true;
  return milestones.every((milestone) => milestone?.autoGenerated === true && !milestone?.userEdited);
}

/**
 * Computes the Start By date from the earliest valid milestone date. Start By
 * is intentionally derived from milestones so manually edited prep plans stay
 * coherent without storing a second source of truth.
 */
export function getStartByDateFromMilestones(milestones) {
  if (!Array.isArray(milestones) || milestones.length === 0) return null;
  const dates = milestones
    .map((milestone) => milestone?.date)
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
  return dates[0] || null;
}

/**
 * Combines due date, task effort, major-task status, and open Start Plan state
 * into a sortable score. It keeps What Matters from over-prioritizing small
 * near-term work while hiding large tasks that need attention earlier.
 */
export function getEffortPriorityScore(task) {
  if (!task || task.status === "done") return Number.NEGATIVE_INFINITY;
  const daysUntil = daysUntilDate(task.dueDate);
  const effort = effortWeight(task);
  let score = effort * 10;

  if (daysUntil === null) {
    score += 0;
  } else if (daysUntil < 0) {
    score += 100;
  } else if (daysUntil === 0) {
    score += 85;
  } else {
    score += Math.max(0, 60 - daysUntil * 4);
  }

  if (isMajorTask(task)) score += 14;
  if (isPrepWindowOpen(task)) score += 16;
  return score;
}

/**
 * Sorts visible planning lists by effort-aware urgency, then falls back to due
 * date and title for stable scanning.
 */
export function sortByEffortPriority(tasks) {
  return [...tasks].sort((a, b) => {
    const scoreDiff = getEffortPriorityScore(b) - getEffortPriorityScore(a);
    if (scoreDiff !== 0) return scoreDiff;
    const dateA = a.dueDate || "";
    const dateB = b.dueDate || "";
    if (dateA !== dateB) return dateA.localeCompare(dateB);
    return (a.title || "").localeCompare(b.title || "");
  });
}

/**
 * Finds a calm heavy-week warning from parent tasks only. The threshold is high
 * enough to avoid noise: either several major items converge or the total
 * effort is clearly above a normal week.
 */
export function getHeavyWeekSignal(tasks, horizonDays = 14) {
  const candidates = (tasks || [])
    .filter((task) => {
      if (!task || task.status === "done" || task.isMilestone || !task.dueDate) return false;
      const daysUntil = daysUntilDate(task.dueDate);
      return daysUntil !== null &&
        daysUntil >= 0 &&
        daysUntil <= horizonDays &&
        (isMajorTask(task) || effortWeight(task) >= 4);
    })
    .map((task) => ({
      task,
      daysUntil: daysUntilDate(task.dueDate),
      effort: effortWeight(task),
    }))
    .sort((a, b) => a.daysUntil - b.daysUntil || b.effort - a.effort);

  const effortTotal = candidates.reduce((sum, item) => sum + item.effort, 0);
  if (candidates.length < 3 && effortTotal < 10) return null;

  const startCandidate =
    candidates.find(({ task }) => {
      const action = getNextAction(task);
      return isPrepWindowOpen(task) && action?.active;
    }) || candidates[0];

  return {
    count: candidates.length,
    effortTotal,
    windowLabel: candidates.some((item) => item.daysUntil <= 7) ? "the next 7 days" : "the next 14 days",
    items: candidates.slice(0, 4).map((item) => item.task),
    suggestionTask: startCandidate?.task || null,
    suggestionAction: startCandidate ? getNextAction(startCandidate.task) : null,
  };
}

/**
 * Builds the default Start Plan for a major task. The generated dates stay
 * between today/semester start and the real due date, which avoids creating
 * impossible prep steps for old deadlines or very short windows.
 */
export function generateMilestones(task, semesterStartDate) {
  const { type, dueDate, difficulty } = task;
  if (!dueDate || !shouldGenerateMilestones(type, difficulty)) return { milestones: [], startByDate: null };

  const dueObj = toLocalMidnight(dueDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (dueObj <= today) return { milestones: [], startByDate: null };

  let windowStart = today;
  if (semesterStartDate) {
    const semStart = toLocalMidnight(semesterStartDate);
    if (semStart > today) windowStart = semStart;
  }

  const totalDays = Math.ceil((dueObj - windowStart) / (1000 * 60 * 60 * 24));
  if (totalDays < 3) return { milestones: [], startByDate: null };

  const template = MILESTONE_TEMPLATES[type] || MILESTONE_TEMPLATES.assignment;

  // Increase prep window for harder tasks
  const difficultyMultiplier = (difficulty && difficulty >= 4) ? 1.15 : 1;

  const milestones = template.map((step, index) => {
    const adjustedOffset = Math.min(step.offset * difficultyMultiplier, 0.95);
    const daysFromStart = Math.round(totalDays * (1 - adjustedOffset));
    const milestoneDate = new Date(windowStart);
    milestoneDate.setDate(milestoneDate.getDate() + daysFromStart);

    if (milestoneDate >= dueObj) {
      milestoneDate.setTime(dueObj.getTime());
      milestoneDate.setDate(milestoneDate.getDate() - 1);
    }
    if (milestoneDate < windowStart) {
      milestoneDate.setTime(windowStart.getTime());
    }

    return {
      id: `ms-${index}`,
      label: step.label,
      date: formatISO(milestoneDate),
      why: step.why,
      done: false,
      autoGenerated: true,
    };
  });

  // startByDate = the date of the first milestone
  const startByDate = milestones.length > 0 ? milestones[0].date : null;

  return { milestones, startByDate };
}

/** Derive the next action from a task's milestones */
export function getNextAction(task) {
  if (!task.milestones || task.milestones.length === 0 || task.status === "done") return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Find the first incomplete milestone whose date is today or past
  for (const ms of task.milestones) {
    if (ms.done) continue;
    const msDate = toLocalMidnight(ms.date);
    if (msDate <= today) {
      return { label: ms.label, why: ms.why, date: ms.date, active: true };
    }
  }

  // If no milestone is active yet, find the next upcoming one
  for (const ms of task.milestones) {
    if (ms.done) continue;
    return { label: ms.label, why: ms.why, date: ms.date, active: false };
  }

  return null;
}

/** Check whether a task's start plan prep window has opened */
export function isPrepWindowOpen(task) {
  if (!task.startByDate || task.status === "done") return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return toLocalMidnight(task.startByDate) <= today;
}

/* ===========================================
   UNIFIED TASK GATHERING
   =========================================== */

export async function getAllSemesterTasks() {
  const { courses, semester } = readSetup();
  const semesterEnd = semester?.endDate;

  // 1. Approved syllabus tasks
  const records = await listSyllabusRecords();
  const syllabusTasks = records.flatMap((record) =>
    (record.reviewItems || [])
      .filter((item) => item.status === "approved" || item.status === "done")
      .map((item) => ({
        id: `syl::${record.id}::${item.id}`,
        title: item.title,
        type: item.type || "other",
        dueDate: item.dueDateRaw,
        difficulty: item.difficulty ?? null,
        status: item.status === "done" ? "done" : "active",
        course: courseLabel(record.courseId, courses, stripExtension(record.name)),
        source: "syllabus",
        recordId: record.id,
        taskId: item.id,
        confidence: item.confidence,
        sourcePage: item.sourcePage,
        milestones: item.milestones || null,
        startByDate: item.startByDate || null,
        milestonesCustomized: item.milestonesCustomized || false,
        startCommitment: item.startCommitment || null,
      }))
  );

  // 2. Manual and recurring tasks from taskStore
  const manualTasks = await listTasks();
  const expandedManual = manualTasks.flatMap((task) => {
    if (task.recurrence) {
      return materializeRecurring(task, semesterEnd);
    }
    return [{
      ...task,
      course: task.courseId ? courseLabel(task.courseId, courses, task.courseLabel || "—") : (task.courseLabel || "—"),
      source: "manual",
    }];
  });

  // 3. Flatten milestones inline for views that show them
  const allTasks = [...syllabusTasks, ...expandedManual];
  const withMilestones = [];

  for (const task of allTasks) {
    withMilestones.push(task);

    const milestones = task.milestones;
    if (milestones && milestones.length > 0 && task.status !== "done") {
      for (const ms of milestones) {
        withMilestones.push({
          id: `${task.id}::${ms.id}`,
          title: `↳ ${ms.label}`,
          type: task.type,
          dueDate: ms.date,
          difficulty: null,
          status: ms.done ? "done" : "active",
          course: task.course,
          source: "milestone",
          parentTaskId: task.id,
          parentTitle: task.title,
          milestoneId: ms.id,
          milestoneLabel: ms.label,
          milestoneWhy: ms.why,
          milestoneAutoGenerated: ms.autoGenerated === true,
          milestoneUserEdited: ms.userEdited === true,
          isMilestone: true,
        });
      }
    }
  }

  return sortTasks(withMilestones);
}

/** Get only parent-level tasks (no milestone rows), used by calendar/planning views */
export async function getParentTasks() {
  const { courses, semester } = readSetup();
  const semesterEnd = semester?.endDate;

  const records = await listSyllabusRecords();
  const syllabusTasks = records.flatMap((record) =>
    (record.reviewItems || [])
      .filter((item) => item.status === "approved" || item.status === "done")
      .map((item) => ({
        id: `syl::${record.id}::${item.id}`,
        title: item.title,
        type: item.type || "other",
        dueDate: item.dueDateRaw,
        difficulty: item.difficulty ?? null,
        status: item.status === "done" ? "done" : "active",
        course: courseLabel(record.courseId, courses, stripExtension(record.name)),
        source: "syllabus",
        recordId: record.id,
        taskId: item.id,
        milestones: item.milestones || null,
        startByDate: item.startByDate || null,
        milestonesCustomized: item.milestonesCustomized || false,
        startCommitment: item.startCommitment || null,
      }))
  );

  const manualTasks = await listTasks();
  const expandedManual = manualTasks.flatMap((task) => {
    if (task.recurrence) return materializeRecurring(task, semesterEnd);
    return [{
      ...task,
      course: task.courseId ? courseLabel(task.courseId, courses, task.courseLabel || "—") : (task.courseLabel || "—"),
      source: "manual",
    }];
  });

  return sortTasks([...syllabusTasks, ...expandedManual]);
}

export async function getApprovedTasks() {
  const all = await getAllSemesterTasks();
  return all.filter((t) => t.source === "syllabus");
}

export async function toggleTaskCompletion(task) {
  // Milestone toggle
  if (task.isMilestone && task.parentTaskId) {
    const parentId = task.parentTaskId;

    if (parentId.startsWith("syl::")) {
      const parts = parentId.split("::");
      const recordId = parts[1];
      const itemId = parts[2];
      await patchSyllabusRecord(recordId, (record) => ({
        ...record,
        reviewItems: (record.reviewItems || []).map((i) => {
          if (i.id !== itemId) return i;
          const updatedMs = (i.milestones || []).map((m) =>
            m.id === task.milestoneId ? { ...m, done: !m.done } : m
          );
          return { ...i, milestones: updatedMs };
        }),
      }));
    } else {
      await patchTask(parentId, (existing) => {
        const updatedMs = (existing.milestones || []).map((m) =>
          m.id === task.milestoneId ? { ...m, done: !m.done } : m
        );
        return { ...existing, milestones: updatedMs };
      });
    }
    return task.status === "done" ? "active" : "done";
  }

  if (task.source === "syllabus") {
    const nextStatus = task.status === "done" ? "approved" : "done";
    await patchSyllabusRecord(task.recordId, (record) => ({
      ...record,
      reviewItems: (record.reviewItems || []).map((i) =>
        i.id === task.taskId ? { ...i, status: nextStatus } : i
      ),
    }));
    return nextStatus === "done" ? "done" : "active";
  }

  if (task.isOccurrence && task.parentId) {
    const dateStr = task.dueDate;
    await patchTask(task.parentId, (existing) => {
      const completed = new Set(existing.completedDates || []);
      if (task.status === "done") {
        completed.delete(dateStr);
      } else {
        completed.add(dateStr);
      }
      return { ...existing, completedDates: [...completed] };
    });
    return task.status === "done" ? "active" : "done";
  }

  const nextStatus = task.status === "done" ? "active" : "done";
  await patchTask(task.id, (existing) => ({ ...existing, status: nextStatus }));
  return nextStatus;
}

/**
 * Persists a manually created task and attaches an auto-generated Start Plan
 * when the task is large enough to benefit from reverse planning.
 */
export async function createTask(taskData) {
  const { semester } = readSetup();
  const id = `task-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  const { milestones, startByDate } = generateMilestones({
    type: taskData.type,
    dueDate: taskData.dueDate,
    difficulty: taskData.difficulty ?? null,
  }, semester?.startDate);

  const task = {
    id,
    title: taskData.title,
    type: taskData.type || "other",
    dueDate: taskData.dueDate || null,
    difficulty: taskData.difficulty ?? null,
    status: "active",
    courseId: taskData.courseId || null,
    courseLabel: taskData.courseLabel || "—",
    notes: taskData.notes || "",
    recurrence: taskData.recurrence || null,
    completedDates: [],
    milestones: milestones.length > 0 ? milestones : null,
    startByDate: startByDate,
    milestonesCustomized: false,
    startCommitment: null,
    createdAt: Date.now(),
  };
  await putTask(task);
  return task;
}

/**
 * Updates a manual task while keeping Start Plan behavior predictable. If the
 * student has not customized milestones, sensitive edits regenerate the plan;
 * once they edit/delete prep steps, their custom structure is preserved.
 */
export async function updateTask(taskId, taskData) {
  const { semester } = readSetup();
  
  await patchTask(taskId, (existing) => {
    const nextType = hasOwn(taskData, "type") ? taskData.type : existing.type;
    const nextDueDate = hasOwn(taskData, "dueDate") ? taskData.dueDate : existing.dueDate;
    const nextDifficulty = hasOwn(taskData, "difficulty") ? taskData.difficulty : existing.difficulty;

    const needsMilestoneRegen =
      nextType !== existing.type ||
      nextDueDate !== existing.dueDate ||
      nextDifficulty !== existing.difficulty;

    let milestones = existing.milestones;
    let startByDate = existing.startByDate;
    let milestonesCustomized = existing.milestonesCustomized || false;

    if (needsMilestoneRegen) {
      if (shouldRegenerateStartPlan(existing)) {
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
      ...existing,
      ...taskData,
      milestones,
      startByDate,
      milestonesCustomized,
      updatedAt: Date.now(),
    };
  });
}

/**
 * Saves the concrete "when/where/first move" commitment attached to a Start
 * Plan task. This is deliberately separate from milestones: milestones say
 * what should happen; the commitment captures the student's next real session.
 */
export async function saveStartCommitment(task, commitment) {
  const normalized = normalizeStartCommitment(commitment);

  if (task.source === "syllabus" && task.recordId && task.taskId) {
    await patchSyllabusRecord(task.recordId, (record) => ({
      ...record,
      reviewItems: (record.reviewItems || []).map((item) =>
        item.id === task.taskId
          ? { ...item, startCommitment: normalized }
          : item
      ),
    }));
    return normalized;
  }

  const taskId = task.isOccurrence && task.parentId ? task.parentId : task.id;
  await patchTask(taskId, (existing) => ({
    ...existing,
    startCommitment: normalized,
    updatedAt: Date.now(),
  }));
  return normalized;
}

/**
 * Updates one persisted Start Plan milestone in place. Milestones are stored
 * inside their parent task/review item, so this helper handles both manual
 * tasks and syllabus-backed tasks through the same parent id used by views.
 */
export async function updateMilestone(parentTaskId, milestoneId, milestoneData) {
  const applyUpdate = (milestones) => {
    const updated = (milestones || []).map((milestone) => {
      if (milestone.id !== milestoneId) return milestone;
      return {
        ...milestone,
        label: milestoneData.label?.trim() || milestone.label,
        date: milestoneData.date || milestone.date,
        why: milestoneData.why ?? milestone.why ?? "",
        done: hasOwn(milestoneData, "status")
          ? milestoneData.status === "done"
          : hasOwn(milestoneData, "done")
            ? !!milestoneData.done
            : !!milestone.done,
        autoGenerated: false,
        userEdited: true,
        updatedAt: Date.now(),
      };
    });
    return updated.length > 0 ? updated : null;
  };

  if (parentTaskId.startsWith("syl::")) {
    const [, recordId, itemId] = parentTaskId.split("::");
    await patchSyllabusRecord(recordId, (record) => ({
      ...record,
      reviewItems: (record.reviewItems || []).map((item) => {
        if (item.id !== itemId) return item;
        const milestones = applyUpdate(item.milestones);
        return {
          ...item,
          milestones,
          startByDate: getStartByDateFromMilestones(milestones),
          milestonesCustomized: true,
        };
      }),
    }));
    return;
  }

  await patchTask(parentTaskId, (existing) => {
    const milestones = applyUpdate(existing.milestones);
    return {
      ...existing,
      milestones,
      startByDate: getStartByDateFromMilestones(milestones),
      milestonesCustomized: true,
      updatedAt: Date.now(),
    };
  });
}

/**
 * Deletes one Start Plan milestone while preserving the parent task. Deleting a
 * prep step marks the plan as customized so future parent edits do not silently
 * recreate a milestone the student intentionally removed.
 */
export async function deleteMilestone(parentTaskId, milestoneId) {
  const applyDelete = (milestones) => {
    const updated = (milestones || []).filter((milestone) => milestone.id !== milestoneId);
    return updated.length > 0 ? updated : null;
  };

  if (parentTaskId.startsWith("syl::")) {
    const [, recordId, itemId] = parentTaskId.split("::");
    await patchSyllabusRecord(recordId, (record) => ({
      ...record,
      reviewItems: (record.reviewItems || []).map((item) => {
        if (item.id !== itemId) return item;
        const milestones = applyDelete(item.milestones);
        return {
          ...item,
          milestones,
          startByDate: getStartByDateFromMilestones(milestones),
          milestonesCustomized: true,
        };
      }),
    }));
    return;
  }

  await patchTask(parentTaskId, (existing) => {
    const milestones = applyDelete(existing.milestones);
    return {
      ...existing,
      milestones,
      startByDate: getStartByDateFromMilestones(milestones),
      milestonesCustomized: true,
      updatedAt: Date.now(),
    };
  });
}

export async function removeTask(taskId) {
  await deleteTask(taskId);
}

export { readSetup };
