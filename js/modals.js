import { state, STORE_H, saveJSON } from './state.js';
import { toast, trapFocus } from './utils.js';
import { geocodeFreeform } from './geocoder.js';
import { render } from './ui.js';

let releaseHomeTrap = null;
let releaseStartTrap = null;

function initModeTabs(modal, tabsId, contentId) {
  const tabs = modal.querySelectorAll(`#${tabsId} .point-mode-tab`);
  const sections = modal.querySelectorAll(`#${contentId} .point-mode-section`);
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const mode = tab.dataset.mode;
      tabs.forEach(t => t.classList.toggle('active', t === tab));
      sections.forEach(s => s.classList.toggle('active', s.dataset.mode === mode));
    });
  });
}

function getActiveMode(tabsId) {
  const active = document.querySelector(`#${tabsId} .point-mode-tab.active`);
  return active ? active.dataset.mode : null;
}

function renderStopList(listEl, searchEl, onSelect) {
  function renderFiltered(query) {
    listEl.innerHTML = '';
    const q = (query || '').toLowerCase();
    state.SPOTS.forEach((spot, i) => {
      const label = spot.street || spot.label || `Stop ${i + 1}`;
      const city = spot.city || '';
      if (q && !label.toLowerCase().includes(q) && !city.toLowerCase().includes(q)) return;
      const item = document.createElement('div');
      item.className = 'point-stop-item';
      item.innerHTML = `<span class="point-stop-item-num">${i + 1}</span><div class="point-stop-item-info"><div class="point-stop-item-name">${label}</div>${city ? `<div class="point-stop-item-city">${city}${spot.state ? ', ' + spot.state : ''}</div>` : ''}</div>`;
      item.dataset.idx = i;
      item.addEventListener('click', () => {
        listEl.querySelectorAll('.point-stop-item').forEach(el => el.classList.remove('selected'));
        item.classList.add('selected');
        if (onSelect) onSelect(i);
      });
      listEl.appendChild(item);
    });
    if (!listEl.children.length) {
      listEl.innerHTML = '<div class="point-stop-empty">No matching stops</div>';
    }
  }

  renderFiltered('');
  if (searchEl) {
    searchEl.value = '';
    searchEl.oninput = () => renderFiltered(searchEl.value);
  }
}

function showCurrentSelection(displayEl, valueEl, point, fallbackLabel) {
  if (point) {
    displayEl.style.display = 'flex';
    valueEl.textContent = point.label || fallbackLabel || 'Set';
  } else {
    displayEl.style.display = 'none';
  }
}

// --- Start Point Modal ---

let startSelectedIdx = null;

export function showStartModal() {
  const modal = document.getElementById('startModal');
  modal.classList.add('show');
  startSelectedIdx = null;

  showCurrentSelection(
    document.getElementById('startCurrentDisplay'),
    document.getElementById('startCurrentValue'),
    state.startPoint,
    state.gpsPos ? 'GPS Location' : null
  );
  if (!state.startPoint) {
    document.getElementById('startCurrentDisplay').style.display = 'flex';
    document.getElementById('startCurrentValue').textContent = 'GPS Location (default)';
  }

  const tabs = modal.querySelectorAll('#startModeTabs .point-mode-tab');
  const sections = modal.querySelectorAll('#startModeContent .point-mode-section');
  let activeMode = 'gps';
  if (state.startPoint && state.startPoint.spotId != null) activeMode = 'stop';
  else if (state.startPoint) activeMode = 'address';
  tabs.forEach(t => t.classList.toggle('active', t.dataset.mode === activeMode));
  sections.forEach(s => s.classList.toggle('active', s.dataset.mode === activeMode));

  document.getElementById('startInput').value = (state.startPoint && !state.startPoint.spotId) ? (state.startPoint.label || '') : '';
  renderStopList(
    document.getElementById('startStopList'),
    document.getElementById('startStopSearch'),
    idx => { startSelectedIdx = idx; }
  );

  releaseStartTrap = trapFocus(modal);
}

export function hideStartModal() {
  document.getElementById('startModal').classList.remove('show');
  if (releaseStartTrap) { releaseStartTrap(); releaseStartTrap = null; }
}

