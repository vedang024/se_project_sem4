const API_BASE_URL = "http://127.0.0.1:8000";

const params = new URLSearchParams(window.location.search);
const departmentId = params.get("department_id");

const departmentTitle = document.getElementById("departmentTitle");
const deptSummaryCards = document.getElementById("deptSummaryCards");
const departmentDetailMessage = document.getElementById("departmentDetailMessage");
const deptNameInput = document.getElementById("deptNameInput");
const deptHODSelect = document.getElementById("deptHODSelect");
const editDepartmentForm = document.getElementById("editDepartmentForm");
const addBranchForm = document.getElementById("addBranchForm");
const addCourseForm = document.getElementById("addCourseForm");
const branchCodeInput = document.getElementById("branchCodeInput");
const branchNameInput = document.getElementById("branchNameInput");
const branchCollegeYearsInput = document.getElementById("branchCollegeYearsInput");
const branchTableBody = document.getElementById("branchTableBody");
const courseCodeInput = document.getElementById("courseCodeInput");
const courseNameInput = document.getElementById("courseNameInput");
const courseCreditsInput = document.getElementById("courseCreditsInput");
const facultyTableBody = document.getElementById("facultyTableBody");
const courseTableBody = document.getElementById("courseTableBody");
const branchModalOverlay = document.getElementById("branchModalOverlay");
const closeBranchModalBtn = document.getElementById("closeBranchModalBtn");
const cancelBranchEditBtn = document.getElementById("cancelBranchEditBtn");
const editBranchForm = document.getElementById("editBranchForm");
const originalBranchCodeInput = document.getElementById("originalBranchCodeInput");
const editBranchCodeInput = document.getElementById("editBranchCodeInput");
const editBranchNameInput = document.getElementById("editBranchNameInput");
const editBranchCollegeYearsInput = document.getElementById("editBranchCollegeYearsInput");

let departmentData = null;

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
  departmentDetailMessage.textContent = message;
  departmentDetailMessage.className = `admin-user-message ${type || ""}`.trim();
}

function isMasterAdminSession() {
  const adminSession = getAdminSession();
  return !!(adminSession && adminSession.password);
}

function renderSummary() {
  if (!departmentData) return;

  departmentTitle.textContent = `${departmentData.name} Department`;
  deptSummaryCards.innerHTML = `
    <div class="card"><h3>HOD</h3><p>${departmentData.hod_name || "Not Assigned"}</p></div>
    <div class="card"><h3>Faculty Count</h3><p>${departmentData.faculty_count}</p></div>
    <div class="card"><h3>Courses Count</h3><p>${departmentData.course_count}</p></div>
  `;
}

function renderFacultyList() {
  const facultyMembers = departmentData?.faculty_members || [];
  if (!facultyMembers.length) {
    facultyTableBody.innerHTML = '<tr><td colspan="2">No faculty added yet.</td></tr>';
    return;
  }

  facultyTableBody.innerHTML = facultyMembers.map((faculty) => `
    <tr>
      <td>${faculty.name}</td>
      <td>${faculty.email}</td>
    </tr>
  `).join("");
}

function renderCourseList() {
  const courses = departmentData?.courses || [];
  if (!courses.length) {
    courseTableBody.innerHTML = '<tr><td colspan="3">No courses added yet.</td></tr>';
    return;
  }

  courseTableBody.innerHTML = courses.map((course) => `
    <tr>
      <td>${course.id}</td>
      <td>${course.name}</td>
      <td>${course.credits}</td>
    </tr>
  `).join("");
}

function renderBranches() {
  const branches = departmentData?.branches || [];
  if (!branches.length) {
    branchTableBody.innerHTML = '<tr><td colspan="5">No branches added yet.</td></tr>';
    return;
  }

  branchTableBody.innerHTML = branches.map((branch) => `
    <tr>
      <td>${branch.id}</td>
      <td>${branch.name}</td>
      <td>${branch.college_years || "-"}</td>
      <td>${(branch.batches || []).length}</td>
      <td>
        <div class="dept-action-row">
          <a class="btn btn-secondary btn-sm" href="branch-batches.html?department_id=${departmentId}&branch_id=${encodeURIComponent(branch.id)}">Batches</a>
          <button class="btn btn-secondary btn-sm" onclick="openBranchEdit('${branch.id}', '${branch.name.replace(/'/g, "\\'")}', ${branch.college_years || 4})">Edit</button>
        </div>
      </td>
    </tr>
  `).join("");
}

function populateHODOptions() {
  const facultyMembers = departmentData?.faculty_members || [];
  deptHODSelect.innerHTML = '<option value="">Select HOD (optional)</option>';

  if (!facultyMembers.length) {
    deptHODSelect.innerHTML = '<option value="">No faculty added yet</option>';
    deptHODSelect.disabled = true;
    return;
  }

  deptHODSelect.disabled = false;
  facultyMembers.forEach((faculty) => {
    const option = document.createElement("option");
    option.value = String(faculty.id);
    option.textContent = faculty.name;
    deptHODSelect.appendChild(option);
  });

  if (departmentData?.hod_id) {
    deptHODSelect.value = String(departmentData.hod_id);
  }
}

