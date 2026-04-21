const API_BASE_URL = "http://127.0.0.1:8000";
const FACULTY_DB_KEY = "erp_faculty_module_db_v1";

let facultyData = {
  profile: {
    id: null,
    name: "Faculty",
    email: "",
    designation: "Faculty Member",
    department: "Department",
    phone: "N/A",
    research_area: "N/A",
    address: "N/A",
    honor: "N/A",
    experience: "N/A",
  },
  courses: [],
};

let selectedCourseId = null;
let selectedBatchId = null;
let selectedAttendanceDate = new Date().toISOString().split("T")[0];
let courseStudents = [];

document.addEventListener("DOMContentLoaded", () => {
  loadFacultyData();
});

async function loadFacultyData() {
  const user = JSON.parse(localStorage.getItem('erp_user') || 'null');
  if (!user || user.role !== 'faculty') {
    console.error("Faculty not logged in");
    return;
  }

  const username = user.username;

  try {
    // Load faculty profile
    const profileResponse = await fetch(`${API_BASE_URL}/api/faculty/profile/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username }),
    });

    const profileData = await profileResponse.json();
    if (profileData.success) {
      facultyData.profile = profileData.profile;
    } else {
      console.error("Failed to load faculty profile:", profileData.message);
      return;
    }

    // Load faculty courses
    const coursesResponse = await fetch(`${API_BASE_URL}/api/faculty/my-courses/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username }),
    });

    const coursesData = await coursesResponse.json();
    if (coursesData.success) {
      facultyData.courses = (coursesData.courses || []).map(course => ({
        id: `${course.batch_id}_${course.course_id}`,
        batch_id: course.batch_id,
        batch_name: course.batch_name,
        semester: course.semester,
        semester_roman: course.semester_roman,
        branch_id: course.branch_id,
        branch_name: course.branch_name,
        course_id: course.course_id,
        code: course.course_id,
        name: course.course_name,
        students: [],
      }));

      if (facultyData.courses.length > 0) {
        selectedCourseId = facultyData.courses[0].id;
        selectedBatchId = facultyData.courses[0].batch_id;
      }
    } else {
      console.error("Failed to load faculty courses:", coursesData.message);
    }

    // Initialize pages
    populateFacultySnapshot();
    if (document.getElementById("facultyCourseSelect")) {
      initFacultyCoursesPage();
    }
    if (document.getElementById("profileName")) {
      initFacultyProfilePage();
    }
  } catch (error) {
    console.error("Error loading faculty data:", error);
  }
}

function populateFacultySnapshot() {
  const facultyName = document.getElementById("facultyName");
  const courseCount = document.getElementById("courseCount");
  if (facultyName) {
    facultyName.textContent = facultyData.profile.name;
  }
  if (courseCount) {
    courseCount.textContent = String(facultyData.courses.length);
  }
}

function initFacultyProfilePage() {
  const profile = facultyData.profile;
  setText("profileName", profile.name || "Faculty Name");
  setText("profileDesignation", profile.designation || "Faculty Member");
  setText("profileDepartment", profile.department || "Department");
  setText("profileEducation", profile.experience || "-");
  setText("profileResearchFields", profile.research_area || "-");
  setText("profileEmail", profile.email || "-");
  setText("profilePhone", profile.phone || "-");
  setText("profileOffice", profile.address || "-");
  setText("profileOfficeHours", profile.honor || "-");
  setText("profileBio", `${profile.name} is a ${profile.designation} in the ${profile.department} department.`);
}

function setText(elementId, value) {
  const element = document.getElementById(elementId);
  if (!element) return;
  element.textContent = value;
}

async function initFacultyCoursesPage() {
  const select = document.getElementById("facultyCourseSelect");
  const tabs = document.querySelectorAll(".view-tab");
  const addAnnouncementBtn = document.getElementById("addAnnouncementBtn");
  const closeStudentModalBtn = document.getElementById("closeStudentModalBtn");
  const studentModalOverlay = document.getElementById("studentModalOverlay");
  const attendanceDateInput = document.getElementById("attendanceDate");
  const markAllPresentBtn = document.getElementById("markAllPresentBtn");
  const markAllAbsentBtn = document.getElementById("markAllAbsentBtn");

  // Populate course select
  select.innerHTML = facultyData.courses
    .map((course) => `<option value="${course.id}">${course.code} - ${course.name}</option>`)
    .join("");
  
  if (facultyData.courses.length > 0) {
    select.value = selectedCourseId || facultyData.courses[0].id;
  }

  select.addEventListener("change", async (event) => {
    selectedCourseId = event.target.value;
    const course = facultyData.courses.find(c => c.id === selectedCourseId);
    if (course) {
      selectedBatchId = course.batch_id;
      await loadCourseStudents();
      renderCourseViews();
    }
  });

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => switchCourseTab(tab.dataset.tab));
  });

  addAnnouncementBtn.addEventListener("click", addCourseAnnouncement);
  attendanceDateInput.value = selectedAttendanceDate;
  attendanceDateInput.addEventListener("change", (event) => {
    selectedAttendanceDate = event.target.value || selectedAttendanceDate;
    renderAttendanceTable();
  });
  markAllPresentBtn.addEventListener("click", () => markAllAttendanceForDay("Present"));
  markAllAbsentBtn.addEventListener("click", () => markAllAttendanceForDay("Absent"));
  closeStudentModalBtn.addEventListener("click", closeStudentDetailsModal);
  studentModalOverlay.addEventListener("click", (event) => {
    if (event.target === studentModalOverlay) {
      closeStudentDetailsModal();
    }
  });

  await loadCourseStudents();
  renderCourseViews();
}

