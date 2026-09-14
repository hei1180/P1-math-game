# Number Shop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the 4-level "Number Shop" game (compare, odd/even, number line, odd/even line) beside Math Market, with trophies and bronze-based unlocks on both games, sharing one auth / fever / leaderboard / teacher module.

**Architecture:** Static site on GitHub Pages. `index.html` becomes the hub (login → game picker → Math Market). `numbers.html` is the new game. Both import `shared.js` (Firebase, engine, data, teacher panel) and `shared.css`. Pure logic (`trophy.js`, `numbers-logic.js`) has no Firebase import so `node --test` covers it.

**Tech Stack:** Vanilla ES modules, Tailwind CDN, Firebase v12 (Auth + Firestore) via gstatic CDN, Node 20 `node --test` for unit tests. No bundler, no npm dependencies.

**Spec:** `docs/superpowers/specs/2026-09-14-number-shop-design.md`

**Repo:** `/Users/user/Documents/P1-math-game` (branch `main`). Firebase project `p1-maths`. Teacher PIN `1128`.

---

## File map

| File | Responsibility |
|---|---|
| `package.json` | `"type": "module"` so `.js` files are ES modules under Node; `npm test` runs `node --test tests/`. No deps. |
| `trophy.js` | Pure: `DEFAULT_TROPHY`, `TROPHY_ICON`, `TROPHY_LABEL`, `trophyFor(score, cutoffs)`, `validateCutoffs(c)`. |
| `numbers-logic.js` | Pure round generators: `genCompare`, `compareAnswer`, `genOddEven`, `genLine`, `genSkipLine`. All take `rng` for deterministic tests. |
| `tests/trophy.test.mjs` | Unit tests for `trophy.js`. |
| `tests/logic.test.mjs` | Unit tests for `numbers-logic.js`. |
| `shared.css` | All CSS moved out of `index.html`, plus Number Shop classes. |
| `shared.js` | Firebase init, auth, `player`, `settings`, audio, particles, combo/fever engine, timer, score save/load, leaderboard, level-button refresh, rank popup, teacher modal mount. Uses fixed element ids (see "DOM contract"). |
| `index.html` | Hub + Math Market, refactored onto `shared.js`. |
| `numbers.html` | Number Shop game. |

### DOM contract for `shared.js`

Both pages must contain elements with these ids; `shared.js` looks them up by id:

- `#gameScreen` — gets `.fever-mode` / `.fever-wiggle`
- `#feverOverlayText` — shown during fever
- `#timerDisplay`, `#scoreDisplay`, `#comboDisplay` — HUD
- `#rankPopup` with children `#rankScore`, `#rankTrophy` — end-of-game popup
- `#adminBtn` — opens teacher modal (modal itself is injected by `mountTeacherModal`)
- Leaderboard tabs have id `tab-<modeKey>`, body `#leaderboardBody`

### Local testing

Google login only works on `localhost` or the GitHub Pages domain, never `file://`. Serve with:

```bash
cd /Users/user/Documents/P1-math-game && python3 -m http.server 8000
```

then open `http://localhost:8000/`. `localhost` is in Firebase's authorized domains by default.

---

### Task 1: Node test harness + `trophy.js`

**Files:**
- Create: `package.json`
- Create: `trophy.js`
- Create: `tests/trophy.test.mjs`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "p1-math-game",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test tests/"
  }
}
```

- [ ] **Step 2: Write the failing tests**

`tests/trophy.test.mjs`:

```js
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
```

- [ ] **Step 3: Run tests, verify they fail**

Run: `cd /Users/user/Documents/P1-math-game && npm test`
Expected: FAIL, `Cannot find module '.../trophy.js'`

- [ ] **Step 4: Create `trophy.js`**

```js
// Pure trophy logic. No DOM, no Firebase. Imported by shared.js and by tests.

export const DEFAULT_TROPHY = { bronze: 300, silver: 700, gold: 1200 };

export const TROPHY_ICON = { gold: '🥇', silver: '🥈', bronze: '🥉', finisher: '🎖' };
export const TROPHY_LABEL = { gold: '金牌 Gold', silver: '銀牌 Silver', bronze: '銅牌 Bronze', finisher: '完成 Finisher' };

/** @returns {'gold'|'silver'|'bronze'|'finisher'|null} */
export function trophyFor(score, cutoffs = DEFAULT_TROPHY) {
  if (!(score > 0)) return null;
  if (score >= cutoffs.gold) return 'gold';
  if (score >= cutoffs.silver) return 'silver';
  if (score >= cutoffs.bronze) return 'bronze';
  return 'finisher';
}

export function validateCutoffs(c) {
  if (!c) return false;
  const { bronze, silver, gold } = c;
  const nums = [bronze, silver, gold];
  if (!nums.every(n => Number.isFinite(n) && n > 0)) return false;
  return bronze < silver && silver < gold;
}
```

- [ ] **Step 5: Run tests, verify they pass**

Run: `npm test`
Expected: `# pass 6`, `# fail 0`

- [ ] **Step 6: Commit**

```bash
git add package.json trophy.js tests/trophy.test.mjs
git commit -m "feat: add trophy tiers with node test harness"
```

---

### Task 2: `numbers-logic.js` — compare and odd/even generators

**Files:**
- Create: `numbers-logic.js`
- Create: `tests/logic.test.mjs`

- [ ] **Step 1: Write the failing tests**

`tests/logic.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { genCompare, compareAnswer, genOddEven } from '../numbers-logic.js';

// Deterministic rng: cycles through the given values.
function seq(values) { let i = 0; return () => values[i++ % values.length]; }
// Cheap seeded rng for distribution tests.
function lcg(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

test('genCompare values in 1-20 and ask is more|less', () => {
  const rng = lcg(1);
  for (let i = 0; i < 500; i++) {
    const r = genCompare(rng);
    assert.ok(r.a >= 1 && r.a <= 20, 'a in range');
    assert.ok(r.b >= 1 && r.b <= 20, 'b in range');
    assert.ok(['more', 'less'].includes(r.ask));
  }
});

test('genCompare equal case rate ≈ 15%', () => {
  const rng = lcg(7);
  let eq = 0;
  const N = 4000;
  for (let i = 0; i < N; i++) { const r = genCompare(rng); if (r.a === r.b) eq++; }
  const rate = eq / N;
  assert.ok(rate > 0.11 && rate < 0.19, 'rate was ' + rate);
});

test('compareAnswer', () => {
  assert.equal(compareAnswer({ a: 7, b: 3, ask: 'more' }), 'left');
  assert.equal(compareAnswer({ a: 7, b: 3, ask: 'less' }), 'right');
  assert.equal(compareAnswer({ a: 2, b: 9, ask: 'more' }), 'right');
  assert.equal(compareAnswer({ a: 2, b: 9, ask: 'less' }), 'left');
  assert.equal(compareAnswer({ a: 5, b: 5, ask: 'more' }), 'same');
  assert.equal(compareAnswer({ a: 5, b: 5, ask: 'less' }), 'same');
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
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `npm test`
Expected: `tests/logic.test.mjs` fails with `Cannot find module '.../numbers-logic.js'`; trophy tests still pass.

- [ ] **Step 3: Create `numbers-logic.js`**

```js
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
```

- [ ] **Step 4: Run tests, verify they pass**

Run: `npm test`
Expected: `# pass 11`, `# fail 0`

- [ ] **Step 5: Commit**

```bash
git add numbers-logic.js tests/logic.test.mjs
git commit -m "feat: compare and odd/even round generators"
```

---

### Task 3: `numbers-logic.js` — number line and skip line generators

**Files:**
- Modify: `numbers-logic.js`
- Modify: `tests/logic.test.mjs`

- [ ] **Step 1: Append failing tests**

Add to the import line in `tests/logic.test.mjs`:

```js
import { genCompare, compareAnswer, genOddEven, genLine, genSkipLine } from '../numbers-logic.js';
```

Append:

```js
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
  // Force: parity even (rng≥0.5), start index 0 → slots 2..12, one blank at index 2 (value 6)
  // rng call order: parity (0.9 → even), start index (0.0 → 0 → slots 2..12), blank count (0.6 → 1 blank), blank index (0.4 → floor(0.4*6)=2 → value 6), then shuffles.
  const rng = seq([0.9, 0.0, 0.6, 0.4, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0]);
  const r = genSkipLine(rng);
  assert.deepEqual(r.slots, [2, 4, 6, 8, 10, 12]);
  assert.deepEqual(r.blanks, [2]);
  assert.ok(r.tiles.includes(6));
  assert.ok(r.tiles.includes(5) || r.tiles.includes(7), 'has an n±1 distractor');
});
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `npm test`
Expected: FAIL, `genLine is not a function` (or import error listing missing export).

- [ ] **Step 3: Append generators to `numbers-logic.js`**

```js
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

/** Lv3: 7 consecutive numbers, start 1-14, 1-2 blanks, tiles with ±1 ±2 ±10 distractors. */
export function genLine(rng = Math.random) {
  const start = int(rng, 1, 14);
  const slots = Array.from({ length: 7 }, (_, i) => start + i);
  const blanks = pickBlanks(7, rng);
  const answers = blanks.map(i => slots[i]);
  const tiles = makeTiles(answers, n => [n - 1, n + 1, n - 2, n + 2, n - 10, n + 10], rng);
  return { slots, blanks, tiles };
}

/** Lv4: 6 numbers stepping by 2, all odd (1..19) or all even (2..20), 1-2 blanks, ±1 ±4 distractors. */
export function genSkipLine(rng = Math.random) {
  const parity = rng() < 0.5 ? 'odd' : 'even';
  const first = parity === 'odd' ? 1 : 2;
  const start = first + 2 * int(rng, 0, 4); // odd: 1,3,5,7,9  even: 2,4,6,8,10
  const slots = Array.from({ length: 6 }, (_, i) => start + 2 * i);
  const blanks = pickBlanks(6, rng);
  const answers = blanks.map(i => slots[i]);
  const tiles = makeTiles(answers, n => [n - 1, n + 1, n - 4, n + 4], rng);
  return { slots, blanks, tiles, parity };
}
```

- [ ] **Step 4: Run tests, verify they pass**

Run: `npm test`
Expected: `# pass 15`, `# fail 0`

- [ ] **Step 5: Commit**

```bash
git add numbers-logic.js tests/logic.test.mjs
git commit -m "feat: number line and skip line round generators"
```

---

### Task 4: Extract `shared.css` from `index.html`

**Files:**
- Create: `shared.css`
- Modify: `index.html` (the `<style>…</style>` block in `<head>`)

- [ ] **Step 1: Create `shared.css`** with the exact contents of the current `<style>` block in `index.html` (everything between `<style>` and `</style>`, from `* { touch-action: manipulation; }` to `.game-layer { … }`), followed by the new Number Shop classes:

