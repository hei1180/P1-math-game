import { test } from 'node:test';
import assert from 'node:assert/strict';
import { genCompare, compareAnswer, genOddEven } from '../numbers-logic.js';

// Deterministic rng: cycles through the given values.
function seq(values) { let i = 0; return () => values[i++ % values.length]; }
// Cheap seeded rng for distribution tests.
function lcg(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

test('genCompare values in 1-20 and ask is more|less', () => {
  const rng = lcg(1);
  for (let i = 0; i < 500; i++) {
    const r = genCompare(rng);
    assert.ok(r.a >= 1 && r.a <= 20, 'a in range');
    assert.ok(r.b >= 1 && r.b <= 20, 'b in range');
    assert.ok(['more', 'less'].includes(r.ask));
  }
});

test('genCompare equal case rate ≈ 15%', () => {
  const rng = lcg(7);
  let eq = 0;
  const N = 4000;
  for (let i = 0; i < N; i++) { const r = genCompare(rng); if (r.a === r.b) eq++; }
  const rate = eq / N;
  assert.ok(rate > 0.11 && rate < 0.19, 'rate was ' + rate);
});

test('compareAnswer', () => {
  assert.equal(compareAnswer({ a: 7, b: 3, ask: 'more' }), 'left');
  assert.equal(compareAnswer({ a: 7, b: 3, ask: 'less' }), 'right');
  assert.equal(compareAnswer({ a: 2, b: 9, ask: 'more' }), 'right');
  assert.equal(compareAnswer({ a: 2, b: 9, ask: 'less' }), 'left');
  assert.equal(compareAnswer({ a: 5, b: 5, ask: 'more' }), 'same');
  assert.equal(compareAnswer({ a: 5, b: 5, ask: 'less' }), 'same');
});

test('genOddEven range and answer', () => {
  const rng = lcg(3);
  let low = 0;
  const N = 2000;
  for (let i = 0; i < N; i++) {
    const r = genOddEven(rng);
    assert.ok(r.n >= 1 && r.n <= 20);
    assert.equal(r.answer, r.n % 2 === 0 ? 'even' : 'odd');
    if (r.n <= 10) low++;
  }
  const rate = low / N;
  assert.ok(rate > 0.55 && rate < 0.65, '1-10 share was ' + rate);
});

test('genOddEven deterministic branches', () => {
  // rng < 0.6 → 1-10 branch; second value picks index
  assert.equal(genOddEven(seq([0.1, 0.0])).n, 1);
  assert.equal(genOddEven(seq([0.1, 0.99])).n, 10);
  // rng ≥ 0.6 → 11-20 branch
  assert.equal(genOddEven(seq([0.9, 0.0])).n, 11);
  assert.equal(genOddEven(seq([0.9, 0.99])).n, 20);
});
