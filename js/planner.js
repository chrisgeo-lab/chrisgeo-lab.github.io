import { state, COLORS, getStartLocation } from './state.js';
import { hd, setLoading, showError, hideError } from './utils.js';
import { fetchRoute, buildHaversineMatrix, getFullDurationMatrix, preferredMatrixSources } from './routing.js';
import { clusterUnvisited, tspWithMatrix } from './solver.js';
import { renderView } from './ui.js';
import { invalidateStaleSpotIds } from './anchors.js';

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
  // Every cluster route should depart from the same Start and arrive at the
  // same End. Build a local matrix that includes both anchors as virtual nodes
  // so the TSP solver can pin them at the path endpoints — otherwise the
  // ordering only respects the start, and home gets tacked on no matter how
  // out-of-the-way it is from the last stop.
  const origin = getStartLocation();
  const end = state.home;
  let orderedIndices;

  try {
    if (origin || end) {
      const startPad = origin ? [origin] : [];
      const endPad = end ? [end] : [];
      const pts = [...startPad, ...spotIndices.map(i => state.SPOTS[i]), ...endPad];
      let localMatrix;
      const sources = preferredMatrixSources();
      for (const [, fn] of sources) {
        try { localMatrix = await fn(pts); break; } catch {}
      }
      if (!localMatrix) {
        localMatrix = buildHaversineMatrix(pts);
        state.matrixFallback = true;
      }
      const n = pts.length;
      const all = [...Array(n).keys()];
      let order;
      if (origin && end) {
        order = tspWithMatrix(all, localMatrix, 0, n - 1);
      } else if (origin) {
        order = tspWithMatrix(all, localMatrix, 0);
      } else {
        // Only end set: solve from end backwards over [middle..., end] then
        // reverse so the user-facing order arrives at end last.
        const reversed = tspWithMatrix(all, localMatrix, n - 1);
        order = reversed.slice().reverse();
      }
      // Strip the virtual anchor nodes from the order; map the remaining
      // local indices back to SPOTS indices.
      const middleStart = origin ? 1 : 0;
      const middleEnd = end ? n - 1 : n;
      orderedIndices = order
        .filter(i => i >= middleStart && i < middleEnd)
        .map(i => spotIndices[i - middleStart]);
    } else {
      orderedIndices = tspWithMatrix(spotIndices, matrix, spotIndices[0]);
    }
  } catch {
    orderedIndices = spotIndices;
  }

  const waypoints = [...(origin ? [origin] : []), ...orderedIndices.map(i => state.SPOTS[i]), ...(end ? [end] : [])];

  // Always try real routing first, fallback to synthetic only on error
  if (state.matrixFallback) return syntheticRoute(orderedIndices, color, name, waypoints);

  try {
    const routeResult = await fetchRoute(waypoints);
    return {route: orderedIndices, color, name, geometry: routeResult.geometry, legs: routeResult.legs, totalMiles: routeResult.distance * 0.000621371, totalMinutes: routeResult.duration / 60};
  } catch {
    return syntheticRoute(orderedIndices, color, name, waypoints);
  }
}

// Sticky-clustering cache. Keyed by k+travelMode+anchor signature; carries
// forward the prior medoids so small input changes (a stop deleted, a stop
// marked visited) tend to preserve which spots cluster together — preventing
// route colors from shuffling on every minor edit.
let lastClusterCtx = null;
function anchorSig() {
  const s = state.startPoint, h = state.home;
  const f = (a) => a ? `${a.lat.toFixed(5)},${a.lng.toFixed(5)}` : '-';
  return `${state.startMode}|${f(s)}|${f(h)}`;
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
  invalidateStaleSpotIds();
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
    const ctxKey = `${k}|${state.travelMode}|${anchorSig()}`;
    // Only reuse prior medoids when the partition context hasn't changed.
    // Travel mode or anchor changes invalidate the matrix itself, so the prior
    // medoids would be optimizing a different distance metric.
    const prevMedoids = (lastClusterCtx && lastClusterCtx.key === ctxKey) ? lastClusterCtx.medoids : null;
    const out = {};
    // Split overrides off before clustering. Overridden spots go straight into
    // their pinned cluster; the rest are clustered normally and merged.
    const overrides = state.routeOverrides || {};
    const pinnedByRoute = new Map();
    const freeIndices = [];
    for (const i of unvisitedIndices) {
      const id = state.SPOTS[i].id;
      const ridx = overrides[id];
      if (Number.isInteger(ridx) && ridx >= 0 && ridx < k) {
        if (!pinnedByRoute.has(ridx)) pinnedByRoute.set(ridx, []);
        pinnedByRoute.get(ridx).push(i);
      } else {
        freeIndices.push(i);
      }
    }
    let baseClusters;
    if (freeIndices.length === 0) {
      baseClusters = Array.from({ length: k }, () => []);
    } else if (pinnedByRoute.size === 0) {
      baseClusters = clusterUnvisited(freeIndices, k, matrix, { previousMedoids: prevMedoids, out });
    } else {
      baseClusters = clusterUnvisited(freeIndices, k, matrix, { previousMedoids: prevMedoids, out });
      // Pad to k buckets so we can merge pinned spots into specific indices.
      while (baseClusters.length < k) baseClusters.push([]);
    }
    pinnedByRoute.forEach((spots, ridx) => {
      if (!baseClusters[ridx]) baseClusters[ridx] = [];
      baseClusters[ridx].push(...spots);
    });
    const clusters = baseClusters.filter(c => c.length > 0);
    lastClusterCtx = { key: ctxKey, medoids: out.medoids };

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
    // Clear loading BEFORE rendering so renderStats sees the final state
    // (otherwise the calculating shimmer stays on top of the now-valid values).
    setLoading(false);
    renderView();
  } catch (e) {
    console.error('Routing failed:', e);
    state.currentRoutes = [];
    setLoading(false);
    try { renderView(); } catch (rv) { console.error('renderView failed:', rv); }
    const detail = e && e.message ? ` — ${e.message}` : '';
    showError(`Route calculation failed${detail}`, () => { state.durationMatrix = null; render(); });
  } finally {
    if (ver === state.renderVer) setLoading(false);
  }
}
