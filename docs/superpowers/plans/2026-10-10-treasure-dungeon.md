# Treasure Dungeon 尋寶地下城 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Treasure Dungeon, a 2-D side-view pixel-art dungeon game for P1 relative position (1S3 上下左右前後之間), as the fifth game of the P1 platform.

**Architecture:** Static site, no build step. `position.html` hosts a DOM shell (login, Rush HUD, rank popup, leaderboard pop-up, corner buttons) reusing `shared.js`, plus one Phaser 3.90 canvas. Every rule, clue, answer set, scaffold level, star, coin and unlock lives in `dungeon-logic.js` (pure, Node-tested). Phaser code lives under `dungeon/`: a pixel "stage" (192×108 art-pixel room scaled by a whole number), art built from two Kenney CC0 sheets plus code-drawn sprites, one `RoomScene` that runs a room's clues through small **task** modules (one per clue kind), a `WavesScene` for monster waves (wave rooms and Rush), and Map / Shop / MakeHero scenes. A `bridge` object in `dungeon/main.js` is the only link between scenes and `shared.js` / Firestore.

**Tech Stack:** Phaser 3.90.0 (jsDelivr global, as Rod Town), vanilla ES modules, Tailwind CDN (DOM shell only), Firebase v12 (existing `shared.js`), Node `node --test`, speechSynthesis `zh-HK`.

**Spec:** `docs/superpowers/specs/2026-10-10-treasure-dungeon-design.md` (read it; this plan implements it). Curriculum limits: `docs/curriculum/p1-maths.md` §1S3.

**Repo:** `/Users/user/Documents/P1-math-game`, branch `treasure-dungeon`, worktree `.worktrees/dungeon` (gitignored). Never push to `main`; the owner approves the merge. **Another game (Picnic Park 野餐樂園) is uncommitted in the main checkout** and edits the same shared files (`index.html`, `shared.js`, `labels.js`, `teacher*.{html,js}`, `firestore.rules`, `bump.sh`). Never touch the main checkout. Keep shared-file edits small and additive so the later merge is easy.

---

## Parallel waves

| Wave | Tasks (parallel within a wave) | Needs |
|---|---|---|
| 0 | T1 `dungeon-logic.js` + tests | — |
| 1 | T2 platform (shared/labels/hub/rules/bump/teacher tab/README) · T3 art (Kenney sheets, frames, hero composer, code sprites, sandbox) · T4 shell (page, bridge, progress, stage, UI kit, sfx, voice, fx, Boot, RoomScene core, scene + task stubs) | T1 |
| 2 | T5 hero walking + `go` + `place` tasks · T6 `choose` + `judge` + `select` + `pick` tasks · T7 `make` + `solve` tasks · T8 WavesScene + Rush · T9 Map + MakeHero + Shop | T3, T4 |
| 3 | T10 integration QA, polish, docs, stamps, push branch | all |

Each wave-1+ task works in its own git worktree off `treasure-dungeon` (`.worktrees/td-t<N>`, gitignored) and touches **only its listed files**, so a wave merges without conflicts. Merge order inside a wave does not matter. After each wave: merge all task branches into `treasure-dungeon`, run `npm test`, smoke-test `position.html?dev`, then start the next wave from the merged head.

## Conventions every task must follow

- **Cache-bust stamp:** every relative import and asset URL in `position.html` and `dungeon/**.js` carries `?v=0` (e.g. `import { ui } from './ui.js?v=0';`). `bump.sh` (T2) rewrites stamps. Node tests import `../dungeon-logic.js` with no stamp; `dungeon-logic.js` imports nothing.
- **Phaser** is the global `Phaser` from the `<script>` tag (no import).
- **Grading:** every right/wrong decision calls `dungeon-logic.js` (`checkAnswer`, `truthOf`, `checkSolve`, `sentencesFor`). Scenes never decide answers themselves.
- **P1 limits (spec §Curriculum scope):** 左右 from the screen; 上下 only in one column; 前後 only by facing in one queue; 之間 strictly between along one line; no diagonals, no depth, no 東南西北.
- **Colour never gives the answer:** objects that can be answers differ only by their mark/kind, never by a colour that matches the clue.
- **No free text** anywhere. Hero names come from `HERO_NAMES`.
- **Text:** big Traditional Chinese line, small English line, P1 vocabulary (位置、上、下、左、右、前、後、之間). Clues are spoken with `voice.say(zh)`. Text is **smooth** (normal Phaser text at DPR resolution), never a pixel font, never scaled by the pixel stage.
- **Pixel art:** sprite textures use NEAREST filtering (`texture.setFilter(Phaser.Textures.FilterMode.NEAREST)`), drawn inside the stage container at a whole-number scale `PX`. Never smooth-scale sprites. Do **not** set the global `pixelArt: true` (it would make text jagged).
- **Touch:** every tappable thing ≥ 48 CSS px; one finger.
- **Less motion:** `fx.lessMotion` (bound to `settings.lessMotion`) or `prefers-reduced-motion` → no shake, no confetti, tweens ≤ 150 ms.
- **Dev mode (T4):** `http://localhost:<port>/position.html?dev` (localhost and private LAN IPs 192.168.x / 10.x / 172.16–31.x). Skips login, enters test mode (everything open, nothing saved), player "Dev". `&scene=F2R3` jumps to a room (or `Map`, `Shop`, `MakeHero`, `Rush`, `Sandbox`), `&seed=7` repeatable rounds, `&level=1` forces a support level. `window.__dungeon = { game, bridge, go(key, data) }`.
- **Hidden browser pane:** requestAnimationFrame is throttled when the pane is hidden; prefer `read_page`/`javascript_tool` checks and `game.loop.step(performance.now())` to advance frames by hand.
- **Local server per task** (agents run in parallel, so each uses its own port): `cd <worktree> && python3 -c "import http.server; H=type('H',(http.server.SimpleHTTPRequestHandler,),{'end_headers':lambda s:(s.send_header('Cache-Control','no-store'),http.server.SimpleHTTPRequestHandler.end_headers(s))}); http.server.ThreadingHTTPServer(('',PORT),H).serve_forever()"` with PORT = 8200 + task number (T6 → 8206). Run it with `run_in_background`.
- **Never write to the live Firestore** while testing: always `?dev`.
- **Never commit personal data**; the teacher email stays the placeholder in `firestore.rules`. Grep each diff for `@` before committing.
- **Tests:** `npm test` must stay green.
- Commit trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

