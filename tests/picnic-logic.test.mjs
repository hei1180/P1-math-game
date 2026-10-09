import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CHAPTERS, LEVELS, QUESTIONS_PER_LEVEL, GENERATORS, makeRng, pair, SUM_RANGE, nextDiff, numChoices, tilesFor,
  makeQuestion, eqMatches, eqIsTrue, starsFor, emptyProgress, isLevelOpen, isChapterOpen, recordResult, mergeProgress,
  chapterDone, levelKey, modeKey, speakable,
} from '../picnic-logic.js';

const TYPES = ['countOn', 'takeAway', 'compare', 'buildEq', 'cards', 'choice', 'judge'];

test('three chapters, five levels each, six known question kinds per level', () => {
  assert.deepEqual(CHAPTERS.map(c => c.key), ['add', 'sub', 'zero']);
  for (const c of CHAPTERS) {
    assert.equal(LEVELS[c.key].length, 5);
    for (const lv of LEVELS[c.key]) {
      assert.equal(lv.plan.length, QUESTIONS_PER_LEVEL);
      for (const k of lv.plan) assert.ok(GENERATORS[k], `generator ${k}`);
      assert.ok(lv.bloom && lv.goal && lv.intro && lv.intro.lines.length);
    }
  }
});

test('pair: single-digit parts, sum in the difficulty range', () => {
  const rng = makeRng(3);
  for (let d = 0; d <= 2; d++) for (let i = 0; i < 500; i++) {
    const [a, b] = pair(rng, d);
    assert.ok(a >= 1 && a <= 9 && b >= 1 && b <= 9);
    assert.ok(a + b >= SUM_RANGE[d][0] && a + b <= SUM_RANGE[d][1]);
  }
});

test('nextDiff: two clean answers step up, a struggle steps down, clamped 0..2', () => {
  let s = { diff: 0, streak: 0 };
  s = nextDiff(s, 1); assert.deepEqual(s, { diff: 0, streak: 1 });
  s = nextDiff(s, 1); assert.deepEqual(s, { diff: 1, streak: 0 });
  s = nextDiff(s, 3); assert.deepEqual(s, { diff: 0, streak: 0 });
  s = nextDiff(s, 3); assert.deepEqual(s, { diff: 0, streak: 0 });
  assert.equal(nextDiff(nextDiff({ diff: 2, streak: 0 }, 1), 1).diff, 2);
});

test('numChoices: unique, sorted, in range, contains the answer', () => {
  const rng = makeRng(5);
  for (let ans = 0; ans <= 18; ans++) for (let i = 0; i < 30; i++) {
    const c = numChoices(rng, ans, { lo: 0, hi: 18, slips: [ans + 7, -3] });
    assert.equal(c.length, 4); assert.equal(new Set(c).size, 4);
    assert.ok(c.includes(ans)); assert.deepEqual([...c].sort((x, y) => x - y), c);
    assert.ok(c.every(v => v >= 0 && v <= 18));
  }
});

test('tilesFor keeps every needed number', () => {
  const rng = makeRng(9);
  for (let i = 0; i < 200; i++) {
    const t = tilesFor(rng, [3, 0, 3]);
    assert.ok(t.includes(0) && t.includes(3)); assert.equal(new Set(t).size, t.length);
  }
});

