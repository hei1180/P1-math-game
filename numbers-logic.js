// Pure round generators for Number Shop. No DOM, no Firebase.
// Every generator takes `rng` (a function returning [0,1)) so tests can be deterministic.

export const MAX = 20;

const int = (rng, lo, hi) => lo + Math.floor(rng() * (hi - lo + 1)); // inclusive

/** Lv1: two numbers 1-20, ask 'more' or 'less'. 15% of rounds a === b. */
export function genCompare(rng = Math.random) {
  const ask = rng() < 0.5 ? 'more' : 'less';
  const a = int(rng, 1, MAX);
  let b;
  if (rng() < 0.15) {
    b = a;
  } else {
    do { b = int(rng, 1, MAX); } while (b === a);
  }
  return { a, b, ask };
}

/** @returns {'left'|'right'|'same'} */
export function compareAnswer({ a, b, ask }) {
  if (a === b) return 'same';
  const leftBigger = a > b;
  if (ask === 'more') return leftBigger ? 'left' : 'right';
  return leftBigger ? 'right' : 'left';
}

/** Lv2: n in 1-20, 60% from 1-10, 40% from 11-20. */
export function genOddEven(rng = Math.random) {
  const n = rng() < 0.6 ? int(rng, 1, 10) : int(rng, 11, 20);
  return { n, answer: n % 2 === 0 ? 'even' : 'odd' };
}
