const API_BASE_URL = "http://127.0.0.1:8000";

const departmentSelect = document.getElementById("departmentSelect");
const branchSelect = document.getElementById("branchSelect");
const batchSelect = document.getElementById("batchSelect");
const courseSelect = document.getElementById("courseSelect");
const filterForm = document.getElementById("filterForm");
const filterMessage = document.getElementById("filterMessage");
const studentsTableBody = document.getElementById("studentsTableBody");
const courseInfo = document.getElementById("courseInfo");
const infoBatchName = document.getElementById("infoBatchName");
const infoCourseInfo = document.getElementById("infoCourseInfo");

let departmentsData = [];

function getAdminSession() {
  const user = JSON.parse(localStorage.getItem("erp_user") || "null");
  if (!user || user.role !== "admin") {
    return null;
  }
  return {
    username: String(user.username || "").trim(),
    password: localStorage.getItem("erp_admin_password") || "",
  };
}

function masterPayload(extra = {}) {
  const adminSession = getAdminSession();
  return {
    admin_username: adminSession ? adminSession.username : "",
    admin_password: adminSession ? adminSession.password : "",
    ...extra,
  };
}

function setMessage(message, type) {
  filterMessage.textContent = message;
  filterMessage.className = `admin-user-message ${type || ""}`.trim();
}

function isMasterAdminSession() {
  const adminSession = getAdminSession();
  return !!(adminSession && adminSession.password);
}

async function loadDepartments() {
  try {
    const response = await fetch(`${API_BASE_URL}/api/admin/departments-branches/`);
    const data = await response.json();
    if (!response.ok || !data.success) {
      setMessage("Failed to load departments.", "error");
      return;
    }

    departmentsData = Array.isArray(data.departments) ? data.departments : [];
    populateDepartmentOptions();
  } catch (error) {
    setMessage("Cannot connect to backend.", "error");
  }
}

function populateDepartmentOptions() {
  departmentSelect.innerHTML = '<option value="">Select department</option>';
  departmentsData.forEach((dept) => {
    const option = document.createElement("option");
    option.value = String(dept.id);
    option.textContent = dept.name;
    departmentSelect.appendChild(option);
  });
}

function populateBranchOptions() {
  branchSelect.innerHTML = '<option value="">Select branch</option>';
  const selectedDept = departmentsData.find((dept) => String(dept.id) === departmentSelect.value);
  if (!selectedDept) return;

  (selectedDept.branches || []).forEach((branch) => {
    const option = document.createElement("option");
    option.value = String(branch.id);
    option.textContent = branch.name;
    branchSelect.appendChild(option);
  });

  batchSelect.innerHTML = '<option value="">Select batch</option>';
  courseSelect.innerHTML = '<option value="">Select course</option>';
}

async function populateBatchOptions() {
  batchSelect.innerHTML = '<option value="">Loading...</option>';
  courseSelect.innerHTML = '<option value="">Select batch first</option>';
  const branchId = branchSelect.value;
  if (!branchId) {
    batchSelect.innerHTML = '<option value="">Select branch first</option>';
    return;
  }

  try {
    const response = await fetch(`${API_BASE_URL}/api/admin/branch-batches/?_ts=${Date.now()}`, {
      cache: "no-store",
    });
    const data = await response.json();
    if (!response.ok || !data.success) {
      batchSelect.innerHTML = '<option value="">Failed to load batches</option>';
      return;
    }

    const batches = (data.batches || []).filter((batch) => String(batch.branch_id) === String(branchId));

    batchSelect.innerHTML = '<option value="">Select batch</option>';
    batches.forEach((batch) => {
      const option = document.createElement("option");
      option.value = String(batch.id);
      option.textContent = batch.batch_name;
      batchSelect.appendChild(option);
    });
  } catch (error) {
    batchSelect.innerHTML = '<option value="">Cannot load batches</option>';
  }
}

async function populateCourseOptions() {
  const batchId = batchSelect.value;
  if (!batchId) {
    courseSelect.innerHTML = '<option value="">Select batch first</option>';
    return;
  }

  courseSelect.innerHTML = '<option value="">Loading...</option>';

  try {
    const response = await fetch(`${API_BASE_URL}/api/admin/batches/${batchId}/courses/`);
    const data = await response.json();
    if (!response.ok || !data.success) {
      courseSelect.innerHTML = '<option value="">Failed to load courses</option>';
      return;
    }

    courseSelect.innerHTML = '<option value="">Select course</option>';
    (data.courses || []).forEach((course) => {
      const option = document.createElement("option");
      option.value = JSON.stringify({ id: course.id, name: course.name });
      option.textContent = `${course.id} - ${course.name}`;
      courseSelect.appendChild(option);
    });
  } catch (error) {
    courseSelect.innerHTML = '<option value="">Cannot load courses</option>';
  }
}

async function viewStudents(event) {
  event.preventDefault();

  if (!isMasterAdminSession()) {
    setMessage("Admin login required to view students.", "error");
    return;
  }

  const batchId = Number(batchSelect.value);
  const courseData = courseSelect.value;

  if (!batchId || !courseData) {
    setMessage("Select both batch and course.", "error");
    return;
  }

  let courseId;
  let courseName;
  try {
    const parsed = JSON.parse(courseData);
    courseId = parsed.id;
    courseName = parsed.name;
  } catch {
    setMessage("Invalid course selection.", "error");
    return;
  }

  const payload = masterPayload({
    batch_id: batchId,
    course_id: courseId,
  });

  try {
    const response = await fetch(`${API_BASE_URL}/api/admin/courses/students/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    if (!response.ok || !data.success) {
      setMessage(data.message || "Failed to load students.", "error");
      courseInfo.style.display = "none";
      studentsTableBody.innerHTML = '<tr><td colspan="3">No data to display.</td></tr>';
      return;
    }

    const students = data.students || [];
    infoBatchName.textContent = data.batch_name || "N/A";
    infoCourseInfo.textContent = `${data.course_id} - ${data.course_name}`;
    courseInfo.style.display = "block";

    if (!students.length) {
      setMessage("No students enrolled in this course.", "info");
      studentsTableBody.innerHTML = '<tr><td colspan="3">No students found.</td></tr>';
      return;
    }

    setMessage(`Found ${students.length} student(s).`, "success");
    studentsTableBody.innerHTML = students.map((student) => `
      <tr>
        <td>${student.username}</td>
        <td>${student.full_name}</td>
        <td>${student.user_id}</td>
      </tr>
    `).join("");
  } catch (error) {
    setMessage("Cannot connect to backend.", "error");
  }
}

departmentSelect.addEventListener("change", populateBranchOptions);
branchSelect.addEventListener("change", populateBatchOptions);
batchSelect.addEventListener("change", populateCourseOptions);
filterForm.addEventListener("submit", viewStudents);

(async function init() {
  if (!isMasterAdminSession()) {
    setMessage("Admin login required to view students in courses.", "error");
    filterForm.style.display = "none";
    return;
  }

  await loadDepartments();
  setMessage("View students page loaded.", "success");
})();