test('every generated question is well formed and inside the P1 boundaries', () => {
  const rng = makeRng(11);
  for (const c of CHAPTERS) for (let n = 1; n <= 5; n++) for (let i = 0; i < QUESTIONS_PER_LEVEL; i++) for (let d = 0; d <= 2; d++) for (let r = 0; r < 40; r++) {
    const q = makeQuestion(c.key, n, i, d, rng);
    const where = `${c.key}-${n} slot ${i} ${q.kind}`;
    assert.ok(TYPES.includes(q.type), where + ' type');
    assert.ok(q.prompt && q.hint && q.help && q.item, where + ' text');
    if (q.choices) {
      assert.ok(q.choices.some(x => x === q.answer), where + ' answer in choices');
      assert.equal(new Set(q.choices.map(String)).size, q.choices.length, where + ' unique choices');
    }
    if (q.eq) {
      const nums = q.eq.filter(t => typeof t === 'number');
      assert.ok(nums.every(v => v >= 0 && v <= 18), where + ' numbers 0-18');
      assert.equal(q.eq.filter(t => t === '?').length, 1, where + ' one box');
      // Fill the box with the answer: the equation must hold.
      const full = q.eq.map(t => (t === '?' ? q.answer : t));
      if (full.length === 5) assert.ok(eqIsTrue(full), where + ' ' + full.join(' '));
      else assert.equal(full[0] + full[2], full[4] + full[6], where + ' swap ' + full.join(' '));
    }
    if (q.type === 'countOn') { assert.equal(q.answer, q.a + q.b); assert.ok(q.a + q.b <= 14, 'count-on stays small'); }
    if (q.type === 'takeAway') { assert.equal(q.answer, q.n - q.k); assert.ok(q.k <= 9 && q.n <= 18); }
    if (q.type === 'compare') { assert.equal(q.answer, Math.abs(q.a.n - q.b.n)); assert.ok(q.answer >= 1); }
    if (q.type === 'buildEq' || q.type === 'cards') {
      for (const a of q.accept) {
        assert.ok(eqIsTrue(a), where + ' accepted eq true ' + a.join(' '));
        const nums = a.filter(t => typeof t === 'number');
        if (q.type === 'buildEq') assert.ok(nums.every(v => q.tiles.includes(v)), where + ' tiles cover accepted');
        if (q.type === 'cards') assert.ok(nums.every(v => q.cards.includes(v)), where + ' cards cover accepted');
        if (a.includes(0)) continue; // 0 facts (n + 0, n − 0, n − n) may use any number up to 18
        if (a[1] === '+') assert.ok(a[0] <= 9 && a[2] <= 9, where + ' single-digit addends');
        else assert.ok(a[2] <= 9 && a[4] <= 9, where + ' single-digit subtrahend and difference');
      }
      if (q.type === 'cards') assert.equal(q.accept.length, q.need);
    }
    if (q.type === 'judge') {
      assert.equal(typeof q.right, 'boolean');
      if (q.fix) { assert.equal(q.right, false); assert.ok(q.fix.choices.includes(q.fix.answer)); }
    }
  }
});

test('subtraction questions never ask a smaller number minus a bigger one', () => {
  const rng = makeRng(21);
  for (let i = 0; i < 2000; i++) {
    const q = makeQuestion('sub', 1 + (i % 5), i % 6, i % 3, rng);
    if (q.eq && q.eq[1] === '−' && typeof q.eq[0] === 'number' && typeof q.eq[2] === 'number') assert.ok(q.eq[0] >= q.eq[2]);
  }
});

test('eqMatches / eqIsTrue', () => {
  assert.ok(eqMatches([6, '+', 2, '=', 8], [[2, '+', 6, '=', 8], [6, '+', 2, '=', 8]]));
  assert.ok(!eqMatches([8, '−', 2, '=', 6], [[8, '−', 6, '=', 2]]));
  assert.ok(eqIsTrue([8, '−', 2, '=', 6])); assert.ok(!eqIsTrue([2, '−', 8, '=', 6])); assert.ok(!eqIsTrue([1, '=', 2, '+', 3]));
});

test('stars, unlocks, stickers, merge', () => {
  assert.deepEqual([0, 1, 2, 4, 5, 9].map(starsFor), [3, 3, 2, 2, 1, 1]);
  let p = emptyProgress();
  assert.ok(!isChapterOpen('add', {}));
  assert.ok(isLevelOpen(p, 'add', 1, { add: true }));
  assert.ok(!isLevelOpen(p, 'add', 2, { add: true }));
  assert.ok(isLevelOpen(p, 'sub', 4, {}, true), 'test mode opens everything');
  for (let n = 1; n <= 5; n++) {
    const r = recordResult(p, 'add', n, 2, 6);
    assert.equal(r.sticker, n === 5 ? 'add' : null);
    p = r.progress;
    if (n < 5) assert.ok(isLevelOpen(p, 'add', n + 1, { add: true }));
  }
  assert.ok(chapterDone(p, 'add')); assert.equal(p.treats, 30);
  const again = recordResult(p, 'add', 1, 1, 6);
  assert.equal(again.progress.levels['add-1'], 2, 'best kept'); assert.equal(again.sticker, null);
  const m = mergeProgress({ levels: { 'add-1': 3 }, stickers: ['add'], treats: 5 }, { levels: { 'add-1': 1, 'sub-1': 2 }, stickers: ['sub', 'bogus'], treats: 9 });
  assert.deepEqual(m, { levels: { 'add-1': 3, 'sub-1': 2 }, stickers: ['add', 'sub'], treats: 9 });
  assert.deepEqual(mergeProgress(null, null), emptyProgress());
});

test('keys and speech text', () => {
  assert.equal(levelKey('zero', 3), 'zero-3');
  assert.equal(modeKey('add', 1), 'picnicAdd1'); assert.equal(modeKey('zero', 5), 'picnicZero5');
  assert.equal(speakable('盤上有 🧁 6 個。8 − 3 = □'), '盤上有 6 個。8 減 3 等於 幾多');
});
