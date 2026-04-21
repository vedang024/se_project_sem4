const API_BASE_URL = "http://127.0.0.1:8000";

const myCoursesSections = document.getElementById("myCoursesSections");
const myCoursesMeta = document.getElementById("myCoursesMeta");

function getStudentSession() {
  return JSON.parse(localStorage.getItem("erp_user") || "null");
}

function renderEmpty(message) {
  myCoursesSections.innerHTML = `<p class="manage-note">${message}</p>`;
}

function renderCoursesBySemester(semesters) {
  if (!Array.isArray(semesters) || semesters.length === 0) {
    renderEmpty("No courses are available for your profile.");
    return;
  }

  myCoursesSections.innerHTML = semesters
    .map((semesterSection) => {
      const courses = Array.isArray(semesterSection.courses) ? semesterSection.courses : [];
      const rows = courses.length
        ? courses
            .map(
              (course) => `
                <tr>
                  <td>${course.course_id}</td>
                  <td>${course.course_name}</td>
                  <td>${course.credits}</td>
                  <td>${course.department || "-"}</td>
                  <td>${course.faculty || "-"}</td>
                  <td>${course.grade || "-"}</td>
                  <td>${course.attendance ? `${course.attendance.present}/${course.attendance.total} (${course.attendance.percentage}%)` : "0/0 (0%)"}</td>
                </tr>
              `,
            )
            .join("")
        : '<tr><td colspan="7">No courses in this semester.</td></tr>';

      return `
        <div class="card" style="margin-bottom: 16px;">
          <h3>Semester ${semesterSection.semester_roman || semesterSection.semester}</h3>
          <div class="table-wrapper">
            <table class="manage-users-table">
              <thead>
                <tr>
                  <th>Course Code</th>
                  <th>Course Name</th>
                  <th>Credits</th>
                  <th>Department</th>
                  <th>Faculty</th>
                  <th>Grade</th>
                  <th>Attendance</th>
                </tr>
              </thead>
              <tbody>
                ${rows}
              </tbody>
            </table>
          </div>
        </div>
      `;
    })
    .join("");
}

async function loadMyCourses() {
  const user = getStudentSession();

  if (!user || user.role !== "student") {
    myCoursesMeta.textContent = "Student session not found. Please login again.";
    renderEmpty("Unable to load courses.");
    return;
  }

  try {
    const response = await fetch(`${API_BASE_URL}/api/student/my-courses/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: user.username }),
    });

    const data = await response.json();
    if (!response.ok || !data.success) {
      myCoursesMeta.textContent = data.message || "Could not load your courses.";
      renderEmpty("No courses available.");
      return;
    }

    myCoursesMeta.textContent = "";
    renderCoursesBySemester(data.semesters || []);
  } catch (error) {
    myCoursesMeta.textContent = "Cannot connect to backend right now.";
    renderEmpty("Failed to load courses.");
  }
}

loadMyCourses();

