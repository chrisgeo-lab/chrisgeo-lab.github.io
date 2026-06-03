import { state } from './state.js';
import { map } from './map.js';

const TOUR_KEY = 'routeflow-tour-complete';

const DEMO_SPOTS = [
  {id: 1, street: '1 Ferry Building', city: 'San Francisco', state: 'CA', zip: '94111', lat: 37.7955, lng: -122.3937},
  {id: 2, street: '3251 20th Ave', city: 'San Francisco', state: 'CA', zip: '94132', lat: 37.7295, lng: -122.4780},
  {id: 3, street: '501 Stanyan St', city: 'San Francisco', state: 'CA', zip: '94117', lat: 37.7694, lng: -122.4528},
  {id: 4, street: '2 Marina Blvd', city: 'San Francisco', state: 'CA', zip: '94123', lat: 37.8066, lng: -122.4364},
  {id: 5, street: '600 Montgomery St', city: 'San Francisco', state: 'CA', zip: '94111', lat: 37.7952, lng: -122.4028},
  {id: 6, street: '55 Music Concourse Dr', city: 'San Francisco', state: 'CA', zip: '94118', lat: 37.7706, lng: -122.4669},
  {id: 7, street: '1 Warriors Way', city: 'San Francisco', state: 'CA', zip: '94158', lat: 37.7680, lng: -122.3877},
  {id: 8, street: '900 Innes Ave', city: 'San Francisco', state: 'CA', zip: '94124', lat: 37.7345, lng: -122.3720}
];

const steps = [
  {
    id: 'welcome',
    title: 'Welcome to RouteFlow',
    body: 'Plan optimized multi-stop routes with smart clustering, multiple travel modes, and 3D map views. We\'ve loaded sample Bay Area stops so you can explore.',
    target: null,
    position: 'center',
    icon: '\u{1F5FA}️'
  },
  {
    id: 'import',
    title: 'Import Your Stops',
    body: 'Add addresses by importing CSV/Excel files, pasting a list, or typing one at a time. Multi-provider geocoding handles fuzzy or incomplete addresses.',
    target: () => document.getElementById('manageStopsBtn') || document.getElementById('emptyImportBtn'),
    position: 'left',
    icon: '\u{1F4CD}'
  },
  {
    id: 'travelmode',
    title: 'Choose How You Travel',
    body: 'Switch between driving, cycling, and walking. Routes are re-optimized for each mode with accurate travel times from OpenStreetMap.',
    target: () => document.getElementById('travelModeBar'),
    position: () => window.innerWidth < 768 ? 'top' : 'left',
    icon: '\u{1F697}'
  },
  {
    id: 'cluster',
    title: 'Split Into Routes',
    body: 'Too many stops for one trip? Drag the slider to split into multiple optimized routes using geographic clustering.',
    target: () => document.querySelector('.cluster-card'),
    position: 'bottom',
    icon: '\u{1F504}'
  },
  {
    id: 'panel',
    title: 'Your Stop List',
    body: 'Stops are listed in optimized order. Tap any stop to see it on the map, or check it off as you complete it to track progress.',
    target: () => window.innerWidth < 768 ? document.getElementById('mobileNavPlan') : document.getElementById('bottomSheet'),
    position: () => window.innerWidth < 768 ? 'top' : 'left',
    icon: '\u{1F4CB}'
  },
  {
    id: 'export',
    title: 'Navigate with Google or Apple Maps',
    body: 'Export your optimized route directly to Google Maps or Apple Maps for turn-by-turn navigation, or download as a shareable text file.',
    target: () => document.getElementById('exportBtn'),
    position: 'left',
    icon: '\u{1F4E4}'
  },
  {
    id: 'shortcuts',
    title: 'You\'re All Set!',
    body: 'Keyboard shortcuts: H for end point, +/− to zoom, 1–9 to switch routes, Esc to close. The app works fully offline once loaded. Enjoy!',
    target: null,
    position: 'center',
    icon: '⚡'
  }
];

let currentStep = 0;
let overlay = null;
let tooltip = null;
let isActive = false;
let savedSpots = null;
let savedVisited = null;

function loadDemoData(renderFn) {
  savedSpots = state.SPOTS.length ? [...state.SPOTS] : null;
  savedVisited = new Set(state.visitedSet);
  state.SPOTS = DEMO_SPOTS;
  state.visitedSet = new Set([1, 5]);
  state.durationMatrix = null;
  state.currentRoutes = [];
  state.numClusters = 1;
  state.activeFilter = -1;
  renderFn();
  const bounds = DEMO_SPOTS.map(s => [s.lat, s.lng]);
  map.fitBounds(bounds, {padding: [80, 80]});
}

function restoreData(renderFn) {
  if (savedSpots !== null) {
    state.SPOTS = savedSpots;
    state.visitedSet = savedVisited;
  } else {
    state.SPOTS = [];
    state.visitedSet = new Set();
  }
  state.durationMatrix = null;
  state.currentRoutes = [];
  savedSpots = null;
  savedVisited = null;
  renderFn();
}

function createOverlay() {
  overlay = document.createElement('div');
  overlay.className = 'tour-overlay';
  overlay.innerHTML = '<svg class="tour-overlay-svg" width="100%" height="100%"><defs><mask id="tour-mask"><rect x="0" y="0" width="100%" height="100%" fill="white"/><rect class="tour-cutout" rx="12" ry="12" fill="black"/></mask></defs><rect x="0" y="0" width="100%" height="100%" fill="rgba(0,0,0,0.6)" mask="url(#tour-mask)"/></svg>';
  document.body.appendChild(overlay);

  tooltip = document.createElement('div');
  tooltip.className = 'tour-tooltip';
  document.body.appendChild(tooltip);

  overlay.addEventListener('click', e => {
    if (e.target === overlay || e.target.closest('.tour-overlay-svg')) advance();
  });
}