```css
/* ---------- Number Shop ---------- */
.level-btn { display: flex; flex-direction: column; align-items: center; line-height: 1.2; }
.level-sub { opacity: 0.8; margin-top: 2px; }

.cust-btn { transition: transform 0.1s; }
.cust-btn:active { transform: scale(0.92); }
.num-card { background: white; border: 4px solid #1f2937; border-radius: 16px; font-weight: 900; padding: 4px 18px; box-shadow: 0 5px 0 rgba(0,0,0,0.2); }
.num-card:active { transform: translateY(3px); box-shadow: 0 2px 0 rgba(0,0,0,0.2); }
.peek { min-height: 40px; }

.item-btn { width: 44px; height: 44px; font-size: 28px; border-radius: 10px; border: 3px solid #cbd5e1; background: white; display: flex; align-items: center; justify-content: center; transition: transform 0.1s; }
.item-btn.selected { border-color: #f59e0b; background: #fef3c7; transform: scale(1.15); box-shadow: 0 0 0 4px rgba(245,158,11,0.4); }
@media (min-width: 768px) { .item-btn { width: 56px; height: 56px; font-size: 34px; } }
.odd-one { display: inline-flex; align-items: center; justify-content: center; width: 100%; height: 100%; border: 3px dashed #ef4444; border-radius: 6px; background: #fee2e2; animation: pop 0.25s ease-out; }

.slot { width: 40px; height: 48px; border-radius: 10px; border: 3px solid #94a3b8; background: white; display: flex; align-items: center; justify-content: center; font-weight: 900; font-size: 22px; }
.slot.blank { border-style: dashed; background: #f1f5f9; color: #cbd5e1; }
.slot.active { border-color: #f59e0b; background: #fef3c7; animation: slotPulse 0.8s infinite alternate; }
.slot.filled { border-color: #4ade80; background: #dcfce7; color: #166534; }
@media (min-width: 768px) { .slot { width: 56px; height: 64px; font-size: 30px; } }
@keyframes slotPulse { from { transform: scale(1); } to { transform: scale(1.08); } }
.tile { width: 60px; height: 60px; border-radius: 14px; font-weight: 900; font-size: 26px; background: #fde68a; border: 4px solid #f59e0b; color: #78350f; }
.tile:disabled { opacity: 0.35; }
@media (min-width: 768px) { .tile { width: 76px; height: 76px; font-size: 34px; } }
```

- [ ] **Step 2: Replace the `<style>` block in `index.html`**

Replace the whole `<style>` … `</style>` block with:

```html
    <link rel="stylesheet" href="shared.css">
```

- [ ] **Step 3: Verify visually**

Run: `python3 -m http.server 8000` in the repo, open `http://localhost:8000/`. Login screen looks identical (yellow body, blue login panel, bubbly button). Log in, start Easy, confirm ten-frames and fever styles still apply (get 5 combo → red border, rainbow flash).

- [ ] **Step 4: Commit**

```bash
git add shared.css index.html
git commit -m "refactor: move styles to shared.css"
```

---

### Task 5: `shared.js` — Firebase, auth, audio, engine, timer

**Files:**
- Create: `shared.js`

No unit tests (depends on Firebase CDN + DOM). Verified in Task 6 through Market regression.

- [ ] **Step 1: Create `shared.js` (part 1)**

```js
// Shared runtime for both games. Loaded as <script type="module"> import.
// DOM contract: see docs/superpowers/plans/2026-09-14-number-shop.md ("DOM contract").
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js";
import { getFirestore, collection, doc, getDoc, setDoc, getDocs, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";
import { DEFAULT_TROPHY, TROPHY_ICON, TROPHY_LABEL, trophyFor, validateCutoffs } from './trophy.js';

export { TROPHY_ICON, TROPHY_LABEL };

// ---------- Firebase ----------
const firebaseConfig = {
  apiKey: "AIzaSyAdCj3BAfeU737QdpBQMPkfp1wWrNcBWc0",
  authDomain: "p1-maths.firebaseapp.com",
  projectId: "p1-maths",
  storageBucket: "p1-maths.firebasestorage.app",
  messagingSenderId: "593709237589",
  appId: "1:593709237589:web:d71dd6020234b554865bdc",
  measurementId: "G-ZWXELF5EK5"
};
export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
const provider = new GoogleAuthProvider();

export const TEACHER_PIN = '1128';
export const DEFAULT_SETTINGS = { timeLimit: 30, unlockMedium: false, unlockHard: false, numTimeLimit: 30, trophy: { ...DEFAULT_TROPHY } };

export const player = { name: 'Guest', uid: null, highScores: {} };
export const settings = structuredClone(DEFAULT_SETTINGS);

const $ = id => document.getElementById(id);

// ---------- Auth ----------
export function signIn() {
  initAudio();
  return signInWithPopup(auth, provider).catch(err => { console.error(err); alert('Login failed. Check console.'); });
}

/** cb(player) fires after settings + high scores are loaded. */
export function onUser(cb) {
  onAuthStateChanged(auth, async (user) => {
    if (!user) return;
    player.name = user.displayName || user.email.split('@')[0];
    player.uid = user.uid;
    await Promise.all([loadSettings(), loadMyHighScores()]);
    cb(player);
  });
}

// ---------- Audio + particles ----------
const AC = window.AudioContext || window.webkitAudioContext;
let audioCtx;
export function initAudio() { if (!audioCtx) audioCtx = new AC(); if (audioCtx.state === 'suspended') audioCtx.resume(); }

export function playSound(type) {
  if (!audioCtx) return;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.connect(gain); gain.connect(audioCtx.destination);
  const now = audioCtx.currentTime;
  if (type === 'click') {
    const base = 400 + engine.combo * 40;
    osc.type = 'sine'; osc.frequency.setValueAtTime(base, now); osc.frequency.exponentialRampToValueAtTime(base + 200, now + 0.1);
    gain.gain.setValueAtTime(0.3, now); gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
    osc.start(now); osc.stop(now + 0.1);
  } else if (type === 'success') {
    osc.type = 'triangle'; osc.frequency.setValueAtTime(440, now); osc.frequency.setValueAtTime(554, now + 0.1); osc.frequency.setValueAtTime(659, now + 0.2);
    gain.gain.setValueAtTime(0.3, now); gain.gain.linearRampToValueAtTime(0, now + 0.4);
    osc.start(now); osc.stop(now + 0.4);
  } else if (type === 'error') {
    osc.type = 'sawtooth'; osc.frequency.setValueAtTime(150, now); osc.frequency.linearRampToValueAtTime(100, now + 0.3);
    gain.gain.setValueAtTime(0.3, now); gain.gain.linearRampToValueAtTime(0, now + 0.3);
    osc.start(now); osc.stop(now + 0.3);
  }
}

export function spawnParticle(x, y, text) {
  const el = document.createElement('div');
  el.className = 'particle'; el.innerText = text;
  el.style.left = `${x - 20}px`; el.style.top = `${y - 20}px`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 600);
}

/** Re-trigger a CSS animation class on an element. */
export function replay(el, cls) { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); }

// ---------- Combo / fever engine ----------
export const engine = { score: 0, combo: 0, maxCombo: 0, totalAttempts: 0, correctAttempts: 0, isFever: false, feverTimeout: null, timeLeft: 0, timerId: null };

export function resetEngine(timeLimit) {
  stopTimer(); endFever();
  Object.assign(engine, { score: 0, combo: 0, maxCombo: 0, totalAttempts: 0, correctAttempts: 0, timeLeft: timeLimit });
  updateHud();
}

export function updateHud() {
  $('scoreDisplay').innerText = engine.score;
  $('comboDisplay').innerText = engine.combo;
  $('timerDisplay').innerText = engine.timeLeft;
}

export function triggerWiggle() { if (engine.isFever) replay($('gameScreen'), 'fever-wiggle'); }

export function endFever() {
  clearTimeout(engine.feverTimeout);
  engine.isFever = false;
  $('gameScreen').classList.remove('fever-mode', 'fever-wiggle');
  $('feverOverlayText').style.display = 'none';
}

/**
 * Record one answer. Returns points awarded (0 when wrong).
 * Correct: combo++, fever at 5 (x2, 10 s refresh), success sound.
 * Wrong: combo reset, fever ends, error sound.
 */
export function registerHit(correct, basePoints) {
  engine.totalAttempts++;
  if (!correct) {
    playSound('error'); endFever(); engine.combo = 0; updateHud();
    return 0;
  }
  engine.correctAttempts++;
  playSound('success');
  engine.combo++;
  if (engine.combo > engine.maxCombo) engine.maxCombo = engine.combo;
  let points = basePoints;
  if (engine.combo >= 5) {
    if (!engine.isFever) { engine.isFever = true; $('gameScreen').classList.add('fever-mode'); $('feverOverlayText').style.display = 'block'; }
    points *= 2;
    clearTimeout(engine.feverTimeout);
    engine.feverTimeout = setTimeout(() => { endFever(); engine.combo = 0; updateHud(); }, 10000);
  }
  engine.score += points;
  updateHud();
  return points;
}

// ---------- Timer ----------
export function startTimer(seconds, onEnd) {
  stopTimer();
  engine.timeLeft = seconds; updateHud();
  engine.timerId = setInterval(() => {
    engine.timeLeft--; updateHud();
    if (engine.timeLeft <= 0) { stopTimer(); onEnd(); }
  }, 1000);
}
export function stopTimer() { clearInterval(engine.timerId); engine.timerId = null; }
```

- [ ] **Step 2: Append part 2 — data, trophies, leaderboard, level buttons**

