import { state, getStartLocation, getActiveRoutes, VISITED_COLOR, PRIMARY_ROUTE_COLOR } from './state.js';
import { esc, fmtMi, fmtDur } from './utils.js';
import { map, clearMap, addMarker, addPolyline, stopIcon, homeIcon, gpsIcon, trackPopup, fitBounds, closePopup, setView } from './map.js';
import { render } from './planner.js';
import { toggleVisited, renderVisitedMarkersOnly, updateProgress } from './visited.js';
import { renderFilterBar, renderStats, renderRouteSettings, updateStopsInfo } from './ui-panels.js';
import { renderStopList, deleteStop } from './stop-list-render.js';
export { render, toggleVisited, renderStopList, deleteStop };

// Map: spotId → {marker, html}. Populated as renderView creates each marker.
// Used to re-open the same popup when the user clicks a panel row instead of
// a map marker.
const stopMarkerRegistry = new Map();

function focusStopFromMarker(spotId) {
  if (spotId == null) return;
  console.log('[ui] focusStopFromMarker', spotId);
  state.focusedStopId = spotId;
  // Re-render only the side panel — full renderView would tear down all map
  // markers and pop the popup we just opened.
  try { renderStopList(); } catch {}
  // Scroll the highlighted row into view (desktop). On mobile the panel is
  // not visible until the user expands it; the highlight will already be in
  // place when they switch to Plan view.
  setTimeout(() => {
    const row = document.querySelector(`.stop-item[data-spot-id="${spotId}"]`);
    if (row) row.scrollIntoView({behavior: 'smooth', block: 'center'});
  }, 50);
}

function openStopPopupAt(marker, html, spotId) {
  const lngLat = marker.getLngLat && marker.getLngLat();
  if (!lngLat) return;
  closePopup();
  if (spotId != null) focusStopFromMarker(spotId);
  const targetZoom = Math.max(map.getZoom(), 13);
  setView([lngLat.lat, lngLat.lng], targetZoom);
  const popup = new maplibregl.Popup({maxWidth: '260px', className: 'stop-popup-wrap', offset: 16})
    .setLngLat(lngLat)
    .setHTML(html)
    .addTo(map);
  trackPopup(popup);
}

function bindPopup(marker, html, opts = {}) {
  if (!marker || marker._invalid) return;
  const el = marker._el || marker.getElement();
  if (!el) return;
  if (opts.spotId != null) stopMarkerRegistry.set(opts.spotId, { marker, html });
  el.addEventListener('click', e => {
    e.stopPropagation();
    openStopPopupAt(marker, html, opts.spotId);
  });
}

const VISIT_CHECK_SVG = '<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 6.5l2.5 2.5 4.5-5"/></svg>';
const START_MARKER_HTML = '<div style="width:20px;height:20px;background:#0a84ff;border:2px solid #fff;border-radius:50%;box-shadow:0 2px 6px rgba(0,0,0,.3);display:flex;align-items:center;justify-content:center;color:#fff"><svg width="9" height="9" viewBox="0 0 9 9" fill="currentColor" aria-hidden="true"><path d="M2 1.5v6l5-3z"/></svg></div>';

function popupAddrLine(spot) {
  const addr = [spot.city, spot.state, spot.zip].filter(Boolean).join(', ');
  return addr ? `<div class="stop-popup-addr">${esc(addr)}</div>` : '';
}

