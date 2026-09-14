# P1 Maths games

Two browser games for Primary 1, hosted on GitHub Pages, Google login via Firebase.

- `index.html` — hub + 🍎 Math Market (counting with ten-frames)
- `numbers.html` — 🔢 Number Shop 數字小店 (compare 比較, odd/even 奇偶, number line 數線, odd/even line)
- `shared.js` / `shared.css` — login, fever/combo, leaderboard, teacher panel, theme
- `juice.js` — tap/answer animations
- `numbers-logic.js`, `trophy.js` — pure logic, unit tested

## Teacher

⚙️ Teacher button → PIN → set timers (Market / Number Shop), Market unlock toggles, trophy cutoffs (🥉 Bronze / 🥈 Silver / 🥇 Gold, default 300 / 700 / 1200). Unlocking the next level needs Bronze on the previous one. Scores live in Firestore `scores/{uid}_{mode}`; settings in `settings/global`.

## Develop

    python3 -m http.server 8000   # open http://localhost:8000/
    npm test                      # node --test tests/

Google login does not work from file://. Use localhost or the GitHub Pages URL.

Design spec and plan: `docs/superpowers/`.
