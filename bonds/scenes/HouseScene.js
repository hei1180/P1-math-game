/**
 * 數字屋 Number House — the boss of each world (Rod Town 數棒鎮). Owner redesign 2026-09-25.
 *
 * N sits on the roof and a question rod of length N lies right under it (N ≥ 11: orange 10 + (N − 10),
 * one train). Below, a rod box holds a shuffled pile: for every floor (a | N − a) of splitsOf(N) one rod a
 * and one rod N − a. The child finds floors: tap / drag a first rod → it moves to the workbench (the next
 * empty floor row, same left edge as the question rod); a second rod lines up after it.
 *   - sum = N and this ordered pair is new → both glow, squash and merge into one two-colour train that
 *     stays as the floor (numerals a | b beside it; twin floor gold).
 *   - sum ≠ N, or the pair was found already → both bounce back to their pile spots (sad), the workbench
 *     flashes red, one mistake.
 *   - tapping the rod on the workbench sends it back (no mistake).
 * Floors appear in found order; when the house is full they slide into order (a ascending top → bottom),
 * the pattern arrows grow, the lights run bottom → top, the door opens and every floor's train hops out
 * (floor order, staggered) to line up on the ground — happy faces, ♪ / ✨ puffs, equation chips, a jumping
 * wave, the twin floor spins — fireworks, end panel with stars (the parade stays visible beside / below it).
 * The sticker itself is a map thing (bridge.complete + the sticker book); the panel only says so.
 *
 * Start data: { w }  (1..4); dev/test: { w, n } with n one of the world's boss numbers.
 * Test hook: scene.__test = { n, floors, phase (getters), remaining(), pick(len), mistakes(),
 *            bench(), tapBench(), pile(), layout(), parade() }
 */
import { WORLDS, RODS, houseFor, splitsOf, starsFor, levelKey } from '../../bonds-logic.js?v=202609251810';
import { UI, WORLD_THEME, textStyle } from '../theme.js?v=202609251810';
import { fx } from '../fx.js?v=202609251810';
import { sfx } from '../sfx.js?v=202609251810';
import { Rod, DPR, dur, sleep, tweenP, reparent, worldPos, reducedMotion, darker } from '../ui/Rod.js?v=202609251810';
import { T, domLeft, backButton, makeBubble, pillButton, drawStarSlot, drawPanel, dropStar, newBestBadge, shineStars } from '../ui/Chrome.js?v=202609251810';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const TOP0 = 66; // below the back button and the DOM mute/admin cluster
const M = 10;
const U_MAX = 32, U_MIN = 9; // house unit range (rod height = unit)
const P_MIN = 9; // smallest pile unit
const TOUCH = 44; // minimum touch zone (px)
const BOX_PAD = 8, P_GAP = 2; // rod box inner padding; gap between neighbouring touch zones
const GAP = 8; // house ↔ box
const END_MSG = { 3: ['完美！', 'Perfect!'], 2: ['好叻！', 'Great job!'], 1: ['做得好！', 'Well done!'] };
const COL_A = 0x2563eb, COL_B = 0xea580c; // numeral columns / pattern arrows
const CSS_A = '#2563eb', CSS_B = '#ea580c';
const WALL = 0xfffbeb, WALL_EDGE = 0x78350f, FRAME = 0x92400e, ACTIVE = 0xf97316;

const txt = (scene, x, y, s, size, color = '#1f2937', extra = {}) =>
  scene.add.text(x, y, String(s), textStyle(size, color, { resolution: DPR, padding: { x: 2, y: 3 }, ...extra })).setOrigin(0.5);

const touchW = (len, u) => Math.max(len * u + 8, TOUCH);
const touchH = u => Math.max(TOUCH, u + 16);

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

/**
 * One continuous body for a train of rods (same linked-square look as Rod.js): each part keeps its colour,
 * the joint between the parts is an ordinary square joint (no end caps, no seam). Origin = left-centre.
 */
function drawTrainBody(g, lens, u) {
  g.clear();
  const total = lens.reduce((s, l) => s + l, 0), W = total * u, h = u, T = -h / 2;
  const r = Math.max(2, Math.min(u * 0.22, 9));
  const b = Math.max(1, u * 0.075), ri = Math.max(1, Math.min(u * 0.16, 6));
  const edgeOf = len => (len === 1 ? 0x94a3b8 : darker(RODS[len].hex, 28));
  g.fillStyle(0x000000, 0.18).fillRoundedRect(3, h * 0.2, W - 6, h * 0.42, Math.min(r, h * 0.2));
  let x0 = 0;
  lens.forEach((len, si) => {
    const hex = RODS[len].hex, white = len === 1, w = len * u;
    const first = si === 0, last = si === lens.length - 1;
    g.fillStyle(white ? 0xdfe5ec : darker(hex, 9), 1).fillRoundedRect(x0, T, w, h, { tl: first ? r : 0, bl: first ? r : 0, tr: last ? r : 0, br: last ? r : 0 });
    for (let i = 0; i < len; i++) {
      const x = x0 + i * u;
      g.fillStyle(hex, 1).fillRoundedRect(x + b, T + b * 0.7, u - 2 * b, h - b * 1.9, ri);
      g.fillStyle(0xffffff, white ? 0.9 : 0.3).fillRoundedRect(x + b + ri * 0.4, T + b * 0.7 + Math.max(1, u * 0.04), u - 2 * b - ri * 0.8, h * 0.15, Math.min(ri * 0.6, h * 0.07));
    }
    x0 += w;
  });
  x0 = 0;
  lens.forEach((len, si) => {
    g.lineStyle(Math.max(1, u * 0.045), edgeOf(len), len === 1 ? 0.8 : 0.6);
    for (let i = si ? 0 : 1; i < len; i++) g.lineBetween(x0 + i * u, T + 1, x0 + i * u, T + h - 1);
    x0 += len * u;
  });
  x0 = 0;
  const lw = Math.max(1.5, u * 0.05), P = Math.PI;
  lens.forEach((len, si) => {
    const first = si === 0, last = si === lens.length - 1, x1 = x0 + len * u;
    g.lineStyle(lw, edgeOf(len), 1);
    const a = first ? x0 + r : x0, z = last ? x1 - r : x1;
    g.lineBetween(a, T, z, T).lineBetween(a, T + h, z, T + h);
    const arc = (cx, cy, a0, a1) => { g.beginPath(); g.arc(cx, cy, r, a0, a1, false); g.strokePath(); };
    if (first) { arc(x0 + r, T + r, P, P * 1.5); arc(x0 + r, T + h - r, P / 2, P); g.lineBetween(x0, T + r, x0, T + h - r); }
    if (last) { arc(x1 - r, T + r, -P / 2, 0); arc(x1 - r, T + h - r, 0, P / 2); g.lineBetween(x1, T + r, x1, T + h - r); }
    x0 = x1;
  });
}

