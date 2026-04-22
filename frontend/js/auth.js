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
  const studentPages = [
    "/student.html",
    "/student-timetable.html",
    "/student-courses.html",
    "/student-attendance.html",
    "/student-results.html",
    "/student-applications.html",
  ];
  const facultyPages = [
    "/faculty.html",
    "/faculty-courses.html",
    "/faculty-course-detail.html",
    "/faculty-timetable.html",
    "/faculty-applications.html",
  ];

  if (!user) {
    window.location.href = getLoginPath();
    return;
  }

  if (studentPages.some((page) => currentPath.endsWith(page)) && user.role !== "student") {
    window.location.href = getLoginPath();
    return;
  }

  if (facultyPages.some((page) => currentPath.endsWith(page)) && user.role !== "faculty") {
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

