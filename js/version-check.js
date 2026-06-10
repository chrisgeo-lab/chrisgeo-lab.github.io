/**
 * Version-check: Clear localStorage when app version changes to force clean state.
 * Prevents bugs from stale cached data across deployments.
 */

const CURRENT_VERSION = '92'; // Increment on every breaking change
const VERSION_KEY = 'routeflow-app-version';

function getStoredVersion() {
  try { return localStorage.getItem(VERSION_KEY); } catch { return null; }
}

function setStoredVersion() {
  try { localStorage.setItem(VERSION_KEY, CURRENT_VERSION); } catch {}
}

export function checkVersionAndClear() {
  const stored = getStoredVersion();

  // First visit or version mismatch → clear everything
  if (!stored || stored !== CURRENT_VERSION) {
    console.log(`Version changed: ${stored || 'none'} → ${CURRENT_VERSION}. Clearing storage...`);

    try {
      // Clear all routeflow-* keys
      const keys = Object.keys(localStorage);
      keys.forEach(k => {
        if (k.startsWith('routeflow')) {
          localStorage.removeItem(k);
        }
      });

      // Set new version
      setStoredVersion();

      // Nuke service worker caches so stale JS/CSS can't survive a version bump.
      // The SW activate handler only prunes once the new SW takes control,
      // which can take a reload — clearing here avoids that lag.
      if (typeof caches !== 'undefined' && caches.keys) {
        caches.keys().then(keys => keys.forEach(k => caches.delete(k))).catch(() => {});
      }

      console.log('✓ Storage cleared for new version');
    } catch (e) {
      console.error('Failed to clear storage:', e);
    }
  }
}
