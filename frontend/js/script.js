// ==========================================
// CONFIGURATION & STATE
// ==========================================

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const TIME_SLOTS = ['9-10', '10-11', '11-12', '12-1', '1-2', '2-3', '3-4', '4-5', '5-6'];

// Timetable State
const timetableData = {
  monday: {}, tuesday: {}, wednesday: {}, thursday: {}, friday: {}, saturday: {}
};
let batches = [];
let currentDay = 'monday';
let currentCell = null;

// Department State
let departments = [
  { id: 'dept_1', code: 'CS', name: 'Computer Science', hod: 'Dr. Alan Turing', faculty: 12, courses: 8, color: '#10b981', bg: 'rgba(16, 185, 129, 0.15)' },
  { id: 'dept_2', code: 'EE', name: 'Electrical Eng.', hod: 'Prof. Nikola Tesla', faculty: 10, courses: 6, color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.15)' },
  { id: 'dept_3', code: 'ME', name: 'Mechanical Eng.', hod: 'Dr. M. Curie', faculty: 8, courses: 5, color: '#f97316', bg: 'rgba(249, 115, 22, 0.15)' },
  { id: 'dept_4', code: 'MA', name: 'Mathematics', hod: 'Prof. Euclid', faculty: 6, courses: 4, color: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.15)' },
  { id: 'dept_5', code: 'PY', name: 'Physics', hod: 'Dr. R. Feynman', faculty: 5, courses: 3, color: '#ec4899', bg: 'rgba(236, 72, 153, 0.15)' }
];

// ==========================================
// INITIALIZATION
// ==========================================

document.addEventListener('DOMContentLoaded', function() {
  // Initialize Timetable if on that page
  if (document.getElementById('timetableBody')) {
    initTimetable();
  }

  // Initialize Departments if on that page
  if (document.getElementById('departmentsGrid')) {
    initDepartments();
  }
});

// ==========================================
// UTILITY FUNCTIONS
// ==========================================

function generateId() {
  return 'id_' + Math.random().toString(36).substr(2, 9);
}

// ==========================================
// TIMETABLE LOGIC
// ==========================================

function initTimetable() {
  // Cache DOM elements
  timetableBody = document.getElementById('timetableBody');
  batchCount = document.getElementById('batchCount');
  emptyState = document.getElementById('emptyState');
  modalOverlay = document.getElementById('modalOverlay');
  subjectInput = document.getElementById('subjectInput');
  facultyInput = document.getElementById('facultyInput');
  roomInput = document.getElementById('roomInput');

  initTimetableEvents();
  addDemoData();
}

function initTimetableEvents() {
  // Day tabs
  document.querySelectorAll('.day-tab').forEach(tab => {
    tab.addEventListener('click', () => switchDay(tab.dataset.day));
  });

  // Add batch button
  document.getElementById('addBatchBtn').addEventListener('click', addBatch);

  // Modal controls
  document.getElementById('closeModalBtn').addEventListener('click', closeModal);
  document.getElementById('saveCellBtn').addEventListener('click', saveCell);
  document.getElementById('clearCellBtn').addEventListener('click', clearCell);

  // Close modal on overlay click
  modalOverlay.addEventListener('click', (e) => {
    if (e.target === modalOverlay) closeModal();
  });

  // Keyboard navigation
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modalOverlay.classList.contains('active')) {
      closeModal();
    }
  });
}

function addDemoData() {
  const batchId = generateId();
  batches.push({ id: batchId, name: 'CS-3A' });
  
  timetableData.monday[batchId] = {
    '9-10': { subject: 'CS301', faculty: 'Dr. R', room: '301' },
    '10-11': { subject: 'CS302', faculty: 'Prof. M', room: 'LAB-A' },
    '2-3': { subject: 'CS303', faculty: 'Dr. S', room: '201' }
  };

  const batchId2 = generateId();
  batches.push({ id: batchId2, name: 'CS-3B' });
  
  timetableData.monday[batchId2] = {
    '11-12': { subject: 'MATH301', faculty: 'Prof. K', room: '102' },
    '3-4': { subject: 'CS304', faculty: 'Dr. P', room: 'LAB-B' }
  };

  renderTable();
}

