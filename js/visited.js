import { state, STORE_V, STORE_ROUTE_MAP, saveSet, saveJSON, VISITED_COLOR } from './state.js';
import { toast, esc } from './utils.js';
import { render } from './planner.js';
import { addMarker, stopIcon } from './map.js';

/**
 * Toggle visited status for a spot. Records which route the stop belongs to
 * so visited markers can display the correct color.
 * @param {number} id - Spot ID to toggle
 */
export function toggleVisited(id) {
  const wasVisited = state.visitedSet.has(id);
  if (wasVisited) {
    state.visitedSet.delete(id);
    delete state.visitedRouteMap[id];
  } else {
    state.visitedSet.add(id);
    // Record which route this stop belongs to (so visited stops remember their cluster)
    const routes = state.activeFilter >= 0 ? [state.currentRoutes[state.activeFilter]] : state.currentRoutes;
    for (let ri = 0; ri < routes.length; ri++) {
      const routeInCurrentRoutes = state.currentRoutes.findIndex(r => r === routes[ri]);
      const spots = routes[ri].route.map(i => typeof i === 'number' ? state.SPOTS[i] : i);
      if (spots.some(s => (typeof s === 'number' ? state.SPOTS[s] : s).id === id)) {
        state.visitedRouteMap[id] = routeInCurrentRoutes;
        break;
      }
    }
  }
  saveSet(STORE_V, state.visitedSet);
  saveJSON(STORE_ROUTE_MAP, state.visitedRouteMap);
  if (!wasVisited && navigator.vibrate) navigator.vibrate(10);
  state.suppressFitBounds = true;
  render();
  if (!wasVisited && state.visitedSet.size === state.SPOTS.length) {
    celebrate();
  }
}

/**
 * Show celebration message when all stops are visited.
 */
function celebrate() {
  toast('All stops done!');
  if (navigator.vibrate) navigator.vibrate([100, 80, 100, 80, 200]);
}

/**
 * Render visited-only markers on map with route colors.
 * Used when activeFilter === -2 (Visited view).
 * @param {Array} bounds - Array to accumulate [lat, lng] pairs for fitBounds
 * @param {Function} bindPopup - Popup binding function from map.js
 */
export function renderVisitedMarkersOnly(bounds, bindPopup) {
  const visitedSpots = state.SPOTS.filter(s => state.visitedSet.has(s.id));
  visitedSpots.forEach(spot => {
    if (!Number.isFinite(spot.lat) || !Number.isFinite(spot.lng)) return;
    const routeIdx = state.visitedRouteMap[spot.id];
    const route = (routeIdx !== undefined && routeIdx >= 0 && routeIdx < state.currentRoutes.length)
      ? state.currentRoutes[routeIdx]
      : null;
    const color = route ? route.color : VISITED_COLOR;

    try {
      const mk = addMarker(spot.lat, spot.lng, stopIcon('', color, true, false));
      const addr = [spot.city, spot.state, spot.zip].filter(Boolean).join(', ');
      let popup = `<div class="stop-popup"><div class="stop-popup-label" style="color:${color}">Visited</div><div class="stop-popup-street">${esc(spot.street)}</div>${addr ? `<div class="stop-popup-addr">${esc(addr)}</div>` : ''}`;
      popup += `<button class="stop-popup-btn stop-popup-btn-unvisit" data-visit-id="${spot.id}">Mark Unvisited</button></div>`;
      bindPopup(mk, popup, {spotId: spot.id});
      bounds.push([spot.lat, spot.lng]);
    } catch (err) {
      console.warn('renderVisitedMarkersOnly: skipped marker', err);
    }
  });
}

/**
 * Visited-progress indicator was removed (the animated sweep read as a
 * loading flash). Kept as a no-op so existing call sites still work; can be
 * deleted once all callers are pruned.
 */
export function updateProgress() {}
