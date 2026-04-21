const API_BASE_URL = "http://127.0.0.1:8000";

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

let currentCourse = null;
let courseStudents = [];
let classStatusByRoll = {};
let classCanMarkByRoll = {};

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

function setMessage(message, type) {
  courseDetailMessage.textContent = message;
  courseDetailMessage.className = `admin-user-message ${type || ""}`.trim();
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
          <td>${student.roll_no || "-"}</td>
          <td>${student.name || "-"}</td>
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

    currentCourse = (data.courses || []).find((course) => String(course.batch_id) === String(batchId) && String(course.course_id).toUpperCase() === courseId);
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
    updateAttendanceSummary();
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
  updateAttendanceSummary();
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
    setMessage(`Attendance saved. Updated: ${data.saved}, Skipped: ${data.skipped}.`, "success");
  } catch (error) {
    setMessage("Cannot connect to backend.", "error");
  }
}

async function initializePage() {
  const today = new Date().toISOString().slice(0, 10);
  classDateInput.value = today;
  updateClassColumnTitle();

  const headerLoaded = await loadCourseHeader();
  if (!headerLoaded) {
    renderStudentsTable();
    return;
  }

  const summaryLoaded = await loadCourseStudentsSummary();
  if (!summaryLoaded) {
    renderStudentsTable();
    return;
  }

  await loadClassSheet();
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
  classDateInput.addEventListener("change", () => {
    updateClassColumnTitle();
  });
}

initializePage();