async function loadDepartmentDetail() {
  const response = await fetch(`${API_BASE_URL}/api/admin/departments/${departmentId}/`);
  const data = await response.json();
  if (!response.ok || !data.success) {
    throw new Error(data.message || "Failed to load department details.");
  }

  departmentData = data.department;
  deptNameInput.value = departmentData.name;
  renderSummary();
  renderFacultyList();
  renderCourseList();
  renderBranches();
  populateHODOptions();
}

async function saveDepartment(event) {
  event.preventDefault();

  if (!isMasterAdminSession()) {
    setMessage("Admin login required to edit department details.", "error");
    return;
  }

  const payload = masterPayload({
    department_id: Number(departmentId),
    department_name: deptNameInput.value.trim(),
    hod_id: deptHODSelect.value || null,
  });

  if (!payload.department_name) {
    setMessage("Department name is required.", "error");
    return;
  }

  const response = await fetch(`${API_BASE_URL}/api/admin/departments/update/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const data = await response.json();
  if (!response.ok || !data.success) {
    setMessage(data.message || "Failed to update department.", "error");
    return;
  }

  setMessage(data.message || "Department updated.", "success");
  await loadDepartmentDetail();
}

async function addBranch(event) {
  event.preventDefault();

  if (!isMasterAdminSession()) {
    setMessage("Admin login required to add branches.", "error");
    return;
  }

  const payload = masterPayload({
    department_id: Number(departmentId),
    branch_id: branchCodeInput.value.trim().toUpperCase(),
    branch_name: branchNameInput.value.trim(),
    college_years: Number(branchCollegeYearsInput.value),
  });

  if (!payload.branch_id || !payload.branch_name || !payload.college_years) {
    setMessage("Branch code, name, and college years are required.", "error");
    return;
  }

  const response = await fetch(`${API_BASE_URL}/api/admin/branches/create/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const data = await response.json();
  if (!response.ok || !data.success) {
    setMessage(data.message || "Failed to add branch.", "error");
    return;
  }

  setMessage(data.message || "Branch added.", "success");
  addBranchForm.reset();
  await loadDepartmentDetail();
}

async function addCourse(event) {
  event.preventDefault();

  if (!isMasterAdminSession()) {
    setMessage("Admin login required to add courses.", "error");
    return;
  }

  const payload = masterPayload({
    department_id: Number(departmentId),
    course_id: courseCodeInput.value.trim().toUpperCase(),
    course_name: courseNameInput.value.trim(),
    credits: Number(courseCreditsInput.value),
  });

  if (!payload.course_id || !payload.course_name || !payload.credits) {
    setMessage("Course code, name, and credits are required.", "error");
    return;
  }

  const response = await fetch(`${API_BASE_URL}/api/admin/departments/courses/create/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const data = await response.json();
  if (!response.ok || !data.success) {
    setMessage(data.message || "Failed to add course.", "error");
    return;
  }

  setMessage(data.message || "Course added.", "success");
  addCourseForm.reset();
  await loadDepartmentDetail();
}

function openBranchEdit(branchId, branchName, collegeYears) {
  originalBranchCodeInput.value = branchId;
  editBranchCodeInput.value = branchId;
  editBranchNameInput.value = branchName;
  editBranchCollegeYearsInput.value = String(collegeYears || "");
  branchModalOverlay.classList.add("active");
  editBranchNameInput.focus();
}

function closeBranchEdit() {
  branchModalOverlay.classList.remove("active");
  editBranchForm.reset();
  originalBranchCodeInput.value = "";
}

async function updateBranch(event) {
  event.preventDefault();

  if (!isMasterAdminSession()) {
    setMessage("Admin login required to update branches.", "error");
    return;
  }

  const payload = masterPayload({
    old_branch_id: originalBranchCodeInput.value.trim(),
    branch_id: editBranchCodeInput.value.trim().toUpperCase(),
    branch_name: editBranchNameInput.value.trim(),
    college_years: Number(editBranchCollegeYearsInput.value),
  });

  if (!payload.old_branch_id || !payload.branch_id || !payload.branch_name || !payload.college_years) {
    setMessage("Branch code, name, and college years are required.", "error");
    return;
  }

  const response = await fetch(`${API_BASE_URL}/api/admin/branches/update/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const data = await response.json();
  if (!response.ok || !data.success) {
    setMessage(data.message || "Failed to update branch.", "error");
    return;
  }

  setMessage(data.message || "Branch updated.", "success");
  closeBranchEdit();
  await loadDepartmentDetail();
}

window.openBranchEdit = openBranchEdit;

closeBranchModalBtn.addEventListener("click", closeBranchEdit);
cancelBranchEditBtn.addEventListener("click", closeBranchEdit);
branchModalOverlay.addEventListener("click", (event) => {
  if (event.target === branchModalOverlay) {
    closeBranchEdit();
  }
});

editDepartmentForm.addEventListener("submit", saveDepartment);
addBranchForm.addEventListener("submit", addBranch);
addCourseForm.addEventListener("submit", addCourse);
editBranchForm.addEventListener("submit", updateBranch);

(async function init() {
  if (!departmentId) {
    setMessage("Department id is missing in URL.", "error");
    return;
  }

  try {
    await loadDepartmentDetail();
    setMessage("Department details loaded.", "success");
  } catch (error) {
    setMessage(error.message || "Failed to load department page.", "error");
  }
})();

