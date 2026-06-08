import { mapReady } from './map.js';
import { toast, showError, hideError } from './utils.js';
import { LOADER_TIMEOUT_MS, LOADER_FADE_MS } from './constants.js';

function dismissLoader() {
  const loader = document.getElementById('appLoading');
  if (loader && !loader.classList.contains('hidden')) {
    loader.classList.add('hidden');
    setTimeout(() => loader.remove(), LOADER_FADE_MS);
  }
}

function updateOnlineStatus() {
  if (!navigator.onLine) {
    showError('You\'re offline — cached routes still work');
  } else {
    hideError();
  }
}

/** Wire loader dismissal, service worker, error logging, and online/offline detection. */
export function initBootstrap() {
  mapReady.then(dismissLoader);
  setTimeout(dismissLoader, LOADER_TIMEOUT_MS);

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').then(reg => {
      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing;
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'activated' && navigator.serviceWorker.controller) {
            toast('Update available — refresh to get it');
          }
        });
      });
    }).catch(() => {});
  }

  window.addEventListener('unhandledrejection', e => {
    console.error('Unhandled promise rejection:', e.reason);
  });

  window.addEventListener('online', updateOnlineStatus);
  window.addEventListener('offline', updateOnlineStatus);
  if (!navigator.onLine) updateOnlineStatus();
}
