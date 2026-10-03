# Robot Workshop — as-built notes (waves 1–2)

Read with the plan (`2026-10-03-robot-workshop.md`). Where this file and the plan differ, **this file wins** (it describes the merged code). Always read the actual source of anything you call.

## Engine (`shapes/engine/`)

- **Scenes:** `SceneManager.go()` may be called from inside a scene's `enter()` (courses run their whole loop inside `enter()` and end with `go('Workshop', …)`). A `go()` during a swap is queued (latest wins).
- **Leaving a scene:** the manager sets `scene.alive = false`, then `exit()`, `input.clear()`, `ui.clear()`, `cancelTweens()` (**resolves** pending tween promises), removes and disposes `root`. Wrap every await in a scene with `await this.live(promise)` so a left scene never continues. `ui.choices()` promises of a cleared overlay never resolve.
- **Render on demand:** `tween()` wakes rendering. After any other change call `this.stage.invalidate()`; for continuous animation hold `this.stage.awake('<token>', true)` and release it in `exit()`. `wait(ms)` does not force rendering.
- **Input:** `onTap(targets, fn)` resolves to the registered ancestor. `drag(obj, { plane, lift, onStart, onMove, onEnd(obj, point, { cancelled }) })` — ignore drops with `cancelled: true`. An object registered for both drag and onTap gets `onEnd` then `onTap` on a press without movement. Invisible objects are not hit (use `material.visible = false` for invisible hit proxies).
- **Physics:** `createPhysics(stage)` does not auto-start; call `physics.start()`. Upright solids only (`physicsShapeOf(id)` = upright frame). Default damping 0.2/0.5. `settle(maxMs)` resolves when asleep or timed out. Origin = bounding-box centre (pyramids/cones are a bit tippy).
- **Disposal:** `disposeTree` skips anything with `userData.shared === true` (cached geometries/materials/textures). Never mark per-instance assets shared.
- **sfx:** `sfx.tick/pop/ding/bonk/clunk/boing/spring/whoosh/roll(ms)/star(i)/fanfare/zap/crash/munch`. **voice:** `voice.say(zh)`.

## Overlay (`shapes/ui/overlay.js`)

- `ui.choices(opts)` called again with the same opts reuses the buttons (good for "try again" loops); different opts rebuild. `ui.mark(id, good)` is a ~0.7 s flash. `ui.clear()` also stops speech.
- `ui.dots(results)`: CourseScene uses `'now'` and `'good'` only (no red dots by design).

## Bridge (`shapes/main.js`)

- `bridge.complete()` in test mode returns `part: null` unless `bridge.previewLocks = true`.
- `bridge.gallery.isTeacher` is true in dev. `bridge.gallery.setHidden` never writes in dev/test.
- Dev: `?dev&scene=<Key>` (`&zone=b` for Rush), `&seed=N`. `window.__robot = { stage, scenes, bridge, go }`.
- `#stage` and `#ui` are siblings inside `#stageWrap`.

## CourseScene (`shapes/scenes/CourseScene.js`) — read its "Subclass contract" header

- Set `static courseKey = 'A1'` (etc.) on each course class; `BossScene` sets `static courseKey = 'boss'`.
- Implement `async setup()`, `async playItem(item, i)` (return when answered right), optional `async hint(item)`. **`await this.wrong(item, picked, label)`** on each wrong answer. Don't call `right()`/`finish()` yourself. Meshes go on `this.root`. Overriding `exit()` → call `super.exit()`.
- `this.confetti(x, y, z, n)`, `this.index`, `this.items`. Base camera: `setView([0,5,8], [0,0.5,0])` (subclasses may set their own).

## Models (`shapes/models/`)

- **`makeSolid(id, { color, face, pose, shadow = true })`** → Group; `userData = { modelId, family, pose, restY, height, top, axis, body, shadow }`. Origin = bounding-box centre in the chosen pose; `restY` = height of origin above the floor (place at `y = restY`). `axis` = unit Vector3 along the rolling/symmetry axis. `side` pose only for cylinder/cone (dev warns otherwise).
- **Tiles** lie in the XZ plane (template y → world +z), top at `y = thickness`. `makeTile` userData: `{ templateId, size, thickness, points ([x,z] in mesh space, null for circle), radius (circle), top }`. Turning: `mesh.rotation.y = -rot·π/180` is clockwise seen from above.
- **`makePiece(id, { color, cell, r })`**: rotation baked into geometry (rebuild to turn); origin = top-left of its footprint, matching `footprint(id, x, y, r)` → place at `(x·cell, 0, y·cell)`. `userData.cols/rows`.
- **`makeOutline(puzzle, { cell })`**: cell (x, y) at `(x·cell, 0, y·cell)`, same frame as pieces.
- **`makeWire(lineId, { color = toyColor() })`**: stands in the XY plane facing +z (rotate x by −π/2 to lay flat). Colours random (never by straight/curved).
- **`makePegboard({ spacing })`**: upright in XY facing +z, peg `[0][0]` top-left; `userData.pegs[x][y]`; tap targets = `userData.hits` (invisible proxies; `proxy.userData.peg = [x, y]`). Add the band (`makeBand()`, `userData.set(points3D, closed)`) to the pegboard group.
- **`makeLaser(a, b)`, `makeCurve(a, b, bend)`** (curve bends in XZ).
- **`makeObject(id)`** → Group fits 1×1×1, origin centre, `userData { objectId, family }`; shared materials (clone before tinting); no shadow (scene adds `blobShadow`).
- **`makeRobot(config, { on })`** → `userData.setPart(slot, id)` (then `stage.invalidate()`), `walkTo(x, z)`, `dance()`, `wave()`, `hop()`; no shadow. `PART_INFO[id] = { zh, slot }` (`none` has slot null: list a slot's options as `BASIC_PART[slot]` + earned parts with that slot).
- **`makeBuildRobot(build, { rng })`** → faces +z, drives +x; `userData.drive(fail, { sign, on })` emits events (`go`, `clunk`, `oops`, `land`, `wave`, `finish`) for sounds; `userData.reset()` restores parts and position. `drive(null)` leaves it ~9 units right. No shadow.
- **fx3d:** `confetti(stage, at, n, parent)`, `sparkle(stage, objOrVec, parent)`, `puff(stage, vec, parent)` — pass `this.root` as parent.
- `SCENE.wall` added in `shapes/theme.js`.
