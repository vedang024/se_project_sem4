const API_BASE_URL = "http://127.0.0.1:8000";

const roleRedirectMap = {
  student: "student.html",
  faculty: "faculty.html",
  admin: "academicsection/admin.html",
};

const loginForm = document.getElementById("loginForm");
const loginButton = document.getElementById("loginButton");
const messageElement = document.getElementById("message");

function setMessage(text, type) {
  messageElement.textContent = text;
  messageElement.className = `message ${type || ""}`.trim();
}

function validateInputs({ role, username, password }) {
  if (!role) {
    return "Please select a role.";
  }

  if (!username || !password) {
    return "Please enter username and password.";
  }

  return "";
}

async function handleLogin(event) {
  event.preventDefault();

  const formData = new FormData(loginForm);
  const payload = {
    role: formData.get("role"),
    username: String(formData.get("username") || "").trim(),
    password: String(formData.get("password") || ""),
  };

  const validationError = validateInputs(payload);
  if (validationError) {
    setMessage(validationError, "error");
    return;
  }

  loginButton.disabled = true;
  setMessage("Signing in...", "");

  try {
    const response = await fetch(`${API_BASE_URL}/api/login/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    if (!response.ok || !data.success) {
      setMessage(data.message || "Login failed.", "error");
      return;
    }

    localStorage.setItem("erp_user", JSON.stringify(data.user));
    if (payload.role === "student") {
      localStorage.setItem("erp_student", JSON.stringify(data.user));
      localStorage.removeItem("erp_admin_password");
    } else if (payload.role === "admin") {
      localStorage.removeItem("erp_student");
      localStorage.setItem("erp_admin_password", payload.password);
    } else {
      localStorage.removeItem("erp_student");
      localStorage.removeItem("erp_admin_password");
    }
    setMessage("Login successful. Redirecting...", "success");

    const redirectPath = roleRedirectMap[payload.role];
    if (redirectPath) {
      setTimeout(() => {
        window.location.href = redirectPath;
      }, 500);
    }
  } catch (error) {
    setMessage("Cannot connect to backend. Make sure Django server is running.", "error");
  } finally {
    loginButton.disabled = false;
  }
}

loginForm.addEventListener("submit", handleLogin);

