# Treasure Dungeon 尋寶地下城 — Design Spec

Date: 2026-10-10 · Status: design approved (incl. §4b customization, §4c art), not built (branch `treasure-dungeon`)

## Goal

A 2-D side-view dungeon adventure for P1 that teaches **1S3 方向和位置（一）**: describing relative position with 上、下、左、右、前、後、之間 (see `docs/curriculum/p1-maths.md` and textbook unit 11 「物件的相對位置」). A small knight walks through friendly dungeon rooms; a voiced clue says where the key, the door or the treasure is, and the child walks there, places it, or judges it.

Each floor (chapter) takes **about 10 minutes**. Design follows Bloom's taxonomy (room order inside a floor), scaffolding with fading (supports removed room by room, kept when a child struggles) and positive reinforcement (immediate, fixed, never taken away).

## Platform fit

- New page `position.html`, a new card in the hub (`index.html`): "🗝️ Treasure Dungeon 尋寶地下城 · 上下左右前後".
- Phaser 3.90 from jsDelivr, same as Rod Town. Code in `dungeon/`, pure logic in `dungeon-logic.js`, progress in `dungeon-progress.js`.
- Reuses `shared.js`: Google login, `settings`, teacher modal (PIN), test mode, `saveScore`, leaderboard pop-up over the blurred game, rank popup, trophies, combo/fever, `logAttempt`, `sharedSound`, account box.
- Bilingual, Chinese first. Prompts **read aloud** (speechSynthesis `zh-HK`, 🔈 replay, silent fallback), as in Robot Workshop.
- Friendly 16 px pixel-art dungeon (see §4c): warm torchlight, cute slimes and bats. Nothing scary and no dying; monsters are only bopped with a foam sword and pop into sparkles.
- Another game (Picnic Park 野餐樂園) is being built in parallel in the main checkout. Shared files (`index.html`, `shared.js`, `labels.js`, `teacher*.{html,js}`, `firestore.rules`, `bump.sh`) will need a careful merge; keep edits there small and additive.

## Curriculum scope and position rules

| In | Out (never shown) |
|---|---|
| 上/下, 左/右, 前/後, 之間 between two objects | 東南西北 four directions (later units), maps, grids with coordinates |
| 「___在___的上面／下面／左面／右面／前面／後面」, 「___在___和___之間」, 「___在左面／右面」 | complex multi-step relative-position problems (boundary: keep it simple) |
| 左右 from the **child's own** view (screen left/right) | left/right from a character's own view |
| 前後 by the **facing direction** of a creature in a line | 前後 meaning nearer/further from the viewer (no depth) |

Rules the logic enforces:
- **Side view only.** No isometric or top-down views.
- **左右** compares only objects in the same row (same shelf or floor line).
- **上下** compares only objects in the same column (one directly above the other). No diagonals.
- **前後** compares only creatures in the same queue, all facing the same way. A queue can turn round; then front and back swap (textbook p73).
- **之間** means strictly between the two named objects along that row, column or queue.
- Absolute 「在左面／右面」 is used only when the scene has a clear left and right half (two objects, or a two-column shelf as on textbook p77).
- Every clue is checked by the logic to have exactly its declared answer set. A clue never relies on guessing.
- Vocabulary: 位置、上、下、左、右、前、後、之間.

## §1 World

### Map 地圖

The dungeon is drawn as a side-view cut-through: 4 floors stacked downward, linked by stairs. Each floor has 5 room doors. The hero walks to the room the child taps. Cleared rooms show stars; a cleared floor shows its medal (🥇 all 3★, 🥈 average ≥ 2★, 🥉 finished). The Rush door is at the bottom.

### Characters

- **Hero**: a small knight the child makes and dresses (see §4b).
- **蝠蝠 Fu-fu** the bat: guide. Speaks every clue and gives hints. Hangs from the ceiling (handy for 上下).
- **Slimes 史萊姆** in four colours, with clear eyes and a pointed hop, so their facing is easy to see. Used for queues (前後).
- **Owl 貓頭鷹**: says sentences in ✓/✗ rooms. Sometimes wrong on purpose.
- **Dragon 小龍**: the floor-4 boss. Sleepy and grumpy, not dangerous; falls asleep when the riddles are solved.

