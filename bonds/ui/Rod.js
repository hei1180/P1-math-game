/**
 * Rod buddy — one Cuisenaire rod with a face (Rod Town 數棒鎮).
 *
 * Look (spec §1 "Cuisenaire rods"): a row of `len` joined coloured squares (one per unit, linked-cube
 * bevel + separators), never a number. The right-end square carries a face, and every length is a
 * different character (1 baby, 2 pigtail girl, 3 cap boy, 4 lashes + clip girl, 5 glasses boy,
 * 6 flower-headband girl, 7 spiky-hair boy, 8 grandma, 9 bow-tie boy, 10 crown queen).
 * Hair / hats / crown reach at most ≈ 0.45·unit above the rod; the bow tie sits on square len−1.
 *
 * Contract (rt-common.md "UI objects"):
 *   new Rod(scene, x, y, len, { unit, labels = true })
 *     Container; origin = left-centre (x is the left edge, y the centre line);
 *     width = len * unit; height = unit (squares).
 *   rod.len, rod.home {x, y}
 *   rod.setUnit(unit)                 redraw at a new unit size (no animation)
 *   rod.pick()                        lift −12 px, stretch, shadow, wiggle, sfx.boing(len)
 *   rod.snapTo(x, y) -> Promise       fly (220 ms Back.easeOut), squash, dust puff, sfx.snap()
 *   rod.bounceBack(opts?) -> Promise  arc home (350 ms), sad face, sfx.bonk()
 *   rod.mood('happy'|'sad'|'cool'|'normal', ms?)   happy = squint + open smile, sad = frown,
 *                                     cool = sunglasses (replace 5's / 8's glasses)
 *   rod.glow() -> Promise             white shine sweeps left → right (300 ms)
 *   rod.setLabelVisible(bool)         API-compatible no-op: rods never show a number
 *
 * Extras (documented additions):
 *   rod.unit, rod.labels (stored only), rod.h (body height = unit), rod.hit (Phaser Zone, ≥ 44 px tall,
 *     not interactive until an owner calls rod.hit.setInteractive())
 *   rod.bounceBack({ quiet: true })   no sad face / no sound (used for a cancelled drag)
 *   rod.drop() -> Promise             settle back down after pick() without moving
 *   rod.morphUnit(unit)               redraw at `unit` but keep the on-screen size via scale;
 *                                     the next snapTo() eases scale back to 1
 *   rod.popIn(delay?)                 scale-in entrance
 *   rod.arcTo(x, y, { height, duration }) -> Promise   parabolic hop to (x, y)
 *   mood(m) with no ms: 'happy'/'sad' last 600 ms then return to the base mood;
 *     'cool'/'normal' persist (become the base mood).
 *
 * Shared helpers exported for Tray/Board: DPR, reducedMotion(), dur(ms), tweenP(scene, cfg),
 *   sleep(scene, ms), worldPos(obj), reparent(obj, parentContainer|null), darker(hex, amt),
 *   drawSquares(g, count, unit, hex, left) (the body look, for loose squares).
 *
 * Idle life: breathing (scaleY 1 → 1.03, 1.6 s yoyo), blinks every 2-5 s, pupils follow the
 * pointer (scene 'update' listener, removed in destroy()). Body and accessories are drawn once per
 * unit size; only the face redraws, and only on a mood change.
 */
import { RODS } from '../../bonds-logic.js?v=202609250809';
import { UI } from '../theme.js?v=202609250809';
import { fx } from '../fx.js?v=202609250809';
import { sfx } from '../sfx.js?v=202609250809';

export const DPR = Math.min(3, Math.max(1, window.devicePixelRatio || 1));
export const reducedMotion = () => fx.lessMotion || !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
export const dur = ms => (reducedMotion() ? Math.round(ms * 0.5) : ms);
export const darker = (hex, amt = 25) => Phaser.Display.Color.IntegerToColor(hex).darken(amt).color;