export async function confirmStart() {
  const mode = getActiveMode('startModeTabs');

  if (mode === 'gps') {
    state.startPoint = null;
    localStorage.removeItem('routeflow-start');
    hideStartModal();
    state.durationMatrix = null;
    render();
    toast('Start: GPS location');
    return;
  }

  if (mode === 'stop') {
    if (startSelectedIdx == null) { toast('Select a stop from the list'); return; }
    const spot = state.SPOTS[startSelectedIdx];
    state.startPoint = { lat: spot.lat, lng: spot.lng, label: spot.street || spot.label, spotId: startSelectedIdx };
    saveJSON('routeflow-start', state.startPoint);
    hideStartModal();
    state.durationMatrix = null;
    render();
    toast(`Start: ${state.startPoint.label}`);
    return;
  }

  if (mode === 'address') {
    const val = document.getElementById('startInput').value.trim();
    if (!val) { toast('Enter an address'); return; }
    const btn = document.getElementById('startConfirmBtn');
    btn.disabled = true;
    btn.querySelector('.point-modal-btn-icon').textContent = '...';
    try {
      const result = await geocodeFreeform(val);
      btn.disabled = false;
      btn.querySelector('.point-modal-btn-icon').textContent = '▶';
      if (result) {
        state.startPoint = { lat: result.lat, lng: result.lng, label: result.label || val };
        saveJSON('routeflow-start', state.startPoint);
        hideStartModal();
        state.durationMatrix = null;
        render();
        toast(`Start: ${state.startPoint.label}`);
      } else {
        toast('Address not found — try a different query');
      }
    } catch {
      btn.disabled = false;
      btn.querySelector('.point-modal-btn-icon').textContent = '▶';
      toast('Geocoding failed — check your connection');
    }
  }
}

// --- Home (End Point) Modal ---

let homeSelectedIdx = null;

export function showHomeModal() {
  const modal = document.getElementById('homeModal');
  modal.classList.add('show');
  homeSelectedIdx = null;

  showCurrentSelection(
    document.getElementById('homeCurrentDisplay'),
    document.getElementById('homeCurrentValue'),
    state.home,
    null
  );
  if (!state.home) {
    document.getElementById('homeCurrentDisplay').style.display = 'flex';
    document.getElementById('homeCurrentValue').textContent = 'None (ends at last stop)';
  }

  const tabs = modal.querySelectorAll('#homeModeTabs .point-mode-tab');
  const sections = modal.querySelectorAll('#homeModeContent .point-mode-section');
  let activeMode = 'none';
  if (state.home && state.home.isGps) activeMode = 'gps';
  else if (state.home && state.home.spotId != null) activeMode = 'stop';
  else if (state.home) activeMode = 'address';
  tabs.forEach(t => t.classList.toggle('active', t.dataset.mode === activeMode));
  sections.forEach(s => s.classList.toggle('active', s.dataset.mode === activeMode));

  document.getElementById('homeInput').value = (state.home && !state.home.spotId && !state.home.isGps) ? (state.home.label || '') : '';
  renderStopList(
    document.getElementById('homeStopList'),
    document.getElementById('homeStopSearch'),
    idx => { homeSelectedIdx = idx; }
  );

  releaseHomeTrap = trapFocus(modal);
}

export function hideHomeModal() {
  document.getElementById('homeModal').classList.remove('show');
  if (releaseHomeTrap) { releaseHomeTrap(); releaseHomeTrap = null; }
}

export async function confirmHome() {
  const mode = getActiveMode('homeModeTabs');

  if (mode === 'none') {
    state.home = null;
    localStorage.removeItem(STORE_H);
    hideHomeModal();
    render();
    toast('End point removed');
    return;
  }

  if (mode === 'gps') {
    if (!state.gpsPos) {
      toast('GPS location not available');
      return;
    }
    state.home = { lat: state.gpsPos.lat, lng: state.gpsPos.lng, label: 'Current Location', isGps: true };
    saveJSON(STORE_H, state.home);
    hideHomeModal();
    state.durationMatrix = null;
    render();
    toast('End: GPS location');
    return;
  }

  if (mode === 'stop') {
    if (homeSelectedIdx == null) { toast('Select a stop from the list'); return; }
    const spot = state.SPOTS[homeSelectedIdx];
    state.home = { lat: spot.lat, lng: spot.lng, label: spot.street || spot.label, spotId: homeSelectedIdx };
    saveJSON(STORE_H, state.home);
    hideHomeModal();
    state.durationMatrix = null;
    render();
    toast(`End: ${state.home.label}`);
    return;
  }

  if (mode === 'address') {
    const val = document.getElementById('homeInput').value.trim();
    if (!val) { toast('Enter an address'); return; }
    const btn = document.getElementById('homeConfirmBtn');
    btn.disabled = true;
    btn.querySelector('.point-modal-btn-icon').textContent = '...';
    try {
      const result = await geocodeFreeform(val);
      btn.disabled = false;
      btn.querySelector('.point-modal-btn-icon').textContent = '■';
      if (result) {
        state.home = { lat: result.lat, lng: result.lng, label: result.label || val };
        saveJSON(STORE_H, state.home);
        hideHomeModal();
        state.durationMatrix = null;
        render();
        toast(`End: ${state.home.label}`);
      } else {
        toast('Address not found — try a different query');
      }
    } catch {
      btn.disabled = false;
      btn.querySelector('.point-modal-btn-icon').textContent = '■';
      toast('Geocoding failed — check your connection');
    }
  }
}

// Init tab switching on load
initModeTabs(document.getElementById('homeModal'), 'homeModeTabs', 'homeModeContent');
initModeTabs(document.getElementById('startModal'), 'startModeTabs', 'startModeContent');
