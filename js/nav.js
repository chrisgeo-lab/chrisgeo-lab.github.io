import { state, STORE_V, saveSet } from './state.js';
import { hd, fmtMi, fmtMiShort, fmtDur, toast, setLoading, esc } from './utils.js';
import { fetchRoute } from './routing.js';
import { map, clearMap, addPolyline, addMarker, stopIcon, homeIcon } from './map.js';

export function maneuverIcon(type, mod) {
  const m = {depart: '&#9654;', arrive: '&#9632;', turn: mod?.includes('left') ? '&#8592;' : mod?.includes('right') ? '&#8594;' : '&#8593;', 'new name': '&#8593;', continue: '&#8593;', merge: '&#8599;', 'on ramp': '&#8599;', 'off ramp': '&#8600;', fork: mod?.includes('left') ? '&#8598;' : '&#8599;', 'end of road': mod?.includes('left') ? '&#8592;' : '&#8594;', roundabout: '&#8635;', rotary: '&#8635;'};
  return m[type] || '&#8593;';
}

export function maneuverText(step) {
  const {type, modifier: mod} = step.maneuver; const name = step.name || ''; const road = name ? `<strong>${name}</strong>` : 'the road';
  if (type === 'depart') return `Head ${mod || 'north'} on ${road}`;
  if (type === 'arrive') return 'Arrive at destination';
  if (type === 'turn') { const d = mod === 'left' ? 'Turn left' : mod === 'right' ? 'Turn right' : mod === 'sharp left' ? 'Sharp left' : mod === 'sharp right' ? 'Sharp right' : mod === 'slight left' ? 'Slight left' : mod === 'slight right' ? 'Slight right' : mod === 'uturn' ? 'Make a U-turn' : 'Continue'; return `${d} onto ${road}`; }
  if (type === 'new name' || type === 'continue') return `Continue onto ${road}`;
  if (type === 'merge') return `Merge onto ${road}`;
  if (type === 'on ramp') return `Take the ramp onto ${road}`;
  if (type === 'off ramp') return `Take the exit onto ${road}`;
  if (type === 'fork') return `Keep ${mod?.includes('left') ? 'left' : 'right'} onto ${road}`;
  if (type === 'end of road') return `Turn ${mod?.includes('left') ? 'left' : 'right'} onto ${road}`;
  if (type === 'roundabout' || type === 'rotary') { const ex = step.maneuver.exit ? `Take exit ${step.maneuver.exit}` : 'Enter roundabout'; return name ? `${ex} onto ${road}` : ex; }
  return `Continue on ${road}`;
}

function getDistToPoint(loc) {
  if (!state.gpsPos || !loc) return null;
  const pt = {lat: loc[1], lng: loc[0]};
  return hd(state.gpsPos, pt);
}

export function startNavigation(renderViewFn) {
  if (!navigator.geolocation) { toast('GPS not available'); return; }
  toast('Getting GPS location...');
  navigator.geolocation.getCurrentPosition(pos => {
    state.gpsPos = {lat: pos.coords.latitude, lng: pos.coords.longitude, acc: pos.coords.accuracy, hdg: pos.coords.heading, spd: pos.coords.speed};
    beginNavigation(renderViewFn);
  }, err => {
    toast('GPS unavailable — check permissions');
    console.warn('GPS error:', err.message);
  }, {enableHighAccuracy: true, timeout: 10000});
}

