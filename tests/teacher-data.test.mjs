import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  toDate, fallbackName, buildStudentIndex, countMedals, worldClearCounts, WORLD_TOTAL_LEVELS,
  buildOverviewRows, sortRows, buildAttemptRows, filterAttemptRows, formatDuration, scoreOrStars,
  csvEscape, toCSV, overviewToCSVRows, OVERVIEW_HEADERS, attemptsToCSVRows, ATTEMPTS_HEADERS, csvFilename,
} from '../teacher-data.js';

// ---------- toDate ----------

test('toDate handles Firestore Timestamp, Date, string and null', () => {
  const fakeTimestamp = { toDate: () => new Date('2026-09-20T10:00:00Z') };
  assert.equal(toDate(fakeTimestamp).getTime(), new Date('2026-09-20T10:00:00Z').getTime());
  const d = new Date('2026-09-21T00:00:00Z');
  assert.equal(toDate(d), d);
  assert.equal(toDate('2026-09-22T00:00:00Z').getTime(), new Date('2026-09-22T00:00:00Z').getTime());
  assert.equal(toDate(null), null);
  assert.equal(toDate(undefined), null);
  assert.equal(toDate('not a date'), null);
});

// ---------- student merge ----------

test('buildStudentIndex merges name/email across collections, attempts win when present', () => {
  const attempts = [
    { uid: 'u1', name: 'Amy Chan', email: 'amy@clam.edu.hk', ts: new Date() },
  ];
  const scores = [
    { uid: 'u1', playerName: 'Old Amy', mode: 'easy', score: 10 },
    { uid: 'u2', playerName: 'Ben Lee', mode: 'easy', score: 5 }, // no email (old doc)
  ];
  const bondsProgress = [
    { uid: 'u2', name: 'Ben Lee', levels: {} }, // no email either
    { uid: 'u3', levels: {} }, // no name/email anywhere: pure uid fallback
  ];
  const idx = buildStudentIndex({ attempts, scores, bondsProgress });
  assert.equal(idx.get('u1').name, 'Amy Chan'); // attempts overrides scores' old name
  assert.equal(idx.get('u1').email, 'amy@clam.edu.hk');
  assert.equal(idx.get('u2').name, 'Ben Lee');
  assert.equal(idx.get('u2').email, '');
  assert.equal(idx.get('u3').name, fallbackName('u3'));
  assert.equal(idx.get('u3').email, '');
  assert.equal(idx.size, 3);
});

test('buildStudentIndex reads bondsProgress uid from doc.id when no uid field', () => {
  const bondsProgress = [{ id: 'u9', name: 'Cara', levels: {} }];
  const idx = buildStudentIndex({ bondsProgress });
  assert.equal(idx.get('u9').name, 'Cara');
});

// ---------- medals / world clears ----------

test('countMedals counts stars 3/2/1 as gold/silver/bronze, ignores 0', () => {
  const levels = { 'w1-1': 3, 'w1-2': 2, 'w1-3': 1, 'w1-4': 0, 'w1-boss': 3 };
  assert.deepEqual(countMedals(levels), { gold: 2, silver: 1, bronze: 1 });
  assert.deepEqual(countMedals({}), { gold: 0, silver: 0, bronze: 0 });
  assert.deepEqual(countMedals(undefined), { gold: 0, silver: 0, bronze: 0 });
});

test('worldClearCounts counts cleared levels (stars>0) + boss per world, out of WORLD_TOTAL_LEVELS', () => {
  assert.equal(WORLD_TOTAL_LEVELS, 7);
  const levels = { 'w1-1': 3, 'w1-2': 1, 'w1-3': 0, 'w1-boss': 2, 'w2-1': 1 };
  const clears = worldClearCounts(levels);
  assert.equal(clears.w1, 3); // levels 1,2 cleared + boss cleared = 3
  assert.equal(clears.w2, 1);
  assert.equal(clears.w3, 0);
  assert.equal(clears.w4, 0);
});

