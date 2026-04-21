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

function setPasswordMessage(message, type) {
  facultyPasswordMessage.textContent = message;
  facultyPasswordMessage.className = `admin-user-message ${type || ""}`.trim();
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) {
    el.textContent = value || "-";
  }
}

function renderCoursePreview(courses) {
  const container = document.getElementById("facultyCoursePreview");
  if (!container) return;

  if (!Array.isArray(courses) || courses.length === 0) {
    container.innerHTML = '<p class="manage-note">No courses assigned yet.</p>';
    return;
  }

  const preview = courses.slice(0, 4);
  container.innerHTML = preview
    .map((course) => {
      const detailUrl = `faculty-course-detail.html?batch_id=${encodeURIComponent(course.batch_id)}&course_id=${encodeURIComponent(course.course_id)}`;
      return `
        <div class="application-card">
          <div class="app-card-header">
            <span class="sender-name">${course.course_id} - ${course.course_name}</span>
            <span class="tag dept">${course.branch_id}</span>
          </div>
          <p class="app-card-subject">Batch: ${course.batch_name} | Semester ${course.semester_roman}</p>
          <div class="app-card-actions">
            <a class="btn btn-secondary btn-sm" href="${detailUrl}">Open Course</a>
          </div>
        </div>
      `;
    })
    .join("");
}

async function loadDashboardData() {
  const faculty = getLoggedInFaculty();
  if (!faculty) return;

  try {
    const [profileResponse, coursesResponse] = await Promise.all([
      fetch(`${API_BASE_URL}/api/faculty/profile/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: faculty.username }),
      }),
      fetch(`${API_BASE_URL}/api/faculty/my-courses/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: faculty.username }),
      }),
    ]);

    const profileData = await profileResponse.json();
    const coursesData = await coursesResponse.json();

    if (profileResponse.ok && profileData.success) {
      const profile = profileData.profile || {};
      setText("dashFacultyName", profile.name || faculty.full_name || "-");
      setText("dashDepartment", profile.department || "-");
      setText("dashDesignation", profile.designation || "-");
      setText("dashEmail", profile.email || faculty.username || "-");
      setText("dashPhone", profile.phone || "-");
      setText("dashResearch", profile.research_area || "-");
    }

    if (coursesResponse.ok && coursesData.success) {
      const courses = coursesData.courses || [];
      setText("dashCourseCount", String(courses.length));
      renderCoursePreview(courses);
    } else {
      renderCoursePreview([]);
    }
  } catch (error) {
    renderCoursePreview([]);
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

loadDashboardData();