---

## Shared contracts (all tasks rely on these exact names)

### Coordinates

A **scene** (one clue's picture) is a small grid. `x` grows to the screen's right (0 = leftmost), `y` grows **upward** (0 = floor level). Queues are rows of creatures on the floor with a shared `facing`.

```
Scene = {
  layout: 'pair' | 'row' | 'queue' | 'column' | 'shelf',   // how T4's stage draws it
  cols, rows,                                               // grid size (row/queue: rows = 1; column: cols = 1)
  objects: [ { id, kind, x, y, facing? } ],                 // facing 'left'|'right' only for queue members
  slots:   [ { x, y } ],                                    // empty places (hero stand points / item drop places)
  queueFacing?: 'left'|'right',                             // layout 'queue'
}
```

`kind` is a key of `KINDS` (logic) → `{ zh, en, art }`; `art` is the frame key T3 provides.

### `dungeon-logic.js` (T1)

```
// rng
lcg(seed) -> () => [0,1)      pick(arr, rng)      shuffle(arr, rng) -> new array

// catalogue
KINDS                      // { torch, shield, sword, bow, axe, helmet, potionRed, potionBlue, potionGreen, book, key,
                           //   chestStar, chestMoon, chestHeart, chestSun, crate, barrel, gem,
                           //   slimeGreen, slimePink, slimeBlue, slimeYellow, bat, owl, hero } each { zh, en, art }
REL = ['left','right','above','below','front','back','between','side']
REL_ZH = { left:'左面', right:'右面', above:'上面', below:'下面', front:'前面', back:'後面' }

// relations — return true / false, or null when the two are not comparable (spec rules)
relation(scene, rel, aId, bId, cId?, side?) -> true|false|null
   left/right: same y; above/below: same x; front/back: both in the queue (uses scene.queueFacing);
   between: all three on one row (same y), one column (same x) or the queue, a strictly between b and c;
   side: absolute — needs even scene.cols; 'left' = x < cols/2.  null otherwise.
slotRelation(scene, rel, slot {x,y}, bId, cId?) -> true|false|null      // same rules, for an empty place

// sentences  { rel, a, b?, c?, side? }
sentenceText(scene, s) -> { zh, en }      // 「盾在劍的左面」 / 「盾在劍和弓之間」 / 「盾在左面」; names from KINDS[kind].zh
truthOf(scene, s) -> true|false|null
sentencesFor(scene, rng, rels) -> [3 sentences], exactly one true, all comparable   // used by 'make'

// clues — every clue has: kind, scene, ask {zh,en}, level, rel, plus kind fields below
//   choose: choices ['left','right'] | ['front','back'] | ['above','below'], answer
//   go:     answers [slot indices]         (any one is right)
//   place:  item kind, answers [slot indices]
//   judge:  sentence, answer true|false
//   select: answers [object ids]          (must pick exactly this set)
//   pick:   answers [one object id]       (tap one; boss riddles, Rush 之間)
//   make:   items [kinds] (2–3), slots (empty scene), rels   → child places all, then picks 1 of sentencesFor(...)
//   solve:  items [kinds], sentences [2–3], answer {kind: slotIndex}  → grade with checkSolve
//   wave:   monsters [ { side:'left'|'right'|'up'|'down', type:'slime'|'bat'|'mole' } ]
validateClue(clue) -> true | throws Error(reason)     // recomputes answers from the scene; non-empty; choose/pick single
checkAnswer(clue, picked) -> boolean                   // choose: picked choice; go/place: slot index; judge: boolean;
                                                       // select: array of ids (set-equal); pick: id; wave: side per monster
checkSolve(clue, placement {kind: slotIndex}) -> boolean   // every item placed, every sentence true
confusionOf(clue, picked) -> { want, picked }          // e.g. {want:'left', picked:'right'} for the teacher log

// rooms
FLOORS = [1,2,3,4]
ROOMS = [ { key:'F1R1', floor:1, idx:1, zh:'火把走廊', en:'Torch hall', wave?:true }, … ]   // spec §2: F1R1–F1R6, F2R1–F2R5, F3R1–F3R6, F4R1–F4R5
roomByKey(key)   roomsOf(floor) -> keys   nextRoom(key) -> key|null
DEFAULT_LEVEL[key] -> 3|2|1           // spec §3: R1 3, R2 3, R3 2, R4 2, R5 1, R6 1; floor 4: R1 2, others 1
levelFor(key, prevMistakes, prevLevel) -> 3|2|1   // max(default, prevLevel) when prevMistakes >= 3, else default
genRoom(key, rng, level = DEFAULT_LEVEL[key]) -> { key, level, clues: [...] }   // every clue passes validateClue
   level 3: 2–3 candidate places; level 2: 3–4; level 1: 5+   (rows/queues/columns get longer)
   R1 of floors 2–4 starts with 2 review clues from earlier floors (marked clue.review = true)
   F1R6 / F3R6: 3 wave clues of 4, 6, 8 monsters (lr / ud only)
genRush(rng) -> generator object { next() -> clue }   // waves of growing length: lr, ud, mixed; a 'pick' 之間 clue between waves

// grading and rewards
hintStep(wrongTries) -> 0|1|2|3      // 1 replay, 2 glow + arrow, 3 show answer (and move on)
mistakesFor(wrongTries, shown) -> n  // shown answer counts 3
starsFor(mistakes) -> 3|2|1          // 0 → 3, 1–2 → 2, else 1
coinsPerAnswer(key) -> 0|1           // R1, R2 and wave rooms: 1; others 0
chestCoins(key, stars) -> n          // R3–R5 and floor 4 rooms (not waves): 5 + 2*stars; else 0
FLOOR_BONUS = 10
FLOOR_LOOK = { 1:'helmetHorned', 2:'petSlime', 3:'helmetCrown', 4:'petDragon' }   // free look on first floor clear (spec §4); floor 4's comes with the boss
floorMedal(progress, floor) -> 'gold'|'silver'|'bronze'|null

// hero, shop
SKINS (6 hex)  HAIR_STYLES (5 ids)  HAIR_COLOURS (6 hex)  TUNICS (8 hex)  HERO_NAMES (≥ 12 {zh,en})
heroName(hero) -> '勇勇 3'
SHOP = [ {id, slot:'helmet'|'pet', zh, en, price|null, earnedBy?:'boss'} ]   // 5 helmets, 4 pets + 'petDragon' (boss only)
LATER_SLOTS = ['cape','badge','trail']
buy(progress, id) -> { ok, progress, reason? }     // reason 'price'|'owned'|'notForSale'
equip(progress, slot, id|null) -> progress         // must own it (or null)

// progress
emptyProgress() -> { stars:{}, coins:0, hero:null, looks:[], equipped:{helmet:null,pet:null,cape:null,badge:null,trail:null}, floorBonus:[] }
recordResult(progress, key, stars, coins) -> { progress, newBest, floorCleared: floor|null, bonus }
     // best stars kept; coins added; first clear of a whole floor adds FLOOR_BONUS once (floorBonus list) and,
     // and adds FLOOR_LOOK[floor] to looks (floor 4: when its last room, the boss, is first cleared)
mergeProgress(a, b) -> progress     // stars max per room; coins max; looks union; floorBonus union; hero/equipped: b's if set else a's

// unlocks   unlock = settings.dungeonUnlock {f1..f4}
isFloorCleared(p, floor)    isFloorOpen(p, floor, unlock, testMode)    isRoomOpen(p, key, unlock, testMode)
isRushOpen(p, unlock, testMode)    // floor 4 cleared and f4 ticked
```

Attempt modes: room `'F1R1'` → mode `'dungeonF1R1'`; Rush → `'dungeonRush'`. Score key `'dungeon'`.

### Art (T3) — `dungeon/art.js`

```
export const ART_PX = 16                      // one tile
preloadArt(scene)                              // in Boot.preload: loads the two sheets (spritesheet, frameWidth 16, spacing 1 / margin per sheet)
buildArt(scene)                                // in Boot.create: makes every code-drawn texture, sets NEAREST on all art textures
artFrame(artKey) -> { texture, frame }         // for every KINDS[*].art and every T3 key below
// code-drawn sprites (side-facing, eyes toward the facing side; texture faces RIGHT, flip for left)
//   'slime.green|pink|blue|yellow', 'bat', 'mole', 'owl', 'dragon', 'pet.slime|ghost|cat|owlet|dragon',
//   'ladder', 'shelf', 'tag.frame', 'hand.left', 'hand.right', 'foot' (footprint arrow), 'sparkle', 'coin'
makeHero(scene, look, { view = 'front' }) -> Phaser.GameObjects.Container   // look = { hero, equipped }
       // front: Kenney layers (body skin, tunic, hair style+colour, helmet); back: code-drawn matching layers
       // container.setLook(look) re-skins in place; size 16×16 art px, origin bottom-centre
makeCreature(scene, kind, facing) -> Sprite    // slimes etc.; .setFacing(f) flips; idle hop tween helper hop(sprite)
makeBackdrop(scene, floor) -> Container        // 192×108 art px: Tiny Dungeon brick wall faces, floor strip, 2 torches, 1 door
```

Kenney sheets are committed by T3 at `dungeon/assets/tiny-dungeon.png` (packed, 12×11 tiles, no spacing) and `dungeon/assets/roguelike-characters.png` (transparent sheet, 54×12 tiles, 1 px spacing), with `dungeon/assets/License-kenney.txt`.

### Shell (T4)

```
dungeon/theme.js:  FONT, UI {ink,paper,good,bad,gold,white}, ROOM {wall,floor,shadow}, textStyle(size, color, extra)
dungeon/sfx.js:    sfx.unlock() muted(get/set, localStorage 'dungeon.muted') tick(i) ding() bonk() boop() pop() coin() star(i) fanfare() whoosh() door() swing()
dungeon/voice.js:  voice.say(zh) -> Promise (ends, or 4 s, or at once when muted/no voice), voice.stop(), voice.available
dungeon/fx.js:     fx.lessMotion, burst(scene,x,y), sparkle(scene,x,y), confetti(scene), shake(scene), floatText(scene,x,y,text,color), iris(scene,key,data), irisIn(scene)

dungeon/stage.js
  class PixelStage
    constructor(scene, { w = 192, h = 108 })   // root container centred in the canvas, scale PX = max(1, floor(min(W/w, H/h)))
    root, PX, w, h
    toScreen(ax, ay) -> {x, y}                  // art px → CSS px (for placing smooth text/buttons over sprites)
    fromScreen(x, y) -> {ax, ay}
    layout(scene) -> { pos(x, y) -> {ax, ay}, standPoints: [{ax, ay, x, y}], ladders: [{ax, y0, y1}] }
                                                // where every grid cell of a Scene sits in art px for its layout
    drawScene(sceneData) -> { sprites: {id: Sprite}, slots: [Zone] }   // draws objects + slot markers (dashed squares at level 3/2)
    clearScene()
    glow(sprite, on)  arrow(fromAx, fromAy, dir)  // hint visuals
    tags(on, size = 'big'|'small')              // 左 / 右 wall tags (spec S3/S2)

dungeon/ui.js  (Phaser-drawn, smooth text, in a top-level container that ignores PX)
  ui = new UI(scene)
  ui.prompt(zh, en = '', { speak = true })     // top bar with 🔈 replay
  ui.choices([{id, zh, en?, icon?}]) -> Promise<id>     ui.mark(id, good)    ui.clearChoices()
  ui.button({ id, zh, en?, x, y }) -> Promise          // e.g. 在這裡！ / 完成
  ui.dots(states)                                       // 'good'|'bad'|'now'|null per clue
  ui.coins(n)                                           // coin counter top-right, animates
  ui.toast(zh, en = '', ms = 1500)
  ui.endPanel({ title, stars, newBest, coins }) -> Promise<'next'|'map'|'retry'>
  ui.card({ zh, en?, buttons }) -> Promise<id>
  ui.back(onBack)    ui.clear()

dungeon/RoomScene.js   (key 'Room', data { key })
  create(): level = bridge.levelFor(key); room = genRoom(key, bridge.rng, level); draws backdrop, hero, ui; runs clues in order
  runClue(clue): task = new TASKS[clue.kind](this, clue); await task.run(); task.destroy()
  wrong(picked) -> Promise<step>   // wrongTries++, mistakes per mistakesFor, confusion logged (≤ 5), sfx.bonk, hero bonk anim;
                                   // step 1: replay voice; 2: (task shows glow); 3: (task shows answer)
  right() -> Promise               // sfx.ding, sparkle, coin when coinsPerAnswer(key) (bridge.addCoins), dot turns good
  finish()                         // stars, chestCoins chest animation, bridge.complete(key, stars, {...}), endPanel → next/map/retry
  stage (PixelStage), ui (UI), hero (Container from makeHero), level, room, clueIndex
dungeon/tasks/index.js  TASKS = { choose, go, place, judge, select, pick, make, solve }
Task contract (every file in dungeon/tasks/):
  export default class XTask { constructor(room, clue)  async run()  destroy() }
  run(): draws its scene via room.stage.drawScene(clue.scene), asks (room.ui.prompt(clue.ask.zh, clue.ask.en)),
         loops until checkAnswer(clue, picked) is true: on wrong, step = await room.wrong(picked);
         step 2 → glow the reference object(s); step 3 → animate the answer, then resolve. On right: await room.right().
```

### Bridge `dungeon/main.js` (T4)

```
bridge.player, bridge.settings (dungeonUnlock, dungeonTimeLimit, lessMotion, …)
bridge.testMode (getter: session.testMode && !previewLocks), bridge.previewLocks
bridge.progress
bridge.rng()                                 // Math.random, or lcg(seed) with ?seed=
bridge.levelFor(key)                         // levelFor(key, lastMistakes[prevKey], lastLevel[prevKey]) from this sitting; ?level= overrides
bridge.addCoins(n)                           // live counter only; saved with complete()
bridge.complete(key, stars, { mistakes, hints, durationSec, confusions, coins }) -> Promise<{ newBest, floorCleared, bonus }>
                                             // logAttempt({game:'dungeon', mode:'dungeon'+key, kind:'level', stars, mistakes, durationSec, confusions});
                                             // recordResult; save unless test mode
bridge.saveLook(progressPatchFn) -> Promise  // hero / buy / equip changes, then save
bridge.rushStart(onTimeUp)  bridge.rushHit(correct, base) -> points  bridge.rushState()  bridge.rushEnd() -> Promise  bridge.rushAbort()
bridge.showLeaderboard()
bridge.sitting = { rooms: 0, wellDoneShown: false }
```

`dungeon-progress.js` (T4): `loadProgress(uid)`, `saveProgress(uid, progress)` — Firestore `dungeonProgress/{uid}` + localStorage `dungeonProgress:<uid>`, same as `bonds-progress.js`.

### Scene keys and files

| Key | File | Data | Owner |
|---|---|---|---|
| `Boot` | `dungeon/scenes/BootScene.js` | — | T4 |
| `Map` | `dungeon/scenes/MapScene.js` | `{ justDone?, goTo? }` | T9 |
| `MakeHero` | `dungeon/scenes/MakeHeroScene.js` | `{ then? }` | T9 |
| `Shop` | `dungeon/scenes/ShopScene.js` | — | T9 |
| `Room` | `dungeon/RoomScene.js` | `{ key }` (non-wave rooms) | T4 |
| `Waves` | `dungeon/scenes/WavesScene.js` | `{ key }` (F1R6, F3R6) | T8 |
| `Rush` | `dungeon/scenes/RushScene.js` | — | T8 |
| `Sandbox` | `dungeon/scenes/SandboxScene.js` | — (dev: every sprite, hero looks, every layout) | T3 |

T4 creates **stubs** for Map, MakeHero, Shop, Waves, Rush, Sandbox (prompt 「製作中」 + back to Map) and for every task file (resolves at once after showing the clue text), so wave-2 tasks only replace their own files. `Map` stub lists room buttons so T5–T7 can reach rooms.

---

### Task 1: `dungeon-logic.js` + tests

**Files:** Create `dungeon-logic.js`, `tests/dungeon-logic.test.mjs`.

Implement exactly the contract above (JSDoc each export). Pure ES module, no imports, no DOM.

- [ ] **Step 1: write the failing tests** in `tests/dungeon-logic.test.mjs` (`import test from 'node:test'; import assert from 'node:assert/strict'; import {...} from '../dungeon-logic.js';`). Cases (each a `test(...)`):
  1. `relation` row: scene `{layout:'row', cols:3, rows:1, objects:[{id:'a',kind:'shield',x:0,y:0},{id:'b',kind:'sword',x:2,y:0}], slots:[{x:1,y:0}]}` → `left a b` true, `right a b` false, `above a b` null.
  2. column: a(0,2) b(0,0) → `above a b` true, `below a b` false, `left a b` null; a(0,1) vs c(1,0) → `above` null (diagonal).
  3. queue facing 'right': members p(0) q(1) r(2) → `front r q` true, `back p q` true; set `queueFacing:'left'` → `front p q` true (turn round swaps).
  4. `between`: row a(1) b(0) c(2) → true; a(3) → false; mixed row/column → null.
  5. `side`: cols 2, a x=0 → 'left' true; cols 3 → null.
  6. `slotRelation` row slot x=1 between b(0), c(2) → true.
  7. `sentenceText`: `{rel:'left',a:'a',b:'b'}` with shield/sword → zh `盾在劍的左面`; between → `盾在劍和弓之間`; side → `盾在左面`.
  8. `sentencesFor` on 20 seeds: 3 sentences, exactly one `truthOf` true, none null.
  9. **every room, every level 1–3, seeds 1..50:** `genRoom(key, lcg(seed), level).clues` all pass `validateClue`; clue counts match spec §2 (4–5 per room; R4 rooms 3 judge + 2 select; F1R6/F3R6 3 waves of 4/6/8; F4R5 3 pick riddles each with two-relation ask); floors 2–4 R1 start with 2 `review` clues; F1 clues use only left/right/between/side; F2 only front/back/between; F3 only above/below/between; level 1 go/place clues have ≥ 5 slots, level 3 ≤ 3.
  10. `checkAnswer`: choose, go (any slot in answers), select (set-equal, order-free; missing or extra → false), judge, pick, wave.
  11. `checkSolve`: the shelf puzzle answer passes; swapping two items fails; a missing item fails.
  12. `levelFor`: default by key; prevMistakes 3 with prevLevel 3 on an R3 → 3; prevMistakes 2 → default.
  13. `hintStep` 1/2/3/3; `mistakesFor(2,false)`=2, `mistakesFor(2,true)`=3; `starsFor` 0→3, 2→2, 3→1.
  14. coins: `coinsPerAnswer('F1R1')`=1, `('F1R3')`=0, `('F1R6')`=1; `chestCoins('F1R3',3)`=11, `('F1R1',3)`=0, `('F1R6',3)`=0.
  15. `recordResult`: best stars kept; coins added; finishing the last room of floor 1 gives `floorCleared:1, bonus:10` and adds `'helmetHorned'` to looks, once only; boss first clear adds `'petDragon'`.
  16. `buy`/`equip`: price check, owned, `petDragon` not for sale; equip unowned → unchanged.
  17. `mergeProgress`: max stars, max coins, union looks.
  18. unlocks: f1 off → floor 1 closed; testMode → all open; room 2 needs ≥1★ on room 1; floor 2 needs floor 1 cleared and f2 ticked; Rush needs floor 4 cleared.
  19. `genRush(lcg(1))`: first 30 clues valid; first wave is lr only; a pick clue appears between waves.
  20. KINDS: every `art` key is a non-empty string; every kind used by `genRoom` exists.

- [ ] **Step 2:** `npm test` → new tests fail (module missing).
- [ ] **Step 3: implement** `dungeon-logic.js`. Generators build scenes per layout and level, choose a relation and reference objects with `rng`, compute answers with `relation`/`slotRelation`, then `validateClue` each clue (regenerate on failure, max 20 tries, then throw). Clue texts (zh / en):
  - choose lr: `「{A}在{B}的左面還是右面？」` / `Is the {a} left or right of the {b}?`; side: `「{A}在左面還是右面？」`; fb: `「{A}在{B}的前面還是後面？」`; ud: `「{A}在{B}的上面還是下面？」`.
  - go: `「走到{B}的{REL}」` / between `「走到{B}和{C}之間」`; key twist allowed: `「鑰匙在{B}的{REL}，走過去！」`.
  - place: `「把{ITEM}放在{B}的{REL}」` / `「把{ITEM}放在{B}和{C}之間」`.
  - judge: owl says `sentenceText(...)`; ask `「貓頭鷹說得對嗎？」`.
  - select: `「哪些在{B}的{REL}？答案可多於一個」`.
  - pick (boss): `「寶石在{B}的{REL1}，也在{C}的{REL2}。找出寶石！」` — the gem is hidden among chests; the answer chest is the only one meeting both.
  - make: `「把寶物放好，然後選出正確的句子」`.
  - solve: sentences shown as a list; ask `「依提示把玩具放上架」`.
  - wave: `「怪物來了！」`.
- [ ] **Step 4:** `npm test` → all green.
- [ ] **Step 5: commit** `feat(dungeon): position logic, clues, scaffolding, rewards (+tests)`.

---

### Task 2: Platform integration

**Files:** Modify `shared.js`, `labels.js`, `tests/labels.test.mjs`, `index.html`, `bump.sh`, `firestore.rules`, `teacher-data.js`, `teacher.html`, `tests/teacher-data.test.mjs`, `README.md`.

- [ ] **Step 1: labels test first.** Add to `tests/labels.test.mjs`:

```js
test('Treasure Dungeon labels', () => {
  assert.equal(GAME_LABEL.dungeon, '🗝️ Treasure Dungeon');
  for (const m of ['dungeonF1R1', 'dungeonF3R6', 'dungeonF4R5', 'dungeonRush']) assert.equal(gameOf(m), 'dungeon', m);
  assert.equal(gameOf('dungeonF5R1'), 'unknown');
  assert.equal(modeLabel('dungeonF1R1'), 'Treasure Dungeon F1R1 火把走廊');
  assert.equal(modeLabel('dungeonF4R5'), 'Treasure Dungeon F4R5 龍的寶庫');
  assert.equal(modeLabel('dungeonRush'), 'Treasure Dungeon Rush 寶藏快手');
});
```
Run `npm test` → fails.
- [ ] **Step 2: `labels.js`:** `GAME_LABEL.dungeon = '🗝️ Treasure Dungeon'`; a `DUNGEON` map of mode → `'F1R1 火把走廊'` … for all 22 rooms (names from spec §2) plus `dungeonRush: 'Rush 寶藏快手'`; extend `gameOf` and `modeLabel` like `SHAPES`. `npm test` → green.
- [ ] **Step 3: `shared.js` settings:** `export const DUNGEON_KEYS = ['f1','f2','f3','f4']; const defaultDungeonUnlock = () => Object.fromEntries(DUNGEON_KEYS.map(k => [k, false]));` Add `dungeonUnlock: defaultDungeonUnlock(), dungeonTimeLimit: 60` to `DEFAULT_SETTINGS`, `dungeonUnlock: defaultDungeonUnlock()` to `settings`; in `loadSettings` merge like `shapesUnlock`; `timeLimitOf`: `g === 'dungeon' ? settings.dungeonTimeLimit`.
- [ ] **Step 4: teacher modal row** after Robot Workshop (amber box): title `Treasure Dungeon 尋寶地下城`, four checkboxes `settingDungeonF1`…`F4` labelled `Floor 1 左右`, `Floor 2 前後`, `Floor 3 上下`, `Floor 4 綜合`, number input `settingDungeonTime` (10–300). Fill on open and save in the same places as the shapes fields. Under the row, one grey help line: `Before Floor 1: 老師話 left/right game (textbook p72). Before Floor 2: line-up activity (p73).`
- [ ] **Step 5: hub card** in `index.html` after Robot Workshop: `<a href="position.html" …>🗝️ Treasure Dungeon<br><span …>尋寶地下城 · 上下左右前後</span></a>` (amber border).
- [ ] **Step 6: `bump.sh`:** append `position.html dungeon-logic.js dungeon-progress.js $(find dungeon -name '*.js' 2>/dev/null)` to `FILES`.
- [ ] **Step 7: `firestore.rules`:** add `dungeonProgress/{uid}` (read/write own, teacher read) copying the `shapesProgress` block; add `'dungeon'` to the `attempts` game list and the collections comment. Placeholder email untouched.
- [ ] **Step 8: teacher data:** test first in `tests/teacher-data.test.mjs` (attempts `dungeonF1R1` stars 2 then 3, `dungeonRush` score → `dungeonStars.F1R1 === 3`, `dungeonRush === best`). In `teacher-data.js`: `export const DUNGEON_ROOMS = [22 keys]`; add `'dungeon'` to `OVERVIEW_GAMES`; per student `dungeonStars` and `dungeonRush` like shapes. In `teacher.html`: a `dungeon` Overview sub-tab (columns per room ⭐, Rush) and a **Top mix-ups** line per student from `confusions` (`左↔右`, `前↔後`, `上↔下` counts); demo data adds dungeon attempts with confusions. `npm test` → green.
- [ ] **Step 9: README:** game list line, dev line (`position.html?dev`, `&scene=F2R3`, `&seed=`, `&level=`), Teacher rows, **Teacher notes** (spec §6: 老師話 before Floor 1, line-up before Floor 2), art credit.
- [ ] **Step 10:** `npm test`, grep diff for `@`, commit `feat(dungeon): platform integration (settings, labels, hub, rules, teacher tab)`.

---

### Task 3: Art

**Files:** Create `dungeon/assets/tiny-dungeon.png`, `dungeon/assets/roguelike-characters.png`, `dungeon/assets/License-kenney.txt`, `dungeon/art.js`, `dungeon/art-frames.js`, `dungeon/scenes/SandboxScene.js`, `dungeon/dev/sheets.html`.

Source zips are already extracted at `/private/tmp/claude-501/-Users-user-Documents-P1-math-game/a7c52c92-b5ad-4f3b-88ca-854d65aaf59f/scratchpad/kenney/` (`td/Tilemap/tilemap_packed.png` 192×176, 12 cols × 11 rows, no spacing; `rc/Spritesheet/roguelikeChar_transparent.png` 918×203, 54 cols × 12 rows, 16 px tiles with 1 px spacing; `td/License.txt`). Copy only these two PNGs and one licence file (both packs are CC0; concatenate the two licence texts).

- [ ] **Step 1: sheet viewer** `dungeon/dev/sheets.html`: draws each sheet ×4 with nearest scaling and the frame index on every tile, so frames can be picked by eye.
- [ ] **Step 2: `art-frames.js`:** one object mapping art keys → `[sheet, frameIndex]`. Tiny Dungeon index = row × 12 + col. Hints read from the sheet (verify in the viewer): row 7 cols 5–8 chests (closed, open, …), row 8 cols 5–6 round/kite shields, row 8 cols 7–11 swords/axes, row 9 cols 5–8 potions (grey, green, red, blue), row 9 col 0 green ghost-slime, row 10 col 0 bat, row 10 col 1 ghost, rows 1–3 cols 9–11 doors, rows 2–3 cols 4–5 grey brick faces, row 1 col 5 wall banner/flame. Roguelike Characters: bodies (skin tones) in the first columns, then tunics, hair (styles × colours), helmets/hats, shields, weapons — map 6 skins, 5 hair styles × available colours, 8 tunics, 5 helmets. Where the sheet lacks a key (ladder, shelf, book, key, gem, crate), draw it in code in the same style.
- [ ] **Step 3: `art.js`** per the contract: `preloadArt` (`scene.load.spritesheet('td', 'dungeon/assets/tiny-dungeon.png?v=0', {frameWidth:16, frameHeight:16})`, `'rc'` with `spacing:1`), `buildArt` (code-drawn textures via `scene.make.graphics` → `generateTexture`, all NEAREST), `artFrame`, `makeHero` front (Kenney layers) and back (code-drawn: same skin/hair/tunic colours, helmet back silhouette, foam sword in each hand slot), `makeCreature` (slimes 16×12 with eyes on the right side, a back nub; bat, mole, owl, dragon 32×24; pets 12×12), `hop(sprite)`, `makeBackdrop(scene, floor)` (each floor a slightly different stone tint: 1 purple, 2 blue, 3 green, 4 gold). Slimes must read clearly as facing one way at ×4: eyes 2 px wide on the facing side, a 1 px darker back edge.
- [ ] **Step 4: SandboxScene** (`?dev&scene=Sandbox`): every art key in a labelled grid at the current `PX`; hero front/back cycling through skins/hair/tunics/helmets/pets; a queue of 3 slimes with a 「轉身」 button; each layout drawn by a hard-coded Scene object (uses `PixelStage` from T4 if present, else its own container — T4 lands in the same wave, so keep a tiny local fallback and switch to `PixelStage` in T10).
- [ ] **Step 5: verify** in the browser pane: screenshot the Sandbox at iPad landscape (1180×820) and phone (390×844); slimes' facing obvious; nothing blurred; text sharp. Commit `feat(dungeon): Kenney CC0 art, hero composer, code sprites, sandbox`.

---

### Task 4: Shell, bridge, stage, UI, RoomScene core, stubs

**Files:** Create `position.html`, `dungeon-progress.js`, `dungeon/main.js`, `dungeon/theme.js`, `dungeon/sfx.js`, `dungeon/voice.js`, `dungeon/fx.js`, `dungeon/stage.js`, `dungeon/ui.js`, `dungeon/RoomScene.js`, `dungeon/scenes/BootScene.js`, stubs `dungeon/scenes/{MapScene,MakeHeroScene,ShopScene,WavesScene,RushScene}.js`, `dungeon/tasks/index.js`, stubs `dungeon/tasks/{choose,go,place,judge,select,pick,make,solve}.js`. (Do **not** create `SandboxScene.js` or `art*.js` — T3 owns them; import them, and if absent at merge time the wave merge brings them.)

- [ ] **Step 1: `position.html`** from `bonds.html`: title `Treasure Dungeon 尋寶地下城`, amber login screen `🗝️ Treasure Dungeon 尋寶地下城`, same HUD / rank popup / corner buttons, leaderboard pop-up with a single tab `dungeon` (`🏆 寶藏快手 Rush`), stage div `#phaser`, footer credit `Art: Kenney.nl (CC0)` (small, bottom-left of the login screen), `<script type="module" src="dungeon/main.js?v=0">`.
- [ ] **Step 2: `dungeon-progress.js`** = `bonds-progress.js` with collection `dungeonProgress`, key `dungeonProgress:<uid>`, imports from `./dungeon-logic.js?v=0`.
- [ ] **Step 3: `theme.js`, `sfx.js` (copy Rod Town synth; add `coin`, `door`, `swing`, `boop`, `pop`, `ding`), `voice.js` (copy `shapes/engine/voice.js`, mute from `dungeon/sfx.js`), `fx.js` (copy `bonds/fx.js`, add `sparkle`; textures made in Boot).**
- [ ] **Step 4: `main.js`** from `bonds/main.js`: bridge per contract; `new Phaser.Game({ type: AUTO, parent:'phaser', backgroundColor:'#2a1f33', scale: scaleConfig('phaser'), render:{ antialias:true, roundPixels:true }, scene:[Boot, Map, MakeHero, Shop, Room, Waves, Rush, Sandbox] })`, `installHiDPI` imported from `../bonds/hidpi.js?v=0`; `?dev` handling incl. `scene`, `seed`, `level`; first visit with `progress.hero == null` → `MakeHero` then Map; `sharedSound.on = false`; leaderboard close → Map; `mountTeacherModal` refreshes Map.
- [ ] **Step 5: `stage.js` `PixelStage`** per contract. Layout rules (art px, room 192×108, floor line at ay = 92): `pair` two objects at ax 56 and 136; `row` objects/slots evenly spaced 20 px apart, centred; `queue` same spacing, creatures on the floor; `column` a shelf stack at ax 96 with levels every 20 px from the floor up, ladder at ax 72; `shelf` cols × rows cells 24 × 20 centred, ladder left of the shelf. `standPoints`: the floor in front of every slot/object column plus every shelf level reachable by ladder. Slot markers: dashed squares (level 3 and 2 only).
- [ ] **Step 6: `ui.js`** per contract (rounded panels, FONT, ≥ 48 px buttons, 🔈 replays `voice.say`).
- [ ] **Step 7: `RoomScene.js`** per contract (backdrop, hero front view at a stand point, coin counter, dots, tags per level, clue loop, wrong/right, chest animation, end panel; after 3 rooms in a sitting show the 「今日做得好！」 card once with Continue). Log `durationSec`, `hints` (count of step ≥ 2), `confusions` via `confusionOf`.
- [ ] **Step 8: `BootScene`** preloads art (`preloadArt`), builds fx textures + `buildArt`, then starts the `?scene=` target or Map. Stubs per "Scene keys" above; Map stub = a list of all room buttons + Rush/Shop/MakeHero buttons. Task stubs: show `clue.ask`, wait for a tap on 「下一題」, resolve.
- [ ] **Step 9: verify** `position.html?dev` → Map stub → `F1R2` runs 4 stub clues → end panel → back; `&scene=F2R3&seed=7` deterministic; no console errors. Commit `feat(dungeon): page shell, bridge, pixel stage, UI kit, room core, stubs`.

---

### Task 5: Hero walking + `go` + `place`

**Files:** Create `dungeon/hero-walk.js`; replace `dungeon/tasks/go.js`, `dungeon/tasks/place.js`.

- [ ] **Step 1: `hero-walk.js`:** `attachWalk(room) -> { walkTo(standPoint) -> Promise, nearest(ax, ay), enable(on), current }` — tap anywhere on the room → walk to the nearest stand point (path: along the floor, up/down a ladder when the target level differs; 40 art px/s, climb anim); tapping an object wiggles it and says its name (`voice.say(KINDS[kind].zh)`). Rewards nothing.
- [ ] **Step 2: `go.js`:** draw scene, enable walking; big 🔍 「在這裡！」 button appears when the hero stops; on tap → `checkAnswer(clue, slotIndexAt(hero.current))`; hint 2 glows the reference object(s) and draws an arrow on the answer side; hint 3 walks the hero to an answer slot and reads the clue with the answer.
- [ ] **Step 3: `place.js`:** the item sprite sits in a tray; drag it (≥ 48 px hit area) onto any slot; drop → check; wrong → slides back; hints like go (3 → item flies to the answer slot).
- [ ] **Step 4: verify** F1R2, F1R3, F2R2 (hero joins queue), F3R2 (ladders), F3R3 in `?dev&seed=3` at iPad and phone sizes; wrong answers show the hint ladder; screenshot each. Commit `feat(dungeon): hero walking, go and place clues`.

---

### Task 6: `choose` + `judge` + `select` + `pick`

**Files:** replace `dungeon/tasks/choose.js`, `judge.js`, `select.js`, `pick.js`.

- [ ] **Step 1: choose:** two big signs (左/右, 前/後, 上/下) via `ui.choices`; F1R1 opens with the demo (spec §2: 左 tag glows 「這邊是左面」, then 右). Queue clues hop the slimes once so their facing is seen; footprints at level 3.
- [ ] **Step 2: judge:** owl sprite with a speech bubble (smooth text) saying `clue.sentence`; ✓ / ✗ buttons; hint 3 shows why (glow both objects, arrow).
- [ ] **Step 3: select:** tap objects to toggle a ring; 「完成」 checks; wrong → the right set glows (one mistake), then the child confirms.
- [ ] **Step 4: pick:** tap one object; boss version (F4R5): dragon sleeps on the right, each solved riddle → yawn; after the 3rd it falls asleep (Zzz) and the chest opens.
- [ ] **Step 5: verify** F1R1, F1R4, F2R1 (turned queue), F2R4, F3R4, F4R4, F4R5. Commit `feat(dungeon): choose, judge, select and pick clues`.

---

### Task 7: `make` + `solve`

**Files:** replace `dungeon/tasks/make.js`, `dungeon/tasks/solve.js`.

- [ ] **Step 1: make:** tray of 2–3 items/slimes; child drags each onto any empty slot (free arrangement; F2R5 builds a queue and picks its facing with a 🔄 button); 「完成」 → three sentence buttons from `sentencesFor(currentScene, rng, clue.rels)`; correct = `truthOf` true. A wrong pick → `room.wrong`; hint 3 highlights the true sentence.
- [ ] **Step 2: solve:** 2×2 then 2×3 shelf (F4R2), one item pre-placed, sentence list shown (and spoken one by one with 🔈 each); drag items; 「完成」 → `checkSolve`; wrong → items that break a sentence wobble and that sentence turns red.
- [ ] **Step 3: verify** F1R5, F2R5, F3R5, F4R2. Commit `feat(dungeon): make and solve clues`.

---

### Task 8: Monster waves + Rush

**Files:** replace `dungeon/scenes/WavesScene.js`, `dungeon/scenes/RushScene.js`; create `dungeon/waves.js`.

- [ ] **Step 1: `waves.js`** shared engine: back-view hero centred in a corridor backdrop; controls per spec §5 — lr: two glowing **hand** buttons at the hero's sides (left hand on the screen's left); ud: 上 / 下 buttons above the head / at the feet; mix: all four. Monsters (slime from the sides, bat from the ceiling, mole from the floor) walk in; right side → foam-sword swing, pop into sparkles + coin; wrong side → shield bonk 「哎呀！」, combo reset, monster stays. Voice/sound announces sides in wave 1 only.
- [ ] **Step 2: `WavesScene`** (F1R6, F3R6): `genRoom(key)` waves, slow monsters that wait at the hero, stars and coins as a room, `bridge.complete`, end panel.
- [ ] **Step 3: `RushScene`:** `bridge.rushStart(end)`, clues from `genRush(rng)`; monsters keep coming (speed grows per wave); a monster reaching the hero bonks and leaves (combo reset); `pick` 之間 clue between waves; points via `bridge.rushHit`; time up → `bridge.rushEnd()`.
- [ ] **Step 4: verify** F1R6, F3R6, Rush (dev test mode) on iPad and phone; hands match screen sides. Commit `feat(dungeon): monster waves and Rush`.