// ---------- overview rows ----------

function sample() {
  const now = new Date('2026-09-25T09:00:00Z');
  const earlier = new Date('2026-09-24T09:00:00Z');
  const attempts = [
    { uid: 'u1', name: 'Amy Chan', email: 'amy@clam.edu.hk', game: 'market', mode: 'easy', kind: 'timed', score: 40, durationSec: 30, ts: now },
    { uid: 'u1', name: 'Amy Chan', email: 'amy@clam.edu.hk', game: 'bonds', mode: 'w1-1', kind: 'level', stars: 3, mistakes: 0, durationSec: 45, ts: earlier },
  ];
  const scores = [
    { uid: 'u1', playerName: 'Amy Chan', mode: 'easy', score: 40 },
    { uid: 'u1', playerName: 'Amy Chan', mode: 'bonds1', score: 12 },
    { uid: 'u2', playerName: 'Ben Lee', mode: 'num2', score: 8 },
  ];
  const bondsProgress = [
    { uid: 'u1', name: 'Amy Chan', levels: { 'w1-1': 3, 'w1-2': 2 } },
  ];
  return { attempts, scores, bondsProgress };
}

test('buildOverviewRows merges attempts/scores/bondsProgress into one row per student, sorted by name', () => {
  const rows = buildOverviewRows(sample());
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((r) => r.name), ['Amy Chan', 'Ben Lee']);

  const amy = rows.find((r) => r.uid === 'u1');
  assert.equal(amy.attemptsInRange, 2);
  assert.equal(amy.totalMinutes, Math.round(((30 + 45) / 60) * 10) / 10);
  assert.equal(amy.market.easy, 40);
  assert.equal(amy.market.medium, null);
  assert.equal(amy.rush.w1, 12);
  assert.deepEqual(amy.bondsMedals, { gold: 1, silver: 1, bronze: 0 });
  assert.equal(amy.bondsCleared.w1, 2);
  assert.equal(amy.lastPlayed.getTime(), new Date('2026-09-25T09:00:00Z').getTime());

  const ben = rows.find((r) => r.uid === 'u2');
  assert.equal(ben.attemptsInRange, 0);
  assert.equal(ben.numbers.num2, 8);
  assert.equal(ben.lastPlayed, null);
});

test('buildOverviewRows handles empty input', () => {
  assert.deepEqual(buildOverviewRows(), []);
  assert.deepEqual(buildOverviewRows({}), []);
});

test('sortRows sorts by dotted path, nulls last, both directions', () => {
  const rows = [{ name: 'B', market: { easy: null } }, { name: 'A', market: { easy: 5 } }, { name: 'C', market: { easy: 2 } }];
  assert.deepEqual(sortRows(rows, 'market.easy').map((r) => r.name), ['C', 'A', 'B']);
  assert.deepEqual(sortRows(rows, 'market.easy', -1).map((r) => r.name), ['A', 'C', 'B']);
});

// ---------- attempts tab ----------

test('buildAttemptRows formats + sorts newest first, falls back mode label/game', () => {
  const attempts = [
    { uid: 'u1', name: 'Amy', game: 'bonds', mode: 'w1-2', kind: 'level', stars: 2, mistakes: 1, durationSec: 75, ts: new Date('2026-09-20T08:05:00') },
    { uid: 'u1', name: 'Amy', game: 'market', mode: 'easy', kind: 'timed', score: 30, accuracy: 90, durationSec: 30, ts: new Date('2026-09-21T08:05:00') },
  ];
  const rows = buildAttemptRows(attempts);
  assert.equal(rows[0].mode, 'easy'); // newest first
  assert.equal(rows[0].primary, '30');
  assert.equal(rows[0].duration, '30s');
  assert.equal(rows[1].primary, '⭐⭐');
  assert.equal(rows[1].modeLabel, 'Rod Town W1 第2關');
  assert.equal(rows[1].duration, '1m 15s');
});

