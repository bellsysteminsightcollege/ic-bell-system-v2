// Configuration
const CONFIG = {
    CLIENT_ID: '1023743946723-vpp75o0it26q56tjrirmekntjslqg6gd.apps.googleusercontent.com',
    API_KEY: 'AIzaSyDdEL_pcBrMGM209ulzuoI0kJEUvvlTniU',
    SCOPES: 'https://www.googleapis.com/auth/spreadsheets',
    APPS_SCRIPT_URL: 'https://script.google.com/macros/s/AKfycbzoukmjSa6nVRiuJaICCxaFO4hwJHAXiwSANoCp3OO-hWI3KJ3QvfRQD2seY1IykGdkJQ/exec',
    ADMIN_EMAIL: 'bellsystem.insightcollege@gmail.com'
};

// State
let currentUser = null;
let currentDay = null;
let daysStatus = {};
let isGoogleAuthReady = false;
let auth2 = null;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    initializeGoogleAuth();
    checkLoginStatus();
});

// Google Auth Initialization
function initializeGoogleAuth() {
    // Load the Google API client library
    const script = document.createElement('script');
    script.src = 'https://apis.google.com/js/platform.js';
    script.async = true;
    script.defer = true;
    script.onload = () => {
        initializeGoogleAuth2();
    };
    document.head.appendChild(script);
}

