# Rod Town 數棒鎮 — Design Spec

Date: 2026-09-25
Status: sections 1-4 approved by teacher (owner) in chat; pending spec review
Topic: 分解和合成 (number bonds) of 2-18, Primary 1

## Goal

A third game on the P1 platform that makes number bonds visible and memorable by linking four representations every child meets in the textbook: Cuisenaire rods, two-colour ten-frames, the bond (whole–part) diagram, and the equation. Short, star-rated levels on an adventure map build mastery; a timed Rush per world feeds the class leaderboard.

Pedagogy basis:
- Cuisenaire rods: lengths 1-10 in fixed colours; every bond of N is a two-rod "train" as long as N. Hiding the numbers later turns colour↔length↔number into memory.
- Ten-frames: 5 and 10 benchmarks, subitising, and the make-ten strategy (9 + 5 → 10 + 4).
- Textbook (unit 5, 11 至 18 的分解和合成): bond diagrams, two-colour ten-frames, missing-part equations, number houses.

## Platform fit

- New page `bonds.html` in the `hei1180/P1-math-game` repo; hub picker gets a third card 🚂 Rod Town 數棒鎮 (合成與分解).
- Reuses `shared.js`: Google login (spinner until session restored), teacher PIN panel and test mode, trophies, combo/fever/timer engine, `saveScore`, leaderboard, rank popup.
- Phaser 3.90 (pinned) loaded from jsDelivr on `bonds.html` only. No build step. Asset URLs carry the `?v=` stamp (`./bump.sh`).

## §1 World, linked views, modes

### Cuisenaire rods

| Length | Colour | Hex |
|---|---|---|
| 1 | white 白 | #f8fafc |
| 2 | red 紅 | #ef4444 |
| 3 | light green 淺綠 | #84cc16 |
| 4 | purple 紫 | #a855f7 |
| 5 | yellow 黃 | #facc15 |
| 6 | dark green 深綠 | #15803d |
| 7 | black 黑 | #1f2937 |
| 8 | brown 啡 | #92400e |
| 9 | blue 藍 | #2563eb |
| 10 | orange 橙 | #f97316 |

Each rod is a row of N joined coloured **squares** (one square per unit) in its Cuisenaire colour. Rods never show a number: children learn the colour↔length↔number link from the squares, the ten-frames, the diagram and the equation. (Owner decision 2026-09-25; supersedes the earlier labels-in-levels-1-3 rule. Ruler and equation numbers are unaffected.)

The end square carries a face, and every length is a different character (style and gender), so each rod is recognisable as "someone":

| Len | Colour | Character |
|---|---|---|
| 1 | white | baby 👶: round rosy cheeks, one curl of hair |
| 2 | red | girl with two pigtails and a bow |
| 3 | light green | boy in a baseball cap |
| 4 | purple | girl with long lashes and a hair clip |
| 5 | yellow | boy with round glasses |
| 6 | dark green | girl with a flower headband |
| 7 | black | boy with spiky hair |
| 8 | brown | grandma with a bun and glasses |
| 9 | blue | boy with a bow tie |
| 10 | orange | girl with a crown (the "ten queen") |

### The linked board (every question)

1. **Rod track** — a single row of N units (rods cannot bend across rows), with ticks and a heavier mark every 5 and at 10. The two ten-frames below carry the 2-row structure.
2. **Ten-frames** — two 2×5 frames; each unit of a placed rod lights one cell in that rod's colour, in placement order, filling frame 1 then frame 2.
3. **Bond diagram** — whole circle N on top, two part circles; parts fill as rods land.
4. **Equation** — `a + □ = N` for Build, `N − a = □` for Break; the box fills when answered.

Input: tap a rod in the tray → it flies to its place. Drag also works. Tap a placed (not given) rod → it returns to the tray.

Text is bilingual: large Traditional Chinese, small English under it.

### Mode: 合成 Build (火車站 Train station)

- Question: whole N, given part a already parked on the track; empty gap of N − a outlined.
- Tray: 5 rods, sorted by length, containing b = N − a plus unique distractors from {b−2, b−1, b+1, b+2} within 1-10, topped up randomly from 1-10.
- Correct: tapping rod b. Wrong rod: bounces back, counts one mistake, question stays.
- Hint 💡 (shown only when N ≥ 11 and neither part is 10): plays the make-ten move once (see §4): 10 − max(a, b) units move from the smaller part to the larger, which becomes an orange 10. Hint does not cost stars.