test('scoreOrStars and formatDuration edge cases', () => {
  assert.equal(scoreOrStars({ kind: 'level', stars: 0 }), '');
  assert.equal(scoreOrStars({ kind: 'level', stars: 3 }), '⭐⭐⭐');
  assert.equal(scoreOrStars({ kind: 'timed', score: 0 }), '0');
  assert.equal(scoreOrStars({ kind: 'timed', score: null }), '');
  assert.equal(formatDuration(null), '');
  assert.equal(formatDuration(59), '59s');
  assert.equal(formatDuration(60), '1m 0s');
  assert.equal(formatDuration(125), '2m 5s');
});

test('filterAttemptRows filters by game, uid, and date range', () => {
  const rows = buildAttemptRows([
    { uid: 'u1', game: 'market', mode: 'easy', kind: 'timed', score: 1, ts: new Date('2026-09-20') },
    { uid: 'u2', game: 'bonds', mode: 'w1-1', kind: 'level', stars: 1, ts: new Date('2026-09-22') },
  ]);
  assert.equal(filterAttemptRows(rows, { game: 'bonds' }).length, 1);
  assert.equal(filterAttemptRows(rows, { uid: 'u1' }).length, 1);
  assert.equal(filterAttemptRows(rows, { from: new Date('2026-09-21') }).length, 1);
  assert.equal(filterAttemptRows(rows, { to: new Date('2026-09-21') }).length, 1);
  assert.equal(filterAttemptRows(rows, {}).length, 2);
});

// ---------- CSV ----------

test('csvEscape quotes fields with commas, quotes, or newlines; doubles inner quotes', () => {
  assert.equal(csvEscape('plain'), 'plain');
  assert.equal(csvEscape('a,b'), '"a,b"');
  assert.equal(csvEscape('she said "hi"'), '"she said ""hi"""');
  assert.equal(csvEscape('line1\nline2'), '"line1\nline2"');
  assert.equal(csvEscape('cr\rlf'), '"cr\rlf"');
  assert.equal(csvEscape(null), '');
  assert.equal(csvEscape(undefined), '');
  assert.equal(csvEscape(42), '42');
});

test('csvEscape leaves Chinese text unescaped (no special chars)', () => {
  assert.equal(csvEscape('陳大文'), '陳大文');
  assert.equal(csvEscape('數學,市場'), '"數學,市場"');
});

test('toCSV starts with a UTF-8 BOM and CRLF-joins rows', () => {
  const csv = toCSV(['Name', 'Score'], [['Amy, A.', 5], ['陳大文', 10]]);
  assert.equal(csv[0], '﻿');
  const body = csv.slice(1);
  const lines = body.split('\r\n');
  assert.equal(lines[0], 'Name,Score');
  assert.equal(lines[1], '"Amy, A.",5');
  assert.equal(lines[2], '陳大文,10');
});

test('overviewToCSVRows / OVERVIEW_HEADERS line up, and round-trip through toCSV', () => {
  const rows = buildOverviewRows(sample());
  const csvRows = overviewToCSVRows(rows);
  assert.equal(csvRows[0].length, OVERVIEW_HEADERS.length);
  const csv = toCSV(OVERVIEW_HEADERS, csvRows);
  assert.match(csv, /^﻿Name 姓名,Email,/);
  assert.match(csv, /Amy Chan/);
});

test('attemptsToCSVRows / ATTEMPTS_HEADERS line up', () => {
  const rows = buildAttemptRows(sample().attempts);
  const csvRows = attemptsToCSVRows(rows);
  assert.equal(csvRows[0].length, ATTEMPTS_HEADERS.length);
  const csv = toCSV(ATTEMPTS_HEADERS, csvRows);
  assert.match(csv, /^﻿Date 日期,/);
});

test('csvFilename matches p1maths-<tab>-YYYYMMDD.csv', () => {
  const name = csvFilename('overview');
  assert.match(name, /^p1maths-overview-\d{8}\.csv$/);
});
