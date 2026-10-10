// Shared pieces for the 'make' and 'solve' clues: drag items from a tray onto empty slots, a sentence panel
// (smooth text, 🔈 per sentence) and a 完成 button that is enabled only when every item is placed.
//
//   board = new DragBoard(room, { kinds, facing?, trayAx })   items in stage.objs (art px), ids = kinds
//     board.onChange()  board.onPick()   callbacks      board.allPlaced()   board.placement() -> {kind: slotIndex}
//     board.lock(on)    board.hideTray()   board.setFacing(f)   board.sprite(kind)   board.moveTo({kind: slot}) -> Promise
//     board.contentRect() -> art-px rect of the scene + tray (what the panels must not cover)   board.destroy()
//   panel = new SentencePanel(room, sentences, { pickable, reserveBottom, avoid: () => artRect })
//     panel.pick() -> Promise<index|null>   panel.paint(i, 'normal'|'bad'|'good'|'speak')   panel.flash(i)   panel.destroy()
//   btn = new TaskButton(room, { zh, en, icon, side: 'right'|'left' })   btn.wait() -> Promise<true|null>   btn.enable(on)  btn.hide()
// Hit areas: items ≥ 48 CSS px (nearest item centre within max(10, 26 / PX) art px); slots snap within max(14, 28 / PX).
import { KINDS } from '../../dungeon-logic.js?v=0';
import { fx } from '../fx.js?v=0';
import { sfx } from '../sfx.js?v=0';
import { voice } from '../voice.js?v=0';
import { pill } from '../ui.js?v=0';
import { textStyle, UI as C } from '../theme.js?v=0';

