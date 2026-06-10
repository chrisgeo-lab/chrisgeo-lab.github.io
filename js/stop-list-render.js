import { state, STORE_SPOTS, STORE_V, STORE_ROUTE_OVERRIDES, getStartLocation, getActiveRoutes, saveJSON, saveSet, PRIMARY_ROUTE_COLOR } from './state.js';
import { esc, fmtMi, fmtDur, toast } from './utils.js';
import { confirm } from './confirm.js';
import { setView } from './map.js';
import { toggleVisited } from './visited.js';
import { render } from './planner.js';
import { renderVisitedOnlyView } from './ui-panels.js';

const VISIT_CHECK_SVG = '<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 6.5l2.5 2.5 4.5-5"/></svg>';
const TRASH_SVG = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 4.5h10M5.5 4.5V3a1 1 0 011-1h3a1 1 0 011 1v1.5M4 4.5l.7 8.5a1 1 0 001 .9h4.6a1 1 0 001-.9L12 4.5M6.8 7.5v4M9.2 7.5v4"/></svg>';
const PLAY_SVG = '<svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" aria-hidden="true"><path d="M2.5 1.5v7l5.5-3.5z"/></svg>';
const HOME_SVG = '<svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 1.5L1.5 4.5V8.5h7V4.5z"/></svg>';

/**
 * Click handler for stop-list rows: pan to the stop, mark it focused, and
 * update the highlight on the existing DOM rows in place. We avoid calling
 * the full renderView (which clears focusedStopId and tears down all map
 * markers) — only the previously-focused row needs to lose `.focused` and
 * the new row needs to gain it.
 */
export function focusStopFromList(spot) {
  if (!spot) return;
  state.focusedStopId = spot.id;
  const view = document.getElementById('stopsView');
  if (view) {
    view.querySelectorAll('.stop-item.focused').forEach(el => el.classList.remove('focused'));
    // The "current stop" highlight on the first unvisited row otherwise
    // sticks alongside the focused row, leaving two rows visually selected.
    view.querySelectorAll('.stop-item.current').forEach(el => {
      if (el.dataset.spotId !== String(spot.id)) el.classList.remove('current');
    });
    const row = view.querySelector(`.stop-item[data-spot-id="${spot.id}"]`);
    if (row) row.classList.add('focused');
  }
  if (Number.isFinite(spot.lat) && Number.isFinite(spot.lng)) {
    setView([spot.lat, spot.lng], 16);
  }
  // Open the same popup the marker click would show. ui.js listens for this
  // event so we stay decoupled from its popup helpers (avoids a circular import).
  document.dispatchEvent(new CustomEvent('routeflow:show-stop-popup', { detail: { spotId: spot.id } }));
}

function spotMatchesQuery(spot, query, requireCity) {
  if (!query) return true;
  const street = (spot.street || '').toLowerCase();
  const city = (spot.city || '').toLowerCase();
  if (street.includes(query)) return true;
  if (requireCity ? city.includes(query) : (spot.city && city.includes(query))) return true;
  return false;
}

/** Build an active (unvisited) stop-item — works for both pre-route and routed paths. */
function activeStopItem({ spot, num, color, visited, current, leg, animateIdx, focused }) {
  const item = document.createElement('div');
  item.className = 'stop-item' + (visited ? ' visited' : '') + (current ? ' current' : '') + (focused ? ' focused' : '');
  item.dataset.spotId = spot.id;
  const checkInner = visited ? VISIT_CHECK_SVG : '';
  const checkLabel = visited
    ? `Toggle ${esc(spot.street || 'stop')} visited`
    : `Mark ${esc(spot.street || 'stop')} as visited`;
  const detail = leg
    ? `<span>${esc(spot.city || '')}${spot.state ? ', ' + esc(spot.state) : ''}</span><span>${fmtMi(leg.distance)} mi · ${fmtDur(leg.duration)}</span>`
    : `<span>${esc(spot.city || '')}${spot.state ? ', ' + esc(spot.state) : ''}</span>`;
  item.innerHTML = `
    <div class="stop-item-check" role="checkbox" tabindex="0" aria-checked="${visited}" aria-label="${checkLabel}">${checkInner}</div>
    <div class="stop-item-num" style="background:${color}">${num}</div>
    <div class="stop-item-info">
      <div class="stop-item-name">${esc(spot.street || `Stop ${num}`)}</div>
      <div class="stop-item-detail">${detail}</div>
    </div>
    <button class="stop-item-trash" aria-label="Delete ${esc(spot.street || 'stop')}" title="Delete stop">${TRASH_SVG}</button>`;
  if (animateIdx != null) item.style.animationDelay = `${animateIdx * 30}ms`;
  item.querySelector('.stop-item-check').onclick = (e) => { e.stopPropagation(); toggleVisited(spot.id); };
  item.querySelector('.stop-item-trash').onclick = (e) => { e.stopPropagation(); deleteStop(spot.id); };
  item.onclick = () => focusStopFromList(spot);
  setupSwipeToDelete(item);
  return item;
}

