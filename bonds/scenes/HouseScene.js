/**
 * 數字屋 Number House — the boss of each world (Rod Town 數棒鎮).
 *
 * Like the textbook number houses: N sits on the roof, and every floor is one split a | N − a
 * (a ascending from the top floor down). The left window of each floor already shows rod a and
 * its numeral; the child fills the right window with rod N − a from a tray of rods 1-9 (labels
 * hidden). The twin floor (a = N − a) is framed gold. After three floors, faint arrows show the
 * pattern (left column goes up, right column goes down). When every floor is filled the lights run
 * bottom → top, the door opens, the world's rod buddy steps out waving, fireworks, stars.
 *
 * Start data: { w }  (1..4)
 * Test hook: scene.__test = { answer(), mistakes(), n(), floors(), active(), phase(), choose(len) }
 */
import { WORLDS, houseFor, starsFor, levelKey } from '../../bonds-logic.js?v=0';
import { UI, WORLD_THEME, textStyle } from '../theme.js?v=0';
import { fx } from '../fx.js?v=0';
import { sfx } from '../sfx.js?v=0';
import { Tray } from '../ui/Tray.js?v=0';
import { Rod, DPR, dur, sleep, reparent, reducedMotion } from '../ui/Rod.js?v=0';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const TRAY_UNIT = 40; // requested; the Tray caps it so all nine rods fit
const TOP = 66; // below the back button and the DOM mute/admin cluster
const M = 10;
const COL_A = 0x2563eb, COL_B = 0xea580c; // left column (goes up) / right column (goes down)
const CSS_A = '#2563eb', CSS_B = '#ea580c';
const WALL = 0xfffbeb, WALL_EDGE = 0x78350f, FRAME = 0x92400e, ACTIVE = 0xf97316;
const WIN_FILL = { glass: 0xdbeafe, empty: 0xffffff, lit: 0xfef08a, flash: 0xfffbe0, bad: 0xfecaca };

const txt = (scene, x, y, s, size, color = '#1f2937', extra = {}) =>
  scene.add.text(x, y, String(s), textStyle(size, color, { resolution: DPR, padding: { x: 2, y: 3 }, ...extra })).setOrigin(0.5);

function dashedRoundRect(g, x, y, w, h, r, dash = 7, gap = 5) {
  const seg = (x1, y1, x2, y2) => {
    const L = Math.hypot(x2 - x1, y2 - y1);
    for (let s = 0; s < L; s += dash + gap) {
      const e = Math.min(L, s + dash);
      g.lineBetween(x1 + ((x2 - x1) * s) / L, y1 + ((y2 - y1) * s) / L, x1 + ((x2 - x1) * e) / L, y1 + ((y2 - y1) * e) / L);
    }
  };
  seg(x + r, y, x + w - r, y); seg(x + w, y + r, x + w, y + h - r);
  seg(x + w - r, y + h, x + r, y + h); seg(x, y + h - r, x, y + r);
  const arc = (cx, cy, a0, a1) => { g.beginPath(); g.arc(cx, cy, r, a0, a1, false); g.strokePath(); };
  const P = Math.PI;
  arc(x + w - r, y + r, -P / 2, 0); arc(x + w - r, y + h - r, 0, P / 2); arc(x + r, y + h - r, P / 2, P); arc(x + r, y + r, P, P * 1.5);
}

function killDeep(scene, obj) {
  if (!obj || !scene.tweens) return;
  scene.tweens.killTweensOf(obj);
  if (obj.list) obj.list.forEach(c => killDeep(scene, c));
}

export class HouseScene extends Phaser.Scene {
  constructor() { super('House'); }
  init(data) { this.startData = data || {}; }

  create() {
    const w = this.w = clamp(Math.round(Number(this.startData.w)) || 1, 1, 4);
    this.bridge = this.registry.get('bridge');
    this.theme = WORLD_THEME[w] || WORLD_THEME[1];
    this.house = houseFor(w, Math.random);
    this.floors = this.house.floors.map(([a, b]) => ({ a, b, filled: false }));
    this.mistakes = 0;
    this.phase = 'play'; // 'play' → 'win' (celebration) → 'end' (panel)
    this.busy = false;
    this.leaving = false;
    this.gen = 0; // bumped by every rebuild; async steps drop out when it changes
    this.arrowK = 0; // floors covered by the pattern arrows
    this.end = null;
    this.__fxLive = { n: 0 };

    this.bgL = this.add.container(0, 0).setDepth(-10);
    this.houseL = this.add.container(0, 0).setDepth(0);
    this.hudL = this.add.container(0, 0).setDepth(100);
    this.dropRect = new Phaser.Geom.Rectangle();
    this.tray = new Tray(this);
    this.tray.on('choose', rod => this.onChoose(rod));

    this.relayout();
    this.tray.setRods(this.house.tray, { unit: TRAY_UNIT, labels: false });
    this.introHouse();

    const self = this;
    this.__test = {
      answer: () => (self.phase === 'play' ? self.floors[self.activeIndex()].b : null),
      mistakes: () => self.mistakes,
      n: () => self.house.n,
      floors: () => self.floors.map(f => [f.a, f.b]),
      active: () => self.activeIndex(),
      phase: () => self.phase,
      /** Simulate choosing the tray rod of length `len` (as a tap). */
      choose: len => {
        const rod = self.tray.rods.find(r => r.len === len && !r._busy);
        if (!rod) return false;
        rod._busy = true;
        self.tray.emit('choose', rod);
        return true;
      },
    };

    fx.irisIn(this);
    this.onResize = () => {
      if (this.resizeTimer) this.resizeTimer.remove();
      this.resizeTimer = this.time.delayedCall(120, () => { this.resizeTimer = null; this.relayout(); });
    };
    this.scale.on('resize', this.onResize);
    this.events.once('shutdown', () => { this.scale.off('resize', this.onResize); this.leaving = true; });
  }

