import { state, OSRM_PROFILES, STORE_CACHE, CACHE_MAX_ENTRIES, saveJSON } from './state.js';
import { hd, showError } from './utils.js';
import { SPEED_MPH } from './constants.js';

function cacheKey(pts) { return `${state.travelMode}:${pts.map(p => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`).join('|')}`; }

function trimCache() {
  const keys = Object.keys(state.osrmCache);
  if (keys.length > CACHE_MAX_ENTRIES) {
    const toRemove = keys.slice(0, keys.length - CACHE_MAX_ENTRIES);
    toRemove.forEach(k => delete state.osrmCache[k]);
  }
}

function getProfile() {
  return OSRM_PROFILES[state.travelMode] || OSRM_PROFILES.car;
}

async function fetchWithRetry(url, retries = 1, delay = 1000, timeoutMs = 5000) {
  for (let i = 0; i <= retries; i++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const r = await fetch(url, {signal: controller.signal});
      clearTimeout(timeout);
      if (r.ok) return r;
      if ((r.status === 429 || r.status >= 500) && i < retries) {
        await new Promise(w => setTimeout(w, delay));
        continue;
      }
      throw new Error(`HTTP ${r.status}`);
    } catch (e) {
      clearTimeout(timeout);
      if (i === retries) throw e;
      await new Promise(w => setTimeout(w, delay));
    }
  }
}

async function fetchFromAnyServer(path, timeoutMs) {
  const profile = getProfile();
  const servers = [profile.primary, ...(profile.fallback ? [profile.fallback] : [])];
  // /table requests with many points can exceed the default 5s; allow longer.
  const t = timeoutMs != null ? timeoutMs : (path.startsWith('/table/') ? 20000 : 5000);
  for (const server of servers) {
    try {
      return await fetchWithRetry(`${server}${path}`, 1, 1000, t);
    } catch (e) {
      if (server === servers[servers.length - 1]) throw e;
    }
  }
}

// Valhalla encodes leg.shape as a Google-style encoded polyline at precision
// 6 (1e-6 degrees). This decodes one such string back to [[lng, lat], ...].
// Reference: https://valhalla.github.io/valhalla/decoding/
function decodePolyline6(str) {
  const coords = [];
  let lat = 0, lng = 0, i = 0;
  while (i < str.length) {
    let result = 0, shift = 0, b;
    do {
      b = str.charCodeAt(i++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    lat += (result & 1) ? ~(result >> 1) : (result >> 1);
    result = 0; shift = 0;
    do {
      b = str.charCodeAt(i++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    lng += (result & 1) ? ~(result >> 1) : (result >> 1);
    coords.push([lng / 1e6, lat / 1e6]);
  }
  return coords;
}

async function fetchValhalla(pts, costingMode) {
  const profile = getProfile();
  if (!profile.valhalla) throw new Error('No Valhalla server configured');

  const locations = pts.map(p => ({lat: p.lat, lon: p.lng}));
  const body = {
    locations,
    costing: costingMode || 'auto',
    directions_options: {units: 'miles'}
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const r = await fetch(`${profile.valhalla}/route`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(body),
      signal: controller.signal
    });
    clearTimeout(timeout);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } catch (e) {
    clearTimeout(timeout);
    throw e;
  }
}

/**
 * Fetch an N×N OSRM duration matrix in seconds for the given points.
 * Reads `state.travelMode` to pick the OSRM profile.
 * @param {Spot[]} pts
 * @returns {Promise<{durations: number[][]}>}
 */
export async function fetchTable(pts) {
  const c = pts.map(p => `${p.lng},${p.lat}`).join(';');
  const svc = getProfile().service;
  const r = await fetchFromAnyServer(`/table/v1/${svc}/${c}?annotations=duration`);
  const d = await r.json();
  if (d.code !== 'Ok') throw new Error(d.message || d.code);
  return d;
}

async function fetchTableChunked(pts) {
  const n = pts.length;
  if (n <= 25) return fetchTable(pts);

  const durations = Array.from({length: n}, () => new Array(n).fill(0));
  const CHUNK = 25;
  const chunks = [];
  for (let i = 0; i < n; i += CHUNK) {
    chunks.push({start: i, end: Math.min(i + CHUNK, n)});
  }

  for (const src of chunks) {
    for (const dst of chunks) {
      const allPts = [];
      for (let i = src.start; i < src.end; i++) allPts.push(pts[i]);
      for (let i = dst.start; i < dst.end; i++) allPts.push(pts[i]);
      const srcLen = src.end - src.start;
      const dstLen = dst.end - dst.start;
      const srcIndices = Array.from({length: srcLen}, (_, i) => i);
      const dstIndices = Array.from({length: dstLen}, (_, i) => i + srcLen);

      const c = allPts.map(p => `${p.lng},${p.lat}`).join(';');
      const svc = getProfile().service;
      const path = `/table/v1/${svc}/${c}?annotations=duration&sources=${srcIndices.join(';')}&destinations=${dstIndices.join(';')}`;
      const r = await fetchFromAnyServer(path);
      const d = await r.json();
      if (d.code !== 'Ok') throw new Error(d.message || d.code);

      for (let si = 0; si < srcLen; si++) {
        for (let di = 0; di < dstLen; di++) {
          durations[src.start + si][dst.start + di] = d.durations[si][di] || 0;
        }
      }

      await new Promise(w => setTimeout(w, 200));
    }
  }
  return {durations};
}

/**
 * Fetch and cache a turn-by-turn OSRM route through the given waypoints.
 * Reads/mutates `state.osrmCache`; persists to localStorage under STORE_CACHE.
 * @param {Spot[]} pts
 * @returns {Promise<Route>}
 */
async function fetchRouteOSRM(pts) {
  const c = pts.map(p => `${p.lng},${p.lat}`).join(';');
  const svc = getProfile().service;
  const r = await fetchFromAnyServer(`/route/v1/${svc}/${c}?overview=full&geometries=geojson&steps=true`);
  const d = await r.json();
  if (d.code !== 'Ok') throw new Error(d.message || d.code);
  return d.routes[0];
}

async function fetchRouteValhalla(pts) {
  const costingMap = {car: 'auto', bike: 'bicycle', walk: 'pedestrian'};
  const vd = await fetchValhalla(pts, costingMap[state.travelMode] || 'auto');
  if (!vd.trip || !vd.trip.legs) throw new Error('Invalid Valhalla response');

  const legs = vd.trip.legs.map(leg => ({
    distance: leg.summary.length * 1609.34, // miles → meters
    duration: leg.summary.time,
    steps: []
  }));

  return {
    distance: vd.trip.summary.length * 1609.34,
    duration: vd.trip.summary.time,
    geometry: {
      type: 'LineString',
      coordinates: vd.trip.legs.flatMap(leg => decodePolyline6(leg.shape))
    },
    legs
  };
}

// OSRM is preferred for car (the public OSRM instance is tuned for driving and
// returns richer turn-by-turn data). Valhalla is preferred for bike/walk —
// OSRM's bike/foot profiles use brouter routes that are often missing or
// rate-limited, and Valhalla's pedestrian/bicycle costing is well-supported
// on the OSM-hosted instance.
function preferredRouters() {
  return state.travelMode === 'car'
    ? [['OSRM', fetchRouteOSRM], ['Valhalla', fetchRouteValhalla]]
    : [['Valhalla', fetchRouteValhalla], ['OSRM', fetchRouteOSRM]];
}

export async function fetchRoute(pts) {
  const key = cacheKey(pts);
  if (state.osrmCache[key]) return state.osrmCache[key];

  const order = preferredRouters();
  let lastErr;
  for (const [name, fn] of order) {
    try {
      const route = await fn(pts);
      state.osrmCache[key] = route;
      trimCache();
      saveJSON(STORE_CACHE, state.osrmCache);
      return route;
    } catch (e) {
      console.warn(`${name} route failed${name === order[0][0] ? ', trying fallback' : ''}:`, e);
      lastErr = e;
    }
  }
  throw new Error('All routing services failed: ' + (lastErr && lastErr.message));
}

/**
 * Fetch duration matrix from Valhalla sources_to_targets endpoint.
 * @param {Spot[]} sources - Source points
 * @param {Spot[]} targets - Target points
 * @returns {Promise<number[][]>}
 */
export async function fetchValhallaMatrix(sources, targets) {
  const profile = getProfile();
  if (!profile.valhalla) throw new Error('No Valhalla server configured');

  const costingMap = {car: 'auto', bike: 'bicycle', walk: 'pedestrian'};
  const body = {
    sources: sources.map(p => ({lat: p.lat, lon: p.lng})),
    targets: targets.map(p => ({lat: p.lat, lon: p.lng})),
    costing: costingMap[state.travelMode] || 'auto'
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const r = await fetch(`${profile.valhalla}/sources_to_targets`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(body),
      signal: controller.signal
    });
    clearTimeout(timeout);
    if (!r.ok) throw new Error(`Valhalla HTTP ${r.status}`);
    const data = await r.json();
    console.log('Valhalla response:', data);
    // Valhalla returns sources_to_targets with time in seconds
    if (!data.sources_to_targets || !Array.isArray(data.sources_to_targets)) {
      throw new Error('Invalid Valhalla response structure');
    }
    return data.sources_to_targets.map(row => row.map(cell => cell.time));
  } catch (e) {
    clearTimeout(timeout);
    console.error('Valhalla fetch error:', e);
    throw e;
  }
}

/**
 * Build an N×N straight-line duration matrix (seconds) using haversine + per-mode speed.
 * Used as the offline fallback when OSRM /table fails. Reads `state.travelMode`.
 * @param {Spot[]} pts
 * @returns {number[][]}
 */
export function buildHaversineMatrix(pts) {
  const speed = SPEED_MPH[state.travelMode] || SPEED_MPH.car;
  const n = pts.length;
  const m = Array.from({length: n}, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i !== j) m[i][j] = (hd(pts[i], pts[j]) / speed) * 3600;
    }
  }
  return m;
}

/**
 * Get (and memoize on `state.durationMatrix`) the full N×N duration matrix for `state.SPOTS`.
 * Falls back to Valhalla, then haversine on OSRM failure and sets `state.matrixFallback = true`.
 * @param {() => void} renderFn - Re-render hook used by the inline retry banner.
 * @returns {Promise<number[][]>}
 */
async function fetchOSRMTableMatrix(pts) {
  const data = await fetchTableChunked(pts);
  return data.durations;
}

// Mode-conditional router preference: OSRM is tuned for driving, Valhalla
// has better bike/pedestrian costing on the public OSM-hosted instance.
export function preferredMatrixSources() {
  return state.travelMode === 'car'
    ? [['OSRM', fetchOSRMTableMatrix], ['Valhalla', (pts) => fetchValhallaMatrix(pts, pts)]]
    : [['Valhalla', (pts) => fetchValhallaMatrix(pts, pts)], ['OSRM', fetchOSRMTableMatrix]];
}

export async function getFullDurationMatrix(renderFn) {
  if (state.durationMatrix) return state.durationMatrix;
  const order = preferredMatrixSources();
  let lastErr;
  for (const [name, fn] of order) {
    try {
      const matrix = await fn(state.SPOTS);
      state.durationMatrix = matrix;
      state.matrixFallback = false;
      return state.durationMatrix;
    } catch (e) {
      console.warn(`${name} matrix failed${name === order[0][0] ? ', trying fallback' : ''}:`, e.message);
      lastErr = e;
    }
  }
  console.warn('All matrix services failed, using haversine fallback:', lastErr && lastErr.message);
  state.durationMatrix = buildHaversineMatrix(state.SPOTS);
  state.matrixFallback = true;
  if (state.SPOTS.length > 10) {
    showError('Using approximate distances (server unavailable)', () => {
      state.durationMatrix = null;
      state.matrixFallback = false;
      renderFn();
    });
  }
  return state.durationMatrix;
}
