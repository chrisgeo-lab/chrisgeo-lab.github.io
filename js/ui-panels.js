import { state, STOP_MIN, getActiveRoutes } from './state.js';
import { esc, fmtTime } from './utils.js';
import { toggleVisited } from './visited.js';

/**
 * Render route filter dropdown bar.
 * Shows available routes, "All Routes", and "Visited" options.
 * @param {Function} closeDropdownFn - Callback to close the dropdown
 * @param {Function} renderViewFn - Callback to trigger full view re-render
 */
export function renderFilterBar(closeDropdownFn, renderViewFn) {
  const row = document.getElementById('filterRow');
  const trigger = document.getElementById('routeDropdownTrigger');
  const menu = document.getElementById('routeDropdownMenu');
  const visitedCount = state.visitedSet.size;
  // Show the dropdown when there are multiple routes OR at least one visited
  // stop (so the Visited filter is reachable in single-route mode too).
  if (state.numClusters <= 1 && visitedCount === 0) { row.style.display = 'none'; return; }
  row.style.display = 'block';

  if (state.activeFilter === -1) {
    trigger.innerHTML = `<span class="route-dropdown-dot route-dropdown-dot--all"></span><span class="route-dropdown-label">All Routes</span>`;
  } else if (state.activeFilter === -2) {
    trigger.innerHTML = `<span class="route-dropdown-dot route-dropdown-dot--visited"></span><span class="route-dropdown-label">Visited</span>`;
  } else {
    const r = state.currentRoutes[state.activeFilter];
    trigger.innerHTML = `<span class="route-dropdown-dot" style="background:${r.color}"></span><span class="route-dropdown-label">${esc(r.name)}</span>`;
  }

  menu.innerHTML = '';
  const allItem = document.createElement('div');
  allItem.className = 'route-dropdown-item' + (state.activeFilter === -1 ? ' selected' : '');
  allItem.innerHTML = `<span class="route-dropdown-dot route-dropdown-dot--all"></span><div class="route-dropdown-item-info"><div class="route-dropdown-item-name">All Routes</div></div>`;
  allItem.onclick = () => { state.activeFilter = -1; closeDropdownFn(); renderViewFn(); };
  menu.appendChild(allItem);

  state.currentRoutes.forEach((r, i) => {
    const item = document.createElement('div');
    item.className = 'route-dropdown-item' + (state.activeFilter === i ? ' selected' : '');
    item.innerHTML = `<span class="route-dropdown-dot" style="background:${r.color}"></span><div class="route-dropdown-item-info"><div class="route-dropdown-item-name">${esc(r.name)}</div></div>`;
    item.onclick = () => { state.activeFilter = i; closeDropdownFn(); renderViewFn(); };
    menu.appendChild(item);
  });

  // Add "Visited" option
  if (visitedCount > 0) {
    const visitedItem = document.createElement('div');
    visitedItem.className = 'route-dropdown-item' + (state.activeFilter === -2 ? ' selected' : '');
    visitedItem.innerHTML = `<span class="route-dropdown-dot route-dropdown-dot--visited"></span><div class="route-dropdown-item-info"><div class="route-dropdown-item-name">Visited</div></div>`;
    visitedItem.onclick = () => { state.activeFilter = -2; closeDropdownFn(); renderViewFn(); };
    menu.appendChild(visitedItem);
  }
}

/**
 * Render summary statistics card (miles, time, stops).
 * @param {boolean} isCalculating - Whether routes are currently being calculated
 */
export function renderStats(isCalculating = false) {
  const routes = getActiveRoutes();
  const totalStops = routes.reduce((s, r) => s + r.route.length, 0);

  const sheet = document.getElementById('bottomSheet');
  // Debug: log when stats are blank
  if (isCalculating || routes.length === 0) {
    console.log('[renderStats] Showing placeholders:', { isCalculating, routesLength: routes.length, currentRoutesLength: state.currentRoutes.length, activeFilter: state.activeFilter });
    if (sheet) sheet.classList.toggle('calculating', !!isCalculating);
    document.getElementById('statMi').innerHTML = '<span class="stat-shimmer">&middot;&middot;&middot;</span>';
    document.getElementById('statTime').innerHTML = '<span class="stat-shimmer">&middot;&middot;&middot;</span>';
    document.getElementById('statStops').textContent = totalStops || state.SPOTS.length;
    document.getElementById('routeSummary').style.display = 'flex';
    const modeLabels = {car: 'Drive', bike: 'Bike', walk: 'Walk'};
    const timeLabel = document.querySelector('#routeSummary .route-stat:nth-child(2) .route-stat-label');
    if (timeLabel) timeLabel.textContent = modeLabels[state.travelMode] || 'Drive';
    return;
  }

  const totalMi = routes.reduce((s, r) => s + r.totalMiles, 0);
  const totalMin = routes.reduce((s, r) => s + r.totalMinutes, 0);
  console.log('[renderStats] Calculated:', { totalMi, totalMin, totalStops, routes: routes.map(r => ({ name: r.name, miles: r.totalMiles, minutes: r.totalMinutes, stops: r.route.length })) });
  if (sheet) sheet.classList.remove('calculating');
  document.getElementById('statMi').textContent = totalMi.toFixed(1);
  document.getElementById('statTime').textContent = fmtTime(totalMin + totalStops * STOP_MIN);
  document.getElementById('statStops').textContent = totalStops;
  document.getElementById('routeSummary').style.display = 'flex';
  const modeLabels = {car: 'Drive', bike: 'Bike', walk: 'Walk'};
  const timeLabel = document.querySelector('#routeSummary .route-stat:nth-child(2) .route-stat-label');
  if (timeLabel) timeLabel.textContent = modeLabels[state.travelMode] || 'Drive';
}

