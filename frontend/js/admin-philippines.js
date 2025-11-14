document.addEventListener('DOMContentLoaded', () => {
  const container = document.getElementById('philippinesChart');
  const refreshBtn = document.getElementById('phRefreshBtn');
  const metricSelect = document.getElementById('phMetricSelect');
  const noteEl = document.getElementById('philippinesChartNote');

  if (!container) return;

  async function loadPhilippinesData() {
    container.innerHTML = '';
    noteEl.textContent = 'Loading...';

    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/admin/emission-factors', { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error('Failed to load emission factors');
      const payload = await res.json();
      const rows = Array.isArray(payload.data) ? payload.data : [];

      // Filter for Philippines: match region or activity text
      const phRows = rows.filter(r => {
        const region = String(r.region || '').toLowerCase();
        const activity = String(r.activity_type || r.activity || '').toLowerCase();
        return region.includes('ph') || region.includes('philipp') || activity.includes('philipp');
      });

      // If none found, try filtering by country code 'PH' or tag, else fallback to nearby entries (none) — we'll fallback to global factors
      const dataset = (phRows.length ? phRows : rows.filter(r => r.region === 'global' || r.region === 'Global' || (r.region||'').length === 0));

      if (!dataset.length) {
        noteEl.textContent = 'No emission factors available for Philippines or global fallback.';
        renderEmpty();
        return;
      }

      // Build aggregation: pick top activities by co2e_per_unit
      const items = dataset
        .map(r => ({ label: r.activity_type || r.activity || 'unknown', co2e: Number(r.co2e_per_unit || r.co2e_per_unit || 0) }))
        .filter(i => i.co2e > 0)
        .sort((a,b) => b.co2e - a.co2e)
        .slice(0, 12);

      if (!items.length) {
        noteEl.textContent = 'No numeric CO₂e values available for the selected region.';
        renderEmpty();
        return;
      }

      noteEl.textContent = `Showing top ${items.length} activities by CO₂e per unit for ${phRows.length ? 'Philippines' : 'global fallback'}.`;

      renderChart(items);
    } catch (e) {
      console.error('Failed to load Philippines data', e);
      noteEl.textContent = 'Failed to load data.';
      renderEmpty();
    }
  }

  function renderEmpty() {
    container.innerHTML = '<div class="flex items-center justify-center h-full text-sm text-muted">No data to display</div>';
  }

  let chart = null;
  async function renderChart(items) {
    // destroy existing
    if (chart && typeof chart.destroy === 'function') {
      try { await chart.destroy(); } catch (_) {}
      chart = null;
    }

    const labels = items.map(i => i.label);
    const values = items.map(i => i.co2e);

    const options = {
      chart: { type: 'bar', height: '100%', toolbar: { show: false } },
      series: [{ name: 'CO₂e per unit (kg)', data: values }],
      xaxis: { categories: labels, labels: { rotate: -45, hideOverlappingLabels: true, style: { colors: '#6b7280' } } },
      yaxis: { labels: { style: { colors: '#6b7280' } }, min: 0 },
      plotOptions: { bar: { borderRadius: 6, columnWidth: '40%' } },
      dataLabels: { enabled: false },
      colors: ['#16a34a'],
      tooltip: { y: { formatter: v => `${Number(v).toFixed(3)} kg CO₂e` } },
      grid: { borderColor: 'rgba(156,163,175,0.08)' }
    };

    chart = new ApexCharts(container, options);
    await chart.render();
  }

  // Wire controls
  if (refreshBtn) refreshBtn.addEventListener('click', loadPhilippinesData);
  if (metricSelect) metricSelect.addEventListener('change', () => loadPhilippinesData());

  // Initial load
  loadPhilippinesData();
});
