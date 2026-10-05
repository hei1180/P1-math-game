# Robot Workshop 形狀機械人工場 — Design Spec

Date: 2026-10-03 · Status: built (branch `robot-workshop`, awaiting owner approval to merge)

## Goal

A 3-D toy-factory game for P1 that teaches **1S1 立體圖形（一）** and **1S2 平面圖形** (see `docs/curriculum/p1-maths.md`). Children test, sort and build robot parts: solids become wheels, bodies and heads; flat shapes become panels and windows. Building a robot and test-driving it is the fun; knowing how shapes behave is how you win.

"Addictive in a good way": short courses, funny failures that invite a retry, a robot the child owns and shows the class, surprise unlocks. No streak pressure, no random prize boxes, no endless play.

## Platform fit

- New page `shapes.html`, the **4th card** in the hub (`index.html`): "🤖 Robot Workshop 形狀機械人工場 · 立體圖形・平面圖形".
- Reuses `shared.js`: Google login, `settings`, teacher modal (PIN), test mode, `saveScore`, leaderboard renderer, rank popup, trophies, `logAttempt`, `sharedSound`, account box / sign out.
- Leaderboard opens as the **pop-up over the blurred game**, same as Rod Town.
- Bilingual, Chinese first, as on the other pages.
- Own visual theme (bright workshop, plastic toys); not the Rod Town look.

## Curriculum scope and limits

| In | Out (later years, never shown) |
|---|---|
| 角柱 prism, 圓柱 cylinder, 角錐 pyramid, 圓錐 cone, 球 sphere, recognised by touching, stacking, rolling and looking | names of different prisms or pyramids (2S1); making solids or nets (5S2); oblique (tilted) solids |
| linking solids to everyday objects and to their pictures | faces, edges and vertices counts (later) |
| 點, 直線, 曲線; one straight line through two points, many curves | line segments (2S4); angles (2S2) |
| 三角形, 四邊形, 五邊形, 六邊形, 圓形, identified **by counting sides**; irregular and dented shapes included; a turned shape is the same shape | the words 凹 / 凸; square/rectangle properties (2S4) |
| making 2-D shapes and composing pictures from them | symmetry, area |

Design rules that follow:
- **Colour never tells the shape.** Tile and solid colours are drawn at random from a palette, independent of type, so children count sides instead of matching colours.
- Solids appear upright, lying on a face, or (cylinder and cone only) lying on their curved side. Never oblique.
- Every prism (cube, cuboid, triangular, hexagonal) is just 角柱; every pyramid (square, triangular) is just 角錐.
- P1 vocabulary only: 立體圖形、角柱、角錐、圓柱、圓錐、球、點、直線、曲線、平面圖形、三角形、四邊形、五邊形、六邊形、圓形.

## §1 World and courses

### Workshop map 工場

One 3-D workshop floor with stations. The child's own robot walks to the station they pick (and walks on after **Next**), like the Rod Town train. Cleared stations show their medal (🥇 3★ 🥈 2★ 🥉 1★).

- **Zone A 立體車房 Solid Garage** (1S1): courses A1–A4, then **Rush 3-D**.
- **Zone B 平面工作枱 Panel Bench** (1S2): courses B1–B4, then **Rush 2-D**.
- **Boss 測試跑道 Test Track**: opens when both zones are cleared; mixes both topics.
- **Gallery 展覽廳** and **Free Build 自由創作** from the map.

### Shape friends

Each solid family has a face and a personality (shown in its animations, never as its colour):
- 球 **Bobo** can't sit still, rolls off in any direction
- 圓柱 **Rolly** rolls straight when lying down, stands tall when upright
- 圓錐 **Dizzy** rolls in a circle and gets dizzy
- 角柱 **Blocky** the dependable stacker
- 角錐 **Peak** proud of its pointy top

### Course format

A course is **5 items, about 1–2 minutes**. Mistakes don't end a course. Stars: 3★ no mistakes, 2★ 1–2 mistakes, 1★ finished. After 2 wrong tries on the same item, a hint plays: the property is demonstrated (e.g. Bobo rolls down the ramp) and the item continues.