### Mode: 分解 Break (切棒店 Rod cutter)

- Question: a grey "log" of N units (unit ticks; ruler numbers shown in levels 1-3 only) and the instruction 切出 a / Cut off a.
- Step 1: tap the cut point after a units. Wrong cut point: log wobbles, one mistake, retry.
- After the cut the two pieces turn into rods a and N − a (for pieces > 10 this cannot happen because a and N − a are both 1-10 by generation).
- Step 2: equation `N − a = □`; answer with the rod tray (as Build). Wrong rod: one mistake.
- Break counts as one question for level progress and Rush scoring.

### Mode: 數字屋 Number House (boss) — owner redesign 2026-09-25

- **Question rod** on top, under the roof badge N: a rod of length N (N ≥ 11: an orange 10-rod joined to the (N − 10)-rod, drawn as one train).
- **Shuffled rod pile** in a "rod box" below/beside the house: for every floor (a | N − a) of `splitsOf(N)`, one rod a and one rod N − a (so each length appears as often as it is needed), laid out in random order and random positions within the box (horizontal rods, no overlap, ≥ 44 px touch rows). No floor is pre-filled.
- **Find a floor:** tap (or drag) a first rod → it moves to a "workbench" slot under the question rod's left end; tap a second rod → it lines up after the first.
  - Sum = N and this ordered pair not yet found → the two rods **merge** (glow, squash, click) into one two-colour train, and the train slides up to line up exactly under the question rod as a new floor (same left edge, same length — visible proof a + b = N). The floor's numerals `a | b` appear beside it.
  - Sum ≠ N, or the ordered pair is already found → both rods bounce back to the pile, 😵, one mistake.
  - Tapping the rod on the workbench returns it to the pile (no mistake).
- Order matters, as in the textbook house: `2 | 9` and `9 | 2` are different floors. Floors appear in the order found; when the house is complete, floors re-sort by a (top → bottom ascending) with a slide animation so the ladder pattern shows, then the pattern arrows and the completion sequence (lights, door, character, fireworks) play.
- Twin floor (a = N − a) glows gold. Boss N choice unchanged (≥ 4 floors).
- Stars from mistakes as elsewhere.

## §2 Progression, Rush, teacher, data

### Worlds

| World | Key | Numbers | Theme |
|---|---|---|---|
| 1 | w1 | 2-5 | 草地 Meadow |
| 2 | w2 | 6-10 | 海邊 Beach |
| 3 | w3 | 11-13 | 森林 Forest |
| 4 | w4 | 14-18 | 雪山 Snow peak |

Each world: levels 1-6 then the boss.

### Level plan (5 questions)

| Level | Questions | Rod labels |
|---|---|---|
| 1 | 5 Build | shown |
| 2 | 5 Break | shown |
| 3 | 3 Build + 2 Break, shuffled | shown |
| 4 | 5 Build | hidden |
| 5 | 5 Break | hidden |
| 6 | 3 Build + 2 Break, shuffled | hidden |

Question generation: N uniform in the world range, no immediate repeat of the same (N, a); part a uniform over valid values so both a and N − a are 1-10.

### Stars and unlocks

- Stars per level/boss: 0 mistakes → 3★, 1-2 → 2★, 3+ → 1★. Best is kept.
- Level k+1 unlocks when level k is completed (any stars). The boss unlocks after level 6.
- World 1 opens when the teacher toggle `bondsUnlock.w1` is on. World w+1 opens when boss w is beaten **and** `bondsUnlock.w{w+1}` is on.
- Rush for world w opens when boss w is beaten.
- Teacher test mode: every world, level, boss and Rush open; nothing is saved (no progress, no scores).

### Engagement

- Levels are about one minute. No lives, no penalties beyond stars.
- Sticker book: beating a boss earns that world's rod buddy sticker (w1 yellow 5, w2 orange 10, w3 blue 9, w4 brown 8). Viewable from the map.
- Daily streak: a flame with a count on the map; +1 for each calendar day (device local date) on which at least one level or boss is completed; resets if a day is skipped.

