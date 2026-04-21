const API_BASE_URL = "http://127.0.0.1:8000";

const userProfileBody = document.getElementById("userProfileBody");
const marksGradesBody = document.getElementById("marksGradesBody");
const detailMessage = document.getElementById("detailMessage");
const marksGradesCard = document.getElementById("marksGradesCard");
const saveUserBtn = document.getElementById("saveUserBtn");
const deleteUserBtn = document.getElementById("deleteUserBtn");
const editMessage = document.getElementById("editMessage");

const editFullNameInput = document.getElementById("editFullNameInput");
const editEmailInput = document.getElementById("editEmailInput");
const editRoleSelect = document.getElementById("editRoleSelect");
const editRollNoInput = document.getElementById("editRollNoInput");
const editRollNoWrap = document.getElementById("editRollNoWrap");
const editDepartmentSelect = document.getElementById("editDepartmentSelect");
const editBranchWrap = document.getElementById("editBranchWrap");
const editBatchWrap = document.getElementById("editBatchWrap");
const editBranchSelect = document.getElementById("editBranchSelect");
const editBatchSelect = document.getElementById("editBatchSelect");
const editFacultyInfoFields = document.getElementById("editFacultyInfoFields");
const editFacultyDesignationInput = document.getElementById("editFacultyDesignationInput");
const editFacultyHonorInput = document.getElementById("editFacultyHonorInput");
const editFacultyExperienceInput = document.getElementById("editFacultyExperienceInput");
const editFacultyPhoneInput = document.getElementById("editFacultyPhoneInput");
const editFacultyResearchAreaInput = document.getElementById("editFacultyResearchAreaInput");
const editFacultyAddressInput = document.getElementById("editFacultyAddressInput");
const editNewPasswordInput = document.getElementById("editNewPasswordInput");
const editConfirmPasswordInput = document.getElementById("editConfirmPasswordInput");

let departmentsData = [];
let allBatches = [];
let currentUser = null;
let currentFacultyInfo = null;

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

function getUserIdFromQuery() {
  const params = new URLSearchParams(window.location.search);
  return Number(params.get("user_id") || 0);
}

function setEditMessage(text, type) {
  editMessage.textContent = text;
  editMessage.className = `admin-user-message ${type || ""}`.trim();
}

function renderProfile(user, facultyInfo) {
  const commonRows = `
    <tr><td><strong>Name</strong></td><td>${user.full_name || "-"}</td></tr>
    <tr><td><strong>Email</strong></td><td>${user.email || "-"}</td></tr>
    <tr><td><strong>Role</strong></td><td>${user.role || "-"}</td></tr>
    <tr><td><strong>Department</strong></td><td>${user.department || "-"}</td></tr>
  `;

  if (user.role === "faculty") {
    userProfileBody.innerHTML = `
      ${commonRows}
      <tr><td><strong>Designation</strong></td><td>${facultyInfo?.designation || "-"}</td></tr>
      <tr><td><strong>Honor</strong></td><td>${facultyInfo?.honor || "-"}</td></tr>
      <tr><td><strong>Experience</strong></td><td>${facultyInfo?.experience || "-"}</td></tr>
      <tr><td><strong>Phone Number</strong></td><td>${facultyInfo?.phone_number || "-"}</td></tr>
      <tr><td><strong>Research Area</strong></td><td>${facultyInfo?.research_area || "-"}</td></tr>
      <tr><td><strong>Address</strong></td><td>${facultyInfo?.address || "-"}</td></tr>
    `;
    return;
  }

  userProfileBody.innerHTML = `
    ${commonRows}
    <tr><td><strong>Roll No</strong></td><td>${user.roll_no || "-"}</td></tr>
    <tr><td><strong>Branch</strong></td><td>${user.branch || "-"}</td></tr>
    <tr><td><strong>Batch</strong></td><td>${user.batch || "-"}</td></tr>
  `;
}

function renderMarksAndGrades(items) {
  if (!Array.isArray(items) || !items.length) {
    marksGradesBody.innerHTML = '<tr><td colspan="5">No marks or grades data found.</td></tr>';
    return;
  }

  marksGradesBody.innerHTML = items
    .map(
      (item) => `
    <tr>
      <td>${item.course_id || "-"}</td>
      <td>${item.course_name || "-"}</td>
      <td>${item.semester || "-"}</td>
      <td>${item.marks ?? "-"}</td>
      <td>${item.grade || "-"}</td>
    </tr>
  `,
    )
    .join("");
}

