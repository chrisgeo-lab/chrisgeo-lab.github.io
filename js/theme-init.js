// Apply persisted theme before first paint to avoid a flash of the wrong palette.
// Loaded synchronously from <head> — keep tiny and dependency-free.
(function () {
  try {
    var saved = localStorage.getItem('routeflow-theme');
    if (saved === 'dark' || saved === 'light') {
      document.documentElement.setAttribute('data-theme', saved);
    }
  } catch (e) {}
})();
