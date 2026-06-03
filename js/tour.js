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
  {id: 8, street: '900 Innes Ave', city: 'San Francisco', state: 'CA', zip: '94124', lat: 37.7345, lng: -122.3720},
  {id: 9, street: '2801 Leavenworth St', city: 'San Francisco', state: 'CA', zip: '94133', lat: 37.8070, lng: -122.4187},
  {id: 10, street: '1 Sausalito Blvd', city: 'Sausalito', state: 'CA', zip: '94965', lat: 37.8590, lng: -122.4852},
  {id: 11, street: '100 Shoreline Hwy', city: 'Mill Valley', state: 'CA', zip: '94941', lat: 37.8830, lng: -122.5270},
  {id: 12, street: '501 Sir Francis Drake', city: 'San Anselmo', state: 'CA', zip: '94960', lat: 37.9746, lng: -122.5615},
  {id: 13, street: '800 Point San Pedro Rd', city: 'San Rafael', state: 'CA', zip: '94901', lat: 37.9952, lng: -122.4530},
  {id: 14, street: '2000 Larkspur Landing', city: 'Larkspur', state: 'CA', zip: '94939', lat: 37.9455, lng: -122.5090},
  {id: 15, street: '400 Oyster Point Blvd', city: 'South San Francisco', state: 'CA', zip: '94080', lat: 37.6640, lng: -122.3975},
  {id: 16, street: '1600 Bayshore Hwy', city: 'Burlingame', state: 'CA', zip: '94010', lat: 37.5930, lng: -122.3620},
  {id: 17, street: '250 Hamilton Ave', city: 'Palo Alto', state: 'CA', zip: '94301', lat: 37.4430, lng: -122.1610},
  {id: 18, street: '100 El Camino Real', city: 'Redwood City', state: 'CA', zip: '94063', lat: 37.4860, lng: -122.2280},
  {id: 19, street: '3251 Hanover St', city: 'Palo Alto', state: 'CA', zip: '94304', lat: 37.4170, lng: -122.1450},
  {id: 20, street: '1 Hacker Way', city: 'Menlo Park', state: 'CA', zip: '94025', lat: 37.4845, lng: -122.1477},
  {id: 21, street: '1600 Amphitheatre Pkwy', city: 'Mountain View', state: 'CA', zip: '94043', lat: 37.4220, lng: -122.0841},
  {id: 22, street: '1 Infinite Loop', city: 'Cupertino', state: 'CA', zip: '95014', lat: 37.3318, lng: -122.0312},
  {id: 23, street: '2855 Stevens Creek Blvd', city: 'Santa Clara', state: 'CA', zip: '95050', lat: 37.3240, lng: -121.9490},
  {id: 24, street: '200 Santa Row', city: 'San Jose', state: 'CA', zip: '95128', lat: 37.3210, lng: -121.9470},
  {id: 25, street: '750 The Alameda', city: 'San Jose', state: 'CA', zip: '95126', lat: 37.3330, lng: -121.9060},
  {id: 26, street: '5401 Bay St', city: 'Emeryville', state: 'CA', zip: '94608', lat: 37.8390, lng: -122.2960},
  {id: 27, street: '1 Telegraph Ave', city: 'Oakland', state: 'CA', zip: '94612', lat: 37.8115, lng: -122.2730},
  {id: 28, street: '6000 Shellmound St', city: 'Emeryville', state: 'CA', zip: '94608', lat: 37.8460, lng: -122.2930},
  {id: 29, street: '1955 Broadway', city: 'Oakland', state: 'CA', zip: '94612', lat: 37.8120, lng: -122.2660},
  {id: 30, street: '51 Moraga Way', city: 'Orinda', state: 'CA', zip: '94563', lat: 37.8780, lng: -122.1800}
];