```js
// ---------- Data ----------
export async function loadSettings() {
  try {
    const snap = await getDoc(doc(db, 'settings', 'global'));
    if (snap.exists()) {
      const d = snap.data();
      Object.assign(settings, DEFAULT_SETTINGS, d);
      settings.trophy = validateCutoffs(d.trophy) ? { ...d.trophy } : { ...DEFAULT_TROPHY };
    }
  } catch (e) { console.warn('settings offline', e); }
}

export async function saveSettings(patch) {
  Object.assign(settings, patch);
  try { await setDoc(doc(db, 'settings', 'global'), settings); return true; }
  catch (e) { console.warn('settings save failed', e); return false; }
}

export async function loadMyHighScores() {
  try {
    const snap = await getDocs(collection(db, 'scores'));
    snap.forEach(d => { const s = d.data(); if (s.uid === player.uid && s.score > (player.highScores[s.mode] || 0)) player.highScores[s.mode] = s.score; });
  } catch (e) { console.warn('scores offline', e); }
}

/** Accuracy % from engine; saves only if higher than stored. Returns accuracy. */
export async function saveScore(modeKey) {
  const accuracy = engine.totalAttempts ? Math.round(engine.correctAttempts / engine.totalAttempts * 100) : 0;
  if (engine.score > (player.highScores[modeKey] || 0)) player.highScores[modeKey] = engine.score;
  try {
    const ref = doc(db, 'scores', `${player.uid}_${modeKey}`);
    const prev = await getDoc(ref);
    if (!prev.exists() || engine.score > prev.data().score) {
      await setDoc(ref, { playerName: player.name, uid: player.uid, score: engine.score, maxCombo: engine.maxCombo, accuracy, mode: modeKey, timestamp: serverTimestamp() });
    }
  } catch (e) { console.warn('score save failed', e); }
  return accuracy;
}

export async function getTop10(modeKey) {
  const snap = await getDocs(collection(db, 'scores'));
  const rows = [];
  snap.forEach(d => { const s = d.data(); if (s.mode === modeKey) rows.push(s); });
  rows.sort((a, b) => b.score - a.score);
  return rows.slice(0, 10);
}

// ---------- Trophies + unlocks ----------
export function trophyOf(score) { return trophyFor(score, settings.trophy); }

export function isUnlocked(prevKey, teacherOk = true) {
  if (!prevKey) return true;
  return teacherOk && (player.highScores[prevKey] || 0) >= settings.trophy.bronze;
}

/**
 * Update a level button: lock state + subtitle line.
 * btn must contain a `.level-sub` element.
 */
export function refreshLevelButton(btn, key, prevKey, prevLabel, teacherOk = true) {
  const sub = btn.querySelector('.level-sub');
  const scoreOk = !prevKey || (player.highScores[prevKey] || 0) >= settings.trophy.bronze;
  const open = scoreOk && teacherOk;
  btn.classList.toggle('opacity-50', !open);
  btn.classList.toggle('cursor-not-allowed', !open);
  btn.dataset.locked = open ? '' : '1';
  if (open) {
    const best = player.highScores[key] || 0;
    const t = trophyOf(best);
    sub.textContent = t ? `${TROPHY_ICON[t]} ${TROPHY_LABEL[t]} · 最高 Best ${best}` : '尚未遊玩 Not played yet';
  } else if (!scoreOk) {
    sub.textContent = `🔒 需要 ${prevLabel} 🥉 ${settings.trophy.bronze} 分 / Need ${prevLabel} Bronze (${settings.trophy.bronze})`;
  } else {
    sub.textContent = '🔒 老師未開放 Locked by teacher';
  }
}

// ---------- Leaderboard ----------
/** tabs: [{key,label}] ; styles tab-<key> buttons and fills #leaderboardBody. */
export async function renderLeaderboard(tabs, activeKey) {
  for (const t of tabs) {
    const b = $('tab-' + t.key);
    b.classList.toggle('bg-white', t.key === activeKey);
    b.classList.toggle('text-purple-600', t.key === activeKey);
    b.classList.toggle('bg-purple-300', t.key !== activeKey);
    b.classList.toggle('text-purple-700', t.key !== activeKey);
  }
  const tbody = $('leaderboardBody');
  tbody.innerHTML = '<tr><td colspan="3" class="text-center py-4 text-gray-500">Loading...</td></tr>';
  try {
    const rows = await getTop10(activeKey);
    tbody.innerHTML = '';
    rows.forEach((r, i) => {
      const me = r.uid === player.uid ? 'bg-yellow-100 font-bold text-gray-900' : 'text-gray-700';
      const t = trophyOf(r.score);
      tbody.innerHTML += `<tr class="${me} border-b border-purple-200"><td class="py-3 px-2">${i + 1}</td><td class="px-2">${t ? TROPHY_ICON[t] + ' ' : ''}${r.playerName}</td><td class="px-2">${r.score}</td></tr>`;
    });
    if (!rows.length) tbody.innerHTML = '<tr><td colspan="3" class="text-center py-4 text-gray-500">No scores yet in this mode!</td></tr>';
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="3" class="text-center py-4 text-red-500">Offline Score: ${engine.score}</td></tr>`;
  }
}

// ---------- Rank popup ----------
/** Shows #rankPopup for ~4 s with score + trophy, then calls onDone. */
export function showRankPopup(score, onDone) {
  const popup = $('rankPopup');
  popup.style.display = 'flex';
  $('rankScore').innerText = 'Saving Score...';
  $('rankTrophy').innerText = '';
  setTimeout(() => {
    const t = trophyOf(score);
    $('rankScore').innerText = `${score} 分`;
    $('rankTrophy').innerText = t ? `${TROPHY_ICON[t]} ${TROPHY_LABEL[t]}!` : '再接再厲 Try again!';
    replay($('rankTrophy'), 'rank-anim');
    setTimeout(() => { popup.style.display = 'none'; onDone(); }, 3000);
  }, 1000);
}
```

- [ ] **Step 3: Append part 3 — teacher modal**

```js
// ---------- Teacher modal ----------
const TEACHER_MODAL_HTML = `
<div id="adminModal" class="hidden absolute inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
  <div class="bg-white p-6 md:p-8 rounded-3xl w-full max-w-sm shadow-2xl max-h-[95dvh] overflow-y-auto">
    <div id="pinView">
      <h2 class="text-2xl font-bold mb-4 text-center">Teacher Access</h2>
      <input type="password" id="pinInput" placeholder="Enter PIN" class="border-4 border-gray-300 p-2 rounded-xl w-full mb-4 text-center text-xl focus:border-blue-500 outline-none">
      <div class="flex gap-2">
        <button id="pinCancel" class="bubbly-btn bg-gray-300 text-gray-700 p-3 rounded-xl flex-1 font-bold">Cancel</button>
        <button id="pinOk" class="bubbly-btn bg-blue-500 text-white p-3 rounded-xl flex-1 font-bold">Unlock</button>
      </div>
    </div>
    <div id="settingsView" class="hidden">
      <h2 class="text-2xl font-bold mb-4 text-center text-purple-600">Classroom Settings</h2>
      <div class="bg-gray-100 p-4 rounded-xl mb-4 border-2 border-gray-200">
        <label class="flex items-center gap-3 text-lg font-bold text-gray-700 mb-2 cursor-pointer"><input type="checkbox" id="settingMed" class="w-6 h-6 accent-yellow-500 rounded"> Unlock Medium (Market)</label>
        <label class="flex items-center gap-3 text-lg font-bold text-gray-700 cursor-pointer"><input type="checkbox" id="settingHard" class="w-6 h-6 accent-red-500 rounded"> Unlock Hard (Market)</label>
      </div>
      <div class="grid grid-cols-2 gap-3 mb-4">
        <label class="text-sm font-bold text-gray-700 text-center">Market time (s)<input type="number" id="settingTime" min="10" max="300" class="border-4 border-gray-300 p-2 rounded-xl w-full text-center text-xl font-bold outline-none"></label>
        <label class="text-sm font-bold text-gray-700 text-center">Number Shop time (s)<input type="number" id="settingNumTime" min="10" max="300" class="border-4 border-gray-300 p-2 rounded-xl w-full text-center text-xl font-bold outline-none"></label>
      </div>
      <div class="bg-yellow-50 p-3 rounded-xl mb-4 border-2 border-yellow-200">
        <div class="font-bold text-gray-700 text-center mb-2">Trophy cutoffs</div>
        <div class="grid grid-cols-3 gap-2">
          <label class="text-sm font-bold text-center">🥉<input type="number" id="settingBronze" min="1" class="border-2 border-gray-300 p-1 rounded-lg w-full text-center font-bold outline-none"></label>
          <label class="text-sm font-bold text-center">🥈<input type="number" id="settingSilver" min="1" class="border-2 border-gray-300 p-1 rounded-lg w-full text-center font-bold outline-none"></label>
          <label class="text-sm font-bold text-center">🥇<input type="number" id="settingGold" min="1" class="border-2 border-gray-300 p-1 rounded-lg w-full text-center font-bold outline-none"></label>
        </div>
        <div class="text-xs text-gray-500 text-center mt-1">Unlock next level = 🥉 cutoff</div>
      </div>
      <button id="settingsSave" class="bubbly-btn bg-green-500 text-white py-3 px-4 rounded-xl w-full font-bold text-xl">Save Global Settings</button>
    </div>
  </div>
</div>`;

/** Injects the modal into document.body and wires #adminBtn. onSaved() runs after a successful save. */
export function mountTeacherModal(onSaved) {
  document.body.insertAdjacentHTML('beforeend', TEACHER_MODAL_HTML);
  const open = () => { $('adminModal').classList.remove('hidden'); $('pinView').classList.remove('hidden'); $('settingsView').classList.add('hidden'); $('pinInput').value = ''; };
  const close = () => { $('adminModal').classList.add('hidden'); $('pinInput').value = ''; };
  $('adminBtn').addEventListener('click', open);
  $('pinCancel').addEventListener('click', close);
  $('pinOk').addEventListener('click', () => {
    if ($('pinInput').value !== TEACHER_PIN) { alert('Incorrect PIN'); return; }
    $('pinView').classList.add('hidden'); $('settingsView').classList.remove('hidden');
    $('settingMed').checked = settings.unlockMedium; $('settingHard').checked = settings.unlockHard;
    $('settingTime').value = settings.timeLimit; $('settingNumTime').value = settings.numTimeLimit;
    $('settingBronze').value = settings.trophy.bronze; $('settingSilver').value = settings.trophy.silver; $('settingGold').value = settings.trophy.gold;
  });
  $('settingsSave').addEventListener('click', async () => {
    const trophy = { bronze: parseInt($('settingBronze').value), silver: parseInt($('settingSilver').value), gold: parseInt($('settingGold').value) };
    if (!validateCutoffs(trophy)) { alert('Trophy cutoffs must be numbers with Bronze < Silver < Gold.'); return; }
    const patch = {
      unlockMedium: $('settingMed').checked, unlockHard: $('settingHard').checked,
      timeLimit: parseInt($('settingTime').value) || 30, numTimeLimit: parseInt($('settingNumTime').value) || 30,
      trophy
    };
    const ok = await saveSettings(patch);
    alert(ok ? 'Settings saved globally.' : 'Saved locally only (offline).');
    close(); onSaved();
  });
}
```

- [ ] **Step 4: Syntax check**

Run: `node --check shared.js`
Expected: no output (exit 0). (Node cannot import the gstatic URLs, but `--check` parses without executing.)

- [ ] **Step 5: Commit**

```bash
git add shared.js
git commit -m "feat: shared runtime module (auth, engine, data, teacher panel)"
```

---

### Task 6: Refactor `index.html` onto `shared.js`, add game picker + trophies

**Files:**
- Modify: `index.html` (whole file)

- [ ] **Step 1: Replace the login screen text and add the picker screen**

Replace the `<div id="loginScreen" ...>…</div>` block's `<p>` line so it reads `<p class="text-white mt-4 font-bold">Welcome! 歡迎光臨</p>`, and change the `<h1>` to `🍎 P1 Maths 🔢`. Insert directly after the login screen div:

```html
    <div id="pickerScreen" class="hidden absolute inset-0 flex flex-col items-center justify-center bg-sky-400 z-40 p-4">
        <button id="adminBtn" class="absolute top-4 right-4 bg-gray-800 text-white p-2 md:p-3 rounded-lg bubbly-btn font-bold">⚙️ Teacher</button>
        <h1 class="text-3xl md:text-5xl font-bold text-white mb-2 drop-shadow-md text-center leading-tight">選擇遊戲 Pick a game</h1>
        <p id="playerNameDisplay" class="text-lg md:text-xl text-sky-100 mb-6 md:mb-8 font-bold text-center w-full px-4 truncate"></p>
        <div class="flex flex-col gap-4 w-[90%] max-w-sm">
            <button onclick="showMarketMenu()" class="bubbly-btn bg-white text-orange-600 font-bold text-2xl md:text-3xl py-5 rounded-2xl border-4 border-orange-300 w-full">🍎 Math Market<br><span class="text-sm font-normal text-gray-500">數一數 Counting</span></button>
            <a href="numbers.html" class="bubbly-btn bg-white text-indigo-600 font-bold text-2xl md:text-3xl py-5 rounded-2xl border-4 border-indigo-300 w-full text-center block">🔢 Number Shop<br><span class="text-sm font-normal text-gray-500">比較 · 奇偶 · 數線</span></a>
        </div>
    </div>