---

### Task 9: Map, MakeHero, Shop

**Files:** replace `dungeon/scenes/MapScene.js`, `MakeHeroScene.js`, `ShopScene.js`.

- [ ] **Step 1: Map:** side-view cut-through of 4 floors linked by stairs; room doors with stars; locks per `isRoomOpen`; floor medal badges; Rush door at the bottom (locked until `isRushOpen`); 🏆 leaderboard button; 裝備室 Shop door; hero walks to the tapped door (like Rod Town's train), then `fx.iris` into `Room`/`Waves`. `justDone` → stars fly to the door; `goTo` → hero walks on after the end panel's **Next**. Map scrolls vertically on short screens.
- [ ] **Step 2: MakeHero:** big front-view hero with a mirror frame; rows of swatches: skin (6), hair style (5), hair colour (6), tunic (8); name = two arrows cycling `HERO_NAMES` + a number from `rng`; 「出發！」 saves via `bridge.saveLook`. Reachable later from the Shop (free changes).
- [ ] **Step 3: Shop:** mirror view; tabs 頭盔 / 寵物 / 外觀 (opens MakeHero); each item shows price or 🔒 + how to get; tap = try on (free); 「買」 → `buy`; owned → 「穿上」/「除下」 → `equip`; coins counter; capes/badges/trails tabs absent (later slots). Pets follow the hero on the map.
- [ ] **Step 4: verify** first-run flow (fresh localStorage) → MakeHero → Map; buy a helmet with dev coins (`__dungeon.bridge.progress.coins = 50`); look persists across reload (localStorage, test mode keeps it in memory only — check with `previewLocks`). Commit `feat(dungeon): map, make your hero, shop`.

---

### Task 10: Integration QA, polish, docs, push

**Files:** any `dungeon/**`, `position.html`, `README.md`, `docs/superpowers/plans/treasure-dungeon-asbuilt.md`.

- [ ] Play every room on iPad landscape/portrait and phone with `?dev`, voice on and off, less motion on; one full floor timed (~10–12 min target; adjust clue counts in `dungeon-logic.js` only via tests if far off).
- [ ] Sandbox switched to `PixelStage`; no console errors; frame rate fine on a throttled CPU.
- [ ] Check every spec section has shipped (§1–§8) and note gaps in `treasure-dungeon-asbuilt.md`.
- [ ] `./bump.sh`, `npm test`, grep diff for `@`, commit `chore: bump asset stamps`, `git push -u origin treasure-dungeon`. Do **not** merge to `main`; report to the owner, including that the Picnic Park work in the main checkout touches the same shared files.
