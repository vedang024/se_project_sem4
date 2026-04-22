const API_BASE_URL = "http://127.0.0.1:8000";
const APPLICATIONS_API_BASE = `${API_BASE_URL}/api/applications`;

const recipientsCache = {
  admins: [],
  faculty: [],
  students: [],
};

const selectedRecipients = {
  admins: new Set(),
  faculty: new Set(),
  students: new Set(),
};

let currentView = "inbox";
let currentApplication = null;

function getCurrentUser() {
  const user = JSON.parse(localStorage.getItem("erp_user") || "null");
  if (!user || !user.role) {
    return null;
  }
  return user;
}

function getRequesterPayload(extra = {}) {
  const user = getCurrentUser();
  return {
    requester_username: user ? String(user.username || "").trim() : "",
    requester_role: user ? String(user.role || "").trim() : "",
    ...extra,
  };
}

function setStatus(message, isError = false) {
  const statusEl = document.getElementById("applicationStatus");
  if (!statusEl) return;
  statusEl.textContent = message;
  statusEl.className = `app-status${isError ? " error" : /loaded|sent|marked|removed|success/i.test(String(message || "")) ? " success" : ""}`;
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value || "-";
  }
  return date.toLocaleString();
}

function truncateText(value, maxLength = 140) {
  const content = String(value || "").trim();
  if (content.length <= maxLength) {
    return content;
  }
  return `${content.slice(0, maxLength).trimEnd()}...`;
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  let data = {};
  try {
    data = await response.json();
  } catch (error) {
    data = {};
  }

  if (!response.ok || !data.success) {
    throw new Error(data.message || "Request failed.");
  }

  return data;
}

function getLoginRedirectPath() {
  if (typeof getLoginPath === "function") {
    return getLoginPath();
  }
  return window.location.pathname.includes("/academicsection/") ? "../login.html" : "login.html";
}

function normalizeRecipient(roleKey, recipient) {
  return {
    email: String(recipient.email || "").trim(),
    name: String(recipient.name || recipient.email || "Unknown").trim(),
    department: String(recipient.department || "-").trim(),
    rollNo: roleKey === "students" ? String(recipient.roll_no || "-").trim() : "",
    role: String(recipient.role || roleKey.slice(0, -1)).trim(),
    searchText: [
      recipient.name,
      recipient.email,
      recipient.department,
      recipient.roll_no,
    ]
      .join(" ")
      .toLowerCase(),
  };
}

function getRoleLabel(role) {
  return {
    admin: "Academic Section",
    faculty: "Faculty",
    student: "Student",
  }[String(role || "").toLowerCase()] || String(role || "-");
}

function renderRecipientList(roleKey) {
  const container = document.getElementById(`${roleKey}List`);
  if (!container) return;

  const searchInputId = {
    admins: "adminSearch",
    faculty: "facultySearch",
    students: "studentSearch",
  }[roleKey];
  const searchValue = String(document.getElementById(searchInputId)?.value || "").trim().toLowerCase();
  const recipients = recipientsCache[roleKey].filter((recipient) => recipient.searchText.includes(searchValue));
  container.innerHTML = "";

  if (!recipients.length) {
    container.innerHTML = '<div class="recipient-empty-state">No matching recipients found.</div>';
    return;
  }

  recipients.forEach((recipient) => {
    const item = document.createElement("div");
    item.className = "recipient-item";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = recipient.email;
    checkbox.checked = selectedRecipients[roleKey].has(recipient.email);
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) {
        selectedRecipients[roleKey].add(recipient.email);
      } else {
        selectedRecipients[roleKey].delete(recipient.email);
      }
    });

    const label = document.createElement("label");
    label.className = "checkbox-container";

    const details = document.createElement("div");
    details.className = "recipient-info";
    details.innerHTML = `
      <span class="recipient-name">${escapeHtml(recipient.name)}</span>
      <span class="recipient-meta">
        ${escapeHtml(recipient.email)}
        ${
          roleKey === "students"
            ? `<span style="opacity:0.7;"> | ${escapeHtml(recipient.rollNo)}</span>`
            : ""
        }
        <span style="opacity:0.7;"> | ${escapeHtml(recipient.department)}</span>
      </span>
    `;

    const checkmark = document.createElement("span");
    checkmark.className = "checkmark";

    label.appendChild(checkbox);
    label.appendChild(checkmark);
    label.appendChild(details);
    item.appendChild(label);
    container.appendChild(item);
  });
}

