// 地圖 Map: a side-view cut-through of the dungeon. Four floors stacked downward, joined by stairs, with the
// Rush door in the basement. Every room is a door with its best stars; locked doors show a padlock; a cleared
// floor shows its medal. The hero (and pet) walks to the tapped door, then a circle wipe opens the room.
//
// data: { justDone?: roomKey, goTo?: roomKey }
//   justDone: the room just finished — its stars fly to its door and the hero stands there.
//   goTo:     the end panel's Next — after the stars the hero walks on to that door and opens it.
// The map scrolls vertically (drag / wheel) when the screen is short. Fixed bottom bar: 裝備室 Shop and 🏆.
import { ROOMS, roomsOf, roomByKey, isRoomOpen, isFloorOpen, isRushOpen, floorMedal, heroName } from '../../dungeon-logic.js?v=202610112341';
import { UI, pill, starPts } from '../ui.js?v=202610112341';
import { fx } from '../fx.js?v=202610112341';
import { sfx } from '../sfx.js?v=202610112341';
import { voice } from '../voice.js?v=202610112341';
import { textStyle } from '../theme.js?v=202610112341';
import { makeHero, makeBackdrop } from '../art.js?v=202610112341';
import { FLOOR_STONE } from '../art-frames.js?v=202610112341';

/** Scene key for a room: wave rooms (F1R6, F3R6) run in Waves, the rest in Room. */
export const sceneOfRoom = key => (ROOMS.find(r => r.key === key) || {}).wave ? 'Waves' : 'Room';

const BAND = 48;      // art px per floor band (ceiling 0–3, wall 3–40, floor slab 40–48)
const LINE = 40;      // floor line inside a band (art px)
const SW = 26;        // stair shaft width (art px)
const MAX_BW = 240;   // widest band (art px); wider screens get dark rock at the sides
const BOTTOM = 84;    // fixed bottom bar (CSS px)
const RUSH_FLOOR = 5; // the basement band
const AT_KEY = 'dungeon.mapAt'; // registry: where the hero stands on the map (room key, 'Rush' or 'start')