async function beginNavigation(renderViewFn) {
  if (!state.gpsPos) return;
  state.isNavigating = true; state.userPanned = false;
  setLoading(true);

  const routes = state.activeFilter >= 0 ? [state.currentRoutes[state.activeFilter]] : state.currentRoutes;
  const unvisited = [];
  for (const r of routes) {
    for (const idx of r.route) {
      const sp = typeof idx === 'number' ? state.SPOTS[idx] : idx;
      if (!state.visitedSet.has(sp.id)) unvisited.push(sp);
    }
  }
  if (!unvisited.length) { toast('All stops visited!'); state.isNavigating = false; setLoading(false); return; }

  const start = {lat: state.gpsPos.lat, lng: state.gpsPos.lng};
  const waypoints = [start, ...unvisited];
  if (state.home) waypoints.push(state.home);

  try {
    const routeData = await fetchRoute(waypoints);
    state.navRoute = {
      legs: routeData.legs,
      geometry: routeData.geometry,
      stops: unvisited,
      hasEnd: !!state.home,
      totalDuration: routeData.duration,
      totalDistance: routeData.distance
    };
    state.navCurrentLeg = 0;
  } catch (e) {
    console.warn('Nav route failed:', e);
    state.navRoute = {legs: null, geometry: null, stops: unvisited, hasEnd: !!state.home, totalDuration: 0, totalDistance: 0};
    state.navCurrentLeg = 0;
  }

  setLoading(false);
  document.body.classList.add('navigating');
  document.getElementById('navOverlay').classList.add('active');
  openNavDirPanel();

  clearMap();
  if (state.navRoute.geometry?.coordinates) {
    const ll = state.navRoute.geometry.coordinates.map(c => [c[1], c[0]]);
    addPolyline(ll, '#007AFF', 6);
  }
  state.navRoute.stops.forEach((sp, i) => {
    addMarker(sp.lat, sp.lng, stopIcon(i + 1, '#007AFF', false, i === 0));
  });
  if (state.home) addMarker(state.home.lat, state.home.lng, homeIcon());

  state.gpsWatchId = navigator.geolocation.watchPosition(
    pos => onGPS(pos, renderViewFn),
    onGPSError,
    {enableHighAccuracy: true, maximumAge: 2000, timeout: 10000}
  );
  updateNavUI();
  if (state.gpsPos) map.setView([state.gpsPos.lat, state.gpsPos.lng], 15);
}

export function stopNavigation(renderViewFn, setSheetStateFn) {
  state.isNavigating = false; state.navRoute = null; state.navCurrentLeg = 0; state.navCurrentStep = 0;
  document.body.classList.remove('navigating');
  document.getElementById('navOverlay').classList.remove('active');
  closeNavDirPanel();
  setSheetStateFn('peek');
  if (state.gpsWatchId !== null) { navigator.geolocation.clearWatch(state.gpsWatchId); state.gpsWatchId = null; }
  if (state.gpsMarker) { map.removeLayer(state.gpsMarker); state.gpsMarker = null; }
  document.getElementById('recenterBtn').classList.remove('show');
  renderViewFn();
}

function onGPS(pos, renderViewFn) {
  state.gpsPos = {lat: pos.coords.latitude, lng: pos.coords.longitude, acc: pos.coords.accuracy, hdg: pos.coords.heading, spd: pos.coords.speed};
  if (!state.gpsMarker) {
    state.gpsMarker = L.marker([state.gpsPos.lat, state.gpsPos.lng], {icon: L.divIcon({html: '<div class="gps-dot"><div class="gps-dot-core"></div><div class="gps-dot-ring"></div></div>', iconSize: [22, 22], iconAnchor: [11, 11], className: ''}), zIndexOffset: 9999}).addTo(map);
  } else {
    state.gpsMarker.setLatLng([state.gpsPos.lat, state.gpsPos.lng]);
  }
  if (!state.userPanned) {
    const zoom = map.getZoom() < 15 ? 16 : map.getZoom();
    map.setView([state.gpsPos.lat, state.gpsPos.lng], zoom, {animate: true, duration: .5});
  }
  document.getElementById('recenterBtn').classList.toggle('show', state.userPanned);
  advanceNavStep();
  checkArrival(renderViewFn);
  updateNavUI();
}

function onGPSError(e) { console.warn('GPS error:', e.message); }

function advanceNavStep() {
  if (!state.gpsPos || !state.navRoute || !state.navRoute.legs) return;
  if (state.navCurrentLeg >= state.navRoute.legs.length) return;
  const leg = state.navRoute.legs[state.navCurrentLeg];
  if (!leg || !leg.steps) return;
  for (let i = state.navCurrentStep; i < leg.steps.length - 1; i++) {
    const nextStep = leg.steps[i + 1];
    if (!nextStep.maneuver || !nextStep.maneuver.location) continue;
    const stepLoc = {lat: nextStep.maneuver.location[1], lng: nextStep.maneuver.location[0]};
    const distToStep = hd(state.gpsPos, stepLoc) * 5280;
    if (distToStep < 100) {
      state.navCurrentStep = i + 1;
    }
  }
}