export const reduced = () => fx.lessMotion || (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
export const dur = ms => (reduced() ? Math.min(ms, 150) : ms);
export const wait = (scene, ms) => new Promise(res => scene.time.delayedCall(ms, res));

const TRAY_Y = 28, GAP = 20;

/** Is a game object inside the pixel stage (not the UI)? */
function inStage(o, root) {
  for (let p = o; p; p = p.parentContainer) if (p === root) return true;
  return false;
}

export class DragBoard {
  constructor(room, { kinds, facing = 'right', trayAx = 96 }) {
    this.room = room; this.st = room.stage; this.s = room;
    this.locked = false; this.drag = null; this.trayOn = true;
    this.onChange = () => {}; this.onPick = () => {};
    const st = this.st, n = kinds.length;
    this.trayBox = { x0: trayAx - (n * GAP) / 2 - 3, x1: trayAx + (n * GAP) / 2 + 3, y0: TRAY_Y - 21, y1: TRAY_Y + 3 };
    this.tray = room.add.graphics();
    const b = this.trayBox;
    this.tray.fillStyle(0x1c1917, 0.55).fillRect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0);
    this.tray.fillStyle(0xfacc15, 0.85)
      .fillRect(b.x0, b.y0, b.x1 - b.x0, 1).fillRect(b.x0, b.y1 - 1, b.x1 - b.x0, 1)
      .fillRect(b.x0, b.y0, 1, b.y1 - b.y0).fillRect(b.x1 - 1, b.y0, 1, b.y1 - b.y0);
    this.tray.fillStyle(0x8b5a2b, 1).fillRect(b.x0 + 2, TRAY_Y, b.x1 - b.x0 - 4, 1);
    this.hintG = room.add.graphics();
    st.objs.add([this.tray, this.hintG]);
    st.addFocus(b.x0 - 2, b.x1 + 2); // keep the tray on screen when the stage zooms to the scene
    this.items = kinds.map((kind, i) => {
      const sp = st.makeSprite(kind, facing);
      const home = { ax: Math.round(trayAx + (i - (n - 1) / 2) * GAP), ay: TRAY_Y };
      sp.setPosition(home.ax, home.ay);
      sp.kind = kind; sp.objId = kind;
      st.objs.add(sp);
      return { kind, sprite: sp, home, slot: -1 };
    });
    this.onDown = (p, over) => this.down(p, over);
    this.onMove = p => this.move(p);
    this.onUp = p => this.up(p);
    const inp = room.input;
    inp.on('pointerdown', this.onDown); inp.on('pointermove', this.onMove);
    inp.on('pointerup', this.onUp); inp.on('pointerupoutside', this.onUp);
  }

  get PX() { return this.st.PX; }
  slotPos(i) { const z = this.st.slots[i]; return { ax: z.ax, ay: z.ay }; }
  occupant(i) { return this.items.find(it => it.slot === i) || null; }
  allPlaced() { return this.items.every(it => it.slot >= 0); }
  placement() { const p = {}; this.items.forEach(it => { p[it.kind] = it.slot; }); return p; }
  sprite(kind) { const it = this.items.find(i => i.kind === kind); return it ? it.sprite : this.st.sprites[kind] || null; }
  lock(on = true) { this.locked = on; if (on) this.cancelDrag(); }
  centre(sp) { return { ax: sp.x, ay: sp.y - (sp.displayHeight || 16) / 2 }; }

  hideTray() { this.trayOn = false; this.tray.setVisible(false); }
  setFacing(f) { this.items.forEach(it => { if (it.sprite.setFacing) it.sprite.setFacing(f); }); }

  down(p, over) {
    if (this.locked || this.drag || this.room.ui.modalOpen) return;
    if ((over || []).some(o => !inStage(o, this.st.root))) return; // a UI button is on top
    const a = this.st.fromScreen(p.worldX, p.worldY), r = Math.max(10, 26 / this.PX);
    let best = null, bd = Infinity;
    for (const it of this.items) {
      const c = this.centre(it.sprite), dx = Math.abs(c.ax - a.ax), dy = Math.abs(c.ay - a.ay);
      if (dx <= r && dy <= r && dx + dy < bd) { bd = dx + dy; best = it; }
    }
    if (!best) return;
    const sp = best.sprite;
    this.s.tweens.killTweensOf(sp); sp.setAngle(0);
    this.drag = { it: best, dx: sp.x - a.ax, dy: sp.y - a.ay, sx: p.worldX, sy: p.worldY, moved: false };
    this.st.objs.bringToTop(sp);
    sfx.tick(4);
    this.onPick(best);
    this.drawHints();
  }

  move(p) {
    const d = this.drag;
    if (!d) return;
    if (!p.isDown) { this.up(p); return; }
    if (Math.hypot(p.worldX - d.sx, p.worldY - d.sy) > 6) d.moved = true;
    if (!d.moved) return;
    const a = this.st.fromScreen(p.worldX, p.worldY);
    d.it.sprite.setPosition(Math.round(a.ax + d.dx), Math.round(a.ay + d.dy - 2));
    this.drawHints();
  }

  up() {
    const d = this.drag;
    if (!d) return;
    this.drag = null;
    this.hintG.clear();
    const it = d.it;
    if (!d.moved) { // a tap: wiggle and say the name
      this.snap(it);
      this.wiggle(it.sprite);
      if (KINDS[it.kind]) voice.say(KINDS[it.kind].zh);
      return;
    }
    const t = this.target(it.sprite);
    if (t >= 0) {
      const other = this.occupant(t);
      if (other && other !== it) { other.slot = it.slot; this.snap(other); } // swap (or back to the tray)
      it.slot = t;
      sfx.pop();
    } else {
      it.slot = -1;
      sfx.boop();
    }
    this.snap(it);
    this.onChange();
  }

  cancelDrag() {
    if (!this.drag) return;
    const it = this.drag.it;
    this.drag = null; this.hintG.clear(); this.snap(it);
  }

  /** Nearest slot to the item's centre within the snap radius, or -1. */
  target(sp) {
    const c = this.centre(sp), R = Math.max(14, 28 / this.PX);
    let best = -1, bd = Infinity;
    this.st.slots.forEach((z, i) => {
      const dd = Math.hypot(z.ax - c.ax, z.ay - 8 - c.ay);
      if (dd <= R && dd < bd) { bd = dd; best = i; }
    });
    return best;
  }

  drawHints() {
    const g = this.hintG, d = this.drag;
    g.clear();
    if (!d) return;
    const t = d.moved ? this.target(d.it.sprite) : -1;
    this.st.slots.forEach((z, i) => {
      const occ = this.occupant(i);
      if (i === t) {
        g.fillStyle(0xfde047, 0.35).fillRect(z.ax - 9, z.ay - 17, 18, 18);
        g.lineStyle(1, 0xfde047, 1).strokeRect(z.ax - 9, z.ay - 17, 18, 18);
      } else if (!occ || occ === d.it) {
        g.lineStyle(1, 0xfef3c7, 0.5).strokeRect(z.ax - 8, z.ay - 16, 16, 16);
      }
    });
  }

  /** Move an item to its slot (or its tray place). */
  snap(it, ms = 120) {
    const p = it.slot >= 0 ? this.slotPos(it.slot) : it.home, sp = it.sprite;
    this.s.tweens.killTweensOf(sp);
    sp.setAngle(0);
    return new Promise(res => this.s.tweens.add({ targets: sp, x: p.ax, y: p.ay, duration: dur(ms), ease: 'Quad.easeOut', onComplete: res, onStop: res }));
  }

  wiggle(sp) {
    if (reduced()) return;
    this.s.tweens.add({ targets: sp, angle: { from: -10, to: 10 }, duration: 70, yoyo: true, repeat: 2, onComplete: () => sp.setAngle(0), onStop: () => sp.setAngle(0) });
  }

  /** Items that break a sentence: rock (or, with less motion, blush red briefly). */
  wobble(sp) {
    if (!sp) return;
    if (sp.setTint) { sp.setTint(0xfca5a5); this.s.time.delayedCall(reduced() ? 150 : 700, () => { if (sp.active && sp.clearTint) sp.clearTint(); }); }
    if (!reduced()) this.s.tweens.add({ targets: sp, angle: { from: -12, to: 12 }, duration: 80, yoyo: true, repeat: 3, onComplete: () => sp.setAngle(0), onStop: () => sp.setAngle(0) });
  }

  /** Fly every item to the given placement (hint step 3). */
  moveTo(placement) {
    this.lock(true);
    this.items.forEach(it => { it.slot = placement[it.kind] ?? -1; });
    return Promise.all(this.items.map(it => this.snap(it, 420)));
  }

  contentRect() {
    const st = this.st, cur = st.current;
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    const add = (ax0, ay0, ax1, ay1) => { x0 = Math.min(x0, ax0); y0 = Math.min(y0, ay0); x1 = Math.max(x1, ax1); y1 = Math.max(y1, ay1); };
    if (cur) {
      const lay = cur.layout, sd = cur.scene;
      [...(sd.objects || []), ...(sd.slots || [])].forEach(o => { const p = lay.pos(o.x, o.y); add(p.ax - 12, p.ay - 20, p.ax + 12, p.ay + 2); });
      (lay.ladders || []).forEach(l => add(l.ax - 6, l.y1 - 14, l.ax + 6, l.y0));
    }
    if (this.trayOn) { const b = this.trayBox; add(b.x0, b.y0, b.x1, b.y1); }
    if (x0 === Infinity) return { x0: 40, y0: 40, x1: 152, y1: 92 };
    return { x0, y0, x1, y1 };
  }

  destroy() {
    const inp = this.room.input;
    if (inp) {
      inp.off('pointerdown', this.onDown); inp.off('pointermove', this.onMove);
      inp.off('pointerup', this.onUp); inp.off('pointerupoutside', this.onUp);
    }
    this.drag = null;
    this.items.forEach(it => { this.s.tweens.killTweensOf(it.sprite); if (it.sprite.__glow) this.st.glow(it.sprite, false); });
  }
}

