window.onerror = function(msg) {
  if (/maplibregl|maplibre|Map/.test(msg)) {
    var el = document.getElementById('map');
    if (el) el.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;font-family:system-ui;color:#888;text-align:center;padding:2rem"><p>Map failed to load. Check your connection and refresh.</p></div>';
  }
};
