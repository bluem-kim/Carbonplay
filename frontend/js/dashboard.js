document.addEventListener('DOMContentLoaded', function () {
  loadNavbar('dashboard');
  const token = localStorage.getItem('token');
  if (!token) {
    window.location.href = 'login.html';
    return;
  }

  fetchUserProfile();
  loadUserStats();
  loadUserBadges();
  loadLatestScenarios();
  loadLeaderboard('scenarios');
  loadMyChallenges();
  loadMotivation();
  initCarbonChart();
  initWeeklyComparisonChart();
  attachScenariosUpdateListener();

  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', function () {
      document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('tab-active'));
      this.classList.add('tab-active');
      loadLeaderboard(this.dataset.type);
    });
  });
});

async function fetchUserProfile() {
  try {
    const token = localStorage.getItem('token');
    const response = await fetch('http://localhost:3000/api/auth/me', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error('Failed to fetch profile');
    }

    const data = await response.json();
    const user = data.data;
    const greetEl = document.getElementById('greeting');
    if (greetEl) greetEl.textContent = `Welcome back, ${user.username}! Here's your carbon footprint overview.`;
    
    // Update dashboard avatar
    const avatarEl = document.getElementById('dashboardAvatar');
    if (avatarEl && user.profile && user.profile.profile_picture) {
      const imgUrl = `http://localhost:3000/backend${user.profile.profile_picture}`;
      avatarEl.innerHTML = `<img src="${imgUrl}" alt="Profile" class="w-full h-full object-cover rounded-full">`;
      avatarEl.classList.remove('bg-primary', 'text-primary-content', 'flex', 'items-center', 'justify-center');
    }
  } catch (error) {
    console.error('Error fetching user profile:', error);
    if (window.notify?.error) window.notify.error('Your session has expired. Please log in again.');
    else alert('Your session has expired. Please log in again.');
    localStorage.removeItem('token');
    window.location.href = 'login.html';
  }
}

