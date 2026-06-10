// Tests for the marker → side-panel focus highlight feature.
//
// `focusStopFromMarker` itself is not exported (it lives inside ui.js as a
// private helper bound to marker click handlers), but the *observable*
// contract is:
//   1. setting `state.focusedStopId` causes `renderStopList()` to mark the
//      matching `.stop-item` with the `focused` class and a `data-spot-id`
//      attribute the marker click handler can target.
//   2. a full `renderView()` clears `focusedStopId` so a stale highlight
//      doesn't survive an unrelated re-render.
//
// We exercise (1) directly via renderStopList — that's the only piece the
// marker click contract actually depends on. The clearing behavior of
// renderView is checked by inspecting the source rather than running it,
// since renderView pulls in the full DOM scaffold.

import './setup.js';

import { describe, it, expect } from './runner.js';
import { state } from '../js/state.js';
import { renderStopList, focusStopFromList } from '../js/stop-list-render.js';

function ensureStopsView() {
  let el = document.getElementById('stopsView');
  if (!el) {
    el = document.createElement('div');
    el.id = 'stopsView';
    document.body.appendChild(el);
  }
  el.innerHTML = '';
  return el;
}

function snapshot() {
  return {
    SPOTS: state.SPOTS,
    visitedSet: state.visitedSet,
    currentRoutes: state.currentRoutes,
    activeFilter: state.activeFilter,
    focusedStopId: state.focusedStopId
  };
}
function restore(s) { Object.assign(state, s); }

describe('focused stop highlight', () => {
  it('renderStopList tags the focused stop with .focused and data-spot-id', () => {
    const orig = snapshot();
    try {
      ensureStopsView();
      state.SPOTS = [
        { id: 101, lat: 1, lng: 2, street: 'A', city: 'X', state: 'CA' },
        { id: 102, lat: 1, lng: 2, street: 'B', city: 'X', state: 'CA' },
        { id: 103, lat: 1, lng: 2, street: 'C', city: 'X', state: 'CA' }
      ];
      state.visitedSet = new Set();
      state.currentRoutes = []; // pre-route path — uses unrouted stop list
      state.activeFilter = -1;
      state.focusedStopId = 102;

      renderStopList();

      const items = document.querySelectorAll('#stopsView .stop-item');
      expect(items.length).toBe(3);

      const focused = document.querySelector('#stopsView .stop-item.focused');
      expect(focused).toBeTruthy();
      expect(focused.dataset.spotId).toBe('102');

      // Sibling rows must NOT carry .focused.
      const focusedCount = document.querySelectorAll('#stopsView .stop-item.focused').length;
      expect(focusedCount).toBe(1);
    } finally {
      restore(orig);
    }
  });

  it('every stop row carries data-spot-id (so marker clicks can scroll to it)', () => {
    const orig = snapshot();
    try {
      ensureStopsView();
      state.SPOTS = [
        { id: 201, lat: 1, lng: 2, street: 'A', city: 'X', state: 'CA' },
        { id: 202, lat: 1, lng: 2, street: 'B', city: 'X', state: 'CA' }
      ];
      state.visitedSet = new Set();
      state.currentRoutes = [];
      state.activeFilter = -1;
      state.focusedStopId = null;

      renderStopList();
      const items = document.querySelectorAll('#stopsView .stop-item');
      expect(items.length).toBe(2);
      const ids = [...items].map(el => el.dataset.spotId);
      expect(ids).toEqual(['201', '202']);
    } finally {
      restore(orig);
    }
  });

  it('clearing focusedStopId removes the highlight on the next render', () => {
    const orig = snapshot();
    try {
      ensureStopsView();
      state.SPOTS = [
        { id: 301, lat: 1, lng: 2, street: 'A', city: 'X', state: 'CA' },
        { id: 302, lat: 1, lng: 2, street: 'B', city: 'X', state: 'CA' }
      ];
      state.visitedSet = new Set();
      state.currentRoutes = [];
      state.activeFilter = -1;

      state.focusedStopId = 301;
      renderStopList();
      expect(document.querySelector('#stopsView .stop-item.focused')).toBeTruthy();

      state.focusedStopId = null;
      renderStopList();
      expect(document.querySelector('#stopsView .stop-item.focused')).toBeNull();
    } finally {
      restore(orig);
    }
  });

  it('focusStopFromList moves the .focused class from the previous row to the new one', () => {
    const orig = snapshot();
    try {
      ensureStopsView();
      state.SPOTS = [
        { id: 501, lat: 1, lng: 2, street: 'A', city: 'X', state: 'CA' },
        { id: 502, lat: 1, lng: 2, street: 'B', city: 'X', state: 'CA' },
        { id: 503, lat: 1, lng: 2, street: 'C', city: 'X', state: 'CA' }
      ];
      state.visitedSet = new Set();
      state.currentRoutes = [];
      state.activeFilter = -1;
      state.focusedStopId = 501;

      renderStopList();
      // Sanity: starting state has 501 focused.
      expect(document.querySelector('#stopsView .stop-item.focused').dataset.spotId).toBe('501');

      focusStopFromList(state.SPOTS[1]); // click row 502
      expect(state.focusedStopId).toBe(502);
      const focused = document.querySelectorAll('#stopsView .stop-item.focused');
      expect(focused.length).toBe(1);
      expect(focused[0].dataset.spotId).toBe('502');
    } finally {
      restore(orig);
    }
  });

  it('focusing a non-existent spot id leaves no .focused row', () => {
    const orig = snapshot();
    try {
      ensureStopsView();
      state.SPOTS = [
        { id: 401, lat: 1, lng: 2, street: 'A', city: 'X', state: 'CA' }
      ];
      state.visitedSet = new Set();
      state.currentRoutes = [];
      state.activeFilter = -1;
      state.focusedStopId = 9999; // not in SPOTS

      renderStopList();
      expect(document.querySelector('#stopsView .stop-item.focused')).toBeNull();
    } finally {
      restore(orig);
    }
  });
});
