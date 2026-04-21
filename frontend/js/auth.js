function getLoginPath() {
  return window.location.pathname.includes("/academicsection/") ? "../login.html" : "login.html";
}

function logout() {
  localStorage.removeItem("erp_user");
  localStorage.removeItem("erp_student");
  localStorage.removeItem("erp_admin_password");
  window.location.href = getLoginPath();
}

(function guardProtectedPages() {
  const currentPath = window.location.pathname;
  const user = JSON.parse(localStorage.getItem("erp_user") || "null");

  if (!user) {
    window.location.href = getLoginPath();
    return;
  }

  if (currentPath.endsWith("/student.html") && user.role !== "student") {
    window.location.href = getLoginPath();
    return;
  }

  if (currentPath.endsWith("/faculty.html") && user.role !== "faculty") {
    window.location.href = getLoginPath();
    return;
  }

  if (currentPath.endsWith("/faculty-courses.html") && user.role !== "faculty") {
    window.location.href = getLoginPath();
    return;
  }

  if (currentPath.endsWith("/faculty-course-detail.html") && user.role !== "faculty") {
    window.location.href = getLoginPath();
    return;
  }

  if (currentPath.endsWith("/faculty-timetable.html") && user.role !== "faculty") {
    window.location.href = getLoginPath();
    return;
  }

  if (currentPath.endsWith("/student-timetable.html") && user.role !== "student") {
    window.location.href = getLoginPath();
    return;
  }

  if (currentPath.endsWith("/student-courses.html") && user.role !== "student") {
    window.location.href = getLoginPath();
    return;
  }

  if (currentPath.endsWith("/student-attendance.html") && user.role !== "student") {
    window.location.href = getLoginPath();
    return;
  }

  if (currentPath.endsWith("/student-results.html") && user.role !== "student") {
    window.location.href = getLoginPath();
    return;
  }

  if (currentPath.includes("/academicsection/")) {
    const isTimetablePage = currentPath.endsWith("/academicsection/timetable.html");
    if (user.role === "admin") {
      return;
    }

    if (isTimetablePage && user.role === "faculty") {
      window.location.href = "../faculty-timetable.html";
      return;
    }

    if (isTimetablePage && user.role === "student") {
      window.location.href = "../student-timetable.html";
      return;
    }

    if (user.role !== "admin") {
      window.location.href = getLoginPath();
    }
  }
})();