/** Tween that resolves on complete/stop (with a timer fallback so awaits never hang). */
export function tweenP(scene, cfg) {
  let tw = null;
  const pr = new Promise(resolve => {
    let done = false;
    const fin = () => { if (!done) { done = true; resolve(); } };
    const { onComplete, onStop } = cfg;
    const total = (cfg.delay || 0) + (cfg.duration || 0) * (cfg.yoyo ? 2 : 1) * ((cfg.repeat > 0 ? cfg.repeat : 0) + 1);
    setTimeout(fin, total + 1500);
    tw = scene.tweens.add({
      ...cfg,
      onComplete: (...a) => { if (onComplete) onComplete(...a); fin(); },
      onStop: (...a) => { if (onStop) onStop(...a); fin(); },
    });
  });
  pr.tween = tw;
  return pr;
}
export function sleep(scene, ms) {
  return new Promise(resolve => {
    let done = false;
    const fin = () => { if (!done) { done = true; resolve(); } };
    setTimeout(fin, ms + 1500);
    if (scene && scene.sys && scene.time) scene.time.delayedCall(ms, fin); else setTimeout(fin, ms);
  });
}
/** World position of an object's origin, following parent containers (no rotation). */
export function worldPos(obj) {
  let x = obj.x, y = obj.y, p = obj.parentContainer;
  while (p) { x = p.x + x * p.scaleX; y = p.y + y * p.scaleY; p = p.parentContainer; }
  return { x, y };
}
/** Move `obj` into `parent` (a Container) or the scene root (null), keeping its world position. */
export function reparent(obj, parent) {
  const p = worldPos(obj);
  const old = obj.parentContainer;
  if (old === parent && parent) return;
  if (old) {
    obj.off(Phaser.GameObjects.Events.DESTROY, old.onChildDestroyed, old); // Phaser 3.90 leaves this listener behind
    old.remove(obj);
  }
  if (parent) {
    parent.add(obj);
    const q = worldPos(parent);
    obj.setPosition((p.x - q.x) / parent.scaleX, (p.y - q.y) / parent.scaleY);
  } else {
    if (!obj.displayList) obj.addToDisplayList();
    obj.setPosition(p.x, p.y);
  }
}

/**
 * Draw `count` joined rod squares (the Rod body look) in colour `hex` into Graphics `g`:
 * left edge at `left`, vertically centred on y = 0, one square = `u` px. Used by Rod and by the
 * Board's merge sequence (loose squares that hop between rods).
 */
export function drawSquares(g, count, u, hex, left = 0) {
  const W = count * u, h = u, L = left, T = -h / 2;
  const white = hex === RODS[1].hex;
  const edge = white ? 0x94a3b8 : darker(hex, 28);
  const r = Math.max(2, Math.min(u * 0.22, 9));
  const b = Math.max(1, u * 0.075); // bevel ring
  const ri = Math.max(1, Math.min(u * 0.16, 6));
  g.fillStyle(white ? 0xdfe5ec : darker(hex, 9), 1).fillRoundedRect(L, T, W, h, r);
  for (let i = 0; i < count; i++) {
    const x = L + i * u;
    g.fillStyle(hex, 1).fillRoundedRect(x + b, T + b * 0.7, u - 2 * b, h - b * 1.9, ri);
    g.fillStyle(0xffffff, white ? 0.9 : 0.3).fillRoundedRect(x + b + ri * 0.4, T + b * 0.7 + Math.max(1, u * 0.04), u - 2 * b - ri * 0.8, h * 0.15, Math.min(ri * 0.6, h * 0.07));
  }
  g.lineStyle(Math.max(1, u * 0.045), edge, white ? 0.8 : 0.6);
  for (let i = 1; i < count; i++) g.lineBetween(L + i * u, T + 1, L + i * u, T + h - 1);
  g.lineStyle(Math.max(1.5, u * 0.05), edge, 1).strokeRoundedRect(L, T, W, h, r);
  return g;
}

const DARK_EYES = new Set([2, 6, 7, 8, 9]); // white eye rims for contrast
const LIGHT_MOUTH = new Set([6, 7, 8, 9]); // white mouth line on very dark rods
const GLASSES = new Set([5, 8]); // characters whose glasses give way to sunglasses in mood('cool')
const LASHES = { 4: 3, 10: 2 }; // lashes per eye
const SHADOW_REST = 0.6;
const SMALL = 18; // below this unit the face is simplified (dot eyes + line mouth)
const G = Phaser.GameObjects;

const HAIR = 0x4a2511, HAIR_EDGE = 0x2b1508;
const GOLD = 0xfde047, GOLD_EDGE = 0xb45309;
const PINK = 0xf472b6;

/** Polygon helper: pts are [x, y] pairs in units of u, relative to (0, top). */
function poly(g, u, top, pts, fill, edge, lw) {
  const P = pts.map(([x, y]) => new Phaser.Math.Vector2(x * u, top + y * u));
  g.fillStyle(fill, 1).fillPoints(P, true);
  if (edge !== undefined) g.lineStyle(lw, edge, 1).strokePoints(P, true);
}

/**
 * Character accessories, one per length (spec §1 "Cuisenaire rods").
 * back = behind the body, acc = in front of the body (hair, hats, cheeks, bow tie),
 * gl = glasses (hidden in mood('cool')). All graphics sit at the face-square centre (x) / rod centre line (y);
 * gl sits on the eye line. T = top edge of the square. Nothing goes higher than ≈ T − 0.45u.
 */
