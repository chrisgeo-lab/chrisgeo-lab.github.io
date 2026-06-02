import { state, STORE_V, saveSet, saveJSON } from './state.js';
import { toast, setLoading, showError, hideError } from './utils.js';
import { map } from './map.js';
import { render, renderView, renderStopList, toggleVisited, exportRoute, exportToGoogleMaps, computeMaxClusters,
  showHomeModal, hideHomeModal, confirmHome, showStartModal, hideStartModal, confirmStart,
  setSheetState, toggleRouteDropdown, closeRouteDropdown } from './ui.js';
import { startNavigation, stopNavigation, updateNavUI, openNavDirPanel, closeNavDirPanel } from './nav.js';
import { showAddrModal, hideAddrModal, resetToDefaultStops, setupAutocomplete, parsePastedText, addManualAddress, confirmAddresses, initAddressUI } from './addresses.js';

// Expose popup toggle globally (needed for marker popup onclick)
window._popupToggleVisit = function(id) {
  toggleVisited(id);
  map.closePopup();
};

// Route dropdown
document.getElementById('routeDropdownTrigger').onclick = toggleRouteDropdown;
document.addEventListener('click', e => {
  if (!e.target.closest('.filter-row')) closeRouteDropdown();
});

// Cluster slider
const slider = document.getElementById('clusterSlider');
const sliderVal = document.getElementById('clusterVal');
let sliderTO = null;
slider.oninput = () => { sliderVal.textContent = slider.value; state.numClusters = +slider.value; state.activeFilter = -1; clearTimeout(sliderTO); sliderTO = setTimeout(render, 400); };

const MAX_CLUSTERS = computeMaxClusters();
slider.max = MAX_CLUSTERS;
slider.setAttribute('max', MAX_CLUSTERS);

// Buttons
document.getElementById('resetBtn').onclick = () => {
  if (!state.visitedSet.size || confirm('Reset all progress?')) { state.visitedSet.clear(); saveSet(STORE_V, state.visitedSet); renderView(); toast('Progress reset'); }
};
document.getElementById('setHomeBtn').onclick = showHomeModal;
document.getElementById('setStartBtn').onclick = showStartModal;
document.getElementById('topCard').onclick = () => setSheetState(state.sheetState === 'expanded' ? 'peek' : 'expanded');
document.getElementById('startNavBtn').onclick = () => startNavigation(renderView);
document.getElementById('gmapsFullRouteBtn').onclick = exportToGoogleMaps;
document.getElementById('nextStopCard').addEventListener('dblclick', () => {
  const id = parseInt(document.getElementById('nextStopCard').dataset.spotId);
  if (id) toggleVisited(id);
});
document.getElementById('navClose').onclick = () => stopNavigation(renderView, setSheetState);
document.getElementById('navMarkArrived').onclick = () => {
  if (!state.navRoute || state.navCurrentLeg >= state.navRoute.stops.length) return;
  const sp = state.navRoute.stops[state.navCurrentLeg];
  state.visitedSet.add(sp.id); saveSet(STORE_V, state.visitedSet);
  toast(`Marked ${sp.street} as visited`);
  if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
  state.navCurrentLeg++;
  updateNavUI();
  document.getElementById('progressBar').style.width = `${state.SPOTS.length ? (state.visitedSet.size / state.SPOTS.length) * 100 : 0}%`;
};
document.getElementById('recenterBtn').onclick = () => { state.userPanned = false; if (state.gpsPos) map.panTo([state.gpsPos.lat, state.gpsPos.lng]); };

// Nav directions panel
document.getElementById('navDirClose').onclick = closeNavDirPanel;
document.getElementById('navShowDirs').onclick = openNavDirPanel;

// Panel toggle
let panelHidden = false;
document.getElementById('panelToggle').onclick = () => {
  panelHidden = !panelHidden;
  document.getElementById('bottomSheet').classList.toggle('panel-hidden', panelHidden);
  document.querySelector('.map-controls').classList.toggle('panel-hidden', panelHidden);
  document.getElementById('panelToggle').classList.toggle('panel-hidden', panelHidden);
  document.getElementById('panelToggle').innerHTML = panelHidden ? '&#9664;' : '&#9654;';
};