function filterRecipients(roleKey) {
  renderRecipientList(roleKey);
}

function toggleSelectAll(checkbox, listId) {
  const roleKey = listId.replace("List", "");
  const list = document.getElementById(listId);
  if (!list || !selectedRecipients[roleKey]) return;

  list.querySelectorAll("input[type='checkbox']").forEach((item) => {
    item.checked = checkbox.checked;
    if (checkbox.checked) {
      selectedRecipients[roleKey].add(item.value);
    } else {
      selectedRecipients[roleKey].delete(item.value);
    }
  });
}

function buildRecipientsPayload() {
  return Object.entries(selectedRecipients).flatMap(([roleKey, emails]) =>
    Array.from(emails).map((email) => ({
      email,
      role:
        roleKey === "admins"
          ? "admin"
          : roleKey === "students"
            ? "student"
            : "faculty",
    })),
  );
}

async function loadRecipients() {
  try {
    const data = await fetchJson(`${APPLICATIONS_API_BASE}/recipients/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(getRequesterPayload()),
    });

    recipientsCache.admins = Array.isArray(data.admins)
      ? data.admins.map((recipient) => normalizeRecipient("admins", recipient))
      : [];
    recipientsCache.faculty = Array.isArray(data.faculty)
      ? data.faculty.map((recipient) => normalizeRecipient("faculty", recipient))
      : [];
    recipientsCache.students = Array.isArray(data.students)
      ? data.students.map((recipient) => normalizeRecipient("students", recipient))
      : [];

    renderRecipientList("admins");
    renderRecipientList("faculty");
    renderRecipientList("students");
  } catch (error) {
    setStatus(error.message || "Failed to load recipients.", true);
  }
}

function switchView(view) {
  currentView = view;
  const inboxView = document.getElementById("inboxView");
  const sentView = document.getElementById("sentView");
  const inboxTab = document.getElementById("inboxTab");
  const sentTab = document.getElementById("sentTab");

  if (view === "inbox") {
    inboxView.classList.remove("hidden");
    sentView.classList.add("hidden");
    inboxTab.classList.add("active");
    sentTab.classList.remove("active");
  } else {
    inboxView.classList.add("hidden");
    sentView.classList.remove("hidden");
    inboxTab.classList.remove("active");
    sentTab.classList.add("active");
  }

  loadApplications(view);
}

function closeApplicationModal() {
  document.getElementById("applicationModalOverlay")?.classList.remove("active");
}

function openApplicationModal() {
  document.getElementById("applicationModalOverlay")?.classList.add("active");
}

function canDeleteCurrentApplication() {
  const user = getCurrentUser();
  if (!user || !currentApplication) return false;
  const recordType = String(currentApplication.record_type || "");
  const userEmail = String(user.email || user.username || "").trim().toLowerCase();

  if (recordType === "student_query") {
    return user.role === "student";
  }
  return String(currentApplication.sender_email || "").trim().toLowerCase() === userEmail;
}

function canManageCurrentApplication() {
  const user = getCurrentUser();
  if (!user || !currentApplication) return false;
  const userEmail = String(user.email || user.username || "").trim().toLowerCase();

  if (String(currentApplication.record_type || "") === "student_query") {
    return (
      currentView === "inbox" &&
      String(currentApplication.status || "").toLowerCase() === "pending" &&
      user.role === "faculty"
    );
  }

  return (
    currentView === "inbox" &&
    String(currentApplication.status || "").toLowerCase() === "pending" &&
    String(currentApplication.receiver_email || "").trim().toLowerCase() === userEmail
  );
}

function buildDetailHtml(app) {
  const metadataRows = [
    ["From", `${app.sender_name || "-"} (${getRoleLabel(app.sender_type)})`],
    ["To", `${app.receiver_name || app.receiver_email || "-"} (${getRoleLabel(app.receiver_type)})`],
    ["Status", app.status || "-"],
    ["Created", formatDateTime(app.created_at)],
  ];

  if (app.course_id) {
    metadataRows.push(["Course", `${app.course_id}${app.course_name ? ` - ${app.course_name}` : ""}`]);
  }
  if (app.missed_date) {
    metadataRows.push(["Missed Date", app.missed_date]);
  }
  if (app.student_roll_no) {
    metadataRows.push(["Roll No", app.student_roll_no]);
  }
  if (app.department) {
    metadataRows.push(["Department", app.department]);
  }

  const isStudentQuery = String(app.record_type || "") === "student_query";

  const responseEditor = canManageCurrentApplication()
    ? `
      <div class="form-group" style="margin-top: 1rem;">
        <label class="form-label" for="responseMessage">${isStudentQuery ? "Decision Note" : "Response Message"}</label>
        <textarea id="responseMessage" class="form-textarea" rows="4" placeholder="Optional response to the sender"></textarea>
      </div>
      <div class="form-group">
        <label class="form-label" for="responseStatus">${isStudentQuery ? "Decision" : "Response Status"}</label>
        <select id="responseStatus" class="form-input">
          <option value="Approved">Approved</option>
          <option value="Rejected">Rejected</option>
          ${isStudentQuery ? "" : '<option value="Resolved">Resolved</option>'}
        </select>
      </div>
    `
    : "";

  return `
    <h4 class="application-detail-title">${escapeHtml(app.subject || "Untitled")}</h4>
    <div class="application-detail-grid">
      ${metadataRows
        .map(
          ([label, value]) => `
            <div class="application-detail-row">
              <span class="application-detail-label">${escapeHtml(label)}</span>
              <span class="application-detail-value">${escapeHtml(value)}</span>
            </div>
          `,
        )
        .join("")}
    </div>
    <div class="application-detail-message">${escapeHtml(app.message || "-").replace(/\n/g, "<br>")}</div>
    ${responseEditor}
  `;
}

function renderModalActions() {
  const actionsEl = document.getElementById("applicationModalActions");
  if (!actionsEl) return;
  actionsEl.innerHTML = "";

  if (canManageCurrentApplication()) {
    const replyBtn = document.createElement("button");
    replyBtn.type = "button";
    replyBtn.className = "btn btn-primary";
    replyBtn.textContent = String(currentApplication?.record_type || "") === "student_query" ? "Submit Decision" : "Send Response";
    replyBtn.addEventListener("click", () => submitResponse());

    const approveBtn = document.createElement("button");
    approveBtn.type = "button";
    approveBtn.className = "btn btn-secondary";
    approveBtn.textContent = String(currentApplication?.record_type || "") === "student_query" ? "Approve Attendance" : "Approve";
    approveBtn.addEventListener("click", () => updateApplicationStatus("Approved"));

    const rejectBtn = document.createElement("button");
    rejectBtn.type = "button";
    rejectBtn.className = "btn btn-secondary";
    rejectBtn.textContent = String(currentApplication?.record_type || "") === "student_query" ? "Reject Query" : "Reject";
    rejectBtn.addEventListener("click", () => updateApplicationStatus("Rejected"));

    actionsEl.appendChild(replyBtn);
    actionsEl.appendChild(approveBtn);
    actionsEl.appendChild(rejectBtn);
  }

  if (canDeleteCurrentApplication()) {
    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "btn btn-secondary";
    deleteBtn.textContent = "Remove Sent Application";
    deleteBtn.addEventListener("click", () => deleteApplication(currentApplication.app_ref));
    actionsEl.appendChild(deleteBtn);
  }
}

async function showApplicationDetail(appRef) {
  try {
    const data = await fetchJson(`${APPLICATIONS_API_BASE}/detail/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(getRequesterPayload({ app_ref: appRef })),
    });

    currentApplication = data.application || null;
    document.getElementById("applicationModalBody").innerHTML = buildDetailHtml(currentApplication || {});
    renderModalActions();
    openApplicationModal();
  } catch (error) {
    setStatus(error.message || "Failed to load application details.", true);
  }
}

