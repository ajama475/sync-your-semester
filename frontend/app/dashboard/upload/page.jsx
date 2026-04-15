"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { parseSyllabus } from "../../../lib/parser/pdfParser";
import {
  deleteSyllabusRecord,
  listSyllabusRecords,
  patchSyllabusRecord,
  putSyllabusRecord,
} from "../../../lib/storage/syllabusStore";

const SETUP_STORAGE_KEY = "sys-semester-setup";

/* ---- Icons ---- */

function IconCloud() {
  return (
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--text-tertiary)" }}>
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}

function IconFile() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );
}

function IconSpark() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  );
}

function IconLink() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
    </svg>
  );
}

/* ---- Status labels ---- */

const STATUS_CONFIG = {
  uploading: { label: "Uploading", className: "tag tag--gray" },
  parsing: { label: "Parsing…", className: "tag tag--blue" },
  ready: { label: "Ready", className: "tag tag--green" },
  attention: { label: "Attention", className: "tag tag--orange" },
  error: { label: "Error", className: "tag tag--red" },
};

/* ---- Helpers ---- */

function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function truncateName(name, max = 28) {
  if (name.length <= max) return name;
  const ext = name.includes(".") ? name.slice(name.lastIndexOf(".")) : "";
  return name.slice(0, max - ext.length - 1) + "…" + ext;
}

function getSemesterSetup() {
  try {
    const raw = localStorage.getItem(SETUP_STORAGE_KEY);
    if (!raw) {
      return {
        courses: [],
        semester: {},
      };
    }

    const parsed = JSON.parse(raw);
    const startDateISO = parsed?.semesterDates?.startDate || undefined;
    const endDateISO = parsed?.semesterDates?.endDate || undefined;

    return {
      courses: Array.isArray(parsed?.courses) ? parsed.courses : [],
      semester: {
        startDateISO,
        endDateISO,
        defaultYear: startDateISO ? Number(startDateISO.slice(0, 4)) : undefined,
      },
    };
  } catch {
    return {
      courses: [],
      semester: {},
    };
  }
}

