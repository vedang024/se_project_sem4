const API_BASE_URL = "http://127.0.0.1:8000";
const MASTER_ADMIN_USERNAME = "masterAdmin@erp.ac.in";
const MASTER_ADMIN_PASSWORD = "masterAdmin@123";

const departmentsGrid = document.getElementById("departmentsGrid");
const deptModalOverlay = document.getElementById("deptModalOverlay");
const deptForm = document.getElementById("deptForm");
const deptNameInput = document.getElementById("deptNameInput");
const deptHODSelect = document.getElementById("deptHODSelect");
const deptModalTitle = document.getElementById("deptModalTitle");
const departmentsMessage = document.getElementById("departmentsMessage");

let departments = [];
let facultyOptions = [];
let editingDepartmentId = null;

function masterPayload(extra = {}) {
  return {
    admin_username: MASTER_ADMIN_USERNAME,
    admin_password: MASTER_ADMIN_PASSWORD,
    ...extra,
  };
}

function setDepartmentsMessage(message, type) {
  departmentsMessage.textContent = message;
  departmentsMessage.className = `admin-user-message ${type || ""}`.trim();
}

function isMasterAdminSession() {
  const user = JSON.parse(localStorage.getItem("erp_user") || "null");
  return !!(user && user.role === "admin" && user.username === MASTER_ADMIN_USERNAME && user.is_master_admin);
}

function renderDepartments() {
  if (!departments.length) {
    departmentsGrid.innerHTML = `
      <div class="card">
        <h3>No Departments Yet</h3>
        <p>Create your first department using the Add Department button.</p>
      </div>
    `;
    return;
  }

  departmentsGrid.innerHTML = departments.map((dept) => `
    <div class="card">
      <div class="dept-header">
        <div class="dept-icon">${(dept.name || "D").slice(0, 2).toUpperCase()}</div>
        <h3>${dept.name}</h3>
      </div>
      <div class="dept-stats">
        <div class="stat-item">
          <span class="stat-label">HOD</span>
          <span class="stat-value">${dept.hod_name || "Not Assigned"}</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">Faculty</span>
          <span class="stat-value">${dept.faculty_count}</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">Courses</span>
          <span class="stat-value">${dept.course_count}</span>
        </div>
      </div>
      <div class="dept-actions">
        <div class="dept-action-row">
          <a class="btn btn-secondary btn-sm" href="department-detail.html?department_id=${dept.id}">Open</a>
          <button class="btn btn-secondary btn-sm" onclick="openDeptModal(${dept.id})">Quick Edit</button>
        </div>
      </div>
    </div>
  `).join("");
}

function populateHODOptions(selectedHodId = "") {
  deptHODSelect.innerHTML = '<option value="">Select HOD (optional)</option>';

  facultyOptions.forEach((faculty) => {
    const option = document.createElement("option");
    option.value = String(faculty.id);
    option.textContent = `${faculty.name} (${faculty.department_name || "No Dept"})`;
    deptHODSelect.appendChild(option);
  });

  if (selectedHodId) {
    deptHODSelect.value = String(selectedHodId);
  }
}

async function loadFacultyOptions() {
  const response = await fetch(`${API_BASE_URL}/api/admin/faculty-options/`);
  const data = await response.json();
  if (!response.ok || !data.success) {
    throw new Error(data.message || "Failed to load faculty options");
  }
  facultyOptions = Array.isArray(data.faculty) ? data.faculty : [];
}

async function loadDepartments() {
  const response = await fetch(`${API_BASE_URL}/api/admin/departments/`);
  const data = await response.json();
  if (!response.ok || !data.success) {
    throw new Error(data.message || "Failed to load departments");
  }
  departments = Array.isArray(data.departments) ? data.departments : [];
  renderDepartments();
}

function openDeptModal(departmentId = null) {
  editingDepartmentId = departmentId;
  const dept = departments.find((d) => d.id === departmentId);

  deptModalTitle.textContent = dept ? "Edit Department" : "Add Department";
  deptNameInput.value = dept ? dept.name : "";
  populateHODOptions(dept ? dept.hod_id : "");

  deptModalOverlay.classList.add("active");
  deptNameInput.focus();
}

function closeDeptModal() {
  deptModalOverlay.classList.remove("active");
  deptForm.reset();
  editingDepartmentId = null;
}

async function saveDepartment(event) {
  event.preventDefault();

  if (!isMasterAdminSession()) {
    setDepartmentsMessage("Only master admin can add/edit departments.", "error");
    return;
  }

  const department_name = deptNameInput.value.trim();
  const hod_id = deptHODSelect.value || null;

  if (!department_name) {
    setDepartmentsMessage("Department name is required.", "error");
    return;
  }

  const endpoint = editingDepartmentId
    ? `${API_BASE_URL}/api/admin/departments/update/`
    : `${API_BASE_URL}/api/admin/departments/create/`;

  const payload = masterPayload({
    department_id: editingDepartmentId,
    department_name,
    hod_id,
  });

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    if (!response.ok || !data.success) {
      setDepartmentsMessage(data.message || "Unable to save department.", "error");
      return;
    }

    setDepartmentsMessage(data.message || "Department saved.", "success");
    closeDeptModal();
    await loadDepartments();
  } catch (error) {
    setDepartmentsMessage("Cannot connect to backend. Make sure Django server is running.", "error");
  }
}

async function initDepartmentsAdmin() {
  if (!isMasterAdminSession()) {
    setDepartmentsMessage("Only master admin can manage departments.", "error");
  }

  try {
    await loadFacultyOptions();
    await loadDepartments();
    setDepartmentsMessage("Departments loaded.", "success");
  } catch (error) {
    setDepartmentsMessage(error.message || "Failed to load department management data.", "error");
  }
}

window.openDeptModal = openDeptModal;
window.closeDeptModal = closeDeptModal;

document.getElementById("addDeptBtn").addEventListener("click", () => openDeptModal());
document.getElementById("closeDeptModalBtn").addEventListener("click", closeDeptModal);
deptModalOverlay.addEventListener("click", (event) => {
  if (event.target === deptModalOverlay) {
    closeDeptModal();
  }
});
deptForm.addEventListener("submit", saveDepartment);

initDepartmentsAdmin();
