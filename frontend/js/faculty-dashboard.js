const API_BASE_URL = "http://127.0.0.1:8000";

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
    const coursesResponse = await fetch(`${API_BASE_URL}/api/faculty/my-courses/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: faculty.username }),
    });
    const coursesData = await coursesResponse.json();

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

loadDashboardData();
