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

function renderStopList(listEl, onSelect) {
  listEl.innerHTML = '';
  state.SPOTS.forEach((spot, i) => {
    const item = document.createElement('div');
    item.className = 'point-stop-item';
    item.textContent = spot.street || spot.label || `Stop ${i + 1}`;
    item.dataset.idx = i;
    item.addEventListener('click', () => {
      listEl.querySelectorAll('.point-stop-item').forEach(el => el.classList.remove('selected'));
      item.classList.add('selected');
      if (onSelect) onSelect(i);
    });
    listEl.appendChild(item);
  });
}

// --- Home (End Point) Modal ---

let homeSelectedIdx = null;

export function showHomeModal() {
  const modal = document.getElementById('homeModal');
  modal.classList.add('show');
  homeSelectedIdx = null;

  // Reset to correct tab based on current state
  const tabs = modal.querySelectorAll('#homeModeTabs .point-mode-tab');
  const sections = modal.querySelectorAll('#homeModeContent .point-mode-section');
  let activeMode = 'none';
  if (state.home && state.home.spotId != null) activeMode = 'stop';
  else if (state.home) activeMode = 'address';
  tabs.forEach(t => t.classList.toggle('active', t.dataset.mode === activeMode));
  sections.forEach(s => s.classList.toggle('active', s.dataset.mode === activeMode));

  document.getElementById('homeInput').value = (state.home && !state.home.spotId) ? (state.home.label || '') : '';
  renderStopList(document.getElementById('homeStopList'), idx => { homeSelectedIdx = idx; });

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

  if (mode === 'stop') {
    if (homeSelectedIdx == null) { toast('Pick a stop'); return; }
    const spot = state.SPOTS[homeSelectedIdx];
    state.home = { lat: spot.lat, lng: spot.lng, label: spot.street || spot.label, spotId: homeSelectedIdx };
    saveJSON(STORE_H, state.home);
    hideHomeModal();
    state.durationMatrix = null;
    render();
    toast('End point set');
    return;
  }

  if (mode === 'address') {
    const val = document.getElementById('homeInput').value.trim();
    if (!val) { toast('Enter an address'); return; }
    const btn = document.getElementById('homeConfirmBtn');
    btn.textContent = 'Finding...'; btn.disabled = true;
    try {
      const result = await geocodeFreeform(val);
      btn.textContent = 'Set End'; btn.disabled = false;
      if (result) {
        state.home = { lat: result.lat, lng: result.lng, label: result.label || val };
        saveJSON(STORE_H, state.home);
        hideHomeModal();
        render();
        toast('End point set');
      } else {
        document.getElementById('homeInput').style.borderColor = 'var(--red)';
        setTimeout(() => document.getElementById('homeInput').style.borderColor = '', 1500);
        toast('Address not found');
      }
    } catch {
      btn.textContent = 'Set End'; btn.disabled = false;
      toast('Geocoding failed');
    }
  }
}

// --- Start Point Modal ---

let startSelectedIdx = null;

export function showStartModal() {
  const modal = document.getElementById('startModal');
  modal.classList.add('show');
  startSelectedIdx = null;

  const tabs = modal.querySelectorAll('#startModeTabs .point-mode-tab');
  const sections = modal.querySelectorAll('#startModeContent .point-mode-section');
  let activeMode = 'gps';
  if (state.startPoint && state.startPoint.spotId != null) activeMode = 'stop';
  else if (state.startPoint) activeMode = 'address';
  tabs.forEach(t => t.classList.toggle('active', t.dataset.mode === activeMode));
  sections.forEach(s => s.classList.toggle('active', s.dataset.mode === activeMode));

  document.getElementById('startInput').value = (state.startPoint && !state.startPoint.spotId) ? (state.startPoint.label || '') : '';
  renderStopList(document.getElementById('startStopList'), idx => { startSelectedIdx = idx; });

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
    toast('Using GPS location');
    return;
  }

  if (mode === 'stop') {
    if (startSelectedIdx == null) { toast('Pick a stop'); return; }
    const spot = state.SPOTS[startSelectedIdx];
    state.startPoint = { lat: spot.lat, lng: spot.lng, label: spot.street || spot.label, spotId: startSelectedIdx };
    saveJSON('routeflow-start', state.startPoint);
    hideStartModal();
    state.durationMatrix = null;
    render();
    toast('Start point set');
    return;
  }

  if (mode === 'address') {
    const val = document.getElementById('startInput').value.trim();
    if (!val) { toast('Enter an address'); return; }
    const btn = document.getElementById('startConfirmBtn');
    btn.textContent = 'Finding...'; btn.disabled = true;
    try {
      const result = await geocodeFreeform(val);
      btn.textContent = 'Set Start'; btn.disabled = false;
      if (result) {
        state.startPoint = { lat: result.lat, lng: result.lng, label: result.label || val };
        saveJSON('routeflow-start', state.startPoint);
        hideStartModal();
        state.durationMatrix = null;
        render();
        toast('Start point set');
      } else {
        document.getElementById('startInput').style.borderColor = 'var(--red)';
        setTimeout(() => document.getElementById('startInput').style.borderColor = '', 1500);
        toast('Address not found');
      }
    } catch {
      btn.textContent = 'Set Start'; btn.disabled = false;
      toast('Geocoding failed');
    }
  }
}

// Init tab switching on load
initModeTabs(document.getElementById('homeModal'), 'homeModeTabs', 'homeModeContent');
initModeTabs(document.getElementById('startModal'), 'startModeTabs', 'startModeContent');