/**
 * Choose where a UI panel of natural size w × h goes: the free region (above / below the room, or beside / above /
 * below the scene's content) that lets it be biggest. Returns { x, y (centre), k (scale ≤ 1) }.
 */
export function placePanel(room, w, h, artRect, reserveBottom = 0) {
  const st = room.stage, W = room.scale.width, H = room.scale.height;
  const top = room.ui.topH + 4, bottom = H - 34 - reserveBottom;
  const a = st.toScreen(artRect.x0, artRect.y0), b = st.toScreen(artRect.x1, artRect.y1);
  const roomB = st.oy + st.h * st.PX;
  const regs = [
    { x0: 8, x1: W - 8, y0: top, y1: a.y - 6 },                 // above the content (incl. above the room)
    { x0: 8, x1: W - 8, y0: Math.max(b.y + 6, top), y1: bottom }, // below the content
    { x0: 8, x1: W - 8, y0: Math.max(roomB + 4, top), y1: bottom },
    { x0: 8, x1: a.x - 6, y0: top, y1: bottom },                 // left of it
    { x0: b.x + 6, x1: W - 8, y0: top, y1: bottom },             // right of it
  ];
  let best = null;
  for (const r of regs) {
    const rw = r.x1 - r.x0, rh = r.y1 - r.y0;
    if (rw <= 40 || rh <= 40) continue;
    const k = Math.min(1, rw / w, rh / h);
    if (!best || k > best.k + 0.01) best = { k, x: (r.x0 + r.x1) / 2, y: (r.y0 + r.y1) / 2 };
  }
  if (!best) best = { k: Math.min(1, (W - 16) / w, (H - top - 34) / h), x: W / 2, y: (top + bottom) / 2 };
  return best;
}