// Load and render earned badges into the dashboard header bar
async function loadUserBadges() {
  const bar = document.getElementById('earnedBadgesBar');
  if (!bar) return;
  try {
    const token = localStorage.getItem('token');
    const res = await fetch('http://localhost:3000/api/auth/me/badges', {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) throw new Error('Failed to load badges');
    const payload = await res.json();
    if (payload.status !== 'success') throw new Error(payload.message || 'Failed');
    const all = Array.isArray(payload.data?.badges) ? payload.data.badges : [];
    const earned = all.filter(b => b && b.earned);

    if (!earned.length) {
      bar.innerHTML = '<span class="badge badge-ghost"><i class="fas fa-circle-info mr-1"></i>No badges yet</span>';
      return;
    }

    const items = earned.slice(0, 3).map(b => {
      const icon = (b.icon || '🏅');
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
    const bdEl = document.getElementById('badgesCount');
    if (scEl) scEl.textContent = s.scenarios ?? 0;
    if (acEl) acEl.textContent = s.activities ?? 0;
    if (bdEl) bdEl.textContent = s.badges ?? 0;

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

    // Show current XP level
    const xpLevelEl = document.getElementById('xpLevel');
    const level = Number(s.level || Math.floor(xpTotal / (levelSize || 1)) + 1);
    if (xpLevelEl) xpLevelEl.textContent = String(level);

    // Simple level-up notification (local, non-persistent)
    try {
      const prevLevelStr = localStorage.getItem('xpPrevLevel');
      const prevLevel = prevLevelStr ? parseInt(prevLevelStr, 10) : level;
      if (!isNaN(prevLevel) && level > prevLevel && typeof showToast === 'function') {
        showToast(`Level up! You reached Level ${level}`, 'success');
      }
      localStorage.setItem('xpPrevLevel', String(level));
    } catch (_) {}
  } catch (e) {
    // Silent fail; keep placeholders
    console.error('Error loading stats:', e);
  }
}

async function loadLatestScenarios() {
  try {
    const token = localStorage.getItem('token');
    const response = await fetch('http://localhost:3000/api/scenarios?limit=3', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error('Failed to load scenarios');
    }

    const data = await response.json();
    displayLatestScenarios(data.data);
  } catch (error) {
    console.error('Error loading scenarios:', error);
  }
}

function displayLatestScenarios(scenarios) {
  const container = document.getElementById('scenariosContainer');
  if (!container) return;

  if (!scenarios || scenarios.length === 0) {
    container.innerHTML = "<p>You haven't created any scenarios yet.</p>";
    return;
  }

  container.innerHTML = scenarios
    .map(
      (scenario) => `
        <div class="card card-compact bg-base-100 shadow cursor-pointer" onclick="typeof openScenariosModal === 'function' ? openScenariosModal() : (window.location.href='scenarios.html')">
          <div class="card-body p-4">
            <div class="text-[11px] text-muted uppercase tracking-wide">Scenario Name:</div>
            <h4 class="font-semibold">${scenario.name}</h4>
            <div class="text-[11px] text-muted uppercase tracking-wide mt-2">Description:</div>
            <p class="text-sm text-muted mb-2">${scenario.description || 'No description'}</p>
            <div class="flex items-center justify-between">
              <small class="text-xs text-muted">${(scenario.activities || []).length} activities</small>
              <div class="text-sm font-semibold text-primary">${scenario.total_co2e} kg CO₂e</div>
            </div>
          </div>
        </div>
      `
    )
    .join('');

  container.innerHTML += `
    <div class="text-center mt-4">
      <a href="#" onclick="if (typeof openScenariosModal==='function'){openScenariosModal();} else {window.location.href='scenarios.html';} return false;" class="text-primary font-semibold inline-flex items-center gap-2">
        View all scenarios <i class="fas fa-arrow-right"></i>
      </a>
    </div>
  `;
}

async function loadLeaderboard(type = 'scenarios') {
  const container = document.getElementById('leaderboardContainer');
  if (!container) return;

  container.innerHTML = `
    <div class="flex items-center gap-2 text-sm text-muted">
      <i class="fas fa-spinner fa-spin"></i>
      <span>Loading...</span>
    </div>
  `;

  // Helper to fetch a leaderboard type
  const fetchType = async (t) => {
    const token = localStorage.getItem('token');
    const res = await fetch(`http://localhost:3000/api/leaderboard?type=${t}&limit=5`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`Failed to load leaderboard: ${t}`);
    const payload = await res.json();
    const arr = payload?.data?.leaderboard || [];
    return { list: arr, type: t };
  };

  try {
    // Try requested type first
    let result = await fetchType(type);

    // Fallbacks: if Eco Champions (reduction) is empty, try activities, then scenarios
    if (result.list.length === 0 && type === 'reduction') {
      console.warn('Eco Champions empty; falling back to activities leaderboard');
      result = await fetchType('activities').catch(() => ({ list: [], type: 'activities' }));
      if (result.list.length === 0) {
        console.warn('Activities also empty; falling back to scenarios leaderboard');
        result = await fetchType('scenarios').catch(() => ({ list: [], type: 'scenarios' }));
      }
    }

    displayLeaderboard(result.list, result.type);
  } catch (error) {
    console.error('Error loading leaderboard:', error);
    container.innerHTML = `
      <div class="empty-leaderboard">
        <i class="fas fa-users"></i>
        <p>Unable to load leaderboard</p>
      </div>
    `;
  }
}

function displayLeaderboard(leaderboard, type) {
  const container = document.getElementById('leaderboardContainer');
  if (!container) return;

  if (!leaderboard || leaderboard.length === 0) {
    container.innerHTML = `
      <div class="empty-leaderboard">
        <i class="fas fa-users"></i>
        <p>No rankings yet</p>
        <small>Create scenarios to see rankings!</small>
      </div>
    `;
    return;
  }

  // normalize and render leaderboard entries
  container.innerHTML = `<div class="space-y-2">` + leaderboard
    .map(
      (user) => {
        // normalize badge icon (backend may provide 'fa-medal' or similar)
        const rawIcon = (user.badge && user.badge.icon) || 'fas fa-user';
        let iconCls = rawIcon.trim();
        // if backend provided only 'fa-medal' (no style), prepend 'fas'
        if (!/^fa[srlb]?\s+fa-/.test(iconCls)) {
          iconCls = 'fas ' + iconCls;
        }

        const username = String(user.username || '').trim();
        const secondary = `${user.secondaryMetric} ${user.secondaryLabel}`;
        const metric = user.metric;
        const metricLabel = user.metricLabel;

        // Build avatar: profile picture if available; fallback to icon
        const profilePath = user.profile_picture || '';
        const hasProfile = typeof profilePath === 'string' && profilePath.length > 0;
        const avatarImg = hasProfile
          ? `<img src="http://localhost:3000/backend${profilePath}"
                   alt="${username}"
                   class="w-8 h-8 rounded-full object-cover"
                   onerror="this.onerror=null;this.replaceWith(document.createElement('span'))" />`
          : `<i class="${iconCls} fa-fw" aria-hidden="true" style="line-height:1;font-size:10px"></i>`;

        return `
      <div class="w-full p-2 bg-base-100 rounded shadow-sm">
        <div class="flex items-center gap-2">
          <div class="w-8 flex-shrink-0 flex items-center justify-center text-xs">
            ${user.rank <= 3 ? getRankIcon(user.rank) : `<span class="badge badge-outline badge-xs">${user.rank}</span>`}
          </div>

          <div class="avatar flex-shrink-0">
            <div class="w-8 h-8 rounded-full bg-base-200 text-white flex items-center justify-center text-xs overflow-hidden">
              ${avatarImg}
            </div>
          </div>
          
          <div class="flex-1 min-w-0">
            <div class="font-semibold text-xs truncate" title="${username}">${username}</div>
            <div class="text-[10px] text-muted truncate" title="${secondary}">${secondary}</div>
          </div>
          
          <div class="flex-shrink-0 text-right">
            <div class="font-semibold text-xs whitespace-nowrap">${metric}</div>
            <div class="text-[10px] text-muted whitespace-nowrap">${metricLabel}</div>
          </div>
        </div>
      </div>
    `;
      }
    )
    .join('') + `</div>`;
}

function getRankIcon(rank) {
  // return a styled rank icon (colored for top 3)
  // Use simple emoji fallbacks sized for small dashboard card
  if (rank === 1) return '<span class="text-base" title="1st place">👑</span>';
  if (rank === 2) return '<span class="text-base" title="2nd place">🥈</span>';
  if (rank === 3) return '<span class="text-base" title="3rd place">🥉</span>';
  return `<span class="badge badge-outline badge-xs">${rank}</span>`;
}

async function loadMotivation(userWeeklyOverride) {
  const token = localStorage.getItem('token');
  const msgEl = document.getElementById('motivationMsg');
  const userWeeklyEl = document.getElementById('userWeekly');
  const communityAvgEl = document.getElementById('communityAvg');
  const levelTextEl = document.getElementById('levelText');
  const levelBadgeEl = document.getElementById('levelBadge');
  const annualEl = document.getElementById('carbonAnnual');
  try {
    const payload = userWeeklyOverride != null ? { userCarbonData: userWeeklyOverride } : {};
    const res = await fetch('http://localhost:3000/api/social/motivation', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok || data.status !== 'success') throw new Error(data.message || 'Failed to generate');
    
    if (msgEl) msgEl.textContent = data.data.message;
    
    const weekly = Number(data.data.userWeekly || 0);
    const commAvg = Number(data.data.communityAvg || 0);
    const level = data.data.level || 'medium';
    
    if (userWeeklyEl) userWeeklyEl.textContent = `${weekly.toFixed(1)} kg`;
    if (communityAvgEl) communityAvgEl.textContent = `${commAvg.toFixed(1)} kg avg`;
    if (levelTextEl) levelTextEl.textContent = level;
    
    // Color-code level badge
    if (levelBadgeEl) {
      levelBadgeEl.classList.remove('badge-primary', 'badge-success', 'badge-warning');
      if (level === 'low') levelBadgeEl.classList.add('badge-success');
      else if (level === 'high') levelBadgeEl.classList.add('badge-warning');
      else levelBadgeEl.classList.add('badge-primary');
    }

    // Update the Carbon Footprint to show this week's total only (last 7 days)
    if (annualEl) {
      const display = `${weekly.toLocaleString(undefined, { maximumFractionDigits: 0 })} kg CO₂e`;
      annualEl.textContent = display;
    }
  } catch (e) {
    if (msgEl) msgEl.textContent = 'Tip is unavailable right now. Try again later.';
    if (userWeeklyEl) userWeeklyEl.textContent = '0 kg';
    if (communityAvgEl) communityAvgEl.textContent = '0 kg avg';
    if (levelTextEl) levelTextEl.textContent = '--';
    if (annualEl) annualEl.textContent = '0 kg CO₂e';
  }
}

// Refresh dashboard panels when scenarios or activities change
function attachScenariosUpdateListener() {
  let refreshTimer = null;
  window.addEventListener('scenarios:updated', (evt) => {
    // Debounce multiple rapid events
    if (refreshTimer) clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => {
      loadLatestScenarios();
      // refresh leaderboard for currently active tab
      const activeTab = document.querySelector('.tab-btn.tab-active');
      const type = activeTab ? activeTab.dataset.type : 'scenarios';
      loadLeaderboard(type);
      // refresh active challenges since emissions may have changed progress
      loadMyChallenges();
      // Optionally, refresh motivation if activity impacts weekly data
      // loadMotivation(); // uncomment if needed
    }, 150);
  });
}

// ------------------ Active Challenges (dashboard card) ------------------
async function loadMyChallenges() {
  const container = document.getElementById('challengesContainer');
  if (!container) return;
  container.innerHTML = '<div class="text-sm text-muted"><i class="fas fa-spinner fa-spin mr-2"></i> Loading your challenges...</div>';
  try {
    const token = localStorage.getItem('token');
    // Use new daily tracking API
    const res = await fetch('http://localhost:3000/api/my/challenges-with-days', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error('Failed to load user challenges');
    const payload = await res.json();
    const list = Array.isArray(payload.data) ? payload.data : [];
    const active = list.filter((c) => c.status === 'active');

    if (!active.length) {
      container.innerHTML = `
        <div class="text-sm text-muted">No active challenges yet.</div>
        <button class="btn btn-primary w-full mt-3" onclick="openChallengesModal()">
          <i class="fas fa-plus mr-2"></i> Join a Challenge
        </button>`;
      return;
    }

    container.innerHTML = active
      .map((c) => {
        const prog = Number(c.progress_percent || 0);
        const typeLabels = {
          daily_limit: 'Daily Limit',
          total_limit: 'Total Limit',
          activity_count: 'Activity Goal',
          consecutive_days: 'Consecutive Days'
        };
        const challengeType = typeLabels[c.challenge_type] || 'Challenge';
        const targetVal = Number(c.target_value || 0);
        const completedDays = c.completed_days_count || 0;
        const totalDays = c.duration_days || 0;
        
        return `
          <div class="card bg-base-100 shadow p-3">
            <div class="flex items-start justify-between gap-3">
              <div class="flex-1 min-w-0">
                <div class="font-semibold truncate">${c.name}</div>
                <div class="text-xs text-muted">${challengeType} • Day ${c.current_day}/${totalDays}</div>
                <progress class="progress progress-primary w-full mt-2" value="${prog}" max="100"></progress>
                <div class="text-xs text-muted mt-1">${completedDays}/${totalDays} days completed • ${prog.toFixed(0)}%</div>
                <div class="text-[11px] text-muted">Target: ${targetVal} ${c.target_unit || 'kg CO₂e'}</div>
              </div>
              <div class="flex flex-col items-end gap-2">
                ${c.badge_name ? `<div class="badge badge-warning badge-outline"><i class='fas fa-medal mr-1'></i>${c.badge_name}</div>` : ''}
                <button class="btn btn-primary btn-sm" onclick="openChallengeTracker(${c.user_challenge_id})">
                  <i class="fas fa-calendar-check mr-1"></i>
                  Track
                </button>
              </div>
            </div>
          </div>`;
      })
      .join('');
  } catch (e) {
    console.error('loadMyChallenges error:', e);
    container.innerHTML = '<div class="text-sm text-error">Unable to load challenges.</div>';
  }
}

async function refreshChallengeProgress(challengeId) {
  try {
    const token = localStorage.getItem('token');
    const res = await fetch(`http://localhost:3000/api/my/challenges/${challengeId}/progress`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Failed to refresh progress');
    }
    // Refresh UI and XP
    await loadMyChallenges();
    await loadUserStats();
  } catch (e) {
    console.error('refreshChallengeProgress error:', e);
  }
}

// ------------------ Challenges Modal (inject challenges.html) ------------------
let challengesContentLoaded = false;

async function openChallengesModal() {
  const modal = document.getElementById('challengesModal');
  const content = document.getElementById('challengesModalContent');
  if (!modal || !content) return;
  // Load HTML once per session
  if (!challengesContentLoaded) {
    try {
      const resp = await fetch('challenges.html', { cache: 'no-store' });
      const html = await resp.text();
      content.innerHTML = html;
      challengesContentLoaded = true;
    } catch (e) {
      content.innerHTML = '<div class="text-sm text-error">Failed to load challenges UI.</div>';
    }
  }

  // Show modal
  modal.classList.remove('hidden');
  modal.classList.remove('pointer-events-none');
  modal.classList.add('modal-open');

  // Populate scenario options and list from API
  await populateChallengeScenarios();
  await loadChallengesList();

  // Click-outside to close (once)
  if (!openChallengesModal._bound) {
    window.addEventListener('click', function (event) {
      const isOpen = !modal.classList.contains('hidden') && !modal.classList.contains('pointer-events-none');
      if (isOpen && event.target === modal) {
        closeChallengesModal();
      }
    });
    openChallengesModal._bound = true;
  }
}

function closeChallengesModal() {
  const modal = document.getElementById('challengesModal');
  if (!modal) return;
  modal.classList.remove('modal-open');
  modal.classList.add('hidden');
  modal.classList.add('pointer-events-none');
}

async function loadChallengesList() {
  const listEl = document.getElementById('challengesList');
  if (!listEl) return; // challenges.html provides container
  listEl.innerHTML = '<div class="text-sm text-muted"><i class="fas fa-spinner fa-spin mr-2"></i> Loading challenges...</div>';
  try {
    const token = localStorage.getItem('token');
    const res = await fetch('http://localhost:3000/api/challenges', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error('Failed to load challenges');
    const payload = await res.json();
    const items = payload.data || [];
    if (!items.length) {
      listEl.innerHTML = '<div class="text-sm text-muted">No active challenges right now.</div>';
      return;
    }
    listEl.innerHTML = items
      .map((c) => {
        const joined = !!c.joined;
        const typeLabels = {
          daily_limit: 'Daily Limit',
          total_limit: 'Total Limit',
          activity_count: 'Activity Goal',
          consecutive_days: 'Consecutive Days'
        };
        const challengeType = typeLabels[c.challenge_type] || 'Challenge';
        const targetVal = Number(c.target_value || 0);
        const unit = c.target_unit || 'kg CO₂e';
        
        return `
          <div class="card bg-base-100 border border-base-300">
            <div class="card-body p-4">
              <div class="flex items-start justify-between gap-3">
                <div>
                  <div class="font-semibold">${c.name}</div>
                  <div class="text-sm text-muted">${c.description || ''}</div>
                  <div class="text-xs text-muted mt-1">
                    <span class="badge badge-sm badge-outline">${challengeType}</span> 
                    Target: ${targetVal} ${unit} • Duration: ${c.duration_days}d
                  </div>
                  ${c.badge_name ? `<div class="mt-1 text-xs"><i class="fas fa-medal text-warning mr-1"></i>${c.badge_name}</div>` : ''}
                </div>
                <div class="flex items-center gap-2">
                  <button class="btn btn-sm ${joined ? 'btn-ghost' : 'btn-primary'}" ${joined ? 'disabled' : ''} data-challenge-id="${c.id}">
                    ${joined ? '<i class="fas fa-check mr-2"></i> Joined' : '<i class="fas fa-plus mr-2"></i> Join'}
                  </button>
                </div>
              </div>
            </div>
          </div>`;
      })
      .join('');

    // Attach click handlers
    listEl.querySelectorAll('button[data-challenge-id]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-challenge-id');
        await joinChallenge(id);
      });
    });
  } catch (e) {
    listEl.innerHTML = '<div class="text-sm text-error">Failed to load challenges.</div>';
  }
}

