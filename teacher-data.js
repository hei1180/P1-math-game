// Pure data-shaping for teacher.html. No DOM, no Firebase — takes plain arrays of
// already-fetched Firestore docs (or plain test fixtures) and returns plain objects/strings.
// Firestore Timestamp objects (with a .toDate() method) are supported via toDate() below,
// so callers can pass raw snapshot data straight through.
import { GAME_LABEL, modeLabel, gameOf } from './labels.js?v=202610081243';
import { WORLDS, LEVEL_COUNT, levelKey } from './bonds-logic.js?v=202610081243';

export { GAME_LABEL, modeLabel, gameOf };

// ---------- helpers ----------

/** Firestore Timestamp | Date | number | string | null → Date | null. */
export function toDate(v) {
  if (!v) return null;
  if (typeof v.toDate === 'function') return v.toDate();
  if (v instanceof Date) return v;
  if (typeof v === 'number' || typeof v === 'string') {
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

/** Readable stand-in name for old docs that never got a `name` field. */
export function fallbackName(uid) {
  const tail = String(uid || '').slice(-6) || '??????';
  return `Student ${tail}`;
}

function groupBy(arr, key) {
  const m = new Map();
  for (const item of arr) {
    const k = item && item[key];
    if (!k) continue;
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(item);
  }
  return m;
}

// ---------- student identity merge ----------

/**
 * Merge name/email for every uid seen across attempts, scores and bondsProgress.
 * Old docs may be missing name/email; newer attempts docs are the most reliable source
 * (they always carry name+email once the write path lands), so they win when present.
 * Returns Map<uid, {uid, name, email}>.
 */
export function buildStudentIndex({ attempts = [], scores = [], bondsProgress = [] } = {}) {
  const idx = new Map();
  const ensure = (uid) => {
    if (!uid) return null;
    if (!idx.has(uid)) idx.set(uid, { uid, name: '', email: '' });
    return idx.get(uid);
  };
  // Lowest priority first: bondsProgress, then scores, then attempts (most authoritative).
  for (const b of bondsProgress) {
    const s = ensure(b.uid || b.id);
    if (!s) continue;
    if (b.name && !s.name) s.name = b.name;
    if (b.email && !s.email) s.email = b.email;
  }
  for (const sc of scores) {
    const s = ensure(sc.uid);
    if (!s) continue;
    if (sc.playerName && !s.name) s.name = sc.playerName;
    if (sc.email && !s.email) s.email = sc.email;
  }
  for (const a of attempts) {
    const s = ensure(a.uid);
    if (!s) continue;
    if (a.name) s.name = a.name;
    if (a.email) s.email = a.email;
  }
  for (const s of idx.values()) if (!s.name) s.name = fallbackName(s.uid);
  return idx;
}

// ---------- Rod Town medals / progress ----------

export const STAR_MEDAL = { 3: 'gold', 2: 'silver', 1: 'bronze' };
export const MEDAL_ICON = { gold: '🥇', silver: '🥈', bronze: '🥉' };

/** {gold,silver,bronze} counts from a bondsProgress `levels` map of key → stars(1-3). */
export function countMedals(levels = {}) {
  const counts = { gold: 0, silver: 0, bronze: 0 };
  for (const stars of Object.values(levels || {})) {
    const medal = STAR_MEDAL[stars];
    if (medal) counts[medal]++;
  }
  return counts;
}

/** Levels cleared (stars > 0) per world, out of LEVEL_COUNT+1 (6 levels + boss). {w1: n, ...} */
export function worldClearCounts(levels = {}) {
  const out = {};
  for (const wd of WORLDS) {
    let cleared = 0;
    for (let l = 1; l <= LEVEL_COUNT; l++) if ((levels[levelKey(wd.w, l)] || 0) > 0) cleared++;
    if ((levels[levelKey(wd.w, 'boss')] || 0) > 0) cleared++;
    out[wd.key] = cleared;
  }
  return out;
}

export const WORLD_TOTAL_LEVELS = LEVEL_COUNT + 1; // + boss

/** Robot Workshop courses shown in the overview, in order. attempt mode = 'shapes' + key. */
export const SHAPES_COURSES = ['A1', 'A2', 'A3', 'A4', 'B1', 'B2', 'B3', 'B4', 'Boss'];
export const OVERVIEW_GAMES = ['market', 'numbers', 'bonds', 'shapes'];

// ---------- Overview tab ----------

/**
 * One row per student, merged across attempts (already date-range filtered by the caller),
 * scores (best per mode, all-time) and bondsProgress (all-time). Sorted by name.
 */
export function buildOverviewRows({ attempts = [], scores = [], bondsProgress = [] } = {}) {
  const index = buildStudentIndex({ attempts, scores, bondsProgress });
  const attemptsByUid = groupBy(attempts, 'uid');
  const scoresByUid = groupBy(scores, 'uid');
  const bondsByUid = new Map();
  for (const b of bondsProgress) {
    const uid = b.uid || b.id;
    if (uid) bondsByUid.set(uid, b);
  }

  const rows = [];
  for (const student of index.values()) {
    const uid = student.uid;
    const aList = attemptsByUid.get(uid) || [];
    const sList = scoresByUid.get(uid) || [];
    const bp = bondsByUid.get(uid);

    let lastPlayed = null;
    let totalSeconds = 0;
    for (const a of aList) {
      const t = toDate(a.ts);
      if (t && (!lastPlayed || t > lastPlayed)) lastPlayed = t;
      totalSeconds += Number(a.durationSec) || 0;
    }

    const bestByMode = {};
    for (const sc of sList) {
      if (!sc || !sc.mode) continue;
      const prev = bestByMode[sc.mode] || 0;
      if ((sc.score || 0) > prev) bestByMode[sc.mode] = sc.score || 0;
    }

    const levels = (bp && bp.levels) || {};

    // Per game: attempts / minutes / last played in range, and whether the student has any data there at all.
    const byGame = {};
    for (const g of OVERVIEW_GAMES) byGame[g] = { attempts: 0, minutes: 0, lastPlayed: null, active: false };
    const shapesStars = Object.fromEntries(SHAPES_COURSES.map((k) => [k, null]));
    for (const a of aList) {
      const g = byGame[a.game || gameOf(a.mode)];
      if (!g) continue;
      g.attempts++;
      g.active = true;
      g.minutes += (Number(a.durationSec) || 0) / 60;
      const t = toDate(a.ts);
      if (t && (!g.lastPlayed || t > g.lastPlayed)) g.lastPlayed = t;
      if ((a.game || gameOf(a.mode)) === 'shapes' && a.kind === 'level' && a.stars != null) {
        const key = String(a.mode).replace(/^shapes/, '');
        if (key in shapesStars && a.stars > (shapesStars[key] || 0)) shapesStars[key] = a.stars;
      }
    }
    for (const g of OVERVIEW_GAMES) byGame[g].minutes = byGame[g].minutes ? Math.round(byGame[g].minutes * 10) / 10 : 0;
    for (const sc of sList) { const g = byGame[gameOf(sc && sc.mode)]; if (g) g.active = true; }
    if (Object.values(levels).some((v) => v > 0)) byGame.bonds.active = true;

    rows.push({
      uid,
      name: student.name,
      email: student.email,
      lastPlayed,
      attemptsInRange: aList.length,
      totalMinutes: totalSeconds ? Math.round((totalSeconds / 60) * 10) / 10 : 0,
      market: { easy: bestByMode.easy ?? null, medium: bestByMode.medium ?? null, hard: bestByMode.hard ?? null },
      numbers: {
        num1: bestByMode.num1 ?? null, num2: bestByMode.num2 ?? null,
        num3: bestByMode.num3 ?? null, num4: bestByMode.num4 ?? null,
      },
      bondsMedals: countMedals(levels),
      bondsCleared: worldClearCounts(levels),
      rush: { w1: bestByMode.bonds1 ?? null, w2: bestByMode.bonds2 ?? null, w3: bestByMode.bonds3 ?? null, w4: bestByMode.bonds4 ?? null },
      byGame,
      shapesStars,
      shapesRush: { a: bestByMode.shapes3d ?? null, b: bestByMode.shapes2d ?? null },
    });
  }
  rows.sort((a, b) => a.name.localeCompare(b.name));
  return rows;
}

/** Generic sort of overview (or attempt) rows by a dotted path, e.g. 'market.easy'. Nulls sort last. */
export function sortRows(rows, path, dir = 1) {
  const get = (o) => path.split('.').reduce((v, k) => (v == null ? v : v[k]), o);
  return [...rows].sort((a, b) => {
    const va = get(a), vb = get(b);
    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;
    if (va < vb) return -1 * dir;
    if (va > vb) return 1 * dir;
    return 0;
  });
}

// ---------- Attempts tab ----------

export function formatDateParts(d) {
  if (!d) return { date: '', time: '' };
  const pad = (n) => String(n).padStart(2, '0');
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}

export function formatDuration(sec) {
  if (sec === null || sec === undefined || isNaN(sec)) return '';
  const s = Math.round(sec);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

/** Score (timed) or star string (level) for the Attempts table's combined column. */
export function scoreOrStars(a) {
  if (a.kind === 'level') return a.stars != null ? '⭐'.repeat(a.stars) : '';
  return a.score != null ? String(a.score) : '';
}

/** Normalize raw attempt docs into display-ready rows, newest first. */
export function buildAttemptRows(attempts = []) {
  const rows = attempts.map((a) => {
    const d = toDate(a.ts);
    const { date, time } = formatDateParts(d);
    return {
      uid: a.uid,
      name: a.name || fallbackName(a.uid),
      email: a.email || '',
      game: a.game || gameOf(a.mode),
      gameLabel: GAME_LABEL[a.game] || GAME_LABEL[gameOf(a.mode)] || a.game || '',
      mode: a.mode,
      modeLabel: a.modeLabel || modeLabel(a.mode),
      kind: a.kind,
      score: a.score ?? null,
      stars: a.stars ?? null,
      primary: scoreOrStars(a),
      accuracy: a.accuracy ?? null,
      mistakes: a.mistakes ?? null,
      durationSec: a.durationSec ?? null,
      duration: formatDuration(a.durationSec),
      date, time, ts: d,
    };
  });
  rows.sort((a, b) => (b.ts ? b.ts.getTime() : 0) - (a.ts ? a.ts.getTime() : 0));
  return rows;
}

/** Apply the Attempts tab's game/student/date filters client-side (date range is already server-filtered). */
export function filterAttemptRows(rows, { game = '', uid = '', from = null, to = null } = {}) {
  return rows.filter((r) => {
    if (game && r.game !== game) return false;
    if (uid && r.uid !== uid) return false;
    if (from && (!r.ts || r.ts < from)) return false;
    if (to && (!r.ts || r.ts > to)) return false;
    return true;
  });
}

// ---------- CSV ----------

/** Quote a field per RFC 4180 when it contains a comma, quote or newline; doubles inner quotes. */
export function csvEscape(value) {
  const s = value === null || value === undefined ? '' : String(value);
  if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

/** headers + rows (arrays of cells) → CRLF-joined CSV text, UTF-8 BOM-prefixed so Excel shows Chinese. */
export function toCSV(headers, rows) {
  const lines = [headers.map(csvEscape).join(',')];
  for (const row of rows) lines.push(row.map(csvEscape).join(','));
  return '﻿' + lines.join('\r\n');
}

/** The "All" overview is a summary only; each game's scores and levels are in its own sub-tab (teacher.html builds those CSVs). */
export const OVERVIEW_HEADERS = ['Name 姓名', 'Email', 'Last played 最後遊玩', 'Minutes 分鐘', 'UID'];

export function overviewToCSVRows(rows) {
  return rows.map((r) => [r.name, r.email, r.lastPlayed ? r.lastPlayed.toISOString() : '', r.totalMinutes, r.uid]);
}

export const ATTEMPTS_HEADERS = [
  'Date 日期', 'Time 時間', 'Name 姓名', 'Email', 'Game 遊戲', 'Level 關卡',
  'Score/Stars 分數/星星', 'Accuracy % 準確度', 'Mistakes 錯誤', 'Duration(s) 時長(秒)', 'UID',
];

export function attemptsToCSVRows(attemptRows) {
  return attemptRows.map((a) => [
    a.date, a.time, a.name, a.email, a.gameLabel, a.modeLabel,
    a.primary, a.accuracy ?? '', a.mistakes ?? '', a.durationSec ?? '', a.uid,
  ]);
}

/** `p1maths-<tab>-YYYYMMDD.csv`, dated today (device local). */
export function csvFilename(tab) {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `p1maths-${tab}-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}.csv`;
}