### Free steering

Every room fits one screen. The child taps anywhere on a floor line or ladder and the hero walks there (paths over ladders found automatically). Tapping an object makes it wiggle and says its name (vocabulary support). In "go to" tasks, a big 🔍 **在這裡！** button appears when the hero stops; it checks the slot the hero stands on. Walking is free, but nothing outside the task gives rewards, so wandering stays short.

### Interaction types

| Type | Child does | Bloom |
|---|---|---|
| **choose** | taps one of 2 big signs (左/右, 前/後, 上/下) | Remember / Understand |
| **go** | walks the hero to the place the clue says, taps 在這裡！ | Apply |
| **place** | drags an item into a slot the clue says | Apply |
| **judge** | owl says a sentence about the room; taps ✓ or ✗ | Analyse / Evaluate |
| **select-all** | taps every object that fits (「答案可多於一個」), then 完成 | Analyse |
| **make** | arranges own items or creatures freely, then picks the one true sentence about it out of 3 | Create |
| **solve** | places several items to satisfy 2–3 clues together (textbook p77) | Analyse / Create |

For **go**, any slot in the answer set is right. For **select-all**, the chosen set must equal the answer set; picking a wrong one or missing one counts as one mistake and the bat shows which are right.

## §2 Floors and rooms

A room has 4–5 clues, about 2 minutes. A floor has 5 rooms, about 10 minutes; floors 1 and 3 add a 6th **wave room** (§5), about 12 minutes. Room 1 of floors 2–4 starts with 2 review clues from earlier floors (spaced, interleaved practice).

### Floor 1 — 左和右 (with 之間 in a row)

| Room | Name | Clues |
|---|---|---|
| R1 | 火把走廊 Torch hall | 4 × choose: two objects on the wall, 「🔥在左面還是右面？」. Starts with a short demo: the big 左 tag on the screen's left edge lights up, 「這邊是左面」, then 右. No hand or body steps in the game (see Teacher notes). |
| R2 | 寶箱排排 Chest row | 4 × go: a row of 4–5 chests with picture marks; 「鑰匙在🍄寶箱的右面」 |
| R3 | 兵器架 Weapon rack | 4 × place: 「把盾放在劍和弓之間」, 「把頭盔放在斧的左面」 |
| R4 | 貓頭鷹問你 Owl's check | 3 × judge + 2 × select-all (「哪些寶箱在火把的左面？」) |
| R5 | 我的寶庫 My vault | 2 × make (put 3 treasures on 5 hooks, pick the true sentence) + 2 × go with 之間 |
| R6 | 怪物來了！ Monster waves | wave room, 左右 only (§5) |

### Floor 2 — 前和後 (with 之間 in a queue)

| Room | Name | Clues |
|---|---|---|
| R1 | 史萊姆列隊 Slime line | 2 review + 3 × choose: two slimes facing the same way; 「藍史萊姆在紅史萊姆的前面還是後面？」 |
| R2 | 排隊入門 Queue at the gate | 4 × go: the hero joins the queue, 「站在綠史萊姆的後面」 |
| R3 | 轉身！ Turn round | 4 × place in a queue; mid-room the whole queue turns round (animated) and the next clues use the new facing |
| R4 | 貓頭鷹問你 | 3 × judge + 2 × select-all, queues facing left and right |
| R5 | 我的巡遊 My parade | 2 × make (drag 3 slimes into a line, pick the true sentence) + 2 × go with 之間 |

### Floor 3 — 上和下 (with 之間 in a column)

