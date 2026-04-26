// Stats panel renderer. Reads `store` for current tab + missing.json snapshot,
// builds bar charts from category/kind/type/status counts, and a queue
// summary line for missing/waiting/approved/trash.

import { store } from './state.js';
import { escapeHtml } from './util.js';
import { itemsForTab } from './grid.js';

function buildBarRows(map) {
  const entries = Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 6);
  if (!entries.length) return '<div style="font-size:11px;color:#5c4428;">veri yok</div>';
  const max = Math.max(...entries.map(e => e[1])) || 1;
  return entries.map(([k, v]) => {
    const pct = Math.round((v / max) * 100);
    return `<div class="stat-row"><span class="label" title="${escapeHtml(k)}">${escapeHtml(k)}</span><span class="bar"><span class="bar-fill" style="width:${pct}%"></span></span><span class="count">${v}</span></div>`;
  }).join('');
}

export function renderStats(filteredCount) {
  const grid = document.getElementById('stats-grid');
  const summary = document.getElementById('stats-summary');
  if (!grid) return;
  const tabItems = itemsForTab();
  const total = tabItems.length;
  const visible = filteredCount == null ? total : filteredCount;
  const catMap = {}, kindMap = {}, typeMap = {};
  for (const i of tabItems) {
    const c = i.category || i.kind || '—';
    catMap[c] = (catMap[c] || 0) + 1;
    if (i.kind) kindMap[i.kind] = (kindMap[i.kind] || 0) + 1;
    if (i.type) typeMap[i.type] = (typeMap[i.type] || 0) + 1;
  }
  const statusMap = {};
  for (const i of (store.missing.items || [])) {
    statusMap[i.status || 'todo'] = (statusMap[i.status || 'todo'] || 0) + 1;
  }
  const missingCount = (store.missing.items || []).filter(i => i.status === 'todo' || i.status === 'in-progress').length;
  const waitingCount = (store.missing.items || []).filter(i => i.status === 'waiting-for-review').length;
  const approvedCount = (store.missing.items || []).filter(i => i.status === 'approved').length;

  grid.innerHTML = `
    <div class="stat-card">
      <h4>Toplam (${store.tab})</h4>
      <div class="total">${total}</div>
      <div class="dz-sub" style="margin:6px 0 0;">filtreli: <b style="color:#c9b889;">${visible}</b></div>
    </div>
    <div class="stat-card">
      <h4>Kategori</h4>
      <div class="stat-bars">${buildBarRows(catMap)}</div>
    </div>
    <div class="stat-card">
      <h4>Kind</h4>
      <div class="stat-bars">${buildBarRows(kindMap)}</div>
    </div>
    <div class="stat-card">
      <h4>Tip</h4>
      <div class="stat-bars">${buildBarRows(typeMap)}</div>
    </div>
    <div class="stat-card">
      <h4>Workflow durumu</h4>
      <div class="stat-bars">${buildBarRows(statusMap)}</div>
    </div>
    <div class="stat-card">
      <h4>Kuyruklar</h4>
      <div class="stat-row"><span class="label">Eksik</span><span class="bar"><span class="bar-fill" style="width:${Math.min(100, missingCount * 5)}%"></span></span><span class="count">${missingCount}</span></div>
      <div class="stat-row"><span class="label">Bekleyen</span><span class="bar"><span class="bar-fill" style="width:${Math.min(100, waitingCount * 8)}%;background:linear-gradient(90deg,#7a6a1f,#d4a849);"></span></span><span class="count">${waitingCount}</span></div>
      <div class="stat-row"><span class="label">Onaylı</span><span class="bar"><span class="bar-fill" style="width:${Math.min(100, approvedCount * 4)}%;background:linear-gradient(90deg,#2a5a2a,#7abb7a);"></span></span><span class="count">${approvedCount}</span></div>
      <div class="stat-row"><span class="label">Çöp</span><span class="bar"><span class="bar-fill" style="width:${Math.min(100, store.trashCountCache * 4)}%;background:linear-gradient(90deg,#4d1f1f,#c94d4d);"></span></span><span class="count">${store.trashCountCache}</span></div>
    </div>`;
  if (summary) summary.textContent = `${visible}/${total} görünen · ${missingCount} eksik · ${waitingCount} bekleyen`;
}
