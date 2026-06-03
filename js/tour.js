const TOUR_KEY = 'routeflow-tour-complete';

const steps = [
  {
    id: 'welcome',
    title: 'Welcome to RouteFlow',
    body: 'Plan optimized multi-stop routes with real-time GPS navigation, smart address resolution, and 3D map views. Let’s take a quick tour of the key features.',
    target: null,
    position: 'center',
    icon: '\u{1F5FA}️'
  },
  {
    id: 'import',
    title: 'Import Your Stops',
    body: 'Start by adding addresses. Import from a CSV/Excel file, paste them in, or type them one at a time. Our multi-provider geocoder handles incomplete or fuzzy addresses.',
    target: () => document.getElementById('manageStopsBtn') || document.getElementById('emptyImportBtn'),
    position: 'left',
    icon: '\u{1F4CD}'
  },
  {
    id: 'cluster',
    title: 'Split Into Routes',
    body: 'Have too many stops for one trip? Drag this slider to split your stops into multiple optimized routes using intelligent clustering.',
    target: () => document.querySelector('.cluster-card'),
    position: 'bottom',
    icon: '\u{1F504}'
  },
  {
    id: 'panel',
    title: 'Your Stop List',
    body: 'All your stops appear here, ordered optimally. Tap any stop to see it on the map. Check off stops as you complete them to track progress.',
    target: () => window.innerWidth < 768 ? document.getElementById('mobileNavPlan') : document.getElementById('bottomSheet'),
    position: () => window.innerWidth < 768 ? 'top' : 'left',
    icon: '\u{1F4CB}'
  },
  {
    id: 'mapcontrols',
    title: 'Map Controls',
    body: 'Zoom in/out, fit all stops in view, locate yourself via GPS, toggle visited stops, or import new addresses — all from this toolbar.',
    target: () => document.querySelector('.map-controls'),
    position: 'left',
    icon: '\u{1F5FA}️'
  },
  {
    id: 'export',
    title: 'Navigate & Share',
    body: 'Open your optimized route in Google Maps or Apple Maps for turn-by-turn navigation, or download as a text file to share with your team.',
    target: () => document.getElementById('exportBtn'),
    position: 'left',
    icon: '\u{1F4E4}'
  },
  {
    id: 'shortcuts',
    title: 'Pro Tips',
    body: 'Use keyboard shortcuts: H for end point, +/− for zoom, 1–9 to switch routes, Esc to close panels. Export to Google Maps or Apple Maps for turn-by-turn navigation. Works fully offline once loaded.',
    target: null,
    position: 'center',
    icon: '⚡'
  }
];

let currentStep = 0;
let overlay = null;
let tooltip = null;
let isActive = false;

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
        ${isFirst ? `<button class="tour-btn tour-btn-skip" onclick="window._tourSkip()">Skip Tour</button>` : `<button class="tour-btn tour-btn-back" onclick="window._tourBack()">Back</button>`}
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

export function startTour() {
  if (isActive) return;
  isActive = true;
  currentStep = 0;
  document.body.classList.add('tour-active');
  createOverlay();
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