```

- [ ] **Step 2: Rewrite the Market menu screen**

Replace the whole `<div id="menuScreen" …>…</div>` with:

```html
    <div id="menuScreen" class="hidden absolute inset-0 flex flex-col items-center justify-center bg-green-400 z-40 p-4">
        <button onclick="showPicker()" class="absolute top-4 left-4 bg-white/80 text-green-800 p-2 md:p-3 rounded-lg bubbly-btn font-bold">⬅ Games</button>
        <h1 class="text-3xl md:text-5xl font-bold text-white mb-6 drop-shadow-md text-center leading-tight">🍎 Math Market</h1>
        <div class="flex flex-col gap-4 w-[90%] max-w-sm">
            <button id="btn-easy" onclick="startGame('easy')" class="level-btn bubbly-btn bg-green-100 text-green-700 font-bold py-3 md:py-4 rounded-2xl border-4 border-green-300 w-full"><span class="text-xl md:text-2xl">Easy (1-10)</span><span class="level-sub text-xs md:text-sm font-normal"></span></button>
            <button id="btn-medium" onclick="startGame('medium')" class="level-btn bubbly-btn bg-yellow-100 text-yellow-700 font-bold py-3 md:py-4 rounded-2xl border-4 border-yellow-300 w-full"><span class="text-xl md:text-2xl">Medium (1-20)</span><span class="level-sub text-xs md:text-sm font-normal"></span></button>
            <button id="btn-hard" onclick="startGame('hard')" class="level-btn bubbly-btn bg-red-100 text-red-700 font-bold py-3 md:py-4 rounded-2xl border-4 border-red-300 w-full"><span class="text-xl md:text-2xl">Hard (Mix)</span><span class="level-sub text-xs md:text-sm font-normal"></span></button>
            <button onclick="showLeaderboardFromMenu()" class="bubbly-btn bg-purple-100 text-purple-700 font-bold text-xl md:text-2xl py-3 md:py-4 rounded-2xl border-4 border-purple-300 w-full mt-2 shadow-md">🏆 Leaderboard</button>
        </div>
    </div>
```

- [ ] **Step 3: Update the rank popup markup**

Replace `<div id="rankPopup">…</div>` with:

```html
    <div id="rankPopup">
        <h2 class="text-3xl md:text-5xl mb-4 text-center font-bold px-4">You finished the game!</h2>
        <div id="rankScore" class="text-4xl md:text-6xl font-bold mb-4"></div>
        <div id="rankTrophy" class="rank-anim px-4"></div>
    </div>
```

- [ ] **Step 4: Delete the old admin modal**

Remove the entire `<div id="adminModal" …>…</div>` block (it is now injected by `mountTeacherModal`).

- [ ] **Step 5: Replace the whole `<script type="module">…</script>` with:**

```html
    <script type="module">
        import { signIn, onUser, player, settings, initAudio, playSound, spawnParticle, replay,
                 engine, resetEngine, registerHit, triggerWiggle, endFever, startTimer, stopTimer,
                 saveScore, renderLeaderboard, refreshLevelButton, isUnlocked, showRankPopup, mountTeacherModal } from './shared.js';

        const $ = id => document.getElementById(id);
        const TABS = [{ key: 'easy', label: 'Easy' }, { key: 'medium', label: 'Medium' }, { key: 'hard', label: 'Hard' }];
        const POINTS = { easy: 10, medium: 20, hard: 30 };
        const items = ['🍎', '🍭', '🧸', '🖍️', '🍪'];
        let round = { mode: 'easy', target: 0, current: 0, item: '🍎', history: [] };

        // ---- screens ----
        function show(id) {
            for (const s of ['pickerScreen', 'menuScreen', 'gameScreen', 'leaderboardScreen']) $(s).classList.add('hidden');
            $(id).classList.remove('hidden');
        }
        window.showPicker = () => show('pickerScreen');
        window.showMarketMenu = () => { refreshMenu(); show('menuScreen'); };
        window.showMenu = window.showMarketMenu;

        function refreshMenu() {
            refreshLevelButton($('btn-easy'), 'easy', null, '');
            refreshLevelButton($('btn-medium'), 'medium', 'easy', 'Easy', settings.unlockMedium);
            refreshLevelButton($('btn-hard'), 'hard', 'medium', 'Medium', settings.unlockHard);
        }

        $('loginBtn').addEventListener('click', signIn);
        onUser(p => {
            $('playerNameDisplay').innerText = `Welcome, ${p.name}!`;
            $('loginScreen').classList.add('hidden');
            show('pickerScreen');
        });
        mountTeacherModal(refreshMenu);

        // ---- game ----
        window.startGame = function(mode) {
            if (mode === 'medium' && !isUnlocked('easy', settings.unlockMedium)) return;
            if (mode === 'hard' && !isUnlocked('medium', settings.unlockHard)) return;
            initAudio();
            round.mode = mode;
            resetEngine(settings.timeLimit);
            show('gameScreen');
            $('helperBtns').classList.toggle('hidden', mode === 'easy');
            $('undoBtn').classList.remove('hidden');
            nextCustomer();
            startTimer(settings.timeLimit, endGame);
        };

        function nextCustomer() {
            round.current = 0; round.history = [];
            round.item = items[Math.floor(Math.random() * items.length)];
            if (round.mode === 'easy') round.target = Math.floor(Math.random() * 10) + 1;
            else if (round.mode === 'medium') round.target = Math.floor(Math.random() * 20) + 1;
            else round.target = Math.floor(Math.random() * 20) + 10;
            $('targetAmount').innerText = round.target;
            $('targetItem').innerText = round.item;
            $('itemBtn').innerText = round.item;
            replay($('customerBubble'), 'animate-pop');
            renderTenFrames();
        }

        window.addMultiple = (amount, e) => addItem(amount, e);
        $('itemBtn').addEventListener('pointerdown', e => addItem(1, e));
        function addItem(amount, e) {
            if (round.current + amount > 40) return;
            round.current += amount; round.history.push(amount);
            renderTenFrames(); playSound('click');
            if (e && e.clientX) spawnParticle(e.clientX, e.clientY, `+${amount}`);
            triggerWiggle();
        }
        $('undoBtn').addEventListener('click', () => {
            if (!round.history.length) return;
            round.current -= round.history.pop(); renderTenFrames(); triggerWiggle();
        });

        function renderTenFrames() {
            const numFrames = Math.max(1, Math.ceil(round.target / 10), Math.ceil(round.current / 10));
            let html = '';
            for (let f = 0; f < numFrames; f++) {
                html += '<div class="ten-frame">';
                for (let i = 0; i < 10; i++) html += `<div class="frame-cell">${(f * 10 + i) < round.current ? round.item : ''}</div>`;
                html += '</div>';
            }
            $('tenFrameContainer').innerHTML = html;
        }

        $('giveBtn').addEventListener('pointerdown', () => {
            triggerWiggle();
            const pts = registerHit(round.current === round.target, POINTS[round.mode]);
            if (pts > 0) nextCustomer();
            else replay($('customerBubble'), 'animate-shake');
        });

        async function endGame() {
            stopTimer(); endFever();
            await saveScore(round.mode);
            showRankPopup(engine.score, () => changeLeaderboardTab(round.mode));
        }

        // ---- leaderboard ----
        window.changeLeaderboardTab = function(mode) { show('leaderboardScreen'); renderLeaderboard(TABS, mode); };
        window.showLeaderboardFromMenu = () => changeLeaderboardTab('easy');
    </script>
```

- [ ] **Step 6: Remove the `#adminBtn` from the old menu** — confirm only one element has `id="adminBtn"` (the one in `pickerScreen`). Run:

```bash
grep -c 'id="adminBtn"' index.html
```
Expected: `1`

- [ ] **Step 7: Market regression (manual, `http://localhost:8000/`)**

1. Login → picker appears with name. ⚙️ Teacher → PIN 1128 → panel shows 7 fields with current values → Save → alert "Settings saved globally."
2. 🍎 Math Market → menu shows Easy subtitle "尚未遊玩 Not played yet" (or best trophy), Medium/Hard subtitles show lock reason.
3. Easy: tap item 5×, GIVE → success sound, score +10, next customer. Wrong count → shake, combo 0. Reach 5 combo → fever visuals, x2 points.
4. Timer hits 0 → popup shows score + trophy line → leaderboard Easy tab with trophy icons beside names. Tabs switch. Back to Menu works. ⬅ Games returns to picker.
5. Firestore: `scores/{uid}_easy` updated only if higher; `settings/global` has `numTimeLimit` and `trophy`.

- [ ] **Step 8: Commit**

```bash
git add index.html
git commit -m "refactor: Math Market on shared.js, add game picker and trophies"
```

---

### Task 7: `numbers.html` shell + Lv1 Compare

**Files:**
- Create: `numbers.html`

- [ ] **Step 1: Create `numbers.html` markup**