// Map controls
document.getElementById('zoomInBtn').onclick = () => map.zoomIn();
document.getElementById('zoomOutBtn').onclick = () => map.zoomOut();
document.getElementById('fitBoundsBtn').onclick = () => {
  const routes = state.activeFilter >= 0 ? [state.currentRoutes[state.activeFilter]] : state.currentRoutes;
  const bounds = [];
  routes.forEach(r => r.route.forEach(i => { const sp = typeof i === 'number' ? state.SPOTS[i] : i; bounds.push([sp.lat, sp.lng]); }));
  const origin = state.startPoint || (state.gpsPos ? {lat: state.gpsPos.lat, lng: state.gpsPos.lng} : null);
  if (origin) bounds.push([origin.lat, origin.lng]);
  if (state.home) bounds.push([state.home.lat, state.home.lng]);
  if (!bounds.length) { const all = state.SPOTS.map(s => [s.lat, s.lng]); if (all.length) map.fitBounds(all, {padding: [60, 60]}); return; }
  map.fitBounds(bounds, {padding: [60, 60]});
};
document.getElementById('gpsLocBtn').onclick = () => {
  if (state.gpsPos) { map.setView([state.gpsPos.lat, state.gpsPos.lng], 15); return; }
  if (!navigator.geolocation) { toast('GPS not available'); return; }
  toast('Getting location...');
  navigator.geolocation.getCurrentPosition(pos => {
    state.gpsPos = {lat: pos.coords.latitude, lng: pos.coords.longitude, acc: pos.coords.accuracy};
    map.setView([state.gpsPos.lat, state.gpsPos.lng], 15);
    state.suppressFitBounds = true;
    renderView();
  }, () => toast('Location unavailable — check permissions'), {enableHighAccuracy: true, timeout: 10000});
};
document.getElementById('toggleVisitedBtn').onclick = () => {
  state.showVisitedMarkers = !state.showVisitedMarkers;
  document.getElementById('toggleVisitedBtn').style.opacity = state.showVisitedMarkers ? '1' : '.5';
  document.getElementById('toggleVisitedBtn').style.color = state.showVisitedMarkers ? 'var(--green)' : '';
  state.suppressFitBounds = true;
  renderView();
};

// Export buttons
document.getElementById('exportBtn').onclick = exportToGoogleMaps;
document.getElementById('exportTxtBtn').onclick = exportRoute;

// Keyboard shortcuts
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    if (document.getElementById('addrModal').classList.contains('show')) { hideAddrModal(); return; }
    if (state.isNavigating) { stopNavigation(renderView, setSheetState); return; }
    if (document.getElementById('homeModal').classList.contains('show')) { hideHomeModal(); return; }
    if (document.getElementById('startModal').classList.contains('show')) { hideStartModal(); return; }
    setSheetState('collapsed'); return;
  }
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
  if (e.key === 'n' || e.key === 'N') startNavigation(renderView);
  else if (e.key === 'h' || e.key === 'H') showHomeModal();
  else if (e.key === 'r' || e.key === 'R') { document.getElementById('resetBtn').click(); }
  else if (e.key === 'e') exportToGoogleMaps();
  else if (e.key === 'E') exportRoute();
  else if (e.key === '=' || e.key === '+') map.zoomIn();
  else if (e.key === '-') map.zoomOut();
  else if (e.key >= '1' && e.key <= '9') {
    const idx = parseInt(e.key) - 1;
    if (idx < state.currentRoutes.length) { state.activeFilter = state.activeFilter === idx ? -1 : idx; renderView(); }
  }
});

// Search
document.getElementById('searchInput').oninput = () => renderStopList();

// Home modal
document.getElementById('homeCancelBtn').onclick = hideHomeModal;
document.getElementById('homeClearBtn').onclick = () => {
  state.home = null; localStorage.removeItem('festival-home');
  hideHomeModal(); render();
  toast('End point removed — route won\'t loop');
};
document.getElementById('homeConfirmBtn').onclick = confirmHome;
document.getElementById('homeInput').onkeydown = (e) => { if (e.key === 'Enter') confirmHome(); };

// Start modal
document.getElementById('startCancelBtn').onclick = hideStartModal;
document.getElementById('startClearBtn').onclick = () => {
  state.startPoint = null; localStorage.removeItem('routeflow-start');
  hideStartModal(); state.durationMatrix = null;
  render();
  toast('Using GPS as start point');
};
document.getElementById('startConfirmBtn').onclick = confirmStart;
document.getElementById('startInput').onkeydown = (e) => { if (e.key === 'Enter') confirmStart(); };

// Address manager
document.getElementById('manageStopsBtn').onclick = showAddrModal;
document.getElementById('emptyImportBtn').onclick = showAddrModal;
document.getElementById('importStopsInlineBtn').onclick = showAddrModal;
document.getElementById('fabAddStops').onclick = showAddrModal;
document.getElementById('addrCancelBtn').onclick = hideAddrModal;
document.getElementById('addrModal').onclick = e => { if (e.target.id === 'addrModal') hideAddrModal(); };
document.getElementById('addrParseBtn').onclick = parsePastedText;
document.getElementById('addrManualAddBtn').onclick = addManualAddress;
['addrManualStreet', 'addrManualCity', 'addrManualState', 'addrManualZip'].forEach(id => {
  document.getElementById(id).onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); addManualAddress(); } };
});
document.getElementById('addrConfirmBtn').onclick = confirmAddresses;
document.getElementById('addrResetDefaultBtn').onclick = resetToDefaultStops;

