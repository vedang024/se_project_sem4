const API_BASE_URL = "http://127.0.0.1:8000";
const MASTER_ADMIN_USERNAME = "masterAdmin@erp.ac.in";
const MASTER_ADMIN_PASSWORD = "masterAdmin@123";

const roleFilter = document.getElementById("roleFilter");
const refreshUsersBtn = document.getElementById("refreshUsersBtn");
const manageUsersBody = document.getElementById("manageUsersBody");
const manageUsersMessage = document.getElementById("manageUsersMessage");
const createUserForm = document.getElementById("createUserForm");
const createUserButton = document.getElementById("createUserButton");
const createUserMessage = document.getElementById("createUserMessage");
const roleField = document.getElementById("newRole");
const roleMetaFields = document.getElementById("roleMetaFields");
const facultyMetaFields = document.getElementById("facultyMetaFields");
const departmentFieldWrap = document.getElementById("departmentFieldWrap");
const branchFieldWrap = document.getElementById("branchFieldWrap");
const batchFieldWrap = document.getElementById("batchFieldWrap");
const departmentSelect = document.getElementById("departmentSelect");
const branchSelect = document.getElementById("branchSelect");
const batchSelect = document.getElementById("batchSelect");
const newUsername = document.getElementById("newUsername");
const newFacultyName = document.getElementById("newFacultyName");
const newFacultyEmail = document.getElementById("newFacultyEmail");
const editUserModalOverlay = document.getElementById("editUserModalOverlay");
const closeEditUserModalBtn = document.getElementById("closeEditUserModalBtn");
const cancelEditUserBtn = document.getElementById("cancelEditUserBtn");
const editUserForm = document.getElementById("editUserForm");
const editUserMessage = document.getElementById("editUserMessage");
const editUserIdInput = document.getElementById("editUserIdInput");
const editUsernameInput = document.getElementById("editUsernameInput");
const editRoleSelect = document.getElementById("editRoleSelect");
const editDepartmentSelect = document.getElementById("editDepartmentSelect");
const editBranchSelect = document.getElementById("editBranchSelect");
const editBatchSelect = document.getElementById("editBatchSelect");
const editBranchFieldWrap = document.getElementById("editBranchFieldWrap");
const editBatchFieldWrap = document.getElementById("editBatchFieldWrap");
const editFacultyMetaFields = document.getElementById("editFacultyMetaFields");
const editFacultyNameInput = document.getElementById("editFacultyNameInput");
const editFacultyEmailInput = document.getElementById("editFacultyEmailInput");
const editNewPasswordInput = document.getElementById("editNewPasswordInput");
const editConfirmPasswordInput = document.getElementById("editConfirmPasswordInput");

let departmentsData = [];
let managedUsers = [];
let allBatches = [];

function extractBranchCodeFromIdentifier(identifier) {
  const localPart = String(identifier || "").trim().split("@", 1)[0];
  const match = localPart.match(/^([a-zA-Z]+)/);
  return match ? match[1].toUpperCase() : "";
}

function autoAssignStudentBranchFromIdentifier(identifier, context = "create") {
  const inferredCode = extractBranchCodeFromIdentifier(identifier);
  if (!inferredCode) return;

  let matchedDepartment = null;
  let matchedBranch = null;

  departmentsData.forEach((dept) => {
    (dept.branches || []).forEach((branch) => {
      if (String(branch.id || "").toUpperCase() === inferredCode) {
        matchedDepartment = dept;
        matchedBranch = branch;
      }
    });
  });

  if (!matchedDepartment || !matchedBranch) return;

  if (context === "create") {
    departmentSelect.value = String(matchedDepartment.id);
    populateBranchOptions();
    branchSelect.value = String(matchedBranch.id);
    populateBatchOptions();
  } else {
    editDepartmentSelect.value = String(matchedDepartment.id);
    populateEditBranchOptions();
    editBranchSelect.value = String(matchedBranch.id);
    populateEditBatchOptions();
  }
}

function setManageMessage(message, type) {
  manageUsersMessage.textContent = message;
  manageUsersMessage.className = `admin-user-message ${type || ""}`.trim();
}

