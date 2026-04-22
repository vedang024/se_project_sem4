const API_BASE_URL = "http://127.0.0.1:8000";

const COMPONENT_TYPE_OPTIONS = [
  { value: "quiz", label: "Quiz" },
  { value: "assignment", label: "Assignment" },
  { value: "midterm", label: "Midterm" },
  { value: "exam", label: "Exam" },
  { value: "project", label: "Project" },
  { value: "lab", label: "Lab" },
  { value: "other", label: "Other" },
];

const classDateInput = document.getElementById("classDate");
const classColumnTitle = document.getElementById("classColumnTitle");
const courseStudentsTableBody = document.getElementById("courseStudentsTableBody");
const loadClassSheetBtn = document.getElementById("loadClassSheetBtn");
const markAllPresentBtn = document.getElementById("markAllPresentBtn");
const markAllAbsentBtn = document.getElementById("markAllAbsentBtn");
const saveClassAttendanceBtn = document.getElementById("saveClassAttendanceBtn");
const courseDetailMessage = document.getElementById("courseDetailMessage");
const courseTitle = document.getElementById("courseTitle");
const courseMeta = document.getElementById("courseMeta");
const summaryTotal = document.getElementById("summaryTotal");
const summaryPresent = document.getElementById("summaryPresent");
const summaryAbsent = document.getElementById("summaryAbsent");

const marksMeta = document.getElementById("marksMeta");
const courseMarksMessage = document.getElementById("courseMarksMessage");
const assessmentComponentsList = document.getElementById("assessmentComponentsList");
const courseMarksTableHead = document.getElementById("courseMarksTableHead");
const courseMarksTableBody = document.getElementById("courseMarksTableBody");
const addAssessmentComponentBtn = document.getElementById("addAssessmentComponentBtn");
const saveCourseMarksBtn = document.getElementById("saveCourseMarksBtn");
const sendScoresheetBtn = document.getElementById("sendScoresheetBtn");
const marksComponentCount = document.getElementById("marksComponentCount");
const marksTotalMax = document.getElementById("marksTotalMax");
const lastScoresheetAt = document.getElementById("lastScoresheetAt");

let currentCourse = null;
let courseStudents = [];
let classStatusByRoll = {};
let classCanMarkByRoll = {};
let assessmentComponents = [];
let marksStudents = [];
let latestScoresheet = null;
let nextAssessmentComponentId = 0;
let marksSnapshot = {
  totalMaxMarks: 0,
  missingScoresCount: 0,
  allScoresComplete: false,
};

function getLoggedInFaculty() {
  const user = JSON.parse(localStorage.getItem("erp_user") || "null");
  if (!user || user.role !== "faculty") return null;
  return user;
}

function getQueryParams() {
  const params = new URLSearchParams(window.location.search);
  return {
    batchId: params.get("batch_id"),
    courseId: (params.get("course_id") || "").toUpperCase(),
  };
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatNumber(value, fallback = "-") {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) {
    return fallback;
  }

  if (Math.abs(numberValue - Math.round(numberValue)) < 0.001) {
    return String(Math.round(numberValue));
  }
  return numberValue.toFixed(2);
}

function formatDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Not Sent";
  }
  return date.toLocaleString();
}

function getGradeFromPercentage(percentage) {
  const score = Number(percentage);
  if (!Number.isFinite(score)) return "-";
  if (score >= 90) return "O";
  if (score >= 85) return "A+";
  if (score >= 80) return "A";
  if (score >= 75) return "A-";
  if (score >= 70) return "B+";
  if (score >= 65) return "B";
  if (score >= 60) return "B-";
  if (score >= 55) return "C+";
  if (score >= 50) return "C";
  if (score >= 40) return "P";
  return "F";
}

function setMessage(message, type) {
  courseDetailMessage.textContent = message;
  courseDetailMessage.className = `admin-user-message ${type || ""}`.trim();
}