function routeMoveControl(spot) {
  const routes = state.currentRoutes || [];
  if (routes.length < 2) return '';
  const currentIdx = state.visitedSet.has(spot.id)
    ? null
    : routes.findIndex(r => r.route.includes(state.SPOTS.findIndex(s => s.id === spot.id)));
  const overrideIdx = (state.routeOverrides || {})[spot.id];
  const selectedIdx = overrideIdx != null ? overrideIdx : currentIdx;
  const selected = selectedIdx != null && routes[selectedIdx];
  const triggerInner = selected
    ? `<span class="route-dropdown-dot" style="background:${selected.color}"></span><span class="route-dropdown-label">${esc(selected.name)}</span>`
    : `<span class="route-dropdown-label" style="color:var(--secondary)">Choose route…</span>`;
  const items = routes.map((r, i) => {
    const sel = (selectedIdx === i) ? ' selected' : '';
    return `<div class="stop-popup-move-item route-dropdown-item${sel}" data-move-idx="${i}" role="option">
      <span class="route-dropdown-dot" style="background:${r.color}"></span>
      <div class="route-dropdown-item-info"><div class="route-dropdown-item-name">${esc(r.name)}</div></div>
    </div>`;
  }).join('');
  return `<div class="stop-popup-move" data-move-spot-id="${spot.id}">
    <span class="stop-popup-move-label">Move to</span>
    <button type="button" class="stop-popup-move-trigger route-dropdown-trigger" aria-haspopup="listbox" aria-expanded="false">${triggerInner}</button>
    <div class="stop-popup-move-menu route-dropdown-menu" role="listbox">${items}</div>
  </div>`;
}

function stopPopupHTML(spot, num, color, opts = {}) {
  const visitBtn = opts.visitedAlready
    ? `<button class="stop-popup-btn stop-popup-btn-unvisit" data-visit-id="${spot.id}">${VISIT_CHECK_SVG} Unvisited</button>`
    : `<button class="stop-popup-btn stop-popup-btn-visit" data-visit-id="${spot.id}">${VISIT_CHECK_SVG} Visited</button>`;
  const deleteBtn = `<button class="stop-popup-btn stop-popup-btn-delete" data-delete-spot-id="${spot.id}" aria-label="Delete stop">${TRASH_SVG_POPUP} Delete</button>`;
  const label = opts.label || `Stop ${num}`;
  const leg = opts.leg
    ? `<div class="stop-popup-leg">${fmtMi(opts.leg.distance)} mi · ${fmtDur(opts.leg.duration)} from ${opts.legFrom || 'prev'}</div>`
    : '';
  const move = routeMoveControl(spot);
  return `<div class="stop-popup">
    <div class="stop-popup-label" style="color:${color}">${label}</div>
    <div class="stop-popup-street">${esc(spot.street || '')}</div>
    ${popupAddrLine(spot)}
    ${leg}
    ${move}
    <div class="stop-popup-actions">${visitBtn}${deleteBtn}</div>
  </div>`;
}

// Same trash glyph as the inline panel button (.stop-item-trash) so the
// popup's Delete action and the row's quick-delete read as the same thing.
const TRASH_SVG_POPUP = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 4.5h10M5.5 4.5V3a1 1 0 011-1h3a1 1 0 011 1v1.5M4 4.5l.7 8.5a1 1 0 001 .9h4.6a1 1 0 001-.9L12 4.5M6.8 7.5v4M9.2 7.5v4"/></svg>';

function endpointPopup(point, label, color) {
  return `<div class="stop-popup"><div class="stop-popup-label" style="color:${color}">${label}</div><div class="stop-popup-street">${esc(point.label)}</div></div>`;
}

// Place start, end, and GPS markers and push their bounds. Returns nothing.
let gpsMarker = null;
function placeEndpointMarkers(bounds) {
  if (state.home && Number.isFinite(state.home.lat) && Number.isFinite(state.home.lng)) {
    const mk = addMarker(state.home.lat, state.home.lng, homeIcon());
    bindPopup(mk, endpointPopup(state.home, 'End Point', '#FF9500'));
    bounds.push([state.home.lat, state.home.lng]);
  }
  if (state.startPoint && Number.isFinite(state.startPoint.lat) && Number.isFinite(state.startPoint.lng)) {
    const mk = addMarker(state.startPoint.lat, state.startPoint.lng, {html: START_MARKER_HTML});
    bindPopup(mk, endpointPopup(state.startPoint, 'Start Point', '#0a84ff'));
    bounds.push([state.startPoint.lat, state.startPoint.lng]);
  }
  if (gpsMarker) { gpsMarker.remove(); gpsMarker = null; }
  if (state.gpsPos && Number.isFinite(state.gpsPos.lat) && Number.isFinite(state.gpsPos.lng)) {
    gpsMarker = addMarker(state.gpsPos.lat, state.gpsPos.lng, gpsIcon());
  }
}

