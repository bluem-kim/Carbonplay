let currentScenarioId = null;
let emissionFactors = {};

function initScenariosUI() {
  const token = localStorage.getItem('token');
  if (!token) {
    window.location.href = 'login.html';
    return;
  }

  // Kick off data loads
  loadScenarios();
  loadUserStats();
  loadUserBadgesForScenarios();
  loadEmissionFactors();
  relaxHiddenSelectValidation();

  // Refresh header stats/badges when scenarios or activities change
  window.addEventListener('scenarios:updated', () => {
    loadUserStats();
    loadUserBadgesForScenarios();
  });
}

// Run immediately if DOM is already ready; otherwise wait
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initScenariosUI);
} else {
  initScenariosUI();
}

// Expose functions for inline handlers
window.showCreateScenarioModal = showCreateScenarioModal;
window.showAddActivityModal = showAddActivityModal;
window.closeModal = closeModal;
window.deleteScenario = deleteScenario;
window.loadActivityTypes = loadActivityTypes;
window.calculatePreview = calculatePreview;
window.loadScenarios = loadScenarios;
window.loadEmissionFactors = loadEmissionFactors;
window.loadUserStats = loadUserStats;
window.loadUserBadgesForScenarios = loadUserBadgesForScenarios;
window.finishActivity = finishActivity;

async function loadScenarios() {
  try {
    const token = localStorage.getItem('token');
    const response = await fetch('http://localhost:3000/api/scenarios', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error('Failed to load scenarios');
    }

    const data = await response.json();
    displayScenarios(data.data);
  } catch (error) {
    console.error('Error loading scenarios:', error);
    if (window.notify?.error) window.notify.error('Failed to load scenarios');
    else alert('Failed to load scenarios');
  }
}