Prompts are short, shown with icons, and **read aloud** (speechSynthesis, `zh-HK` voice, 🔈 button to replay; silent fallback if no voice).

### Zone A — 立體車房 (1S1)

| Course | Play | Item | Correct when |
|---|---|---|---|
| **A1 會滾嗎？ Roll or not** | A solid sits at the top of a ramp. Child taps 會滾 / 不會滾, then watches. | 5 solids/orientations, at least 2 of each answer | answer = logic table: sphere rolls; cylinder and cone roll on their curved side, not on a flat face; prism and pyramid don't |
| **A2 疊高塔 Stack** | Build a tower to the target height from a tray of 3 solids; a bad pick topples (funny). | 5 placements over 2 towers; solids placed upright | piece can go on top only if the tower's top is flat; sphere, cone and pyramid can only be the last piece |
| **A3 摸摸袋 Mystery bag** | A shape hides in a bag; clues appear one by one (icon + voice): "我會滾", "我有尖頂", "我全部面都是平的", "我有圓形的面". Child picks one of 5 friends. | 5 bags | right family. Using fewer clues adds a sparkle (cosmetic only, not stars) |
| **A4 生活中的立體 Everyday solids** | A 3-D everyday object appears; child can spin it with a finger, then drops it into one of 5 family bins. | 5 objects from a pool of 12 | right family |

Everyday object pool (built from primitives, no photos): drink can, drum, ball, globe, party hat, traffic cone, dice, tissue box, tent, pencil box, pyramid paperweight, pyramid tea bag.

### Zone B — 平面工作枱 (1S2)