function createListActionButton(label, onClick, extraClass = "btn-secondary") {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `btn ${extraClass} btn-sm`;
  button.textContent = label;
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    onClick();
  });
  return button;
}

function renderApplicationList(viewType, applications) {
  const container = document.getElementById(viewType === "inbox" ? "inboxAppsList" : "sentAppsList");
  if (!container) return;

  container.innerHTML = "";

  if (!Array.isArray(applications) || applications.length === 0) {
    container.innerHTML = `<div class="application-empty-state">${
      viewType === "inbox" ? "No applications found in inbox." : "No sent applications yet."
    }</div>`;
    if (viewType === "inbox") {
      document.getElementById("inboxBadge").textContent = "0";
    }
    return;
  }

  if (viewType === "inbox") {
    const pendingCount = applications.filter((app) => String(app.status || "").toLowerCase() === "pending").length;
    document.getElementById("inboxBadge").textContent = String(pendingCount);
  }

  applications.forEach((app) => {
    const card = document.createElement("div");
    const isUnread = viewType === "inbox" && String(app.status || "").toLowerCase() === "pending";
    card.className = `application-card ${isUnread ? "unread" : ""}`;
    card.tabIndex = 0;

    const counterpartLabel = viewType === "inbox"
      ? `${app.sender_name || "Unknown"} (${getRoleLabel(app.sender_type)})`
      : `${app.receiver_name || app.receiver_email || "-"} (${getRoleLabel(app.receiver_type)})`;
    const directionLabel = viewType === "inbox" ? "From" : "To";
    const roleTag = getRoleLabel(viewType === "inbox" ? app.sender_type : app.receiver_type);
    const recordTag = String(app.record_type || "") === "student_query" ? "Attendance Query" : "Application";

    card.innerHTML = `
      <div class="app-card-header">
        <span class="sender-name">${escapeHtml(app.subject || "Untitled")}</span>
        <span class="timestamp">${escapeHtml(formatDateTime(app.created_at))}</span>
      </div>
      <div class="app-card-subject">${directionLabel}: ${escapeHtml(counterpartLabel)}</div>
      <div class="app-card-preview">${escapeHtml(truncateText(app.message || ""))}</div>
      <div class="app-card-meta">
        <span class="tag">${escapeHtml(roleTag)}</span>
        <span class="tag">${escapeHtml(recordTag)}</span>
        <span class="status ${String(app.status || "").toLowerCase()}">${escapeHtml(app.status || "-")}</span>
      </div>
    `;

    const actions = document.createElement("div");
    actions.className = "app-card-actions";
    actions.appendChild(createListActionButton("View", () => showApplicationDetail(app.app_ref)));

    if (viewType === "sent") {
      actions.appendChild(createListActionButton("Remove", () => deleteApplication(app.app_ref)));
    }

    card.appendChild(actions);
    card.addEventListener("click", () => showApplicationDetail(app.app_ref));
    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        showApplicationDetail(app.app_ref);
      }
    });
    container.appendChild(card);
  });
}