async function loadEmissionFactors() {
  try {
    const token = localStorage.getItem('token');
    const response = await fetch('http://localhost:3000/api/emission-factors', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (response.ok) {
      const data = await response.json();
      emissionFactors = data.data;
    }
  } catch (error) {
    console.error('Error loading emission factors:', error);
  }
}

function displayScenarios(scenarios) {
  const container = document.getElementById('scenarios-container');
  const emptyState = document.getElementById('empty-state');
  if (!container || !emptyState) return;

  if (!scenarios || scenarios.length === 0) {
    container.classList.add('hidden');
    emptyState.classList.remove('hidden');
    return;
  }

  container.classList.remove('hidden');
  emptyState.classList.add('hidden');

  container.innerHTML = scenarios
    .map(
      (scenario) => `
      <div class="card bg-base-100 shadow">
        <div class="card-body p-4">
          <div class="flex justify-between items-start">
            <div>
              <div class="text-[11px] text-muted uppercase tracking-wide">Scenario Name:</div>
              <h3 class="font-semibold text-lg">${scenario.name}</h3>
            </div>
            <div class="flex gap-2">
              <button class="btn btn-xs btn-primary" onclick="showAddActivityModal(${scenario.id})"><i class="fas fa-plus"></i></button>
              <button class="btn btn-xs btn-error" onclick="deleteScenario(${scenario.id})"><i class="fas fa-trash"></i></button>
            </div>
          </div>
          ${scenario.description ? `
            <div class="mt-2">
              <div class="text-[11px] text-muted uppercase tracking-wide">Description:</div>
              <p class="text-sm text-muted">${scenario.description}</p>
            </div>
          ` : ''}
          <div class="mt-3 flex items-center justify-between">
            <span class="text-sm text-muted">Total Emissions</span>
            <span class="text-sm font-semibold text-primary">${scenario.total_co2e} kg CO₂e</span>
          </div>
          <div class="mt-3 space-y-2">
            ${scenario.activities.length === 0
              ? '<p class="text-center text-sm text-muted py-2">No activities yet</p>'
              : scenario.activities
                  .map(
                    (activity) => `
              <div class="flex items-center justify-between text-sm">
                <div class="">
                  <div class="font-medium">${activity.activity_type}</div>
                  <div class="text-xs text-muted">${activity.value} ${activity.unit}</div>
                </div>
                <div class="flex items-center gap-2">
                  <span class="text-sm font-semibold">${activity.co2e_amount} kg</span>
                  ${activity.finished_at ? `
                    <span class="badge badge-success" title="Finished"><i class="fas fa-check mr-1"></i>Done</span>
                  ` : `
                    <button class="btn btn-ghost btn-xs" title="Mark finished" onclick="finishActivity(${activity.id})">
                      <i class="fas fa-check"></i>
                    </button>
                  `}
                </div>
              </div>
            `
                  )
                  .join('')}
          </div>
        </div>
      </div>
    `
    )
    .join('');
}

async function finishActivity(activityId) {
  try {
    const token = localStorage.getItem('token');
    const res = await fetch(`http://localhost:3000/api/activities/${activityId}/finish`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) throw new Error('Failed to finish activity');
    // Refresh scenarios and notify
    await loadScenarios();
    try {
      window.dispatchEvent(new CustomEvent('scenarios:updated', { detail: { action: 'activity-finished', activityId } }));
    } catch (_) {}
    if (window.notify?.success) window.notify.success('Activity marked as finished');
  } catch (e) {
    console.error('finishActivity error:', e);
    if (window.notify?.error) window.notify.error('Unable to mark as finished');
    else alert('Unable to mark as finished');
  }
}

async function loadUserStats() {
  try {
    const token = localStorage.getItem('token');
    const res = await fetch('http://localhost:3000/api/stats/summary', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error('Failed to load stats');
    const data = await res.json();
    if (data.status !== 'success') throw new Error(data.message || 'Failed');
    const s = data.data || {};

    // Update counts
    const scEl = document.getElementById('scenariosCount');
    const acEl = document.getElementById('activitiesCount');
    const acElScn = document.getElementById('activitiesCountScn');
    if (scEl) scEl.textContent = s.scenarios ?? 0;
    if (acEl) acEl.textContent = s.activities ?? 0;
    if (acElScn) acElScn.textContent = s.activities ?? 0;

    // Update XP
    const xpCur = document.getElementById('xpCurrent');
    const xpMax = document.getElementById('xpMax');
    const xpBar = document.getElementById('xpProgressBar');
    const xpTotal = Number(s.xp_total || 0);
    const levelSize = Number(s.level_size || 500);
    const xpInLevel = Number(s.xp_in_level || (xpTotal % levelSize));
    const pct = Number(s.xp_progress_pct || Math.floor((xpInLevel / (levelSize || 1)) * 100));
    if (xpCur) xpCur.textContent = xpInLevel;
    if (xpMax) xpMax.textContent = levelSize;
    if (xpBar) xpBar.value = Math.max(0, Math.min(100, pct));

    // Show current level in scenarios header
    const lvlEl = document.getElementById('xpLevelScn');
    const level = Number(s.level || Math.floor(xpTotal / (levelSize || 1)) + 1);
    if (lvlEl) lvlEl.textContent = String(level);
  } catch (e) {
    console.error('Error loading stats:', e);
  }
}

// Render earned badges in scenarios header
async function loadUserBadgesForScenarios() {
  const bar = document.getElementById('earnedBadgesBarScn');
  if (!bar) return;
  try {
    const token = localStorage.getItem('token');
    const res = await fetch('http://localhost:3000/api/auth/me/badges', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error('Failed to load badges');
    const payload = await res.json();
    if (payload.status !== 'success') throw new Error(payload.message || 'Failed');
    const all = Array.isArray(payload.data?.badges) ? payload.data.badges : [];
    // Sort earned badges by required level descending to highlight highest achievements
    const earned = all.filter((b) => b && b.earned).sort((a, b) => (b.level_required || 0) - (a.level_required || 0));

    if (!earned.length) {
      bar.innerHTML = '<span class="badge badge-ghost"><i class="fas fa-circle-info mr-1"></i>No badges yet</span>';
      return;
    }

    const items = earned.slice(0, 3).map((b) => {
      const icon = b.icon || '🏅';
      const name = escapeHtml(String(b.name || 'Badge'));
      return `<span class="badge badge-success badge-outline" title="${name}"><span class="mr-1">${icon}</span>${name}</span>`;
    });
    if (earned.length > 3) {
      items.push(`<span class="badge badge-ghost" title="${earned.length} total">+${earned.length - 3} more</span>`);
    }
    bar.innerHTML = items.join('');
  } catch (e) {
    bar.innerHTML = '<span class="badge badge-ghost"><i class="fas fa-exclamation-circle mr-1"></i>Badges unavailable</span>';
  }
}

function showCreateScenarioModal() {
  const el = document.getElementById('createScenarioModal');
  el.classList.remove('hidden');
  el.classList.remove('pointer-events-none');
  el.classList.add('modal-open');
}

function showAddActivityModal(scenarioId) {
  currentScenarioId = scenarioId;
  const el = document.getElementById('addActivityModal');
  el.classList.remove('hidden');
  el.classList.remove('pointer-events-none');
  el.classList.add('modal-open');
}

function closeModal(modalId) {
  const el = document.getElementById(modalId);
  el.classList.remove('modal-open');
  el.classList.add('hidden');
  el.classList.add('pointer-events-none');
  if (modalId === 'createScenarioModal') {
    document.getElementById('createScenarioForm').reset();
  } else if (modalId === 'addActivityModal') {
    document.getElementById('addActivityForm').reset();
    document.getElementById('previewContainer').classList.add('hidden');
  }
}

// Create scenario submit
const createForm = document.getElementById('createScenarioForm');
if (createForm) {
  createForm.addEventListener('submit', async function (e) {
    e.preventDefault();
    const name = document.getElementById('scenarioName').value;
    const description = document.getElementById('scenarioDescription').value;

    try {
      const token = localStorage.getItem('token');
      const response = await fetch('http://localhost:3000/api/scenarios', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name, description }),
      });

      if (!response.ok) {
        throw new Error('Failed to create scenario');
      }

      closeModal('createScenarioModal');
      loadScenarios();
      // notify dashboard to refresh latest scenarios/leaderboard
      try {
        window.dispatchEvent(
          new CustomEvent('scenarios:updated', {
            detail: { action: 'scenario-created' },
          })
        );
      } catch (_) {}
    } catch (error) {
      console.error('Error creating scenario:', error);
      if (window.notify?.error) window.notify.error('Failed to create scenario');
      else alert('Failed to create scenario');
    }
  });
}

