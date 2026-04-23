const API_BASE_URL = "http://127.0.0.1:8000";

const roleFilter = document.getElementById("roleFilter");
const refreshUsersBtn = document.getElementById("refreshUsersBtn");
const manageUsersBody = document.getElementById("manageUsersBody");
const manageUsersMessage = document.getElementById("manageUsersMessage");
const createUserForm = document.getElementById("createUserForm");
const createUserButton = document.getElementById("createUserButton");
const createUserMessage = document.getElementById("createUserMessage");
const roleField = document.getElementById("newRole");
const departmentSelect = document.getElementById("departmentSelect");
const branchSelect = document.getElementById("branchSelect");
const batchSelect = document.getElementById("batchSelect");
const rollNoFieldWrap = document.getElementById("rollNoFieldWrap");
const newFullName = document.getElementById("newFullName");
const newRollNo = document.getElementById("newRollNo");
const newEmail = document.getElementById("newEmail");
const createFacultyInfoFields = document.getElementById("createFacultyInfoFields");
const newFacultyDesignation = document.getElementById("newFacultyDesignation");
const newFacultyHonor = document.getElementById("newFacultyHonor");
const newFacultyExperience = document.getElementById("newFacultyExperience");
const newFacultyPhone = document.getElementById("newFacultyPhone");
const newFacultyResearchArea = document.getElementById("newFacultyResearchArea");
const newFacultyAddress = document.getElementById("newFacultyAddress");

const editUserModalOverlay = document.getElementById("editUserModalOverlay");
const closeEditUserModalBtn = document.getElementById("closeEditUserModalBtn");
const cancelEditUserBtn = document.getElementById("cancelEditUserBtn");
const editUserForm = document.getElementById("editUserForm");
const editUserMessage = document.getElementById("editUserMessage");
const editUserIdInput = document.getElementById("editUserIdInput");
const editFullNameInput = document.getElementById("editFullNameInput");
const editEmailInput = document.getElementById("editEmailInput");
const editRollNoInput = document.getElementById("editRollNoInput");
const editRollNoWrap = document.getElementById("editRollNoWrap");
const editUsernameInput = document.getElementById("editUsernameInput");
const editRoleSelect = document.getElementById("editRoleSelect");
const editDepartmentSelect = document.getElementById("editDepartmentSelect");
const editBranchSelect = document.getElementById("editBranchSelect");
const editBatchSelect = document.getElementById("editBatchSelect");
const editBranchFieldWrap = document.getElementById("editBranchFieldWrap");
const editBatchFieldWrap = document.getElementById("editBatchFieldWrap");
const editNewPasswordInput = document.getElementById("editNewPasswordInput");
const editConfirmPasswordInput = document.getElementById("editConfirmPasswordInput");
const editFacultyInfoFields = document.getElementById("editFacultyInfoFields");
const editFacultyDesignationInput = document.getElementById("editFacultyDesignationInput");
const editFacultyHonorInput = document.getElementById("editFacultyHonorInput");
const editFacultyExperienceInput = document.getElementById("editFacultyExperienceInput");
const editFacultyPhoneInput = document.getElementById("editFacultyPhoneInput");
const editFacultyResearchAreaInput = document.getElementById("editFacultyResearchAreaInput");
const editFacultyAddressInput = document.getElementById("editFacultyAddressInput");

let departmentsData = [];
let managedUsers = [];
let allBatches = [];

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

function setManageMessage(message, type) {
  manageUsersMessage.textContent = message;
  manageUsersMessage.className = `admin-user-message ${type || ""}`.trim();
}

function setCreateMessage(message, type) {
  createUserMessage.textContent = message;
  createUserMessage.className = `admin-user-message ${type || ""}`.trim();
}

function setEditMessage(message, type) {
  editUserMessage.textContent = message;
  editUserMessage.className = `admin-user-message ${type || ""}`.trim();
}

function isMasterAdminSession() {
  const adminSession = getAdminSession();
  return !!(adminSession && adminSession.password);
}

function masterPayload(extra = {}) {
  const adminSession = getAdminSession();
  return {
    admin_username: adminSession ? adminSession.username : "",
    admin_password: adminSession ? adminSession.password : "",
    ...extra,
  };
}

