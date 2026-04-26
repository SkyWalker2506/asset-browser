// Asset detail modal: focus trap (D-keep), <picture>+AVIF preview, sprite-anim
// playback for animation strips.

import { store } from './state.js';
import { fmtSize } from './util.js';

let _modalLastFocus = null;

function _trapHandler(e) {
  if (e.key !== 'Tab') return;
  const fs = e.currentTarget.querySelectorAll(
    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
  );
  if (!fs.length) return;
  const first = fs[0], last = fs[fs.length - 1];
  if (e.shiftKey && document.activeElement === first) { last.focus(); e.preventDefault(); }
  else if (!e.shiftKey && document.activeElement === last) { first.focus(); e.preventDefault(); }
}

function trapFocusOn(modalEl) {
  _modalLastFocus = document.activeElement;
  const focusables = modalEl.querySelectorAll(
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
  );
  if (focusables.length) focusables[0].focus();
  modalEl.addEventListener('keydown', _trapHandler);
}

function trapFocusOff(modalEl) {
  modalEl.removeEventListener('keydown', _trapHandler);
  if (_modalLastFocus && document.body.contains(_modalLastFocus)) _modalLastFocus.focus();
  _modalLastFocus = null;
}

// `approvedAsAssets` is imported lazily via grid.js to avoid a circular import.
import { approvedAsAssets } from './grid.js';

export function openModal(id) {
  const i = store.data.items.find(x => x.id === id) || approvedAsAssets().find(x => x.id === id);
  if (!i) return;
  let previewInner = i.avifSrc
    ? `<picture><source type="image/avif" srcset="${i.avifSrc}"><img src="${i.src}"></picture>`
    : `<img src="${i.src}">`;
  if (i.type === 'Animasyon' && i.dim) {
    const m = i.dim.match(/^(\d+)x(\d+)$/);
    const nameFrames = (i.name.match(/_(\d+)f/i) || [])[1];
    if (m) {
      const w = +m[1], h = +m[2];
      const frames = nameFrames ? +nameFrames : (w > h ? Math.round(w / h) : 1);
      if (frames > 1 && w / h === frames) {
        const size = 256, endX = -((frames - 1) * size), dur = (frames / 8).toFixed(2);
        previewInner = `
          <div style="display:flex;flex-direction:column;align-items:center;gap:12px;">
            <div style="font-size:11px;color:#8b6b3d;">Oyun içi görünüm (${frames} frame @ 8 FPS)</div>
            <div style="width:${size}px;height:${size}px;background-image:url('${i.src}');background-repeat:no-repeat;background-size:auto 100%;animation:sprite-play ${dur}s steps(${frames - 1}) infinite;--end:${endX}px;image-rendering:-webkit-optimize-contrast;"></div>
            <div style="font-size:11px;color:#8b6b3d;">Ham strip:</div>
            <img src="${i.src}" style="max-width:100%;">
          </div>`;
      }
    }
  }
  document.getElementById('box').innerHTML = `
    <div class="preview">${previewInner}</div>
    <div class="details">
      <h2>${i.name}</h2>
      <div class="row"><span class="k">Kategori</span><span>${i.category}</span></div>
      <div class="row"><span class="k">Tip</span><span>${i.type}</span></div>
      <div class="row"><span class="k">Tür</span><span>${i.kind}</span></div>
      <div class="row"><span class="k">Format</span><span>${i.ext.toUpperCase()}</span></div>
      <div class="row"><span class="k">Boyut</span><span>${i.dim || '—'}</span></div>
      <div class="row"><span class="k">Dosya</span><span>${fmtSize(i.size)}</span></div>
      <div class="row"><span class="k">Dosya adı</span><span style="word-break:break-all;">${i.file}</span></div>
      <div class="row"><span class="k">Güncellenme</span><span>${new Date(i.mtime).toLocaleDateString()}</span></div>
      <a class="dl" href="${i.src}" download="${i.file}">İndir (${i.ext.toUpperCase()})</a>
    </div>`;
  const modalEl = document.getElementById('modal');
  modalEl.setAttribute('role', 'dialog');
  modalEl.setAttribute('aria-modal', 'true');
  modalEl.setAttribute('aria-label', `${i.name} detay`);
  modalEl.classList.add('open');
  trapFocusOn(modalEl);
}

export function closeModal() {
  const modalEl = document.getElementById('modal');
  if (modalEl.classList.contains('open')) trapFocusOff(modalEl);
  modalEl.classList.remove('open');
}

export function showHelp() { document.getElementById('help-overlay').classList.add('open'); }
export function closeHelp() { document.getElementById('help-overlay').classList.remove('open'); }

// Wire up event listeners to replace inline onclick handlers (CSP compliance)
document.getElementById('modal').addEventListener('click', e => {
  if (e.target === e.currentTarget) closeModal();
});
document.querySelector('#modal .close').addEventListener('click', closeModal);
document.getElementById('help-overlay').addEventListener('click', e => {
  if (e.target === e.currentTarget) closeHelp();
});
document.querySelector('#help-overlay .panel button').addEventListener('click', closeHelp);