```html
<!DOCTYPE html>
<html lang="zh-Hant">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
    <title>Number Shop 數字小店</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link rel="stylesheet" href="shared.css">
</head>
<body class="h-[100dvh] w-full flex flex-col relative">

    <div id="loginScreen" class="absolute inset-0 flex flex-col items-center justify-center bg-indigo-400 z-50 p-4">
        <h1 class="text-4xl md:text-6xl font-bold text-white mb-8 text-center drop-shadow-lg leading-tight">🔢 Number Shop</h1>
        <button id="loginBtn" class="bubbly-btn bg-white text-indigo-500 font-bold text-xl md:text-2xl py-4 px-8 rounded-full border-4 border-indigo-200 w-[90%] max-w-sm">Login with Google</button>
        <a href="index.html" class="text-white mt-6 underline font-bold">⬅ Back to games</a>
    </div>

    <div id="menuScreen" class="hidden absolute inset-0 flex flex-col items-center justify-center bg-indigo-400 z-40 p-4">
        <a href="index.html" class="absolute top-4 left-4 bg-white/80 text-indigo-800 p-2 md:p-3 rounded-lg bubbly-btn font-bold">⬅ Games</a>
        <button id="adminBtn" class="absolute top-4 right-4 bg-gray-800 text-white p-2 md:p-3 rounded-lg bubbly-btn font-bold">⚙️ Teacher</button>
        <h1 class="text-3xl md:text-5xl font-bold text-white mb-1 drop-shadow-md text-center leading-tight">🔢 數字小店</h1>
        <p id="playerNameDisplay" class="text-base md:text-xl text-indigo-100 mb-4 font-bold text-center w-full px-4 truncate"></p>
        <div class="flex flex-col gap-3 w-[90%] max-w-sm">
            <button id="btn-num1" onclick="startGame('num1')" class="level-btn bubbly-btn bg-green-100 text-green-700 font-bold py-3 rounded-2xl border-4 border-green-300 w-full"><span class="text-xl md:text-2xl">Lv1 比較 Compare</span><span class="level-sub text-xs md:text-sm font-normal"></span></button>
            <button id="btn-num2" onclick="startGame('num2')" class="level-btn bubbly-btn bg-yellow-100 text-yellow-700 font-bold py-3 rounded-2xl border-4 border-yellow-300 w-full"><span class="text-xl md:text-2xl">Lv2 奇數偶數 Odd/Even</span><span class="level-sub text-xs md:text-sm font-normal"></span></button>
            <button id="btn-num3" onclick="startGame('num3')" class="level-btn bubbly-btn bg-orange-100 text-orange-700 font-bold py-3 rounded-2xl border-4 border-orange-300 w-full"><span class="text-xl md:text-2xl">Lv3 數線 Number line</span><span class="level-sub text-xs md:text-sm font-normal"></span></button>
            <button id="btn-num4" onclick="startGame('num4')" class="level-btn bubbly-btn bg-red-100 text-red-700 font-bold py-3 rounded-2xl border-4 border-red-300 w-full"><span class="text-xl md:text-2xl">Lv4 奇偶數線 Odd/Even line</span><span class="level-sub text-xs md:text-sm font-normal"></span></button>
            <button onclick="showLeaderboardFromMenu()" class="bubbly-btn bg-purple-100 text-purple-700 font-bold text-xl md:text-2xl py-3 rounded-2xl border-4 border-purple-300 w-full mt-1 shadow-md">🏆 Leaderboard</button>
        </div>
    </div>

    <div id="gameScreen" class="hidden h-full w-full flex flex-col bg-white overflow-hidden relative">
        <div id="feverOverlayText">🔥 FEVER x2! 🔥</div>
        <div class="flex-none flex justify-between items-center p-2 md:p-4 bg-gray-100 border-b-4 border-gray-200 game-layer">
            <div class="text-lg md:text-2xl font-bold text-gray-700">Time: <span id="timerDisplay" class="text-red-500">30</span>s</div>
            <div class="text-lg md:text-2xl font-bold text-gray-700">Score: <span id="scoreDisplay" class="text-yellow-500">0</span></div>
            <div class="text-sm md:text-xl font-bold text-purple-600 bg-purple-100 px-2 md:px-3 py-1 rounded-full">Combo: <span id="comboDisplay">0</span></div>
        </div>
        <div class="flex-none flex justify-center p-2 bg-blue-50/80 game-layer">
            <div id="bubble" class="bg-white border-4 border-gray-800 px-4 py-2 md:px-6 md:py-3 rounded-3xl font-bold text-center shadow-lg animate-pop">
                <div id="bubbleZh" class="text-2xl md:text-4xl text-red-500"></div>
                <div id="bubbleEn" class="text-sm md:text-lg text-gray-500"></div>
            </div>
        </div>
        <div id="stage" class="flex-1 flex flex-col items-center justify-center bg-blue-50/80 relative p-2 gap-2 game-layer overflow-hidden"></div>
        <div id="controls" class="flex-none p-3 md:p-4 bg-orange-200 border-t-8 border-orange-300 flex justify-center gap-2 md:gap-4 items-center flex-wrap game-layer min-h-[90px]"></div>
    </div>

    <div id="rankPopup">
        <h2 class="text-3xl md:text-5xl mb-4 text-center font-bold px-4">完成！Finished!</h2>
        <div id="rankScore" class="text-4xl md:text-6xl font-bold mb-4"></div>
        <div id="rankTrophy" class="rank-anim px-4"></div>
    </div>

    <div id="leaderboardScreen" class="hidden absolute inset-0 flex flex-col items-center bg-purple-500 z-40 p-4 md:p-8 overflow-y-auto">
        <h1 class="text-4xl md:text-5xl font-bold text-white mb-4 drop-shadow-md mt-4 text-center">🏆 Leaderboard</h1>
        <div class="flex w-full max-w-md rounded-t-2xl overflow-hidden shadow-md text-sm md:text-base">
            <button id="tab-num1" onclick="changeLeaderboardTab('num1')" class="flex-1 py-3 font-bold bg-white text-purple-600">Lv1 比較</button>
            <button id="tab-num2" onclick="changeLeaderboardTab('num2')" class="flex-1 py-3 font-bold bg-purple-300 text-purple-700">Lv2 奇偶</button>
            <button id="tab-num3" onclick="changeLeaderboardTab('num3')" class="flex-1 py-3 font-bold bg-purple-300 text-purple-700">Lv3 數線</button>
            <button id="tab-num4" onclick="changeLeaderboardTab('num4')" class="flex-1 py-3 font-bold bg-purple-300 text-purple-700">Lv4 奇偶線</button>
        </div>
        <div class="bg-white rounded-b-3xl w-full max-w-md p-4 md:p-6 shadow-xl border-x-4 border-b-4 border-purple-300 mb-6">
            <table class="w-full text-left text-sm md:text-base"><thead><tr class="text-gray-400 border-b-2"><th>Rank</th><th>Name</th><th>Score</th></tr></thead><tbody id="leaderboardBody"></tbody></table>
        </div>
        <button onclick="showMenu()" class="bubbly-btn bg-yellow-400 text-yellow-900 font-bold text-xl md:text-2xl py-3 px-8 rounded-full border-4 border-yellow-500 mb-8">Back to Menu</button>
    </div>

    <script type="module">
        // filled in Step 2
    </script>
</body>
</html>
```

- [ ] **Step 2: Add the script — shell + Lv1**

Replace `// filled in Step 2` with:

```js
        import { signIn, onUser, player, settings, initAudio, playSound, spawnParticle, replay,
                 engine, resetEngine, registerHit, triggerWiggle, endFever, startTimer, stopTimer,
                 saveScore, renderLeaderboard, refreshLevelButton, isUnlocked, showRankPopup, mountTeacherModal } from './shared.js';
        import { genCompare, compareAnswer, genOddEven, genLine, genSkipLine } from './numbers-logic.js';

        const $ = id => document.getElementById(id);
        const TABS = [{ key: 'num1', label: 'Lv1' }, { key: 'num2', label: 'Lv2' }, { key: 'num3', label: 'Lv3' }, { key: 'num4', label: 'Lv4' }];
        const POINTS = { num1: 10, num2: 15, num3: 15, num4: 20 };
        const PREV = { num1: null, num2: 'num1', num3: 'num2', num4: 'num3' };
        const ITEMS = ['🍎', '🍭', '🧸', '🍪', '🍓'];
        const pick = arr => arr[Math.floor(Math.random() * arr.length)];
        let mode = 'num1';

        // ---- screens ----
        function show(id) {
            for (const s of ['menuScreen', 'gameScreen', 'leaderboardScreen']) $(s).classList.add('hidden');
            $(id).classList.remove('hidden');
        }
        function refreshMenu() {
            refreshLevelButton($('btn-num1'), 'num1', null, '');
            refreshLevelButton($('btn-num2'), 'num2', 'num1', 'Lv1');
            refreshLevelButton($('btn-num3'), 'num3', 'num2', 'Lv2');
            refreshLevelButton($('btn-num4'), 'num4', 'num3', 'Lv3');
        }
        window.showMenu = () => { refreshMenu(); show('menuScreen'); };

        $('loginBtn').addEventListener('click', signIn);
        onUser(p => {
            $('playerNameDisplay').innerText = `Welcome, ${p.name}!`;
            $('loginScreen').classList.add('hidden');
            showMenu();
        });
        mountTeacherModal(refreshMenu);

        // ---- common game helpers ----
        function setBubble(zh, en) { $('bubbleZh').innerText = zh; $('bubbleEn').innerText = en; replay($('bubble'), 'animate-pop'); }
        function tenFramesHtml(n, emoji) {
            let html = '';
            for (let f = 0; f < Math.ceil(n / 10); f++) {
                html += '<div class="ten-frame">';
                for (let i = 0; i < 10; i++) html += `<div class="frame-cell">${(f * 10 + i) < n ? emoji : ''}</div>`;
                html += '</div>';
            }
            return html;
        }
        /** Common answer handling: correct → next round, wrong → shake bubble. */
        function answer(correct, e) {
            triggerWiggle();
            const pts = registerHit(correct, POINTS[mode]);
            if (pts > 0) { if (e && e.clientX) spawnParticle(e.clientX, e.clientY, `+${pts}`); LEVELS[mode].newRound(); }
            else replay($('bubble'), 'animate-shake');
        }

        window.startGame = function(m) {
            if (!isUnlocked(PREV[m])) return;
            initAudio();
            mode = m;
            resetEngine(settings.numTimeLimit);
            show('gameScreen');
            LEVELS[mode].newRound();
            startTimer(settings.numTimeLimit, endGame);
        };

        async function endGame() {
            stopTimer(); endFever();
            $('stage').innerHTML = ''; $('controls').innerHTML = '';
            await saveScore(mode);
            showRankPopup(engine.score, () => changeLeaderboardTab(mode));
        }

        window.changeLeaderboardTab = key => { show('leaderboardScreen'); renderLeaderboard(TABS, key); };
        window.showLeaderboardFromMenu = () => changeLeaderboardTab('num1');

        // ---- Lv1 Compare ----
        const lv1 = {
            round: null, peekTimer: null,
            newRound() {
                const r = this.round = genCompare();
                const emoji = pick(ITEMS);
                setBubble(r.ask === 'more' ? '誰比較多？' : '誰比較少？', r.ask === 'more' ? 'Who has MORE?' : 'Who has LESS?');
                $('stage').innerHTML = `
                  <div class="flex gap-6 md:gap-16 items-start justify-center w-full">
                    ${['left', 'right'].map((side, i) => `
                      <div class="flex flex-col items-center gap-2 w-[45%] max-w-[220px]">
                        <button class="cust-btn text-6xl md:text-8xl drop-shadow-md" data-side="${side}">${i === 0 ? '🐻' : '🐰'}</button>
                        <button class="num-card text-4xl md:text-6xl" data-peek="${side}">${i === 0 ? r.a : r.b}</button>
                        <div class="peek flex flex-col gap-1 items-center" data-peekbox="${side}"></div>
                      </div>`).join('')}
                  </div>`;
                $('controls').innerHTML = `
                  <button class="bubbly-btn bg-white text-3xl md:text-4xl py-2 px-5 rounded-2xl border-4 border-gray-300" data-side="left">🐻</button>
                  <button class="bubbly-btn bg-blue-400 text-white font-black text-xl md:text-2xl py-3 px-5 rounded-2xl border-4 border-blue-600" data-side="same">一樣多<br><span class="text-sm font-normal">Same</span></button>
                  <button class="bubbly-btn bg-white text-3xl md:text-4xl py-2 px-5 rounded-2xl border-4 border-gray-300" data-side="right">🐰</button>`;
                $('stage').querySelectorAll('[data-peek]').forEach(b => b.addEventListener('pointerdown', () => this.peek(b.dataset.peek, emoji)));
                document.querySelectorAll('#stage [data-side], #controls [data-side]').forEach(b => b.addEventListener('pointerdown', e => answer(b.dataset.side === compareAnswer(this.round), e)));
            },
            peek(side, emoji) {
                const n = side === 'left' ? this.round.a : this.round.b;
                const box = $('stage').querySelector(`[data-peekbox="${side}"]`);
                box.innerHTML = tenFramesHtml(n, emoji);
                playSound('click');
                clearTimeout(this.peekTimer);
                this.peekTimer = setTimeout(() => { box.innerHTML = ''; }, 1500);
            }
        };

        const LEVELS = { num1: lv1 };
```

