import { state, STORE_START_MODE } from './state.js';
import { toast, trapFocus } from './utils.js';
import { render } from './ui.js';
import { setAnchor, anchorFromSpotId } from './anchors.js';
import {
  initModeTabs, getActiveMode, renderStopList, showCurrentSelection,
  applyGpsTabState, applyActiveMode, ensureGpsReady, runAddressGeocode
} from './modal-helpers.js';

let releaseHomeTrap = null;
let releaseStartTrap = null;
let startSelectedIdx = null;
let homeSelectedIdx = null;

function activeModeFor(point, opts = {}) {
  if (opts.noneFirst && !point) return 'none';
  if (point && point.isGps) return 'gps';
  if (point && point.spotId != null) return 'stop';
  if (point) return 'address';
  return opts.defaultMode || 'gps';
}

function gpsUnavailable() {
  return state.gpsState === 'unavailable' || state.gpsState === 'denied';
}

// --- Start Point Modal ---

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
    document.getElementById('startCurrentValue').textContent = state.startMode === 'none'
      ? 'None (begins at first stop)'
      : 'GPS Location (default)';
  }

  applyGpsTabState(modal);

  let mode = state.startMode === 'none'
    ? 'none'
    : activeModeFor(state.startPoint, {defaultMode: 'gps'});
  if (gpsUnavailable() && mode === 'gps') mode = 'none';
  applyActiveMode('startModeTabs', 'startModeContent', mode);

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

function applyStart(anchor, modeKey, toastMsg) {
  setAnchor('start', anchor);
  state.startMode = modeKey;
  try {
    if (modeKey === 'none') localStorage.setItem(STORE_START_MODE, 'none');
    else localStorage.removeItem(STORE_START_MODE);
  } catch {}
  hideStartModal();
  state.durationMatrix = null;
  render();
  toast(toastMsg);
}

export async function confirmStart() {
  const mode = getActiveMode('startModeTabs');

  if (mode === 'none') return applyStart(null, 'none', 'Start point removed');

  if (mode === 'gps') {
    if (!await ensureGpsReady()) return;
    return applyStart(null, 'auto', 'Start: GPS location');
  }

  if (mode === 'stop') {
    if (startSelectedIdx == null) { toast('Select a stop from the list'); return; }
    const a = anchorFromSpotId(startSelectedIdx);
    applyStart(a, 'auto', `Start: ${a?.label || ''}`);
    return;
  }

  if (mode === 'address') {
    const result = await runAddressGeocode('startInput', 'startConfirmBtn', '...', '▶');
    if (!result) return;
    applyStart({ lat: result.lat, lng: result.lng, label: result.label || result.query }, 'auto', `Start: ${result.label || result.query}`);
  }
}

// --- Home (End Point) Modal ---

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

  applyGpsTabState(modal);

  let mode = activeModeFor(state.home, {noneFirst: true, defaultMode: 'none'});
  if (gpsUnavailable() && mode === 'gps') mode = 'none';
  applyActiveMode('homeModeTabs', 'homeModeContent', mode);

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

function applyHome(anchor, toastMsg) {
  setAnchor('home', anchor);
  hideHomeModal();
  state.durationMatrix = null;
  render();
  toast(toastMsg);
}

export async function confirmHome() {
  const mode = getActiveMode('homeModeTabs');

  if (mode === 'none') return applyHome(null, 'End point removed');

  if (mode === 'gps') {
    if (!await ensureGpsReady()) return;
    return applyHome(
      { lat: state.gpsPos.lat, lng: state.gpsPos.lng, label: 'Current Location', isGps: true },
      'End: GPS location'
    );
  }

  if (mode === 'stop') {
    if (homeSelectedIdx == null) { toast('Select a stop from the list'); return; }
    const a = anchorFromSpotId(homeSelectedIdx);
    applyHome(a, `End: ${a?.label || ''}`);
    return;
  }

  if (mode === 'address') {
    const result = await runAddressGeocode('homeInput', 'homeConfirmBtn', '...', '■');
    if (!result) return;
    applyHome({ lat: result.lat, lng: result.lng, label: result.label || result.query }, `End: ${result.label || result.query}`);
  }
}

// Init tab switching on load
initModeTabs(document.getElementById('homeModal'), 'homeModeTabs', 'homeModeContent');
initModeTabs(document.getElementById('startModal'), 'startModeTabs', 'startModeContent');
