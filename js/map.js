import { state } from './state.js';

export const map = L.map('map', {zoomControl: false}).setView([42.5, -71.18], 10);

const isDark = window.matchMedia('(prefers-color-scheme:dark)').matches;
L.tileLayer(isDark
  ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
  : 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
  attribution: '&copy;OpenStreetMap &copy;CARTO', maxZoom: 19
}).addTo(map);
setTimeout(() => map.invalidateSize(), 100);

map.on('movestart', () => { if (state.isNavigating) state.userPanned = true; });

export let mapLayers = [];
export function clearMap() { mapLayers.forEach(l => map.removeLayer(l)); mapLayers = []; }

export function addMarker(lat, lng, icon) { const m = L.marker([lat, lng], {icon}).addTo(map); mapLayers.push(m); return m; }

export function addPolyline(coords, color, weight = 5) {
  const n = coords.length;
  if (n < 2) return null;
  const segments = Math.min(n - 1, 48);
  const step = Math.max(1, Math.floor((n - 1) / segments));
  const outline = L.polyline(coords, {color: '#000', weight: weight + 3, opacity: .1, lineCap: 'round', lineJoin: 'round'}).addTo(map);
  mapLayers.push(outline);
  const rgb = hexToRgb(color);
  for (let i = 0; i < n - 1; i += step) {
    const end = Math.min(i + step + 1, n);
    const seg = coords.slice(i, end);
    if (seg.length < 2) continue;
    const t = i / (n - 1);
    const r = Math.round(rgb.r + (255 - rgb.r) * t * 0.6);
    const g = Math.round(rgb.g + (255 - rgb.g) * t * 0.6);
    const b = Math.round(rgb.b + (255 - rgb.b) * t * 0.6);
    const segColor = `rgb(${r},${g},${b})`;
    const p = L.polyline(seg, {color: segColor, weight, opacity: .85, lineCap: 'round', lineJoin: 'round'}).addTo(map);
    mapLayers.push(p);
  }
  return outline;
}

export function hexToRgb(hex) {
  hex = hex.replace('#', '');
  if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
  return {r: parseInt(hex.slice(0, 2), 16), g: parseInt(hex.slice(2, 4), 16), b: parseInt(hex.slice(4, 6), 16)};
}

export function stopIcon(n, color, vis, curr) {
  const sz = curr ? 24 : 20, op = vis ? .4 : 1;
  const bdr = curr ? '2px solid #fff' : '1.5px solid rgba(255,255,255,.8)';
  const content = vis ? '&#10003;' : n;
  const glow = curr ? `box-shadow:0 0 0 4px ${color}40,0 2px 8px rgba(0,0,0,.3)` : 'box-shadow:0 2px 6px rgba(0,0,0,.3)';
  return L.divIcon({html: `<div style="width:${sz}px;height:${sz}px;border-radius:50%;background:${color};display:flex;align-items:center;justify-content:center;font-family:var(--mono);font-weight:700;font-size:${curr ? 10 : 9}px;color:#fff;${glow};border:${bdr};opacity:${op}">${content}</div>`, iconSize: [sz, sz], iconAnchor: [sz / 2, sz / 2], popupAnchor: [0, -sz / 2], className: ''});
}

export function homeIcon() {
  return L.divIcon({html: `<div style="width:20px;height:20px;border-radius:50%;background:#FF9500;display:flex;align-items:center;justify-content:center;font-size:11px;color:#fff;box-shadow:0 2px 6px rgba(255,149,0,.4);border:1.5px solid #fff">&#9750;</div>`, iconSize: [20, 20], iconAnchor: [10, 10], popupAnchor: [0, -10], className: ''});
}