function setMarksMessage(message, type) {
  courseMarksMessage.textContent = message;
  courseMarksMessage.className = `admin-user-message ${type || ""}`.trim();
}

function updateClassColumnTitle() {
  const date = classDateInput.value || "selected date";
  classColumnTitle.textContent = `Class (${date})`;
}

function updateAttendanceSummary() {
  const total = courseStudents.filter((student) => classCanMarkByRoll[student.roll_no] !== false).length;
  let present = 0;
  let absent = 0;

  courseStudents.forEach((student) => {
    if (classCanMarkByRoll[student.roll_no] === false) {
      return;
    }

    const status = classStatusByRoll[student.roll_no] || "Absent";
    if (status === "Present") {
      present += 1;
    } else {
      absent += 1;
    }
  });

  if (summaryTotal) summaryTotal.textContent = String(total);
  if (summaryPresent) summaryPresent.textContent = String(present);
  if (summaryAbsent) summaryAbsent.textContent = String(absent);
}

function renderStudentsTable() {
  if (!Array.isArray(courseStudents) || courseStudents.length === 0) {
    courseStudentsTableBody.innerHTML = '<tr><td colspan="4">No students found for this course batch.</td></tr>';
    return;
  }

  courseStudentsTableBody.innerHTML = courseStudents
    .map((student, index) => {
      const rollNo = student.roll_no || "";
      const canMark = classCanMarkByRoll[rollNo] !== false;
      const selectedStatus = classStatusByRoll[rollNo] || "Absent";
      const attendance = student.attendance || {};
      const percentage = Number(attendance.percentage || 0).toFixed(2);
      const disabledAttr = canMark ? "" : "disabled";

      return `
        <tr>
          <td>${escapeHtml(student.roll_no || "-")}</td>
          <td>${escapeHtml(student.name || "-")}</td>
          <td>${percentage}% (${attendance.present || 0}/${attendance.total || 0})</td>
          <td>
            <select class="attendance-status-select" data-row-index="${index}" ${disabledAttr}>
              <option value="Present" ${selectedStatus === "Present" ? "selected" : ""}>Present</option>
              <option value="Absent" ${selectedStatus === "Absent" ? "selected" : ""}>Absent</option>
            </select>
          </td>
        </tr>
      `;
    })
    .join("");

  courseStudentsTableBody.querySelectorAll("select.attendance-status-select").forEach((selectEl) => {
    selectEl.addEventListener("change", (event) => {
      const index = Number(event.target.dataset.rowIndex);
      const student = courseStudents[index];
      if (!student) return;
      classStatusByRoll[student.roll_no] = event.target.value;
      updateAttendanceSummary();
    });
  });

  updateAttendanceSummary();
}

async function loadCourseHeader() {
  const faculty = getLoggedInFaculty();
  const { batchId, courseId } = getQueryParams();
  if (!faculty || !batchId || !courseId) {
    setMessage("Invalid course link. Please open from My Courses page.", "error");
    return false;
  }

  try {
    const response = await fetch(`${API_BASE_URL}/api/faculty/my-courses/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: faculty.username }),
    });

    const data = await response.json();
    if (!response.ok || !data.success) {
      setMessage(data.message || "Unable to load course details.", "error");
      return false;
    }

    currentCourse = (data.courses || []).find(
      (course) => String(course.batch_id) === String(batchId) && String(course.course_id).toUpperCase() === courseId,
    );
    if (!currentCourse) {
      setMessage("This course is not assigned to you.", "error");
      return false;
    }

    courseTitle.textContent = `${currentCourse.course_id} - ${currentCourse.course_name}`;
    courseMeta.textContent = `Batch: ${currentCourse.batch_name} | Semester ${currentCourse.semester_roman} | Branch ${currentCourse.branch_id}`;
    return true;
  } catch (error) {
    setMessage("Cannot connect to backend.", "error");
    return false;
  }
}

async function loadCourseStudentsSummary() {
  const faculty = getLoggedInFaculty();
  if (!faculty || !currentCourse) return false;

  try {
    const response = await fetch(`${API_BASE_URL}/api/faculty/course-students/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: faculty.username,
        batch_id: currentCourse.batch_id,
        course_id: currentCourse.course_id,
      }),
    });

    const data = await response.json();
    if (!response.ok || !data.success) {
      setMessage(data.message || "Failed to load students.", "error");
      return false;
    }

    courseStudents = data.students || [];
    return true;
  } catch (error) {
    setMessage("Cannot connect to backend.", "error");
    return false;
  }
}