function switchDay(day) {
  currentDay = day;
  
  document.querySelectorAll('.day-tab').forEach(tab => {
    const isActive = tab.dataset.day === day;
    tab.classList.toggle('active', isActive);
    tab.setAttribute('aria-selected', isActive);
  });

  renderTable();
}

function addBatch() {
  const batchId = generateId();
  batches.push({ id: batchId, name: '' });
  
  DAYS.forEach(day => {
    timetableData[day][batchId] = {};
  });

  renderTable();

  setTimeout(() => {
    const input = document.querySelector(`[data-batch-id="${batchId}"] .batch-name input`);
    if (input) input.focus();
  }, 50);
}

function deleteBatch(batchId) {
  batches = batches.filter(b => b.id !== batchId);
  DAYS.forEach(day => {
    delete timetableData[day][batchId];
  });
  renderTable();
}

function renderTable() {
  const count = batches.length;
  batchCount.textContent = `${count} batch${count !== 1 ? 'es' : ''}`;
  
  emptyState.style.display = count === 0 ? 'block' : 'none';
  timetableBody.style.display = count > 0 ? 'table-row-group' : 'none';

  if (count === 0) return;

  timetableBody.innerHTML = batches.map(batch => {
    const batchData = timetableData[currentDay][batch.id] || {};
    
    return `
      <tr data-batch-id="${batch.id}">
        <td>
          <div class="batch-name">
            <input 
              type="text" 
              value="${batch.name}" 
              placeholder="Enter batch name"
              onchange="updateBatchName('${batch.id}', this.value)"
              aria-label="Batch name"
            >
            <button 
              class="delete-batch" 
              onclick="deleteBatch('${batch.id}')"
              aria-label="Delete batch"
              title="Delete batch"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
            </button>
          </div>
        </td>
        ${TIME_SLOTS.map(slot => {
          const cellData = batchData[slot];
          const hasData = cellData && cellData.subject;
          return `
            <td>
              <div 
                class="cell ${hasData ? 'filled' : ''}"
                onclick="openCellEditor('${batch.id}', '${slot}')"
                role="gridcell"
                tabindex="0"
                aria-label="${slot} time slot${hasData ? ', ' + cellData.subject : ', empty'}"
                onkeydown="handleCellKeydown(event, '${batch.id}', '${slot}')"
              >
                ${hasData ? `
                  <div class="cell-content">
                    <span class="subject">${cellData.subject}</span>
                    <span class="faculty">${cellData.faculty}</span>
                    <span class="room">${cellData.room}</span>
                  </div>
                ` : `
                  <div class="flex items-center justify-center h-full" style="color: var(--muted);">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                      <line x1="12" y1="5" x2="12" y2="19"></line>
                      <line x1="5" y1="12" x2="19" y2="12"></line>
                    </svg>
                  </div>
                `}
              </div>
            </td>
          `;
        }).join('')}
      </tr>
    `;
  }).join('');
}

function updateBatchName(batchId, name) {
  const batch = batches.find(b => b.id === batchId);
  if (batch) batch.name = name;
}

function handleCellKeydown(event, batchId, slot) {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    openCellEditor(batchId, slot);
  }
}

function openCellEditor(batchId, slot) {
  currentCell = { batchId, slot };
  const cellData = timetableData[currentDay][batchId]?.[slot] || {};
  
  subjectInput.value = cellData.subject || '';
  facultyInput.value = cellData.faculty || '';
  roomInput.value = cellData.room || '';

  modalOverlay.classList.add('active');
  subjectInput.focus();
}

function closeModal() {
  modalOverlay.classList.remove('active');
  currentCell = null;
}

function saveCell() {
  if (!currentCell) return;

  const { batchId, slot } = currentCell;
  const subject = subjectInput.value.trim().toUpperCase();
  const faculty = facultyInput.value.trim();
  const room = roomInput.value.trim();

  if (!subject) {
    delete timetableData[currentDay][batchId][slot];
  } else {
    if (!timetableData[currentDay][batchId]) {
      timetableData[currentDay][batchId] = {};
    }
    timetableData[currentDay][batchId][slot] = { subject, faculty, room };
  }

  renderTable();
  closeModal();
}

