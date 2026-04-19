"use client";

import { useCallback, useEffect, useRef, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { parseSyllabus } from "../../../lib/parser/pdfParser";
import {
  deleteSyllabusRecord,
  listSyllabusRecords,
  patchSyllabusRecord,
  putSyllabusRecord,
} from "../../../lib/storage/syllabusStore";
import { extractCourseCode, stripExtension } from "../../../lib/tasks/taskHelpers";

const SETUP_STORAGE_KEY = "sys-semester-setup";
const MAX_DOCUMENTS = 50;
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_TOTAL_SYLLABUS_BYTES = 180 * 1024 * 1024;

/* ---- Premium Icons ---- */

function IconPortal() {
  return (
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
      <circle cx="12" cy="12" r="9" strokeOpacity="0.1" />
    </svg>
  );
}

function IconFile() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );
}

function IconReview() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  );
}

function IconSparkle() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
    </svg>
  );
}

/* ---- Component Helpers ---- */

function StatusBadge({ status }) {
  const configs = {
    uploading: "Uploading",
    parsing: "Analysing",
    ready: "Verified",
    attention: "Action required",
    error: "Error",
  };
  const label = configs[status] || configs.uploading;
  return (
    <span className={`lab-status lab-status--${status || "uploading"}`}>
      {label}
    </span>
  );
}

