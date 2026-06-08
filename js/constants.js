// Tunables shared across modules. Centralized so behavior tuning lives in one place.

// Bottom-sheet drag controller.
export const SHEET_VELOCITY_THRESHOLD = 0.5;
export const SHEET_COLLAPSE_RATIO = 0.55;
export const SHEET_EXPAND_RATIO = 0.2;
export const SHEET_DRAG_MIN_Y = -10;

// App bootstrap.
export const LOADER_TIMEOUT_MS = 5000;
export const LOADER_FADE_MS = 500;
export const TOUR_AUTOSTART_DELAY_MS = 1200;

// UI debouncing / breakpoints.
export const SLIDER_DEBOUNCE_MS = 400;
export const MOBILE_BREAKPOINT_PX = 768;

// Geolocation.
export const GPS_TIMEOUT_MS = 10000;
export const GPS_SILENT_TIMEOUT_MS = 5000;
export const DEFAULT_ZOOM_FOR_GPS = 15;

// Routing fallback speeds (mph) per travel mode — used when OSRM is unavailable.
export const SPEED_MPH = {car: 25, bike: 10, walk: 3};

// Demo / tour fitBounds padding ([vertical, horizontal] in px).
export const DEMO_FIT_PADDING = [80, 80];