const CHARACTER = {
  // 1 baby: one curl of hair, rosy cheeks
  1({ acc, u, T, f }) {
    acc.fillStyle(0xfb7185, 0.5);
    for (const s of [-1, 1]) acc.fillEllipse(s * u * 0.34, u * 0.2, u * 0.2, u * 0.14);
    const pts = [new Phaser.Math.Vector2(u * 0.02, T + u * 0.05)];
    const cx = u * 0.03, cy = T - u * 0.15;
    for (let i = 0; i <= 24; i++) {
      const t = i / 24, a = Math.PI * 0.5 + t * Math.PI * 1.75, r = u * (0.12 - 0.07 * t);
      pts.push(new Phaser.Math.Vector2(cx + Math.cos(a) * r, cy + Math.sin(a) * r));
    }
    acc.lineStyle(Math.max(1.6, u * 0.075), 0xb45309, 1).strokePoints(pts, false);
    if (!f.small) acc.fillStyle(0xb45309, 1).fillCircle(pts[pts.length - 1].x, pts[pts.length - 1].y, Math.max(0.8, u * 0.035));
  },
  // 2 girl: two pigtails, fringe, yellow bow
  2({ back, acc, u, T, ol }) {
    for (const s of [-1, 1]) ellipse(back, s * u * 0.5, T - u * 0.09, u * 0.2, u * 0.14, -s * 0.6, HAIR, HAIR_EDGE, ol);
    back.fillStyle(PINK, 1);
    for (const s of [-1, 1]) back.fillCircle(s * u * 0.38, T + u * 0.01, u * 0.06);
    acc.fillStyle(HAIR, 1).fillRoundedRect(-u * 0.47, T - u * 0.03, u * 0.94, u * 0.13, { tl: u * 0.12, tr: u * 0.12, bl: 0, br: 0 });
    for (const x of [-0.35, -0.12, 0.12, 0.35]) acc.fillCircle(x * u, T + u * 0.09, u * 0.075);
    const by = T - u * 0.06;
    for (const s of [-1, 1]) poly(acc, u, by, [[0, 0], [s * 0.2, -0.11], [s * 0.2, 0.11]], GOLD, GOLD_EDGE, ol * 0.8);
    acc.fillStyle(GOLD, 1).fillCircle(0, by, u * 0.055).lineStyle(ol * 0.8, GOLD_EDGE, 1).strokeCircle(0, by, u * 0.055);
  },
  // 3 boy: blue baseball cap
  3({ acc, u, T, ol }) {
    const c = 0x2563eb, d = 0x1e3a8a;
    acc.fillStyle(c, 1).fillRoundedRect(-u * 0.42, T - u * 0.24, u * 0.84, u * 0.4, { tl: u * 0.3, tr: u * 0.3, bl: 0, br: 0 });
    acc.lineStyle(ol, d, 1).strokeRoundedRect(-u * 0.42, T - u * 0.24, u * 0.84, u * 0.4, { tl: u * 0.3, tr: u * 0.3, bl: 0, br: 0 });
    acc.lineStyle(Math.max(1, u * 0.03), d, 0.6).lineBetween(0, T - u * 0.22, 0, T + u * 0.1);
    acc.fillStyle(0xffffff, 1).fillCircle(u * 0.18, T - u * 0.02, u * 0.06);
    acc.fillStyle(d, 1).fillEllipse(u * 0.1, T + u * 0.17, u * 0.98, u * 0.15);
    acc.fillStyle(c, 1).fillCircle(0, T - u * 0.24, u * 0.05);
  },
  // 4 girl: long lashes (drawn with the eyes) + hair swoop with a yellow clip
  4({ acc, u, T, ol }) {
    poly(acc, u, T, [[-0.47, 0.24], [-0.47, 0.02], [-0.36, -0.05], [0.36, -0.05], [0.47, 0.02], [0.47, 0.1], [0.05, 0.13], [-0.2, 0.17]], HAIR, HAIR_EDGE, ol * 0.8);
    acc.fillStyle(GOLD, 1).fillRoundedRect(u * 0.08, T - u * 0.02, u * 0.3, u * 0.11, u * 0.05);
    acc.lineStyle(ol * 0.8, GOLD_EDGE, 1).strokeRoundedRect(u * 0.08, T - u * 0.02, u * 0.3, u * 0.11, u * 0.05);
    acc.fillStyle(PINK, 1).fillCircle(u * 0.23, T + u * 0.035, u * 0.04);
  },
  // 5 boy: short hair with a tuft + round glasses
  5({ acc, gl, u, T, ol, f }) {
    poly(acc, u, T, [[-0.47, 0.13], [-0.47, 0], [-0.3, -0.07], [0.02, -0.08], [0.1, -0.2], [0.16, -0.07], [0.36, -0.06], [0.47, 0], [0.47, 0.13], [0.2, 0.09], [-0.2, 0.1]], 0x78350f, 0x451a03, ol * 0.8);
    glasses(gl, u, f, 0x1f2937);
  },
  // 6 girl: pink headband with flowers
  6({ acc, u, T, ol }) {
    acc.fillStyle(PINK, 1).fillRoundedRect(-u * 0.49, T + u * 0.03, u * 0.98, u * 0.1, u * 0.05);
    flower(acc, -u * 0.2, T + u * 0.02, u * 0.1, 0xffffff, ol);
    flower(acc, u * 0.2, T + u * 0.05, u * 0.075, 0xfbcfe8, ol);
  },
  // 7 boy: ginger spiky hair (leaning spikes + jagged fringe)
  7({ acc, u, T, ol }) {
    poly(acc, u, T, [[-0.48, 0.2], [-0.5, -0.1], [-0.36, -0.05], [-0.3, -0.36], [-0.16, -0.07], [-0.02, -0.44], [0.08, -0.08], [0.26, -0.4], [0.3, -0.07], [0.56, -0.24], [0.48, 0.02], [0.48, 0.2], [0.34, 0.1], [0.2, 0.19], [0.06, 0.1], [-0.1, 0.19], [-0.24, 0.1], [-0.36, 0.19]], 0xea580c, 0x7c2d12, ol);
    acc.lineStyle(Math.max(1, u * 0.035), 0xfdba74, 0.9).lineBetween(-u * 0.24, T - u * 0.12, -u * 0.3, T - u * 0.3).lineBetween(u * 0.04, T - u * 0.12, -u * 0.01, T - u * 0.36);
  },
  // 8 grandma: grey bun + curls, gold glasses, rosy cheeks
  8({ back, acc, gl, u, T, ol, f }) {
    back.fillStyle(0xe5e7eb, 1).fillCircle(0, T - u * 0.18, u * 0.17).lineStyle(ol, 0x9ca3af, 1).strokeCircle(0, T - u * 0.18, u * 0.17);
    const curls = [-0.35, -0.12, 0.12, 0.35];
    acc.lineStyle(ol * 2, 0x9ca3af, 1);
    for (const x of curls) acc.strokeCircle(x * u, T + u * 0.03, u * 0.14);
    acc.fillStyle(0xe5e7eb, 1);
    for (const x of curls) acc.fillCircle(x * u, T + u * 0.03, u * 0.14);
    acc.lineStyle(Math.max(1, u * 0.03), 0xffffff, 0.8);
    for (const x of curls) { acc.beginPath(); acc.arc(x * u, T + u * 0.03, u * 0.08, Math.PI * 1.1, Math.PI * 1.6, false); acc.strokePath(); }
    acc.fillStyle(0xfb7185, 0.45);
    for (const s of [-1, 1]) acc.fillEllipse(s * u * 0.35, u * 0.2, u * 0.16, u * 0.11);
    glasses(gl, u, f, 0xfcd34d);
  },
  // 9 boy: red bow tie on the square before the face
  9({ acc, u, ol }) {
    const x = -u, y = u * 0.02;
    for (const s of [-1, 1]) poly(acc, u, y, [[x / u, 0], [x / u + s * 0.3, -0.18], [x / u + s * 0.3, 0.18]], 0xef4444, 0x7f1d1d, ol);
    acc.fillStyle(0xef4444, 1).fillRoundedRect(x - u * 0.07, y - u * 0.08, u * 0.14, u * 0.16, u * 0.04);
    acc.lineStyle(ol, 0x7f1d1d, 1).strokeRoundedRect(x - u * 0.07, y - u * 0.08, u * 0.14, u * 0.16, u * 0.04);
    acc.fillStyle(0xffffff, 0.55);
    for (const s of [-1, 1]) acc.fillCircle(x + s * u * 0.19, y - u * 0.02, u * 0.03);
  },
  // 10 girl: the ten queen's golden crown (+ lashes)
  10({ acc, u, T, ol }) {
    poly(acc, u, T, [[-0.34, 0.08], [-0.38, -0.28], [-0.17, -0.1], [0, -0.38], [0.17, -0.1], [0.38, -0.28], [0.34, 0.08]], GOLD, GOLD_EDGE, ol);
    acc.fillStyle(GOLD, 1).lineStyle(ol * 0.8, GOLD_EDGE, 1);
    for (const [x, y] of [[-0.38, -0.28], [0, -0.38], [0.38, -0.28]]) { acc.fillCircle(x * u, T + y * u, u * 0.05); acc.strokeCircle(x * u, T + y * u, u * 0.05); }
    acc.fillStyle(0xef4444, 1).fillCircle(0, T - u * 0.06, u * 0.055);
    acc.fillStyle(0x38bdf8, 1).fillCircle(-u * 0.2, T - u * 0.01, u * 0.035).fillCircle(u * 0.2, T - u * 0.01, u * 0.035);
  },
};