async function joinChallenge(challengeId) {
  try {
    const token = localStorage.getItem('token');
    const sel = document.getElementById('challengeScenarioSelect');
    const scenarioId = sel && sel.value ? parseInt(sel.value, 10) : null;
    const catSel = document.getElementById('challengeCategorySelect');
    const category = catSel && catSel.value ? catSel.value : null;
    const res = await fetch(`http://localhost:3000/api/challenges/${challengeId}/join`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(
        Object.assign({},
          scenarioId ? { scenario_id: scenarioId } : {},
          category ? { category } : {}
        )
      ),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Failed to join');
    }
    // Refresh list and XP
    await loadChallengesList();
    if (typeof loadUserStats === 'function') loadUserStats();
  } catch (e) {
    if (window.notify?.error) window.notify.error(e.message || 'Failed to join challenge');
    else alert(e.message || 'Failed to join challenge');
  }
}

async function populateChallengeScenarios() {
  const select = document.getElementById('challengeScenarioSelect');
  if (!select) return;
  // Clear and add default
  select.innerHTML = '<option value="">All my scenarios</option>';
  try {
    const token = localStorage.getItem('token');
    const res = await fetch('http://localhost:3000/api/scenarios?limit=100', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error('Failed to load scenarios');
    const payload = await res.json();
    const scenarios = Array.isArray(payload.data) ? payload.data : [];
    scenarios.forEach((s) => {
      const opt = document.createElement('option');
      opt.value = s.id;
      opt.textContent = s.name || `Scenario #${s.id}`;
      select.appendChild(opt);
    });
  } catch (e) {
    // keep default only
  }
}

// Expose for inline handlers
window.openChallengesModal = openChallengesModal;
window.closeChallengesModal = closeChallengesModal;

// --------------- Tips modal host-side initializer ---------------
let __tipsInitialized = false;
function initTipsModalUI() {
  if (__tipsInitialized) return;
  const chatWindow = document.getElementById('chatWindow');
  const form = document.getElementById('chatForm');
  const input = document.getElementById('chatInput');
  const btnQa = document.getElementById('modeQa');
  const btnTips = document.getElementById('modeTips');
  if (!chatWindow || !form || !input || !btnQa || !btnTips) return; // not loaded yet

  let mode = 'qa';
  const setMode = (m) => {
    mode = m;
    btnQa.classList.toggle('btn-primary', m === 'qa');
    btnQa.classList.toggle('btn-ghost', m !== 'qa');
    btnTips.classList.toggle('btn-primary', m === 'tips');
    btnTips.classList.toggle('btn-ghost', m !== 'tips');
  };

  const addMsg = (role, htmlText) => {
    const row = document.createElement('div');
    row.className = 'flex ' + (role === 'user' ? 'justify-end' : 'justify-start');
    const bubble = document.createElement('div');
    bubble.className = 'max-w-[80%] p-2 rounded ' + (role === 'user' ? 'bg-primary text-primary-content' : 'bg-base-100');
    bubble.innerHTML = htmlText;
    row.appendChild(bubble);
    chatWindow.appendChild(row);
    chatWindow.scrollTop = chatWindow.scrollHeight;
    return row;
  };

  const addThinking = () => addMsg('bot', '<i class="fas fa-spinner fa-spin mr-2"></i> Thinking…');

  btnQa.addEventListener('click', () => setMode('qa'));
  btnTips.addEventListener('click', () => setMode('tips'));
  setMode('qa');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    addMsg('user', escapeHtml(text));
    input.value = '';
    const token = localStorage.getItem('token');
    const thinkingRow = addThinking();
    try {
      const res = await fetch('http://localhost:3000/api/social/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ message: text, mode })
      });
      const data = await res.json().catch(() => ({}));
      // remove thinking bubble
      if (thinkingRow && thinkingRow.parentNode) thinkingRow.parentNode.removeChild(thinkingRow);
      if (!res.ok || data.status !== 'success') {
        addMsg('bot', 'Sorry, something went wrong. Try again.');
      } else {
        const src = data?.data?.source || '';
        const reply = escapeHtml(String(data.data.reply || ''));
        const sourceBadge = src ? `<div class="mt-1 text-[11px] opacity-60">Source: ${escapeHtml(src)}</div>` : '';
        addMsg('bot', reply + sourceBadge);
      }
    } catch (_) {
      if (thinkingRow && thinkingRow.parentNode) thinkingRow.parentNode.removeChild(thinkingRow);
      addMsg('bot', 'Network error.');
    }
  });

  __tipsInitialized = true;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Expose for dashboard.html to call after injecting tips.html
