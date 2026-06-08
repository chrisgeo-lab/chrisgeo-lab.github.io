import { state } from './state.js';
import { renderView } from './ui.js';
import { GPS_SILENT_TIMEOUT_MS } from './constants.js';

function onPosition(render, pos) {
  state.gpsPos = {lat: pos.coords.latitude, lng: pos.coords.longitude, acc: pos.coords.accuracy};
  if (!state.startPoint && state.SPOTS.length) { state.durationMatrix = null; render(); }
  else { state.suppressFitBounds = true; renderView(); }
}

/**
 * Silently request a one-shot GPS fix on startup. Skips prompt when permission is 'denied';
 * remains silent on denial/timeout — UI flow doesn't require GPS.
 * @param {() => void} render - Top-level render to invoke when a fix updates routing inputs.
 */
export function initGeolocation(render) {
  if (!navigator.geolocation) return;
  const opts = {enableHighAccuracy: false, timeout: GPS_SILENT_TIMEOUT_MS};
  navigator.permissions?.query({name: 'geolocation'}).then(result => {
    if (result.state === 'denied') return;
    navigator.geolocation.getCurrentPosition(p => onPosition(render, p), () => {}, opts);
  }).catch(() => {
    navigator.geolocation.getCurrentPosition(p => onPosition(render, p), () => {}, opts);
  });
}