  activeIndex() { const i = this.floors.findIndex(f => !f.filled); return i < 0 ? this.floors.length : i; }
  doneCount() { return this.floors.filter(f => f.filled).length; }

  // ---------------------------------------------------------------- layout
  computeLayout(W, H) {
    const wide = W > H * 1.1;
    let region, trayR;
    if (wide) {
      const hw = Math.round(W * 0.6);
      const groundPad = Math.round(clamp(H * 0.04, 12, 30));
      region = { x: M, y: TOP, w: hw - M, h: H - TOP - M - groundPad };
      trayR = { x: hw + M, y: TOP, w: W - hw - 2 * M, h: H - TOP - M };
    } else {
      const th = Math.round(clamp(H * 0.25, 140, 230));
      region = { x: M, y: TOP, w: W - 2 * M, h: H - TOP - th - 2 * M };
      trayR = { x: M, y: H - th - M, w: W - 2 * M, h: th };
    }
    const F = this.floors.length;
    const P = Math.max(...this.floors.map(f => Math.max(f.a, f.b)));
    const roofH = clamp(region.h * 0.14, 40, 100);
    const groundH = clamp(region.h * 0.08, 30, 60);
    const availF = (region.h - roofH - groundH) / F;
    const over = clamp(region.w * 0.03, 8, 18);
    const wall = 6, padH = 5, gap = 4;
    const maxBodyW = Math.min(region.w - 2 * over, 760);
    const numW = clamp(Math.min(availF, 76) * 0.62, 26, 40); // single digits: keep the middle columns slim so rods get the width
    const midW = 2 * numW;
    const uW = (maxBodyW - 2 * wall - midW - 2 * gap - 4 * padH) / (2 * P);
    const uH = (Math.min(availF, 76) - 12) / 1.4;
    const u = clamp(Math.floor(Math.min(uW, uH, 34) * 10) / 10, 6, 34);
    const rodH = Math.max(22, u * 1.4);
    let floorH = Math.min(availF, Math.max(rodH + 14, 44));
    floorH = Math.max(floorH, rodH + 6);
    const winW = P * u + 2 * padH;
    const bodyW = 2 * wall + 2 * winW + 2 * gap + midW;
    const houseH = roofH + F * floorH + groundH;
    const bottom = region.y + region.h;
    const top = bottom - houseH;
    const cx = region.x + region.w / 2;
    const bodyX = cx - bodyW / 2;
    const floorsTop = top + roofH;
    const leftX = bodyX + wall, midX = leftX + winW + gap, rightX = midX + midW + gap;
    const numFs = clamp(floorH * 0.6, 14, 34);
    const rows = this.floors.map((f, i) => {
      const cy = floorsTop + (i + 0.5) * floorH;
      const wy = cy - floorH / 2 + 3, wh = floorH - 6;
      return {
        cy,
        rect: { x: bodyX + wall - 1, y: cy - floorH / 2 + 1, w: bodyW - 2 * wall + 2, h: floorH - 2 },
        left: { x: leftX, y: wy, w: winW, h: wh },
        right: { x: rightX, y: wy, w: winW, h: wh },
        numA: { x: midX + numW / 2, y: cy },
        numB: { x: midX + numW * 1.5, y: cy },
      };
    });
    return {
      W, H, wide, region, trayR, F, P, roofH, groundH, over, wall, padH, u, rodH, floorH, numW, numFs,
      winW, bodyW, houseH, bottom, top, cx, bodyX, floorsTop, midX, rows,
      groundTop: floorsTop + F * floorH,
    };
  }

  relayout() {
    if (this.leaving) return;
    this.gen++;
    const L = this.L = this.computeLayout(this.scale.width, this.scale.height);
    this.drawBackground();
    this.drawHud();
    this.buildHouse();
    const t = L.trayR;
    this.tray.layout(t.x, t.y, t.w, t.h, L.wide);
    this.dropRect.setTo(L.bodyX - L.over, L.top, L.bodyW + 2 * L.over, L.houseH);
    this.tray.dropZone = this.dropRect;
    if (this.phase !== 'play') this.tray.setVisible(false);
    if (this.phase === 'end' && this.end) this.showEndPanel(this.end.stars, this.end.result, true);
  }

