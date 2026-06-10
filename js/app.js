import { render } from './ui.js';
import { initBootstrap } from './bootstrap.js';
import { initWiring } from './wiring.js';
import { initSheet } from './sheet.js';
import { initGeolocation } from './geolocation.js';
import { initTheme } from './theme.js';
import { startTour, shouldShowTour, resetTour } from './tour.js';
import { TOUR_AUTOSTART_DELAY_MS } from './constants.js';
import { checkVersionAndClear } from './version-check.js';
import { applyShareFromHash } from './share.js';
import { toast } from './utils.js';

// Clear storage if version changed (prevents stale data bugs across deployments)
checkVersionAndClear();

// Apply a shared route from the URL before bootstrapping the UI so the first
// render reflects the incoming payload — otherwise we'd flash the receiver's
// existing route, then snap to the shared one.
const sharedApplied = applyShareFromHash();

initBootstrap();
initWiring();
initSheet();
initTheme();
initGeolocation(render);
render();
if (sharedApplied) toast('Loaded shared route');

// Skip the tour for users arriving via a share link — they came to view a
// specific route, not learn the app. The tour will still appear next visit
// if they haven't dismissed it.
if (!sharedApplied && shouldShowTour()) {
  setTimeout(() => startTour(render), TOUR_AUTOSTART_DELAY_MS);
}

// Console-accessible tour replay for support/debugging.
window.resetTour = () => { resetTour(); startTour(render); };