function fitToBounds(bounds) {
  if (bounds.length && !state.suppressFitBounds) {
    const isDesktop = window.innerWidth >= 768;
    const padding = isDesktop ? {paddingTopLeft: [60, 80], paddingBottomRight: [420, 60]} : {padding: [60, 220]};
    fitBounds(bounds, padding);
  }
  state.suppressFitBounds = false;
}

function renderPanels() {
  const isCalculating = document.getElementById('loading').classList.contains('active');
  renderFilterBar(closeRouteDropdown, renderView);
  renderStats(isCalculating);
  renderStopList();
  renderRouteSettings(isCalculating);
  updateProgress();
  updateStopsInfo();
  document.getElementById('travelModeBar').classList.toggle('show', state.SPOTS.length > 0);
}


// Visited filter (-2) implies the visited markers must be on screen — there's
// nothing else to show. Force the toggle on while the filter is active and
// snap it back to the user's prior choice (default off) when they leave.
let visitedToggleSavedState = null;
function syncVisitedToggleForFilter() {
  const btn = document.getElementById('toggleVisitedBtn');
  if (state.activeFilter === -2) {
    if (visitedToggleSavedState === null) visitedToggleSavedState = state.showVisitedMarkers;
    state.showVisitedMarkers = true;
  } else if (visitedToggleSavedState !== null) {
    state.showVisitedMarkers = false;
    visitedToggleSavedState = null;
  }
  if (btn) {
    btn.style.opacity = state.showVisitedMarkers ? '1' : '.5';
    btn.style.color = state.showVisitedMarkers ? 'var(--green)' : '';
    btn.disabled = state.activeFilter === -2;
    btn.style.cursor = state.activeFilter === -2 ? 'not-allowed' : 'pointer';
  }
}