async function loadApplications(viewType = currentView) {
  currentView = viewType;
  setStatus(viewType === "inbox" ? "Loading inbox..." : "Loading sent applications...");

  try {
    const data = await fetchJson(`${APPLICATIONS_API_BASE}/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(getRequesterPayload({ view_type: viewType })),
    });
    renderApplicationList(viewType, data.applications || []);
    setStatus(viewType === "inbox" ? "Inbox loaded." : "Sent applications loaded.");
  } catch (error) {
    renderApplicationList(viewType, []);
    setStatus(error.message || "Failed to load applications.", true);
  }
}

function resetComposeForm() {
  document.getElementById("appForm")?.reset();
  Object.values(selectedRecipients).forEach((emails) => emails.clear());
  ["selectAllAdmins", "selectAllFaculty", "selectAllStudents"].forEach((id) => {
    const checkbox = document.getElementById(id);
    if (checkbox) checkbox.checked = false;
  });
  renderRecipientList("admins");
  renderRecipientList("faculty");
  renderRecipientList("students");
}

async function sendApplication(event) {
  event.preventDefault();
  const subject = String(document.getElementById("appSubject")?.value || "").trim();
  const message = String(document.getElementById("appContent")?.value || "").trim();
  const recipients = buildRecipientsPayload();

  if (!subject || !message) {
    setStatus("Subject and content are required.", true);
    return;
  }
  if (!recipients.length) {
    setStatus("Please select at least one recipient.", true);
    return;
  }

  try {
    const data = await fetchJson(`${APPLICATIONS_API_BASE}/send/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(getRequesterPayload({ subject, message, recipients })),
    });
    setStatus(data.message || "Application sent successfully.");
    resetComposeForm();
    switchView("sent");
  } catch (error) {
    setStatus(error.message || "Failed to send application.", true);
  }
}