function populateDepartmentOptions() {
  editDepartmentSelect.innerHTML = '<option value="">Select department</option>';
  departmentsData.forEach((dept) => {
    const option = document.createElement("option");
    option.value = String(dept.id);
    option.textContent = dept.name;
    editDepartmentSelect.appendChild(option);
  });
}

function populateBranchOptions() {
  editBranchSelect.innerHTML = '<option value="">Select branch</option>';
  const selectedDept = departmentsData.find((dept) => String(dept.id) === editDepartmentSelect.value);
  if (!selectedDept) return;

  (selectedDept.branches || []).forEach((branch) => {
    const option = document.createElement("option");
    option.value = String(branch.id);
    option.textContent = branch.name;
    editBranchSelect.appendChild(option);
  });
}

function populateBatchOptions() {
  editBatchSelect.innerHTML = '<option value="">Select batch</option>';
  const selectedBranchId = String(editBranchSelect.value || "");
  if (!selectedBranchId) return;

  allBatches
    .filter((batch) => String(batch.branch_id || "") === selectedBranchId)
    .forEach((batch) => {
      const option = document.createElement("option");
      option.value = String(batch.id);
      option.textContent = batch.batch_name || batch.label || `Batch ${batch.id}`;
      editBatchSelect.appendChild(option);
    });
}

function applyRoleVisibility() {
  const isStudent = editRoleSelect.value === "student";
  const isFaculty = editRoleSelect.value === "faculty";

  editRollNoWrap.style.display = isStudent ? "block" : "none";
  editBranchWrap.style.display = isStudent ? "block" : "none";
  editBatchWrap.style.display = isStudent ? "block" : "none";
  editFacultyInfoFields.style.display = isFaculty ? "grid" : "none";
}

function hydrateEditForm(user, facultyInfo) {
  editFullNameInput.value = user.full_name || "";
  editEmailInput.value = user.email || "";
  editRoleSelect.value = user.role || "student";
  editRollNoInput.value = user.roll_no || "";

  editDepartmentSelect.value = user.department_id ? String(user.department_id) : "";
  populateBranchOptions();
  editBranchSelect.value = user.branch_id ? String(user.branch_id) : "";
  populateBatchOptions();
  editBatchSelect.value = user.batch_id ? String(user.batch_id) : "";

  editFacultyDesignationInput.value = facultyInfo?.designation || "";
  editFacultyHonorInput.value = facultyInfo?.honor || "";
  editFacultyExperienceInput.value = facultyInfo?.experience || "";
  editFacultyPhoneInput.value = facultyInfo?.phone_number || "";
  editFacultyResearchAreaInput.value = facultyInfo?.research_area || "";
  editFacultyAddressInput.value = facultyInfo?.address || "";

  editNewPasswordInput.value = "";
  editConfirmPasswordInput.value = "";
  applyRoleVisibility();
}

async function loadStaticOptions() {
  const [deptRes, batchRes] = await Promise.all([
    fetch(`${API_BASE_URL}/api/admin/departments-branches/`),
    fetch(`${API_BASE_URL}/api/admin/branch-batches/`),
  ]);

  const deptData = await deptRes.json();
  const batchData = await batchRes.json();

  if (!deptRes.ok || !deptData.success) {
    throw new Error(deptData.message || "Failed to load departments and branches.");
  }

  if (!batchRes.ok || !batchData.success) {
    throw new Error(batchData.message || "Failed to load branch batches.");
  }

  departmentsData = Array.isArray(deptData.departments) ? deptData.departments : [];
  allBatches = Array.isArray(batchData.batches) ? batchData.batches : [];
  populateDepartmentOptions();
}