// Init address file drop zone and tabs
initAddressUI();

// Autocomplete for manual add
setupAutocomplete(
  document.getElementById('addrManualSearch'),
  document.getElementById('addrAcList'),
  {pick({street, city, state: st, zip}) {
    document.getElementById('addrManualStreet').value = street;
    document.getElementById('addrManualCity').value = city;
    document.getElementById('addrManualState').value = st;
    document.getElementById('addrManualZip').value = zip;
    document.getElementById('addrManualSearch').value = street + (city ? ', ' + city : '');
    document.getElementById('addrManualStreet').focus();
  }}
);

// Autocomplete for home (end point)
setupAutocomplete(
  document.getElementById('homeInput'),
  document.getElementById('homeAcList'),
  {pick({street, city, state: st}) {
    const label = [street, city, st].filter(Boolean).join(', ');
    document.getElementById('homeInput').value = label;
  }, onEnter() { document.getElementById('homeConfirmBtn').click(); }}
);

// Autocomplete for start point
setupAutocomplete(
  document.getElementById('startInput'),
  document.getElementById('startAcList'),
  {pick({street, city, state: st}) {
    const label = [street, city, st].filter(Boolean).join(', ');
    document.getElementById('startInput').value = label;
  }, onEnter() { document.getElementById('startConfirmBtn').click(); }}
);

// Bottom sheet touch handling
const sheet = document.getElementById('bottomSheet');
const handle = document.getElementById('sheetHandle');

handle.addEventListener('click', () => {
  if (state.sheetState === 'expanded') setSheetState('peek');
  else if (state.sheetState === 'peek') setSheetState('expanded');
  else setSheetState('peek');
});

let sheetStartY = 0, sheetStartTranslate = 0, sheetDragging = false, sheetLastY = 0, sheetVelocity = 0, sheetLastTime = 0;
handle.addEventListener('touchstart', e => {
  sheetDragging = true;
  sheetStartY = e.touches[0].clientY;
  sheetLastY = sheetStartY;
  sheetLastTime = Date.now();
  sheetVelocity = 0;
  const transform = window.getComputedStyle(sheet).transform;
  const matrix = new DOMMatrix(transform);
  sheetStartTranslate = matrix.m42;
  sheet.style.transition = 'none';
}, {passive: true});
document.addEventListener('touchmove', e => {
  if (!sheetDragging) return;
  const y = e.touches[0].clientY;
  const now = Date.now();
  const dt = now - sheetLastTime;
  if (dt > 0) sheetVelocity = (y - sheetLastY) / dt;
  sheetLastY = y; sheetLastTime = now;
  const dy = y - sheetStartY;
  const newY = Math.max(-10, sheetStartTranslate + dy);
  sheet.style.transform = `translateY(${newY}px)`;
}, {passive: true});
document.addEventListener('touchend', () => {
  if (!sheetDragging) return; sheetDragging = false;
  sheet.style.transition = '';
  const transform = window.getComputedStyle(sheet).transform;
  const matrix = new DOMMatrix(transform);
  const y = matrix.m42;
  const sheetH = sheet.offsetHeight;
  if (sheetVelocity > 0.5) setSheetState('collapsed');
  else if (sheetVelocity < -0.5) setSheetState('expanded');
  else if (y > sheetH * 0.55) setSheetState('collapsed');
  else if (y < sheetH * 0.2) setSheetState('expanded');
  else setSheetState('peek');
});

// Service Worker
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

// Offline detection
function updateOnlineStatus() {
  if (!navigator.onLine) {
    showError('You are offline — cached routes still available, but new routing will fail when reconnected');
  } else {
    hideError();
  }
}
window.addEventListener('online', updateOnlineStatus);
window.addEventListener('offline', updateOnlineStatus);

// Init
if (navigator.geolocation) {
  navigator.geolocation.getCurrentPosition(pos => {
    state.gpsPos = {lat: pos.coords.latitude, lng: pos.coords.longitude, acc: pos.coords.accuracy};
    if (!state.startPoint && state.SPOTS.length) { state.durationMatrix = null; render(); }
    else { state.suppressFitBounds = true; renderView(); }
  }, () => {
    toast('GPS unavailable — using default route start');
  }, {enableHighAccuracy: true, timeout: 10000});
}
if (!navigator.onLine) updateOnlineStatus();
document.getElementById('progressBar').style.width = `${state.SPOTS.length ? (state.visitedSet.size / state.SPOTS.length) * 100 : 0}%`;
render();
