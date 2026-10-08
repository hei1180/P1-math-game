import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gameOf, modeLabel, GAME_LABEL } from '../labels.js';

test('gameOf maps raw mode keys to games', () => {
  for (const m of ['easy', 'medium', 'hard']) assert.equal(gameOf(m), 'market');
  for (const m of ['num1', 'num4']) assert.equal(gameOf(m), 'numbers');
  for (const m of ['bonds1', 'bonds4', 'w1-1', 'w2-boss', 'w4-6']) assert.equal(gameOf(m), 'bonds');
  assert.equal(gameOf('???'), 'unknown');
});

test('modeLabel is human and bilingual', () => {
  assert.equal(modeLabel('easy'), 'Market · Easy 1-10');
  assert.equal(modeLabel('medium'), 'Market · Medium 1-20');
  assert.equal(modeLabel('hard'), 'Market · Hard');
  assert.equal(modeLabel('num3'), 'Number Shop Lv3 數線');
  assert.equal(modeLabel('bonds2'), 'Rod Town Rush W2');
  assert.equal(modeLabel('w1-4'), 'Rod Town W1 第4關');
  assert.equal(modeLabel('w2-boss'), 'Rod Town W2 數字屋');
  assert.equal(modeLabel('zzz'), 'zzz');
});

test('GAME_LABEL', () => {
  assert.equal(GAME_LABEL.market, '🍎 Math Market');
  assert.equal(GAME_LABEL.numbers, '🔢 Number Shop');
  assert.equal(GAME_LABEL.bonds, '🚂 Rod Town');
});

test('Robot Workshop labels', () => {
  assert.equal(GAME_LABEL.shapes, '🤖 Robot Workshop');
  for (const m of ['shapesA1', 'shapesB4', 'shapesBoss', 'shapes3d', 'shapes2d']) assert.equal(gameOf(m), 'shapes', m);
  assert.equal(gameOf('shapesC1'), 'unknown');
  assert.equal(modeLabel('shapesA1'), 'Robot Workshop A1 滾動測試');
  assert.equal(modeLabel('shapesB3'), 'Robot Workshop B3 釘板圍圖形');
  assert.equal(modeLabel('shapesBoss'), 'Robot Workshop 測試跑道');
  assert.equal(modeLabel('shapes3d'), 'Robot Workshop Rush 立體');
  assert.equal(modeLabel('shapes2d'), 'Robot Workshop Rush 平面');
});
