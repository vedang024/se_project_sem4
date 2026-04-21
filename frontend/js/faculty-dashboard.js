const API_BASE_URL = "http://127.0.0.1:8000";

const facultyPasswordForm = document.getElementById("facultyPasswordForm");
const oldPasswordInput = document.getElementById("oldPassword");
const newPasswordInput = document.getElementById("newPassword");
const confirmNewPasswordInput = document.getElementById("confirmNewPassword");
const facultyPasswordMessage = document.getElementById("facultyPasswordMessage");
const facultyCourseSelect = document.getElementById("facultyCourseSelect");
const attendanceDateInput = document.getElementById("attendanceDate");
const loadAttendanceStudentsBtn = document.getElementById("loadAttendanceStudentsBtn");
const saveAttendanceBtn = document.getElementById("saveAttendanceBtn");
const facultyAttendanceMessage = document.getElementById("facultyAttendanceMessage");
const facultyAttendanceTableBody = document.getElementById("facultyAttendanceTableBody");

let facultyCourseOptions = [];
let loadedAttendanceStudents = [];

function setPasswordMessage(message, type) {
  facultyPasswordMessage.textContent = message;
  facultyPasswordMessage.className = `admin-user-message ${type || ""}`.trim();
}

function getLoggedInFaculty() {
  const user = JSON.parse(localStorage.getItem("erp_user") || "null");
  if (!user || user.role !== "faculty") return null;
  return user;
}

function setAttendanceMessage(message, type) {
  facultyAttendanceMessage.textContent = message;
  facultyAttendanceMessage.className = `admin-user-message ${type || ""}`.trim();
}

function renderAttendanceRows(students) {
  if (!Array.isArray(students) || students.length === 0) {
    facultyAttendanceTableBody.innerHTML = '<tr><td colspan="3">No students found for this batch.</td></tr>';
    return;
  }

  facultyAttendanceTableBody.innerHTML = students
    .map((student, index) => {
      if (!student.can_mark) {
        return `
          <tr>
            <td>${student.roll_no || "-"}</td>
            <td>${student.full_name || "-"}</td>
            <td>Not linked to student record</td>
          </tr>
        `;
      }

      const selectedPresent = student.status === "Present" ? "selected" : "";
      const selectedAbsent = student.status !== "Present" ? "selected" : "";

      return `
        <tr>
          <td>${student.roll_no}</td>
          <td>${student.full_name || student.username || "-"}</td>
          <td>
            <select data-row-index="${index}" class="attendance-status-select">
              <option value="Present" ${selectedPresent}>Present</option>
              <option value="Absent" ${selectedAbsent}>Absent</option>
            </select>
          </td>
        </tr>
      `;
    })
    .join("");
}

function getSelectedCourseBatch() {
  const selectedValue = facultyCourseSelect.value;
  if (!selectedValue) {
    return null;
  }

  return facultyCourseOptions.find((option) => option.key === selectedValue) || null;
}

async function loadFacultyCourses() {
  const faculty = getLoggedInFaculty();
  if (!faculty) {
    setAttendanceMessage("Faculty session not found. Please login again.", "error");
    return;
  }

  try {
    const response = await fetch(`${API_BASE_URL}/api/faculty/my-courses/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: faculty.username }),
    });

    const data = await response.json();
    if (!response.ok || !data.success) {
      setAttendanceMessage(data.message || "Could not load assigned courses.", "error");
      return;
    }

    facultyCourseOptions = (data.courses || []).map((course) => ({
      ...course,
      key: `${course.batch_id}::${course.course_id}`,
    }));

    if (facultyCourseOptions.length === 0) {
      facultyCourseSelect.innerHTML = '<option value="">No assigned courses</option>';
      setAttendanceMessage("No courses are assigned to you yet.", "error");
      return;
    }

    facultyCourseSelect.innerHTML = [
      '<option value="">Select course and batch</option>',
      ...facultyCourseOptions.map(
        (course) =>
          `<option value="${course.key}">${course.course_id} - ${course.course_name} | ${course.batch_name} (${course.branch_id})</option>`,
      ),
    ].join("");
  } catch (error) {
    setAttendanceMessage("Cannot connect to backend.", "error");
  }
}

async function loadAttendanceStudents() {
  const faculty = getLoggedInFaculty();
  const selected = getSelectedCourseBatch();
  const attendanceDate = attendanceDateInput.value;

  if (!faculty) {
    setAttendanceMessage("Faculty session not found. Please login again.", "error");
    return;
  }

  if (!selected) {
    setAttendanceMessage("Select a course and batch first.", "error");
    return;
  }

  if (!attendanceDate) {
    setAttendanceMessage("Select attendance date.", "error");
    return;
  }

  setAttendanceMessage("Loading students...", "");

  try {
    const response = await fetch(`${API_BASE_URL}/api/faculty/attendance/students/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: faculty.username,
        batch_id: selected.batch_id,
        course_id: selected.course_id,
        date: attendanceDate,
      }),
    });

    const data = await response.json();
    if (!response.ok || !data.success) {
      setAttendanceMessage(data.message || "Could not load students.", "error");
      return;
    }

    loadedAttendanceStudents = Array.isArray(data.students) ? data.students : [];
    renderAttendanceRows(loadedAttendanceStudents);
    setAttendanceMessage(`Loaded ${loadedAttendanceStudents.length} students for ${data.course.id} on ${data.date}.`, "success");
  } catch (error) {
    setAttendanceMessage("Cannot connect to backend.", "error");
  }
}