function clearCell() {
  if (!currentCell) return;
  const { batchId, slot } = currentCell;
  delete timetableData[currentDay][batchId][slot];
  renderTable();
  closeModal();
}

// ==========================================
// DEPARTMENT LOGIC
// ==========================================

function initDepartments() {
  renderDepartments();
  
  // Attach listener to Add Department button
  const addBtn = document.getElementById('addDeptBtn');
  if (addBtn) {
    addBtn.addEventListener('click', openDeptModal);
  }
  
  // Close Dept Modal on overlay click
  const deptOverlay = document.getElementById('deptModalOverlay');
  if (deptOverlay) {
    deptOverlay.addEventListener('click', (e) => {
      if (e.target === deptOverlay) closeDeptModal();
    });
    
    // Attach form submit listener
    const form = document.getElementById('deptForm');
    if (form) form.addEventListener('submit', saveDepartment);
    
    // Attach close button listener
    const closeBtn = document.getElementById('closeDeptModalBtn');
    if (closeBtn) closeBtn.addEventListener('click', closeDeptModal);
  }
}

function renderDepartments() {
  const grid = document.getElementById('departmentsGrid');
  if (!grid) return;

  // Keep the "Add New" card if it exists, otherwise create it
  const addNewCard = `
    <div class="card add-new-card" onclick="openDeptModal()">
      <div class="add-new-content">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" style="color: var(--muted);">
          <line x1="12" y1="5" x2="12" y2="19"></line>
          <line x1="5" y1="12" x2="19" y2="12"></line>
        </svg>
        <p>Add Department</p>
      </div>
    </div>
  `;

  grid.innerHTML = departments.map(dept => `
    <div class="card" data-id="${dept.id}">
      <div class="dept-header">
        <div class="dept-icon" style="background: ${dept.bg}; color: ${dept.color};">${dept.code}</div>
        <h3>${dept.name}</h3>
      </div>
      <div class="dept-stats">
        <div class="stat-item">
          <span class="stat-label">HOD</span>
          <span class="stat-value">${dept.hod}</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">Faculty</span>
          <span class="stat-value">${dept.faculty}</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">Courses</span>
          <span class="stat-value">${dept.courses}</span>
        </div>
      </div>
      <div class="dept-actions">
        <button class="btn btn-secondary btn-sm">View Details</button>
      </div>
    </div>
  `).join('') + addNewCard;
}

function openDeptModal() {
  const modal = document.getElementById('deptModalOverlay');
  if (modal) {
    modal.classList.add('active');
    document.getElementById('deptNameInput').focus();
  }
}

function closeDeptModal() {
  const modal = document.getElementById('deptModalOverlay');
  const form = document.getElementById('deptForm');
  if (modal) modal.classList.remove('active');
  if (form) form.reset();
}

