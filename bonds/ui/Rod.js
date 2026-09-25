/**
 * Rod buddy — one Cuisenaire rod with a face (Rod Town 數棒鎮).
 *
 * Contract (rt-common.md "UI objects"):
 *   new Rod(scene, x, y, len, { unit, labels = true })
 *     Container; origin = left-centre (x is the left edge, y the centre line);
 *     width = len * unit; height = max(22, unit * 1.4).
 *   rod.len, rod.home {x, y}
 *   rod.setUnit(unit)                 redraw at a new unit size (no animation)
 *   rod.pick()                        lift −12 px, stretch, shadow, wiggle, sfx.boing(len)
 *   rod.snapTo(x, y) -> Promise       fly (220 ms Back.easeOut), squash, dust puff, sfx.snap()
 *   rod.bounceBack(opts?) -> Promise  arc home (350 ms), sad face, sfx.bonk()
 *   rod.mood('happy'|'sad'|'cool'|'normal', ms?)
 *   rod.glow() -> Promise             white shine sweeps left → right (300 ms)
 *   rod.setLabelVisible(bool)
 *
 * Extras (documented additions):
 *   rod.unit, rod.labels, rod.h (body height), rod.hit (Phaser Zone, ≥ 44 px tall, not interactive
 *     until an owner calls rod.hit.setInteractive())
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
 *   sleep(scene, ms), worldPos(obj), reparent(obj, parentContainer|null), darker(hex, amt).
 *
 * Idle life: breathing (scaleY 1 → 1.03, 1.6 s yoyo), blinks every 2-5 s, pupils follow the
 * pointer (scene 'update' listener, removed in destroy()).
 */
import { RODS } from '../../bonds-logic.js?v=202609250809';
import { FONT, UI } from '../theme.js?v=202609250809';
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

const DARK_EYES = new Set([2, 6, 7, 8, 9]); // white eye rims for contrast
const LIGHT_MOUTH = new Set([6, 7, 8, 9]); // white mouth line on very dark rods
const SHADOW_REST = 0.6;
const G = Phaser.GameObjects;