async function submitResponse() {
  if (!currentApplication) return;

  const responseMessage = String(document.getElementById("responseMessage")?.value || "").trim();
  const responseStatus = String(document.getElementById("responseStatus")?.value || "Resolved").trim();

  try {
    const data = await fetchJson(`${APPLICATIONS_API_BASE}/respond/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        getRequesterPayload({
          app_ref: currentApplication.app_ref,
          status: responseStatus,
          response_message: responseMessage,
        }),
      ),
    });
    setStatus(data.message || "Response sent.");
    closeApplicationModal();
    await loadApplications(currentView);
  } catch (error) {
    setStatus(error.message || "Failed to submit response.", true);
  }
}

async function updateApplicationStatus(status) {
  if (!currentApplication) return;

  try {
    const data = await fetchJson(`${APPLICATIONS_API_BASE}/respond/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        getRequesterPayload({
          app_ref: currentApplication.app_ref,
          status,
          response_message: "",
        }),
      ),
    });
    setStatus(data.message || `Application marked as ${status}.`);
    closeApplicationModal();
    await loadApplications(currentView);
  } catch (error) {
    setStatus(error.message || "Failed to update application.", true);
  }
}

async function deleteApplication(appRef) {
  if (!appRef) return;
  const confirmed = window.confirm("Remove this sent application? This will delete it for the recipient too.");
  if (!confirmed) return;

  try {
    const data = await fetchJson(`${APPLICATIONS_API_BASE}/delete/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(getRequesterPayload({ app_ref: appRef })),
    });
    setStatus(data.message || "Application removed successfully.");
    if (currentApplication && currentApplication.app_ref === appRef) {
      closeApplicationModal();
      currentApplication = null;
    }
    await loadApplications(currentView);
  } catch (error) {
    setStatus(error.message || "Failed to remove application.", true);
  }
}

function initApplicationsPage() {
  const user = getCurrentUser();
  if (!user) {
    window.location.href = getLoginRedirectPath();
    return;
  }

  document.getElementById("closeApplicationModalBtn")?.addEventListener("click", closeApplicationModal);
  document.getElementById("applicationModalOverlay")?.addEventListener("click", (event) => {
    if (event.target.id === "applicationModalOverlay") {
      closeApplicationModal();
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeApplicationModal();
    }
  });

  loadRecipients();
  switchView("inbox");
}

document.addEventListener("DOMContentLoaded", initApplicationsPage);
