export const DEFAULT_SPOTS = [];
export const STORE_SPOTS = 'festival-spots';
export const COLORS = ['#007AFF','#34C759','#FF9500','#AF52DE','#FF2D55','#5AC8FA','#5856D6','#FF6482'];
export const STOP_MIN = 3;
export const OSRM = 'https://router.project-osrm.org';
export const STORE_V = 'festival-visited';
export const STORE_H = 'festival-home';
export const STORE_CACHE = 'festival-osrm-cache';
export const CACHE_MAX_ENTRIES = 50;

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
    if (e.name === 'QuotaExceededError') { evictCache(); try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
  }
}

function evictCache() {
  const keys = Object.keys(state.osrmCache);
  if (keys.length <= 5) return;
  const toRemove = keys.slice(0, Math.ceil(keys.length / 2));
  toRemove.forEach(k => delete state.osrmCache[k]);
  saveJSON(STORE_CACHE, state.osrmCache);
}

export const state = {
  SPOTS: (function() { try { const r = localStorage.getItem(STORE_SPOTS); return r ? JSON.parse(r) : null; } catch { return null; } })() || DEFAULT_SPOTS,
  visitedSet: loadSet(STORE_V),
  home: loadJSON(STORE_H),
  startPoint: loadJSON('routeflow-start'),
  numClusters: 1,
  activeFilter: -1,
  viewMode: 'stops',
  currentRoutes: [],
  durationMatrix: null,
  isNavigating: false,
  gpsWatchId: null,
  gpsPos: null,
  gpsMarker: null,
  persistentGpsMarker: null,
  showVisitedMarkers: false,
  suppressFitBounds: false,
  navRouteIdx: 0,
  navStopIdx: 0,
  navLegIdx: 0,
  navStepIdx: 0,
  userPanned: false,
  osrmCache: loadJSON(STORE_CACHE) || {},
  renderVer: 0,
  lastRenderError: null,
  matrixFallback: false,
  panelHidden: false,
  navRoute: null,
  navCurrentLeg: 0,
  navCurrentStep: 0,
  sheetState: 'peek'
};
