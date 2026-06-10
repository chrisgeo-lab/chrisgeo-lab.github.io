const darkQuery = window.matchMedia('(prefers-color-scheme:dark)');

function isDark() {
  const override = document.documentElement.getAttribute('data-theme');
  if (override === 'dark') return true;
  if (override === 'light') return false;
  return darkQuery.matches;
}

function getStyle(dark) {
  return dark
    ? 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json'
    : 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json';
}

/** Singleton MapLibre instance for the app. */
export const map = new maplibregl.Map({
  container: 'map',
  style: getStyle(isDark()),
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
  keyboard: true,
  // theme.js snapshots the WebGL canvas via drawImage during a theme swap, so
  // the buffer must persist past the present() call — otherwise the cloned
  // canvas comes out blank.
  preserveDrawingBuffer: true
});

let mapLoaded = false;
/** Resolves once the map's first style has loaded — gate for adding sources/layers. */
export const mapReady = new Promise(resolve => {
  map.once('load', () => { mapLoaded = true; resolve(); });
});

darkQuery.addEventListener('change', () => {
  if (document.documentElement.hasAttribute('data-theme')) return;
  // diff:false forces a full style rebuild so style.load fires reliably and
  // our restoreLayers handler re-adds the route polylines + 3D buildings.
  map.setStyle(getStyle(isDark()), {diff: false});
});

let markers = [];
let popups = [];
let routeSources = [];
let routeData = [];
let sourceCounter = 0;
let renderEpoch = 0;

export function restoreLayers() {
  // Guard: add3DBuildings reads map.getStyle().layers, which can throw mid
  // style-swap. If it does, we MUST still restore route polylines.
  try { add3DBuildings(); } catch (e) { console.warn('restoreLayers: 3D buildings skipped', e); }
  routeData.forEach(({id, geojson, color, weight}) => {
    try { addRouteLayer(id, geojson, color, weight); }
    catch (e) { console.warn('restoreLayers: route layer failed', id, e); }
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
      'fill-extrusion-color': isDark() ? '#2c2c2e' : '#ddd',
      'fill-extrusion-height': ['case', ['has', 'render_height'], ['get', 'render_height'], ['has', 'floors'], ['*', ['get', 'floors'], 3.5], 10],
      'fill-extrusion-base': ['case', ['has', 'render_min_height'], ['get', 'render_min_height'], 0],
      'fill-extrusion-opacity': 0.6
    }
  }, beforeId);
}

// Replay polylines + 3D buildings on every style swap so theme toggles don't
// drop the route lines (sources are owned by the previous style and disappear).
map.on('style.load', () => { restoreLayers(); });

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
    } catch (e) {
      console.warn('clearMap: failed to remove route layer/source', id, e);
    }
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
  // Guard MapLibre against NaN/undefined coords — one bad spot would otherwise
  // throw "LngLat is not defined" and abort the whole render loop.
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    console.warn('addMarker: invalid lat/lng', lat, lng);
    return { _invalid: true, getLngLat: () => null, getElement: () => null, remove() {}, _el: null };
  }
  // 44x44 hit-area wrapping the visible icon. Meets WCAG touch target minimum
  // without inflating the visual marker. We set pointer-events:auto inline-
  // !important so we win against the css/map.css rule that disables pointer
  // events on .maplibregl-marker (needed there so pan/zoom work over markers
  // on the canvas).
  const el = document.createElement('div');
  el.className = 'marker-hit';
  el.style.cssText = 'width:44px;height:44px;display:flex;align-items:center;justify-content:center;cursor:pointer';
  el.style.setProperty('pointer-events', 'auto', 'important');
  el.innerHTML = icon.html;
  const marker = new maplibregl.Marker({element: el, anchor: 'center'})
    .setLngLat([lng, lat])
    .addTo(map);
  markers.push(marker);
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
  // After map.setStyle() the source may persist while the layers are dropped
  // (MapLibre's diff strips layers not present in the new style). Add the
  // source only if missing, and always re-add any missing layers.
  if (!map.getSource(id)) {
    map.addSource(id, {type: 'geojson', data: geojson});
  }
  if (!map.getLayer(id + '-outline')) {
    map.addLayer({
      id: id + '-outline',
      type: 'line',
      source: id,
      paint: {'line-color': '#000', 'line-width': weight + 3, 'line-opacity': 0.15},
      layout: {'line-cap': 'round', 'line-join': 'round'}
    });
  }
  if (!map.getLayer(id)) {
    map.addLayer({
      id: id,
      type: 'line',
      source: id,
      paint: {'line-color': color, 'line-width': weight, 'line-opacity': 0.9},
      layout: {'line-cap': 'round', 'line-join': 'round'}
    });
  }
}

/**
 * Build an HTML icon descriptor for a numbered stop marker.
 * Visual styling lives in css/map.css under `.map-pin` — this only sets the
 * route color via a CSS custom property and toggles state classes.
 * @param {number|string} n  Stop number (or check glyph when visited).
 * @param {string} color
 * @param {boolean} vis      Visited — dim and show check.
 * @param {boolean} curr     Current next-stop — enlarge and add glow.
 */
