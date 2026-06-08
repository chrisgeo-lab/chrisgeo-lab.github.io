// tests/setup.js installs maplibregl + DOM stubs at import time. We import
// it before the demo module so its transitive map.js import doesn't blow up.
import './setup.js';

import { describe, it, expect } from './runner.js';
import { DEMO_SPOTS, isDemoActive, loadDemo, restoreFromDemo } from '../js/demo.js';
import { state } from '../js/state.js';

const noopRender = () => Promise.resolve();

// ---------------------------------------------------------------------------
// DEMO_SPOTS data integrity
// ---------------------------------------------------------------------------
describe('DEMO_SPOTS', () => {
  it('contains exactly 30 entries', () => {
    expect(DEMO_SPOTS.length).toBe(30);
  });

  it('every entry has id, street, city, state, zip, lat, lng', () => {
    for (const s of DEMO_SPOTS) {
      expect(typeof s.id).toBe('number');
      expect(typeof s.street).toBe('string');
      expect(typeof s.city).toBe('string');
      expect(typeof s.state).toBe('string');
      expect(typeof s.zip).toBe('string');
      expect(typeof s.lat).toBe('number');
      expect(typeof s.lng).toBe('number');
      expect(s.street.length > 0).toBe(true);
      expect(s.city.length > 0).toBe(true);
    }
  });

  it('every lat/lng is a valid coordinate', () => {
    for (const s of DEMO_SPOTS) {
      expect(s.lat >= -90  && s.lat <= 90).toBe(true);
      expect(s.lng >= -180 && s.lng <= 180).toBe(true);
    }
  });

  it('all ids are unique', () => {
    const ids = DEMO_SPOTS.map(s => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('hard-coded DEMO_VISITED_IDS values all exist in DEMO_SPOTS', () => {
    // The constant is module-private. We mirror its current value here.
    // If demo.js changes this list, update both places.
    const DEMO_VISITED_IDS = [5, 9, 15, 22];
    const knownIds = new Set(DEMO_SPOTS.map(s => s.id));
    for (const vid of DEMO_VISITED_IDS) {
      expect(knownIds.has(vid)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// isDemoActive / loadDemo / restoreFromDemo
// ---------------------------------------------------------------------------
describe('isDemoActive', () => {
  it('returns false before loadDemo is called', () => {
    // Ensure clean slate. If a previous test left demoMode true, restore it.
    if (state.demoMode) restoreFromDemo(noopRender);
    expect(isDemoActive()).toBe(false);
  });
});

describe('loadDemo', () => {
  it('mutates state synchronously: demoMode/matrixFallback/SPOTS/start/home', () => {
    // Pre-populate with a sentinel so we can verify restore later.
    const sentinelSpot = {id: 999, street: 'Sentinel', city: 'X', state: 'XX', zip: '00000', lat: 0, lng: 0};
    state.SPOTS = [sentinelSpot];
    state.visitedSet = new Set([42]);
    state.numClusters = 7;
    state.startPoint = {lat: 1, lng: 2, label: 'prev', spotId: 0};
    state.home = {lat: 3, lng: 4, label: 'prev-home', spotId: 0};

    loadDemo(noopRender);

    expect(state.demoMode).toBe(true);
    expect(state.matrixFallback).toBe(true);
    expect(state.SPOTS.length).toBe(30);
    // SPOTS should be a copy of DEMO_SPOTS, not the same reference.
    expect(state.SPOTS[0].id).toBe(DEMO_SPOTS[0].id);
    expect(state.SPOTS[0] === DEMO_SPOTS[0]).toBe(false);

    // Start and home anchors must carry a spotId field.
    expect(state.startPoint && typeof state.startPoint.spotId === 'number').toBe(true);
    expect(state.home && typeof state.home.spotId === 'number').toBe(true);
    expect(typeof state.startPoint.lat).toBe('number');
    expect(typeof state.startPoint.lng).toBe('number');
    expect(typeof state.home.lat).toBe('number');
    expect(typeof state.home.lng).toBe('number');

    // Cluster count comes from the demo constant (3) and currentRoutes is reset.
    expect(state.numClusters).toBe(3);
    expect(Array.isArray(state.currentRoutes)).toBe(true);
    expect(state.currentRoutes.length).toBe(0);

    // Duration matrix is precomputed via haversine fallback (30x30).
    expect(Array.isArray(state.durationMatrix)).toBe(true);
    expect(state.durationMatrix.length).toBe(30);
  });

  it('makes isDemoActive() return true', () => {
    expect(isDemoActive()).toBe(true);
  });
});

describe('restoreFromDemo', () => {
  it('round-trips: state mutations are reverted to whatever was saved by loadDemo', () => {
    // The previous loadDemo test saved a sentinel SPOTS list. Restore now.
    restoreFromDemo(noopRender);

    expect(state.demoMode).toBe(false);
    expect(state.matrixFallback).toBe(false);
    expect(state.SPOTS.length).toBe(1);
    expect(state.SPOTS[0].id).toBe(999);
    expect(state.numClusters).toBe(7);
    expect(state.startPoint && state.startPoint.label).toBe('prev');
    expect(state.home && state.home.label).toBe('prev-home');
    expect(isDemoActive()).toBe(false);
  });

  it('is a no-op when called without a prior loadDemo', () => {
    // Calling twice in a row: second call has nothing saved, must not throw
    // or wipe the current SPOTS list.
    const before = state.SPOTS.slice();
    restoreFromDemo(noopRender);
    expect(state.SPOTS.length).toBe(before.length);
  });
});
