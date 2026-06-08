# RouteFlow

Multi-stop route planner with clustering, real-time optimization, and offline support. Static PWA — no backend, no build step.

## Features

- **Route Optimization** — TSP solver with 2-opt and or-opt improvements
- **Multi-Profile Routing** — Driving, cycling, walking via OSRM
- **Route Splitting** — k-medoids clustering to divide stops into area-based groups
- **Geocoding** — Photon, US Census, Nominatim with automatic fallback
- **Address Import** — CSV, Excel, TSV; paste lists; manual entry with autocomplete
- **Offline Support** — Service worker caches the app; OSRM responses cached in localStorage
- **Navigation Export** — Google Maps and Apple Maps with correct travel mode
- **3D Buildings** — MapLibre GL with CARTO vector tiles, extruded at zoom 14+
- **Progress Tracking** — Mark stops done, track completion
- **Dark Mode** — Automatic via `prefers-color-scheme`
- **Guided Tour** — Interactive onboarding with SF demo data
- **Accessibility** — Focus trapping in modals, ARIA labels, keyboard navigation

## Quick Start

No build step. Serve statically:

```bash
npx serve .
# or
python -m http.server 8000
```

Open `http://localhost:8000`. Deploy to GitHub Pages by pushing to the repo.

## Running Tests

Open `tests/index.html` in any browser (served over HTTP). Tests cover the solver, address parsing, and utility functions. No Node or test runner required.

```bash
# If using a local server:
open http://localhost:8000/tests/
```

## Development

The app itself has no build step — `index.html` loads ES modules directly. The tooling below is for linting, formatting, type-checking (via JSDoc + `tsc --noEmit`), and running the Node-based unit tests in CI.

```bash
npm install          # install dev tooling (one-time)
npm run lint         # ESLint over js/ and tests/
npm run format       # Prettier write
npm run format:check # Prettier check (CI)
npm run typecheck    # tsc --noEmit using jsconfig.json
npm test             # node --test tests/*.test.js
```

CI runs all of the above on push and pull request via `.github/workflows/ci.yml`.

## Architecture

```
index.html            Entry point
css/styles.css        All styles
js/
  app.js              Event wiring and initialization
  state.js            Central state, localStorage persistence, config
  planner.js          Route orchestration (matrix → cluster → solve → fetch)
  ui.js               Rendering (map view, stop list, stats)
  map.js              MapLibre GL setup, markers, polylines, 3D buildings
  routing.js          OSRM table/route API with retry and multi-server fallback
  solver.js           TSP (nearest-neighbor + 2-opt + or-opt) and k-medoids clustering
  geocoder.js         Multi-provider geocoding cascade
  addresses.js        Import/parse/geocode workflow and modal UI
  address-parse.js    Pure address parsing and state normalization (testable)
  modals.js           Home/start point modal logic
  exports.js          Google Maps, Apple Maps, text file export
  tour.js             Guided tour with demo data and keyboard nav
  utils.js            Formatting, toasts, focus trapping
  fallback.js         Graceful error if MapLibre fails to load
sw.js                 Service worker (cache-first for shell, network-first for APIs)
manifest.json         PWA manifest
tests/
  index.html          Browser-native test runner
  runner.js           Minimal describe/it/expect framework
  solver.test.js      TSP and clustering tests
  addresses.test.js   Address parsing tests
  utils.test.js       Formatting and haversine tests
```

## External Services

All free, no API keys:

| Service | Purpose |
|---------|---------|
| [OSRM Demo](https://router.project-osrm.org) | Driving route/table API |
| [routing.openstreetmap.de](https://routing.openstreetmap.de) | Bike and walk OSRM instances |
| [Photon](https://photon.komoot.io) | Primary geocoder |
| [US Census](https://geocoding.geo.census.gov) | US address fallback |
| [Nominatim](https://nominatim.openstreetmap.org) | Last-resort geocoder |
| [CARTO](https://basemaps.cartocdn.com) | Vector tile basemap |

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `H` | Set end point |
| `+` / `-` | Zoom |
| `1`–`9` | Switch route |
| `E` / `e` | Export text / Google Maps |
| `?` | Guided tour |
| `Esc` | Close / collapse |

## Limits

- Max 100 stops per session
- Geocoding requires a US state in each address
- OSRM demo servers may rate-limit; falls back to haversine estimates

## Browser Support

ES modules required: Chrome 80+, Firefox 78+, Safari 14+, Edge 80+.

## License

MIT
