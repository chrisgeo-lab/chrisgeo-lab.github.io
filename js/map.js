const darkQuery = window.matchMedia('(prefers-color-scheme:dark)');

function getStyle(isDark) {
  return isDark
    ? 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json'
    : 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json';
}

/** Singleton MapLibre instance for the app. */
export const map = new maplibregl.Map({
  container: 'map',
  style: getStyle(darkQuery.matches),
  center: [-71.18, 42.5],
  zoom: 9,
  pitch: 0,
  bearing: 0,
  attributionControl: false,
  maxZoom: 18,
  dragPan: true,
  dragRotate: false,
  scrollZoom: true,
  touchZoomRotate: true,
  doubleClickZoom: true,
  touchPitch: false,
  keyboard: true
});

let mapLoaded = false;
/** Resolves once the map's first style has loaded — gate for adding sources/layers. */
export const mapReady = new Promise(resolve => {
  map.once('load', () => { mapLoaded = true; resolve(); });
});

darkQuery.addEventListener('change', e => {
  map.setStyle(getStyle(e.matches));
  map.once('style.load', () => restoreLayers());
});

let markers = [];
let popups = [];
let routeSources = [];
let routeData = [];
let sourceCounter = 0;
let renderEpoch = 0;

function restoreLayers() {
  add3DBuildings();
  routeData.forEach(({id, geojson, color, weight}) => {
    try { addRouteLayer(id, geojson, color, weight); } catch {}
  });
}

function add3DBuildings() {
  if (map.getLayer('3d-buildings')) return;
  const layers = map.getStyle().layers;
  const labelLayer = layers.find(l => l.type === 'symbol' && (l.layout || {})['text-field']);
  const beforeId = labelLayer ? labelLayer.id : undefined;
  if (!map.getSource('carto')) return;
  map.addLayer({
    id: '3d-buildings',
    source: 'carto',
    'source-layer': 'building',
    type: 'fill-extrusion',
    minzoom: 14,
    paint: {
      'fill-extrusion-color': darkQuery.matches ? '#2c2c2e' : '#ddd',
      'fill-extrusion-height': ['case', ['has', 'render_height'], ['get', 'render_height'], ['has', 'floors'], ['*', ['get', 'floors'], 3.5], 10],
      'fill-extrusion-base': ['case', ['has', 'render_min_height'], ['get', 'render_min_height'], 0],
      'fill-extrusion-opacity': 0.6
    }
  }, beforeId);
}

map.on('style.load', () => { add3DBuildings(); });

/** Remove all markers, popups, and route layers; bumps the render epoch to invalidate pending adds. */
export function clearMap() {
  renderEpoch++;
  markers.forEach(m => m.remove());
  markers = [];
  popups.forEach(p => p.remove());
  popups = [];
  routeSources.forEach(id => {
    try {
      if (map.getLayer(id + '-outline')) map.removeLayer(id + '-outline');
      if (map.getLayer(id)) map.removeLayer(id);
      if (map.getSource(id)) map.removeSource(id);
    } catch {}
  });
  routeSources = [];
  routeData = [];
}

/**
 * Add an HTML-element marker at (lat,lng) using the icon descriptor from {@link stopIcon}/{@link homeIcon}/{@link gpsIcon}.
 * @param {number} lat
 * @param {number} lng
 * @param {{html: string}} icon
 * @returns {maplibregl.Marker}
 */
export function addMarker(lat, lng, icon) {
  const el = document.createElement('div');
  el.innerHTML = icon.html;
  el.style.cursor = 'pointer';
  const firstChild = el.firstElementChild;
  if (firstChild) {
    el.style.width = firstChild.style.width;
    el.style.height = firstChild.style.height;
  }
  const marker = new maplibregl.Marker({element: el, anchor: 'center'})
    .setLngLat([lng, lat])
    .addTo(map);
  markers.push(marker);
  marker._el = el;
  marker._lngLat = [lng, lat];
  return marker;
}

/**
 * Add a route polyline as a GeoJSON line layer (with darker outline beneath).
 * Defers the actual layer add until `mapReady` if the style is still loading.
 * @param {Array<[number, number]>} coords  GeoJSON-style [lng, lat] pairs (MapLibre/OSRM native order — no internal swap).
 * @param {string} color
 * @param {number} [weight=5]
 * @returns {string|null}  Source/layer id, or null when coords < 2.
 */
export function addPolyline(coords, color, weight = 5) {
  if (!coords || coords.length < 2) return null;
  const id = 'route-' + (++sourceCounter);
  const geojson = {
    type: 'Feature',
    geometry: {
      type: 'LineString',
      coordinates: coords
    }
  };

  routeData.push({id, geojson, color, weight});
  routeSources.push(id);

  const epoch = renderEpoch;
  if (mapLoaded) {
    try { addRouteLayer(id, geojson, color, weight); } catch(e) { console.warn('Route layer failed:', e); }
  } else {
    mapReady.then(() => {
      if (epoch !== renderEpoch) return;
      try { addRouteLayer(id, geojson, color, weight); } catch(e) { console.warn('Route layer failed:', e); }
    });
  }
  return id;
}

