import { state, STOP_MIN, getStartLocation, getActiveRoutes } from './state.js';
import { esc, fmtMi, fmtDur } from './utils.js';
import { map, clearMap, addMarker, addPolyline, stopIcon, homeIcon, gpsIcon, trackPopup, setView, fitBounds, closePopup } from './map.js';
import { render } from './planner.js';
import { toggleVisited, renderVisitedMarkersOnly, updateProgress } from './visited.js';
import { renderFilterBar, renderStats, renderRouteSettings, renderVisitedOnlyView, updateStopsInfo } from './ui-panels.js';
export { render, toggleVisited };

let gpsMarker = null;

function bindPopup(marker, html) {
  if (!marker || marker._invalid) return;
  const el = marker._el || marker.getElement();
  if (!el) return;
  el.addEventListener('click', e => {
    e.stopPropagation();
    closePopup();
    // Guard the click closure: marker may have been removed between bind and click,
    // and the addMarker stub returns null from getLngLat() — passing null to setLngLat throws.
    const lngLat = marker.getLngLat && marker.getLngLat();
    if (!lngLat) return;
    const popup = new maplibregl.Popup({maxWidth: '220px', className: 'stop-popup-wrap', offset: 12})
      .setLngLat(lngLat)
      .setHTML(html)
      .addTo(map);
    trackPopup(popup);
  });
}