### Rush

- Keys `bonds1`-`bonds4`, one per world; mixed Build and Break from the world range; labels shown.
- Points: Build 10, Break 15. Uses `shared.js` `registerHit` (combo, fever at 5 × 2 with 10 s refresh), `startTimer`, `saveScore`, `showRankPopup`, `renderLeaderboard` unchanged via a DOM HUD.
- A wrong rod or wrong cut is one `registerHit(false)`; the question stays.
- Timer: `settings.bondsTimeLimit` (default 60 s).
- Trophies and leaderboard as the other games (cutoffs from settings).

### Teacher panel additions (shared modal)

- Rod Town world toggles W1-W4 (`settings.bondsUnlock.{w1..w4}`, default false).
- Rod Town Rush time (s) (`settings.bondsTimeLimit`, default 60).
- Less motion (`settings.lessMotion`, default false): disables screen shake, camera zoom and confetti on all devices.

### Data

- `bondsProgress/{uid}`: `{ levels: { "w1-1": stars, …, "w1-boss": stars }, stickers: ["w1", …], streak: { count, lastDay: "YYYY-MM-DD" }, updatedAt }`.
- Written after each completed level/boss. Also mirrored to `localStorage["bondsProgress:<uid>"]`; on load, the two are merged keeping the best stars per level, the union of stickers, and the newer streak.
- Rush: `scores/{uid}_bonds{w}` (existing shape).
- `settings/global` gains `bondsUnlock`, `bondsTimeLimit`, `lessMotion`; missing fields use defaults.

## §3 Architecture

| File | Responsibility |
|---|---|
| `bonds.html` | Page shell: login spinner/button, DOM HUD (`#timerDisplay #scoreDisplay #comboDisplay` inside `#gameScreen` with `#feverOverlayText`), `#adminBtn`, test badge, rank popup, leaderboard (tabs `tab-bonds1..4`), `#phaser` container, mute button |
| `bonds-logic.js` | Pure: `RODS`, `WORLDS`, `genBuild`, `genBreak`, `trayFor`, `splitsOf`, `houseFor`, `levelPlan`, `starsFor`, `isLevelOpen`, `isWorldOpen`, `mergeProgress`, `bumpStreak` |
| `bonds-progress.js` | `loadProgress(uid)`, `saveProgress(uid, progress)` — Firestore + localStorage, uses `mergeProgress` |
| `bonds/main.js` | Phaser game config (Scale.RESIZE, parent `#phaser`), scene registry, bridge object to `shared.js` and progress, `window.__rodTown` test hook |
| `bonds/scenes/BootScene.js` | Generates textures in code (rods 1-10, faces, frame cells, train, log, house, backgrounds, particles) |
| `bonds/scenes/MapScene.js` | World map, level nodes, stars, locks, streak, sticker book, Rush buttons |
| `bonds/scenes/LevelScene.js` | Runs a level plan: Build and Break questions on the Board; stars; end screen |
| `bonds/scenes/HouseScene.js` | Number House boss |
| `bonds/scenes/RushScene.js` | Rush loop using the shared engine via the bridge |
| `bonds/ui/Rod.js` | Rod buddy container: body, grooves, face, label, idle/blink, pick/snap/bounce tweens |
| `bonds/ui/Board.js` | Linked views: track, ten-frames, bond diagram, equation; `place(rod)`, `reset(question)` |
| `bonds/ui/Tray.js` | Rod tray layout and tap/drag input |
| `bonds/fx.js` | Shared effects: bursts, confetti, shake, iris transition, respecting `lessMotion` / `prefers-reduced-motion` |
| `bonds/sfx.js` | Web Audio synth sounds (boing by length, snap, tick, toot, saw, star thud, fanfare), global mute |
| `shared.js` | Settings defaults and teacher modal additions (§2) |
| `index.html` | Third picker card |

Layout: `Scale.RESIZE`. Tall layout (width < height): board top, tray bottom. Wide layout: board left ~65 %, tray right. Must fit 360×640 and 1024×768 without scrolling.

## §4 Animation and polish

