// Pure rules for Rod Town 數棒鎮. No DOM, no Phaser, no Firebase.
// Every generator takes rng (() => [0,1)) so tests are deterministic.

export const RODS = {
  1: { zh: '白', en: 'white', css: '#f8fafc' },
  2: { zh: '紅', en: 'red', css: '#ef4444' },
  3: { zh: '淺綠', en: 'light green', css: '#84cc16' },
  4: { zh: '紫', en: 'purple', css: '#a855f7' },
  5: { zh: '黃', en: 'yellow', css: '#facc15' },
  6: { zh: '深綠', en: 'dark green', css: '#15803d' },
  7: { zh: '黑', en: 'black', css: '#1f2937' },
  8: { zh: '啡', en: 'brown', css: '#92400e' },
  9: { zh: '藍', en: 'blue', css: '#2563eb' },
  10: { zh: '橙', en: 'orange', css: '#f97316' },
};
for (const r of Object.values(RODS)) r.hex = parseInt(r.css.slice(1), 16);

export const WORLDS = [
  { w: 1, key: 'w1', min: 2, max: 5, zh: '草地', en: 'Meadow', boss: [5], sticker: 5 },
  { w: 2, key: 'w2', min: 6, max: 10, zh: '海邊', en: 'Beach', boss: [6, 7, 8, 9, 10], sticker: 10 },
  { w: 3, key: 'w3', min: 11, max: 13, zh: '森林', en: 'Forest', boss: [11, 12, 13], sticker: 9 },
  { w: 4, key: 'w4', min: 14, max: 18, zh: '雪山', en: 'Snow peak', boss: [14, 15], sticker: 8 },
];
export const world = w => WORLDS[w - 1];
export const LEVEL_COUNT = 6;

const int = (rng, lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));
function shuffle(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
  return arr;
}

/** Valid values for part a so that a and n − a are both 1..10. */
export function partRange(n) { return { lo: Math.max(1, n - 10), hi: Math.min(10, n - 1) }; }

function pickNA(w, rng, prev) {
  const wd = world(w);
  for (let i = 0; i < 30; i++) {
    const n = int(rng, wd.min, wd.max);
    const { lo, hi } = partRange(n);
    const a = int(rng, lo, hi);
    if (!prev || prev.n !== n || prev.a !== a) return { n, a, b: n - a };
  }
  const n = wd.max; const a = partRange(n).lo; return { n, a, b: n - a };
}

/** 5 unique sorted rods containing `answer`; distractors answer±1, ±2 first, then random. */
export function trayFor(answer, rng, { size = 5, max = 10 } = {}) {
  const set = new Set([answer]);
  const near = [answer - 1, answer + 1, answer - 2, answer + 2].filter(v => v >= 1 && v <= max);
  for (const v of near) if (set.size < size) set.add(v);
  while (set.size < Math.min(size, max)) set.add(int(rng, 1, max));
  return [...set].sort((x, y) => x - y);
}

export function genBuild(w, rng = Math.random, prev) { const q = pickNA(w, rng, prev); return { type: 'build', ...q, tray: trayFor(q.b, rng) }; }
export function genBreak(w, rng = Math.random, prev) { const q = pickNA(w, rng, prev); return { type: 'break', ...q, tray: trayFor(q.b, rng) }; }
export function genRush(w, rng = Math.random, prev) { return rng() < 0.5 ? genBuild(w, rng, prev) : genBreak(w, rng, prev); }

/** Number-house floors: every split with both parts 1..9, a ascending. */
export function splitsOf(n) {
  const out = [];
  for (let a = Math.max(1, n - 9); a <= Math.min(9, n - 1); a++) out.push([a, n - a]);
  return out;
}

export function houseFor(w, rng = Math.random) {
  const boss = world(w).boss;
  const n = boss[int(rng, 0, boss.length - 1)];
  return { n, floors: splitsOf(n), tray: [1, 2, 3, 4, 5, 6, 7, 8, 9] };
}

