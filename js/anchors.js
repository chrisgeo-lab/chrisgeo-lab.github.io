// Lifecycle helpers for the Start and Home (end-point) anchors.
//
// An anchor is either:
//   - a free reference: { lat, lng, label }
//   - a pin to an existing SPOTS entry: { lat, lng, label, spotId }
//
// All persistence goes through here so callers don't need to know which
// localStorage key holds which anchor, and so spotId invalidation has one
// home rather than being repeated in planner.js / addresses.js / modals.js.

import { state, STORE_H, STORE_START, saveJSON } from './state.js';

/** @typedef {'start'|'home'} AnchorKind */

const SPECS = {
  start: { storeKey: STORE_START, field: 'startPoint' },
  home:  { storeKey: STORE_H,    field: 'home' }
};

/** Persist an anchor value (or `null` to clear) under its localStorage key. */
export function setAnchor(kind, anchor) {
  const spec = SPECS[kind];
  state[spec.field] = anchor;
  if (anchor) saveJSON(spec.storeKey, anchor);
  else localStorage.removeItem(spec.storeKey);
}

/** Clear both Start and Home anchors. Used after a Replace import. */
export function clearAllAnchors() {
  setAnchor('start', null);
  setAnchor('home', null);
}

/**
 * Drop any anchor `spotId` that no longer points at a valid SPOTS entry.
 * Keeps the lat/lng so the marker still renders at its original location.
 * Returns true if anything was changed.
 */
export function invalidateStaleSpotIds() {
  let changed = false;
  for (const kind of /** @type {AnchorKind[]} */(['start', 'home'])) {
    const spec = SPECS[kind];
    const a = state[spec.field];
    if (a && a.spotId != null && !state.SPOTS[a.spotId]) {
      state[spec.field] = { ...a, spotId: null };
      changed = true;
    }
  }
  return changed;
}

/**
 * Build an anchor that pins to an existing SPOTS entry.
 * @param {number} spotId  Index into state.SPOTS
 */
export function anchorFromSpotId(spotId) {
  const spot = state.SPOTS[spotId];
  if (!spot) return null;
  return { lat: spot.lat, lng: spot.lng, label: spot.street || spot.label || `Stop ${spotId + 1}`, spotId };
}
