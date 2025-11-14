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

  // Helpers
  const $ = (sel, root=document) => root.querySelector(sel);
  const setText = (sel, val) => { const el = $(sel); if (el) el.textContent = val; };

  function renderTopXP(list){
    const tbody = document.getElementById('tbody-top-xp');
    if (!tbody) return;
    if (!list || !list.length) {
      tbody.innerHTML = '<tr><td colspan="2" class="text-center text-base-content/60">No data</td></tr>';
      return;
    }
    tbody.innerHTML = list.map(u => `
      <tr>
        <td>${u.username}</td>
        <td class="text-right">${Number(u.xp).toLocaleString()}</td>
      </tr>
    `).join('');
  }

  function chartEmissionsTrend(series){
    const el = document.getElementById('chart-emissions-trend');
    if (!el) return;
    const dates = series.map(p => p.day);
    const values = series.map(p => Number(p.total || 0));
    const options = {
      chart: { type: 'area', height: 280, toolbar: { show: false } },
      dataLabels: { enabled: false },
      stroke: { curve: 'smooth', width: 2 },
      xaxis: { categories: dates, labels: { rotate: -45 } },
      yaxis: { labels: { formatter: v => v.toFixed(1) } },
      fill: { type: 'gradient', gradient: { shadeIntensity: 1, opacityFrom: 0.5, opacityTo: 0.1 } },
      series: [{ name: 'kg CO2e', data: values }]
    };
    const chart = new ApexCharts(el, options); chart.render();
  }

  function chartCategoryBreakdown(items){
    const el = document.getElementById('chart-category');
    if (!el) return;
    const labels = items.map(x => x.category);
    const vals = items.map(x => Number(x.total || 0));
    const options = {
      chart: { type: 'bar', height: 280, toolbar: { show: false } },
      plotOptions: { bar: { horizontal: true } },
      dataLabels: { enabled: false },
      xaxis: { categories: labels },
      series: [{ name: 'kg CO2e', data: vals }]
    };
    const chart = new ApexCharts(el, options); chart.render();
  }

  function chartCountries(items){
    const el = document.getElementById('chart-countries');
    if (!el) return;
    const labels = items.map(x => x.country || 'Unknown');
    const vals = items.map(x => Number(x.count || 0));
    const options = {
      chart: { type: 'donut', height: 280, toolbar: { show: false } },
      labels,
      series: vals,
      legend: { position: 'bottom' }
    };
    const chart = new ApexCharts(el, options); chart.render();
  }

  function chartChallenges(total, completed){
    const el = document.getElementById('chart-challenges');
    if (!el) return;
    const ongoing = Math.max(total - completed, 0);
    const options = {
      chart: { type: 'donut', height: 280, toolbar: { show: false } },
      labels: ['Completed', 'Ongoing'],
      series: [completed, ongoing],
      legend: { position: 'bottom' }
    };
    const chart = new ApexCharts(el, options); chart.render();
  }

  async function load(){
    try {
      const { data } = await api('/admin/analytics/overview');
      // KPIs
      setText('#kpi-total-users', Number(data.users.totalUsers || 0).toLocaleString());
      setText('#kpi-active-users', Number(data.users.activeUsers || 0).toLocaleString());

      setText('#kpi-total-scenarios', Number(data.scenarios.totalScenarios || 0).toLocaleString());
      setText('#kpi-active-scenarios', Number(data.scenarios.activeScenarios || 0).toLocaleString());

      setText('#kpi-total-challenges', Number(data.challenges.totalChallenges || 0).toLocaleString());
      setText('#kpi-active-challenges', Number(data.challenges.activeChallenges || 0).toLocaleString());

      setText('#kpi-total-xp', Number(data.xp.totalXP || 0).toLocaleString());

      // Stats
      setText('#stat-avg-household', (Number(data.profiles.avgHousehold || 0)).toFixed(1));
      setText('#stat-baselines', Number(data.profiles.baselineCalculated || 0).toLocaleString());

      // Charts
      chartEmissionsTrend(data.scenarios.emissionsTrend || []);
      chartCategoryBreakdown(data.scenarios.emissionsByCategory || []);
      chartCountries(data.profiles.countries || []);
      chartChallenges(Number(data.challenges.totalEnrollments || 0), Number(data.challenges.completedEnrollments || 0));

      // Table
      renderTopXP(data.xp.topUsers || []);
    } catch (e) {
      if (window.notify?.error) window.notify.error('Failed to load analytics: ' + (e.message || ''));
    }
  }

  document.getElementById('refreshBtn')?.addEventListener('click', load);
  // Download PDF handler
  document.getElementById('downloadPdfBtn')?.addEventListener('click', async () => {
    try {
      const res = await fetch(`${API_BASE}/admin/analytics/overview/pdf`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Failed to generate PDF');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'analytics-overview.pdf';
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      if (window.notify?.error) window.notify.error('Download failed');
    }
  });
  load();
})();
