const API_BASE_URL = "http://127.0.0.1:8000";

function getLoggedInFaculty() {
  const user = JSON.parse(localStorage.getItem("erp_user") || "null");
  if (!user || user.role !== "faculty") return null;
  return user;
}

function renderCourses(courses) {
  const container = document.getElementById("facultyCoursesList");
  if (!container) return;

  if (!Array.isArray(courses) || courses.length === 0) {
    container.innerHTML = '<div class="card"><p class="manage-note">No courses assigned yet.</p></div>';
    return;
  }

  container.innerHTML = courses
    .map((course) => {
      const detailUrl = `faculty-course-detail.html?batch_id=${encodeURIComponent(course.batch_id)}&course_id=${encodeURIComponent(course.course_id)}`;
      return `
        <div class="card course-item-card">
          <h3>${course.course_id}</h3>
          <p>${course.course_name}</p>
          <p class="manage-note">Batch: ${course.batch_name} | Semester ${course.semester_roman} | Branch ${course.branch_id}</p>
          <p class="manage-note">Students: ${course.total_students || 0}</p>
          <a href="${detailUrl}" class="btn btn-primary btn-sm">Open Course Page</a>
        </div>
      `;
    })
    .join("");
}

async function loadFacultyCourses() {
  const faculty = getLoggedInFaculty();
  if (!faculty) return;

  const container = document.getElementById("facultyCoursesList");
  if (container) {
    container.innerHTML = '<div class="card"><p class="manage-note">Loading courses...</p></div>';
  }

  try {
    const response = await fetch(`${API_BASE_URL}/api/faculty/my-courses/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: faculty.username }),
    });

    const data = await response.json();
    if (!response.ok || !data.success) {
      renderCourses([]);
      return;
    }

    renderCourses(data.courses || []);
  } catch (error) {
    renderCourses([]);
  }
}

loadFacultyCourses();
