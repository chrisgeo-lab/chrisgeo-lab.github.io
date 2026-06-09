/**
 * Address Manager - State operations for address management
 * Coordinates between address-import and address-ui modules
 */
import { state, STORE_SPOTS, STORE_V, STORE_CACHE, saveSet, saveJSON } from './state.js';
import { toast } from './utils.js';
import { render } from './ui.js';
import { geocodeAddress } from './geocoder.js';
import { clearAllAnchors } from './anchors.js';
import { processFile, parsePastedText as parsePasted } from './address-import.js';
import { showAddrModal as showModal, hideAddrModal as hideModal, renderAddrPreview, setupAutocomplete, initAddressUI as initUI, updateClusterSlider } from './address-ui.js';
import { parseAddressLine, normalizeState } from './address-parse.js';

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

export function addManualAddress() {
  const streetEl = document.getElementById('addrManualStreet');
  const cityEl = document.getElementById('addrManualCity');
  const stateEl = document.getElementById('addrManualState');
  const zipEl = document.getElementById('addrManualZip');
  const street = streetEl.value.trim();
  const city = cityEl.value.trim();
  const st = stateEl.value.trim();
  const zip = zipEl.value.trim();
  if (!street) { streetEl.focus(); return; }
  if (!st) { toast('State required'); stateEl.focus(); return; }
  stagedAddresses.push({
    id: stagedAddresses.length + 1,
    street, city, state: st, zip, lat: null, lng: null, status: 'pending'
  });
  streetEl.value = ''; cityEl.value = ''; zipEl.value = ''; streetEl.focus();
  renderPreview();
}

async function geocodeStaged() {
  const pending = stagedAddresses.filter(a => a.status === 'pending');
  for (const addr of pending) {
    try {
      const result = await geocodeAddress(addr);
      if (result) {
        addr.lat = result.lat;
        addr.lng = result.lng;
        addr.status = 'ok';
      } else {
        addr.status = 'error';
      }
    } catch { addr.status = 'error'; }
    renderPreview();
  }
}

export async function confirmAddresses() {
  if (!stagedAddresses.length) return;
  const btn = document.getElementById('addrConfirmBtn');
  btn.textContent = 'Resolving...';
  btn.disabled = true;
  await geocodeStaged();
  btn.textContent = 'Apply Stops';
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

export function resetToDefaultStops() {
  if (!confirm('Clear all stops and reset progress?')) return;
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

export function clearAllAppData() {
  if (!confirm('Clear ALL app data (stops, progress, tour state, cache)? This cannot be undone.')) return;
  const keys = [
    STORE_SPOTS, STORE_V, 'routeflow-home', 'routeflow-start',
    STORE_CACHE, 'routeflow-travel-mode', 'routeflow-tour-complete', 'routeflow-theme'
  ];
  keys.forEach(k => { try { localStorage.removeItem(k); } catch {} });
  state.SPOTS = [];
  state.visitedSet.clear();
  state.durationMatrix = null;
  state.osrmCache = {};
  state.currentRoutes = [];
  state.demoMode = false;
  state.matrixFallback = false;
  state.startPoint = null;
  state.home = null;
  state.numClusters = 1;
  state.activeFilter = -1;
  document.getElementById('clusterSlider').value = 1;
  document.getElementById('clusterVal').textContent = '1';
  toast('All data cleared — refresh to see tour again');
  render();
}

function handleFileProcess(file) {
  processFile(file, importAddresses);
}

export function initAddressUI() {
  initUI(handleFileProcess);
}

export { setupAutocomplete };
