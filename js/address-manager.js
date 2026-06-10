/**
 * Address Manager - State operations for address management
 * Coordinates between address-import and address-ui modules
 */
import { state, STORE_SPOTS, STORE_V, STORE_CACHE, STORE_ROUTE_OVERRIDES, saveSet, saveJSON } from './state.js';
import { toast } from './utils.js';
import { render } from './ui.js';
import { confirm } from './confirm.js';
import { geocodeAddress } from './geocoder.js';
import { clearAllAnchors } from './anchors.js';
import { processFile, parsePastedText as parsePasted } from './address-import.js';
import { showAddrModal as showModal, hideAddrModal as hideModal, renderAddrPreview, setupAutocomplete, initAddressUI as initUI, updateClusterSlider } from './address-ui.js';
import { parseAddressLine, normalizeState } from './address-parse.js';
import { showFixAddrPrompt } from './addr-fix-modal.js';

let stagedAddresses = [];
let importMode = 'append';

// Export normalized names
export { normalizeState, parseAddressLine };

function resetRouteState() {
  state.durationMatrix = null;
  state.osrmCache = {};
  saveJSON(STORE_CACHE, state.osrmCache);
  state.currentRoutes = [];
  state.demoMode = false;
  state.matrixFallback = false;
}

export function showAddrModal() {
  showModal({ stagedAddresses, importMode, setImportMode, renderPreview });
}

export function hideAddrModal() {
  hideModal({ stagedAddresses, renderPreview });
}

function renderPreview() {
  renderAddrPreview(stagedAddresses);
}

export function setImportMode(mode) {
  importMode = mode;
  document.getElementById('addrModeAppend').classList.toggle('active', mode === 'append');
  document.getElementById('addrModeReplace').classList.toggle('active', mode === 'replace');
}

function importAddresses(addresses) {
  const MAX_STOPS = 100;
  const existing = importMode === 'append' ? state.SPOTS.length : 0;
  const available = MAX_STOPS - existing;
  if (addresses.length > available) {
    if (existing > 0) toast(`Max 100 stops — only adding ${available}`);
    else toast('Max 100 stops');
    addresses = addresses.slice(0, Math.max(0, available));
  }
  if (!addresses.length) return;
  stagedAddresses = addresses.map((a, i) => ({
    id: i + 1,
    street: a.street,
    city: a.city || '',
    state: a.state || '',
    zip: a.zip || '',
    lat: a.lat,
    lng: a.lng,
    status: Number.isFinite(a.lat) && Number.isFinite(a.lng) ? 'ok' : 'pending'
  }));
  renderPreview();
  toast(`${stagedAddresses.length} addresses loaded`);
}

export function parsePastedText() {
  const text = document.getElementById('addrPasteArea').value.trim();
  const addresses = parsePasted(text);
  if (addresses.length) importAddresses(addresses);
}

async function geocodeOne(addr) {
  try {
    const result = await geocodeAddress(addr);
    if (result) {
      addr.lat = result.lat;
      addr.lng = result.lng;
      if (result.resolvedStreet && !addr.street) addr.street = result.resolvedStreet;
      if (result.resolvedCity && !addr.city) addr.city = result.resolvedCity;
      if (result.resolvedState && !addr.state) addr.state = result.resolvedState;
      if (result.resolvedZip && !addr.zip) addr.zip = result.resolvedZip;
      addr.status = 'ok';
    } else {
      addr.status = 'error';
    }
  } catch { addr.status = 'error'; }
}

async function geocodeStaged() {
  const pending = stagedAddresses.filter(a => a.status === 'pending');
  for (let i = 0; i < pending.length; i++) {
    const addr = pending[i];
    await geocodeOne(addr);
    renderPreview();

    if (addr.status !== 'error') continue;
    const action = await showFixAddrPrompt(addr);
    if (action === 'retry') { i--; continue; }
    if (action === 'remove') {
      const idx = stagedAddresses.indexOf(addr);
      if (idx >= 0) stagedAddresses.splice(idx, 1);
      renderPreview();
    }
  }
}

export async function confirmAddresses() {
  if (!stagedAddresses.length) return;
  const btn = document.getElementById('addrConfirmBtn');
  btn.textContent = 'Verifying addresses…';
  btn.disabled = true;
  await geocodeStaged();
  btn.disabled = false;
  const valid = stagedAddresses.filter(a => a.status === 'ok' && Number.isFinite(a.lat) && Number.isFinite(a.lng));
  if (!valid.length) { renderPreview(); return; }
  applyValidStops(valid);
}

function applyValidStops(valid) {
  if (importMode === 'append' && state.SPOTS.length > 0) {
    const maxId = Math.max(0, ...state.SPOTS.map(s => s.id));
    const newSpots = valid.map((a, i) => ({id: maxId + i + 1, street: a.street, city: a.city || '', state: a.state || '', zip: a.zip || '', lat: a.lat, lng: a.lng}));
    state.SPOTS = [...state.SPOTS, ...newSpots];
    saveJSON(STORE_SPOTS, state.SPOTS);
    resetRouteState();
    updateClusterSlider();
    hideAddrModal();
    toast(`${newSpots.length} stops added (${state.SPOTS.length} total)`);
    render();
  } else {
    const newSpots = valid.map((a, i) => ({id: i + 1, street: a.street, city: a.city || '', state: a.state || '', zip: a.zip || '', lat: a.lat, lng: a.lng}));
    state.SPOTS = newSpots;
    saveJSON(STORE_SPOTS, state.SPOTS);
    state.visitedSet.clear();
    saveSet(STORE_V, state.visitedSet);
    clearAllAnchors();
    resetRouteState();
    state.numClusters = 1;
    state.activeFilter = -1;
    document.getElementById('clusterSlider').value = 1;
    document.getElementById('clusterVal').textContent = '1';
    updateClusterSlider();
    hideAddrModal();
    toast(`${newSpots.length} stops loaded`);
    render();
  }
}

