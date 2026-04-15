const steps = [
  { label: "Dates", status: "current" },
  { label: "Courses", status: "upcoming" },
  { label: "Sync", status: "upcoming" },
];

const courses = [
  {
    code: "CMPUT 301",
    name: "Introduction to Software Engineering",
  },
  {
    code: "ECON 281",
    name: "Intermediate Microeconomics I",
  },
];

export const metadata = {
  title: "Semester Setup",
};

function Step({ index, label, status }) {
  const isCurrent = status === "current";

  return (
    <div className="step">
      <div className={`step__badge${isCurrent ? " step__badge--current" : ""}`}>{index + 1}</div>
      <span className={`step__label${isCurrent ? " step__label--current" : ""}`}>{label}</span>
    </div>
  );
}

function Field({ label, type, defaultValue, placeholder }) {
  return (
    <label className="field">
      <span className="field__label">{label}</span>
      <input className="field__input" type={type} defaultValue={defaultValue} placeholder={placeholder} />
    </label>
  );
}

function CourseRow({ code, name }) {
  return (
    <div className="course-row">
      <div className="course-row__grid">
        <Field label="Course code" type="text" defaultValue={code} />
        <Field label="Course name" type="text" defaultValue={name} />
        <button className="ghost-button ghost-button--danger" type="button">
          Remove
        </button>
      </div>
    </div>
  );
}

export default function HomePage() {
  return (
    <main className="page-shell">
      <div className="page-frame">
        <section className="setup-card" aria-labelledby="semester-setup-title">
          <div className="brand-lockup">
            <span className="brand-lockup__eyebrow">Local-first semester planning</span>
            <span className="brand-lockup__name">Sync Your Semester</span>
          </div>

          <div className="stepper" aria-label="Semester setup progress">
            <div className="stepper__track" />
            <div className="stepper__progress" />
            {steps.map((step, index) => (
              <Step key={step.label} index={index} label={step.label} status={step.status} />
            ))}
          </div>

          <header className="setup-header">
            <p className="setup-header__kicker">Semester setup</p>
            <h1 id="semester-setup-title">Set your semester once.</h1>
          </header>

          <form className="setup-form">
            <div className="setup-grid">
              <Field label="Semester start date" type="date" defaultValue="2026-09-02" />
              <Field label="Semester end date" type="date" defaultValue="2026-12-15" />
            </div>

            <section className="course-section" aria-labelledby="courses-heading">
              <div className="section-heading">
                <div>
                  <p className="section-heading__label">Courses</p>
                  <h2 id="courses-heading">Core courses</h2>
                </div>
                <span className="section-heading__meta">{courses.length} added</span>
              </div>

              <div className="course-list">
                {courses.map((course) => (
                  <CourseRow key={course.code} code={course.code} name={course.name} />
                ))}

                <button className="add-course-button" type="button">
                  <span aria-hidden="true">+</span>
                  Add course
                </button>
              </div>
            </section>

            <div className="form-actions">
              <button className="ghost-button" type="button">
                Save draft
              </button>
              <button className="primary-button" type="button">
                Continue to upload
              </button>
            </div>
          </form>
        </section>

        <footer className="site-footer">
          <span>Sync Your Semester is designed to make syllabus week feel lighter, clearer, and less chaotic.</span>
          <span>Local-first by default.</span>
        </footer>
      </div>
    </main>
  );
}
