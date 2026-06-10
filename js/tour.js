import { loadDemo, DEMO_SPOTS } from './demo.js';
import { state } from './state.js';
import { map, fitBounds, flyTo } from './map.js';
import { DEMO_FIT_PADDING } from './constants.js';
import { openQuickAdd, closeQuickAdd } from './quick-add.js';

const TOUR_KEY = 'routeflow-tour-complete';

const reducedMotion = () => {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
  catch { return false; }
};

const wait = (ms) => new Promise(r => setTimeout(r, ms));

// Minimum pause on every step before its cinematic starts auto-driving the
// UI. Long enough to read the card, short enough not to feel stalled. Steps
// that just settle the camera (welcome, navigate, done) don't need this —
// only steps that actually take over the screen.
const READ_PAUSE_MS = 3200;

// Cinematic context handed to each step's optional async hook.
// Best-effort: any throw inside a hook is swallowed so the user can still
// drive the tour forward.
const cinematicCtx = {
  map,
  reduced: reducedMotion,
  wait,
  flyTo(lat, lng, zoom = 12) {
    if (reducedMotion()) {
      try { map.jumpTo({center: [lng, lat], zoom}); } catch {}
    } else {
      try { flyTo(lat, lng, zoom); } catch {}
    }
  },
  fitDemo() {
    try {
      const pts = DEMO_SPOTS.map(s => [s.lat, s.lng]);
      fitBounds(pts, {padding: DEMO_FIT_PADDING});
    } catch {}
  },
  openStopPopup(spotId) {
    try {
      // Try the canonical event first (preferred path used by panel rows).
      document.dispatchEvent(new CustomEvent('routeflow:show-stop-popup', { detail: { spotId } }));
      // Fallback: directly click the marker DOM element if no popup shows up.
      // The registry-backed event only resolves if the marker was bound via
      // bindPopup() since the last render — for the tour we want a sure shot.
      setTimeout(() => {
        if (document.querySelector('.maplibregl-popup')) return;
        const markers = document.querySelectorAll('.marker-hit');
        // Demo spot ids are 1-indexed; pick the matching marker if available.
        const target = markers[spotId - 1] || markers[0];
        if (target) target.click();
      }, 80);
    } catch {}
  },
  // Programmatic click — bypasses backdrop pointer-events because
  // .click() dispatches directly to the element rather than hit-testing.
  click(selector) {
    try {
      const el = typeof selector === 'string' ? document.querySelector(selector) : selector;
      if (el && typeof el.click === 'function') el.click();
    } catch {}
  },
  setSliderValue(selector, value) {
    try {
      const el = typeof selector === 'string' ? document.querySelector(selector) : selector;
      if (!el) return;
      el.value = String(value);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    } catch {}
  },
  pulse(selector, ms = 1200) {
    if (reducedMotion()) return;
    try {
      const el = typeof selector === 'string' ? document.querySelector(selector) : selector;
      if (!el) return;
      el.classList.add('tour-pulse');
      setTimeout(() => el.classList.remove('tour-pulse'), ms);
    } catch {}
  },
  // Toggles a body class that:
  //   1) fades the tour card + halo to 0 (interaction is happening, get out of the way)
  //   2) elevates any open modal/popup/pill above the click-shield
  //   3) raises the click-shield above the modal so user input is blocked
  // Toggle ON before driving an interaction; toggle OFF when done so the
  // card and halo fade back in.
  setCinematicActive(on) {
    try { document.body.classList.toggle('tour-cinematic-active', !!on); } catch {}
  },
  openQuickAdd, closeQuickAdd
};