function saveDepartment(e) {
  e.preventDefault();
  
  const name = document.getElementById('deptNameInput').value.trim();
  const code = document.getElementById('deptCodeInput').value.trim().toUpperCase();
  const hod = document.getElementById('deptHODInput').value.trim();
  
  if (!name || !code) return;

  // Simple random color generation for demo
  const colors = ['#10b981', '#3b82f6', '#f97316', '#8b5cf6', '#ec4899', '#14b8a6'];
  const randomColor = colors[Math.floor(Math.random() * colors.length)];
  
  // Create rgba background version
  const rgb = hexToRgb(randomColor);
  const bgColor = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.15)`;

  const newDept = {
    id: generateId(),
    code: code,
    name: name,
    hod: hod || 'TBD',
    faculty: 0,
    courses: 0,
    color: randomColor,
    bg: bgColor
  };

  departments.push(newDept);
  renderDepartments();
  closeDeptModal();
}

// Helper to convert hex to rgb for opacity
function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : null;
}


// ==========================================
// APPLICATION PAGE DATA & LOGIC
// ==========================================

// Mock Data
const studentsData = [
  { id: 's1', name: 'Rahul Sharma', rollNo: '2021CS101', dept: 'CS' },
  { id: 's2', name: 'Priya Singh', rollNo: '2021ME102', dept: 'ME' },
  { id: 's3', name: 'Amit Verma', rollNo: '2021EE103', dept: 'EE' },
  { id: 's4', name: 'Sneha Kapoor', rollNo: '2021CS104', dept: 'CS' },
  { id: 's5', name: 'Rohit Gupta', rollNo: '2021CE105', dept: 'CE' },
  { id: 's6', name: 'Anjali Rao', rollNo: '2021CS106', dept: 'CS' },
  { id: 's7', name: 'Vikram Bose', rollNo: '2021EE107', dept: 'EE' },
];

const facultyData = [
  { id: 'f1', name: 'Dr. Alan Turing', empId: 'FAC001', dept: 'CS' },
  { id: 'f2', name: 'Prof. Nikola Tesla', empId: 'FAC002', dept: 'EE' },
  { id: 'f3', name: 'Dr. Marie Curie', empId: 'FAC003', dept: 'PHY' },
  { id: 'f4', name: 'Prof. Carl Sagan', empId: 'FAC004', dept: 'AST' },
  { id: 'f5', name: 'Dr. A. P. J.', empId: 'FAC005', dept: 'PHY' },
];

// Store for Sent Applications
let sentApplications = [
  { id: 'sent1', to: 'All Students', subject: 'Holiday Notice', date: 'Oct 20, 2023', status: 'Delivered' },
];

// Initialize Application Page
function initApplicationsPage() {
  const studList = document.getElementById('studentsList');
  const facList = document.getElementById('facultyList');
  
  if (studList && facList) {
    populateDepartmentFilters(); // NEW: Populate dropdowns
    renderRecipients('students', '');
    renderRecipients('faculty', '');
    renderSentApplications();
  }
}

// --- Helper to populate dropdowns ---
function populateDepartmentFilters() {
  // Get unique departments from data
  const studentDepts = [...new Set(studentsData.map(s => s.dept))];
  const facultyDepts = [...new Set(facultyData.map(f => f.dept))];

  const studentSelect = document.getElementById('studentDeptFilter');
  const facultySelect = document.getElementById('facultyDeptFilter');

  populateSelect(studentSelect, studentDepts);
  populateSelect(facultySelect, facultyDepts);
}

function populateSelect(selectEl, depts) {
  depts.forEach(dept => {
    const option = document.createElement('option');
    option.value = dept;
    option.textContent = dept + ' Dept';
    selectEl.appendChild(option);
  });
}

// --- Rendering & Filtering ---

function getSearchValue(type) {
  const input = document.getElementById(type + 'Search');
  return input ? input.value : '';
}

function getDeptFilterValue(type) {
  const select = document.getElementById(type + 'DeptFilter');
  return select ? select.value : 'all';
}

function renderRecipients(type, query) {
  const listId = type === 'students' ? 'studentsList' : 'facultyList';
  const data = type === 'students' ? studentsData : facultyData;
  const container = document.getElementById(listId);

  // Get Filter Values
  const lowerQuery = query.toLowerCase();
  const deptFilter = getDeptFilterValue(type);

  // Filter Logic
  const filtered = data.filter(item => {
    const matchesText = item.name.toLowerCase().includes(lowerQuery) || 
                        (type === 'students' ? item.rollNo : item.empId).toLowerCase().includes(lowerQuery);
    
    const matchesDept = (deptFilter === 'all') || (item.dept === deptFilter);

    return matchesText && matchesDept;
  });

  // Render HTML
  if (filtered.length === 0) {
    container.innerHTML = `<div style="text-align:center; padding: 1rem; color: var(--muted); font-size: 0.85rem;">No results found</div>`;
    return;
  }

  container.innerHTML = filtered.map(item => `
    <div class="recipient-item">
      <label class="checkbox-container">
        <div class="recipient-info">
          <span class="recipient-name">${item.name}</span>
          <span class="recipient-meta">
            ${type === 'students' ? 'Roll No: ' + item.rollNo : 'ID: ' + item.empId} 
            <span style="opacity:0.6"> | ${item.dept}</span>
          </span>
        </div>
        <input type="checkbox" name="recipient" value="${item.id}">
        <span class="checkmark"></span>
      </label>
    </div>
  `).join('');
}

function filterRecipients(type, query) {
  renderRecipients(type, query);
}

function toggleSelectAll(checkbox, listId) {
  // Only selects VISIBLE items (respecting current filter)
  const checkboxes = document.querySelectorAll(`#${listId} input[type="checkbox"]`);
  checkboxes.forEach((cb) => {
    cb.checked = checkbox.checked;
  });
}

