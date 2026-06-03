const darkQuery = window.matchMedia('(prefers-color-scheme:dark)');

function getStyle(isDark) {
  return isDark
    ? 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json'
    : 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json';
}

export const map = new maplibregl.Map({
  container: 'map',
  style: getStyle(darkQuery.matches),
  center: [-71.18, 42.5],
  zoom: 9,
  pitch: 0,
  bearing: 0,
  attributionControl: false,
  maxZoom: 19
});

map.addControl(new maplibregl.AttributionControl({compact: true}), 'bottom-left');

darkQuery.addEventListener('change', e => {
  map.setStyle(getStyle(e.matches));
  map.once('style.load', () => restoreLayers());
});


let markers = [];
let popups = [];
let routeSources = [];
let sourceCounter = 0;

function restoreLayers() {
  // After style change, re-add route layers and 3D buildings
  add3DBuildings();
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
      'fill-extrusion-height': [
        'case',
        ['has', 'render_height'], ['get', 'render_height'],
        ['has', 'floors'], ['*', ['get', 'floors'], 3.5],
        10
      ],
      'fill-extrusion-base': ['case', ['has', 'render_min_height'], ['get', 'render_min_height'], 0],
      'fill-extrusion-opacity': 0.6
    }
  }, beforeId);
}

map.on('style.load', () => {
  add3DBuildings();
});

export function clearMap() {
  markers.forEach(m => m.remove());
  markers = [];
  popups.forEach(p => p.remove());
  popups = [];
  if (map.isStyleLoaded()) {
    routeSources.forEach(id => {
      try {
        if (map.getLayer(id + '-outline')) map.removeLayer(id + '-outline');
        if (map.getLayer(id)) map.removeLayer(id);
        if (map.getSource(id)) map.removeSource(id);
      } catch {}
    });
  }
  routeSources = [];
}

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

export function addPolyline(coords, color, weight = 5) {
  if (!coords || coords.length < 2) return null;
  const id = 'route-' + (++sourceCounter);

  const geojson = {
    type: 'Feature',
    geometry: {
      type: 'LineString',
      coordinates: coords.map(c => [c[1], c[0]])
    }
  };

  if (!map.isStyleLoaded()) {
    map.once('style.load', () => addRouteLayer(id, geojson, color, weight));
  } else {
    addRouteLayer(id, geojson, color, weight);
  }
  routeSources.push(id);
  return id;
}

function addRouteLayer(id, geojson, color, weight) {
  map.addSource(id, {type: 'geojson', data: geojson, lineMetrics: true});

  map.addLayer({
    id: id + '-outline',
    type: 'line',
    source: id,
    paint: {
      'line-color': '#000',
      'line-width': weight + 3,
      'line-opacity': 0.1
    },
    layout: {'line-cap': 'round', 'line-join': 'round'}
  });

  map.addLayer({
    id: id,
    type: 'line',
    source: id,
    paint: {
      'line-color': color,
      'line-width': weight,
      'line-opacity': 0.85,
      'line-gradient': [
        'interpolate', ['linear'], ['line-progress'],
        0, color,
        1, lightenColor(color, 0.5)
      ]
    },
    layout: {'line-cap': 'round', 'line-join': 'round'}
  });
}

function lightenColor(hex, factor) {
  const rgb = hexToRgb(hex);
  const r = Math.min(255, Math.round(rgb.r + (255 - rgb.r) * factor));
  const g = Math.min(255, Math.round(rgb.g + (255 - rgb.g) * factor));
  const b = Math.min(255, Math.round(rgb.b + (255 - rgb.b) * factor));
  return `rgb(${r},${g},${b})`;
}

export function hexToRgb(hex) {
  hex = hex.replace('#', '');
  if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
  return {r: parseInt(hex.slice(0, 2), 16), g: parseInt(hex.slice(2, 4), 16), b: parseInt(hex.slice(4, 6), 16)};
}

export function stopIcon(n, color, vis, curr) {
  const sz = curr ? 26 : 22, op = vis ? 0.4 : 1;
  const bdr = curr ? '2.5px solid #fff' : '1.5px solid rgba(255,255,255,.8)';
  const content = vis ? '&#10003;' : n;
  const glow = curr ? `box-shadow:0 0 0 4px ${color}40,0 2px 8px rgba(0,0,0,.3)` : 'box-shadow:0 2px 6px rgba(0,0,0,.3)';
  return {html: `<div style="width:${sz}px;height:${sz}px;border-radius:50%;background:${color};display:flex;align-items:center;justify-content:center;font-family:var(--mono);font-weight:700;font-size:${curr ? 11 : 9}px;color:#fff;${glow};border:${bdr};opacity:${op}">${content}</div>`};
}

export function homeIcon() {
  return {html: '<div style="width:22px;height:22px;border-radius:50%;background:#FF9500;display:flex;align-items:center;justify-content:center;font-size:11px;color:#fff;box-shadow:0 2px 6px rgba(255,149,0,.4);border:1.5px solid #fff">&#9750;</div>'};
}

export function gpsIcon() {
  return {html: '<div class="gps-dot"><div class="gps-dot-core"></div><div class="gps-dot-ring"></div></div>'};
}


// Compatibility layer for existing code
map.setView = function(latlng, zoom, opts) {
  const center = Array.isArray(latlng) ? [latlng[1], latlng[0]] : [latlng.lng, latlng.lat];
  if (opts && opts.animate === false) {
    map.jumpTo({center, zoom});
  } else {
    map.flyTo({center, zoom, duration: opts?.duration ? opts.duration * 1000 : 1000});
  }
};

const originalFitBounds = maplibregl.Map.prototype.fitBounds;
map.fitBounds = function(bounds, opts) {
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
    return originalFitBounds.call(map, lngLatBounds, {padding, duration: 1000});
  }
  return originalFitBounds.call(map, bounds, opts);
};

map.panTo = function(latlng) {
  const center = Array.isArray(latlng) ? [latlng[1], latlng[0]] : [latlng.lng, latlng.lat];
  map.easeTo({center, duration: 500});
};

map.zoomIn = function() { map.zoomTo(map.getZoom() + 1, {duration: 300}); };
map.zoomOut = function() { map.zoomTo(map.getZoom() - 1, {duration: 300}); };

map.closePopup = function() { popups.forEach(p => p.remove()); popups = []; };

export function trackPopup(popup) { popups.push(popup); }

// removeLayer compat: old code passes marker objects, MapLibre expects string IDs
const _nativeRemoveLayer = map.removeLayer.bind(map);
map.removeLayer = function(obj) {
  if (typeof obj === 'string') return _nativeRemoveLayer(obj);
  if (obj && obj.remove) obj.remove();
};

