import { state, STORE_V, saveSet, saveJSON } from './state.js';
import { toast } from './utils.js';
import { setView, zoomIn, zoomOut } from './map.js';
import { render, renderView, renderStopList, toggleVisited, computeMaxClusters,
  setSheetState, toggleRouteDropdown, closeRouteDropdown } from './ui.js';
import { exportRoute, exportToGoogleMaps, exportToAppleMaps } from './exports.js';
import { showShareModal } from './share.js';
import { showHomeModal, hideHomeModal, confirmHome, showStartModal, hideStartModal, confirmStart } from './modals.js';
import { showAddrModal, hideAddrModal, clearAllStops, setupAutocomplete, parsePastedText, confirmAddresses, initAddressUI, setImportMode } from './address-manager.js';
import { openQuickAdd, closeQuickAdd, isQuickAddOpen } from './quick-add.js';
import { startTour, resetTour, dismissTour, isTourActive } from './tour.js';
import { requestLocationWithPrompt } from './geolocation.js';
import { SLIDER_DEBOUNCE_MS, MOBILE_BREAKPOINT_PX, DEFAULT_ZOOM_FOR_GPS } from './constants.js';
import { confirm } from './confirm.js';

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

  // Cluster sliders (sync all three controls)
  const slider = document.getElementById('clusterSlider');
  const sliderVal = document.getElementById('clusterVal');
  const sliderMobile = document.getElementById('clusterSliderMobile');
  const sliderValMobile = document.getElementById('clusterValMobile');
  const sliderPanel = document.getElementById('clusterSliderPanel');
  const sliderValPanel = document.getElementById('clusterPanelVal');
  const clusterDecrease = document.getElementById('clusterDecrease');
  const clusterIncrease = document.getElementById('clusterIncrease');

  let sliderTO = null;

  function updateAllClusterControls(value) {
    const val = +value;
    state.numClusters = val;
    state.activeFilter = -1;
    sliderVal.textContent = val;
    sliderValMobile.textContent = val;
    sliderValPanel.textContent = val;
    slider.value = val;
    sliderMobile.value = val;
    sliderPanel.value = val;
    clearTimeout(sliderTO);
    sliderTO = setTimeout(render, SLIDER_DEBOUNCE_MS);
  }

  slider.oninput = () => updateAllClusterControls(slider.value);
  sliderMobile.oninput = () => updateAllClusterControls(sliderMobile.value);
  sliderPanel.oninput = () => updateAllClusterControls(sliderPanel.value);
  clusterDecrease.onclick = () => { const val = Math.max(1, state.numClusters - 1); updateAllClusterControls(val); };
  clusterIncrease.onclick = () => { const val = Math.min(computeMaxClusters(), state.numClusters + 1); updateAllClusterControls(val); };

  const MAX_CLUSTERS = computeMaxClusters();
  slider.max = MAX_CLUSTERS;
  slider.setAttribute('max', MAX_CLUSTERS);
  sliderMobile.max = MAX_CLUSTERS;
  sliderMobile.setAttribute('max', MAX_CLUSTERS);
  sliderPanel.max = MAX_CLUSTERS;
  sliderPanel.setAttribute('max', MAX_CLUSTERS);

  // Sync slider DOM values from state on init. The HTML markup hard-codes
  // value="1", so a shared link or a stored state with numClusters > 1 would
  // otherwise show "Split into 1 route" while the planner produced N. Clamp
  // to the live max so we never render an out-of-range value.
  const initialClusters = Math.max(1, Math.min(MAX_CLUSTERS, state.numClusters || 1));
  state.numClusters = initialClusters;
  slider.value = initialClusters;
  sliderMobile.value = initialClusters;
  sliderPanel.value = initialClusters;
  sliderVal.textContent = initialClusters;
  sliderValMobile.textContent = initialClusters;
  sliderValPanel.textContent = initialClusters;

  // Buttons
  document.getElementById('resetBtn').onclick = async () => {
    if (!state.visitedSet.size) { state.visitedSet.clear(); saveSet(STORE_V, state.visitedSet); state.durationMatrix = null; render(); toast('Reset'); return; }
    const confirmed = await confirm('Reset all progress? This will unmark all visited stops.', { okText: 'Reset', dangerous: true });
    if (confirmed) { state.visitedSet.clear(); saveSet(STORE_V, state.visitedSet); state.durationMatrix = null; render(); toast('Reset'); }
  };
  document.getElementById('setHomeBtn').onclick = showHomeModal;
  document.getElementById('setStartBtn').onclick = showStartModal;
  const topCard = document.getElementById('topCard');
  const toggleTopCard = () => {
    if (isMobile()) { switchMobileView('plan'); }
    else { setSheetState(state.sheetState === 'expanded' ? 'peek' : 'expanded'); }
  };
  topCard.onclick = toggleTopCard;
  topCard.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleTopCard(); }
  });
  document.getElementById('gmapsFullRouteBtn').onclick = exportToGoogleMaps;
  document.getElementById('appleMapsBtn').onclick = exportToAppleMaps;
  document.getElementById('shareRouteBtn').onclick = showShareModal;

  // Panel toggle
  let panelHidden = false;
  document.getElementById('panelToggle').onclick = () => {
    panelHidden = !panelHidden;
    document.getElementById('bottomSheet').classList.toggle('panel-hidden', panelHidden);
    document.querySelector('.map-controls').classList.toggle('panel-hidden', panelHidden);
    document.getElementById('panelToggle').classList.toggle('panel-hidden', panelHidden);
    document.getElementById('panelToggle').innerHTML = panelHidden
      ? '<svg viewBox="0 0 12 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 4l-4 4 4 4"/></svg>'
      : '<svg viewBox="0 0 12 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 4l4 4-4 4"/></svg>';
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
    // Locked on while the Visited filter is active — there's nothing else to
    // show. The dropdown selection is the right way to leave that view.
    if (state.activeFilter === -2) { toast('Visited filter is active'); return; }
    state.showVisitedMarkers = !state.showVisitedMarkers;
    state.suppressFitBounds = true;
    renderView();
  };

  document.getElementById('tourBtn').onclick = () => { resetTour(); startTour(render); };

  // Keyboard shortcuts
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      if (isTourActive()) { dismissTour(); return; }
      if (isQuickAddOpen()) { closeQuickAdd(); return; }
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
    else if (e.key === 's' || e.key === 'S') showShareModal();
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

  // Map FABs (bottom-left): quick-add + clear-all.
  document.getElementById('addStopFab').onclick = () => {
    if (isQuickAddOpen()) closeQuickAdd();
    else openQuickAdd();
  };
  document.getElementById('clearStopsFab').onclick = async () => {
    if (!state.SPOTS.length) return;
    const n = state.SPOTS.length;
    const ok = await confirm(`Remove all ${n} stop${n === 1 ? '' : 's'}? Your start and end points are kept.`, { okText: 'Clear', dangerous: true });
    if (!ok) return;
    const undo = clearAllStops();
    toast(`Cleared ${n} stop${n === 1 ? '' : 's'}`, undo ? { undo } : undefined);
  };

  // Address manager (bulk + power-user surface)
  document.getElementById('manageStopsBtn').onclick = showAddrModal;
  // Empty-state CTA → quick-add (most users want a single address).
  document.getElementById('emptyImportBtn').onclick = openQuickAdd;
  // Inline "Manage" badge → bulk modal.
  document.getElementById('importStopsInlineBtn').onclick = showAddrModal;
  document.getElementById('addrCloseBtnX').onclick = hideAddrModal;
  document.getElementById('addrModal').onclick = e => { if (e.target.id === 'addrModal') hideAddrModal(); };
  document.getElementById('addrParseBtn').onclick = parsePastedText;
  document.getElementById('addrConfirmBtn').onclick = confirmAddresses;
  document.getElementById('addrModeAppend').onclick = () => setImportMode('append');
  document.getElementById('addrModeReplace').onclick = () => setImportMode('replace');

  // Init address file drop zone and tabs
  initAddressUI();

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
  updateTravelModeUI();
  updateGPSButtonState();

  // Expose updateGPSButtonState for geolocation.js to call
  window.updateGPSButtonState = updateGPSButtonState;
}
