import { state } from './state.js';
import { toast } from './utils.js';
import { geocodeFreeform } from './geocoder.js';
import { requestLocationWithPrompt } from './geolocation.js';

/**
 * Initialize mode tab switching for a modal.
 * @param {HTMLElement} modal - Modal element
 * @param {string} tabsId - ID of tabs container
 * @param {string} contentId - ID of content container
 */
export function initModeTabs(modal, tabsId, contentId) {
  const tabs = modal.querySelectorAll(`#${tabsId} .point-mode-tab`);
  const sections = modal.querySelectorAll(`#${contentId} .point-mode-section`);
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      // Prevent switching to disabled GPS tab
      if (tab.disabled) {
        const msg = state.gpsState === 'unavailable'
          ? 'GPS is not available on this device'
          : 'GPS permission denied. Enable location services in your browser settings to use this feature.';
        toast(msg);
        return;
      }
      const mode = tab.dataset.mode;
      tabs.forEach(t => t.classList.toggle('active', t === tab));
      sections.forEach(s => s.classList.toggle('active', s.dataset.mode === mode));
    });
  });
}

/**
 * Get the currently active mode from tabs.
 * @param {string} tabsId - ID of tabs container
 * @returns {string|null} Active mode or null
 */
export function getActiveMode(tabsId) {
  const active = document.querySelector(`#${tabsId} .point-mode-tab.active`);
  return active ? active.dataset.mode : null;
}

/**
 * Render stop list for start/end point modals.
 * @param {HTMLElement} listEl - List container element
 * @param {HTMLElement} searchEl - Search input element
 * @param {Function} onSelect - Callback(idx) when stop is selected
 */
export function renderStopList(listEl, searchEl, onSelect) {
  function renderFiltered(query) {
    listEl.innerHTML = '';
    const q = (query || '').toLowerCase();
    state.SPOTS.forEach((spot, i) => {
      const label = spot.street || spot.label || `Stop ${i + 1}`;
      const city = spot.city || '';
      if (q && !label.toLowerCase().includes(q) && !city.toLowerCase().includes(q)) return;
      const item = document.createElement('div');
      item.className = 'point-stop-item';
      item.innerHTML = `<span class="point-stop-item-num">${i + 1}</span><div class="point-stop-item-info"><div class="point-stop-item-name">${label}</div>${city ? `<div class="point-stop-item-city">${city}${spot.state ? ', ' + spot.state : ''}</div>` : ''}</div>`;
      item.dataset.idx = i;
      item.addEventListener('click', () => {
        listEl.querySelectorAll('.point-stop-item').forEach(el => el.classList.remove('selected'));
        item.classList.add('selected');
        if (onSelect) onSelect(i);
      });
      listEl.appendChild(item);
    });
    if (!listEl.children.length) {
      listEl.innerHTML = '<div class="point-stop-empty">No matching stops</div>';
    }
  }

  renderFiltered('');
  if (searchEl) {
    searchEl.value = '';
    searchEl.oninput = () => renderFiltered(searchEl.value);
  }
}

/**
 * Show current selection in modal UI.
 * @param {HTMLElement} displayEl - Display container element
 * @param {HTMLElement} valueEl - Value text element
 * @param {Object} point - Current point object
 * @param {string} fallbackLabel - Fallback label if point has no label
 */
export function showCurrentSelection(displayEl, valueEl, point, fallbackLabel) {
  if (point) {
    displayEl.style.display = 'flex';
    valueEl.textContent = point.label || fallbackLabel || 'Set';
  } else {
    displayEl.style.display = 'none';
  }
}

export function applyGpsTabState(modal) {
  const tab = modal.querySelector('.point-mode-tab[data-mode="gps"]');
  if (!tab) return;
  const unavailable = state.gpsState === 'unavailable' || state.gpsState === 'denied';
  tab.disabled = unavailable;
  tab.style.opacity = unavailable ? '0.5' : '1';
  tab.style.cursor = unavailable ? 'not-allowed' : 'pointer';
  tab.title = !unavailable ? '' : state.gpsState === 'unavailable'
    ? 'GPS not available on this device'
    : 'GPS permission denied — enable in browser settings';
}

export function applyActiveMode(tabsId, contentId, mode) {
  document.querySelectorAll(`#${tabsId} .point-mode-tab`).forEach(t =>
    t.classList.toggle('active', t.dataset.mode === mode));
  document.querySelectorAll(`#${contentId} .point-mode-section`).forEach(s =>
    s.classList.toggle('active', s.dataset.mode === mode));
}

/**
 * Block confirm if GPS is unavailable/denied; otherwise prompt for location
 * if we don't already have one. Returns true when caller may proceed.
 */
export async function ensureGpsReady() {
  if (state.gpsState === 'unavailable') {
    toast('GPS is not available on this device');
    return false;
  }
  if (state.gpsState === 'denied') {
    toast('GPS permission denied. Enable location services in your browser settings.');
    return false;
  }
  if (!state.gpsPos) {
    const location = await requestLocationWithPrompt();
    if (!location) return false;
  }
  return true;
}

/**
 * Run the address-mode geocode flow shared by start/home modals.
 * Toggles button state and returns the geocode result, or null on failure.
 */
export async function runAddressGeocode(inputId, btnId, busyIcon, idleIcon) {
  const val = document.getElementById(inputId).value.trim();
  if (!val) { toast('Enter an address'); return null; }
  const btn = document.getElementById(btnId);
  const iconEl = btn.querySelector('.point-modal-btn-icon');
  btn.disabled = true;
  if (iconEl) iconEl.textContent = busyIcon;
  try {
    const result = await geocodeFreeform(val);
    if (!result) toast('Address not found — try a different query');
    return result ? { ...result, query: val } : null;
  } catch {
    toast('Geocoding failed — check your connection');
    return null;
  } finally {
    btn.disabled = false;
    if (iconEl) iconEl.textContent = idleIcon;
  }
}
