import { state } from './state.js';
import { esc, toast, trapFocus } from './utils.js';
import { computeMaxClusters } from './ui.js';
import { bindPhotonSearch, photonFeatureToAddress } from './photon.js';

let releaseAddrTrap = null;

/**
 * Show address management modal.
 * @param {Object} modalState - { stagedAddresses, importMode, setImportMode, renderPreview }
 */
export function showAddrModal(modalState) {
  const modal = document.getElementById('addrModal');
  modal.classList.add('show');
  releaseAddrTrap = trapFocus(modal);

  modalState.stagedAddresses.length = 0; // Clear staged
  modalState.renderPreview();

  const hasExisting = state.SPOTS.length > 0;
  document.getElementById('addrModeToggle').style.display = hasExisting ? 'flex' : 'none';
  modalState.setImportMode(hasExisting ? 'append' : 'replace');

  // Clear form fields
  document.getElementById('addrPasteArea').value = '';
  document.getElementById('addrManualSearch').value = '';
  document.getElementById('addrManualStreet').value = '';
  document.getElementById('addrManualCity').value = '';
  document.getElementById('addrManualState').value = '';
  document.getElementById('addrManualZip').value = '';
  document.getElementById('addrAcList').classList.remove('show');

  // Reset to import tab
  document.querySelectorAll('.addr-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.addr-section').forEach(s => s.classList.remove('active'));
  document.querySelector('.addr-tab[data-tab="import"]').classList.add('active');
  document.getElementById('addrImportSection').classList.add('active');
}

/**
 * Hide address management modal.
 * @param {Object} modalState - { stagedAddresses, renderPreview }
 */
export function hideAddrModal(modalState) {
  document.getElementById('addrModal').classList.remove('show');
  if (releaseAddrTrap) { releaseAddrTrap(); releaseAddrTrap = null; }
  modalState.stagedAddresses.length = 0;
  modalState.renderPreview();
}

/**
 * Render address preview list with status indicators.
 * @param {Array} stagedAddresses - Staged address objects
 */
export function renderAddrPreview(stagedAddresses) {
  const el = document.getElementById('addrPreview');
  const btn = document.getElementById('addrConfirmBtn');
  const count = document.getElementById('addrFooterCount');

  if (!stagedAddresses.length) {
    el.style.display = 'none';
    btn.disabled = true;
    count.textContent = '0 addresses staged';
    return;
  }

  el.style.display = 'block';
  btn.disabled = false;
  const geocoded = stagedAddresses.filter(a => a.status === 'ok').length;
  count.textContent = `${stagedAddresses.length} addresses staged${geocoded ? ` (${geocoded} geocoded)` : ''}`;

  el.innerHTML = '';
  stagedAddresses.forEach((addr, i) => {
    const item = document.createElement('div');
    item.className = 'addr-preview-item';
    const statusClass = addr.status === 'ok' ? 'ok' : addr.status === 'error' ? 'error' : 'pending';
    const statusText = addr.status === 'ok' ? '&#10003;' : addr.status === 'error' ? '&#10007;' : '&#8987;';
    item.innerHTML = `
      <span class="addr-preview-num">${i + 1}</span>
      <span class="addr-preview-text">${esc(addr.street)}${addr.city ? ', ' + esc(addr.city) : ''}${addr.state ? ', ' + esc(addr.state) : ''}${addr.zip ? ' ' + esc(addr.zip) : ''}</span>
      <span class="addr-preview-status ${statusClass}">${statusText}</span>
      <button class="addr-preview-remove" data-idx="${i}">&times;</button>`;
    item.querySelector('.addr-preview-remove').onclick = () => {
      stagedAddresses.splice(i, 1);
      stagedAddresses.forEach((a, j) => a.id = j + 1);
      renderAddrPreview(stagedAddresses);
    };
    el.appendChild(item);
  });
}

/**
 * Setup Photon autocomplete for address input.
 * @param {HTMLElement} inputEl - Input element
 * @param {HTMLElement} listEl - Dropdown list element
 * @param {Object} onSelect - { pick: fn, onEnter: fn }
 */
export function setupAutocomplete(inputEl, listEl, onSelect) {
  let activeIdx = -1, results = [];

  bindPhotonSearch(inputEl, (features) => {
    results = features;
    activeIdx = -1;
    if (results.length) { listEl.classList.add('show'); renderList(); }
    else listEl.classList.remove('show');
  });

  inputEl.addEventListener('keydown', e => {
    if (!listEl.classList.contains('show')) {
      if (e.key === 'Enter' && onSelect.onEnter) { e.preventDefault(); onSelect.onEnter(); return; }
      return;
    }
    if (e.key === 'ArrowDown') { e.preventDefault(); activeIdx = Math.min(activeIdx + 1, results.length - 1); renderList(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); activeIdx = Math.max(activeIdx - 1, 0); renderList(); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      if (activeIdx >= 0 && results[activeIdx]) pick(results[activeIdx]);
      else if (results.length) pick(results[0]);
    } else if (e.key === 'Escape') { listEl.classList.remove('show'); }
  });

  inputEl.addEventListener('blur', () => setTimeout(() => listEl.classList.remove('show'), 200));

  function renderList() {
    listEl.innerHTML = '';
    results.forEach((f, i) => {
      const a = photonFeatureToAddress(f);
      const sub = [a.city, a.state, a.zip, a.country].filter(Boolean).join(', ');
      const item = document.createElement('div');
      item.className = 'addr-ac-item' + (i === activeIdx ? ' active' : '');
      item.innerHTML = `<div class="addr-ac-item-main">${esc(a.street || a.name)}</div><div class="addr-ac-item-sub">${esc(sub)}</div>`;
      item.onmousedown = e => { e.preventDefault(); pick(f); };
      listEl.appendChild(item);
    });
  }

  function pick(f) {
    const a = photonFeatureToAddress(f);
    listEl.classList.remove('show');
    results = [];
    onSelect.pick({street: a.street, city: a.city, state: a.state, zip: a.zip, feature: f});
  }
}

/**
 * Initialize address modal UI (file drop zone, tabs).
 * @param {Function} onFileProcess - Callback(file) when file is dropped/selected
 */
export function initAddressUI(onFileProcess) {
  const dropZone = document.getElementById('addrDropZone');
  const fileInput = document.getElementById('addrFileInput');

  dropZone.onclick = () => fileInput.click();
  dropZone.ondragover = e => { e.preventDefault(); dropZone.classList.add('dragover'); };
  dropZone.ondragleave = () => dropZone.classList.remove('dragover');
  dropZone.ondrop = e => {
    e.preventDefault(); dropZone.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (file) onFileProcess(file);
  };
  fileInput.onchange = e => { if (e.target.files[0]) onFileProcess(e.target.files[0]); };

  document.querySelectorAll('.addr-tab').forEach(tab => {
    tab.onclick = () => {
      document.querySelectorAll('.addr-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.addr-section').forEach(s => s.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById('addr' + tab.dataset.tab.charAt(0).toUpperCase() + tab.dataset.tab.slice(1) + 'Section').classList.add('active');
    };
  });
}

/**
 * Update cluster slider max based on number of stops.
 */
export function updateClusterSlider() {
  const slider = document.getElementById('clusterSlider');
  const sliderVal = document.getElementById('clusterVal');
  const newMax = computeMaxClusters();
  slider.max = newMax;
  slider.setAttribute('max', newMax);
  if (+slider.value > newMax) {
    slider.value = newMax;
    sliderVal.textContent = newMax;
    state.numClusters = newMax;
  }
}