Rod buddies:
- Idle breathing (scale 1 → 1.03, 1.6 s yoyo); random blinks every 2-5 s; pupils follow the pointer.
- Pick: lift (y −12), stretch (scaleX 1.08), shadow, wiggle; "boing" pitched by length (shorter = higher).
- Snap: squash (scaleY 0.8 → 1), dust puff, click; ten-frame cells pop in one by one with rising ticks.
- Wrong: bounce back along an arc, sad face for 0.6 s, gap outline flashes red once; soft "bonk", no buzzer.

Merge sequence (every correct answer: Build, Break step 2, Rush; owner decision 2026-09-25):
1. The answer rod snaps into the gap.
2. Squares drop into the ten-frames one by one with a counting tick, part a first then part b, each in its rod colour (n ≤ 10: both in frame 1; n ≥ 11: a in frame 1, b in frame 2).
3. Merge:
   - n ≥ 11 and neither part is 10: the smaller part's **last** k = 10 − max(a, b) squares fly into the larger part's frame; that frame fills, flashes and turns orange (a ten). On the track the same k squares hop onto the larger rod, which becomes an orange 10-rod, and the rest of the smaller rod becomes the rod of length n − 10. Equation morphs `a + b` → `10 + (n − 10)` → `= n`.
   - n ≥ 11 and one part is 10: the 10 frame flashes; equation `10 + (n − 10) = n`.
   - n ≤ 10: the two rods fuse into the single rod of length n (Cuisenaire: 3 + 4 is as long as black 7); the frame cells recolour to rod n's colour. Equation `a + b = n`.
4. Celebrate (burst, characters cheer, train rolls out / halves hop).
Levels play the full sequence (~2 s, input locked only until step 2 starts); Rush plays a fast version (~0.8 s).

Answer moments:
- Build correct: glow sweep along both rods, star burst, bond lines draw on, train toots, steam puffs, rolls out; next train rolls in (overlapping, ≤ 0.6 s input block).
- Break: saw swipe with sparks on the cut; halves hop onto their diagram circles; step-2 correct as Build.
- Make-ten hint: the needed units (10 − larger part) lift from the smaller part one by one, arc into the larger part's frame, which becomes an orange 10 with a flash; the equation morphs to `10 + (N − 10)`, then everything eases back to the question.
- House: floor windows light when filled; on completion lights run bottom → top, door opens, the rod buddy of N waves.

Flow:
- Map: parallax clouds, animated water, bobbing nodes, the player's train chugs to the next node after a win; locked worlds under fog that clears with a whoosh when unlocked.
- Level end: stars drop one by one with thuds, shake on the third, confetti; first-time 3★ adds a gold shine sweep.
- Boss win: fireworks; sticker flips into the sticker book with a page sound.
- Transitions: circular iris wipe between scenes.

Rush juice (on top of shared fever): combo number grows and shakes; background lights speed up at combo 3/4/5; fever gives rainbow track, rod sunglasses 😎, ×2 floaters, camera zoom +3 %; last 5 s: timer pulse, ticking, closing vignette.

Rules:
- Every tap gets sound + movement feedback within 100 ms.
- No animation blocks input for more than 0.6 s.
- ≤ 60 live particles; 60 fps target on older iPads.
- `lessMotion` or `prefers-reduced-motion`: no shake, no zoom, no confetti; tweens shortened.
- Modest default volume; on-screen mute 🔇 remembered per device.

## Testing

- `node --test`: generators always produce valid rods (1-10) and N in range; tray contains the answer, 5 unique rods, sorted; Break cut point = a; `splitsOf(n)` equals all pairs with parts 1-9 for 2-18; boss N choice has ≥ 4 floors; level plans match the table; star thresholds; unlock rules incl. teacher toggles and test mode; `mergeProgress` keeps best stars, union of stickers, newer streak; `bumpStreak` same day / next day / gap.
- Browser (via `window.__rodTown` hook): each scene reachable; Build/Break right and wrong paths; stars awarded; next level and world unlock; boss completes; Rush scores and, in test mode, saves nothing; no console errors at 360×640 and 1024×768; fps sampled during confetti.
- Owner play-test on iPad and phone before merge.

## Delivery

Feature branch `rod-town`, small commits, pushed to GitHub; merged to `main` (live) only after the owner's play-test.
