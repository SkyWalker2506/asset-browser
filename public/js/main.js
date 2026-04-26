// Application entrypoint. Wires modules, loads initial data, and exposes
// the inline-onclick API surface (window.openModal etc.) used by render
// templates that emit `onclick="foo(...)"` strings.

import { store, setSortMode, selection } from './state.js';
import { escapeHtml, fmtSize, toast } from './util.js';
import {
  fetchJson,
  getAdminToken,
  setAdminToken,
  clearAdminToken,
  refreshAdminBadge,
} from './api.js';
import {
  render,
  buildChips,
  buildCatSelect,
  renderSavedFilters,
  saveCurrentAsFilter,
  applySavedFilter,
  removeSavedFilter,
  refreshSelectionUI,
  updateMeta,
  updateTabVisibility,
  approvedAsAssets,
} from './grid.js';
import { openModal, closeModal, closeHelp } from './modal.js';
import { uploadFor } from './upload.js';
import {
  copyPrompt,
  reviewAction,
  deleteAsset,
  unapproveAsset,
  deleteUpload,
  clearEntry,
  jumpToAsset,
  restoreTrash,
  purgeTrash,
  updateUndoButton,
  undoLastAction,
} from './actions.js';
import {
  bulkDelete,
  bulkRestore,
  bulkClear,
  clearSelection,
  toggleSelection,
} from './selection.js';
import { installKeyboard } from './keyboard.js';
import { loadLocale, getLang, applyDom, setLang, t } from './i18n.js';
import { registerSW, initOnlineStatus } from './pwa.js';

let _srTimer;
export function srStatus(msg) {
  clearTimeout(_srTimer);
  _srTimer = setTimeout(() => {
    const el = document.getElementById('sr-status');
    if (el) el.textContent = msg;
  }, 200);
}

// --- Boot
export async function load() {
  const lang = getLang();
  await loadLocale(lang);
  applyDom();
  document.documentElement.lang = lang;
  updateLangSwitcherUI(lang);
  registerSW();
  initOnlineStatus();

  document.getElementById('meta').textContent = t('status.loading');
  const [r, m, c] = await Promise.all([
    fetch('./manifest.json?' + Date.now()).then(x => x.json()),
    fetchJson('/api/missing').catch(() => fetch('./missing.json').then(x => x.json())).catch(() => ({ items: [] })),
    fetch('./config.json').then(x => x.json()).catch(() => null),
  ]);
  store.data = r;
  store.missing = m;
  store.config = c;
  updateTabVisibility();
  refreshAdminBadge();
  // Public trash count probe — also feeds stats panel queue badge.
  fetchJson('/api/trash').then(t => {
    const count = (t.files || []).filter(f => !f.name.endsWith('.meta.json')).length;
    store.trashCountCache = count;
    const trashTab = document.getElementById('trash-tab');
    trashTab.style.display = (count || getAdminToken()) ? '' : 'none';
    if (document.getElementById('stats-panel')?.open) {
      import('./stats.js').then(({ renderStats }) => renderStats());
    }
  }).catch(() => {});
  updateMeta();
  buildChips();
  buildCatSelect();
  renderSavedFilters();
  render();
}