export function renderView() {
  // Drop the empty-state expanded sheet & resize map BEFORE projecting markers.
  // If the sheet is still .expanded (mobile full-screen) or the empty state is
  // still up, the map canvas has the wrong dimensions and markers project to
  // the wrong screen pixels. Running this first means addMarker() below sees
  // the final canvas size.
  // Clear marker focus on full re-renders — markers are torn down here, so
  // any highlighted row no longer corresponds to a visible marker. The user
  // re-clicks to bring it back.
  state.focusedStopId = null;
  syncVisitedToggleForFilter();
  updateEmptyState();
  clearMap();
  // Markers are torn down by clearMap — drop the registry so a stale entry
  // doesn't get re-opened by a panel click against a removed maplibre marker.
  stopMarkerRegistry.clear();
  const routes = getActiveRoutes();
  const bounds = [];
  const routeSpotIds = new Set();
  const lineWeight = routes.length === 1 ? 5 : 4;

  // Special case: Visited-only view (activeFilter === -2)
  if (state.activeFilter === -2) {
    renderVisitedMarkersOnly(bounds, bindPopup);
    placeEndpointMarkers(bounds);
    fitToBounds(bounds);
    renderPanels();
    return;
  }
  // If there are no resolved routes yet, render the raw stop list so users
  // see something while routing is loading or after a routing failure.
  if (!routes.length && state.SPOTS.length) {
    state.SPOTS.forEach((spot, i) => {
      try {
        if (state.visitedSet.has(spot.id) && !state.showVisitedMarkers) return;
        if (!Number.isFinite(spot.lat) || !Number.isFinite(spot.lng)) return;
        const visited = state.visitedSet.has(spot.id);
        const mk = addMarker(spot.lat, spot.lng, stopIcon(i + 1, PRIMARY_ROUTE_COLOR, visited, false));
        bindPopup(mk, stopPopupHTML(spot, i + 1, PRIMARY_ROUTE_COLOR, {visitedAlready: visited}), {spotId: spot.id});
        bounds.push([spot.lat, spot.lng]);
      } catch (err) {
        console.warn('renderView: skipped stop', i, err);
      }
    });
  }
  routes.forEach(rd => {
    if (rd.geometry?.coordinates) {
      // geometry.coordinates is GeoJSON [lng, lat] — pass through unchanged.
      addPolyline(rd.geometry.coordinates, rd.color, lineWeight);
    }
    const spots = rd.route.map(i => typeof i === 'number' ? state.SPOTS[i] : i);
    const firstUnvisitedMap = spots.findIndex(s => !state.visitedSet.has((typeof s === 'number' ? state.SPOTS[s] : s).id));
    const legOffset = getStartLocation() ? 1 : 0;
    spots.forEach((s, i) => {
      try {
        const spot = typeof s === 'number' ? state.SPOTS[s] : s;
        if (!spot || !Number.isFinite(spot.lat) || !Number.isFinite(spot.lng)) return;
        routeSpotIds.add(spot.id);
        const curr = i === firstUnvisitedMap || (firstUnvisitedMap === -1 && i === 0);
        const mk = addMarker(spot.lat, spot.lng, stopIcon(i + 1, rd.color, false, curr));
        const leg = rd.legs && rd.legs[legOffset + i];
        bindPopup(mk, stopPopupHTML(spot, i + 1, rd.color, {leg, legFrom: i === 0 ? 'start' : 'prev'}), {spotId: spot.id});
        bounds.push([spot.lat, spot.lng]);
      } catch (err) {
        console.warn('renderView: skipped routed stop', i, err);
      }
    });
  });
  if (state.showVisitedMarkers) {
    state.SPOTS.filter(s => state.visitedSet.has(s.id) && !routeSpotIds.has(s.id) && Number.isFinite(s.lat) && Number.isFinite(s.lng)).forEach(spot => {
      try {
        const mk = addMarker(spot.lat, spot.lng, stopIcon('', VISITED_COLOR, true, false));
        bindPopup(mk, stopPopupHTML(spot, 0, VISITED_COLOR, {label: 'Visited', visitedAlready: true}), {spotId: spot.id});
      } catch (err) {
        console.warn('renderView: skipped visited marker', err);
      }
    });
  }
  placeEndpointMarkers(bounds);
  fitToBounds(bounds);
  renderPanels();
}

export function toggleRouteDropdown() {
  const trigger = document.getElementById('routeDropdownTrigger');
  const menu = document.getElementById('routeDropdownMenu');
  const isOpen = menu.classList.contains('open');
  if (isOpen) closeRouteDropdown();
  else { trigger.classList.add('open'); menu.classList.add('open'); }
}

export function closeRouteDropdown() {
  document.getElementById('routeDropdownTrigger').classList.remove('open');
  document.getElementById('routeDropdownMenu').classList.remove('open');
}

function updateEmptyState() {
  const empty = document.getElementById('emptyState');
  const stopsView = document.getElementById('stopsView');
  const sheet = document.getElementById('bottomSheet');
  const clearFab = document.getElementById('clearStopsFab');
  const topBar = document.querySelector('.top-bar');
  const hasStops = state.SPOTS.length > 0;
  // Trash FAB is meaningless without stops — hide it.
  if (clearFab) clearFab.style.display = hasStops ? '' : 'none';
  if (!hasStops) {
    empty.style.display = 'block'; stopsView.style.display = 'none';
    sheet.classList.add('expanded');
    topBar.style.display = 'none';
  } else {
    empty.style.display = 'none'; stopsView.style.display = '';
    // Releasing the empty-state expanded sheet — otherwise on mobile it
    // covers the entire map (markers rendered behind a fullscreen panel)
    // and on desktop fitBounds measures stale canvas dimensions.
    sheet.classList.remove('expanded');
    if (state.sheetState === 'expanded') state.sheetState = 'peek';
    topBar.style.display = '';
    // Resize the map canvas synchronously: callers (renderView) place markers
    // immediately after, so we need correct canvas dimensions NOW rather than
    // on the next rAF — otherwise marker projection is stale by one frame.
    try { map.resize(); } catch {}
  }
}