// Add activity submit
const addActForm = document.getElementById('addActivityForm');
if (addActForm) {
  addActForm.addEventListener('submit', async function (e) {
    e.preventDefault();

    const category = document.getElementById('activityCategory').value;
    const activity_type = document.getElementById('activityType').value;
  const value = parseFloat(document.getElementById('activityValue').value);
  let unit = document.getElementById('activityUnit').value;

    // explicit validation to avoid hidden required issues
    if (!category) {
      if (window.notify?.warning) window.notify.warning('Please select a category');
      else alert('Please select a category');
      return;
    }
    if (!activity_type) {
      if (window.notify?.warning) window.notify.warning('Please select an activity type');
      else alert('Please select an activity type');
      return;
    }
    // Auto-resolve unit if not explicitly selected (single-unit activities)
    if (!unit && category && activity_type) {
      const inferred = getUnitForSelection(category, activity_type);
      if (inferred) {
        document.getElementById('activityUnit').value = inferred;
        renderUnitButtons(inferred);
        unit = inferred;
      }
    }

    if (!unit) {
      if (window.notify?.warning) window.notify.warning('Unit unavailable for the selected activity. Please pick another activity.');
      else alert('Unit unavailable for the selected activity. Please pick another activity.');
      return;
    }
    if (!value || isNaN(value) || value <= 0) {
      if (window.notify?.warning) window.notify.warning('Please enter a valid value greater than 0');
      else alert('Please enter a valid value greater than 0');
      return;
    }

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`http://localhost:3000/api/scenarios/${currentScenarioId}/activities`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ category, activity_type, value, unit }),
      });

      if (!response.ok) {
        throw new Error('Failed to add activity');
      }

      closeModal('addActivityModal');
      loadScenarios();
      // notify dashboard to refresh previews and leaderboard
      try {
        window.dispatchEvent(
          new CustomEvent('scenarios:updated', {
            detail: { action: 'activity-added', scenarioId: currentScenarioId },
          })
        );
      } catch (_) {}
    } catch (error) {
      console.error('Error adding activity:', error);
      if (window.notify?.error) window.notify.error('Failed to add activity');
      else alert('Failed to add activity');
    }
  });
}

function relaxHiddenSelectValidation() {
  ['activityCategory', 'activityType', 'activityUnit'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) {
      el.removeAttribute('required');
      el.setAttribute('aria-hidden', 'true');
    }
  });
}

