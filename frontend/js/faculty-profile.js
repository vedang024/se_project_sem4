const API_BASE_URL = "http://127.0.0.1:8000";

const facultyPasswordForm = document.getElementById("facultyPasswordForm");
const oldPasswordInput = document.getElementById("oldPassword");
const newPasswordInput = document.getElementById("newPassword");
const confirmNewPasswordInput = document.getElementById("confirmNewPassword");
const facultyPasswordMessage = document.getElementById("facultyPasswordMessage");

function getLoggedInFaculty() {
  const user = JSON.parse(localStorage.getItem("erp_user") || "null");
  if (!user || user.role !== "faculty") return null;
  return user;
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) {
    el.textContent = value || "-";
  }
}

function setPasswordMessage(message, type) {
  facultyPasswordMessage.textContent = message;
  facultyPasswordMessage.className = `admin-user-message ${type || ""}`.trim();
}

async function loadProfileData() {
  const faculty = getLoggedInFaculty();
  if (!faculty) return;

  try {
    const profileResponse = await fetch(`${API_BASE_URL}/api/faculty/profile/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: faculty.username }),
    });

    const profileData = await profileResponse.json();
    if (!profileResponse.ok || !profileData.success) return;

    const profile = profileData.profile || {};
    setText("profileName", profile.name || faculty.full_name || "-");
    setText("profileDepartment", profile.department || "-");
    setText("profileDesignation", profile.designation || "-");
    setText("profileEmail", profile.email || faculty.username || "-");
    setText("profilePhone", profile.phone || "-");
    setText("profileResearch", profile.research_area || "-");
  } catch (error) {
    // Keep default placeholders when backend is unavailable.
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

loadProfileData();
