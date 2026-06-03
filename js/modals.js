import { state, STORE_H, saveJSON } from './state.js';
import { toast, trapFocus } from './utils.js';
import { geocodeFreeform } from './geocoder.js';
import { render } from './ui.js';

let releaseHomeTrap = null;

export function showHomeModal() {
  const modal = document.getElementById('homeModal');
  modal.classList.add('show');
  document.getElementById('homeInput').value = state.home ? state.home.label : '';
  document.getElementById('homeClearBtn').style.display = state.home ? 'block' : 'none';
  releaseHomeTrap = trapFocus(modal);
  setTimeout(() => document.getElementById('homeInput').focus(), 100);
}

export function hideHomeModal() {
  document.getElementById('homeModal').classList.remove('show');
  if (releaseHomeTrap) { releaseHomeTrap(); releaseHomeTrap = null; }
}

export async function confirmHome() {
  const val = document.getElementById('homeInput').value.trim();
  if (!val) {
    state.home = null; localStorage.removeItem(STORE_H); hideHomeModal(); render();
    toast('End point removed');
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

let releaseStartTrap = null;

export function showStartModal() {
  const modal = document.getElementById('startModal');
  modal.classList.add('show');
  document.getElementById('startInput').value = state.startPoint ? state.startPoint.label : '';
  document.getElementById('startClearBtn').style.display = state.startPoint ? 'block' : 'none';
  releaseStartTrap = trapFocus(modal);
  setTimeout(() => document.getElementById('startInput').focus(), 100);
}

export function hideStartModal() {
  document.getElementById('startModal').classList.remove('show');
  if (releaseStartTrap) { releaseStartTrap(); releaseStartTrap = null; }
}

export async function confirmStart() {
  const val = document.getElementById('startInput').value.trim();
  if (!val) {
    state.startPoint = null; localStorage.removeItem('routeflow-start'); hideStartModal(); state.durationMatrix = null; render();
    toast('Start point cleared');
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
