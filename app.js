// Configuration
const CONFIG = {
    CLIENT_ID: 'YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com',
    API_KEY: 'YOUR_GOOGLE_API_KEY',
    SCOPES: 'https://www.googleapis.com/auth/spreadsheets',
    APPS_SCRIPT_URL: 'https://script.google.com/macros/s/YOUR_SCRIPT_ID/exec',
    ADMIN_EMAIL: 'admin@school.com'
};

// State
let currentUser = null;
let currentDay = null;
let daysStatus = {};

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    initializeGoogleAuth();
    checkLoginStatus();
});

// Google Auth
function initializeGoogleAuth() {
    gapi.load('auth2', () => {
        gapi.auth2.init({
            client_id: CONFIG.CLIENT_ID,
            scope: CONFIG.SCOPES
        });
    });
}

function checkLoginStatus() {
    const savedUser = localStorage.getItem('bellSystemUser');
    if (savedUser) {
        const user = JSON.parse(savedUser);
        if (user.email === CONFIG.ADMIN_EMAIL) {
            showDashboard(user);
        }
    }
}

document.getElementById('googleSignIn').addEventListener('click', () => {
    const auth2 = gapi.auth2.getAuthInstance();
    auth2.signIn().then(googleUser => {
        const profile = googleUser.getBasicProfile();
        const user = {
            email: profile.getEmail(),
            name: profile.getName()
        };

        authenticateUser(user);
    }).catch(error => {
        showLoginError('Sign in failed. Please try again.');
    });
});

async function authenticateUser(user) {
    try {
        const response = await fetch(CONFIG.APPS_SCRIPT_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                action: 'authenticate',
                email: user.email
            })
        });

        const data = await response.json();

        if (data.isAdmin) {
            localStorage.setItem('bellSystemUser', JSON.stringify(user));
            showDashboard(user);
        } else {
            showLoginError('Access denied. Admin access only.');
        }
    } catch (error) {
        showLoginError('Authentication failed. Please try again.');
    }
}

function showLoginError(message) {
    const errorDiv = document.getElementById('loginError');
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';
}

function showDashboard(user) {
    currentUser = user;
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('dashboard').style.display = 'block';
    document.getElementById('userEmail').textContent = user.email;

    loadDays();
}

document.getElementById('logoutBtn').addEventListener('click', () => {
    const auth2 = gapi.auth2.getAuthInstance();
    auth2.signOut().then(() => {
        localStorage.removeItem('bellSystemUser');
        location.reload();
    });
});

// Load Days
async function loadDays() {
    try {
        const response = await fetch(CONFIG.APPS_SCRIPT_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                action: 'getDaysStatus',
                email: currentUser.email
            })
        });

        const data = await response.json();
        if (data.success) {
            daysStatus = data.days;
            renderDays();
        }
    } catch (error) {
        console.error('Failed to load days:', error);
    }
}

function renderDays() {
    const daysGrid = document.getElementById('daysGrid');
    daysGrid.innerHTML = '';

    const dayIcons = {
        'Monday': 'ri-calendar-line',
        'Tuesday': 'ri-calendar-2-line',
        'Wednesday': 'ri-calendar-3-line',
        'Thursday': 'ri-calendar-4-line',
        'Friday': 'ri-calendar-5-line',
        'Saturday': 'ri-calendar-6-line',
        'Sunday': 'ri-calendar-7-line',
        'Special Day': 'ri-star-line'
    };

    Object.keys(dayIcons).forEach(dayName => {
        const isActive = daysStatus[dayName];
        const card = document.createElement('div');
        card.className = `day-card ${isActive ? 'active' : 'disabled'}`;
        card.innerHTML = `
            <div class="day-icon">
                <i class="${dayIcons[dayName]}"></i>
            </div>
            <div class="day-name">${dayName}</div>
            <div class="toggle-switch ${isActive ? 'active' : ''}" onclick="toggleDay('${dayName}', event)">
                <div class="toggle-slider"></div>
            </div>
        `;
        card.onclick = () => openPeriods(dayName);
        daysGrid.appendChild(card);
    });
}

async function toggleDay(dayName, event) {
    event.stopPropagation();

    try {
        const response = await fetch(CONFIG.APPS_SCRIPT_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                action: 'toggleDay',
                email: currentUser.email,
                dayName: dayName,
                enabled: !daysStatus[dayName]
            })
        });

        const data = await response.json();
        if (data.success) {
            await loadDays();
        }
    } catch (error) {
        console.error('Failed to toggle day:', error);
    }
}

