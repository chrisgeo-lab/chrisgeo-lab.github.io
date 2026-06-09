import './setup.js';

import { describe, it, expect } from './runner.js';
import { state } from '../js/state.js';
import { setAnchor, clearAllAnchors, invalidateStaleSpotIds, anchorFromSpotId } from '../js/anchors.js';

function clearStore() {
  try {
    localStorage.removeItem('routeflow-start');
    localStorage.removeItem('routeflow-home');
  } catch {}
}

describe('setAnchor', () => {
  it('writes the anchor to state and persists it', () => {
    clearStore();
    setAnchor('start', { lat: 1, lng: 2, label: 'A' });
    expect(state.startPoint && state.startPoint.label).toBe('A');
    expect(localStorage.getItem('routeflow-start')).toBeTruthy();
  });

  it('clears state and removes the storage key when anchor is null', () => {
    setAnchor('start', { lat: 1, lng: 2, label: 'A' });
    setAnchor('start', null);
    expect(state.startPoint).toBeNull();
    expect(localStorage.getItem('routeflow-start')).toBeNull();
  });
});

describe('clearAllAnchors', () => {
  it('clears both start and home', () => {
    setAnchor('start', { lat: 1, lng: 2, label: 'A' });
    setAnchor('home',  { lat: 3, lng: 4, label: 'B' });
    clearAllAnchors();
    expect(state.startPoint).toBeNull();
    expect(state.home).toBeNull();
  });
});

describe('invalidateStaleSpotIds', () => {
  it('drops spotId when it does not point at a SPOTS entry', () => {
    state.SPOTS = [{ id: 1, lat: 0, lng: 0 }];
    state.startPoint = { lat: 9, lng: 9, label: 'old', spotId: 5 };
    state.home = { lat: 0, lng: 0, label: 'home', spotId: 0 };

    const changed = invalidateStaleSpotIds();
    expect(changed).toBe(true);
    expect(state.startPoint.spotId).toBeNull();
    // home points at a valid SPOTS index — preserved
    expect(state.home.spotId).toBe(0);
  });

  it('returns false when nothing was stale', () => {
    state.SPOTS = [{ id: 1, lat: 0, lng: 0 }];
    state.startPoint = null;
    state.home = { lat: 0, lng: 0, label: 'home', spotId: 0 };
    expect(invalidateStaleSpotIds()).toBe(false);
  });
});

describe('anchorFromSpotId', () => {
  it('returns an anchor pinning lat/lng to the spot', () => {
    state.SPOTS = [{ id: 1, lat: 10, lng: 20, street: 'Foo St' }];
    const a = anchorFromSpotId(0);
    expect(a.lat).toBe(10);
    expect(a.lng).toBe(20);
    expect(a.spotId).toBe(0);
    expect(a.label).toBe('Foo St');
  });

  it('returns null for an out-of-range index', () => {
    state.SPOTS = [{ id: 1, lat: 0, lng: 0 }];
    expect(anchorFromSpotId(99)).toBeNull();
  });
});