function setCreateMessage(message, type) {
  if (!createUserMessage) return;
  createUserMessage.textContent = message;
  createUserMessage.className = `admin-user-message ${type || ""}`.trim();
}

function setEditMessage(message, type) {
  if (!editUserMessage) return;
  editUserMessage.textContent = message;
  editUserMessage.className = `admin-user-message ${type || ""}`.trim();
}

function isMasterAdminSession() {
  const user = JSON.parse(localStorage.getItem("erp_user") || "null");
  return !!(user && user.username === MASTER_ADMIN_USERNAME && user.is_master_admin);
}

function masterPayload(extra = {}) {
  return {
    admin_username: MASTER_ADMIN_USERNAME,
    admin_password: MASTER_ADMIN_PASSWORD,
    ...extra,
  };
}

function setRoleMetaVisibility() {
  if (!roleField || !roleMetaFields) return;

  const role = roleField.value;
  const needsDepartment = role === "student" || role === "faculty";
  const needsBranch = role === "student";
  const needsBatch = role === "student";
  const needsFacultyMeta = role === "faculty";

  roleMetaFields.style.display = needsDepartment ? "grid" : "none";
  if (facultyMetaFields) {
    facultyMetaFields.style.display = needsFacultyMeta ? "grid" : "none";
  }

  if (departmentFieldWrap) {
    departmentFieldWrap.style.display = needsDepartment ? "block" : "none";
  }

  if (branchFieldWrap) {
    branchFieldWrap.style.display = needsBranch ? "block" : "none";
  }

  if (batchFieldWrap) {
    batchFieldWrap.style.display = needsBatch ? "block" : "none";
  }

  if (!needsFacultyMeta) {
    if (newFacultyName) newFacultyName.value = "";
    if (newFacultyEmail) newFacultyEmail.value = "";
  }
}

function populateDepartmentOptions() {
  if (!departmentSelect) return;

  departmentSelect.innerHTML = '<option value="">Select department</option>';
  departmentsData.forEach((dept) => {
    const option = document.createElement("option");
    option.value = String(dept.id);
    option.textContent = dept.name;
    departmentSelect.appendChild(option);
  });
}

function populateEditDepartmentOptions() {
  if (!editDepartmentSelect) return;

  editDepartmentSelect.innerHTML = '<option value="">Select department</option>';
  departmentsData.forEach((dept) => {
    const option = document.createElement("option");
    option.value = String(dept.id);
    option.textContent = dept.name;
    editDepartmentSelect.appendChild(option);
  });
}

function populateBranchOptions() {
  if (!branchSelect) return;

  branchSelect.innerHTML = '<option value="">Select branch</option>';
  const selectedDept = departmentsData.find((dept) => String(dept.id) === departmentSelect.value);
  if (!selectedDept) return;

  (selectedDept.branches || []).forEach((branch) => {
    const option = document.createElement("option");
    option.value = String(branch.id);
    option.textContent = branch.name;
    branchSelect.appendChild(option);
  });

  populateBatchOptions();
}

function populateBatchOptions() {
  if (!batchSelect) return;

  batchSelect.innerHTML = '<option value="">Select batch</option>';
  const selectedBranchId = String(branchSelect.value || "");
  if (!selectedBranchId) return;

  allBatches
    .filter((batch) => String(batch.branch_id || "") === selectedBranchId)
    .forEach((batch) => {
      const option = document.createElement("option");
      option.value = String(batch.id);
      option.textContent = batch.batch_name || batch.label || `Batch ${batch.id}`;
      batchSelect.appendChild(option);
    });
}

function populateEditBranchOptions() {
  if (!editBranchSelect) return;

  editBranchSelect.innerHTML = '<option value="">Select branch</option>';
  const selectedDept = departmentsData.find((dept) => String(dept.id) === editDepartmentSelect.value);
  if (!selectedDept) return;

  (selectedDept.branches || []).forEach((branch) => {
    const option = document.createElement("option");
    option.value = String(branch.id);
    option.textContent = branch.name;
    editBranchSelect.appendChild(option);
  });

  populateEditBatchOptions();
}

