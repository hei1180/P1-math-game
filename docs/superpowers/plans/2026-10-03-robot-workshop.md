# Robot Workshop 形狀機械人工場 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Robot Workshop, a three.js toy-factory game for P1 shapes (1S1 立體圖形, 1S2 平面圖形), as the fourth game of the P1 platform.

**Architecture:** Static site, no build step. `shapes.html` hosts a DOM shell (login, HUD, rank popup, leaderboard pop-up, teacher button, DOM overlay `#ui` for prompts and buttons) reusing `shared.js`, plus one three.js canvas in `#stage`. All rules and grading live in `shapes-logic.js` (pure, Node-tested, **already written and passing in this plan's first commit**). three.js code lives under `shapes/`: a small engine (`stage`, `tween`, `input`, `scenes`, `physics`, `voice`), procedural models, a DOM overlay, and one file per scene. A `bridge` object in `shapes/main.js` is the only link between scenes and `shared.js`/Firestore.

**Tech Stack:** three 0.186.1 and cannon-es 0.20.0 (jsDelivr, via an import map), vanilla ES modules, Tailwind CDN (DOM shell only), Firebase v12 (existing `shared.js`), Node `node --test`.

**Spec:** `docs/superpowers/specs/2026-10-03-robot-workshop-design.md` (read it; this plan implements it). Curriculum limits: `docs/curriculum/p1-maths.md` (1S1, 1S2).

**Repo:** `/Users/user/Documents/P1-math-game`, branch `robot-workshop` (pushed to GitHub). Never push to `main`; the owner approves the merge.

---

## Parallel waves

| Wave | Tasks (parallel within a wave) | Needs |
|---|---|---|
| 0 | T1 `shapes-logic.js` + tests — **done in the plan commit** | — |
| 1 | T2 platform (shared/labels/hub/rules/bump) · T3 engine + theme + sfx + voice · T4 page shell + overlay + bridge + progress + scene stubs | T1 |
| 2 | T5 solids + tiles + Sandbox · T6 everyday objects + robots · T7 CourseScene base | T3, T4 |
| 3 | T8 Workshop map · T9 A1+A2 · T10 A3+A4 · T11 B1+B2 · T12 B3+B4 · T13 Boss + Rush · T14 Garage + Free Build + Gallery | T5, T6, T7 |
| 4 | T15 integration QA, performance, polish pass, docs, push | all |

Each task works in its own git worktree off `robot-workshop` (`.worktrees/<task>`, gitignored) and touches **only its listed files**, so a wave merges without conflicts. Merge order inside a wave does not matter.

## Conventions every task must follow

- **Cache-bust stamp:** every relative import and asset URL in `shapes.html` and `shapes/**.js` carries `?v=0` (e.g. `import { ui } from '../ui/overlay.js?v=0';`). `bump.sh` (T2) rewrites stamps on deploy. Node tests import `../shapes-logic.js` without a stamp; `shapes-logic.js` imports nothing.
- **three.js and cannon-es** are bare imports resolved by the import map in `shapes.html` (T4): `import * as THREE from 'three';`, `const CANNON = await import('cannon-es');` (physics only, loaded lazily). No stamp on bare imports.
- **Grading:** every right/wrong decision calls a function from `shapes-logic.js`. Physics and animations never decide an answer.
- **P1 limits (spec §Curriculum):** no oblique solids; every prism is 角柱, every pyramid 角錐; sides 3–6 or circle; no 凹/凸 words; no line segments, angles, faces/edges/vertices counts.
- **Colour never tells the shape:** colours come from `toyColor(rng)` (T3), never chosen by shape type.
- **No free text** anywhere a child can type. Robot names come from `ROBOT_NAMES`.
- **Text:** big Traditional Chinese line, small English line. Use P1 vocabulary (`docs/curriculum/p1-maths.md` §1S1, §1S2). Prompts are spoken with `voice.say(zh)`.
- **Touch:** every tappable thing ≥ 48 CSS px; one finger only; no pinch.
- **Less motion:** `motion.less` (T3) shortens tweens and turns off shake, confetti and idle wobble.
- **Font:** `FONT` from `shapes/theme.js`.
- **Dev mode (T4):** `http://localhost:<port>/shapes.html?dev` (also on private LAN IPs 192.168.x / 10.x / 172.16–31.x so the owner can try it on an iPad). Skips login, enters test mode (everything open, nothing saved), player "Dev". Extra params: `&scene=A1` start a scene directly, `&seed=7` repeatable rounds. `window.__robot = { stage, scenes, bridge, go(key, data) }`.
- **Hidden browser pane:** requestAnimationFrame is throttled when the pane is hidden. Use `__robot.stage.step(ms)` (T3) to advance frames by hand when checking animations.
- **Local server per task** (agents run in parallel, so each uses its own port): `cd <worktree> && python3 -c "import http.server; H=type('H',(http.server.SimpleHTTPRequestHandler,),{'end_headers':lambda s:(s.send_header('Cache-Control','no-store'),http.server.SimpleHTTPRequestHandler.end_headers(s))}); http.server.ThreadingHTTPServer(('',PORT),H).serve_forever()"` with PORT = 8100 + task number (T9 → 8109).
- **Never write to the live Firestore** while testing: use `?dev` (test mode saves nothing).
- **Never commit personal data** (the teacher's email stays a placeholder in `firestore.rules`).
- **Tests:** `npm test` must stay green (currently 54 + 29 = 83).
- Commit trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

---

## Shared contracts (all tasks rely on these exact names)

### `shapes-logic.js` (T1, done)

Read the file; its JSDoc is the contract. Exports:

```
FAMILIES, FAMILY[f] {zh,en,friend,friendZh}, MODELS, MODEL_IDS, familyOf(id), posesOf(id)
rolls(id, pose), rollStyle(id, pose) -> 'any'|'straight'|'circle'|null, topIsFlat(id), bottomIsFlat(id), canPlace(piece, below, isLast)
FACTS, FACT_KEYS, CLUE_TEXT[fact][true|false] {zh,en}, candidatesFor(clues), clueSequence(family, rng)
OBJECTS [{id,zh,en,family}] (12), objectById(id)
TILE_TEMPLATES [{id,sides,points?,circle?,irregular?,dented?}], templateById, tileAnswer(t) -> 3..6|'circle', TILE_ANSWERS, ANSWER_TEXT
simplify, countSides, segmentsMeet, isSimplePolygon, polygonArea, checkPeg({points,closed}, target) -> {ok,sides,reason}, PEG_GRID (5)
PIECES {sq,rect,bigsq,tri,bigtri,circle}, PIECE_IDS, footprint(id,x,y,r) -> ['x,y,q'], PUZZLES [{id,zh,en,solution,cells}], puzzleById, checkDrop(puzzle, coveredSet, id,x,y,r) -> {ok,keys}, isPuzzleDone
WHEEL_CHOICES, BODY_CHOICES, HEAD_CHOICES, checkBuild(job, {wheels,body,head,panel}) -> {ok, fail}, genBoss(rng)
COURSES [{key,zone,zh,en}], ZONES {a,b} {zh,en,keys,rush}, courseByKey, LINES, genCourse(key, rng), genRush3d(rng), genRush2d(rng)
starsFor(mistakes), PARTS[key] {id,slot,zh}, SLOTS, BASIC_PART, ROBOT_NAMES, robotName(name), emptyProgress()
recordResult(progress, key, stars) -> {progress,newBest,part}, mergeProgress(a,b)
isZoneOpen(p, zone, unlock, testMode), isCourseOpen(p, key, unlock, testMode), isZoneCleared(p, zone), isRushOpen(p, zone, unlock, testMode), isBossOpen(p, unlock, testMode), nextCourse(key)
validateGalleryEntry(entry), shuffle(arr, rng), pick(arr, rng), lcg(seed)
```

Item shapes from `genCourse` (what each course scene receives):

| Course | Item |
|---|---|
| A1 | `{ kind:'roll', model, pose, answer: boolean }` |
| A2 | `{ kind:'stack', tower: 0|1, isLast, tray: [3 model ids] }` — grade with `canPlace(piece, currentTopModel, isLast)`; each tower starts on a `cuboid` base |
| A3 | `{ kind:'bag', family, clues: [{fact,value}], choices: FAMILIES }` |
| A4 | `{ kind:'object', object, answer: family }` |
| B1 | 3 × `{ kind:'line', line, answer:'straight'|'curved' }`, then `{ kind:'dots-connect' }`, `{ kind:'dots-howmany', answer:'one' }` |
| B2 | `{ kind:'tile', tile, rot (deg, multiple of 30), answer: 3..6|'circle' }` |
| B3 | 4 × `{ kind:'peg', target: 3..6, prompt: 'make'|'any' }` |
| B4 | 2 × `{ kind:'puzzle', puzzle, pieces: [piece ids] }` |
| boss | 3 × `{ kind:'job', panel: 3..6, head: {fact,value}, panels: [4 template ids] }` |

Course keys and attempt mode keys: course `'A1'` → mode `'shapesA1'`; `'boss'` → `'shapesBoss'`; Rush zone `'a'` → `'shapes3d'`, `'b'` → `'shapes2d'`.

### `shapes/theme.js`, `shapes/sfx.js`, `shapes/engine/voice.js` (T3)

```
theme.js: FONT, COLORS = { ink:'#1f2937', paper:'#fffbeb', good:'#22c55e', bad:'#ef4444', gold:'#facc15' },
          SCENE = { sky:0xbfe3f5, floor:0xf3e3c8, bench:0xd9a066, metal:0x94a3b8, dark:0x334155 },
          TOY_COLORS (8 bright colours, number), toyColor(rng = Math.random) -> number
sfx.js:   sfx.unlock(), sfx.muted (get/set, localStorage 'robot.muted'),
          sfx.tick(i) pop() ding() bonk() clunk() boing() spring() whoosh() roll(ms) star(i) fanfare() zap() crash() munch()
voice.js: voice.available (bool, set after voices load), voice.say(zh) -> Promise (resolves on end, or after 4 s, or at once when muted/unavailable), voice.stop()
          uses speechSynthesis with a 'zh-HK' voice (fallback: any 'yue' / 'zh-HK' match; else silent); muted when sfx.muted
```

### Engine (T3)

```
shapes/engine/tween.js
  motion = { less: false }                       // bridge keeps it equal to settings.lessMotion
  ease = { linear, outCubic, inOutCubic, outBack, outBounce }
  tween(target, to, { ms = 300, ease = 'outCubic', delay = 0 }) -> Promise   // numeric props on target (e.g. mesh.position, mesh.scale, material)
  wait(ms) -> Promise
  tickTweens(dtSec) -> boolean (any running)    // called by Stage each frame
  cancelTweens(target?)                          // all when no target; pending promises resolve
  // motion.less: ms × 0.5, outBack/outBounce → outCubic

shapes/engine/stage.js
  class Stage
    static supported() -> boolean                // WebGL available
    constructor(container)                       // WebGLRenderer({antialias:true}), DPR = min(devicePixelRatio, 2),
                                                 // PerspectiveCamera(40, aspect, 0.1, 100), Scene(background SCENE.sky),
                                                 // HemisphereLight + DirectionalLight (no shadow maps), ResizeObserver on container
    renderer, scene, camera, width, height (CSS px)
    setView(pos [x,y,z], look [x,y,z], ms = 0) -> Promise
    onUpdate(fn(dtSec)) -> off()
    awake(token, on)                             // continuous rendering while any token is on (physics, idle anims)
    invalidate()                                 // render once on the next frame
    step(ms = 16.7)                              // advance one frame by hand (tests, hidden pane)
    toScreen(object3DOrVector3) -> { x, y }      // CSS px inside the container
    dispose()
  disposeTree(object3D)                          // geometries, materials, textures
  blobShadow(radius = 0.5) -> Mesh               // soft round shadow decal at y = 0.002

shapes/engine/input.js
  class Input
    constructor(stage)
    enabled = true
    onTap(targets: Object3D[] | () => Object3D[], fn(target, point)) -> off   // target = the registered ancestor that was hit
    drag(obj, { plane = 'floor', lift = 0.2, onStart?(obj), onMove?(obj, point), onEnd?(obj, point) }) -> off
                                                 // 'floor' = plane y = 0; or a THREE.Plane; onEnd may return a Promise
    spin(obj, { speed = 0.01 }) -> off           // one-finger drag turns obj about its y (and x) axis
    clear()
  tap = pointer down + up within 10 px and 400 ms

shapes/engine/scenes.js
  class Scene
    constructor(ctx)                             // ctx = { stage, input, ui, bridge, go }
    root = new THREE.Group()
    async enter(data) {}  update(dtSec) {}  async exit() {}
  class SceneManager
    constructor(ctx)
    register(key, SceneClass)
    async go(key, data)                          // ignores calls while switching; old scene: exit(), input.clear(), ui.clear(),
                                                 // cancelTweens(), remove + disposeTree(root); new scene: add root, enter(data)
    key (current)

shapes/engine/physics.js
  async createPhysics(stage) -> Physics          // imports 'cannon-es' on first use
  class Physics
    addGround({ y = 0 })
    addSolid(mesh, shape, { mass = 1 }) -> body  // shape = physicsShapeOf(modelId) from T5, passed in by the caller
    addBox(mesh, { size: [x,y,z], mass = 0 }) -> body
    remove(body)  start()  stop()                // fixed 1/60 step, syncs mesh transforms, stage.awake('physics')
    settle(maxMs = 2500) -> Promise              // all bodies asleep, or timeout
    dispose()
```

### DOM overlay `shapes/ui/overlay.js` (T4)

```
ui.mount(el)                                     // el = #ui (absolute over the canvas; pointer-events only on controls)
ui.prompt(zh, en = '', { speak = true })         // top bar with 🔈 replay button
ui.hidePrompt()
ui.choices([{ id, zh, en?, icon? }], { columns? }) -> Promise<id>   // big buttons at the bottom; resolves on tap; stay until clearChoices()
ui.mark(id, good)                                // flash a choice green / red
ui.clearChoices()
ui.dots(results)                                 // progress dots: array of 'good'|'bad'|'now'|null, one per item
ui.toast(zh, en = '', ms = 1500)
ui.endPanel({ title, stars, newBest, partZh? }) -> Promise<'next'|'map'|'retry'>
ui.card({ zh, en?, icon?, buttons: [{ id, zh, en? }] }) -> Promise<id>   // modal card (job card, locked info, well done)
ui.back(onBack)                                  // ⬅ button top-left
ui.clear()                                       // removes everything except the corner buttons
```

### Bridge `shapes/main.js` (T4)

```
bridge.player, bridge.settings (shapesUnlock, shapesTimeLimit, shapesGallery, lessMotion, ...)
bridge.testMode (getter: session.testMode && !previewLocks), bridge.previewLocks (dev flag)
bridge.progress                                  // { stars, parts, robot }
bridge.rng()                                     // Math.random, or lcg(seed) with ?seed=
bridge.complete(key, stars, { mistakes, durationSec, confusions }) -> Promise<{ newBest, part }>
                                                 // logAttempt({game:'shapes', mode, kind:'level', stars, mistakes, durationSec, confusions});
                                                 // recordResult; save unless test mode; sitting.courses++
bridge.saveRobot(robot) -> Promise               // progress.robot = robot; save; republish gallery entry when gallery on
bridge.rushStart(zone, onTimeUp)  bridge.rushHit(correct, base) -> points  bridge.rushState() -> {score,combo,isFever,timeLeft}
bridge.rushEnd(zone) -> Promise                  // saveScore(ZONES[zone].rush), rank popup, then leaderboard pop-up; close → Workshop
bridge.rushAbort()
bridge.showLeaderboard(zone)                     // pop-up over the blurred game, tabs shapes3d / shapes2d
bridge.sitting = { courses: 0, wellDoneShown: false }
bridge.gallery = { enabled (getter: settings.shapesGallery !== false), isTeacher, load() -> Promise<entries>, publish() -> Promise, setHidden(uid, hidden) -> Promise }
                                                 // entry = { uid, playerName, robot, creations, hidden }
bridge.creations                                 // this player's saved creations (≤ 6), kept in progress.creations
bridge.saveCreation(c) -> Promise                // add (drop oldest when > 6), save, publish
```

`shapes-progress.js` (T4): `loadProgress(uid)`, `saveProgress(uid, progress)` (Firestore `shapesProgress/{uid}` + localStorage `shapesProgress:<uid>`), `loadGallery({ teacher })` (students: `where('hidden','==',false)`, limit 60), `saveGalleryEntry(uid, entry)` (keeps the existing `hidden` value), `setGalleryHidden(uid, hidden)`.

Progress document: `{ stars, parts, robot, creations, name, email, updatedAt }` (`emptyProgress()` includes `creations: []`; `mergeProgress` keeps them). `creations` items follow `validateGalleryEntry` (peg: flat `pts`; tiles: `placed`).

### Models (T5, T6)

```
shapes/models/solids.js (T5)
  makeSolid(modelId, { color = toyColor(), face = true, pose = 'upright' }) -> Group   // fits a 1×1×1 box, origin = box centre
      userData = { modelId, family }; pose 'side' lays cylinder / cone on the curved side
  physicsShapeOf(modelId) -> { type:'box', half:[x,y,z] } | { type:'sphere', r } | { type:'cylinder', rTop, rBottom, h } | { type:'convex', vertices, faces }
  setMood(group, 'normal'|'happy'|'oops'|'dizzy')   blink(group) -> Promise
shapes/models/tiles.js (T5)
  makeTile(templateId, { color, size = 1, thickness = 0.12 }) -> Mesh        // flat plastic tile lying in the XZ plane, top at y = thickness
  makePiece(pieceId, { color, cell = 1, r = 0 }) -> Mesh                     // B4 piece; origin at the top-left of its footprint
  makeOutline(puzzle, { cell = 1 }) -> Group                                 // dark silhouette + faint grid
  makeWire(lineId) -> Group                                                  // B1 straight / curved things from LINES
  makeLaser(a, b) -> Mesh   makeCurve(a, b, bend) -> Mesh                    // dots tasks
  makePegboard({ spacing = 1 }) -> Group  (userData.pegs[x][y] -> Mesh, PEG_GRID × PEG_GRID)
  makeBand() -> Mesh  (userData.set(points3D, closed))
shapes/models/objects.js (T6)
  makeObject(objectId) -> Group   // fits 1×1×1, origin = centre, userData = { objectId, family }; primitives + canvas textures, no photos
shapes/models/robot.js (T6)
  PART_INFO[partId] = { zh, slot }                                           // every id in PARTS plus BASIC_PART values
  makeRobot(robotConfig) -> Group                                            // userData: setPart(slot, partId), walkTo(x, z) -> Promise,
                                                                             // dance() -> Promise, wave() -> Promise, hop() -> Promise
  makeBuildRobot({ wheels, body, head, panel }) -> Group                     // boss robot from solids + a tile window
                                                                             // userData.drive(fail) -> Promise: scripted run for each checkBuild fail code
```

### Course base `shapes/scenes/CourseScene.js` (T7)

```
class CourseScene extends Scene
  async enter({ key })        // items = genCourse(key, bridge.rng); mistakes = 0; confusions = []; t0 = now
                              // await setup(); for each item: ui.dots(...); await playItem(item, i); then await finish()
  async setup() {}            // subclass builds its set
  async playItem(item, i) {}  // subclass; resolves when the item is answered right; calls this.wrong(...) for each wrong answer
  async wrong(item, picked, itemLabel)   // mistakes++; confusions.push({ item: itemLabel, picked }) (≤ 5 kept); sfx.bonk;
                                         // 2nd wrong on the same item → await this.hint(item)
  async hint(item) {}         // subclass demo of the property
  async right(item)           // sfx.ding, small confetti, dot turns green
  async finish()              // stars = starsFor(mistakes); r = await bridge.complete(key, stars, {...}); new part flies to a mini robot;
                              // choice = await ui.endPanel(...); next → go('Workshop', { justDone, goTo }); retry → go(key, {key}); map → go('Workshop', { justDone })
  confetti(x?, y?)            // 3-D confetti burst (skipped when motion.less)
```

`justDone = { key, stars, newBest, part }`. `goTo` = `nextCourse(key)` if open, else `'rush-a'`/`'rush-b'` when the zone was just cleared, else `null`.

### Scene keys and files

| Key | File | Start data | Owner |
|---|---|---|---|
| `Boot` | `shapes/scenes/BootScene.js` | none | T4 |
| `Workshop` | `shapes/scenes/WorkshopScene.js` | `{ justDone?, goTo? }` | T8 |
| `A1`…`A4` | `shapes/scenes/courses/A1Roll.js`, `A2Stack.js`, `A3Bag.js`, `A4Everyday.js` | `{ key }` | T9, T10 |
| `B1`…`B4` | `shapes/scenes/courses/B1Lines.js`, `B2Muncher.js`, `B3Pegboard.js`, `B4Silhouette.js` | `{ key }` | T11, T12 |
| `Boss` | `shapes/scenes/BossScene.js` | none | T13 |
| `Rush` | `shapes/scenes/RushScene.js` | `{ zone }` | T13 |
| `Garage` | `shapes/scenes/GarageScene.js` | none | T14 |
| `FreeBuild` | `shapes/scenes/FreeBuildScene.js` | `{ mode: 'peg'|'tiles' }` | T14 |
| `Gallery` | `shapes/scenes/GalleryScene.js` | none | T14 |
| `Sandbox` | `shapes/scenes/SandboxScene.js` | none (dev only) | T5 |

`shapes/scenes/index.js` (T4) imports every file above and exports `SCENES = { key: Class }`. T4 creates **stub files** for every scene (a `Scene` subclass that shows `ui.prompt('製作中', 'Coming soon')` and a back button to `Workshop`), so later tasks only replace their own file.

---

### Task 1: `shapes-logic.js` + tests — DONE

Committed with this plan: `shapes-logic.js`, `tests/shapes-logic.test.mjs` (29 tests). Do not change signatures without updating this plan. If a later task needs another rule, add a pure function there with a test.

- [x] Write tests, implement, `npm test` green, commit.

---

### Task 2: Platform integration (shared panel, labels, hub, rules, bump)

**Files:**
- Modify: `shared.js`, `labels.js`, `tests/labels.test.mjs`, `index.html`, `bump.sh`, `firestore.rules`, `README.md`

- [ ] **Step 1: labels test first.** Add to `tests/labels.test.mjs`:

```js
test('Robot Workshop labels', () => {
  assert.equal(GAME_LABEL.shapes, '🤖 Robot Workshop');
  for (const m of ['shapesA1', 'shapesB4', 'shapesBoss', 'shapes3d', 'shapes2d']) assert.equal(gameOf(m), 'shapes', m);
  assert.equal(gameOf('shapesC1'), 'unknown');
  assert.equal(modeLabel('shapesA1'), 'Robot Workshop A1 會滾嗎？');
  assert.equal(modeLabel('shapesB3'), 'Robot Workshop B3 釘板');
  assert.equal(modeLabel('shapesBoss'), 'Robot Workshop 測試跑道');
  assert.equal(modeLabel('shapes3d'), 'Robot Workshop Rush 立體');
  assert.equal(modeLabel('shapes2d'), 'Robot Workshop Rush 平面');
});
```
(Use the file's existing imports of `GAME_LABEL`, `gameOf`, `modeLabel`.) Run `npm test` → this test fails.

- [ ] **Step 2: `labels.js`.** Add `shapes: '🤖 Robot Workshop'` to `GAME_LABEL` and:

```js
const SHAPES = {
  shapesA1: 'A1 會滾嗎？', shapesA2: 'A2 疊高塔', shapesA3: 'A3 摸摸袋', shapesA4: 'A4 生活中的立體',
  shapesB1: 'B1 直線曲線', shapesB2: 'B2 吃板機', shapesB3: 'B3 釘板', shapesB4: 'B4 拼砌',
  shapesBoss: '測試跑道', shapes3d: 'Rush 立體', shapes2d: 'Rush 平面',
};
```
In `gameOf`: `if (SHAPES[mode]) return 'shapes';`. In `modeLabel`: `if (SHAPES[mode]) return 'Robot Workshop ' + SHAPES[mode];`. `npm test` → green.

- [ ] **Step 3: `shared.js` settings.** Next to `BONDS_KEYS`:

```js
export const SHAPES_KEYS = ['a', 'b'];
const defaultShapesUnlock = () => Object.fromEntries(SHAPES_KEYS.map(k => [k, false]));
```
Add `shapesUnlock: defaultShapesUnlock(), shapesTimeLimit: 60, shapesGallery: true` to `DEFAULT_SETTINGS` and `shapesUnlock: defaultShapesUnlock()` to the `settings` initialiser. In `loadSettings`: `settings.shapesUnlock = { ...defaultShapesUnlock(), ...(d.shapesUnlock || {}) };`. In `timeLimitOf`: return `settings.shapesTimeLimit` when `g === 'shapes'`.

- [ ] **Step 4: teacher modal row.** In `TEACHER_MODAL_HTML`, after the Rod Town block:

```html
      <div class="bg-emerald-50 p-4 rounded-xl mb-4 border-2 border-emerald-200">
        <div class="font-bold text-gray-700 mb-2">Robot Workshop 形狀機械人工場</div>
        <div class="grid grid-cols-2 gap-2">
          <label class="flex items-center gap-2 font-bold text-gray-700 cursor-pointer"><input type="checkbox" id="settingShapesA" class="w-6 h-6 accent-emerald-500 rounded"> A 立體 3-D</label>
          <label class="flex items-center gap-2 font-bold text-gray-700 cursor-pointer"><input type="checkbox" id="settingShapesB" class="w-6 h-6 accent-emerald-500 rounded"> B 平面 2-D</label>
        </div>
        <label class="flex items-center gap-2 font-bold text-gray-700 mt-3">Rush time (s)<input type="number" id="settingShapesTime" min="10" max="300" class="border-2 border-gray-300 p-1 rounded-lg w-20 text-center font-bold outline-none"></label>
        <label class="flex items-center gap-2 font-bold text-gray-700 mt-2 cursor-pointer"><input type="checkbox" id="settingShapesGallery" class="w-6 h-6 accent-emerald-500 rounded"> Class gallery 班級展覽廳</label>
      </div>
```
On PIN ok: `$('settingShapesA').checked = !!settings.shapesUnlock.a; $('settingShapesB').checked = !!settings.shapesUnlock.b; $('settingShapesTime').value = settings.shapesTimeLimit; $('settingShapesGallery').checked = settings.shapesGallery !== false;`. In the save `patch`: `shapesUnlock: { a: $('settingShapesA').checked, b: $('settingShapesB').checked }, shapesTimeLimit: parseInt($('settingShapesTime').value) || 60, shapesGallery: $('settingShapesGallery').checked,`.

- [ ] **Step 5: `logAttempt` confusions.** After the `ATTEMPT_NUMBERS` loop:

```js
    if (Array.isArray(fields.confusions) && fields.confusions.length) {
      row.confusions = fields.confusions.slice(0, 5).map(c => ({ item: String(c.item).slice(0, 30), picked: String(c.picked).slice(0, 30) }));
    }
```
Update the JSDoc `fields` line to mention `confusions?: [{item, picked}]`.

- [ ] **Step 6: hub card** in `index.html`, after the Rod Town card:

```html
            <a href="shapes.html" class="bubbly-btn bg-white text-emerald-600 font-bold text-2xl md:text-3xl py-5 rounded-2xl border-4 border-emerald-300 w-full text-center block">🤖 Robot Workshop<br><span class="text-sm font-normal text-gray-500">形狀機械人工場 · 立體・平面</span></a>
```

- [ ] **Step 7: `bump.sh`** FILES: add `shapes.html shapes-logic.js shapes-progress.js $(find shapes -name '*.js' 2>/dev/null)`.

- [ ] **Step 8: `firestore.rules`.**
  - Header comment: collections list adds `shapesProgress, robotGallery`.
  - `validAttempt`: game list `['market', 'numbers', 'bonds', 'shapes']`; add `&& (!('confusions' in d) || (d.confusions is list && d.confusions.size() <= 5))`.
  - New blocks (with plain-language comments in the file's style):

```
    match /shapesProgress/{uid} {
      allow read: if isSignedIn() && (request.auth.uid == uid || isTeacher());
      allow write: if isSignedIn() && request.auth.uid == uid;
    }

    match /robotGallery/{uid} {
      allow read: if isSignedIn() && (resource.data.hidden == false || request.auth.uid == uid || isTeacher());
      allow create: if isSignedIn() && request.auth.uid == uid
        && validGallery(request.resource.data) && request.resource.data.hidden == false;
      allow update: if isSignedIn() && (
          (request.auth.uid == uid && validGallery(request.resource.data)
            && request.resource.data.hidden == resource.data.hidden)
        || (isTeacher() && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['hidden'])
            && request.resource.data.hidden is bool));
      allow delete: if isTeacher();
    }

    function validGallery(d) {
      return d.keys().hasOnly(['playerName', 'robot', 'creations', 'hidden', 'updatedAt'])
        && d.playerName is string && d.playerName.size() <= 100
        && d.robot is map && d.robot.size() <= 10
        && d.creations is list && d.creations.size() <= 6
        && d.hidden is bool;
    }
```
  The teacher email stays `TEACHER_EMAIL@example.com`.

- [ ] **Step 9: README.** Add `shapes.html` to the game list (🤖 Robot Workshop 形狀機械人工場, 1S1/1S2, three.js 0.186.1 + cannon-es from jsDelivr, code in `shapes/`, rules in `shapes-logic.js`, progress `shapesProgress/{uid}`, gallery `robotGallery/{uid}`), the teacher row (Zone A/B, Rush time, Class gallery), and `shapes.html?dev` (+ `&scene=`, `&seed=`, LAN dev for iPads).

- [ ] **Step 10: verify and commit.** `npm test` green. Serve the worktree on port 8102; open `index.html`: 4 cards, no console errors. Open the ⚙️ panel, enter PIN `1128`: the Robot Workshop row shows (do **not** press Save — that writes live settings). `git grep -n "@" -- firestore.rules | grep -v example.com` prints nothing. Commit `feat(shapes): settings, teacher row, labels, hub card, rules`.

---

### Task 3: Engine, theme, sound, voice

**Files:**
- Create: `shapes/theme.js`, `shapes/sfx.js`, `shapes/engine/tween.js`, `shapes/engine/stage.js`, `shapes/engine/input.js`, `shapes/engine/scenes.js`, `shapes/engine/physics.js`, `shapes/engine/voice.js`, `shapes/dev/engine-check.html`

Implement exactly the contracts above. Notes:

- [ ] **Step 1: `theme.js`.** `TOY_COLORS = [0xef4444, 0xf97316, 0xfacc15, 0x22c55e, 0x06b6d4, 0x3b82f6, 0xa855f7, 0xec4899]`; `toyColor(rng)` picks one. FONT as Rod Town's (`'"Chalkboard SE","Comic Sans MS","PingFang TC","Microsoft JhengHei",sans-serif'`).
- [ ] **Step 2: `sfx.js`.** Same tiny-synth approach as `bonds/sfx.js` (copy its `tone`/`noise` helpers; do not import it). Character: `clunk` low square thud, `boing` rising sine, `spring` wobbling sine, `munch` 3 quick noise bursts, `crash` noise + falling tone, `roll(ms)` low filtered noise for ms, `zap` fast falling square.
- [ ] **Step 3: `tween.js`** with a plain array of active tweens; `tween()` reads start values on first tick (so chained tweens start where the last ended); `cancelTweens()` resolves pending promises so awaiting code never hangs.
- [ ] **Step 4: `stage.js`.** One rAF loop for the page. Each frame: skip if `document.hidden`; dt = min(elapsed, 0.05); `tickTweens(dt)`; run `onUpdate` fns; render when a tween ran, any `awake` token is on, or `invalidate()` was called. `step(ms)` runs the same body once with dt = ms/1000 (works while hidden). `toScreen` projects with the camera into CSS px. `blobShadow` = CircleGeometry with a radial-gradient canvas texture, `depthWrite:false`, transparent.
- [ ] **Step 5: `input.js`** with pointer events on the canvas (`touch-action: none` is set by T4's CSS); Raycaster against registered targets (recursive) and return the registered ancestor. While dragging, the object follows the pointer on the plane, lifted by `lift`.
- [ ] **Step 6: `scenes.js`** as in the contract; also call `scene.update(dt)` through `stage.onUpdate`.
- [ ] **Step 7: `physics.js`.** `CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) })`, `allowSleep = true`, default contact material friction 0.4, restitution 0.1. `addSolid(mesh, shape)` builds the body from the shape spec it is given (`box` → `Box(half)`, `sphere` → `Sphere(r)`, `cylinder` → `Cylinder(rTop, rBottom, h, 16)`, `convex` → `ConvexPolyhedron({ vertices: v.map(p => new CANNON.Vec3(...p)), faces })`). physics.js imports nothing from `shapes/models/`. Cylinder axis in cannon-es 0.20 is Y, matching three.js. Cone = Cylinder with rTop 0.01.
- [ ] **Step 8: `voice.js`.** Pick the first voice with `lang` `zh-HK` (or containing `yue`); listen to `voiceschanged`. `say` cancels any current speech, rate 0.9.
- [ ] **Step 9: `shapes/dev/engine-check.html`** — a standalone dev page (with the same import map as T4's shell) that creates a Stage, spins a box with `tween`, taps it (`onTap` → colour change), drags a sphere on the floor, plays each sfx from buttons, says 「你好，我係波波」, and drops 3 boxes with physics onto the ground. This page is how T3 is verified before the shell exists; it uses `addBox` and `addSolid(mesh, { type:'sphere', r:0.5 })`.
- [ ] **Step 10: verify.** Serve on 8103, open `shapes/dev/engine-check.html`: box spins, tap changes colour, drag works with the mouse, sounds play, boxes fall and settle, no console errors; `stage.step()` advances the spin when called from the console. Commit `feat(shapes): three.js engine, tween, input, scenes, physics, voice, sfx`.

---

### Task 4: Page shell, overlay, bridge, progress store, scene stubs

**Files:**
- Create: `shapes.html`, `shapes/main.js`, `shapes/ui/overlay.js`, `shapes-progress.js`, `shapes/scenes/index.js`, `shapes/scenes/BootScene.js`, and stub files for every other scene in the table above
- Test: `tests/shapes-progress.test.mjs` is **not** needed (Firestore code); `shapes-logic.js` covers the rules.

- [ ] **Step 1: `shapes.html`.** Copy the structure of `bonds.html` and adapt:
  - `<title>Robot Workshop 形狀機械人工場</title>`, emerald login screen (`🤖 Robot Workshop 形狀機械人工場`, spinner, login button, back link).
  - Import map **before** any module script:

```html
    <script type="importmap">{ "imports": {
      "three": "https://cdn.jsdelivr.net/npm/three@0.186.1/build/three.module.min.js",
      "cannon-es": "https://cdn.jsdelivr.net/npm/cannon-es@0.20.0/dist/cannon-es.js" } }</script>
```
  - `#gameScreen` with `#feverOverlayText`, the `#hud` block copied from `bonds.html` (ids `timerDisplay`, `scoreDisplay`, `comboDisplay`), `#stage` (flex-1, relative, `touch-action:none`), `#ui` (absolute inset-0, `pointer-events:none`; children set `pointer-events:auto`), `#cornerBtns` (test badge, `#muteBtn`, `#adminBtn`).
  - `#rankPopup` as in `bonds.html`.
  - Leaderboard pop-up copied from `bonds.html` (blurred backdrop `#leaderboardScreen`, `#lbCard`, `#lbClose`, `#lbBack` "返回工場 Back to workshop") with tabs `tab-shapes3d` "立體 3-D" and `tab-shapes2d` "平面 2-D".
  - `#noWebgl` hidden panel: 「這部機未能顯示立體圖形」 / "This device can't show 3-D shapes." + link to `index.html`.
  - `<script type="module" src="shapes/main.js?v=0"></script>`.
- [ ] **Step 2: `shapes/ui/overlay.js`** per contract. Tailwind classes, FONT. Prompt bar: white rounded card at top-centre, big Chinese line, small English line, 🔈 button (calls `voice.say`). Choices: up to 5 buttons, min 64 px tall, icon + 中文 + small English. End panel: stars ⭐ pop in one by one (sfx.star(i)), "新紀錄 New best!" when `newBest`, "新零件 New part: <partZh>" when given, buttons 下一關 Next / 再玩 Retry / 工場 Map. `card()` = centred modal with buttons. All DOM built with `textContent` (no innerHTML with data).
- [ ] **Step 3: `shapes-progress.js`** per contract, modelled on `bonds-progress.js`. `loadGallery({ teacher })`: teacher → `getDocs(collection(db,'robotGallery'))`; student → `query(collection(db,'robotGallery'), where('hidden','==',false), limit(60))`; map docs to `{ uid: d.id, ...d.data() }`; on error return `[]`. `saveGalleryEntry(uid, entry)`: read own doc; `hidden = existing?.hidden ?? false`; `setDoc` with `{ ...entry, hidden, updatedAt: serverTimestamp() }`; skip when `!validateGalleryEntry({ ...entry, hidden })`.
- [ ] **Step 4: `shapes/main.js`.** Model on `bonds/main.js`:
  - imports from `../shared.js?v=0` (signIn, onUser, player, settings, session, enterTestMode, initAudio, engine, resetEngine, registerHit, endFever, startTimer, stopTimer, saveScore, renderLeaderboard, showRankPopup, mountTeacherModal, sharedSound, logAttempt, isTeacherEmail).
  - `sharedSound.on = false` (game uses its own sfx). Mute button toggles `sfx.muted`.
  - `motion.less` kept equal to `settings.lessMotion` (define a getter/setter like Rod Town does for `fx.lessMotion`, or set it after `loadSettings` and after the teacher modal saves). Also honour `prefers-reduced-motion`.
  - Bridge per contract. `complete()` mode key: `key === 'boss' ? 'shapesBoss' : 'shapes' + key`. `setHud(on)` toggles `#hud` and moves `#cornerBtns` like Rod Town, then calls the stage resize.
  - Boot: if `!Stage.supported()` show `#noWebgl` and stop. Else create `Stage(#stage)`, `Input`, `ui.mount(#ui)`, `SceneManager` with ctx `{ stage, input, ui, bridge, go }`, register `SCENES`, `go('Boot')`.
  - Dev mode (localhost, 127.0.0.1, 192.168.*, 10.*, 172.16–31.*) with `?dev`: player "Dev", `enterTestMode()`, progress from `loadProgress(null)`; `&scene=X` → after Boot go to X with `{ key: X }` (courses) or `{ zone: 'a' }` (Rush) or `{}`; `&seed=N` → `bridge.rng = lcg(N)`.
  - `window.__robot = { stage, scenes, bridge, go }`.
  - Leaderboard close → `go('Workshop')` unless already there (same pattern as Rod Town's `closeLeaderboard`).
- [ ] **Step 5: `shapes/scenes/index.js` and stubs.** `index.js` imports all scene files and exports `SCENES`. Each stub (WorkshopScene, the 8 course files, Boss, Rush, Garage, FreeBuild, Gallery, Sandbox):

```js
import { Scene } from '../engine/scenes.js?v=0';   // '../../engine/scenes.js?v=0' inside courses/
export class A1Roll extends Scene {                  // class name = file name
  async enter() {
    this.ctx.ui.prompt('製作中', 'Coming soon');
    this.ctx.ui.back(() => this.ctx.go('Workshop'));
  }
}
```
  The Workshop stub instead lists every scene key as `ui.choices` buttons and goes to the picked one (temporary navigation until T8).
- [ ] **Step 6: `BootScene.js`.** Shows a robot-head loading spinner (DOM), waits for `document.fonts.ready` (max 1 s), then `go('Workshop')` (or the `?scene=` target).
- [ ] **Step 7: verify.** Serve on 8104. `shapes.html?dev`: no login, test badge visible, Workshop stub lists scenes, each opens its stub and ⬅ returns. ⚙️ opens the teacher modal. 🔇 toggles. `bridge.showLeaderboard('a')` opens the blurred pop-up with two tabs (shows "Offline Score" when not signed in — fine). Force no WebGL (`HTMLCanvasElement.prototype.getContext = () => null` before load via a `?nowebgl` dev flag) → friendly message. Phone size (375×812): no horizontal scroll. Commit `feat(shapes): page shell, overlay, bridge, progress store, scene stubs`.

---

### Task 5: Solids, tiles, Sandbox

**Files:**
- Create: `shapes/models/solids.js`, `shapes/models/faces.js`, `shapes/models/tiles.js`
- Modify: `shapes/scenes/SandboxScene.js` (replace stub)

- [ ] **Step 1: `solids.js`.** Geometries (all fit 1×1×1, origin centre, smooth toy look with `MeshStandardMaterial({ roughness: 0.45, metalness: 0 })`): cube 0.9; cuboid 1×0.6×0.6; triPrism (3-sided `CylinderGeometry(r, r, h, 3)`); hexPrism (`CylinderGeometry(.., 6)`); cylinder (32 segments); sqPyramid (`ConeGeometry(r, h, 4)`, rotated so a face points to the camera); triPyramid (`ConeGeometry(r, h, 3)`); cone (`ConeGeometry(r, h, 32)`); sphere (`SphereGeometry(0.5, 32, 16)`). Slightly rounded look via `flatShading:false` on curved shapes and `flatShading:true` on flat-faced ones (edges read clearly). Each solid gets a `blobShadow`.
  - `pose:'side'` for cylinder/cone: rotate 90° about z so the curved side touches y = −0.5 (cone: lies on its side touching along a line; tilt so it rests naturally).
  - `physicsShapeOf` matches the geometry (prisms and pyramids as `convex` from the geometry's unique vertices; cube/cuboid as `box`).
- [ ] **Step 2: `faces.js`** — `addFace(group, family)` puts a face on a small plane (CanvasTexture, transparent) on the front: two eyes + mouth; personality per family (Bobo big round eyes, Rolly sleepy, Dizzy spiral eyes for `'dizzy'`, Blocky square-ish eyes, Peak proud smile). `setMood`/`blink` redraw the canvas. Faces never use colour to code the family.
- [ ] **Step 3: `tiles.js`** per contract. `makeTile`: `THREE.Shape` from template points (scaled by `size/2`; circle via `absarc`), `ExtrudeGeometry({ depth: thickness, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.02 })`, rotated to lie flat. `makePiece` builds from `PIECES[id].cells` quarter-triangles at the given rotation (use `footprint()` to get keys, then a union shape of the quarter triangles; circle piece = cylinder disc). `makeOutline` draws `puzzle.cells` as dark inset quarter-triangles + a faint grid. `makeWire`: straight things as long thin boxes/cylinders (ruler with tick marks, chopstick, pencil, stick); curved things as `TubeGeometry` along a curve (rainbow arc, snake S-curve with eyes, hose loop, wave). `makePegboard`: wooden board + `PEG_GRID²` pegs. `makeBand`: rubber band as a `TubeGeometry` rebuilt in `set()`.
- [ ] **Step 4: `SandboxScene.js`** (dev): rows of every solid (upright and side), every tile template, every B4 piece at r = 0..3, every wire, a pegboard with a sample band, a puzzle outline; buttons to cycle moods and to `blink`. Camera orbit with `input.spin` on a root group.
- [ ] **Step 5: verify.** Serve on 8105, `shapes.html?dev&scene=Sandbox`. Check every model renders, faces show, pieces line up exactly on the outline grid (place the `house` solution in Sandbox and confirm no gaps), no console errors, 60 fps on desktop (`stage.renderer.info.render.calls` < 150). Screenshot to `docs/superpowers/plans/robot-workshop-shots/T5-sandbox.png` (create folder). Commit `feat(shapes): solids with faces, tiles, pieces, pegboard, sandbox`.

---

### Task 6: Everyday objects and robots

**Files:**
- Create: `shapes/models/objects.js`, `shapes/models/robot.js`, `shapes/dev/models-check.html`

- [ ] **Step 1: `objects.js`** — the 12 `OBJECTS`, each recognisable from primitives + canvas textures, each clearly its family's shape: can (cylinder, label stripe + ring top), drum (short cylinder, drum skin, two sticks lying beside it), ball (sphere, panel pattern), globe (sphere on a small stand drawn separately below its box; the sphere is the object), party hat (cone, stripes, pom-pom), traffic cone (cone, white bands, square base plate), dice (cube with dots), tissue box (cuboid, tissue poking out), tent (triangular prism, door flap), pencil box (cuboid, pencil drawing), pyramid paperweight (square pyramid, glassy), tea bag (triangular pyramid, string + tag). No brands or real logos.
- [ ] **Step 2: `robot.js`.** `makeRobot(config)`: body (rounded box), head per `config.head`, arms, wheels, antenna, paint colour (`paint-blue` default, `paint-rainbow` = gradient texture), badge. `PART_INFO` covers `BASIC_PART` values and every `PARTS` id. Animations: `walkTo(x, z)` turns towards the target and bobs while moving (speed 2 units/s), `dance()` 1.5 s, `wave()`, `hop()`.
  - `makeBuildRobot(build)`: uses `makeSolid` (T5) for wheels (×2, lying on the side when the model can), body and head, plus `makeTile(build.panel)` as a window on the body. `drive(fail)` scripted, each < 2.5 s, ends with the robot upright waving (except `null` = drives off to the right, success):
    - `'wheels-flat'` clunk-clunk hop and flip on its back, then pops back up
    - `'wheels-sphere'` slides sideways off the track edge, wobble, comes back
    - `'wheels-cone'` drives in a circle twice, dizzy face
    - `'body-top'` head slides off the pointy body, lands beside it
    - `'head-rolls'` sphere head rolls off and away
    - `'head-wrong'` drives, stops at a sign showing the needed head, scratches head
    - `'panel'` the window pops out of a hole that doesn't fit
- [ ] **Step 3: `shapes/dev/models-check.html`** — standalone page (import map + Stage from T3) showing all objects in a grid, a robot cycling through all parts, and buttons for every `drive(fail)`.
- [ ] **Step 4: verify.** Serve on 8106. All objects recognisable at phone size, every drive animation plays and ends cleanly, no console errors. Screenshot to `docs/superpowers/plans/robot-workshop-shots/T6-models.png`. Commit `feat(shapes): everyday objects, robot, boss build robot`.

---

### Task 7: CourseScene base

**Files:**
- Create: `shapes/scenes/CourseScene.js`, `shapes/fx3d.js`

- [ ] **Step 1: `fx3d.js`** — `confetti(stage, at = center, n = 40)` (small coloured planes with gravity, auto-dispose, skipped when `motion.less`), `sparkle(stage, object3D)`, `puff(stage, position)` (dust ring).
- [ ] **Step 2: `CourseScene.js`** per contract. Details:
  - Title on enter: `ui.toast(course.zh, course.en)`, and a floor/room set common to all courses (the course builds the rest in `setup`).
  - `wrong()` keeps `tries` per item index; on the 2nd wrong of the same item calls `hint(item)`; mistakes still count after the hint.
  - `finish()` runs the stars/part flow, increments nothing itself (bridge counts sittings), then routes per the contract. `durationSec = Math.round((now - t0) / 1000)`.
  - `ui.back()` during a course → `ui.card` 「離開這關？」 Leave? (離開 / 繼續) → leave goes to Workshop without saving.
  - Exposes `this.items`, `this.index`, `this.mistakes`, `this.confusions` for dev checks.
- [ ] **Step 3: temporary check.** In a scratch copy of `A1Roll.js` (do not commit it), subclass `CourseScene` with a `playItem` that shows `ui.choices` 對/錯 and treats 對 as right: run 5 items with 2 wrongs on one item → hint called once, end panel shows 2★, `bridge.complete` called with `mistakes: 2` (test mode: no save). Revert the scratch file. Commit `feat(shapes): course base scene and 3-D effects`.

---

### Task 8: Workshop map

**Files:**
- Modify: `shapes/scenes/WorkshopScene.js` (replace stub)

- [ ] **Step 1: set.** A bright workshop floor (rounded platform), back wall with windows, low-poly props (toolboxes, gears, a conveyor). Stations as round pads with signs (CanvasTexture, Chinese + English): Zone A pads A1–A4 + Rush 3-D on the left under a sign 「立體車房 Solid Garage」; Zone B pads B1–B4 + Rush 2-D on the right 「平面工作枱 Panel Bench」; Boss 「測試跑道 Test Track」 at the back with a striped track; Garage 「我的機械人」, Free Build 「自由創作」, Gallery 「展覽廳」 at the front (Gallery pad hidden when `bridge.gallery.enabled` is false). Shape friends sit around idle (blink, little bounce; off with less motion).
- [ ] **Step 2: state.** Pad states from `shapes-logic` (`isCourseOpen`, `isRushOpen`, `isBossOpen`, zone ticks): locked pads grey with 🔒 sprite; open pads glow softly; cleared pads show their medal sprite (🥇 3★ 🥈 2★ 🥉 1★). Tapping a locked pad → `ui.card` with the reason: 「老師未開放」 Teacher hasn't opened this yet / 「先完成上一關」 Finish the previous course first / 「完成全部關卡才可開始」 Clear every course first.
- [ ] **Step 3: robot.** `makeRobot(bridge.progress.robot)` stands at the last pad visited (remember in `sessionStorage` `robot.lastPad`). Tap an open pad → robot `walkTo` it along the floor (straight line, ≤ 1.5 s), hop, then `go(target)`. Camera eases to keep the robot in view.
- [ ] **Step 4: `justDone` / `goTo`.** On enter with `justDone`: pad medal pops (sfx.star), new part toast 「新零件！」 when `part`. With `goTo`: after the medal, the robot walks to that pad and the scene starts it (the Rod Town "Next" pattern). Well-done: when `bridge.sitting.courses >= 3 && !bridge.sitting.wellDoneShown`, show `ui.card` 「今日做得好！」 with the robot dancing, buttons 繼續 Continue / 休息 Done (Done → `index.html`).
- [ ] **Step 5: HUD.** 🏆 button (top-left, DOM) → `bridge.showLeaderboard('a')` while the map keeps running behind the blur. Robot name shown under the robot (`robotName`), or 「幫我改名」 Name me → Garage when unnamed.
- [ ] **Step 6: verify.** Serve on 8108. `?dev`: all pads open. Set `__robot.bridge.previewLocks = true` and `go('Workshop')`: pads locked as a student with no progress. Fake progress in console (`bridge.progress.stars = { A1: 3, A2: 1 }`, re-enter) → medals 🥇🥉, A3 open, A4 locked. `go('Workshop', { justDone: { key:'A1', stars:3, newBest:true, part:'wheels-star' }, goTo:'A2' })` → medal, toast, walk, A2 starts. Phone and iPad sizes readable. Screenshot `T8-workshop.png`. Commit `feat(shapes): workshop map with stations, medals, walking robot`.

---

### Task 9: A1 會滾嗎？ and A2 疊高塔

**Files:**
- Modify: `shapes/scenes/courses/A1Roll.js`, `shapes/scenes/courses/A2Stack.js` (replace stubs; both `extends CourseScene`)

- [ ] **A1 Roll or not.** Set: a ramp (wooden slope) with a soft landing mat. Per item: the solid (`makeSolid(item.model, { pose: item.pose })`) slides in to the top of the ramp; `ui.prompt('它會滾下去嗎？', 'Will it roll?')`; `ui.choices([{id:'yes', zh:'會滾', icon:'🛞'}, {id:'no', zh:'不會滾', icon:'🧱'}])`. Wrong → `wrong(item, picked, FAMILY[family].zh + (pose === 'side' ? '(側放)' : ''))`, a quick shake of the solid, ask again. Right → play the **scripted** motion by `rollStyle(model, pose)`: `'any'` sphere rolls down and wobbles off the mat; `'straight'` cylinder rolls straight down; `'circle'` cone rolls down curving in an arc; `null` slides down slowly with a scrape sound (`sfx.roll`). Face mood happy/dizzy. Hint (2nd wrong): the friend says the reason (voice + toast): 「我有彎彎的面，所以會滾」 / 「我的面都是平的，所以不會滾」 / 「我平放時不會滾，側放時就會滾」 (cylinder/cone upright).
- [ ] **A2 Stack tower.** Uses physics (`createPhysics`; bodies via `physics.addSolid(mesh, physicsShapeOf(modelId))`). Set: a table with two tower spots, each starting with a `cuboid` base; target height marker (flag) above each spot. Per item: a tray of 3 solids (`item.tray`, upright) on the table edge; prompt 「哪一個可以疊上去？」 Which can go on top? (last piece: 「最後一個，放在最頂！」). Child drags a solid onto the tower (or taps it). Grade with `canPlace(piece, topModel, item.isLast)`. Right → place the solid on top (tween into position, then a short physics settle with the tower bodies static except the new piece). Wrong → the piece is dropped on the tower as a dynamic body and topples off (funny: bounce, `sfx.crash`), then returns to the tray; `wrong()` with label `FAMILY[...]zh`. A sphere on a flat top always rolls off; a piece on a pointy top slides off. Tower 1 complete after item 2 → flag waves; tower 2 after item 5. Hint: highlight the flat top of the tower and say 「頂部要平平的，才可以疊上去」.
- [ ] **Verify.** Serve on 8109. `?dev&scene=A1&seed=3` and `&scene=A2&seed=3`: play through with 0 mistakes → 3★; with 2 wrong on one item → hint once, 2★. Physics settles (no jitter) and towers never fall when the answer was right. `motion.less = true` → shorter motions, no confetti. No console errors; draw calls < 150. Screenshots `T9-A1.png`, `T9-A2.png`. Commit `feat(shapes): A1 roll or not, A2 stack tower`.

---

### Task 10: A3 摸摸袋 and A4 生活中的立體

**Files:**
- Modify: `shapes/scenes/courses/A3Bag.js`, `shapes/scenes/courses/A4Everyday.js`

- [ ] **A3 Mystery bag.** Set: a cloth bag (lathe geometry, drawstring) on a table, 5 friend solids in a row behind (one of each family, faces on, labelled with `FAMILY[f].zh` signs). Per item: the bag wiggles; first clue appears as a speech bubble from the bag (DOM card near `stage.toScreen(bag)` or `ui.prompt`) with an icon (🛞 rolls, 🔺 apex, ⬜ all flat, ⚪ circle face; ✖ overlay for false values) and is spoken. Choices = the 5 friends (tap the 3-D friend or the `ui.choices` buttons with friend names). A wrong pick → `wrong()`, that friend shakes its head and greys out, **next clue** appears (if any left). Right → the hidden solid pops out of the bag, high-fives its twin. Sparkle bonus when guessed on the first clue (cosmetic only). Hint (2nd wrong): reveal all remaining clues at once.
- [ ] **A4 Everyday solids.** Set: 5 bins labelled with the families (each bin shows its friend). Per item: the object (`makeObject(item.object)`) rides in on a small conveyor; child can `spin` it with a finger (prompt 「轉一轉，看清楚」 Spin it and look), then drags it into a bin (or taps a bin). Wrong → it bounces out of the bin, `wrong(item, picked, objectById(id).zh)`. Right → bin's friend cheers, object drops in. Hint: the matching friend jumps next to the object and both glow.
- [ ] **Verify.** Serve on 8110. Both courses complete with 3★ and with mistakes; clue icons and voice work; dragging into bins works with mouse and touch emulation. Screenshots `T10-A3.png`, `T10-A4.png`. Commit `feat(shapes): A3 mystery bag, A4 everyday solids`.

---

### Task 11: B1 直線曲線 and B2 吃板機

**Files:**
- Modify: `shapes/scenes/courses/B1Lines.js`, `shapes/scenes/courses/B2Muncher.js`

Bench scenes: camera looks down at the bench at ~55°, tiles lie flat.

- [ ] **B1 Straight or curved.** Items 1–3: a `makeWire(item.line)` appears on the bench; two baskets labelled 直線 Straight (with a ruler icon) and 曲線 Curved (with a wave icon); drag or tap. Wrong → `wrong(item, picked, line.zh)`, item wobbles back. Right → drops into the basket. Item 4 `dots-connect`: two glowing points (點) on the bench; prompt 「用直線連接兩點」 Join the dots with a straight line; tap the first dot then the second → `makeLaser` fires a straight line between them (`sfx.zap`). (Tapping anywhere else does nothing; this item has no wrong answer.) Item 5 `dots-howmany`: prompt 「有幾多條直線可以連接這兩點？」; choices `one` 1 條 / `many` 很多條. Wrong → `wrong()`, then show it: try to add a second straight line, it lands exactly on the first. After the answer, demo several `makeCurve` lines through the same dots with 「但曲線可以有很多條！」 But many curves can!
- [ ] **B2 Panel Muncher.** Set: a friendly machine with 5 mouths labelled 三角形 3 / 四邊形 4 / 五邊形 5 / 六邊形 6 / 圓形 ○ (labels show the side count as dots, not as a coloured code). Per item: `makeTile(item.tile)` rotated `item.rot` slides onto the bench; prompt 「它有幾多條邊？餵給對的嘴巴」 How many sides? Feed the right mouth. Child can tap the tile to have each side light up as it counts (1, 2, 3 … spoken), then drag it to a mouth. Wrong → mouth spits it out (`sfx.boing`), `wrong(item, picked, ANSWER_TEXT[answer].zh)`. Right → `sfx.munch`, machine burps a star. Hint: sides light up one by one with numbers automatically.
- [ ] **Verify.** Serve on 8111. Seeds 1–3 each complete; dented and turned tiles counted correctly by the side-lighting; no console errors. Screenshots `T11-B1.png`, `T11-B2.png`. Commit `feat(shapes): B1 straight or curved, B2 panel muncher`.

---

### Task 12: B3 釘板 and B4 拼砌

**Files:**
- Modify: `shapes/scenes/courses/B3Pegboard.js`, `shapes/scenes/courses/B4Silhouette.js`

- [ ] **B3 Pegboard.** Set: `makePegboard()` filling the bench; a band (`makeBand`). Per item: prompt `make` 「砌一個 {ANSWER_TEXT[target].zh}」 Make a {n}-sided shape, `any` 「砌任何一個 {…}，形狀由你決定」. Tap pegs in order: the band stretches to each peg (`sfx.spring`); tapping the first peg again closes it; buttons ↩ Undo and 🗑 Clear (DOM). On close, grade with `checkPeg(band, target)`:
  - `ok` → band glows, sides light up and are counted aloud, `right()`.
  - `wrong-sides` → `wrong(item, sides, ANSWER_TEXT[target].zh)`; say 「這個有 {sides} 條邊，要 {target} 條」; band stays so the child can Undo and fix.
  - `crossing` / `flat` → not a mistake; toast 「條橡筋打交叉了」 The band crosses itself / 「要圍出一個形狀」 Make a closed shape; clear the band.
  - Hint (2nd wrong): ghost outline of a sample shape with the target sides on the pegs.
  - After an `ok`, offer 「保存到我的作品」 Save to my creations (calls `bridge.saveCreation({ kind:'peg', pts })`) — optional, does not block.
- [ ] **B4 Silhouette.** Set: `makeOutline(puzzle)` centred on the bench; a tray with `item.pieces` (`makePiece`). Drag a piece over the outline: it snaps to the nearest grid cell; ⟳ button (DOM, near the dragged piece) turns it 90°. On release, `checkDrop(puzzle, covered, id, x, y, r)`: ok → snaps in, `sfx.pop`; not ok → piece returns to the tray, `wrong(item, PIECES[id].zh, puzzle.zh)`. Puzzle done (`isPuzzleDone`) → outline lights up, the picture animates (house light turns on, rocket blasts off, face winks, boat sails), `right()`. Hint: the next solution piece blinks at its spot with its turn. After each puzzle, offer save to creations (`{ kind:'tiles', placed }`).
- [ ] **Verify.** Serve on 8112. Pegboard: square, house-pentagon, dented pentagon, hexagon all accepted for their targets; bow-tie gives the crossing toast; a peg in the middle of a side does not count as a corner. Silhouettes: all 4 puzzles solvable by drag + turn on touch emulation; wrong drops return. Screenshots `T12-B3.png`, `T12-B4.png`. Commit `feat(shapes): B3 pegboard, B4 silhouette puzzles`.

---

### Task 13: Boss 測試跑道 and Rush

**Files:**
- Modify: `shapes/scenes/BossScene.js`, `shapes/scenes/RushScene.js`

- [ ] **Boss.** `extends CourseScene` with key `'boss'` (pass `{ key: 'boss' }` from `enter`). Set: a build bay beside a test track (start gate, bumps, finish flag). Per job: `ui.card` job card with three icon rows (wheels 🛞 「輪要會滾」, head need from `CLUE_TEXT[head.fact][head.value]` with icon, window 「{ANSWER_TEXT[panel].zh}窗」) spoken; then the build UI: four rows of choices (wheels `WHEEL_CHOICES`, body `BODY_CHOICES`, head `HEAD_CHOICES`, window `job.panels`) shown as 3-D items on shelves the child taps; the live robot (`makeBuildRobot`) updates on each pick. 「出發！」 Go button → `checkBuild(job, build)` → `drive(fail)`. Fail → `wrong(item, fail, 'job' + (i + 1))`, robot back in the bay with the faulty part glowing. Success → crosses the finish, `right()`. After 3 jobs: boss trophy, `badge-gold` part, fanfare and fireworks (less motion: just the trophy). Hint (2nd fail on a job): the right choice glows in the faulty row.
- [ ] **Rush.** `{ zone }`: `bridge.rushStart(zone, onTimeUp)` (DOM HUD, timer = `settings.shapesTimeLimit`). A conveyor brings items (`genRush3d` for `'a'`: `makeObject` / `makeSolid`; `genRush2d` for `'b'`: `makeTile`) every ~1.4 s, up to 3 on the belt; bins as in A4 (5 families) or B2 (5 mouths). Tap a bin while the front item is highlighted, or drag any item into a bin. Correct → `bridge.rushHit(true, 10)`, floating points; wrong → `bridge.rushHit(false, 10)`, item bounces off. An item reaching the belt end falls into a "later" crate (no penalty). Fever (from shared engine) speeds the belt and sparkles. Time up → 「時間到！」, `await bridge.rushEnd(zone)` (rank popup then leaderboard; closing goes to Workshop). ⬅ during play → `bridge.rushAbort()` → Workshop.
- [ ] **Verify.** Serve on 8113. Boss: each fail code reachable by a wrong pick and animates; 3 good builds → trophy; `?seed` repeatable. Rush: both zones run, HUD timer counts down, combo/fever works, time-up shows rank popup and leaderboard pop-up in test mode without saving. Screenshots `T13-boss.png`, `T13-rush.png`. Commit `feat(shapes): test track boss, rush 3-D and 2-D`.

---

### Task 14: My Robot (Garage), Free Build, Gallery

**Files:**
- Modify: `shapes/scenes/GarageScene.js`, `shapes/scenes/FreeBuildScene.js`, `shapes/scenes/GalleryScene.js`

- [ ] **Garage.** The child's `makeRobot` on a turntable (`input.spin`). Slot buttons (DOM) for each of `SLOTS`; each shows the owned parts for that slot (`BASIC_PART` + `progress.parts` filtered by `PART_INFO[id].slot`); locked parts show as silhouettes with the course that earns them (「完成 A1 得到」). Name picker: two `ui.choices`-style rows — name from `ROBOT_NAMES`, number 1–99 via − / + buttons (no keyboard). 保存 Save → `bridge.saveRobot(robot)`; robot dances.
- [ ] **Free Build.** `{ mode }`: `'peg'` = pegboard without target (band any shape; shows the side count live via `countSides`), `'tiles'` = a 10×10 quarter-grid canvas with an unlimited tray of all `PIECE_IDS` (place with `footprint`, no overlap). 保存 Save → `bridge.saveCreation(...)` (max 6, oldest dropped after a confirm card). Mode switch buttons.
- [ ] **Gallery.** If `!bridge.gallery.enabled` → card 「展覽廳暫時關閉」 and back. Else `await bridge.gallery.load()`; show robots on podiums in a scrolling row (lazy: build at most 12 robots in view at once; reuse meshes), player name sign under each (`playerName` via CanvasTexture), tap a robot → its creations shown flat on a table (peg bands and tile pictures rebuilt from data). Own entry first, marked 「我」. Teacher (`bridge.gallery.isTeacher`): each entry has 🙈 Hide / 👁 Show (DOM) → `setHidden`; hidden entries greyed for the teacher only. Empty → 「還未有作品」. Offline → 「暫時未能載入」. No likes, no counts.
- [ ] **Verify.** Serve on 8114. Garage: parts equip, name saved in test mode memory (`bridge.progress.robot`), no text input anywhere on the page (`document.querySelectorAll('input[type=text],textarea').length === 0`). Free Build saves creations into `bridge.creations` (test mode: not uploaded). Gallery with `bridge.gallery.load = async () => [/* 3 fake entries */]` renders robots and creations; teacher buttons appear with `bridge.gallery.isTeacher = true`. Screenshots `T14-garage.png`, `T14-gallery.png`. Commit `feat(shapes): garage, free build, class gallery`.

---

### Task 15: Integration QA, performance, polish, docs

**Files:** any `shapes/**` fixes found; `README.md`; `docs/superpowers/specs/2026-10-03-robot-workshop-design.md` (mark "Status: built"); `bump.sh` run.

- [ ] **Step 1: merge** all wave branches into `robot-workshop`; `npm test` green.
- [ ] **Step 2: full play-through** in `?dev` (test mode): Workshop → every course → Next chains → Rush both zones → Boss → Garage → Free Build → Gallery (fake data). Then `previewLocks = true`: locks, medals, well-done card after 3 courses.
- [ ] **Step 3: performance.** Chrome DevTools 4× CPU throttle at iPad size (810×1080): each scene ≥ 45 fps while animating, idle scenes render on demand only (check `renderer.info.render.frame` stops increasing when idle), draw calls < 150, no growing `renderer.info.memory.geometries` after visiting every scene twice (disposal works).
- [ ] **Step 4: P1 limits audit.** Grep text for forbidden words (`凹`, `凸`, `線段`, `角`(as angle), `頂點`, `棱`, `三角柱`, `四角柱`, `正方體`… as names shown to children) and fix. Confirm colours come from `toyColor` only.
- [ ] **Step 5: a11y + devices.** Phone 375×812 and iPad sizes: no overflow, buttons ≥ 48 px, prompts readable; no-WebGL message; mute silences sfx and voice; less motion.
- [ ] **Step 6: docs + stamps.** README final, `./bump.sh`, commit `chore(shapes): integration fixes, stamps, docs`, push `robot-workshop`. **Do not merge to main** — report to the owner with screenshots and the LAN URL for iPad testing (`http://<mac-ip>:8000/shapes.html?dev`).
- [ ] **Step 7: owner steps (report, don't do):** publish the updated `firestore.rules` in the Firebase console (replace the placeholder email there), tick Zone A/B in ⚙️ when ready.

---

## Self-review

- **Spec coverage:** map (T8), A1–A4 (T9, T10), B1–B4 (T11, T12), boss + funny failures (T6, T13), Rush ×2 + leaderboard pop-up (T4, T13), shape friends + faces (T5), parts/robot/names (T6, T14), free build + gallery + teacher hide/off (T14, T2, T4), healthy-play card (T8), voice (T3), unlock rules (T1, T8), teacher row (T2), data + confusions (T2, T4), rules (T2), no-WebGL + offline (T4, T14), less motion (T3, T7), testing (T1, T15), delivery with owner approval (T15).
- **Changes from the spec, made while planning** (spec updated to match): A1 motion is scripted, physics is used in A2; B4 pieces turn in 90° steps on a quarter-triangle grid; everyday pool uses a tea bag instead of a cheese wedge; the gallery rule checks `playerName` length instead of comparing with the Google token name (the app falls back to the email prefix when there is no display name, so equality would reject real players).