function loadActivityTypes() {
  const category = document.getElementById('activityCategory').value;
  const activityTypeSelect = document.getElementById('activityType');
  const activityUnitSelect = document.getElementById('activityUnit');
  const typeButtons = document.getElementById('activityTypeButtons');
  const unitButtons = document.getElementById('unitButtons');

  activityTypeSelect.innerHTML = '<option value="">Select Activity</option>';
  activityUnitSelect.innerHTML = '<option value="">Select Unit</option>';
  if (typeButtons) typeButtons.innerHTML = '';
  if (unitButtons) unitButtons.innerHTML = '';

  if (category && emissionFactors[category]) {
    emissionFactors[category].forEach((factor) => {
      const option = document.createElement('option');
      option.value = factor.activity_type;
      option.textContent = factor.activity_type
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (l) => l.toUpperCase());
      option.dataset.unit = factor.unit;
      activityTypeSelect.appendChild(option);

      // Render as button
      if (typeButtons) {
        // chip/card style
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'card card-compact border border-base-300 hover:border-primary hover:shadow-sm transition p-2 text-left';
        chip.dataset.value = factor.activity_type;
        chip.innerHTML = `
          <div class="text-xs font-medium">${option.textContent}</div>
          <div class="text-[10px] text-muted">${normalizeUnitLabel(factor.unit).replace(/_/g, ' ')}</div>
        `;
        chip.addEventListener('click', () => {
          activityTypeSelect.value = factor.activity_type;
          syncActivityTypeButtons();
          renderUnitButtons(normalizeUnitLabel(factor.unit));
          calculatePreview();
        });
        typeButtons.appendChild(chip);
      }
    });
  }
}

document.getElementById('activityType').addEventListener('change', function () {
  const selectedOption = this.options[this.selectedIndex];
  const unitSelect = document.getElementById('activityUnit');
  const unitButtons = document.getElementById('unitButtons');

  unitSelect.innerHTML = '<option value="">Select Unit</option>';
  if (unitButtons) unitButtons.innerHTML = '';

  if (selectedOption.dataset.unit) {
    const displayUnit = normalizeUnitLabel(selectedOption.dataset.unit);
    const option = document.createElement('option');
    option.value = displayUnit;
    option.textContent = displayUnit.replace(/_/g, ' ');
    unitSelect.appendChild(option);
    unitSelect.value = displayUnit;

    // Render single unit button
    renderUnitButtons(displayUnit);
  }
});

function renderCategoryButtons() {
  const container = document.getElementById('categoryButtons');
  const select = document.getElementById('activityCategory');
  if (!container || !select) return;
  container.innerHTML = '';
  const categories = [
    { value: 'transport', label: 'Transport' },
    { value: 'diet', label: 'Diet' },
    { value: 'energy', label: 'Energy' },
  ];
  categories.forEach((c) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn-sm join-item btn-outline';
    btn.textContent = c.label;
    btn.dataset.value = c.value;
    btn.addEventListener('click', () => {
      select.value = c.value;
      syncCategoryButtons();
      loadActivityTypes();
      calculatePreview();
    });
    container.appendChild(btn);
  });
  syncCategoryButtons();
}

function syncCategoryButtons() {
  const container = document.getElementById('categoryButtons');
  const select = document.getElementById('activityCategory');
  if (!container || !select) return;
  container.querySelectorAll('button').forEach((b) => {
    b.classList.toggle('btn-primary', b.dataset.value === select.value);
    b.classList.toggle('btn-outline', b.dataset.value !== select.value);
  });
}

function syncActivityTypeButtons() {
  const container = document.getElementById('activityTypeButtons');
  const select = document.getElementById('activityType');
  if (!container || !select) return;
  container.querySelectorAll('button').forEach((b) => {
    const active = b.dataset.value === select.value;
    b.classList.toggle('ring-2', active);
    b.classList.toggle('ring-primary', active);
    b.classList.toggle('border-primary', active);
    b.classList.toggle('font-semibold', active);
  });
}

function renderUnitButtons(unit) {
  const container = document.getElementById('unitButtons');
  const select = document.getElementById('activityUnit');
  if (!container || !select) return;
  container.innerHTML = '';
  if (!unit) return;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn btn-sm join-item btn-primary';
  const displayUnit = normalizeUnitLabel(unit);
  btn.textContent = displayUnit.replace(/_/g, ' ');
  btn.dataset.value = displayUnit;
  btn.addEventListener('click', () => {
    select.value = displayUnit;
    syncUnitButtons();
    calculatePreview();
  });
  container.appendChild(btn);
  // default select
  select.value = displayUnit;
  syncUnitButtons();
}

