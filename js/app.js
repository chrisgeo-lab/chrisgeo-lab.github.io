import { render } from './ui.js';
import { initBootstrap } from './bootstrap.js';
import { initWiring } from './wiring.js';
import { initSheet } from './sheet.js';
import { initGeolocation } from './geolocation.js';
import { initTheme } from './theme.js';
import { startTour, shouldShowTour, resetTour } from './tour.js';
import { TOUR_AUTOSTART_DELAY_MS } from './constants.js';
import { checkVersionAndClear } from './version-check.js';

// Clear storage if version changed (prevents stale data bugs across deployments)
checkVersionAndClear();

initBootstrap();
initWiring();
initSheet();
initTheme();
initGeolocation(render);
render();

if (shouldShowTour()) {
  setTimeout(() => startTour(render), TOUR_AUTOSTART_DELAY_MS);
}

// Console-accessible tour replay for support/debugging.
window.resetTour = () => { resetTour(); startTour(render); };
