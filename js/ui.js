import { state, COLORS, STOP_MIN, STORE_V, STORE_H, STORE_SPOTS, saveSet, saveJSON } from './state.js';
import { esc, hd, fmtMi, fmtMiShort, fmtTime, fmtDur, toast, setLoading, showError, hideError } from './utils.js';
import { fetchTable, fetchRoute, buildHaversineMatrix, getFullDurationMatrix } from './routing.js';
import { clusterUnvisited, tspWithMatrix } from './solver.js';
import { map, clearMap, addMarker, addPolyline, stopIcon, homeIcon, gpsIcon, trackPopup } from './map.js';
import { geocodeFreeform } from './geocoder.js';

function getStartLocation() {
  if (state.startPoint) return state.startPoint;
  if (state.gpsPos) return {lat: state.gpsPos.lat, lng: state.gpsPos.lng, label: 'Current Location'};
  return null;
}

async function solveRoute(spotIndices, color, name, matrix) {
  let orderedIndices;
  const origin = getStartLocation();

  if (origin) {
    const pts = [origin, ...spotIndices.map(i => state.SPOTS[i])];
    let localMatrix;
    try { const tbl = await fetchTable(pts); localMatrix = tbl.durations; }
    catch { localMatrix = buildHaversineMatrix(pts); }
    const n = pts.length;
    const order = tspWithMatrix([...Array(n).keys()], localMatrix, 0);
    orderedIndices = order.filter(i => i !== 0).map(i => spotIndices[i - 1]);
  } else if (state.home) {
    const pts = [state.home, ...spotIndices.map(i => state.SPOTS[i])];
    let localMatrix;
    try { const tbl = await fetchTable(pts); localMatrix = tbl.durations; }
    catch { localMatrix = buildHaversineMatrix(pts); }
    const n = pts.length;
    const order = tspWithMatrix([...Array(n).keys()], localMatrix, 0);
    orderedIndices = order.filter(i => i !== 0).map(i => spotIndices[i - 1]);
  } else {
    orderedIndices = tspWithMatrix(spotIndices, matrix, spotIndices[0]);
  }

  const waypoints = [...(origin ? [origin] : []), ...orderedIndices.map(i => state.SPOTS[i]), ...(state.home ? [state.home] : [])];

  let routeResult;
  try {
    routeResult = await fetchRoute(waypoints);
  } catch (e) {
    console.warn('Route fetch failed:', e);
    const coords = waypoints.map(p => [p.lng, p.lat]);
    let totalDist = 0; for (let i = 0; i < waypoints.length - 1; i++) totalDist += hd(waypoints[i], waypoints[i + 1]);
    return {route: orderedIndices, color, name, geometry: {type: 'LineString', coordinates: coords}, legs: null, totalMiles: totalDist, totalMinutes: (totalDist / 25) * 60};
  }

  return {route: orderedIndices, color, name, geometry: routeResult.geometry, legs: routeResult.legs, totalMiles: routeResult.distance * 0.000621371, totalMinutes: routeResult.duration / 60};
}

export async function render() {
  const ver = ++state.renderVer;
  if (!state.SPOTS.length) {
    state.currentRoutes = []; renderView(); return;
  }
  const unvisitedIndices = state.SPOTS.map((_, i) => i).filter(i => !state.visitedSet.has(state.SPOTS[i].id));
  if (!unvisitedIndices.length) {
    state.currentRoutes = []; renderView(); setLoading(false); return;
  }
  setLoading(true);
  hideError();
  try {
    const matrix = await getFullDurationMatrix(render);
    if (ver !== state.renderVer) return;
    const k = Math.min(state.numClusters, unvisitedIndices.length);
    const clusters = clusterUnvisited(unvisitedIndices, k, matrix);

    const results = [];
    for (let ci = 0; ci < clusters.length; ci++) {
      if (ver !== state.renderVer) return;
      const col = COLORS[ci % COLORS.length];
      const rname = state.numClusters === 1 ? 'Full Route' : `Route ${ci + 1}`;
      const result = await solveRoute(clusters[ci], col, rname, matrix);
      results.push(result);
    }

    if (ver !== state.renderVer) return;
    state.currentRoutes = results;
    state.lastRenderError = null;
    if (state.activeFilter >= state.currentRoutes.length) state.activeFilter = -1;
    renderView();
  } catch (e) {
    console.error('Routing failed:', e);
    state.lastRenderError = e;
    showError('Route calculation failed — using approximate distances', () => { state.durationMatrix = null; render(); });
  } finally {
    if (ver === state.renderVer) setLoading(false);
  }
}

