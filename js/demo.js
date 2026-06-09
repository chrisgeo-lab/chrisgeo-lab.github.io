// Demo data and the routine that installs / restores it.
// Kept separate from tour.js so the demo is reusable outside the tour
// (e.g. on first visit, "Try demo" button, etc).

import { state } from './state.js';
import { buildHaversineMatrix } from './routing.js';
import { fitBounds, map } from './map.js';
import { DEMO_FIT_PADDING } from './constants.js';

export const DEMO_SPOTS = [
  {id: 1,  street: '1 Ferry Building',         city: 'San Francisco',       state: 'CA', zip: '94111', lat: 37.7955, lng: -122.3937},
  {id: 2,  street: '3251 20th Ave',            city: 'San Francisco',       state: 'CA', zip: '94132', lat: 37.7295, lng: -122.4780},
  {id: 3,  street: '501 Stanyan St',           city: 'San Francisco',       state: 'CA', zip: '94117', lat: 37.7694, lng: -122.4528},
  {id: 4,  street: '2 Marina Blvd',            city: 'San Francisco',       state: 'CA', zip: '94123', lat: 37.8066, lng: -122.4364},
  {id: 5,  street: '600 Montgomery St',        city: 'San Francisco',       state: 'CA', zip: '94111', lat: 37.7952, lng: -122.4028},
  {id: 6,  street: '55 Music Concourse Dr',    city: 'San Francisco',       state: 'CA', zip: '94118', lat: 37.7706, lng: -122.4669},
  {id: 7,  street: '1 Warriors Way',           city: 'San Francisco',       state: 'CA', zip: '94158', lat: 37.7680, lng: -122.3877},
  {id: 8,  street: '900 Innes Ave',            city: 'San Francisco',       state: 'CA', zip: '94124', lat: 37.7345, lng: -122.3720},
  {id: 9,  street: '2801 Leavenworth St',      city: 'San Francisco',       state: 'CA', zip: '94133', lat: 37.8070, lng: -122.4187},
  {id: 10, street: '1 Sausalito Blvd',         city: 'Sausalito',           state: 'CA', zip: '94965', lat: 37.8590, lng: -122.4852},
  {id: 11, street: '100 Shoreline Hwy',        city: 'Mill Valley',         state: 'CA', zip: '94941', lat: 37.8830, lng: -122.5270},
  {id: 12, street: '501 Sir Francis Drake',    city: 'San Anselmo',         state: 'CA', zip: '94960', lat: 37.9746, lng: -122.5615},
  {id: 13, street: '800 Point San Pedro Rd',   city: 'San Rafael',          state: 'CA', zip: '94901', lat: 37.9952, lng: -122.4530},
  {id: 14, street: '2000 Larkspur Landing',    city: 'Larkspur',            state: 'CA', zip: '94939', lat: 37.9455, lng: -122.5090},
  {id: 15, street: '400 Oyster Point Blvd',    city: 'South San Francisco', state: 'CA', zip: '94080', lat: 37.6640, lng: -122.3975},
  {id: 16, street: '1600 Bayshore Hwy',        city: 'Burlingame',          state: 'CA', zip: '94010', lat: 37.5930, lng: -122.3620},
  {id: 17, street: '250 Hamilton Ave',         city: 'Palo Alto',           state: 'CA', zip: '94301', lat: 37.4430, lng: -122.1610},
  {id: 18, street: '100 El Camino Real',       city: 'Redwood City',        state: 'CA', zip: '94063', lat: 37.4860, lng: -122.2280},
  {id: 19, street: '3251 Hanover St',          city: 'Palo Alto',           state: 'CA', zip: '94304', lat: 37.4170, lng: -122.1450},
  {id: 20, street: '1 Hacker Way',             city: 'Menlo Park',          state: 'CA', zip: '94025', lat: 37.4845, lng: -122.1477},
  {id: 21, street: '1600 Amphitheatre Pkwy',   city: 'Mountain View',       state: 'CA', zip: '94043', lat: 37.4220, lng: -122.0841},
  {id: 22, street: '1 Infinite Loop',          city: 'Cupertino',           state: 'CA', zip: '95014', lat: 37.3318, lng: -122.0312},
  {id: 23, street: '2855 Stevens Creek Blvd',  city: 'Santa Clara',         state: 'CA', zip: '95050', lat: 37.3240, lng: -121.9490},
  {id: 24, street: '200 Santa Row',            city: 'San Jose',            state: 'CA', zip: '95128', lat: 37.3210, lng: -121.9470},
  {id: 25, street: '750 The Alameda',          city: 'San Jose',            state: 'CA', zip: '95126', lat: 37.3330, lng: -121.9060},
  {id: 26, street: '5401 Bay St',              city: 'Emeryville',          state: 'CA', zip: '94608', lat: 37.8390, lng: -122.2960},
  {id: 27, street: '1 Telegraph Ave',          city: 'Oakland',             state: 'CA', zip: '94612', lat: 37.8115, lng: -122.2730},
  {id: 28, street: '6000 Shellmound St',       city: 'Emeryville',          state: 'CA', zip: '94608', lat: 37.8460, lng: -122.2930},
  {id: 29, street: '1955 Broadway',            city: 'Oakland',             state: 'CA', zip: '94612', lat: 37.8120, lng: -122.2660},
  {id: 30, street: '51 Moraga Way',            city: 'Orinda',              state: 'CA', zip: '94563', lat: 37.8780, lng: -122.1800}
];

