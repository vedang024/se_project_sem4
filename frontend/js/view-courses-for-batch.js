const API_BASE_URL = "http://127.0.0.1:8000";

const departmentSelect = document.getElementById("departmentSelect");
const branchSelect = document.getElementById("branchSelect");
const batchSelect = document.getElementById("batchSelect");
const filterForm = document.getElementById("filterForm");
const filterMessage = document.getElementById("filterMessage");
const coursesTableBody = document.getElementById("coursesTableBody");
const batchInfo = document.getElementById("batchInfo");
const infoBatchName = document.getElementById("infoBatchName");

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
  batchInfo.style.display = "none";
  coursesTableBody.innerHTML = '<tr><td colspan="4">Select a batch to view assigned courses.</td></tr>';
}

async function populateBatchOptions() {
  batchSelect.innerHTML = '<option value="">Loading...</option>';
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

async function loadCourses(event) {
  event.preventDefault();

  if (!isMasterAdminSession()) {
    setMessage("Admin login required to view batch courses.", "error");
    return;
  }

  const batchId = Number(batchSelect.value);
  if (!batchId) {
    setMessage("Select a batch.", "error");
    return;
  }

  try {
    const response = await fetch(`${API_BASE_URL}/api/admin/batches/${batchId}/courses/`);
    const data = await response.json();
    if (!response.ok || !data.success) {
      setMessage(data.message || "Failed to load courses.", "error");
      batchInfo.style.display = "none";
      coursesTableBody.innerHTML = '<tr><td colspan="4">No data to display.</td></tr>';
      return;
    }

    const courses = data.courses || [];
    infoBatchName.textContent = data.batch_name || "N/A";
    batchInfo.style.display = "block";

    if (!courses.length) {
      setMessage("No courses assigned to this batch.", "info");
      coursesTableBody.innerHTML = '<tr><td colspan="4">No courses found.</td></tr>';
      return;
    }

    setMessage(`Found ${courses.length} course(s).`, "success");
    coursesTableBody.innerHTML = courses.map((course) => `
      <tr>
        <td>${course.id}</td>
        <td>${course.name}</td>
        <td>${course.credits}</td>
        <td>${course.department}</td>
      </tr>
    `).join("");
  } catch (error) {
    setMessage("Cannot connect to backend.", "error");
  }
}

departmentSelect.addEventListener("change", populateBranchOptions);
branchSelect.addEventListener("change", populateBatchOptions);
filterForm.addEventListener("submit", loadCourses);

(async function init() {
  if (!isMasterAdminSession()) {
    setMessage("Admin login required to view batch courses.", "error");
    filterForm.style.display = "none";
    return;
  }

  await loadDepartments();
  setMessage("View courses for batch page loaded.", "success");
})();

