import { loadDemo } from './demo.js';

const TOUR_KEY = 'routeflow-tour-complete';

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
    body: 'Keyboard shortcuts: H = set end point, +/− = zoom, 1–9 = switch routes, ? = replay this tour anytime. The demo data stays loaded — clear it any time from the address manager.',
    target: null,
    position: 'center'
  }
];

let currentStep = 0;
let tooltip = null;
let backdrop = null;       // SVG overlay that dims the page with a punched hole
let spotlight = null;      // pulsing ring around target
let highlightedEl = null;
let isActive = false;
let resizeHandler = null;
let keyHandler = null;
let scrollHandler = null;
let renderCallback = null;
let pendingRaf = null;

function clearHighlight() {
  if (highlightedEl) {
    highlightedEl.classList.remove('tour-highlight');
    highlightedEl = null;
  }
  if (spotlight) {
    spotlight.style.opacity = '0';
  }
}

function destroy() {
  clearHighlight();
  if (tooltip) {
    tooltip.classList.remove('visible');
    const t = tooltip; tooltip = null;
    setTimeout(() => { try { t.remove(); } catch {} }, 220);
  }
  if (backdrop) {
    backdrop.classList.remove('visible');
    const b = backdrop; backdrop = null;
    setTimeout(() => { try { b.remove(); } catch {} }, 240);
  }
  if (spotlight) {
    const s = spotlight; spotlight = null;
    setTimeout(() => { try { s.remove(); } catch {} }, 240);
  }
  if (resizeHandler) { window.removeEventListener('resize', resizeHandler); resizeHandler = null; }
  if (scrollHandler) { window.removeEventListener('scroll', scrollHandler, true); scrollHandler = null; }
  if (keyHandler) { document.removeEventListener('keydown', keyHandler); keyHandler = null; }
  if (pendingRaf) { cancelAnimationFrame(pendingRaf); pendingRaf = null; }
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
  // Keep the demo dataset visible after the tour ends so users have something
  // to play with — they can wipe it via the "Reset all stops" action.
  // demoMode flag stays true so planner continues to use synthetic geometry
  // for these placeholder coords (no OSRM round-trip needed).
  try { localStorage.setItem(TOUR_KEY, '1'); } catch {}
  if (renderCallback) {
    try { renderCallback(); } catch {}
  }
}

// Update the SVG mask so the dimmed backdrop has a "hole" cut out around
// the highlighted target. When there's no target, fade to a flat dim.
function updateBackdrop(rect) {
  if (!backdrop) return;
  const hole = backdrop.querySelector('.tour-backdrop-hole');
  if (!hole) return;
  if (!rect) {
    hole.setAttribute('opacity', '0');
    return;
  }
  const pad = 8;
  const x = Math.max(0, rect.left - pad);
  const y = Math.max(0, rect.top - pad);
  const w = rect.width + pad * 2;
  const h = rect.height + pad * 2;
  const r = Math.min(14, Math.min(w, h) / 4);
  hole.setAttribute('x', x);
  hole.setAttribute('y', y);
  hole.setAttribute('width', w);
  hole.setAttribute('height', h);
  hole.setAttribute('rx', r);
  hole.setAttribute('ry', r);
  hole.setAttribute('opacity', '1');
}

function updateSpotlight(rect) {
  if (!spotlight) return;
  if (!rect) { spotlight.style.opacity = '0'; return; }
  const pad = 8;
  spotlight.style.opacity = '1';
  spotlight.style.left = (rect.left - pad) + 'px';
  spotlight.style.top = (rect.top - pad) + 'px';
  spotlight.style.width = (rect.width + pad * 2) + 'px';
  spotlight.style.height = (rect.height + pad * 2) + 'px';
}