function bindPopup(marker, html) {
  const el = marker._el || marker.getElement();
  if (!el) return;
  el.addEventListener('click', e => {
    e.stopPropagation();
    map.closePopup();
    const popup = new maplibregl.Popup({maxWidth: '220px', className: 'stop-popup-wrap', offset: 12})
      .setLngLat(marker.getLngLat())
      .setHTML(html)
      .addTo(map);
    trackPopup(popup);
  });
}

export function renderView() {
  clearMap();
  const routes = state.activeFilter >= 0 ? [state.currentRoutes[state.activeFilter]] : state.currentRoutes;
  const bounds = [];
  const routeSpotIds = new Set();
  const lineWeight = routes.length === 1 ? 5 : 4;
  routes.forEach(rd => {
    if (rd.geometry?.coordinates) {
      const ll = rd.geometry.coordinates.map(c => [c[1], c[0]]);
      addPolyline(ll, rd.color, lineWeight);
    }
    const spots = rd.route.map(i => typeof i === 'number' ? state.SPOTS[i] : i);
    spots.forEach((s, i) => {
      const spot = typeof s === 'number' ? state.SPOTS[s] : s;
      const sid = spot.id;
      routeSpotIds.add(sid);
      const curr = i === 0 || spots.slice(0, i).every(p => state.visitedSet.has((typeof p === 'number' ? state.SPOTS[p] : p).id));
      const mk = addMarker(spot.lat, spot.lng, stopIcon(i + 1, rd.color, false, curr));
      const legOffset = getStartLocation() ? 1 : 0;
      const legInfo = rd.legs && rd.legs[legOffset + i];
      const addr = [spot.city, spot.state, spot.zip].filter(Boolean).join(', ');
      let popup = `<div class="stop-popup"><div class="stop-popup-label" style="color:${rd.color}">Stop ${i + 1}</div><div class="stop-popup-street">${esc(spot.street)}</div>${addr ? `<div class="stop-popup-addr">${esc(addr)}</div>` : ''}`;
      if (legInfo) popup += `<div class="stop-popup-leg">${fmtMi(legInfo.distance)} mi · ${fmtDur(legInfo.duration)} from ${i === 0 ? 'start' : 'prev'}</div>`;
      popup += `<button class="stop-popup-btn stop-popup-btn-visit" onclick="window._popupToggleVisit(${sid})">&#10003; Mark Visited</button></div>`;
      bindPopup(mk, popup);
      bounds.push([spot.lat, spot.lng]);
    });
  });
  if (state.showVisitedMarkers) {
    state.SPOTS.filter(s => state.visitedSet.has(s.id) && !routeSpotIds.has(s.id)).forEach(spot => {
      const mk = addMarker(spot.lat, spot.lng, stopIcon('&#10003;', '#aeaeb2', true, false));
      const addr = [spot.city, spot.state, spot.zip].filter(Boolean).join(', ');
      let popup = `<div class="stop-popup"><div class="stop-popup-label" style="color:#aeaeb2">Visited</div><div class="stop-popup-street">${esc(spot.street)}</div>${addr ? `<div class="stop-popup-addr">${esc(addr)}</div>` : ''}`;
      popup += `<button class="stop-popup-btn stop-popup-btn-unvisit" onclick="window._popupToggleVisit(${spot.id})">Mark Unvisited</button></div>`;
      bindPopup(mk, popup);
    });
  }
  if (state.home) {
    const mk = addMarker(state.home.lat, state.home.lng, homeIcon());
    bindPopup(mk, `<div style="padding:10px;font-family:var(--font)"><div style="font-size:11px;color:#FF9500;font-weight:600">End Point</div><div style="font-size:14px;font-weight:600;margin-top:2px">${esc(state.home.label)}</div></div>`);
    bounds.push([state.home.lat, state.home.lng]);
  }
  if (state.startPoint) {
    const mk = addMarker(state.startPoint.lat, state.startPoint.lng, {html: '<div style="width:20px;height:20px;background:#007AFF;border:2px solid #fff;border-radius:50%;box-shadow:0 2px 6px rgba(0,0,0,.3);display:flex;align-items:center;justify-content:center;font-size:10px;color:#fff">&#9654;</div>'});
    bindPopup(mk, `<div style="padding:10px;font-family:var(--font)"><div style="font-size:11px;color:#007AFF;font-weight:600">Start Point</div><div style="font-size:14px;font-weight:600;margin-top:2px">${esc(state.startPoint.label)}</div></div>`);
    bounds.push([state.startPoint.lat, state.startPoint.lng]);
  }
  if (state.persistentGpsMarker) { state.persistentGpsMarker.remove(); state.persistentGpsMarker = null; }
  if (state.gpsPos && !state.isNavigating) {
    state.persistentGpsMarker = addMarker(state.gpsPos.lat, state.gpsPos.lng, gpsIcon());
  }
  if (bounds.length && !state.isNavigating && !state.suppressFitBounds) {
    const isDesktop = window.innerWidth >= 768;
    const padding = isDesktop ? {paddingTopLeft: [60, 80], paddingBottomRight: [420, 60]} : {padding: [60, 220]};
    map.fitBounds(bounds, padding);
  }
  state.suppressFitBounds = false;

  renderFilterBar();
  renderStats();
  renderStopList();
  renderNextStop();
  updateProgress();
  updateStopsInfo();
  updateEmptyState();
}

