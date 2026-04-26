// Upload modal: drag/drop + paste + click-to-browse with focus management.
// Counter pattern (D010) keeps the drop-zone highlight stable as children fire
// dragleave noise; paste handler is scoped to modal lifetime.

import { store } from './state.js';
import { toast, escapeHtml } from './util.js';
import { load } from './main.js';

const ACCEPT_MIME = ['image/png', 'image/webp', 'image/gif', 'image/jpeg'];
const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

// Sends one File object to /api/upload, returns the parsed response or throws.
export async function performUpload(name, file) {
  if (!ACCEPT_MIME.includes(file.type) && !/\.(png|webp|gif|jpe?g)$/i.test(file.name)) {
    throw new Error(`Desteklenmeyen format: ${file.type || file.name}`);
  }
  if (file.size > MAX_UPLOAD_BYTES) throw new Error('20MB üstü kabul edilmiyor');
  const dup = store.missing.items.find(i => i.uploadedFile === file.name && i.name !== name)
    || store.data.items.find(i => i.file === file.name);
  if (dup) {
    const proceed = confirm(`"${file.name}" zaten kullanımda (${dup.name || dup.file}). Yine de yüklensin mi?`);
    if (!proceed) throw new Error('İptal edildi');
  }
  const dataBase64 = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = () => reject(new Error('dosya okunamadı'));
    reader.readAsDataURL(file);
  });
  const r = await fetch('/api/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, filename: file.name, dataBase64 }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || 'upload failed');
  return j;
}

// Drop-zone modal lifecycle. Single `_dropCleanup` closure ensures only one
// modal is alive at a time, and that paste/keydown listeners are removed when
// the modal closes (prevents Ctrl+V leaking into search inputs — D010).
let _dropCleanup = null;

export function uploadFor(name) {
  if (_dropCleanup) _dropCleanup();
  let dropCounter = 0;
  const overlay = document.createElement('div');
  overlay.className = 'modal open';
  overlay.id = 'upload-modal';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', `${name} için dosya yükle`);
  overlay.style.zIndex = '250';
  overlay.innerHTML = `
    <div class="upload-box" tabindex="-1">
      <button class="close" aria-label="Kapat" data-close>×</button>
      <h2 style="margin:0 0 6px;color:#d4a849;font-size:18px;">Yükle: ${escapeHtml(name)}</h2>
      <p style="margin:0 0 14px;color:#8b6b3d;font-size:12px;">PNG / WebP / GIF / JPEG · max 20 MB</p>
      <div class="dropzone" id="dz" tabindex="0" role="button"
           aria-label="Dosyayı buraya sürükleyin veya gözatmak için Enter'a basın">
        <div class="dz-icon" aria-hidden="true">⤓</div>
        <div class="dz-title">Dosyayı buraya sürükleyin</div>
        <div class="dz-sub">veya yapıştırın (Ctrl+V) · ya da</div>
        <button type="button" class="dz-browse" data-browse>Gözat…</button>
        <div class="dz-hint" id="dz-hint" aria-live="polite"></div>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  const dz = overlay.querySelector('#dz');
  const hint = overlay.querySelector('#dz-hint');
  const lastFocus = document.activeElement;
  setTimeout(() => dz.focus(), 0);

  const setHint = (msg, kind) => {
    hint.textContent = msg || '';
    hint.style.color = kind === 'err' ? '#c94d4d' : kind === 'ok' ? '#7abb7a' : '#8b6b3d';
  };

  const sendFiles = async (files) => {
    const list = Array.from(files || []);
    if (!list.length) return;
    if (list.length > 1) setHint(`${list.length} dosya · sırayla yükleniyor`, '');
    let okCount = 0, failCount = 0;
    for (const f of list) {
      setHint(`Yükleniyor: ${f.name}`, '');
      try {
        await performUpload(name, f);
        okCount++;
      } catch (e) {
        failCount++;
        setHint(`Hata: ${e.message}`, 'err');
      }
    }
    if (okCount) {
      toast(okCount === 1 ? 'Yüklendi — waiting-for-review' : `${okCount} dosya yüklendi`);
      setTimeout(load, 600);
    }
    if (!failCount) cleanup();
  };

  const browse = () => {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = ACCEPT_MIME.join(',');
    inp.multiple = true;
    inp.onchange = () => sendFiles(inp.files);
    inp.click();
  };

  const onPaste = (e) => {
    if (!overlay.parentNode) return;
    const items = e.clipboardData?.files || [];
    if (items.length) { e.preventDefault(); sendFiles(items); }
  };
  const onDragEnter = (e) => {
    if (!e.dataTransfer?.types?.includes('Files')) return;
    e.preventDefault();
    dropCounter++;
    dz.classList.add('over');
  };
  const onDragOver = (e) => {
    if (!e.dataTransfer?.types?.includes('Files')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };
  const onDragLeave = () => {
    dropCounter = Math.max(0, dropCounter - 1);
    if (dropCounter === 0) dz.classList.remove('over');
  };
  const onDrop = (e) => {
    e.preventDefault();
    dropCounter = 0;
    dz.classList.remove('over');
    sendFiles(e.dataTransfer?.files);
  };
  const onKey = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); cleanup(); return; }
    if ((e.key === 'Enter' || e.key === ' ') && document.activeElement === dz) {
      e.preventDefault(); browse();
    }
  };
  const onClick = (e) => {
    if (e.target.matches('[data-close]') || e.target === overlay) cleanup();
    else if (e.target.matches('[data-browse]')) browse();
    else if (e.target.closest('#dz') && !e.target.matches('[data-browse]')) browse();
  };

  dz.addEventListener('dragenter', onDragEnter);
  dz.addEventListener('dragover', onDragOver);
  dz.addEventListener('dragleave', onDragLeave);
  dz.addEventListener('drop', onDrop);
  overlay.addEventListener('click', onClick);
  document.addEventListener('keydown', onKey);
  document.addEventListener('paste', onPaste);

  function cleanup() {
    document.removeEventListener('keydown', onKey);
    document.removeEventListener('paste', onPaste);
    overlay.remove();
    dropCounter = 0;
    _dropCleanup = null;
    if (lastFocus && document.body.contains(lastFocus)) lastFocus.focus();
  }
  _dropCleanup = cleanup;
}
