const CACHE_NAME = 'routeflow-v20';
const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/styles.css',
  './js/fallback.js',
  './js/app.js',
  './js/state.js',
  './js/utils.js',
  './js/routing.js',
  './js/solver.js',
  './js/map.js',
  './js/ui.js',
  './js/exports.js',
  './js/modals.js',
  './js/addresses.js',
  './js/address-parse.js',
  './js/planner.js',
  './js/geocoder.js',
  './js/tour.js',
  'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js',
  'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  if (e.request.method !== 'GET') return;

  const filename = url.pathname.split('/').pop();

  const isStaticAsset = STATIC_ASSETS.some(asset => {
    if (asset.startsWith('http')) return e.request.url.startsWith(asset);
    const assetFile = asset.replace('./', '');
    return filename === assetFile || url.pathname.endsWith(assetFile);
  });

  if (isStaticAsset || url.hostname.includes('basemaps.cartocdn.com') || url.hostname.includes('cartocdn.com')) {
    e.respondWith(
      caches.match(e.request).then(cached => {
        if (cached) return cached;
        return fetch(e.request).then(response => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
          }
          return response;
        });
      }).catch(() => caches.match(e.request))
    );
    return;
  }

  if (url.hostname === 'router.project-osrm.org' ||
      url.hostname === 'routing.openstreetmap.de' ||
      url.hostname === 'nominatim.openstreetmap.org' ||
      url.hostname === 'photon.komoot.io' ||
      url.hostname === 'geocoding.geo.census.gov') {
    e.respondWith(
      fetch(e.request).then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
        }
        return response;
      }).catch(() => caches.match(e.request))
    );
    return;
  }

  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request))
  );
});