- [ ] **Step 3: Manual test Lv1 (`http://localhost:8000/numbers.html`)**

1. Already logged in from index (no login prompt) → menu with 4 level buttons; Lv2-4 subtitles say `🔒 需要 Lv1 🥉 300 分 …`.
2. Lv1: bubble bilingual, two number cards; tap card → ten-frames appear for 1.5 s then vanish; tap 🐻/🐰/一樣多 → correct gives +10, wrong shakes bubble; equal pair appears occasionally and only 一樣多 works.
3. 5 correct in a row → fever. Timer end → popup → leaderboard Lv1 tab; back → menu; Lv2 unlocks once best ≥ 300.
4. ⚙️ Teacher on this page opens same panel.

- [ ] **Step 4: Commit**

```bash
git add numbers.html
git commit -m "feat: Number Shop shell with Lv1 compare"
```

---

### Task 8: Lv2 Odd/Even (tap-tap pairing)

**Files:**
- Modify: `numbers.html` (script)

- [ ] **Step 1: Add `lv2` before `const LEVELS = …` and register it**

```js
        // ---- Lv2 Odd / Even ----
        const lv2 = {
            round: null, emoji: '🍎', loose: [], pairs: [], selected: null,
            newRound() {
                this.round = genOddEven();
                this.emoji = pick(ITEMS);
                this.loose = Array.from({ length: this.round.n }, (_, i) => i);
                this.pairs = []; this.selected = null;
                setBubble(`${this.round.n} 是奇數還是偶數？`, `Is ${this.round.n} odd or even? Pair them up!`);
                $('stage').innerHTML = `
                  <div class="num-card text-4xl md:text-6xl">${this.round.n}</div>
                  <div id="looseGrid" class="grid grid-cols-5 gap-2 md:gap-3"></div>
                  <div id="pairShelf" class="flex flex-wrap justify-center gap-2 md:gap-4 w-full"></div>`;
                $('controls').innerHTML = `
                  <button id="undoPair" class="bubbly-btn bg-gray-300 text-gray-700 font-bold text-sm md:text-lg py-2 px-3 rounded-xl border-4 border-gray-400">↩️ Undo</button>
                  <button class="bubbly-btn bg-pink-300 text-pink-900 font-black text-xl md:text-2xl py-3 px-5 rounded-2xl border-4 border-pink-500 disabled:opacity-40" data-ans="odd">奇數<br><span class="text-sm font-normal">Odd</span></button>
                  <button class="bubbly-btn bg-teal-300 text-teal-900 font-black text-xl md:text-2xl py-3 px-5 rounded-2xl border-4 border-teal-500 disabled:opacity-40" data-ans="even">偶數<br><span class="text-sm font-normal">Even</span></button>`;
                $('undoPair').addEventListener('pointerdown', () => this.undo());
                $('controls').querySelectorAll('[data-ans]').forEach(b => b.addEventListener('pointerdown', e => { if (!b.disabled) answer(b.dataset.ans === this.round.answer, e); }));
                this.render();
            },
            render() {
                const grid = $('looseGrid');
                grid.innerHTML = this.loose.map(id => `<button class="item-btn ${id === this.selected ? 'selected' : ''}" data-id="${id}">${this.emoji}</button>`).join('');
                grid.querySelectorAll('[data-id]').forEach(b => b.addEventListener('pointerdown', () => this.tap(parseInt(b.dataset.id))));
                $('pairShelf').innerHTML = this.pairFramesHtml();
                const ready = this.loose.length <= 1;
                $('controls').querySelectorAll('[data-ans]').forEach(b => b.disabled = !ready);
            },
            /** Pairs fill ten-frame columns (top+bottom). A single leftover item sits alone in the next column, highlighted. */
            pairFramesHtml() {
                const frames = Math.max(1, Math.ceil(this.round.n / 10));
                const cells = Array(frames * 10).fill('');
                const put = (k, top, bottom) => { const f = Math.floor(k / 5), c = k % 5; cells[f * 10 + c] = top; cells[f * 10 + 5 + c] = bottom; };
                this.pairs.forEach((_, k) => put(k, this.emoji, this.emoji));
                if (this.loose.length === 1) put(this.pairs.length, `<span class="odd-one">${this.emoji}</span>`, '');
                let html = '';
                for (let f = 0; f < frames; f++) {
                    html += '<div class="ten-frame">';
                    for (let i = 0; i < 10; i++) html += `<div class="frame-cell">${cells[f * 10 + i]}</div>`;
                    html += '</div>';
                }
                return html;
            },
            tap(id) {
                playSound('click'); triggerWiggle();
                if (this.selected === null) { this.selected = id; }
                else if (this.selected === id) { this.selected = null; }
                else { this.pairs.push([this.selected, id]); this.loose = this.loose.filter(x => x !== id && x !== this.selected); this.selected = null; }
                this.render();
            },
            undo() {
                if (!this.pairs.length) return;
                const [a, b] = this.pairs.pop();
                this.loose.push(a, b); this.loose.sort((x, y) => x - y); this.selected = null;
                triggerWiggle(); this.render();
            }
        };
```

Change the registry line to:

```js
        const LEVELS = { num1: lv1, num2: lv2 };
```

- [ ] **Step 2: Manual test Lv2**

To test without earning Bronze, temporarily set `trophy.bronze` to 1 via the teacher panel (then restore 300). Check: card N and N items; tap A (glows), tap A again (deselect), tap B → pair fills one ten-frame column (top+bottom); with one item left it appears alone in the next column with a red dashed border; 奇數/偶數 disabled until ≤1 loose item; Undo returns pair to grid; correct → +15 and new round; wrong → shake. 20 items fit on iPad and phone (5×4 grid, no scroll).

- [ ] **Step 3: Commit**

```bash
git add numbers.html
git commit -m "feat: Number Shop Lv2 odd/even pairing"
```

---

### Task 9: Lv3 Number line + Lv4 Odd/Even line

**Files:**
- Modify: `numbers.html` (script)

- [ ] **Step 1: Add a shared line level factory and register both levels**

Insert before `const LEVELS = …`:

```js
        // ---- Lv3 / Lv4 shelf line ----
        function makeLineLevel(gen, bubbleFor) {
            return {
                round: null, filled: null,
                newRound() {
                    const r = this.round = gen();
                    this.filled = new Set();
                    const [zh, en] = bubbleFor(r);
                    setBubble(zh, en);
                    $('stage').innerHTML = `
                      <div class="text-5xl md:text-7xl">🐻</div>
                      <div id="shelf" class="flex gap-1 md:gap-2 justify-center w-full px-1"></div>
                      <div class="w-full max-w-lg h-3 bg-amber-700 rounded-full"></div>`;
                    $('controls').innerHTML = r.tiles.map(v => `<button class="tile bubbly-btn" data-v="${v}">${v}</button>`).join('');
                    $('controls').querySelectorAll('[data-v]').forEach(b => b.addEventListener('pointerdown', e => this.tapTile(b, e)));
                    this.render();
                },
                nextBlank() { return this.round.blanks.find(i => !this.filled.has(i)); },
                render() {
                    const active = this.nextBlank();
                    $('shelf').innerHTML = this.round.slots.map((v, i) => {
                        const isBlank = this.round.blanks.includes(i);
                        if (!isBlank) return `<div class="slot">${v}</div>`;
                        if (this.filled.has(i)) return `<div class="slot filled">${v}</div>`;
                        return `<div class="slot blank ${i === active ? 'active' : ''}">?</div>`;
                    }).join('');
                },
                tapTile(btn, e) {
                    if (btn.disabled) return;
                    const target = this.nextBlank();
                    if (target === undefined) return;
                    const v = parseInt(btn.dataset.v);
                    if (v === this.round.slots[target]) {
                        this.filled.add(target); btn.disabled = true;
                        playSound('click'); triggerWiggle(); this.render();
                        if (this.nextBlank() === undefined) answer(true, e);
                    } else {
                        replay(btn, 'animate-shake');
                        answer(false, e);
                    }
                }
            };
        }
        const lv3 = makeLineLevel(genLine, () => ['缺了哪些數字？', 'Which numbers are missing?']);
        const lv4 = makeLineLevel(genSkipLine, r => r.parity === 'odd' ? ['奇數排排站，缺了誰？', 'Odd numbers: which are missing?'] : ['偶數排排站，缺了誰？', 'Even numbers: which are missing?']);
```

Replace the registry line with:

```js
        const LEVELS = { num1: lv1, num2: lv2, num3: lv3, num4: lv4 };
```

- [ ] **Step 2: Manual test Lv3 + Lv4**

Lv3: 7 slots, 1-2 `?` with leftmost pulsing; correct tile fills and greys out; wrong tile shakes, combo resets, question stays; finishing all blanks gives +15 and new round. Lv4: 6 slots stepping by 2, tiles include n±1 wrong-parity traps; +20 per round. Both fit phone width (slots shrink to 40px on <768px).

- [ ] **Step 3: Commit**

```bash
git add numbers.html
git commit -m "feat: Number Shop Lv3 number line and Lv4 odd/even line"
```

---

### Task 10: Full device pass, README, push

**Files:**
- Create: `README.md`

- [ ] **Step 1: Run unit tests**

Run: `npm test`
Expected: `# pass 15`, `# fail 0`

- [ ] **Step 2: Device checklist** (serve locally, open on iPad Safari and a phone via LAN IP; add that IP to Firebase authorized domains first, or push to GitHub Pages and test there)

- [ ] No double-tap zoom on any button (both pages)
- [ ] Every screen fits without scrolling: picker, Market menu, Number Shop menu (4 buttons + leaderboard), Lv2 with 20 items, Lv3/Lv4 shelf
- [ ] Fever watermark does not cover the bubble on phone
- [ ] Teacher panel scrolls inside modal on small phone (max-h-[95dvh])
- [ ] Trophy line correct on popup, menu subtitles, leaderboard rows (both pages)
- [ ] Lv2-4 locked with correct subtitle until Bronze on previous level
- [ ] Market Medium/Hard: locked by score shows score line; locked by teacher shows teacher line

- [ ] **Step 3: Write `README.md`**

