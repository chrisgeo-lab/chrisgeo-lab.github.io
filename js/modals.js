import { state, STORE_H, saveJSON } from './state.js';
import { toast } from './utils.js';
import { geocodeFreeform } from './geocoder.js';
import { render } from './ui.js';

export function showHomeModal() {
  document.getElementById('homeModal').classList.add('show');
  document.getElementById('homeInput').value = state.home ? state.home.label : '';
  document.getElementById('homeClearBtn').style.display = state.home ? 'block' : 'none';
  setTimeout(() => document.getElementById('homeInput').focus(), 100);
}

export function hideHomeModal() {
  document.getElementById('homeModal').classList.remove('show');
}

export async function confirmHome() {
  const val = document.getElementById('homeInput').value.trim();
  if (!val) {
    state.home = null; localStorage.removeItem(STORE_H); hideHomeModal(); render();
    toast('No end point set — route ends at last stop');
    return;
  }
  const btn = document.getElementById('homeConfirmBtn');
  btn.textContent = 'Finding...'; btn.disabled = true;
  try {
    const result = await geocodeFreeform(val);
    btn.textContent = 'Set End'; btn.disabled = false;
    if (result) {
      state.home = {lat: result.lat, lng: result.lng, label: result.label || val};
      saveJSON(STORE_H, state.home); hideHomeModal(); render();
      toast('End point set');
    } else {
      document.getElementById('homeInput').style.borderColor = 'var(--red)';
      setTimeout(() => document.getElementById('homeInput').style.borderColor = '', 1500);
      toast('Address not found');
    }
  } catch {
    btn.textContent = 'Set End'; btn.disabled = false;
    toast('Geocoding failed');
  }
}

export function showStartModal() {
  document.getElementById('startModal').classList.add('show');
  document.getElementById('startInput').value = state.startPoint ? state.startPoint.label : '';
  document.getElementById('startClearBtn').style.display = state.startPoint ? 'block' : 'none';
  setTimeout(() => document.getElementById('startInput').focus(), 100);
}

export function hideStartModal() {
  document.getElementById('startModal').classList.remove('show');
}

export async function confirmStart() {
  const val = document.getElementById('startInput').value.trim();
  if (!val) {
    state.startPoint = null; localStorage.removeItem('routeflow-start'); hideStartModal(); state.durationMatrix = null; render();
    toast('Using GPS as start point');
    return;
  }
  const btn = document.getElementById('startConfirmBtn');
  btn.textContent = 'Finding...'; btn.disabled = true;
  try {
    const result = await geocodeFreeform(val);
    btn.textContent = 'Set Start'; btn.disabled = false;
    if (result) {
      state.startPoint = {lat: result.lat, lng: result.lng, label: result.label || val};
      saveJSON('routeflow-start', state.startPoint); hideStartModal(); state.durationMatrix = null; render();
      toast('Start point set');
    } else {
      document.getElementById('startInput').style.borderColor = 'var(--red)';
      setTimeout(() => document.getElementById('startInput').style.borderColor = '', 1500);
      toast('Address not found');
    }
  } catch {
    btn.textContent = 'Set Start'; btn.disabled = false;
    toast('Geocoding failed');
  }
}
