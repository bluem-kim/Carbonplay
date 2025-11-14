/**
 * Challenge Tracker - Daily Progress Logging
 */

const API_BASE = 'http://localhost:3000/api';
let currentChallenge = null;
let currentDays = [];
let selectedDay = null;

// Get user challenge ID from URL
const urlParams = new URLSearchParams(window.location.search);
const userChallengeId = urlParams.get('id');

if (!userChallengeId) {
  window.location.href = 'dashboard.html';
}

// Check authentication
const token = localStorage.getItem('token');
if (!token) {
  window.location.href = 'login.html';
}

// API helper
async function api(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...options.headers
    }
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message || 'Request failed');
  }
  return data;
}

// Load challenge data
async function loadChallengeData() {
  try {
    const result = await api(`/my/challenges/${userChallengeId}/days`);
    
    if (result.status === 'success') {
      currentChallenge = result.data.user_challenge;
      currentDays = result.data.days;
      const summary = result.data.summary;

      // Update header
      document.getElementById('challengeName').textContent = currentChallenge.name;
      document.getElementById('challengeDescription').textContent = currentChallenge.description || '';
      document.getElementById('challengeType').textContent = formatChallengeType(currentChallenge.challenge_type);

      // Update summary stats
      document.getElementById('totalDays').textContent = summary.total_days;
      document.getElementById('completedDays').textContent = summary.completed_days;
      document.getElementById('currentDay').textContent = summary.current_day;
      document.getElementById('dailyGoal').textContent = summary.daily_goal.toFixed(2);
      document.getElementById('targetUnit').textContent = formatUnit(currentChallenge.target_unit);
      document.getElementById('progressPercent').textContent = `${summary.progress_percent.toFixed(0)}%`;
      document.getElementById('progressBar').value = summary.progress_percent;

      // Render days
      renderDays(currentDays);
    }
  } catch (error) {
    console.error('Error loading challenge:', error);
    showToast('Failed to load challenge data', 'error');
  }
}

// Render daily tracking cards
function renderDays(days) {
  const container = document.getElementById('daysContainer');
  
  const html = days.map(day => {
    const statusClass = getDayStatusClass(day);
    const statusIcon = getDayStatusIcon(day);
    const canLog = day.is_unlocked && !day.is_completed;

    return `
      <div class="card bg-base-200 ${day.is_current ? 'ring-2 ring-primary' : ''}">
        <div class="card-body p-4">
          <div class="flex justify-between items-start">
            <div class="flex items-center gap-3">
              <div class="avatar placeholder">
                <div class="bg-${statusClass} text-white rounded-full w-12 h-12 flex items-center justify-center">
                  <span class="text-xl font-bold">${day.day_number}</span>
                </div>
              </div>
              <div>
                <h3 class="font-bold">Day ${day.day_number}</h3>
                <p class="text-sm text-gray-600">${formatDate(day.log_date)}</p>
                ${day.is_current ? '<span class="badge badge-primary badge-sm">Today</span>' : ''}
                ${day.is_future ? '<span class="badge badge-ghost badge-sm">Locked</span>' : ''}
              </div>
            </div>
            
            <div class="text-right">
              ${statusIcon}
              ${day.is_completed 
                ? `<div class="text-sm mt-1">
                     <span class="font-bold ${day.value_logged <= day.daily_goal ? 'text-success' : 'text-warning'}">
                       ${day.value_logged.toFixed(2)}
                     </span>
                     <span class="text-gray-500">/ ${day.daily_goal.toFixed(2)}</span>
                   </div>`
                : day.is_unlocked
                  ? `<div class="text-sm text-gray-500 mt-1">Goal: ${day.daily_goal.toFixed(2)}</div>`
                  : ''
              }
            </div>
          </div>

          ${day.notes ? `
            <div class="mt-2 p-2 bg-base-300 rounded text-sm">
              <i class="fas fa-note-sticky mr-1"></i>
              ${day.notes}
            </div>
          ` : ''}

          ${canLog ? `
            <div class="card-actions justify-end mt-2">
              <button 
                class="btn btn-primary btn-sm"
                onclick="openLogModal(${day.day_number})">
                <i class="fas fa-pen mr-2"></i>
                ${day.value_logged !== null ? 'Update' : 'Log Progress'}
              </button>
            </div>
          ` : ''}

          ${day.is_future ? `
            <div class="alert alert-warning mt-2 text-xs">
              <i class="fas fa-lock"></i>
              <span>Complete previous days to unlock</span>
            </div>
          ` : ''}
        </div>
      </div>
    `;
  }).join('');

  container.innerHTML = html;
}