```markdown
# P1 Maths games

Two browser games for Primary 1, hosted on GitHub Pages, Google login via Firebase.

- `index.html` — hub + 🍎 Math Market (counting with ten-frames)
- `numbers.html` — 🔢 Number Shop (compare, odd/even, number line, odd/even line)
- `shared.js` / `shared.css` — login, fever/combo, leaderboard, teacher panel
- `numbers-logic.js`, `trophy.js` — pure logic, unit tested

## Teacher

⚙️ Teacher button → PIN → set timers, Market unlock toggles, trophy cutoffs (Bronze / Silver / Gold). Unlocking the next level needs Bronze on the previous one.

## Develop

    python3 -m http.server 8000   # open http://localhost:8000/
    npm test                      # node --test tests/

Google login does not work from file://. Use localhost or the GitHub Pages URL.
```

- [ ] **Step 4: Commit and push**

```bash
git add README.md
git commit -m "docs: README for two-game platform"
git push origin main
```

- [ ] **Step 5: Verify live** — open the GitHub Pages URL, log in, play one round of each game, confirm Firestore `scores` has `num1` records.

---

### Task 11: Bookshop theme + juice pack (both games)

Runs after Task 9 and before Task 10's push. Supersedes the pair-box shelf in Task 8 and the grey slot/tile UI in Task 9.

**Files:**
- Create: `juice.js`
- Modify: `shared.css` (append)
- Modify: `index.html` (customer face id, item tap, GIVE handler)
- Modify: `numbers.html` (Lv1 stacks, Lv2 plates + tables, Lv3/4 bookshelf, `answer()` reactions)

- [ ] **Step 1: Create `juice.js`**

```js
// Pure DOM animation helpers. No Firebase, no game state.

function re(el, cls) { if (!el) return; el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); }

export function squish(el) { re(el, 'squish'); }
export function bounce(el) { re(el, 'bounce'); }
export function popScore(el) { re(el, 'pop-score'); }
export function flashRed(el) { re(el, 'flash-red'); }

/** Radial emoji burst at viewport point (x, y). */
export function burst(x, y, emojis = ['⭐', '✨', '🌟'], n = 8) {
  for (let i = 0; i < n; i++) {
    const el = document.createElement('span');
    el.className = 'burst-piece';
    el.textContent = emojis[i % emojis.length];
    const ang = (i / n) * Math.PI * 2 + Math.random() * 0.5;
    const dist = 50 + Math.random() * 50;
    el.style.left = `${x}px`; el.style.top = `${y}px`;
    el.style.setProperty('--dx', `${Math.cos(ang) * dist}px`);
    el.style.setProperty('--dy', `${Math.sin(ang) * dist - 30}px`);
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 650);
  }
}

/**
 * Fly `html` from the centre of `from` (element or DOMRect) to the centre of `toEl`, then call onArrive.
 * Duration 350 ms. The clone is removed afterwards.
 */
export function flyTo(from, toEl, html, onArrive) {
  const a = from.getBoundingClientRect ? from.getBoundingClientRect() : from;
  const b = toEl.getBoundingClientRect();
  const el = document.createElement('div');
  el.className = 'fly'; el.innerHTML = html;
  el.style.transform = `translate(${a.left + a.width / 2}px, ${a.top + a.height / 2}px) translate(-50%, -50%)`;
  document.body.appendChild(el);
  requestAnimationFrame(() => requestAnimationFrame(() => {
    el.style.transform = `translate(${b.left + b.width / 2}px, ${b.top + b.height / 2}px) translate(-50%, -50%) scale(0.9)`;
  }));
  setTimeout(() => { el.remove(); if (onArrive) onArrive(); }, 360);
}

/** Temporarily replace an element's text (a face emoji); restores after ms. */
export function react(el, emoji, ms = 600) {
  if (!el) return;
  if (el._face === undefined) el._face = el.textContent;
  el.textContent = emoji;
  clearTimeout(el._faceTimer);
  el._faceTimer = setTimeout(() => { el.textContent = el._face; }, ms);
}
```

- [ ] **Step 2: Append to `shared.css`**

```css

/* ---------- Juice ---------- */
@keyframes squish { 0% { transform: scale(1); } 40% { transform: scale(0.85, 0.8); } 70% { transform: scale(1.1, 1.15); } 100% { transform: scale(1); } }
.squish { animation: squish 0.25s ease-out; }
@keyframes burstOut { 0% { transform: translate(0, 0) scale(0.6); opacity: 1; } 100% { transform: translate(var(--dx), var(--dy)) scale(1.4); opacity: 0; } }
.burst-piece { position: fixed; pointer-events: none; z-index: 120; font-size: 1.6rem; animation: burstOut 0.6s ease-out forwards; }
.fly { position: fixed; left: 0; top: 0; pointer-events: none; z-index: 110; transition: transform 0.35s cubic-bezier(0.2, 0.8, 0.2, 1); will-change: transform; }
@keyframes scorePop { 0% { transform: scale(1); } 50% { transform: scale(1.5); color: #f97316; } 100% { transform: scale(1); } }
.pop-score { display: inline-block; animation: scorePop 0.35s ease-out; }
@keyframes bounceUp { 0%, 100% { transform: translateY(0); } 40% { transform: translateY(-18px); } }
.bounce { animation: bounceUp 0.4s ease-out; }
@keyframes redFlash { 0% { box-shadow: inset 0 0 0 0 rgba(239,68,68,0); } 30% { box-shadow: inset 0 0 60px 10px rgba(239,68,68,0.5); } 100% { box-shadow: inset 0 0 0 0 rgba(239,68,68,0); } }
.flash-red { animation: redFlash 0.4s ease-out; }

/* ---------- Bookshop theme ---------- */
.c0 { background: #f87171; } .c1 { background: #fbbf24; } .c2 { background: #34d399; } .c3 { background: #60a5fa; } .c4 { background: #a78bfa; } .c5 { background: #f472b6; }
.odd { background: #ef4444; } .even { background: #3b82f6; }

/* Lv1 book stacks */
.stack-btn { position: relative; display: flex; flex-direction: column; align-items: center; gap: 4px; background: none; border: 0; padding: 0; }
.stack-num { background: white; border: 3px solid #1f2937; border-radius: 12px; font-weight: 900; font-size: 1.75rem; padding: 0 14px; box-shadow: 0 4px 0 rgba(0,0,0,0.2); }
.stack { display: flex; flex-direction: column-reverse; gap: 2px; align-items: center; min-height: 12px; }
.book { height: 8px; width: 60px; border-radius: 3px; box-shadow: inset 0 -2px 0 rgba(0,0,0,0.25); }
.peek { position: absolute; left: 50%; top: 0; transform: translateX(-50%); display: flex; flex-direction: column; gap: 4px; align-items: center; background: rgba(255,255,255,0.95); border-radius: 12px; padding: 4px; z-index: 5; }
.peek:empty { display: none; }
@media (min-width: 768px) { .book { height: 12px; width: 90px; } .stack-num { font-size: 2.5rem; } }

/* Lv2 plates + tables */
.plate { width: 48px; height: 48px; border-radius: 50%; border: 3px solid #cbd5e1; background: radial-gradient(circle, #fff 55%, #e2e8f0 56%, #fff 70%); font-size: 26px; display: flex; align-items: center; justify-content: center; transition: transform 0.1s; }
.plate.selected { border-color: #f59e0b; transform: scale(1.15); box-shadow: 0 0 0 4px rgba(245,158,11,0.4); }
.tables { display: grid; grid-template-columns: repeat(5, 1fr); gap: 6px; background: #fde68a; padding: 6px; border-radius: 12px; border: 3px solid #f59e0b; }
.table { display: flex; flex-direction: column; gap: 2px; background: #92400e; border-radius: 8px; padding: 3px; }
.seat { width: 34px; height: 30px; border-radius: 6px; background: #fef3c7; display: flex; align-items: center; justify-content: center; font-size: 20px; }
.seat.empty { background: rgba(255,255,255,0.35); }
.seat.odd-one { border: 3px dashed #ef4444; background: #fee2e2; animation: pop 0.25s ease-out; }
@media (min-width: 768px) { .plate { width: 60px; height: 60px; font-size: 32px; } .seat { width: 44px; height: 38px; font-size: 26px; } }

/* Lv3/4 bookshelf */
.shelf { display: flex; gap: 4px; align-items: flex-end; background: #78350f; padding: 6px 6px 0; border-radius: 8px 8px 0 0; border-bottom: 8px solid #451a03; }
.book-slot { width: 40px; height: 56px; border-radius: 4px 4px 0 0; display: flex; align-items: center; justify-content: center; font-weight: 900; font-size: 20px; color: white; text-shadow: 0 1px 0 rgba(0,0,0,0.4); box-shadow: inset -3px 0 0 rgba(0,0,0,0.2); }
.book-slot.gap { background: rgba(0,0,0,0.35); border: 2px dashed #fcd34d; color: #fcd34d; box-shadow: none; }
.book-slot.filled { animation: pop 0.3s ease-out; }
.bear-row { display: flex; gap: 4px; }
.bear-row div { width: 40px; text-align: center; font-size: 26px; line-height: 1; }
.bear-row .here { animation: bounceUp 0.8s infinite; }
.tile-book { width: 48px; height: 64px; border-radius: 4px 4px 0 0; color: white; font-weight: 900; font-size: 24px; text-shadow: 0 1px 0 rgba(0,0,0,0.4); border: 0; box-shadow: inset -3px 0 0 rgba(0,0,0,0.2), 0 4px 0 rgba(0,0,0,0.3); }
.tile-book:disabled { opacity: 0.3; }
@media (min-width: 768px) { .book-slot { width: 56px; height: 76px; font-size: 28px; } .bear-row div { width: 56px; font-size: 34px; } .tile-book { width: 64px; height: 84px; font-size: 32px; } }
```

- [ ] **Step 3: `index.html` — Market juice**

Add `id="customerFace"` to the bear: change `<div class="text-6xl md:text-8xl drop-shadow-md">🐻</div>` to `<div id="customerFace" class="text-6xl md:text-8xl drop-shadow-md">🐻</div>`.

Add the import after the `shared.js` import line:

```js
        import { squish, bounce, popScore, flashRed, burst, flyTo, react } from './juice.js';
```

Replace `addItem`:

```js
        function addItem(amount, e) {
            if (round.current + amount > 40) return;
            round.current += amount; round.history.push(amount);
            renderTenFrames(); playSound('click');
            squish($('itemBtn'));
            const cells = $('tenFrameContainer').querySelectorAll('.frame-cell');
            const target = cells[round.current - 1];
            if (target) flyTo($('itemBtn'), target, `<span class="text-3xl">${round.item}</span>`);
            if (e && e.clientX) spawnParticle(e.clientX, e.clientY, `+${amount}`);
            triggerWiggle();
        }
```

Replace the GIVE handler:

```js
        $('giveBtn').addEventListener('pointerdown', (e) => {
            triggerWiggle();
            const pts = registerHit(round.current === round.target, POINTS[round.mode]);
            if (pts > 0) {
                burst(e.clientX, e.clientY);
                bounce($('customerFace')); react($('customerFace'), '🥳');
                popScore($('scoreDisplay'));
                nextCustomer();
            } else {
                react($('customerFace'), '😵'); flashRed($('gameScreen'));
                replay($('customerBubble'), 'animate-shake');
            }
        });
```

- [ ] **Step 4: `numbers.html` — imports and `answer()`**

