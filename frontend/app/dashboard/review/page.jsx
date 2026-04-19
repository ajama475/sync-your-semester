"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { loadPdfDocument } from "../../../lib/pdf/loadPdfDocument";
import {
  listSyllabusRecords,
  patchSyllabusRecord,
} from "../../../lib/storage/syllabusStore";
import { generateMilestones, readSetup, courseLabel, extractCourseCode } from "../../../lib/tasks/taskHelpers";

const SETUP_STORAGE_KEY = "sys-semester-setup";

/* ---- Icons ---- */

function IconCalendar() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

function IconCheck() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function IconX() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function IconEdit() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

function IconChevron({ direction = "right" }) {
  const rotation = direction === "left" ? "rotate(180deg)" : undefined;

  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: rotation }}>
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

function IconZoomIn() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
      <line x1="11" y1="8" x2="11" y2="14" />
      <line x1="8" y1="11" x2="14" y2="11" />
    </svg>
  );
}

function IconZoomOut() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
      <line x1="8" y1="11" x2="14" y2="11" />
    </svg>
  );
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

/* ---- Helpers ---- */

function confidenceClass(score) {
  if (score >= 90) return "tag tag--green";
  if (score >= 75) return "tag tag--yellow";
  return "tag tag--orange";
}

function confidenceDetails(score = 0, extraction = "") {
  if (extraction === "manual") {
    return {
      label: "Manual",
      tone: "high",
      note: "Created from a user-selected PDF region.",
    };
  }

  if (score >= 90) {
    return {
      label: "High",
      tone: "high",
      note: "Strong date, task, and source signals.",
    };
  }

  if (score >= 75) {
    return {
      label: "Medium",
      tone: "medium",
      note: "Good candidate, but worth checking against the PDF.",
    };
  }

  return {
    label: "Needs review",
    tone: "low",
    note: "Approve only after the highlighted source matches the task.",
  };
}

function confidenceLabel(score, extraction) {
  return confidenceDetails(score, extraction).label;
}

function formatDueDate(dateString) {
  if (!dateString) return "";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(`${dateString}T00:00:00`));
}

function stripExtension(filename) {
  return filename.replace(/\.[^/.]+$/, "");
}
function readSetupCourses() {
  try {
    const raw = localStorage.getItem(SETUP_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed?.courses) ? parsed.courses : [];
  } catch {
    return [];
  }
}

function itemStatusText(status) {
  if (status === "approved") return "Approved";
  if (status === "rejected") return "Rejected";
  return "Automatic extraction";
}

function sectionHintLabel(sectionHint) {
  const labels = {
    important_dates: "Important dates",
    schedule: "Schedule",
    assignments: "Assignments",
    assessment: "Assessment",
    policy: "Policy",
    neutral: "General text",
  };

  return labels[sectionHint] || "General text";
}

function uniqueCompactList(values, limit = 4) {
  const unique = Array.from(new Set(values.filter(Boolean)));
  if (unique.length <= limit) return unique;
  return [...unique.slice(0, limit), `+${unique.length - limit} more`];
}

function warningsForItem(record, item) {
  const warnings = record?.parseResult?.warnings || [];
  const sourcePage = item?.sourcePage || item?.pageNumber;
  return warnings.filter((warning) => !warning.pageNumber || warning.pageNumber === sourcePage);
}

/**
 * Produces short, student-facing verification guidance from parser metadata.
 * The goal is trust calibration: tell the student what deserves attention
 * without forcing them to understand the parser's scoring internals.
 */
function buildVerificationAdvice(item, record) {
  if (!item) return "";

  const warnings = warningsForItem(record, item);
  const negativeReasons = (item.reasons || []).filter((reason) => reason.impact === "negative");
  const dateReason = negativeReasons.find((reason) => reason.code === "multiple_dates" || reason.code === "outside_semester");
  const titleReason = negativeReasons.find((reason) => reason.code === "weak_title" || reason.code === "low_signal_title");

  if (warnings.length > 0) {
    return "This PDF page had extraction warnings. Check the highlighted source before approving.";
  }

  if (dateReason) {
    return "Check that the highlighted date is the actual due date, not a policy or schedule reference.";
  }

  if (titleReason) {
    return "Check the title. The parser may have captured too little context from the source line.";
  }

  if ((item.confidence || 0) < 75) {
    return "Compare the title and due date with the PDF before sending this to Task Ledger.";
  }

  return "Confirm the highlighted source matches the title and due date, then approve.";
}

