function getStudentSessionData() {
  const storedStudent = JSON.parse(localStorage.getItem("erp_student") || "null");
  if (storedStudent) {
    return storedStudent;
  }

  return JSON.parse(localStorage.getItem("erp_user") || "null");
}

function textOrFallback(value, fallback = "-") {
  const normalized = String(value || "").trim();
  return normalized || fallback;
}

function setStudentField(fieldId, value, fallback) {
  const element = document.getElementById(fieldId);
  if (!element) return;
  element.textContent = textOrFallback(value, fallback);
}

(function populateStudentDashboardInfo() {
  const student = getStudentSessionData();

  if (!student || student.role !== "student") {
    setStudentField("studentInfoNote", "Unable to load student profile from current session.");
    return;
  }

  setStudentField("studentName", student.full_name, "Not Provided");
  setStudentField("studentUsername", student.username, "-");
  setStudentField("studentDepartment", student.department, "Not Assigned");
  setStudentField("studentBranch", student.branch || student.branch_name, "Not Assigned");
  setStudentField("studentBranchId", student.branch_id, "Not Assigned");
  setStudentField("studentBatch", student.batch || student.batch_name, "Not Assigned");

  const note = document.getElementById("studentInfoNote");
  if (note) {
    note.textContent = "Profile data is loaded from your login session.";
  }
})();