function checkArrival(renderViewFn) {
  if (!state.gpsPos || !state.isNavigating || !state.navRoute) return;
  if (state.navCurrentLeg >= state.navRoute.stops.length) return;
  const sp = state.navRoute.stops[state.navCurrentLeg];
  const dist = hd(state.gpsPos, sp) * 5280;
  if (dist < 165) {
    state.visitedSet.add(sp.id); saveSet(STORE_V, state.visitedSet);
    toast(`Arrived at ${sp.street}!`);
    if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
    state.navCurrentLeg++;
    state.navCurrentStep = 0;
    updateNavUI();
    updateProgress();
  }
}

function updateProgress() {
  const total = state.SPOTS.length; const done = state.visitedSet.size;
  document.getElementById('progressBar').style.width = `${total ? (done / total) * 100 : 0}%`;
}

export function updateNavUI() {
  if (!state.navRoute) return;
  const allDone = state.navCurrentLeg >= state.navRoute.stops.length;

  if (allDone) {
    if (state.navRoute.hasEnd && state.home) {
      const dist = state.gpsPos ? hd(state.gpsPos, state.home) : 0;
      document.getElementById('navDist').textContent = dist < 0.1 ? `${Math.round(dist * 5280)} ft` : `${dist.toFixed(1)} mi`;
      document.getElementById('navText').textContent = `Head to ${state.home.label.split(',')[0]}`;
      document.getElementById('navIcon').innerHTML = '&#9750;';
      document.getElementById('navEta').textContent = dist ? fmtDur((dist / 30) * 3600) : '--';
      document.getElementById('navEtaDetail').textContent = 'to end point';
      document.getElementById('navNextName').textContent = state.home.label.split(',')[0];
    } else {
      document.getElementById('navDist').textContent = '';
      document.getElementById('navText').textContent = 'All stops complete!';
      document.getElementById('navIcon').innerHTML = '&#10003;';
      document.getElementById('navEta').textContent = 'Done';
      document.getElementById('navEtaDetail').textContent = 'route complete';
      document.getElementById('navNextName').textContent = 'Finished';
    }
    return;
  }

  const sp = state.navRoute.stops[state.navCurrentLeg];
  const leg = state.navRoute.legs ? state.navRoute.legs[state.navCurrentLeg] : null;

  let currentStep = null, nextTurnStep = null, distToNextTurn = null;
  if (leg && leg.steps) {
    currentStep = leg.steps[state.navCurrentStep] || leg.steps[0];
    for (let i = state.navCurrentStep; i < leg.steps.length; i++) {
      const s = leg.steps[i];
      if (s.maneuver.type !== 'depart' && s.maneuver.type !== 'arrive' && s.distance > 0) {
        nextTurnStep = s;
        if (s.maneuver.location) {
          distToNextTurn = getDistToPoint(s.maneuver.location);
        }
        break;
      }
    }
    if (!nextTurnStep && state.navCurrentStep < leg.steps.length) {
      nextTurnStep = leg.steps[state.navCurrentStep];
      if (nextTurnStep.maneuver.location) distToNextTurn = getDistToPoint(nextTurnStep.maneuver.location);
    }
  }

  if (nextTurnStep) {
    if (distToNextTurn !== null) {
      document.getElementById('navDist').textContent = distToNextTurn < 0.1 ? `${Math.round(distToNextTurn * 5280)} ft` : `${distToNextTurn.toFixed(1)} mi`;
    } else {
      document.getElementById('navDist').textContent = fmtMiShort(nextTurnStep.distance);
    }
    document.getElementById('navText').textContent = maneuverText(nextTurnStep).replace(/<[^>]+>/g, '');
    document.getElementById('navIcon').innerHTML = maneuverIcon(nextTurnStep.maneuver.type, nextTurnStep.maneuver.modifier);
  } else if (state.gpsPos) {
    const dist = hd(state.gpsPos, sp);
    document.getElementById('navDist').textContent = dist < 0.1 ? `${Math.round(dist * 5280)} ft` : `${dist.toFixed(1)} mi`;
    document.getElementById('navText').textContent = `Continue to ${sp.street}`;
    document.getElementById('navIcon').innerHTML = '&#8593;';
  }

  if (leg) {
    let remainDur = 0, remainDist = 0;
    if (leg.steps) {
      for (let i = state.navCurrentStep; i < leg.steps.length; i++) {
        remainDur += leg.steps[i].duration;
        remainDist += leg.steps[i].distance;
      }
    } else {
      remainDur = leg.duration; remainDist = leg.distance;
    }
    document.getElementById('navEta').textContent = fmtDur(remainDur);
    document.getElementById('navEtaDetail').textContent = `${fmtMiShort(remainDist)} to Stop ${state.navCurrentLeg + 1}`;
  } else {
    document.getElementById('navEta').textContent = '--';
    document.getElementById('navEtaDetail').textContent = `Stop ${state.navCurrentLeg + 1} of ${state.navRoute.stops.length}`;
  }
  document.getElementById('navNextName').textContent = sp.street;
}

