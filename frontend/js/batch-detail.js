const API_BASE_URL = "http://127.0.0.1:8000";

const params = new URLSearchParams(window.location.search);
const batchId = params.get("batch_id");

const batchTitle = document.getElementById("batchTitle");
const batchBackBtn = document.getElementById("batchBackBtn");
const batchSummaryCards = document.getElementById("batchSummaryCards");
const batchDetailMessage = document.getElementById("batchDetailMessage");
const batchDetailTableBody = document.getElementById("batchDetailTableBody");
const batchEditForm = document.getElementById("batchEditForm");
const batchDepartmentInput = document.getElementById("batchDepartmentInput");
const batchBranchInput = document.getElementById("batchBranchInput");
const batchYearInput = document.getElementById("batchYearInput");
const batchCollegeYearInput = document.getElementById("batchCollegeYearInput");
const batchNameInput = document.getElementById("batchNameInput");

let currentBatch = null;

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

function getAutoBatchName(branchId, semesterValue) {
  const semester = Number(semesterValue);
  if (!branchId || !semester || semester < 1 || semester > 8) {
    return "";
  }
  const roman = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII"][semester] || "";
  return roman ? `${String(branchId).toUpperCase()}-${roman}` : "";
}

function syncBatchNamePreview() {
  batchNameInput.value = getAutoBatchName(currentBatch?.branch_id, batchYearInput.value);
}

function setMessage(message, type) {
  batchDetailMessage.textContent = message;
  batchDetailMessage.className = `admin-user-message ${type || ""}`.trim();
}

function isMasterAdminSession() {
  const adminSession = getAdminSession();
  return !!(adminSession && adminSession.password);
}

function handleBackClick(event) {
  event.preventDefault();
  if (window.history.length > 1) {
    window.history.back();
    return;
  }
  window.location.href = "departments.html";
}

async function loadBatchDetail() {
  const response = await fetch(`${API_BASE_URL}/api/admin/branch-batches/${batchId}/`);
  const data = await response.json();
  if (!response.ok || !data.success) {
    throw new Error(data.message || "Failed to load batch details.");
  }

  const batch = data.batch;
  currentBatch = batch;
  batchTitle.textContent = batch.label;
  batchSummaryCards.innerHTML = `
    <div class="card"><h3>Department</h3><p>${batch.department_name}</p></div>
    <div class="card"><h3>Branch</h3><p>${batch.branch_name}</p></div>
    <div class="card"><h3>Semester</h3><p>${batch.semester_roman || batch.semester || batch.year}</p></div>
    <div class="card"><h3>College Year</h3><p>${batch.college_year || "-"}</p></div>
  `;

  batchDepartmentInput.value = batch.department_name;
  batchBranchInput.value = batch.branch_name;
  batchYearInput.value = String(batch.semester || batch.year || "");
  batchCollegeYearInput.value = String(batch.college_year || "");
  syncBatchNamePreview();

  batchDetailTableBody.innerHTML = `
    <tr><td><strong>Batch Name</strong></td><td>${batch.batch_name}</td></tr>
    <tr><td><strong>Department</strong></td><td>${batch.department_name}</td></tr>
    <tr><td><strong>Branch</strong></td><td>${batch.branch_name}</td></tr>
    <tr><td><strong>Semester</strong></td><td>${batch.semester_roman || batch.semester || batch.year}</td></tr>
    <tr><td><strong>College Year</strong></td><td>${batch.college_year || "-"}</td></tr>
    <tr><td><strong>Batch Id</strong></td><td>${batch.id}</td></tr>
  `;
}

async function saveBatch(event) {
  event.preventDefault();

  if (!isMasterAdminSession()) {
    setMessage("Admin login required to edit batch details.", "error");
    return;
  }

  const payload = {
    admin_username: getAdminSession() ? getAdminSession().username : "",
    admin_password: getAdminSession() ? getAdminSession().password : "",
    batch_id: Number(batchId),
    semester: Number(batchYearInput.value),
    college_year: Number(batchCollegeYearInput.value),
  };

  if (!payload.semester || !payload.college_year) {
    setMessage("Semester and college year are required.", "error");
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

  setMessage(data.message || "Batch updated successfully.", "success");
  await loadBatchDetail();
}

(async function init() {
  if (!batchId) {
    setMessage("Batch id is missing in URL.", "error");
    return;
  }

  try {
    if (!isMasterAdminSession()) {
      setMessage("Admin login required to view batch details.", "error");
      return;
    }

    await loadBatchDetail();
    setMessage("Batch details loaded.", "success");
  } catch (error) {
    setMessage(error.message || "Failed to load batch page.", "error");
  }
})();

batchEditForm.addEventListener("submit", saveBatch);
batchYearInput.addEventListener("change", syncBatchNamePreview);
if (batchBackBtn) {
  batchBackBtn.addEventListener("click", handleBackClick);
}