async function loadClassSheet() {
  const faculty = getLoggedInFaculty();
  if (!faculty || !currentCourse) return;

  const selectedDate = classDateInput.value;
  if (!selectedDate) {
    setMessage("Please select class date.", "error");
    return;
  }

  setMessage("Loading class sheet...", "");

  try {
    const response = await fetch(`${API_BASE_URL}/api/faculty/attendance/students/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: faculty.username,
        batch_id: currentCourse.batch_id,
        course_id: currentCourse.course_id,
        date: selectedDate,
      }),
    });

    const data = await response.json();
    if (!response.ok || !data.success) {
      setMessage(data.message || "Could not load class sheet.", "error");
      return;
    }

    classStatusByRoll = {};
    classCanMarkByRoll = {};
    (data.students || []).forEach((student) => {
      if (!student.roll_no) return;
      classStatusByRoll[student.roll_no] = student.status || "Absent";
      classCanMarkByRoll[student.roll_no] = Boolean(student.can_mark);
    });

    updateClassColumnTitle();
    renderStudentsTable();
    setMessage(`Class sheet loaded for ${selectedDate}.`, "success");
  } catch (error) {
    setMessage("Cannot connect to backend.", "error");
  }
}

function setAllAttendance(status) {
  courseStudents.forEach((student) => {
    if (!student.roll_no || classCanMarkByRoll[student.roll_no] === false) {
      return;
    }
    classStatusByRoll[student.roll_no] = status;
  });

  renderStudentsTable();
}

async function saveClassAttendance() {
  const faculty = getLoggedInFaculty();
  if (!faculty || !currentCourse) return;

  const selectedDate = classDateInput.value;
  if (!selectedDate) {
    setMessage("Please select class date.", "error");
    return;
  }

  const records = courseStudents
    .filter((student) => student.roll_no && classCanMarkByRoll[student.roll_no] !== false)
    .map((student) => ({
      roll_no: student.roll_no,
      status: classStatusByRoll[student.roll_no] || "Absent",
    }));

  if (records.length === 0) {
    setMessage("No valid students available to mark attendance.", "error");
    return;
  }

  setMessage("Saving attendance...", "");

  try {
    const response = await fetch(`${API_BASE_URL}/api/faculty/attendance/save/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: faculty.username,
        batch_id: currentCourse.batch_id,
        course_id: currentCourse.course_id,
        date: selectedDate,
        records,
      }),
    });

    const data = await response.json();
    if (!response.ok || !data.success) {
      setMessage(data.message || "Failed to save attendance.", "error");
      return;
    }

    await loadCourseStudentsSummary();
    await loadClassSheet();
    await loadCourseMarks();
    setMessage(`Attendance saved. Updated: ${data.saved}, Skipped: ${data.skipped}.`, "success");
  } catch (error) {
    setMessage("Cannot connect to backend.", "error");
  }
}

function createAssessmentComponent(component = {}) {
  nextAssessmentComponentId += 1;
  return {
    key: String(component.key || component.id || `temp-${nextAssessmentComponentId}`),
    title: String(component.title || "").trim(),
    componentType: String(component.component_type || component.componentType || "assignment").trim().toLowerCase(),
    maxMarks:
      component.max_marks !== undefined && component.max_marks !== null
        ? String(component.max_marks)
        : String(component.maxMarks || "").trim(),
  };
}