/** Round 🔈 button (52 px) that reads `zh`. */
function speaker(s, zh) {
  const c = s.add.container(0, 0), g = s.add.graphics();
  g.fillStyle(0xfde68a, 1).fillCircle(0, 0, 22).lineStyle(3, 0xd97706, 1).strokeCircle(0, 0, 22);
  c.add([g, s.add.text(0, 1, '🔈', { fontSize: '20px', padding: { x: 2, y: 4 } }).setOrigin(0.5)]);
  c.setSize(52, 52).setInteractive({ useHandCursor: true });
  c.on('pointerdown', () => { sfx.tick(3); s.tweens.add({ targets: c, scale: 0.88, duration: 60 }); });
  c.on('pointerout', () => { s.tweens.killTweensOf(c); c.setScale(1); });
  c.on('pointerup', () => { s.tweens.killTweensOf(c); c.setScale(1); voice.say(zh); });
  return c;
}

const PAINT = {
  normal: [0xffffff, C.gold], bad: [0xfecaca, C.bad], good: [0xbbf7d0, C.good], speak: [0xfef9c3, 0xd97706],
};

export class SentencePanel {
  constructor(room, sentences, { pickable = false, reserveBottom = 0, avoid }) {
    const s = this.s = room; this.room = room; this.avoid = avoid; this.reserveBottom = reserveBottom;
    this.res = null; this.state = sentences.map(() => 'normal'); this.sentences = sentences;
    const c = this.c = s.add.container(0, 0);
    const rowH = 60, gap = 8;
    const texts = sentences.map(se => ({
      zh: s.add.text(0, 0, se.zh, textStyle(24, '#1f2937')).setOrigin(0, 0.5),
      en: s.add.text(0, 0, se.en || '', textStyle(13, '#57534e', { fontStyle: 'normal' })).setOrigin(0, 0.5),
    }));
    const w = Math.max(240, ...texts.map(t => Math.max(t.zh.width, t.en.width) + 52 + 34));
    const h = sentences.length * rowH + (sentences.length - 1) * gap + 16;
    this.w = w + 16; this.h = h;
    c.uiW = this.w; c.uiH = h; // ui.toast reads these to keep clear of the panel
    const back = s.add.graphics();
    back.fillStyle(0x1c1917, 0.45).fillRoundedRect(-this.w / 2, -h / 2, this.w, h, 18);
    c.add(back);
    this.rows = sentences.map((se, i) => {
      const r = s.add.container(0, -h / 2 + 8 + rowH / 2 + i * (rowH + gap));
      const g = s.add.graphics();
      const draw = st => {
        const [f, rim] = PAINT[st] || PAINT.normal;
        g.clear();
        g.fillStyle(0x000000, 0.18).fillRoundedRect(-w / 2 + 2, -rowH / 2 + 4, w, rowH, 16);
        g.fillStyle(f, 1).fillRoundedRect(-w / 2, -rowH / 2, w, rowH, 16);
        g.lineStyle(st === 'normal' ? 3 : 4, rim, 1).strokeRoundedRect(-w / 2, -rowH / 2, w, rowH, 16);
      };
      draw('normal');
      r.add(g);
      if (pickable) {
        const z = s.add.zone(0, 0, w, rowH).setInteractive({ useHandCursor: true });
        let down = false;
        z.on('pointerdown', () => { down = true; sfx.tick(5); s.tweens.add({ targets: r, scale: 0.96, duration: 60 }); });
        z.on('pointerout', () => { down = false; s.tweens.killTweensOf(r); r.setScale(1); });
        z.on('pointerup', () => {
          s.tweens.killTweensOf(r); r.setScale(1);
          if (!down) return; down = false;
          if (this.res && !room.ui.modalOpen) { const f = this.res; this.res = null; f(i); }
        });
        r.add(z);
      }
      const spk = speaker(s, se.zh).setPosition(-w / 2 + 32, 0);
      const t = texts[i], tx = -w / 2 + 62;
      if (se.en) { t.zh.setPosition(tx, -9); t.en.setPosition(tx, 17); } else t.zh.setPosition(tx, 0);
      r.add([spk, t.zh, t.en]);
      r.draw = draw;
      c.add(r);
      return r;
    });
    room.ui.root.add(c);
    this.relayout = () => {
      const p = placePanel(room, this.w, this.h, this.avoid(), this.reserveBottom);
      c.setPosition(Math.round(p.x), Math.round(p.y)).setScale(p.k);
    };
    this.relayout();
    room.events.on('stage:resize', this.relayout);
    c.setAlpha(0);
    s.tweens.add({ targets: c, alpha: 1, duration: dur(200) });
  }