export function renderStopList() {
  const el = document.getElementById('stopsView');
  el.innerHTML = '';
  const routes = getActiveRoutes();
  const query = (document.getElementById('searchInput')?.value || '').trim().toLowerCase();

  if (state.activeFilter === -2) {
    renderVisitedOnlyView(el, query);
    return;
  }

  // No resolved route yet — show stops in import order so the panel isn't blank.
  if (!routes.length && state.SPOTS.length) {
    state.SPOTS.forEach((spot, i) => {
      if (!spotMatchesQuery(spot, query, false)) return;
      el.appendChild(activeStopItem({
        spot, num: i + 1, color: PRIMARY_ROUTE_COLOR,
        visited: state.visitedSet.has(spot.id),
        current: false, leg: null, animateIdx: null,
        focused: state.focusedStopId === spot.id,
      }));
    });
    return;
  }

  routes.forEach((rd, ri) => {
    if (routes.length > 1) {
      const hdr = document.createElement('div');
      hdr.className = 'section-hdr';
      hdr.innerHTML = `<span class="section-hdr-dot" style="background:${rd.color}"></span><span class="section-hdr-title">${esc(rd.name)}</span><span class="section-hdr-meta">${rd.route.length} remaining &middot; ${rd.totalMiles.toFixed(1)} mi</span>`;
      hdr.onclick = () => { state.activeFilter = ri; import('./ui.js').then(m => m.renderView()); };
      el.appendChild(hdr);
    }
    const origin = getStartLocation();
    if (origin && rd.legs && rd.legs.length > 0) {
      const hi = document.createElement('div'); hi.className = 'stop-item is-home';
      hi.innerHTML = `<div class="stop-item-num" style="background:#0a84ff">${PLAY_SVG}</div><div class="stop-item-info"><div class="stop-item-name">${esc(origin.label) || 'Current Location'}</div><div class="stop-item-detail"><span>Start</span><span>${fmtMi(rd.legs[0].distance)} mi to first stop</span></div></div>`;
      hi.onclick = () => setView([origin.lat, origin.lng], 15);
      el.appendChild(hi);
    }
    const spots = rd.route.map(i => typeof i === 'number' ? state.SPOTS[i] : i);
    const unvisitedSpots = spots.filter(s => !state.visitedSet.has((typeof s === 'number' ? state.SPOTS[s] : s).id));
    let stopNum = 0;
    const hasFocus = state.SPOTS.some(sp => sp.id === state.focusedStopId);
    unvisitedSpots.forEach((s, i) => {
      const spot = typeof s === 'number' ? state.SPOTS[s] : s;
      if (!spotMatchesQuery(spot, query, true)) return;
      stopNum++;
      const curr = i === 0 && !hasFocus;
      const leg = rd.legs ? rd.legs[(getStartLocation() ? 1 : 0) + spots.indexOf(s)] : null;
      const item = activeStopItem({
        spot, num: stopNum, color: rd.color,
        visited: false, current: curr, leg, animateIdx: i,
        focused: state.focusedStopId === spot.id,
      });
      el.appendChild(item);
      if (curr && !query) setTimeout(() => item.scrollIntoView({behavior: 'smooth', block: 'center'}), 300);
    });
    if (state.home && rd.legs && rd.legs.length > 1) {
      const hi = document.createElement('div'); hi.className = 'stop-item is-home';
      const lastLeg = rd.legs[rd.legs.length - 1];
      hi.innerHTML = `<div class="stop-item-num" style="background:#ff9f0a">${HOME_SVG}</div><div class="stop-item-info"><div class="stop-item-name">${esc(state.home.label)}</div><div class="stop-item-detail"><span>Return to End</span><span>${fmtMi(lastLeg.distance)} mi · ${fmtDur(lastLeg.duration)} from last stop</span></div></div>`;
      hi.onclick = () => setView([state.home.lat, state.home.lng], 15);
      el.appendChild(hi);
    }
  });

  // Visited section (no per-route grouping).
  const visitedSpots = state.SPOTS.filter(s => state.visitedSet.has(s.id));
  if (!visitedSpots.length) return;
  if (query && !visitedSpots.some(s => spotMatchesQuery(s, query, true))) return;

  const hdr = document.createElement('div');
  hdr.className = 'section-hdr section-hdr-visited';
  hdr.innerHTML = `<span class="section-hdr-dot section-hdr-dot--visited"></span><span class="section-hdr-title">Visited</span><span class="section-hdr-meta">${visitedSpots.length} done</span>`;
  el.appendChild(hdr);

  visitedSpots.forEach(spot => {
    if (!spotMatchesQuery(spot, query, true)) return;
    const item = document.createElement('div');
    item.className = 'stop-item visited' + (state.focusedStopId === spot.id ? ' focused' : '');
    item.dataset.spotId = spot.id;
    item.innerHTML = `
      <div class="stop-item-check" role="checkbox" tabindex="0" aria-checked="true" aria-label="Mark ${esc(spot.street)} as not visited">${VISIT_CHECK_SVG}</div>
      <div class="stop-item-info">
        <div class="stop-item-name">${esc(spot.street)}</div>
        <div class="stop-item-detail"><span>${esc(spot.city)}${spot.state ? ', ' + esc(spot.state) : ''}</span></div>
      </div>
      <button class="stop-item-trash" aria-label="Delete ${esc(spot.street)}" title="Delete stop">${TRASH_SVG}</button>`;
    item.querySelector('.stop-item-check').onclick = (e) => { e.stopPropagation(); toggleVisited(spot.id); };
    item.querySelector('.stop-item-trash').onclick = (e) => { e.stopPropagation(); deleteStop(spot.id); };
    item.onclick = () => focusStopFromList(spot);
    el.appendChild(item);
  });
}