/**
 * Geocode (if needed) and append a single stop. Used by the quick-add
 * flow, which already has Photon coordinates from the autocomplete pick.
 * Falls back to the geocoder cascade when lat/lng are missing.
 * Returns the new spot, or null if geocoding failed.
 */
export async function addSingleStop({street, city, state: st, zip, lat, lng}) {
  const MAX_STOPS = 100;
  if (state.SPOTS.length >= MAX_STOPS) {
    toast(`Max ${MAX_STOPS} stops reached`);
    return null;
  }
  let resolved = {street, city: city || '', state: st || '', zip: zip || '', lat, lng};
  if (!Number.isFinite(resolved.lat) || !Number.isFinite(resolved.lng)) {
    try {
      const r = await geocodeAddress(resolved);
      if (!r) { toast(`Could not find "${street}"`); return null; }
      resolved.lat = r.lat;
      resolved.lng = r.lng;
      if (r.resolvedStreet && !resolved.street) resolved.street = r.resolvedStreet;
      if (r.resolvedCity && !resolved.city) resolved.city = r.resolvedCity;
      if (r.resolvedState && !resolved.state) resolved.state = r.resolvedState;
      if (r.resolvedZip && !resolved.zip) resolved.zip = r.resolvedZip;
    } catch {
      toast(`Could not find "${street}"`);
      return null;
    }
  }
  const maxId = state.SPOTS.reduce((m, s) => Math.max(m, s.id), 0);
  const newSpot = {
    id: maxId + 1,
    street: resolved.street,
    city: resolved.city,
    state: resolved.state,
    zip: resolved.zip,
    lat: resolved.lat,
    lng: resolved.lng
  };
  state.SPOTS = [...state.SPOTS, newSpot];
  saveJSON(STORE_SPOTS, state.SPOTS);
  resetRouteState();
  updateClusterSlider();
  // suppressFitBounds keeps the map where the user just pinned, instead of
  // jerking back to fit all stops — important for rapid-add flow.
  state.suppressFitBounds = true;
  render();
  return newSpot;
}

/**
 * Wipe all stops + visited progress + computed routes, but preserve start
 * and end anchors. Returns an `undo()` function that restores the prior
 * state — paired with the toast undo affordance from the FAB clear-all.
 */
export function clearAllStops() {
  if (!state.SPOTS.length) return null;
  const snapshot = {
    SPOTS: state.SPOTS,
    visited: new Set(state.visitedSet),
    overrides: {...(state.routeOverrides || {})},
    numClusters: state.numClusters,
    activeFilter: state.activeFilter
  };
  state.SPOTS = [];
  localStorage.removeItem(STORE_SPOTS);
  state.visitedSet.clear();
  saveSet(STORE_V, state.visitedSet);
  state.routeOverrides = {};
  saveJSON(STORE_ROUTE_OVERRIDES, state.routeOverrides);
  resetRouteState();
  state.numClusters = 1;
  state.activeFilter = -1;
  const slider = document.getElementById('clusterSlider');
  const sliderVal = document.getElementById('clusterVal');
  if (slider) slider.value = 1;
  if (sliderVal) sliderVal.textContent = '1';
  updateClusterSlider();
  render();
  return function undo() {
    state.SPOTS = snapshot.SPOTS;
    saveJSON(STORE_SPOTS, state.SPOTS);
    state.visitedSet = snapshot.visited;
    saveSet(STORE_V, state.visitedSet);
    state.routeOverrides = snapshot.overrides;
    saveJSON(STORE_ROUTE_OVERRIDES, state.routeOverrides);
    state.numClusters = snapshot.numClusters;
    state.activeFilter = snapshot.activeFilter;
    if (slider) slider.value = state.numClusters;
    if (sliderVal) sliderVal.textContent = String(state.numClusters);
    updateClusterSlider();
    resetRouteState();
    render();
  };
}

export async function resetToDefaultStops() {
  const confirmed = await confirm('Clear all stops and reset progress?', { okText: 'Clear', dangerous: true });
  if (!confirmed) return;
  state.SPOTS = [];
  localStorage.removeItem(STORE_SPOTS);
  state.visitedSet.clear();
  saveSet(STORE_V, state.visitedSet);
  resetRouteState();
  state.numClusters = 1;
  state.activeFilter = -1;
  document.getElementById('clusterSlider').value = 1;
  document.getElementById('clusterVal').textContent = '1';
  updateClusterSlider();
  hideAddrModal();
  toast('All stops cleared');
  render();
}

function handleFileProcess(file) {
  processFile(file, importAddresses);
}

export function initAddressUI() {
  initUI(handleFileProcess);
}

export { setupAutocomplete };