function syncMarksStudentsWithComponents() {
  const componentKeys = assessmentComponents.map((component) => component.key);
  marksStudents = marksStudents.map((student) => {
    const currentScores = student.scores || {};
    const nextScores = {};
    componentKeys.forEach((componentKey) => {
      const rawValue = currentScores[componentKey];
      nextScores[componentKey] = rawValue === null || rawValue === undefined ? "" : String(rawValue);
    });
    return {
      ...student,
      scores: nextScores,
    };
  });
}

function calculateStudentMarks(student) {
  if (!student || !student.canGrade) {
    return {
      total: 0,
      max: 0,
      percentage: null,
      grade: "-",
      complete: false,
    };
  }

  let total = 0;
  let max = 0;
  let hasScores = false;
  let complete = assessmentComponents.length > 0;

  assessmentComponents.forEach((component) => {
    const maxMarks = Number(component.maxMarks);
    if (!Number.isFinite(maxMarks) || maxMarks <= 0) {
      complete = false;
      return;
    }

    max += maxMarks;
    const rawValue = student.scores?.[component.key];
    if (rawValue === "" || rawValue === null || rawValue === undefined) {
      complete = false;
      return;
    }

    const marksValue = Number(rawValue);
    if (!Number.isFinite(marksValue)) {
      complete = false;
      return;
    }

    hasScores = true;
    total += marksValue;
  });

  const percentage = max > 0 && hasScores ? (total * 100) / max : null;
  return {
    total,
    max,
    percentage,
    grade: complete && percentage !== null ? getGradeFromPercentage(percentage) : "-",
    complete,
  };
}

function updateMarksSummary() {
  if (marksComponentCount) {
    marksComponentCount.textContent = String(assessmentComponents.length);
  }
  if (marksTotalMax) {
    const totalMax = assessmentComponents.reduce((sum, component) => sum + (Number(component.maxMarks) || 0), 0);
    marksTotalMax.textContent = formatNumber(totalMax, "0");
  }
  if (lastScoresheetAt) {
    lastScoresheetAt.textContent = latestScoresheet ? formatDateTime(latestScoresheet.submitted_at) : "Not Sent";
  }

  if (!marksMeta) return;
  if (!assessmentComponents.length) {
    marksMeta.textContent = "Add assessment components like quiz, assignment, or exam to begin entering marks.";
    return;
  }

  if (marksSnapshot.allScoresComplete) {
    marksMeta.textContent = "All saved marks are complete. You can send the final scoresheet to the academic section.";
    return;
  }

  if (marksSnapshot.missingScoresCount > 0) {
    marksMeta.textContent = `${marksSnapshot.missingScoresCount} student record(s) still need one or more marks before the final scoresheet can be sent.`;
    return;
  }

  marksMeta.textContent = "Save component marks to update totals and grades for this course.";
}

