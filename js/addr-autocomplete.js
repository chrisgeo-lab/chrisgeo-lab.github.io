import { esc } from './utils.js';
import { bindPhotonSearch, photonFeatureToAddress } from './photon.js';

/**
 * Wire a Photon-backed autocomplete dropdown onto `inputEl`, rendering results
 * into `listEl`. Handles arrow-key navigation, Enter-to-pick, and click-pick.
 *
 * `onSelect` is the callback bag rather than a single function so the host
 * can distinguish picking a suggestion (`pick`) from pressing Enter on an
 * empty dropdown (`onEnter`, e.g. submit-the-form behaviour).
 *
 * @param {HTMLInputElement} inputEl
 * @param {HTMLElement} listEl
 * @param {{ pick: (addr:{street,city,state,zip,feature}) => void, onEnter?: () => void }} onSelect
 */
export function setupAutocomplete(inputEl, listEl, onSelect) {
  let activeIdx = -1, results = [];

  bindPhotonSearch(inputEl, (features) => {
    results = features;
    activeIdx = results.length ? 0 : -1;
    if (results.length) {
      listEl.classList.add('show');
      renderList();
      fireHighlight();
    } else {
      listEl.classList.remove('show');
      fireHighlight();
    }
  });

  inputEl.addEventListener('keydown', e => {
    if (!listEl.classList.contains('show')) {
      if (e.key === 'Enter' && onSelect.onEnter) { e.preventDefault(); onSelect.onEnter(); return; }
      return;
    }
    if (e.key === 'ArrowDown') { e.preventDefault(); activeIdx = Math.min(activeIdx + 1, results.length - 1); renderList(); fireHighlight(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); activeIdx = Math.max(activeIdx - 1, 0); renderList(); fireHighlight(); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      if (activeIdx >= 0 && results[activeIdx]) pick(results[activeIdx]);
      else if (results.length) pick(results[0]);
    } else if (e.key === 'Escape') { listEl.classList.remove('show'); }
  });

  inputEl.addEventListener('blur', () => setTimeout(() => listEl.classList.remove('show'), 200));

  function renderList() {
    listEl.innerHTML = '';
    let activeEl = null;
    results.forEach((f, i) => {
      const a = photonFeatureToAddress(f);
      const sub = [a.city, a.state, a.zip, a.country].filter(Boolean).join(', ');
      const item = document.createElement('div');
      item.className = 'addr-ac-item' + (i === activeIdx ? ' active' : '');
      item.innerHTML = `<div class="addr-ac-item-main">${esc(a.street || a.name)}</div><div class="addr-ac-item-sub">${esc(sub)}</div>`;
      item.onmousedown = e => { e.preventDefault(); pick(f); };
      item.onmouseenter = () => {
        if (activeIdx === i) return;
        activeIdx = i;
        renderList();
        fireHighlight();
      };
      listEl.appendChild(item);
      if (i === activeIdx) activeEl = item;
    });
    if (activeEl && activeEl.scrollIntoView) {
      activeEl.scrollIntoView({block: 'nearest'});
    }
  }

  function pick(f) {
    const a = photonFeatureToAddress(f);
    listEl.classList.remove('show');
    results = [];
    onSelect.pick({street: a.street, city: a.city, state: a.state, zip: a.zip, feature: f});
  }

  // Notify the host when the active suggestion changes. Quick-add uses this
  // to fly the map and drop a preview pin; pure-form hosts ignore it.
  function fireHighlight() {
    if (!onSelect.onHighlight) return;
    const f = activeIdx >= 0 ? results[activeIdx] : null;
    if (!f) { onSelect.onHighlight(null); return; }
    const coords = f.geometry && f.geometry.coordinates;
    if (!coords) { onSelect.onHighlight(null); return;}
    const a = photonFeatureToAddress(f);
    onSelect.onHighlight({
      lng: coords[0], lat: coords[1],
      street: a.street, city: a.city, state: a.state, zip: a.zip
    });
  }
}
