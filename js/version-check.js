/**
 * Version-check: Clear localStorage when app version changes to force clean state.
 * Prevents bugs from stale cached data across deployments.
 */

const CURRENT_VERSION = '44'; // Increment on every breaking change
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

      // Toast to inform user (import toast if needed, or use console for now)
      console.log('✓ Storage cleared for new version');
    } catch (e) {
      console.error('Failed to clear storage:', e);
    }
  }
}