/** Filled + outlined ellipse rotated by `ang` (radians). */
function ellipse(g, cx, cy, rx, ry, ang, fill, edge, lw) {
  const P = [], c = Math.cos(ang), sn = Math.sin(ang);
  for (let i = 0; i < 20; i++) {
    const t = (i / 20) * Math.PI * 2, x = Math.cos(t) * rx, y = Math.sin(t) * ry;
    P.push(new Phaser.Math.Vector2(cx + x * c - y * sn, cy + x * sn + y * c));
  }
  g.fillStyle(fill, 1).fillPoints(P, true);
  g.lineStyle(lw, edge, 1).strokePoints(P, true);
}

function glasses(g, u, f, col) {
  const R = f.small ? Math.max(f.r * 1.9, u * 0.16) : u * 0.17;
  g.lineStyle(Math.max(1.2, u * 0.045), col, 1);
  for (const s of [-1, 1]) g.strokeCircle(s * f.dx, 0, R);
  g.lineBetween(-f.dx + R, 0, f.dx - R, 0);
  for (const s of [-1, 1]) g.lineBetween(s * (f.dx + R), 0, s * u * 0.5, -u * 0.04);
  if (!f.small) {
    g.lineStyle(Math.max(1, u * 0.025), 0xffffff, 0.7);
    for (const s of [-1, 1]) { g.beginPath(); g.arc(s * f.dx, 0, R * 0.7, Math.PI * 1.15, Math.PI * 1.45, false); g.strokePath(); }
  }
}

