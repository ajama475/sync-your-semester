import { listSyllabusRecords, patchSyllabusRecord } from "../storage/syllabusStore";
import { listTasks, putTask, patchTask, deleteTask } from "../storage/taskStore";

const SETUP_STORAGE_KEY = "sys-semester-setup";

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

function stripExtension(filename) {
  return filename.replace(/\.[^/.]+$/, "");
}

function courseLabel(courseId, courses, fallback) {
  const course = courses.find((c) => c.id === courseId);
  if (!course) return fallback || "—";
  return course.code || course.name || fallback || "—";
}

function toLocalMidnight(isoDate) {
  return new Date(`${isoDate}T00:00:00`);
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
  const daySet = new Set(task.recurrence.days);
  const completedDates = new Set(task.completedDates || []);
  const occurrences = [];

  const cursor = new Date(start);
  while (cursor <= end) {
    if (daySet.has(cursor.getDay())) {
      const isoDate = formatISO(cursor);
      occurrences.push({
        ...task,
        id: `${task.id}::${isoDate}`,
        parentId: task.id,
        dueDate: isoDate,
        status: completedDates.has(isoDate) ? "done" : "active",
        isOccurrence: true,
      });
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return occurrences;
}

function formatISO(dateObj) {
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, "0");
  const d = String(dateObj.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function sortTasks(tasks) {
  return tasks.sort((a, b) => {
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
        status: item.status === "done" ? "done" : "active",
        course: courseLabel(record.courseId, courses, stripExtension(record.name)),
        source: "syllabus",
        recordId: record.id,
        taskId: item.id,
        confidence: item.confidence,
        sourcePage: item.sourcePage,
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

  return sortTasks([...syllabusTasks, ...expandedManual]);
}

export async function getApprovedTasks() {
  const all = await getAllSemesterTasks();
  return all.filter((t) => t.source === "syllabus");
}

export async function toggleTaskCompletion(task) {
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

export async function createTask(taskData) {
  const id = `task-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const task = {
    id,
    title: taskData.title,
    type: taskData.type || "other",
    dueDate: taskData.dueDate || null,
    status: "active",
    courseId: taskData.courseId || null,
    courseLabel: taskData.courseLabel || "—",
    notes: taskData.notes || "",
    recurrence: taskData.recurrence || null,
    completedDates: [],
    createdAt: Date.now(),
  };
  await putTask(task);
  return task;
}

export async function removeTask(taskId) {
  await deleteTask(taskId);
}

export { readSetup };
