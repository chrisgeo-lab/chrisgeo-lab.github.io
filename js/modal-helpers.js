import { state } from './state.js';
import { toast } from './utils.js';

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
