import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  RODS, WORLDS, world, LEVEL_COUNT, partRange, trayFor, genBuild, genBreak, genRush, splitsOf, houseFor,
  levelPlan, starsFor, levelKey, emptyProgress, isWorldOpen, isLevelOpen, isRushOpen, bumpStreak,
  recordResult, mergeProgress, makeTenMove,
} from '../bonds-logic.js';

function lcg(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
const ALL = { w1: true, w2: true, w3: true, w4: true };

test('RODS: 10 Cuisenaire colours', () => {
  assert.deepEqual(Object.keys(RODS).map(Number), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.equal(RODS[10].en, 'orange');
  assert.equal(RODS[1].css, '#f8fafc');
  for (const r of Object.values(RODS)) assert.equal(r.hex, parseInt(r.css.slice(1), 16));
});

test('WORLDS ranges and bosses', () => {
  assert.deepEqual(WORLDS.map(x => [x.min, x.max]), [[2, 9], [10, 10], [11, 13], [14, 18]]);
  assert.deepEqual(world(2).boss, [10]);
  assert.equal(world(3).key, 'w3');
  for (const wd of WORLDS) for (const n of wd.boss) {
    assert.ok(n >= wd.min && n <= wd.max);
    assert.ok(splitsOf(n).length >= 4, 'boss ' + n + ' has 4+ floors');
  }
  assert.equal(LEVEL_COUNT, 6);
});

test('partRange keeps both parts single-digit (1..9)', () => {
  assert.deepEqual(partRange(2), { lo: 1, hi: 1 });
  assert.deepEqual(partRange(10), { lo: 1, hi: 9 });
  assert.deepEqual(partRange(14), { lo: 5, hi: 9 });
  assert.deepEqual(partRange(18), { lo: 9, hi: 9 });
});

test('trayFor: 5 unique sorted rods containing the answer, near distractors first', () => {
  const rng = lcg(1);
  for (let ans = 1; ans <= 9; ans++) for (let i = 0; i < 50; i++) {
    const t = trayFor(ans, rng);
    assert.equal(t.length, 5); assert.equal(new Set(t).size, 5);
    assert.ok(t.includes(ans)); assert.deepEqual([...t].sort((x, y) => x - y), t);
    assert.ok(t.every(v => v >= 1 && v <= 9), 'no 10 rod offered');
    const near = [ans - 1, ans + 1, ans - 2, ans + 2].filter(v => v >= 1 && v <= 9);
    for (const v of near) assert.ok(t.includes(v), `near ${v} for ${ans}`);
  }
});

for (const [name, gen, type] of [['genBuild', genBuild, 'build'], ['genBreak', genBreak, 'break']]) {
  test(`${name}: valid questions in every world`, () => {
    const rng = lcg(7);
    for (let w = 1; w <= 4; w++) for (let i = 0; i < 300; i++) {
      const q = gen(w, rng);
      const wd = world(w);
      assert.equal(q.type, type);
      assert.ok(q.n >= wd.min && q.n <= wd.max, 'n in range');
      assert.equal(q.a + q.b, q.n);
      assert.ok(q.a >= 1 && q.a <= 9 && q.b >= 1 && q.b <= 9, 'single-digit parts');
      assert.ok(q.tray.every(v => v <= 9));
      assert.ok(q.tray.includes(q.b));
    }
  });
}

test('gen avoids repeating the previous (n, a)', () => {
  const rng = lcg(3);
  let prev = null;
  for (let i = 0; i < 500; i++) { const q = genBuild(3, rng, prev); if (prev) assert.ok(!(q.n === prev.n && q.a === prev.a)); prev = q; }
});

test('genRush mixes build and break', () => {
  const rng = lcg(9); const c = { build: 0, break: 0 };
  for (let i = 0; i < 1000; i++) c[genRush(2, rng).type]++;
  assert.ok(c.build > 400 && c.break > 400, JSON.stringify(c));
});

test('splitsOf lists all splits with parts 1..9', () => {
  assert.deepEqual(splitsOf(5), [[1, 4], [2, 3], [3, 2], [4, 1]]);
  assert.deepEqual(splitsOf(11), [[2, 9], [3, 8], [4, 7], [5, 6], [6, 5], [7, 4], [8, 3], [9, 2]]);
  assert.deepEqual(splitsOf(18), [[9, 9]]);
  assert.deepEqual(splitsOf(10).length, 9);
});

test('houseFor picks a boss number of the world', () => {
  const rng = lcg(5);
  for (let w = 1; w <= 4; w++) for (let i = 0; i < 50; i++) {
    const h = houseFor(w, rng);
    assert.ok(world(w).boss.includes(h.n));
    assert.deepEqual(h.floors, splitsOf(h.n));
    assert.deepEqual(h.tray, [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  }
});

test('levelPlan matches the level table', () => {
  const rng = lcg(11);
  const types = (w, l) => levelPlan(w, l, rng).questions.map(q => q.type);
  for (const l of [1, 4]) assert.deepEqual(types(2, l), Array(5).fill('build'));
  for (const l of [2, 5]) assert.deepEqual(types(2, l), Array(5).fill('break'));
  for (const l of [3, 6]) { const t = types(2, l); assert.equal(t.filter(x => x === 'build').length, 3); assert.equal(t.length, 5); }
  assert.equal(levelPlan(1, 3, rng).labels, true);
  assert.equal(levelPlan(1, 4, rng).labels, false);
});

test('starsFor thresholds', () => {
  assert.equal(starsFor(0), 3); assert.equal(starsFor(1), 2); assert.equal(starsFor(2), 2); assert.equal(starsFor(3), 1); assert.equal(starsFor(9), 1);
});

test('levelKey', () => { assert.equal(levelKey(2, 5), 'w2-5'); assert.equal(levelKey(4, 'boss'), 'w4-boss'); });

test('unlock rules', () => {
  const p = emptyProgress();
  assert.equal(isWorldOpen(p, 1, {}, false), false, 'w1 needs teacher');
  assert.equal(isWorldOpen(p, 1, { w1: true }, false), true);
  assert.equal(isWorldOpen(p, 2, ALL, false), false, 'w2 needs w1 boss');
  assert.equal(isLevelOpen(p, 1, 1, ALL, false), true);
  assert.equal(isLevelOpen(p, 1, 2, ALL, false), false);
  p.levels['w1-1'] = 1;
  assert.equal(isLevelOpen(p, 1, 2, ALL, false), true);
  assert.equal(isLevelOpen(p, 1, 'boss', ALL, false), false);
  for (let l = 2; l <= 6; l++) p.levels['w1-' + l] = 2;
  assert.equal(isLevelOpen(p, 1, 'boss', ALL, false), true);
  assert.equal(isRushOpen(p, 1, ALL, false), false);
  p.levels['w1-boss'] = 1;
  assert.equal(isRushOpen(p, 1, ALL, false), true);
  assert.equal(isWorldOpen(p, 2, ALL, false), true);
  assert.equal(isWorldOpen(p, 2, { w1: true }, false), false, 'w2 also needs teacher');
  assert.equal(isLevelOpen(emptyProgress(), 4, 'boss', {}, true), true, 'test mode opens all');
  assert.equal(isRushOpen(emptyProgress(), 4, {}, true), true);
});

test('bumpStreak', () => {
  assert.deepEqual(bumpStreak({ count: 0, lastDay: null }, '2026-09-25'), { count: 1, lastDay: '2026-09-25' });
  assert.deepEqual(bumpStreak({ count: 3, lastDay: '2026-09-25' }, '2026-09-25'), { count: 3, lastDay: '2026-09-25' });
  assert.deepEqual(bumpStreak({ count: 3, lastDay: '2026-09-24' }, '2026-09-25'), { count: 4, lastDay: '2026-09-25' });
  assert.deepEqual(bumpStreak({ count: 3, lastDay: '2026-09-22' }, '2026-09-25'), { count: 1, lastDay: '2026-09-25' });
  assert.deepEqual(bumpStreak({ count: 5, lastDay: '2026-02-28' }, '2026-03-01'), { count: 6, lastDay: '2026-03-01' });
});

test('recordResult keeps best, awards sticker once, bumps streak, does not mutate input', () => {
  const p0 = emptyProgress();
  const r1 = recordResult(p0, 'w1-1', 2, '2026-09-25');
  assert.deepEqual(p0, emptyProgress());
  assert.equal(r1.progress.levels['w1-1'], 2); assert.equal(r1.newBest, true); assert.equal(r1.sticker, null);
  const r2 = recordResult(r1.progress, 'w1-1', 1, '2026-09-25');
  assert.equal(r2.progress.levels['w1-1'], 2); assert.equal(r2.newBest, false);
  const r3 = recordResult(r2.progress, 'w1-boss', 3, '2026-09-26');
  assert.equal(r3.sticker, 1); assert.deepEqual(r3.progress.stickers, ['w1']); assert.equal(r3.progress.streak.count, 2);
  const r4 = recordResult(r3.progress, 'w1-boss', 3, '2026-09-26');
  assert.equal(r4.sticker, null); assert.deepEqual(r4.progress.stickers, ['w1']);
});

test('mergeProgress: best stars, union stickers, newer streak', () => {
  const a = { levels: { 'w1-1': 3, 'w1-2': 1 }, stickers: ['w1'], streak: { count: 2, lastDay: '2026-09-20' } };
  const b = { levels: { 'w1-2': 2, 'w2-1': 1 }, stickers: ['w2'], streak: { count: 1, lastDay: '2026-09-25' } };
  assert.deepEqual(mergeProgress(a, b), { levels: { 'w1-1': 3, 'w1-2': 2, 'w2-1': 1 }, stickers: ['w1', 'w2'], streak: { count: 1, lastDay: '2026-09-25' } });
  assert.deepEqual(mergeProgress(null, b), mergeProgress(emptyProgress(), b));
});

test('makeTenMove', () => {
  assert.equal(makeTenMove(3, 4), null, 'n < 11');
  assert.equal(makeTenMove(10, 4), null, 'part already 10');
  assert.deepEqual(makeTenMove(9, 5), { from: 'b', to: 'a', count: 1 });
  assert.deepEqual(makeTenMove(6, 8), { from: 'a', to: 'b', count: 2 });
  assert.deepEqual(makeTenMove(7, 7), { from: 'b', to: 'a', count: 3 });
});