| Room | Name | Clues |
|---|---|---|
| R1 | 倒掛蝠蝠 Upside-down bat | 2 review + 3 × choose: bat on the ceiling, chest on the floor; 「蝠蝠在上面還是下面？」 |
| R2 | 爬梯子 Ladders | 4 × go: climbing ladders, 「鑰匙在木箱的上面」 |
| R3 | 藥水架 Potion shelf | 4 × place on a 3-level shelf: 「把藥水放在書和頭盔之間」 |
| R4 | 貓頭鷹問你 | 3 × judge + 2 × select-all |
| R5 | 我的高塔 My tower | 2 × make (stack 3 crates, pick the true sentence) + 2 × go with 之間 |
| R6 | 蝙蝠和地鼠 Bats and moles | wave room, 上下 only (§5) |

### Floor 4 — Mixed

| Room | Name | Clues |
|---|---|---|
| R1 | 熱身 Warm-up | 5 quick mixed choose/go from floors 1–3 |
| R2 | 玩具架解難 Shelf puzzle | 2 × solve: a 2×2 (then 2×3) shelf with one item placed; 2 clues such as 「🏠在右面」「🚗在🏠的上面」 (textbook p77) |
| R3 | 迷路走廊 Maze corridor | a chain of 4 go clues; each right answer opens the next door, so the clues lead the hero through a small maze |
| R4 | 巴士站 Bus stop | 3 × judge + 2 × select-all mixing 前後 and 之間 (textbook p78) |
| R5 | 龍的寶庫 Dragon vault (boss) | 3 riddles, each 2 clues together: 「寶石在盾的上面，也在劍的右面」. Each solved riddle makes the dragon yawn; after the third it falls asleep and the chest opens. Mistakes never end the boss |

## §3 Scaffolding

### Support levels

| Level | What the child sees |
|---|---|
| **S3 full** | big 左/右 tags on the room walls (as in the textbook), the reference object glows, facing arrows under slimes, at most 2–3 possible slots |
| **S2** | small tags, no glow, arrows only as footprints, 3–4 slots |
| **S1** | no tags, no arrows (eyes show facing), 5+ slots |

Default level by room: R1 S3, R2 S3, R3 S2, R4 S2, R5 S1, R6 S1. Floor 4: R1 S2, others S1.

**Adaptive rule:** if a child made 3 or more mistakes in the previous room, the next room uses the previous room's level when that is more support than its default. Support never drops below S1 and is never added in the middle of a clue (hints do that).

### Hint ladder (per clue)