export function renderView() {
  // Drop the empty-state expanded sheet & resize map BEFORE projecting markers.
  // If the sheet is still .expanded (mobile full-screen) or the empty state is
  // still up, the map canvas has the wrong dimensions and markers project to
  // the wrong screen pixels. Running this first means addMarker() below sees
  // the final canvas size.
  updateEmptyState();
  clearMap();
  const routes = getActiveRoutes();
  const bounds = [];
  const routeSpotIds = new Set();
  const lineWeight = routes.length === 1 ? 5 : 4;

  // Special case: Visited-only view (activeFilter === -2)
  if (state.activeFilter === -2) {
    renderVisitedMarkersOnly(bounds, bindPopup);
    if (state.home && Number.isFinite(state.home.lat) && Number.isFinite(state.home.lng)) {
      const mk = addMarker(state.home.lat, state.home.lng, homeIcon());
      bindPopup(mk, `<div class="stop-popup"><div class="stop-popup-label" style="color:#FF9500">End Point</div><div class="stop-popup-street">${esc(state.home.label)}</div></div>`);
      bounds.push([state.home.lat, state.home.lng]);
    }
    if (state.startPoint && Number.isFinite(state.startPoint.lat) && Number.isFinite(state.startPoint.lng)) {
      const mk = addMarker(state.startPoint.lat, state.startPoint.lng, {html: '<div style="width:20px;height:20px;background:#007AFF;border:2px solid #fff;border-radius:50%;box-shadow:0 2px 6px rgba(0,0,0,.3);display:flex;align-items:center;justify-content:center;font-size:10px;color:#fff">&#9654;</div>'});
      bindPopup(mk, `<div class="stop-popup"><div class="stop-popup-label" style="color:#007AFF">Start Point</div><div class="stop-popup-street">${esc(state.startPoint.label)}</div></div>`);
      bounds.push([state.startPoint.lat, state.startPoint.lng]);
    }
    if (gpsMarker) { gpsMarker.remove(); gpsMarker = null; }
    if (state.gpsPos && Number.isFinite(state.gpsPos.lat) && Number.isFinite(state.gpsPos.lng)) {
      gpsMarker = addMarker(state.gpsPos.lat, state.gpsPos.lng, gpsIcon());
    }
    if (bounds.length && !state.suppressFitBounds) {
      const isDesktop = window.innerWidth >= 768;
      const padding = isDesktop ? {paddingTopLeft: [60, 80], paddingBottomRight: [420, 60]} : {padding: [60, 220]};
      fitBounds(bounds, padding);
    }
    state.suppressFitBounds = false;
    const isCalculating = document.getElementById('loading').classList.contains('active');
    renderFilterBar(closeRouteDropdown, renderView);
    renderStats(isCalculating);
    renderStopList();
    renderRouteSettings(isCalculating);
    updateProgress();
    updateStopsInfo();
    document.getElementById('travelModeBar').classList.toggle('show', state.SPOTS.length > 0);
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
        const mk = addMarker(spot.lat, spot.lng, stopIcon(i + 1, '#007AFF', visited, false));
        const addr = [spot.city, spot.state, spot.zip].filter(Boolean).join(', ');
        const popup = `<div class="stop-popup"><div class="stop-popup-label" style="color:#007AFF">Stop ${i + 1}</div><div class="stop-popup-street">${esc(spot.street || '')}</div>${addr ? `<div class="stop-popup-addr">${esc(addr)}</div>` : ''}<button class="stop-popup-btn stop-popup-btn-visit" data-visit-id="${spot.id}">&#10003; Mark Visited</button></div>`;
        bindPopup(mk, popup);
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
    spots.forEach((s, i) => {
      try {
        const spot = typeof s === 'number' ? state.SPOTS[s] : s;
        if (!spot || !Number.isFinite(spot.lat) || !Number.isFinite(spot.lng)) return;
        const sid = spot.id;
        routeSpotIds.add(sid);
        const curr = i === firstUnvisitedMap || (firstUnvisitedMap === -1 && i === 0);
        const mk = addMarker(spot.lat, spot.lng, stopIcon(i + 1, rd.color, false, curr));
        const legOffset = getStartLocation() ? 1 : 0;
        const legInfo = rd.legs && rd.legs[legOffset + i];
        const addr = [spot.city, spot.state, spot.zip].filter(Boolean).join(', ');
        let popup = `<div class="stop-popup"><div class="stop-popup-label" style="color:${rd.color}">Stop ${i + 1}</div><div class="stop-popup-street">${esc(spot.street)}</div>${addr ? `<div class="stop-popup-addr">${esc(addr)}</div>` : ''}`;
        if (legInfo) popup += `<div class="stop-popup-leg">${fmtMi(legInfo.distance)} mi · ${fmtDur(legInfo.duration)} from ${i === 0 ? 'start' : 'prev'}</div>`;
        popup += `<button class="stop-popup-btn stop-popup-btn-visit" data-visit-id="${sid}">&#10003; Mark Visited</button></div>`;
        bindPopup(mk, popup);
        bounds.push([spot.lat, spot.lng]);
      } catch (err) {
        console.warn('renderView: skipped routed stop', i, err);
      }
    });
  });
  if (state.showVisitedMarkers) {
    state.SPOTS.filter(s => state.visitedSet.has(s.id) && !routeSpotIds.has(s.id) && Number.isFinite(s.lat) && Number.isFinite(s.lng)).forEach(spot => {
      try {
        const mk = addMarker(spot.lat, spot.lng, stopIcon('&#10003;', '#aeaeb2', true, false));
        const addr = [spot.city, spot.state, spot.zip].filter(Boolean).join(', ');
        let popup = `<div class="stop-popup"><div class="stop-popup-label" style="color:#aeaeb2">Visited</div><div class="stop-popup-street">${esc(spot.street)}</div>${addr ? `<div class="stop-popup-addr">${esc(addr)}</div>` : ''}`;
        popup += `<button class="stop-popup-btn stop-popup-btn-unvisit" data-visit-id="${spot.id}">Mark Unvisited</button></div>`;
        bindPopup(mk, popup);
      } catch (err) {
        console.warn('renderView: skipped visited marker', err);
      }
    });
  }
  if (state.home && Number.isFinite(state.home.lat) && Number.isFinite(state.home.lng)) {
    const mk = addMarker(state.home.lat, state.home.lng, homeIcon());
    bindPopup(mk, `<div class="stop-popup"><div class="stop-popup-label" style="color:#FF9500">End Point</div><div class="stop-popup-street">${esc(state.home.label)}</div></div>`);
    bounds.push([state.home.lat, state.home.lng]);
  }
  if (state.startPoint && Number.isFinite(state.startPoint.lat) && Number.isFinite(state.startPoint.lng)) {
    const mk = addMarker(state.startPoint.lat, state.startPoint.lng, {html: '<div style="width:20px;height:20px;background:#007AFF;border:2px solid #fff;border-radius:50%;box-shadow:0 2px 6px rgba(0,0,0,.3);display:flex;align-items:center;justify-content:center;font-size:10px;color:#fff">&#9654;</div>'});
    bindPopup(mk, `<div class="stop-popup"><div class="stop-popup-label" style="color:#007AFF">Start Point</div><div class="stop-popup-street">${esc(state.startPoint.label)}</div></div>`);
    bounds.push([state.startPoint.lat, state.startPoint.lng]);
  }
  if (gpsMarker) { gpsMarker.remove(); gpsMarker = null; }
  if (state.gpsPos && Number.isFinite(state.gpsPos.lat) && Number.isFinite(state.gpsPos.lng)) {
    gpsMarker = addMarker(state.gpsPos.lat, state.gpsPos.lng, gpsIcon());
  }
  if (bounds.length && !state.suppressFitBounds) {
    const isDesktop = window.innerWidth >= 768;
    const padding = isDesktop ? {paddingTopLeft: [60, 80], paddingBottomRight: [420, 60]} : {padding: [60, 220]};
    fitBounds(bounds, padding);
  }
  state.suppressFitBounds = false;

  const isCalculating = document.getElementById('loading').classList.contains('active');
  renderFilterBar(closeRouteDropdown, renderView);
  renderStats(isCalculating);
  renderStopList();
  renderRouteSettings(isCalculating);
  updateProgress();
  updateStopsInfo();
  document.getElementById('travelModeBar').classList.toggle('show', state.SPOTS.length > 0);
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