export function computeMaxClusters() {
  const n = state.SPOTS.length;
  if (n < 2) return 1;
  const MIN_PER_CLUSTER = 3;
  const maxBySize = Math.max(1, Math.floor(n / MIN_PER_CLUSTER));
  const cities = new Set(state.SPOTS.map(s => s.city).filter(Boolean));
  const maxByCities = Math.max(1, cities.size);
  // Cap at the number of stops (k can't exceed n) and at least 1.
  return Math.max(1, Math.min(n, maxBySize, maxByCities));
}

export function setSheetState(s) {
  state.sheetState = s;
  const sheet = document.getElementById('bottomSheet');
  sheet.classList.remove('collapsed', 'expanded');
  if (s === 'collapsed') sheet.classList.add('collapsed');
  else if (s === 'expanded') sheet.classList.add('expanded');
}

document.addEventListener('click', e => {
  const visitBtn = e.target.closest('[data-visit-id]');
  if (visitBtn) {
    const id = parseInt(visitBtn.dataset.visitId, 10);
    if (Number.isFinite(id)) { toggleVisited(id); closePopup(); }
    return;
  }
  const delBtn = e.target.closest('[data-delete-spot-id]');
  if (delBtn) {
    const id = parseInt(delBtn.dataset.deleteSpotId, 10);
    if (Number.isFinite(id)) { closePopup(); deleteStop(id); }
  }
});

document.addEventListener('click', e => {
  const trigger = e.target.closest('.stop-popup-move-trigger');
  if (trigger) {
    e.stopPropagation();
    const wrap = trigger.closest('.stop-popup-move');
    const menu = wrap && wrap.querySelector('.stop-popup-move-menu');
    if (!menu) return;
    const isOpen = menu.classList.contains('open');
    document.querySelectorAll('.stop-popup-move-menu.open').forEach(m => m.classList.remove('open'));
    document.querySelectorAll('.stop-popup-move-trigger.open').forEach(t => {
      t.classList.remove('open');
      t.setAttribute('aria-expanded', 'false');
    });
    if (!isOpen) {
      menu.classList.add('open');
      trigger.classList.add('open');
      trigger.setAttribute('aria-expanded', 'true');
    }
    return;
  }
  const item = e.target.closest('.stop-popup-move-item');
  if (item) {
    e.stopPropagation();
    const wrap = item.closest('.stop-popup-move');
    const id = wrap && parseInt(wrap.dataset.moveSpotId, 10);
    const ridx = parseInt(item.dataset.moveIdx, 10);
    if (!Number.isFinite(id) || !Number.isFinite(ridx)) return;
    closePopup();
    import('./stop-list-render.js').then(m => m.setRouteOverride(id, ridx));
    return;
  }
  // Click outside any open move menu — close it.
  document.querySelectorAll('.stop-popup-move-menu.open').forEach(m => m.classList.remove('open'));
  document.querySelectorAll('.stop-popup-move-trigger.open').forEach(t => {
    t.classList.remove('open');
    t.setAttribute('aria-expanded', 'false');
  });
});

// Panel rows dispatch this when the user clicks; we re-open the same popup
// the marker click would show. Decoupled via custom event so stop-list-render
// doesn't need to import map/popup helpers (avoids a circular dep).
document.addEventListener('routeflow:show-stop-popup', e => {
  const spotId = e.detail && e.detail.spotId;
  if (spotId == null) return;
  const entry = stopMarkerRegistry.get(spotId);
  if (!entry) return;
  openStopPopupAt(entry.marker, entry.html, spotId);
});