Add after the `numbers-logic.js` import:

```js
        import { squish, bounce, popScore, flashRed, burst, flyTo, react } from './juice.js';
```

Replace `answer`:

```js
        /** Common answer handling: correct → next round, wrong → shake bubble. */
        function answer(correct, e) {
            triggerWiggle();
            const pts = registerHit(correct, POINTS[mode]);
            const faces = $('stage').querySelectorAll('[data-face]');
            if (pts > 0) {
                if (e && e.clientX) { burst(e.clientX, e.clientY); spawnParticle(e.clientX, e.clientY, `+${pts}`); }
                faces.forEach(f => { bounce(f); react(f, '🥳'); });
                popScore($('scoreDisplay'));
                LEVELS[mode].newRound();
            } else {
                faces.forEach(f => react(f, '😵'));
                flashRed($('gameScreen'));
                replay($('bubble'), 'animate-shake');
            }
        }
```

- [ ] **Step 5: `numbers.html` — Lv1 book stacks**

Replace the `$('stage').innerHTML` template inside `lv1.newRound()` with:

```js
                const stackHtml = n => `<div class="stack">${Array.from({ length: n }, (_, i) => `<div class="book c${i % 6}"></div>`).join('')}</div>`;
                $('stage').innerHTML = `
                  <div class="flex gap-6 md:gap-16 items-start justify-center w-full">
                    ${['left', 'right'].map((side, i) => `
                      <div class="relative flex flex-col items-center gap-2 w-[45%] max-w-[220px]">
                        <button class="cust-btn text-5xl md:text-7xl drop-shadow-md" data-side="${side}" data-face>${i === 0 ? '🐻' : '🐰'}</button>
                        <button class="stack-btn" data-peek="${side}"><div class="stack-num">${i === 0 ? r.a : r.b}</div>${stackHtml(i === 0 ? r.a : r.b)}</button>
                        <div class="peek" data-peekbox="${side}"></div>
                      </div>`).join('')}
                  </div>`;
```

(The `.peek` box now overlays the stack; the rest of `lv1` is unchanged.)

- [ ] **Step 6: `numbers.html` — Lv2 plates and tables**

Replace the whole `const lv2 = { … };` with:

```js
        // ---- Lv2 Odd / Even ----
        const lv2 = {
            round: null, emoji: '🍛', loose: [], pairs: [], selected: null,
            newRound() {
                this.round = genOddEven();
                this.emoji = pick(['🍛', '🍜', '🍰', '🥟', '🍩']);
                this.loose = Array.from({ length: this.round.n }, (_, i) => i);
                this.pairs = []; this.selected = null;
                setBubble(`${this.round.n} 碟是奇數還是偶數？`, `${this.round.n} plates: odd or even? Seat them two by two!`);
                $('stage').innerHTML = `
                  <div class="flex items-center gap-3"><span class="text-4xl md:text-6xl" data-face>🐻</span><div class="num-card text-3xl md:text-5xl">${this.round.n}</div></div>
                  <div id="looseGrid" class="grid grid-cols-5 gap-2 md:gap-3"></div>
                  <div id="pairShelf" class="flex flex-col gap-2 items-center w-full"></div>`;
                $('controls').innerHTML = `
                  <button id="undoPair" class="bubbly-btn bg-gray-300 text-gray-700 font-bold text-sm md:text-lg py-2 px-3 rounded-xl border-4 border-gray-400">↩️ Undo</button>
                  <button class="bubbly-btn bg-pink-300 text-pink-900 font-black text-xl md:text-2xl py-3 px-5 rounded-2xl border-4 border-pink-500 disabled:opacity-40" data-ans="odd">奇數<br><span class="text-sm font-normal">Odd</span></button>
                  <button class="bubbly-btn bg-teal-300 text-teal-900 font-black text-xl md:text-2xl py-3 px-5 rounded-2xl border-4 border-teal-500 disabled:opacity-40" data-ans="even">偶數<br><span class="text-sm font-normal">Even</span></button>`;
                $('undoPair').addEventListener('pointerdown', () => this.undo());
                $('controls').querySelectorAll('[data-ans]').forEach(b => b.addEventListener('pointerdown', e => { if (!b.disabled) answer(b.dataset.ans === this.round.answer, e); }));
                this.render();
            },
            /** Tables 5 per row (= one ten-frame). Pair k sits at table k; a lone leftover plate sits at table pairs.length. */
            tablesHtml() {
                const tables = Math.ceil(this.round.n / 2);
                const rows = Math.ceil(tables / 5);
                let html = '';
                for (let r = 0; r < rows; r++) {
                    html += '<div class="tables">';
                    for (let c = 0; c < 5; c++) {
                        const k = r * 5 + c;
                        if (k >= tables) { html += '<div></div>'; continue; }
                        const seated = k < this.pairs.length;
                        const lone = !seated && k === this.pairs.length && this.loose.length === 1;
                        html += `<div class="table" data-table="${k}">
                          <div class="seat ${seated ? '' : lone ? 'odd-one' : 'empty'}">${seated || lone ? this.emoji : ''}</div>
                          <div class="seat ${seated ? '' : 'empty'}">${seated ? this.emoji : ''}</div></div>`;
                    }
                    html += '</div>';
                }
                return html;
            },
            render() {
                const grid = $('looseGrid');
                grid.innerHTML = this.loose.map(id => `<button class="plate ${id === this.selected ? 'selected' : ''}" data-id="${id}">${this.emoji}</button>`).join('');
                grid.querySelectorAll('[data-id]').forEach(b => b.addEventListener('pointerdown', () => this.tap(parseInt(b.dataset.id), b)));
                $('pairShelf').innerHTML = this.tablesHtml();
                const ready = this.loose.length <= 1;
                $('controls').querySelectorAll('[data-ans]').forEach(b => b.disabled = !ready);
            },
            tap(id, btn) {
                playSound('click'); triggerWiggle(); squish(btn);
                if (this.selected === null) { this.selected = id; this.render(); return; }
                if (this.selected === id) { this.selected = null; this.render(); return; }
                const fromA = $('looseGrid').querySelector(`[data-id="${this.selected}"]`).getBoundingClientRect();
                const fromB = btn.getBoundingClientRect();
                const k = this.pairs.length;
                this.pairs.push([this.selected, id]);
                this.loose = this.loose.filter(x => x !== id && x !== this.selected);
                this.selected = null;
                this.render();
                const table = $('pairShelf').querySelector(`[data-table="${k}"]`);
                if (table) {
                    const seats = table.querySelectorAll('.seat');
                    const html = `<span class="text-2xl">${this.emoji}</span>`;
                    flyTo(fromA, seats[0], html); flyTo(fromB, seats[1], html);
                }
            },
            undo() {
                if (!this.pairs.length) return;
                const [a, b] = this.pairs.pop();
                this.loose.push(a, b); this.loose.sort((x, y) => x - y); this.selected = null;
                triggerWiggle(); this.render();
            }
        };
```

- [ ] **Step 7: `numbers.html` — Lv3/4 bookshelf**

Replace `makeLineLevel` and the `lv3`/`lv4` lines with:

```js
        // ---- Lv3 / Lv4 bookshelf ----
        function makeLineLevel(gen, bubbleFor, colorOf) {
            return {
                round: null, filled: null,
                newRound() {
                    const r = this.round = gen();
                    this.filled = new Set();
                    const [zh, en] = bubbleFor(r);
                    setBubble(zh, en);
                    $('stage').innerHTML = `
                      <div class="flex flex-col items-center gap-1">
                        <div id="shelf" class="shelf"></div>
                        <div id="bearRow" class="bear-row"></div>
                      </div>`;
                    $('controls').innerHTML = r.tiles.map(v => `<button class="tile-book ${colorOf(v)}" data-v="${v}">${v}</button>`).join('');
                    $('controls').querySelectorAll('[data-v]').forEach(b => b.addEventListener('pointerdown', e => this.tapTile(b, e)));
                    this.render();
                },
                nextBlank() { return this.round.blanks.find(i => !this.filled.has(i)); },
                render(justFilled) {
                    const active = this.nextBlank();
                    $('shelf').innerHTML = this.round.slots.map((v, i) => {
                        const isBlank = this.round.blanks.includes(i);
                        if (!isBlank) return `<div class="book-slot ${colorOf(v)}">${v}</div>`;
                        if (this.filled.has(i)) return `<div class="book-slot ${colorOf(v)} ${i === justFilled ? 'filled' : ''}">${v}</div>`;
                        return `<div class="book-slot gap">?</div>`;
                    }).join('');
                    $('bearRow').innerHTML = this.round.slots.map((_, i) => `<div class="${i === active ? 'here' : ''}" ${i === active ? 'data-face' : ''}>${i === active ? '🐻' : ''}</div>`).join('');
                },
                tapTile(btn, e) {
                    if (btn.disabled) return;
                    const target = this.nextBlank();
                    if (target === undefined) return;
                    const v = parseInt(btn.dataset.v);
                    squish(btn);
                    if (v === this.round.slots[target]) {
                        btn.disabled = true;
                        playSound('click'); triggerWiggle();
                        const slotEl = $('shelf').children[target];
                        flyTo(btn, slotEl, `<div class="book-slot ${colorOf(v)}">${v}</div>`, () => {
                            this.filled.add(target);
                            this.render(target);
                            if (this.nextBlank() === undefined) answer(true, e);
                        });
                    } else {
                        replay(btn, 'animate-shake');
                        answer(false, e);
                    }
                }
            };
        }
        const lv3 = makeLineLevel(genLine, () => ['書架缺了哪些數字？', 'Which books are missing?'], v => `c${v % 6}`);
        const lv4 = makeLineLevel(genSkipLine, r => r.parity === 'odd' ? ['奇數書排排站，缺了誰？', 'Odd books: which are missing?'] : ['偶數書排排站，缺了誰？', 'Even books: which are missing?'], v => v % 2 ? 'odd' : 'even');
```

- [ ] **Step 8: Verify in browser** (serve, hide `#loginScreen`, `(await import('./shared.js')).settings.trophy.bronze = 0`, mobile preset 375×812 and 360×640)

- Market: `window.startGame('easy')`; item tap squishes and a clone flies into the next cell; GIVE correct → burst, 🐻→🥳, score pops; wrong → 😵 + red flash.
- Lv1: two book stacks with numeral badges, taller stack = bigger number; tap stack → ten-frames overlay it for 1.5 s; both stacks of 20 fit above the controls on 360×640.
- Lv2: plates in grid; tap two → both fly to the next table's seats; leftover plate sits alone with red dashed seat; 20 plates + 10 tables fit on 360×640 (measure `#pairShelf` bottom vs `#controls` top).
- Lv3/4: shelf of coloured spines with gaps; bear bounces under the leftmost gap; correct book flies into the gap then bear moves to the next gap; wrong book shakes; Lv4 spines alternate red/blue by parity.
- Console: zero errors. Reset viewport, kill server.

- [ ] **Step 9: Commit**

```bash
git add juice.js shared.css index.html numbers.html
git commit -m "feat: bookshop theme and tap/answer juice for both games"
```