/** Show / hide a rod's own body + shadow (the faces and hair stay) so a train body can stand in for it. */
function hideBody(rod, hide = true) {
  if (rod.bodyG) rod.bodyG.setVisible(!hide);
  if (rod.shadow) rod.shadow.setVisible(!hide);
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
    const forced = Math.round(Number(this.startData.n));
    this.n = WORLDS[w - 1].boss.includes(forced) ? forced : houseFor(w, Math.random).n;
    this.splits = splitsOf(this.n);
    this.F = this.splits.length;
    // the pile: one rod a and one rod N − a per floor; r1..r3 fix its shuffled order / spot across relayouts
    this.items = [];
    for (const [a, b] of this.splits) {
      for (const len of [a, b]) this.items.push({ id: this.items.length, len, r1: Math.random(), r2: Math.random(), r3: Math.random(), gone: false });
    }
    this.seed = Math.random(); // pile packing order
    // a wrong pair on the workbench may run past the question rod; keep at least 4 units of overshoot on screen
    this.maxSum = Math.min(2 * Math.max(...this.items.map(it => it.len)), this.n + 4);
    this.found = []; // { a, b } in found order
    this.sorted = false;
    this.bench = []; // Rod[] on the workbench (0..2)
    this.locked = false; // second rod in flight: the workbench is being judged
    this.press = null;
    this.mistakes = 0;
    this.startedAt = Date.now(); // for the attempt log's durationSec
    this.phase = 'play'; // 'play' → 'win' (celebration) → 'end' (panel)
    this.leaving = false;
    this.gen = 0; // bumped by every rebuild; async steps drop out when it changes
    this.arrowK = 0;
    this.end = null;
    this.firstBuild = true;
    this.__fxLive = { n: 0 };

    this.bgL = this.add.container(0, 0).setDepth(-10);
    this.houseL = this.add.container(0, 0).setDepth(0);
    this.boxL = this.add.container(0, 0).setDepth(5);
    this.looseC = this.add.container(0, 0).setDepth(20); // pile + workbench rods, world coordinates
    this.hudL = this.add.container(0, 0).setDepth(100);
    this.bubble = makeBubble(this).setDepth(99);
    this.bubble.stroke = this.theme.accent;
    this.setBubble();

    this.input.on('pointermove', this.onMove, this);
    this.input.on('pointerup', this.onUp, this);
    this.input.on('pointerupoutside', this.onUp, this);

    this.relayout();
    this.introHouse();
    this.firstBuild = false;

    const self = this;
    this.__test = {
      get n() { return self.n; },
      get floors() { return self.found.map(f => [f.a, f.b]); },
      get phase() { return self.phase; },
      remaining: () => self.splits.filter(([a, b]) => !self.found.some(f => f.a === a && f.b === b)).map(p => p.slice()),
      mistakes: () => self.mistakes,
      /** Simulate tapping a pile rod of length `len`. */
      pick: len => {
        if (self.phase !== 'play' || self.locked || self.bench.length >= 2 || self.press) return false;
        const rod = self.pileRods().find(r => r.len === len && !r._busy);
        if (!rod) return false;
        rod.pick();
        return self.toBench(rod);
      },
      bench: () => self.bench.map(r => r.len),
      /** Simulate tapping the rod on the workbench (sends it back). */
      tapBench: () => {
        const rod = self.bench[0];
        if (!rod || self.bench.length !== 1 || self.locked || rod._busy) return false;
        rod.pick();
        self.fromBench(rod);
        return true;
      },
      /** Pile rods in reading order (top row first, left → right). */
      pile: () => self.pileRods().map(r => ({ len: r.len, x: Math.round(r.home.x), y: Math.round(r.home.y) }))
        .sort((p, q) => Math.round((p.y - q.y) / 12) || p.x - q.x),
      /** The finale parade: one entry per train (centre, scale, equation). */
      parade: () => (self.paradeL && self.paradeL.active ? self.paradeL.list.filter(c => c.tc).map(c => ({ x: Math.round(c.x), y: Math.round(c.y), s: +c.scaleX.toFixed(2), eq: c.eq })) : []),
      layout: () => { const L = self.L; return { u: L.u, uP: L.uP, wide: L.wide, house: { x: L.bodyX, y: L.top, w: L.bodyW, h: L.houseH }, box: { x: L.box.x, y: L.box.y, w: L.box.width, h: L.box.height }, rows: L.pileRows }; },
    };

    fx.irisIn(this);
    this.onResize = () => {
      if (this.resizeTimer) this.resizeTimer.remove();
      this.resizeTimer = this.time.delayedCall(120, () => { this.resizeTimer = null; this.relayout(); });
    };
    this.scale.on('resize', this.onResize);
    this.events.once('shutdown', () => {
      this.scale.off('resize', this.onResize);
      this.input.off('pointermove', this.onMove, this);
      this.input.off('pointerup', this.onUp, this);
      this.input.off('pointerupoutside', this.onUp, this);
      this.leaving = true;
      this.gen++;
    });
  }

  setBubble() {
    const n = this.n, k = this.found.length, F = this.F;
    this.bubble.setText('🏠', `找兩條棒砌成 ${n}　${k} / ${F}`, `Find two rods that make ${n} · ${k} / ${F}`);
  }

  pileRods() { return this.looseC.list.filter(r => r.active && r.where === 'pile'); }
  rowY(i) { return this.L.rowsTop + (i + 0.5) * this.L.fPitch; }

  // ---------------------------------------------------------------- layout
  /** House sizes for unit u. */
  dims(u) {
    const gapF = clamp(u * 0.25, 3, 12);
    const fPitch = u + gapF;
    const qPitch = u + clamp(u * 0.5, 8, 16);
    const roofH = clamp(u * 2, 32, 88);
    const groundH = clamp(u * 1.5, 22, 56);
    const fs = clamp(fPitch * 0.78, 12, 30);
    const wall = 5, padL = clamp(u * 0.5, 6, 14), gapN = clamp(u * 0.45, 6, 14), padR = 6;
    const numW = fs * 2.9 + 4;
    const bodyW = 2 * wall + padL + this.n * u + gapN + numW + padR;
    const over = clamp(bodyW * 0.035, 6, 18);
    const houseH = roofH + 3 + qPitch + this.F * fPitch + 3 + groundH;
    return { u, gapF, fPitch, qPitch, roofH, groundH, fs, wall, padL, gapN, numW, bodyW, over, w: bodyW + 2 * over, houseH };
  }

  /** House centre x inside `region` so a too-long (wrong) pair still shows its overshoot on screen; null if impossible. */
  placeHouse(d, region, W) {
    const trainOff = -d.bodyW / 2 + d.wall + d.padL;
    const minCx = region.x + d.over + d.bodyW / 2;
    const maxCx = W - 4 - this.maxSum * d.u - trainOff;
    const cx = Math.min(region.x + region.w / 2, maxCx);
    return cx < minCx - 0.5 ? null : cx;
  }

  /**
   * Pack the pile (all items; found ones keep their empty spots) into nRows rows of width innerW; null if it
   * doesn't fit. `shuffled`: try random orders first (deterministic per game via this.seed, so a relayout keeps
   * the same pile), then noisier-to-cleaner "largest first" orders, then plain largest first; rows in random order.
   */
  packRows(u, innerW, nRows, shuffled = false) {
    const tw = it => touchW(it.len, u);
    const attempt = order => {
      const rows = Array.from({ length: nRows }, () => ({ items: [], w: 0 }));
      for (const it of order) {
        let best = null;
        for (const r of rows) {
          const need = r.w + (r.items.length ? P_GAP : 0) + tw(it);
          if (need <= innerW && (!best || r.w < best.w)) best = r;
        }
        if (!best) return null;
        best.w += (best.items.length ? P_GAP : 0) + tw(it);
        best.items.push(it);
      }
      return rows.map(r => r.items);
    };
    const ffd = () => attempt(this.items.slice().sort((p, q) => tw(q) - tw(p) || p.id - q.id));
    if (!shuffled) return ffd();
    const rnd = (i, j) => { const x = Math.sin(i * 12.9898 + j * 78.233 + this.seed * 997) * 43758.5453; return x - Math.floor(x); };
    let rows = null;
    for (let j = 0; !rows && j < 6; j++) rows = attempt(this.items.slice().sort((p, q) => rnd(p.id, j) - rnd(q.id, j)));
    for (let j = 1; !rows && j <= 24; j++) {
      const noise = 2 * (1 - j / 24);
      const key = it => tw(it) * (1 + noise * (rnd(it.id, 40 + j) - 0.5));
      rows = attempt(this.items.slice().sort((p, q) => key(q) - key(p)));
    }
    rows = rows || ffd();
    return rows && rows.map((r, i) => [rnd(i, 99), r]).sort((a, b) => a[0] - b[0]).map(x => x[1]);
  }

  /** Smallest row count that packs at unit u inside box (largest-first check), and the most rows that fit; null if none. */
  pileFit(box, u) {
    const iw = box.w - 2 * BOX_PAD, ih = box.h - 2 * BOX_PAD;
    const maxRows = Math.floor(ih / touchH(u));
    const total = this.items.reduce((s, it) => s + touchW(it.len, u) + P_GAP, 0);
    for (let r = Math.max(1, Math.ceil(total / (iw + P_GAP))); r <= maxRows; r++) if (this.packRows(u, iw, r)) return { r0: r, maxRows };
    return null;
  }

  bestPileUnit(box, uMax) {
    for (let u = Math.min(uMax, U_MAX); u >= P_MIN; u -= 0.5) if (this.pileFit(box, u)) return u;
    return null;
  }

  /** Shuffled pile spots: rows spread over the box, random gaps inside a row, a little random height. */
  planPile(box, u) {
    const f = this.pileFit(box, u) || { r0: 1, maxRows: 1 };
    const iw = box.w - 2 * BOX_PAD, ih = box.h - 2 * BOX_PAD, ix = box.x + BOX_PAD, iy = box.y + BOX_PAD;
    const want = Math.min(f.maxRows, Math.max(f.r0, Math.ceil(this.items.length / 2.5)));
    const rows = this.packRows(u, iw, want, true) || this.packRows(u, iw, f.r0, true) || [this.items.slice()];
    const pitch = ih / rows.length, hh = touchH(u);
    const spots = {};
    rows.forEach((row, ri) => {
      const its = row.slice().sort((p, q) => p.r1 - q.r1);
      const widths = its.map(it => touchW(it.len, u));
      const slack = Math.max(0, iw - widths.reduce((s, v) => s + v, 0) - P_GAP * (its.length - 1));
      const wts = [0.1 + its[0].r3 * 0.8, ...its.map(it => 0.1 + it.r2)];
      const tot = wts.reduce((s, v) => s + v, 0);
      let x = ix + (slack * wts[0]) / tot;
      const cy = iy + (ri + 0.5) * pitch;
      its.forEach((it, j) => {
        const jit = (it.r3 * 2 - 1) * Math.max(0, (pitch - hh) / 2) * 0.85;
        spots[it.id] = { x: x + (widths[j] - it.len * u) / 2, y: cy + jit };
        x += widths[j] + P_GAP + (slack * wts[j + 1]) / tot;
      });
    });
    return { spots, rows: rows.length };
  }

  computeLayout(W, H, TOP) {
    const wide = W > H * 1.1;
    let best = null;
    if (wide) {
      const hw = Math.round(W * 0.58);
      const groundPad = Math.round(clamp(H * 0.04, 10, 30));
      const region = { x: M, y: TOP, w: hw - M, h: H - TOP - M - groundPad };
      const box = { x: hw + M, y: TOP, w: W - hw - 2 * M, h: H - TOP - M };
      for (let u = U_MAX; u >= U_MIN; u -= 0.5) {
        const d = this.dims(u);
        if (d.houseH > region.h || d.w > region.w) continue;
        const cx = this.placeHouse(d, region, W);
        if (cx === null) continue;
        best = { d, cx, region, box, top: region.y + region.h - d.houseH };
        break;
      }
      if (!best) { const d = this.dims(U_MIN); best = { d, cx: region.x + region.w / 2, region, box, top: region.y + region.h - d.houseH }; }
      best.uP = this.bestPileUnit(box, best.d.u) || P_MIN;
    } else {
      const region = { x: M, y: TOP, w: W - 2 * M, h: H - TOP - M };
      for (let u = U_MAX; u >= U_MIN; u -= 0.5) {
        const d = this.dims(u);
        if (d.w > region.w) continue;
        const cx = this.placeHouse(d, region, W);
        if (cx === null) continue;
        const box = { x: M, y: TOP + d.houseH + GAP, w: W - 2 * M, h: region.h - d.houseH - GAP };
        if (box.h < TOUCH + 2 * BOX_PAD) continue;
        const uP = this.bestPileUnit(box, u);
        if (!uP) continue;
        const score = uP + 0.6 * u;
        if (!best || score > best.score + 1e-9) best = { d, cx, region: { ...region, h: d.houseH }, box, uP, score, top: TOP };
      }
      if (!best) {
        const d = this.dims(U_MIN);
        const box = { x: M, y: TOP + d.houseH + GAP, w: W - 2 * M, h: Math.max(TOUCH + 2 * BOX_PAD, region.h - d.houseH - GAP) };
        best = { d, cx: W / 2, region: { ...region, h: d.houseH }, box, uP: P_MIN, top: TOP };
      }
    }
    const { d, cx, region, box, uP, top } = best;
    const pile = this.planPile(box, uP);
    const bodyX = cx - d.bodyW / 2;
    const floorsTop = top + d.roofH;
    const rowsTop = floorsTop + 3 + d.qPitch;
    const groundTop = rowsTop + this.F * d.fPitch + 3;
    const trainX = bodyX + d.wall + d.padL;
    const numAx = trainX + this.n * d.u + d.gapN + d.fs * 0.5;
    return {
      ...d, W, H, TOP, wide, region, uP, cx, bodyX, top, floorsTop, rowsTop, groundTop, trainX,
      bottom: groundTop + d.groundH, n: this.n, F: this.F,
      qY: floorsTop + 3 + d.qPitch / 2,
      numAx, barX: numAx + d.fs * 0.85, numBx: numAx + d.fs * 1.7,
      box: new Phaser.Geom.Rectangle(box.x, box.y, box.w, box.h),
      trayR: box, pile: pile.spots, pileRows: pile.rows,
    };
  }

  relayout() {
    if (this.leaving) return;
    this.gen++;
    this.press = null;
    const W = this.scale.width, H = this.scale.height;
    this.drawHud();
    const b = this.bubbleRect;
    this.L = this.computeLayout(W, H, b ? b.y + b.h + (b.row ? 6 : 10) : TOP0);
    if (b) this.bubble.setVisible(true).layout(b.x, b.y, b.w, b.h); else this.bubble.setVisible(false);
    this.drawBackground();
    this.buildHouse();
    this.buildPile();
    if (this.phase === 'end' && this.end) this.showEndPanel(this.end.stars, this.end.result, true);
    else if (this.phase === 'play' && this.found.length === this.F) this.win(); // rebuilt mid-merge of the last floor
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
    const clouds = [[0.18, 0.2], [0.72, 0.32], [0.45, 0.1]];
    for (const [fxr, fyr] of clouds) {
      const cy = L.TOP + (L.top - L.TOP) * fyr + 10;
      if (cy > L.top + L.roofH) continue;
      const c = this.add.container(L.W * fxr, Math.max(20, cy)).setAlpha(0.85);
      c.add([this.add.image(-16, 4, 'puff').setScale(1.1), this.add.image(10, -4, 'puff').setScale(1.4), this.add.image(34, 5, 'puff').setScale(1)]);
      this.bgL.add(c);
      if (!reducedMotion()) this.tweens.add({ targets: c, x: c.x + 24, duration: 5200 + fxr * 3000, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    }
    // world decorations beside the house, on the ground line
    const side = Math.min(L.bodyX - L.over - L.region.x, L.region.x + L.region.w - (L.bodyX + L.bodyW + L.over));
    if (side > 34) {
      const fs = Math.round(clamp(side * 0.45, 20, 40));
      for (const x of [L.bodyX - L.over - side * 0.5, L.bodyX + L.bodyW + L.over + side * 0.5]) {
        this.bgL.add(this.add.text(x, L.bottom - fs * 0.45, this.theme.emoji, { fontSize: `${fs}px`, padding: { x: 2, y: 4 } }).setOrigin(0.5));
      }
    }
  }

  drawHud() {
    this.hudL.list.slice().forEach(o => killDeep(this, o));
    this.hudL.removeAll(true);
    const W = this.scale.width, H = this.scale.height;
    if (this.phase === 'play') this.hudL.add(backButton(this, () => this.goMap(null)).setPosition(34, 36));
    const wd = WORLDS[this.w - 1];
    const x0 = this.phase === 'play' ? 66 : 16, domL = domLeft(this);
    const t1 = this.add.text(x0, 24, `${this.theme.emoji} W${this.w} · 數字屋`, T(20)).setOrigin(0, 0.5);
    const t2 = this.add.text(x0, 50, `Number House · ${wd.en}`, T(12, '#475569', { padding: { x: 1, y: 2 } })).setOrigin(0, 0.5);
    const k = Math.min(1, (domL - x0) / Math.max(t1.width, t2.width));
    if (k < 1) { t1.setScale(Math.max(0.6, k)); t2.setScale(Math.max(0.6, k)); }
    this.hudL.add([t1, t2]);
    // bubble slot: the title row when wide enough, else a row of its own
    const leftR = x0 + Math.max(t1.displayWidth, t2.displayWidth) + 14, rowW = domL - leftR;
    if (rowW >= 330) { const w = Math.min(rowW, 620); this.bubbleRect = { x: leftR + (rowW - w) / 2, y: 6, w, h: 64, row: false }; }
    else { const h = H >= 760 ? 64 : 54; this.bubbleRect = { x: 10, y: 68, w: W - 20, h, row: true }; }
  }

  // ---------------------------------------------------------------- house
  buildHouse() {
    const L = this.L;
    this.tweens.killTweensOf(this.houseL);
    this.houseL.list.slice().forEach(o => killDeep(this, o));
    this.houseL.removeAll(true);
    this.clearParade();
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
    const wallH = L.bottom - L.floorsTop;
    g.fillStyle(0x000000, 0.1).fillRect(L.bodyX + 5, L.floorsTop + 6, L.bodyW, wallH);
    g.fillStyle(WALL, 1).fillRect(L.bodyX, L.floorsTop, L.bodyW, wallH);
    g.lineStyle(3, WALL_EDGE, 0.8).strokeRect(L.bodyX, L.floorsTop, L.bodyW, wallH);
    // floor lines (the textbook table) and the line under the question row
    g.lineStyle(2, WALL_EDGE, 0.2);
    for (let i = 1; i <= L.F; i++) g.lineBetween(L.bodyX + 3, L.rowsTop + i * L.fPitch, right - 3, L.rowsTop + i * L.fPitch);
    g.lineStyle(3, WALL_EDGE, 0.45).lineBetween(L.bodyX + 3, L.rowsTop, right - 3, L.rowsTop);
    const divX = L.trainX + L.n * L.u + L.gapN / 2;
    g.lineStyle(2, WALL_EDGE, 0.18).lineBetween(divX, L.rowsTop + 3, divX, L.groundTop - 3);

    // roof
    const th = this.theme;
    const rl = L.bodyX - L.over, rr = right + L.over;
    g.fillStyle(0x000000, 0.12).fillTriangle(rl + 4, L.floorsTop + 6, L.cx + 4, L.top + 6, rr + 4, L.floorsTop + 6);
    g.fillStyle(th.accent, 1).fillTriangle(rl, L.floorsTop + 2, L.cx, L.top, rr, L.floorsTop + 2);
    g.lineStyle(3, 0xffffff, 0.75).strokeTriangle(rl, L.floorsTop + 2, L.cx, L.top, rr, L.floorsTop + 2);
    g.fillStyle(0x000000, 0.15).fillRect(rl, L.floorsTop, rr - rl, 5);

    // roof badge with N
    const br = clamp(L.roofH * 0.4, 15, 40);
    this.badge = this.add.container(L.cx, L.floorsTop - br - 4);
    const bg = this.add.graphics();
    bg.fillStyle(0x000000, 0.15).fillCircle(2, 3, br);
    bg.fillStyle(0xffffff, 1).fillCircle(0, 0, br);
    bg.lineStyle(4, UI.gold, 1).strokeCircle(0, 0, br);
    this.badge.add([bg, txt(this, 0, 1, this.n, br * 1.15, '#1f2937')]);
    this.badge.r = br;
    this.houseL.add(this.badge);

    // ground floor with the door
    const doorH = L.groundH - 6, doorW = clamp(doorH * 0.72, 18, 46);
    const doorX = L.cx - doorW / 2, doorY = L.groundTop + 5;
    g.fillStyle(0x451a03, 1).fillRoundedRect(doorX, doorY, doorW, doorH + 2, { tl: doorW / 2, tr: doorW / 2, bl: 0, br: 0 });
    g.fillStyle(0xfde68a, 0.35).fillEllipse(L.cx, doorY + doorH * 0.7, doorW * 0.8, doorH * 0.5);
    g.fillStyle(0x9ca3af, 1).fillRect(doorX - 6, L.bottom - 4, doorW + 12, 5);
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

    this.buildQuestion();

    // floors: backgrounds, pattern arrows, workbench, trains + numerals
    this.floorBgL = this.add.container(0, 0);
    this.arrowsG = this.add.graphics();
    this.benchG = this.add.graphics();
    this.floorFgL = this.add.container(0, 0);
    this.houseL.add([this.floorBgL, this.arrowsG, this.benchG, this.floorFgL]);
    this.floorObjs = this.found.map((f, k) => this.buildFloor(f, this.sorted ? this.slotOf(f) : k));
    this.floorObjs.sort((p, q) => p.slot - q.slot);
    this.arrowK = done ? L.F : 0;
    this.drawArrows(this.arrowK);
    this.drawBench();
    if (done) {
      for (const o of this.floorObjs) o.tc.rods.forEach(r => r.mood('happy', 0));
      this.makeParade(false);
    }
    this.houseL.setAlpha(1).setY(0);
  }

  slotOf(f) { return this.splits.findIndex(([a]) => a === f.a); }

  /** Question row: the rod (or 10 + (N − 10) train) of length N under the roof, N beside it. */
  buildQuestion() {
    const L = this.L, y = L.qY;
    const g = this.add.graphics();
    const x0 = L.bodyX + L.wall + 2, w = L.bodyW - 2 * L.wall - 4, h = L.qPitch - 6;
    g.fillStyle(0xffffff, 0.85).fillRoundedRect(x0, y - h / 2, w, h, Math.min(8, h / 3));
    g.lineStyle(2, UI.gold, 1).strokeRoundedRect(x0, y - h / 2, w, h, Math.min(8, h / 3));
    this.houseL.add(g);
    const lens = this.n <= 10 ? [this.n] : [10, this.n - 10];
    this.qTrain = this.makeTrain(L.trainX, y, lens, L.u, null, true);
    this.houseL.add(this.qTrain);
    this.houseL.add(txt(this, L.barX, y, this.n, L.fs * 1.1, '#1f2937'));
  }

  /**
   * A train container at (x, y) (origin left-centre): one body for all parts + a Rod per part (faces).
   * `rods` = existing Rods to move in (the merge), else new ones are made. merged = body shown, rod bodies hidden.
   */
  makeTrain(x, y, lens, u, rods, merged) {
    const c = this.add.container(x, y);
    const body = this.add.graphics();
    drawTrainBody(body, lens, u);
    c.add(body);
    c.body = body;
    c.rods = [];
    let off = 0;
    lens.forEach((len, i) => {
      let rod = rods && rods[i];
      if (rod) { reparent(rod, c); this.tweens.killTweensOf(rod); rod.setScale(1); }
      else { rod = new Rod(this, 0, 0, len, { unit: u, labels: false }); c.add(rod); }
      rod.setPosition(off, 0);
      rod.where = 'floor';
      if (lens.length > 1) hideBody(rod, merged);
      c.rods.push(rod);
      off += len * u;
    });
    body.setVisible(lens.length > 1).setAlpha(merged ? 1 : 0);
    return c;
  }

  /** Found floor f in row `slot`: lit background (+ gold twin frame), the train, numerals a | b. */
  buildFloor(f, slot, rods = null) {
    const L = this.L, y = this.rowY(slot);
    const bg = this.add.graphics({ x: 0, y });
    this.floorBgL.add(bg);
    const fg = this.add.container(0, y);
    this.floorFgL.add(fg);
    const tc = this.makeTrain(L.trainX, 0, [f.a, f.b], L.u, rods, !rods);
    fg.add(tc);
    const nums = [txt(this, L.numAx, 0, f.a, L.fs, CSS_A), txt(this, L.barX, 0, '|', L.fs * 0.9, '#94a3b8'), txt(this, L.numBx, 0, f.b, L.fs, CSS_B)];
    fg.add(nums);
    const o = { f, slot, bg, fg, tc, nums };
    this.drawFloorBg(o, 'lit');
    return o;
  }

  drawFloorBg(o, mode) {
    const g = o.bg, L = this.L;
    if (!g.active) return;
    g.clear();
    if (mode === 'none') return;
    const r = { x: L.bodyX + L.wall + 1, y: -L.fPitch / 2 + 1, w: L.bodyW - 2 * L.wall - 2, h: L.fPitch - 2 };
    const rad = Math.min(6, r.h / 3);
    g.fillStyle(mode === 'flash' ? 0xfde047 : 0xfef3c7, mode === 'flash' ? 0.85 : 0.95).fillRoundedRect(r.x, r.y, r.w, r.h, rad);
    if (mode === 'ghost') { // the train went out to the parade: a dashed outline keeps its place
      g.lineStyle(2, WALL_EDGE, 0.35);
      dashedRoundRect(g, L.trainX, -L.u / 2, L.n * L.u, L.u, Math.max(2, Math.min(L.u * 0.22, 9)), Math.max(4, L.u * 0.4), Math.max(3, L.u * 0.25));
    }
    if (o.f.a === o.f.b) {
      g.fillStyle(UI.gold, 0.22).fillRoundedRect(r.x, r.y, r.w, r.h, rad);
      g.lineStyle(3, UI.gold, 1).strokeRoundedRect(r.x, r.y, r.w, r.h, rad);
      g.fillStyle(UI.gold, 1);
      for (const [sx, sy] of [[r.x, r.y], [r.x + r.w, r.y], [r.x, r.y + r.h], [r.x + r.w, r.y + r.h]]) g.fillCircle(sx, sy, 3.5);
    }
  }

  /** The workbench: the next empty floor row, pulsing, with a dashed outline as long as N. */
  drawBench(bad = false) {
    const g = this.benchG, L = this.L;
    if (!g || !g.active) return;
    this.tweens.killTweensOf(g);
    g.clear().setAlpha(1);
    if (this.phase !== 'play' || this.found.length >= this.F) return;
    g.setPosition(0, this.rowY(this.found.length));
    const r = { x: L.bodyX + L.wall + 1, y: -L.fPitch / 2 + 1, w: L.bodyW - 2 * L.wall - 2, h: L.fPitch - 2 };
    const rad = Math.min(6, r.h / 3);
    const col = bad ? UI.bad : ACTIVE;
    g.fillStyle(col, bad ? 0.3 : 0.1).fillRoundedRect(r.x, r.y, r.w, r.h, rad);
    g.lineStyle(bad ? 3 : 2.5, col, 1).strokeRoundedRect(r.x, r.y, r.w, r.h, rad);
    g.lineStyle(2, bad ? UI.bad : 0x94a3b8, 1);
    dashedRoundRect(g, L.trainX, -L.u / 2, L.n * L.u, L.u, Math.max(2, Math.min(L.u * 0.22, 9)), Math.max(4, L.u * 0.4), Math.max(3, L.u * 0.25));
    if (!bad && !reducedMotion()) this.tweens.add({ targets: g, alpha: 0.45, duration: 650, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  }

  flashBench() {
    const gen = this.gen;
    this.drawBench(true);
    this.time.delayedCall(360, () => { if (gen === this.gen) this.drawBench(); });
  }

  introHouse() {
    if (reducedMotion()) return;
    this.houseL.setAlpha(0).setY(24);
    this.tweens.add({ targets: this.houseL, alpha: 1, y: 0, duration: 380, ease: 'Back.easeOut' });
    const b = this.badge;
    b.setScale(0.1);
    this.tweens.add({ targets: b, scale: 1, duration: 420, delay: 260, ease: 'Back.easeOut', onStart: () => sfx.star(0) });
  }

  // ---------------------------------------------------------------- rod box (pile)
  buildPile() {
    const L = this.L;
    for (const c of [this.looseC, this.boxL]) {
      this.tweens.killTweensOf(c);
      c.list.slice().forEach(o => killDeep(this, o));
      c.removeAll(true);
    }
    this.bench = [];
    if (this.phase === 'play') this.locked = false;
    const B = L.box, g = this.add.graphics();
    g.fillStyle(0x000000, 0.1).fillRoundedRect(B.x + 2, B.y + 5, B.width - 4, B.height - 2, 18);
    g.fillStyle(0xfffbeb, 0.95).fillRoundedRect(B.x, B.y, B.width, B.height, 18);
    g.lineStyle(3, 0xd97706, 1).strokeRoundedRect(B.x, B.y, B.width, B.height, 18);
    this.boxL.add(g);
    let k = 0;
    for (const it of this.items) {
      if (it.gone) continue;
      const p = L.pile[it.id];
      const rod = new Rod(this, p.x, p.y, it.len, { unit: L.uP, labels: false });
      rod.item = it;
      rod.where = 'pile';
      rod.home = { x: p.x, y: p.y };
      this.looseC.add(rod);
      this.fitHit(rod);
      rod.hit.setInteractive({ useHandCursor: true });
      rod.hit.on('pointerdown', ptr => this.onDown(rod, ptr));
      if (this.firstBuild) rod.popIn(200 + (it.r1 * 0.7 + (k++ / this.items.length) * 0.3) * 700);
    }
    const show = this.phase === 'play';
    this.boxL.setVisible(show).setAlpha(1);
    this.looseC.setVisible(show).setAlpha(1);
  }

  /** Touch zone ≥ 44 × 44 px (short rods get a wider zone than their body). */
  fitHit(rod) {
    const u = rod.unit;
    rod.hit.setSize(Math.max(rod.len * u + 8, TOUCH), touchH(u));
  }

  // ---------------------------------------------------------------- input
  onDown(rod, p) {
    if (this.phase !== 'play' || this.press || rod._busy || !rod.active) return;
    if (rod.where === 'bench' && (this.locked || this.bench.length !== 1)) return;
    this.press = { rod, id: p.id, sx: p.worldX, sy: p.worldY, ox: rod.x - p.worldX, oy: rod.y - p.worldY, drag: false };
    this.looseC.bringToTop(rod);
    rod.pick();
  }

  onMove(p) {
    const pr = this.press;
    if (!pr || p.id !== pr.id || !pr.rod.active) return;
    if (!pr.drag && Math.hypot(p.worldX - pr.sx, p.worldY - pr.sy) > 10) pr.drag = true;
    if (pr.drag) pr.rod.setPosition(p.worldX + pr.ox, p.worldY + pr.oy);
  }

  onUp(p) {
    const pr = this.press;
    if (!pr || p.id !== pr.id) return;
    this.press = null;
    const rod = pr.rod;
    if (!rod.active) return;
    if (this.phase !== 'play') { rod.bounceBack({ quiet: true }); return; }
    if (rod.where === 'bench') { this.fromBench(rod); return; }
    const inBox = Phaser.Geom.Rectangle.Contains(this.L.box, p.worldX, p.worldY);
    if ((pr.drag && inBox) || this.locked || this.bench.length >= 2) { this.settle(rod); return; }
    this.toBench(rod);
  }

  /** Back to its pile spot, quietly (cancelled drag, or the workbench is busy). */
  settle(rod) {
    rod._busy = true;
    const gen = this.gen;
    rod.bounceBack({ quiet: true }).then(() => { if (rod.active && gen === this.gen) rod._busy = false; });
  }

  // ---------------------------------------------------------------- play
  /** A pile rod goes to the workbench: first slot at the question rod's left edge, second right after it. */
  toBench(rod) {
    const L = this.L, gen = this.gen;
    const slot = this.bench.length;
    if (this.phase !== 'play' || this.locked || slot >= 2) { this.settle(rod); return false; }
    this.bench.push(rod);
    rod.where = 'bench';
    rod._busy = true;
    const row = this.found.length;
    const x = L.trainX + (slot ? this.bench[0].len * L.u : 0), y = this.rowY(row);
    this.looseC.bringToTop(rod);
    if (Math.abs(rod.unit - L.u) > 0.01) rod.morphUnit(L.u);
    if (slot === 0) {
      rod.snapTo(x, y).then(() => { if (gen === this.gen && rod.active) rod._busy = false; });
      return true;
    }
    // second rod: judge now (so the hook and a quick next tap see the new state), animate after it lands
    this.locked = true;
    const first = this.bench[0], a = first.len, b = rod.len;
    const dup = this.found.some(f => f.a === a && f.b === b);
    const ok = a + b === this.n && !dup;
    let f = null;
    if (ok) {
      f = { a, b };
      this.found.push(f);
      first.item.gone = rod.item.gone = true;
      this.bench = [];
    }
    rod.snapTo(x, y).then(async () => {
      if (gen !== this.gen || !rod.active) return;
      if (ok) {
        this.locked = false;
        this.drawBench();
        this.merge(first, rod, row, f, gen);
        return;
      }
      await sleep(this, dur(200)); // a beat to see the train is too short / too long
      if (gen !== this.gen) return;
      this.reject(first, rod, dup ? { a, b } : null);
    });
    return true;
  }

  /** The workbench rod was tapped: back to the pile (no mistake). */
  fromBench(rod) {
    if (this.bench.length !== 1 || this.bench[0] !== rod || this.locked) { this.settle(rod); return; }
    this.bench = [];
    this.unbench(rod, false);
  }

  /** Workbench rod → its pile spot, shrinking back to the pile unit on the way. */
  unbench(rod, sad, sound = true) {
    const L = this.L, gen = this.gen;
    rod.where = 'pile';
    rod._busy = true;
    if (Math.abs(rod.unit - L.uP) > 0.01) rod.morphUnit(L.uP);
    this.fitHit(rod);
    const p = rod.bounceBack({ quiet: !(sad && sound) });
    if (sad && !sound) rod.mood('sad', 600);
    this.tweens.add({ targets: rod, scaleX: 1, scaleY: 1, duration: dur(350), ease: 'Quad.easeOut' });
    p.then(() => { if (rod.active && gen === this.gen) { rod._busy = false; rod.setScale(1); } });
  }

  reject(first, second, dup) {
    this.mistakes++;
    this.bench = [];
    this.flashBench();
    if (dup) {
      const o = this.floorObjs.find(q => q.f.a === dup.a && q.f.b === dup.b);
      if (o) {
        const gen = this.gen;
        this.drawFloorBg(o, 'flash');
        this.time.delayedCall(450, () => { if (gen === this.gen) this.drawFloorBg(o, 'lit'); });
        this.tweens.add({ targets: o.fg, x: { from: -4, to: 4 }, duration: 60, yoyo: true, repeat: 2, onComplete: () => o.fg.active && o.fg.setX(0) });
        this.note('已經有了！', 'Found already', this.L.trainX + (this.L.n * this.L.u) / 2, this.rowY(this.found.length) - this.L.u);
      }
    }
    this.unbench(first, true, true);
    this.unbench(second, true, false);
    this.locked = false;
  }

  /** Right pair: glow, squash, one two-colour train (no seam), click + burst, numerals slide in. */
  async merge(ra, rb, slot, f, gen) {
    const L = this.L;
    for (const r of [ra, rb]) if (r.hit.input) r.hit.disableInteractive();
    const o = this.buildFloor(f, slot, [ra, rb]);
    this.floorObjs.push(o);
    this.drawFloorBg(o, 'none');
    o.nums.forEach(t => t.setAlpha(0));
    ra.mood('happy', 900); rb.mood('happy', 900);
    sfx.tick(4);
    await Promise.all([ra.glow(), rb.glow()]);
    if (gen !== this.gen) return;
    await tweenP(this, { targets: o.tc, scaleY: 0.72, scaleX: 1.04, duration: dur(90), ease: 'Quad.easeIn' });
    if (gen !== this.gen) return;
    o.tc.body.setAlpha(1);
    hideBody(ra); hideBody(rb);
    sfx.snap();
    const y = this.rowY(slot);
    fx.burst(this, L.trainX + f.a * L.u, y, { count: 8 });
    this.drawFloorBg(o, 'flash');
    this.time.delayedCall(170, () => { if (gen === this.gen) this.drawFloorBg(o, 'lit'); });
    const settle = tweenP(this, { targets: o.tc, scaleY: 1, scaleX: 1, duration: dur(240), ease: 'Back.easeOut' });
    o.nums.forEach((t, i) => {
      const x = t.x;
      t.setX(x + 16);
      this.tweens.add({ targets: t, x, alpha: 1, duration: dur(240), delay: i * 50, ease: 'Back.easeOut' });
    });
    this.time.delayedCall(120, () => sfx.tick(6 + (this.found.length % 6)));
    if (f.a === f.b) {
      fx.burst(this, L.trainX + (L.n * L.u) / 2, y, { count: 12, tint: [UI.gold, 0xffffff] });
      fx.floatText(this, L.trainX + (L.n * L.u) / 2, y - 10, '一樣！Twins!', '#ca8a04');
      sfx.star(2);
    }
    this.setBubble();
    await settle;
    if (gen !== this.gen) return;
    if (this.phase === 'play' && this.found.length === this.F) this.win();
  }

  /** Small bilingual float note. */
  note(zh, en, x, y) {
    const c = this.add.container(x, y).setDepth(1001);
    c.add([this.add.text(0, -9, zh, T(20, '#dc2626', { stroke: '#ffffff', strokeThickness: 5 })).setOrigin(0.5),
      this.add.text(0, 12, en, T(12, '#dc2626', { stroke: '#ffffff', strokeThickness: 4 })).setOrigin(0.5)]);
    c.x = clamp(x, 80, this.scale.width - 80);
    this.tweens.add({ targets: c, y: y - 36, alpha: { from: 1, to: 0 }, duration: 1100, ease: 'Cubic.easeIn', onComplete: () => c.destroy() });
  }

  // ---------------------------------------------------------------- pattern arrows
  /** Arrows over the numeral columns covering floors 0..k-1 (k may be fractional while growing). */
  drawArrows(k) {
    const g = this.arrowsG, L = this.L;
    if (!g || !g.active) return;
    g.clear();
    if (k < 1) return;
    const y0 = L.rowsTop + 3, y1 = L.rowsTop + k * L.fPitch - 2;
    const sw = Math.max(5, L.fs * 0.45), hw = Math.max(12, L.fs * 1.1), hh = Math.min(L.fPitch * 0.45, hw * 0.8);
    for (const [x, col] of [[L.numAx, COL_A], [L.numBx, COL_B]]) {
      g.fillStyle(col, 0.2).fillRoundedRect(x - sw / 2, y0, sw, Math.max(0, y1 - y0 - hh), sw / 2);
      g.fillStyle(col, 0.28).fillTriangle(x - hw / 2, y1 - hh, x + hw / 2, y1 - hh, x, y1);
    }
  }

  growArrows(k) {
    const from = this.arrowK;
    this.arrowK = k;
    const st = { v: Math.max(0, from) };
    this.tweens.add({ targets: st, v: k, duration: dur(520), ease: 'Sine.easeOut', onUpdate: () => this.drawArrows(st.v) });
    this.playPattern(k);
  }

  playPattern(k) {
    const gen = this.gen;
    for (let i = 0; i < k; i++) {
      this.time.delayedCall(260 + i * 130, () => {
        if (gen !== this.gen) return;
        const o = this.floorObjs[i];
        if (!o) return;
        const pop = t => t && t.active && this.tweens.add({ targets: t, scale: 1.4, duration: 110, yoyo: true, ease: 'Quad.easeOut' });
        pop(o.nums[0]); pop(o.nums[2]);
        sfx.tick(3 + i);
      });
    }
  }

  // ---------------------------------------------------------------- win
  async win() {
    if (this.phase !== 'play') return;
    this.phase = 'win';
    this.sorted = true; // a rebuild from here on draws the floors in order
    this.locked = true;
    this.press = null;
    const gen = this.gen, L = this.L;
    this.drawBench();
    this.drawHud(); // back button goes away: the result is being saved
    this.bubble.setText('🎉', `${this.n} 的分法全部找到！`, `All the ways to make ${this.n}!`);
    this.tweens.add({
      targets: [this.boxL, this.looseC], alpha: 0, duration: 300,
      onComplete: () => { if (gen === this.gen) { this.boxL.setVisible(false); this.looseC.setVisible(false); } },
    });

    const stars = starsFor(this.mistakes);
    const key = levelKey(this.w, 'boss');
    const pr = this.bridge.progress;
    this.prevBest = (pr && pr.levels && pr.levels[key]) || 0; // best before this run: the map animates a medal upgrade
    const saving = Promise.resolve()
      .then(() => this.bridge.complete(key, stars, { mistakes: this.mistakes, durationSec: Math.round((Date.now() - this.startedAt) / 1000) }))
      .catch(e => { console.warn('house complete', e); return { newBest: false, sticker: null }; });

    await sleep(this, 300);
    if (gen !== this.gen) return this.finishWin(saving, stars);
    // 1. floors slide into order (a ascending, top → bottom); floors crossing each other swing aside
    let moved = false;
    for (const o of this.floorObjs) {
      const s = this.slotOf(o.f);
      if (s === o.slot) continue;
      const dir = s > o.slot ? 1 : -1;
      moved = true;
      o.slot = s;
      const y = this.rowY(s);
      this.tweens.add({ targets: [o.bg, o.fg], y, duration: dur(600), ease: 'Cubic.easeInOut' });
      if (!reducedMotion()) this.tweens.add({ targets: o.fg, x: dir * L.u * 0.7, duration: 300, yoyo: true, ease: 'Sine.easeInOut' });
    }
    this.floorObjs.sort((p, q) => p.slot - q.slot);
    if (moved) {
      sfx.whoosh();
      await sleep(this, dur(600) + 120);
      if (gen !== this.gen) return this.finishWin(saving, stars);
    }
    // 2. pattern arrows grow while the numerals pop in order
    this.growArrows(L.F);
    await sleep(this, 260 + L.F * 130 + 200);
    if (gen !== this.gen) return this.finishWin(saving, stars);
    // 3. lights run bottom → top
    const step = 110;
    for (let i = L.F - 1, k = 0; i >= 0; i--, k++) {
      this.time.delayedCall(k * step, () => {
        if (gen !== this.gen) return;
        const o = this.floorObjs[i];
        this.drawFloorBg(o, 'flash');
        o.tc.rods.forEach(r => { if (r.active) { r.mood('happy', 0); r.glow(); } });
        sfx.tick(k % 12);
        this.time.delayedCall(170, () => { if (gen === this.gen) this.drawFloorBg(o, 'lit'); });
      });
    }
    await sleep(this, L.F * step + 150);
    if (gen !== this.gen) return this.finishWin(saving, stars);
    // roof number and question rod shine
    sfx.star(3);
    fx.burst(this, L.cx, this.badge.y, { count: 12, tint: [UI.gold, 0xffffff] });
    this.tweens.add({ targets: this.badge, scale: 1.3, duration: 180, yoyo: true, ease: 'Quad.easeOut' });
    this.qTrain.rods.forEach(r => { r.mood('happy', 0); r.glow(); });
    await sleep(this, 250);
    if (gen !== this.gen) return this.finishWin(saving, stars);
    // door swings open on its hinge
    sfx.whoosh();
    await new Promise(res => this.tweens.add({ targets: this.door, scaleX: 0.02, duration: dur(420), ease: 'Cubic.easeIn', onComplete: res, onStop: res }));
    if (gen !== this.gen) return this.finishWin(saving, stars);
    this.door.setVisible(false);
    sfx.fanfare();
    fx.fireworks(this);
    this.smoke();
    const t = this.makeParade(true);
    await sleep(this, Math.max(1200, t + 350));
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

  // ---------------------------------------------------------------- finale parade
  clearParade() {
    if (this.paradeL) { killDeep(this, this.paradeL); this.paradeL.destroy(); }
    this.paradeL = null;
  }

  /**
   * Parade spots for F trains of length N: a grid (bottom-aligned, rows centred) in the free ground beside
   * or below where the end panel will sit (worst case: with the sticker line), never over its buttons.
   * Returns { u (display unit), gx, chips, cfs, list: [{ x, y (train centre), jump }] }.
   */
  paradeSpots(F) {
    const L = this.L, W = L.W, H = L.H, N = this.n, pb = this.panelBox(true);
    const regions = [];
    const y0 = Math.max(pb.y1 + 8, L.groundTop);
    regions.push({ x: M, y: y0, w: W - 2 * M, h: H - 8 - y0 }); // below the card, on the ground
    const x0 = Math.max(pb.x1, L.bodyX + L.bodyW + L.over) + 10;
    regions.push({ x: x0, y: L.TOP, w: W - 8 - x0, h: H - 8 - L.TOP }); // beside the card (where the rod box was)
    const gx = 10;
    let best = null;
    // wide screens: beside the card, where the rod box was (the ground band in front would hide the door)
    const order = L.wide ? [[regions[1]], regions] : [regions];
    for (const set of order) {
      if (best && best.u >= 12) break;
      best = null;
      for (const R of set) {
        if (R.w < N * 6 || R.h < 24) continue;
        for (let c = 1; c <= F; c++) {
          const rows = Math.ceil(F / c);
          const u = Math.min((R.w - (c - 1) * gx) / (c * N), R.h / rows / 1.9, 30);
          if (u <= 0) continue;
          if (!best || u > best.u + 0.5 || (u > best.u - 0.5 && rows < best.rows)) best = { R, c, rows, u };
        }
      }
    }
    if (!best) { // no free ground (tiny screen): a thin row along the bottom edge
      const R = { x: M, y: H - 40, w: W - 2 * M, h: 32 };
      best = { R, c: F, rows: 1, u: Math.max(3, (R.w - (F - 1) * 4) / (F * N)) };
    }
    const { R, c, rows, u } = best;
    const P = Math.min(R.h / rows, u * 2.6 + 18);
    const cfs = clamp(u * 0.6, 11, 16);
    const chips = P >= u * 1.45 + cfs * 1.3;
    const top = R.y + R.h - rows * P;
    const list = [];
    for (let i = 0; i < F; i++) {
      const r = Math.floor(i / c), k = i - r * c, nr = Math.min(c, F - r * c);
      const rowW = nr * N * u + (nr - 1) * gx;
      const x = R.x + (R.w - rowW) / 2 + k * (N * u + gx) + (N * u) / 2;
      const y = top + r * P + P - u / 2 - 3;
      list.push({ x, y, jump: clamp(P - u * 1.5 - 4, 0, u * 0.9) });
    }
    return { u, gx, chips, cfs, list };
  }

  /**
   * Finale: every floor's train (its own Rods, reparented — nothing new is built) hops out of the door in floor
   * order and lines up on the ground: happy faces, a ♪ / ✨ puff and an `a+b` chip on landing, the twin floor
   * spins, then a jumping wave runs along the line (lessMotion: one hop each, no spin, no wave loop).
   * The floors keep a dashed ghost outline and their numerals. `animate` false = final state (after a relayout).
   * Returns the ms until the last train has landed.
   */
  makeParade(animate) {
    const L = this.L, less = reducedMotion();
    this.clearParade();
    const P = this.paradeL = this.add.container(0, 0).setDepth(950); // above the end panel's dim, clear of its card
    const objs = this.floorObjs.slice().sort((p, q) => p.slot - q.slot);
    const F = objs.length, N = this.n;
    if (!F) return 0;
    const sp = this.paradeSpots(F);
    const s = sp.u / L.u, half = (N * L.u) / 2;
    const d = this.doorInfo, door = { x: L.cx, y: d.y + d.h * 0.6 };
    const sd = clamp((d.w * 0.9) / (N * L.u), 0.12, s); // squeezes through the doorway
    const S = dur(F > 6 ? 120 : 150), T1 = dur(170), T2 = dur(430);
    const last = animate ? (F - 1) * S + T1 + T2 : 0;
    const waveGap = 90, cycle = Math.max(700, F * waveGap + 400);
    const cheers = ['♪', '✨', '♫', '✨'];
    objs.forEach((o, i) => {
      const spot = sp.list[i], { a, b } = o.f, twin = a === b;
      const tc = o.tc, wp = worldPos(tc);
      const c = this.add.container(wp.x + half, wp.y);
      P.add(c);
      reparent(tc, c);
      c.tc = tc;
      c.eq = `${a}+${b}`;
      tc.rods.forEach(r => r.mood('happy', 0));
      const land = () => {
        if (!c.active) return;
        if (animate) {
          fx.puff(this, spot.x, spot.y + sp.u / 2);
          sfx.tick(3 + i);
          const t = this.add.text(spot.x + (i % 2 ? 1 : -1) * (N * sp.u) * 0.3, spot.y - sp.u * 0.6, cheers[i % 4],
            { fontSize: `${Math.round(clamp(sp.u * 0.9, 14, 26))}px`, color: '#f59e0b', padding: { x: 2, y: 4 } }).setOrigin(0.5);
          P.add(t);
          this.tweens.add({ targets: t, y: t.y - 28, alpha: { from: 1, to: 0 }, duration: 800, ease: 'Sine.easeOut', onComplete: () => t.destroy() });
          if (twin && !less) this.tweens.add({ targets: c, angle: { from: 0, to: 360 }, duration: 520, ease: 'Cubic.easeInOut' });
        }
        if (sp.chips) {
          const chip = this.add.text(0, (-sp.u * 0.95 - sp.cfs * 0.75) / s, c.eq,
            textStyle(sp.cfs, twin ? '#a16207' : '#1f2937', { resolution: DPR, backgroundColor: '#ffffffe6', padding: { x: 5, y: 2 } }))
            .setOrigin(0.5).setScale(1 / s);
          c.add(chip);
          chip.setAlpha(0);
          this.tweens.add({ targets: chip, alpha: 1, duration: 180, delay: animate && twin && !less ? 520 : 0 });
          this.tweens.add({ targets: chip, alpha: 0, duration: 300, delay: 1900, onComplete: () => chip.destroy() });
        }
      };
      // the jumping wave: one shared cycle, each train a beat after its left / upper neighbour
      if (spot.jump > 1) {
        this.tweens.add({
          targets: c, y: spot.y - spot.jump, duration: 200, yoyo: true, ease: 'Quad.easeOut',
          delay: last + 150 + i * waveGap, repeat: less ? 0 : -1, repeatDelay: cycle - 400,
        });
      }
      if (!animate) { c.setPosition(spot.x, spot.y).setScale(s); this.drawFloorBg(o, 'ghost'); land(); return; }
      // out through the door: shrink into the doorway, then a parabolic hop out to the spot
      const t0 = i * S;
      c.arcT = 0;
      this.tweens.add({
        targets: c, x: door.x, y: door.y, scale: sd, delay: t0, duration: T1, ease: 'Quad.easeIn',
        onStart: () => { this.drawFloorBg(o, 'ghost'); sfx.boing(Math.min(a, b)); },
      });
      const hH = (less ? 0.4 : 1) * clamp(Math.abs(spot.y - door.y) * 0.4 + 40, 50, 160);
      this.tweens.add({
        targets: c, arcT: 1, delay: t0 + T1, duration: T2, ease: 'Linear',
        onUpdate: () => {
          const t = c.arcT;
          c.setPosition(door.x + (spot.x - door.x) * t, door.y + (spot.y - door.y) * t - 4 * hH * t * (1 - t));
          c.setScale(sd + (s - sd) * Math.min(1, t * 1.6));
        },
        onComplete: land,
      });
    });
    if (animate) this.time.delayedCall(last + 60, () => { if (P.active) sfx.toot(); });
    return last;
  }

  // ---------------------------------------------------------------- end panel
  /** Where the end panel sits (card size PW × PH at scale k, centre cx, cy; screen box x0..x1, y0..y1). */
  panelBox(hasSticker) {
    const W = this.scale.width, H = this.scale.height;
    const PW = 400, PH = hasSticker ? 460 : 410;
    const k = Math.min(1, (W - 24) / PW, (H - 24) / PH);
    const h = PH * k;
    // tall screens: sit high so the parade stays visible on the ground below the card
    const cy = W < H ? clamp((H - h) * 0.2, 12, 70) + h / 2 : clamp(H / 2, h / 2 + 12, H - h / 2 - 12);
    const cx = W / 2;
    return { PW, PH, k, cx, cy, x0: cx - (PW * k) / 2, x1: cx + (PW * k) / 2, y0: cy - h / 2, y1: cy + h / 2 };
  }

  /** Same end panel as the levels: stars drop one by one; Replay / Map. `instant` redraws the final state (after a resize). */
  showEndPanel(stars, result, instant = false) {
    this.phase = 'end';
    if (this.panelL) { this.panelL.list.slice().forEach(o => killDeep(this, o)); this.panelL.destroy(); }
    const W = this.scale.width, H = this.scale.height, th = this.theme;
    const P = this.panelL = this.add.container(0, 0).setDepth(900);
    const dim = this.add.rectangle(0, 0, W, H, 0x0f172a, 0.45).setOrigin(0).setInteractive();
    P.add(dim);
    if (!instant) { dim.setAlpha(0); this.tweens.add({ targets: dim, alpha: 1, duration: 200 }); }

    const hasSticker = !!(result && result.sticker);
    const { PW, PH, k, cx, cy } = this.panelBox(hasSticker);
    const card = this.add.container(cx, cy);
    const g = this.add.graphics();
    drawPanel(g, PW, PH, th.accent);
    card.add(g);
    card.setSize(PW, PH).setInteractive();
    const top = -PH / 2;
    card.add(this.add.text(0, top + 46, '數字屋完成！', T(36)).setOrigin(0.5));
    card.add(this.add.text(0, top + 82, `Number House complete · W${this.w}`, T(15, '#64748b')).setOrigin(0.5));

    const sy = top + 181;
    const slots = [{ x: -104, y: sy + 16, r: 38 }, { x: 0, y: sy, r: 48 }, { x: 104, y: sy + 16, r: 38 }];
    const sg = this.add.graphics();
    for (const sl of slots) drawStarSlot(sg, sl.r, sl.x, sl.y);
    card.add(sg);
    const [mz, me] = END_MSG[stars];
    const msg = [this.add.text(0, top + 267, mz, T(24)).setOrigin(0.5), this.add.text(0, top + 295, me, T(14, '#64748b')).setOrigin(0.5)];
    card.add(msg);
    let stx = null;
    if (hasSticker) { stx = this.add.text(0, top + 334, '📒 新貼紙！New sticker!', T(18, '#c2410c')).setOrigin(0.5); card.add(stx); }

    const replay = pillButton(this, '🔁 再玩', 'Replay', { stroke: th.accent }, () => this.leave('House', { w: this.w }));
    const map = pillButton(this, '🗺 地圖', 'Map', { fill: 0xf97316, ink: '#ffffff', stroke: 0xffffff },
      () => this.goMap({ key: levelKey(this.w, 'boss'), stars, prev: this.prevBest || 0, ...(result || {}) }));
    replay.setPosition(-(replay.pw + 12) / 2, PH / 2 - 56);
    map.setPosition((map.pw + 12) / 2, PH / 2 - 56);
    card.add([replay, map]);
    P.add(card);
    card.setScale(k);

    if (instant) {
      for (let i = 0; i < stars; i++) {
        const st = dropStar(this, card, slots[i], i);
        this.tweens.killTweensOf(st);
        st.setPosition(slots[i].x, slots[i].y).setScale(1).setAlpha(1);
      }
      if (result && result.newBest) { const nb = newBestBadge(this, card, PW, PH); this.tweens.killTweensOf(nb); nb.setScale(1); }
      return;
    }
    card.setScale(k * 0.6).setAlpha(0);
    this.tweens.add({ targets: card, scale: k, alpha: 1, duration: dur(360), ease: 'Back.easeOut' });
    msg.forEach(o => o.setAlpha(0));
    if (stx) stx.setScale(0);
    this.tweens.add({ targets: map, scale: 1.06, duration: 700, yoyo: true, repeat: -1, delay: 1400, ease: 'Sine.easeInOut' });
    const t0 = 480, step = 300;
    for (let i = 0; i < stars; i++) this.time.delayedCall(t0 + i * step, () => { if (card.active) dropStar(this, card, slots[i], i); });
    this.time.delayedCall(t0 + (stars - 1) * step + 320, () => {
      if (!card.active) return;
      msg.forEach((o, i) => this.tweens.add({ targets: o, alpha: 1, y: { from: o.y + 10, to: o.y }, duration: dur(240), delay: i * 60 }));
      if (stx) this.tweens.add({ targets: stx, scale: 1, delay: 200, duration: 300, ease: 'Back.easeOut', onStart: () => sfx.page() });
      fx.confetti(this);
      if (result && result.newBest) newBestBadge(this, card, PW, PH);
      if (stars === 3 && result && result.newBest) shineStars(this, card, slots, 950);
    });
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
    this.locked = true;
    this.press = null;
    this.time.delayedCall(90, () => fx.iris(this, key, data));
  }
}
