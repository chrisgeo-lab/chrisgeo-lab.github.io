import { toast } from './utils.js';

/**
 * @typedef {Object} Spot
 * A geocoded stop. May represent an imported address, the home/end point,
 * or an ad-hoc anchor (start point, GPS position).
 * @property {number} [id]      Stable numeric id (only for SPOTS imported by the user).
 * @property {number} lat
 * @property {number} lng
 * @property {string} [street]
 * @property {string} [city]
 * @property {string} [state]
 * @property {string} [zip]
 * @property {string} [label]   Human-readable label (used by start/home anchors).
 */

/**
 * @typedef {Object} Anchor
 * Start- or end-point reference. Either resolves to a free Spot or pins to an existing SPOTS entry.
 * @property {number} lat
 * @property {number} lng
 * @property {string} [label]
 * @property {number|null} [spotId]  When non-null, this anchor *is* SPOTS[spotId] — exclude from routing.
 */

/**
 * @typedef {Object} Route
 * A single solved route in `state.currentRoutes` (one of N when clustering > 1).
 * @property {number[]} route        Ordered SPOTS indices to visit (excludes start/home).
 * @property {string} color
 * @property {string} name
 * @property {Object} geometry       GeoJSON LineString covering origin → stops → home.
 * @property {Array|null} legs       OSRM legs, or null if route came from haversine fallback.
 * @property {number} totalMiles
 * @property {number} totalMinutes
 */

export const DEFAULT_SPOTS = [];
export const STORE_SPOTS = 'routeflow-spots';
export const COLORS = ['#007AFF','#34C759','#FF9500','#AF52DE','#FF2D55','#5AC8FA','#5856D6','#FF6482'];
export const STOP_MIN = 3;
// OSRM HTTP API path is /{table,route}/v1/{service}/{coords}. The {service}
// segment is a generic placeholder — each public routing.openstreetmap.de
// server is already specialized for one profile (routed-bike, routed-foot,
// routed-car) and only advertises the 'driving' service. Using 'bike'/'foot'
// here causes 400 InvalidService responses.
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

/** Load a JSON-serialized array under `k` as a Set; empty Set on miss/error. */
export function loadSet(k) {
  try { const r = localStorage.getItem(k); return r ? new Set(JSON.parse(r)) : new Set(); }
  catch { return new Set(); }
}
/** Load JSON value at `k`; null on miss/error. */
export function loadJSON(k) {
  try { const r = localStorage.getItem(k); return r ? JSON.parse(r) : null; }
  catch { return null; }
}
/** Persist a Set as a JSON array under `k`. */
export function saveSet(k, s) { saveJSON(k, [...s]); }
/** Persist `v` as JSON under `k`. On QuotaExceeded evicts half of `state.osrmCache` and retries once. */
export function saveJSON(k, v) {
  try { localStorage.setItem(k, JSON.stringify(v)); }
  catch(e) {
    if (e.name === 'QuotaExceededError' || e.code === 22) {
      evictCache();
      try { localStorage.setItem(k, JSON.stringify(v)); }
      catch { toast('Storage full — data may not persist'); }
    }
  }
}

function evictCache() {
  const keys = Object.keys(state.osrmCache);
  if (keys.length <= 5) return;
  const toRemove = keys.slice(0, Math.ceil(keys.length / 2));
  toRemove.forEach(k => delete state.osrmCache[k]);
  try { localStorage.setItem(STORE_CACHE, JSON.stringify(state.osrmCache)); } catch {}
}

/**
 * Resolve the route's origin: explicit start point, then GPS, else null.
 * Reads `state.startPoint` and `state.gpsPos`.
 * @returns {Anchor|null}
 */
export function getStartLocation() {
  if (state.startPoint) return state.startPoint;
  if (state.gpsPos) return {lat: state.gpsPos.lat, lng: state.gpsPos.lng, label: 'Current Location'};
  return null;
}

/**
 * Return the routes the UI is currently displaying.
 * Reads `state.activeFilter` (a single-route filter when ≥0) and `state.currentRoutes`.
 * @returns {Route[]}
 */
export function getActiveRoutes() {
  return state.activeFilter >= 0 ? [state.currentRoutes[state.activeFilter]] : state.currentRoutes;
}

function loadSpots() {
  try {
    const r = localStorage.getItem(STORE_SPOTS);
    if (!r) return DEFAULT_SPOTS;
    const parsed = JSON.parse(r);
    if (!Array.isArray(parsed)) return DEFAULT_SPOTS;
    return parsed.filter(s => s && typeof s.lat === 'number' && typeof s.lng === 'number' && Math.abs(s.lat) <= 90 && Math.abs(s.lng) <= 180);
  } catch { return DEFAULT_SPOTS; }
}

/**
 * Singleton mutable app state. Imported (not passed) by every module.
 * Field ownership / mutation map:
 *   SPOTS, visitedSet, home, startPoint  — addresses.js, modals.js, tour.js (write); planner.js, ui.js (read)
 *   numClusters, activeFilter            — wiring.js, ui.js (write); planner.js (read)
 *   currentRoutes, durationMatrix        — planner.js, routing.js (write); ui.js, exports.js (read)
 *   gpsPos                               — geolocation.js, wiring.js (write); ui.js, planner.js (read)
 *   osrmCache, matrixFallback            — routing.js (write); ui.js (read)
 *   showVisitedMarkers, sheetState,
 *   suppressFitBounds, renderVer         — ui.js, wiring.js, sheet.js (write); ui.js (read)
 *   travelMode                           — wiring.js (write); routing.js (read)
 */
export const state = {
  SPOTS: loadSpots(),
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
  demoMode: false,
  sheetState: 'peek',
  travelMode: loadJSON('routeflow-travel-mode') || 'car'
};
