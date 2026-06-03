# RouteFlow

Multi-stop route planner with smart clustering, real-time optimization, and offline support. Built as a client-side PWA — no backend required.

## Features

- **Route Optimization** — Solves TSP (Traveling Salesman Problem) with 2-opt and or-opt improvements
- **Multi-Profile Routing** — Driving, cycling, and walking via OSRM
- **Geographic Clustering** — Split stops into multiple routes using k-medoids on travel-time matrices
- **Multi-Provider Geocoding** — Photon, US Census, and Nominatim with automatic fallback
- **Address Import** — CSV, Excel, TSV file import; paste lists; manual entry with autocomplete
- **Offline Support** — Service worker caches app shell; OSRM route cache in localStorage
- **Export** — Google Maps, Apple Maps (multi-stop), and text file export
- **3D Buildings** — MapLibre GL with CARTO vector tiles and extruded buildings at zoom 14+
- **Progress Tracking** — Mark stops visited, track completion, celebrate on finish
- **Dark Mode** — Automatic theme switching via `prefers-color-scheme`
- **Guided Tour** — Interactive onboarding with Bay Area demo data

## Quick Start

Serve statically — no build step needed:

```bash
# Any static server works
npx serve .
python -m http.server 8000
```

Open `http://localhost:8000` and add stops via the Import button.

## Architecture

```
index.html          Entry point (single page)
css/styles.css      All styles (Apple Maps design language)
js/
  app.js            Event wiring and initialization
  state.js          Central state object and localStorage persistence
  ui.js             Rendering (map markers, stop list, stats, modals)
  map.js            MapLibre GL setup, markers, polylines, 3D buildings
  routing.js        OSRM table/route API with multi-server fallback
  solver.js         TSP solver (nearest-neighbor + 2-opt + or-opt) and clustering
  geocoder.js       Multi-provider geocoding (Photon → Census → Nominatim)
  addresses.js      Address import/parse/geocode workflow
  tour.js           Guided tour with demo data
  utils.js          Formatting, escaping, toast notifications
sw.js               Service worker (cache-first for app shell)
manifest.json       PWA manifest
```

## External Services

All free, no API keys required:

| Service | Purpose |
|---------|---------|
| [OSRM](https://router.project-osrm.org) | Driving route/table API |
| [routing.openstreetmap.de](https://routing.openstreetmap.de) | Bike/walk OSRM profiles |
| [Photon](https://photon.komoot.io) | Primary geocoder (fast, fuzzy) |
| [US Census Geocoder](https://geocoding.geo.census.gov) | US street address fallback |
| [Nominatim](https://nominatim.openstreetmap.org) | Last-resort geocoder |
| [CARTO](https://basemaps.cartocdn.com) | Vector tile basemap |

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `H` | Set end point |
| `+` / `-` | Zoom in/out |
| `1`–`9` | Switch route filter |
| `E` / `e` | Export text / Google Maps |
| `?` | Start guided tour |
| `Esc` | Close modal / collapse panel |

## Browser Support

Modern browsers with ES modules support (Chrome 80+, Firefox 78+, Safari 14+, Edge 80+).

## License

MIT