async function loadUserDetails() {
  const userId = getUserIdFromQuery();

  if (!userId) {
    detailMessage.textContent = "Invalid request: user_id is missing.";
    return;
  }

  const response = await fetch(`${API_BASE_URL}/api/admin/manage-users/detail/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(masterPayload({ user_id: userId })),
  });

  const data = await response.json();
  if (!response.ok || !data.success) {
    throw new Error(data.message || "Failed to load user details.");
  }

  currentUser = data.user || null;
  currentFacultyInfo = data.faculty_info || null;

  renderProfile(currentUser || {}, currentFacultyInfo);
  hydrateEditForm(currentUser || {}, currentFacultyInfo);

  if (currentUser?.role === "faculty") {
    if (marksGradesCard) marksGradesCard.style.display = "none";
  } else {
    if (marksGradesCard) marksGradesCard.style.display = "block";
    renderMarksAndGrades(data.marks_and_grades || []);
  }

  detailMessage.textContent = "";
  setEditMessage("", "");
}

async function saveUserChanges() {
  if (!currentUser) return;

  const role = editRoleSelect.value;
  const email = editEmailInput.value.trim().toLowerCase();
  const payload = masterPayload({
    user_id: currentUser.id,
    role,
    username: email,
    full_name: editFullNameInput.value.trim(),
    email,
    roll_no: role === "student" ? editRollNoInput.value.trim().toUpperCase() : null,
    department_id: editDepartmentSelect.value || null,
    branch_id: role === "student" ? (editBranchSelect.value || null) : null,
    batch_id: role === "student" ? (editBatchSelect.value || null) : null,
    faculty_name: role === "faculty" ? editFullNameInput.value.trim() : null,
    faculty_email: role === "faculty" ? email : null,
    faculty_designation: role === "faculty" ? editFacultyDesignationInput.value.trim() : "",
    faculty_honor: role === "faculty" ? editFacultyHonorInput.value.trim() : "",
    faculty_experience: role === "faculty" ? editFacultyExperienceInput.value.trim() : "",
    faculty_phone_number: role === "faculty" ? editFacultyPhoneInput.value.trim() : "",
    faculty_research_area: role === "faculty" ? editFacultyResearchAreaInput.value.trim() : "",
    faculty_address: role === "faculty" ? editFacultyAddressInput.value.trim() : "",
    new_password: editNewPasswordInput.value,
    confirm_password: editConfirmPasswordInput.value,
  });

  if (!payload.full_name || !payload.email || !payload.role) {
    setEditMessage("Name, email and role are required.", "error");
    return;
  }

  if (!payload.department_id) {
    setEditMessage("Department is required.", "error");
    return;
  }

  if (payload.role === "student" && (!payload.roll_no || !payload.branch_id || !payload.batch_id)) {
    setEditMessage("Roll no, branch and batch are required for students.", "error");
    return;
  }

  if (payload.new_password || payload.confirm_password) {
    if (payload.new_password.length < 8) {
      setEditMessage("Password must be at least 8 characters.", "error");
      return;
    }
    if (payload.new_password !== payload.confirm_password) {
      setEditMessage("Passwords do not match.", "error");
      return;
    }
  }

  saveUserBtn.disabled = true;
  setEditMessage("Saving user...", "");

  try {
    const response = await fetch(`${API_BASE_URL}/api/admin/manage-users/update/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    if (!response.ok || !data.success) {
      setEditMessage(data.message || "Failed to update user.", "error");
      return;
    }

    setEditMessage("User updated successfully.", "success");
    await loadUserDetails();
  } catch (error) {
    setEditMessage("Cannot connect to backend.", "error");
  } finally {
    saveUserBtn.disabled = false;
  }
}

async function deleteCurrentUser() {
  if (!currentUser) return;
  const confirmed = window.confirm(`Delete user ${currentUser.email || currentUser.username}?`);
  if (!confirmed) return;

  deleteUserBtn.disabled = true;
  setEditMessage("Deleting user...", "");

  try {
    const response = await fetch(`${API_BASE_URL}/api/admin/manage-users/delete/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(masterPayload({ user_id: currentUser.id })),
    });

    const data = await response.json();
    if (!response.ok || !data.success) {
      setEditMessage(data.message || "Failed to delete user.", "error");
      return;
    }

    window.location.href = "manage-users.html";
  } catch (error) {
    setEditMessage("Cannot connect to backend.", "error");
  } finally {
    deleteUserBtn.disabled = false;
  }
}

editRoleSelect.addEventListener("change", applyRoleVisibility);
editDepartmentSelect.addEventListener("change", () => {
  populateBranchOptions();
  populateBatchOptions();
});
editBranchSelect.addEventListener("change", populateBatchOptions);
saveUserBtn.addEventListener("click", saveUserChanges);
deleteUserBtn.addEventListener("click", deleteCurrentUser);

(async function init() {
  try {
    await loadStaticOptions();
    await loadUserDetails();
  } catch (error) {
    detailMessage.textContent = error.message || "Failed to load user details.";
    userProfileBody.innerHTML = '<tr><td colspan="2">Failed to load profile.</td></tr>';
    marksGradesBody.innerHTML = '<tr><td colspan="5">No data.</td></tr>';
  }
})();

