// Configuration
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzgzQuHcMe7OSdr1_UXhcAqKcHR7WuZzavrqsRTPypEokypy_lmLHnEcF6e5PEf-ivkYQ/exec';
const GOOGLE_CLIENT_ID = '1023743946723-vpp75o0it26q56tjrirmekntjslqg6gd.apps.googleusercontent.com';
const ADMIN_EMAIL = 'bellsystem.insightcollege@gmail.com';

let idToken = null;
let userEmail = null;
let daysSchedule = {
    "Monday": { enabled: false, periods: [] },
    "Tuesday": { enabled: false, periods: [] },
    "Wednesday": { enabled: false, periods: [] },
    "Thursday": { enabled: false, periods: [] },
    "Friday": { enabled: false, periods: [] },
    "Saturday": { enabled: false, periods: [] },
    "Sunday": { enabled: false, periods: [] },
    "Special Day": { enabled: false, periods: [] }
};
let isExamMode = false;
let expandedDay = null;
let deferredPrompt = null;

// Google Identity Services initialization
function initGoogleAuth() {
    google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: handleCredentialResponse
    });
    google.accounts.id.renderButton(
        document.getElementById('googleLoginBtn'),
        { theme: 'outline', size: 'large' }
    );
}

function handleCredentialResponse(response) {
    idToken = response.credential;
    // Decode JWT to get email (simple)
    const payload = JSON.parse(atob(idToken.split('.')[1]));
    userEmail = payload.email;
    if (userEmail !== ADMIN_EMAIL) {
        alert('Access denied. Only admin can log in.');
        google.accounts.id.disableAutoSelect();
        return;
    }
    // Show dashboard
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('dashboard').style.display = 'block';
    loadAllData();
}

// Logout
document.getElementById('logoutBtn').addEventListener('click', () => {
    idToken = null;
    userEmail = null;
    google.accounts.id.disableAutoSelect();
    document.getElementById('loginScreen').style.display = 'block';
    document.getElementById('dashboard').style.display = 'none';
});

// Generic API call to Apps Script
async function apiCall(action, method = 'GET', body = null) {
    let url = `${APPS_SCRIPT_URL}?action=${action}&token=${idToken}`;
    const options = { method: method };
    if (method === 'POST' && body) {
        options.headers = { 'Content-Type': 'application/json' };
        options.body = JSON.stringify(body);
    }
    const response = await fetch(url, options);
    return await response.json();
}

// Load all data (day statuses and periods)
async function loadAllData() {
    try {
        // Fetch all day statuses
        const statusRes = await apiCall('getAllDaysStatus');
        if (statusRes.success) {
            for (let day in daysSchedule) {
                daysSchedule[day].enabled = statusRes.status[day] || false;
            }
        }
        // Fetch periods for each day
        for (let day of Object.keys(daysSchedule)) {
            const dayRes = await apiCall('getDay', 'GET', null, { day: day });
            if (dayRes.success) {
                daysSchedule[day].periods = dayRes.periods;
                daysSchedule[day].enabled = dayRes.enabled;
            }
        }
        initializeDays();
        updatePeriodsCount();
        calculateNextBell();
    } catch (error) {
        console.error('Error loading data:', error);
        alert('Failed to load data. Please try again.');
    }
}

// Initialize day cards
function initializeDays() {
    const scheduleList = document.getElementById('scheduleList');
    scheduleList.innerHTML = '';
    Object.keys(daysSchedule).forEach(dayName => {
        const dayCard = createDayCard(dayName);
        scheduleList.appendChild(dayCard);
    });
}

// Create day card
function createDayCard(dayName) {
    const day = daysSchedule[dayName];
    const periodCount = day.periods.length;
    const dayCard = document.createElement('div');
    dayCard.className = `day-card ${day.enabled ? 'active' : ''} ${isExamMode && dayName === 'Special Day' ? 'exam-mode' : ''}`;
    dayCard.id = `day-${dayName.replace(/\s+/g, '-').toLowerCase()}`;
    dayCard.innerHTML = `
        <div class="day-header" onclick="toggleDayExpansion('${dayName}')">
            <div class="day-info">
                <i class="ri-arrow-right-s-fill day-icon"></i>
                <span class="day-title">${dayName}</span>
                <span class="period-count">${periodCount} period${periodCount !== 1 ? 's' : ''}</span>
            </div>
            <div class="day-toggle">
                <label class="toggle-switch">
                    <input type="checkbox" ${day.enabled ? 'checked' : ''} onchange="toggleDay('${dayName}', this.checked)">
                    <span class="toggle-slider"></span>
                </label>
                <button class="add-period-btn" onclick="openAddPeriodModal('${dayName}')">
                    <i class="ri-apps-2-add-fill"></i>
                </button>
            </div>
        </div>
        <div class="periods-container">
            ${renderPeriodsForDay(dayName)}
        </div>
    `;
    return dayCard;
}

// Render periods for a day
function renderPeriodsForDay(dayName) {
    const periods = daysSchedule[dayName].periods;
    if (periods.length === 0) {
        return '<div class="no-periods">No periods added</div>';
    }
    return periods.map((period, index) => `
        <div class="period-item">
            <div class="period-info">
                <h4>${period.name}</h4>
                <div class="period-time">
                    <i class="far fa-clock"></i> ${period.startTime} - ${period.endTime}
                    <span class="duration">(${period.bellDuration}s bell)</span>
                </div>
            </div>
            <div class="period-actions">
                <button class="btn delete-period-btn" onclick="deletePeriod('${dayName}', '${period.periodId}')">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        </div>
    `).join('');
}