function destroy() {
  if (overlay) { overlay.remove(); overlay = null; }
  if (tooltip) { tooltip.remove(); tooltip = null; }
  if (resizeHandler) { window.removeEventListener('resize', resizeHandler); resizeHandler = null; }
  isActive = false;
  document.body.classList.remove('tour-active');
}

function advance() {
  if (currentStep < steps.length - 1) {
    currentStep++;
    showStep();
  } else {
    complete();
  }
}

function goBack() {
  if (currentStep > 0) {
    currentStep--;
    showStep();
  }
}

function complete() {
  destroy();
  if (savedSpots !== null && renderCallback) restoreData(renderCallback);
  try { localStorage.setItem(TOUR_KEY, '1'); } catch {}
}

function showStep() {
  const step = steps[currentStep];
  const target = step.target ? step.target() : null;
  const position = typeof step.position === 'function' ? step.position() : step.position;
  const cutout = overlay.querySelector('.tour-cutout');

  if (target && target.offsetParent !== null) {
    const rect = target.getBoundingClientRect();
    const pad = 8;
    cutout.setAttribute('x', rect.left - pad);
    cutout.setAttribute('y', rect.top - pad);
    cutout.setAttribute('width', rect.width + pad * 2);
    cutout.setAttribute('height', rect.height + pad * 2);
    cutout.style.display = '';
  } else {
    cutout.style.display = 'none';
  }

  const dots = steps.map((_, i) =>
    `<span class="tour-dot${i === currentStep ? ' active' : ''}"></span>`
  ).join('');

  const isFirst = currentStep === 0;
  const isLast = currentStep === steps.length - 1;

  tooltip.innerHTML = `
    <div class="tour-tooltip-icon">${step.icon}</div>
    <div class="tour-tooltip-title">${step.title}</div>
    <div class="tour-tooltip-body">${step.body}</div>
    <div class="tour-tooltip-footer">
      <div class="tour-dots">${dots}</div>
      <div class="tour-actions">
        ${isFirst ? `<button class="tour-btn tour-btn-skip" onclick="window._tourSkip()">Skip</button>` : `<button class="tour-btn tour-btn-back" onclick="window._tourBack()">Back</button>`}
        <button class="tour-btn tour-btn-next" onclick="window._tourNext()">${isLast ? 'Get Started' : 'Next'}</button>
      </div>
    </div>
    <div class="tour-step-count">${currentStep + 1} of ${steps.length}</div>
  `;

  tooltip.className = 'tour-tooltip';
  tooltip.classList.add('visible');

  if (!target || !target.offsetParent) {
    tooltip.classList.add('tour-center');
    tooltip.style.top = '';
    tooltip.style.left = '';
    tooltip.style.bottom = '';
    tooltip.style.right = '';
    return;
  }

  tooltip.classList.remove('tour-center');
  const rect = target.getBoundingClientRect();
  const tw = 320;
  const margin = 16;

  tooltip.style.width = tw + 'px';

  switch (position) {
    case 'left':
      tooltip.style.top = Math.max(margin, rect.top) + 'px';
      tooltip.style.left = Math.max(margin, rect.left - tw - margin) + 'px';
      tooltip.style.right = '';
      tooltip.style.bottom = '';
      if (rect.left - tw - margin < margin) {
        tooltip.style.left = margin + 'px';
        tooltip.style.top = (rect.bottom + margin) + 'px';
      }
      break;
    case 'right':
      tooltip.style.top = Math.max(margin, rect.top) + 'px';
      tooltip.style.left = (rect.right + margin) + 'px';
      tooltip.style.right = '';
      tooltip.style.bottom = '';
      break;
    case 'top':
      tooltip.style.left = Math.max(margin, Math.min(rect.left, window.innerWidth - tw - margin)) + 'px';
      tooltip.style.bottom = (window.innerHeight - rect.top + margin) + 'px';
      tooltip.style.top = '';
      tooltip.style.right = '';
      break;
    case 'bottom':
    default:
      tooltip.style.left = Math.max(margin, Math.min(rect.left, window.innerWidth - tw - margin)) + 'px';
      tooltip.style.top = (rect.bottom + margin) + 'px';
      tooltip.style.right = '';
      tooltip.style.bottom = '';
      break;
  }
}

let resizeHandler = null;
let renderCallback = null;

export function startTour(renderFn) {
  if (isActive) return;
  isActive = true;
  currentStep = 0;
  renderCallback = renderFn || null;
  document.body.classList.add('tour-active');
  createOverlay();

  if (renderFn) loadDemoData(renderFn);

  showStep();

  window._tourNext = advance;
  window._tourBack = goBack;
  window._tourSkip = complete;

  resizeHandler = () => { if (isActive) showStep(); };
  window.addEventListener('resize', resizeHandler);
}

export function shouldShowTour() {
  try {
    return !localStorage.getItem(TOUR_KEY);
  } catch { return false; }
}

export function resetTour() {
  try { localStorage.removeItem(TOUR_KEY); } catch {}
}

export function dismissTour() {
  if (isActive) complete();
}

export function isTourActive() {
  return isActive;
}
