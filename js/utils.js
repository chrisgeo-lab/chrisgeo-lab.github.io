export function esc(s) {
  if (!s) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;');
}

export function hd(a, b) {
  const R = 3958.8, dl = (b.lat - a.lat) * Math.PI / 180, dg = (b.lng - a.lng) * Math.PI / 180;
  const s = Math.sin(dl / 2) ** 2 + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dg / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(s));
}

export function fmtMi(m) { return (m * 0.000621371).toFixed(1); }
export function fmtTime(min) { const h = Math.floor(min / 60), m = Math.round(min % 60); return h ? `${h}h ${m}m` : `${m} min`; }
export function fmtDur(s) { if (s < 60) return '< 1 min'; const m = Math.round(s / 60); if (m < 60) return `${m} min`; return `${Math.floor(m / 60)}h ${m % 60}m`; }

let toastTimer = null;
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

export function setLoading(v) { document.getElementById('loading').classList.toggle('active', v); }

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

export function hideError() {
  const el = document.getElementById('errorBanner');
  el.style.display = 'none'; el.innerHTML = '';
}