function createUploadId() {
  return `file-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function summarizeRecord(record) {
  return {
    id: record.id,
    name: record.name,
    size: record.size,
    status: record.status,
    courseId: record.courseId || "",
    message: record.message || null,
    taskCount: record.reviewItems?.length ?? 0,
  };
}

function sanitizeParseResult(parsed) {
  return {
    pages: parsed.pages,
    warnings: parsed.warnings,
    hasExtractableText: parsed.hasExtractableText,
    metadata: parsed.metadata,
  };
}

function buildReviewItems(parsed) {
  return parsed.tasks.map((task) => ({
    id: task.id,
    title: task.title,
    type: task.type,
    dueDateRaw: task.dueDateISO,
    confidence: task.confidence,
    extraction: "automatic",
    snippet: task.sourceText,
    highlightedTerms: Array.from(new Set([task.title, task.matchedDateText].filter(Boolean))),
    detectionId: task.id.slice(-6),
    sourcePage: task.pageNumber,
    sourceBounds: task.sourceBounds,
    sourceIndexStart: task.sourceIndexStart,
    sourceIndexEnd: task.sourceIndexEnd,
    matchedDateText: task.matchedDateText,
    matchedKeywords: task.matchedKeywords,
    sectionHint: task.sectionHint,
    reasons: task.reasons,
    status: "pending",
  }));
}

function getRecordOutcome(parsed, reviewItems) {
  if (!parsed.hasExtractableText) {
    return {
      status: "attention",
      message: "This PDF does not contain selectable text. Review may require manual cleanup.",
    };
  }

  if (reviewItems.length === 0) {
    return {
      status: "attention",
      message: "No strong deadline candidates were found. This syllabus likely needs manual review.",
    };
  }

  if (parsed.warnings.length > 0) {
    return {
      status: "ready",
      message: parsed.warnings[0].message,
    };
  }

  return {
    status: "ready",
    message: null,
  };
}

function courseOptionLabel(course) {
  if (course.code && course.name) return `${course.code}: ${course.name}`;
  return course.code || course.name || "Untitled course";
}

/* ---- Upload Page ---- */

export default function UploadPage() {
  const router = useRouter();
  const [files, setFiles] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const [courses, setCourses] = useState([]);
  const [semester, setSemester] = useState({});
  const fileInputRef = useRef(null);
  const dragCounter = useRef(0);

  useEffect(() => {
    const setup = getSemesterSetup();
    setCourses(setup.courses);
    setSemester(setup.semester);

    let isMounted = true;

    listSyllabusRecords()
      .then((records) => {
        if (!isMounted) return;
        setFiles(records.map(summarizeRecord));
      })
      .catch((error) => {
        console.error("Failed to load saved syllabi.", error);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const updateFileSummary = useCallback((fileId, updater) => {
    setFiles((prev) =>
      prev.map((file) => (file.id === fileId ? { ...file, ...updater(file) } : file))
    );
  }, []);

  const processUploadedFile = useCallback(
    async (file, fileId) => {
      const baseRecord = {
        id: fileId,
        name: file.name,
        size: file.size,
        status: "uploading",
        courseId: "",
        message: null,
        fileBlob: file,
        parseResult: null,
        reviewItems: [],
        createdAt: Date.now(),
      };

      try {
        await putSyllabusRecord(baseRecord);

        updateFileSummary(fileId, () => ({
          status: "parsing",
          message: null,
        }));

        await patchSyllabusRecord(fileId, (record) => ({
          ...record,
          status: "parsing",
          message: null,
        }));

        const parsed = await parseSyllabus(file, {
          semester,
          minConfidence: 52,
        });
        const reviewItems = buildReviewItems(parsed);
        const outcome = getRecordOutcome(parsed, reviewItems);

        const nextRecord = await patchSyllabusRecord(fileId, (record) => ({
          ...record,
          status: outcome.status,
          message: outcome.message,
          parseResult: sanitizeParseResult(parsed),
          reviewItems,
        }));

        updateFileSummary(fileId, () => summarizeRecord(nextRecord));
      } catch (error) {
        console.error("Failed to parse syllabus.", error);

        await patchSyllabusRecord(fileId, (record) => ({
          ...record,
          status: "error",
          message: "We couldn't read this PDF. Try another file or a cleaner export.",
        })).catch(() => {});

        updateFileSummary(fileId, () => ({
          status: "error",
          message: "We couldn't read this PDF. Try another file or a cleaner export.",
        }));
      }
    },
    [semester, updateFileSummary]
  );

  const addFiles = useCallback(
    (fileList) => {
      const existingKeys = new Set(files.map((file) => `${file.name}-${file.size}`));
      const acceptedFiles = Array.from(fileList).filter((file) => {
        const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
        const isDuplicate = existingKeys.has(`${file.name}-${file.size}`);
        return isPdf && !isDuplicate;
      });

      if (acceptedFiles.length === 0) return;

      const nextFiles = acceptedFiles.map((file) => ({
        id: createUploadId(),
        name: file.name,
        size: file.size,
        status: "uploading",
        courseId: "",
        message: null,
        taskCount: 0,
      }));

      setFiles((prev) => [...nextFiles, ...prev]);
      nextFiles.forEach((nextFile, index) => {
        void processUploadedFile(acceptedFiles[index], nextFile.id);
      });
    },
    [files, processUploadedFile]
  );

  function handleDragEnter(event) {
    event.preventDefault();
    event.stopPropagation();
    dragCounter.current += 1;
    setIsDragging(true);
  }

  function handleDragLeave(event) {
    event.preventDefault();
    event.stopPropagation();
    dragCounter.current -= 1;
    if (dragCounter.current === 0) {
      setIsDragging(false);
    }
  }

  function handleDragOver(event) {
    event.preventDefault();
    event.stopPropagation();
  }

  function handleDrop(event) {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
    dragCounter.current = 0;

    if (event.dataTransfer.files.length > 0) {
      addFiles(event.dataTransfer.files);
    }
  }

  function handleBrowse() {
    fileInputRef.current?.click();
  }

  function handleFileInput(event) {
    if (event.target.files.length > 0) {
      addFiles(event.target.files);
    }

    event.target.value = "";
  }

  async function handleCourseMap(fileId, courseId) {
    updateFileSummary(fileId, () => ({ courseId }));

    try {
      await patchSyllabusRecord(fileId, (record) => ({
        ...record,
        courseId,
      }));
    } catch (error) {
      console.error("Failed to update course mapping.", error);
    }
  }

  async function handleRemoveFile(fileId) {
    setFiles((prev) => prev.filter((file) => file.id !== fileId));

    try {
      await deleteSyllabusRecord(fileId);
    } catch (error) {
      console.error("Failed to remove syllabus.", error);
    }
  }

  function handleReview(fileId) {
    router.push(`/dashboard/review?file=${fileId}`);
  }

  return (
    <>
      <header className="page-header">
        <h1 className="page-title">Upload Syllabus</h1>
      </header>

      <div className="upload-layout">
        <div className="upload-main">
          <div
            className={`upload-dropzone${isDragging ? " upload-dropzone--active" : ""}`}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
          >
            <div className="upload-dropzone__icon">
              <IconCloud />
            </div>
            <p className="upload-dropzone__title">Drop your syllabus PDFs here</p>
            <p className="upload-dropzone__hint">
              Files are parsed locally in your browser, then saved on this device for review.
            </p>
            <button className="btn-primary" type="button" onClick={handleBrowse}>
              Browse files
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,application/pdf"
              multiple
              style={{ display: "none" }}
              onChange={handleFileInput}
            />
          </div>

          <div className="upload-features">
            <div className="upload-feature-card">
              <span className="upload-feature-card__icon">
                <IconSpark />
              </span>
              <div>
                <p className="upload-feature-card__title">Local parser, not black-box AI</p>
                <p className="upload-feature-card__desc">
                  Dates are extracted with explicit heuristics so you can inspect the source and understand why something was surfaced.
                </p>
              </div>
            </div>

            <div className="upload-feature-card">
              <span className="upload-feature-card__icon">
                <IconLink />
              </span>
              <div>
                <p className="upload-feature-card__title">Source-linked review</p>
                <p className="upload-feature-card__desc">
                  Every candidate task carries its original page, snippet, and highlight bounds into the review screen.
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="upload-panel">
          <div className="upload-panel__section">
            <h3 className="upload-panel__heading">Uploaded files</h3>

            {files.length === 0 ? (
              <p className="upload-panel__empty">
                No files uploaded yet. Drop a syllabus PDF or click Browse.
              </p>
            ) : (
              <div className="upload-file-list">
                {files.map((file) => (
                  <div key={file.id} className="upload-file-item">
                    <div className="upload-file-item__top">
                      <span className="upload-file-item__icon">
                        <IconFile />
                      </span>
                      <span className="upload-file-item__name" title={file.name}>
                        {truncateName(file.name)}
                      </span>
                      <span className={STATUS_CONFIG[file.status]?.className}>
                        {STATUS_CONFIG[file.status]?.label}
                      </span>
                    </div>

                    <div className="upload-file-item__meta">
                      <span className="upload-file-item__size">{formatFileSize(file.size)}</span>
                      {file.taskCount > 0 && (
                        <span className="upload-file-item__size">{file.taskCount} candidate{file.taskCount !== 1 ? "s" : ""}</span>
                      )}
                    </div>

                    {(file.status === "ready" || file.status === "attention") && (
                      <div className="upload-file-item__mapping">
                        {courses.length > 0 && (
                          <>
                            <label className="upload-file-item__mapping-label">Map to course</label>
                            <select
                              className="upload-file-item__select"
                              value={file.courseId}
                              onChange={(event) => handleCourseMap(file.id, event.target.value)}
                            >
                              <option value="">Select course…</option>
                              {courses.map((course) => (
                                <option key={course.id} value={course.id}>
                                  {courseOptionLabel(course)}
                                </option>
                              ))}
                            </select>
                          </>
                        )}
                        <button className="btn-ghost upload-file-item__action" type="button" onClick={() => handleReview(file.id)}>
                          Review extracted data →
                        </button>
                      </div>
                    )}

                    {file.message && (
                      <div className="upload-file-item__warning">
                        <p className="upload-file-item__warning-text">{file.message}</p>
                        {file.status === "attention" && (
                          <button
                            className="btn-ghost upload-file-item__action upload-file-item__action--warn"
                            type="button"
                            onClick={() => handleReview(file.id)}
                          >
                            Open review
                          </button>
                        )}
                      </div>
                    )}

                    <button
                      className="upload-file-item__remove"
                      type="button"
                      onClick={() => handleRemoveFile(file.id)}
                      aria-label={`Remove ${file.name}`}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="upload-panel__section">
            <h3 className="upload-panel__heading">Storage</h3>
            <div className="upload-capacity">
              <div className="upload-capacity__numbers">
                <span className="upload-capacity__current">{files.length}</span>
                <span className="upload-capacity__max">/ 50 documents</span>
              </div>
              <div className="upload-capacity__bar">
                <div
                  className="upload-capacity__fill"
                  style={{ width: `${Math.min((files.length / 50) * 100, 100)}%` }}
                />
              </div>
              <p className="upload-capacity__note">
                PDFs, extracted tasks, and review state stay in local browser storage.
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
