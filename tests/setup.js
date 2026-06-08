// Global stubs for browser-based tests.
//
// The production app depends on:
//   * `window.maplibregl` (loaded via <script> in index.html)
//   * a `<div id="map">` element for the map container
//   * various DOM elements (#loading, #errorBanner, #toast, ...) used by
//     utils.js helpers like setLoading / showError / toast.
//
// The test page is intentionally minimal, so we install lightweight stubs
// here BEFORE any module under test is imported. Each stub does just enough
// to keep top-level module code (especially js/map.js) from throwing.
//
// IMPORTANT: import this module first, before any test file. It performs all
// of its work at import time as a side effect.

(function installMaplibreStub() {
  if (typeof window === 'undefined') return;
  if (window.maplibregl) return; // real lib already loaded — no-op.

  function FakeMap() {
    return {
      _handlers: {},
      on()    { /* noop */ },
      once()  { /* noop — load promise will simply never resolve in tests */ },
      off()   { /* noop */ },
      stop()  { /* noop */ },
      jumpTo() {},
      easeTo() {},
      fitBounds() {},
      zoomTo() {},
      getZoom() { return 9; },
      getStyle() { return { layers: [] }; },
      getLayer() { return null; },
      getSource() { return null; },
      addSource() {},
      addLayer() {},
      removeLayer() {},
      removeSource() {},
      setStyle() {}
    };
  }

  function FakeLngLatBounds() {
    return { extend() { return this; } };
  }

  function FakeMarker() {
    return {
      setLngLat() { return this; },
      addTo()     { return this; },
      remove()    {}
    };
  }

  window.maplibregl = {
    Map: FakeMap,
    LngLatBounds: FakeLngLatBounds,
    Marker: FakeMarker
  };
})();

(function ensureDomScaffold() {
  if (typeof document === 'undefined') return;
  const ids = ['map', 'loading', 'errorBanner', 'toast', 'clusterSlider', 'clusterVal'];
  for (const id of ids) {
    if (!document.getElementById(id)) {
      const el = document.createElement('div');
      el.id = id;
      el.style.display = 'none';
      document.body.appendChild(el);
    }
  }
})();