// Open log modal for a specific day
function openLogModal(dayNumber) {
  selectedDay = currentDays.find(d => d.day_number === dayNumber);
  if (!selectedDay) return;

  document.getElementById('modalDayNumber').textContent = dayNumber;
  document.getElementById('modalLogDate').value = formatDate(selectedDay.log_date);
  document.getElementById('modalValueLogged').value = selectedDay.value_logged || '';
  document.getElementById('modalNotes').value = selectedDay.notes || '';
  document.getElementById('modalDailyGoal').textContent = selectedDay.daily_goal.toFixed(2);
  document.getElementById('modalUnit').textContent = `(${formatUnit(currentChallenge.target_unit)})`;
  document.getElementById('modalUnitAlt').textContent = formatUnit(currentChallenge.target_unit);

  // Set help text based on challenge type
  const helpText = getHelpText(currentChallenge.challenge_type, selectedDay.daily_goal);
  document.getElementById('modalHelpText').textContent = helpText;

  document.getElementById('logModal').showModal();
}

// Close log modal
function closeLogModal() {
  document.getElementById('logModal').close();
  selectedDay = null;
}

// Handle form submission
document.getElementById('logForm').addEventListener('submit', async (e) => {
  e.preventDefault();

  if (!selectedDay) return;

  const valueLogged = parseFloat(document.getElementById('modalValueLogged').value);
  const notes = document.getElementById('modalNotes').value.trim();

  try {
    const result = await api(`/my/challenges/${userChallengeId}/log-day`, {
      method: 'POST',
      body: JSON.stringify({
        day_number: selectedDay.day_number,
        value_logged: valueLogged,
        notes: notes || null
      })
    });

    if (result.status === 'success') {
      showToast(result.message, 'success');
      closeLogModal();
      
      // Reload challenge data
      await loadChallengeData();

      // If challenge completed, show celebration
      if (result.data.challenge_completed) {
        showChallengeCompletedModal();
      }
    }
  } catch (error) {
    console.error('Error logging progress:', error);
    showToast(error.message || 'Failed to log progress', 'error');
  }
});

// Helper functions
function formatChallengeType(type) {
  const types = {
    'daily_limit': 'Daily Limit',
    'total_limit': 'Total Limit',
    'activity_count': 'Activity Count',
    'consecutive_days': 'Consecutive Days'
  };
  return types[type] || type;
}

function formatUnit(unit) {
  if (unit === 'kg_co2e') return 'kg CO₂e';
  if (unit === 'activities') return 'activities';
  return unit;
}

function formatDate(dateStr) {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { 
    weekday: 'short', 
    month: 'short', 
    day: 'numeric' 
  });
}

function getDayStatusClass(day) {
  if (day.is_completed) return 'success';
  if (day.is_current) return 'primary';
  if (day.is_future) return 'neutral';
  return 'warning';
}

function getDayStatusIcon(day) {
  if (day.is_completed) {
    return '<i class="fas fa-circle-check text-success text-2xl"></i>';
  }
  if (day.is_future) {
    return '<i class="fas fa-lock text-gray-400 text-2xl"></i>';
  }
  return '<i class="fas fa-circle text-gray-400 text-2xl"></i>';
}

function getHelpText(challengeType, dailyGoal) {
  if (challengeType === 'daily_limit') {
    return `Keep your emissions under ${dailyGoal.toFixed(2)} kg CO₂e for today.`;
  }
  if (challengeType === 'total_limit') {
    return `Try to stay around ${dailyGoal.toFixed(2)} kg CO₂e per day to meet the total goal.`;
  }
  if (challengeType === 'activity_count') {
    return `Log at least ${Math.ceil(dailyGoal)} activities for today.`;
  }
  if (challengeType === 'consecutive_days') {
    return `Keep emissions under ${dailyGoal.toFixed(2)} kg CO₂e to maintain your streak.`;
  }
  return '';
}

function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `alert alert-${type} fixed top-4 right-4 w-96 z-50 shadow-lg`;
  toast.innerHTML = `
    <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i>
    <span>${message}</span>
  `;
  document.body.appendChild(toast);
  
  setTimeout(() => {
    toast.remove();
  }, 3000);
}

function showChallengeCompletedModal() {
  const modal = document.createElement('div');
  modal.innerHTML = `
    <dialog id="completedModal" class="modal modal-open">
      <div class="modal-box text-center">
        <h3 class="font-bold text-2xl mb-4">
          🎉 Challenge Completed! 🎉
        </h3>
        <div class="text-6xl mb-4">🏆</div>
        <p class="mb-4">
          Congratulations! You've completed the <strong>${currentChallenge.name}</strong> challenge!
        </p>
        <div class="badge badge-success badge-lg mb-4">
          <i class="fas fa-star mr-2"></i>
          +100 XP Earned
        </div>
        ${currentChallenge.badge_name ? `
          <div class="mb-4">
            <p class="text-sm text-gray-600">You earned:</p>
            <div class="badge badge-warning badge-lg">
              <i class="fas fa-award mr-2"></i>
              ${currentChallenge.badge_name}
            </div>
          </div>
        ` : ''}
        <div class="modal-action justify-center">
          <a href="dashboard.html" class="btn btn-primary">
            <i class="fas fa-home mr-2"></i>
            Back to Dashboard
          </a>
        </div>
      </div>
    </dialog>
  `;
  document.body.appendChild(modal);
}

// Initialize
loadChallengeData();