const steps = [
  {
    id: 'welcome',
    title: 'Plan a smarter route',
    body: "Drop in your stops and RouteFlow figures out the fastest order. Here's how it works.",
    target: null,
    position: 'center',
    cinematic: async (ctx) => { ctx.fitDemo(); }
  },
  {
    id: 'quickadd',
    title: 'Add a stop',
    body: "Hit <strong>+</strong> to type or paste an address. Pick a suggestion and it drops right on the map.",
    target: () => document.getElementById('addStopFab'),
    position: () => window.innerWidth < 768 ? 'top' : 'right',
    cinematic: async (ctx) => {
      ctx.flyTo(37.7790, -122.4194, 13);
      ctx.pulse('#addStopFab');
      // Hold on the card so the user can read it before the demo takes over.
      await ctx.wait(READ_PAUSE_MS);
      // Fade the card/halo, raise the shield, and elevate the pill above it.
      ctx.setCinematicActive(true);
      try { ctx.openQuickAdd(); } catch {}
      // Type a sample address so the suggestions list animates in.
      await ctx.wait(700);
      const input = document.getElementById('quickAddInput');
      if (input) {
        const sample = '1 Ferry Building, San Francisco';
        input.focus();
        let i = 0;
        const typeNext = () => {
          if (ctx.isStale && ctx.isStale()) return;
          if (i > sample.length) return;
          input.value = sample.slice(0, i++);
          input.dispatchEvent(new Event('input', { bubbles: true }));
          if (i <= sample.length) setTimeout(typeNext, 55);
        };
        typeNext();
      }
      await ctx.wait(2800);
      try { ctx.closeQuickAdd(); } catch {}
      ctx.setCinematicActive(false);
    }
  },
  {
    id: 'import',
    title: 'Bring a whole list',
    body: "Got a spreadsheet of addresses? Open <strong>Import Stops</strong> to paste them in or upload a CSV. They'll all land on the map at once.",
    target: () => document.getElementById('manageStopsBtn') || document.getElementById('emptyImportBtn'),
    position: 'left',
    cinematic: async (ctx) => {
      ctx.fitDemo();
      await ctx.wait(800);
      ctx.pulse('#manageStopsBtn');
    }
  },
  {
    id: 'travelmode',
    title: 'Drive, bike, or walk',
    body: "Pick how you're getting around. Times and distances update for whichever mode you choose.",
    target: () => document.getElementById('travelModeBar'),
    position: () => window.innerWidth < 768 ? 'top' : 'left',
    cinematic: async (ctx) => {
      ctx.pulse('#travelModeBar');
      // Read pause before the toggles start cycling on their own.
      await ctx.wait(READ_PAUSE_MS);
      const modes = ['bike', 'walk', 'car'];
      for (const mode of modes) {
        const btn = document.querySelector(`#travelModeBar [data-mode="${mode}"]`);
        if (btn) ctx.click(btn);
        await ctx.wait(1500);
      }
    }
  },
  {
    id: 'cluster',
    title: 'Split into multiple routes',
    body: "Got a lot of stops? Drag the slider to break them into separate routes by area. Each one gets its own color.",
    target: () => document.querySelector('.cluster-card'),
    position: 'bottom',
    cinematic: async (ctx) => {
      ctx.pulse('.cluster-card');
      const slider = document.getElementById('clusterSlider');
      if (!slider) return;
      // Read pause before the slider walks on its own.
      await ctx.wait(READ_PAUSE_MS);
      // Fade the card + halo + backdrop so the route recoloring is visible
      // across the whole map while the slider walks through values.
      ctx.setCinematicActive(true);
      ctx.setSliderValue('#clusterSlider', 1);
      await ctx.wait(1800);
      ctx.setSliderValue('#clusterSlider', 2);
      await ctx.wait(1800);
      ctx.setSliderValue('#clusterSlider', 3);
      await ctx.wait(1800);
      ctx.setSliderValue('#clusterSlider', 4);
      // Hold on the final state so the routes finish recoloring + re-routing
      // before we move to the next step. Routing requests need a beat.
      await ctx.wait(2800);
      ctx.setCinematicActive(false);
    }
  },
  {
    id: 'panel',
    title: 'Tap a pin',
    body: "Tap any stop to see its details and check it off when you're done. You can also move a stop to a different route right from there.",
    target: () => window.innerWidth < 768 ? document.getElementById('mobileNavPlan') : document.getElementById('bottomSheet'),
    position: () => window.innerWidth < 768 ? 'top' : 'left',
    cinematic: async (ctx) => {
      const sample = DEMO_SPOTS[4];
      if (!sample) return;
      // Read pause before the popup demo takes over the screen.
      await ctx.wait(READ_PAUSE_MS);
      // Fade card+halo, raise the shield, and elevate the popup above it.
      ctx.setCinematicActive(true);
      ctx.openStopPopup(sample.id);
      // Wait for popup to render before reaching into its DOM.
      await ctx.wait(1500);
      const trigger = document.querySelector('.stop-popup-move-trigger');
      if (trigger) ctx.click(trigger);
      await ctx.wait(1400);
      // Pick the first non-selected option to demo a reassignment.
      const items = document.querySelectorAll('.stop-popup-move-menu .route-dropdown-item');
      let chosen = null;
      for (const el of items) {
        if (!el.classList.contains('selected')) { chosen = el; break; }
      }
      if (chosen) {
        ctx.click(chosen);
        // Let the route recompute paint before we move on.
        await ctx.wait(2000);
      }
      ctx.setCinematicActive(false);
    }
  },
  {
    id: 'navigate',
    title: 'Take it on the road',
    body: "When you're ready to drive, send the route to Google Maps or Apple Maps for turn-by-turn directions.",
    target: () => document.getElementById('gmapsExportCard') || document.getElementById('gmapsFullRouteBtn'),
    position: () => window.innerWidth < 768 ? 'top' : 'left',
    cinematic: async (ctx) => { ctx.pulse('#gmapsExportCard'); }
  },
  {
    id: 'done',
    title: "That's it",
    body: "Hit <strong>?</strong> if you want to see this tour again. The demo stops are still there to play with. Clear them out in Import Stops whenever you're ready to add your own.",
    target: null,
    position: 'center',
    cinematic: async (ctx) => { ctx.fitDemo(); }
  }
];

