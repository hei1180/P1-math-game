import { test } from 'node:test';
import assert from 'node:assert/strict';
import { trophyFor, validateCutoffs, DEFAULT_TROPHY, TROPHY_ICON, TROPHY_LABEL } from '../trophy.js';

test('defaults are 300/700/1200', () => {
  assert.deepEqual(DEFAULT_TROPHY, { bronze: 300, silver: 700, gold: 1200 });
});

test('score 0 or negative or NaN gives null', () => {
  assert.equal(trophyFor(0), null);
  assert.equal(trophyFor(-5), null);
  assert.equal(trophyFor(NaN), null);
  assert.equal(trophyFor(undefined), null);
});

test('boundaries at exact cutoffs', () => {
  assert.equal(trophyFor(1), 'finisher');
  assert.equal(trophyFor(299), 'finisher');
  assert.equal(trophyFor(300), 'bronze');
  assert.equal(trophyFor(699), 'bronze');
  assert.equal(trophyFor(700), 'silver');
  assert.equal(trophyFor(1199), 'silver');
  assert.equal(trophyFor(1200), 'gold');
  assert.equal(trophyFor(5000), 'gold');
});

test('custom cutoffs are respected', () => {
  const c = { bronze: 10, silver: 20, gold: 30 };
  assert.equal(trophyFor(15, c), 'bronze');
  assert.equal(trophyFor(30, c), 'gold');
});

test('every tier has an icon and label', () => {
  for (const t of ['gold', 'silver', 'bronze', 'finisher']) {
    assert.ok(TROPHY_ICON[t], t + ' icon');
    assert.ok(TROPHY_LABEL[t], t + ' label');
  }
});

test('validateCutoffs requires 0 < bronze < silver < gold', () => {
  assert.equal(validateCutoffs({ bronze: 300, silver: 700, gold: 1200 }), true);
  assert.equal(validateCutoffs({ bronze: 700, silver: 300, gold: 1200 }), false);
  assert.equal(validateCutoffs({ bronze: 0, silver: 700, gold: 1200 }), false);
  assert.equal(validateCutoffs({ bronze: 300, silver: 300, gold: 1200 }), false);
  assert.equal(validateCutoffs({ bronze: 'a', silver: 700, gold: 1200 }), false);
  assert.equal(validateCutoffs(null), false);
});
