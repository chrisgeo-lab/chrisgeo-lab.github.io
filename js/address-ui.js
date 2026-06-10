import { state } from './state.js';
import { esc, trapFocus } from './utils.js';
import { computeMaxClusters } from './ui.js';
export { setupAutocomplete } from './addr-autocomplete.js';

let releaseAddrTrap = null;

/**
 * Show address management modal.
 * @param {Object} modalState - { stagedAddresses, importMode, setImportMode, renderPreview }
 */
export function showAddrModal(modalState) {
  const modal = document.getElementById('addrModal');
  modal.classList.add('show');
  releaseAddrTrap = trapFocus(modal);

  modalState.stagedAddresses.length = 0;
  modalState.renderPreview();

  const hasExisting = state.SPOTS.length > 0;
  document.getElementById('addrModeToggle').style.display = hasExisting ? 'flex' : 'none';
  modalState.setImportMode(hasExisting ? 'append' : 'replace');

  document.getElementById('addrPasteArea').value = '';

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
    btn.textContent = 'Add stops';
    count.textContent = 'No addresses yet';
    return;
  }

  el.style.display = 'block';
  btn.disabled = false;
  const geocoded = stagedAddresses.filter(a => a.status === 'ok').length;
  const n = stagedAddresses.length;
  btn.textContent = `Add ${n} ${n === 1 ? 'stop' : 'stops'}`;
  count.textContent = geocoded
    ? `${n} ${n === 1 ? 'address' : 'addresses'} · ${geocoded} verified`
    : `${n} ${n === 1 ? 'address' : 'addresses'} ready`;

  el.innerHTML = '';
  stagedAddresses.forEach((addr, i) => {
    const item = document.createElement('div');
    item.className = 'addr-preview-item';
    const statusClass = addr.status === 'ok' ? 'ok' : addr.status === 'error' ? 'error' : 'pending';
    const statusText = addr.status === 'ok' ? 'OK' : addr.status === 'error' ? 'Error' : 'Pending';
    item.innerHTML = `
      <span class="addr-preview-num">${i + 1}</span>
      <span class="addr-preview-text">${esc(addr.street)}${addr.city ? ', ' + esc(addr.city) : ''}${addr.state ? ', ' + esc(addr.state) : ''}${addr.zip ? ' ' + esc(addr.zip) : ''}</span>
      <span class="addr-preview-status ${statusClass}">${statusText}</span>
      <button class="addr-preview-remove" data-idx="${i}" aria-label="Remove address"><svg viewBox="0 0 13 13" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><path d="M3 3l7 7M10 3l-7 7"/></svg></button>`;
    item.querySelector('.addr-preview-remove').onclick = () => {
      stagedAddresses.splice(i, 1);
      stagedAddresses.forEach((a, j) => a.id = j + 1);
      renderAddrPreview(stagedAddresses);
    };
    el.appendChild(item);
  });
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
 * Also syncs mobile and panel sliders, and shows/hides controls.
 */
export function updateClusterSlider() {
  const slider = document.getElementById('clusterSlider');
  const sliderVal = document.getElementById('clusterVal');
  const sliderMobile = document.getElementById('clusterSliderMobile');
  const sliderValMobile = document.getElementById('clusterValMobile');
  const sliderPanel = document.getElementById('clusterSliderPanel');
  const sliderValPanel = document.getElementById('clusterPanelVal');
  const clusterVertical = document.getElementById('clusterVertical');
  const clusterPanelControl = document.getElementById('clusterPanelControl');

  const newMax = computeMaxClusters();
  const shouldShow = newMax > 1;

  // Update max for all sliders
  slider.max = newMax;
  slider.setAttribute('max', newMax);
  sliderMobile.max = newMax;
  sliderMobile.setAttribute('max', newMax);
  sliderPanel.max = newMax;
  sliderPanel.setAttribute('max', newMax);

  // Sync values if current exceeds new max
  if (+slider.value > newMax) {
    slider.value = newMax;
    sliderVal.textContent = newMax;
    sliderMobile.value = newMax;
    sliderValMobile.textContent = newMax;
    sliderPanel.value = newMax;
    sliderValPanel.textContent = newMax;
    state.numClusters = newMax;
  }

  // Show/hide controls based on whether clustering is possible
  clusterPanelControl.style.display = shouldShow ? 'block' : 'none';
}
