# Picnic Park 野餐樂園 — Design Spec

Date: 2026-10-10
Status: built on branch `picnic-park`, waiting for the owner's review
Topic: 1N2 基本加法和減法 — textbook chapters 8 基本加法, 9 基本減法, 10 0 的認識 (pp. 46–67)

## Goal

A fifth game that teaches the meaning of + and −, not just the facts. Children meet the textbook's own pictures and words (共有, 多放, 還有, 相差, 比……多/少, 0 表示沒有), act on them (move counters into a ten-frame, cross out, pair up), record them as a horizontal number sentence (橫式), then reason about them (swap, related facts, zero patterns) and finally judge and create sentences of their own.

About **10 minutes per chapter**: 5 levels × 6 questions, roughly 2 minutes per level.

## Platform fit

- New page `picnic.html`; hub card 🧺 Picnic Park 野餐樂園. Plain DOM + CSS (no game engine), Tailwind for the login shell like the other pages.
- `picnic-logic.js` — pure: chapters, level plans, question generators, adaptive difficulty, stars, unlocks, progress merge. Tested in `tests/picnic-logic.test.mjs`.
- `picnic-progress.js` — Firestore `picnicProgress/{uid}` + localStorage mirror (same pattern as Rod Town / Robot Workshop).
- `picnic/main.js` (map, worked example, runner, end card, sticker), `picnic/render.js` (pictures and the seven question screens), `picnic/audio.js` (synth sounds + Cantonese read-aloud), `picnic/picnic.css`.
- Teacher panel: chapter toggles 加法 / 減法 / 0 (`settings.picnicUnlock.{add,sub,zero}`, all off by default). Test mode opens everything and saves nothing.
- Attempts: `game: 'picnic'`, `mode: picnicAdd1 … picnicZero5`, `kind: 'level'`, stars, mistakes, durationSec and up to five `confusions` ({item: '7+5', picked: '11'}) so the teacher sees which facts went wrong.
- Teacher dashboard: Overview sub-tab 🧺 Picnic Park with best stars per level.
- `firestore.rules`: new `picnicProgress` block; `'picnic'` added to the allowed `attempts.game` values. **The teacher must re-publish the rules in the Firebase console** or progress/attempts from this game are refused.

## Curriculum boundaries kept (EDB KS1 notes, 1N2)

- Both parts single-digit (1–9), so sums ≤ 18; never 12 + 5 or 17 − 5. Subtrahend and difference single-digit.
- Exception, as in the textbook: zero facts may use numbers to 18 (0 + 12, 15 − 15).
- Picture-based stories; horizontal form only; no vertical form; no > or <.
- Commutativity for + only; 「5 − 3 不可以寫成 3 − 5」 is taught as a judge question.

## Bloom's taxonomy — the level ladder

| Level | 加法 Addition (🧁 甜品店) | 減法 Subtraction (🐑 開心農場) | 0 Zero (🪺 鳥巢樹) | Bloom |
|---|---|---|---|---|
| 1 | 認識加法 — move the second group into the ten-frame (count on), then answer | 認識減法 — cross out what leaves, then answer | 認識 0 — eat them all, which cup is empty, 0 比 n 大/小 | Remember / Understand |
| 2 | 用橫式記錄 — build □○□○□ from the story | 比一比 — pair up, circle the extras (多/少/相差) | 0 的加法 — nests, birds arriving (n + 0, 0 + n) | Understand → Apply |
| 3 | 加法口算 — mental sums, bridging 10 | 減法口算 — build sentences + mental differences (1 addition review) | 0 的減法 — none taken / all taken | Apply |
| 4 | 有趣的加法 — 6 + 8 = □ + 6, which is the same, missing addends | 加和減的關係 — arc diagram fact families, + or − for this story?, missing numbers | 0 的規律 — mixed zero facts, n − n pattern, missing numbers | Analyse |
| 5 | 小老師 — judge a friend's sum and fix it; make 2 sentences from 3 cards | 小老師 — judge (incl. 3 − 5), 4 sentences from 3 cards, mixed stories | 單元挑戰 — judge zero claims, build +/− with 0, cards, mixed review | Evaluate / Create |

## Scaffolding

- **Worked example before every level** (I do): goal, picture, lines appearing one by one, the equation, read aloud. Then the level is "you do".
- **CRA inside each chapter**: concrete action (move, cross, pair) → picture with the number sentence → number sentence alone.
- **Scaffold ladder on a slip** (per question): 1st slip — buddy gives a word hint (e.g. 「先湊成 10」); 2nd slip — a help picture appears right above the answer (ten-frames, arc diagram, pairing, keyword table, zero rules); 3rd slip — the answer is shown and the child taps it to finish (errorless, no dead end).
- **💡 on demand**: the child may ask for the help picture at any time; asking costs nothing.
- **Fading**: in 加法口算 and 減法口算 the help picture is shown for the first three questions, then only on request.
- **Adaptive difficulty** (0 = within 10, 1 = bridging 10, 2 = to 18): two first-try answers in a row step up, a question needing help steps down. Levels 1–2 start at 0, later levels at 1.
- **Read-aloud**: every prompt is spoken in Cantonese (speechSynthesis, zh-HK voice when the device has one); 🔈 replays it. Large Chinese text with a small English line.

## Reinforcement

- Immediate: chime, star burst, varied praise (好棒！做得好！真聰明！…), buddy hops.
- Token economy: every answer sends a treat (the chapter's icon) flying into the basket; the map shows the total.
- Variable bonus: three first-try answers in a row → surprise gift (extra treat, fanfare).
- Stars per level from slips: 0–1 → 3★, 2–4 → 2★, 5+ → 1★. Finishing always earns at least 1★; replay keeps the best.
- Chapter sticker + 單元筆記 (unit notes, as on textbook p. 66) when all five levels are done; notes stay reachable from the map.
- No penalties, no timers, no lives: wrong answers lead to help, never to losing.

## Unlocks

- A chapter opens when the teacher ticks it. Inside a chapter, level n opens after level n − 1 is finished (any stars).
- Chapters are independent so the teacher can follow the school's own order.

## Dev

- `picnic.html?dev` (localhost / LAN) skips login, test mode, player "Dev". `&scene=add-3` jumps into a level; `&seed=7` repeats questions.
- `window.__picnic` exposes `{ state, play, startLevel, showMap, showSticker }`.
