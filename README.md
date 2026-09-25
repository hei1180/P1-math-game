# P1 Maths games

Three browser games for Primary 1, hosted on GitHub Pages, Google login via Firebase.

- `index.html` — hub + 🍎 Math Market (counting with ten-frames)
- `numbers.html` — 🔢 Number Shop 數字小店 (compare 比較, odd/even 奇偶, number line 數線, odd/even line 奇偶數線)
- `bonds.html` — 🚂 Rod Town 數棒鎮 (合成與分解 number bonds 2-18 with Cuisenaire rods, ten-frames, bond diagrams and equations; 4 worlds × 6 levels + a Number House boss, timed Rush per world). Phaser 3.90 from jsDelivr; code in `bonds/`, pure logic in `bonds-logic.js`, progress in `bonds-progress.js` (Firestore `bondsProgress/{uid}` + localStorage)
- `shared.js` / `shared.css` — login, fever/combo, leaderboard, teacher panel, theme
- `juice.js` — tap/answer animations
- `numbers-logic.js`, `trophy.js` — pure logic, unit tested

## Teacher

⚙️ Teacher button → PIN → set timers (Market / Number Shop), Market unlock toggles, trophy cutoffs (🥉 Bronze / 🥈 Silver / 🥇 Gold, default 300 / 700 / 1200). Number Shop levels are locked until you tick them here; unlocking the next level also needs Bronze on the previous one. **Test mode** (same panel) opens every level on your device without saving scores. Scores live in Firestore `scores/{uid}_{mode}`; settings in `settings/global`.

Rod Town rows in the same panel:
- **World toggles W1-W4** — W1 opens when ticked; each later world also needs the previous world's Number House beaten. All off by default.
- **Rod Town Rush time (s)** — length of each world's Rush (default 60). Rush for a world opens once its Number House is beaten; leaderboard tabs `bonds1`-`bonds4`.
- **Less motion** — no screen shake, camera zoom or confetti, shorter animations (applies to every device at once; the device's own reduce-motion setting is honoured too).

Children's Rod Town progress (stars, stickers, daily streak) is kept per Google account. Test mode opens everything and saves nothing.

## Develop

    python3 -m http.server 8000   # open http://localhost:8000/
    npm test                      # node --test tests/

Asset links carry `?v=<stamp>` for cache busting; bump the stamp in the HTML pages, `shared.js`, `bonds-progress.js` and `bonds/**` on each deploy (`./bump.sh` does it).

Google login does not work from file://. Use localhost or the GitHub Pages URL.

Rod Town without logging in: open `http://localhost:8000/bonds.html?dev` (localhost only). It skips login and starts in test mode as player "Dev". The console hook `window.__rodTown` has `go(scene, data)` (e.g. `__rodTown.go('Level', { w: 4, level: 1 })`, scenes `Map`, `Level`, `House`, `Rush`) and `bridge`; set `__rodTown.bridge.previewLocks = true` to see locks, fog and stickers as a student would (progress kept in memory only). `bonds.html?dev&sandbox` opens the rod/board sandbox.

Design spec and plan: `docs/superpowers/`.

## Teacher data

- `teacher.html` — teacher-only dashboard (overview, every attempt, per-student view, CSV download). Linked from the ⚙️ panel.
- Every finished game writes a readable record to Firestore `attempts` (and optionally a Google Sheet).
- Setup (security rules + Google Sheet): see `docs/teacher-data-setup.md`. Rules file: `firestore.rules`; sheet script: `apps-script/Code.gs`.
- Local preview with sample data: `http://localhost:8000/teacher.html?demo`.
