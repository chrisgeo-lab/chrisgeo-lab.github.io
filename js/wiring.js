import { state, STORE_V, saveSet, saveJSON } from './state.js';
import { toast } from './utils.js';
import { setView, zoomIn, zoomOut } from './map.js';
import { render, renderView, renderStopList, toggleVisited, computeMaxClusters,
  setSheetState, toggleRouteDropdown, closeRouteDropdown } from './ui.js';
import { exportRoute, exportToGoogleMaps, exportToAppleMaps } from './exports.js';
import { showHomeModal, hideHomeModal, confirmHome, showStartModal, hideStartModal, confirmStart } from './modals.js';
import { showAddrModal, hideAddrModal, resetToDefaultStops, clearAllAppData, setupAutocomplete, parsePastedText, addManualAddress, confirmAddresses, initAddressUI, setImportMode } from './address-manager.js';
import { startTour, resetTour, dismissTour, isTourActive } from './tour.js';
import { requestLocationWithPrompt } from './geolocation.js';
import { SLIDER_DEBOUNCE_MS, MOBILE_BREAKPOINT_PX, DEFAULT_ZOOM_FOR_GPS } from './constants.js';

function isMobile() { return window.innerWidth < MOBILE_BREAKPOINT_PX; }

function updateGPSButtonState() {
  const btn = document.getElementById('gpsLocBtn');
  const gpsUnavailable = state.gpsState === 'unavailable' || state.gpsState === 'denied';
  btn.style.opacity = gpsUnavailable ? '0.3' : '1';
  btn.style.cursor = gpsUnavailable ? 'not-allowed' : 'pointer';
  btn.title = gpsUnavailable
    ? (state.gpsState === 'unavailable' ? 'GPS not available' : 'GPS permission denied')
    : 'My location';
}

function switchMobileView(view) {
  const navMap = document.getElementById('mobileNavMap');
  const navPlan = document.getElementById('mobileNavPlan');
  const bs = document.getElementById('bottomSheet');
  bs.style.transform = '';
  if (view === 'plan') {
    navPlan.classList.add('active');
    navMap.classList.remove('active');
    bs.classList.add('mobile-plan-visible');
  } else {
    navMap.classList.add('active');
    navPlan.classList.remove('active');
    bs.classList.remove('mobile-plan-visible');
  }
}

function updateTravelModeUI() {
  const bar = document.getElementById('travelModeBar');
  bar.classList.toggle('show', state.SPOTS.length > 0);
  document.querySelectorAll('.travel-mode-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.mode === state.travelMode);
  });
}