  pick() {
    if (this.res) this.res(null);
    return new Promise(r => { this.res = r; });
  }

  paint(i, st) { if (this.rows[i]) { this.state[i] = st; this.rows[i].draw(st); } }
  paintAll(st) { this.rows.forEach((_, i) => this.paint(i, st)); }

  /** A wrong pick: red with a shake, back to white. */
  flash(i) {
    const r = this.rows[i];
    if (!r) return Promise.resolve();
    this.paint(i, 'bad');
    if (!reduced()) this.s.tweens.add({ targets: r, x: r.x + 6, duration: 50, yoyo: true, repeat: 3 });
    return wait(this.s, dur(600)).then(() => { if (r.active && this.state[i] === 'bad') this.paint(i, 'normal'); });
  }

  /** The right sentence: green, gently pulsing (less motion: no pulse). */
  show(i) {
    const r = this.rows[i];
    if (!r) return;
    this.paint(i, 'good');
    if (!reduced()) this.s.tweens.add({ targets: r, scale: { from: 1, to: 1.06 }, duration: 380, yoyo: true, repeat: 2 });
  }

  destroy() {
    if (this.res) { const f = this.res; this.res = null; f(null); }
    this.room.events.off('stage:resize', this.relayout);
    this.s.tweens.killTweensOf(this.c);
    this.rows.forEach(r => this.s.tweens.killTweensOf(r));
    this.c.destroy();
  }
}

/** Persistent pill button (bottom right or bottom left). Disabled: grey and ignores taps. */
export class TaskButton {
  constructor(room, { zh, en = '', icon = '', side = 'right', w = 170, h = 72, enabled = true }) {
    this.room = room; this.res = null; this.enabled = enabled;
    const b = this.b = pill(room, { zh, en, icon, w, h, fill: 0xfde047, rim: 0xb45309, size: 28 }, () => {
      if (!this.enabled || room.ui.modalOpen) { sfx.boop(); return; }
      if (this.onTap) this.onTap();
      if (this.res) { const f = this.res; this.res = null; f(true); }
    });
    room.ui.root.add(b);
    this.relayout = () => {
      const W = room.scale.width, H = room.scale.height;
      b.setPosition(side === 'right' ? W - w / 2 - 16 : w / 2 + 16, H - 40 - h / 2);
    };
    this.relayout();
    room.events.on('stage:resize', this.relayout);
    this.enable(enabled);
  }
  enable(on) {
    this.enabled = !!on;
    this.b.paint(on ? 0xfde047 : 0xe7e5e4, on ? 0xb45309 : 0xa8a29e);
    this.b.setAlpha(on ? 1 : 0.6);
  }
  wait() {
    if (this.res) this.res(null);
    return new Promise(r => { this.res = r; });
  }
  hide() { this.b.setVisible(false); this.b.disableInteractive(); }
  destroy() {
    if (this.res) { const f = this.res; this.res = null; f(null); }
    this.room.events.off('stage:resize', this.relayout);
    this.room.tweens.killTweensOf(this.b);
    this.b.destroy();
  }
}
