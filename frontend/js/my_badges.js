(function(){
  async function loadBadges(){
    const grid = document.getElementById('badgesGrid');
    const empty = document.getElementById('badgesEmpty');
    const lvlEl = document.getElementById('userLevelBadge');
    if (!grid) return;
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        grid.innerHTML = '<div class="text-sm text-error">Please log in to view your badges.</div>';
        return;
      }
      const res = await fetch('http://localhost:3000/api/auth/me/badges', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Failed to load badges');
      const data = await res.json();
      if (data.status !== 'success') throw new Error(data.message || 'Failed');
      const { level, badges } = data.data || {};
      if (lvlEl && level) lvlEl.textContent = `Level ${level}`;

      if (!Array.isArray(badges) || badges.length === 0) {
        grid.innerHTML = '';
        if (empty) empty.classList.remove('hidden');
        return;
      }

      const toCard = (b) => {
        const earned = !!b.earned;
        const icon = b.icon || '🏅';
        const disabledCls = earned ? '' : 'opacity-50 grayscale';
        const badgeTone = earned ? 'badge-success' : 'badge-ghost';
        return `
          <div class="card border border-base-300 bg-base-100 ${disabledCls}">
            <div class="card-body p-4 items-center text-center">
              <div class="text-3xl mb-2">${icon}</div>
              <h3 class="font-semibold">${b.name}</h3>
              <div class="text-xs text-muted mb-2">Unlock at level ${b.level_required}</div>
              <div class="badge ${badgeTone}">${earned ? 'Unlocked' : 'Locked'}</div>
            </div>
          </div>
        `;
      };

      grid.innerHTML = badges.map(toCard).join('');
    } catch (e) {
      console.warn('Badges load error:', e);
      grid.innerHTML = '<div class="text-sm text-error">Could not load badges.</div>';
    }
  }

  // Init on load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadBadges);
  } else {
    loadBadges();
  }
})();
