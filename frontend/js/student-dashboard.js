const API_BASE_URL = "http://127.0.0.1:8000";

const studentPasswordForm = document.getElementById("studentPasswordForm");
const studentOldPasswordInput = document.getElementById("studentOldPassword");
const studentNewPasswordInput = document.getElementById("studentNewPassword");
const studentConfirmNewPasswordInput = document.getElementById("studentConfirmNewPassword");
const studentPasswordMessage = document.getElementById("studentPasswordMessage");

function getStudentSessionData() {
  const storedStudent = JSON.parse(localStorage.getItem("erp_student") || "null");
  if (storedStudent) {
    return storedStudent;
  }

  return JSON.parse(localStorage.getItem("erp_user") || "null");
}

function textOrFallback(value, fallback = "-") {
  const normalized = String(value || "").trim();
  return normalized || fallback;
}

function setStudentField(fieldId, value, fallback) {
  const element = document.getElementById(fieldId);
  if (!element) return;
  element.textContent = textOrFallback(value, fallback);
}

function setPasswordMessage(message, type) {
  if (!studentPasswordMessage) return;
  studentPasswordMessage.textContent = message;
  studentPasswordMessage.className = `admin-user-message ${type || ""}`.trim();
}

(function populateStudentDashboardInfo() {
  const student = getStudentSessionData();

  if (!student || student.role !== "student") {
    setStudentField("studentInfoNote", "Unable to load student profile from current session.");
    return;
  }

  setStudentField("studentName", student.full_name, "Not Provided");
  setStudentField("studentUsername", student.username, "-");
  setStudentField("studentDepartment", student.department, "Not Assigned");
  setStudentField("studentBranch", student.branch || student.branch_name, "Not Assigned");
  setStudentField("studentBranchId", student.branch_id, "Not Assigned");
  setStudentField("studentBatch", student.batch || student.batch_name, "Not Assigned");

  const note = document.getElementById("studentInfoNote");
  if (note) {
    note.textContent = "Profile data is loaded from your login session.";
  }
})();

async function changeStudentPassword(event) {
  event.preventDefault();

  const student = getStudentSessionData();
  if (!student || student.role !== "student") {
    setPasswordMessage("Student session not found. Please login again.", "error");
    return;
  }

  const oldPassword = String(studentOldPasswordInput?.value || "");
  const newPassword = String(studentNewPasswordInput?.value || "");
  const confirmPassword = String(studentConfirmNewPasswordInput?.value || "");

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
        username: student.username,
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

    studentPasswordForm.reset();
    setPasswordMessage(data.message || "Password updated successfully.", "success");
  } catch (error) {
    setPasswordMessage("Cannot connect to backend.", "error");
  }
}

if (studentPasswordForm) {
  studentPasswordForm.addEventListener("submit", changeStudentPassword);
}