function renderAssessmentComponents() {
  if (!assessmentComponentsList) return;

  if (!assessmentComponents.length) {
    assessmentComponentsList.innerHTML = '<div class="assessment-empty-state">No assessment components yet. Add one to start entering marks.</div>';
    updateMarksSummary();
    return;
  }

  assessmentComponentsList.innerHTML = assessmentComponents
    .map((component, index) => {
      const typeOptions = COMPONENT_TYPE_OPTIONS.map(
        (option) =>
          `<option value="${option.value}" ${option.value === component.componentType ? "selected" : ""}>${option.label}</option>`,
      ).join("");

      return `
        <div class="assessment-component-row">
          <div>
            <label class="form-label" for="assessmentTitle${index}">Title</label>
            <input id="assessmentTitle${index}" class="form-input assessment-title-input" type="text" data-index="${index}" value="${escapeHtml(component.title)}" placeholder="Quiz 1">
          </div>
          <div>
            <label class="form-label" for="assessmentType${index}">Type</label>
            <select id="assessmentType${index}" class="form-input assessment-type-select" data-index="${index}">
              ${typeOptions}
            </select>
          </div>
          <div>
            <label class="form-label" for="assessmentMax${index}">Max Marks</label>
            <input id="assessmentMax${index}" class="form-input assessment-max-input" type="number" min="0" step="0.01" data-index="${index}" value="${escapeHtml(component.maxMarks)}" placeholder="20">
          </div>
          <div class="assessment-component-actions">
            <button class="btn btn-ghost remove-assessment-btn" type="button" data-index="${index}">Remove</button>
          </div>
        </div>
      `;
    })
    .join("");

  assessmentComponentsList.querySelectorAll(".assessment-title-input").forEach((input) => {
    input.addEventListener("input", (event) => {
      const index = Number(event.target.dataset.index);
      if (!assessmentComponents[index]) return;
      assessmentComponents[index].title = event.target.value;
      renderMarksTable();
    });
  });

  assessmentComponentsList.querySelectorAll(".assessment-type-select").forEach((select) => {
    select.addEventListener("change", (event) => {
      const index = Number(event.target.dataset.index);
      if (!assessmentComponents[index]) return;
      assessmentComponents[index].componentType = event.target.value;
      renderMarksTable();
    });
  });

  assessmentComponentsList.querySelectorAll(".assessment-max-input").forEach((input) => {
    input.addEventListener("input", (event) => {
      const index = Number(event.target.dataset.index);
      if (!assessmentComponents[index]) return;
      assessmentComponents[index].maxMarks = event.target.value;
      renderMarksTable();
      updateMarksSummary();
    });
  });

  assessmentComponentsList.querySelectorAll(".remove-assessment-btn").forEach((button) => {
    button.addEventListener("click", (event) => {
      const index = Number(event.target.dataset.index);
      if (!assessmentComponents[index]) return;
      assessmentComponents.splice(index, 1);
      syncMarksStudentsWithComponents();
      renderAssessmentComponents();
      renderMarksTable();
    });
  });

  updateMarksSummary();
}

function renderMarksTable() {
  if (!courseMarksTableHead || !courseMarksTableBody) return;

  const componentHeaders = assessmentComponents
    .map(
      (component) => `
        <th>
          ${escapeHtml(component.title || "Untitled")}
          <br>
          <span class="table-subtext">${escapeHtml(component.componentType || "assessment")} / ${escapeHtml(formatNumber(component.maxMarks, "-"))}</span>
        </th>
      `,
    )
    .join("");

  courseMarksTableHead.innerHTML = `
    <tr>
      <th>Roll No</th>
      <th>Student</th>
      <th>Attendance %</th>
      ${componentHeaders}
      <th>Total</th>
      <th>Grade</th>
    </tr>
  `;

  if (!Array.isArray(marksStudents) || marksStudents.length === 0) {
    const colspan = 5 + assessmentComponents.length;
    courseMarksTableBody.innerHTML = `<tr><td colspan="${colspan}">No students found for this course batch.</td></tr>`;
    return;
  }

  courseMarksTableBody.innerHTML = marksStudents
    .map((student, studentIndex) => {
      const calculated = calculateStudentMarks(student);
      const attendancePercentage = Number(student.attendance?.percentage || 0).toFixed(2);
      const componentCells = assessmentComponents
        .map((component) => {
          const value = student.scores?.[component.key] ?? "";
          const maxMarks = Number(component.maxMarks);
          const disabledAttr = student.canGrade ? "" : "disabled";
          const placeholder = student.canGrade ? "0" : "N/A";
          return `
            <td>
              <input
                class="marks-input"
                type="number"
                min="0"
                step="0.01"
                ${Number.isFinite(maxMarks) && maxMarks > 0 ? `max="${maxMarks}"` : ""}
                data-row-index="${studentIndex}"
                data-component-key="${escapeHtml(component.key)}"
                value="${escapeHtml(value)}"
                placeholder="${placeholder}"
                ${disabledAttr}
              >
            </td>
          `;
        })
        .join("");

      const totalLabel =
        assessmentComponents.length && student.canGrade
          ? `${formatNumber(calculated.total, "0")} / ${formatNumber(calculated.max, "0")}`
          : student.canGrade
            ? "- / -"
            : "N/A";

      return `
        <tr>
          <td>${escapeHtml(student.rollNo || "-")}</td>
          <td>
            ${escapeHtml(student.name || "-")}
            ${student.canGrade ? "" : '<br><span class="manage-note">Academic record missing</span>'}
          </td>
          <td>${attendancePercentage}%</td>
          ${componentCells}
          <td>${totalLabel}</td>
          <td>${student.canGrade ? escapeHtml(calculated.grade) : "-"}</td>
        </tr>
      `;
    })
    .join("");

  courseMarksTableBody.querySelectorAll(".marks-input").forEach((input) => {
    input.addEventListener("change", (event) => {
      const rowIndex = Number(event.target.dataset.rowIndex);
      const componentKey = String(event.target.dataset.componentKey || "");
      const student = marksStudents[rowIndex];
      if (!student || !componentKey) return;
      student.scores[componentKey] = event.target.value;
      renderMarksTable();
    });
  });
}