function flower(g, x, y, r, petal, ol) {
  g.fillStyle(petal, 1).lineStyle(Math.max(0.8, ol * 0.6), 0xdb2777, 1);
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + (i * Math.PI * 2) / 5;
    g.fillCircle(x + Math.cos(a) * r, y + Math.sin(a) * r, r * 0.72);
  }
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + (i * Math.PI * 2) / 5;
    g.strokeCircle(x + Math.cos(a) * r, y + Math.sin(a) * r, r * 0.72);
  }
  g.fillStyle(0xfacc15, 1).fillCircle(x, y, r * 0.55);
}

export class Rod extends Phaser.GameObjects.Container {
  constructor(scene, x, y, len, { unit = 32, labels = true } = {}) {
    super(scene, x, y);
    this.len = len;
    this.unit = unit;
    this.labels = labels; // kept for API compatibility: rods never draw a number
    this.home = { x, y };
    this._mood = 'normal';
    this._baseMood = 'normal';
    this._picked = false;

    this.shadow = new G.Graphics(scene).setAlpha(SHADOW_REST);
    this.lift = new G.Container(scene, 0, 0); // pick / squash / wiggle
    this.breath = new G.Container(scene, 0, 0); // idle breathing
    this.backG = new G.Graphics(scene); // accessories behind the body (pigtails, bun)
    this.bodyG = new G.Graphics(scene);
    this.shine = new G.Graphics(scene);
    this.accG = new G.Graphics(scene); // hair, hats, cheeks, bow tie
    this.eyesG = new G.Graphics(scene);
    this.pupilsG = new G.Graphics(scene);
    this.squintG = new G.Graphics(scene);
    this.glassesG = new G.Graphics(scene);
    this.shadesG = new G.Graphics(scene);
    this.mouthG = new G.Graphics(scene);
    this.hit = new G.Zone(scene, 0, 0, 10, 10);
    this.breath.add([this.backG, this.bodyG, this.shine, this.accG, this.eyesG, this.pupilsG, this.squintG, this.glassesG, this.shadesG, this.mouthG]);
    this.lift.add(this.breath);
    this.add([this.shadow, this.lift, this.hit]);
    scene.add.existing(this);
    this._draw();

    this._breathTw = scene.tweens.add({ targets: this.breath, scaleY: 1.03, duration: 1600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut', delay: Math.random() * 1600 });
    this._scheduleBlink();
    scene.events.on('update', this._track, this);
  }

  /** Body height: one square tall. */
  get h() { return this.unit; }

  setUnit(unit) { this.unit = unit; this._draw(); return this; }

  morphUnit(unit) {
    const k = (this.unit / unit) * this.scaleX;
    this.scene.tweens.killTweensOf(this);
    this.setUnit(unit);
    this.setScale(k);
    return this;
  }

  /** Kept for API compatibility; rods never show a number. */
  setLabelVisible(v) { this.labels = !!v; return this; }

  // ---------- drawing ----------
  _draw() {
    const u = this.unit, len = this.len, W = len * u, h = this.h;
    const hex = RODS[len].hex;
    const r = Math.max(2, Math.min(u * 0.22, 9));
    this.setSize(W, h);
    this.lift.x = W / 2;

    const s = this.shadow; s.clear();
    s.fillStyle(0x000000, 0.18).fillRoundedRect(3, h * 0.2, W - 6, h * 0.42, Math.min(r, h * 0.2));

    // body: a row of joined squares (linked-cube look)
    const g = this.bodyG; g.clear();
    const L = -W / 2, T = -h / 2;
    drawSquares(g, len, u, hex, L);

    // face geometry (right-end square)
    const f = this._face = {};
    f.x = W / 2 - u / 2;
    f.small = u < SMALL;
    f.y = -u * 0.06;
    f.dx = u * 0.21;
    f.r = f.small ? Math.max(1.3, u * 0.1) : u * 0.13;
    f.my = u * 0.23;
    f.mr = u * 0.13;
    f.lw = Math.max(1.2, u * 0.055);
    f.pupilMax = f.small ? Math.max(0.5, u * 0.04) : Math.min(2.2, f.r * 0.35);
    for (const o of [this.eyesG, this.pupilsG, this.squintG, this.glassesG, this.shadesG]) o.setPosition(f.x, f.y);
    this.mouthG.setPosition(f.x, f.my);
    this.backG.setPosition(f.x, 0);
    this.accG.setPosition(f.x, 0);

    // character accessories (static: drawn once per unit size)
    this.backG.clear(); this.accG.clear(); this.glassesG.clear();
    const ch = CHARACTER[len];
    if (ch) ch({ back: this.backG, acc: this.accG, gl: this.glassesG, u, T, ol: Math.max(1, u * 0.04), f });
    this._drawFace();

    this.hit.setPosition(W / 2, 0);
    this.hit.setSize(W + 8, Math.max(44, h + 16));
  }

  _drawFace() {
    const f = this._face, m = this._mood, len = this.len, u = this.unit;
    const dark = DARK_EYES.has(len);
    const rim = dark ? 0xffffff : UI.ink;
    const mouthCol = LIGHT_MOUTH.has(len) ? 0xffffff : UI.ink;
    const lw = f.lw;
    const e = this.eyesG, p = this.pupilsG, sq = this.squintG, sh = this.shadesG, mo = this.mouthG;
    e.clear(); p.clear(); sq.clear(); sh.clear(); mo.clear();

    const squint = m === 'happy';
    const cool = m === 'cool';
    e.setVisible(!squint); p.setVisible(!squint && !cool);
    this.glassesG.setVisible(!cool);
    const lashes = LASHES[len] || 0;
    if (!squint) {
      if (f.small) {
        if (dark) { e.fillStyle(0xffffff, 1); for (const s of [-1, 1]) e.fillCircle(s * f.dx, 0, f.r * 1.55); }
        p.fillStyle(0x111827, 1);
        for (const s of [-1, 1]) p.fillCircle(s * f.dx, 0, f.r);
      } else {
        e.fillStyle(0xffffff, 1).lineStyle(Math.max(1, f.r * 0.28), rim, 1);
        for (const s of [-1, 1]) { e.fillCircle(s * f.dx, 0, f.r); e.strokeCircle(s * f.dx, 0, f.r); }
        p.fillStyle(0x111827, 1);
        for (const s of [-1, 1]) p.fillCircle(s * f.dx, 0, f.r * 0.55);
        p.fillStyle(0xffffff, 0.9);
        for (const s of [-1, 1]) p.fillCircle(s * f.dx + f.r * 0.2, -f.r * 0.22, Math.max(0.8, f.r * 0.16));
      }
      if (lashes && !cool && !f.small) { // too small to read as lashes (they look like frowning brows)
        const n = lashes, R = f.r;
        e.lineStyle(Math.max(1, u * 0.035), UI.ink, 1);
        for (const s of [-1, 1]) {
          for (let i = 0; i < n; i++) {
            const a = n === 1 ? -0.9 : -1.25 + (i * 1.0) / (n - 1); // radians from +x, upward
            const c = Math.cos(a) * s, sn = Math.sin(a);
            e.lineBetween(s * f.dx + c * R, sn * R, s * f.dx + c * R * 1.7, sn * R * 1.7);
          }
        }
      }
    } else {
      sq.lineStyle(lw * 1.2, mouthCol === 0xffffff ? 0xffffff : UI.ink, 1);
      const R = f.small ? Math.max(1.6, u * 0.12) : f.r * 0.8;
      for (const s of [-1, 1]) { sq.beginPath(); sq.arc(s * f.dx, R * 0.55, R, Math.PI * 1.15, Math.PI * 1.85, false); sq.strokePath(); }
      if (lashes && !f.small) for (const s of [-1, 1]) sq.lineBetween(s * (f.dx + R * 0.85), -R * 0.1, s * (f.dx + R * 1.35), -R * 0.45);
    }
    if (cool) {
      const er = u * 0.13;
      sh.fillStyle(0x111827, 1);
      for (const s of [-1, 1]) sh.fillRoundedRect(s * f.dx - er * 1.2, -er * 0.8, er * 2.4, er * 1.5, er * 0.45);
      sh.lineStyle(Math.max(1, er * 0.3), 0x111827, 1).lineBetween(-f.dx, -er * 0.4, f.dx, -er * 0.4);
      if (dark) {
        sh.lineStyle(Math.max(1, er * 0.18), 0xffffff, 0.9);
        for (const s of [-1, 1]) sh.strokeRoundedRect(s * f.dx - er * 1.2, -er * 0.8, er * 2.4, er * 1.5, er * 0.45);
      }
      sh.lineStyle(Math.max(1, er * 0.22), 0xffffff, 0.8).lineBetween(-f.dx - er * 0.6, -er * 0.45, -f.dx - er * 0.1, -er * 0.1);
    }
    mo.setVisible(true);
    const mr = f.mr;
    if (m === 'happy') {
      mo.fillStyle(0x7f1d1d, 1).lineStyle(lw * 0.8, mouthCol === 0xffffff ? 0xffffff : 0x7f1d1d, 1);
      mo.beginPath(); mo.arc(0, -mr * 0.35, mr * 1.1, 0, Math.PI, false); mo.closePath(); mo.fillPath(); mo.strokePath();
      if (!f.small) mo.fillStyle(0xfb7185, 1).fillCircle(0, mr * 0.35, mr * 0.38);
    } else if (m === 'sad') {
      mo.lineStyle(lw, mouthCol, 1); mo.beginPath(); mo.arc(0, mr * 0.75, mr * 0.9, Math.PI * 1.2, Math.PI * 1.8, false); mo.strokePath();
    } else if (m === 'cool') {
      mo.lineStyle(lw, mouthCol, 1); mo.beginPath(); mo.arc(mr * 0.2, -mr * 0.5, mr * 0.9, Math.PI * 0.15, Math.PI * 0.6, false); mo.strokePath();
    } else {
      mo.lineStyle(lw, mouthCol, 1); mo.beginPath(); mo.arc(0, -mr * 0.45, mr * 0.9, Math.PI * 0.2, Math.PI * 0.8, false); mo.strokePath();
    }
  }

  // ---------- idle life ----------
  _scheduleBlink() {
    if (!this.scene) return;
    this._blinkEv = this.scene.time.delayedCall(Phaser.Math.Between(2000, 5000), () => {
      if (!this.active) return;
      this.scene.tweens.add({ targets: [this.eyesG, this.pupilsG], scaleY: 0.1, duration: 45, yoyo: true, ease: 'Quad.easeIn' });
      this._scheduleBlink();
    });
  }

  _track() {
    if (!this.active || !this.visible || !this._face) return;
    const f = this._face;
    let ox = 0, oy = 0;
    if (this._mood === 'sad') { oy = f.pupilMax; } else {
      const ptr = this.scene.input.activePointer;
      const wp = worldPos(this);
      const ex = wp.x + (this.lift.x + f.x) * this.scaleX, ey = wp.y + (this.lift.y + f.y) * this.scaleY;
      const dx = ptr.worldX - ex, dy = ptr.worldY - ey, d = Math.hypot(dx, dy);
      if (d > 0.5) { const k = f.pupilMax * Math.min(1, d / 60) / d; ox = dx * k; oy = dy * k; }
    }
    this.pupilsG.setPosition(f.x + ox, f.y + oy);
  }

  mood(m = 'normal', ms) {
    if (!this.active) return this;
    if (ms === undefined) ms = m === 'happy' || m === 'sad' ? 600 : 0;
    this._mood = m;
    if (ms <= 0) this._baseMood = m;
    this._drawFace();
    if (this._moodEv) { this._moodEv.remove(false); this._moodEv = null; }
    if (ms > 0) this._moodEv = this.scene.time.delayedCall(ms, () => { this._moodEv = null; if (this.active) { this._mood = this._baseMood; this._drawFace(); } });
    return this;
  }

  // ---------- motions ----------
  pick() {
    if (!this.active || this._picked) return this;
    this._picked = true;
    const s = this.scene;
    s.tweens.killTweensOf(this.lift);
    s.tweens.killTweensOf(this.shadow);
    this.lift.setScale(1, 1);
    s.tweens.add({ targets: this.lift, y: -12, scaleX: 1.08, duration: 90, ease: 'Quad.easeOut' });
    s.tweens.add({ targets: this.lift, angle: { from: -5, to: 0 }, duration: dur(380), ease: 'Elastic.easeOut', easeParams: [1.1, 0.35] });
    s.tweens.add({ targets: this.shadow, alpha: 1, y: 4, duration: 90 });
    sfx.boing(this.len);
    this.mood('happy', 450);
    return this;
  }

  drop() {
    this._picked = false;
    const s = this.scene;
    if (!this.active) return Promise.resolve();
    s.tweens.killTweensOf(this.lift);
    s.tweens.add({ targets: this.shadow, alpha: SHADOW_REST, y: 0, duration: 120 });
    return tweenP(s, { targets: this.lift, y: 0, scaleX: 1, scaleY: 1, angle: 0, duration: dur(140), ease: 'Quad.easeIn' });
  }

  popIn(delay = 0) {
    this.lift.setScale(0.01);
    this.scene.tweens.add({ targets: this.lift, scaleX: 1, scaleY: 1, delay, duration: dur(260), ease: 'Back.easeOut' });
    // the shadow fades in with the body (else a grey ghost pill shows while the rod is still tiny)
    this.shadow.setAlpha(0);
    this.scene.tweens.add({ targets: this.shadow, alpha: SHADOW_REST, delay, duration: dur(260) });
    return this;
  }

  async snapTo(x, y) {
    if (!this.active) return;
    const s = this.scene;
    this._stopArc();
    s.tweens.killTweensOf(this);
    s.tweens.killTweensOf(this.lift);
    this._picked = false;
    s.tweens.add({ targets: this.lift, y: 0, scaleX: 1, scaleY: 1, angle: 0, duration: dur(200), ease: 'Quad.easeIn' });
    s.tweens.add({ targets: this.shadow, alpha: SHADOW_REST, y: 0, duration: 200 });
    await tweenP(s, { targets: this, x, y, scaleX: 1, scaleY: 1, duration: dur(220), ease: 'Back.easeOut' });
    if (!this.active) return;
    sfx.snap();
    const wp = worldPos(this);
    fx.puff(s, wp.x + (this.width * this.scaleX) / 2, wp.y + this.h / 2);
    await tweenP(s, { targets: this.lift, scaleY: { from: 0.8, to: 1 }, scaleX: { from: 1.06, to: 1 }, duration: dur(120), ease: 'Back.easeOut' });
  }

  /** Parabolic hop to (x, y). */
  arcTo(x, y, { height = 40, duration = 350, ease = 'Linear' } = {}) {
    if (!this.active) return Promise.resolve();
    const s = this.scene;
    this._stopArc();
    s.tweens.killTweensOf(this);
    const x0 = this.x, y0 = this.y, st = { t: 0 };
    const pr = tweenP(s, {
      targets: st, t: 1, duration: dur(duration), ease,
      onUpdate: () => {
        if (!this.active) return;
        const t = st.t;
        this.setPosition(x0 + (x - x0) * t, y0 + (y - y0) * t - 4 * height * t * (1 - t));
      },
    });
    this._arcTw = pr.tween;
    return pr;
  }

  _stopArc() {
    const tw = this._arcTw;
    this._arcTw = null;
    if (tw && tw.isPlaying && tw.isPlaying()) tw.stop();
  }

  async bounceBack({ quiet = false } = {}) {
    if (!this.active) return;
    const s = this.scene;
    const { x, y } = this.home;
    const d = Math.hypot(x - this.x, y - this.y);
    if (!quiet) { this.mood('sad', 600); sfx.bonk(); }
    s.tweens.killTweensOf(this.lift);
    s.tweens.add({ targets: this.lift, angle: quiet ? 0 : { from: 8, to: 0 }, scaleX: 1, duration: dur(350), ease: 'Quad.easeOut' });
    await this.arcTo(x, y, { height: Math.min(80, 24 + d * 0.2), duration: 350 });
    if (!this.active) return;
    this.setScale(1);
    await this.drop();
  }

  glow() {
    if (!this.active) return Promise.resolve();
    const W = this.len * this.unit, h = this.h, bw = Math.max(this.unit * 1.6, 28);
    const st = { p: 0 }, sh = this.shine;
    return tweenP(this.scene, {
      targets: st, p: 1, duration: dur(300), ease: 'Sine.easeInOut',
      onUpdate: () => {
        if (!this.active) return;
        const x = -W / 2 - bw + st.p * (W + bw);
        sh.clear();
        // soft edges + bright core, clipped to the body
        for (const [a, b, al] of [[0, 1, 0.25], [0.2, 0.8, 0.35], [0.38, 0.62, 0.6]]) {
          const x1 = Math.max(-W / 2 + 3, x + a * bw), x2 = Math.min(W / 2 - 3, x + b * bw);
          if (x2 > x1) sh.fillStyle(0xffffff, al).fillRect(x1, -h / 2 + 3, x2 - x1, h - 6);
        }
      },
      onComplete: () => { if (this.active) sh.clear(); },
    });
  }

  destroy(fromScene) {
    const s = this.scene;
    if (s) {
      this._stopArc();
      s.events.off('update', this._track, this);
      if (s.tweens) s.tweens.killTweensOf([this, this.lift, this.breath, this.eyesG, this.pupilsG, this.shadow]);
      if (this._blinkEv) this._blinkEv.remove(false);
      if (this._moodEv) this._moodEv.remove(false);
    }
    super.destroy(fromScene);
  }
}
