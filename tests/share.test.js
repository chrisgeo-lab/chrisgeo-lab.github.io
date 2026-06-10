import './setup.js';

import { describe, it, expect } from './runner.js';
import { state } from '../js/state.js';
import { buildShareUrl, decodeShareHash, applyShareFromHash } from '../js/share.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function snapshot() {
  return {
    SPOTS: state.SPOTS,
    home: state.home,
    startPoint: state.startPoint,
    startMode: state.startMode,
    travelMode: state.travelMode,
    numClusters: state.numClusters,
    activeFilter: state.activeFilter,
    visitedSet: state.visitedSet,
    durationMatrix: state.durationMatrix,
    currentRoutes: state.currentRoutes
  };
}
function restore(s) { Object.assign(state, s); }

function seedDemoState() {
  state.SPOTS = [
    { id: 1, lat: 37.7749, lng: -122.4194, street: '1 Market St', city: 'SF', state: 'CA', zip: '94105' },
    { id: 2, lat: 37.7849, lng: -122.4094, street: '500 Pine St',  city: 'SF', state: 'CA', zip: '94104' },
    { id: 3, lat: 37.7649, lng: -122.4294, street: '900 Bryant St', city: 'SF', state: 'CA', zip: '94103' }
  ];
  state.home = { lat: 37.7700, lng: -122.4200, label: 'End', spotId: null };
  state.startPoint = { lat: 37.7800, lng: -122.4100, label: 'Start', spotId: null };
  state.startMode = 'auto';
  state.travelMode = 'bike';
  state.numClusters = 2;
  state.activeFilter = -1;
  state.visitedSet = new Set();
  state.currentRoutes = [];
}

