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

const OSRM_SERVERS = [
  OSRM,
  'https://routing.openstreetmap.de/routed-car'
];

async function fetchWithRetry(url, retries = 2, delay = 2000, signal) {
  for (let i = 0; i <= retries; i++) {
    try {
      const r = await fetch(url, signal ? {signal} : undefined);
      if (r.ok) return r;
      if ((r.status === 429 || r.status >= 500) && i < retries) {
        await new Promise(w => setTimeout(w, delay * (i + 1)));
        continue;
      }
      throw new Error(`HTTP ${r.status}`);
    } catch (e) {
      if (e.name === 'AbortError') throw e;
      if (i === retries) throw e;
      await new Promise(w => setTimeout(w, delay * (i + 1)));
    }
  }
}

async function fetchFromAnyServer(path) {
  for (const server of OSRM_SERVERS) {
    try {
      const r = await fetchWithRetry(`${server}${path}`);
      return r;
    } catch (e) {
      if (server === OSRM_SERVERS[OSRM_SERVERS.length - 1]) throw e;
    }
  }
}

export async function fetchTable(pts) {
  const c = pts.map(p => `${p.lng},${p.lat}`).join(';');
  const r = await fetchFromAnyServer(`/table/v1/driving/${c}?annotations=duration`);
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
      const path = `/table/v1/driving/${c}?annotations=duration&sources=${srcIndices.join(';')}&destinations=${dstIndices.join(';')}`;
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

export async function fetchRoute(pts) {
  const key = cacheKey(pts);
  if (state.osrmCache[key]) return state.osrmCache[key];
  const c = pts.map(p => `${p.lng},${p.lat}`).join(';');
  const r = await fetchFromAnyServer(`/route/v1/driving/${c}?overview=full&geometries=geojson&steps=true`);
  const d = await r.json();
  if (d.code !== 'Ok') throw new Error(d.message || d.code);
  state.osrmCache[key] = d.routes[0];
  trimCache();
  saveJSON(STORE_CACHE, state.osrmCache);
  return d.routes[0];
}

export function buildHaversineMatrix(pts) {
  const n = pts.length;
  const m = Array.from({length: n}, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i !== j) m[i][j] = (hd(pts[i], pts[j]) / 25) * 3600;
    }
  }
  return m;
}

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
    showError('Using approximate distances — routing server unavailable', () => {
      state.durationMatrix = null;
      state.matrixFallback = false;
      renderFn();
    });
  }
  return state.durationMatrix;
}
