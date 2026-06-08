import { map } from './map.js';
import { renderView } from './ui.js';

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

function basemapStyleFor(dark) {
  return dark
    ? 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json'
    : 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json';
}

function syncIcon(btn) {
  const icon = btn.querySelector('#themeIcon');
  if (!icon) return;
  const dark = isDark();
  // Per spec: moon when currently dark, sun when currently light.
  icon.innerHTML = dark ? MOON_SVG : SUN_SVG;
  btn.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
  btn.setAttribute('title', dark ? 'Switch to light mode' : 'Switch to dark mode');
}

function applyMapStyle(renderFn) {
  try {
    map.setStyle(basemapStyleFor(isDark()));
    if (renderFn) map.once('style.load', renderFn);
  } catch {}
}

export function initTheme() {
  const btn = document.getElementById('themeToggleBtn');
  if (!btn) return;
  syncIcon(btn);

  btn.addEventListener('click', () => {
    const next = isDark() ? 'light' : 'dark';
    saveOverride(next);
    document.documentElement.setAttribute('data-theme', next);
    syncIcon(btn);
    applyMapStyle(() => renderView());
  });

  // Re-render the icon when the OS theme changes and no override is set.
  if (window.matchMedia) {
    const mq = window.matchMedia('(prefers-color-scheme:dark)');
    const onChange = () => { if (!loadOverride()) syncIcon(btn); };
    if (mq.addEventListener) mq.addEventListener('change', onChange);
    else if (mq.addListener) mq.addListener(onChange);
  }
}
