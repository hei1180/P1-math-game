# Treasure Dungeon 尋寶地下城 — as-built notes (Task 10)

Read with the plan (`2026-10-10-treasure-dungeon.md`) and the spec (`../specs/2026-10-10-treasure-dungeon-design.md`). Where this file and the plan differ, **this file wins** (it describes the merged code on branch `treasure-dungeon`). Always read the actual source of anything you call.

## Stage and layout (`dungeon/stage.js`)

- **Fit to the clue, not the wall.** `PixelStage.fit()` fits the *focus* (art-px x range the current clue uses) to the width and the whole 108 px room height to the height: `PX = floor(DPR · min(W / focusW, availH / 108)) / DPR`, at least 1. PX is a whole number of **device** pixels (DPR from `bonds/hidpi.js`, capped at 2), so CSS PX moves in 0.5 steps on retina screens and art stays crisp. Focus is at least `FOCUS_MIN` = 120 art px; a room wider than the screen is cropped around the focus.
- `drawScene()` sets the focus from objects, places, ladders, the hero's home (+ the pet when one is equipped) and `stage.extraFocus` (RoomScene sets it for the boss dragon). Tasks widen it with `stage.addFocus(x0, x1)`: the place tray, the make / solve tray (DragBoard), the judge owl. `clearScene()` drops the focus (no refit); the end chest calls `setFocus(60, 132)`.
- **Hero home:** `stage.home` = floor just left of the scene (`edge − 9`, at least 8). When `stage.hero` is set (RoomScene), `drawScene()` stands the hero there; `hero-walk.js` uses the same spot. Rows / queues keep `HOME_GAP` = 18 art px free at their left (long rows shift right and shrink to fit 164 px), so the hero never overlaps the first thing. Rows / queues of 6+ use an 18 px step.
- `drawScene(sd, { markers: true })` draws faint place markers even at support level 1 (make / solve use it).
- `stage.destroy()` exists for scenes that rebuild a stage (Sandbox).
- Measured on a 375 × 812 phone (hero height = 16 · PX CSS px): pair / short rows / columns / queues ≤ 5 → PX 3 (48 px); shelves with a side tray, 6–7 long rows → 2.5 (40 px); 8–10 long rows and the boss shelf → 2 (32 px). 上下 waves zoom on the corridor middle (PX 3); 左右 / mixed waves and Rush keep the full corridor (PX 2). iPad landscape 1180 × 820: 6.5 (height-bound); iPad portrait 820 × 1180: 5.5–6.5.

## UI (`dungeon/ui.js`)

- Pills carry their size as `uiW` / `uiH` (a Phaser Container's own `.w` / `.h` are always 0; the old `b.w` put the ✓ / ✗ mark in the wrong corner).
- `ui.toast()` picks the free y nearest the room's upper wall, clear of every UI-layer pill / panel (`uiW × uiH`) and of anything registered in `ui.avoidList` (the judge owl's bubble registers itself). Sentence panels set `uiW / uiH` on their container.
- `ui.prompt()` keeps the word-wrap width ≥ 120 px (a 0 × 0 canvas used to throw).
- `fx.floatText()` clamps its x so 「哎呀！」 / 「做得好！」 stay on screen at the edges.

## Rooms (`dungeon/RoomScene.js`)

- Start data `{ key }` is read in `init()` and cleared from `sys.settings.data` (Phaser re-sends the last data to a start without data). Waves, Rush, MakeHero and Shop do the same; Map already did. Room / Waves with no or a bad key go to the Map.
- A stale run (old `runId`) never clears a newer run's `this.task`.
- **蝠蝠 Fu-fu** (`room.fufu`, `room.flapFufu(n)`): the code-drawn bat flipped upside down, hanging at the visible top-left of the room. RoomScene wraps `ui.prompt` / `ui.say` so it flaps when a clue is read or replayed (🔈), and flaps on hint steps 2 / 3 and on 做得好！. Hidden while the clue itself has a bat (F3 columns), so there are never two bats to mix up. It does not speak with its own bubble; the prompt bar is still the speech.
- Floor cleared in a Room (F2R5, F4R5): after the `第N層完成！` toast, the floor's free look card (穿上 / 繼續), as WavesScene already did for F1R6 / F3R6.

## Art (`dungeon/art.js`)

