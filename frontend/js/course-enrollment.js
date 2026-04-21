const API_BASE_URL = "http://127.0.0.1:8000";

const departmentSelect = document.getElementById("departmentSelect");
const branchSelect = document.getElementById("branchSelect");
const batchSelect = document.getElementById("batchSelect");
const courseSelect = document.getElementById("courseSelect");
const facultySelect = document.getElementById("facultySelect");
const enrollmentForm = document.getElementById("enrollmentForm");
const enrollmentMessage = document.getElementById("enrollmentMessage");
const viewBatchSelect = document.getElementById("viewBatchSelect");
const coursesTableBody = document.getElementById("coursesTableBody");

let departmentsData = [];
let facultyData = [];

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
  enrollmentMessage.textContent = message;
  enrollmentMessage.className = `admin-user-message ${type || ""}`.trim();
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
    await loadFacultyOptions();
  } catch (error) {
    setMessage("Cannot connect to backend.", "error");
  }
}

async function loadFacultyOptions() {
  try {
    const response = await fetch(`${API_BASE_URL}/api/admin/faculty-options/`);
    const data = await response.json();
    if (!response.ok || !data.success) {
      facultyData = [];
      populateFacultyOptions();
      return;
    }

    facultyData = Array.isArray(data.faculty) ? data.faculty : [];
    populateFacultyOptions();
  } catch (error) {
    facultyData = [];
    populateFacultyOptions();
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
  facultySelect.innerHTML = '<option value="">Select faculty</option>';
}

function populateFacultyOptions() {
  facultySelect.innerHTML = '<option value="">Select faculty</option>';
  const selectedDept = departmentsData.find((dept) => String(dept.id) === departmentSelect.value);
  if (!selectedDept) return;

  const branchFaculty = facultyData.filter((faculty) => String(faculty.department_id) === String(selectedDept.id));
  branchFaculty.forEach((faculty) => {
    const option = document.createElement("option");
    option.value = String(faculty.id);
    option.textContent = `${faculty.name} (${faculty.department_name || selectedDept.name})`;
    facultySelect.appendChild(option);
  });
}

async function populateBatchOptions() {
  batchSelect.innerHTML = '<option value="">Loading...</option>';
  viewBatchSelect.innerHTML = '<option value="">Loading...</option>';
  const branchId = branchSelect.value;
  if (!branchId) {
    batchSelect.innerHTML = '<option value="">Select branch first</option>';
    viewBatchSelect.innerHTML = '<option value="">Select branch first</option>';
    return;
  }

  try {
    const response = await fetch(`${API_BASE_URL}/api/admin/branch-batches/?_ts=${Date.now()}`, {
      cache: "no-store",
    });
    const data = await response.json();
    if (!response.ok || !data.success) {
      batchSelect.innerHTML = '<option value="">Failed to load batches</option>';
      viewBatchSelect.innerHTML = '<option value="">Failed to load batches</option>';
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

    // Also populate view batch select
    viewBatchSelect.innerHTML = '<option value="">Select batch</option>';
    batches.forEach((batch) => {
      const option = document.createElement("option");
      option.value = String(batch.id);
      option.textContent = batch.batch_name;
      viewBatchSelect.appendChild(option);
    });
  } catch (error) {
    batchSelect.innerHTML = '<option value="">Cannot load batches</option>';
    viewBatchSelect.innerHTML = '<option value="">Cannot load batches</option>';
  }
}

async function populateCourseOptions() {
  const selectedDept = departmentsData.find((dept) => String(dept.id) === departmentSelect.value);
  if (!selectedDept) {
    courseSelect.innerHTML = '<option value="">Select department first</option>';
    return;
  }

  try {
    const response = await fetch(`${API_BASE_URL}/api/admin/departments/${selectedDept.id}/`);
    const data = await response.json();
    if (!response.ok || !data.success) {
      courseSelect.innerHTML = '<option value="">Failed to load courses</option>';
      return;
    }

    courseSelect.innerHTML = '<option value="">Select course</option>';
    (data.department.courses || []).forEach((course) => {
      const option = document.createElement("option");
      option.value = String(course.id);
      option.textContent = `${course.id} - ${course.name}`;
      courseSelect.appendChild(option);
    });
  } catch (error) {
    courseSelect.innerHTML = '<option value="">Cannot load courses</option>';
  }
}

async function assignCourse(event) {
  event.preventDefault();

  if (!isMasterAdminSession()) {
    setMessage("Admin login required to assign courses.", "error");
    return;
  }

  const batchId = Number(batchSelect.value);
  const courseId = courseSelect.value;
  const facultyId = Number(facultySelect.value);

  if (!batchId || !courseId || !facultyId) {
    setMessage("Select batch, course, and faculty.", "error");
    return;
  }

  const payload = masterPayload({
    batch_id: batchId,
    course_id: courseId,
    faculty_id: facultyId,
  });

  try {
    const response = await fetch(`${API_BASE_URL}/api/admin/courses/batch/assign/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    if (!response.ok || !data.success) {
      setMessage(data.message || "Failed to assign course.", "error");
      return;
    }

    setMessage(data.message || "Course assigned successfully.", "success");
    enrollmentForm.reset();
    courseSelect.innerHTML = '<option value="">Select course</option>';
    await loadCoursesForBatch();
  } catch (error) {
    setMessage("Cannot connect to backend.", "error");
  }
}

async function loadCoursesForBatch() {
  const batchId = viewBatchSelect.value;
  if (!batchId) {
    coursesTableBody.innerHTML = '<tr><td colspan="5">Select a batch to view courses.</td></tr>';
    return;
  }

  try {
    const response = await fetch(`${API_BASE_URL}/api/admin/batches/${batchId}/courses/`);
    const data = await response.json();
    if (!response.ok || !data.success) {
      coursesTableBody.innerHTML = '<tr><td colspan="5">Failed to load courses.</td></tr>';
      return;
    }

    const courses = data.courses || [];
    if (!courses.length) {
      coursesTableBody.innerHTML = '<tr><td colspan="5">No courses assigned to this batch.</td></tr>';
      return;
    }

    coursesTableBody.innerHTML = courses.map((course) => `
      <tr>
        <td>${course.id}</td>
        <td>${course.name}</td>
        <td>${course.credits}</td>
        <td>${course.department}</td>
        <td>${course.faculty || "-"}</td>
        <td>
          <button class="btn btn-secondary btn-sm" onclick="removeCourseBatch(${batchId}, '${course.id}')">Remove</button>
        </td>
      </tr>
    `).join("");
  } catch (error) {
    coursesTableBody.innerHTML = '<tr><td colspan="5">Cannot load courses.</td></tr>';
  }
}

async function removeCourseBatch(batchId, courseId) {
  if (!confirm(`Remove course ${courseId} from this batch?`)) return;

  const payload = masterPayload({
    batch_id: batchId,
    course_id: courseId,
  });

  try {
    const response = await fetch(`${API_BASE_URL}/api/admin/courses/batch/unassign/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    if (!response.ok || !data.success) {
      setMessage(data.message || "Failed to remove course.", "error");
      return;
    }

    setMessage("Course removed from batch.", "success");
    await loadCoursesForBatch();
  } catch (error) {
    setMessage("Cannot connect to backend.", "error");
  }
}

window.removeCourseBatch = removeCourseBatch;

departmentSelect.addEventListener("change", () => {
  populateBranchOptions();
  populateCourseOptions();
  populateFacultyOptions();
});

branchSelect.addEventListener("change", populateBatchOptions);
viewBatchSelect.addEventListener("change", loadCoursesForBatch);
enrollmentForm.addEventListener("submit", assignCourse);

(async function init() {
  if (!isMasterAdminSession()) {
    setMessage("Admin login required to manage course enrollment.", "error");
    enrollmentForm.style.display = "none";
    return;
  }

  await loadDepartments();
  setMessage("Course enrollment page loaded.", "success");
})();