export function renderStopList() {
  const el = document.getElementById('stopsView'); el.innerHTML = '';
  const routes = getActiveRoutes();
  const query = (document.getElementById('searchInput')?.value || '').trim().toLowerCase();

  // Special case: Visited-only view (activeFilter === -2)
  if (state.activeFilter === -2) {
    renderVisitedOnlyView(el, query);
    return;
  }

  // No resolved route yet — show stops in import order so the panel isn't blank.
  if (!routes.length && state.SPOTS.length) {
    state.SPOTS.forEach((spot, i) => {
      if (query && !spot.street.toLowerCase().includes(query) && (!spot.city || !spot.city.toLowerCase().includes(query))) return;
      const visited = state.visitedSet.has(spot.id);
      const item = document.createElement('div');
      item.className = 'stop-item' + (visited ? ' visited' : '');
      item.innerHTML = `
        <div class="stop-item-check" role="checkbox" tabindex="0" aria-checked="${visited}" aria-label="Toggle ${esc(spot.street || 'stop')} visited">${visited ? '&#10003;' : ''}</div>
        <div class="stop-item-num" style="background:#007AFF">${i + 1}</div>
        <div class="stop-item-info">
          <div class="stop-item-name">${esc(spot.street || `Stop ${i + 1}`)}</div>
          <div class="stop-item-detail"><span>${esc(spot.city || '')}${spot.state ? ', ' + esc(spot.state) : ''}</span></div>
        </div>`;
      item.querySelector('.stop-item-check').onclick = (e) => { e.stopPropagation(); toggleVisited(spot.id); };
      item.onclick = () => setView([spot.lat, spot.lng], 16);
      el.appendChild(item);
    });
    return;
  }
  routes.forEach((rd, ri) => {
    if (routes.length > 1) {
      const hdr = document.createElement('div');
      hdr.className = 'section-hdr';
      hdr.innerHTML = `<span class="section-hdr-dot" style="background:${rd.color}"></span><span class="section-hdr-title">${esc(rd.name)}</span><span class="section-hdr-meta">${rd.route.length} remaining &middot; ${rd.totalMiles.toFixed(1)} mi</span>`;
      hdr.onclick = () => { state.activeFilter = ri; renderView(); };
      el.appendChild(hdr);
    }
    const origin = getStartLocation();
    if (origin && rd.legs && rd.legs.length > 0) {
      const hi = document.createElement('div'); hi.className = 'stop-item is-home';
      hi.innerHTML = `<div class="stop-item-num" style="background:#007AFF">&#9654;</div><div class="stop-item-info"><div class="stop-item-name">${esc(origin.label) || 'Current Location'}</div><div class="stop-item-detail"><span>Start</span><span>${fmtMi(rd.legs[0].distance)} mi to first stop</span></div></div>`;
      hi.onclick = () => setView([origin.lat, origin.lng], 15);
      el.appendChild(hi);
    }
    const spots = rd.route.map(i => typeof i === 'number' ? state.SPOTS[i] : i);
    const unvisitedSpots = spots.filter(s => !state.visitedSet.has((typeof s === 'number' ? state.SPOTS[s] : s).id));
    let stopNum = 0;
    unvisitedSpots.forEach((s, i) => {
      const spot = typeof s === 'number' ? state.SPOTS[s] : s;
      if (query && !spot.street.toLowerCase().includes(query) && !spot.city.toLowerCase().includes(query)) return;
      stopNum++;
      const curr = i === 0;
      const leg = rd.legs ? rd.legs[(getStartLocation() ? 1 : 0) + spots.indexOf(s)] : null;
      const item = document.createElement('div');
      item.className = 'stop-item' + (curr ? ' current' : '');
      item.innerHTML = `
        <div class="stop-item-check" role="checkbox" tabindex="0" aria-checked="false" aria-label="Mark ${esc(spot.street)} as visited"></div>
        <div class="stop-item-num" style="background:${rd.color}">${stopNum}</div>
        <div class="stop-item-info">
          <div class="stop-item-name">${esc(spot.street)}</div>
          <div class="stop-item-detail"><span>${esc(spot.city)}${spot.state ? ', ' + esc(spot.state) : ''}</span>${leg ? `<span>${fmtMi(leg.distance)} mi · ${fmtDur(leg.duration)}</span>` : ''}</div>
        </div>`;
      item.style.animationDelay = `${i * 30}ms`;
      item.querySelector('.stop-item-check').onclick = (e) => { e.stopPropagation(); toggleVisited(spot.id); };
      item.onclick = () => setView([spot.lat, spot.lng], 16);
      el.appendChild(item);
      if (curr && !query) setTimeout(() => item.scrollIntoView({behavior: 'smooth', block: 'center'}), 300);
    });
    if (state.home && rd.legs && rd.legs.length > 1) {
      const hi = document.createElement('div'); hi.className = 'stop-item is-home';
      const lastLeg = rd.legs[rd.legs.length - 1];
      hi.innerHTML = `<div class="stop-item-num" style="background:#FF9500">&#9750;</div><div class="stop-item-info"><div class="stop-item-name">${esc(state.home.label)}</div><div class="stop-item-detail"><span>Return to End</span><span>${fmtMi(lastLeg.distance)} mi · ${fmtDur(lastLeg.duration)} from last stop</span></div></div>`;
      hi.onclick = () => setView([state.home.lat, state.home.lng], 15);
      el.appendChild(hi);
    }
  });

  // Show visited stops in a single "Visited" section (no route grouping except in Visited view)
  const visitedSpots = state.SPOTS.filter(s => state.visitedSet.has(s.id));
  if (visitedSpots.length) {
    if (query && !visitedSpots.some(s => s.street.toLowerCase().includes(query) || s.city.toLowerCase().includes(query))) return;

    const hdr = document.createElement('div');
    hdr.className = 'section-hdr section-hdr-visited';
    hdr.innerHTML = `<span class="section-hdr-dot" style="background:var(--tertiary)"></span><span class="section-hdr-title">Visited</span><span class="section-hdr-meta">${visitedSpots.length} done</span>`;
    el.appendChild(hdr);

    visitedSpots.forEach(spot => {
      if (query && !spot.street.toLowerCase().includes(query) && !spot.city.toLowerCase().includes(query)) return;
      const item = document.createElement('div');
      item.className = 'stop-item visited';
      item.innerHTML = `
        <div class="stop-item-check" role="checkbox" tabindex="0" aria-checked="true" aria-label="Mark ${esc(spot.street)} as not visited">&#10003;</div>
        <div class="stop-item-info">
          <div class="stop-item-name">${esc(spot.street)}</div>
          <div class="stop-item-detail"><span>${esc(spot.city)}${spot.state ? ', ' + esc(spot.state) : ''}</span></div>
        </div>`;
      item.querySelector('.stop-item-check').onclick = (e) => { e.stopPropagation(); toggleVisited(spot.id); };
      item.onclick = () => setView([spot.lat, spot.lng], 16);
      el.appendChild(item);
    });
  }
}

function updateEmptyState() {
  const empty = document.getElementById('emptyState');
  const stopsView = document.getElementById('stopsView');
  const sheet = document.getElementById('bottomSheet');
  const fab = document.getElementById('fabAddStops');
  const topBar = document.querySelector('.top-bar');
  if (!state.SPOTS.length) {
    empty.style.display = 'block'; stopsView.style.display = 'none';
    sheet.classList.add('expanded');
    fab.classList.add('show');
    topBar.style.display = 'none';
  } else {
    empty.style.display = 'none'; stopsView.style.display = '';
    // Releasing the empty-state expanded sheet — otherwise on mobile it
    // covers the entire map (markers rendered behind a fullscreen panel)
    // and on desktop fitBounds measures stale canvas dimensions.
    sheet.classList.remove('expanded');
    if (state.sheetState === 'expanded') state.sheetState = 'peek';
    fab.classList.remove('show');
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
  const btn = e.target.closest('[data-visit-id]');
  if (!btn) return;
  const id = parseInt(btn.dataset.visitId, 10);
  if (Number.isFinite(id)) { toggleVisited(id); closePopup(); }
});
