// DaisyUI toast-based notifier for admin pages
(function(){
  function ensureContainer(){
    let c = document.getElementById('admin-toast-container');
    if (!c) {
      c = document.createElement('div');
      c.id = 'admin-toast-container';
      c.className = 'toast toast-top toast-end fixed right-4 top-4 z-50';
      document.body.appendChild(c);
    }
    return c;
  }

  function iconFor(type){
    switch(type){
      case 'success': return '<i class="fa-solid fa-circle-check"></i>';
      case 'warning': return '<i class="fa-solid fa-triangle-exclamation"></i>';
      case 'error': return '<i class="fa-solid fa-circle-exclamation"></i>';
      default: return '<i class="fa-solid fa-circle-info"></i>';
    }
  }

  function show(type, message, timeout){
    const container = ensureContainer();
    const wrapper = document.createElement('div');
    const t = type || 'info';
    wrapper.className = `alert alert-${t} shadow-lg`;
    wrapper.innerHTML = `
      <div class="flex items-center gap-2">
        ${iconFor(t)}
        <span>${message || ''}</span>
      </div>
      <button class="btn btn-ghost btn-xs" aria-label="Close">✕</button>
    `;
    wrapper.querySelector('button')?.addEventListener('click', () => wrapper.remove());
    container.appendChild(wrapper);
    const ms = typeof timeout === 'number' ? timeout : 4000;
    if (ms > 0) setTimeout(() => wrapper.remove(), ms);
  }

  window.notify = function(type, message, timeout){ show(type, message, timeout); };
  window.notify.info = (msg, t) => show('info', msg, t);
  window.notify.success = (msg, t) => show('success', msg, t);
  window.notify.warning = (msg, t) => show('warning', msg, t);
  window.notify.error = (msg, t) => show('error', msg, t);
})();