let currentStep = 0;
let tooltip = null;
let backdrop = null;
let spotlight = null;
let clickShield = null;     // transparent overlay that blocks underlying user clicks
let highlightedEl = null;
let isActive = false;
let resizeHandler = null;
let keyHandler = null;
let scrollHandler = null;
let renderCallback = null;
let pendingRaf = null;
let cinematicToken = 0;

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
  if (clickShield) {
    const c = clickShield; clickShield = null;
    setTimeout(() => { try { c.remove(); } catch {} }, 240);
  }
  if (spotlight) {
    const s = spotlight; spotlight = null;
    setTimeout(() => { try { s.remove(); } catch {} }, 240);
  }
  if (resizeHandler) { window.removeEventListener('resize', resizeHandler); resizeHandler = null; }
  if (scrollHandler) { window.removeEventListener('scroll', scrollHandler, true); scrollHandler = null; }
  if (keyHandler) { document.removeEventListener('keydown', keyHandler); keyHandler = null; }
  if (pendingRaf) { cancelAnimationFrame(pendingRaf); pendingRaf = null; }
  cinematicToken++;
  document.body.classList.remove('tour-cinematic-active');
  document.body.classList.remove('tour-cinematic-running');
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
  // to play with. Real OSRM routing is already active.
  try { localStorage.setItem(TOUR_KEY, '1'); } catch {}
  if (renderCallback) {
    try { renderCallback(); } catch {}
  }
}

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

