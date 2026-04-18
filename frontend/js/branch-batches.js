const API_BASE_URL = "http://127.0.0.1:8000";
const MASTER_ADMIN_USERNAME = "masterAdmin@erp.ac.in";
const MASTER_ADMIN_PASSWORD = "masterAdmin@123";

const params = new URLSearchParams(window.location.search);
const departmentId = params.get("department_id");
const branchId = params.get("branch_id");

const branchBatchesTitle = document.getElementById("branchBatchesTitle");
const branchSummaryCards = document.getElementById("branchSummaryCards");
const backToDepartmentLink = document.getElementById("backToDepartmentLink");
const branchBatchesMessage = document.getElementById("branchBatchesMessage");
const branchBatchesTableBody = document.getElementById("branchBatchesTableBody");

const addBatchForm = document.getElementById("addBatchForm");
const batchSemesterInput = document.getElementById("batchSemesterInput");
const batchCollegeYearInput = document.getElementById("batchCollegeYearInput");
const batchNamePreviewInput = document.getElementById("batchNamePreviewInput");

const editBatchForm = document.getElementById("editBatchForm");
const editBatchIdInput = document.getElementById("editBatchIdInput");
const editBatchSemesterInput = document.getElementById("editBatchSemesterInput");
const editBatchCollegeYearInput = document.getElementById("editBatchCollegeYearInput");
const editBatchNamePreviewInput = document.getElementById("editBatchNamePreviewInput");

let departmentData = null;
let selectedBranch = null;
let branchBatches = [];

function masterPayload(extra = {}) {
  return {
    admin_username: MASTER_ADMIN_USERNAME,
    admin_password: MASTER_ADMIN_PASSWORD,
    ...extra,
  };
}

function setMessage(message, type) {
  branchBatchesMessage.textContent = message;
  branchBatchesMessage.className = `admin-user-message ${type || ""}`.trim();
}

function isMasterAdminSession() {
  const user = JSON.parse(localStorage.getItem("erp_user") || "null");
  return !!(user && user.role === "admin" && user.username === MASTER_ADMIN_USERNAME && user.is_master_admin);
}

function getAutoBatchName(semesterValue) {
  const semester = Number(semesterValue);
  if (!selectedBranch?.id || !semester || semester < 1 || semester > 8) {
    return "";
  }

  const roman = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII"][semester] || "";
  return roman ? `${String(selectedBranch.id).toUpperCase()}-${roman}` : "";
}

function syncAddNamePreview() {
  batchNamePreviewInput.value = getAutoBatchName(batchSemesterInput.value);
}

function syncEditNamePreview() {
  editBatchNamePreviewInput.value = getAutoBatchName(editBatchSemesterInput.value);
}

function resetEditForm() {
  editBatchForm.reset();
  editBatchIdInput.value = "";
  editBatchNamePreviewInput.value = "";
}

function startEditBatch(batchId, semester, collegeYear) {
  editBatchIdInput.value = String(batchId);
  editBatchSemesterInput.value = String(semester || "");
  editBatchCollegeYearInput.value = String(collegeYear || "");
  syncEditNamePreview();
}

function renderSummary() {
  if (!departmentData || !selectedBranch) return;

  branchBatchesTitle.textContent = `${selectedBranch.name} Batches`;
  backToDepartmentLink.href = `department-detail.html?department_id=${departmentData.id}`;

  branchSummaryCards.innerHTML = `
    <div class="card"><h3>Department</h3><p>${departmentData.name}</p></div>
    <div class="card"><h3>Branch Code</h3><p>${selectedBranch.id}</p></div>
    <div class="card"><h3>College Years</h3><p>${selectedBranch.college_years || "-"}</p></div>
    <div class="card"><h3>Total Batches</h3><p>${branchBatches.length}</p></div>
  `;
}

function populateCollegeYearOptions() {
  const maxYears = Number(selectedBranch?.college_years || 4);
  const createOptions = (selectElement) => {
    if (!selectElement) return;
    selectElement.innerHTML = '<option value="">Select college year</option>';
    for (let year = 1; year <= maxYears; year += 1) {
      const option = document.createElement("option");
      option.value = String(year);
      option.textContent = `${year}${year === 1 ? "st" : year === 2 ? "nd" : year === 3 ? "rd" : "th"} Year`;
      selectElement.appendChild(option);
    }
  };

  createOptions(batchCollegeYearInput);
  createOptions(editBatchCollegeYearInput);
}

function renderBatchesTable() {
  const batches = branchBatches;
  if (!batches.length) {
    branchBatchesTableBody.innerHTML = '<tr><td colspan="4">No batches created for this branch yet.</td></tr>';
    return;
  }

  branchBatchesTableBody.innerHTML = batches.map((batch) => `
    <tr>
      <td>${batch.batch_name}</td>
      <td>${batch.semester_roman || batch.semester || "-"}</td>
      <td>${batch.college_year || "-"}</td>
      <td>
        <div class="dept-action-row">
          <a class="btn btn-secondary btn-sm" href="batch-detail.html?batch_id=${batch.id}">Open</a>
          <button class="btn btn-secondary btn-sm" onclick="startEditBatch(${batch.id}, ${batch.semester || "null"}, ${batch.college_year || "null"})">Edit</button>
          <button class="btn btn-secondary btn-sm" onclick="deleteBranchBatch(${batch.id}, '${batch.batch_name.replace(/'/g, "\\'")}')">Delete</button>
        </div>
      </td>
    </tr>
  `).join("");
}