- Backdrop: no torches (火把 is a clue object). Plain cloth pennants (no emblem) at ax 10 and 182, tinted per floor; the door is dimmed at the far left edge (behind the hero's entry, never behind a place). Waves move the door back to the corridor middle behind the back-view hero (no places there).
- `window.__dungeonLessMotion` is a getter on `settings.lessMotion` (defined in `main.js`), so `hop()` really calms down.

## Logic (`dungeon-logic.js`)

- `T.make(fam)`: F1R5 「把寶物放好…」, F2R5 「把史萊姆排好隊…」, F3R5 「把箱子疊高…」; F3R5 make towers stack boxes only (`BOXES` = crate + 4 marked chests). Tested in `tests/dungeon-logic.test.mjs`.

## Dev

- `position.html?dev&scene=Sandbox` is the sandbox (layouts page now drawn by `PixelStage`, with tags, markers and the hero at home). `dungeon/dev/sandbox.html` was removed. `dungeon/dev/sheets.html` (frame picker) stays.
- QA scripting hooks used in Task 10: `room.task` / `room.clue` (task internals: `tryRes`, `dropRes`, `ui.choiceRes`, `task.panel.sentences`, `task.board`), `Waves.__test`, `Rush.__test`. A hidden browser pane throttles rAF: step `__dungeon.game.loop.step(performance.now())` every ~16 ms.

## QA results (Task 10, 2026-10-10)

Every room F1R1–F4R5, F1R6, F3R6 and Rush played to the end panel in `?dev` (scripted answers) on a 375 × 812 phone, the wave rooms also on iPad portrait; F2R3 / F3R5 / F4R5 again with Less motion on. Real taps / drags: map → F1R1 (one wrong answer → bonk + ✗, then right) → 下一關 → hero walks on the map → F1R2 (four go clues, 在這裡！) → F1R3 (four drags, chest 紅帽子 → 穿上, 今日做得好！) → 地圖 (stars shown). Rush to time-up → rank popup → leaderboard → Back to map. Shop, MakeHero, Sandbox opened at phone size. No console errors or warnings anywhere.

### Play time estimate per floor (6-year-old: ~25 s per clue + walks, end panels, chests ≈ 15 s per room)

| Floor | Clues | Estimate |
|---|---|---|
| 1 | 21 + waves (18 monsters ≈ 2 min) | ≈ 8.8 + 2 + 1.5 ≈ **12 min** |
| 2 | 22 | ≈ 9.2 + 1.3 ≈ **10.5 min** |
| 3 | 22 + waves | ≈ 9.2 + 2 + 1.5 ≈ **12.5 min** |
| 4 | 19 (2 solve ≈ 60 s each, 3 boss riddles ≈ 40 s each) | ≈ 9.8 + 1.3 ≈ **11 min** |

All inside the 10–12 min target (floor 3 a little over); clue counts unchanged.

## Gaps against the spec (not built, or built differently)

- **§2 F4R3 迷路走廊:** the four go clues are mixed 左右 / 前後 / 上下 scenes in a row; there are **no maze doors** that open one by one (the spec's "each right answer opens the next door"). `genRoom` marks nothing as a chain and `go.js` has no door animation.
- **§1 Fu-fu speaks every clue:** the bat flaps while the prompt bar shows / reads the clue, but has no speech bubble of its own, and the worked example (hint 3) is shown by the task, not by the bat flying there.
- **§4 "a 今日做得好！ card after a floor":** shown once per sitting after the 3rd room (any rooms), not tied to finishing a floor. The hero is not drawn on that card (spec §4b "the hero appears on the end-of-floor card").
- **§4 "one free look shown before as a silhouette":** the floor look is announced with a card when earned; it is not previewed as a silhouette beforehand (the Shop does show locked items as silhouettes).
- **§1 map medals:** shown on the floor label; no separate "floor cleared" card on the map.
- **Phone portrait:** long rows (8–10 things, level 1: F1R5 / F2R5 go, F4R1 / F4R3) stay at PX 2 (hero 32 px) — ten 16 px things cannot fit 375 px at PX 3. 左右 waves and Rush on phones also PX 2. Landscape phones are fine.
- **Voice:** the browser pane had no zh-HK voice, so voice was checked only as "silent fallback works" (no waits, no errors); a real iPad check of 🔈 and pacing is still worth doing.
- **Frame rate on a throttled CPU** (plan T10 step 2) was not measured.
- One unreproduced oddity: once, after a Rush → leaderboard → map → `__dungeon.go('Shop')` in a hidden pane, the Shop scene reported RUNNING with no camera. Repeating the same steps worked; noted in case it shows up on a device.
- Spec §7 file names differ (`dungeon/scenes/*Scene.js`, `RoomScene.js`, `hero-walk.js`; no `hidpi.js` copy — `bonds/hidpi.js` is imported).

## Shared files (merge note)

Picnic Park (main checkout, uncommitted) edits the same shared files as this branch: `index.html`, `shared.js`, `labels.js`, `teacher.html`, `teacher-data.js`, `firestore.rules`, `bump.sh`, `README.md` and their tests. The dungeon edits there are additive (new keys / rows / cards); merge by keeping both sides.

## Post-review changes (owner feedback)

- **Backdrop (`dungeon/art.js` `makeBackdrop`)**: the busy tiled brick wall, grate tiles and wall pennants were removed. It is now a calm, low-contrast stone wall (flat tile with a soft 1 px seam grid) tinted per floor, a darker ceiling band, a floor slab strip and the dimmed door. `bd.<floor>.wall` / `.slab` textures are still produced for the map. `TD_STONE` is no longer imported there.
- **Pets smaller (`art.js`)**: `PET_SCALE = 0.72`; the pet trails at ±12 art px instead of ±14.
- **Shop coin**: the item cards and the buy button now draw the game's gold `art:coin` sprite, never the 🪙 emoji (some devices draw it silver).
- **Map torches (`MapScene.drawBand`)**: the two torches per floor flicker (angle + scaleX wobble; still under Less motion).
- **Bat (`art-frames.js` `PIX.bat`)**: redrawn as a friendlier, lighter bat (rounded head, one big eye, a smile, no fang). Used by both the wave enemies and 蝠蝠 Fu-fu.
- **Boy / girl + outfits + weapons + cosmetics**: `hero.sex` (`SEXES = ['boy','girl']`) is the 性別 row of 製作英雄; a girl uses the pack's female base body (`RC.bodyFemale`, frame 1) and defaults to long hair, a boy the plain base. **No bow.** Outfit *shapes* come from the sheet (`RC.outfits` = cropped / tunic / dress / armour, all recoloured by the existing tunic colour), and held **weapons** (`RC.weapons` = staff / sword / axe / hammer, drawn in the right hand with a per-weapon grip in the frame). `OUTFITS` / `WEAPONS` in `dungeon-logic.js` carry ids + prices; the shop's 裝扮 tab sells cosmetics, paid outfits and paid weapons, and `buy`/`equip` handle the `outfit` / `weapon` slots (free ones need no purchase). Tested in `tests/dungeon-logic.test.mjs`.
- **Class gallery**: new page-scene `dungeon/scenes/GalleryScene.js` and Firestore `dungeonGallery/{uid}` (rules mirror `robotGallery`; see `validDungeonGallery`). `dungeon-progress.js` gains `loadGallery` / `saveGalleryEntry` / `setGalleryHidden`; `validateGalleryEntry` lives in `dungeon-logic.js`. The bridge publishes the hero on every `saveLook` and exposes `bridge.gallery`. Reached from the map's new 展覽廳 button; teacher-only hide/show. Teacher toggle `settings.dungeonGallery` (shared.js; on by default). **The teacher must re-publish `firestore.rules`** to allow `dungeonGallery`.
- **Shop UI/UX overhaul (T3–T5 of `2026-10-12-shop-uiux.md`)**: `dungeon/art.js` gains `heroPreview()` — a hero scaled by a whole number into a fixed preview box with a soft shadow, used by every shop card. `ShopScene` is rebuilt around **sections** (膚色 / 髮色 / 服裝 / 衣服顏色 / 武器 for 裝扮; single-section for 頭盔 / 寵物) with bilingual section headers and a category jump-bar, and every card now shows a hero **wearing / holding the item** (colour dots are gone; chest / boss pieces stay a silhouette). A **我的英雄 / 示範英雄** toggle under the mirror switches all previews between the child's own hero and a plain example hero (registry `dungeon.shopBase`). Tabs are now 裝扮 · 頭盔 · 寵物 · 換造型 (default 裝扮). Free outfits / weapons show 免費 and can be worn with 穿上. Chinese polish: 穿着 → 穿著, 外衣 → 上衣, 改造型 → 換造型, 陽光衫 → 金黃衫.