  // ---------------------------------------------------------------- background + HUD
  drawBackground() {
    const L = this.L, th = this.theme;
    this.bgL.list.slice().forEach(o => killDeep(this, o));
    this.bgL.removeAll(true);
    const g = this.add.graphics();
    g.fillGradientStyle(th.sky, th.sky, 0xffffff, 0xffffff, 1).fillRect(0, 0, L.W, L.H);
    const gy = L.bottom - 4;
    g.fillStyle(th.ground, 1).fillRect(0, gy, L.W, L.H - gy);
    g.fillStyle(0xffffff, 0.25).fillRect(0, gy, L.W, 5);
    g.fillStyle(th.ground, 0.6).fillEllipse(L.cx, gy + 2, L.bodyW + 2 * L.over + 60, 26);
    this.bgL.add(g);
    // drifting clouds
    const clouds = [[0.18, 0.2], [0.72, 0.32], [0.45, 0.1]];
    for (const [fxr, fyr] of clouds) {
      const cy = TOP + (L.top - TOP) * fyr + 10;
      if (cy > L.top + L.roofH) continue;
      const c = this.add.container(L.W * fxr, Math.max(20, cy)).setAlpha(0.85);
      c.add([this.add.image(-16, 4, 'puff').setScale(1.1), this.add.image(10, -4, 'puff').setScale(1.4), this.add.image(34, 5, 'puff').setScale(1)]);
      this.bgL.add(c);
      if (!reducedMotion()) this.tweens.add({ targets: c, x: c.x + 24, duration: 5200 + fxr * 3000, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    }
    // world decorations beside the house, on the ground line
    const side = (L.region.w - L.bodyW) / 2 - L.over;
    if (side > 34) {
      const fs = Math.round(clamp(side * 0.45, 20, 40));
      for (const x of [L.region.x + side * 0.45, L.region.x + L.region.w - side * 0.45]) {
        this.bgL.add(this.add.text(x, L.bottom - fs * 0.45, this.theme.emoji, { fontSize: `${fs}px`, padding: { x: 2, y: 4 } }).setOrigin(0.5));
      }
    }
  }

  drawHud() {
    this.hudL.list.slice().forEach(o => killDeep(this, o));
    this.hudL.removeAll(true);
    if (this.phase === 'play') {
      const c = this.add.container(36, 36);
      const g = this.add.graphics();
      g.fillStyle(0x000000, 0.15).fillCircle(0, 3, 25);
      g.fillStyle(0xffffff, 0.95).fillCircle(0, 0, 25);
      g.lineStyle(3, 0xfde68a, 1).strokeCircle(0, 0, 25);
      g.fillStyle(UI.ink, 1).fillTriangle(-13, 0, -2, -11, -2, 11).fillRoundedRect(-4, -4.5, 17, 9, 3);
      c.add(g);
      c.setSize(56, 56).setInteractive({ hitArea: new Phaser.Geom.Circle(28, 28, 30), hitAreaCallback: Phaser.Geom.Circle.Contains, useHandCursor: true });
      c.on('pointerdown', () => { sfx.tick(2); this.tweens.add({ targets: c, scale: 0.88, duration: 70, yoyo: true }); });
      c.on('pointerup', () => this.goMap(null));
      this.hudL.add(c);
    }
    const wd = WORLDS[this.w - 1];
    const x0 = this.phase === 'play' ? 72 : 16;
    const avail = this.L.W - x0 - 150;
    const t1 = this.add.text(x0, 24, `數字屋 ${this.theme.emoji}`, textStyle(22, '#1f2937', { resolution: DPR, padding: { x: 2, y: 4 } })).setOrigin(0, 0.5);
    const t2 = this.add.text(x0, 50, `W${this.w} ${wd.en} · Number House`, textStyle(12, '#475569', { resolution: DPR, padding: { x: 1, y: 2 } })).setOrigin(0, 0.5);
    const k = Math.min(1, avail / Math.max(t1.width, t2.width));
    if (k < 1) { t1.setScale(k); t2.setScale(k); }
    this.hudL.add([t1, t2]);
  }

  // ---------------------------------------------------------------- house
  buildHouse() {
    const L = this.L, s = this;
    this.tweens.killTweensOf(this.houseL);
    this.houseL.list.slice().forEach(o => killDeep(this, o));
    this.houseL.removeAll(true);
    this.q = null;
    if (this.buddy) { killDeep(this, this.buddy); this.buddy.destroy(); }
    this.buddy = null;
    this.rowObjs = [];
    const done = this.phase !== 'play';
    const g = this.add.graphics();
    this.houseL.add(g);
    const right = L.bodyX + L.bodyW;

    // chimney (behind the roof)
    const chX = L.cx + L.bodyW * 0.27, chW = clamp(L.roofH * 0.32, 12, 26);
    const roofYAt = x => L.floorsTop - L.roofH * (1 - Math.abs(x - L.cx) / (L.bodyW / 2 + L.over));
    const chTop = roofYAt(chX + chW) - L.roofH * 0.42;
    g.fillStyle(0xb45309, 1).fillRect(chX, chTop, chW, L.floorsTop - chTop - 4);
    g.fillStyle(0x7c2d12, 1).fillRect(chX - 3, chTop - 5, chW + 6, 7);
    this.chimney = { x: chX + chW / 2, y: chTop - 6 };

    // walls
    g.fillStyle(0x000000, 0.1).fillRect(L.bodyX + 5, L.floorsTop + 6, L.bodyW, L.houseH - L.roofH);
    g.fillStyle(WALL, 1).fillRect(L.bodyX, L.floorsTop, L.bodyW, L.houseH - L.roofH);
    g.lineStyle(3, WALL_EDGE, 0.8).strokeRect(L.bodyX, L.floorsTop, L.bodyW, L.houseH - L.roofH);
    // floor lines and centre divider (the textbook table)
    g.lineStyle(2, WALL_EDGE, 0.25);
    for (let i = 1; i <= L.F; i++) g.lineBetween(L.bodyX + 3, L.floorsTop + i * L.floorH, right - 3, L.floorsTop + i * L.floorH);
    const midLine = L.midX + L.numW;
    g.lineStyle(2, WALL_EDGE, 0.35).lineBetween(midLine, L.floorsTop + 4, midLine, L.groundTop - 4);

    // roof
    const th = this.theme;
    const rl = L.bodyX - L.over, rr = right + L.over;
    g.fillStyle(0x000000, 0.12).fillTriangle(rl + 4, L.floorsTop + 6, L.cx + 4, L.top + 6, rr + 4, L.floorsTop + 6);
    g.fillStyle(th.accent, 1).fillTriangle(rl, L.floorsTop + 2, L.cx, L.top, rr, L.floorsTop + 2);
    g.lineStyle(3, 0xffffff, 0.75).strokeTriangle(rl, L.floorsTop + 2, L.cx, L.top, rr, L.floorsTop + 2);
    g.fillStyle(0x000000, 0.15).fillRect(rl, L.floorsTop, rr - rl, 5);

    // roof badge with N
    const br = clamp(L.roofH * 0.4, 16, 42);
    const by = L.floorsTop - br - 4;
    this.badge = this.add.container(L.cx, by);
    const bg = this.add.graphics();
    bg.fillStyle(0x000000, 0.15).fillCircle(2, 3, br);
    bg.fillStyle(0xffffff, 1).fillCircle(0, 0, br);
    bg.lineStyle(4, UI.gold, 1).strokeCircle(0, 0, br);
    this.badge.add([bg, txt(this, 0, 1, this.house.n, br * 1.15, '#1f2937')]);
    this.badge.r = br;
    this.houseL.add(this.badge);

    // ground floor with the door
    const doorH = L.groundH - 6, doorW = clamp(doorH * 0.72, 22, 46);
    const doorX = L.cx - doorW / 2, doorY = L.groundTop + 5;
    g.fillStyle(0x451a03, 1).fillRoundedRect(doorX, doorY, doorW, doorH + 2, { tl: doorW / 2, tr: doorW / 2, bl: 0, br: 0 });
    g.fillStyle(0xfde68a, 0.35).fillEllipse(L.cx, doorY + doorH * 0.7, doorW * 0.8, doorH * 0.5);
    g.fillStyle(0x9ca3af, 1).fillRect(doorX - 6, L.bottom - 4, doorW + 12, 5); // step
    // little flower boxes beside the door
    for (const sx of [-1, 1]) {
      const fx0 = L.cx + sx * (doorW / 2 + L.groundH * 0.9);
      if (Math.abs(fx0 - L.cx) + 18 > L.bodyW / 2) continue;
      const bx = doorY + doorH * 0.45, bh = doorH * 0.4;
      g.fillStyle(0xdbeafe, 1).fillRoundedRect(fx0 - 14, doorY + 2, 28, bx - doorY - 2, 4);
      g.lineStyle(2, FRAME, 1).strokeRoundedRect(fx0 - 14, doorY + 2, 28, bx - doorY - 2, 4);
      g.fillStyle(0xb45309, 1).fillRoundedRect(fx0 - 16, bx, 32, bh, 3);
      [0xef4444, UI.gold, 0xec4899].forEach((col, k) => g.fillStyle(col, 1).fillCircle(fx0 - 9 + k * 9, bx - 1, 3.5));
    }
    const door = this.door = this.add.graphics({ x: doorX, y: doorY });
    door.fillStyle(0xb45309, 1).fillRoundedRect(0, 0, doorW, doorH + 2, { tl: doorW / 2, tr: doorW / 2, bl: 0, br: 0 });
    door.lineStyle(2, 0x7c2d12, 1).strokeRoundedRect(0, 0, doorW, doorH + 2, { tl: doorW / 2, tr: doorW / 2, bl: 0, br: 0 });
    door.lineStyle(2, 0x7c2d12, 0.5).lineBetween(doorW / 2, doorH * 0.3, doorW / 2, doorH);
    door.fillStyle(UI.gold, 1).fillCircle(doorW * 0.8, doorH * 0.6, Math.max(2, doorW * 0.07));
    this.doorInfo = { x: doorX, y: doorY, w: doorW, h: doorH };
    this.houseL.add(door);
    if (done) door.setVisible(false);

    // floors
    const arrowsG = this.arrowsG = this.add.graphics();
    const frameG = this.add.graphics();
    this.activeG = this.add.graphics();
    const winLayer = [];
    const textLayer = [];
    L.rows.forEach((row, i) => {
      const f = this.floors[i];
      const lw = this.add.graphics(), rw = this.add.graphics();
      winLayer.push(lw, rw);
      const o = { row, lw, rw, numA: null, numB: null, q: null, rodA: null, rodB: null };
      this.drawWin(lw, row.left, done ? 'lit' : 'glass');
      this.drawWin(rw, row.right, f.filled ? 'lit' : 'empty');
      if (f.a === f.b) {
        const r = row.rect;
        frameG.fillStyle(UI.gold, 0.18).fillRoundedRect(r.x, r.y, r.w, r.h, 6);
        frameG.lineStyle(4, UI.gold, 1).strokeRoundedRect(r.x, r.y, r.w, r.h, 6);
        frameG.fillStyle(UI.gold, 1);
        for (const [sx, sy] of [[r.x, r.y], [r.x + r.w, r.y], [r.x, r.y + r.h], [r.x + r.w, r.y + r.h]]) frameG.fillCircle(sx, sy, 4);
      }
      o.numA = txt(this, row.numA.x, row.numA.y, f.a, L.numFs, CSS_A);
      textLayer.push(o.numA);
      if (f.filled) { o.numB = txt(this, row.numB.x, row.numB.y, f.b, L.numFs, CSS_B); textLayer.push(o.numB); }
      this.rowObjs.push(o);
    });
    this.houseL.add([frameG, ...winLayer, arrowsG, this.activeG, ...textLayer]);
    this.rodsC = this.add.container(0, 0);
    this.houseL.add(this.rodsC);
    L.rows.forEach((row, i) => {
      const f = this.floors[i], o = this.rowObjs[i];
      o.rodA = this.makeHouseRod(f.a, row.left.x + row.left.w - L.padH - f.a * L.u, row.cy);
      if (f.filled) o.rodB = this.makeHouseRod(f.b, row.right.x + L.padH, row.cy);
      if (done) { o.rodA.mood('happy', 0); if (o.rodB) o.rodB.mood('happy', 0); }
    });
    this.arrowK = this.doneCount() >= 3 ? this.doneCount() : 0;
    this.drawArrows(this.arrowK);
    if (this.phase === 'play') this.activate(this.activeIndex(), false);
    if (done) this.makeBuddy(false);
    s.houseL.setAlpha(1).setY(0);
  }

  makeHouseRod(len, x, y) {
    const rod = new Rod(this, x, y, len, { unit: this.L.u, labels: false });
    this.rodsC.add(rod);
    return rod;
  }

  introHouse() {
    if (reducedMotion()) return;
    this.houseL.setAlpha(0).setY(24);
    this.tweens.add({ targets: this.houseL, alpha: 1, y: 0, duration: 380, ease: 'Back.easeOut' });
    const b = this.badge;
    b.setScale(0.1);
    this.tweens.add({ targets: b, scale: 1, duration: 420, delay: 260, ease: 'Back.easeOut', onStart: () => sfx.star(0) });
  }

  drawWin(g, r, mode) {
    g.clear();
    const rad = Math.min(8, r.h * 0.25);
    if (mode === 'lit' || mode === 'flash') {
      g.fillStyle(0xfde047, mode === 'flash' ? 0.7 : 0.35).fillRoundedRect(r.x - 4, r.y - 3, r.w + 8, r.h + 6, rad + 3);
    }
    g.fillStyle(WIN_FILL[mode], 1).fillRoundedRect(r.x, r.y, r.w, r.h, rad);
    if (mode === 'empty' || mode === 'bad') {
      g.lineStyle(2.5, mode === 'bad' ? UI.bad : 0x94a3b8, 1);
      dashedRoundRect(g, r.x, r.y, r.w, r.h, rad);
    } else {
      if (mode === 'glass') g.lineStyle(2, 0xffffff, 0.8).lineBetween(r.x + 6, r.y + r.h - 5, r.x + Math.min(r.h, r.w * 0.3), r.y + 4);
      g.lineStyle(3, mode === 'glass' ? FRAME : 0xd97706, 1).strokeRoundedRect(r.x, r.y, r.w, r.h, rad);
    }
  }

  /** Highlight floor i as the one to fill. */
  activate(i, animate = true) {
    const o = this.rowObjs[i];
    this.tweens.killTweensOf(this.activeG);
    this.activeG.clear().setAlpha(1);
    if (this.q) { this.tweens.killTweensOf(this.q); this.q.destroy(); this.q = null; }
    if (!o) return;
    const r = o.row.rect;
    this.activeG.lineStyle(4, ACTIVE, 1).strokeRoundedRect(r.x - 2, r.y - 1, r.w + 4, r.h + 2, 7);
    this.activeG.fillStyle(ACTIVE, 0.08).fillRoundedRect(r.x - 2, r.y - 1, r.w + 4, r.h + 2, 7);
    this.tweens.add({ targets: this.activeG, alpha: 0.35, duration: 650, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    const q = this.q = txt(this, o.row.numB.x, o.row.numB.y, '?', this.L.numFs, '#94a3b8');
    this.houseL.addAt(q, this.houseL.getIndex(this.rodsC));
    this.tweens.add({ targets: q, y: q.y - Math.min(5, this.L.floorH * 0.12), duration: 420, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    const rod = o.rodA;
    if (animate && rod) {
      rod.mood('happy', 500);
      this.tweens.add({ targets: rod, y: rod.y - 4, duration: 120, yoyo: true, ease: 'Quad.easeOut' });
    }
  }

  // ---------------------------------------------------------------- pattern arrows
  /** Arrows over the numeral columns covering floors 0..k-1 (k may be fractional while growing). */
  drawArrows(k) {
    const g = this.arrowsG, L = this.L;
    g.clear();
    if (k < 1) return;
    const y0 = L.floorsTop + 4, y1 = L.floorsTop + k * L.floorH - 2;
    const sw = Math.max(5, L.numW * 0.26), hw = Math.max(12, L.numW * 0.72), hh = Math.min(L.floorH * 0.45, hw * 0.8);
    for (const [x, col] of [[L.rows[0].numA.x, COL_A], [L.rows[0].numB.x, COL_B]]) {
      g.fillStyle(col, 0.2).fillRoundedRect(x - sw / 2, y0, sw, Math.max(0, y1 - y0 - hh), sw / 2);
      g.fillStyle(col, 0.28).fillTriangle(x - hw / 2, y1 - hh, x + hw / 2, y1 - hh, x, y1);
    }
  }

  /** Grow the arrows to cover `k` floors; the first time also play the pattern (numerals pop in order). */
  growArrows(k) {
    const from = this.arrowK;
    this.arrowK = k;
    const st = { v: Math.max(0, from) };
    this.tweens.add({ targets: st, v: k, duration: dur(from ? 260 : 520), ease: 'Sine.easeOut', onUpdate: () => this.drawArrows(st.v) });
    if (from === 0) this.playPattern(k);
  }

  playPattern(k) {
    const gen = this.gen;
    for (let i = 0; i < k; i++) {
      this.time.delayedCall(260 + i * 130, () => {
        if (gen !== this.gen) return;
        const o = this.rowObjs[i];
        const pop = t => t && this.tweens.add({ targets: t, scale: 1.4, duration: 110, yoyo: true, ease: 'Quad.easeOut' });
        pop(o.numA); pop(o.numB);
        sfx.tick(3 + i);
      });
    }
  }

  // ---------------------------------------------------------------- play
  onChoose(rod) {
    if (this.phase !== 'play' || this.busy) {
      rod.bounceBack({ quiet: true }).then(() => { if (rod.active) rod._busy = false; });
      return;
    }
    const i = this.activeIndex(), f = this.floors[i];
    if (rod.len === f.b) { this.place(rod, i); return; }
    this.mistakes++;
    this.tray.returnRod(rod);
    const o = this.rowObjs[i], gen = this.gen;
    this.drawWin(o.rw, o.row.right, 'bad');
    this.time.delayedCall(320, () => { if (gen === this.gen && !this.floors[i].filled) this.drawWin(o.rw, o.row.right, 'empty'); });
    if (o.rodA) o.rodA.mood('sad', 600);
  }

  async place(rod, i) {
    const L = this.L, f = this.floors[i], gen = this.gen;
    this.busy = true;
    this.tray.setEnabled(false);
    f.filled = true;
    if (rod.hit.input) rod.hit.disableInteractive();
    reparent(rod, null);
    rod.setDepth(50);
    if (Math.abs(rod.unit - L.u) > 0.01) rod.morphUnit(L.u);
    this.refillTray(rod.len);
    this.activate(-1);
    const row = L.rows[i];
    await rod.snapTo(row.right.x + L.padH, row.cy);
    if (this.leaving) return;
    if (gen !== this.gen) { // rebuilt (resize) while flying: the new house already shows this rod
      if (rod.active) rod.destroy();
      if (this.doneCount() === this.floors.length) { this.win(); return; }
      this.busy = false; this.tray.setEnabled(true); return;
    }
    reparent(rod, this.rodsC);
    rod.setDepth(0);
    const o = this.rowObjs[i];
    o.rodB = rod;
    rod.mood('happy', 700);
    if (o.rodA) o.rodA.mood('happy', 700);
    this.drawWin(o.rw, row.right, 'flash');
    this.time.delayedCall(140, () => { if (gen === this.gen) this.drawWin(o.rw, row.right, 'lit'); });
    sfx.tick(i + 2);
    const wx = row.right.x + row.right.w / 2;
    fx.burst(this, wx, row.cy, { count: 8 });
    const nb = o.numB = txt(this, row.numB.x + 18, row.numB.y, f.b, L.numFs, CSS_B).setAlpha(0);
    this.houseL.addAt(nb, this.houseL.getIndex(this.rodsC));
    this.tweens.add({ targets: nb, x: row.numB.x, alpha: 1, duration: dur(240), ease: 'Back.easeOut' });
    if (f.a === f.b) {
      fx.burst(this, L.cx, row.cy, { count: 12, tint: [UI.gold, 0xffffff] });
      fx.floatText(this, L.cx, row.cy - 10, '一樣！Twins!', '#ca8a04');
      sfx.star(2);
    }
    const k = this.doneCount();
    if (k >= 3) this.growArrows(k);
    if (k === this.floors.length) { this.win(); return; }
    this.activate(this.activeIndex());
    this.busy = false;
    this.tray.setEnabled(true);
  }

  /** The chosen rod moved into the house: a fresh copy pops into its place on the tray. */
  refillTray(len) {
    this.tray.setRods(this.house.tray, { unit: TRAY_UNIT, labels: false });
    for (const r of this.tray.rods) {
      this.tweens.killTweensOf(r.lift);
      if (r.len === len) { r.popIn(120); } else r.lift.setScale(1);
    }
  }

  // ---------------------------------------------------------------- win
  async win() {
    this.phase = 'win';
    this.busy = true;
    this.tray.setEnabled(false);
    const gen = this.gen, L = this.L;
    this.activate(-1);
    this.drawHud(); // back button goes away: the result is being saved
    this.tweens.add({ targets: this.tray, alpha: 0, duration: 300, onComplete: () => this.tray.setVisible(false) });

    const stars = starsFor(this.mistakes);
    const key = levelKey(this.w, 'boss');
    const saving = Promise.resolve()
      .then(() => this.bridge.complete(key, stars))
      .catch(e => { console.warn('house complete', e); return { newBest: false, sticker: null }; });

    // lights run bottom → top, window by window
    const step = 80;
    let n = 0;
    for (let i = L.F - 1; i >= 0; i--) {
      for (const side of ['lw', 'rw']) {
        const k = n++;
        this.time.delayedCall(k * step, () => {
          if (gen !== this.gen) return;
          const o = this.rowObjs[i], r = side === 'lw' ? o.row.left : o.row.right;
          this.drawWin(o[side], r, 'flash');
          const rod = side === 'lw' ? o.rodA : o.rodB;
          if (rod && rod.active) { rod.mood('happy', 0); rod.glow(); }
          sfx.tick(k % 12);
          this.time.delayedCall(170, () => { if (gen === this.gen) this.drawWin(o[side], r, 'lit'); });
        });
      }
    }
    await sleep(this, n * step + 150);
    if (gen !== this.gen) return this.finishWin(saving, stars);
    // roof number shines
    sfx.star(3);
    fx.burst(this, L.cx, this.badge.y, { count: 12, tint: [UI.gold, 0xffffff] });
    this.tweens.add({ targets: this.badge, scale: 1.3, duration: 180, yoyo: true, ease: 'Quad.easeOut' });
    this.drawArrows(L.F);
    this.playPattern(L.F);
    await sleep(this, 250);
    if (gen !== this.gen) return this.finishWin(saving, stars);
    // door swings open on its hinge
    sfx.whoosh();
    await new Promise(res => this.tweens.add({ targets: this.door, scaleX: 0.02, duration: dur(420), ease: 'Cubic.easeIn', onComplete: res, onStop: res }));
    if (gen !== this.gen) return this.finishWin(saving, stars);
    this.door.setVisible(false);
    this.makeBuddy(true);
    sfx.fanfare();
    fx.fireworks(this);
    this.smoke();
    await sleep(this, 1500);
    return this.finishWin(saving, stars);
  }

  async finishWin(saving, stars) {
    if (this.end || this.leaving) return;
    const result = await saving;
    if (this.leaving || this.end) return;
    this.end = { stars, result };
    this.showEndPanel(stars, result);
  }

  smoke() {
    if (reducedMotion() || !this.chimney) return;
    const gen = this.gen;
    for (let i = 0; i < 4; i++) {
      this.time.delayedCall(i * 260, () => {
        if (gen !== this.gen) return;
        const p = this.add.image(this.chimney.x, this.chimney.y, 'puff').setScale(0.35).setAlpha(0.9).setDepth(5);
        this.tweens.add({ targets: p, y: p.y - 50, x: p.x + 14, scale: 1, alpha: 0, duration: 1100, ease: 'Sine.easeOut', onComplete: () => p.destroy() });
      });
    }
  }

  /** The world's rod buddy steps out of the door and waves. */
  makeBuddy(animate) {
    const L = this.L, len = WORLDS[this.w - 1].sticker;
    const bu = clamp(Math.min(L.bodyW * 0.8, L.region.w * 0.8) / len, 10, 30);
    const rh = Math.max(22, bu * 1.4);
    // tall: on the grass below the house; wide: beside the house, where the tray was
    const y = L.wide ? L.bottom - rh / 2 + 4 : Math.min(L.bottom + rh * 1.1, L.H - rh / 2 - 12);
    const bx = L.wide ? clamp(L.trayR.x + L.trayR.w / 2, (len * bu) / 2 + 8, L.W - (len * bu) / 2 - 8) : L.cx;
    const c = this.buddy = this.add.container(bx, y).setDepth(950); // stays above the end panel's dim
    const rod = new Rod(this, -(len * bu) / 2, 0, len, { unit: bu, labels: true });
    c.add(rod);
    rod.mood('happy', 0);
    const wave = () => this.tweens.add({ targets: c, angle: { from: -10, to: 10 }, duration: 320, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    if (!animate) { wave(); return; }
    const d = this.doorInfo;
    c.setPosition(L.cx, d.y + d.h / 2).setScale(0.08);
    sfx.boing(len);
    this.tweens.add({
      targets: c, x: bx, y, scale: 1, duration: dur(L.wide ? 650 : 480), ease: 'Back.easeOut',
      onComplete: () => { fx.puff(this, bx, y + rh / 2); sfx.toot(); wave(); },
    });
    this.tweens.add({ targets: c, angle: { from: -25, to: 0 }, duration: dur(480), ease: 'Quad.easeOut' });
  }

  // ---------------------------------------------------------------- end panel
  /** Stars drop one by one; Replay / Map. `instant` redraws the final state (after a resize). */
  showEndPanel(stars, result, instant = false) {
    this.phase = 'end';
    if (this.panelL) { this.panelL.list.slice().forEach(o => killDeep(this, o)); this.panelL.destroy(); }
    if (this.shine) { this.shine.destroy(); this.shine = null; }
    const W = this.scale.width, H = this.scale.height;
    const P = this.panelL = this.add.container(0, 0).setDepth(900);
    const dim = this.add.rectangle(0, 0, W, H, 0x0f172a, instant ? 0.4 : 0).setOrigin(0).setInteractive();
    P.add(dim);
    if (!instant) this.tweens.add({ targets: dim, fillAlpha: 0.4, duration: 250 });

    const hasSticker = !!(result && result.sticker);
    const cw = Math.min(W - 32, 400), ch = hasSticker ? 330 : 300;
    // tall screens: sit a little high so the waving buddy stays visible below the card
    const cx = W / 2, cy = clamp(H / 2 - (W < H ? H * 0.06 : 0), ch / 2 + 12, H - ch / 2 - 12);
    const card = this.add.container(cx, cy);
    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.18).fillRoundedRect(-cw / 2 + 3, -ch / 2 + 7, cw, ch, 26);
    g.fillStyle(UI.paper, 1).fillRoundedRect(-cw / 2, -ch / 2, cw, ch, 26);
    g.lineStyle(5, UI.gold, 1).strokeRoundedRect(-cw / 2, -ch / 2, cw, ch, 26);
    card.add(g);
    const top = -ch / 2;
    card.add(txt(this, 0, top + 40, '數字屋完成！', 30, '#1f2937'));
    card.add(txt(this, 0, top + 74, 'Number House complete!', 16, '#475569'));

    const sy = top + 136, gap = Math.min(92, (cw - 40) / 3);
    const slots = [-1, 0, 1].map(k => ({ x: k * gap, y: sy }));
    for (const s of slots) card.add(this.add.image(s.x, s.y, 'star').setScale(2.5).setTint(0xe5e7eb));
    const bigStars = [];
    for (let i = 0; i < stars; i++) {
      const st = this.add.image(slots[i].x, slots[i].y, 'star').setScale(2.7).setTint(UI.gold);
      card.add(st);
      bigStars.push(st);
      if (instant) continue;
      st.setVisible(false);
      this.time.delayedCall(350 + i * 300, () => {
        if (!st.active) return;
        st.setVisible(true).setY(sy - 150).setAngle(-40);
        this.tweens.add({
          targets: st, y: sy, angle: 0, duration: dur(320), ease: 'Bounce.easeOut',
          onComplete: () => {
            sfx.star(i);
            fx.burst(this, cx + slots[i].x, cy + sy, { count: 8 });
            if (i === 2) fx.shake(this);
            if (i === stars - 1) {
              fx.confetti(this);
              if (stars === 3 && result && result.newBest) this.shineSweep(cx, cy + sy, cw);
            }
          },
        });
      });
    }
    let by = top + 206;
    if (hasSticker) {
      const stx = txt(this, 0, top + 196, '📒 新貼紙！New sticker!', 18, '#c2410c');
      card.add(stx);
      if (!instant) { stx.setScale(0); this.tweens.add({ targets: stx, scale: 1, delay: 350 + stars * 300, duration: 300, ease: 'Back.easeOut', onStart: () => sfx.page() }); }
      by = top + 238;
    }
    const bw = Math.min(150, (cw - 48) / 2), bh = 56;
    const replay = this.panelButton(-bw / 2 - 8, by + bh / 2, bw, bh, '再玩', 'Replay', 0xffffff, 0xfbbf24, '#1f2937', () => this.leave('House', { w: this.w }));
    const map = this.panelButton(bw / 2 + 8, by + bh / 2, bw, bh, '地圖', 'Map', UI.good, 0x15803d, '#ffffff', () => this.goMap({ key: levelKey(this.w, 'boss'), stars, ...(result || {}) }));
    card.add([replay, map]);
    P.add(card);
    if (!instant) {
      card.setScale(0.6).setAlpha(0);
      this.tweens.add({ targets: card, scale: 1, alpha: 1, duration: dur(320), ease: 'Back.easeOut' });
    }
  }

  panelButton(x, y, w, h, zh, en, fill, edge, color, onTap) {
    const c = this.add.container(x, y);
    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.15).fillRoundedRect(-w / 2 + 1, -h / 2 + 5, w, h, 18);
    g.fillStyle(fill, 1).fillRoundedRect(-w / 2, -h / 2, w, h, 18);
    g.lineStyle(3, edge, 1).strokeRoundedRect(-w / 2, -h / 2, w, h, 18);
    c.add([g, txt(this, 0, -8, zh, 20, color), txt(this, 0, 14, en, 12, color)]);
    c.setSize(w, h).setInteractive({ useHandCursor: true });
    c.on('pointerdown', () => { sfx.tick(4); this.tweens.add({ targets: c, scale: 0.92, duration: 70, yoyo: true }); });
    c.on('pointerup', onTap);
    return c;
  }

  shineSweep(x, y, cw) {
    const band = this.shine = this.add.graphics().setDepth(950);
    const bh = 90, bw = 46;
    band.fillStyle(0xffffff, 0.55).fillPoints([{ x: 0, y: -bh / 2 }, { x: bw, y: -bh / 2 }, { x: bw - 24, y: bh / 2 }, { x: -24, y: bh / 2 }], true);
    band.fillStyle(UI.gold, 0.35).fillRect(bw * 0.3, -bh / 2, 8, bh);
    const mask = this.make.graphics({ add: false });
    mask.fillStyle(0xffffff).fillRoundedRect(x - cw / 2 + 12, y - bh / 2, cw - 24, bh, 16);
    band.setMask(mask.createGeometryMask());
    band.setPosition(x - cw / 2 - bw, y);
    sfx.star(4);
    this.tweens.add({ targets: band, x: x + cw / 2, duration: 700, ease: 'Sine.easeInOut', repeat: 1, repeatDelay: 500, onComplete: () => { band.destroy(); mask.destroy(); if (this.shine === band) this.shine = null; } });
  }

  // ---------------------------------------------------------------- navigation
  goMap(justDone) {
    const w = this.w;
    if (justDone) this.leave('Map', { focusW: w + 1 <= 4 ? w + 1 : w, justDone });
    else this.leave('Map', { focusW: w });
  }

  leave(key, data) {
    if (this.leaving) return;
    this.leaving = true;
    this.tray.setEnabled(false);
    this.time.delayedCall(90, () => fx.iris(this, key, data));
  }
}