export function openNavDirPanel() {
  const panel = document.getElementById('navDirPanel');
  renderNavDirections();
  requestAnimationFrame(() => panel.classList.add('open'));
}

export function closeNavDirPanel() {
  const panel = document.getElementById('navDirPanel');
  panel.classList.remove('open');
}

export function renderNavDirections() {
  const el = document.getElementById('navDirContent');
  if (!state.navRoute || !state.navRoute.legs) { el.innerHTML = '<div style="padding:40px 20px;text-align:center;color:var(--secondary);font-size:14px">No route directions available.</div>'; return; }
  el.innerHTML = '';
  state.navRoute.legs.forEach((leg, li) => {
    if (!leg.steps) return;
    const sp = li < state.navRoute.stops.length ? state.navRoute.stops[li] : null;
    const destLabel = sp ? sp.street : (state.navRoute.hasEnd && state.home ? state.home.label.split(',')[0] : 'Destination');
    const isCurrentLeg = li === state.navCurrentLeg;

    const legHdr = document.createElement('div');
    legHdr.className = 'nav-leg-hdr';
    legHdr.innerHTML = `<span style="width:8px;height:8px;border-radius:50%;background:${isCurrentLeg ? 'var(--blue)' : 'var(--tertiary)'}"></span>Stop ${li + 1}: ${esc(destLabel)}<span style="margin-left:auto;font-weight:400">${fmtMiShort(leg.distance)} · ${fmtDur(leg.duration)}</span>`;
    el.appendChild(legHdr);

    leg.steps.forEach((step, si) => {
      if (step.distance === 0 && step.maneuver.type !== 'arrive' && step.maneuver.type !== 'depart') return;
      const isActive = isCurrentLeg && si === state.navCurrentStep;
      const isPast = li < state.navCurrentLeg || (isCurrentLeg && si < state.navCurrentStep);
      const stepEl = document.createElement('div');
      stepEl.className = 'nav-step' + (isActive ? ' active' : '') + (isPast ? ' past' : '');
      const icon = maneuverIcon(step.maneuver.type, step.maneuver.modifier);
      const text = maneuverText(step).replace(/<[^>]+>/g, '');
      const dist = step.distance > 0 ? fmtMiShort(step.distance) : '';
      stepEl.innerHTML = `<span style="width:28px;height:28px;border-radius:7px;background:${isActive ? 'var(--blue)' : 'var(--fill)'};color:${isActive ? '#fff' : 'var(--secondary)'};display:flex;align-items:center;justify-content:center;font-size:14px;flex-shrink:0">${icon}</span><div style="flex:1;min-width:0"><div style="font-size:13px;font-weight:${isActive ? '600' : '400'};color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${text}</div>${dist ? `<div style="font-size:11px;color:var(--secondary);margin-top:1px">${dist}${step.duration > 0 ? ' · ' + fmtDur(step.duration) : ''}</div>` : ''}</div>`;
      el.appendChild(stepEl);
    });
  });
}