function syncUnitButtons() {
  const container = document.getElementById('unitButtons');
  const select = document.getElementById('activityUnit');
  if (!container || !select) return;
  container.querySelectorAll('button').forEach((b) => {
    b.classList.toggle('btn-primary', b.dataset.value === select.value);
    b.classList.toggle('btn-outline', b.dataset.value !== select.value);
  });
}

// Initialize category buttons when Add Activity modal opens
const addActivityModalEl = document.getElementById('addActivityModal');
if (addActivityModalEl) {
  // Hook into showing function
  const _showAddActivityModal = window.showAddActivityModal;
  window.showAddActivityModal = function (scenarioId) {
    _showAddActivityModal.call(window, scenarioId);
    relaxHiddenSelectValidation();
    renderCategoryButtons();
    // reset selections
    document.getElementById('activityType').value = '';
    document.getElementById('activityUnit').value = '';
    const typeButtons = document.getElementById('activityTypeButtons');
    const unitButtons = document.getElementById('unitButtons');
    if (typeButtons) typeButtons.innerHTML = '';
    if (unitButtons) unitButtons.innerHTML = '';
  };
}

async function calculatePreview() {
  const category = document.getElementById('activityCategory').value;
  const activity_type = document.getElementById('activityType').value;
  const value = parseFloat(document.getElementById('activityValue').value);
  let unit = document.getElementById('activityUnit').value;

  // If unit is empty but a single unit exists for this activity, auto-ensure it
  if (!unit && category && activity_type) {
    const inferred = getUnitForSelection(category, activity_type);
    if (inferred) {
      document.getElementById('activityUnit').value = inferred;
      renderUnitButtons(inferred);
      unit = inferred;
    }
  }

  if (!category || !activity_type || !value || !unit) {
    document.getElementById('previewContainer').classList.add('hidden');
    return;
  }

  try {
    const token = localStorage.getItem('token');
    const response = await fetch('http://localhost:3000/api/calculate-preview', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ category, activity_type, value, unit }),
    });

    if (response.ok) {
      const data = await response.json();
      document.getElementById('previewEmissions').textContent = data.data.co2e_amount;
      document.getElementById('previewContainer').classList.remove('hidden');
    }
  } catch (error) {
    console.error('Error calculating preview:', error);
  }
}

function getUnitForSelection(category, activity_type) {
  if (!category || !activity_type) return null;
  const factors = emissionFactors[category];
  if (!Array.isArray(factors)) return null;
  const found = factors.find((f) => f.activity_type === activity_type);
  return found && found.unit ? normalizeUnitLabel(found.unit) : null;
}

// Prefer displaying KM for transport without breaking backend calculations
function normalizeUnitLabel(unit) {
  const u = String(unit || '').trim().toLowerCase();
  return u === 'miles' ? 'km' : unit;
}

async function deleteScenario(scenarioId) {
  if (!confirm('Are you sure you want to delete this scenario?')) {
    return;
  }

  try {
    const token = localStorage.getItem('token');
    const response = await fetch(`http://localhost:3000/api/scenarios/${scenarioId}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error('Failed to delete scenario');
    }

    loadScenarios();
    // notify dashboard to refresh after deletion
    try {
      window.dispatchEvent(
        new CustomEvent('scenarios:updated', {
          detail: { action: 'scenario-deleted', scenarioId },
        })
      );
    } catch (_) {}
  } catch (error) {
    console.error('Error deleting scenario:', error);
    if (window.notify?.error) window.notify.error('Failed to delete scenario');
    else alert('Failed to delete scenario');
  }
}

// Close modal when clicking outside
window.onclick = function (event) {
  const modals = document.querySelectorAll('.modal');
  modals.forEach((modal) => {
    // Only close if modal is visible and interactive
    const isOpen = !modal.classList.contains('hidden') && !modal.classList.contains('pointer-events-none');
    if (isOpen && event.target === modal) {
      modal.classList.remove('modal-open');
      modal.classList.add('hidden');
      modal.classList.add('pointer-events-none');
    }
  });
};

// Logout handled by shared navbar

// Minimal HTML escaper (scenarios page scope)
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