const DEMO_VISITED_IDS    = [5, 9, 15, 22];
const DEMO_START_INDEX    = 0;     // Ferry Building
const DEMO_END_INDEX      = 29;    // Orinda
const DEMO_NUM_CLUSTERS   = 3;
const DEMO_CLUSTER_MAX    = 10;

let saved = null;

export function isDemoActive() {
  return !!state.demoMode;
}

// Install demo state. The `demoMode` flag tells the planner / routing
// layer to skip OSRM and use synthetic geometry, so the demo always
// renders instantly regardless of network status.
export function loadDemo(renderFn) {
  saved = {
    spots:           state.SPOTS.length ? state.SPOTS.slice() : null,
    visitedSet:      new Set(state.visitedSet),
    numClusters:     state.numClusters,
    startPoint:      state.startPoint,
    home:            state.home,
    durationMatrix:  state.durationMatrix
  };

  state.SPOTS       = DEMO_SPOTS.map(s => ({...s}));
  state.visitedSet  = new Set(DEMO_VISITED_IDS);
  state.startPoint  = anchorFromSpot(DEMO_SPOTS[DEMO_START_INDEX], DEMO_START_INDEX);
  state.home        = anchorFromSpot(DEMO_SPOTS[DEMO_END_INDEX],   DEMO_END_INDEX);
  state.numClusters = DEMO_NUM_CLUSTERS;
  state.activeFilter   = -1;
  state.currentRoutes  = [];
  state.demoMode       = false; // Use real routing even during demo
  state.matrixFallback = false;
  state.durationMatrix = null; // Let routing fetch real OSRM matrix

  syncClusterSlider(DEMO_NUM_CLUSTERS, DEMO_CLUSTER_MAX);

  // Suppress renderView's fitBounds — demo handles framing after CSS settles.
  state.suppressFitBounds = true;

  // Kick render with real OSRM routing.
  Promise.resolve(renderFn()).catch(e => console.error('Demo render failed:', e));

  // Frame the demo on the next paint regardless of route resolution.
  // Two rAFs so the empty-state-collapsing CSS transition has settled and
  // the map canvas has its post-empty-state dimensions before fitBounds runs.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      try { map.resize(); } catch {}
      fitBounds(DEMO_SPOTS.map(s => [s.lat, s.lng]), {padding: DEMO_FIT_PADDING});
    });
  });
}

export function restoreFromDemo(renderFn) {
  if (!saved) return;
  state.SPOTS          = saved.spots ?? [];
  state.visitedSet     = saved.visitedSet ?? new Set();
  state.numClusters    = saved.numClusters;
  state.startPoint     = saved.startPoint;
  state.home           = saved.home;
  state.durationMatrix = null; // Clear matrix to force re-routing with user's data
  state.demoMode       = false;
  state.matrixFallback = false;
  state.currentRoutes  = [];
  syncClusterSlider(state.numClusters, null);
  saved = null;
  renderFn();
}

function anchorFromSpot(spot, spotId) {
  return {lat: spot.lat, lng: spot.lng, label: spot.street, spotId};
}

function syncClusterSlider(value, maxOverride) {
  const slider = document.getElementById('clusterSlider');
  const sliderVal = document.getElementById('clusterVal');
  if (slider) {
    if (maxOverride != null && +slider.max < maxOverride) {
      slider.max = maxOverride;
      slider.setAttribute('max', maxOverride);
    }
    slider.value = value;
  }
  if (sliderVal) sliderVal.textContent = String(value);
}