/**
 * Pin a spot to a specific route index, or clear the pin (`routeIdx == null`).
 * Saves to localStorage and triggers a full re-route so the planner can
 * honor the new assignment.
 */
export function setRouteOverride(spotId, routeIdx) {
  state.routeOverrides = state.routeOverrides || {};
  if (routeIdx == null || routeIdx < 0) {
    delete state.routeOverrides[spotId];
  } else {
    state.routeOverrides[spotId] = routeIdx;
  }
  saveJSON(STORE_ROUTE_OVERRIDES, state.routeOverrides);
  state.suppressFitBounds = true;
  render();
}

/** Delete a stop by ID (with confirm) and trigger a re-render. */
export async function deleteStop(id) {
  const idx = state.SPOTS.findIndex(s => s.id === id);
  if (idx === -1) return;

  const spot = state.SPOTS[idx];
  const confirmed = await confirm(`Delete "${spot.street}"?`, { okText: 'Delete', dangerous: true });
  if (!confirmed) return;

  state.SPOTS.splice(idx, 1);
  state.visitedSet.delete(id);
  if (state.routeOverrides && state.routeOverrides[id] != null) {
    delete state.routeOverrides[id];
    saveJSON(STORE_ROUTE_OVERRIDES, state.routeOverrides);
  }
  state.durationMatrix = null;

  saveJSON(STORE_SPOTS, state.SPOTS);
  saveSet(STORE_V, state.visitedSet);

  render();
  toast('Stop deleted');
}

function setupSwipeToDelete(item) {
  let startX = 0, currentX = 0, isSwiping = false;

  const onTouchStart = (e) => {
    if (e.target.closest('.stop-item-check') || e.target.closest('.stop-item-delete-btn')) return;
    startX = e.touches[0].clientX;
    isSwiping = true;
  };

  const onTouchMove = (e) => {
    if (!isSwiping) return;
    currentX = e.touches[0].clientX;
    const diff = startX - currentX;
    if (diff > 0 && diff < 80) {
      item.style.transform = `translateX(-${diff}px)`;
    }
  };

  const onTouchEnd = () => {
    if (!isSwiping) return;
    isSwiping = false;
    const diff = startX - currentX;
    if (diff > 40) {
      item.style.transform = 'translateX(-80px)';
      item.classList.add('swiped');
    } else {
      item.style.transform = '';
      item.classList.remove('swiped');
    }
  };

  item.addEventListener('touchstart', onTouchStart, {passive: true});
  item.addEventListener('touchmove', onTouchMove, {passive: true});
  item.addEventListener('touchend', onTouchEnd);

  // Tap outside a swiped item closes it.
  const closeSwipe = (e) => {
    if (!item.classList.contains('swiped')) return;
    if (!item.contains(e.target)) {
      item.style.transform = '';
      item.classList.remove('swiped');
    }
  };
  document.addEventListener('click', closeSwipe);
}