function updateNestedItem(items, itemId, updater) {
  return items.map((item) => (item.id === itemId ? updater(item) : item));
}

function DifficultyDots({ value = 0, onChange = null }) {
  const numericValue = Number(value) || 0;
  const interactive = typeof onChange === "function";

  return (
    <span className={`dots${interactive ? " dots--input" : ""}`} aria-label={`Difficulty ${numericValue} of 5`}>
      {[1, 2, 3, 4, 5].map((dot) => {
        const className = `dots__dot${interactive ? " dots__dot--clickable" : ""}${dot <= numericValue ? " dots__dot--filled" : ""}`;

        if (!interactive) {
          return <span key={dot} className={className} />;
        }

        return (
          <button
            key={dot}
            type="button"
            className={className}
            aria-label={`Set difficulty to ${dot}`}
            onClick={(event) => {
              event.stopPropagation();
              onChange(dot === numericValue ? 0 : dot);
            }}
          />
        );
      })}
    </span>
  );
}

function buildConflictGroups(items) {
  const groupsByDate = new Map();

  for (const item of items) {
    if (!item.dueDateRaw || (item.difficulty ?? 0) <= 4) continue;
    if (item.status === "rejected" || item.status === "done") continue;

    const existing = groupsByDate.get(item.dueDateRaw) || [];
    existing.push(item);
    groupsByDate.set(item.dueDateRaw, existing);
  }

  return [...groupsByDate.entries()]
    .map(([date, groupItems]) => ({
      date,
      items: groupItems,
      recordCount: new Set(groupItems.map((item) => item.recordId)).size,
    }))
    .filter((group) => group.items.length >= 2 && group.recordCount >= 2)
    .sort((first, second) => first.date.localeCompare(second.date));
}

