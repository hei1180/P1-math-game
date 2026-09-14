# Number Shop (數字小店) — Design Spec

Date: 2026-09-14
Status: approved by teacher (owner), pending implementation plan

## Goal

Second game on the P1 math platform, same store world as Math Market. Trains
number comparison (1-20), odd/even (奇數/偶數), and number-line sense. Four
levels, unlocked by score. Reuses login, teacher PIN, fever/combo, leaderboard.

## Architecture

Repo root served by GitHub Pages.

| File | Role |
|---|---|
| `index.html` | Hub. Login → game picker (🍎 Math Market / 🔢 Number Shop) → existing Market menu + game. |
| `numbers.html` | Number Shop: level menu → game → leaderboard. |
| `shared.js` | ES module used by both pages. Firebase init, auth, audio, particles, combo/fever engine, timer, score save/load, teacher settings + PIN, leaderboard rendering. |
| `shared.css` | bubbly-btn, ten-frame, fever, particle, rank popup keyframes. |
| `numbers-logic.js` | Pure round generators + answer checks for Number Shop. No Firebase import so it runs under `node --test`. |
| `trophy.js` | Pure `trophyFor(score, cutoffs)` + icons. |
| `tests/logic.test.mjs` | Unit tests for `numbers-logic.js` and `trophy.js`. |

`shared.js` exports:

- `app, auth, db`, `signIn()`, `onUser(cb)`
- `initAudio()`, `playSound('click'|'success'|'error')`, `spawnParticle(x, y, text)`
- Combo/fever engine: `registerHit(correct)` → `{points multiplier, combo}`; fever starts at combo 5, x2 points, 10 s timeout refreshed on each correct, `endFever()`, `triggerWiggle()`
- `startTimer(seconds, onTick, onEnd)`, `stopTimer()`
- `saveScore(modeKey, {score, maxCombo, accuracy})` — writes `scores/{uid}_{modeKey}` only if higher
- `getTop10(modeKey)`, `getMyHighScores()` → `{modeKey: score}`
- `loadTeacherSettings()`, `saveTeacherSettings(obj)`, `checkPin(str)` (PIN 1128)
- `renderLeaderboard(tabs, activeKey, tbodyEl, myUid)`

Firebase Auth persistence is local, so login carries across `index.html` and
`numbers.html` on the same origin. "Back" from Number Shop navigates to
`index.html`.

Math Market refactor: replace inline copies with imports from `shared.js`.
Behaviour must stay identical (regression checklist below). Mode keys
`easy/medium/hard` unchanged, no data migration.

## Firestore

- `scores/{uid}_{modeKey}`: `playerName, uid, score, maxCombo, accuracy, mode, timestamp`. New keys `num1`, `num2`, `num3`, `num4`.
- `settings/global`: existing `timeLimit, unlockMedium, unlockHard` plus `numTimeLimit` (default 30) and `trophy: {bronze, silver, gold}` (default 300 / 700 / 1200). Missing fields → defaults.

## Common gameplay rules (Number Shop)

- Top bar: Time / Score / Combo, same as Market.
- Customer 🐻 speech bubble carries the question. Text bilingual: big Traditional Chinese, small English under it.
- Wrong answer: bubble shake, error sound, combo reset, fever ends, **same question stays**.
- Correct: success sound, particle, next round.
- Fever identical to Market: combo ≥5 → x2 points, 10 s refresh, watermark text, click wiggle.
- Timer from `numTimeLimit`. Game ends at 0 → save score → rank popup → leaderboard tab of that level.
- Accuracy = correct answer taps / total answer taps. Peeks, pairing taps, and undo are not counted.

## Levels

### Lv1 比較 Compare (1-20) — key `num1`, 10 pts/round

- Two customers side by side (🐻 left, 🐰 right), each holds a number card 1-20.
- Bubble: 🐻比🐰（多/少）player chooses the button 多 or 少.
- About 15% of rounds the numbers are equal. Third button 一樣多 Same.
- Tap a number card = peek: ten-frames (same 十格框 style) appear under that customer and stay until the next question. Both sides can be revealed.
- Answer = tap the 多or少 button.

### Lv2 奇數偶數 Odd / Even — key `num2`, 15 pts/round

- Number card N (1-20; 60% drawn from 1-10, 40% from 11-20) plus N loose emoji items in a grid (max 5×4).
- Tap plate A (glows), tap plate B → both fly to the next two-seat table (see Theme). Tables sit 5 per row = a ten-frame. Undo = clear the last table.
- When exactly one plate is left it sits alone at the next table, its seat highlighted (dashed red) — the visual "odd one out".
- Buttons 奇數 Odd / 偶數 Even disabled until ≤1 loose item remains.
- Correct answer = N mod 2.

### Lv3 數線 Number line — key `num3`, 15 pts/round

- Shelf shows 7 consecutive slots from 1-20 (start 1..14). 1 or 2 slots blank (50/50).
- 4 tiles below: correct value(s) plus distractors from {n±1, n±2, n±10} clipped to 1-20, all unique, one tile per blank correct.
- Leftmost blank pulses. Tap tile → checked immediately for that blank. Correct fills it; wrong shakes tile and counts as wrong.
- Round complete when all blanks filled → points awarded once.

### Lv4 奇偶數線 Odd/even line — key `num4`, 20 pts/round

