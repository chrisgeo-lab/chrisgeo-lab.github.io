import { state } from './state.js';
import { toast, trapFocus } from './utils.js';
import { geocodeFreeform } from './geocoder.js';
import { render } from './ui.js';
import { setAnchor, anchorFromSpotId } from './anchors.js';
import { requestLocationWithPrompt } from './geolocation.js';
import { initModeTabs, getActiveMode, renderStopList, showCurrentSelection } from './modal-helpers.js';

let releaseHomeTrap = null;
let releaseStartTrap = null;

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

  // Disable GPS tab if unavailable or denied
  const gpsTab = Array.from(tabs).find(t => t.dataset.mode === 'gps');
  const gpsUnavailable = state.gpsState === 'unavailable' || state.gpsState === 'denied';
  if (gpsTab) {
    gpsTab.disabled = gpsUnavailable;
    gpsTab.style.opacity = gpsUnavailable ? '0.5' : '1';
    gpsTab.style.cursor = gpsUnavailable ? 'not-allowed' : 'pointer';
    if (gpsUnavailable) {
      gpsTab.title = state.gpsState === 'unavailable'
        ? 'GPS not available on this device'
        : 'GPS permission denied — enable in browser settings';
    }
  }

  let activeMode = 'gps';
  if (state.startPoint && state.startPoint.spotId != null) activeMode = 'stop';
  else if (state.startPoint) activeMode = 'address';
  // If GPS unavailable and would be default, switch to address mode
  if (gpsUnavailable && activeMode === 'gps') activeMode = 'address';

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
    // Block if GPS unavailable
    if (state.gpsState === 'unavailable') {
      toast('GPS is not available on this device');
      return;
    }
    if (state.gpsState === 'denied') {
      toast('GPS permission denied. Enable location services in your browser settings.');
      return;
    }
    // Ensure we have a valid GPS location; request if needed
    if (!state.gpsPos) {
      const location = await requestLocationWithPrompt();
      if (!location) return; // User denied or location unavailable
    }
    setAnchor('start', null);
    hideStartModal();
    state.durationMatrix = null;
    render();
    toast('Start: GPS location');
    return;
  }

  if (mode === 'stop') {
    if (startSelectedIdx == null) { toast('Select a stop from the list'); return; }
    setAnchor('start', anchorFromSpotId(startSelectedIdx));
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
        setAnchor('start', { lat: result.lat, lng: result.lng, label: result.label || val });
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

  // Disable GPS tab if unavailable or denied
  const gpsTab = Array.from(tabs).find(t => t.dataset.mode === 'gps');
  const gpsUnavailable = state.gpsState === 'unavailable' || state.gpsState === 'denied';
  if (gpsTab) {
    gpsTab.disabled = gpsUnavailable;
    gpsTab.style.opacity = gpsUnavailable ? '0.5' : '1';
    gpsTab.style.cursor = gpsUnavailable ? 'not-allowed' : 'pointer';
    if (gpsUnavailable) {
      gpsTab.title = state.gpsState === 'unavailable'
        ? 'GPS not available on this device'
        : 'GPS permission denied — enable in browser settings';
    }
  }

  let activeMode = 'none';
  if (state.home && state.home.isGps) activeMode = 'gps';
  else if (state.home && state.home.spotId != null) activeMode = 'stop';
  else if (state.home) activeMode = 'address';
  // If GPS unavailable and would be default, switch to 'none' mode
  if (gpsUnavailable && activeMode === 'gps') activeMode = 'none';

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
    setAnchor('home', null);
    hideHomeModal();
    render();
    toast('End point removed');
    return;
  }

  if (mode === 'gps') {
    // Block if GPS unavailable
    if (state.gpsState === 'unavailable') {
      toast('GPS is not available on this device');
      return;
    }
    if (state.gpsState === 'denied') {
      toast('GPS permission denied. Enable location services in your browser settings.');
      return;
    }
    // Ensure we have a valid GPS location; request if needed
    if (!state.gpsPos) {
      const location = await requestLocationWithPrompt();
      if (!location) return; // User denied or location unavailable
    }
    setAnchor('home', { lat: state.gpsPos.lat, lng: state.gpsPos.lng, label: 'Current Location', isGps: true });
    hideHomeModal();
    state.durationMatrix = null;
    render();
    toast('End: GPS location');
    return;
  }

  if (mode === 'stop') {
    if (homeSelectedIdx == null) { toast('Select a stop from the list'); return; }
    setAnchor('home', anchorFromSpotId(homeSelectedIdx));
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
        setAnchor('home', { lat: result.lat, lng: result.lng, label: result.label || val });
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
