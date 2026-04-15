"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { loadPdfDocument } from "../../../lib/pdf/loadPdfDocument";
import {
  listSyllabusRecords,
  patchSyllabusRecord,
} from "../../../lib/storage/syllabusStore";

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

/* ---- Helpers ---- */

function confidenceClass(score) {
  if (score >= 90) return "tag tag--green";
  if (score >= 75) return "tag tag--yellow";
  return "tag tag--orange";
}

function confidenceIcon(score) {
  if (score >= 90) return "✓";
  if (score >= 75) return "⚠";
  return "!";
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

function courseLabel(courseId, courses, filename) {
  const course = courses.find((entry) => entry.id === courseId);
  if (!course) return stripExtension(filename);
  if (course.code) return course.code;
  return course.code || course.name || stripExtension(filename);
}

function itemStatusText(status) {
  if (status === "approved") return "Approved";
  if (status === "rejected") return "Rejected";
  return "Automatic extraction";
}

function updateNestedItem(items, itemId, updater) {
  return items.map((item) => (item.id === itemId ? updater(item) : item));
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

function PdfViewer({ record, selectedItem, currentPage, zoom }) {
  const canvasRef = useRef(null);
  const pdfCacheRef = useRef(new Map());
  const [renderState, setRenderState] = useState({
    loading: false,
    error: null,
    width: 0,
    height: 0,
  });

  const currentPageData = useMemo(
    () => record?.parseResult?.pages?.find((page) => page.pageNumber === currentPage) ?? null,
    [record, currentPage]
  );

  useEffect(() => {
    let didCancel = false;

    async function renderPage() {
      if (!record?.fileBlob || !canvasRef.current) {
        setRenderState((prev) => ({ ...prev, loading: false }));
        return;
      }

      setRenderState((prev) => ({ ...prev, loading: true, error: null }));

      try {
        let pdfDocument = pdfCacheRef.current.get(record.id);

        if (!pdfDocument) {
          pdfDocument = await loadPdfDocument(record.fileBlob);
          pdfCacheRef.current.set(record.id, pdfDocument);
        }

        const pdfPage = await pdfDocument.getPage(currentPage);
        const viewport = pdfPage.getViewport({ scale: zoom });
        const canvas = canvasRef.current;
        const context = canvas.getContext("2d");

        canvas.width = viewport.width;
        canvas.height = viewport.height;
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;

        await pdfPage.render({
          canvasContext: context,
          viewport,
        }).promise;

        if (didCancel) return;

        setRenderState({
          loading: false,
          error: null,
          width: viewport.width,
          height: viewport.height,
        });
      } catch (error) {
        console.error("Failed to render review page.", error);

        if (didCancel) return;

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
    };
  }, [record, currentPage, zoom]);

  const highlight =
    selectedItem && currentPage === selectedItem.sourcePage
      ? selectedItem.sourceBounds
      : null;

  const frameWidth = renderState.width || (currentPageData ? currentPageData.width * zoom : 0);
  const frameHeight = renderState.height || (currentPageData ? currentPageData.height * zoom : 0);

  return (
    <div className="review-pdf__canvas">
      {!record ? (
        <div className="review-pdf__empty">
          <p>Select an item from the review queue to see its source.</p>
        </div>
      ) : (
        <div
          className="review-pdf__page-frame"
          style={{
            width: frameWidth || undefined,
            minHeight: frameHeight || undefined,
          }}
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
                currentPage === selectedItem.sourcePage &&
                line.indexStart < selectedItem.sourceIndexEnd &&
                line.indexEnd > selectedItem.sourceIndexStart;

              return (
                <div
                  key={`${line.pageNumber}-${line.indexStart}`}
                  className={`review-pdf__source-line${isSelectedLine ? " review-pdf__source-line--selected" : ""}`}
                >
                  {line.text}
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

function ReviewPageContent() {
  const searchParams = useSearchParams();
  const requestedFileId = searchParams.get("file");

  const [records, setRecords] = useState([]);
  const [courses, setCourses] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState({ title: "", dueDate: "" });
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

  useEffect(() => {
    if (!selected) return;
    setCurrentPage(selected.sourcePage);
    setZoom(1);
  }, [selected]);

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
      void updateReviewItem(item.recordId, item.id, (current) => ({
        ...current,
        status: "approved",
      }));
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
    });
  }, []);

  const handleSaveEdit = useCallback(
    (item) => {
      void updateReviewItem(item.recordId, item.id, (current) => ({
        ...current,
        title: editDraft.title || current.title,
        dueDateRaw: editDraft.dueDate || current.dueDateRaw,
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
            <Link href="/dashboard/upload" className="btn-primary">
              Upload a syllabus
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
                      {item.confidence}% {confidenceIcon(item.confidence)}
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
                        value={editDraft.dueDate}
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

                  {isSelected && (
                    <>
                      <div className="review-card__snippet-section">
                        <span className="review-card__snippet-label">Source snippet</span>
                        <p className="review-card__snippet">
                          &ldquo;
                          <SnippetText text={item.snippet} terms={item.highlightedTerms} />
                          &rdquo;
                        </p>
                      </div>

                      {item.reasons?.length > 0 && (
                        <div className="review-card__reason-list">
                          {item.reasons.slice(0, 3).map((reason) => (
                            <span
                              key={`${item.clientId}-${reason.code}`}
                              className={`review-card__reason review-card__reason--${reason.impact}`}
                            >
                              {reason.detail}
                            </span>
                          ))}
                        </div>
                      )}

                      <div className="review-card__extraction">
                        {itemStatusText(item.status)} · page {item.sourcePage}
                      </div>

                      <div className="review-card__actions">
                        <button
                          className="review-action review-action--reject"
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            handleReject(item);
                          }}
                        >
                          <IconX /> Reject
                        </button>

                        {isEditing ? (
                          <button
                            className="review-action review-action--edit"
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              handleSaveEdit(item);
                            }}
                          >
                            <IconCheck /> Save
                          </button>
                        ) : (
                          <button
                            className="review-action review-action--edit"
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              handleStartEdit(item);
                            }}
                          >
                            <IconEdit /> Edit
                          </button>
                        )}

                        <button
                          className="review-action review-action--approve"
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            handleApprove(item);
                          }}
                        >
                          <IconCheck /> Approve
                        </button>
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