function initializeGoogleAuth2() {
    gapi.load('auth2', () => {
        gapi.auth2.init({
            client_id: CONFIG.CLIENT_ID,
            scope: CONFIG.SCOPES,
            fetch_basic_profile: true
        }).then(
            (authInstance) => {
                auth2 = authInstance;
                isGoogleAuthReady = true;
                console.log('Google Auth initialized successfully');

                // Check if user is already signed in
                if (auth2.isSignedIn.get()) {
                    const googleUser = auth2.currentUser.get();
                    const profile = googleUser.getBasicProfile();
                    const user = {
                        email: profile.getEmail(),
                        name: profile.getName()
                    };
                    authenticateUser(user);
                }
            },
            (error) => {
                console.error('Google Auth initialization failed:', error);
                showLoginError('Failed to initialize Google Sign-In. Please refresh the page.');
            }
        );
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

// Google Sign-In Button Handler
document.getElementById('googleSignIn').addEventListener('click', async () => {
    try {
        // Check if Google Auth is ready
        if (!isGoogleAuthReady || !auth2) {
            showLoginError('Google Sign-In is still loading. Please wait a moment and try again.');
            return;
        }

        // Clear any previous errors
        document.getElementById('loginError').style.display = 'none';

        // Show loading state
        const signInBtn = document.getElementById('googleSignIn');
        signInBtn.disabled = true;
        signInBtn.innerHTML = '<i class="ri-loader-4-line"></i> Signing in...';

        // Sign in with Google
        const googleUser = await auth2.signIn({
            prompt: 'select_account'
        });

        const profile = googleUser.getBasicProfile();
        const user = {
            email: profile.getEmail(),
            name: profile.getName(),
            id: googleUser.getId()
        };

        console.log('Google Sign-In successful:', user.email);

        // Authenticate with our backend
        await authenticateUser(user);

        // Reset button state
        signInBtn.disabled = false;
        signInBtn.innerHTML = '<i class="ri-google-fill"></i> Sign in with Google';

    } catch (error) {
        console.error('Sign-in error:', error);

        // Reset button state
        const signInBtn = document.getElementById('googleSignIn');
        signInBtn.disabled = false;
        signInBtn.innerHTML = '<i class="ri-google-fill"></i> Sign in with Google';

        // Show appropriate error message
        if (error.error === 'popup_closed_by_user') {
            showLoginError('Sign-in cancelled. Please try again.');
        } else if (error.error === 'access_denied') {
            showLoginError('Access denied. You must use the admin account.');
        } else {
            showLoginError('Sign in failed. Please try again.');
        }
    }
});

async function authenticateUser(user) {
    try {
        // First check if this is the admin email
        if (user.email.toLowerCase() !== CONFIG.ADMIN_EMAIL.toLowerCase()) {
            showLoginError('Access denied. This account is not authorized as admin.');
            // Sign out the unauthorized user
            if (auth2) {
                await auth2.signOut();
            }
            return;
        }

        // Verify with backend
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
            // Save user to localStorage
            localStorage.setItem('bellSystemUser', JSON.stringify(user));
            showDashboard(user);
        } else {
            showLoginError('Access denied. Admin access only.');
            if (auth2) {
                await auth2.signOut();
            }
        }
    } catch (error) {
        console.error('Authentication error:', error);
        showLoginError('Authentication failed. Please check your connection and try again.');
    }
}

function showLoginError(message) {
    const errorDiv = document.getElementById('loginError');
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';

    // Auto-hide error after 5 seconds
    setTimeout(() => {
        errorDiv.style.display = 'none';
    }, 5000);
}

function showDashboard(user) {
    currentUser = user;
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('dashboard').style.display = 'block';
    document.getElementById('userEmail').textContent = user.email;

    loadDays();
}

document.getElementById('logoutBtn').addEventListener('click', async () => {
    try {
        // Sign out from Google
        if (auth2 && isGoogleAuthReady) {
            await auth2.signOut();
            await auth2.disconnect();
        }

        // Clear local storage
        localStorage.removeItem('bellSystemUser');

        // Reload page
        window.location.reload();
    } catch (error) {
        console.error('Logout error:', error);
        // Force logout even if Google sign-out fails
        localStorage.removeItem('bellSystemUser');
        window.location.reload();
    }
});

// Load Days
async function loadDays() {
    try {
        // Show loading state
        const daysGrid = document.getElementById('daysGrid');
        daysGrid.innerHTML = '<div class="loading-spinner"></div>';

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
        } else {
            console.error('Failed to load days:', data.error);
            daysGrid.innerHTML = '<p>Failed to load days. Please refresh the page.</p>';
        }
    } catch (error) {
        console.error('Failed to load days:', error);
        const daysGrid = document.getElementById('daysGrid');
        daysGrid.innerHTML = '<p>Failed to load days. Please check your connection.</p>';
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
        // Optimistic UI update
        daysStatus[dayName] = !daysStatus[dayName];
        renderDays();

        const response = await fetch(CONFIG.APPS_SCRIPT_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                action: 'toggleDay',
                email: currentUser.email,
                dayName: dayName,
                enabled: daysStatus[dayName]
            })
        });

        const data = await response.json();
        if (!data.success) {
            // Revert on failure
            daysStatus[dayName] = !daysStatus[dayName];
            renderDays();
            console.error('Failed to toggle day:', data.error);
        }
    } catch (error) {
        console.error('Failed to toggle day:', error);
        // Revert on error
        daysStatus[dayName] = !daysStatus[dayName];
        renderDays();
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
        } else {
            periodsList.innerHTML = '<p>Failed to load periods</p>';
            console.error('Failed to load periods:', data.error);
        }
    } catch (error) {
        console.error('Failed to load periods:', error);
        periodsList.innerHTML = '<p>Failed to load periods. Please check your connection.</p>';
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
        } else {
            alert('Failed to save period: ' + (data.error || 'Unknown error'));
        }
    } catch (error) {
        console.error('Failed to save period:', error);
        alert('Failed to save period. Please check your connection.');
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
        } else {
            alert('Failed to delete period: ' + (data.error || 'Unknown error'));
        }
    } catch (error) {
        console.error('Failed to delete period:', error);
        alert('Failed to delete period. Please check your connection.');
    }
}

// Close modals when clicking outside
window.onclick = function (event) {
    const periodModal = document.getElementById('periodModal');
    const periodFormModal = document.getElementById('periodFormModal');

    if (event.target === periodModal) {
        closePeriodModal();
    }
    if (event.target === periodFormModal) {
        closePeriodForm();
    }
}