export function stopIcon(n, color, vis, curr) {
  const cls = ['map-pin', 'map-pin-stop'];
  if (vis) cls.push('is-visited');
  if (curr) cls.push('is-current');
  const content = vis
    ? '<svg viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 5.5l2 2 4-4.5"/></svg>'
    : `<span class="map-pin-num">${n}</span>`;
  return {html:
    `<div class="${cls.join(' ')}" style="--pin-color:${color}">` +
      `<span class="map-pin-content">${content}</span>` +
    '</div>'
  };
}

/** HTML icon descriptor for the home (end-point) marker. */
export function homeIcon() {
  return {html:
    '<div class="map-pin map-pin-home" style="--pin-color:#ff9f0a">' +
      '<span class="map-pin-content">' +
        '<svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
          '<path d="M2 7l5-4.5L12 7v5H2z"/><path d="M5.5 12V8.5h3V12"/>' +
        '</svg>' +
      '</span>' +
    '</div>'
  };
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
  const lat = Array.isArray(latlng) ? latlng[0] : latlng && latlng.lat;
  const lng = Array.isArray(latlng) ? latlng[1] : latlng && latlng.lng;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    console.warn('setView: invalid lat/lng', latlng);
    return;
  }
  const center = [lng, lat];
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
    let added = 0;
    bounds.forEach(b => {
      if (!Number.isFinite(b[0]) || !Number.isFinite(b[1]) || Math.abs(b[0]) > 90 || Math.abs(b[1]) > 180) return;
      lngLatBounds.extend([b[1], b[0]]);
      added++;
    });
    if (!added) return;
    // Single point → fitBounds would zoom to maxZoom and feel like a freeze.
    // Centre on that point at a sensible zoom instead.
    if (added === 1) {
      const c = lngLatBounds.getCenter();
      map.stop();
      map.jumpTo({center: [c.lng, c.lat], zoom: 14});
      return;
    }
    const padding = {};
    if (opts) {
      if (opts.padding) {
        const p = Array.isArray(opts.padding) ? opts.padding : [opts.padding, opts.padding];
        padding.top = p[0]; padding.bottom = p[0]; padding.left = p[1]; padding.right = p[1];
      }
      if (opts.paddingTopLeft) { padding.left = opts.paddingTopLeft[0]; padding.top = opts.paddingTopLeft[1]; }
      if (opts.paddingBottomRight) { padding.right = opts.paddingBottomRight[0]; padding.bottom = opts.paddingBottomRight[1]; }
    }

    // Use cameraForBounds + jumpTo instead of fitBounds to avoid triggering move events.
    map.stop();
    const camera = map.cameraForBounds(lngLatBounds, {padding});
    if (camera) map.jumpTo(camera);
  } else {
    // Direct LngLatBounds input
    map.stop();
    const camera = map.cameraForBounds(bounds, opts);
    if (camera) map.jumpTo(camera);
  }
}

/**
 * Animated camera move — preferred for "preview while typing" because
 * `flyTo` is more readable than the abrupt easeTo used by `setView`.
 * @param {number} lat
 * @param {number} lng
 * @param {number} [zoom=15]
 */
export function flyTo(lat, lng, zoom = 15) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
  map.stop();
  map.flyTo({center: [lng, lat], zoom, duration: 800, essential: true});
}

let previewPin = null;
/**
 * Drop or move an ephemeral preview pin (non-interactive). Used by quick-add
 * to show the user where a typed/highlighted address lands BEFORE they
 * commit. Returns the marker so callers can introspect; pass nothing to
 * remove.
 */
export function addPreviewPin(lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (previewPin) { previewPin.remove(); previewPin = null; }
  const el = document.createElement('div');
  el.className = 'preview-pin';
  el.style.cssText = 'pointer-events:none';
  el.innerHTML = '<div class="preview-pin-pulse"></div><div class="preview-pin-core"></div>';
  previewPin = new maplibregl.Marker({element: el, anchor: 'bottom'})
    .setLngLat([lng, lat])
    .addTo(map);
  return previewPin;
}
export function removePreviewPin() {
  if (previewPin) { previewPin.remove(); previewPin = null; }
}

/** Zoom in one level (150ms ease). */
export function zoomIn() { map.zoomTo(map.getZoom() + 1, {duration: 150}); }
/** Zoom out one level (150ms ease). */
export function zoomOut() { map.zoomTo(map.getZoom() - 1, {duration: 150}); }
/** Close all popups previously registered via {@link trackPopup}. */
export function closePopup() { popups.forEach(p => p.remove()); popups = []; }
/** Register `popup` so a subsequent {@link clearMap} or {@link closePopup} can dismiss it. */
export function trackPopup(popup) { popups.push(popup); }
