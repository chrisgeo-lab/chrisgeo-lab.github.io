/**
 * Constrain Tab navigation within `modalEl` until the returned `release()` runs.
 * Restores focus to the previously-active element on release.
 * @param {HTMLElement} modalEl
 * @returns {() => void}
 */
export function trapFocus(modalEl) {
  const prev = document.activeElement;
  const sel = 'input,button,textarea,select,[tabindex]:not([tabindex="-1"])';
  function getEls() { return [...modalEl.querySelectorAll(sel)].filter(e => !e.disabled && e.offsetParent !== null); }
  function onKey(e) {
    if (e.key !== 'Tab') return;
    const els = getEls();
    if (!els.length) return;
    const first = els[0], last = els[els.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
  modalEl.addEventListener('keydown', onKey);
  return function release() {
    modalEl.removeEventListener('keydown', onKey);
    if (prev && prev.focus) prev.focus();
  };
}

/** HTML-escape `s` for safe insertion into innerHTML. */
export function esc(s) {
  if (!s) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;');
}

/**
 * Haversine great-circle distance between two `{lat, lng}` points.
 * @returns {number} Distance in miles.
 */
export function hd(a, b) {
  const R = 3958.8, dl = (b.lat - a.lat) * Math.PI / 180, dg = (b.lng - a.lng) * Math.PI / 180;
  const s = Math.sin(dl / 2) ** 2 + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dg / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(s));
}

/** Format meters as miles with one decimal. */
export function fmtMi(m) { return (m * 0.000621371).toFixed(1); }
/** Format minutes as `Hh Mm` (or `M min`). */
export function fmtTime(min) { const h = Math.floor(min / 60), m = Math.round(min % 60); return h ? `${h}h ${m}m` : `${m} min`; }
/** Format seconds as a coarse human duration (`< 1 min` / `M min` / `Hh Mm`). */
export function fmtDur(s) { if (s < 60) return '< 1 min'; const m = Math.round(s / 60); if (m < 60) return `${m} min`; return `${Math.floor(m / 60)}h ${m % 60}m`; }

let toastTimer = null;
/**
 * Show a transient toast message. Auto-dismiss after 2.5s (4s when an Undo button is shown).
 * @param {string} msg
 * @param {{undo?: () => void}} [opts]
 */
export function toast(msg, opts) {
  const t = document.getElementById('toast');
  clearTimeout(toastTimer);
  t.innerHTML = '';
  const span = document.createElement('span'); span.textContent = msg; t.appendChild(span);
  if (opts && opts.undo) {
    const btn = document.createElement('button'); btn.className = 'toast-undo'; btn.textContent = 'Undo';
    btn.onclick = () => { opts.undo(); t.classList.remove('show'); };
    t.appendChild(btn);
  }
  t.classList.add('show');
  toastTimer = setTimeout(() => t.classList.remove('show'), opts && opts.undo ? 4000 : 2500);
}

// When a recalculation drags past this threshold the bottom sheet starts
// shimmering. Tuned so quick local recalcs don't strobe the UI.
const RECALC_SHIMMER_DELAY_MS = 1000;
let recalcShimmerTimer = null;

function setRecalculatingClass(on) {
  const sheet = document.getElementById('bottomSheet');
  if (sheet) sheet.classList.toggle('is-recalculating', !!on);
}

/** Toggle the global loading spinner overlay. */
export function setLoading(v) {
  document.getElementById('loading').classList.toggle('active', v);
  if (v) {
    // Defer the shimmer — only kicks in if the recalc takes long enough to feel laggy.
    if (recalcShimmerTimer == null) {
      recalcShimmerTimer = setTimeout(() => {
        recalcShimmerTimer = null;
        setRecalculatingClass(true);
      }, RECALC_SHIMMER_DELAY_MS);
    }
  } else {
    if (recalcShimmerTimer != null) { clearTimeout(recalcShimmerTimer); recalcShimmerTimer = null; }
    setRecalculatingClass(false);
  }
}

/**
 * Render the persistent error banner with optional retry button.
 * @param {string} msg
 * @param {() => void} [retryFn]
 */
export function showError(msg, retryFn) {
  const el = document.getElementById('errorBanner');
  el.style.display = '';
  el.className = 'error-banner';
  el.innerHTML = `<span class="error-banner-text">${esc(msg)}</span>`;
  if (retryFn) {
    const btn = document.createElement('button'); btn.className = 'error-retry-btn'; btn.textContent = 'Retry';
    btn.onclick = retryFn; el.appendChild(btn);
  }
}

/** Hide the persistent error banner. */
export function hideError() {
  const el = document.getElementById('errorBanner');
  el.style.display = 'none'; el.innerHTML = '';
}
