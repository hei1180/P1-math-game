# Teacher data: attempt log, dashboard, Google Sheet, security rules — Design

Date: 2026-09-25 · Status: approved in chat by owner (teacher `cyh@clam.edu.hk`)

## Problem
Firestore data is hard to read: documents are keyed by opaque uids (`uid_easy`), Rod Town progress has no names, only best scores are kept (no history), three games use different mode codes across collections, and the database is in open test mode.

## Scope
1. **Attempt log** — one readable Firestore document per finished game.
2. **Teacher dashboard** — `teacher.html`, teacher-only, tables + CSV export.
3. **Google Sheet sync** — each attempt also appended to the teacher's own Google Sheet via a Google Apps Script web app.
4. **Security rules** — `firestore.rules` for the owner to paste into the Firebase console.
Out of scope: class grouping (not requested yet), migrating old data (old best-score docs stay and still drive leaderboards/unlocks).

## Constants
- Teacher email: `cyh@clam.edu.hk` — exported from `shared.js` as `TEACHER_EMAILS = ['cyh@clam.edu.hk']`.

## Data contract

### `attempts/{autoId}` (create-only)
| Field | Type | Example |
|---|---|---|
| `uid` | string | auth uid |
| `name` | string | Google display name |
| `email` | string | `student@clam.edu.hk` |
| `game` | `'market' \| 'numbers' \| 'bonds'` | `'bonds'` |
| `mode` | string (raw key) | `'easy'`, `'num3'`, `'bonds2'`, `'w1-4'`, `'w2-boss'` |
| `modeLabel` | string (bilingual, human) | `'Rod Town W1 第4關 Level 4'` |
| `kind` | `'timed' \| 'level'` | timed = score games (Market, Number Shop, Rod Town Rush); level = Rod Town levels/bosses |
| `score` | number \| null | timed games |
| `accuracy` | number \| null | 0-100, timed games |
| `maxCombo` | number \| null | timed games |
| `stars` | number \| null | 1-3, levels |
| `mistakes` | number \| null | levels |
| `durationSec` | number \| null | timed: the timer length; levels: wall-clock seconds from level start to finish |
| `ts` | server timestamp | |
| `day` | string `YYYY-MM-DD` (device local) | for grouping without timestamp maths |

Labels (single source: pure module `labels.js` — `modeLabel(mode)`, `gameOf(mode)`, `GAME_LABEL`; already implemented and tested):
- market: easy → `Market · Easy 1-10`, medium → `Market · Medium 1-20`, hard → `Market · Hard`
- numbers: num1 `Number Shop Lv1 比較`, num2 `Lv2 奇偶`, num3 `Lv3 數線`, num4 `Lv4 奇偶數線`
- bonds: bondsN `Rod Town Rush W{N}`; `wN-L` `Rod Town W{N} 第{L}關`; `wN-boss` `Rod Town W{N} 數字屋`

Test mode never writes attempts (or sheet rows).

### Existing collections (unchanged shape, small additions)
- `scores/{uid}_{mode}` — unchanged (leaderboards, unlocks). Add `email` field when written.
- `bondsProgress/{uid}` — add `name`, `email` fields.
- `settings/global` — add `sheetUrl` (string, default ''), editable in the teacher panel ("Google Sheet link (Apps Script URL)").

## Write paths
- `shared.js`: `player.email` set in `onUser`. New `logAttempt(fields)` (exported): adds `uid, name, email, ts, day`, writes to `attempts`, and if `settings.sheetUrl` is set, `fetch(sheetUrl, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(row) })` (fire-and-forget, errors only logged). Skipped in test mode.
- `saveScore(modeKey)` calls `logAttempt({ game, mode: modeKey, kind: 'timed', score, accuracy, maxCombo, durationSec })`; game derived from the key (`easy|medium|hard` → market, `num*` → numbers, `bonds*` → bonds). `durationSec` = the relevant `settings.*TimeLimit`.
- Rod Town `bridge.complete(key, stars, { mistakes, durationSec })` calls `logAttempt({ game: 'bonds', mode: key, kind: 'level', stars, mistakes, durationSec })`. LevelScene and HouseScene pass mistakes and elapsed seconds.
- `bonds-progress.js saveProgress` writes `name`, `email` too.

## Dashboard `teacher.html`
- Same look as the other pages (Tailwind, shared.css). Google login; if the email is not in `TEACHER_EMAILS` show "此頁只限老師 / Teachers only" and nothing else.
- Loads: `attempts` in a date range (default last 30 days; `where('ts','>=',from)`, `orderBy('ts','desc')`), `bondsProgress` (all), `scores` (all).
- Tabs:
  1. **Overview** — one row per student (name, email, last played, attempts in range, total minutes), then columns per game: Market best easy/medium/hard, Number Shop best Lv1-4, Rod Town: medals per world (count of 🥇🥈🥉 and levels cleared x/7), Rush best W1-4. Sortable columns, name search.
  2. **Attempts** — every attempt row newest first: date/time, name, game, level (modeLabel), score/stars, accuracy, mistakes, duration. Filters: game, student, date range.
  3. **Student** — click a name anywhere → that student's attempts over time + Rod Town map summary (stars per level).
- **Download CSV** on Overview and Attempts (UTF-8 with BOM so Excel shows Chinese; filename `p1maths-<tab>-YYYYMMDD.csv`).
- Link to it: small "📊 Teacher dashboard" link inside the teacher modal (after PIN).

## Google Sheet sync
- `apps-script/Code.gs`: `doPost(e)` parses JSON, appends a row to sheet "Attempts" (creates header row on first use: Date, Time, Name, Email, Game, Level, Score, Stars, Accuracy, Mistakes, Max combo, Duration (s), Kind, Mode key, UID). Returns `ContentService` text "ok". A `setup()` helper creates the sheet/headers.
- `docs/teacher-data-setup.md`: step-by-step for the owner (Traditional Chinese + English): create Sheet → Extensions → Apps Script → paste Code.gs → Deploy → Web app (Execute as: Me; Who has access: Anyone) → copy URL → paste into the teacher panel → Save. Plus the Firestore rules steps.
- Known limit: the web-app URL is public; anyone who knows it can append rows. Acceptable for a class sheet; the dashboard (Firestore) remains the source of truth.

## Security rules `firestore.rules`
```
isTeacher: request.auth != null && request.auth.token.email in ['cyh@clam.edu.hk'] && request.auth.token.email_verified
settings/{doc}: read if signed in; write if isTeacher
scores/{id}: read if signed in; create/update if signed in && request.resource.data.uid == request.auth.uid && id.matches(request.auth.uid + '_.*'); delete if isTeacher
bondsProgress/{uid}: read if signed in && (request.auth.uid == uid || isTeacher); write if request.auth.uid == uid
attempts/{id}: create if signed in && request.resource.data.uid == request.auth.uid; read if isTeacher; update/delete if isTeacher
everything else: deny
```
Consequence: the ⚙️ teacher panel can only **save** settings when logged in as the teacher account (the PIN still gates the UI; test mode still works for anyone because it saves nothing). The owner applies the rules by pasting into Firebase console → Firestore → Rules → Publish.

## Testing
- `node --test`: `modeLabel` and `gameOf(mode)` are pure — put them in a new pure module `labels.js` (imported by shared.js and teacher.html) with tests.
- Browser: dev checks with a mocked `logAttempt` capture (`window.__attempts`) in test builds are not possible without login; verify by code review + a manual script: log in as teacher on localhost, play one game in each, see attempts appear in the dashboard; CSV opens in Excel/Sheets with Chinese intact.
