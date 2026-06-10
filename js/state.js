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
// Single source of truth for the "visited / orphaned route" marker color.
// Matches `--tertiary` in css/base.css so the dropdown dot, stop list section
// header, and visited markers on the map all read as the same gray.
export const VISITED_COLOR = '#8e8e94';
// Single-route default — used for the unrouted preview, the "All Routes"
// dropdown indicator, and any place we need "the primary route blue".
// Aligned to COLORS[0] so the cluster-1 route and the unrouted preview
// render identically.
export const PRIMARY_ROUTE_COLOR = COLORS[0];
export const STOP_MIN = 3;
// Routing API profiles with primary + fallback servers.
// OSRM: /{table,route}/v1/driving/{coords}
// Valhalla: /route with JSON POST body
export const OSRM_PROFILES = {
  car: {
    primary: 'https://router.project-osrm.org',
    fallback: 'https://routing.openstreetmap.de/routed-car',
    valhalla: 'https://valhalla1.openstreetmap.de',
    service: 'driving'
  },
  bike: {
    primary: 'https://routing.openstreetmap.de/routed-bike',
    fallback: null,
    valhalla: 'https://valhalla1.openstreetmap.de',
    service: 'bike'
  },
  walk: {
    primary: 'https://routing.openstreetmap.de/routed-foot',
    fallback: null,
    valhalla: 'https://valhalla1.openstreetmap.de',
    service: 'foot'
  }
};
export const STORE_V = 'routeflow-visited';
export const STORE_ROUTE_MAP = 'routeflow-visited-routes'; // Maps spot ID → route index
export const STORE_ROUTE_OVERRIDES = 'routeflow-route-overrides'; // Maps spot ID → manually-pinned route index
export const STORE_H = 'routeflow-home';
export const STORE_START = 'routeflow-start';
export const STORE_CACHE = 'routeflow-osrm-cache';
export const STORE_TRAVEL_MODE = 'routeflow-travel-mode';
export const STORE_START_MODE = 'routeflow-start-mode'; // 'auto' | 'none'
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

/** Validate anchor object from localStorage — reject if missing lat/lng to prevent crashes. */
function validateAnchor(anchor) {
  if (!anchor) return null;
  if (!Number.isFinite(anchor.lat) || !Number.isFinite(anchor.lng)) {
    console.warn('validateAnchor: corrupt anchor data, ignoring', anchor);
    return null;
  }
  return anchor;
}
/** Persist a Set as a JSON array under `k`. */
export function saveSet(k, s) { saveJSON(k, [...s]); }
let storageFullToasted = false;
/** Persist `v` as JSON under `k`. On QuotaExceeded drops the entire OSRM cache and retries once. */
export function saveJSON(k, v) {
  try { localStorage.setItem(k, JSON.stringify(v)); }
  catch(e) {
    if (e.name === 'QuotaExceededError' || e.code === 22) {
      // The OSRM cache is the lion's share of stored data — drop it entirely
      // before warning the user, since it's recomputable.
      try {
        state.osrmCache = {};
        localStorage.removeItem(STORE_CACHE);
      } catch {}
      try { localStorage.setItem(k, JSON.stringify(v)); return; }
      catch {}
      if (!storageFullToasted) {
        storageFullToasted = true;
        toast('Storage full — data may not persist');
      }
    }
  }
}

/**
 * Resolve the route's origin: explicit start point, then GPS, else null.
 * Reads `state.startPoint` and `state.gpsPos`.
 * @returns {Anchor|null}
 */
export function getStartLocation() {
  // Explicit "no origin" — route begins at the first optimized stop.
  if (state.startMode === 'none') return null;
  if (state.startPoint && Number.isFinite(state.startPoint.lat) && Number.isFinite(state.startPoint.lng)) {
    return state.startPoint;
  }
  if (state.gpsPos && Number.isFinite(state.gpsPos.lat) && Number.isFinite(state.gpsPos.lng)) {
    return {lat: state.gpsPos.lat, lng: state.gpsPos.lng, label: 'Current Location'};
  }
  return null;
}

/**
 * Return the routes the UI is currently displaying.
 * Reads `state.activeFilter`:
 *   -1 = all routes
 *   -2 = visited only (returns empty array, UI handles separately)
 *   >= 0 = single route by index
 * @returns {Route[]}
 */
export function getActiveRoutes() {
  if (state.activeFilter === -2) return []; // Visited-only view, no active routes
  return state.activeFilter >= 0 ? [state.currentRoutes[state.activeFilter]] : state.currentRoutes;
}

function loadSpots() {
  try {
    const r = localStorage.getItem(STORE_SPOTS);
    if (!r) return DEFAULT_SPOTS;
    const parsed = JSON.parse(r);
    if (!Array.isArray(parsed)) return DEFAULT_SPOTS;
    return parsed.filter(s => s && Number.isFinite(s.lat) && Number.isFinite(s.lng) && Math.abs(s.lat) <= 90 && Math.abs(s.lng) <= 180);
  } catch { return DEFAULT_SPOTS; }
}

/**
 * Singleton mutable app state. Imported (not passed) by every module.
 * Field ownership / mutation map:
 *   SPOTS, visitedSet, home, startPoint  — address-manager.js, modals.js, tour.js (write); planner.js, ui.js (read)
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
  visitedRouteMap: loadJSON(STORE_ROUTE_MAP) || {}, // Maps spot ID → route index when visited
  // Manual route assignments. Maps spot ID → route index (0-based). When a spot
  // appears here, the planner forces it into that cluster instead of letting
  // k-medoids choose. Indices outside [0, numClusters) are ignored at solve time.
  routeOverrides: loadJSON(STORE_ROUTE_OVERRIDES) || {},
  // Validate anchors from localStorage — corrupt data (missing lat/lng) causes crashes.
  home: validateAnchor(loadJSON(STORE_H)),
  startPoint: validateAnchor(loadJSON(STORE_START)),
  startMode: (localStorage.getItem(STORE_START_MODE) === 'none') ? 'none' : 'auto',
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
  travelMode: loadJSON(STORE_TRAVEL_MODE) || 'car',
  gpsState: 'unknown', // 'unknown' | 'granted' | 'denied' | 'unavailable'
  // Stop currently highlighted in the side panel due to a marker click.
  // null = no highlight. Cleared on full re-renders.
  focusedStopId: null
};