// Snap-set position with transitions disabled, then fade opacity in.
// Spotlight CSS only transitions opacity — left/top/width/height jump.
// This avoids the "ghost slide" between distant targets on step changes.
function updateSpotlight(rect) {
  if (!spotlight) return;
  if (!rect) { spotlight.style.opacity = '0'; return; }
  const pad = 8;
  spotlight.style.left = (rect.left - pad) + 'px';
  spotlight.style.top = (rect.top - pad) + 'px';
  spotlight.style.width = (rect.width + pad * 2) + 'px';
  spotlight.style.height = (rect.height + pad * 2) + 'px';
  // Force layout so the new position is committed before the opacity tween.
  void spotlight.offsetWidth;
  spotlight.style.opacity = '1';
}

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

  return side;
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function showStep() {
  const step = steps[currentStep];
  const target = step.target ? step.target() : null;
  const visible = !!(target && target.offsetParent !== null && target.getBoundingClientRect().width > 0);
  const position = typeof step.position === 'function' ? step.position() : step.position;

  // Reset cinematic locks so the step starts with the card+halo+backdrop
  // fully visible and Next/Back enabled. runCinematic adds them back if
  // this step has a hook.
  document.body.classList.remove('tour-cinematic-active');
  document.body.classList.remove('tour-cinematic-running');

  clearHighlight();
  if (visible) {
    target.classList.add('tour-highlight');
    highlightedEl = target;
  }

  const isFirst = currentStep === 0;
  const isLast = currentStep === steps.length - 1;

  const dots = steps.map((_, i) => {
    const cls = i < currentStep ? 'done' : (i === currentStep ? 'active' : '');
    return `<button class="tour-dot ${cls}" data-step="${i}" aria-label="Go to step ${i + 1}"></button>`;
  }).join('');

  const skipLabel = isFirst ? 'Skip tour' : 'Back';
  const skipClass = isFirst ? 'tour-btn-skip' : 'tour-btn-back';
  const nextLabel = isLast ? 'Done' : 'Next';

  tooltip.innerHTML = `
    <button class="tour-close" aria-label="Close tour"><svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><path d="M3 3l6 6M9 3l-6 6"/></svg></button>
    <div class="tour-tooltip-title">${step.title}</div>
    <div class="tour-tooltip-body">${step.body}</div>
    <div class="tour-tooltip-footer">
      <div class="tour-dots" role="tablist">${dots}</div>
      <div class="tour-actions">
        <button class="tour-btn ${skipClass}">${skipLabel}</button>
        <button class="tour-btn tour-btn-next">${nextLabel}</button>
      </div>
    </div>`;

  tooltip.querySelector('.tour-btn-next').onclick = advance;
  tooltip.querySelector('.tour-close').onclick = complete;
  if (isFirst) tooltip.querySelector('.tour-btn-skip').onclick = complete;
  else tooltip.querySelector('.tour-btn-back').onclick = goBack;
  tooltip.querySelectorAll('.tour-dot').forEach(d => {
    d.onclick = () => {
      const idx = parseInt(d.dataset.step, 10);
      if (Number.isFinite(idx) && idx !== currentStep) {
        currentStep = idx;
        showStep();
      }
    };
  });

  // Snap the tooltip + spotlight to invisible WITHOUT transitions so the
  // user never sees position changes mid-fade. We then measure + place at the
  // final spot, and only THEN re-enable transitions for the fade-in.
  tooltip.style.transition = 'none';
  tooltip.style.opacity = '0';
  tooltip.style.visibility = 'hidden';
  tooltip.classList.remove('visible');
  if (spotlight) {
    spotlight.style.transition = 'none';
    spotlight.style.opacity = '0';
  }
  if (pendingRaf) cancelAnimationFrame(pendingRaf);

  const rectsMatch = (a, b) => a && b
    && Math.abs(a.left - b.left) < 0.5
    && Math.abs(a.top - b.top) < 0.5
    && Math.abs(a.width - b.width) < 0.5
    && Math.abs(a.height - b.height) < 0.5;

  // Poll the target's getBoundingClientRect across rAFs until it's stable
  // across two consecutive frames (or we hit the timeout). Without this, on
  // the first step the FAB / button can still be settling — we'd snap the
  // halo to a stale rect, then re-snap once layout finished, which reads as
  // a double-jump. Capped so a target that never appears can't hang the tour.
  const settleStartedAt = performance.now();
  const SETTLE_TIMEOUT_MS = 360;
  let lastRect = visible ? target.getBoundingClientRect() : null;

  const waitForStableRect = () => {
    if (!visible) { commit(null); return; }
    pendingRaf = requestAnimationFrame(() => {
      const next = target.getBoundingClientRect();
      const elapsed = performance.now() - settleStartedAt;
      if (rectsMatch(lastRect, next) || elapsed >= SETTLE_TIMEOUT_MS) {
        commit(next);
        return;
      }
      lastRect = next;
      waitForStableRect();
    });
  };

  const commit = (rect) => {
    updateBackdrop(rect);
    // Commit the transition:none + opacity:0 reset to the layout BEFORE
    // moving the spotlight — otherwise the browser may batch the position
    // change with the transition restoration and animate the slide.
    if (spotlight) void spotlight.offsetWidth;
    if (spotlight && rect) {
      const pad = 8;
      spotlight.style.left = (rect.left - pad) + 'px';
      spotlight.style.top = (rect.top - pad) + 'px';
      spotlight.style.width = (rect.width + pad * 2) + 'px';
      spotlight.style.height = (rect.height + pad * 2) + 'px';
      // Commit the new position too, while transition is still off.
      void spotlight.offsetWidth;
    }
    placeTooltip(visible ? target : null, position);
    void tooltip.offsetHeight;
    tooltip.style.visibility = '';
    tooltip.style.transition = '';
    tooltip.style.opacity = '';
    tooltip.classList.add('visible');
    // Now re-enable transition and fade in. Because the new position was
    // committed with transition:none, only opacity tweens — no slide.
    if (spotlight) {
      spotlight.style.transition = '';
      spotlight.style.opacity = rect ? '1' : '0';
    }
    runCinematic(step);
  };

  // First rAF: let the DOM settle from any innerHTML mutation; second rAF
  // begins the rect-stability poll.
  pendingRaf = requestAnimationFrame(() => {
    pendingRaf = requestAnimationFrame(waitForStableRect);
  });
}