export async function loadTrash() {
  const token = getAdminToken();
  const isAdmin = !!token;
  try {
    const r = await fetch('/api/trash' + (token ? '?admin=' + encodeURIComponent(token) : ''), {
      headers: token ? { 'X-Admin-Token': token } : {},
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error);
    const g = document.getElementById('grid');
    const visibleFiles = j.files.filter(f => !f.name.endsWith('.meta.json'));
    if (!visibleFiles.length) { g.innerHTML = `<div class="empty" data-i18n="status.empty_trash">${t('status.empty_trash')}</div>`; return; }
    g.innerHTML = visibleFiles.map(f => `
      <div class="miss" id="trash-${escapeHtml(f.name)}" data-name="${escapeHtml(f.name)}" tabindex="-1">
        <span class="select-checkbox" role="checkbox" aria-label="${t('actions.select')}" tabindex="0"></span>
        <h3>${f.name}</h3>
        <div class="notes">${fmtSize(f.size)}</div>
        <div class="actions">
          <button class="btn primary" onclick="restoreTrash(${JSON.stringify(f.name).replace(/"/g, '&quot;')})" data-i18n="actions.restore">${t('actions.restore')}</button>
          ${isAdmin ? `<button class="btn danger" onclick="purgeTrash(${JSON.stringify(f.name).replace(/"/g, '&quot;')})" data-i18n="actions.delete">${t('actions.delete')}</button>` : ''}
        </div>
      </div>`).join('');
    refreshSelectionUI();
  } catch (e) { toast('Trash: ' + e.message, 'err'); }
}

function updateLangSwitcherUI(lang) {
  document.querySelectorAll('.lang-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.lang === lang);
  });
}

window.addEventListener('i18n:change', e => {
  updateLangSwitcherUI(e.detail);
  updateMeta();
  render();
});

// Lang switcher click
document.getElementById('lang-switcher').addEventListener('click', e => {
  const btn = e.target.closest('.lang-btn');
  if (btn) setLang(btn.dataset.lang);
});

// --- Wire DOM events. We do this once on module load (DOM is parsed before
// the deferred `<script type="module">` executes).

// Tabs
document.querySelectorAll('.tab').forEach(t => t.onclick = () => {
  document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
  t.classList.add('active');
  store.tab = t.dataset.tab;
  const statsPanel = document.getElementById('stats-panel');
  if (statsPanel) statsPanel.style.display = (store.tab === 'trash') ? 'none' : '';
  if (store.tab === 'trash') { loadTrash(); return; }
  const inMissing = store.tab !== 'have';
  document.querySelectorAll('.controls select').forEach(el => {
    el.style.display = (inMissing && el.id !== 'type') ? 'none' : '';
  });
  document.getElementById('chips').style.display = inMissing ? 'none' : '';
  updateMeta();
  render();
});

// Filter/Sort inputs delegation
document.body.addEventListener('input', e => {
  if (e.target.id === 'q') {
    store.filter.q = e.target.value;
    render();
    setTimeout(() => {
      const count = document.querySelectorAll('#grid .card, #grid .miss').length;
      srStatus(t('sr.filter_count', { count }));
    }, 50);
  }
});
document.body.addEventListener('change', e => {
  const id = e.target.id;
  let changed = false;
  if (id === 'cat') { store.filter.cat = e.target.value; changed = true; }
  else if (id === 'ext') { store.filter.ext = e.target.value; changed = true; }
  else if (id === 'type') { store.filter.type = e.target.value; changed = true; }
  else if (id === 'sort') { setSortMode(e.target.value); changed = true; }
  
  if (changed) {
    render();
    setTimeout(() => {
      const count = document.querySelectorAll('#grid .card, #grid .miss').length;
      srStatus(t('sr.filter_count', { count }));
    }, 50);
  }
});

// Initial sort value
document.getElementById('sort').value = store.sortMode;

// Action delegation (Bulk actions + Save filter)
const actionMap = {
  'save-filter': () => saveCurrentAsFilter(),
  'bulk-cancel': clearSelection,
  'bulk-delete': async () => { await bulkDelete(); srStatus(t('sr.delete_done')); },
  'bulk-restore': bulkRestore,
  'bulk-clear': bulkClear,
};

document.body.addEventListener('click', e => {
  const btn = e.target.closest('[data-action]');
  if (btn && actionMap[btn.dataset.action]) {
    actionMap[btn.dataset.action]();
  }
});

// Card click → toggle selection (with shift for range) when in selection mode.
// Single click without selection mode opens the modal (via the `<div class=thumb>`'s onclick).
document.getElementById('grid').addEventListener('click', e => {
  const card = e.target.closest('.card, .miss');
  if (!card) return;
  const checkbox = e.target.closest('.select-checkbox');
  if (checkbox) {
    e.preventDefault(); e.stopPropagation();
    toggleSelection(card, { shift: e.shiftKey });
    srStatus(t('sr.selection_count', { count: selection.size }));
    return;
  }
  if (e.shiftKey && selection.size > 0) {
    e.preventDefault(); e.stopPropagation();
    toggleSelection(card, { shift: true });
    srStatus(t('sr.selection_count', { count: selection.size }));
  }
}, true);

// Ctrl+Shift+T → admin token prompt
document.addEventListener('keydown', e => {
  if (e.ctrlKey && e.shiftKey && e.key === 'T') {
    e.preventDefault();
    const tr = getLang() === 'tr';
    const tPrompt = tr ? 'Admin token (boş bırakırsan çıkış):' : 'Admin token (empty to logout):';
    const tConfirm = tr ? 'Tarayıcı kapanınca da hatırlansın mı? (İptal = sadece bu sekme)' : 'Remember even after browser close? (Cancel = session only)';
    const token = prompt(tPrompt);
    if (token) {
      const remember = confirm(tConfirm);
      setAdminToken(token, remember);
      document.getElementById('trash-tab').style.display = '';
      refreshAdminBadge();
      const msg = t('status.admin_active') + (remember ? (tr ? ' (kalıcı)' : ' (persistent)') : (tr ? ' (oturum)' : ' (session)'));
      toast(msg);
    } else {
      clearAdminToken();
      document.getElementById('trash-tab').style.display = 'none';
      refreshAdminBadge();
      toast(t('status.admin_inactive'));
    }
  }
});

// Admin badge click → quick logout
document.getElementById('admin-badge').addEventListener('click', () => {
  const tr = getLang() === 'tr';
  const tConfirm = tr ? 'Admin moddan çıkılsın mı?' : 'Logout from admin mode?';
  if (confirm(tConfirm)) {
    clearAdminToken();
    document.getElementById('trash-tab').style.display = 'none';
    refreshAdminBadge();
    toast(t('status.admin_inactive'));
  }
});

// Keyboard chords (j/k, g h/t/w/d, d d, ?, /, x, Enter, Esc, Ctrl+A)
installKeyboard();

// Undo button auto-fade tick
setInterval(updateUndoButton, 1000);

// --- Expose inline-handler API surface. Render templates emit
// `onclick="reviewAction('foo','approve')"` so these need to be window-scoped.
// Modules stay private (not on window); only this list is the contract.
Object.assign(window, {
  // modal
  openModal, closeModal, closeHelp,
  // saved filters
  saveCurrentAsFilter, applySavedFilter, removeSavedFilter,
  // per-item
  copyPrompt, uploadFor, reviewAction, deleteUpload,
  jumpToAsset, clearEntry, unapproveAsset, deleteAsset,
  restoreTrash, purgeTrash,
  // undo
  undoLastAction,
});

// --- Kick off
load();