// Pick a position for the tooltip. Prefers given hint but flips when the
// tooltip would clip off-screen on that side. Also returns the side actually
// used so the caret can be drawn correctly.
function placeTooltip(target, preferred) {
  const margin = 16;
  const tw = Math.min(340, window.innerWidth - 32);
  tooltip.style.width = tw + 'px';

  if (!target || preferred === 'center') {
    tooltip.classList.add('tour-center');
    tooltip.style.top = '';
    tooltip.style.left = '';
    tooltip.style.bottom = '';
    tooltip.style.right = '';
    tooltip.dataset.side = 'center';
    return 'center';
  }
  tooltip.classList.remove('tour-center');

  const rect = target.getBoundingClientRect();
  const th = tooltip.offsetHeight || 220;
  const vw = window.innerWidth, vh = window.innerHeight;

  // Decide which side has room. Order of preference: requested side first,
  // then the side with the most space.
  const space = {
    top: rect.top - margin,
    bottom: vh - rect.bottom - margin,
    left: rect.left - margin,
    right: vw - rect.right - margin
  };
  const fits = {
    top: space.top >= th,
    bottom: space.bottom >= th,
    left: space.left >= tw,
    right: space.right >= tw
  };
  let side = preferred;
  if (!fits[side]) {
    const order = ['bottom', 'top', 'right', 'left'];
    side = order.find(s => fits[s]) || preferred;
  }

  let top, left;
  switch (side) {
    case 'left':
      top = clamp(rect.top + rect.height / 2 - th / 2, margin, vh - th - margin);
      left = rect.left - tw - margin;
      break;
    case 'right':
      top = clamp(rect.top + rect.height / 2 - th / 2, margin, vh - th - margin);
      left = rect.right + margin;
      break;
    case 'top':
      top = rect.top - th - margin;
      left = clamp(rect.left + rect.width / 2 - tw / 2, margin, vw - tw - margin);
      break;
    case 'bottom':
    default:
      top = rect.bottom + margin;
      left = clamp(rect.left + rect.width / 2 - tw / 2, margin, vw - tw - margin);
      side = 'bottom';
      break;
  }

  tooltip.style.top = top + 'px';
  tooltip.style.left = left + 'px';
  tooltip.style.bottom = '';
  tooltip.style.right = '';
  tooltip.dataset.side = side;

  // Position the caret to point at the target's center along the relevant edge.
  const caret = tooltip.querySelector('.tour-caret');
  if (caret) {
    if (side === 'top' || side === 'bottom') {
      const cx = clamp(rect.left + rect.width / 2 - left, 24, tw - 24);
      caret.style.left = cx + 'px';
      caret.style.top = '';
    } else if (side === 'left' || side === 'right') {
      const cy = clamp(rect.top + rect.height / 2 - top, 24, th - 24);
      caret.style.top = cy + 'px';
      caret.style.left = '';
    }
  }

  return side;
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function showStep() {
  const step = steps[currentStep];
  const target = step.target ? step.target() : null;
  const visible = !!(target && target.offsetParent !== null && target.getBoundingClientRect().width > 0);
  const position = typeof step.position === 'function' ? step.position() : step.position;

  clearHighlight();
  if (visible) {
    target.classList.add('tour-highlight');
    highlightedEl = target;
  }

  const isFirst = currentStep === 0;
  const isLast = currentStep === steps.length - 1;
  const progress = ((currentStep + 1) / steps.length) * 100;

  // Build progress dots
  const dots = steps.map((_, i) => {
    const cls = i < currentStep ? 'done' : (i === currentStep ? 'active' : '');
    return `<span class="tour-dot ${cls}" data-step="${i}" aria-label="Step ${i + 1}"></span>`;
  }).join('');

  tooltip.innerHTML = `
    <button class="tour-close" aria-label="Close tour">&times;</button>
    <div class="tour-caret" aria-hidden="true"></div>
    <div class="tour-progress"><div class="tour-progress-fill" style="width:${progress}%"></div></div>
    <div class="tour-tooltip-title">${step.title}</div>
    <div class="tour-tooltip-body">${step.body}</div>
    <div class="tour-tooltip-footer">
      <div class="tour-dots" role="tablist">${dots}</div>
      <div class="tour-actions">
        ${isFirst
          ? `<button class="tour-btn tour-btn-skip">Skip</button>`
          : `<button class="tour-btn tour-btn-back">Back</button>`}
        <button class="tour-btn tour-btn-next">${isLast ? 'Finish' : 'Next'}</button>
      </div>
    </div>`;

  tooltip.querySelector('.tour-btn-next').onclick = advance;
  tooltip.querySelector('.tour-close').onclick = complete;
  if (isFirst) tooltip.querySelector('.tour-btn-skip').onclick = complete;
  else tooltip.querySelector('.tour-btn-back').onclick = goBack;
  // Click any dot to jump
  tooltip.querySelectorAll('.tour-dot').forEach(d => {
    d.onclick = () => {
      const idx = parseInt(d.dataset.step, 10);
      if (Number.isFinite(idx) && idx !== currentStep) {
        currentStep = idx;
        showStep();
      }
    };
  });

  // Trigger fade-out then re-position then fade-in for a smooth transition.
  // Using rAF chains so the layout settles before measuring offsetHeight.
  tooltip.classList.remove('visible');
  if (pendingRaf) cancelAnimationFrame(pendingRaf);
  pendingRaf = requestAnimationFrame(() => {
    pendingRaf = requestAnimationFrame(() => {
      const rect = visible ? target.getBoundingClientRect() : null;
      updateBackdrop(rect);
      updateSpotlight(rect);
      placeTooltip(visible ? target : null, position);
      tooltip.classList.add('visible');
    });
  });
}

function buildBackdrop() {
  // Full-viewport SVG with a black mask. White pixels in the mask are kept
  // (dimmed area); the rect inside the mask is black, which "punches" a
  // transparent hole around the highlighted target.
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('class', 'tour-backdrop');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('preserveAspectRatio', 'none');

  const defs = document.createElementNS(svgNS, 'defs');
  const mask = document.createElementNS(svgNS, 'mask');
  mask.setAttribute('id', 'tour-backdrop-mask');
  const fullRect = document.createElementNS(svgNS, 'rect');
  fullRect.setAttribute('x', '0'); fullRect.setAttribute('y', '0');
  fullRect.setAttribute('width', '100%'); fullRect.setAttribute('height', '100%');
  fullRect.setAttribute('fill', 'white');
  const hole = document.createElementNS(svgNS, 'rect');
  hole.setAttribute('class', 'tour-backdrop-hole');
  hole.setAttribute('fill', 'black');
  hole.setAttribute('rx', '12'); hole.setAttribute('ry', '12');
  hole.setAttribute('opacity', '0');
  mask.appendChild(fullRect);
  mask.appendChild(hole);
  defs.appendChild(mask);
  svg.appendChild(defs);

  const dim = document.createElementNS(svgNS, 'rect');
  dim.setAttribute('x', '0'); dim.setAttribute('y', '0');
  dim.setAttribute('width', '100%'); dim.setAttribute('height', '100%');
  dim.setAttribute('fill', 'rgba(0,0,0,0.45)');
  dim.setAttribute('mask', 'url(#tour-backdrop-mask)');
  svg.appendChild(dim);
  return svg;
}

function buildSpotlight() {
  const el = document.createElement('div');
  el.className = 'tour-spotlight';
  el.setAttribute('aria-hidden', 'true');
  return el;
}

export function startTour(renderFn) {
  if (isActive) return;
  isActive = true;
  currentStep = 0;
  renderCallback = renderFn || null;

  backdrop = buildBackdrop();
  document.body.appendChild(backdrop);

  spotlight = buildSpotlight();
  document.body.appendChild(spotlight);

  tooltip = document.createElement('div');
  tooltip.className = 'tour-tooltip';
  tooltip.setAttribute('role', 'dialog');
  tooltip.setAttribute('aria-live', 'polite');
  document.body.appendChild(tooltip);

  // Fade backdrop in
  requestAnimationFrame(() => backdrop && backdrop.classList.add('visible'));

  if (renderFn) {
    loadDemo(renderFn);
    // Wait for one paint so the empty-state UI hides and target elements
    // (manageStopsBtn, travelModeBar, etc.) are in their populated layout.
    requestAnimationFrame(() => requestAnimationFrame(showStep));
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
  resizeHandler = () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { if (isActive) showStep(); }, 120);
  };
  window.addEventListener('resize', resizeHandler);

  // Reposition on scroll (e.g. bottom sheet) so the spotlight tracks the target.
  let scrollRaf = null;
  scrollHandler = () => {
    if (!isActive || !highlightedEl) return;
    if (scrollRaf) return;
    scrollRaf = requestAnimationFrame(() => {
      scrollRaf = null;
      const rect = highlightedEl.getBoundingClientRect();
      updateBackdrop(rect);
      updateSpotlight(rect);
      const pos = typeof steps[currentStep].position === 'function'
        ? steps[currentStep].position() : steps[currentStep].position;
      placeTooltip(highlightedEl, pos);
    });
  };
  window.addEventListener('scroll', scrollHandler, true);
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
