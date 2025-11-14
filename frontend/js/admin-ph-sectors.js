(function(){
  const API = 'http://localhost:3000/api/admin/ph-sector-estimates';

  let charts = {};

  // Keep a local mirror of the backend fixed activity order to reference row numbers
  const FIXED_ORDER = [
    { id: 'agriculture_fishing_forestry-type_support_activities_for_agriculture_and_forestry', label: 'Agriculture support activities' },
    { id: 'arable_farming-type_fruit_and_tree_nut_farming', label: 'Fruit & tree nut farming' },
    { id: 'building_materials-type_cement_production', label: 'Cement production' },
    { id: 'consumer_goods_rental-type_general_and_consumer_goods_rental', label: 'Consumer goods rental' },
    { id: 'electrical_equipment-type_all_other_miscellaneous_electrical_equipment_and_component', label: 'Electrical equipment (misc)' },
    { id: 'electricity-supply_grid-source_production_mix', label: 'Grid electricity mix' },
    { id: 'metal_products-type_all_other_forging_stamping_sintering', label: 'Metal products (forging/stamping)' },
    { id: 'fishing_aquaculture-type_fishing_hunting_and_trapping', label: 'Fishing, hunting & trapping' },
    { id: 'consumer_services-type_all_other_food_drinking_places', label: 'Food & drinking places' },
    { id: 'fuel-type_coal_mining-fuel_use_na', label: 'Coal mining (fuel use)' },
    { id: 'fuel-type_other_petroleum_and_coal_products_manufacturing-fuel_use_na', label: 'Other petroleum/coal (fuel use)' }
  ];

  function el(id){ return document.getElementById(id); }

  function mkChart(elId, seriesName, labels, data){
    if (charts[elId]) { try{ charts[elId].destroy(); }catch(_){} }
    const node = document.querySelector('#' + elId);
    if (!labels.length){ node.innerHTML = '<div class="flex items-center justify-center h-80 text-sm text-base-content/60">No data available.</div>'; return; }
    const options = {
      chart: { type: 'bar', height: '100%', toolbar: { show: false } },
      series: [{ name: seriesName, data }],
      xaxis: { labels: { style: { colors: '#6b7280' } } },
      yaxis: {
        categories: labels,
        labels: {
          style: { colors: '#6b7280', fontSize: '11px' },
          formatter: (val) => typeof val === 'string' && val.length > 36 ? val.slice(0,36) + '…' : val
        }
      },
      plotOptions: { bar: { borderRadius: 6, barHeight: '70%', horizontal: true } },
      dataLabels: { enabled: false },
      colors: ['#22c55e'],
      grid: { borderColor: 'rgba(156,163,175,0.08)', padding: { top: 8, right: 8, bottom: 8, left: 160 } },
      tooltip: {
        x: { formatter: (val, opts) => (opts?.globals?.labels?.[opts?.dataPointIndex]) || val },
        y: { formatter: v => `${Number(v).toFixed(2)} kg CO₂e` }
      }
    };
    charts[elId] = new ApexCharts(node, options);
    charts[elId].render();
  }

  async function load(){
    const token = localStorage.getItem('token');
    if (!token) { window.location.href = '../../login.html'; return; }
    try {
      const amount = Number(el('amountInput')?.value || 500) || 500;
      const unit = (el('unitSelect')?.value || 'usd');
      const res = await fetch(`${API}?money=${encodeURIComponent(amount)}&unit=${encodeURIComponent(unit)}`, { headers: { Authorization: `Bearer ${token}` } });
      const payload = await res.json();
      if (!res.ok || payload.status !== 'success') throw new Error(payload.message || 'Failed');
      const list = payload.data.items || [];
      const missing = payload.data.missingActivities || [];
      const alertBox = document.getElementById('missingAlert');
      const alertText = document.getElementById('missingText');
      if (missing.length && alertBox && alertText) {
        const byId = new Map(FIXED_ORDER.map((x, i) => [x.id, { idx: i + 1, label: x.label || x.id }]));
        const decorated = missing.map(id => {
          const m = byId.get(id);
          return m ? `#${m.idx} ${m.label}` : id;
        });
        alertText.textContent = `No current Climatiq factor for: ${decorated.join(', ')}. These activities are excluded.`;
        alertBox.classList.remove('hidden');
      } else if (alertBox) {
        alertBox.classList.add('hidden');
      }

      const labels = list.map(x => x.label || x.id);
      const values = list.map(x => Number(x.co2e || 0));
      mkChart('sectorChart', 'kg CO₂e', labels, values);

      const tbody = el('sectorTableBody');
      if (!list.length){
        tbody.innerHTML = '<tr><td colspan="4" class="text-center text-base-content/60">No data</td></tr>';
      } else {
        tbody.innerHTML = list
          .map((x, i) => (
          `<tr>
            <td>${i+1}</td>
            <td title="${x.id}">${x.label || x.id}</td>
            <td>${Number(x.co2e||0).toFixed(2)}</td>
            <td>${x.co2e_unit || 'kg'}</td>
          </tr>`)).join('');
      }
    } catch (e) {
      console.error('Sector stats load error', e);
      document.querySelector('#sectorChart').innerHTML = '<div class="flex items-center justify-center h-80 text-sm text-error">Failed to load</div>';
      el('sectorTableBody').innerHTML = '<tr><td colspan="4" class="text-center text-error">Failed to load</td></tr>';
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    load();
    const btn = document.getElementById('btnRefresh');
    if (btn) btn.addEventListener('click', load);
    const unitSel = document.getElementById('unitSelect');
    if (unitSel) unitSel.addEventListener('change', load);
    const amountInp = document.getElementById('amountInput');
    if (amountInp) amountInp.addEventListener('change', load);

    const dl = document.getElementById('downloadPdfBtn');
    if (dl) dl.addEventListener('click', async () => {
      const token = localStorage.getItem('token');
      const amount = Number(el('amountInput')?.value || 500) || 500;
      const unit = (el('unitSelect')?.value || 'usd');
      try {
        const res = await fetch(`http://localhost:3000/api/admin/ph-sector-estimates/pdf?money=${encodeURIComponent(amount)}&unit=${encodeURIComponent(unit)}` , {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (!res.ok) throw new Error('Failed to generate PDF');
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = 'ph-sector-estimates.pdf';
        document.body.appendChild(a); a.click(); a.remove();
        URL.revokeObjectURL(url);
      } catch (e) {
        if (window.notify?.error) window.notify.error('Download failed');
      }
    });
  });
})();