function setRoleMetaVisibility() {
  const role = roleField.value;
  const isStudent = role === "student";
  const isFaculty = role === "faculty";

  if (document.getElementById("roleMetaFields")) {
    document.getElementById("roleMetaFields").style.display = isStudent || isFaculty ? "grid" : "none";
  }
  if (rollNoFieldWrap) rollNoFieldWrap.style.display = isStudent ? "block" : "none";
  if (branchSelect?.parentElement) branchSelect.parentElement.style.display = isStudent ? "block" : "none";
  if (batchSelect?.parentElement) batchSelect.parentElement.style.display = isStudent ? "block" : "none";
  if (createFacultyInfoFields) createFacultyInfoFields.style.display = isFaculty ? "grid" : "none";

  if (!isStudent) {
    newRollNo.value = "";
    batchSelect.value = "";
  }
}

function setEditRoleMetaVisibility() {
  const role = editRoleSelect.value;
  const isStudent = role === "student";
  const isFaculty = role === "faculty";

  if (editRollNoWrap) editRollNoWrap.style.display = isStudent ? "block" : "none";
  if (editBranchFieldWrap) editBranchFieldWrap.style.display = isStudent ? "block" : "none";
  if (editBatchFieldWrap) editBatchFieldWrap.style.display = isStudent ? "block" : "none";
  if (editFacultyInfoFields) editFacultyInfoFields.style.display = isFaculty ? "grid" : "none";

  if (isStudent) {
    editUsernameInput.value = String(editEmailInput.value || "").trim().toLowerCase();
  }
}

function populateDepartmentOptions() {
  departmentSelect.innerHTML = '<option value="">Select department</option>';
  editDepartmentSelect.innerHTML = '<option value="">Select department</option>';

  departmentsData.forEach((dept) => {
    const createOption = document.createElement("option");
    createOption.value = String(dept.id);
    createOption.textContent = dept.name;
    departmentSelect.appendChild(createOption);

    const editOption = document.createElement("option");
    editOption.value = String(dept.id);
    editOption.textContent = dept.name;
    editDepartmentSelect.appendChild(editOption);
  });
}

function populateBranchOptions(targetDepartmentSelect, targetBranchSelect) {
  targetBranchSelect.innerHTML = '<option value="">Select branch</option>';
  const selectedDept = departmentsData.find((dept) => String(dept.id) === targetDepartmentSelect.value);
  if (!selectedDept) return;

  (selectedDept.branches || []).forEach((branch) => {
    const option = document.createElement("option");
    option.value = String(branch.id);
    option.textContent = branch.name;
    targetBranchSelect.appendChild(option);
  });
}

function populateBatchOptions(targetBranchSelect, targetBatchSelect) {
  targetBatchSelect.innerHTML = '<option value="">Select batch</option>';
  const selectedBranchId = String(targetBranchSelect.value || "");
  if (!selectedBranchId) return;

  allBatches
    .filter((batch) => String(batch.branch_id || "") === selectedBranchId)
    .forEach((batch) => {
      const option = document.createElement("option");
      option.value = String(batch.id);
      option.textContent = batch.batch_name || batch.label || `Batch ${batch.id}`;
      targetBatchSelect.appendChild(option);
    });
}

async function loadDepartmentsBranches() {
  const response = await fetch(`${API_BASE_URL}/api/admin/departments-branches/`);
  const data = await response.json();
  if (!response.ok || !data.success) {
    throw new Error(data.message || "Failed to load departments and branches.");
  }
  departmentsData = Array.isArray(data.departments) ? data.departments : [];
  populateDepartmentOptions();
}

async function loadBranchBatches() {
  const response = await fetch(`${API_BASE_URL}/api/admin/branch-batches/`);
  const data = await response.json();
  if (!response.ok || !data.success) {
    throw new Error(data.message || "Failed to load batches.");
  }
  allBatches = Array.isArray(data.batches) ? data.batches : [];
}

function validateCreatePayload(payload) {
  if (!payload.full_name || !payload.email || !payload.password || !payload.confirm_password || !payload.role) {
    return "Please fill all required fields.";
  }
  if (!payload.email.includes("@")) {
    return "Please enter a valid email.";
  }
  if (payload.password.length < 8) {
    return "Password must be at least 8 characters.";
  }
  if (payload.password !== payload.confirm_password) {
    return "Passwords do not match.";
  }
  if (!payload.department_id) {
    return "Please select a department.";
  }
  if (payload.role === "student") {
    if (!payload.roll_no) return "Roll number is required for student.";
    if (!payload.branch_id) return "Branch is required for student.";
    if (!payload.batch_id) return "Batch is required for student.";
  }
  return "";
}

