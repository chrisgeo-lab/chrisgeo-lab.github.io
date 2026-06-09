import { state } from './state.js';
import { renderView } from './ui.js';
import { toast } from './utils.js';
import { GPS_SILENT_TIMEOUT_MS, GPS_TIMEOUT_MS } from './constants.js';

function onPosition(render, pos) {
  state.gpsPos = {lat: pos.coords.latitude, lng: pos.coords.longitude, acc: pos.coords.accuracy};
  state.gpsState = 'granted';
  if (!state.startPoint && state.SPOTS.length) { state.durationMatrix = null; render(); }
  else { state.suppressFitBounds = true; renderView(); }
}

/**
 * Silently request a one-shot GPS fix on startup. Skips prompt when permission is 'denied';
 * remains silent on denial/timeout — UI flow doesn't require GPS.
 * @param {() => void} render - Top-level render to invoke when a fix updates routing inputs.
 */
export function initGeolocation(render) {
  if (!navigator.geolocation) {
    state.gpsState = 'unavailable';
    updateGPSUI();
    return;
  }
  const opts = {enableHighAccuracy: false, timeout: GPS_SILENT_TIMEOUT_MS};
  navigator.permissions?.query({name: 'geolocation'}).then(result => {
    if (result.state === 'denied') {
      state.gpsState = 'denied';
      updateGPSUI();
      return;
    }
    if (result.state === 'granted') {
      state.gpsState = 'granted';
      updateGPSUI();
    }
    navigator.geolocation.getCurrentPosition(p => onPosition(render, p), () => {}, opts);
  }).catch(() => {
    navigator.geolocation.getCurrentPosition(p => onPosition(render, p), () => {}, opts);
  });
}

function updateGPSUI() {
  // Notify UI that GPS state changed (for button styling)
  if (typeof window !== 'undefined' && window.updateGPSButtonState) {
    window.updateGPSButtonState();
  }
}

/**
 * Request GPS location with user interaction (reprompts if previously denied).
 * Returns a promise that resolves to {lat, lng, acc} or null on failure.
 * Shows toast messages for feedback.
 * @param {Object} opts - Geolocation options (enableHighAccuracy, timeout)
 * @returns {Promise<{lat: number, lng: number, acc: number}|null>}
 */
export function requestLocationWithPrompt(opts = {enableHighAccuracy: true, timeout: GPS_TIMEOUT_MS}) {
  if (!navigator.geolocation) {
    state.gpsState = 'unavailable';
    updateGPSUI();
    toast('GPS not available on this device');
    return Promise.resolve(null);
  }

  toast('Getting location...');
  return new Promise(resolve => {
    navigator.geolocation.getCurrentPosition(
      pos => {
        const location = {lat: pos.coords.latitude, lng: pos.coords.longitude, acc: pos.coords.accuracy};
        state.gpsPos = location;
        state.gpsState = 'granted';
        updateGPSUI();
        resolve(location);
      },
      err => {
        if (err.code === err.PERMISSION_DENIED) {
          state.gpsState = 'denied';
          updateGPSUI();
          toast('Location permission denied — enable in browser settings');
        } else if (err.code === err.TIMEOUT) {
          toast('Location request timed out — try again');
        } else {
          toast('Location unavailable');
        }
        resolve(null);
      },
      opts
    );
  });
}