// Run the step's optional camera/highlight choreography. Tagged with a token
// so a rapid Next/Back doesn't leave a stale hook scribbling on the wrong step.
// While a cinematic is in progress, body.tour-cinematic-running locks the nav
// buttons so the user can't skip past mid-demo.
function runCinematic(step) {
  if (!step.cinematic) return;
  const token = ++cinematicToken;
  document.body.classList.add('tour-cinematic-running');
  Promise.resolve()
    .then(() => step.cinematic({...cinematicCtx, isStale: () => token !== cinematicToken}))
    .catch(e => { if (token === cinematicToken) console.warn('tour cinematic failed:', e); })
    .finally(() => {
      if (token === cinematicToken) {
        document.body.classList.remove('tour-cinematic-running');
        document.body.classList.remove('tour-cinematic-active');
      }
    });
}

function buildBackdrop() {
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

// Transparent click-blocker that sits above page UI but below the tooltip.
// Programmatic .click() calls bypass this — only real user input is blocked.
function buildClickShield() {
  const el = document.createElement('div');
  el.className = 'tour-click-shield';
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

  clickShield = buildClickShield();
  document.body.appendChild(clickShield);

  spotlight = buildSpotlight();
  document.body.appendChild(spotlight);

  tooltip = document.createElement('div');
  tooltip.className = 'tour-tooltip';
  tooltip.setAttribute('role', 'dialog');
  tooltip.setAttribute('aria-live', 'polite');
  document.body.appendChild(tooltip);

  requestAnimationFrame(() => backdrop && backdrop.classList.add('visible'));

  if (renderFn) {
    loadDemo(renderFn);
    requestAnimationFrame(() => requestAnimationFrame(showStep));
  } else {
    showStep();
  }

  keyHandler = (e) => {
    if (!isActive) return;
    // Lock nav keys while a cinematic step is running so the user can't skip
    // past the demo. Escape still exits the tour.
    const running = document.body.classList.contains('tour-cinematic-running');
    if (e.key === 'Escape') { e.preventDefault(); complete(); return; }
    if (running) return;
    if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); advance(); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); goBack(); }
  };
  document.addEventListener('keydown', keyHandler);

  let resizeTimer = null;
  resizeHandler = () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { if (isActive) showStep(); }, 120);
  };
  window.addEventListener('resize', resizeHandler);

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
