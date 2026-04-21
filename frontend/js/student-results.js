const API_BASE_URL = "http://127.0.0.1:8000";

const cgpaValue = document.getElementById("cgpaValue");
const gradedCreditsValue = document.getElementById("gradedCreditsValue");
const semesterCountValue = document.getElementById("semesterCountValue");
const resultsMeta = document.getElementById("resultsMeta");
const resultsSections = document.getElementById("resultsSections");

function getStudentSession() {
  return JSON.parse(localStorage.getItem("erp_user") || "null");
}

function renderEmpty(message) {
  resultsSections.innerHTML = `<p class="manage-note">${message}</p>`;
}

function renderSemesters(semesters) {
  if (!Array.isArray(semesters) || semesters.length === 0) {
    renderEmpty("No graded subjects found yet.");
    return;
  }

  resultsSections.innerHTML = semesters
    .map((semesterSection) => {
      const courses = Array.isArray(semesterSection.courses) ? semesterSection.courses : [];
      const rows = courses.length
        ? courses
            .map(
              (course) => `
                <tr>
                  <td>${course.course_id || "-"}</td>
                  <td>${course.course_name || "-"}</td>
                  <td>${course.credits ?? "-"}</td>
                  <td>${course.grade || "-"}</td>
                </tr>
              `,
            )
            .join("")
        : '<tr><td colspan="4">No subjects in this semester.</td></tr>';

      return `
        <div class="card" style="margin-top: 16px;">
          <h3>Semester ${semesterSection.semester_roman || semesterSection.semester} - SGPA: ${semesterSection.sgpa ?? "-"}</h3>
          <div class="table-wrapper">
            <table class="manage-users-table">
              <thead>
                <tr>
                  <th>Course Code</th>
                  <th>Subject</th>
                  <th>Credits</th>
                  <th>Grade</th>
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

async function loadStudentResults() {
  const user = getStudentSession();

  if (!user || user.role !== "student") {
    resultsMeta.textContent = "Student session not found. Please login again.";
    renderEmpty("Unable to load results.");
    return;
  }

  try {
    const response = await fetch(`${API_BASE_URL}/api/student/results/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: user.username }),
    });

    const data = await response.json();
    if (!response.ok || !data.success) {
      resultsMeta.textContent = data.message || "Could not load results.";
      renderEmpty("No result data available.");
      return;
    }

    cgpaValue.textContent = data.cgpa ?? "-";
    gradedCreditsValue.textContent = data.total_graded_credits ?? "-";
    semesterCountValue.textContent = Array.isArray(data.semesters) ? data.semesters.length : 0;

    const student = data.student || {};
    resultsMeta.textContent = `Result summary for ${student.branch_id || "-"} (${student.branch || "-"}).`;

    renderSemesters(data.semesters || []);
  } catch (error) {
    resultsMeta.textContent = "Cannot connect to backend right now.";
    renderEmpty("Failed to load results.");
  }
}

loadStudentResults();