async function saveAttendance() {
  const faculty = getLoggedInFaculty();
  const selected = getSelectedCourseBatch();
  const attendanceDate = attendanceDateInput.value;

  if (!faculty) {
    setAttendanceMessage("Faculty session not found. Please login again.", "error");
    return;
  }

  if (!selected) {
    setAttendanceMessage("Select a course and batch first.", "error");
    return;
  }

  if (!attendanceDate) {
    setAttendanceMessage("Select attendance date.", "error");
    return;
  }

  if (!Array.isArray(loadedAttendanceStudents) || loadedAttendanceStudents.length === 0) {
    setAttendanceMessage("Load students before saving attendance.", "error");
    return;
  }

  const records = loadedAttendanceStudents
    .filter((student) => student.can_mark)
    .map((student, index) => {
      const selectEl = facultyAttendanceTableBody.querySelector(`select[data-row-index="${index}"]`);
      return {
        roll_no: student.roll_no,
        status: selectEl ? selectEl.value : "Absent",
      };
    });

  setAttendanceMessage("Saving attendance...", "");

  try {
    const response = await fetch(`${API_BASE_URL}/api/faculty/attendance/save/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: faculty.username,
        batch_id: selected.batch_id,
        course_id: selected.course_id,
        date: attendanceDate,
        records,
      }),
    });

    const data = await response.json();
    if (!response.ok || !data.success) {
      setAttendanceMessage(data.message || "Failed to save attendance.", "error");
      return;
    }

    setAttendanceMessage(`Attendance saved. Updated: ${data.saved}, Skipped: ${data.skipped}.`, "success");
  } catch (error) {
    setAttendanceMessage("Cannot connect to backend.", "error");
  }
}

async function changeFacultyPassword(event) {
  event.preventDefault();

  const faculty = getLoggedInFaculty();
  if (!faculty) {
    setPasswordMessage("Faculty session not found. Please login again.", "error");
    return;
  }

  const oldPassword = oldPasswordInput.value;
  const newPassword = newPasswordInput.value;
  const confirmPassword = confirmNewPasswordInput.value;

  if (!oldPassword || !newPassword || !confirmPassword) {
    setPasswordMessage("All password fields are required.", "error");
    return;
  }

  if (newPassword.length < 8) {
    setPasswordMessage("New password must be at least 8 characters.", "error");
    return;
  }

  if (newPassword !== confirmPassword) {
    setPasswordMessage("New passwords do not match.", "error");
    return;
  }

  setPasswordMessage("Updating password...", "");

  try {
    const response = await fetch(`${API_BASE_URL}/api/change-password/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: faculty.username,
        old_password: oldPassword,
        new_password: newPassword,
        confirm_password: confirmPassword,
      }),
    });

    const data = await response.json();
    if (!response.ok || !data.success) {
      setPasswordMessage(data.message || "Failed to update password.", "error");
      return;
    }

    facultyPasswordForm.reset();
    setPasswordMessage(data.message || "Password updated successfully.", "success");
  } catch (error) {
    setPasswordMessage("Cannot connect to backend.", "error");
  }
}

if (facultyPasswordForm) {
  facultyPasswordForm.addEventListener("submit", changeFacultyPassword);
}

if (attendanceDateInput && !attendanceDateInput.value) {
  attendanceDateInput.value = new Date().toISOString().slice(0, 10);
}

if (loadAttendanceStudentsBtn) {
  loadAttendanceStudentsBtn.addEventListener("click", loadAttendanceStudents);
}

if (saveAttendanceBtn) {
  saveAttendanceBtn.addEventListener("click", saveAttendance);
}

if (facultyCourseSelect) {
  loadFacultyCourses();
}