function populateMarksState(data) {
  assessmentComponents = Array.isArray(data.components) ? data.components.map((component) => createAssessmentComponent(component)) : [];
  marksStudents = Array.isArray(data.students)
    ? data.students.map((student) => {
        const scores = {};
        Object.entries(student.scores || {}).forEach(([key, value]) => {
          scores[String(key)] = value === null || value === undefined ? "" : String(value);
        });
        return {
          id: student.id,
          name: student.name || "-",
          rollNo: student.roll_no || "",
          canGrade: Boolean(student.can_grade),
          attendance: student.attendance || {},
          scores,
        };
      })
    : [];

  latestScoresheet = data.latest_submission || null;
  marksSnapshot = {
    totalMaxMarks: Number(data.total_max_marks || 0),
    missingScoresCount: Number(data.missing_scores_count || 0),
    allScoresComplete: Boolean(data.all_scores_complete),
  };

  syncMarksStudentsWithComponents();
  renderAssessmentComponents();
  renderMarksTable();
}

async function loadCourseMarks() {
  const faculty = getLoggedInFaculty();
  if (!faculty || !currentCourse) return false;

  try {
    const response = await fetch(`${API_BASE_URL}/api/faculty/course-marks/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: faculty.username,
        batch_id: currentCourse.batch_id,
        course_id: currentCourse.course_id,
      }),
    });

    const data = await response.json();
    if (!response.ok || !data.success) {
      setMarksMessage(data.message || "Failed to load saved marks.", "error");
      return false;
    }

    populateMarksState(data);
    return true;
  } catch (error) {
    setMarksMessage("Cannot connect to backend.", "error");
    return false;
  }
}

function addAssessmentComponent() {
  assessmentComponents.push(createAssessmentComponent());
  syncMarksStudentsWithComponents();
  renderAssessmentComponents();
  renderMarksTable();
}

function collectMarksPayload() {
  return {
    components: assessmentComponents.map((component) => ({
      key: component.key,
      title: String(component.title || "").trim(),
      component_type: String(component.componentType || "assignment").trim().toLowerCase(),
      max_marks: String(component.maxMarks || "").trim(),
    })),
    rows: marksStudents.map((student) => ({
      roll_no: student.rollNo,
      scores: { ...student.scores },
    })),
  };
}

function validateMarksPayload(payload) {
  if (!payload.components.length) {
    return "Add at least one assessment component before saving.";
  }

  const seenTitles = new Set();
  for (const component of payload.components) {
    const title = String(component.title || "").trim();
    const maxMarks = Number(component.max_marks);
    if (!title) {
      return "Each assessment component needs a title.";
    }
    if (seenTitles.has(title.toLowerCase())) {
      return `Duplicate component title: ${title}.`;
    }
    seenTitles.add(title.toLowerCase());
    if (!Number.isFinite(maxMarks) || maxMarks <= 0) {
      return `${title} must have max marks greater than 0.`;
    }
  }

  return "";
}

async function persistCourseMarks(options = {}) {
  const { silent = false } = options;
  const faculty = getLoggedInFaculty();
  if (!faculty || !currentCourse) return false;

  const payload = collectMarksPayload();
  const validationError = validateMarksPayload(payload);
  if (validationError) {
    setMarksMessage(validationError, "error");
    return false;
  }

  if (!silent) {
    setMarksMessage("Saving marks and grades...", "");
  }

  try {
    const response = await fetch(`${API_BASE_URL}/api/faculty/course-marks/save/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: faculty.username,
        batch_id: currentCourse.batch_id,
        course_id: currentCourse.course_id,
        components: payload.components,
        rows: payload.rows,
      }),
    });

    const data = await response.json();
    if (!response.ok || !data.success) {
      setMarksMessage(data.message || "Failed to save marks.", "error");
      return false;
    }

    await loadCourseMarks();
    if (!silent) {
      setMarksMessage(data.message || "Marks and grades saved successfully.", "success");
    }
    return true;
  } catch (error) {
    setMarksMessage("Cannot connect to backend.", "error");
    return false;
  }
}