1. First wrong try: the hero bonks gently (funny, not sad), the clue replays.
2. Second wrong try: the reference object glows and an arrow points to the right side (or the queue's facing flashes).
3. Third wrong try: Fu-fu shows the answer (worked example: the hero walks there, the sentence is read with the answer filled in). The game moves on.

Mistakes count once per wrong try. A clue shown by Fu-fu counts as 3 mistakes.

### Stars

Per room: 3★ no mistakes, 2★ 1–2 mistakes, 1★ finished. A room can be replayed; best stars are kept.

## §4 Reinforcement

- **Immediate:** every right answer gives a sparkle, a happy sound and the bat cheering 「做得好！」.
- **Coins:** R1 and R2: +1 coin for every right answer (continuous). R3–R5: coins come in one chest at the end of the room, 5 + 2 × stars (thinner schedule once the skill is forming). Floor clear: +10 coins and one free look (fixed, shown before as a silhouette).
- **Never taken away:** no lives, no coin loss, no timer in rooms.
- **Fixed rewards only:** no random loot. Shop prices are fixed.
- **Shop:** see §4b. The whole game gives enough coins for most of the shop.
- **Healthy play:** no streaks, nothing lost by not playing. After a floor, a 「今日做得好！」 card with **Continue** still there.

## §4b Character customization

Ownership and a token economy: coins earned by right answers turn into looks the child chooses. Built **core first**; later slots exist in the data and code but are empty in the first build.

### Make your hero (first visit, free, all open)

| Layer | Choices |
|---|---|
| Skin tone | 6 |
| Hair style | 5 |
| Hair colour | 6 |
| Tunic colour | 8 |
| Name | preset bilingual list (勇勇 Brave, 叮叮 Ding-ding, 星星 Star…) + a number. **No free text**, same rule as the robot names |

The base body is a neutral knight so every child can see themself in it. The child can change any of these later for free.

### Earned with coins (first build)

| Slot | Items | Price |
|---|---|---|
| Helmet | 5 (plain helm, horned helm, crown, wizard hat, hood) | 10–25 coins |
| Pet that follows | slime, ghost, cat, owlet | 15–30 coins |
| Pet: baby dragon | only from beating the floor-4 boss | not for sale |
| Chest pieces | found in the end chest of F1R3 紅帽子 cap, F1R5 小雞 chick, F2R3 花環 flower crown, F2R5 小兔 bunny, F3R3 海盜帽 pirate hat, F3R5 小青蛙 frog, F4R3 金頭盔 gold helm | not for sale |

**Chest pieces:** fixed rooms, given on the **first clear only** (replays give coins as usual), so every child gets the same pieces the same way; nothing random. Before it opens, the chest shows the piece's silhouette 「寶箱裏有新裝備！」; it opens with a fanfare and the child can 「穿上」 it at once or keep playing.

**Later (slots reserved, not in the first build):** cape, shield badge, walk trail. Coins saved meanwhile stay; nothing is lost.

### Shop 裝備室

- A room off the map with a big mirror view of the hero.
- Every item shows its picture and price. Trying on is free; the child pays only to keep it.
- Locked items show a silhouette and how to get them (coins, or "beat the dragon").
- Fixed prices, nothing random, no discounts or timers.

### Rules so looks never get in the way

- Hero layers come from Kenney Roguelike Characters, which face the viewer. Left/right is never taught with a viewer-facing hero's hands; it is always the screen's left and right. The only time hands are used is the **back-view** hero in wave rooms (§5), where the hero's left hand is on the screen's left.
- Shields and helmets carry no letters or arrows.
- The pet trails behind the hero, never stands in a slot and is never part of a clue.
- The hero appears on the end-of-floor card and in the map; no class gallery, so nothing needs moderating.

### Data

`dungeonProgress/{uid}` holds `hero: {skin, hairStyle, hairColour, tunic, name}`, `looks: [...]` (owned item ids) and `equipped: {helmet, pet, cape:null, badge:null, trail:null}`.

## §4c Art style

**16 px pixel art, Kenney CC0 packs plus matching code-drawn sprites.**

| Source | Used for |
|---|---|
| [Kenney Tiny Dungeon](https://kenney.nl/assets/tiny-dungeon) (CC0, 16×16) | room scenery: brick wall faces, stone floor and platforms, doors, barrels, chests, tables, torches, potions, weapons, shields; also clue objects |
| [Kenney Roguelike Characters](https://kenney.nl/assets/roguelike-characters) (CC0, 16×16 layers) | the hero, built from body, tunic, hair and helmet layers |
| Drawn in code, same 16 px flat style | slimes, bat 蝠蝠, owl, dragon, pets, ladders and shelves if the pack lacks a side-view one, 左/右 tags frame |

Tiny Dungeon is a top-down set, so rooms use only its **front-facing pieces** (wall faces, doors, furniture, items) laid out as a side view: a wall backdrop, a floor line, shelves and ladders. Its top-down floor tiles are not used.

Rules:
- Whole-number scaling with no smoothing (Phaser `pixelArt: true`): ×5 on iPad (hero about 80 px tall), ×3–4 on phones. Room logic is 192×108 px (12×6.75 tiles).
- Every creature in a queue faces left or right in side view, with eyes on the side it faces and a forward-leaning hop. Facing arrows (footprints) only at support level S3.
- Objects that can be the answer to a clue look the same apart from their mark; colour never gives an answer away.
- Nothing tappable is smaller than 48 px on screen.
- The background is lifted (lighter stone) and sprites get a soft shadow so the no-outline character layers stay clear.
- Clue text, 左/右 tags, buttons and numbers are smooth vector text, not pixel fonts, so the Chinese stays sharp and looks like the textbook.
- Footer credit: "Art: Kenney.nl (CC0)".
- Only the sheets actually used are committed, with Kenney's `License.txt`. Downloading the packs needs the owner's OK at build time.

## §5 Monster waves 怪物來了！

Fluency practice after accuracy: the same side words, now quick. Friendly monsters (slimes, bats, moles) come at the hero; the child picks the side and the hero bops them with a foam sword. A bopped monster pops into sparkles and a coin. Nothing is hurt or killed.

### Back-view hero

In wave rooms the hero is shown **from behind**, standing in the middle of a corridor. Its left hand is on the screen's left, so "the left hand" and "the left side" are the same. The back view is drawn in code as matching layers (body, hair, tunic colour, helmet, pet behind), so the child's customization still shows.

### Controls

| Waves | Child taps | Hero does |
|---|---|---|
| 左右 (floor 1 R6, Rush) | the hero's **left hand** or **right hand** (big glowing hand buttons at the hero's sides) | swings with that hand to that side |
| 上下 (floor 3 R6, Rush) | 上 (sword raised above the head) or 下 (sword down at the feet) | bops a bat dropping from the ceiling or a mole popping up from the floor |
| Mixed (Rush only) | any of the four | |

Each monster is announced by sound and voice for the first wave (「左面！」) and then by sight only. 前後 is not used in waves: the back-view hero has no clear front and back on screen.

### Mistakes

- A wrong side: the monster bonks the hero's shield (funny wobble, 「哎呀！」), the combo resets, and the monster **stays** until the right side is picked. **No HP, nothing lost.**
- In wave rooms there is no time pressure: monsters walk in slowly and wait at the hero. In the Rush they keep coming; a monster that reaches the hero bonks the shield and resets the combo, then leaves.

### Wave rooms (floor 1 R6, floor 3 R6)

- 3 waves, 4 → 6 → 8 monsters, about 2 minutes. Support S1, but in wave 1 the side a monster comes from glows briefly.
- Stars as for any room (wrong taps are mistakes). Coins: 1 per bop.

## §5b Rush 寶藏快手 (monster waves)

- Timed, default 60 s (teacher setting). Opens when floor 4 is cleared.
- Monster waves as in §5, getting faster: 左右 waves, then 上下, then mixed. Between waves, one quick 之間 clue: 「哪隻怪物在🔥和🛡️之間？」 (tap it), so the Rush still covers between.
- Shared combo/fever and trophy cutoffs. Leaderboard tab `dungeon`.

## §6 Progression, teacher, data

### Unlocks

- Teacher panel row **Treasure Dungeon 尋寶地下城**: Floor 1 ☐ Floor 2 ☐ Floor 3 ☐ Floor 4 ☐ (all off by default), Rush time (s) default 60. Stored in `settings/global` as `dungeonUnlock {f1,f2,f3,f4}` and `dungeonTimeLimit`.
- Floor 1 opens when ticked. A later floor also needs ≥1★ on every room of the floor before.
- Inside a floor, rooms open in order; the next needs ≥1★ on the one before.
- Rush opens when floor 4 is cleared (and ticked).
- Test mode opens everything and saves nothing.

### Data

- `dungeonProgress/{uid}`: `{ name, email, stars: {F1R1..F4R5, F1R6, F3R6}, coins, hero, looks: [...], equipped, updatedAt }` (fields in §4b) + a localStorage copy (same pattern as `bonds-progress.js`).
- `scores/{uid}_dungeon` via `saveScore`.
- `logAttempt` at every room end and Rush end: game `dungeon`, mode `dungeonF1R1`…`dungeonF4R5` plus `dungeonF1R6` and `dungeonF3R6`, `dungeonRush`; stars, mistakes, hints used, duration, and up to 5 `confusions` such as `{want:'left', picked:'right'}` or `{want:'front', picked:'back'}`, so the teacher sees left/right swaps and front/back flips.
- `labels.js` gets the new labels. `teacher.html` gets a **Treasure Dungeon** sub-tab under Overview (like Robot Workshop): stars per room per child and the top confusions.
- `firestore.rules`: `dungeonProgress/{uid}` read/write own, teacher read. The teacher email stays the placeholder.

### Teacher notes (README and teacher panel help)

Left and right start from the child's own body, which the game cannot check. Before Floor 1, run the textbook's 「老師話」 activity (p72): children sit side by side, point to the eraser on their left or right, raise the left or right hand. Before Floor 2, the 數學探索 line-up (p73): three children in a row say who is in front and behind, then turn round. The game takes over from there with pictures and words.

## §7 Architecture

### Approaches considered

1. **Phaser 3** (chosen). Same as Rod Town; side view, walking, climbing and tweens are easy; `hidpi`, `sfx`, `fx` patterns reused.
2. Plain DOM/CSS: lighter, but walking, ladders and animation get messy.
3. three.js: too much for a side view.

### Files

| File | Job |
|---|---|
| `position.html` | page shell, login, loads Phaser and `dungeon/main.js` |
| `dungeon-logic.js` | pure, unit tested: room data, relations, clue generation, scaffold levels, hint ladder, grading, coins, unlocks |
| `dungeon-progress.js` | Firestore + localStorage progress |
| `dungeon/main.js` | boot, `?dev`, `window.__dungeon.go(scene, data)` |
| `dungeon/scenes/map.js`, `room.js`, `rush.js`, `shop.js` | Phaser scenes |
| `dungeon/hero.js` | tap-to-walk, ladder paths, looks |
| `dungeon/art.js` | loads the Kenney sheets, builds the hero from layers, draws the code-made sprites (§4c) |
| `dungeon/assets/` | the Kenney sheets actually used + their `License.txt` |
| `dungeon/fx.js`, `sfx.js`, `theme.js`, `hidpi.js` | effects, sounds, colours, sharp rendering (from Rod Town) |
| `dungeon/voice.js` | speechSynthesis wrapper |

### Logic units (`dungeon-logic.js`)

- **Room model:** objects with `{id, kind, row, col}` in rows/columns, or `{id, queue, index, facing}` in queues.
- **Relations:** `leftOf(a,b)`, `rightOf`, `above`, `below`, `inFront(a,b)` (uses facing), `behind`, `between(a,b,c)`, `onSide(a,'left'|'right')`. Return `null` (not comparable) when objects are not in the same row, column or queue.
- **Clues:** `makeClue(room, type, relation, seed)` returns `{text, icons, answers}`. `answersFor(room, clue)` recomputes the answer set; a clue is valid only if it matches the declared set and is non-empty (single-answer for choose and Rush).
- **Scaffold:** `levelFor(roomId, prevRoomMistakes)`; `hintStep(wrongTries)`.
- **Grading:** `stars(mistakes)`, `coinsFor(roomIndex, correct, stars)`, `floorMedal(stars)`.
- **Unlocks:** `isOpen(target, progress, settings)`.
- Seeded random so `?seed=` gives repeatable rooms.

### Dev

`http://localhost:8000/position.html?dev` skips login, test mode, player "Dev". `&scene=F2R3` jumps to a room, `&seed=7` repeats rounds.

## §8 Testing

- `tests/dungeon-logic.test.mjs` (`npm test`): every relation on hand-made rooms; not-comparable cases (diagonals, different queues); queue turn-round swaps front/back; every generated clue for every room and 50 seeds has exactly its declared answers; scaffold defaults and the adaptive rule; hint ladder; stars, coins, medals; unlock rules including test mode.
- `labels` test updated for the new labels.
- Browser check in `?dev` for each room type on iPad landscape and portrait, less-motion on, voice on and off.
- Built in waves on branch `treasure-dungeon` (worktree `.worktrees/dungeon`), logic first, then scenes in parallel, with reviews. Merge to `main` only with the owner's approval.