window.initTipsModalUI = initTipsModalUI;

// --------------- Carbon Footprint Chart ---------------
let carbonChartInstance = null;

async function initCarbonChart() {
  const container = document.getElementById('carbonChart');
  if (!container) return;

  // Destroy existing chart if present
  if (carbonChartInstance && typeof carbonChartInstance.destroy === 'function') {
    try { carbonChartInstance.destroy(); } catch (_) {}
    carbonChartInstance = null;
  }

  // Fetch last 7 days of activity data and render with ApexCharts
  const token = localStorage.getItem('token');
  try {
    const res = await fetch('http://localhost:3000/api/stats/weekly-chart', {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();

    const labels = data?.data?.labels || ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const values = data?.data?.values || [0, 0, 0, 0, 0, 0, 0];

    const options = {
      chart: { type: 'bar', height: '100%', toolbar: { show: false } },
      series: [{ name: 'Daily CO₂e (kg)', data: values }],
      xaxis: { categories: labels, labels: { style: { colors: '#9ca3af' } } },
      yaxis: { labels: { style: { colors: '#9ca3af' } }, min: 0 },
      plotOptions: { bar: { borderRadius: 6, columnWidth: '50%' } },
      dataLabels: { enabled: false },
      colors: ['#22c55e'],
      grid: { borderColor: 'rgba(156,163,175,0.08)' },
      tooltip: { y: { formatter: (val) => `${val} kg` } },
      responsive: [{ breakpoint: 640, options: { plotOptions: { bar: { columnWidth: '70%' } } } }]
    };

    carbonChartInstance = new ApexCharts(container, options);
    await carbonChartInstance.render();
  } catch (e) {
    console.error('Failed to load chart data:', e);
    // fallback: render an empty chart
    const options = {
      chart: { type: 'bar', height: '100%', toolbar: { show: false } },
      series: [{ name: 'Daily CO₂e (kg)', data: [0, 0, 0, 0, 0, 0, 0] }],
      xaxis: { categories: ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'], labels: { style: { colors: '#9ca3af' } } },
      yaxis: { labels: { style: { colors: '#9ca3af' } }, min: 0 },
      plotOptions: { bar: { borderRadius: 6, columnWidth: '50%' } },
      dataLabels: { enabled: false },
      colors: ['rgba(156,163,175,0.4)'],
      grid: { borderColor: 'rgba(156,163,175,0.08)' }
    };
    carbonChartInstance = new ApexCharts(container, options);
    await carbonChartInstance.render();
  }
}

// Line chart: user vs community average (last 7 days)
async function initWeeklyComparisonChart() {
  const container = document.getElementById('weeklyComparisonChart');
  if (!container) return;
  const token = localStorage.getItem('token');
  try {
    const res = await fetch('http://localhost:3000/api/stats/weekly-comparison', {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();
    if (!res.ok || data.status !== 'success') throw new Error(data.message || 'Failed');
    const labels = data.data.labels || [];
    const userVals = data.data.userValues || [];
    const commVals = data.data.communityValues || [];

    const options = {
      chart: { type: 'line', height: '100%', toolbar: { show: false } },
      series: [
        { name: 'You', data: userVals },
        { name: 'Community Avg', data: commVals }
      ],
      xaxis: { categories: labels, labels: { style: { colors: '#9ca3af' } } },
      yaxis: { labels: { style: { colors: '#9ca3af' } }, min: 0 },
      stroke: { width: 3, curve: 'smooth' },
      markers: { size: 3 },
      colors: ['#22c55e', '#3b82f6'],
      tooltip: { y: { formatter: (val) => `${val} kg` } },
      grid: { borderColor: 'rgba(156,163,175,0.08)' },
      legend: { position: 'top' }
    };
    const chart = new ApexCharts(container, options);
    await chart.render();
  } catch (e) {
    // fallback content
    container.innerHTML = '<div class="text-sm text-muted"><i class="fas fa-exclamation-circle mr-1"></i> Comparison unavailable</div>';
  }
}

// ==================== CHALLENGE TRACKER MODAL ====================

let currentTrackedChallenge = null;
let currentTrackedDays = [];
let selectedTrackedDay = null;

async function openChallengeTracker(userChallengeId) {
  const modal = document.getElementById('challengeTrackerModal');
  const content = document.getElementById('challengeTrackerContent');
  
  if (!modal || !content) return;
  
  // Show modal
  modal.classList.remove('hidden', 'pointer-events-none');
  modal.classList.add('modal-open');
  
  // Show loading
  content.innerHTML = '<div class="text-center py-8"><i class="fas fa-spinner fa-spin text-3xl text-primary"></i></div>';
  
  // Load challenge data
  await loadChallengeTrackerData(userChallengeId);
}

function closeChallengeTrackerModal() {
  const modal = document.getElementById('challengeTrackerModal');
  if (modal) {
    modal.classList.add('hidden', 'pointer-events-none');
    modal.classList.remove('modal-open');
  }
  currentTrackedChallenge = null;
  currentTrackedDays = [];
  // Reload challenges to update progress
  loadMyChallenges();
  // Refresh XP and badge counts since logging may change them
  if (typeof loadUserStats === 'function') loadUserStats();
}

async function loadChallengeTrackerData(userChallengeId) {
  try {
    const token = localStorage.getItem('token');
    const res = await fetch(`http://localhost:3000/api/my/challenges/${userChallengeId}/days`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (!res.ok) throw new Error('Failed to load challenge data');
    
    const result = await res.json();
    if (result.status === 'success') {
      currentTrackedChallenge = result.data.user_challenge;
      currentTrackedDays = result.data.days;
      const summary = result.data.summary;
      
      renderChallengeTracker(currentTrackedChallenge, currentTrackedDays, summary);
    }
  } catch (error) {
    console.error('Error loading challenge tracker:', error);
    const content = document.getElementById('challengeTrackerContent');
    content.innerHTML = `
      <div class="alert alert-error">
        <i class="fas fa-exclamation-circle"></i>
        <span>Failed to load challenge data: ${error.message}</span>
      </div>
      <div class="text-sm text-muted mt-2">
        Make sure you've run the database migration: 
        <code class="text-xs">mysql -u root -p carbonplay < backend/database/add_daily_challenge_tracking.sql</code>
      </div>
    `;
  }
}

function renderChallengeTracker(challenge, days, summary) {
  const content = document.getElementById('challengeTrackerContent');
  
  const typeLabels = {
    daily_limit: 'Daily Limit',
    total_limit: 'Total Limit',
    activity_count: 'Activity Count',
    consecutive_days: 'Consecutive Days'
  };
  
  const html = `
    <!-- Challenge Header -->
    <div class="card bg-gradient-to-r from-primary/10 to-success/10 mb-4">
      <div class="card-body p-4">
        <div class="flex justify-between items-start mb-3">
          <div>
            <h2 class="text-2xl font-bold">${challenge.name}</h2>
            <p class="text-sm text-muted mt-1">${challenge.description || ''}</p>
          </div>
          <div class="badge badge-lg badge-primary">${typeLabels[challenge.challenge_type]}</div>
        </div>
        
        <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
          <div class="stat bg-base-100 rounded p-3">
            <div class="stat-title text-xs">Total Days</div>
            <div class="stat-value text-xl">${summary.total_days}</div>
          </div>
          <div class="stat bg-base-100 rounded p-3">
            <div class="stat-title text-xs">Completed</div>
            <div class="stat-value text-xl text-success">${summary.completed_days}</div>
          </div>
          <div class="stat bg-base-100 rounded p-3">
            <div class="stat-title text-xs">Current Day</div>
            <div class="stat-value text-xl text-info">${summary.current_day}</div>
          </div>
          <div class="stat bg-base-100 rounded p-3">
            <div class="stat-title text-xs">Daily Goal</div>
            <div class="stat-value text-lg">${summary.daily_goal.toFixed(2)}</div>
            <div class="stat-desc text-xs">${formatUnit(challenge.target_unit)}</div>
          </div>
        </div>
        
        <div class="mt-3">
          <div class="flex justify-between text-xs mb-1">
            <span>Overall Progress</span>
            <span>${summary.progress_percent.toFixed(0)}%</span>
          </div>
          <progress class="progress progress-primary w-full" value="${summary.progress_percent}" max="100"></progress>
        </div>
      </div>
    </div>
    
    <!-- Daily Progress -->
    <div class="space-y-3">
      <h3 class="font-bold flex items-center gap-2">
        <i class="fas fa-calendar-days"></i>
        Daily Progress Tracker
      </h3>
      ${days.map(day => renderDayCard(day, challenge, summary.daily_goal)).join('')}
    </div>
    
    <!-- Log Modal (inline) -->
    <div id="inlineLogModal" class="hidden fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div class="bg-base-100 rounded-lg shadow-xl max-w-md w-full">
        <div class="p-4">
          <div class="flex justify-between items-center mb-4">
            <h3 class="font-bold text-lg">
              Log Day <span id="logModalDayNum"></span>
            </h3>
            <button class="btn btn-sm btn-ghost" onclick="closeInlineLogModal()">
              <i class="fas fa-times"></i>
            </button>
          </div>
          
          <form id="inlineLogForm" onsubmit="submitDailyLog(event)">
            <div class="form-control mb-3">
              <label class="label"><span class="label-text">Date</span></label>
              <input type="text" id="logModalDate" class="input input-bordered" disabled />
            </div>
            
            <div class="form-control mb-3">
              <label class="label">
                <span class="label-text">Value <span id="logModalUnit"></span></span>
              </label>
              <input type="number" step="0.01" id="logModalValue" class="input input-bordered" placeholder="Enter value" required />
              <div class="label">
                <span class="label-text-alt">Daily Goal: <span id="logModalGoal"></span></span>
              </div>
            </div>
            
            <div class="form-control mb-4">
              <label class="label"><span class="label-text">Notes (Optional)</span></label>
              <textarea id="logModalNotes" class="textarea textarea-bordered" rows="2" placeholder="Add notes..."></textarea>
            </div>
            
            <div class="alert alert-info text-xs mb-4">
              <i class="fas fa-info-circle"></i>
              <span id="logModalHelp"></span>
            </div>
            
            <div class="flex gap-2 justify-end">
              <button type="button" class="btn btn-ghost" onclick="closeInlineLogModal()">Cancel</button>
              <button type="submit" class="btn btn-primary">
                <i class="fas fa-save mr-2"></i>Save
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  `;
  
  content.innerHTML = html;
}

function renderDayCard(day, challenge, dailyGoal) {
  const statusClass = day.is_completed ? 'success' : day.is_current ? 'primary' : day.is_future ? 'neutral' : 'warning';
  const statusIcon = day.is_completed ? 'fa-circle-check text-success' : day.is_future ? 'fa-lock text-gray-400' : 'fa-circle text-gray-400';
  const canLog = day.is_unlocked && !day.is_completed;
  
  return `
    <div class="card bg-base-200 ${day.is_current ? 'ring-2 ring-primary' : ''}">
      <div class="card-body p-3">
        <div class="flex justify-between items-start">
          <div class="flex items-center gap-3">
            <div class="avatar placeholder">
              <div class="bg-${statusClass} text-white rounded-full w-10 h-10 flex items-center justify-center">
                <span class="text-sm font-bold">${day.day_number}</span>
              </div>
            </div>
            <div>
              <div class="font-semibold text-sm">Day ${day.day_number}</div>
              <div class="text-xs text-muted">${formatDateShort(day.log_date)}</div>
              ${day.is_current ? '<span class="badge badge-primary badge-xs">Today</span>' : ''}
              ${day.is_future ? '<span class="badge badge-ghost badge-xs">Locked</span>' : ''}
            </div>
          </div>
          
          <div class="text-right">
            <i class="fas ${statusIcon} text-xl"></i>
            ${day.is_completed 
              ? `<div class="text-xs mt-1">
                   <span class="font-bold">${parseFloat(day.value_logged).toFixed(2)}</span>
                   <span class="text-muted">/ ${dailyGoal.toFixed(2)}</span>
                 </div>`
              : day.is_unlocked
                ? `<div class="text-xs text-muted mt-1">Goal: ${dailyGoal.toFixed(2)}</div>`
                : ''
            }
          </div>
        </div>
        
        ${day.notes ? `
          <div class="mt-2 p-2 bg-base-300 rounded text-xs">
            <i class="fas fa-note-sticky mr-1"></i> ${day.notes}
          </div>
        ` : ''}
        
        ${canLog ? `
          <div class="mt-2">
            <button class="btn btn-primary btn-sm btn-block" onclick="openInlineLogModal(${day.day_number})">
              <i class="fas fa-pen mr-1"></i> ${day.value_logged !== null ? 'Update' : 'Log Progress'}
            </button>
          </div>
        ` : ''}
        
        ${day.is_future ? `
          <div class="alert alert-warning mt-2 text-xs py-2">
            <i class="fas fa-lock"></i>
            <span>Complete previous days first</span>
          </div>
        ` : ''}
      </div>
    </div>
  `;
}

function openInlineLogModal(dayNumber) {
  selectedTrackedDay = currentTrackedDays.find(d => d.day_number === dayNumber);
  if (!selectedTrackedDay) return;
  
  document.getElementById('logModalDayNum').textContent = dayNumber;
  document.getElementById('logModalDate').value = formatDateShort(selectedTrackedDay.log_date);
  document.getElementById('logModalValue').value = selectedTrackedDay.value_logged || '';
  document.getElementById('logModalNotes').value = selectedTrackedDay.notes || '';
  document.getElementById('logModalGoal').textContent = `${selectedTrackedDay.daily_goal.toFixed(2)} ${formatUnit(currentTrackedChallenge.target_unit)}`;
  document.getElementById('logModalUnit').textContent = `(${formatUnit(currentTrackedChallenge.target_unit)})`;
  
  const helpText = getTrackerHelpText(currentTrackedChallenge.challenge_type, selectedTrackedDay.daily_goal);
  document.getElementById('logModalHelp').textContent = helpText;
  
  document.getElementById('inlineLogModal').classList.remove('hidden');
}

function closeInlineLogModal() {
  document.getElementById('inlineLogModal').classList.add('hidden');
  selectedTrackedDay = null;
}

async function submitDailyLog(event) {
  event.preventDefault();
  if (!selectedTrackedDay || !currentTrackedChallenge) return;
  
  const valueLogged = parseFloat(document.getElementById('logModalValue').value);
  const notes = document.getElementById('logModalNotes').value.trim();
  
  try {
    const token = localStorage.getItem('token');
    const res = await fetch(`http://localhost:3000/api/my/challenges/${currentTrackedChallenge.id}/log-day`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        day_number: selectedTrackedDay.day_number,
        value_logged: valueLogged,
        notes: notes || null
      })
    });
    
    if (!res.ok) throw new Error('Failed to log progress');
    
    const result = await res.json();
    if (result.status === 'success') {
      showToast(result.message, 'success');
      closeInlineLogModal();
      
      // Reload challenge data
      await loadChallengeTrackerData(currentTrackedChallenge.id);
      // Refresh XP bar and counts (badges may change when challenge completes)
      if (typeof loadUserStats === 'function') loadUserStats();
      
      // If challenge completed
      if (result.data.challenge_completed) {
        setTimeout(() => {
          showChallengeCompletedNotification(currentTrackedChallenge);
          closeChallengeTrackerModal();
        }, 500);
      }
    }
  } catch (error) {
    console.error('Error logging progress:', error);
    showToast(error.message || 'Failed to log progress', 'error');
  }
}

function showChallengeCompletedNotification(challenge) {
  const notif = document.createElement('div');
  notif.className = 'fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4';
  notif.innerHTML = `
    <div class="bg-base-100 rounded-lg shadow-xl p-6 max-w-md text-center">
      <div class="text-6xl mb-4">🏆</div>
      <h3 class="text-2xl font-bold mb-2">Challenge Completed!</h3>
      <p class="mb-4">You've completed <strong>${challenge.name}</strong>!</p>
      <div class="badge badge-success badge-lg mb-4">
        <i class="fas fa-star mr-2"></i>+100 XP Earned
      </div>
      ${challenge.badge_name ? `
        <div class="badge badge-warning badge-lg mb-4">
          <i class="fas fa-award mr-2"></i>${challenge.badge_name}
        </div>
      ` : ''}
      <button class="btn btn-primary" onclick="this.closest('div').parentElement.remove(); loadMyChallenges(); loadUserStats();">
        <i class="fas fa-check mr-2"></i>Awesome!
      </button>
    </div>
  `;
  document.body.appendChild(notif);
}

function formatUnit(unit) {
  if (unit === 'kg_co2e') return 'kg CO₂e';
  if (unit === 'activities') return 'activities';
  return unit || '';
}

function formatDateShort(dateStr) {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function getTrackerHelpText(challengeType, dailyGoal) {
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
  // Delegate to global notifier when available
  if (window.notify) {
    const fn = type === 'success' ? window.notify.success : type === 'warning' ? window.notify.warning : type === 'error' ? window.notify.error : window.notify.info;
    fn(message, 3000);
    return;
  }
  // Fallback minimal inline toast
  const toast = document.createElement('div');
  toast.className = `alert alert-${type} fixed top-4 right-4 w-96 z-[100] shadow-lg`;
  toast.innerHTML = `
    <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i>
    <span>${message}</span>
  `;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}
