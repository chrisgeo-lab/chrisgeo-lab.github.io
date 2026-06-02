const CACHE_NAME = 'routeflow-v3';
const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './js/app.js',
  './js/state.js',
  './js/utils.js',
  './js/routing.js',
  './js/solver.js',
  './js/map.js',
  './js/ui.js',
  './js/nav.js',
  './js/addresses.js',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css'
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
  const filename = url.pathname.split('/').pop();

  // Cache-first for static assets and tile images
  const isStaticAsset = STATIC_ASSETS.some(asset => {
    if (asset.startsWith('http')) return e.request.url.startsWith(asset);
    const assetFile = asset.replace('./', '');
    return filename === assetFile || url.pathname.endsWith(assetFile);
  });
  if (isStaticAsset || url.hostname.includes('basemaps.cartocdn.com')) {
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

  // Network-first for OSRM/Nominatim/Photon API calls (with cache fallback for offline)
  if (url.hostname === 'router.project-osrm.org' ||
      url.hostname === 'nominatim.openstreetmap.org' ||
      url.hostname === 'photon.komoot.io') {
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

  // Default: network with cache fallback
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request))
  );
});