// Open Periods
async function openPeriods(dayName) {
    currentDay = dayName;
    document.getElementById('modalTitle').textContent = `${dayName} Periods`;
    document.getElementById('periodModal').style.display = 'flex';

    await loadPeriods(dayName);
}

async function loadPeriods(dayName) {
    const periodsList = document.getElementById('periodsList');
    periodsList.innerHTML = '<div class="loading-spinner"></div>';

    try {
        const response = await fetch(CONFIG.APPS_SCRIPT_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                action: 'getPeriods',
                email: currentUser.email,
                dayName: dayName
            })
        });

        const data = await response.json();
        if (data.success) {
            renderPeriods(data.periods);
        }
    } catch (error) {
        console.error('Failed to load periods:', error);
        periodsList.innerHTML = '<p>Failed to load periods</p>';
    }
}

function renderPeriods(periods) {
    const periodsList = document.getElementById('periodsList');

    if (periods.length === 0) {
        periodsList.innerHTML = '<p>No periods found for this day</p>';
        return;
    }

    periodsList.innerHTML = periods.map(period => `
        <div class="period-card">
            <div class="period-info">
                <div class="period-name">${period.name}</div>
                <div class="period-time">${period.from} - ${period.to}</div>
                <div class="period-id">ID: ${period.periodId}</div>
                <div class="period-id">Bell: ${period.bellDuration || 3}s</div>
            </div>
            <div class="period-actions-btns">
                <button class="edit-btn" onclick="editPeriod('${period.periodId}', '${period.name}', '${period.from}', '${period.to}', ${period.bellDuration || 3})">
                    <i class="ri-edit-line"></i>
                </button>
                <button class="delete-btn" onclick="deletePeriod('${period.periodId}')">
                    <i class="ri-delete-bin-line"></i>
                </button>
            </div>
        </div>
    `).join('');
}

function closePeriodModal() {
    document.getElementById('periodModal').style.display = 'none';
}

// Add/Edit Period
document.getElementById('addPeriodBtn').addEventListener('click', () => {
    openPeriodForm();
});

function openPeriodForm(periodId = '', name = '', from = '', to = '', bellDuration = 3) {
    document.getElementById('periodFormTitle').textContent = periodId ? 'Edit Period' : 'Add Period';
    document.getElementById('periodId').value = periodId;
    document.getElementById('currentDay').value = currentDay;
    document.getElementById('periodName').value = name;
    document.getElementById('periodFrom').value = from;
    document.getElementById('periodTo').value = to;
    document.getElementById('bellDuration').value = bellDuration;
    document.getElementById('periodFormModal').style.display = 'flex';
}

function closePeriodForm() {
    document.getElementById('periodFormModal').style.display = 'none';
}

function editPeriod(periodId, name, from, to, bellDuration) {
    openPeriodForm(periodId, name, from, to, bellDuration);
}

async function savePeriod(event) {
    event.preventDefault();

    const periodId = document.getElementById('periodId').value;
    const dayName = document.getElementById('currentDay').value;
    const periodData = {
        name: document.getElementById('periodName').value,
        from: document.getElementById('periodFrom').value,
        to: document.getElementById('periodTo').value,
        bellDuration: parseInt(document.getElementById('bellDuration').value)
    };

    const action = periodId ? 'updatePeriod' : 'addPeriod';
    const body = {
        action: action,
        email: currentUser.email,
        dayName: dayName,
        periodData: periodData
    };

    if (periodId) {
        body.periodId = periodId;
    }

    try {
        const response = await fetch(CONFIG.APPS_SCRIPT_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body)
        });

        const data = await response.json();
        if (data.success) {
            closePeriodForm();
            await loadPeriods(dayName);
        }
    } catch (error) {
        console.error('Failed to save period:', error);
    }
}

async function deletePeriod(periodId) {
    if (!confirm('Are you sure you want to delete this period?')) {
        return;
    }

    try {
        const response = await fetch(CONFIG.APPS_SCRIPT_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                action: 'deletePeriod',
                email: currentUser.email,
                dayName: currentDay,
                periodId: periodId
            })
        });

        const data = await response.json();
        if (data.success) {
            await loadPeriods(currentDay);
        }
    } catch (error) {
        console.error('Failed to delete period:', error);
    }
}