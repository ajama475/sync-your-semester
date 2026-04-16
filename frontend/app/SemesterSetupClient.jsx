"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

const STORAGE_KEY = "sys-semester-setup";

const steps = [
  { key: "dates", label: "Dates" },
  { key: "courses", label: "Courses" },
  { key: "sync", label: "Sync" },
];

function BrandIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function Field({ label, type = "text", value, placeholder, onChange, name, error }) {
  return (
    <label className="field">
      <span className="field__label">{label}</span>
      <input
        className={`field__input${error ? " field__input--error" : ""}`}
        type={type}
        value={value}
        name={name}
        placeholder={placeholder}
        onChange={onChange}
      />
      {error && <span className="field__error">{error}</span>}
    </label>
  );
}

function CourseRow({ id, code, name, onChange, onRemove }) {
  return (
    <div className="course-row">
      <Field
        label="Code"
        value={code}
        name="code"
        placeholder="CMPUT 301"
        onChange={(e) => onChange(id, "code", e.target.value)}
      />
      <Field
        label="Course name"
        value={name}
        name="name"
        placeholder="Intro to Software Engineering"
        onChange={(e) => onChange(id, "name", e.target.value)}
      />
      <button
        className="btn-ghost btn-danger"
        type="button"
        onClick={() => onRemove(id)}
        aria-label={`Remove ${code || "course"}`}
        style={{ marginBottom: "1px" }}
      >
        Remove
      </button>
    </div>
  );
}

export default function SemesterSetupClient() {
  const router = useRouter();

  const [semesterDates, setSemesterDates] = useState({ startDate: "", endDate: "" });
  const [courses, setCourses] = useState([]);
  const [validationErrors, setValidationErrors] = useState({});
  const [attempted, setAttempted] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.semesterDates) setSemesterDates(parsed.semesterDates);
        if (Array.isArray(parsed?.courses) && parsed.courses.length > 0) setCourses(parsed.courses);
      }
    } catch {}
  }, []);

  const hasDates = semesterDates.startDate !== "" && semesterDates.endDate !== "";
  const hasValidCourses = courses.some((c) => c.code.trim() !== "" || c.name.trim() !== "");

  const activeStep = useMemo(() => {
    if (!hasDates) return 0;
    if (!hasValidCourses) return 1;
    return 2;
  }, [hasDates, hasValidCourses]);

  function validate() {
    const errors = {};
    if (!semesterDates.startDate) errors.startDate = "Required";
    if (!semesterDates.endDate) errors.endDate = "Required";
    if (semesterDates.startDate && semesterDates.endDate && semesterDates.startDate >= semesterDates.endDate) {
      errors.endDate = "Must be after start date";
    }
    if (!hasValidCourses) {
      errors.courses = "Add at least one course with a code or name";
    }
    return errors;
  }

  function handleDateChange(e) {
    const { name, value } = e.target;
    setSemesterDates((prev) => ({ ...prev, [name]: value }));
    if (attempted) {
      setValidationErrors((prev) => ({ ...prev, [name]: undefined }));
    }
  }

  function handleCourseChange(id, field, value) {
    setCourses((prev) => prev.map((c) => (c.id === id ? { ...c, [field]: value } : c)));
    if (attempted) {
      setValidationErrors((prev) => ({ ...prev, courses: undefined }));
    }
  }

  function handleAddCourse() {
    setCourses((prev) => [...prev, { id: `course-${Date.now()}`, code: "", name: "" }]);
  }

  function handleRemoveCourse(id) {
    setCourses((prev) => prev.filter((c) => c.id !== id));
  }

  function handleContinue() {
    setAttempted(true);
    const errors = validate();
    setValidationErrors(errors);
    if (Object.keys(errors).length > 0) return;

    const payload = { semesterDates, courses };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    router.push("/dashboard");
  }

  return (
    <main className="setup-page">
      <div className="setup-container">
        <div className="setup-brand">
          <span className="setup-brand__icon"><BrandIcon /></span>
          <span className="setup-brand__name">Sync Your Semester</span>
        </div>

        <div className="setup-progress" aria-label="Setup progress">
          {steps.map((step, i) => (
            <div key={step.key} style={{ display: "contents" }}>
              <div className="setup-progress__step">
                <span className={`setup-progress__dot${i < activeStep ? " setup-progress__dot--done" : i === activeStep ? " setup-progress__dot--active" : ""}`}>
                  {i < activeStep ? <CheckIcon /> : i + 1}
                </span>
                <span className={`setup-progress__label${i === activeStep ? " setup-progress__label--active" : ""}`}>
                  {step.label}
                </span>
              </div>
              {i < steps.length - 1 && (
                <div className={`setup-progress__line${i < activeStep ? " setup-progress__line--done" : ""}`} />
              )}
            </div>
          ))}
        </div>

        <h1 className="setup-heading">Set up your semester</h1>
        <p className="setup-subheading">
          Your semester dates and courses anchor everything. We use them to organize
          your deadlines and show you what matters each week.
        </p>

        <form className="setup-form" onSubmit={(e) => e.preventDefault()}>
          <div className="setup-form__row">
            <Field
              label="Semester start"
              type="date"
              name="startDate"
              value={semesterDates.startDate}
              onChange={handleDateChange}
              error={attempted ? validationErrors.startDate : undefined}
            />
            <Field
              label="Semester end"
              type="date"
              name="endDate"
              value={semesterDates.endDate}
              onChange={handleDateChange}
              error={attempted ? validationErrors.endDate : undefined}
            />
          </div>

          <div className="setup-form__divider" />

          <section className="setup-section" aria-labelledby="courses-heading">
            <div className="setup-section__header">
              <h2 className="setup-section__title" id="courses-heading">Courses</h2>
              <span className="setup-section__count">{courses.length} added</span>
            </div>

            {attempted && validationErrors.courses && (
              <p className="field__error" style={{ marginBottom: 8 }}>{validationErrors.courses}</p>
            )}

            <div className="course-list">
              {courses.map((course) => (
                <CourseRow
                  key={course.id}
                  id={course.id}
                  code={course.code}
                  name={course.name}
                  onChange={handleCourseChange}
                  onRemove={handleRemoveCourse}
                />
              ))}

              <button className="btn-add" type="button" onClick={handleAddCourse}>
                <span aria-hidden="true">+</span>
                Add course
              </button>
            </div>
          </section>

          <div className="setup-actions">
            <div />
            <button className="btn-primary" type="button" onClick={handleContinue}>
              Continue to dashboard
            </button>
          </div>
        </form>

        <footer className="setup-footer">
          <span>Sync Your Semester — see what matters, before it's urgent.</span>
          <span>Local-first</span>
        </footer>
      </div>
    </main>
  );
}