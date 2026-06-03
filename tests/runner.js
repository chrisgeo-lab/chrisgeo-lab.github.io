const results = [];
let currentDescribe = '';

export function describe(name, fn) {
  currentDescribe = name;
  fn();
  currentDescribe = '';
}

export function it(name, fn) {
  const label = currentDescribe ? `${currentDescribe} > ${name}` : name;
  try {
    fn();
    results.push({ label, pass: true });
  } catch (e) {
    results.push({ label, pass: false, error: e.message });
  }
}

export function expect(val) {
  return {
    toBe(expected) { if (val !== expected) throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(val)}`); },
    toEqual(expected) { const a = JSON.stringify(val), b = JSON.stringify(expected); if (a !== b) throw new Error(`Expected ${b}, got ${a}`); },
    toBeTruthy() { if (!val) throw new Error(`Expected truthy, got ${JSON.stringify(val)}`); },
    toBeNull() { if (val !== null) throw new Error(`Expected null, got ${JSON.stringify(val)}`); },
    toBeGreaterThan(n) { if (!(val > n)) throw new Error(`Expected ${val} > ${n}`); }
  };
}

export function renderResults() {
  const el = document.getElementById('results');
  const pass = results.filter(r => r.pass).length;
  const fail = results.length - pass;
  el.innerHTML = `<h2>${pass} passed, ${fail} failed</h2>` +
    results.map(r => `<div class="${r.pass ? 'pass' : 'fail'}">${r.pass ? '✓' : '✗'} ${r.label}${r.error ? ' — ' + r.error : ''}</div>`).join('');
}
