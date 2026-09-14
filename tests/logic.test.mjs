import { test } from 'node:test';
import assert from 'node:assert/strict';
import { genCompare, compareAnswer, genOddEven, genLine, genSkipLine } from '../numbers-logic.js';

// Deterministic rng: cycles through the given values.
function seq(values) { let i = 0; return () => values[i++ % values.length]; }
// Cheap seeded rng for distribution tests.
function lcg(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

test('genCompare values in 1-20 and subject is left|right', () => {
  const rng = lcg(1);
  let left = 0;
  for (let i = 0; i < 1000; i++) {
    const r = genCompare(rng);
    assert.ok(r.a >= 1 && r.a <= 20, 'a in range');
    assert.ok(r.b >= 1 && r.b <= 20, 'b in range');
    assert.ok(['left', 'right'].includes(r.subject));
    if (r.subject === 'left') left++;
  }
  assert.ok(left > 420 && left < 580, 'left share ' + left);
});

test('genCompare equal case rate ≈ 15%', () => {
  const rng = lcg(7);
  let eq = 0;
  const N = 4000;
  for (let i = 0; i < N; i++) { const r = genCompare(rng); if (r.a === r.b) eq++; }
  const rate = eq / N;
  assert.ok(rate > 0.11 && rate < 0.19, 'rate was ' + rate);
});

test('compareAnswer: subject compared to the other side', () => {
  assert.equal(compareAnswer({ a: 7, b: 3, subject: 'left' }), 'more');
  assert.equal(compareAnswer({ a: 7, b: 3, subject: 'right' }), 'less');
  assert.equal(compareAnswer({ a: 2, b: 9, subject: 'left' }), 'less');
  assert.equal(compareAnswer({ a: 2, b: 9, subject: 'right' }), 'more');
  assert.equal(compareAnswer({ a: 5, b: 5, subject: 'left' }), 'same');
  assert.equal(compareAnswer({ a: 5, b: 5, subject: 'right' }), 'same');
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

function checkLineRound(r, slotCount) {
  assert.equal(r.slots.length, slotCount);
  assert.ok(r.slots.every(v => v >= 1 && v <= 20), 'slots in 1-20');
  assert.ok(r.blanks.length === 1 || r.blanks.length === 2, 'blank count');
  assert.equal(new Set(r.blanks).size, r.blanks.length, 'blanks distinct');
  assert.ok(r.blanks.every(i => i >= 0 && i < slotCount), 'blank index valid');
  assert.equal(r.tiles.length, 4, 'four tiles');
  assert.equal(new Set(r.tiles).size, 4, 'tiles unique');
  assert.ok(r.tiles.every(v => v >= 1 && v <= 20), 'tiles in 1-20');
  for (const i of r.blanks) assert.ok(r.tiles.includes(r.slots[i]), 'answer ' + r.slots[i] + ' present in tiles');
  // distractors must not equal any blank answer
  const answers = new Set(r.blanks.map(i => r.slots[i]));
  const distractors = r.tiles.filter(v => !answers.has(v));
  assert.equal(distractors.length, 4 - r.blanks.length);
}

test('genLine: 7 consecutive slots, valid blanks and tiles', () => {
  const rng = lcg(11);
  for (let i = 0; i < 1000; i++) {
    const r = genLine(rng);
    checkLineRound(r, 7);
    for (let k = 1; k < 7; k++) assert.equal(r.slots[k], r.slots[k - 1] + 1, 'consecutive');
    assert.ok(r.slots[0] >= 1 && r.slots[0] <= 14, 'start in 1-14');
  }
});

test('genLine blank count is ~50/50', () => {
  const rng = lcg(5);
  let two = 0;
  for (let i = 0; i < 2000; i++) if (genLine(rng).blanks.length === 2) two++;
  assert.ok(two > 850 && two < 1150, 'two-blank count ' + two);
});

test('genSkipLine: 6 slots step 2, same parity, valid blanks and tiles', () => {
  const rng = lcg(13);
  let odd = 0;
  for (let i = 0; i < 1000; i++) {
    const r = genSkipLine(rng);
    checkLineRound(r, 6);
    const parity = r.slots[0] % 2;
    if (parity === 1) odd++;
    for (let k = 0; k < 6; k++) assert.equal(r.slots[k] % 2, parity, 'same parity');
    for (let k = 1; k < 6; k++) assert.equal(r.slots[k], r.slots[k - 1] + 2, 'step 2');
    assert.equal(r.parity, parity === 1 ? 'odd' : 'even');
  }
  assert.ok(odd > 400 && odd < 600, 'odd share ' + odd);
});

test('genSkipLine distractors prefer n±1 (wrong parity) when available', () => {
  // rng call order: parity (0.9 → even), start index (0.0 → 0 → slots 2..12), blank count (0.6 → 1 blank), blank index (0.4 → floor(0.4*6)=2 → value 6), then shuffles.
  const rng = seq([0.9, 0.0, 0.6, 0.4, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0]);
  const r = genSkipLine(rng);
  assert.deepEqual(r.slots, [2, 4, 6, 8, 10, 12]);
  assert.deepEqual(r.blanks, [2]);
  assert.ok(r.tiles.includes(6));
  assert.ok(r.tiles.includes(5) || r.tiles.includes(7), 'has an n±1 distractor');
});