function ConflictWarnings({ groups, onSelect }) {
  if (groups.length === 0) return null;

  return (
    <section className="review-conflicts" aria-label="Major deadline conflicts">
      <div className="review-conflicts__header">
        <span className="review-conflicts__icon"><IconAlert /></span>
        <div>
          <h3 className="review-conflicts__title">Major deadline conflict</h3>
          <p className="review-conflicts__count">
            {groups.length} same-day cluster{groups.length !== 1 ? "s" : ""}
          </p>
        </div>
      </div>

      <div className="review-conflicts__list">
        {groups.map((group) => (
          <div key={group.date} className="review-conflict">
            <div className="review-conflict__date">{formatDueDate(group.date)}</div>
            <div className="review-conflict__items">
              {group.items.slice(0, 3).map((item) => (
                <button
                  key={item.clientId}
                  type="button"
                  className="review-conflict__item"
                  onClick={() => onSelect(item.clientId)}
                >
                  <span className="review-conflict__course">{item.course}</span>
                  <span className="review-conflict__title">{item.title}</span>
                </button>
              ))}
              {group.items.length > 3 && (
                <span className="review-conflict__more">+{group.items.length - 3} more</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function ReviewTrustSummary({ items, records }) {
  const pending = items.filter((item) => item.status === "pending");
  const averageConfidence = pending.length === 0
    ? 0
    : Math.round(pending.reduce((total, item) => total + (Number(item.confidence) || 0), 0) / pending.length);
  const needsReview = pending.filter((item) => (Number(item.confidence) || 0) < 75).length;
  const warningCount = records.reduce((total, record) => total + (record.parseResult?.warnings?.length || 0), 0);

  return (
    <section className="review-trust-summary" aria-label="Parser review summary">
      <div className="review-trust-summary__item">
        <span>Average confidence</span>
        <strong>{averageConfidence || "--"}%</strong>
      </div>
      <div className="review-trust-summary__item">
        <span>Needs care</span>
        <strong>{needsReview}</strong>
      </div>
      <div className="review-trust-summary__item">
        <span>PDF warnings</span>
        <strong>{warningCount}</strong>
      </div>
    </section>
  );
}

function EvidencePanel({ item, record }) {
  const details = confidenceDetails(item.confidence || 0, item.extraction);
  const reasons = item.reasons || [];
  const positiveReasons = reasons.filter((reason) => reason.impact === "positive");
  const cautionReasons = reasons.filter((reason) => reason.impact === "negative");
  const neutralReasons = reasons.filter((reason) => reason.impact === "neutral");
  const warningMessages = warningsForItem(record, item).map((warning) => warning.message);
  const matchedCues = uniqueCompactList([item.matchedDateText, ...(item.matchedKeywords || [])]);
  const advice = buildVerificationAdvice(item, record);

  return (
    <div className="review-evidence" aria-label="Parser evidence">
      <div className={`review-evidence__confidence review-evidence__confidence--${details.tone}`}>
        <div>
          <span className="review-evidence__eyebrow">Parser confidence</span>
          <strong>{details.label}</strong>
          <p>{details.note}</p>
        </div>
        <div className="review-evidence__score">
          <span>{item.confidence || 0}%</span>
          <div className="review-evidence__meter" aria-hidden="true">
            <div style={{ width: `${Math.max(0, Math.min(item.confidence || 0, 100))}%` }} />
          </div>
        </div>
      </div>

      <div className="review-evidence__grid">
        <div>
          <span>Matched date</span>
          <strong>{item.matchedDateText || "Not stored"}</strong>
        </div>
        <div>
          <span>Source section</span>
          <strong>{sectionHintLabel(item.sectionHint)}</strong>
        </div>
        <div>
          <span>Page</span>
          <strong>{item.sourcePage || item.pageNumber || "?"}</strong>
        </div>
      </div>

      {matchedCues.length > 0 && (
        <div className="review-evidence__chips" aria-label="Matched parser cues">
          {matchedCues.map((cue) => (
            <span key={`${item.clientId}-${cue}`}>{cue}</span>
          ))}
        </div>
      )}

      <div className="review-evidence__advice">
        <span>What to verify</span>
        <p>{advice}</p>
      </div>

      {(positiveReasons.length > 0 || cautionReasons.length > 0 || neutralReasons.length > 0 || warningMessages.length > 0) && (
        <div className="review-evidence__reasons">
          {warningMessages.map((message) => (
            <span key={`${item.clientId}-${message}`} className="review-evidence__reason review-evidence__reason--warning">
              {message}
            </span>
          ))}
          {cautionReasons.slice(0, 3).map((reason) => (
            <span key={`${item.clientId}-${reason.code}`} className="review-evidence__reason review-evidence__reason--negative">
              {reason.detail}
            </span>
          ))}
          {positiveReasons.slice(0, 4).map((reason) => (
            <span key={`${item.clientId}-${reason.code}`} className="review-evidence__reason review-evidence__reason--positive">
              {reason.detail}
            </span>
          ))}
          {neutralReasons.slice(0, 1).map((reason) => (
            <span key={`${item.clientId}-${reason.code}`} className="review-evidence__reason review-evidence__reason--neutral">
              {reason.detail}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---- Render snippet with highlights ---- */

function SnippetText({ text, terms }) {
  if (!terms || terms.length === 0) return <span>{text}</span>;

  const escapedTerms = terms
    .filter(Boolean)
    .map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));

  if (escapedTerms.length === 0) return <span>{text}</span>;

  const regex = new RegExp(`(${escapedTerms.join("|")})`, "gi");
  const parts = text.split(regex);

  return (
    <>
      {parts.map((part, index) => {
        const isHighlight = terms.some((term) => term.toLowerCase() === part.toLowerCase());
        return isHighlight ? (
          <mark key={index} className="review-highlight">
            {part}
          </mark>
        ) : (
          <span key={index}>{part}</span>
        );
      })}
    </>
  );
}

/* ---- PDF viewer ---- */
// This component displays the original PDF page to give the user context for the extracted deadline.
// It uses pdf.js to render a canvas and overlays a highlight box over the exact source bounds.

function PdfViewer({ record, selectedItem, currentPage, zoom, onCreateSnipTask }) {
  const containerRef = useRef(null);
  const scrollContainerRef = useRef(null);
  const canvasRef = useRef(null);
  const pdfCacheRef = useRef(new Map());
  const renderTaskRef = useRef(null);
  const [renderState, setRenderState] = useState({
    loading: false,
    error: null,
    width: 0,
    height: 0,
  });

  const [snipStart, setSnipStart] = useState(null);
  const [snipCurrent, setSnipCurrent] = useState(null);
  const [snipFinal, setSnipFinal] = useState(null);

  // Clear snip if page or record changes
  useEffect(() => {
    setSnipStart(null);
    setSnipCurrent(null);
    setSnipFinal(null);
  }, [record, currentPage]);

  const currentPageData = useMemo(
    () => record?.parseResult?.pages?.find((page) => page.pageNumber === currentPage) ?? null,
    [record, currentPage]
  );

  useEffect(() => {
    let didCancel = false;

    async function renderPage() {
      // Cancel any in-flight render before starting a new one
      if (renderTaskRef.current) {
        try { renderTaskRef.current.cancel(); } catch {}
        renderTaskRef.current = null;
      }

      if (!record?.fileBlob || !canvasRef.current) {
        setRenderState((prev) => ({ ...prev, loading: false }));
        return;
      }

      setRenderState((prev) => ({ ...prev, loading: true, error: null }));

      try {
        let pdfDocument = pdfCacheRef.current.get(record.id);

        // Fetch and load the PDF document if it isn't already cached.
        if (!pdfDocument) {
          pdfDocument = await loadPdfDocument(record.fileBlob);
          if (didCancel) return;
          pdfCacheRef.current.set(record.id, pdfDocument);
        }

        if (didCancel) return;

        const pdfPage = await pdfDocument.getPage(currentPage);
        if (didCancel) return;

        const viewport = pdfPage.getViewport({ scale: zoom });
        const canvas = canvasRef.current;
        if (!canvas || didCancel) return;

        const context = canvas.getContext("2d");

        canvas.width = viewport.width;
        canvas.height = viewport.height;
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;

        const renderTask = pdfPage.render({
          canvasContext: context,
          viewport,
        });

        renderTaskRef.current = renderTask;

        await renderTask.promise;
        renderTaskRef.current = null;

        if (didCancel) return;

        setRenderState({
          loading: false,
          error: null,
          width: viewport.width,
          height: viewport.height,
        });
      } catch (error) {
        renderTaskRef.current = null;

        // RenderingCancelledException is expected when we cancel — ignore it silently
        if (error?.name === "RenderingCancelledException" || didCancel) return;

        console.error("Failed to render review page.", error);

        setRenderState((prev) => ({
          ...prev,
          loading: false,
          error: "The PDF page could not be rendered. The parsed source is still shown below.",
        }));
      }
    }

    void renderPage();

    return () => {
      didCancel = true;
      // Cancel any in-flight render on cleanup
      if (renderTaskRef.current) {
        try { renderTaskRef.current.cancel(); } catch {}
        renderTaskRef.current = null;
      }
    };
  }, [record, currentPage, zoom]);

  const highlight =
    selectedItem && currentPage === (selectedItem.sourcePage || selectedItem.pageNumber || 1)
      ? selectedItem.sourceBounds
      : null;

  // Auto-scroll to highlight
  useEffect(() => {
    if (!renderState.loading && highlight && scrollContainerRef.current) {
      // Small delay to ensure canvas layout has settled
      setTimeout(() => {
        if (!scrollContainerRef.current) return;
        const container = scrollContainerRef.current;
        const targetY = (highlight.top * zoom) - (container.clientHeight / 2) + (highlight.height * zoom / 2);
        
        container.scrollTo({
          top: Math.max(0, targetY),
          behavior: "smooth"
        });
      }, 50);
    }
  }, [highlight, renderState.loading, zoom]);

  const frameWidth = renderState.width || (currentPageData ? currentPageData.width * zoom : 0);
  const frameHeight = renderState.height || (currentPageData ? currentPageData.height * zoom : 0);

  function handleMouseDown(e) {
    if (!containerRef.current || e.target.closest(".review-pdf__snip-btn")) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setSnipFinal(null);
    setSnipStart({ x, y });
    setSnipCurrent({ x, y });
  }

  function handleMouseMove(e) {
    if (!snipStart || !containerRef.current || snipFinal) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const y = Math.max(0, Math.min(e.clientY - rect.top, rect.height));
    setSnipCurrent({ x, y });
  }

  function handleMouseUp() {
    if (!snipStart || !snipCurrent || snipFinal) return;
    
    // Require a minimum drag distance to prevent accidental drops
    const w = Math.abs(snipCurrent.x - snipStart.x);
    const h = Math.abs(snipCurrent.y - snipStart.y);
    if (w < 10 || h < 10) {
      setSnipStart(null);
      setSnipCurrent(null);
      return;
    }
    
    setSnipFinal({
      x: Math.min(snipStart.x, snipCurrent.x),
      y: Math.min(snipStart.y, snipCurrent.y),
      w,
      h,
    });
  }

  function handleConfirmSnip() {
    if (!snipFinal) return;
    onCreateSnipTask({
      left: snipFinal.x / zoom,
      top: snipFinal.y / zoom,
      width: snipFinal.w / zoom,
      height: snipFinal.h / zoom,
    });
    setSnipStart(null);
    setSnipCurrent(null);
    setSnipFinal(null);
  }

  // Determine what snip region to draw (either during drag or final)
  let activeSnip = null;
  if (snipFinal) {
    activeSnip = snipFinal;
  } else if (snipStart && snipCurrent) {
    activeSnip = {
      x: Math.min(snipStart.x, snipCurrent.x),
      y: Math.min(snipStart.y, snipCurrent.y),
      w: Math.abs(snipCurrent.x - snipStart.x),
      h: Math.abs(snipCurrent.y - snipStart.y),
    };
  }

  return (
    <div className="review-pdf__canvas" ref={scrollContainerRef}>
      {!record ? (
        <div className="review-pdf__empty">
          <p>Select an item from the review queue to see its source.</p>
        </div>
      ) : (
        <div
          ref={containerRef}
          className="review-pdf__page-frame"
          style={{
            width: frameWidth || undefined,
            minHeight: frameHeight || undefined,
            cursor: "crosshair"
          }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          <canvas ref={canvasRef} className="review-pdf__canvas-element" />

          {highlight && (
            <div
              className="review-pdf__highlight-box"
              style={{
                left: `${highlight.left * zoom}px`,
                top: `${highlight.top * zoom}px`,
                width: `${highlight.width * zoom}px`,
                height: `${Math.max(highlight.height * zoom, 18)}px`,
              }}
            />
          )}

          {activeSnip && (
            <div
              className={`review-pdf__highlight-box review-pdf__highlight-box--snip${snipFinal ? " review-pdf__highlight-box--snip-final" : ""}`}
              style={{
                left: `${activeSnip.x}px`,
                top: `${activeSnip.y}px`,
                width: `${activeSnip.w}px`,
                height: `${activeSnip.h}px`,
              }}
            >
              {snipFinal && (
                <button 
                  className="btn-primary review-pdf__snip-btn"
                  onClick={handleConfirmSnip}
                >
                  Create task from selection
                </button>
              )}
            </div>
          )}

          {renderState.loading && (
            <div className="review-pdf__loading">Rendering page…</div>
          )}
        </div>
      )}

      {renderState.error && (
        <div className="review-pdf__render-error">{renderState.error}</div>
      )}

      {currentPageData && (
        <div className="review-pdf__source-lines">
          <div className="review-pdf__source-lines-label">Parsed source lines on this page</div>
          <div className="review-pdf__source-lines-list">
            {currentPageData.lines.map((line) => {
              const isSelectedLine =
                selectedItem &&
                currentPage === (selectedItem.sourcePage || selectedItem.pageNumber || 1) &&
                line.indexStart < selectedItem.sourceIndexEnd &&
                line.indexEnd > selectedItem.sourceIndexStart;

              return (
                <div
                  key={`${line.pageNumber}-${line.indexStart}`}
                  className={`review-pdf__source-line${isSelectedLine ? " review-pdf__source-line--selected" : ""}`}
                >
                  <SnippetText text={line.text} terms={isSelectedLine ? selectedItem.highlightedTerms || [] : []} />
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/* ---- Page ---- */
// The main review interface where students approve or reject the tasks the parser found.
// It manages the queue of pending tasks and controls what page the PDF viewer is on.

function ReviewPageContent() {
  const searchParams = useSearchParams();
  const requestedFileId = searchParams.get("file");

  // State for raw data from our stores
  const [records, setRecords] = useState([]);
  const [courses, setCourses] = useState([]);
  // UI State: track what is selected, what is being edited, and the view layer zoom/page
  const [selectedId, setSelectedId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState({ title: "", dueDate: "", difficulty: 0 });
  const [currentPage, setCurrentPage] = useState(1);
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    let isMounted = true;

    setCourses(readSetupCourses());

    listSyllabusRecords()
      .then((nextRecords) => {
        if (!isMounted) return;
        setRecords(nextRecords.filter((record) => Array.isArray(record.reviewItems) && record.reviewItems.length > 0));
      })
      .catch((error) => {
        console.error("Failed to load review queue.", error);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  // Flatten the review items from all records into a single queue.
  const items = useMemo(
    () =>
      records.flatMap((record) =>
        record.reviewItems.map((item) => ({
          ...item,
          clientId: `${record.id}:${item.id}`,
          recordId: record.id,
          course: courseLabel(record.courseId, courses, record.name),
          sourceFile: record.name,
          totalPages: record.parseResult?.metadata?.pages ?? record.parseResult?.pages?.length ?? 1,
        }))
      ),
    [records, courses]
  );

  const pendingItems = useMemo(
    () => items.filter((item) => item.status === "pending"),
    [items]
  );

  const conflictGroups = useMemo(
    () => buildConflictGroups(items),
    [items]
  );

  const selected = useMemo(
    () => items.find((item) => item.clientId === selectedId) ?? null,
    [items, selectedId]
  );

  const selectedRecord = useMemo(
    () => records.find((record) => record.id === selected?.recordId) ?? null,
    [records, selected]
  );

  const selectedIndex = useMemo(
    () => pendingItems.findIndex((item) => item.clientId === selectedId),
    [pendingItems, selectedId]
  );

  useEffect(() => {
    if (selected && items.some((item) => item.clientId === selected.clientId && item.status === "pending")) {
      return;
    }

    const preferredItems = requestedFileId
      ? pendingItems.filter((item) => item.recordId === requestedFileId)
      : [];
    const nextSelected = preferredItems[0] ?? pendingItems[0] ?? items[0] ?? null;

    setSelectedId(nextSelected?.clientId ?? null);
  }, [items, pendingItems, requestedFileId, selected]);

  // Whenever the active item changes, jump the PDF to the page where that task was found.
  useEffect(() => {
    if (!selected) return;
    setCurrentPage(selected.sourcePage || selected.pageNumber || 1);
    setZoom(1);
  }, [selected]);

  const handleCreateSnipTask = useCallback(async (bounds) => {
    if (!selectedRecord) return;
    
    const newItem = {
      id: `snip-${Date.now()}`,
      title: "Manual Extraction",
      type: "other",
      dueDateRaw: null,
      difficulty: null,
      confidence: 100,
      extraction: "manual",
      snippet: "", // Text extraction requires PDF.js text layer mapping, we skip it for snips.
      highlightedTerms: [],
      detectionId: `m-${Date.now().toString().slice(-4)}`,
      sourcePage: currentPage,
      sourceBounds: bounds,
      sourceIndexStart: 0,
      sourceIndexEnd: 0,
      matchedDateText: "",
      matchedKeywords: [],
      sectionHint: "neutral",
      reasons: [{ impact: "positive", code: "manual_selection", detail: "Task generated by user snippet selection." }],
      status: "pending",
    };

    setRecords((prev) =>
      prev.map((r) => r.id === selectedRecord.id ? { ...r, reviewItems: [...(r.reviewItems || []), newItem] } : r)
    );

    try {
      await patchSyllabusRecord(selectedRecord.id, (r) => ({
        ...r,
        reviewItems: [...(r.reviewItems || []), newItem],
      }));
      // Automatically select and edit the newly created item
      setSelectedId(`${selectedRecord.id}:${newItem.id}`);
      setEditingId(`${selectedRecord.id}:${newItem.id}`);
      setEditDraft({ title: newItem.title, dueDate: "", difficulty: 0 });
    } catch (e) {
      console.error("Failed to add manual snip task.", e);
    }
  }, [selectedRecord, currentPage]);

  const updateReviewItem = useCallback(async (recordId, itemId, updater) => {
    setRecords((prev) =>
      prev.map((record) =>
        record.id === recordId
          ? {
              ...record,
              reviewItems: updateNestedItem(record.reviewItems, itemId, updater),
            }
          : record
      )
    );

    try {
      await patchSyllabusRecord(recordId, (record) => ({
        ...record,
        reviewItems: updateNestedItem(record.reviewItems, itemId, updater),
      }));
    } catch (error) {
      console.error("Failed to persist review item changes.", error);
    }
  }, []);

  const handleApprove = useCallback(
    (item) => {
      void updateReviewItem(item.recordId, item.id, (current) => {
        const { semester } = readSetup();
        const { milestones, startByDate } = generateMilestones({
          type: current.type,
          dueDate: current.dueDateRaw,
          difficulty: current.difficulty,
        }, semester?.startDate);
        return {
          ...current,
          status: "approved",
          milestones: milestones.length > 0 ? milestones : null,
          startByDate: startByDate,
        };
      });
    },
    [updateReviewItem]
  );

  const handleReject = useCallback(
    (item) => {
      void updateReviewItem(item.recordId, item.id, (current) => ({
        ...current,
        status: "rejected",
      }));
    },
    [updateReviewItem]
  );

  const handleStartEdit = useCallback((item) => {
    setEditingId(item.clientId);
    setEditDraft({
      title: item.title,
      dueDate: item.dueDateRaw,
      difficulty: item.difficulty ?? 0,
    });
  }, []);

  const handleSaveEdit = useCallback(
    (item) => {
      void updateReviewItem(item.recordId, item.id, (current) => ({
        ...current,
        title: editDraft.title || current.title,
        dueDateRaw: editDraft.dueDate || current.dueDateRaw,
        difficulty: editDraft.difficulty || null,
      }));
      setEditingId(null);
    },
    [editDraft, updateReviewItem]
  );

  const handleNav = useCallback(
    (direction) => {
      const nextIndex = selectedIndex + direction;
      if (nextIndex >= 0 && nextIndex < pendingItems.length) {
        setSelectedId(pendingItems[nextIndex].clientId);
      }
    },
    [pendingItems, selectedIndex]
  );

  const reviewedCount = items.length - pendingItems.length;

  if (items.length === 0) {
    return (
      <div className="review-layout">
        <div className="review-queue review-queue--empty">
          <div className="review-queue__done">
            <p className="review-queue__done-text">No parsed syllabus items are ready for review yet.</p>
            <Link href="/dashboard/sources" className="btn-primary">
              Go to Syllabus Lab
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="review-layout">
      <div className="review-pdf">
        <div className="review-pdf__toolbar">
          <span className="review-pdf__filename">{selected?.sourceFile ?? "No file selected"}</span>
          {selected && (
            <span className="review-pdf__page-badge">
              Page {currentPage} of {selected.totalPages}
            </span>
          )}
        </div>

        <PdfViewer
          record={selectedRecord}
          selectedItem={selected}
          currentPage={currentPage}
          zoom={zoom}
          onCreateSnipTask={handleCreateSnipTask}
        />

        {selected && (
          <div className="review-pdf__controls">
            <div className="review-pdf__zoom">
              <button
                className="review-pdf__zoom-btn"
                type="button"
                aria-label="Zoom out"
                onClick={() => setZoom((prev) => Math.max(prev - 0.15, 0.7))}
              >
                <IconZoomOut />
              </button>
              <span className="review-pdf__zoom-level">{Math.round(zoom * 100)}%</span>
              <button
                className="review-pdf__zoom-btn"
                type="button"
                aria-label="Zoom in"
                onClick={() => setZoom((prev) => Math.min(prev + 0.15, 2))}
              >
                <IconZoomIn />
              </button>
            </div>

            <div className="review-pdf__pagination">
              <button
                className="review-pdf__zoom-btn"
                type="button"
                aria-label="Previous page"
                disabled={currentPage <= 1}
                onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
              >
                <IconChevron direction="left" />
              </button>
              <span className="review-pdf__zoom-level">
                {currentPage} / {selected.totalPages}
              </span>
              <button
                className="review-pdf__zoom-btn"
                type="button"
                aria-label="Next page"
                disabled={currentPage >= selected.totalPages}
                onClick={() => setCurrentPage((prev) => Math.min(prev + 1, selected.totalPages))}
              >
                <IconChevron direction="right" />
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="review-queue">
        <div className="review-queue__header">
          <div>
            <h2 className="review-queue__title">Review Queue</h2>
            <p className="review-queue__count">
              {pendingItems.length} pending verification{pendingItems.length !== 1 ? "s" : ""}
            </p>
          </div>
        </div>

        <ReviewTrustSummary items={items} records={records} />

        <ConflictWarnings groups={conflictGroups} onSelect={setSelectedId} />

        <div className="review-queue__list">
          {pendingItems.length === 0 ? (
            <div className="review-queue__done">
              <p className="review-queue__done-text">All extracted items have been reviewed.</p>
            </div>
          ) : (
            pendingItems.map((item) => {
              const isSelected = item.clientId === selectedId;
              const isEditing = item.clientId === editingId;

              return (
                <div
                  key={item.clientId}
                  className={`review-card${isSelected ? " review-card--selected" : ""}`}
                  onClick={() => setSelectedId(item.clientId)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      setSelectedId(item.clientId);
                    }
                  }}
                >
                  <div className="review-card__top">
                    <span className="review-card__course">{item.course}</span>
                    <span className={confidenceClass(item.confidence)}>
                      {confidenceLabel(item.confidence, item.extraction)} · {item.confidence}%
                    </span>
                  </div>

                  {isEditing ? (
                    <input
                      className="inline-input"
                      type="text"
                      value={editDraft.title}
                      autoFocus
                      onChange={(event) =>
                        setEditDraft((draft) => ({ ...draft, title: event.target.value }))
                      }
                      onKeyDown={(event) => {
                        if (event.key === "Enter") handleSaveEdit(item);
                        if (event.key === "Escape") setEditingId(null);
                      }}
                      onClick={(event) => event.stopPropagation()}
                    />
                  ) : (
                    <h3 className="review-card__title">{item.title}</h3>
                  )}

                  <div className="review-card__date">
                    <IconCalendar />
                    {isEditing ? (
                      <input
                        className="inline-input"
                        type="date"
                        value={editDraft.dueDate || ""}
                        onChange={(event) =>
                          setEditDraft((draft) => ({
                            ...draft,
                            dueDate: event.target.value,
                          }))
                        }
                        onClick={(event) => event.stopPropagation()}
                        style={{ maxWidth: 160 }}
                      />
                    ) : (
                      <>
                        <span className="review-card__date-label">Due Date</span>
                        <span className="review-card__date-value">{formatDueDate(item.dueDateRaw)}</span>
                      </>
                    )}
                  </div>

                  <div className="review-card__attributes">
                    <span className="tag tag--gray">{item.type || "other"}</span>
                    <div className="review-card__difficulty">
                      <span>Difficulty</span>
                      {isEditing ? (
                        <DifficultyDots
                          value={editDraft.difficulty}
                          onChange={(difficulty) => setEditDraft((draft) => ({ ...draft, difficulty }))}
                        />
                      ) : (
                        item.difficulty ? <DifficultyDots value={item.difficulty} /> : <span className="review-card__difficulty-empty">Unset</span>
                      )}
                    </div>
                  </div>

                  {isSelected && (
                    <>
                      <div className="review-card__snippet-section">
                        <span className="review-card__snippet-label">Source snippet</span>
                        <p className="review-card__snippet">
                          &ldquo;
                          <SnippetText text={item.snippet || item.sourceText || ""} terms={item.highlightedTerms || []} />
                          &rdquo;
                        </p>
                      </div>

                      <EvidencePanel item={item} record={selectedRecord} />

                      <div className="review-card__extraction">
                        {itemStatusText(item.status)} · page {item.sourcePage || item.pageNumber || "?"}
                      </div>

                    </>
                  )}

                  {!isSelected && (
                    <span className="review-card__chevron">
                      <IconChevron />
                    </span>
                  )}
                </div>
              );
            })
          )}
        </div>

        {pendingItems.length > 0 && (
          <div className="review-queue__footer">
            {selected && (
              <div className="review-queue__actionbar" aria-label="Selected review actions">
                <button
                  className="review-action review-action--reject"
                  type="button"
                  onClick={() => handleReject(selected)}
                >
                  <IconX /> Reject
                </button>

                {editingId === selected.clientId ? (
                  <button
                    className="review-action review-action--edit"
                    type="button"
                    onClick={() => handleSaveEdit(selected)}
                  >
                    <IconCheck /> Save
                  </button>
                ) : (
                  <button
                    className="review-action review-action--edit"
                    type="button"
                    onClick={() => handleStartEdit(selected)}
                  >
                    <IconEdit /> Edit
                  </button>
                )}

                <button
                  className="review-action review-action--approve"
                  type="button"
                  onClick={() => handleApprove(selected)}
                >
                  <IconCheck /> Approve
                </button>
              </div>
            )}

            <div className="review-queue__progress">
              <div className="review-queue__progress-bar">
                <div
                  className="review-queue__progress-fill"
                  style={{
                    width: `${items.length === 0 ? 0 : (reviewedCount / items.length) * 100}%`,
                  }}
                />
              </div>
              <span className="review-queue__progress-text">
                {reviewedCount} of {items.length} reviewed
              </span>
            </div>

            <div className="review-queue__nav">
              <button
                className="btn-ghost"
                type="button"
                disabled={selectedIndex <= 0}
                onClick={() => handleNav(-1)}
              >
                Previous
              </button>
              <button
                className="btn-primary"
                type="button"
                disabled={selectedIndex >= pendingItems.length - 1}
                onClick={() => handleNav(1)}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ReviewPage() {
  return (
    <Suspense fallback={<div className="review-layout" />}>
      <ReviewPageContent />
    </Suspense>
  );
}
