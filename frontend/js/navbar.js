async function loadNavbar(activeKey){
  try {
    window.__SET_ACTIVE_NAV__ = activeKey || null;
    const placeholder = document.getElementById('navbar-placeholder');
    if (!placeholder) return;
    const res = await fetch('frontend/partials/navbar.html', { cache: 'no-store' });
    const html = await res.text();
    placeholder.innerHTML = html;
    // small delay to let partial script run
    setTimeout(() => initNavbar(activeKey), 50);
  } catch (e) {
    // swallow errors to avoid breaking pages
  }
}

function initNavbar(activeKey){
  // Apply active tab
  // Mark active links (desktop + mobile)
  if (activeKey) {
    document.querySelectorAll('[data-active]').forEach(a => {
      if (a.getAttribute('data-active') === activeKey) {
        a.classList.add('active');
      } else {
        a.classList.remove('active');
      }
    });
  }

  const token = localStorage.getItem('token');
  const logoutBtn = document.getElementById('navLogoutBtn');
  const loginBtn = document.getElementById('navLoginBtn');
  const userName = document.getElementById('navUserName');
  const initials = document.getElementById('navUserInitials');

  const show = el => { if (el) el.classList.remove('hidden'); };
  const hide = el => { if (el) el.classList.add('hidden'); };

  if (token) {
    show(logoutBtn); show(userName); show(initials); hide(loginBtn);
    // Fetch user info for display
    fetch('http://localhost:3000/api/auth/me', { headers: { 'Authorization': `Bearer ${token}` }})
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!d) return;
        const user = d.data || {};
        if (userName) userName.textContent = user.username || 'User';
        
        // Update profile picture or initials
        if (initials) {
          const avatarDiv = initials.querySelector('div');
          if (user.profile && user.profile.profile_picture) {
            // Show profile picture
            const imgUrl = `http://localhost:3000/backend${user.profile.profile_picture}`;
            if (avatarDiv) {
              avatarDiv.innerHTML = `<img src="${imgUrl}" alt="Profile" class="w-full h-full object-cover rounded-full">`;
              // Remove styling meant for text/icon centering
              avatarDiv.classList.remove('bg-primary', 'text-white', 'flex', 'items-center', 'justify-center', 'grid', 'place-items-center', 'text-xs');
            }
          } else {
            // Show icon fallback (re-apply centering classes in case they were removed)
            if (avatarDiv) {
              avatarDiv.classList.add('bg-primary', 'text-white', 'grid', 'place-items-center');
                  avatarDiv.innerHTML = `
                    <svg class="w-5 h-5 text-white" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style="display:block; position: relative; top: 4px;">
                  <path fill-rule="evenodd" d="M7.5 6a4.5 4.5 0 119 0 4.5 4.5 0 01-9 0zM3 20.25a8.25 8.25 0 1116.5 0v.75H3v-.75z" clip-rule="evenodd"></path>
                </svg>`;
            } else {
                  initials.innerHTML = `
                    <svg class="w-5 h-5 text-white" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style="display:block; position: relative; top: 4px;">
                  <path fill-rule="evenodd" d="M7.5 6a4.5 4.5 0 119 0 4.5 4.5 0 01-9 0zM3 20.25a8.25 8.25 0 1116.5 0v.75H3v-.75z" clip-rule="evenodd"></path>
                </svg>`;
            }
          }
        }
      })
      .catch(() => {});

    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => {
        localStorage.removeItem('token');
        window.location.href = 'index.html';
      });
    }
  } else {
    hide(logoutBtn); hide(userName); hide(initials); show(loginBtn);
  }
}
