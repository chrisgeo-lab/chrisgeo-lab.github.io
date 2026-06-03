export const DEFAULT_SPOTS = [];
export const STORE_SPOTS = 'routeflow-spots';
export const COLORS = ['#007AFF','#34C759','#FF9500','#AF52DE','#FF2D55','#5AC8FA','#5856D6','#FF6482'];
export const STOP_MIN = 3;
export const OSRM_PROFILES = {
  car: {primary: 'https://router.project-osrm.org', fallback: 'https://routing.openstreetmap.de/routed-car', service: 'driving'},
  bike: {primary: 'https://routing.openstreetmap.de/routed-bike', fallback: null, service: 'driving'},
  walk: {primary: 'https://routing.openstreetmap.de/routed-foot', fallback: null, service: 'driving'}
};
export const STORE_V = 'routeflow-visited';
export const STORE_H = 'routeflow-home';
export const STORE_CACHE = 'routeflow-osrm-cache';
export const CACHE_MAX_ENTRIES = 50;

// Migrate legacy localStorage keys (festival-* → routeflow-*)
(function migrateKeys() {
  const migrations = [
    ['festival-spots', STORE_SPOTS],
    ['festival-visited', STORE_V],
    ['festival-home', STORE_H],
    ['festival-osrm-cache', STORE_CACHE]
  ];
  try {
    for (const [oldKey, newKey] of migrations) {
      const val = localStorage.getItem(oldKey);
      if (val !== null && localStorage.getItem(newKey) === null) {
        localStorage.setItem(newKey, val);
      }
      localStorage.removeItem(oldKey);
    }
  } catch {}
})();

export function loadSet(k) {
  try { const r = localStorage.getItem(k); return r ? new Set(JSON.parse(r)) : new Set(); }
  catch { return new Set(); }
}
export function loadJSON(k) {
  try { const r = localStorage.getItem(k); return r ? JSON.parse(r) : null; }
  catch { return null; }
}
export function saveSet(k, s) { localStorage.setItem(k, JSON.stringify([...s])); }
export function saveJSON(k, v) {
  try { localStorage.setItem(k, JSON.stringify(v)); }
  catch(e) {
    if (e.name === 'QuotaExceededError' || e.code === 22) {
      evictCache();
      try { localStorage.setItem(k, JSON.stringify(v)); } catch {}
    }
  }
}

function evictCache() {
  const keys = Object.keys(state.osrmCache);
  if (keys.length <= 5) return;
  const toRemove = keys.slice(0, Math.ceil(keys.length / 2));
  toRemove.forEach(k => delete state.osrmCache[k]);
  saveJSON(STORE_CACHE, state.osrmCache);
}

export function getStartLocation() {
  if (state.startPoint) return state.startPoint;
  if (state.gpsPos) return {lat: state.gpsPos.lat, lng: state.gpsPos.lng, label: 'Current Location'};
  return null;
}

export function getActiveRoutes() {
  return state.activeFilter >= 0 ? [state.currentRoutes[state.activeFilter]] : state.currentRoutes;
}

export const state = {
  SPOTS: (function() { try { const r = localStorage.getItem(STORE_SPOTS); return r ? JSON.parse(r) : null; } catch { return null; } })() || DEFAULT_SPOTS,
  visitedSet: loadSet(STORE_V),
  home: loadJSON(STORE_H),
  startPoint: loadJSON('routeflow-start'),
  numClusters: 1,
  activeFilter: -1,
  currentRoutes: [],
  durationMatrix: null,
  gpsPos: null,
  showVisitedMarkers: false,
  suppressFitBounds: false,
  osrmCache: loadJSON(STORE_CACHE) || {},
  renderVer: 0,
  matrixFallback: false,
  sheetState: 'peek',
  travelMode: loadJSON('routeflow-travel-mode') || 'car'
};
