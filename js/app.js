import { render } from './ui.js';
import { initBootstrap } from './bootstrap.js';
import { initWiring } from './wiring.js';
import { initSheet } from './sheet.js';
import { initGeolocation } from './geolocation.js';
import { startTour, shouldShowTour, resetTour } from './tour.js';
import { TOUR_AUTOSTART_DELAY_MS } from './constants.js';

initBootstrap();
initWiring();
initSheet();
initGeolocation(render);
render();

if (shouldShowTour()) {
  setTimeout(() => startTour(render), TOUR_AUTOSTART_DELAY_MS);
}

// Console-accessible tour replay for support/debugging.
window.resetTour = () => { resetTour(); startTour(render); };
