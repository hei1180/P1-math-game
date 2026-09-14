// Pure round generators for Number Shop. No DOM, no Firebase.
// Every generator takes `rng` (a function returning [0,1)) so tests can be deterministic.

export const MAX = 20;

const int = (rng, lo, hi) => lo + Math.floor(rng() * (hi - lo + 1)); // inclusive

/** Lv1: two numbers 1-20 and which side is the subject of "A 比 B". 15% of rounds a === b. */
export function genCompare(rng = Math.random) {
  const subject = rng() < 0.5 ? 'left' : 'right';
  const a = int(rng, 1, MAX);
  let b;
  if (rng() < 0.15) {
    b = a;
  } else {
    do { b = int(rng, 1, MAX); } while (b === a);
  }
  return { a, b, subject };
}

/** @returns {'more'|'less'|'same'} how the subject compares to the other side */
export function compareAnswer({ a, b, subject }) {
  if (a === b) return 'same';
  const s = subject === 'left' ? a : b;
  const o = subject === 'left' ? b : a;
  return s > o ? 'more' : 'less';
}

/** Lv2: n in 1-20, 60% from 1-10, 40% from 11-20. */
export function genOddEven(rng = Math.random) {
  const n = rng() < 0.6 ? int(rng, 1, 10) : int(rng, 11, 20);
  return { n, answer: n % 2 === 0 ? 'even' : 'odd' };
}

// ---------- shared helpers for line rounds ----------

function shuffle(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Pick 1 or 2 distinct blank indices. rng() < 0.5 → 2 blanks. */
function pickBlanks(slotCount, rng) {
  const count = rng() < 0.5 ? 2 : 1;
  const first = Math.floor(rng() * slotCount);
  if (count === 1) return [first];
  let second;
  do { second = Math.floor(rng() * slotCount); } while (second === first);
  return [first, second].sort((x, y) => x - y);
}

/**
 * Build 4 tiles: every blank answer plus distractors.
 * `candidatesFor(n)` returns preferred distractor values for answer n, in priority order.
 * Falls back to random 1-20 values when preferred ones run out.
 */
function makeTiles(answers, candidatesFor, rng) {
  const tiles = [...answers];
  const used = new Set(answers);
  const preferred = [];
  for (const n of answers) for (const c of candidatesFor(n)) if (c >= 1 && c <= MAX && !used.has(c) && !preferred.includes(c)) preferred.push(c);
  shuffle(preferred, rng);
  while (tiles.length < 4 && preferred.length) { const v = preferred.shift(); if (!used.has(v)) { tiles.push(v); used.add(v); } }
  while (tiles.length < 4) { const v = int(rng, 1, MAX); if (!used.has(v)) { tiles.push(v); used.add(v); } }
  return shuffle(tiles, rng);
}

/** rng() < 0.5 → ascending, else descending (slots reversed). */
const pickDir = rng => (rng() < 0.5 ? 'asc' : 'desc');

/** Lv3: 7 consecutive numbers (lowest 1-14), ascending or descending, 1-2 blanks, tiles with ±1 ±2 ±10 distractors. */
export function genLine(rng = Math.random) {
  const start = int(rng, 1, 14);
  const dir = pickDir(rng);
  const slots = Array.from({ length: 7 }, (_, i) => start + i);
  if (dir === 'desc') slots.reverse();
  const blanks = pickBlanks(7, rng);
  const answers = blanks.map(i => slots[i]);
  const tiles = makeTiles(answers, n => [n - 1, n + 1, n - 2, n + 2, n - 10, n + 10], rng);
  return { slots, blanks, tiles, dir };
}

/** Lv4: 6 numbers stepping by 2, all odd (1..19) or all even (2..20), ascending or descending, 1-2 blanks, ±1 ±4 distractors. */
export function genSkipLine(rng = Math.random) {
  const parity = rng() < 0.5 ? 'odd' : 'even';
  const first = parity === 'odd' ? 1 : 2;
  const start = first + 2 * int(rng, 0, 4); // odd: 1,3,5,7,9  even: 2,4,6,8,10
  const dir = pickDir(rng);
  const slots = Array.from({ length: 6 }, (_, i) => start + 2 * i);
  if (dir === 'desc') slots.reverse();
  const blanks = pickBlanks(6, rng);
  const answers = blanks.map(i => slots[i]);
  const tiles = makeTiles(answers, n => [n - 1, n + 1, n - 4, n + 4], rng);
  return { slots, blanks, tiles, parity, dir };
}
