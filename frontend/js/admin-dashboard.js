const API_BASE_URL = "http://127.0.0.1:8000";

const departmentsCountEl = document.getElementById("departmentsCount");
const coursesCountEl = document.getElementById("coursesCount");
const facultyCountEl = document.getElementById("facultyCount");
const pendingApplicationsCountEl = document.getElementById("pendingApplicationsCount");
const pendingApplicationsMetaEl = document.getElementById("pendingApplicationsMeta");
const dashboardCountStatusEl = document.getElementById("dashboardCountStatus");

function setStatus(message, isError = false) {
  if (!dashboardCountStatusEl) {
    return;
  }

  dashboardCountStatusEl.textContent = message;
  dashboardCountStatusEl.style.color = isError ? "#b00020" : "";
}

function setText(element, value) {
  if (element) {
    element.textContent = value;
  }
}

function getCurrentAdminSession() {
  const user = JSON.parse(localStorage.getItem("erp_user") || "null");
  if (!user || user.role !== "admin") {
    return null;
  }
  return user;
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

async function fetchPendingApplicationsSummary() {
  const admin = getCurrentAdminSession();
  if (!admin) {
    throw new Error("Admin session not found.");
  }

  const response = await fetch(`${API_BASE_URL}/api/applications/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      requester_username: admin.username,
      requester_role: "admin",
      view_type: "inbox",
    }),
  });
  const data = await response.json();

  if (!response.ok || !data.success) {
    throw new Error(data.message || "Failed to load applications.");
  }

  const applications = Array.isArray(data.applications) ? data.applications : [];
  const pendingApplications = applications.filter(
    (application) => String(application.status || "").toLowerCase() === "pending",
  );
  const attendanceQueries = pendingApplications.filter(
    (application) => String(application.record_type || "") === "student_query",
  );

  return {
    pendingCount: pendingApplications.length,
    pendingLabel:
      pendingApplications.length === 0
        ? "Your inbox is clear."
        : `${pendingApplications.length} item${pendingApplications.length === 1 ? "" : "s"} waiting for action.`,
    detailLabel:
      attendanceQueries.length === 0
        ? "No attendance queries are waiting right now."
        : `${attendanceQueries.length} attendance quer${attendanceQueries.length === 1 ? "y is" : "ies are"} still pending.`,
  };
}

async function refreshDashboardCounts() {
  setStatus("Refreshing latest counts...");

  const results = await Promise.allSettled([
    fetchDepartmentsAndCourses(),
    fetchFacultyCount(),
    fetchPendingApplicationsSummary(),
  ]);

  const [departmentResult, facultyResult, applicationsResult] = results;
  const errors = [];

  if (departmentResult.status === "fulfilled") {
    setText(departmentsCountEl, String(departmentResult.value.departmentCount));
    setText(coursesCountEl, String(departmentResult.value.courseCount));
  } else {
    errors.push(departmentResult.reason?.message || "department counts");
  }

  if (facultyResult.status === "fulfilled") {
    setText(facultyCountEl, String(facultyResult.value));
  } else {
    errors.push(facultyResult.reason?.message || "faculty count");
  }

  if (applicationsResult.status === "fulfilled") {
    setText(pendingApplicationsCountEl, String(applicationsResult.value.pendingCount));
    setText(pendingApplicationsMetaEl, `${applicationsResult.value.pendingLabel} ${applicationsResult.value.detailLabel}`);
  } else {
    setText(pendingApplicationsCountEl, "-");
    setText(pendingApplicationsMetaEl, "Could not load the application summary.");
    errors.push(applicationsResult.reason?.message || "application summary");
  }

  if (errors.length) {
    setStatus(`Updated what we could, but some dashboard data failed to load.`, true);
    return;
  }

  setStatus("Counts are up to date.");
}

refreshDashboardCounts();

window.addEventListener("focus", refreshDashboardCounts);

document.addEventListener("visibilitychange", () => {
  if (!document.hidden) {
    refreshDashboardCounts();
  }
});
