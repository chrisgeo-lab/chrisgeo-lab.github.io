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
export async function fetchRoute(pts) {
  const key = cacheKey(pts);
  if (state.osrmCache[key]) return state.osrmCache[key];
  const c = pts.map(p => `${p.lng},${p.lat}`).join(';');
  const svc = getProfile().service;
  const r = await fetchFromAnyServer(`/route/v1/${svc}/${c}?overview=full&geometries=geojson&steps=true`);
  const d = await r.json();
  if (d.code !== 'Ok') throw new Error(d.message || d.code);
  state.osrmCache[key] = d.routes[0];
  trimCache();
  saveJSON(STORE_CACHE, state.osrmCache);
  return d.routes[0];
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
 * Falls back to haversine on OSRM failure and sets `state.matrixFallback = true`.
 * @param {() => void} renderFn - Re-render hook used by the inline retry banner.
 * @returns {Promise<number[][]>}
 */
export async function getFullDurationMatrix(renderFn) {
  if (state.durationMatrix) return state.durationMatrix;
  try {
    const data = await fetchTableChunked(state.SPOTS);
    state.durationMatrix = data.durations;
    state.matrixFallback = false;
  } catch (e) {
    console.warn('OSRM table failed, using haversine fallback:', e.message);
    state.durationMatrix = buildHaversineMatrix(state.SPOTS);
    state.matrixFallback = true;
    if (state.SPOTS.length > 10) {
      showError('Using approximate distances (server unavailable)', () => {
        state.durationMatrix = null;
        state.matrixFallback = false;
        renderFn();
      });
    }
  }
  return state.durationMatrix;
}