const steps = [
  {
    id: 'welcome',
    title: 'Welcome to RouteFlow',
    body: 'RouteFlow optimizes multi-stop routes for deliveries, sales visits, or errands. Let\'s walk through the key features.',
    target: null,
    position: 'center'
  },
  {
    id: 'map',
    title: 'Your Route Map',
    body: 'Stops appear as numbered pins connected by route lines. You can zoom, pan, and click any stop for details — try it now!',
    target: null,
    position: 'center'
  },
  {
    id: 'import',
    title: 'Add Your Stops',
    body: 'Import addresses from a spreadsheet, paste a list, or type them one by one. RouteFlow automatically geocodes and plots them.',
    target: () => document.getElementById('manageStopsBtn') || document.getElementById('emptyImportBtn'),
    position: 'left'
  },
  {
    id: 'travelmode',
    title: 'Choose Travel Mode',
    body: 'Switch between driving, biking, or walking. Route times and distances recalculate instantly for each mode.',
    target: () => document.getElementById('travelModeBar'),
    position: () => window.innerWidth < 768 ? 'top' : 'left'
  },
  {
    id: 'cluster',
    title: 'Split Into Multiple Routes',
    body: 'Drag the slider to split your stops into color-coded route clusters by area. The demo has 30 stops split into 3 routes — try adjusting it!',
    target: () => document.querySelector('.cluster-card'),
    position: 'bottom'
  },
  {
    id: 'panel',
    title: 'Stop List & Progress',
    body: 'Your stops are listed in optimized order. Tap the circle to mark a stop complete. Use the search bar to find specific addresses.',
    target: () => window.innerWidth < 768 ? document.getElementById('mobileNavPlan') : document.getElementById('bottomSheet'),
    position: () => window.innerWidth < 768 ? 'top' : 'left'
  },
  {
    id: 'navigate',
    title: 'Export & Navigate',
    body: 'Send your optimized route to Google Maps or Apple Maps for turn-by-turn navigation with one tap.',
    target: () => document.getElementById('gmapsExportCard') || document.getElementById('gmapsFullRouteBtn'),
    position: () => window.innerWidth < 768 ? 'top' : 'left'
  },
  {
    id: 'done',
    title: 'You\'re All Set!',
    body: 'Keyboard shortcuts: H = set end point, +/− = zoom, 1–9 = switch routes, ? = replay this tour anytime. The demo data will clear when you close this.',
    target: null,
    position: 'center'
  }
];

let currentStep = 0;
let tooltip = null;
let highlightedEl = null;
let isActive = false;
let savedSpots = null;
let savedVisited = null;
let savedNumClusters = 1;
let savedStartPoint = null;
let savedHome = null;
let resizeHandler = null;
let keyHandler = null;
let renderCallback = null;

function loadDemoData(renderFn) {
  savedSpots = state.SPOTS.length ? [...state.SPOTS] : null;
  savedVisited = new Set(state.visitedSet);
  savedNumClusters = state.numClusters;
  savedStartPoint = state.startPoint;
  savedHome = state.home;
  state.SPOTS = DEMO_SPOTS.map(s => ({...s}));
  state.visitedSet = new Set([1, 5, 9, 15, 22]);
  state.startPoint = {lat: DEMO_SPOTS[0].lat, lng: DEMO_SPOTS[0].lng, label: DEMO_SPOTS[0].street};
  state.home = {lat: DEMO_SPOTS[29].lat, lng: DEMO_SPOTS[29].lng, label: DEMO_SPOTS[29].street};
  state.durationMatrix = null;
  state.currentRoutes = [];
  state.numClusters = 3;
  state.activeFilter = -1;
  const slider = document.getElementById('clusterSlider');
  if (slider) { slider.max = 10; slider.value = 3; }
  const sliderVal = document.getElementById('clusterVal');
  if (sliderVal) sliderVal.textContent = '3';
  renderFn();
  setTimeout(() => {
    fitBounds(DEMO_SPOTS.map(s => [s.lat, s.lng]), {padding: [80, 80]});
  }, 400);
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
  state.numClusters = savedNumClusters;
  state.startPoint = savedStartPoint;
  state.home = savedHome;
  const slider = document.getElementById('clusterSlider');
  if (slider) { slider.value = savedNumClusters; }
  const sliderVal = document.getElementById('clusterVal');
  if (sliderVal) sliderVal.textContent = String(savedNumClusters);
  savedSpots = null;
  savedVisited = null;
  savedStartPoint = null;
  savedHome = null;
  renderFn();
}

function clearHighlight() {
  if (highlightedEl) {
    highlightedEl.classList.remove('tour-highlight');
    highlightedEl = null;
  }
}

function destroy() {
  clearHighlight();
  if (tooltip) { tooltip.remove(); tooltip = null; }
  if (resizeHandler) { window.removeEventListener('resize', resizeHandler); resizeHandler = null; }
  if (keyHandler) { document.removeEventListener('keydown', keyHandler); keyHandler = null; }
  isActive = false;
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

  if (!target || position === 'center') {
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

  let top = '', left = '';

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

  clearHighlight();
  if (target && target.offsetParent !== null) {
    target.classList.add('tour-highlight');
    highlightedEl = target;
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
        ${isFirst ? `<button class="tour-btn tour-btn-skip">Skip Tour</button>` : `<button class="tour-btn tour-btn-back">&larr; Back</button>`}
        <button class="tour-btn tour-btn-next">${isLast ? 'Finish' : 'Next &rarr;'}</button>
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

  tooltip = document.createElement('div');
  tooltip.className = 'tour-tooltip';
  document.body.appendChild(tooltip);

  if (renderFn) {
    loadDemoData(renderFn);
    setTimeout(() => showStep(), 800);
  } else {
    showStep();
  }

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