// ---------------------------------------------------------------------------
// buildShareUrl <-> decodeShareHash round-trip
// ---------------------------------------------------------------------------
describe('share encode/decode', () => {
  it('round-trips full state through buildShareUrl + decodeShareHash', () => {
    const orig = snapshot();
    try {
      seedDemoState();
      const url = buildShareUrl();
      // URL must be absolute and carry a share= hash payload.
      expect(typeof url).toBe('string');
      expect(url.includes('#share=')).toBe(true);

      const hash = url.slice(url.indexOf('#'));
      const payload = decodeShareHash(hash);
      expect(payload).toBeTruthy();
      expect(payload.s.length).toBe(3);
      expect(payload.t).toBe('bike');
      expect(payload.k).toBe(2);
      expect(payload.m).toBe('auto');
      expect(payload.h && payload.h.b).toBe('End');
      expect(payload.p && payload.p.b).toBe('Start');
    } finally {
      restore(orig);
    }
  });

  it('decodeShareHash accepts hash with or without leading #', () => {
    const orig = snapshot();
    try {
      seedDemoState();
      const url = buildShareUrl();
      const hash = url.slice(url.indexOf('#'));
      const noHash = hash.replace(/^#/, '');
      expect(decodeShareHash(hash)).toBeTruthy();
      expect(decodeShareHash(noHash)).toBeTruthy();
    } finally {
      restore(orig);
    }
  });

  it('decodeShareHash returns null for an empty / unrelated hash', () => {
    expect(decodeShareHash('')).toBeNull();
    expect(decodeShareHash('#unrelated=1')).toBeNull();
    expect(decodeShareHash(null)).toBeNull();
  });

  it('decodeShareHash returns null for a corrupt base64 payload', () => {
    expect(decodeShareHash('#share=not-base64-!!!')).toBeNull();
  });

  it('decodeShareHash returns null when payload schema version mismatches', () => {
    // Build a payload with wrong version and confirm rejection. We hand-craft
    // the encoded body using the same b64url scheme buildShareUrl uses.
    const bad = { v: 999, s: [], t: 'car', k: 1, m: 'auto', f: -1 };
    const json = JSON.stringify(bad);
    const bytes = new TextEncoder().encode(json);
    let bin = '';
    for (const b of bytes) bin += String.fromCharCode(b);
    const enc = btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    expect(decodeShareHash('#share=' + enc)).toBeNull();
  });

  it('buildShareUrl with routeIndex filters spots to only that route', () => {
    const orig = snapshot();
    try {
      seedDemoState();
      // Fake a single route covering only spot id 1 (index 0).
      state.currentRoutes = [{
        route: [0],
        color: '#007AFF',
        name: 'Route 1',
        geometry: null,
        legs: null,
        totalMiles: 1,
        totalMinutes: 1
      }];
      const url = buildShareUrl({ routeIndex: 0 });
      const hash = url.slice(url.indexOf('#'));
      const payload = decodeShareHash(hash);
      expect(payload.s.length).toBe(1);
      expect(payload.s[0].i).toBe(1);
    } finally {
      restore(orig);
    }
  });

  it('single-route shares force k=1 and activeFilter=-1 (no re-clustering)', () => {
    // Reproduces a real bug: sender had 3 clusters, shared route 2 (1 stop),
    // and the receiver re-clustered the single shared stop into 3 routes
    // because the sender's numClusters tagged along in the payload.
    const orig = snapshot();
    try {
      seedDemoState();
      state.numClusters = 3;
      state.activeFilter = 1;
      state.currentRoutes = [
        { route: [0], color: '#007AFF', name: 'R1', geometry: null, legs: null, totalMiles: 1, totalMinutes: 1 },
        { route: [1], color: '#34C759', name: 'R2', geometry: null, legs: null, totalMiles: 1, totalMinutes: 1 },
        { route: [2], color: '#FF9500', name: 'R3', geometry: null, legs: null, totalMiles: 1, totalMinutes: 1 }
      ];
      const url = buildShareUrl({ routeIndex: 1 });
      const payload = decodeShareHash(url.slice(url.indexOf('#')));
      expect(payload.k).toBe(1);
      expect(payload.f).toBe(-1);
      expect(payload.s.length).toBe(1);
    } finally {
      restore(orig);
    }
  });

  it('"All Routes" share preserves the sender\'s numClusters and filter', () => {
    const orig = snapshot();
    try {
      seedDemoState();
      state.numClusters = 3;
      state.activeFilter = -1;
      const url = buildShareUrl({ routeIndex: -1 });
      const payload = decodeShareHash(url.slice(url.indexOf('#')));
      expect(payload.k).toBe(3);
      expect(payload.f).toBe(-1);
    } finally {
      restore(orig);
    }
  });

  it('round-trips routeOverrides under the receiver\'s re-issued spot ids', () => {
    const orig = snapshot();
    const origOverrides = state.routeOverrides;
    try {
      seedDemoState();
      state.numClusters = 2;
      state.routeOverrides = { 1: 0, 2: 1, 3: 0 };

      const url = buildShareUrl();
      const payload = decodeShareHash(url.slice(url.indexOf('#')));
      // Override map ships under `o`, keyed by sender ids.
      expect(payload.o && Object.keys(payload.o).length).toBe(3);
      expect(payload.o['1']).toBe(0);
      expect(payload.o['2']).toBe(1);

      // Receiver path: wipe state, apply the hash, then check overrides
      // were re-keyed under the freshly-issued ids.
      state.SPOTS = [];
      state.routeOverrides = {};
      history.replaceState(null, '', window.location.pathname + url.slice(url.indexOf('#')));
      const applied = applyShareFromHash();
      expect(applied).toBe(true);

      // SPOTS should each have a corresponding override entry under their new id.
      const overridesAfter = state.routeOverrides;
      expect(Object.keys(overridesAfter).length).toBe(3);
      // Pin assignments preserved per-spot — reverse-lookup by street.
      const findId = street => state.SPOTS.find(s => s.street === street).id;
      expect(overridesAfter[findId('1 Market St')]).toBe(0);
      expect(overridesAfter[findId('500 Pine St')]).toBe(1);
      expect(overridesAfter[findId('900 Bryant St')]).toBe(0);
    } finally {
      state.routeOverrides = origOverrides;
      restore(orig);
    }
  });

  it('drops out-of-range routeOverrides on single-route share', () => {
    const orig = snapshot();
    const origOverrides = state.routeOverrides;
    try {
      seedDemoState();
      state.numClusters = 3;
      state.routeOverrides = { 1: 2, 2: 0 };
      state.currentRoutes = [
        { route: [0], color: '#007AFF', name: 'R1', geometry: null, legs: null, totalMiles: 1, totalMinutes: 1 },
        { route: [1], color: '#34C759', name: 'R2', geometry: null, legs: null, totalMiles: 1, totalMinutes: 1 },
        { route: [2], color: '#FF9500', name: 'R3', geometry: null, legs: null, totalMiles: 1, totalMinutes: 1 }
      ];
      const url = buildShareUrl({ routeIndex: 0 });
      const payload = decodeShareHash(url.slice(url.indexOf('#')));
      // Single-route shares collapse to k=1, so any route-pin would be invalid;
      // the encoder strips overrides entirely.
      expect(payload.k).toBe(1);
      expect(payload.o && Object.keys(payload.o).length).toBe(0);
    } finally {
      state.routeOverrides = origOverrides;
      restore(orig);
    }
  });

  it('buildShareUrl excludes the visited set from the payload', () => {
    const orig = snapshot();
    try {
      seedDemoState();
      state.visitedSet = new Set([1, 2]);
      const url = buildShareUrl();
      const payload = decodeShareHash(url.slice(url.indexOf('#')));
      // No visited array in the payload schema — receiver starts fresh.
      expect(payload.visited === undefined).toBe(true);
      // All 3 spots still ride along regardless of visited state.
      expect(payload.s.length).toBe(3);
    } finally {
      restore(orig);
    }
  });
});

// ---------------------------------------------------------------------------
// applyShareFromHash
// ---------------------------------------------------------------------------
describe('applyShareFromHash', () => {
  it('returns false when there is no share hash', () => {
    const orig = snapshot();
    try {
      const prevHash = window.location.hash;
      history.replaceState(null, '', window.location.pathname);
      expect(applyShareFromHash()).toBe(false);
      if (prevHash) history.replaceState(null, '', window.location.pathname + prevHash);
    } finally {
      restore(orig);
    }
  });

  it('replaces SPOTS, mode, clusters from a valid share hash and clears the URL', () => {
    const orig = snapshot();
    try {
      seedDemoState();
      const url = buildShareUrl();
      const hash = url.slice(url.indexOf('#'));

      // Wipe state to simulate a brand-new visitor opening the link.
      state.SPOTS = [];
      state.home = null;
      state.startPoint = null;
      state.travelMode = 'car';
      state.numClusters = 1;
      state.visitedSet = new Set([99]); // pretend they had unrelated visited data

      // Stage the hash in the URL bar.
      history.replaceState(null, '', window.location.pathname + hash);

      const applied = applyShareFromHash();
      expect(applied).toBe(true);
      expect(state.SPOTS.length).toBe(3);
      expect(state.travelMode).toBe('bike');
      expect(state.numClusters).toBe(2);
      expect(state.visitedSet.size).toBe(0);
      // Hash must be stripped so a refresh doesn't re-apply.
      expect(window.location.hash === '' || window.location.hash === '#').toBe(true);
      // IDs must be re-issued — they should not collide with the original 1/2/3.
      const newIds = new Set(state.SPOTS.map(s => s.id));
      // Re-id moves all ids to fresh values; none should equal the originals.
      const collision = [1, 2, 3].some(id => newIds.has(id));
      expect(collision).toBe(false);
    } finally {
      restore(orig);
    }
  });

  it('returns false and leaves state alone for malformed payloads', () => {
    const orig = snapshot();
    try {
      seedDemoState();
      const before = state.SPOTS.length;
      history.replaceState(null, '', window.location.pathname + '#share=garbage');
      const applied = applyShareFromHash();
      expect(applied).toBe(false);
      expect(state.SPOTS.length).toBe(before);
      history.replaceState(null, '', window.location.pathname);
    } finally {
      restore(orig);
    }
  });
});