// Toggle day expansion
function toggleDayExpansion(dayName) {
    const dayCard = document.getElementById(`day-${dayName.replace(/\s+/g, '-').toLowerCase()}`);
    if (expandedDay === dayName) {
        dayCard.classList.remove('day-expanded');
        expandedDay = null;
    } else {
        if (expandedDay) {
            document.getElementById(`day-${expandedDay.replace(/\s+/g, '-').toLowerCase()}`).classList.remove('day-expanded');
        }
        dayCard.classList.add('day-expanded');
        expandedDay = dayName;
    }
}

// Toggle day
async function toggleDay(dayName, enabled) {
    if (isExamMode && dayName !== 'Special Day' && enabled) {
        alert('Cannot enable regular days in Exam mode. Disable Special Day first.');
        document.querySelector(`#day-${dayName.replace(/\s+/g, '-').toLowerCase()} input[type="checkbox"]`).checked = false;
        return;
    }
    // Update backend
    const result = await apiCall('toggleDay', 'POST', { day: dayName, enabled: enabled });
    if (result.success) {
        // Update local state
        daysSchedule[dayName].enabled = enabled;
        if (dayName === 'Special Day' && enabled) {
            isExamMode = true;
            Object.keys(daysSchedule).forEach(d => {
                if (d !== 'Special Day') {
                    daysSchedule[d].enabled = false;
                    updateDayCard(d);
                }
            });
            daysSchedule['Special Day'].enabled = true;
            updateDayCard('Special Day');
        } else if (dayName === 'Special Day' && !enabled) {
            isExamMode = false;
            daysSchedule['Special Day'].enabled = false;
            updateDayCard('Special Day');
        } else {
            updateDayCard(dayName);
        }
        // Update mode selector
        document.querySelector('input[name="scheduleMode"][value="exam"]').checked = isExamMode;
        document.querySelector('input[name="scheduleMode"][value="regular"]').checked = !isExamMode;
    } else {
        alert('Failed to toggle day.');
    }
}

// Update day card in UI
function updateDayCard(dayName) {
    const dayCard = document.getElementById(`day-${dayName.replace(/\s+/g, '-').toLowerCase()}`);
    const newDayCard = createDayCard(dayName);
    if (dayCard.classList.contains('day-expanded')) {
        newDayCard.classList.add('day-expanded');
    }
    dayCard.replaceWith(newDayCard);
    updatePeriodsCount();
    calculateNextBell();
}

// Open add period modal
function openAddPeriodModal(dayName) {
    document.getElementById('addPeriodModal').style.display = 'flex';
    document.getElementById('selectedDay').value = dayName;
    document.getElementById('periodDay').value = dayName;
}

// Close modal
document.querySelectorAll('.close, .cancel-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.getElementById('addPeriodModal').style.display = 'none';
        document.getElementById('periodForm').reset();
    });
});

// Save period (add)
document.getElementById('periodForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const dayName = document.getElementById('periodDay').value;
    const name = document.getElementById('periodName').value;
    const startTime = document.getElementById('startTime').value;
    const endTime = document.getElementById('endTime').value;
    const bellDuration = parseInt(document.getElementById('bellDuration').value);

    if (startTime >= endTime) {
        alert('End time must be after start time.');
        return;
    }

    const result = await apiCall('addPeriod', 'POST', {
        day: dayName,
        name: name,
        startTime: startTime,
        endTime: endTime,
        bellDuration: bellDuration
    });

    if (result.success) {
        // Refresh data for that day
        const dayRes = await apiCall('getDay', 'GET', null, { day: dayName });
        if (dayRes.success) {
            daysSchedule[dayName].periods = dayRes.periods;
            updateDayCard(dayName);
        }
        document.getElementById('addPeriodModal').style.display = 'none';
        document.getElementById('periodForm').reset();
    } else {
        alert('Failed to add period.');
    }
});

// Delete period
async function deletePeriod(dayName, periodId) {
    if (!confirm('Are you sure you want to delete this period?')) return;
    const result = await apiCall('deletePeriod', 'POST', { day: dayName, periodId: periodId });
    if (result.success) {
        daysSchedule[dayName].periods = daysSchedule[dayName].periods.filter(p => p.periodId !== periodId);
        updateDayCard(dayName);
    } else {
        alert('Failed to delete period.');
    }
}

// Manual ring (not implemented here; could be added later)

// Update clock
function updateCurrentTime() {
    const now = new Date();
    document.getElementById('currentTime').textContent = now.toLocaleTimeString('en-US', { hour12: true, hour: '2-digit', minute: '2-digit', second: '2-digit' });
}
setInterval(updateCurrentTime, 1000);
updateCurrentTime();

// PWA install prompt
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    // Show custom prompt after a delay
    setTimeout(() => {
        if (!localStorage.getItem('pwaPromptShown')) {
            document.getElementById('pwaInstallPrompt').style.display = 'flex';
            localStorage.setItem('pwaPromptShown', 'true');
        }
    }, 2000);
});

document.getElementById('installPwaBtn').addEventListener('click', async () => {
    if (deferredPrompt) {
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === 'accepted') {
            deferredPrompt = null;
        }
        document.getElementById('pwaInstallPrompt').style.display = 'none';
    }
});

document.getElementById('closePwaPrompt').addEventListener('click', () => {
    document.getElementById('pwaInstallPrompt').style.display = 'none';
});

document.getElementById('laterBtn').addEventListener('click', () => {
    document.getElementById('pwaInstallPrompt').style.display = 'none';
});

// Init
window.onload = () => {
    initGoogleAuth();
    // Check if already logged in (e.g., after page reload)
    const token = localStorage.getItem('idToken');
    if (token) {
        // You could verify token validity here
    }
};