# RouteFlow CSS Architecture

The CSS is split into 8 focused modules for maintainability. Total: 310 rules across ~60KB (minified).

## Modules

| File | Purpose | Lines | Key Components |
|------|---------|-------|----------------|
| **base.css** | CSS variables, resets, scrollbar, root/body | 60 | Custom properties (colors, fonts, shadows), box-sizing reset, dark mode |
| **map.css** | Map container, markers, controls, popups, GPS | 66 | #map, .maplibregl-*, .map-controls, .stop-popup, .gps-dot |
| **layout.css** | App structure: bars, sheet, mobile nav | 123 | .top-bar, .bottom-sheet, .mobile-nav, .cluster-card, .progress-bar |
| **components.css** | Reusable UI elements | 300 | Cards, buttons, badges, toasts, search, stops list, travel mode, route dropdown |
| **modals.css** | All modal overlays | 389 | .modal-overlay, point modals (start/end), address manager, fix-addr prompt |
| **tour.css** | Guided tour system | 172 | .tour-backdrop, .tour-spotlight, .tour-tooltip, progress dots, caret |
| **responsive.css** | Media queries | 211 | Desktop (≥768px), mobile (<768px), landscape, small screens |
| **loading.css** | App boot screen | 66 | .app-loading, spinner animation |

## Load Order (index.html)

```html
<link rel="stylesheet" href="css/base.css">      <!-- 1. Variables + resets -->
<link rel="stylesheet" href="css/map.css">       <!-- 2. Map foundation -->
<link rel="stylesheet" href="css/layout.css">    <!-- 3. App shell -->
<link rel="stylesheet" href="css/components.css"><!-- 4. UI elements -->
<link rel="stylesheet" href="css/modals.css">    <!-- 5. Overlays -->
<link rel="stylesheet" href="css/tour.css">      <!-- 6. Tour -->
<link rel="stylesheet" href="css/responsive.css"><!-- 7. Breakpoints -->
<link rel="stylesheet" href="css/loading.css">   <!-- 8. Boot screen -->
```

Order matters: base defines variables used everywhere; responsive overrides must come after layout/components.

## Working with Modules

- **Adding a new component**: → `components.css` (or create `css/feature-name.css` if >200 lines)
- **Adjusting mobile layout**: → `responsive.css` under `@media(max-width:767px)`
- **Tweaking colors/spacing**: → `base.css` CSS custom properties
- **Map-specific styles**: → `map.css`
- **Modal/overlay changes**: → `modals.css`

## Migrating from styles.css

The original monolithic `styles.css` (1356 lines) is preserved for reference but no longer loaded. All styles were migrated to the new modular structure with zero functional changes — just reorganization.

To fully remove the old file:
```bash
rm css/styles.css
```

## Performance Notes

- **HTTP/2 multiplexing**: 8 CSS files load in parallel with no perf penalty vs. 1 monolith
- **Service worker caching**: All CSS modules cached together (sw.js `STATIC_ASSETS`)
- **Minification**: Consider adding a build step (`cssnano`, `lightningcss`) before deploy for production

## Dark Mode

Handled entirely in `base.css` via CSS custom properties:
- `@media(prefers-color-scheme:dark)` for system preference
- `:root[data-theme="dark"]` for manual override
- `--bg`, `--card`, `--text`, `--secondary`, etc. cascade to all modules