/**
 * Render route settings card (start/end points + export buttons).
 * Shows export section only when routes are calculated.
 * @param {boolean} isCalculating - Whether routes are currently being calculated
 */
export function renderRouteSettings(isCalculating = false) {
  const card = document.getElementById('routeSettingsCard');
  const exportSection = document.getElementById('exportSection');
  const routes = getActiveRoutes();

  // Always show the card if there are stops
  if (state.SPOTS.length > 0) {
    card.style.display = 'block';
  } else {
    card.style.display = 'none';
    return;
  }

  // Show export section only when routes are calculated and not currently calculating
  if (!isCalculating && routes.length > 0) {
    exportSection.style.display = 'block';
  } else {
    exportSection.style.display = 'none';
  }
}

/**
 * Render visited-only view (activeFilter === -2).
 * Groups visited stops by route.
 * @param {HTMLElement} el - Container element
 * @param {string} query - Search query filter
 */
export function renderVisitedOnlyView(el, query) {
  const visitedSpots = state.SPOTS.filter(s => state.visitedSet.has(s.id));
  if (!visitedSpots.length) {
    el.innerHTML = '<div style="padding:40px 20px;text-align:center;color:var(--secondary)">No visited stops yet</div>';
    return;
  }

  // Group by route
  const visitedByRoute = new Map();
  visitedSpots.forEach(spot => {
    const routeIdx = state.visitedRouteMap[spot.id];
    if (routeIdx !== undefined && routeIdx >= 0 && routeIdx < state.currentRoutes.length) {
      if (!visitedByRoute.has(routeIdx)) visitedByRoute.set(routeIdx, []);
      visitedByRoute.get(routeIdx).push(spot);
    } else {
      if (!visitedByRoute.has(-1)) visitedByRoute.set(-1, []);
      visitedByRoute.get(-1).push(spot);
    }
  });

  visitedByRoute.forEach((spots, routeIdx) => {
    if (query && !spots.some(s => s.street.toLowerCase().includes(query) || s.city.toLowerCase().includes(query))) return;

    const route = routeIdx >= 0 ? state.currentRoutes[routeIdx] : null;
    const hdr = document.createElement('div');
    hdr.className = 'section-hdr section-hdr-visited';
    if (route) {
      hdr.innerHTML = `<span class="section-hdr-dot" style="background:${route.color}"></span><span class="section-hdr-title">${esc(route.name)}</span><span class="section-hdr-meta">${spots.length} visited</span>`;
    } else {
      hdr.innerHTML = `<span class="section-hdr-dot section-hdr-dot--visited"></span><span class="section-hdr-title">Visited</span><span class="section-hdr-meta">${spots.length} stops</span>`;
    }
    el.appendChild(hdr);

    spots.forEach(spot => {
      if (query && !spot.street.toLowerCase().includes(query) && !spot.city.toLowerCase().includes(query)) return;
      const item = document.createElement('div');
      item.className = 'stop-item visited' + (state.focusedStopId === spot.id ? ' focused' : '');
      item.dataset.spotId = spot.id;
      item.innerHTML = `
        <div class="stop-item-check" role="checkbox" tabindex="0" aria-checked="true" aria-label="Mark ${esc(spot.street)} as not visited"><svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 6.5l2.5 2.5 4.5-5"/></svg></div>
        <div class="stop-item-info">
          <div class="stop-item-name">${esc(spot.street)}</div>
          <div class="stop-item-detail"><span>${esc(spot.city)}${spot.state ? ', ' + esc(spot.state) : ''}</span></div>
        </div>
        <button class="stop-item-trash" aria-label="Delete ${esc(spot.street)}" title="Delete stop"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 4.5h10M5.5 4.5V3a1 1 0 011-1h3a1 1 0 011 1v1.5M4 4.5l.7 8.5a1 1 0 001 .9h4.6a1 1 0 001-.9L12 4.5M6.8 7.5v4M9.2 7.5v4"/></svg></button>`;
      item.querySelector('.stop-item-check').onclick = (e) => { e.stopPropagation(); toggleVisited(spot.id); };
      item.querySelector('.stop-item-trash').onclick = (e) => {
        e.stopPropagation();
        import('./ui.js').then(m => m.deleteStop(spot.id));
      };
      item.onclick = () => {
        import('./stop-list-render.js').then(m => m.focusStopFromList(spot));
      };
      el.appendChild(item);
    });
  });
}

/**
 * Update stops badge/info in UI header.
 */
export function updateStopsInfo() {
  const badge = document.getElementById('stopsInfoBadge');
  const text = document.getElementById('stopsInfoText');
  if (!state.SPOTS.length) { badge.style.display = 'none'; return; }
  badge.style.display = 'flex';
  text.textContent = `${state.SPOTS.length} stop${state.SPOTS.length !== 1 ? 's' : ''}`;
}
