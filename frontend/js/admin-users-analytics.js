(function(){
  const API_BASE = 'http://localhost:3000/api';
  const token = localStorage.getItem('token');
  if (!token) { window.location.href = '../../login.html'; return; }

  async function api(path){
    const res = await fetch(`${API_BASE}${path}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Request failed');
    return data;
  }

  const $ = (s, r=document) => r.querySelector(s);
  const setText = (sel, v) => { const el = $(sel); if (el) el.textContent = v; };

  function number(n){ return Number(n || 0); }

  function renderTable(tbodyId, rows){
    const tbody = document.getElementById(tbodyId);
    if (!tbody) return;
    if (!rows || !rows.length) {
      tbody.innerHTML = '<tr><td colspan="2" class="text-center text-base-content/60">No data</td></tr>';
      return;
    }
    tbody.innerHTML = rows.join('');
  }

  function chartActivityTrend(points){
    const el = document.getElementById('chart-activity-trend'); if (!el) return;
    const dates = points.map(p => p.day);
    const counts = points.map(p => number(p.count));
    const options = {
      chart: { type: 'line', height: 280, toolbar: { show: false } },
      dataLabels: { enabled: false },
      stroke: { curve: 'smooth', width: 2 },
      xaxis: { categories: dates, labels: { rotate: -45 } },
      yaxis: { labels: { formatter: v => v.toFixed(0) } },
      series: [{ name: 'Activities', data: counts }]
    };
    const chart = new ApexCharts(el, options); chart.render();
  }

  function chartEmissionsTrend(points){
    const el = document.getElementById('chart-emissions-trend'); if (!el) return;
    const dates = points.map(p => p.day);
    const vals = points.map(p => number(p.total));
    const options = {
      chart: { type: 'area', height: 280, toolbar: { show: false } },
      dataLabels: { enabled: false },
      stroke: { curve: 'smooth', width: 2 },
      xaxis: { categories: dates, labels: { rotate: -45 } },
      yaxis: { labels: { formatter: v => v.toFixed(1) } },
      fill: { type: 'gradient', gradient: { shadeIntensity: 1, opacityFrom: 0.5, opacityTo: 0.1 } },
      series: [{ name: 'kg CO₂e', data: vals }]
    };
    const chart = new ApexCharts(el, options); chart.render();
  }

  function chartEnrollments(total, completed){
    const el = document.getElementById('chart-enrollments'); if (!el) return;
    const ongoing = Math.max(number(total) - number(completed), 0);
    const options = {
      chart: { type: 'donut', height: 280, toolbar: { show: false } },
      labels: ['Completed', 'Ongoing'],
      series: [number(completed), ongoing],
      legend: { position: 'bottom' }
    };
    const chart = new ApexCharts(el, options); chart.render();
  }

  function chartCategory(items){
    const el = document.getElementById('chart-category'); if (!el) return;
    const labels = items.map(x => x.category);
    const vals = items.map(x => number(x.total));
    const options = {
      chart: { type: 'bar', height: 280, toolbar: { show: false } },
      plotOptions: { bar: { horizontal: true } },
      dataLabels: { enabled: false },
      xaxis: { categories: labels },
      series: [{ name: 'kg CO₂e', data: vals }]
    };
    const chart = new ApexCharts(el, options); chart.render();
  }

  function chartChallengeTypes(items){
    const el = document.getElementById('chart-challenge-types'); if (!el) return;
    const labels = items.map(x => x.type);
    const vals = items.map(x => number(x.count));
    const options = {
      chart: { type: 'bar', height: 280, toolbar: { show: false } },
      dataLabels: { enabled: true },
      xaxis: { categories: labels },
      series: [{ name: 'Enrollments', data: vals }]
    };
    const chart = new ApexCharts(el, options); chart.render();
  }

  async function load(){
    const days = Number($('#windowSelect')?.value || 30);
    try {
      const [{ data: usersA }, { data: overview } ] = await Promise.all([
        api(`/admin/analytics/users?days=${days}`),
        api('/admin/analytics/overview')
      ]);

      // KPIs
      setText('#kpi-users-total', number(usersA.users.total).toLocaleString());
      setText('#kpi-users-active', number(usersA.users.active).toLocaleString());
      setText('#kpi-users-participants', number(usersA.users.activeParticipants).toLocaleString());

      setText('#kpi-activities-total', number(usersA.window.totalActivities).toLocaleString());
      setText('#kpi-emissions-total', number(usersA.window.totalEmissions).toLocaleString());

      setText('#kpi-enrollments-total', number(usersA.participation.totalEnrollments).toLocaleString());
      setText('#kpi-enrollments-completed', number(usersA.participation.completedEnrollments).toLocaleString());

      // Charts
      chartActivityTrend(usersA.activityTrend || []);
      chartEmissionsTrend(usersA.emissions.dailyTotal || []);
      chartEnrollments(usersA.participation.totalEnrollments, usersA.participation.completedEnrollments);
      chartCategory(usersA.emissions.byCategory || []);
      chartChallengeTypes(usersA.participation.byType || []);

      // Tables
      const emissionsRows = (usersA.emissions.topUsers || []).map(u => `
        <tr><td>${u.username}</td><td class="text-right">${number(u.total).toFixed(1)}</td></tr>
      `);
      renderTable('tbody-top-emissions', emissionsRows);

      const xpRows = (overview?.xp?.topUsers || []).map(u => `
        <tr><td>${u.username}</td><td class="text-right">${number(u.xp).toLocaleString()}</td></tr>
      `);
      renderTable('tbody-top-xp', xpRows);
    } catch (e) {
      if (window.notify?.error) window.notify.error('Failed to load users analytics: ' + (e.message || ''));
    }
  }

  document.getElementById('refreshBtn')?.addEventListener('click', load);
  document.getElementById('windowSelect')?.addEventListener('change', load);
  document.getElementById('downloadPdfBtn')?.addEventListener('click', async () => {
    const days = Number(document.querySelector('#windowSelect')?.value || 30);
    const API_BASE = 'http://localhost:3000/api';
    const token = localStorage.getItem('token');
    try {
      const res = await fetch(`${API_BASE}/admin/analytics/users/pdf?days=${encodeURIComponent(days)}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Failed to generate PDF');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `users-analytics-${days}d.pdf`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      if (window.notify?.error) window.notify.error('Download failed');
    }
  });
  load();
})();