function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isPdfFile(file) {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

function normalizeSemesterForParser(semester) {
  return {
    startDateISO: semester?.startDateISO || semester?.startDate,
    endDateISO: semester?.endDateISO || semester?.endDate,
    defaultYear: semester?.defaultYear,
  };
}

function toReviewItem(task) {
  return {
    ...task,
    dueDateRaw: task.dueDateISO,
    sourcePage: task.pageNumber,
    snippet: task.sourceText || "",
    highlightedTerms: [task.matchedDateText, ...(task.matchedKeywords || [])].filter(Boolean),
    difficulty: task.difficulty ?? null,
    status: "pending",
  };
}

function storageErrorMessage(error) {
  const name = error?.name || "";
  if (name === "QuotaExceededError" || name === "NS_ERROR_DOM_QUOTA_REACHED") {
    return "Browser storage is full. Remove an older syllabus or use a smaller PDF.";
  }
  return "The PDF could not be processed. Try a selectable-text syllabus PDF.";
}

function totalStoredSyllabusBytes(files) {
  return (files || []).reduce((total, file) => total + (Number(file.size) || 0), 0);
}

/**
 * Browser quota differs widely by device and privacy settings. This check keeps
 * the local-first PDF cache from failing deep in the upload flow, while the
 * fixed product cap prevents a few large syllabi from crowding out the term.
 */
async function getStorageBudgetMessage(incomingBytes, projectedBytes) {
  if (projectedBytes + incomingBytes > MAX_TOTAL_SYLLABUS_BYTES) {
    return `Local syllabus storage is capped at ${formatFileSize(MAX_TOTAL_SYLLABUS_BYTES)}. Remove an older PDF before adding this one.`;
  }

  if (typeof navigator === "undefined" || !navigator.storage?.estimate) return null;

  try {
    const estimate = await navigator.storage.estimate();
    const quota = Number(estimate.quota) || 0;
    const usage = Number(estimate.usage) || 0;
    if (quota > 0 && usage + incomingBytes * 1.4 > quota * 0.85) {
      return "Browser storage is nearly full. Remove an older syllabus or choose a smaller PDF before adding this one.";
    }
  } catch {
    return null;
  }

  return null;
}

function findBestCourseMatch(filename, courses) {
  if (!filename || !courses || courses.length === 0) return "";
  const normalizedFile = filename.toLowerCase().replace(/[._-\s]/g, "");
  
  for (const course of courses) {
    const code = (course.code || "").toLowerCase().replace(/\s+/g, "");
    if (code && normalizedFile.includes(code)) return course.id;
    
    const name = (course.name || "").toLowerCase().replace(/\s+/g, "");
    if (name && normalizedFile.includes(name)) return course.id;
  }
  return "";
}

export default function PremiumSyllabusLab() {
  const router = useRouter();
  const [files, setFiles] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const [courses, setCourses] = useState([]);
  const [semester, setSemester] = useState({});
  const fileInputRef = useRef(null);
  const dragCounter = useRef(0);

  useEffect(() => {
    try {
      const setupRaw = localStorage.getItem(SETUP_STORAGE_KEY);
      if (setupRaw) {
        const parsed = JSON.parse(setupRaw);
        setCourses(parsed.courses || []);
        setSemester(parsed.semesterDates || {});
      }
    } catch {
      setCourses([]);
      setSemester({});
    }
    listSyllabusRecords().then(recs => setFiles(recs.map(r => ({
      ...r,
      taskCount: r.reviewItems?.filter(i => i.status === "pending").length ?? 0
    }))));
  }, []);

  const stats = useMemo(() => ({
    total: files.length,
    pending: files.reduce((acc, f) => acc + (f.taskCount || 0), 0)
  }), [files]);

  const addFiles = async (fileList) => {
    const accepted = Array.from(fileList || []).filter(isPdfFile);
    const slotsRemaining = Math.max(0, MAX_DOCUMENTS - files.length);
    const nextFiles = accepted.slice(0, slotsRemaining);
    let projectedStoredBytes = totalStoredSyllabusBytes(files);

    for (const file of nextFiles) {
      const id = `file-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const newFile = { id, name: file.name, size: file.size, status: "uploading", taskCount: 0 };
      setFiles(prev => [newFile, ...prev]);

      if (file.size > MAX_FILE_BYTES) {
        setFiles(prev => prev.map(f => f.id === id ? {
          ...f,
          status: "error",
          message: `PDF is larger than ${formatFileSize(MAX_FILE_BYTES)}.`
        } : f));
        continue;
      }

      const budgetMessage = await getStorageBudgetMessage(file.size, projectedStoredBytes);
      if (budgetMessage) {
        setFiles(prev => prev.map(f => f.id === id ? {
          ...f,
          status: "error",
          message: budgetMessage
        } : f));
        continue;
      }
      projectedStoredBytes += file.size;

      try {
        const matchedCourseId = findBestCourseMatch(file.name, courses);
        const recordData = { 
          ...newFile, 
          fileBlob: file, 
          reviewItems: [], 
          createdAt: Date.now(),
          courseId: matchedCourseId 
        };
        
        await putSyllabusRecord(recordData);
        setFiles(prev => prev.map(f => f.id === id ? { ...f, status: "parsing", courseId: matchedCourseId } : f));
        
        const parsed = await parseSyllabus(file, {
          semester: normalizeSemesterForParser(semester),
          minConfidence: 52
        });
        const { tasks, ...parseResult } = parsed;
        const reviewItems = tasks.map(toReviewItem);
        
        const finalStatus = reviewItems.length > 0 ? "ready" : "attention";
        const message = reviewItems.length > 0
          ? null
          : parsed.hasExtractableText
            ? "No confident deadline candidates found."
            : "No selectable text was found in this PDF.";

        await patchSyllabusRecord(id, r => ({
          ...r,
          status: finalStatus,
          reviewItems,
          parseResult,
          message,
        }));
        
        setFiles(prev => prev.map(f => f.id === id ? {
          ...f,
          status: finalStatus,
          taskCount: reviewItems.length,
          message,
        } : f));
      } catch (err) {
        console.error("Failed to parse syllabus.", err);
        const message = storageErrorMessage(err);
        try {
          await patchSyllabusRecord(id, r => ({ ...r, status: "error", message }));
        } catch {}
        setFiles(prev => prev.map(f => f.id === id ? { ...f, status: "error", message } : f));
      }
    }
  };

  const handleRemove = async (id) => {
    setFiles(prev => prev.filter(f => f.id !== id));
    await deleteSyllabusRecord(id);
  };

  const handleCourseMap = async (fileId, courseId) => {
    setFiles(prev => prev.map(f => f.id === fileId ? { ...f, courseId } : f));
    await patchSyllabusRecord(fileId, r => ({ ...r, courseId }));
  };

  return (
    <div className="lab-workspace">
      <header className="lab-header">
        <div>
          <h1 className="page-title lab-header__title">Syllabus Lab</h1>
          <p className="page-subtitle lab-header__subtitle">High-fidelity conversion of academic materials.</p>
        </div>
        <div className="lab-stat-pill">
          <div className="lab-stat-pill__item">
            <div className="lab-stat-pill__value">{stats.total}</div>
            <div className="lab-stat-pill__label">Materials</div>
          </div>
          <div className="lab-stat-pill__divider" />
          <div className="lab-stat-pill__item">
            <div className={`lab-stat-pill__value${stats.pending > 0 ? " lab-stat-pill__value--accent" : ""}`}>{stats.pending}</div>
            <div className="lab-stat-pill__label">Pending</div>
          </div>
        </div>
      </header>

      <div 
        className={`lab-portal ${isDragging ? "lab-portal--active" : ""}`}
        onDragEnter={(e) => { e.preventDefault(); dragCounter.current++; setIsDragging(true); }}
        onDragLeave={(e) => { e.preventDefault(); dragCounter.current--; if (dragCounter.current === 0) setIsDragging(false); }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); setIsDragging(false); dragCounter.current = 0; addFiles(e.dataTransfer.files); }}
        onClick={() => fileInputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            fileInputRef.current?.click();
          }
        }}
      >
        <div className="lab-portal__icon"><IconPortal /></div>
        <div className="lab-portal__content">
          <h2 className="lab-portal__title">Feed the Parser</h2>
          <p className="lab-portal__hint">Drop syllabus PDFs here to extract deadlines locally. Files stay in this browser.</p>
        </div>
        <div className="lab-portal__shimmer" />
        <input ref={fileInputRef} type="file" accept=".pdf" multiple style={{ display: "none" }} onChange={(e) => addFiles(e.target.files)} />
      </div>

      <section className="lab-inventory">
        <div className="lab-section-title">
          <IconSparkle />
          <h3>Inventory</h3>
        </div>

        {files.length === 0 ? (
          <div className="lab-empty">
            <p>No materials loaded in the lab environment.</p>
          </div>
        ) : (
          <div className="lab-list">
            {files.map(file => (
              <div key={file.id} className={`lab-card ${file.status === "parsing" ? "lab-card--parsing" : ""}`}>
                <div className="lab-card__main">
                  <div className="lab-card__identity">
                    <div className="lab-card__icon"><IconFile /></div>
                    <div className="lab-card__copy">
                      <div className="lab-card__name">{file.name}</div>
                      <div className="lab-card__meta">
                        {formatFileSize(file.size)} &middot; <StatusBadge status={file.status} />
                      </div>
                      {file.message && (
                        <div className="lab-card__message">{file.message}</div>
                      )}
                    </div>
                  </div>
                  
                  <div className="lab-card__actions">
                    {courses.length > 0 && file.status !== "error" && (
                      <select 
                        className="lab-card__select"
                        value={file.courseId || ""}
                        onChange={(e) => handleCourseMap(file.id, e.target.value)}
                      >
                        <option value="">Map to course...</option>
                        {courses.map(c => <option key={c.id} value={c.id}>{c.code || c.name}</option>)}
                      </select>
                    )}
                    
                    {(file.status === "ready" || file.status === "attention") && (
                      <button 
                        className={`lab-card__btn ${file.taskCount > 0 ? "lab-card__btn--active" : ""}`}
                        onClick={() => router.push(`/dashboard/review?file=${file.id}`)}
                      >
                        <IconReview /> {file.taskCount > 0 ? `Review (${file.taskCount})` : "View Data"}
                      </button>
                    )}
                    
                    <button className="lab-card__remove" aria-label={`Remove ${file.name}`} onClick={() => handleRemove(file.id)}>×</button>
                  </div>
                </div>
                {file.status === "parsing" && <div className="lab-card__progress-pulse" />}
              </div>
            ))}
          </div>
        )}
      </section>

      <footer className="lab-footer">
        <p>&copy; Sync Your Semester &middot; Local-first Intelligence</p>
        <div className="lab-capacity">
           <div className="lab-capacity__track">
              <div className="lab-capacity__fill" style={{ width: `${Math.min((files.length / MAX_DOCUMENTS) * 100, 100)}%` }} />
           </div>
           <span>{files.length} / {MAX_DOCUMENTS} documents</span>
        </div>
      </footer>
    </div>
  );
}