/** Wire all DOM event handlers (buttons, modals, autocompletes, keyboard, mobile nav, travel-mode). */
export function initWiring() {
  // Route dropdown
  document.getElementById('routeDropdownTrigger').onclick = toggleRouteDropdown;
  document.addEventListener('click', e => {
    if (!e.target.closest('.filter-row')) closeRouteDropdown();
  });

  // Cluster slider
  const slider = document.getElementById('clusterSlider');
  const sliderVal = document.getElementById('clusterVal');
  let sliderTO = null;
  slider.oninput = () => { sliderVal.textContent = slider.value; state.numClusters = +slider.value; state.activeFilter = -1; clearTimeout(sliderTO); sliderTO = setTimeout(render, SLIDER_DEBOUNCE_MS); };

  const MAX_CLUSTERS = computeMaxClusters();
  slider.max = MAX_CLUSTERS;
  slider.setAttribute('max', MAX_CLUSTERS);

  // Buttons
  document.getElementById('resetBtn').onclick = () => {
    if (!state.visitedSet.size || confirm('Reset all progress?')) { state.visitedSet.clear(); saveSet(STORE_V, state.visitedSet); state.durationMatrix = null; render(); toast('Reset'); }
  };
  document.getElementById('setHomeBtn').onclick = showHomeModal;
  document.getElementById('setStartBtn').onclick = showStartModal;
  document.getElementById('topCard').onclick = () => {
    if (isMobile()) { switchMobileView('plan'); }
    else { setSheetState(state.sheetState === 'expanded' ? 'peek' : 'expanded'); }
  };
  document.getElementById('gmapsFullRouteBtn').onclick = exportToGoogleMaps;
  document.getElementById('appleMapsBtn').onclick = exportToAppleMaps;

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
  document.getElementById('zoomInBtn').onclick = () => zoomIn();
  document.getElementById('zoomOutBtn').onclick = () => zoomOut();
  document.getElementById('gpsLocBtn').onclick = async () => {
    if (state.gpsState === 'unavailable') {
      toast('GPS is not available on this device');
      return;
    }
    if (state.gpsState === 'denied') {
      toast('GPS permission denied. Enable location services in your browser settings.');
      return;
    }
    if (state.gpsPos) { setView([state.gpsPos.lat, state.gpsPos.lng], DEFAULT_ZOOM_FOR_GPS); return; }
    const location = await requestLocationWithPrompt();
    if (location) {
      setView([location.lat, location.lng], DEFAULT_ZOOM_FOR_GPS);
      state.suppressFitBounds = true;
      renderView();
    }
  };
  document.getElementById('toggleVisitedBtn').onclick = () => {
    state.showVisitedMarkers = !state.showVisitedMarkers;
    document.getElementById('toggleVisitedBtn').style.opacity = state.showVisitedMarkers ? '1' : '.5';
    document.getElementById('toggleVisitedBtn').style.color = state.showVisitedMarkers ? 'var(--green)' : '';
    state.suppressFitBounds = true;
    renderView();
  };

  document.getElementById('tourBtn').onclick = () => { resetTour(); startTour(render); };

  // Keyboard shortcuts
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      if (isTourActive()) { dismissTour(); return; }
      if (document.getElementById('addrModal').classList.contains('show')) { hideAddrModal(); return; }
      if (document.getElementById('homeModal').classList.contains('show')) { hideHomeModal(); return; }
      if (document.getElementById('startModal').classList.contains('show')) { hideStartModal(); return; }
      if (isMobile()) { switchMobileView('map'); } else { setSheetState('collapsed'); } return;
    }
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (e.key === 'h' || e.key === 'H') showHomeModal();
    else if (e.key === 'r' || e.key === 'R') { document.getElementById('resetBtn').click(); }
    else if (e.key === 'e') exportToGoogleMaps();
    else if (e.key === 'E') exportRoute();
    else if (e.key === '=' || e.key === '+') zoomIn();
    else if (e.key === '-') zoomOut();
    else if (e.key === '?') { resetTour(); startTour(render); }
    else if (e.key >= '1' && e.key <= '9') {
      const idx = parseInt(e.key) - 1;
      if (idx < state.currentRoutes.length) { state.activeFilter = state.activeFilter === idx ? -1 : idx; renderView(); }
    }
  });

  // Search
  document.getElementById('searchInput').oninput = () => renderStopList();

  // Home modal
  document.getElementById('homeCancelBtn').onclick = hideHomeModal;
  document.getElementById('homeConfirmBtn').onclick = confirmHome;
  document.getElementById('homeInput').onkeydown = (e) => { if (e.key === 'Enter') confirmHome(); };
  document.getElementById('homeModal').onclick = e => { if (e.target.id === 'homeModal') hideHomeModal(); };

  // Start modal
  document.getElementById('startCancelBtn').onclick = hideStartModal;
  document.getElementById('startConfirmBtn').onclick = confirmStart;
  document.getElementById('startInput').onkeydown = (e) => { if (e.key === 'Enter') confirmStart(); };
  document.getElementById('startModal').onclick = e => { if (e.target.id === 'startModal') hideStartModal(); };

  // Address manager
  document.getElementById('manageStopsBtn').onclick = showAddrModal;
  document.getElementById('emptyImportBtn').onclick = showAddrModal;
  document.getElementById('importStopsInlineBtn').onclick = showAddrModal;
  document.getElementById('fabAddStops').onclick = showAddrModal;
  document.getElementById('addrCancelBtn').onclick = hideAddrModal;
  document.getElementById('addrCloseBtnX').onclick = hideAddrModal;
  document.getElementById('addrModal').onclick = e => { if (e.target.id === 'addrModal') hideAddrModal(); };
  document.getElementById('addrParseBtn').onclick = parsePastedText;
  document.getElementById('addrManualAddBtn').onclick = addManualAddress;
  ['addrManualStreet', 'addrManualCity', 'addrManualState', 'addrManualZip'].forEach(id => {
    document.getElementById(id).onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); addManualAddress(); } };
  });
  document.getElementById('addrConfirmBtn').onclick = confirmAddresses;
  document.getElementById('addrResetDefaultBtn').onclick = resetToDefaultStops;
  document.getElementById('addrClearDataBtn').onclick = clearAllAppData;
  document.getElementById('addrModeAppend').onclick = () => setImportMode('append');
  document.getElementById('addrModeReplace').onclick = () => setImportMode('replace');

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

  // Mobile nav bar (Map/Plan toggle)
  document.getElementById('mobileNavMap').onclick = () => switchMobileView('map');
  document.getElementById('mobileNavPlan').onclick = () => switchMobileView('plan');

  // Travel mode toggle
  document.querySelectorAll('.travel-mode-btn').forEach(btn => {
    btn.onclick = () => {
      const mode = btn.dataset.mode;
      if (mode === state.travelMode) return;
      state.travelMode = mode;
      saveJSON('routeflow-travel-mode', mode);
      document.querySelectorAll('.travel-mode-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const modeLabels = {car: 'Drive', bike: 'Bike', walk: 'Walk'};
      const timeLabel = document.querySelector('#routeSummary .route-stat:nth-child(2) .route-stat-label');
      if (timeLabel) timeLabel.textContent = modeLabels[mode] || 'Drive';
      state.durationMatrix = null;
      state.osrmCache = {};
      state.currentRoutes = [];
      render();
      const labels = {car: 'Driving', bike: 'Biking', walk: 'Walking'};
      toast(labels[mode]);
    };
  });

  // Initial UI sync that depends on DOM being wired.
  document.getElementById('progressBar').style.width = `${state.SPOTS.length ? (state.visitedSet.size / state.SPOTS.length) * 100 : 0}%`;
  updateTravelModeUI();
  updateGPSButtonState();

  // Expose updateGPSButtonState for geolocation.js to call
  window.updateGPSButtonState = updateGPSButtonState;
}
