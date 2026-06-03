import { state, STOP_MIN, getStartLocation, getActiveRoutes } from './state.js';
import { fmtMi, fmtTime, fmtDur, toast } from './utils.js';
import { formatForMaps } from './geocoder.js';

export function exportRoute() {
  if (!state.currentRoutes.length) { toast('No route yet'); return; }
  const routes = getActiveRoutes();
  let text = 'RouteFlow Export\n';
  text += `${new Date().toLocaleDateString()}\n`;
  text += `${'─'.repeat(30)}\n\n`;
  if (state.home) text += `End: ${state.home.label}\n\n`;
  routes.forEach(rd => {
    text += `--- ${rd.name} (${rd.totalMiles.toFixed(1)} mi, ~${fmtTime(rd.totalMinutes + rd.route.length * STOP_MIN)}) ---\n`;
    const spots = rd.route.map(i => typeof i === 'number' ? state.SPOTS[i] : i);
    spots.forEach((s, i) => {
      const spot = typeof s === 'number' ? state.SPOTS[s] : s;
      const vis = state.visitedSet.has(spot.id) ? '[x]' : '[ ]';
      const leg = rd.legs ? rd.legs[(getStartLocation() ? 1 : 0) + i] : null;
      const addrParts = [spot.street, spot.city, spot.state].filter(Boolean);
      text += `  ${vis} ${i + 1}. ${addrParts.join(', ')}`;
      if (leg) text += ` (${fmtMi(leg.distance)} mi, ~${fmtDur(leg.duration)})`;
      text += '\n';
    });
    text += '\n';
  });
  text += `\n${state.visitedSet.size}/${state.SPOTS.length} done\n`;

  const blob = new Blob([text], {type: 'text/plain'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `routeflow-${new Date().toISOString().slice(0, 10)}.txt`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
  toast('Route exported');
}

export function exportToGoogleMaps() {
  if (!state.currentRoutes.length) { toast('No route yet'); return; }
  if (state.activeFilter < 0 && state.currentRoutes.length > 1) {
    toast('Pick one route first');
    return;
  }

  const rd = state.activeFilter >= 0 ? state.currentRoutes[state.activeFilter] : state.currentRoutes[0];
  const stops = [];
  for (const idx of rd.route) {
    const sp = typeof idx === 'number' ? state.SPOTS[idx] : idx;
    if (!state.visitedSet.has(sp.id)) stops.push(sp);
  }
  if (!stops.length) { toast('All stops done'); return; }

  const allPoints = [];
  const origin = getStartLocation();
  if (origin) {
    allPoints.push(`${origin.lat},${origin.lng}`);
  } else {
    allPoints.push(formatForMaps(stops[0]));
  }
  const stopsToInclude = origin ? stops : stops.slice(1);
  for (const sp of stopsToInclude) {
    allPoints.push(formatForMaps(sp));
  }
  if (state.home) {
    allPoints.push(`${state.home.lat},${state.home.lng}`);
  }

  const gModes = {car: 'driving', bike: 'bicycling', walk: 'walking'};
  const travelParam = gModes[state.travelMode] || 'driving';
  const MAX_URL_LEN = 2000;
  let url = 'https://www.google.com/maps/dir/' + allPoints.map(p => encodeURIComponent(p)).join('/') + `?travelmode=${travelParam}`;

  if (url.length > MAX_URL_LEN) {
    const coordPoints = [];
    if (origin) coordPoints.push(`${origin.lat},${origin.lng}`);
    else coordPoints.push(`${stops[0].lat},${stops[0].lng}`);
    const available = origin ? stops : stops.slice(1);
    for (const sp of available) {
      coordPoints.push(`${sp.lat},${sp.lng}`);
    }
    if (state.home) coordPoints.push(`${state.home.lat},${state.home.lng}`);
    let trimmed = coordPoints;
    while (trimmed.length > 2) {
      url = 'https://www.google.com/maps/dir/' + trimmed.join('/') + `?travelmode=${travelParam}`;
      if (url.length <= MAX_URL_LEN) break;
      trimmed = trimmed.slice(0, -1);
    }
    const included = trimmed.length - (origin ? 1 : 0) - (state.home ? 1 : 0);
    if (included < stops.length) {
      toast(`Google Maps (${included} of ${stops.length} stops)`);
    } else {
      toast('Opening Google Maps');
    }
  } else {
    toast('Opening Google Maps');
  }
  window.open(url, '_blank', 'noopener');
}

export function exportToAppleMaps() {
  if (!state.currentRoutes.length) { toast('No route yet'); return; }
  if (state.activeFilter < 0 && state.currentRoutes.length > 1) {
    toast('Pick one route first');
    return;
  }

  const rd = state.activeFilter >= 0 ? state.currentRoutes[state.activeFilter] : state.currentRoutes[0];
  const stops = [];
  for (const idx of rd.route) {
    const sp = typeof idx === 'number' ? state.SPOTS[idx] : idx;
    if (!state.visitedSet.has(sp.id)) stops.push(sp);
  }
  if (!stops.length) { toast('All stops done'); return; }

  const origin = getStartLocation();
  const appleModes = {car: 'd', bike: 'b', walk: 'w'};
  const mode = appleModes[state.travelMode] || 'd';
  const saddr = origin ? `${origin.lat},${origin.lng}` : `${stops[0].lat},${stops[0].lng}`;
  const waypoints = (origin ? stops : stops.slice(1)).map(sp => `${sp.lat},${sp.lng}`);
  if (state.home) waypoints.push(`${state.home.lat},${state.home.lng}`);

  const url = `https://maps.apple.com/?dirflg=${mode}&saddr=${saddr}&daddr=${waypoints.join('+to:')}`;
  toast('Opening Apple Maps');
  window.open(url, '_blank', 'noopener');
}
