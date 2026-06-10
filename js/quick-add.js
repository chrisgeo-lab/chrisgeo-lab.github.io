/**
 * Quick-add address pill — the bottom-left "+" FAB opens this. A single
 * input with Photon autocomplete; highlighting a suggestion previews it
 * on the map (flyTo + ephemeral pin); picking commits a stop and keeps
 * the pill open for rapid-add.
 */
import { setupAutocomplete } from './addr-autocomplete.js';
import { flyTo, addPreviewPin, removePreviewPin } from './map.js';
import { addSingleStop } from './address-manager.js';
import { toast } from './utils.js';

let pillEl = null;
let inputEl = null;
let isOpen = false;

function ensureBuilt() {
  if (pillEl) return;
  pillEl = document.createElement('div');
  pillEl.className = 'quick-add-pill';
  pillEl.innerHTML = `
    <div class="quick-add-row">
      <span class="quick-add-icon" aria-hidden="true">
        <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="6" r="4"/><path d="M9 9l3.2 3.2"/></svg>
      </span>
      <input type="text" class="quick-add-input" id="quickAddInput" placeholder="Type an address…" aria-label="Add a stop" autocomplete="off">
      <button type="button" class="quick-add-close" id="quickAddClose" aria-label="Close">
        <svg viewBox="0 0 13 13" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M3 3l7 7M10 3l-7 7"/></svg>
      </button>
    </div>
    <div class="quick-add-list" id="quickAddList" role="listbox"></div>
    <div class="quick-add-hint">Pick a suggestion or press Enter to add</div>
  `;
  document.body.appendChild(pillEl);
  inputEl = pillEl.querySelector('#quickAddInput');
  const listEl = pillEl.querySelector('#quickAddList');
  pillEl.querySelector('#quickAddClose').onclick = closeQuickAdd;

  setupAutocomplete(inputEl, listEl, {
    onHighlight(suggestion) {
      if (!suggestion) { removePreviewPin(); return; }
      addPreviewPin(suggestion.lat, suggestion.lng);
      flyTo(suggestion.lat, suggestion.lng, 16);
    },
    async pick({street, city, state: st, zip, feature}) {
      const coords = feature && feature.geometry && feature.geometry.coordinates;
      const lat = coords ? coords[1] : null;
      const lng = coords ? coords[0] : null;
      removePreviewPin();
      const spot = await addSingleStop({street, city, state: st, zip, lat, lng});
      if (spot) {
        toast(`Added ${spot.street || 'stop'}`);
        // Stay open for rapid-add. Clear input + refocus.
        inputEl.value = '';
        inputEl.focus();
      }
    },
    async onEnter() {
      const raw = inputEl.value.trim();
      if (!raw) return;
      removePreviewPin();
      const spot = await addSingleStop({street: raw, city: '', state: '', zip: ''});
      if (spot) {
        toast(`Added ${spot.street || 'stop'}`);
        inputEl.value = '';
        inputEl.focus();
      }
    }
  });

  inputEl.addEventListener('keydown', e => {
    if (e.key === 'Escape') { e.preventDefault(); closeQuickAdd(); }
  });
}

export function openQuickAdd() {
  ensureBuilt();
  if (isOpen) { inputEl.focus(); return; }
  isOpen = true;
  pillEl.classList.add('open');
  document.getElementById('addStopFab').classList.add('active');
  // Defer focus to next frame so the slide-in transition reads as motion-from
  // rather than starting mid-animation.
  requestAnimationFrame(() => inputEl.focus());
}

export function closeQuickAdd() {
  if (!isOpen) return;
  isOpen = false;
  pillEl.classList.remove('open');
  const fab = document.getElementById('addStopFab');
  if (fab) fab.classList.remove('active');
  inputEl.value = '';
  removePreviewPin();
  const list = pillEl.querySelector('#quickAddList');
  if (list) { list.classList.remove('show'); list.innerHTML = ''; }
}

export function isQuickAddOpen() { return isOpen; }