async function loadCourseStudents() {
  const user = JSON.parse(localStorage.getItem('erp_user') || 'null');
  if (!user || !selectedBatchId || !selectedCourseId) return;

  const course = facultyData.courses.find(c => c.id === selectedCourseId);
  if (!course) return;

  try {
    const response = await fetch(`${API_BASE_URL}/api/faculty/course-students/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: user.username,
        batch_id: selectedBatchId,
        course_id: course.course_id,
      }),
    });

    const data = await response.json();
    if (data.success) {
      courseStudents = (data.students || []).map(student => ({
        id: student.id,
        name: student.name,
        rollNo: student.roll_no,
        email: student.email,
        phone: student.phone,
        attendance: student.attendance,
        attendanceLog: student.attendance_log || {},
        grade: "B",
      }));
    } else {
      console.error("Failed to load course students:", data.message);
      courseStudents = [];
    }
  } catch (error) {
    console.error("Error loading course students:", error);
    courseStudents = [];
  }
}

function getSelectedCourse() {
  return facultyData.courses.find((course) => course.id === selectedCourseId) || facultyData.courses[0];
}

function renderCourseViews() {
  const course = getSelectedCourse();
  if (!course) return;

  renderHeaderStats(course);
  renderCourseDetails(course);
  renderAttendanceTable();
  renderAnnouncements(course);
  renderStudentsTable();
}

function renderHeaderStats(course) {
  const attendanceAverage = document.getElementById("attendanceAverage");
  const studentCount = document.getElementById("studentCount");
  const announcementCount = document.getElementById("announcementCount");

  const totalAttendance = courseStudents.reduce((acc, student) => acc + (student.attendance || 0), 0);
  const average = courseStudents.length ? Math.round(totalAttendance / courseStudents.length) : 0;

  if (attendanceAverage) attendanceAverage.textContent = `${average}%`;
  if (studentCount) studentCount.textContent = String(courseStudents.length);
  if (announcementCount) announcementCount.textContent = "0";
}

function renderCourseDetails(course) {
  const detailCode = document.getElementById("detailCode");
  const detailName = document.getElementById("detailName");
  const detailSemester = document.getElementById("detailSemester");
  const detailCredits = document.getElementById("detailCredits");
  const detailSection = document.getElementById("detailSection");

  if (detailCode) detailCode.textContent = course.code || "-";
  if (detailName) detailName.textContent = course.name || "-";
  if (detailSemester) detailSemester.textContent = course.batch_name || "-";
  if (detailCredits) detailCredits.textContent = "3";
  if (detailSection) detailSection.textContent = course.branch_name || "-";
}

function renderAttendanceTable() {
  const body = document.querySelector("#attendanceTable tbody");
  if (!body) return;

  body.innerHTML = courseStudents
    .map((student) => `
      <tr>
        <td>${student.name}</td>
        <td>${student.rollNo}</td>
        <td>-/-</td>
        <td>${student.attendance}%</td>
        <td>
          <select class="faculty-input" data-action="attendance-day" data-student-id="${student.id}">
            ${["Present", "Absent", "Late"].map((status) => `<option value="${status}" ${getAttendanceStatusForDate(student, selectedAttendanceDate) === status ? "selected" : ""}>${status}</option>`).join("")}
          </select>
        </td>
      </tr>
    `)
    .join("");

  body.querySelectorAll('select[data-action="attendance-day"]').forEach((input) => {
    input.addEventListener("change", (event) => {
      markStudentAttendanceForDate(event.target.dataset.studentId, selectedAttendanceDate, event.target.value);
    });
  });
}

function renderAnnouncements(course) {
  const list = document.getElementById("announcementList");
  if (!list) return;

  list.innerHTML = '<div class="card text-card"><p>No announcements yet for this course.</p></div>';
}

function renderStudentsTable() {
  const body = document.querySelector("#studentsTable tbody");
  if (!body) return;

  body.innerHTML = courseStudents
    .map(
      (student) => `
        <tr>
          <td>${student.name}</td>
          <td>${student.rollNo}</td>
          <td>${student.attendance}%</td>
          <td>
            <select class="faculty-input" data-action="grade" data-student-id="${student.id}">
              ${["A+", "A", "A-", "B+", "B", "C", "D"].map((grade) => `<option value="${grade}" ${grade === student.grade ? "selected" : ""}>${grade}</option>`).join("")}
            </select>
          </td>
          <td><button class="btn btn-secondary btn-sm" data-action="details" data-student-id="${student.id}">View</button></td>
        </tr>
      `
    )
    .join("");

  body.querySelectorAll('[data-action="grade"]').forEach((select) => {
    select.addEventListener("change", (event) => {
      updateStudentField(event.target.dataset.studentId, "grade", event.target.value);
    });
  });

  body.querySelectorAll('button[data-action="details"]').forEach((button) => {
    button.addEventListener("click", (event) => openStudentDetailsModal(event.target.dataset.studentId));
  });
}

function updateStudentField(studentId, fieldName, value) {
  const student = courseStudents.find((s) => s.id == studentId);
  if (!student) return;
  student[fieldName] = value;
}

function getAttendanceStatusForDate(student, dateKey) {
  if (!dateKey) return "Present";
  if (!student.attendanceLog) return "Present";
  return student.attendanceLog[dateKey] || "Present";
}

function markStudentAttendanceForDate(studentId, dateKey, status) {
  const student = courseStudents.find((s) => s.id == studentId);
  if (!student) return;
  if (!student.attendanceLog) student.attendanceLog = {};
  student.attendanceLog[dateKey] = status;
}

function markAllAttendanceForDay(status) {
  courseStudents.forEach((student) => {
    if (!student.attendanceLog) student.attendanceLog = {};
    student.attendanceLog[selectedAttendanceDate] = status;
  });
  renderAttendanceTable();
}

function addCourseAnnouncement() {
  const input = document.getElementById("announcementInput");
  const message = String(input.value || "").trim();
  if (!message) return;

  input.value = "";
  renderAnnouncements(getSelectedCourse());
}

function switchCourseTab(tabName) {
  document.querySelectorAll(".view-tab").forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.tab === tabName);
  });

  document.querySelectorAll(".faculty-tab-panel").forEach((panel) => {
    panel.classList.toggle("hidden", panel.id !== `tab-${tabName}`);
  });
}

function openStudentDetailsModal(studentId) {
  const student = courseStudents.find((s) => s.id == studentId);
  if (!student) return;

  const nameEl = document.getElementById("studentModalName");
  const rollEl = document.getElementById("studentModalRoll");
  const emailEl = document.getElementById("studentModalEmail");
  const phoneEl = document.getElementById("studentModalPhone");

  if (nameEl) nameEl.textContent = student.name;
  if (rollEl) rollEl.textContent = student.rollNo;
  if (emailEl) emailEl.textContent = student.email;
  if (phoneEl) phoneEl.textContent = student.phone;

  const overlay = document.getElementById("studentModalOverlay");
  if (overlay) overlay.classList.add("active");
}

function closeStudentDetailsModal() {
  const overlay = document.getElementById("studentModalOverlay");
  if (overlay) overlay.classList.remove("active");
}
  if (!student.attendanceLog || typeof student.attendanceLog !== "object") {
    student.attendanceLog = {};
  }
  student.attendanceLog[dateKey] = status;
  saveFacultyDb();
  renderCourseViews();
}

function markAllAttendanceForDay(status) {
  const course = getSelectedCourse();
  course.students.forEach((student) => {
    if (!student.attendanceLog || typeof student.attendanceLog !== "object") {
      student.attendanceLog = {};
    }
    student.attendanceLog[selectedAttendanceDate] = status;
  });
  saveFacultyDb();
  renderCourseViews();
}

function addCourseAnnouncement() {
  const input = document.getElementById("announcementInput");
  const message = String(input.value || "").trim();
  if (!message) return;

  const course = getSelectedCourse();
  course.announcements.push({
    id: "a_" + Date.now(),
    message,
    date: new Date().toISOString().split("T")[0]
  });

  input.value = "";
  saveFacultyDb();
  renderCourseViews();
  switchCourseTab("announcements");
}

function switchCourseTab(tabName) {
  document.querySelectorAll(".view-tab").forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.tab === tabName);
  });

  document.querySelectorAll(".faculty-tab-panel").forEach((panel) => {
    panel.classList.toggle("hidden", panel.id !== `tab-${tabName}`);
  });
}

function openStudentDetailsModal(studentId) {
  const course = getSelectedCourse();
  const student = course.students.find((item) => item.id === studentId);
  if (!student) return;

  document.getElementById("studentModalName").textContent = student.name;
  document.getElementById("studentModalRoll").textContent = student.rollNo;
  document.getElementById("studentModalEmail").textContent = student.email;
  document.getElementById("studentModalPhone").textContent = student.phone;
  document.getElementById("studentModalOverlay").classList.add("active");
}

function closeStudentDetailsModal() {
  document.getElementById("studentModalOverlay").classList.remove("active");
}
