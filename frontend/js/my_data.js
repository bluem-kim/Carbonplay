(function(){
  async function loadMyReport(){
    const container = document.getElementById('myReport');
    const weeklyEl = document.getElementById('reportWeekly');
    const allEl = document.getElementById('reportAll');
    const countsEl = document.getElementById('reportCounts');
    const weekTable = document.getElementById('reportWeekTable');
    const allTable = document.getElementById('reportAllTable');
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        if (container) container.innerHTML = '<div class="alert alert-warning">Please log in to view your data.</div>';
        return;
      }
      const res = await fetch('http://localhost:3000/api/me/report', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok || data.status !== 'success') throw new Error(data.message || 'Failed');
      const d = data.data;
      if (weeklyEl) weeklyEl.textContent = `${Number(d.weekly_total).toFixed(1)} kg CO₂e`;
      if (allEl) allEl.textContent = `${Number(d.all_time_total).toFixed(1)} kg CO₂e`;
      if (countsEl) countsEl.textContent = `${d.counts.scenarios} scenarios • ${d.counts.activities} activities`;

      const toRow = (c) => `<tr><td>${capitalize(c.category)}</td><td class="text-right">${Number(c.total).toFixed(1)} kg</td></tr>`;
      if (weekTable) weekTable.innerHTML = (d.categories_week?.length ? d.categories_week : [{category:'—',total:0}]).map(toRow).join('');
      if (allTable) allTable.innerHTML = (d.categories_all?.length ? d.categories_all : [{category:'—',total:0}]).map(toRow).join('');
    } catch (e) {
      if (container) container.innerHTML = '<div class="alert alert-error">Failed to load report.</div>';
    }
  }

  async function downloadMyReportPdf(){
    const btn = document.getElementById('downloadPdfBtn');
    try {
      if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Preparing...'; }
      const token = localStorage.getItem('token');
      const res = await fetch('http://localhost:3000/api/me/report/pdf', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Download failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'CarbonPlay_MyReport.pdf';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (_) {
      alert('Unable to download PDF right now.');
    }
    finally {
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-download mr-2"></i> Download PDF'; }
    }
  }

  function capitalize(s){ return String(s||'').replace(/_/g,' ').replace(/\b\w/g, m=>m.toUpperCase()); }

  // Expose
  window.downloadMyReportPdf = downloadMyReportPdf;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadMyReport);
  } else {
    loadMyReport();
  }
})();