| Course | Play | Item | Correct when |
|---|---|---|---|
| **B1 直線曲線 Straight or curved** | Sort wires into 直線 / 曲線 bins; then a dot task: tap two points to shoot a straight laser, and answer "有幾多條直線可以連接這兩點？" (1 條 / 很多條), followed by a demo of many curves through the same points. | 3 sorts + 2 dot tasks | sort right; 1 條 |
| **B2 吃板機 Panel Muncher** | A machine has slots 3 / 4 / 5 / 6 sides / 圓形. Feed each tile to the right slot. | 5 tiles: regular, irregular, dented, turned | slot = number of sides (circle = 圓形) |
| **B3 釘板 Pegboard** | Tap pegs to stretch a rubber band. Target: "砌一個五邊形" or open "任何四邊形". | 4 targets | shape closes, doesn't cross itself, and has the target number of sides (straight runs through extra pegs count as one side) |
| **B4 拼砌 Silhouette** | Fill an outline (house, robot face, rocket, boat) with tiles: drag, tap ⟳ to turn 90°, tiles snap to a grid of quarter-triangles. | 2 puzzles, 3–5 tiles each | every cell covered, no overlap. A wrong drop (doesn't fit) is a mistake |

### Boss — 測試跑道 Test Track (mixed)

A job card (icons + voice) asks for a robot, e.g. "2 個會滾的輪 + 可以疊的身體 + 一塊五邊形窗". The child picks wheels, body and head from solids, and clips flat panels into holes (holes accept only the matching number of sides). Then the robot drives the course.

- 3 job cards; a failed drive is a mistake, then the child fixes the robot.
- Scripted, funny failures by part: cube wheels clunk and the robot flips over; sphere wheels drift sideways off the track; cone wheels drive in circles; a head on a pyramid tip slides off. The robot shakes it off and waves 「再試一次！」. Never shaming.
- Success: the robot crosses the finish, dances, confetti, and the boss trophy.

### Rush (timed, leaderboard)

60 s (teacher setting). Items ride a conveyor; tap/drag them into bins. Shared combo/fever engine and trophy cutoffs.
- **Rush 3-D** (`shapes3d`): solids and everyday objects → 5 family bins. Opens when all of Zone A is cleared.
- **Rush 2-D** (`shapes2d`): tiles → 3 / 4 / 5 / 6 / 圓形 bins. Opens when all of Zone B is cleared.

### Free Build and Gallery

- **My Robot:** each first clear of a course gives a new part (wheel style, head, arms, antenna, paint). 8 courses = 8 parts; the boss adds a gold badge. The child equips parts freely on the map.
- **Robot name:** picked from a preset bilingual list (波波 Bobo, 叮叮 Ding-ding, 閃閃 Shiny…) plus a number. **No free text anywhere**, so nothing needs moderating.
- **Free Build:** pegboard and silhouette canvas without targets. The child can save up to 6 creations.
- **Gallery 展覽廳:** the whole class's robots and saved creations, with the player name (as on the leaderboard). Teacher can hide any entry and can switch the gallery off. No likes or rankings in the gallery.
- "Whole class" means every signed-in player, which is the same audience that already sees the leaderboard names.

### Healthy-play rules

- No daily streak and nothing is lost by not playing.
- Fixed rewards only (no random boxes); next reward is a surprise but always earned the same way.
- After 3 courses in one sitting, a 「今日做得好！」 card with the robot dancing; **Continue** is still there.

## §2 Progression, teacher, data

### Unlocks

- Teacher ticks **Zone A** and **Zone B** separately (all off by default). Zones can be taught in either order.
- Inside a zone, courses open in order; the next needs ≥1★ on the previous.
- Zone Rush opens when all 4 of its courses have ≥1★.
- Boss opens when both zones are fully cleared and both are ticked.
- Gallery and Free Build are always open once any zone is ticked.
- Test mode opens everything and saves nothing (existing behaviour).

### Teacher panel additions (shared modal)

New **Robot Workshop** row: Zone A ☐, Zone B ☐, Rush time (s) default 60, Gallery on ☐ (default on). Stored in `settings/global` as `shapesUnlock {a, b}`, `shapesTimeLimit`, `shapesGallery`. Less motion applies as today.

### Data

- `shapesProgress/{uid}`: `{ name, email, stars: {A1..A4, B1..B4, boss}, parts: [...], robot: {name, wheels, head, arms, antenna, paint}, updatedAt }` + localStorage copy (same pattern as `bonds-progress.js`).
- `robotGallery/{uid}`: `{ playerName, robot, creations: [≤6 {kind:'peg'|'tiles', data}], hidden:false, updatedAt }`.
- `scores/{uid}_shapes3d`, `scores/{uid}_shapes2d` via `saveScore`.
- `logAttempt` on every course, boss and Rush end: game `shapes`, mode `shapesA1`…`shapesB4`, `shapesBoss`, `shapes3d`, `shapes2d`; stars, mistakes, duration, and up to 5 `confusions` like `{item:'cone', picked:'pyramid'}` so the dashboard can show common mix-ups. `labels.js` gets the new labels.

### Firestore rules (added to `firestore.rules`, teacher email stays a placeholder)

- `shapesProgress/{uid}`: read/write own; teacher read.
- `robotGallery/{uid}`: read by signed-in users when `hidden == false`, teacher reads all; create/update own only, with schema validation (allowed keys, `creations.size() <= 6`, `playerName` a string ≤ 100 chars, the owner cannot change `hidden`); teacher may update `hidden` only.

## §3 Architecture

### Approaches considered

1. **three.js for everything** (chosen). One renderer, one look; flat shapes are thin plastic tiles in the same 3-D world, so a pentagon window clips straight onto a 3-D robot. Physics from cannon-es.
2. Phaser for Zone B + three.js for Zone A. Two engines, two styles, ~2× download, and the robot can't mix both cleanly.
3. Phaser only with pre-drawn rolling sprites. Lightest, but solids can't be spun or rolled by the child, which is the point of 1S1.

### Libraries

- `three` (pinned, ES module) and `cannon-es` (pinned) from **jsDelivr** via an import map. ~200 KB gzipped together. cannon-es loads only when a physics scene starts.
- Correctness never depends on the simulation: **answers are graded by the logic table**; physics is the show. A1 rolling and the boss drive are scripted animations (always look right); physics is used for A2 stacking and toppling.

### Files

```
shapes.html                 DOM shell: login, HUD, #stage, corner buttons, rank popup, leaderboard pop-up
shapes-logic.js             pure, unit tested: shape catalogue + properties, item generators per course,
                            grading, pegboard side counter, silhouette coverage, stars, unlocks, gallery validator
shapes-progress.js          load/save shapesProgress + gallery entry (Firestore + localStorage)
shapes/main.js              bridge to shared.js (player, settings, testMode, complete(), rush*, leaderboard), boot, ?dev
shapes/engine/renderer.js   WebGLRenderer, DPR cap 2, resize, render-on-demand, pause when hidden
shapes/engine/input.js      raycast pick, drag on a plane, spin, tap; ≥48 px targets
shapes/engine/tween.js      small tween/timeline helper; honours lessMotion
shapes/engine/scenes.js     scene manager: enter/exit, dispose geometry/materials on exit
shapes/engine/physics.js    cannon-es wrapper, fixed step, sleep
shapes/engine/voice.js      zh-HK speech with silent fallback
shapes/models/              procedural solids, tiles, everyday objects, robot parts, faces (canvas textures)
shapes/scenes/              Workshop, A1–A4, B1–B4, Boss, Rush, FreeBuild, Gallery
shapes/ui/                  DOM overlays: prompt bar, answer buttons, end panel, job card
```

- Sound: reuse `bonds/sfx.js` and `sharedSound`; add a few new sounds (clunk, boing, spring).
- `window.__robot = { go(scene, data), bridge }` and `shapes.html?dev` (localhost only: test mode, skip login), same as Rod Town.
- `bump.sh` stamps `shapes.html shapes-logic.js shapes-progress.js shapes/**/*.js`.

### Devices and failure handling

- Target: smooth on school iPads (iPad 9th gen) and Chromebooks. Low-poly meshes, fake blob shadows (no shadow maps), under ~150 draw calls, render only while something moves.
- No WebGL: friendly message 「這部機未能顯示立體圖形」 and a back-to-hub button.
- Offline / Firestore errors: progress kept in localStorage and synced next time (as Rod Town); gallery shows 「暫時未能載入」.
- Voice missing: text and icons still carry every prompt.

## §4 Animation and polish

- Shape friends blink, look at the finger, squash on landing.
- Rolling solids leave dust puffs; toppling towers bounce pieces with cartoon sounds.
- Correct answer: part flies to the robot, ding, small confetti. Course end: robot tries on the new part.
- Failures are slapstick, short (< 2 s) and always followed by the robot waving to try again.
- Map: robot walks between stations; stations light up when opened; medals pop.
- Less motion: no camera shake or confetti, shorter tweens, no idle wobble.

## Testing

- `npm test` (node --test) for `shapes-logic.js`: property table for every solid/orientation; generators stay within P1 limits (no oblique solids, sides 3–6 or circle, answer mix per course); pegboard side counter (collinear pegs, self-crossing, degenerate); silhouette coverage; stars; unlocks; gallery validator; `labels.js` entries.
- Browser checks with `?dev`: each course end to end, boss failures, both Rushes, leaderboard pop-up, test mode, Less motion, no-WebGL message (forced), phone and iPad sizes.
- Rules: deny/allow cases for `robotGallery` and `shapesProgress` checked in the Firebase rules playground before publishing.

## Delivery

Branch `robot-workshop` in a worktree; built in this order, each step playable:
1. Engine + Workshop map + **A1** vertical slice (proves three.js, physics, input, iPad performance).
2. A2–A4 and Rush 3-D.
3. B1–B4 and Rush 2-D.
4. Boss, My Robot parts, Free Build, Gallery.
5. Teacher row, data, rules, dashboard labels, hub card.

Publish with both zones locked by default; the owner approves before merge to `main`.

## Non-goals (v1)

Free-text names or messages; likes or rankings in the gallery; class grouping beyond "all signed-in players"; nets or making solids; faces/edges/vertices counting; angles, symmetry, area; daily streaks; any purchase or currency.