async function createUser(event) {
  event.preventDefault();

  if (!isMasterAdminSession()) {
    setCreateMessage("Admin login required to create users.", "error");
    return;
  }

  const formData = new FormData(createUserForm);
  const role = String(formData.get("newRole") || "student").trim();
  const email = String(formData.get("newEmail") || "").trim().toLowerCase();
  const payload = masterPayload({
    role,
    username: email,
    full_name: String(formData.get("newFullName") || "").trim(),
    roll_no: role === "student" ? String(formData.get("newRollNo") || "").trim().toUpperCase() : null,
    email,
    password: String(formData.get("newPassword") || ""),
    confirm_password: String(formData.get("confirmPassword") || ""),
    department_id: formData.get("departmentSelect") || null,
    branch_id: role === "student" ? (formData.get("branchSelect") || null) : null,
    batch_id: role === "student" ? (formData.get("batchSelect") || null) : null,
    faculty_name: role === "faculty" ? String(formData.get("newFullName") || "").trim() : null,
    faculty_email: role === "faculty" ? email : null,
    faculty_designation: role === "faculty" ? String(formData.get("newFacultyDesignation") || "").trim() : "",
    faculty_honor: role === "faculty" ? String(formData.get("newFacultyHonor") || "").trim() : "",
    faculty_experience: role === "faculty" ? String(formData.get("newFacultyExperience") || "").trim() : "",
    faculty_phone_number: role === "faculty" ? String(formData.get("newFacultyPhone") || "").trim() : "",
    faculty_research_area: role === "faculty" ? String(formData.get("newFacultyResearchArea") || "").trim() : "",
    faculty_address: role === "faculty" ? String(formData.get("newFacultyAddress") || "").trim() : "",
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
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    if (!response.ok || !data.success) {
      setCreateMessage(data.message || "Failed to create user.", "error");
      return;
    }

    createUserForm.reset();
    setRoleMetaVisibility();
    setCreateMessage(data.message || "User created successfully.", "success");
    await loadUsers();
  } catch (error) {
    setCreateMessage("Cannot connect to backend. Make sure Django server is running.", "error");
  } finally {
    createUserButton.disabled = false;
  }
}

function openUserDetailPage(userId) {
  window.location.href = `user-details.html?user_id=${encodeURIComponent(userId)}`;
}

function renderRows(users) {
  if (!users.length) {
    manageUsersBody.innerHTML = `
      <tr>
        <td colspan="8">No users found for selected filter.</td>
      </tr>
    `;
    return;
  }

  manageUsersBody.innerHTML = users
    .map(
      (user) => `
    <tr onclick="openUserDetailPage(${user.id})" style="cursor:pointer;">
      <td>${user.full_name || "-"}</td>
      <td>${user.role === "faculty" ? "N/A" : (user.roll_no || "-")}</td>
      <td>${user.email || user.username || "-"}</td>
      <td>${user.role}</td>
      <td>${user.department || "-"}</td>
      <td>${user.role === "faculty" ? "N/A" : (user.branch || "-")}</td>
      <td>${user.role === "faculty" ? "N/A" : (user.batch || "-")}</td>
      <td>
        <button class="btn btn-secondary btn-sm" onclick="event.stopPropagation(); openUserDetailPage(${user.id})">Open</button>
      </td>
    </tr>
  `,
    )
    .join("");
}

function openEditUserModal(userId) {
  const user = managedUsers.find((item) => Number(item.id) === Number(userId));
  if (!user) {
    setManageMessage("Unable to open user details.", "error");
    return;
  }

  editUserIdInput.value = String(user.id);
  editFullNameInput.value = user.full_name || "";
  editEmailInput.value = user.email || user.username || "";
  editRollNoInput.value = user.roll_no || "";
  editUsernameInput.value = user.username || "";
  editRoleSelect.value = user.role || "student";

  editDepartmentSelect.value = user.department_id ? String(user.department_id) : "";
  populateBranchOptions(editDepartmentSelect, editBranchSelect);
  editBranchSelect.value = user.branch_id ? String(user.branch_id) : "";
  populateBatchOptions(editBranchSelect, editBatchSelect);
  editBatchSelect.value = user.batch_id ? String(user.batch_id) : "";

  editFacultyDesignationInput.value = user.faculty_designation || "";
  editFacultyHonorInput.value = user.faculty_honor || "";
  editFacultyExperienceInput.value = user.faculty_experience || "";
  editFacultyPhoneInput.value = user.faculty_phone_number || "";
  editFacultyResearchAreaInput.value = user.faculty_research_area || "";
  editFacultyAddressInput.value = user.faculty_address || "";

  editNewPasswordInput.value = "";
  editConfirmPasswordInput.value = "";
  setEditRoleMetaVisibility();
  setEditMessage("", "");

  editUserModalOverlay.classList.add("active");
  editFullNameInput.focus();
}

function closeEditUserModal() {
  editUserModalOverlay.classList.remove("active");
  editUserForm.reset();
  setEditMessage("", "");
}

async function saveManagedUser(event) {
  event.preventDefault();

  if (!isMasterAdminSession()) {
    setEditMessage("Admin login required to update users.", "error");
    return;
  }

  const role = editRoleSelect.value;
  const email = editEmailInput.value.trim().toLowerCase();
  const payload = masterPayload({
    user_id: Number(editUserIdInput.value),
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

  if (!payload.email.includes("@")) {
    setEditMessage("Valid email is required.", "error");
    return;
  }

  if (!payload.department_id) {
    setEditMessage("Department is required.", "error");
    return;
  }

  if (payload.role === "student") {
    if (!payload.roll_no) {
      setEditMessage("Roll number is required for student.", "error");
      return;
    }
    if (!payload.branch_id || !payload.batch_id) {
      setEditMessage("Branch and batch are required for student.", "error");
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
      headers: { "Content-Type": "application/json" },
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
    manageUsersBody.innerHTML = '<tr><td colspan="8">Admin login required.</td></tr>';
    setManageMessage("Admin login required to manage users.", "error");
    refreshUsersBtn.disabled = true;
    roleFilter.disabled = true;
    return;
  }

  setManageMessage("Loading users...", "");
  refreshUsersBtn.disabled = true;

  try {
    const response = await fetch(`${API_BASE_URL}/api/admin/manage-users/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(masterPayload({ role: roleFilter.value })),
    });

    const data = await response.json();
    if (!response.ok || !data.success) {
      setManageMessage(data.message || "Failed to load users.", "error");
      manageUsersBody.innerHTML = '<tr><td colspan="8">Unable to load users.</td></tr>';
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

async function deleteManagedUser(userId, identifier) {
  const confirmed = window.confirm(`Delete user ${identifier}?`);
  if (!confirmed) return;

  setManageMessage("Deleting user...", "");

  try {
    const response = await fetch(`${API_BASE_URL}/api/admin/manage-users/delete/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(masterPayload({ user_id: userId })),
    });

    const data = await response.json();
    if (!response.ok || !data.success) {
      setManageMessage(data.message || "Failed to delete user.", "error");
      return;
    }

    setManageMessage(data.message || "User deleted successfully.", "success");
    await loadUsers();
  } catch (error) {
    setManageMessage("Cannot connect to backend. Make sure Django server is running.", "error");
  }
}

window.deleteManagedUser = deleteManagedUser;
window.openEditUserModal = openEditUserModal;
window.openUserDetailPage = openUserDetailPage;

roleFilter.addEventListener("change", loadUsers);
refreshUsersBtn.addEventListener("click", loadUsers);
createUserForm.addEventListener("submit", createUser);
roleField.addEventListener("change", setRoleMetaVisibility);
departmentSelect.addEventListener("change", () => {
  populateBranchOptions(departmentSelect, branchSelect);
  populateBatchOptions(branchSelect, batchSelect);
});
branchSelect.addEventListener("change", () => populateBatchOptions(branchSelect, batchSelect));

editDepartmentSelect.addEventListener("change", () => {
  populateBranchOptions(editDepartmentSelect, editBranchSelect);
  populateBatchOptions(editBranchSelect, editBatchSelect);
});
editBranchSelect.addEventListener("change", () => populateBatchOptions(editBranchSelect, editBatchSelect));
editRoleSelect.addEventListener("change", setEditRoleMetaVisibility);
editEmailInput.addEventListener("input", () => {
  if (editRoleSelect.value === "student") {
    editUsernameInput.value = editEmailInput.value.trim().toLowerCase();
  }
});
editUserForm.addEventListener("submit", saveManagedUser);
closeEditUserModalBtn.addEventListener("click", closeEditUserModal);
cancelEditUserBtn.addEventListener("click", closeEditUserModal);
editUserModalOverlay.addEventListener("click", (event) => {
  if (event.target === editUserModalOverlay) {
    closeEditUserModal();
  }
});

(async function init() {
  setRoleMetaVisibility();
  try {
    await loadDepartmentsBranches();
    await loadBranchBatches();
    await loadUsers();
  } catch (error) {
    setManageMessage(error.message || "Failed to initialize page.", "error");
  }
})();