function addRouteLayer(id, geojson, color, weight) {
  if (map.getSource(id)) return;
  map.addSource(id, {type: 'geojson', data: geojson});
  map.addLayer({
    id: id + '-outline',
    type: 'line',
    source: id,
    paint: {'line-color': '#000', 'line-width': weight + 3, 'line-opacity': 0.15},
    layout: {'line-cap': 'round', 'line-join': 'round'}
  });
  map.addLayer({
    id: id,
    type: 'line',
    source: id,
    paint: {'line-color': color, 'line-width': weight, 'line-opacity': 0.9},
    layout: {'line-cap': 'round', 'line-join': 'round'}
  });
}

/**
 * Build an HTML icon descriptor for a numbered stop marker.
 * @param {number|string} n  Stop number (or check glyph when visited).
 * @param {string} color
 * @param {boolean} vis      Visited — dim and show check.
 * @param {boolean} curr     Current next-stop — enlarge and add glow.
 */
export function stopIcon(n, color, vis, curr) {
  const sz = curr ? 26 : 22, op = vis ? 0.4 : 1;
  const bdr = curr ? '2.5px solid #fff' : '1.5px solid rgba(255,255,255,.8)';
  const content = vis ? '&#10003;' : n;
  const glow = curr ? `box-shadow:0 0 0 4px ${color}40,0 2px 8px rgba(0,0,0,.3)` : 'box-shadow:0 2px 6px rgba(0,0,0,.3)';
  return {html: `<div style="width:${sz}px;height:${sz}px;border-radius:50%;background:${color};display:flex;align-items:center;justify-content:center;font-family:var(--mono);font-weight:700;font-size:${curr ? 11 : 9}px;color:#fff;${glow};border:${bdr};opacity:${op}">${content}</div>`};
}

/** HTML icon descriptor for the home (end-point) marker. */
export function homeIcon() {
  return {html: '<div style="width:22px;height:22px;border-radius:50%;background:#FF9500;display:flex;align-items:center;justify-content:center;font-size:11px;color:#fff;box-shadow:0 2px 6px rgba(255,149,0,.4);border:1.5px solid #fff">&#9750;</div>'};
}

/** HTML icon descriptor for the live GPS dot (pulsing ring). */
export function gpsIcon() {
  return {html: '<div class="gps-dot"><div class="gps-dot-core"></div><div class="gps-dot-ring"></div></div>'};
}

/**
 * Recenter the map at `latlng` and zoom level. Accepts `[lat, lng]` array or `{lat, lng}`.
 * @param {[number, number]|{lat:number, lng:number}} latlng
 * @param {number} zoom
 * @param {{animate?: boolean}} [opts]  `animate:false` jumps; default eases (600ms).
 */
export function setView(latlng, zoom, opts) {
  const center = Array.isArray(latlng) ? [latlng[1], latlng[0]] : [latlng.lng, latlng.lat];
  map.stop();
  if (opts && opts.animate === false) {
    map.jumpTo({center, zoom});
  } else {
    map.easeTo({center, zoom, duration: 600});
  }
}

/**
 * Fit the map to a bounds rectangle. Accepts an array of `[lat, lng]` points or a MapLibre LngLatBounds.
 * Padding accepts `{padding}`, `{paddingTopLeft, paddingBottomRight}`, or scalar.
 * @param {Array<[number, number]>|maplibregl.LngLatBoundsLike} bounds
 * @param {object} [opts]
 */
export function fitBounds(bounds, opts) {
  if (Array.isArray(bounds) && bounds.length && Array.isArray(bounds[0])) {
    const lngLatBounds = new maplibregl.LngLatBounds();
    bounds.forEach(b => lngLatBounds.extend([b[1], b[0]]));
    const padding = {};
    if (opts) {
      if (opts.padding) {
        const p = Array.isArray(opts.padding) ? opts.padding : [opts.padding, opts.padding];
        padding.top = p[0]; padding.bottom = p[0]; padding.left = p[1]; padding.right = p[1];
      }
      if (opts.paddingTopLeft) { padding.left = opts.paddingTopLeft[0]; padding.top = opts.paddingTopLeft[1]; }
      if (opts.paddingBottomRight) { padding.right = opts.paddingBottomRight[0]; padding.bottom = opts.paddingBottomRight[1]; }
    }
    map.stop();
    map.fitBounds(lngLatBounds, {padding, duration: 0});
  } else {
    map.stop();
    map.fitBounds(bounds, {...opts, duration: 0});
  }
}

/** Zoom in one level (150ms ease). */
export function zoomIn() { map.zoomTo(map.getZoom() + 1, {duration: 150}); }
/** Zoom out one level (150ms ease). */
export function zoomOut() { map.zoomTo(map.getZoom() - 1, {duration: 150}); }
/** Close all popups previously registered via {@link trackPopup}. */
export function closePopup() { popups.forEach(p => p.remove()); popups = []; }
/** Register `popup` so a subsequent {@link clearMap} or {@link closePopup} can dismiss it. */
export function trackPopup(popup) { popups.push(popup); }
