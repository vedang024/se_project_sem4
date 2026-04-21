const API_BASE_URL = "http://127.0.0.1:8000";

const createUserForm = document.getElementById("createUserForm");
const createUserButton = document.getElementById("createUserButton");
const createUserMessage = document.getElementById("createUserMessage");
const roleField = document.getElementById("newRole");
const roleMetaFields = document.getElementById("roleMetaFields");
const departmentSelect = document.getElementById("departmentSelect");
const branchSelect = document.getElementById("branchSelect");
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

function setCreateUserMessage(message, type) {
  createUserMessage.textContent = message;
  createUserMessage.className = `admin-user-message ${type || ""}`.trim();
}

function disableUserCreateForm(message) {
  const fields = createUserForm.querySelectorAll("input, select, button");
  fields.forEach((field) => {
    field.disabled = true;
  });
  setCreateUserMessage(message, "error");
}

function validatePayload(payload) {
  if (!payload.username || !payload.password || !payload.confirm_password || !payload.role) {
    return "Please fill all fields.";
  }

  if ((payload.role === "student" || payload.role === "faculty") && (!payload.department_id || !payload.branch_id)) {
    return "Please select department and branch for student/faculty.";
  }

  if (payload.password.length < 8) {
    return "Password must be at least 8 characters.";
  }

  if (payload.password !== payload.confirm_password) {
    return "Passwords do not match.";
  }

  return "";
}

function setRoleMetaVisibility() {
  const role = roleField.value;
  const needsMeta = role === "student" || role === "faculty";
  roleMetaFields.style.display = needsMeta ? "grid" : "none";
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
}

async function loadDepartmentsBranches() {
  try {
    const response = await fetch(`${API_BASE_URL}/api/admin/departments-branches/`);
    const data = await response.json();

    if (!response.ok || !data.success) {
      setCreateUserMessage("Failed to load departments and branches.", "error");
      return;
    }

    departmentsData = Array.isArray(data.departments) ? data.departments : [];
    populateDepartmentOptions();
    populateBranchOptions();
  } catch (error) {
    setCreateUserMessage("Cannot load departments/branches from backend.", "error");
  }
}

async function createUser(event) {
  event.preventDefault();

  const adminSession = getAdminSession();
  if (!adminSession || !adminSession.password) {
    disableUserCreateForm("Admin login required. Please sign in again.");
    return;
  }

  const formData = new FormData(createUserForm);
  const payload = {
    admin_username: adminSession.username,
    admin_password: adminSession.password,
    username: String(formData.get("newUsername") || "").trim(),
    password: String(formData.get("newPassword") || ""),
    confirm_password: String(formData.get("confirmPassword") || ""),
    role: String(formData.get("newRole") || "").trim(),
    department_id: formData.get("departmentSelect") || null,
    branch_id: formData.get("branchSelect") || null,
  };

  const validationError = validatePayload(payload);
  if (validationError) {
    setCreateUserMessage(validationError, "error");
    return;
  }

  createUserButton.disabled = true;
  setCreateUserMessage("Creating user...", "");

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
      setCreateUserMessage(data.message || "Failed to create user.", "error");
      return;
    }

    setCreateUserMessage(data.message || "User created successfully.", "success");
    createUserForm.reset();
  } catch (error) {
    setCreateUserMessage("Cannot connect to backend. Make sure Django server is running.", "error");
  } finally {
    createUserButton.disabled = false;
  }
}

(function initAdminUserSection() {
  const adminSession = getAdminSession();

  if (!adminSession) {
    disableUserCreateForm("Admin login required. Please login from the login page first.");
    return;
  }

  if (!adminSession.password) {
    disableUserCreateForm("Please re-login to continue with admin actions.");
    return;
  }

  setCreateUserMessage("Admin authenticated. You can create users.", "success");
  setRoleMetaVisibility();
  loadDepartmentsBranches();
})();

roleField.addEventListener("change", () => {
  setRoleMetaVisibility();
});

departmentSelect.addEventListener("change", () => {
  populateBranchOptions();
});

createUserForm.addEventListener("submit", createUser);