const PLAN_TYPES = {
  1: ['build', 'build', 'build', 'build', 'build'],
  2: ['break', 'break', 'break', 'break', 'break'],
  3: ['build', 'build', 'build', 'break', 'break'],
};
export function levelPlan(w, level, rng = Math.random) {
  const base = PLAN_TYPES[((level - 1) % 3) + 1];
  const types = level % 3 === 0 ? shuffle([...base], rng) : [...base];
  const questions = [];
  let prev = null;
  for (const t of types) { const q = (t === 'build' ? genBuild : genBreak)(w, rng, prev); questions.push(q); prev = q; }
  return { labels: level <= 3, questions };
}

export const starsFor = mistakes => (mistakes === 0 ? 3 : mistakes <= 2 ? 2 : 1);
export const levelKey = (w, level) => `w${w}-${level}`;
export const emptyProgress = () => ({ levels: {}, stickers: [], streak: { count: 0, lastDay: null } });

export function isWorldOpen(progress, w, unlock, testMode) {
  if (testMode) return true;
  if (!unlock || !unlock[`w${w}`]) return false;
  if (w === 1) return true;
  return (progress.levels[levelKey(w - 1, 'boss')] || 0) > 0;
}

export function isLevelOpen(progress, w, level, unlock, testMode) {
  if (testMode) return true;
  if (!isWorldOpen(progress, w, unlock, false)) return false;
  if (level === 1) return true;
  const prev = level === 'boss' ? LEVEL_COUNT : level - 1;
  return (progress.levels[levelKey(w, prev)] || 0) > 0;
}

export function isRushOpen(progress, w, unlock, testMode) {
  if (testMode) return true;
  return isWorldOpen(progress, w, unlock, false) && (progress.levels[levelKey(w, 'boss')] || 0) > 0;
}

function prevDay(day) { const d = new Date(day + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() - 1); return d.toISOString().slice(0, 10); }

export function bumpStreak(streak, today) {
  const s = streak || { count: 0, lastDay: null };
  if (s.lastDay === today) return { ...s };
  if (s.lastDay && s.lastDay === prevDay(today)) return { count: s.count + 1, lastDay: today };
  return { count: 1, lastDay: today };
}

function copy(p) { const q = p || emptyProgress(); return { levels: { ...q.levels }, stickers: [...(q.stickers || [])], streak: { ...(q.streak || { count: 0, lastDay: null }) } }; }

export function recordResult(progress, key, stars, today) {
  const p = copy(progress);
  const prev = p.levels[key] || 0;
  p.levels[key] = Math.max(prev, stars);
  let sticker = null;
  const m = /^w(\d)-boss$/.exec(key);
  if (m && !p.stickers.includes(`w${m[1]}`)) { p.stickers.push(`w${m[1]}`); p.stickers.sort(); sticker = Number(m[1]); }
  p.streak = bumpStreak(p.streak, today);
  return { progress: p, newBest: stars > prev, sticker };
}

export function mergeProgress(a, b) {
  const x = copy(a), y = copy(b);
  const levels = { ...x.levels };
  for (const [k, v] of Object.entries(y.levels)) levels[k] = Math.max(levels[k] || 0, v);
  const stickers = [...new Set([...x.stickers, ...y.stickers])].sort();
  const dx = x.streak.lastDay || '', dy = y.streak.lastDay || '';
  const streak = dy > dx || (dy === dx && y.streak.count > x.streak.count) ? y.streak : x.streak;
  return { levels, stickers, streak: { ...streak } };
}

/** Make-ten hint for n ≥ 11 when neither part is 10: `count` units move `from` the smaller part `to` the larger. */
export function makeTenMove(a, b) {
  if (a + b < 11 || a === 10 || b === 10) return null;
  const to = a >= b ? 'a' : 'b';
  return { from: to === 'a' ? 'b' : 'a', to, count: 10 - Math.max(a, b) };
}