export class Rod extends Phaser.GameObjects.Container {
  constructor(scene, x, y, len, { unit = 32, labels = true } = {}) {
    super(scene, x, y);
    this.len = len;
    this.unit = unit;
    this.labels = labels;
    this.home = { x, y };
    this._mood = 'normal';
    this._baseMood = 'normal';
    this._picked = false;

    this.shadow = new G.Graphics(scene).setAlpha(SHADOW_REST);
    this.lift = new G.Container(scene, 0, 0); // pick / squash / wiggle
    this.breath = new G.Container(scene, 0, 0); // idle breathing
    this.bodyG = new G.Graphics(scene);
    this.shine = new G.Graphics(scene);
    this.label = new G.Text(scene, 0, 0, String(len), { fontFamily: FONT, fontStyle: 'bold', color: '#ffffff', stroke: '#1f2937', resolution: DPR }).setOrigin(0.5);
    this.eyesG = new G.Graphics(scene);
    this.pupilsG = new G.Graphics(scene);
    this.squintG = new G.Graphics(scene);
    this.shadesG = new G.Graphics(scene);
    this.mouthG = new G.Graphics(scene);
    this.hit = new G.Zone(scene, 0, 0, 10, 10);
    this.breath.add([this.bodyG, this.shine, this.label, this.eyesG, this.pupilsG, this.squintG, this.shadesG, this.mouthG]);
    this.lift.add(this.breath);
    this.add([this.shadow, this.lift, this.hit]);
    scene.add.existing(this);
    this._draw();

    this._breathTw = scene.tweens.add({ targets: this.breath, scaleY: 1.03, duration: 1600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut', delay: Math.random() * 1600 });
    this._scheduleBlink();
    scene.events.on('update', this._track, this);
  }

  get h() { return Math.max(22, this.unit * 1.4); }

  setUnit(unit) { this.unit = unit; this._draw(); return this; }

  morphUnit(unit) {
    const k = (this.unit / unit) * this.scaleX;
    this.scene.tweens.killTweensOf(this);
    this.setUnit(unit);
    this.setScale(k);
    return this;
  }

  setLabelVisible(v) { this.labels = !!v; this._draw(); return this; }

  // ---------- drawing ----------
  _draw() {
    const u = this.unit, len = this.len, W = len * u, h = this.h;
    const hex = RODS[len].hex;
    const r = Math.min(h * 0.28, W * 0.3, 14);
    this.setSize(W, h);
    this.lift.x = W / 2;

    const s = this.shadow; s.clear();
    s.fillStyle(0x000000, 0.18).fillRoundedRect(4, h * 0.12, W - 8, h * 0.42, Math.min(r, h * 0.2));

    const g = this.bodyG; g.clear();
    g.fillStyle(hex, 1).fillRoundedRect(-W / 2, -h / 2, W, h, r);
    const shadeH = h * 0.26;
    g.fillStyle(0x000000, 0.12).fillRoundedRect(-W / 2 + 2, h / 2 - shadeH - 1, W - 4, shadeH, { tl: 0, tr: 0, bl: r * 0.8, br: r * 0.8 });
    for (let i = 1; i < len; i++) {
      const gx = -W / 2 + i * u;
      g.lineStyle(1, 0x000000, 0.25).lineBetween(gx, -h / 2 + 3, gx, h / 2 - 3);
      g.lineStyle(1, 0xffffff, 0.2).lineBetween(gx + 1, -h / 2 + 4, gx + 1, h / 2 - 4);
    }
    g.fillStyle(0xffffff, 0.28).fillRoundedRect(-W / 2 + 3, -h / 2 + 3, W - 6, h * 0.2, Math.min(h * 0.1, r * 0.6));
    g.lineStyle(2, len === 1 ? 0x94a3b8 : darker(hex, 25), 1).strokeRoundedRect(-W / 2, -h / 2, W, h, r);

    // face geometry (right-end unit)
    const f = this._face = {};
    f.x = W / 2 - u / 2;
    f.solo = len === 1 && this.labels; // one cube: eyes on top, number below, no mouth
    f.r = Math.max(2.5, Math.min(h * 0.16, u * 0.2));
    f.dx = f.r * 1.25;
    f.y = f.solo ? -h * 0.2 : -h * 0.1;
    f.my = f.y + Math.max(f.r * 2.1, h * 0.22);
    f.mr = f.dx * 0.9;
    f.pupilMax = Math.min(2, f.r * 0.35);
    this.eyesG.setPosition(f.x, f.y);
    this.pupilsG.setPosition(f.x, f.y);
    this.squintG.setPosition(f.x, f.y);
    this.shadesG.setPosition(f.x, f.y);
    this.mouthG.setPosition(f.x, f.my);
    this._drawFace();

    // label
    const lb = this.label;
    const fs = f.solo ? Math.max(10, Math.round(Math.min(u * 0.55, h * 0.4))) : Math.max(11, Math.round(Math.min(u * 0.78, h * 0.6)));
    lb.setFontSize(fs).setStroke('#1f2937', Math.max(2, Math.round(fs * 0.2)));
    lb.setPosition(f.solo ? 0 : -W / 2 + ((len - 1) * u) / 2, f.solo ? h * 0.2 : 0);
    lb.setVisible(this.labels);

    this.hit.setPosition(W / 2, 0);
    this.hit.setSize(W + 8, Math.max(44, h + 16));
  }

  _drawFace() {
    const f = this._face, m = this._mood, len = this.len;
    const rim = DARK_EYES.has(len) ? 0xffffff : UI.ink;
    const mouthCol = LIGHT_MOUTH.has(len) ? 0xffffff : UI.ink;
    const lw = Math.max(1.2, f.r * 0.32);
    const e = this.eyesG, p = this.pupilsG, sq = this.squintG, sh = this.shadesG, mo = this.mouthG;
    e.clear(); p.clear(); sq.clear(); sh.clear(); mo.clear();

    const squint = m === 'happy';
    e.setVisible(!squint); p.setVisible(!squint && m !== 'cool');
    if (!squint) {
      e.fillStyle(0xffffff, 1).lineStyle(Math.max(1, f.r * 0.28), rim, 1);
      for (const s of [-1, 1]) { e.fillCircle(s * f.dx, 0, f.r); e.strokeCircle(s * f.dx, 0, f.r); }
      p.fillStyle(0x111827, 1);
      for (const s of [-1, 1]) p.fillCircle(s * f.dx, 0, f.r * 0.55);
      p.fillStyle(0xffffff, 0.9);
      for (const s of [-1, 1]) p.fillCircle(s * f.dx + f.r * 0.2, -f.r * 0.22, Math.max(0.8, f.r * 0.16));
    } else {
      sq.lineStyle(lw * 1.2, mouthCol === 0xffffff ? 0xffffff : UI.ink, 1);
      for (const s of [-1, 1]) { sq.beginPath(); sq.arc(s * f.dx, f.r * 0.45, f.r * 0.8, Math.PI * 1.15, Math.PI * 1.85, false); sq.strokePath(); }
    }
    if (m === 'cool') {
      sh.fillStyle(0x111827, 1);
      for (const s of [-1, 1]) sh.fillRoundedRect(s * f.dx - f.r * 1.15, -f.r * 0.8, f.r * 2.3, f.r * 1.5, f.r * 0.45);
      sh.lineStyle(Math.max(1, f.r * 0.3), 0x111827, 1).lineBetween(-f.dx, -f.r * 0.4, f.dx, -f.r * 0.4);
      sh.lineStyle(Math.max(1, f.r * 0.22), 0xffffff, 0.8).lineBetween(-f.dx - f.r * 0.6, -f.r * 0.45, -f.dx - f.r * 0.1, -f.r * 0.1);
    }
    if (f.solo) { mo.setVisible(false); return; }
    mo.setVisible(true);
    const mr = f.mr;
    if (m === 'happy') {
      mo.fillStyle(0x7f1d1d, 1).lineStyle(lw * 0.8, mouthCol === 0xffffff ? 0xffffff : 0x7f1d1d, 1);
      mo.beginPath(); mo.arc(0, -mr * 0.35, mr * 1.1, 0, Math.PI, false); mo.closePath(); mo.fillPath(); mo.strokePath();
      mo.fillStyle(0xfb7185, 1).fillCircle(0, mr * 0.35, mr * 0.38);
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
