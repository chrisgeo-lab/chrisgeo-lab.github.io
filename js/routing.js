import { state, OSRM, STORE_CACHE, CACHE_MAX_ENTRIES, saveJSON } from './state.js';
import { hd, showError } from './utils.js';

export function cacheKey(pts) { return pts.map(p => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`).join('|'); }

export function trimCache() {
  const keys = Object.keys(state.osrmCache);
  if (keys.length > CACHE_MAX_ENTRIES) {
    const toRemove = keys.slice(0, keys.length - CACHE_MAX_ENTRIES);
    toRemove.forEach(k => delete state.osrmCache[k]);
  }
}

async function fetchWithRetry(url, retries = 2, delay = 1000, signal) {
  for (let i = 0; i <= retries; i++) {
    try {
      const r = await fetch(url, signal ? {signal} : undefined);
      if (r.ok) return r;
      if (r.status >= 500 && i < retries) { await new Promise(w => setTimeout(w, delay * (i + 1))); continue; }
      throw new Error(`HTTP ${r.status}`);
    } catch (e) {
      if (e.name === 'AbortError') throw e;
      if (i === retries) throw e;
      await new Promise(w => setTimeout(w, delay * (i + 1)));
    }
  }
}

export async function fetchTable(pts) {
  const c = pts.map(p => `${p.lng},${p.lat}`).join(';');
  const r = await fetchWithRetry(`${OSRM}/table/v1/driving/${c}?annotations=duration,distance`);
  const d = await r.json(); if (d.code !== 'Ok') throw new Error(d.code);
  return d;
}

export async function fetchRoute(pts) {
  const key = cacheKey(pts);
  if (state.osrmCache[key]) return state.osrmCache[key];
  const c = pts.map(p => `${p.lng},${p.lat}`).join(';');
  const r = await fetchWithRetry(`${OSRM}/route/v1/driving/${c}?overview=full&geometries=geojson&steps=true`);
  const d = await r.json(); if (d.code !== 'Ok') throw new Error(d.code);
  state.osrmCache[key] = d.routes[0];
  trimCache();
  saveJSON(STORE_CACHE, state.osrmCache);
  return d.routes[0];
}

export function buildHaversineMatrix(pts) {
  const n = pts.length;
  const m = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    if (i !== j) m[i][j] = (hd(pts[i], pts[j]) / 25) * 3600;
  }
  return m;
}

export async function getFullDurationMatrix(renderFn) {
  if (state.durationMatrix) return state.durationMatrix;
  try {
    const data = await fetchTable(state.SPOTS);
    state.durationMatrix = data.durations;
    state.matrixFallback = false;
  } catch (e) {
    console.warn('OSRM table failed, using haversine fallback:', e);
    state.durationMatrix = buildHaversineMatrix(state.SPOTS);
    state.matrixFallback = true;
    showError('Using approximate distances — routing server unavailable', () => { state.durationMatrix = null; state.matrixFallback = false; renderFn(); });
  }
  return state.durationMatrix;
}
