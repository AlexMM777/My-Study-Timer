// Authentication UI Module
import { login, register, logout, checkAuthState } from './firebase-auth.js';
import { getCurrentUser } from './firebase-auth.js';
import { getUserStats } from './firebase-sessions.js';

// Initialize authentication UI
export function initAuthUI() {
  checkAuthState((authState) => {
    updateAuthUI(authState);
  });

  const loginBtn = document.getElementById('login-btn');
  const registerBtn = document.getElementById('register-btn');
  const logoutBtn = document.getElementById('logout-btn');
  const authFormToggle = document.getElementById('auth-form-toggle');

  if (loginBtn) loginBtn.addEventListener('click', handleLogin);
  if (registerBtn) registerBtn.addEventListener('click', handleRegister);
  if (logoutBtn) logoutBtn.addEventListener('click', handleLogout);
  if (authFormToggle) {
    authFormToggle.addEventListener('click', toggleAuthForm);
  }
}

// Handle login
async function handleLogin() {
  const email = document.getElementById('auth-email')?.value;
  const password = document.getElementById('auth-password')?.value;

  if (!email || !password) {
    showNotification('Please enter email and password', 'error');
    return;
  }

  const result = await login(email, password);
  if (result.success) {
    showNotification('Logged in successfully!', 'success');
    document.getElementById('auth-email').value = '';
    document.getElementById('auth-password').value = '';
    updateAuthUI({ isAuthenticated: true, user: result.user });
  } else {
    showNotification('Login failed: ' + result.error, 'error');
  }
}

// Handle register
async function handleRegister() {
  const email = document.getElementById('auth-email')?.value;
  const password = document.getElementById('auth-password')?.value;
  const confirmPassword = document.getElementById('auth-confirm-password')?.value;

  if (!email || !password || !confirmPassword) {
    showNotification('Please fill in all fields', 'error');
    return;
  }

  if (password !== confirmPassword) {
    showNotification('Passwords do not match', 'error');
    return;
  }

  const result = await register(email, password);
  if (result.success) {
    showNotification('Account created successfully!', 'success');
    document.getElementById('auth-email').value = '';
    document.getElementById('auth-password').value = '';
    document.getElementById('auth-confirm-password').value = '';
    updateAuthUI({ isAuthenticated: true, user: result.user });
  } else {
    showNotification('Registration failed: ' + result.error, 'error');
  }
}

// Handle logout
async function handleLogout() {
  const result = await logout();
  if (result.success) {
    showNotification('Logged out successfully', 'success');
    updateAuthUI({ isAuthenticated: false, user: null });
  }
}

// Toggle between login and register forms
function toggleAuthForm() {
  const formContainer = document.getElementById('auth-form-container');
  const confirmPasswordField = document.getElementById('auth-confirm-password-field');
  const formTitle = document.getElementById('auth-form-title');
  const toggleText = document.getElementById('auth-form-toggle');

  if (formContainer.dataset.mode === 'login') {
    confirmPasswordField.style.display = 'block';
    formTitle.textContent = 'Create Account';
    document.getElementById('register-btn').style.display = 'block';
    document.getElementById('login-btn').style.display = 'none';
    toggleText.innerHTML = 'Already have an account? <a href="#">Login</a>';
    formContainer.dataset.mode = 'register';
  } else {
    confirmPasswordField.style.display = 'none';
    formTitle.textContent = 'Login';
    document.getElementById('register-btn').style.display = 'none';
    document.getElementById('login-btn').style.display = 'block';
    toggleText.innerHTML = "Don't have an account? <a href=\"#\">Register</a>";
    formContainer.dataset.mode = 'login';
  }
}

// Update UI based on auth state
async function updateAuthUI(authState) {
  const authSection = document.getElementById('auth-section');
  const timerSection = document.getElementById('timer-section');
  const userEmail = document.getElementById('user-email');
  const userStats = document.getElementById('user-stats');

  if (authState.isAuthenticated) {
    if (authSection) authSection.style.display = 'none';
    if (timerSection) timerSection.style.display = 'block';
    
    if (userEmail) {
      userEmail.textContent = authState.user.email;
    }

    const stats = await getUserStats(authState.user.uid);
    if (stats.success && userStats) {
      userStats.innerHTML = `
        <div class="stats-display">
          <div class="stat-item">
            <span class="stat-label">Total Sessions:</span>
            <span class="stat-value">${stats.stats.totalSessionsCompleted || 0}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Total Minutes Studied:</span>
            <span class="stat-value">${stats.stats.totalMinutesStudied || 0}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Current Streak:</span>
            <span class="stat-value">${stats.stats.currentStreak || 0} days</span>
          </div>
        </div>
      `;
    }
  } else {
    if (authSection) authSection.style.display = 'block';
    if (timerSection) timerSection.style.display = 'none';
  }
}

// Show notification
export function showNotification(message, type = 'info') {
  const notification = document.createElement('div');
  notification.className = `notification notification-${type}`;
  notification.textContent = message;
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    padding: 12px 20px;
    border-radius: 4px;
    color: white;
    font-size: 14px;
    z-index: 1000;
    animation: slideIn 0.3s ease-in-out;
    background-color: ${type === 'success' ? '#4caf50' : type === 'error' ? '#f44336' : '#2196f3'};
  `;
  
  document.body.appendChild(notification);
  
  setTimeout(() => {
    notification.style.animation = 'slideOut 0.3s ease-in-out';
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}

export default initAuthUI;
