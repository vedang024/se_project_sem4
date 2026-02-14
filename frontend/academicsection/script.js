// Time slots configuration (fixed)
const TIME_SLOTS = [
  '9-10', '10-11', '11-12', '12-1', '1-2', '2-3', '3-4', '4-5', '5-6'
];

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

// Data store - initialized before any function access
const timetableData = {
  monday: {},
  tuesday: {},
  wednesday: {},
  thursday: {},
  friday: {},
  saturday: {}
};

let batches = [];
let currentDay = 'monday';
let currentCell = null;

// DOM Elements - get after DOM is ready
let timetableBody, batchCount, emptyState, modalOverlay;
let subjectInput, facultyInput, roomInput;

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
  // Initialize DOM references
  timetableBody = document.getElementById('timetableBody');
  batchCount = document.getElementById('batchCount');
  emptyState = document.getElementById('emptyState');
  modalOverlay = document.getElementById('modalOverlay');
  subjectInput = document.getElementById('subjectInput');
  facultyInput = document.getElementById('facultyInput');
  roomInput = document.getElementById('roomInput');

  // Initialize event listeners
  initEventListeners();
  
  // Add some demo data
  addDemoData();
});

function initEventListeners() {
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
  // Add a sample batch
  const batchId = generateId();
  batches.push({ id: batchId, name: 'CS-3A' });
  
  // Add sample data for Monday
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

function generateId() {
  return 'batch_' + Math.random().toString(36).substr(2, 9);
}

function switchDay(day) {
  currentDay = day;
  
  // Update tabs
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
  
  // Initialize empty data for this batch across all days
  DAYS.forEach(day => {
    timetableData[day][batchId] = {};
  });

  renderTable();

  // Focus on the new batch name input
  setTimeout(() => {
    const input = document.querySelector(`[data-batch-id="${batchId}"] .batch-name input`);
    if (input) input.focus();
  }, 50);
}

function deleteBatch(batchId) {
  batches = batches.filter(b => b.id !== batchId);
  
  // Remove data for this batch
  DAYS.forEach(day => {
    delete timetableData[day][batchId];
  });

  renderTable();
}

function renderTable() {
  // Update batch count
  const count = batches.length;
  batchCount.textContent = `${count} batch${count !== 1 ? 'es' : ''}`;
  
  // Toggle empty state
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
  
  // Get existing data
  const cellData = timetableData[currentDay][batchId]?.[slot] || {};
  
  // Populate inputs
  subjectInput.value = cellData.subject || '';
  facultyInput.value = cellData.faculty || '';
  roomInput.value = cellData.room || '';

  // Show modal
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
    // If no subject, clear the cell
    delete timetableData[currentDay][batchId][slot];
  } else {
    // Save data
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