import { state } from './state.js';
import { setSheetState } from './ui.js';
import {
  SHEET_VELOCITY_THRESHOLD,
  SHEET_COLLAPSE_RATIO,
  SHEET_EXPAND_RATIO,
  SHEET_DRAG_MIN_Y,
  MOBILE_BREAKPOINT_PX
} from './constants.js';

function isMobile() { return window.innerWidth < MOBILE_BREAKPOINT_PX; }

/** Wire bottom-sheet handle click + touch drag (desktop/tablet only — mobile uses nav bar). */
export function initSheet() {
  const sheet = document.getElementById('bottomSheet');
  const handle = document.getElementById('sheetHandle');

  handle.addEventListener('click', () => {
    if (isMobile()) return;
    if (state.sheetState === 'expanded') setSheetState('peek');
    else if (state.sheetState === 'peek') setSheetState('expanded');
    else setSheetState('peek');
  });

  let sheetStartY = 0, sheetStartTranslate = 0, sheetDragging = false, sheetLastY = 0, sheetVelocity = 0, sheetLastTime = 0;
  handle.addEventListener('touchstart', e => {
    if (isMobile()) return;
    sheetDragging = true;
    sheetStartY = e.touches[0].clientY;
    sheetLastY = sheetStartY;
    sheetLastTime = Date.now();
    sheetVelocity = 0;
    const transform = window.getComputedStyle(sheet).transform;
    const matrix = new DOMMatrix(transform);
    sheetStartTranslate = matrix.m42;
    sheet.style.transition = 'none';
  }, {passive: true});
  document.addEventListener('touchmove', e => {
    if (!sheetDragging) return;
    const y = e.touches[0].clientY;
    const now = Date.now();
    const dt = now - sheetLastTime;
    if (dt > 0) sheetVelocity = (y - sheetLastY) / dt;
    sheetLastY = y; sheetLastTime = now;
    const dy = y - sheetStartY;
    const newY = Math.max(SHEET_DRAG_MIN_Y, sheetStartTranslate + dy);
    sheet.style.transform = `translateY(${newY}px)`;
  }, {passive: true});
  document.addEventListener('touchend', () => {
    if (!sheetDragging) return; sheetDragging = false;
    sheet.style.transition = '';
    const transform = window.getComputedStyle(sheet).transform;
    const matrix = new DOMMatrix(transform);
    const y = matrix.m42;
    const sheetH = sheet.offsetHeight;
    if (sheetVelocity > SHEET_VELOCITY_THRESHOLD) setSheetState('collapsed');
    else if (sheetVelocity < -SHEET_VELOCITY_THRESHOLD) setSheetState('expanded');
    else if (y > sheetH * SHEET_COLLAPSE_RATIO) setSheetState('collapsed');
    else if (y < sheetH * SHEET_EXPAND_RATIO) setSheetState('expanded');
    else setSheetState('peek');
  });
}