async function sendFinalScoresheet() {
  const faculty = getLoggedInFaculty();
  if (!faculty || !currentCourse) return;

  const saved = await persistCourseMarks({ silent: true });
  if (!saved) {
    return;
  }

  setMarksMessage("Sending final scoresheet to the academic section...", "");

  try {
    const response = await fetch(`${API_BASE_URL}/api/faculty/course-marks/submit-scoresheet/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: faculty.username,
        batch_id: currentCourse.batch_id,
        course_id: currentCourse.course_id,
      }),
    });

    const data = await response.json();
    if (!response.ok || !data.success) {
      setMarksMessage(data.message || "Failed to send final scoresheet.", "error");
      return;
    }

    await loadCourseMarks();
    setMarksMessage(data.message || "Final scoresheet sent successfully.", "success");
  } catch (error) {
    setMarksMessage("Cannot connect to backend.", "error");
  }
}

async function initializePage() {
  const today = new Date().toISOString().slice(0, 10);
  classDateInput.value = today;
  updateClassColumnTitle();

  const headerLoaded = await loadCourseHeader();
  if (!headerLoaded) {
    renderStudentsTable();
    renderMarksTable();
    return;
  }

  const summaryLoaded = await loadCourseStudentsSummary();
  if (!summaryLoaded) {
    renderStudentsTable();
    renderMarksTable();
    return;
  }

  await Promise.all([loadClassSheet(), loadCourseMarks()]);
}

if (loadClassSheetBtn) {
  loadClassSheetBtn.addEventListener("click", loadClassSheet);
}

if (saveClassAttendanceBtn) {
  saveClassAttendanceBtn.addEventListener("click", saveClassAttendance);
}

if (markAllPresentBtn) {
  markAllPresentBtn.addEventListener("click", () => setAllAttendance("Present"));
}

if (markAllAbsentBtn) {
  markAllAbsentBtn.addEventListener("click", () => setAllAttendance("Absent"));
}

if (classDateInput) {
  classDateInput.addEventListener("change", updateClassColumnTitle);
}

if (addAssessmentComponentBtn) {
  addAssessmentComponentBtn.addEventListener("click", addAssessmentComponent);
}

if (saveCourseMarksBtn) {
  saveCourseMarksBtn.addEventListener("click", () => {
    persistCourseMarks();
  });
}

if (sendScoresheetBtn) {
  sendScoresheetBtn.addEventListener("click", sendFinalScoresheet);
}

initializePage();