// --- Send & View Logic (Same as before) ---

function switchView(view) {
  const inboxView = document.getElementById('inboxView');
  const sentView = document.getElementById('sentView');
  const inboxTab = document.getElementById('inboxTab');
  const sentTab = document.getElementById('sentTab');

  if (view === 'inbox') {
    inboxView.classList.remove('hidden');
    sentView.classList.add('hidden');
    inboxTab.classList.add('active');
    sentTab.classList.remove('active');
  } else {
    inboxView.classList.add('hidden');
    sentView.classList.remove('hidden');
    inboxTab.classList.remove('active');
    sentTab.classList.add('active');
  }
}

function renderSentApplications() {
  const container = document.getElementById('sentAppsList');
  if (!container) return;

  if (sentApplications.length === 0) {
    container.innerHTML = `<div style="text-align:center; padding: 2rem; color: var(--muted);">No sent applications yet.</div>`;
    return;
  }

  container.innerHTML = sentApplications.map(app => `
    <div class="application-card">
      <div class="app-card-header">
        <span class="sender-name">To: ${app.to}</span>
        <span class="timestamp">${app.date}</span>
      </div>
      <div class="app-card-subject">${app.subject}</div>
      <div class="app-card-meta">
        <span class="status ${app.status === 'Read' ? 'approved' : 'pending'}">${app.status}</span>
      </div>
      <div class="app-card-actions">
        <button class="btn btn-secondary btn-sm">View</button>
      </div>
    </div>
  `).join('');
}

function sendApplication(e) {
  e.preventDefault();
  
  const subject = document.getElementById('appSubject').value;
  
  // Get selected recipients
  const selectedStudents = Array.from(document.querySelectorAll('#studentsList input:checked')).map(el => {
    const data = studentsData.find(s => s.id === el.value);
    return data ? data.name : '';
  });
  
  const selectedFaculty = Array.from(document.querySelectorAll('#facultyList input:checked')).map(el => {
    const data = facultyData.find(f => f.id === el.value);
    return data ? data.name : '';
  });

  const allRecipients = [...selectedStudents, ...selectedFaculty];
  
  if (allRecipients.length === 0) {
    alert("Please select at least one recipient.");
    return;
  }

  // Add to sent list
  const newApp = {
    id: 'sent_' + Math.random().toString(36).substr(2, 9),
    to: allRecipients.length > 2 ? `${allRecipients.length} Recipients` : allRecipients.join(', '),
    subject: subject,
    date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
    status: 'Delivered'
  };

  sentApplications.unshift(newApp);
  renderSentApplications();

  // Reset form
  document.getElementById('appForm').reset();
  document.getElementById('fileNameDisplay').textContent = 'Click to upload or drag files here';
  document.getElementById('fileNameDisplay').style.color = 'var(--muted)';
  
  // Reset filters visually
  document.getElementById('studentDeptFilter').value = 'all';
  document.getElementById('facultyDeptFilter').value = 'all';
  
  // Uncheck all checkboxes
  document.querySelectorAll('.recipient-list input[type="checkbox"]').forEach(cb => cb.checked = false);
  // Re-render lists to show all (reset view)
  renderRecipients('students', '');
  renderRecipients('faculty', '');

  alert("Application sent successfully!");
  switchView('sent');
}

function updateFileName(input) {
  const display = document.getElementById('fileNameDisplay');
  if (input.files.length > 0) {
    const names = Array.from(input.files).map(f => f.name).join(', ');
    display.textContent = names;
    display.style.color = 'var(--accent)';
  } else {
    display.textContent = 'Click to upload or drag files here';
    display.style.color = 'var(--muted)';
  }
}