function normalizeBranchBatch(batch) {
  return {
    id: batch.id,
    semester: batch.semester || batch.year || null,
    semester_roman: batch.semester_roman || "",
    college_year: batch.college_year || null,
    batch_name: batch.batch_name || "",
  };
}

async function loadBranchData() {
  const response = await fetch(`${API_BASE_URL}/api/admin/departments/${departmentId}/?_ts=${Date.now()}`, {
    cache: "no-store",
  });
  const data = await response.json();

  if (!response.ok || !data.success) {
    throw new Error(data.message || "Failed to load department details.");
  }

  departmentData = data.department;
  selectedBranch = (departmentData.branches || []).find((branch) => String(branch.id) === String(branchId));

  if (!selectedBranch) {
    throw new Error("Selected branch was not found in this department.");
  }

  const batchResponse = await fetch(`${API_BASE_URL}/api/admin/branch-batches/?_ts=${Date.now()}`, {
    cache: "no-store",
  });
  const batchData = await batchResponse.json();
  if (!batchResponse.ok || !batchData.success) {
    throw new Error(batchData.message || "Failed to load branch batches.");
  }

  branchBatches = (batchData.batches || [])
    .filter((batch) => String(batch.branch_id) === String(selectedBranch.id))
    .map(normalizeBranchBatch);

  renderSummary();
  populateCollegeYearOptions();
  renderBatchesTable();
}

async function addBatch(event) {
  event.preventDefault();

  if (!isMasterAdminSession()) {
    setMessage("Only master admin can add batches.", "error");
    return;
  }

  const payload = masterPayload({
    branch_id: selectedBranch.id,
    semester: Number(batchSemesterInput.value),
    college_year: Number(batchCollegeYearInput.value),
  });

  if (!payload.semester || !payload.college_year) {
    setMessage("Semester and college year are required.", "error");
    return;
  }

  const response = await fetch(`${API_BASE_URL}/api/admin/branches/batches/create/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const data = await response.json();
  if (!response.ok || !data.success) {
    setMessage(data.message || "Failed to add batch.", "error");
    return;
  }

  setMessage(data.message || "Batch added.", "success");
  addBatchForm.reset();
  batchNamePreviewInput.value = "";
  await loadBranchData();
}

async function updateBatch(event) {
  event.preventDefault();

  if (!isMasterAdminSession()) {
    setMessage("Only master admin can edit batches.", "error");
    return;
  }

  const payload = masterPayload({
    batch_id: Number(editBatchIdInput.value),
    semester: Number(editBatchSemesterInput.value),
    college_year: Number(editBatchCollegeYearInput.value),
  });

  if (!payload.batch_id || !payload.semester || !payload.college_year) {
    setMessage("Select a batch and provide semester + college year.", "error");
    return;
  }

  const response = await fetch(`${API_BASE_URL}/api/admin/branches/batches/update/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const data = await response.json();
  if (!response.ok || !data.success) {
    setMessage(data.message || "Failed to update batch.", "error");
    return;
  }

  setMessage(data.message || "Batch updated.", "success");
  await loadBranchData();
  resetEditForm();
}

async function deleteBranchBatch(batchId, batchName) {
  if (!isMasterAdminSession()) {
    setMessage("Only master admin can delete batches.", "error");
    return;
  }

  const confirmed = window.confirm(`Delete batch ${batchName}? This will also remove it from the timetable.`);
  if (!confirmed) return;

  const response = await fetch(`${API_BASE_URL}/api/admin/branches/batches/delete/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(masterPayload({ batch_id: Number(batchId) })),
  });

  const data = await response.json();
  if (!response.ok || !data.success) {
    setMessage(data.message || "Failed to delete batch.", "error");
    return;
  }

  setMessage(data.message || "Batch deleted.", "success");
  await loadBranchData();
}

window.startEditBatch = startEditBatch;
window.deleteBranchBatch = deleteBranchBatch;

addBatchForm.addEventListener("submit", addBatch);
editBatchForm.addEventListener("submit", updateBatch);
batchSemesterInput.addEventListener("change", syncAddNamePreview);
editBatchSemesterInput.addEventListener("change", syncEditNamePreview);

(async function init() {
  if (!departmentId || !branchId) {
    setMessage("Department id or branch id is missing in URL.", "error");
    return;
  }

  try {
    await loadBranchData();
    setMessage("Branch batches loaded.", "success");
  } catch (error) {
    setMessage(error.message || "Failed to load branch batches page.", "error");
  }
})();
