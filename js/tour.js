import { state } from './state.js';
import { fitBounds } from './map.js';

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
    body: 'Build multi-stop routes. Split them into groups, pick your travel mode, and go.',
    target: null,
    position: 'center'
  },
  {
    id: 'import',
    title: 'Import Your Stops',
    body: 'Add addresses from a file, paste them, or type them in. Partial addresses work too.',
    target: () => document.getElementById('manageStopsBtn') || document.getElementById('emptyImportBtn'),
    position: 'left'
  },
  {
    id: 'travelmode',
    title: 'Travel Mode',
    body: 'Pick driving, biking, or walking. Times and distances update automatically.',
    target: () => document.getElementById('travelModeBar'),
    position: () => window.innerWidth < 768 ? 'top' : 'left'
  },
  {
    id: 'cluster',
    title: 'Split Into Routes',
    body: 'Drag the slider to split stops into separate routes by area.',
    target: () => document.querySelector('.cluster-card'),
    position: 'bottom'
  },
  {
    id: 'panel',
    title: 'Your Stop List',
    body: 'Listed in route order. Tap to see on map, check off when done.',
    target: () => window.innerWidth < 768 ? document.getElementById('mobileNavPlan') : document.getElementById('bottomSheet'),
    position: () => window.innerWidth < 768 ? 'top' : 'left'
  },
  {
    id: 'navigate',
    title: 'Navigate',
    body: 'Send your route to Google Maps or Apple Maps for directions.',
    target: () => document.getElementById('gmapsExportCard') || document.getElementById('gmapsFullRouteBtn'),
    position: () => window.innerWidth < 768 ? 'top' : 'left'
  },
  {
    id: 'done',
    title: 'You\'re Set',
    body: 'Shortcuts: H = end point, +/− = zoom, 1–9 = switch routes, ? = replay tour.',
    target: null,
    position: 'center'
  }
];

let currentStep = 0;
let overlay = null;
let tooltip = null;
let isActive = false;
let savedSpots = null;
let savedVisited = null;
let resizeHandler = null;
let keyHandler = null;
let renderCallback = null;

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
  setTimeout(() => {
    fitBounds(DEMO_SPOTS.map(s => [s.lat, s.lng]), {padding: [80, 80]});
  }, 100);
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
  overlay.innerHTML = `<svg class="tour-overlay-svg" width="100%" height="100%">
    <defs><mask id="tour-mask">
      <rect x="0" y="0" width="100%" height="100%" fill="white"/>
      <rect class="tour-cutout" rx="12" ry="12" fill="black"/>
    </mask></defs>
    <rect x="0" y="0" width="100%" height="100%" fill="rgba(0,0,0,0.55)" mask="url(#tour-mask)"/>
  </svg>`;
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
  if (keyHandler) { document.removeEventListener('keydown', keyHandler); keyHandler = null; }
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

function positionTooltip(target, position) {
  const tw = Math.min(320, window.innerWidth - 32);
  const margin = 16;
  tooltip.style.width = tw + 'px';

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
  const th = tooltip.offsetHeight || 200;

  let top = '', left = '', bottom = '';

  switch (position) {
    case 'left': {
      top = Math.max(margin, Math.min(rect.top, window.innerHeight - th - margin));
      left = rect.left - tw - margin;
      if (left < margin) {
        left = margin;
        top = rect.bottom + margin;
      }
      break;
    }
    case 'right': {
      top = Math.max(margin, Math.min(rect.top, window.innerHeight - th - margin));
      left = rect.right + margin;
      if (left + tw > window.innerWidth - margin) {
        left = margin;
        top = rect.bottom + margin;
      }
      break;
    }
    case 'top': {
      left = Math.max(margin, Math.min(rect.left, window.innerWidth - tw - margin));
      const bottomVal = window.innerHeight - rect.top + margin;
      tooltip.style.top = '';
      tooltip.style.left = left + 'px';
      tooltip.style.bottom = bottomVal + 'px';
      tooltip.style.right = '';
      return;
    }
    case 'bottom':
    default: {
      top = rect.bottom + margin;
      left = Math.max(margin, Math.min(rect.left, window.innerWidth - tw - margin));
      break;
    }
  }

  tooltip.style.top = top + 'px';
  tooltip.style.left = left + 'px';
  tooltip.style.bottom = '';
  tooltip.style.right = '';
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

  const isFirst = currentStep === 0;
  const isLast = currentStep === steps.length - 1;
  const progress = ((currentStep + 1) / steps.length) * 100;

  tooltip.innerHTML = `
    <div class="tour-progress"><div class="tour-progress-fill" style="width:${progress}%"></div></div>
    <div class="tour-tooltip-title">${step.title}</div>
    <div class="tour-tooltip-body">${step.body}</div>
    <div class="tour-tooltip-footer">
      <div class="tour-step-count">${currentStep + 1} / ${steps.length}</div>
      <div class="tour-actions">
        ${isFirst ? `<button class="tour-btn tour-btn-skip">Skip</button>` : `<button class="tour-btn tour-btn-back">Back</button>`}
        <button class="tour-btn tour-btn-next">${isLast ? 'Done' : 'Next'}</button>
      </div>
    </div>`;

  tooltip.querySelector('.tour-btn-next').onclick = advance;
  if (isFirst) tooltip.querySelector('.tour-btn-skip').onclick = complete;
  else tooltip.querySelector('.tour-btn-back').onclick = goBack;

  tooltip.className = 'tour-tooltip';
  requestAnimationFrame(() => {
    tooltip.classList.add('visible');
    positionTooltip(target, position);
  });
}

export function startTour(renderFn) {
  if (isActive) return;
  isActive = true;
  currentStep = 0;
  renderCallback = renderFn || null;
  document.body.classList.add('tour-active');
  createOverlay();

  if (renderFn) loadDemoData(renderFn);

  showStep();

  keyHandler = (e) => {
    if (!isActive) return;
    if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); advance(); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); goBack(); }
    else if (e.key === 'Escape') { e.preventDefault(); complete(); }
  };
  document.addEventListener('keydown', keyHandler);

  let resizeTimer = null;
  resizeHandler = () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => { if (isActive) showStep(); }, 150); };
  window.addEventListener('resize', resizeHandler);
}

export function shouldShowTour() {
  try { return !localStorage.getItem(TOUR_KEY); } catch { return false; }
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
