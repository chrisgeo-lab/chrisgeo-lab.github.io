import { state, COLORS, getStartLocation } from './state.js';
import { hd, setLoading, showError, hideError } from './utils.js';
import { fetchTable, fetchRoute, buildHaversineMatrix, getFullDurationMatrix } from './routing.js';
import { clusterUnvisited, tspWithMatrix } from './solver.js';
import { renderView } from './ui.js';

function syntheticRoute(orderedIndices, color, name, waypoints) {
  const coords = waypoints.map(p => [p.lng, p.lat]);
  let totalDist = 0;
  for (let i = 0; i < waypoints.length - 1; i++) totalDist += hd(waypoints[i], waypoints[i + 1]);
  return {
    route: orderedIndices, color, name,
    geometry: {type: 'LineString', coordinates: coords},
    legs: null,
    totalMiles: totalDist,
    totalMinutes: (totalDist / 25) * 60
  };
}

async function solveRoute(spotIndices, color, name, matrix) {
  let orderedIndices;
  const origin = getStartLocation();
  const anchor = origin || state.home;
  const offline = state.demoMode || state.matrixFallback;

  try {
    if (anchor) {
      const pts = [anchor, ...spotIndices.map(i => state.SPOTS[i])];
      let localMatrix;
      if (offline) {
        localMatrix = buildHaversineMatrix(pts);
      } else {
        try { const tbl = await fetchTable(pts); localMatrix = tbl.durations; }
        catch { localMatrix = buildHaversineMatrix(pts); }
      }
      const n = pts.length;
      const order = tspWithMatrix([...Array(n).keys()], localMatrix, 0);
      orderedIndices = order.filter(i => i !== 0).map(i => spotIndices[i - 1]);
    } else {
      orderedIndices = tspWithMatrix(spotIndices, matrix, spotIndices[0]);
    }
  } catch {
    orderedIndices = spotIndices;
  }

  const waypoints = [...(origin ? [origin] : []), ...orderedIndices.map(i => state.SPOTS[i]), ...(state.home ? [state.home] : [])];

  if (offline) return syntheticRoute(orderedIndices, color, name, waypoints);

  try {
    const routeResult = await fetchRoute(waypoints);
    return {route: orderedIndices, color, name, geometry: routeResult.geometry, legs: routeResult.legs, totalMiles: routeResult.distance * 0.000621371, totalMinutes: routeResult.duration / 60};
  } catch {
    return syntheticRoute(orderedIndices, color, name, waypoints);
  }
}

/**
 * Top-level routing pipeline. Reads SPOTS/visitedSet/start/home/numClusters from state,
 * writes state.currentRoutes (and may reset state.activeFilter), then triggers UI render.
 * Re-entrant — uses `state.renderVer` to drop stale results.
 * @returns {Promise<void>}
 */
export async function render() {
  const ver = ++state.renderVer;
  if (!state.SPOTS.length) {
    state.currentRoutes = []; renderView(); return;
  }
  const excludedSpotIds = new Set();
  if (state.startPoint && state.startPoint.spotId != null) excludedSpotIds.add(state.startPoint.spotId);
  if (state.home && state.home.spotId != null) excludedSpotIds.add(state.home.spotId);
  const unvisitedIndices = state.SPOTS.map((_, i) => i).filter(i => !state.visitedSet.has(state.SPOTS[i].id) && !excludedSpotIds.has(i));
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
    if (state.activeFilter >= state.currentRoutes.length) state.activeFilter = -1;
    renderView();
  } catch (e) {
    console.error('Routing failed:', e);
    state.currentRoutes = [];
    renderView();
    showError('Route calculation failed', () => { state.durationMatrix = null; render(); });
  } finally {
    if (ver === state.renderVer) setLoading(false);
  }
}