function renderFilterBar() {
  const row = document.getElementById('filterRow');
  const trigger = document.getElementById('routeDropdownTrigger');
  const menu = document.getElementById('routeDropdownMenu');
  if (state.numClusters <= 1) { row.style.display = 'none'; return; }
  row.style.display = 'block';

  const totalRemaining = state.currentRoutes.reduce((s, r) => s + r.route.length, 0);
  const totalDone = state.visitedSet.size;
  const totalAll = totalRemaining + totalDone;

  if (state.activeFilter === -1) {
    trigger.innerHTML = `<span class="route-dropdown-dot" style="background:var(--blue)"></span><span class="route-dropdown-label">All Routes</span><span class="route-dropdown-meta">${totalDone}/${totalAll} done</span>`;
  } else {
    const r = state.currentRoutes[state.activeFilter];
    trigger.innerHTML = `<span class="route-dropdown-dot" style="background:${r.color}"></span><span class="route-dropdown-label">${esc(r.name)}</span><span class="route-dropdown-meta">${r.route.length} remaining · ${r.totalMiles.toFixed(1)} mi</span>`;
  }

  menu.innerHTML = '';
  const allItem = document.createElement('div');
  allItem.className = 'route-dropdown-item' + (state.activeFilter === -1 ? ' selected' : '');
  allItem.innerHTML = `<span class="route-dropdown-dot" style="background:var(--blue)"></span><div class="route-dropdown-item-info"><div class="route-dropdown-item-name">All Routes</div><div class="route-dropdown-item-detail"><span>${totalAll} stops</span><div class="route-dropdown-item-progress"><div class="route-dropdown-item-progress-fill" style="width:${totalAll ? (totalDone / totalAll) * 100 : 0}%;background:var(--blue)"></div></div><span>${totalDone}/${totalAll}</span></div></div>`;
  allItem.onclick = () => { state.activeFilter = -1; closeRouteDropdown(); renderView(); };
  menu.appendChild(allItem);

  const maxMiles = Math.max(...state.currentRoutes.map(r => r.totalMiles), 1);
  state.currentRoutes.forEach((r, i) => {
    const pct = (r.totalMiles / maxMiles) * 100;
    const item = document.createElement('div');
    item.className = 'route-dropdown-item' + (state.activeFilter === i ? ' selected' : '');
    item.innerHTML = `<span class="route-dropdown-dot" style="background:${r.color}"></span><div class="route-dropdown-item-info"><div class="route-dropdown-item-name">${esc(r.name)}</div><div class="route-dropdown-item-detail"><span>${r.route.length} stops · ${r.totalMiles.toFixed(1)} mi</span><div class="route-dropdown-item-progress"><div class="route-dropdown-item-progress-fill" style="width:${pct.toFixed(1)}%;background:${r.color}"></div></div></div></div>`;
    item.onclick = () => { state.activeFilter = i; closeRouteDropdown(); renderView(); };
    menu.appendChild(item);
  });
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

function renderStats() {
  const routes = state.activeFilter >= 0 ? [state.currentRoutes[state.activeFilter]] : state.currentRoutes;
  const totalMi = routes.reduce((s, r) => s + r.totalMiles, 0);
  const totalMin = routes.reduce((s, r) => s + r.totalMinutes, 0);
  const unvisitedStops = routes.reduce((s, r) => s + r.route.length, 0);
  const done = state.SPOTS.filter(s => state.visitedSet.has(s.id)).length;
  const totalStops = unvisitedStops + done;
  document.getElementById('statMi').textContent = totalMi.toFixed(1);
  document.getElementById('statTime').textContent = fmtTime(totalMin + unvisitedStops * STOP_MIN);
  document.getElementById('statStops').textContent = totalStops;
  document.getElementById('statDone').textContent = done;
  document.getElementById('routeSummary').style.display = 'flex';
  const endLabel = state.home ? ` &middot; &#8594; ${esc(state.home.label.split(',')[0])}` : '';
  document.getElementById('topSubtitle').innerHTML = `${done}/${totalStops} stops &middot; ${totalMi.toFixed(1)} mi${endLabel}`;
}

function renderNextStop() {
  const card = document.getElementById('nextStopCard');
  const gmapsCard = document.getElementById('gmapsExportCard');
  const routes = state.activeFilter >= 0 ? [state.currentRoutes[state.activeFilter]] : state.currentRoutes;
  let nextSpot = null, nextLeg = null;
  for (const r of routes) {
    for (let i = 0; i < r.route.length; i++) {
      const sp = typeof r.route[i] === 'number' ? state.SPOTS[r.route[i]] : r.route[i];
      if (!state.visitedSet.has(sp.id)) {
        nextSpot = sp;
        nextLeg = r.legs ? r.legs[(getStartLocation() ? 1 : 0) + i] : null;
        break;
      }
    }
    if (nextSpot) break;
  }
  if (nextSpot) {
    card.style.display = 'block';
    gmapsCard.style.display = 'block';
    document.getElementById('nextStopName').textContent = nextSpot.street;
    document.getElementById('nextStopDist').textContent = nextLeg ? `${fmtMi(nextLeg.distance)} mi` : '--';
    document.getElementById('nextStopTime').textContent = nextLeg ? `~${fmtDur(nextLeg.duration)}` : '--';
    card.dataset.spotId = nextSpot.id;
  } else {
    card.style.display = 'block';
    gmapsCard.style.display = 'none';
    document.getElementById('nextStopName').textContent = 'All stops complete!';
    document.getElementById('nextStopDist').textContent = '';
    document.getElementById('nextStopTime').textContent = '';
    card.dataset.spotId = '';
  }
}

export function renderStopList() {
  const el = document.getElementById('stopsView'); el.innerHTML = '';
  const routes = state.activeFilter >= 0 ? [state.currentRoutes[state.activeFilter]] : state.currentRoutes;
  const query = (document.getElementById('searchInput')?.value || '').trim().toLowerCase();
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
      hi.onclick = () => map.setView([origin.lat, origin.lng], 15);
      el.appendChild(hi);
    }
    const spots = rd.route.map(i => typeof i === 'number' ? state.SPOTS[i] : i);
    spots.forEach((s, i) => {
      const spot = typeof s === 'number' ? state.SPOTS[s] : s;
      if (query && !spot.street.toLowerCase().includes(query) && !spot.city.toLowerCase().includes(query)) return;
      const curr = i === 0 || spots.slice(0, i).every(p => state.visitedSet.has((typeof p === 'number' ? state.SPOTS[p] : p).id));
      const leg = rd.legs ? rd.legs[(getStartLocation() ? 1 : 0) + i] : null;
      const item = document.createElement('div');
      item.className = 'stop-item' + (curr ? ' current' : '');
      item.innerHTML = `
        <div class="stop-item-check" role="checkbox" tabindex="0" aria-checked="false" aria-label="Mark ${esc(spot.street)} as visited"></div>
        <div class="stop-item-num" style="background:${rd.color}">${i + 1}</div>
        <div class="stop-item-info">
          <div class="stop-item-name">${esc(spot.street)}</div>
          <div class="stop-item-detail"><span>${esc(spot.city)}${spot.state ? ', ' + esc(spot.state) : ''}</span>${leg ? `<span>${fmtMi(leg.distance)} mi · ${fmtDur(leg.duration)}</span>` : ''}</div>
        </div>`;
      item.style.animationDelay = `${i * 30}ms`;
      item.querySelector('.stop-item-check').onclick = (e) => { e.stopPropagation(); toggleVisited(spot.id); };
      item.onclick = () => map.setView([spot.lat, spot.lng], 16);
      el.appendChild(item);
      if (curr && !query) setTimeout(() => item.scrollIntoView({behavior: 'smooth', block: 'center'}), 300);
    });
    if (state.home && rd.legs && rd.legs.length > 1) {
      const hi = document.createElement('div'); hi.className = 'stop-item is-home';
      const lastLeg = rd.legs[rd.legs.length - 1];
      hi.innerHTML = `<div class="stop-item-num" style="background:#FF9500">&#9750;</div><div class="stop-item-info"><div class="stop-item-name">${esc(state.home.label)}</div><div class="stop-item-detail"><span>Return to End</span><span>${fmtMi(lastLeg.distance)} mi · ${fmtDur(lastLeg.duration)} from last stop</span></div></div>`;
      hi.onclick = () => map.setView([state.home.lat, state.home.lng], 15);
      el.appendChild(hi);
    }
  });
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
        <div class="stop-item-num" style="background:var(--tertiary)">✓</div>
        <div class="stop-item-info">
          <div class="stop-item-name">${esc(spot.street)}</div>
          <div class="stop-item-detail"><span>${esc(spot.city)}${spot.state ? ', ' + esc(spot.state) : ''}</span></div>
        </div>`;
      item.querySelector('.stop-item-check').onclick = (e) => { e.stopPropagation(); toggleVisited(spot.id); };
      item.onclick = () => map.setView([spot.lat, spot.lng], 16);
      el.appendChild(item);
    });
  }
}

export function toggleVisited(id) {
  const wasVisited = state.visitedSet.has(id);
  if (wasVisited) state.visitedSet.delete(id); else state.visitedSet.add(id);
  saveSet(STORE_V, state.visitedSet);
  if (!wasVisited && navigator.vibrate) navigator.vibrate(10);
  state.suppressFitBounds = true;
  renderView();
  if (!wasVisited && state.visitedSet.size === state.SPOTS.length) {
    celebrate();
  }
}

function celebrate() {
  toast('All stops complete! Great work!');
  if (navigator.vibrate) navigator.vibrate([100, 80, 100, 80, 200]);
}

function updateProgress() {
  const total = state.SPOTS.length; const done = state.visitedSet.size;
  document.getElementById('progressBar').style.width = `${total ? (done / total) * 100 : 0}%`;
}

function updateStopsInfo() {
  const badge = document.getElementById('stopsInfoBadge');
  const text = document.getElementById('stopsInfoText');
  if (!state.SPOTS.length) { badge.style.display = 'none'; return; }
  badge.style.display = 'flex';
  const isCustom = localStorage.getItem(STORE_SPOTS) !== null;
  text.textContent = `${state.SPOTS.length} stop${state.SPOTS.length !== 1 ? 's' : ''}${isCustom ? ' (imported)' : ''}`;
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
    fab.classList.remove('show');
    topBar.style.display = '';
  }
}

export function exportRoute() {
  if (!state.currentRoutes.length) { toast('No routes to export'); return; }
  const routes = state.activeFilter >= 0 ? [state.currentRoutes[state.activeFilter]] : state.currentRoutes;
  let text = 'ROUTEFLOW - ROUTE PLAN\n';
  text += `Generated: ${new Date().toLocaleDateString()}\n`;
  text += `${'='.repeat(40)}\n\n`;
  if (state.home) text += `END POINT: ${state.home.label}\n\n`;
  routes.forEach(rd => {
    text += `--- ${rd.name} (${rd.totalMiles.toFixed(1)} mi, ~${fmtTime(rd.totalMinutes + rd.route.length * STOP_MIN)}) ---\n`;
    const spots = rd.route.map(i => typeof i === 'number' ? state.SPOTS[i] : i);
    spots.forEach((s, i) => {
      const spot = typeof s === 'number' ? state.SPOTS[s] : s;
      const vis = state.visitedSet.has(spot.id) ? '[x]' : '[ ]';
      const leg = rd.legs ? rd.legs[(getStartLocation() ? 1 : 0) + i] : null;
      text += `  ${vis} ${i + 1}. ${spot.street}, ${spot.city}`;
      if (leg) text += ` (${fmtMi(leg.distance)} mi, ~${fmtDur(leg.duration)})`;
      text += '\n';
    });
    text += '\n';
  });
  text += `\nProgress: ${state.visitedSet.size}/${state.SPOTS.length} stops completed\n`;

  const blob = new Blob([text], {type: 'text/plain'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `routeflow-${new Date().toISOString().slice(0, 10)}.txt`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
  toast('Route exported');
}

function spotToAddr(sp) { return `${sp.lat},${sp.lng}`; }

export function exportToGoogleMaps() {
  if (!state.currentRoutes.length) { toast('No routes to export'); return; }
  if (state.activeFilter < 0 && state.currentRoutes.length > 1) {
    toast('Select a single route to open in Google Maps');
    return;
  }

  const rd = state.activeFilter >= 0 ? state.currentRoutes[state.activeFilter] : state.currentRoutes[0];
  const stops = [];
  for (const idx of rd.route) {
    const sp = typeof idx === 'number' ? state.SPOTS[idx] : idx;
    if (!state.visitedSet.has(sp.id)) stops.push(sp);
  }
  if (!stops.length) { toast('All stops visited!'); return; }

  const allPoints = [];
  const origin = getStartLocation();
  if (origin) {
    allPoints.push(`${origin.lat},${origin.lng}`);
  } else {
    allPoints.push(spotToAddr(stops[0]));
  }
  const stopsToInclude = origin ? stops : stops.slice(1);
  for (const sp of stopsToInclude) {
    allPoints.push(spotToAddr(sp));
  }
  if (state.home) {
    allPoints.push(`${state.home.lat},${state.home.lng}`);
  }

  const MAX_URL_LEN = 2000;
  let url = 'https://www.google.com/maps/dir/' + allPoints.map(p => encodeURIComponent(p)).join('/');

  if (url.length > MAX_URL_LEN) {
    const coordPoints = [];
    if (origin) coordPoints.push(`${origin.lat},${origin.lng}`);
    else coordPoints.push(`${stops[0].lat},${stops[0].lng}`);
    const available = origin ? stops : stops.slice(1);
    for (const sp of available) {
      coordPoints.push(`${sp.lat},${sp.lng}`);
    }
    if (state.home) coordPoints.push(`${state.home.lat},${state.home.lng}`);
    let trimmed = coordPoints;
    while (trimmed.length > 2) {
      url = 'https://www.google.com/maps/dir/' + trimmed.join('/') + '/';
      if (url.length <= MAX_URL_LEN) break;
      trimmed = trimmed.slice(0, -1);
    }
    const included = trimmed.length - (origin ? 1 : 0) - (state.home ? 1 : 0);
    if (included < stops.length) {
      toast(`Opening ${included} of ${stops.length} stops in Google Maps`);
    } else {
      toast('Opening in Google Maps...');
    }
  } else {
    toast('Opening in Google Maps...');
  }
  window.open(url, '_blank');
}

export function computeMaxClusters() {
  const n = state.SPOTS.length;
  const MIN_PER_CLUSTER = 3;
  const maxBySize = Math.floor(n / MIN_PER_CLUSTER);
  const cities = new Set(state.SPOTS.map(s => s.city));
  const maxByCities = cities.size;
  return Math.max(2, Math.min(maxBySize, maxByCities));
}

// Home (end point) modal
export function showHomeModal() {
  document.getElementById('homeModal').classList.add('show');
  document.getElementById('homeInput').value = state.home ? state.home.label : '';
  document.getElementById('homeClearBtn').style.display = state.home ? 'block' : 'none';
  setTimeout(() => document.getElementById('homeInput').focus(), 100);
}
export function hideHomeModal() { document.getElementById('homeModal').classList.remove('show'); }

export async function confirmHome() {
  const val = document.getElementById('homeInput').value.trim();
  if (!val) {
    state.home = null; localStorage.removeItem(STORE_H); hideHomeModal(); render();
    toast('No end point set — route ends at last stop');
    return;
  }
  const btn = document.getElementById('homeConfirmBtn');
  btn.textContent = 'Finding...'; btn.disabled = true;
  try {
    const result = await geocodeFreeform(val);
    btn.textContent = 'Set End'; btn.disabled = false;
    if (result) {
      state.home = {lat: result.lat, lng: result.lng, label: result.label || val};
      saveJSON(STORE_H, state.home); hideHomeModal(); render();
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

// Start point modal
export function showStartModal() {
  document.getElementById('startModal').classList.add('show');
  document.getElementById('startInput').value = state.startPoint ? state.startPoint.label : '';
  document.getElementById('startClearBtn').style.display = state.startPoint ? 'block' : 'none';
  setTimeout(() => document.getElementById('startInput').focus(), 100);
}
export function hideStartModal() { document.getElementById('startModal').classList.remove('show'); }

export async function confirmStart() {
  const val = document.getElementById('startInput').value.trim();
  if (!val) {
    state.startPoint = null; localStorage.removeItem('routeflow-start'); hideStartModal(); state.durationMatrix = null; render();
    toast('Using GPS as start point');
    return;
  }
  const btn = document.getElementById('startConfirmBtn');
  btn.textContent = 'Finding...'; btn.disabled = true;
  try {
    const result = await geocodeFreeform(val);
    btn.textContent = 'Set Start'; btn.disabled = false;
    if (result) {
      state.startPoint = {lat: result.lat, lng: result.lng, label: result.label || val};
      saveJSON('routeflow-start', state.startPoint); hideStartModal(); state.durationMatrix = null; render();
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

// Bottom sheet
export function setSheetState(s) {
  state.sheetState = s;
  const sheet = document.getElementById('bottomSheet');
  sheet.classList.remove('collapsed', 'expanded');
  if (s === 'collapsed') sheet.classList.add('collapsed');
  else if (s === 'expanded') sheet.classList.add('expanded');
}
