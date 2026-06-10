import { esc } from './utils.js';
import { bindPhotonSearch, photonFeatureToAddress } from './photon.js';

/**
 * Prompt the user to fix a failed-to-geocode address. Resolves with
 * `'retry' | 'remove' | 'skip'`. Mutates `addr` in place when retrying.
 *
 * Lives in its own module because the modal owns a non-trivial amount of
 * state (Photon results, AC index, keyboard nav) that has nothing to do
 * with the surrounding address-import flow.
 *
 * @param {{street:string, city:string, state:string, zip:string, status:string, lat:?number, lng:?number}} addr
 * @returns {Promise<'retry'|'remove'|'skip'>}
 */
export function showFixAddrPrompt(addr) {
  return new Promise(resolve => {
    const modal = document.getElementById('fixAddrModal');
    const input = document.getElementById('fixAddrInput');
    const list = document.getElementById('fixAddrAcList');
    const addrText = [addr.street, addr.city, addr.state].filter(Boolean).join(', ');
    input.value = addrText;
    document.getElementById('fixAddrTitle').textContent = 'Not found';
    document.getElementById('fixAddrDesc').textContent = `Couldn't locate "${addrText}"`;

    modal.classList.add('show');
    list.classList.remove('show');
    setTimeout(() => { input.focus(); input.select(); }, 100);

    let fixAcResults = [], fixAcIdx = -1;

    const teardownPhoton = bindPhotonSearch(input, (features) => {
      fixAcResults = features;
      fixAcIdx = -1;
      if (fixAcResults.length) { list.classList.add('show'); renderFixAc(); }
      else list.classList.remove('show');
    });

    function renderFixAc() {
      list.innerHTML = '';
      fixAcResults.forEach((f, i) => {
        const a = photonFeatureToAddress(f);
        const sub = [a.city, a.state, a.zip].filter(Boolean).join(', ');
        const item = document.createElement('div');
        item.className = 'addr-ac-item' + (i === fixAcIdx ? ' active' : '');
        item.innerHTML = `<div class="addr-ac-item-main">${esc(a.street || a.name)}</div><div class="addr-ac-item-sub">${esc(sub)}</div>`;
        item.onmousedown = e => { e.preventDefault(); selectFixResult(f); };
        list.appendChild(item);
      });
    }

    function selectFixResult(f) {
      const a = photonFeatureToAddress(f);
      input.value = [a.street, a.city, a.state].filter(Boolean).join(', ');
      list.classList.remove('show');
      fixAcResults = [];
    }

    function onFixKeydown(e) {
      if (!list.classList.contains('show')) return;
      if (e.key === 'ArrowDown') { e.preventDefault(); fixAcIdx = Math.min(fixAcIdx + 1, fixAcResults.length - 1); renderFixAc(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); fixAcIdx = Math.max(fixAcIdx - 1, 0); renderFixAc(); }
      else if (e.key === 'Enter' && fixAcIdx >= 0) { e.preventDefault(); selectFixResult(fixAcResults[fixAcIdx]); }
    }

    input.addEventListener('keydown', onFixKeydown);

    function cleanup() {
      modal.classList.remove('show');
      list.classList.remove('show');
      teardownPhoton();
      input.removeEventListener('keydown', onFixKeydown);
      document.getElementById('fixAddrSkipBtn').onclick = null;
      document.getElementById('fixAddrRetryBtn').onclick = null;
      document.getElementById('fixAddrRemoveBtn').onclick = null;
    }

    document.getElementById('fixAddrSkipBtn').onclick = () => { cleanup(); resolve('skip'); };
    document.getElementById('fixAddrRemoveBtn').onclick = () => { cleanup(); resolve('remove'); };
    document.getElementById('fixAddrRetryBtn').onclick = () => {
      const parts = input.value.split(',').map(s => s.trim());
      addr.street = parts[0] || addr.street;
      addr.city = parts[1] || addr.city;
      addr.state = parts[2] || addr.state || '';
      addr.status = 'pending';
      addr.lat = null;
      addr.lng = null;
      cleanup();
      resolve('retry');
    };
  });
}
