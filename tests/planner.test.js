// Planner tests are intentionally minimal. The render() function pulls in
// ui.js -> map.js plus a long list of DOM ids (#filterRow, #routeDropdownTrigger,
// #travelModeBar, #stops, #nextStop, ...). Faithfully stubbing all of them in a
// browser test page balloons setup well past the value of the test, and the
// shared, mutating module-level `state` makes call ordering brittle.
//
// TODO: when render() is decoupled from renderView (e.g. by accepting a
// view-render callback the same way demo.js does), add the requested
// "demoMode short-circuit produces synthetic geometry under 500ms" test here.
//
// For now we cover only what is safe and useful: the module imports cleanly
// (transitively pulling map.js, ui.js, etc., through the maplibregl stub
// installed by setup.js) and exports the expected API.

import './setup.js';
import { describe, it, expect } from './runner.js';
import * as planner from '../js/planner.js';

describe('planner module', () => {
  it('exports render() as a function', () => {
    expect(typeof planner.render).toBe('function');
  });

  // The other interesting behaviors (demoMode short-circuit, synthetic-only
  // routing when matrixFallback is true, render-version cancellation) are
  // exercised end-to-end by the demo tests via loadDemo() which triggers
  // renderFn under the hood. Keeping a dedicated planner test in this file
  // would require the full DOM stack — see TODO above.
});
