// Photon (komoot.io) address autocomplete helper.
// Wraps the debounced fetch + request-id race protection that both the
// import and fix-address modals need.

import { state } from './state.js';

const PHOTON_URL = 'https://photon.komoot.io/api/';
const DEBOUNCE_MS = 300;
const MIN_QUERY = 3;
const LIMIT = 5;

/**
 * Build a debounced Photon search function bound to `inputEl`.
 * Calls `onResults(features)` with the filtered feature list (street- or name-bearing only).
 * Returns a teardown function that cancels any pending request and clears the timer.
 *
 * @param {HTMLInputElement} inputEl
 * @param {(features: Array<object>) => void} onResults
 * @returns {() => void}
 */
export function bindPhotonSearch(inputEl, onResults) {
  let timer = null;
  let reqId = 0;

  function onInput() {
    clearTimeout(timer);
    const q = inputEl.value.trim();
    if (q.length < MIN_QUERY) { onResults([]); return; }
    timer = setTimeout(async () => {
      const my = ++reqId;
      try {
        const params = new URLSearchParams({q, limit: String(LIMIT), lang: 'en'});
        if (state.gpsPos) {
          params.append('lat', state.gpsPos.lat);
          params.append('lon', state.gpsPos.lng);
        }
        const r = await fetch(`${PHOTON_URL}?${params}`);
        if (!r.ok || my !== reqId) return;
        const data = await r.json();
        if (my !== reqId) return;
        const features = (data.features || []).filter(f => f.properties && (f.properties.street || f.properties.name));
        onResults(features);
      } catch { /* network errors silently produce no results */ }
    }, DEBOUNCE_MS);
  }

  inputEl.addEventListener('input', onInput);

  return function teardown() {
    inputEl.removeEventListener('input', onInput);
    clearTimeout(timer);
    reqId++;
  };
}

/**
 * Pull the address pieces we care about out of a Photon feature.
 * @param {object} feature
 */
export function photonFeatureToAddress(feature) {
  const p = feature.properties || {};
  return {
    street: [p.housenumber, p.street || p.name].filter(Boolean).join(' '),
    city: p.city || p.locality || p.county || '',
    state: p.state || '',
    zip: p.postcode || '',
    country: p.country || '',
    name: p.name || ''
  };
}
