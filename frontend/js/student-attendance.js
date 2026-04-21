const API_BASE_URL = "http://127.0.0.1:8000";

const attendanceMeta = document.getElementById("attendanceMeta");
const attendanceTableBody = document.getElementById("attendanceTableBody");

function getStudentSession() {
  return JSON.parse(localStorage.getItem("erp_user") || "null");
}

function renderEmpty(message) {
  attendanceTableBody.innerHTML = `<tr><td colspan="5">${message}</td></tr>`;
}

function formatAttendance(value) {
  const attendance = value || {};
  const present = Number(attendance.present || 0);
  const total = Number(attendance.total || 0);
  const percentage = Number(attendance.percentage || 0);
  return {
    present,
    total,
    percentage,
    label: `${present}/${total}`,
    percentageLabel: `${percentage.toFixed(2)}%`,
  };
}

function renderCourses(courses) {
  if (!Array.isArray(courses) || courses.length === 0) {
    renderEmpty("No attendance records found for your current semester courses.");
    return;
  }

  attendanceTableBody.innerHTML = courses
    .map((course, index) => {
      const key = `missed-${index}`;
      const attendance = formatAttendance(course.attendance);
      const missedClasses = Array.isArray(course.missed_classes) ? course.missed_classes : [];
      const missedCount = Number(course.missed_count || missedClasses.length || 0);

      const missedHtml = missedClasses.length
        ? `<ul style="padding-left: 18px; margin: 0;">${missedClasses
            .map(
              (d) =>
                `<li style="margin-bottom:8px;">${d} <button type="button" class="btn btn-primary btn-sm raise-query-btn" data-course-id="${course.course_id}" data-missed-date="${d}" style="display:inline-flex; width:auto; margin-left:8px;">Raise Query</button></li>`,
            )
            .join("")}</ul>`
        : "<span>No missed classes.</span>";

      return `
        <tr>
          <td>
            <strong>${course.course_id || "-"}</strong><br>
            <span class="manage-note">${course.course_name || "-"}</span>
          </td>
          <td>${course.faculty || "-"}</td>
          <td>${attendance.label}</td>
          <td>${attendance.percentageLabel}</td>
          <td>
            <button type="button" class="btn btn-secondary btn-sm view-missed-btn" data-target="${key}" data-default-label="View Missed Class (${missedCount})">
              View Missed Class (${missedCount})
            </button>
          </td>
        </tr>
        <tr id="${key}" style="display:none;">
          <td colspan="5">${missedHtml}</td>
        </tr>
      `;
    })
    .join("");
}

attendanceTableBody.addEventListener("click", (event) => {
  const raiseButton = event.target.closest(".raise-query-btn");
  if (raiseButton) {
    const user = getStudentSession();
    if (!user || user.role !== "student") {
      alert("Student session not found. Please login again.");
      return;
    }

    const courseId = raiseButton.getAttribute("data-course-id") || "";
    const missedDate = raiseButton.getAttribute("data-missed-date") || "";
    if (!courseId || !missedDate) {
      alert("Missing course or date information.");
      return;
    }

    const reasonInput = window.prompt("Enter reason for attendance query (optional):", "Please review this missed attendance entry.");
    const reason = reasonInput === null ? "" : String(reasonInput).trim();

    raiseButton.disabled = true;
    raiseButton.textContent = "Submitting...";

    fetch(`${API_BASE_URL}/api/student/attendance/raise-query/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: user.username,
        course_id: courseId,
        missed_date: missedDate,
        reason,
      }),
    })
      .then((response) => response.json().then((data) => ({ ok: response.ok, data })))
      .then(({ ok, data }) => {
        if (!ok || !data.success) {
          raiseButton.disabled = false;
          raiseButton.textContent = "Raise Query";
          alert(data.message || "Could not raise attendance query.");
          return;
        }

        raiseButton.textContent = "Query Raised";
      })
      .catch(() => {
        raiseButton.disabled = false;
        raiseButton.textContent = "Raise Query";
        alert("Cannot connect to backend.");
      });

    return;
  }

  const button = event.target.closest(".view-missed-btn");
  if (!button) {
    return;
  }

  const targetId = button.getAttribute("data-target");
  if (!targetId) {
    return;
  }

  const row = document.getElementById(targetId);
  if (!row) {
    return;
  }

  const isHidden = row.style.display === "none";
  row.style.display = isHidden ? "table-row" : "none";
  const defaultLabel = button.getAttribute("data-default-label") || "View Missed Class";
  button.textContent = isHidden ? "Hide Missed Class" : defaultLabel;
});

async function loadAttendance() {
  const user = getStudentSession();

  if (!user || user.role !== "student") {
    attendanceMeta.textContent = "Student session not found. Please login again.";
    renderEmpty("Unable to load attendance.");
    return;
  }

  try {
    const response = await fetch(`${API_BASE_URL}/api/student/current-semester-attendance/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: user.username }),
    });

    const data = await response.json();
    if (!response.ok || !data.success) {
      attendanceMeta.textContent = data.message || "Could not load attendance.";
      renderEmpty("No attendance data available.");
      return;
    }

    const student = data.student || {};
    attendanceMeta.textContent = `Semester ${student.semester_roman || student.semester || "-"} attendance for ${student.branch_id || "-"} (${student.batch_name || "-"}).`;
    renderCourses(data.courses || []);
  } catch (error) {
    attendanceMeta.textContent = "Cannot connect to backend right now.";
    renderEmpty("Failed to load attendance.");
  }
}

loadAttendance();