function populateEditBatchOptions() {
  if (!editBatchSelect) return;

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

async function loadBranchBatches() {
  try {
    const response = await fetch(`${API_BASE_URL}/api/admin/branch-batches/`);
    const data = await response.json();
    if (!response.ok || !data.success) {
      allBatches = [];
      return;
    }

    allBatches = Array.isArray(data.batches) ? data.batches : [];
    populateBatchOptions();
    populateEditBatchOptions();
  } catch (error) {
    allBatches = [];
  }
}

async function loadDepartmentsBranches() {
  if (!departmentSelect) return;

  try {
    const response = await fetch(`${API_BASE_URL}/api/admin/departments-branches/`);
    const data = await response.json();
    if (!response.ok || !data.success) {
      setCreateMessage(data.message || "Failed to load departments and branches.", "error");
      return;
    }

    departmentsData = Array.isArray(data.departments) ? data.departments : [];
    populateDepartmentOptions();
    populateEditDepartmentOptions();
    populateBranchOptions();
  } catch (error) {
    setCreateMessage("Cannot load departments and branches from backend.", "error");
  }
}

function setEditRoleMetaVisibility() {
  if (!editRoleSelect) return;

  const role = editRoleSelect.value;
  const needsBranch = role === "student";
  const needsBatch = role === "student";
  const needsFacultyMeta = role === "faculty";

  if (editBranchFieldWrap) {
    editBranchFieldWrap.style.display = needsBranch ? "block" : "none";
  }

  if (editBatchFieldWrap) {
    editBatchFieldWrap.style.display = needsBatch ? "block" : "none";
  }

  if (editFacultyMetaFields) {
    editFacultyMetaFields.style.display = needsFacultyMeta ? "grid" : "none";
  }

  if (!needsBranch && editBranchSelect) {
    editBranchSelect.value = "";
  }

  if (!needsBatch && editBatchSelect) {
    editBatchSelect.value = "";
  }

  if (!needsFacultyMeta) {
    if (editFacultyNameInput) editFacultyNameInput.value = "";
    if (editFacultyEmailInput) editFacultyEmailInput.value = "";
  }
}

function validateCreatePayload(payload) {
  if (!payload.username || !payload.password || !payload.confirm_password || !payload.role) {
    return "Please fill all fields.";
  }

  if (payload.password.length < 8) {
    return "Password must be at least 8 characters.";
  }

  if (payload.password !== payload.confirm_password) {
    return "Passwords do not match.";
  }

  if (payload.role === "faculty" && !payload.department_id) {
    return "Please select department for faculty.";
  }

  if (payload.role === "student" && !payload.branch_id) {
    return "Please select branch for student.";
  }

  if (payload.role === "student" && !payload.batch_id) {
    return "Please select batch for student.";
  }

  if (payload.role === "faculty") {
    if (!payload.faculty_name) {
      return "Please enter faculty name.";
    }

    if (!payload.faculty_email || !payload.faculty_email.includes("@")) {
      return "Please enter a valid faculty email.";
    }
  }

  return "";
}

async function createUser(event) {
  event.preventDefault();

  if (!isMasterAdminSession()) {
    setCreateMessage("Only master admin can create users.", "error");
    return;
  }

  const formData = new FormData(createUserForm);
  const role = String(formData.get("newRole") || "").trim();
  const payload = masterPayload({
    username: String(formData.get("newUsername") || "").trim(),
    password: String(formData.get("newPassword") || ""),
    confirm_password: String(formData.get("confirmPassword") || ""),
    role,
    department_id: formData.get("departmentSelect") || null,
    branch_id: role === "student" ? (formData.get("branchSelect") || null) : null,
    batch_id: role === "student" ? (formData.get("batchSelect") || null) : null,
    faculty_name: role === "faculty" ? String(formData.get("newFacultyName") || "").trim() : null,
    faculty_email: role === "faculty" ? String(formData.get("newFacultyEmail") || "").trim().toLowerCase() : null,
  });

  const validationError = validateCreatePayload(payload);
  if (validationError) {
    setCreateMessage(validationError, "error");
    return;
  }

  createUserButton.disabled = true;
  setCreateMessage("Creating user...", "");

  try {
    const response = await fetch(`${API_BASE_URL}/api/admin/create-user/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    if (!response.ok || !data.success) {
      setCreateMessage(data.message || "Failed to create user.", "error");
      return;
    }

    createUserForm.reset();
    setRoleMetaVisibility();
    populateBranchOptions();
    setCreateMessage(data.message || "User created successfully.", "success");
    await loadUsers();
  } catch (error) {
    setCreateMessage("Cannot connect to backend. Make sure Django server is running.", "error");
  } finally {
    createUserButton.disabled = false;
  }
}

function renderRows(users) {
  if (!users.length) {
    manageUsersBody.innerHTML = `
      <tr>
        <td colspan="6">No users found for selected filter.</td>
      </tr>
    `;
    return;
  }

  manageUsersBody.innerHTML = users.map((user) => `
    <tr>
      <td>${user.username}</td>
      <td>${user.role}</td>
      <td>${user.department || "-"}</td>
      <td>${user.branch || "-"}</td>
      <td>${user.batch || "-"}</td>
      <td>
        <button class="btn btn-secondary btn-sm" onclick="openEditUserModal(${user.id})">Edit</button>
        <button class="btn btn-secondary btn-sm" data-user-id="${user.id}" onclick="deleteManagedUser(${user.id}, '${user.username}')">Delete</button>
      </td>
    </tr>
  `).join("");
}

function openEditUserModal(userId) {
  const user = managedUsers.find((item) => Number(item.id) === Number(userId));
  if (!user) {
    setManageMessage("Unable to open user details.", "error");
    return;
  }

  editUserIdInput.value = String(user.id);
  editUsernameInput.value = user.username || "";
  editRoleSelect.value = user.role || "student";
  editDepartmentSelect.value = user.department_id ? String(user.department_id) : "";

  populateEditBranchOptions();
  editBranchSelect.value = user.branch_id ? String(user.branch_id) : "";
  populateEditBatchOptions();
  editBatchSelect.value = user.batch_id ? String(user.batch_id) : "";

  editFacultyNameInput.value = user.full_name || "";
  editFacultyEmailInput.value = user.email || "";
  editNewPasswordInput.value = "";
  editConfirmPasswordInput.value = "";
  setEditRoleMetaVisibility();
  setEditMessage("", "");

  editUserModalOverlay.classList.add("active");
  editUsernameInput.focus();
}

function closeEditUserModal() {
  if (!editUserModalOverlay || !editUserForm) return;
  editUserModalOverlay.classList.remove("active");
  editUserForm.reset();
  setEditMessage("", "");
}

async function saveManagedUser(event) {
  event.preventDefault();

  if (!isMasterAdminSession()) {
    setEditMessage("Only master admin can update users.", "error");
    return;
  }

  const role = editRoleSelect.value;
  const payload = masterPayload({
    user_id: Number(editUserIdInput.value),
    username: editUsernameInput.value.trim(),
    role,
    department_id: editDepartmentSelect.value || null,
    branch_id: role === "student" ? (editBranchSelect.value || null) : null,
    batch_id: role === "student" ? (editBatchSelect.value || null) : null,
    faculty_name: role === "faculty" ? editFacultyNameInput.value.trim() : null,
    faculty_email: role === "faculty" ? editFacultyEmailInput.value.trim().toLowerCase() : null,
    new_password: editNewPasswordInput.value,
    confirm_password: editConfirmPasswordInput.value,
  });

  if (!payload.username || !payload.role) {
    setEditMessage("Username and role are required.", "error");
    return;
  }

  if (payload.role === "faculty" && !payload.department_id) {
    setEditMessage("Department is required for faculty.", "error");
    return;
  }

  if (payload.role === "student" && !payload.branch_id) {
    setEditMessage("Branch is required for student.", "error");
    return;
  }

  if (payload.role === "student" && !payload.batch_id) {
    setEditMessage("Batch is required for student.", "error");
    return;
  }

  if (payload.role === "faculty") {
    if (!payload.faculty_name) {
      setEditMessage("Faculty name is required.", "error");
      return;
    }
    if (!payload.faculty_email || !payload.faculty_email.includes("@")) {
      setEditMessage("Valid faculty email is required.", "error");
      return;
    }
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

  setEditMessage("Saving user details...", "");

  try {
    const response = await fetch(`${API_BASE_URL}/api/admin/manage-users/update/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    if (!response.ok || !data.success) {
      setEditMessage(data.message || "Failed to update user.", "error");
      return;
    }

    setManageMessage(data.message || "User updated.", "success");
    closeEditUserModal();
    await loadUsers();
  } catch (error) {
    setEditMessage("Cannot connect to backend. Make sure Django server is running.", "error");
  }
}

async function loadUsers() {
  if (!isMasterAdminSession()) {
    manageUsersBody.innerHTML = `
      <tr>
          <td colspan="6">Master admin login required.</td>
      </tr>
    `;
    setManageMessage("Only master admin can manage student and faculty users.", "error");
    refreshUsersBtn.disabled = true;
    roleFilter.disabled = true;
    return;
  }

  setManageMessage("Loading users...", "");
  refreshUsersBtn.disabled = true;

  try {
    const response = await fetch(`${API_BASE_URL}/api/admin/manage-users/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(masterPayload({ role: roleFilter.value })),
    });

    const data = await response.json();
    if (!response.ok || !data.success) {
      setManageMessage(data.message || "Failed to load users.", "error");
      manageUsersBody.innerHTML = `
        <tr>
          <td colspan="6">Unable to load users.</td>
        </tr>
      `;
      return;
    }

    managedUsers = Array.isArray(data.users) ? data.users : [];
    renderRows(managedUsers);
    setManageMessage("User list updated.", "success");
  } catch (error) {
    setManageMessage("Cannot connect to backend. Make sure Django server is running.", "error");
  } finally {
    refreshUsersBtn.disabled = false;
  }
}

async function deleteManagedUser(userId, username) {
  const confirmed = window.confirm(`Delete user ${username}?`);
  if (!confirmed) return;

  setManageMessage("Deleting user...", "");

  try {
    const response = await fetch(`${API_BASE_URL}/api/admin/manage-users/delete/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(masterPayload({ user_id: userId })),
    });

    const data = await response.json();
    if (!response.ok || !data.success) {
      setManageMessage(data.message || "Failed to delete user.", "error");
      return;
    }

    setManageMessage(data.message || "User deleted successfully.", "success");
    loadUsers();
  } catch (error) {
    setManageMessage("Cannot connect to backend. Make sure Django server is running.", "error");
  }
}

window.deleteManagedUser = deleteManagedUser;
window.openEditUserModal = openEditUserModal;

roleFilter.addEventListener("change", loadUsers);
refreshUsersBtn.addEventListener("click", loadUsers);

if (createUserForm) {
  createUserForm.addEventListener("submit", createUser);
}

if (roleField) {
  roleField.addEventListener("change", setRoleMetaVisibility);
}

if (departmentSelect) {
  departmentSelect.addEventListener("change", populateBranchOptions);
}

if (branchSelect) {
  branchSelect.addEventListener("change", populateBatchOptions);
}

if (editDepartmentSelect) {
  editDepartmentSelect.addEventListener("change", populateEditBranchOptions);
}

if (editBranchSelect) {
  editBranchSelect.addEventListener("change", populateEditBatchOptions);
}

if (editRoleSelect) {
  editRoleSelect.addEventListener("change", setEditRoleMetaVisibility);
}

if (editUserForm) {
  editUserForm.addEventListener("submit", saveManagedUser);
}

if (closeEditUserModalBtn) {
  closeEditUserModalBtn.addEventListener("click", closeEditUserModal);
}

if (cancelEditUserBtn) {
  cancelEditUserBtn.addEventListener("click", closeEditUserModal);
}

if (editUserModalOverlay) {
  editUserModalOverlay.addEventListener("click", (event) => {
    if (event.target === editUserModalOverlay) {
      closeEditUserModal();
    }
  });
}

setRoleMetaVisibility();
loadDepartmentsBranches();
loadBranchBatches();
loadUsers();

if (newUsername) {
  newUsername.addEventListener("input", () => {
    if (roleField?.value === "student") {
      autoAssignStudentBranchFromIdentifier(newUsername.value, "create");
    }
  });
}

if (editUsernameInput) {
  editUsernameInput.addEventListener("input", () => {
    if (editRoleSelect?.value === "student") {
      autoAssignStudentBranchFromIdentifier(editUsernameInput.value, "edit");
    }
  });
}