const reduced = () => fx.lessMotion || (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const hexN = s => parseInt(String(s).slice(1), 16);
/** Stairs leave floor f on this side, down to floor f + 1 (odd floors right, even floors left). */
const stairSide = f => (f % 2 ? 'right' : 'left');

export class MapScene extends Phaser.Scene {
  constructor() { super('Map'); }
  init(data) {
    this.startData = data || {};
    // Phaser keeps the last start data when a later start passes none (go('Map') after the leaderboard / teacher
    // settings): consume it so justDone / goTo play only once.
    this.sys.settings.data = {};
  }

  create() {
    const bridge = this.bridge = this.registry.get('bridge');
    this.busy = false; this.leaving = false; this.walking = null; this.scrollY = 0; this.drag = null; this.bob = null;
    this.ui = new UI(this);
    const name = heroName(bridge.progress && bridge.progress.hero);
    const said = this.registry.get('dungeon.mapSaid');
    this.registry.set('dungeon.mapSaid', true);
    this.ui.prompt(name ? `${name}，揀一道門！` : '揀一道門！', 'Tap a door to go in', { speak: !said && !this.startData.goTo });
    this.ui.coins(bridge.coins, false);
    this.makeTextures();

    const d = this.startData;
    if (d.justDone && roomByKey(d.justDone)) this.registry.set(AT_KEY, d.justDone);
    if (!this.registry.get(AT_KEY)) this.registry.set(AT_KEY, this.defaultSpot());

    this.build();
    fx.irisIn(this);
    this.bindInput();

    let t = null;
    const onResize = () => { if (t) t.remove(); t = this.time.delayedCall(120, () => this.rebuild()); };
    this.scale.on('resize', onResize);
    this.events.once('shutdown', () => { this.scale.off('resize', onResize); voice.stop(); });

    if (d.justDone && roomByKey(d.justDone)) this.time.delayedCall(reduced() ? 160 : 450, () => this.celebrate(d.justDone, d.goTo));
    else if (d.goTo && roomByKey(d.goTo)) this.time.delayedCall(reduced() ? 160 : 450, () => this.tapRoom(d.goTo));
  }

  /** First open room without stars (where to play next), else F1R1's door. */
  defaultSpot() {
    const b = this.bridge, p = b.progress;
    const r = ROOMS.find(x => !((p.stars || {})[x.key] > 0) && isRoomOpen(p, x.key, b.unlock, b.testMode));
    return r ? r.key : 'start';
  }

  /** Recoloured wall / slab textures per floor (art.js makes them inside makeBackdrop). */
  makeTextures() {
    for (const f of [1, 2, 3, 4]) {
      if (this.textures.exists(`bd.${f}.wall`)) continue;
      try { makeBackdrop(this, f).destroy(); } catch (e) { console.warn('[map] backdrop', e); }
    }
  }

  // ---------------------------------------------------------------- layout
  layout() {
    const W = this.scale.width, H = this.scale.height;
    const top = this.ui.topH + 4, viewH = Math.max(100, H - top - BOTTOM);
    const Pw = Math.floor(W / 180), Ph = Math.floor(viewH / (5 * BAND));
    const P = clamp(Math.min(Pw, Math.max(Ph, 3)), 2, 5);
    const bw = Math.min(MAX_BW, Math.floor((W - 8) / P));
    const x0 = Math.round((W - bw * P) / 2);
    const contentH = 5 * BAND * P + 8;
    const L = { W, H, top, viewH, P, bw, x0, contentH, maxScroll: Math.max(0, contentH - viewH), pad: Math.max(0, (viewH - contentH) / 2) };
    // door x (art px from band left) per floor: R1 next to where the stairs arrive
    L.doors = {};
    for (const f of [1, 2, 3, 4]) {
      const keys = roomsOf(f), n = 6;
      const right = stairSide(f) === 'right';
      const a = right ? 8 : SW + 6, b = right ? bw - SW - 6 : bw - 8;
      const step = (b - a) / n;
      keys.forEach((k, i) => {
        const slot = keys.length === n ? i : i + (n - keys.length) / 2;
        const ax = right ? a + (slot + 0.5) * step : b - (slot + 0.5) * step;
        L.doors[k] = { floor: f, ax: Math.round(ax), step };
      });
    }
    L.doors.Rush = { floor: RUSH_FLOOR, ax: Math.round(bw / 2), step: 40 };
    L.start = { floor: 1, ax: 2 };
    return L;
  }
  /** Band top (world y, CSS px) of floor f (5 = basement). */
  bandY(f) { return (f - 1) * BAND * this.L.P; }
  /** World point (CSS px) of art position ax on floor f's floor line. */
  pt(f, ax) { const L = this.L; return { x: L.x0 + ax * L.P, y: this.bandY(f) + LINE * L.P }; }
  spotOf(key) { return key === 'start' ? this.L.start : this.L.doors[key] || this.L.start; }

  // ---------------------------------------------------------------- build
  rebuild() {
    if (this.leaving) return;
    const target = this.walking ? this.walking.target : null;
    this.tweens.killAll();
    if (this.world) this.world.destroy();
    if (this.fixed) this.fixed.destroy();
    this.walking = null; this.busy = false;
    this.build();
    if (target) this.enter(target); // a resize cut the walk short: open the room now
  }

  build() {
    const L = this.L = this.layout(), P = L.P, b = this.bridge, p = b.progress, unlock = b.unlock, test = b.testMode;
    this.world = this.add.container(0, 0).setDepth(1);
    const W = this.world;
    const g = this.add.graphics();
    W.add(g);
    // dark rock behind the building
    g.fillStyle(0x1a1424, 1).fillRect(L.x0 - 6 * P, -4 * P, L.bw * P + 12 * P, L.contentH + 8 * P);

    // floor bands
    for (let f = 1; f <= RUSH_FLOOR; f++) this.drawBand(f);
    // stairs: floor f -> f + 1
    for (let f = 1; f <= 4; f++) this.drawStairs(f);

    // doors
    this.doors = {};
    ROOMS.forEach(r => {
      const open = isRoomOpen(p, r.key, unlock, test), stars = (p.stars || {})[r.key] || 0;
      this.doors[r.key] = this.drawDoor(r, open, stars);
    });
    this.doors.Rush = this.drawRushDoor(isRushOpen(p, unlock, test));

    // floor labels + medals (on the stair shaft above the floor line)
    for (let f = 1; f <= 4; f++) {
      const right = stairSide(f) === 'right';
      const cx = L.x0 + (right ? L.bw - SW / 2 : SW / 2) * P, y = this.bandY(f) + 4 * P;
      const t = this.add.text(cx, y, `第${f}層`, textStyle(15, '#fde68a')).setOrigin(0.5, 0);
      const e = this.add.text(cx, y + t.height - 4, `Floor ${f}`, textStyle(11, '#e7e5e4', { fontStyle: 'normal' })).setOrigin(0.5, 0);
      W.add([t, e]);
      const medal = floorMedal(p, f);
      if (medal) {
        const m = this.add.text(cx, e.y + e.height, { gold: '🥇', silver: '🥈', bronze: '🥉' }[medal], { fontSize: `${clamp(8 * P, 18, 30)}px`, padding: { x: 2, y: 4 } }).setOrigin(0.5, 0);
        W.add(m);
      }
    }

    // hero (+ pet) on the map
    const at = this.registry.get(AT_KEY) || 'start';
    const s = this.spotOf(at);
    this.heroAt = { floor: s.floor, ax: s.ax, key: at };
    this.holder = this.add.container(0, 0);
    this.hero = makeHero(this, { hero: p.hero, equipped: p.equipped || {} }, { view: 'front' }).setScale(P);
    this.hero.setPetSide('left');
    this.holder.add(this.hero);
    W.add(this.holder);
    this.placeHero();

    // tap zones on top (≥ 48 CSS px)
    Object.entries(this.doors).forEach(([key, d]) => W.add(d.zone));

    // fixed layers: top / bottom covers (swallow taps), bottom bar buttons
    this.fixed = this.add.container(0, 0).setDepth(400);
    const cover = this.add.graphics();
    cover.fillStyle(0x2a1f33, 1).fillRect(0, 0, L.W, L.top).fillRect(0, L.H - BOTTOM, L.W, BOTTOM);
    cover.lineStyle(2, 0x4a3b5c, 1).lineBetween(0, L.H - BOTTOM, L.W, L.H - BOTTOM);
    const topZ = this.add.zone(0, 0, L.W, L.top).setOrigin(0).setInteractive();
    const botZ = this.add.zone(0, L.H - BOTTOM, L.W, BOTTOM).setOrigin(0).setInteractive();
    this.fixed.add([cover, topZ, botZ]);
    const bw = Math.min(170, (L.W - 32) / 2 - 8), by = L.H - BOTTOM / 2;
    const shop = pill(this, { zh: '裝備室', en: 'Shop', icon: '🛡️', w: bw, h: 64, size: 22, fill: 0xfde047, rim: 0xb45309 }, () => this.goShop());
    shop.setPosition(16 + bw / 2, by);
    const lb = pill(this, { zh: '排行榜', en: 'Leaderboard', icon: '🏆', w: bw, h: 64, size: 22, fill: 0xffffff, rim: 0xb45309 }, () => { if (!this.busy && !this.ui.modalOpen) b.showLeaderboard(); });
    lb.setPosition(L.W - 16 - bw / 2, by);
    this.fixed.add([shop, lb]);
    const name = heroName(p.hero);
    if (name && L.W - 2 * bw - 48 >= 90) this.fixed.add(this.add.text(L.W / 2, by, name, textStyle(18, '#fde68a')).setOrigin(0.5));

    // start scrolled so the hero is in view
    this.setScroll(this.heroWorldY() - L.viewH / 2);
  }

  drawBand(f) {
    const L = this.L, P = L.P, W = this.world, y = this.bandY(f);
    const fl = f === RUSH_FLOOR ? 4 : f;
    const stone = FLOOR_STONE[fl];
    const g = this.add.graphics();
    W.add(g);
    // wall (Tiny Dungeon brick face, recoloured per floor)
    const wallKey = this.textures.exists(`bd.${fl}.wall`) ? `bd.${fl}.wall` : null;
    const slabKey = this.textures.exists(`bd.${fl}.slab`) ? `bd.${fl}.slab` : null;
    const isRush = f === RUSH_FLOOR;
    // the stair shafts: from floor f-1 (arriving) and to floor f+1 (leaving) take a column of this band
    const leaveSide = f <= 4 ? stairSide(f) : null, arriveSide = f >= 2 ? stairSide(f - 1) : null;
    const shaftL = leaveSide === 'left' || arriveSide === 'left', shaftR = leaveSide === 'right' || arriveSide === 'right';
    const wx0 = shaftL ? SW : 0, wx1 = shaftR ? L.bw - SW : L.bw;
    if (wallKey) {
      const ts = this.add.tileSprite(L.x0 + wx0 * P, y + 3 * P, wx1 - wx0, LINE - 3, wallKey).setOrigin(0).setScale(P);
      if (isRush) ts.setTint(0xb8a070);
      W.add(ts);
    } else {
      g.fillStyle(hexN(stone.stone), 1).fillRect(L.x0 + wx0 * P, y + 3 * P, (wx1 - wx0) * P, (LINE - 3) * P);
    }
    // ceiling strip
    g.fillStyle(hexN(stone.ceiling), 1).fillRect(L.x0, y, L.bw * P, 3 * P);
    // shafts: dark
    g.fillStyle(0x15101d, 1);
    if (shaftL) g.fillRect(L.x0, y + 3 * P, SW * P, (BAND - 3) * P);
    if (shaftR) g.fillRect(L.x0 + (L.bw - SW) * P, y + 3 * P, SW * P, (BAND - 3) * P);
    // floor slab (not over a shaft that leads down from this floor)
    const sx0 = leaveSide === 'left' ? SW : 0, sx1 = leaveSide === 'right' ? L.bw - SW : L.bw;
    if (slabKey) {
      const ts = this.add.tileSprite(L.x0 + sx0 * P, y + LINE * P, sx1 - sx0, BAND - LINE, slabKey).setOrigin(0).setScale(P);
      if (isRush) ts.setTint(0xb8a070);
      W.add(ts);
    } else {
      g.fillStyle(hexN(stone.mortar), 1).fillRect(L.x0 + sx0 * P, y + LINE * P, (sx1 - sx0) * P, (BAND - LINE) * P);
    }
    const edge = this.add.graphics();
    edge.fillStyle(hexN(stone.deep), 1).fillRect(L.x0 + sx0 * P, y + LINE * P, (sx1 - sx0) * P, P);
    W.add(edge);
    // two torches on the wall, in the gaps between doors 2–3 and 4–5
    if (!isRush && this.textures.exists('art:torch')) {
      const xs = roomsOf(f).map(k => L.doors[k].ax).sort((m, n) => m - n);
      for (const i of [1, 3]) {
        if (xs[i + 1] == null) continue;
        W.add(this.add.image(L.x0 + Math.round((xs[i] + xs[i + 1]) / 2) * P, y + 34 * P, 'art:torch').setOrigin(0.5, 1).setScale(P).setAlpha(0.9));
      }
    }
  }

  drawStairs(f) {
    const L = this.L, P = L.P, right = stairSide(f) === 'right';
    const stone = FLOOR_STONE[Math.min(4, f + 1)];
    const g = this.add.graphics();
    this.world.add(g);
    const top = this.bandY(f) + LINE * P, drop = BAND * P, n = 6;
    const sx = L.x0 + (right ? L.bw - SW : 0) * P, w = SW * P;
    const stepW = w / n, stepH = drop / n;
    for (let i = 0; i < n; i++) {
      // step i: going down away from the floor (right side: left→right; left side: right→left)
      const x = right ? sx + i * stepW : sx + w - (i + 1) * stepW;
      const yy = top + (i + 1) * stepH - P * 2;
      g.fillStyle(hexN(stone.mortar), 1).fillRect(x, yy, stepW + 1, top + drop + P * 2 - yy);
      g.fillStyle(hexN(stone.hi), 1).fillRect(x, yy, stepW + 1, P);
    }
    g.fillStyle(hexN(stone.deep), 1);
    // rail posts
    for (let i = 0; i <= n; i += 2) {
      const x = right ? sx + i * stepW : sx + w - i * stepW;
      g.fillRect(x - P / 2, top + i * stepH - 10 * P, P, 10 * P);
    }
    g.lineStyle(P, hexN(stone.deep), 1).lineBetween(right ? sx : sx + w, top - 10 * P, right ? sx + w : sx, top + drop - 10 * P);
  }

  /** One room door: Tiny Dungeon door tile (boss: double door), number plaque, 3 star slots, lock. */
  drawDoor(r, open, stars) {
    const L = this.L, P = L.P, d = L.doors[r.key], c = this.pt(d.floor, d.ax);
    const parts = [];
    const tint = !open ? 0x6b6478 : r.wave ? 0xffb0a0 : r.boss ? 0xffe08a : 0xffffff;
    if (r.boss) {
      parts.push(this.add.image(c.x, c.y, 'td', 46).setOrigin(1, 1).setScale(P).setTint(tint));
      parts.push(this.add.image(c.x, c.y, 'td', 47).setOrigin(0, 1).setScale(P).setTint(tint));
    } else parts.push(this.add.image(c.x, c.y, 'td', 45).setOrigin(0.5, 1).setScale(P).setTint(tint));
    // wave rooms: a little slime peeks out beside the door; boss: the sleepy dragon's head
    if (r.wave && open) {
      try { parts.push(this.add.image(c.x + 9 * P, c.y, 'art:slime.green').setOrigin(0.5, 1).setScale(Math.max(1, P - 1)).setFlipX(true)); } catch (e) { /* */ }
    }
    // plaque on the floor slab: room number (wave: ⚔, boss: 🐉)
    const label = r.wave ? '⚔️' : r.boss ? '🐉' : String(r.idx);
    const plaque = this.add.text(c.x, c.y + (BAND - LINE) * P / 2, label, textStyle(clamp(4 * P + 2, 12, 20), open ? '#fff7ed' : '#a8a29e', { stroke: '#1c1917', strokeThickness: 3 })).setOrigin(0.5);
    parts.push(plaque);
    // stars above the door
    const starG = this.add.graphics();
    const sr = clamp(2.2 * P, 6, 11), gap = sr * 2.3, sy = c.y - 16 * P - sr - 3;
    const drawStars = n => {
      starG.clear();
      if (!open) return;
      starG.fillStyle(0x000000, 0.45).fillRoundedRect(c.x - gap * 1.5 - 2, sy - sr - 3, gap * 3 + 4, 2 * sr + 6, sr);
      for (let i = 0; i < 3; i++) {
        const x = c.x + (i - 1) * gap;
        if (i < n) starG.fillStyle(0xfacc15, 1).fillPoints(starPts(sr, x, sy), true).lineStyle(1.5, 0xb45309, 1).strokePoints(starPts(sr, x, sy), true, true);
        else starG.fillStyle(0x8a817c, 1).fillPoints(starPts(sr * 0.8, x, sy), true);
      }
    };
    drawStars(stars);
    parts.push(starG);
    // padlock
    if (!open) {
      const lg = this.add.graphics(), lr = clamp(4 * P, 9, 16), lx = c.x, ly = c.y - 8 * P;
      lg.lineStyle(Math.max(3, lr * 0.3), 0xd6d3d1, 1).beginPath().arc(lx, ly - lr * 0.35, lr * 0.55, Math.PI, 0).strokePath();
      lg.fillStyle(0xfacc15, 1).fillRoundedRect(lx - lr * 0.85, ly - lr * 0.35, lr * 1.7, lr * 1.3, 3);
      lg.fillStyle(0x78350f, 1).fillCircle(lx, ly + lr * 0.2, lr * 0.2);
      parts.push(lg);
    }
    this.world.add(parts);
    const zw = clamp(d.step * P - 2, 48, 110), zh = Math.max(56, (BAND - 6) * P);
    const zone = this.add.zone(c.x, this.bandY(d.floor) + 3 * P + zh / 2, zw, zh).setInteractive({ useHandCursor: true });
    zone.on('pointerup', () => { if (!this.dragMoved) this.tapRoom(r.key); });
    return { zone, open, drawStars, starPos: i => ({ x: c.x + (i - 1) * gap, y: sy }), x: c.x, y: c.y, parts };
  }

  drawRushDoor(open) {
    const L = this.L, P = L.P, d = L.doors.Rush, c = this.pt(RUSH_FLOOR, d.ax);
    const tint = open ? 0xffe08a : 0x6b6478;
    const parts = [
      this.add.image(c.x, c.y, 'td', 46).setOrigin(1, 1).setScale(P).setTint(tint),
      this.add.image(c.x, c.y, 'td', 47).setOrigin(0, 1).setScale(P).setTint(tint),
    ];
    const t = this.add.text(c.x, c.y - 16 * P - 4, '寶藏快手', textStyle(clamp(5 * P, 14, 22), open ? '#fde68a' : '#a8a29e', { stroke: '#1c1917', strokeThickness: 4 })).setOrigin(0.5, 1);
    const e = this.add.text(c.x, c.y + (BAND - LINE) * P / 2, 'Rush', textStyle(clamp(4 * P, 11, 16), '#fff7ed', { stroke: '#1c1917', strokeThickness: 3, fontStyle: 'normal' })).setOrigin(0.5);
    parts.push(t, e);
    if (!open) {
      const lg = this.add.graphics(), lr = clamp(4 * P, 9, 16), lx = c.x, ly = c.y - 8 * P;
      lg.lineStyle(Math.max(3, lr * 0.3), 0xd6d3d1, 1).beginPath().arc(lx, ly - lr * 0.35, lr * 0.55, Math.PI, 0).strokePath();
      lg.fillStyle(0xfacc15, 1).fillRoundedRect(lx - lr * 0.85, ly - lr * 0.35, lr * 1.7, lr * 1.3, 3);
      lg.fillStyle(0x78350f, 1).fillCircle(lx, ly + lr * 0.2, lr * 0.2);
      parts.push(lg);
    }
    this.world.add(parts);
    const zw = Math.max(96, 40 * P), zh = Math.max(56, (BAND - 6) * P);
    const zone = this.add.zone(c.x, this.bandY(RUSH_FLOOR) + 3 * P + zh / 2, zw, zh).setInteractive({ useHandCursor: true });
    zone.on('pointerup', () => { if (!this.dragMoved) this.tapRoom('Rush'); });
    return { zone, open, x: c.x, y: c.y, parts };
  }

  // ---------------------------------------------------------------- scrolling
  bindInput() {
    this.input.on('pointerdown', p => { this.drag = { y: p.worldY, s: this.scrollY }; this.dragMoved = false; });
    this.input.on('pointermove', p => {
      if (!this.drag || !p.isDown) return;
      const dy = p.worldY - this.drag.y;
      if (Math.abs(dy) > 10) this.dragMoved = true;
      if (this.dragMoved && !this.walking) this.setScroll(this.drag.s - dy);
    });
    this.input.on('pointerup', () => { this.drag = null; });
    this.input.on('wheel', (p, objs, dx, dy) => { if (!this.walking) this.setScroll(this.scrollY + dy); });
  }
  setScroll(v) {
    const L = this.L;
    this.scrollY = clamp(v, 0, L.maxScroll);
    this.world.y = L.top + L.pad - this.scrollY;
  }
  heroWorldY() { return this.holder.y - 8 * this.L.P; }
  /** Keep the hero in view while walking. */
  follow() {
    const L = this.L, y = this.heroWorldY() - this.scrollY;
    if (y < L.viewH * 0.3 || y > L.viewH * 0.7) this.setScroll(this.scrollY + (y - L.viewH / 2) * 0.15);
  }

  // ---------------------------------------------------------------- hero
  placeHero() {
    const p = this.pt(this.heroAt.floor, this.heroAt.ax);
    this.holder.setPosition(p.x, p.y);
  }

  /** Waypoints (floor, ax) from the hero to floor f2 / ax2, over the stairs. */
  path(f2, ax2) {
    const L = this.L, out = [];
    let f = this.heroAt.floor;
    const inner = s => (s === 'right' ? L.bw - SW : SW), outer = s => (s === 'right' ? L.bw - 3 : 3);
    while (f < f2) { const s = stairSide(f); out.push({ f, ax: inner(s) }); out.push({ f: f + 1, ax: outer(s) }); f++; }
    while (f > f2) { const s = stairSide(f - 1); out.push({ f, ax: outer(s) }); out.push({ f: f - 1, ax: inner(s) }); f--; }
    out.push({ f: f2, ax: ax2 });
    return out;
  }

  walkTo(target) {
    const s = this.spotOf(target);
    const pts = this.path(s.floor, s.ax).map(q => ({ ...this.pt(q.f, q.ax), f: q.f, ax: q.ax }));
    return new Promise(res => {
      this.walking = { target };
      const done = () => {
        this.walking = null;
        this.heroAt = { floor: s.floor, ax: s.ax, key: target };
        this.registry.set(AT_KEY, target);
        this.hero.y = 0; this.hero.angle = 0;
        if (this.bob) { this.bob.stop(); this.bob = null; }
        res();
      };
      if (reduced()) {
        this.holder.setPosition(pts[pts.length - 1].x, pts[pts.length - 1].y);
        this.setScroll(this.heroWorldY() - this.L.viewH / 2);
        this.time.delayedCall(150, done);
        return;
      }
      let len = 0, prev = { x: this.holder.x, y: this.holder.y };
      pts.forEach(q => { len += Math.hypot(q.x - prev.x, q.y - prev.y); prev = q; });
      const speed = Math.max(70 * this.L.P, len / 3.2); // CSS px per s; long trips speed up (≤ ~3 s)
      this.bob = this.tweens.add({ targets: this.hero, y: -this.L.P, angle: { from: -4, to: 4 }, duration: 130, yoyo: true, repeat: -1 });
      const leg = i => {
        if (i >= pts.length) { done(); return; }
        const q = pts[i], dx = q.x - this.holder.x, dist = Math.hypot(dx, q.y - this.holder.y);
        if (Math.abs(dx) > 1) this.hero.setPetSide(dx > 0 ? 'left' : 'right');
        if (i > 0 && q.f !== pts[i - 1].f) sfx.tick(2);
        this.tweens.add({ targets: this.holder, x: q.x, y: q.y, duration: Math.max(40, (dist / speed) * 1000), ease: 'Linear',
          onUpdate: () => this.follow(), onComplete: () => leg(i + 1) });
      };
      leg(0);
    });
  }

  // ---------------------------------------------------------------- taps
  /** Why a room / Rush is locked: 'teacher' or 'before'. */
  lockReason(key) {
    const b = this.bridge, u = b.unlock || {};
    if (key === 'Rush') return u.f4 ? 'before' : 'teacher';
    const r = roomByKey(key);
    return u[`f${r.floor}`] ? 'before' : 'teacher';
  }

  async tapRoom(key) {
    if (this.busy || this.ui.modalOpen || this.leaving) return;
    const d = this.doors[key];
    if (!d) return;
    if (!d.open) {
      sfx.boop();
      const why = this.lockReason(key);
      const isRush = key === 'Rush';
      const msg = why === 'teacher' ? { zh: '老師未開放', en: 'Your teacher will open this soon.' }
        : isRush ? { zh: '先完成第4層', en: 'Finish floor 4 first.' }
          : roomByKey(key).idx === 1 && !isFloorOpen(this.bridge.progress, roomByKey(key).floor, this.bridge.unlock, false)
            ? { zh: '先完成上一層', en: 'Finish the floor above first.' } : { zh: '先完成上一關', en: 'Finish the room before first.' };
      voice.say(msg.zh);
      this.busy = true;
      await this.ui.card({ icon: '🔒', zh: msg.zh, en: msg.en, buttons: [{ id: 'ok', zh: '好', en: 'OK' }] });
      this.busy = false;
      return;
    }
    this.busy = true;
    sfx.pop();
    if (this.heroAt.key !== key) await this.walkTo(key);
    this.enter(key);
  }

  enter(key) {
    if (this.leaving) return;
    this.leaving = true;
    sfx.door();
    if (key === 'Rush') fx.iris(this, 'Rush', {});
    else fx.iris(this, sceneOfRoom(key), { key });
  }

  goShop() {
    if (this.busy || this.ui.modalOpen || this.leaving) return;
    this.leaving = true;
    sfx.door();
    fx.iris(this, 'Shop', {});
  }

  /** The room just finished: its stars fly from the middle of the screen to the door; then (Next) walk on. */
  async celebrate(key, goTo) {
    const d = this.doors[key];
    if (!d || this.leaving) return;
    this.busy = true;
    const stars = (this.bridge.progress.stars || {})[key] || 0;
    if (d.open && stars > 0) {
      d.drawStars(0);
      const L = this.L;
      const from = { x: L.W / 2, y: L.viewH * 0.45 + this.scrollY - L.pad };
      await Promise.all([0, 1, 2].slice(0, stars).map(i => new Promise(res => {
        const to = d.starPos(i), st = this.add.graphics();
        st.fillStyle(0xfacc15, 1).fillPoints(starPts(18), true).lineStyle(3, 0xb45309, 1).strokePoints(starPts(18), true, true);
        st.setPosition(from.x, from.y);
        this.world.add(st);
        const dur = reduced() ? 150 : 650;
        this.tweens.add({ targets: st, x: to.x, y: to.y, scale: { from: 1.4, to: 0.45 }, duration: dur, delay: reduced() ? 0 : i * 200, ease: 'Cubic.easeInOut',
          onComplete: () => { sfx.star(i); st.destroy(); fx.sparkle(this, to.x, to.y + this.world.y); res(); } });
      })));
      d.drawStars(stars);
    }
    this.busy = false;
    if (goTo && roomByKey(goTo)) {
      await new Promise(r => this.time.delayedCall(reduced() ? 100 : 250, r));
      this.tapRoom(goTo);
    }
  }
}
