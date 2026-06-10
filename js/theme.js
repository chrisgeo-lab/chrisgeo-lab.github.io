import { map } from './map.js';

const STORE_KEY = 'routeflow-theme';
const SUN_SVG = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>';
const MOON_SVG = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79z"/></svg>';

function systemPrefersDark() {
  return window.matchMedia && window.matchMedia('(prefers-color-scheme:dark)').matches;
}

function loadOverride() {
  try { return localStorage.getItem(STORE_KEY); } catch { return null; }
}

function saveOverride(value) {
  try {
    if (value) localStorage.setItem(STORE_KEY, value);
    else localStorage.removeItem(STORE_KEY);
  } catch {}
}

function isDark() {
  const override = loadOverride();
  if (override === 'dark') return true;
  if (override === 'light') return false;
  return systemPrefersDark();
}

// Read --theme-transition-duration once on demand. Returns ms.
// Falls back to 550 if the var is missing or unparseable.
function themeTransitionMs() {
  try {
    const raw = getComputedStyle(document.documentElement)
      .getPropertyValue('--theme-transition-duration').trim();
    if (raw.endsWith('ms')) return parseFloat(raw) || 550;
    if (raw.endsWith('s')) return (parseFloat(raw) || 0.55) * 1000;
  } catch {}
  return 550;
}

function prefersReducedMotion() {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
  catch { return false; }
}

function basemapStyleFor(dark) {
  return dark
    ? 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json'
    : 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json';
}

function syncIcon(btn) {
  const icon = btn.querySelector('#themeIcon');
  if (!icon) return;
  const dark = isDark();
  icon.innerHTML = dark ? MOON_SVG : SUN_SVG;
  btn.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
  btn.setAttribute('title', dark ? 'Switch to light mode' : 'Switch to dark mode');
}

// Clone the live WebGL canvas into a 2D-context canvas using drawImage. This
// is near-instant (no PNG encode like toDataURL) and produces a stable raster
// we can sit on top of the map while the basemap reloads underneath.
function snapshotMapOverlay() {
  const container = document.getElementById('map');
  const liveCanvas = map.getCanvas && map.getCanvas();
  if (!container || !liveCanvas) return null;
  const w = liveCanvas.width;
  const h = liveCanvas.height;
  if (!w || !h) return null;

  const snap = document.createElement('canvas');
  snap.width = w;
  snap.height = h;
  const ctx = snap.getContext('2d');
  try { ctx.drawImage(liveCanvas, 0, 0); }
  catch { return null; }

  snap.className = 'theme-map-snapshot';
  // Sit on top of the map but below markers (z-index:3) and UI chrome.
  // Duration + easing MUST match --theme-transition-duration in base.css so
  // the snapshot fade and the chrome variable transitions resolve together
  // as a single unified crossfade.
  const ms = prefersReducedMotion() ? 80 : themeTransitionMs();
  snap.style.cssText = [
    'position:absolute', 'inset:0',
    'width:100%', 'height:100%',
    'pointer-events:none',
    'z-index:2',
    'opacity:1',
    `transition:opacity ${ms}ms cubic-bezier(.33,0,.2,1)`,
    'will-change:opacity'
  ].join(';');
  container.appendChild(snap);
  return snap;
}

function fadeAndRemoveOverlay(overlay) {
  if (!overlay) return;
  void overlay.offsetWidth; // flush layout so the transition runs
  overlay.style.opacity = '0';
  const cleanup = () => { if (overlay.parentNode) overlay.remove(); };
  overlay.addEventListener('transitionend', cleanup, {once: true});
  // Slight margin past the transition duration.
  const ms = prefersReducedMotion() ? 80 : themeTransitionMs();
  setTimeout(cleanup, ms + 300);
}

// Wait until MapLibre is fully idle (all tiles loaded, no pending fades). This
// is the right signal — `style.load` fires before tiles have arrived, which is
// why the old timer-based approach kept flashing a half-painted basemap.
function waitForIdle(maxWaitMs) {
  return new Promise(resolve => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      map.off('idle', finish);
      resolve();
    };
    map.once('idle', finish);
    setTimeout(finish, maxWaitMs);
  });
}

let pending = false;

async function runThemeSwap(nextDark, applyTheme) {
  if (pending) return;
  pending = true;
  const root = document.documentElement;

  // Snapshot the current map BEFORE anything changes. The chrome stays in
  // the OLD theme until the new basemap has finished tiling — both the
  // hidden map and the visible chrome flip in the same frame at the end so
  // panel, legend, top bar, and basemap all arrive together.
  const overlay = snapshotMapOverlay();

  // Pre-arm the cross-surface CSS transition so when the variables flip in
  // a moment, every glass surface eases instead of jumping.
  root.classList.add('theme-transitioning');

  // Kick the basemap swap immediately, requesting the NEW theme's style.
  // The new basemap loads UNDERNEATH the snapshot — invisible — while the
  // chrome remains in the old theme.
  try { map.setStyle(basemapStyleFor(nextDark), {diff: false}); } catch {}

  // Wait until the new basemap has finished tiling (or 1.4s ceiling), plus
  // one rAF so the new tiles are guaranteed to be on screen before we
  // reveal them.
  await waitForIdle(1400);
  await new Promise(r => requestAnimationFrame(r));

  // Single coordinated frame: flip the chrome CSS variables AND start
  // fading the snapshot in the same paint. --theme-transition-duration
  // matches the snapshot fade so chrome and map cross to the new theme
  // synchronously.
  applyTheme();
  fadeAndRemoveOverlay(overlay);

  // Lift the global transition class a hair after the fade completes so
  // the next interaction doesn't inherit a half-finished animation.
  const ms = prefersReducedMotion() ? 80 : themeTransitionMs();
  setTimeout(() => { root.classList.remove('theme-transitioning'); pending = false; }, ms + 100);
}

export function initTheme() {
  const btn = document.getElementById('themeToggleBtn');
  if (!btn) return;
  syncIcon(btn);

  btn.addEventListener('click', () => {
    if (pending) return;
    const next = isDark() ? 'light' : 'dark';
    const nextDark = next === 'dark';
    runThemeSwap(nextDark, () => {
      saveOverride(next);
      document.documentElement.setAttribute('data-theme', next);
      syncIcon(btn);
    });
  });

  if (window.matchMedia) {
    const mq = window.matchMedia('(prefers-color-scheme:dark)');
    const onChange = () => { if (!loadOverride()) syncIcon(btn); };
    if (mq.addEventListener) mq.addEventListener('change', onChange);
    else if (mq.addListener) mq.addListener(onChange);
  }
}
