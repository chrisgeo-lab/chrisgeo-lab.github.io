import { state, STORE_SPOTS, STORE_V, STORE_H, STORE_START, STORE_TRAVEL_MODE, STORE_START_MODE, STORE_ROUTE_OVERRIDES, saveJSON, saveSet } from './state.js';
import { toast } from './utils.js';

// URL hash payload version. If the schema below changes incompatibly, bump
// this so old links can be rejected (or migrated) cleanly.
const SHARE_VERSION = 1;
const HASH_PREFIX = 'share=';

// Minimum-detail spot for compact link payloads.
function packSpot(s) {
  return {
    i: s.id, l: s.lat, g: s.lng,
    s: s.street || '', c: s.city || '', t: s.state || '', z: s.zip || ''
  };
}
function unpackSpot(p) {
  return {
    id: p.i, lat: p.l, lng: p.g,
    street: p.s, city: p.c, state: p.t, zip: p.z
  };
}
function packAnchor(a) {
  if (!a) return null;
  return { l: a.lat, g: a.lng, b: a.label || '', s: a.spotId == null ? null : a.spotId };
}
function unpackAnchor(p) {
  if (!p) return null;
  return { lat: p.l, lng: p.g, label: p.b || '', spotId: p.s };
}

// base64url encode/decode of a UTF-8 string. Hash-safe (no +/=).
function b64uEncode(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64uDecode(s) {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + pad);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

/**
 * Build a share URL for the current state.
 * @param {Object} [opts]
 * @param {number} [opts.routeIndex]  -1 = all routes, otherwise index into currentRoutes.
 *   Filters SPOTS down to only that route's stops; bare `null`/undefined → all routes.
 * @returns {string}  Full absolute URL.
 */
export function buildShareUrl({ routeIndex = -1 } = {}) {
  const filterSpotIds = filterSpotIdsForRoute(routeIndex);
  const includedSpots = filterSpotIds
    ? state.SPOTS.filter(s => filterSpotIds.has(s.id))
    : state.SPOTS;

  // When sharing a single route, the receiver only gets that route's spots —
  // re-clustering them into the sender's full numClusters would split one
  // route back into N. Force k=1 and activeFilter=-1 so the receiver opens
  // with one consolidated route covering exactly the shared stops.
  const sharingSingleRoute = filterSpotIds !== null;
  // Manual route pins: only ship overrides for spots actually included in the
  // shared payload AND for route indices that still exist in the receiver's k.
  // Single-route share collapses to k=1, so any override would be out-of-range
  // and meaningless — skip overrides entirely in that case.
  const includedIds = new Set(includedSpots.map(s => s.id));
  const overrides = (!sharingSingleRoute && state.routeOverrides)
    ? Object.fromEntries(
        Object.entries(state.routeOverrides)
          .filter(([id, ridx]) =>
            includedIds.has(Number(id)) &&
            Number.isInteger(ridx) && ridx >= 0 && ridx < state.numClusters
          )
      )
    : {};
  const payload = {
    v: SHARE_VERSION,
    s: includedSpots.map(packSpot),
    h: packAnchor(state.home),
    p: packAnchor(state.startPoint),
    m: state.startMode,
    t: state.travelMode,
    k: sharingSingleRoute ? 1 : state.numClusters,
    f: sharingSingleRoute ? -1 : state.activeFilter,
    o: overrides
  };

  const encoded = b64uEncode(JSON.stringify(payload));
  const base = window.location.origin + window.location.pathname;
  return `${base}#${HASH_PREFIX}${encoded}`;
}

function filterSpotIdsForRoute(routeIndex) {
  if (routeIndex < 0) return null;
  const rd = state.currentRoutes[routeIndex];
  if (!rd) return null;
  const ids = new Set();
  for (const idx of rd.route) {
    const sp = typeof idx === 'number' ? state.SPOTS[idx] : idx;
    if (sp && sp.id != null) ids.add(sp.id);
  }
  return ids;
}

/** Decode a shared payload from a hash fragment (with or without leading `#`). */
export function decodeShareHash(hash) {
  if (!hash) return null;
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  if (!raw.startsWith(HASH_PREFIX)) return null;
  try {
    const json = b64uDecode(raw.slice(HASH_PREFIX.length));
    const payload = JSON.parse(json);
    if (!payload || payload.v !== SHARE_VERSION) {
      console.log('[share] decode rejected: version mismatch', { got: payload?.v, expected: SHARE_VERSION });
      return null;
    }
    if (!Array.isArray(payload.s)) {
      console.log('[share] decode rejected: payload.s not an array');
      return null;
    }
    console.log('[share] decoded payload', { spots: payload.s.length, mode: payload.t, k: payload.k });
    return payload;
  } catch (e) {
    console.warn('share: failed to decode hash', e);
    return null;
  }
}

/**
 * On boot: if the URL hash carries a share payload, replace local state with it
 * and persist. Returns true if a payload was applied. Caller should re-render.
 */
export function applyShareFromHash() {
  const payload = decodeShareHash(window.location.hash);
  if (!payload) return false;

  const spots = payload.s.map(unpackSpot)
    .filter(s => Number.isFinite(s.lat) && Number.isFinite(s.lng));
  if (!spots.length) return false;

  // Re-id locally so new spots don't collide with anything in localStorage that
  // the receiver might have under their own existing IDs.
  const idMap = new Map();
  let nextId = Date.now();
  for (const s of spots) { const newId = nextId++; idMap.set(s.id, newId); s.id = newId; }

  state.SPOTS = spots;
  state.visitedSet = new Set();
  state.home = unpackAnchor(payload.h);
  if (state.home && state.home.spotId != null) {
    state.home.spotId = idMap.has(state.home.spotId) ? idMap.get(state.home.spotId) : null;
  }
  state.startPoint = unpackAnchor(payload.p);
  if (state.startPoint && state.startPoint.spotId != null) {
    state.startPoint.spotId = idMap.has(state.startPoint.spotId) ? idMap.get(state.startPoint.spotId) : null;
  }
  state.startMode = payload.m === 'none' ? 'none' : 'auto';
  state.travelMode = ['car', 'bike', 'walk'].includes(payload.t) ? payload.t : 'car';
  state.numClusters = Math.max(1, Math.floor(payload.k) || 1);
  state.activeFilter = Number.isInteger(payload.f) ? payload.f : -1;
  state.durationMatrix = null;
  state.currentRoutes = [];

  // Re-key route overrides under the receiver's new spot ids and drop any
  // entries pointing at routes that no longer exist (k may have shrunk if
  // sender shared a single route).
  const remapped = {};
  if (payload.o && typeof payload.o === 'object') {
    for (const [oldId, ridx] of Object.entries(payload.o)) {
      const newId = idMap.get(Number(oldId));
      if (newId == null) continue;
      if (!Number.isInteger(ridx) || ridx < 0 || ridx >= state.numClusters) continue;
      remapped[newId] = ridx;
    }
  }
  state.routeOverrides = remapped;

  saveJSON(STORE_SPOTS, state.SPOTS);
  saveSet(STORE_V, state.visitedSet);
  saveJSON(STORE_H, state.home);
  saveJSON(STORE_START, state.startPoint);
  saveJSON(STORE_TRAVEL_MODE, state.travelMode);
  saveJSON(STORE_ROUTE_OVERRIDES, state.routeOverrides);
  try { localStorage.setItem(STORE_START_MODE, state.startMode); } catch {}

  // Strip the hash so a refresh doesn't reapply the same payload.
  try { history.replaceState(null, '', window.location.pathname + window.location.search); } catch {}
  return true;
}

async function copyToClipboard(text) {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {}
  // Fallback for older browsers / non-secure contexts.
  try {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch { return false; }
}

let activeShareModal = null;

/** Open the Share modal — pick which route(s) to share, copy link to clipboard. */
export function showShareModal() {
  if (!state.SPOTS.length) { toast('Add stops first'); return; }
  if (activeShareModal) return;

  const routes = state.currentRoutes;
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay show';
  overlay.id = 'shareModal';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', 'shareModalTitle');

  const routeOptions = [
    `<button class="share-route-option active" data-route="-1">
      <span class="share-route-dot share-route-dot--all"></span>
      <span class="share-route-label">
        <span class="share-route-name">All routes</span>
        <span class="share-route-meta">${state.SPOTS.length} stops · ${routes.length || 1} route${routes.length === 1 ? '' : 's'}</span>
      </span>
    </button>`,
    ...routes.map((rd, i) => `
      <button class="share-route-option" data-route="${i}">
        <span class="share-route-dot" style="background:${rd.color}"></span>
        <span class="share-route-label">
          <span class="share-route-name">${rd.name}</span>
          <span class="share-route-meta">${rd.route.length} stops · ${rd.totalMiles.toFixed(1)} mi</span>
        </span>
      </button>`)
  ].join('');

  overlay.innerHTML = `
    <div class="modal share-modal">
      <div class="share-modal-header">
        <div class="share-modal-icon">
          <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <circle cx="4.5" cy="9" r="2"/><circle cx="13.5" cy="4.5" r="2"/><circle cx="13.5" cy="13.5" r="2"/>
            <path d="M6.3 8.1l5.4-2.7M6.3 9.9l5.4 2.7"/>
          </svg>
        </div>
        <div>
          <h3 id="shareModalTitle">Share Route</h3>
          <p class="share-modal-desc">Pick what to include — anyone with the link can open it.</p>
        </div>
      </div>
      <div class="share-route-options">${routeOptions}</div>
      <div class="share-link-section">
        <label class="share-link-label">Shareable link</label>
        <div class="share-link-row">
          <input type="text" class="share-link-input" id="shareLinkInput" readonly>
          <button class="share-copy-btn" id="shareCopyBtn" aria-label="Copy link to clipboard">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <rect x="5" y="5" width="8" height="8" rx="1.4"/>
              <path d="M5 5V3.5A1.5 1.5 0 016.5 2h5A1.5 1.5 0 0113 3.5v5"/>
            </svg>
            <span class="share-copy-btn-label">Copy</span>
          </button>
        </div>
        <div class="share-link-hint" id="shareLinkHint">Includes addresses, mode, clusters, and route points.</div>
      </div>
      <div class="modal-actions">
        <button class="modal-btn modal-btn-cancel" id="shareCloseBtn">Done</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  activeShareModal = overlay;

  const linkInput = overlay.querySelector('#shareLinkInput');
  const copyBtn = overlay.querySelector('#shareCopyBtn');
  const copyLabel = overlay.querySelector('.share-copy-btn-label');
  const hint = overlay.querySelector('#shareLinkHint');
  let selectedRoute = -1;

  function refreshLink() {
    const url = buildShareUrl({ routeIndex: selectedRoute });
    linkInput.value = url;
    copyLabel.textContent = 'Copy';
    copyBtn.classList.remove('copied');
  }

  refreshLink();

  // Auto-copy + select on open so the user can paste immediately.
  copyToClipboard(linkInput.value).then(ok => {
    if (ok) {
      copyLabel.textContent = 'Copied';
      copyBtn.classList.add('copied');
      hint.textContent = 'Link copied to clipboard.';
    }
  });
  setTimeout(() => { linkInput.focus(); linkInput.select(); }, 100);

  overlay.querySelectorAll('.share-route-option').forEach(btn => {
    btn.onclick = () => {
      overlay.querySelectorAll('.share-route-option').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedRoute = parseInt(btn.dataset.route, 10);
      refreshLink();
      hint.textContent = 'Includes addresses, mode, clusters, and route points.';
      // Auto-copy the new link.
      copyToClipboard(linkInput.value).then(ok => {
        if (ok) {
          copyLabel.textContent = 'Copied';
          copyBtn.classList.add('copied');
          hint.textContent = 'Link copied to clipboard.';
        }
      });
    };
  });

  copyBtn.onclick = async () => {
    const ok = await copyToClipboard(linkInput.value);
    if (ok) {
      copyLabel.textContent = 'Copied';
      copyBtn.classList.add('copied');
      hint.textContent = 'Link copied to clipboard.';
    } else {
      linkInput.select();
      hint.textContent = 'Copy failed — press Cmd/Ctrl+C to copy manually.';
    }
  };

  function close() {
    if (!activeShareModal) return;
    document.body.removeChild(activeShareModal);
    activeShareModal = null;
    document.removeEventListener('keydown', onEscape);
  }
  function onEscape(e) { if (e.key === 'Escape') close(); }

  overlay.querySelector('#shareCloseBtn').onclick = close;
  overlay.onclick = e => { if (e.target === overlay) close(); };
  document.addEventListener('keydown', onEscape);
}
