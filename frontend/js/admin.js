// Minimal admin UI interactions: tabs, modals, and rendering helpers


// Admin console wiring to backend API using fetch with Bearer token
(function(){
  const API_BASE = 'http://localhost:3000/api';
  const $ = (sel, root=document) => root.querySelector(sel);
  const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));

  const token = localStorage.getItem('token');
  if (!token) {
    // Require login for admin
    window.location.href = '../../login.html';
    return;
  }

  async function api(path, { method = 'GET', body } = {}){
    const res = await fetch(`${API_BASE}${path}`, {
      method,
      headers: {
        'Authorization': `Bearer ${token}`,
        ...(body ? { 'Content-Type': 'application/json' } : {})
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    // Early handle admin forbidden
    if (res.status === 403) {
      let msg = 'Admin access required';
      try { const err = await res.json(); msg = err.message || msg; } catch {}
      if (window.notify?.error) window.notify.error(msg, 2500); else console.warn(msg);
      // Redirect shortly to avoid remaining on a broken page
      setTimeout(() => { window.location.href = '../../index.html'; }, 1500);
      return Promise.reject(new Error('Forbidden'));
    }
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.message || `${method} ${path} failed (${res.status})`);
    }
    return data;
  }

  // Tabs switching
  const tabs = $$('.tabs [data-section]');
  const sections = {
    users: $('#section-users'),
    profiles: $('#section-profiles'),
    challenges: $('#section-challenges'),
    userchalls: $('#section-userchalls'),
    factors: $('#section-factors'),
    scenarios: $('#section-scenarios'),
  };

  const cache = { users: [], profiles: [], challenges: [], factors: [], scenarios: [] };
  cache.userchalls = [];

  function setActive(section){
    tabs.forEach(t => {
      if (t.getAttribute('data-section') === section) {
        t.classList.add('tab-active');
      } else {
        t.classList.remove('tab-active');
      }
    });
    Object.entries(sections).forEach(([key, el]) => {
      if (!el) return;
      el.classList.toggle('hidden', key !== section);
    });
    // Persist selection in session
    sessionStorage.setItem('admin_section', section);
  }

  tabs.forEach(t => t.addEventListener('click', () => setActive(t.getAttribute('data-section'))));
  // Restore last selected tab
  setActive(sessionStorage.getItem('admin_section') || 'users');

  // Simple event delegation for modals
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.getAttribute('data-action');
    if (action === 'open-modal') {
      const id = btn.getAttribute('data-modal');
      const mode = btn.getAttribute('data-mode') || 'create';
      const dlg = document.getElementById(id);
      if (dlg && typeof dlg.showModal === 'function') {
        // Set title based on mode
        const titleEl = dlg.querySelector('h3[id^="modal-"][id$="-title"]');
        if (titleEl) titleEl.textContent = titleEl.textContent.replace(/^Edit|^Add|^New/, s => mode === 'edit' ? 'Edit' : (titleEl.textContent.includes('Challenge') ? 'New' : 'Add'));
        // Populate form when editing
        if (mode === 'edit') {
          const itemId = Number(btn.getAttribute('data-id'));
          if (id === 'modal-users') {
            const item = cache.users.find(x => x.id === itemId);
            const f = dlg.querySelector('#form-users');
            if (item && f) {
              f.reset();
              f.querySelector('[name="id"]').value = item.id;
              f.querySelector('[name="username"]').value = item.username || '';
              f.querySelector('[name="email"]').value = item.email || '';
              f.querySelector('[name="role"]').value = item.role || 'user';
              f.querySelector('[name="is_active"]').checked = !!item.is_active;
            }
          }
          if (id === 'modal-profiles') {
            const item = cache.profiles.find(x => x.id === itemId);
            const f = dlg.querySelector('#form-profiles');
            if (item && f) {
              f.reset();
              f.querySelector('[name="id"]').value = item.id;
              f.querySelector('[name="user_id"]').value = item.user_id;
              f.querySelector('[name="country"]').value = item.country || 'US';
              f.querySelector('[name="household_size"]').value = item.household_size || 1;
              f.querySelector('[name="baseline_co2e"]').value = item.baseline_co2e || 0;
              f.querySelector('[name="baseline_calculated"]').checked = !!item.baseline_calculated;
            }
          }
          if (id === 'modal-challenges') {
            const item = cache.challenges.find(x => x.id === itemId);
            const f = dlg.querySelector('#form-challenges');
            if (item && f) {
              f.reset();
              f.querySelector('[name="id"]').value = item.id;
              f.querySelector('[name="name"]').value = item.name || '';
              f.querySelector('[name="description"]').value = item.description || '';
              f.querySelector('[name="challenge_type"]').value = item.challenge_type || 'daily_limit';
              f.querySelector('[name="target_value"]').value = item.target_value || 0;
              f.querySelector('[name="duration_days"]').value = item.duration_days || 7;
              f.querySelector('[name="badge_name"]').value = item.badge_name || '';
              f.querySelector('[name="target_unit"]').value = item.target_unit || 'kg_co2e';
              f.querySelector('[name="is_active"]').checked = !!item.is_active;
            }
          }
          if (id === 'modal-factors') {
            const item = cache.factors.find(x => x.id === itemId);
            const f = dlg.querySelector('#form-factors');
            if (item && f) {
              f.reset();
              f.querySelector('[name="id"]').value = item.id;
              f.querySelector('[name="category"]').value = item.category || 'transport';
              f.querySelector('[name="activity_type"]').value = item.activity_type || '';
              f.querySelector('[name="region"]').value = item.region || 'global';
              f.querySelector('[name="co2e_per_unit"]').value = item.co2e_per_unit || 0;
              f.querySelector('[name="unit"]').value = item.unit || '';
              f.querySelector('[name="source"]').value = item.source || '';
            }
          }
        } else {
          // clear id for create
          const form = dlg.querySelector('form[id^="form-"]');
          if (form) { form.reset(); const hidden = form.querySelector('[name="id"]'); if (hidden) hidden.value = ''; }
        }
        dlg.showModal();
      }
    }
    if (action === 'refresh') {
      const target = btn.getAttribute('data-target');
      if (target && loaders[target]) loaders[target]();
    }
  });

  // Lightweight renderers: take arrays and render rows
  function renderRows(tbody, rows){
    if (!tbody) return;
    if (!rows || rows.length === 0) {
      const colSpan = tbody.closest('table')?.querySelectorAll('thead th').length || 1;
      tbody.innerHTML = `<tr><td colspan="${colSpan}" class="text-center text-base-content/60">No data</td></tr>`;
      return;
    }
    tbody.innerHTML = rows.join('');
  }

  // Data loaders (AJAX)
  const loaders = {
    users: async () => {
      const tbody = document.getElementById('tbody-users');
      try {
        const { data } = await api('/admin/users');
        cache.users = data;
        const rows = data.map(u => `
          <tr>
            <td>${u.id}</td>
            <td>${u.username}</td>
            <td>${u.email || '-'}</td>
            <td><span class="badge ${u.role === 'admin' ? 'badge-primary' : ''}">${u.role}</span></td>
            <td>${u.is_active ? '<span class="badge badge-success">active</span>' : '<span class="badge">inactive</span>'}</td>
            <td><span class="text-xs opacity-70">${new Date(u.created_at).toISOString().slice(0,10)}</span></td>
            <td class="text-right">
              <button class="btn btn-ghost btn-xs" data-action="open-modal" data-modal="modal-users" data-mode="edit" data-id="${u.id}"><i class="fa-solid fa-pen"></i></button>
            </td>
          </tr>`);
        renderRows(tbody, rows);
      } catch (e) {
        renderRows(tbody, []);
      }
    },
    profiles: async () => {
      const tbody = document.getElementById('tbody-profiles');
      try {
        const { data } = await api('/admin/profiles');
        cache.profiles = data;
        const rows = data.map(p => `
          <tr>
            <td>${p.id}</td>
            <td>${p.username}</td>
            <td>${p.country}</td>
            <td>${p.household_size}</td>
            <td>${p.baseline_calculated ? 'Yes' : 'No'}</td>
            <td>${Number(p.baseline_co2e).toFixed(2)}</td>
            <td><span class="text-xs opacity-70">${new Date(p.updated_at).toISOString().slice(0,10)}</span></td>
            <td class="text-right">
              <button class="btn btn-ghost btn-xs" data-action="open-modal" data-modal="modal-profiles" data-mode="edit" data-id="${p.id}" title="Edit profile"><i class="fa-solid fa-pen"></i></button>
              <button class="btn btn-ghost btn-xs" data-compute-baseline data-user-id="${p.user_id}" title="Compute baseline (last 30 days)"><i class="fa-solid fa-calculator"></i></button>
            </td>
          </tr>`);
        renderRows(tbody, rows);
      } catch (e) {
        renderRows(tbody, []);
      }
    },
    challenges: async () => {
      const tbody = document.getElementById('tbody-challenges');
      try {
        const { data } = await api('/admin/challenges');
        cache.challenges = data;
        const typeLabels = {
          daily_limit: 'Daily Limit',
          total_limit: 'Total Limit',
          activity_count: 'Activity Count',
          consecutive_days: 'Consecutive'
        };
        const rows = data.map(c => `
          <tr>
            <td>${c.id}</td>
            <td>${c.name}</td>
            <td><span class="badge badge-sm">${typeLabels[c.challenge_type] || c.challenge_type || 'Daily Limit'}</span></td>
            <td>${c.target_value ? Number(c.target_value).toFixed(1) : '-'} ${c.target_unit || ''}</td>
            <td>${c.duration_days}d</td>
            <td>${c.badge_name || '-'}</td>
            <td>
              <button class="btn btn-xs ${c.is_active ? 'btn-success' : 'btn-ghost'}" 
                      data-toggle-active 
                      data-id="${c.id}" 
                      data-active="${c.is_active}"
                      title="Click to ${c.is_active ? 'deactivate' : 'activate'}">
                ${c.is_active ? '<i class="fa-solid fa-eye"></i> Visible' : '<i class="fa-solid fa-eye-slash"></i> Hidden'}
              </button>
            </td>
            <td class="text-right">
              <button class="btn btn-ghost btn-xs" data-action="open-modal" data-modal="modal-challenges" data-mode="edit" data-id="${c.id}" title="Edit"><i class="fa-solid fa-pen"></i></button>
              <button class="btn btn-ghost btn-xs text-error" data-delete-challenge data-id="${c.id}" title="Delete"><i class="fa-solid fa-trash"></i></button>
            </td>
          </tr>`);
        renderRows(tbody, rows);
      } catch (e) {
        renderRows(tbody, []);
      }
    },
    userchalls: async () => {
      const tbody = document.getElementById('tbody-userchalls');
      try {
        const { data } = await api('/admin/user-challenges');
        cache.userchalls = data;
        const rows = data.map(uc => {
          const progress = `${Number(uc.days_completed || 0)} / ${uc.duration_days} days`;
          const status = uc.completed ? '<span class="badge badge-success">completed</span>' : '<span class="badge">active</span>';
          const started = uc.start_date ? new Date(uc.start_date).toISOString().slice(0,10) : '-';
          return `
            <tr>
              <td>${uc.user_challenge_id}</td>
              <td>${uc.username}</td>
              <td>${uc.challenge_name}</td>
              <td>${progress}</td>
              <td><span class="text-xs opacity-70">${started}</span></td>
              <td>${status}</td>
              <td class="text-right">
                ${uc.completed ? '' : `<button class="btn btn-ghost btn-xs" data-complete-user-challenge data-id="${uc.user_challenge_id}"><i class="fa-solid fa-flag-checkered mr-1"></i>Mark Complete</button>`}
              </td>
            </tr>`;
        });
        renderRows(tbody, rows);
      } catch (e) {
        renderRows(tbody, []);
      }
    },
    factors: async () => {
      const tbody = document.getElementById('tbody-factors');
      try {
        const { data } = await api('/admin/emission-factors');
        cache.factors = data;
        const rows = data.map(f => `
          <tr>
            <td>${f.id}</td>
            <td>${f.category}</td>
            <td>${f.activity_type}</td>
            <td>${f.region}</td>
            <td>${Number(f.co2e_per_unit)}</td>
            <td>${f.unit}</td>
            <td>${f.source || '-'}</td>
            <td><span class="text-xs opacity-70">${new Date(f.last_updated).toISOString().slice(0,10)}</span></td>
            <td class="text-right">
              <button class="btn btn-ghost btn-xs" data-action="open-modal" data-modal="modal-factors" data-mode="edit" data-id="${f.id}"><i class="fa-solid fa-pen"></i></button>
            </td>
          </tr>`);
        renderRows(tbody, rows);
      } catch (e) {
        renderRows(tbody, []);
      }
    },
    scenarios: async () => {
      const tbody = document.getElementById('tbody-scenarios');
      try {
        const { data } = await api('/admin/scenarios');
        cache.scenarios = data;
        const rows = data.map(s => `
          <tr>
            <td>${s.id}</td>
            <td>${s.username}</td>
            <td>${s.name}</td>
            <td>${Number(s.total_co2e).toFixed(2)}</td>
            <td title="Baseline: ${typeof s.user_baseline_co2e === 'number' ? Number(s.user_baseline_co2e).toFixed(2) : '-'} kg CO₂e">${Number(s.vs_baseline || 0).toFixed(2)}</td>
            <td>${s.is_active ? '<span class="badge badge-success">active</span>' : '<span class="badge">inactive</span>'}</td>
            <td><span class="text-xs opacity-70">${new Date(s.created_at).toISOString().slice(0,10)}</span></td>
            <td class="text-right">
              <button class="btn btn-ghost btn-xs" data-action="open-modal" data-modal="modal-scenarios" data-mode="edit" data-id="${s.id}"><i class="fa-solid fa-pen"></i></button>
            </td>
          </tr>`);
        renderRows(tbody, rows);
      } catch (e) {
        renderRows(tbody, []);
      }
    },
  };

  // Initial hydration
  Object.keys(loaders).forEach(k => loaders[k]());

  // Page refresh button
  const refresh = document.getElementById('adminRefreshBtn');
  refresh && refresh.addEventListener('click', () => {
    const current = sessionStorage.getItem('admin_section') || 'users';
    if (loaders[current]) loaders[current]();
  });

  // Compute baseline action
  document.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-compute-baseline]');
    if (!btn) return;
    const userId = Number(btn.getAttribute('data-user-id'));
    if (!userId) return;
    try {
      const days = 30;
      await api(`/admin/profiles/${userId}/compute-baseline?days=${days}`, { method: 'POST' });
      window.notify?.success('Baseline computed');
      // Refresh profiles and scenarios so both baseline and vs_baseline update
      loaders.profiles();
      loaders.scenarios();
    } catch (err) {
      window.notify?.error('Failed to compute baseline');
    }
  });

  // --- Forms: submit handlers (create/update minimal) ---
  const userForm = $('#form-users');
  userForm && userForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(userForm);
    const id = fd.get('id');
    const payload = {
      username: fd.get('username'),
      email: fd.get('email'),
      password: fd.get('password') || undefined,
      role: fd.get('role'),
      is_active: fd.get('is_active') ? 1 : 0,
    };
    try {
      if (id) await api(`/admin/users/${id}`, { method: 'PUT', body: payload });
      else await api('/admin/users', { method: 'POST', body: payload });
      document.getElementById('modal-users').close();
      loaders.users();
  } catch (e) { window.notify?.error('Save failed'); }
  });

  const profileForm = $('#form-profiles');
  profileForm && profileForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(profileForm);
    const id = fd.get('id');
    const payload = {
      user_id: Number(fd.get('user_id')),
      country: fd.get('country'),
      household_size: Number(fd.get('household_size')),
      baseline_co2e: Number(fd.get('baseline_co2e')),
      baseline_calculated: fd.get('baseline_calculated') ? 1 : 0,
    };
    try {
      if (id) await api(`/admin/profiles/${id}`, { method: 'PUT', body: payload });
      else await api('/admin/profiles', { method: 'POST', body: payload });
      document.getElementById('modal-profiles').close();
      loaders.profiles();
  } catch (e) { window.notify?.error('Save failed'); }
  });

  const challengeForm = $('#form-challenges');
  challengeForm && challengeForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(challengeForm);
    const id = fd.get('id');
    const payload = {
      name: fd.get('name'),
      description: fd.get('description') || null,
      challenge_type: fd.get('challenge_type') || 'daily_limit',
      target_value: Number(fd.get('target_value')),
      target_unit: fd.get('target_unit') || 'kg_co2e',
      duration_days: Number(fd.get('duration_days')),
      badge_name: fd.get('badge_name') || null,
      is_active: fd.get('is_active') ? 1 : 0,
    };
    try {
      if (id) await api(`/admin/challenges/${id}`, { method: 'PUT', body: payload });
      else await api('/admin/challenges', { method: 'POST', body: payload });
      document.getElementById('modal-challenges').close();
      loaders.challenges();
  } catch (e) { window.notify?.error('Save failed: ' + (e.message || '')); }
  });

  const factorForm = $('#form-factors');
  factorForm && factorForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(factorForm);
    const id = fd.get('id');
    const payload = {
      category: fd.get('category'),
      activity_type: fd.get('activity_type'),
      region: fd.get('region') || 'global',
      co2e_per_unit: Number(fd.get('co2e_per_unit')),
      unit: fd.get('unit'),
      source: fd.get('source') || null,
    };
    try {
      if (id) await api(`/admin/emission-factors/${id}`, { method: 'PUT', body: payload });
      else await api('/admin/emission-factors', { method: 'POST', body: payload });
      document.getElementById('modal-factors').close();
      loaders.factors();
  } catch (e) { window.notify?.error('Save failed'); }
  });

  // Quick toggle active status for challenges
  document.addEventListener('click', async (e) => {
    const toggleBtn = e.target.closest('[data-toggle-active]');
    if (toggleBtn) {
      const challengeId = Number(toggleBtn.getAttribute('data-id'));
      const currentStatus = Number(toggleBtn.getAttribute('data-active'));
      const newStatus = currentStatus === 1 ? 0 : 1;
      
      try {
        await api(`/admin/challenges/${challengeId}`, {
          method: 'PUT',
          body: { is_active: newStatus }
        });
        loaders.challenges();
      } catch (e) {
  window.notify?.error('Failed to toggle status');
      }
      return;
    }

    // Delete challenge
    const deleteBtn = e.target.closest('[data-delete-challenge]');
    if (deleteBtn) {
      const challengeId = Number(deleteBtn.getAttribute('data-id'));
      const challenge = cache.challenges.find(c => c.id === challengeId);
      
      if (!confirm(`Delete challenge "${challenge?.name || challengeId}"?\n\nThis cannot be undone. If users have joined, you should hide it instead.`)) {
        return;
      }
      
      try {
        const result = await api(`/admin/challenges/${challengeId}`, { method: 'DELETE' });
  window.notify?.success(result.message || 'Challenge deleted');
        loaders.challenges();
      } catch (e) {
  const msg = e.message || 'Failed to delete challenge';
  window.notify?.error(msg);
      }
    }

    // Complete a user's challenge
    const completeBtn = e.target.closest('[data-complete-user-challenge]');
    if (completeBtn) {
      const id = Number(completeBtn.getAttribute('data-id'));
      try {
        await api(`/admin/user-challenges/${id}/complete`, { method: 'POST' });
        window.notify?.success('Marked as completed');
        loaders.userchalls();
      } catch (err) {
        window.notify?.error('Failed to mark complete');
      }
      return;
    }
  });
})();
