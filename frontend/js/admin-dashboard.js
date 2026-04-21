const API_BASE_URL = "http://127.0.0.1:8000";

const departmentsCountEl = document.getElementById("departmentsCount");
const coursesCountEl = document.getElementById("coursesCount");
const facultyCountEl = document.getElementById("facultyCount");
const dashboardCountStatusEl = document.getElementById("dashboardCountStatus");

function setStatus(message, isError = false) {
  if (!dashboardCountStatusEl) {
    return;
  }

  dashboardCountStatusEl.textContent = message;
  dashboardCountStatusEl.style.color = isError ? "#b00020" : "";
}

async function fetchDepartmentsAndCourses() {
  const response = await fetch(`${API_BASE_URL}/api/admin/departments/`, {
    cache: "no-store",
  });
  const data = await response.json();

  if (!response.ok || !data.success) {
    throw new Error(data.message || "Failed to load departments.");
  }

  const departments = Array.isArray(data.departments) ? data.departments : [];
  const courses = departments.reduce((total, dept) => total + Number(dept.course_count || 0), 0);

  return {
    departmentCount: departments.length,
    courseCount: courses,
  };
}

async function fetchFacultyCount() {
  const response = await fetch(`${API_BASE_URL}/api/admin/faculty-options/`, {
    cache: "no-store",
  });
  const data = await response.json();

  if (!response.ok || !data.success) {
    throw new Error(data.message || "Failed to load faculty.");
  }

  const faculty = Array.isArray(data.faculty) ? data.faculty : [];
  return faculty.length;
}

async function refreshDashboardCounts() {
  setStatus("Refreshing latest counts...");

  try {
    const [departmentData, facultyCount] = await Promise.all([
      fetchDepartmentsAndCourses(),
      fetchFacultyCount(),
    ]);

    departmentsCountEl.textContent = String(departmentData.departmentCount);
    coursesCountEl.textContent = String(departmentData.courseCount);
    facultyCountEl.textContent = String(facultyCount);

    setStatus("Counts are up to date.");
  } catch (error) {
    setStatus(error.message || "Could not refresh dashboard counts.", true);
  }
}

refreshDashboardCounts();

window.addEventListener("focus", refreshDashboardCounts);

document.addEventListener("visibilitychange", () => {
  if (!document.hidden) {
    refreshDashboardCounts();
  }
});