- Same shelf UI, 6 slots, step 2. Sequence is all odds (1..19) or all evens (2..20), random start so all 6 fit in range.
- 1 or 2 blanks. Distractors: n±1 (the classic error) and n±4, clipped and unique.

## Theme: 書店 + 茶餐廳 (Number Shop visuals)

Abstract cards/tiles are replaced by shop objects, all CSS + emoji, no image files.

| Level | Visual |
|---|---|
| Lv1 比較 | Each customer holds a plain **number card** (no stacks, by owner's choice). Tap the card → ten-frames appear under it and stay until the next question. Tap the animal → answer. |
| Lv2 奇偶 | N **plates** of food on the counter. Tap two plates → they fly to a **two-seat table**. Tables are laid out 5 per row (a row = one ten-frame). With one plate left it sits alone at the next table with a red dashed seat: the odd one out. Tables needed = ceil(N/2). |
| Lv3 數線 | A **bookshelf** with numbered spines; missing books are dark gaps. The 🐻 stands under the leftmost gap, bouncing, waiting. Loose books (4) lie in the controls bar; tap one → it flies up into the gap if it is the right number, else it shakes. Left-to-right rule stays (bear marks the active gap). |
| Lv4 奇偶數線 | Same shelf. Odd-numbered books red, even-numbered blue, so the skip pattern is visible. |

## Juice (both games)

`juice.js` (pure DOM helpers, no Firebase): `squish(el)`, `bounce(el)`, `popScore(el)`, `flashRed(el)`, `burst(x, y, emojis, n)`, `flyTo(fromElOrRect, toEl, html, onArrive)`, `react(el, emoji, ms)`.

- Item tap (Market item button, Lv2 plate, Lv3/4 book): squish, and a clone flies to its destination cell / seat / gap.
- Correct answer: ⭐✨🌟 burst at the tap point, customer bounces and shows 🥳 for 0.6 s, score number pops.
- Wrong answer: customer shows 😵 for 0.6 s, red inset flash on the game screen, bubble shake (existing).
- Fever / combo / timer / end-of-game effects unchanged in this iteration.

## Trophies (both games, every level)

Derived from score at game end, never stored. Cutoffs come from `settings/global.trophy`, same for all levels because points per round already scale with difficulty (Market 10/20/30, Number Shop 10/15/15/20).

| Tier | Default cutoff |
|---|---|
| 🎖 Finisher | score > 0 |
| 🥉 Bronze | ≥ 300 |
| 🥈 Silver | ≥ 700 |
| 🥇 Gold | ≥ 1200 |

Basis: in the first class run (27 students, Market, 3 levels) the top 10 scored 1000-1800. Gold ≈ top quarter. Teacher tunes the three numbers in the PIN panel after seeing the Firestore distribution.

Shown in three places:
- Rank popup: "🥈 Silver!" line under the score.
- Level buttons on both menus: best trophy icon for that level (from `getMyHighScores()`).
- Leaderboard: trophy icon beside each name.

`shared.js` exports `trophyFor(score)` → `'gold'|'silver'|'bronze'|'finisher'|null` and `TROPHY_ICON`.

## Unlock (score gate only)

Unlock next level = Bronze cutoff on the previous level (default 300). Applies to Market too, replacing the old 150 / 250 gates.

| Level | Requirement |
|---|---|
| Market Easy | always open |
| Market Medium | Easy high ≥ Bronze **and** teacher Unlock Medium |
| Market Hard | Medium high ≥ Bronze **and** teacher Unlock Hard |
| Number Lv1 | always open |
| Number Lv2 | Lv1 high ≥ Bronze |
| Number Lv3 | Lv2 high ≥ Bronze |
| Number Lv4 | Lv3 high ≥ Bronze |

Teacher unlock toggles do not apply to Number Shop. Locked buttons show 🔒 and 50% opacity, same as Market. Every level button (both games) shows its unlock requirement as a small line under the title, e.g. `🔒 需要 Lv1 🥉 300 分 / Need Lv1 Bronze (300)`; once unlocked the line shows the player's best trophy for that level instead.

## Teacher panel

Same ⚙️ Teacher button and PIN on both pages. Fields: Unlock Medium, Unlock Hard, Market time (s), **Number Shop time (s)**, **Trophy cutoffs: Bronze / Silver / Gold**. Save writes the whole `settings/global` doc. Validation: bronze < silver < gold, all > 0, else alert and no save.

## Leaderboard

Number Shop page: 4 tabs (Lv1 比較 / Lv2 奇偶 / Lv3 數線 / Lv4 奇偶線), top 10, own row highlighted. 🏆 button on level menu. Rank popup same as Market.

## Error handling

Firestore failures are caught and logged; game stays playable, score shown as "Offline Score" in leaderboard, same as today.

## Testing

- `node --test tests/` covers `numbers-logic.js`: values within 1-20, blank counts, distractor uniqueness, skip sequences stay odd/even, equal-case rate ≈ 15% over 2000 draws, answer checks. `trophyFor` lives in a pure `trophy.js` (imported by `shared.js`) so it is tested too: boundaries at exactly 300/700/1200, score 0 → null.
- Manual on iPad Safari and phone Chrome: fits screen, no double-tap zoom, peek shows/hides, pair + undo, buttons disabled until paired, fever visuals, timer end → rank → leaderboard.
- Market regression after refactor: login, easy round, GIVE correct/wrong, fever, leaderboard tabs, teacher save.
