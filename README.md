# P1 Maths games

Five browser games for Primary 1, hosted on GitHub Pages, Google login via Firebase.

- `index.html` — hub + 🍎 Math Market (counting with ten-frames)
- `numbers.html` — 🔢 Number Shop 數字小店 (compare 比較, odd/even 奇偶, number line 數線, odd/even line 奇偶數線)
- `bonds.html` — 🚂 Rod Town 數棒鎮 (合成與分解 number bonds 2-18 with Cuisenaire rods, ten-frames, bond diagrams and equations; 4 worlds × 6 levels + a Number House boss, timed Rush per world). Phaser 3.90 from jsDelivr; code in `bonds/`, pure logic in `bonds-logic.js`, progress in `bonds-progress.js` (Firestore `bondsProgress/{uid}` + localStorage)
- `shapes.html` — 🤖 Robot Workshop 形狀機械人工場 (1S1 立體圖形 and 1S2 平面圖形; a toy-factory game with sorting, stacking, pin-board and building scenes, a test-track boss and timed Rush). three.js 0.186.1 + cannon-es 0.20.0 from jsDelivr; code in `shapes/`, rules and grading in `shapes-logic.js`, progress in `shapes-progress.js` (Firestore `shapesProgress/{uid}`), class gallery in Firestore `robotGallery/{uid}`
- `position.html` — 🗝️ Treasure Dungeon 尋寶地下城 (1S3 位置 上下左右前後之間; a side-view pixel-art dungeon: 4 floors of rooms for 左右, 前後, 上下 and mixed, monster waves, a dragon boss and timed Rush). A mirror 製作英雄 (boy/girl, skin, hair, outfit shape and colour, weapon, name), a 裝備室 shop selling helmets, pets, looks, outfits and weapons, and a 展覽廳 class gallery of everyone's hero. Phaser 3.90 from jsDelivr; code in `dungeon/`, rules and grading in `dungeon-logic.js`, progress in `dungeon-progress.js` (Firestore `dungeonProgress/{uid}` + localStorage; gallery in `dungeonGallery/{uid}`). Art: [Kenney.nl](https://kenney.nl) Tiny Dungeon and Roguelike Characters (CC0), plus code-drawn sprites
- `shared.js` / `shared.css` — login, fever/combo, leaderboard, teacher panel, theme
- `juice.js` — tap/answer animations
- `numbers-logic.js`, `trophy.js` — pure logic, unit tested

## Teacher

⚙️ Teacher button → PIN → set timers (Market / Number Shop), Market unlock toggles, trophy cutoffs (🥉 Bronze / 🥈 Silver / 🥇 Gold, default 300 / 700 / 1200). Number Shop levels are locked until you tick them here; unlocking the next level also needs Bronze on the previous one. **Test mode** (same panel) opens every level on your device without saving scores. Scores live in Firestore `scores/{uid}_{mode}`; settings in `settings/global`.

Rod Town rows in the same panel:
- **World toggles W1-W4** — W1 opens when ticked; each later world also needs the previous world's Number House beaten. All off by default.
- **Rod Town Rush time (s)** — length of each world's Rush (default 60). Rush for a world opens once its Number House is beaten; leaderboard tabs `bonds1`-`bonds4`.
- **Less motion** — no screen shake, camera zoom or confetti, shorter animations (applies to every device at once; the device's own reduce-motion setting is honoured too).

Robot Workshop rows in the same panel:
- **Zone A 立體 3-D / Zone B 平面 2-D** — tick to open each zone for the class. Both off by default.
- **Robot Workshop Rush time (s)** — length of the Rush (default 60).
- **Class gallery 班級展覽廳** — on by default; untick to hide the shared gallery of robots.

Treasure Dungeon rows in the same panel:
- **Floor 1 左右 / Floor 2 前後 / Floor 3 上下 / Floor 4 綜合** — Floor 1 opens when ticked; a later floor also needs it ticked and ≥1★ on every room of the floor before. Rooms inside a floor open in order. All off by default.
- **Treasure Dungeon Rush time (s)** — length of the Rush 寶藏快手 (default 60). Rush opens once Floor 4 is cleared; leaderboard tab `dungeon`.
- **Class gallery 班級展覽廳** — on by default. When on, each child's hero (and the name they show on the leaderboard) appears in the map's 展覽廳, and the teacher can 🙈 hide / 👁 show any entry. Off hides the gallery.

**Treasure Dungeon teacher notes.** Left and right start from the child's own body, which the game cannot check. Before Floor 1, run the textbook's 「老師話」 activity (p72): children sit side by side, point to the eraser on their left or right, raise the left or right hand. Before Floor 2, run the 數學探索 line-up (p73): three children in a row say who is in front and who is behind, then turn round. The game takes over from there with pictures and words. The teacher dashboard's Treasure Dungeon tab shows stars per room and each child's top mix-ups (左↔右, 前↔後, 上↔下).

Children's Rod Town progress (stars, stickers, daily streak) is kept per Google account. Test mode opens everything and saves nothing.

## Develop

    python3 -m http.server 8000   # open http://localhost:8000/
    npm test                      # node --test tests/

Asset links carry `?v=<stamp>` for cache busting; bump the stamp in the HTML pages, `shared.js`, `bonds-progress.js`, `bonds/**`, `shapes-logic.js`, `shapes-progress.js`, `shapes/**`, `dungeon-logic.js`, `dungeon-progress.js` and `dungeon/**` on each deploy (`./bump.sh` does it).

Google login does not work from file://. Use localhost or the GitHub Pages URL.

Rod Town without logging in: open `http://localhost:8000/bonds.html?dev` (localhost only). It skips login and starts in test mode as player "Dev". The console hook `window.__rodTown` has `go(scene, data)` (e.g. `__rodTown.go('Level', { w: 4, level: 1 })`, scenes `Map`, `Level`, `House`, `Rush`) and `bridge`; set `__rodTown.bridge.previewLocks = true` to see locks, fog and stickers as a student would (progress kept in memory only). `bonds.html?dev&sandbox` opens the rod/board sandbox.

Robot Workshop without logging in: open `http://localhost:8000/shapes.html?dev` (also works on private LAN addresses 192.168.x / 10.x / 172.16-31.x, so you can try it on an iPad). It skips login and starts in test mode as player "Dev". Add `&scene=A1` to start a scene directly and `&seed=7` for repeatable rounds.

Treasure Dungeon without logging in: open `http://localhost:8000/position.html?dev` (localhost and private LAN addresses, as above). It skips login and starts in test mode as player "Dev" (everything open, nothing saved). Add `&scene=F2R3` to jump to a room (or `Map`, `Shop`, `MakeHero`, `Gallery`, `Rush`, `Sandbox`), `&seed=7` for repeatable rounds and `&level=1` to force a support level. The console hook is `window.__dungeon` (`game`, `bridge`, `go(key, data)`).

Design spec and plan: `docs/superpowers/`.

## Teacher data

- `teacher.html` — teacher-only dashboard (overview, every attempt, per-student view, CSV download). Linked from the ⚙️ panel.
- Every finished game writes a readable record to Firestore `attempts` (and optionally a Google Sheet).
- Setup (security rules + Google Sheet): see `docs/teacher-data-setup.md`. Rules file: `firestore.rules`; sheet script: `apps-script/Code.gs`.
- Local preview with sample data: `http://localhost:8000/teacher.html?demo`.
