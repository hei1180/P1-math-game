// PixelStage: the 192×108 art-pixel room, drawn in a container scaled by a whole number PX (no smoothing).
//
//   stage = new PixelStage(scene, { w = 192, h = 108, top = 0, bottom = 0, cropX = 8 })
//     top / bottom: CSS px kept free for the UI (number, or a function read on every fit);
//     cropX: art px of plain wall that may be cut off at each side when nothing is in focus.
//   Fit: PX fits the *focus* (the art-px x range the current clue uses: objects, places, ladders, the hero's home,
//     plus anything a task adds) to the width and the whole room height to the height: PX = floor(DPR * min(W / focusW,
//     (H - top - bottom) / h)) / DPR, at least 1 (whole device pixels, so art stays crisp). The focus is at least
//     FOCUS_MIN art px wide so clues do not zoom wildly. A room wider than the screen is cropped around the focus.
//   setFocus(x0, x1)  addFocus(x0, x1)   (drawScene sets it; clearScene drops it; both refit)
//   stage.hero: when set (RoomScene), drawScene stands it on stage.home = {ax, ay}, just left of the scene
//   stage.root (Container, scale PX)  with layers stage.back (backdrop) · stage.objs (drawScene) · stage.front (hero) · stage.hints
//   stage.PX, stage.w, stage.h, stage.ox, stage.oy (CSS px of the room's top-left), stage.level (3|2|1, slot markers)
//   toScreen(ax, ay) -> {x, y}   fromScreen(x, y) -> {ax, ay}
//   layout(sceneData) -> { pos(x, y) -> {ax, ay}, standPoints: [{ax, ay, x, y}], ladders: [{ax, y0, y1}], cellW, cellH, floorY }
//       pos is the bottom-centre of a grid cell (where an object stands). Ladder y0 = bottom ay (floor), y1 = top ay.
//   drawScene(sceneData, { level, markers }?) -> { sprites: {id: Sprite}, slots: [Zone] }   (also stage.sprites / stage.slots)
//       markers: true draws (faint) place markers even at support level 1 (make / solve: the child must see the places)
//       slot zones: interactive, ≥ 48 CSS px, with .slotIndex .ax .ay .gx .gy .marker
//   slotIndexAt(ax, ay) -> index | -1     nearest slot within half a cell
//   clearScene()   clearHints()   destroy()
//   glow(sprite, on = true)   arrow(ax, ay, dir = 'right'|'left'|'up'|'down') -> Graphics
//   tags(on, size = 'big'|'small') -> { left, right } | null   smooth 左 / 右 wall tags (outside the scaled root)
//
// Sprites use their textures' NEAREST filter (set by art.js); this file never smooth-scales art.
// Emits scene event 'stage:resize' (stage) after every fit.
import { artFrame, makeCreature } from './art.js?v=0';
import { KINDS } from '../dungeon-logic.js?v=0';
import { textStyle } from './theme.js?v=0';
import { fx } from './fx.js?v=0';
import { DPR } from '../bonds/hidpi.js?v=0';

export const ROOM_W = 192, ROOM_H = 108, FLOOR_Y = 92, STEP = 20;
export const FOCUS_MIN = 120, HOME_GAP = 18; // art px: narrowest focus; free floor left of a scene for the hero
const CREATURE = /^(slime|bat$|owl$)/;
const reduced = () => fx.lessMotion || (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
const val = v => (typeof v === 'function' ? v() : v) || 0;

export class PixelStage {
  constructor(scene, { w = ROOM_W, h = ROOM_H, top = 0, bottom = 0, cropX = 8 } = {}) {
    this.scene = scene; this.w = w; this.h = h; this.pad = { top, bottom }; this.cropX = cropX;
    this.root = scene.add.container(0, 0).setDepth(10);
    this.back = scene.add.container(0, 0);
    this.objs = scene.add.container(0, 0);
    this.front = scene.add.container(0, 0);
    this.hints = scene.add.container(0, 0);
    this.root.add([this.back, this.objs, this.front, this.hints]);
    this.tagLayer = scene.add.container(0, 0).setDepth(20);
    this.level = 3; this.sprites = {}; this.slots = []; this.current = null; this.tagOpts = null; this.tagObjs = null;
    this.focusRange = null; this.extraFocus = null; this.hero = null; this.home = { ax: 12, ay: FLOOR_Y };
    this.fit();
    this.onResize = () => this.fit();
    scene.scale.on('resize', this.onResize);
    scene.events.once('shutdown', () => scene.scale.off('resize', this.onResize));
  }

  /** Remove the stage before its scene ends (e.g. the Sandbox redraws a page). */
  destroy() {
    this.scene.scale.off('resize', this.onResize);
    this.clearScene();
    if (this.root.active) this.root.destroy();
    if (this.tagLayer.active) this.tagLayer.destroy();
  }

  fit() {
    const W = this.scene.scale.width, H = this.scene.scale.height;
    const top = val(this.pad.top), bottom = val(this.pad.bottom);
    const availH = Math.max(1, H - top - bottom);
    let [f0, f1] = this.focusRange || [this.cropX, this.w - this.cropX];
    if (f1 - f0 < FOCUS_MIN) { const m = (f0 + f1) / 2; f0 = m - FOCUS_MIN / 2; f1 = m + FOCUS_MIN / 2; }
    if (f0 < 0) { f1 -= f0; f0 = 0; }
    if (f1 > this.w) { f0 = Math.max(0, f0 - (f1 - this.w)); f1 = this.w; }
    const raw = Math.min(W / (f1 - f0 + 4), availH / this.h);
    this.PX = Math.max(1, Math.floor(raw * DPR + 1e-6) / DPR);
    const roomW = this.w * this.PX, snap = v => Math.round(v * DPR) / DPR;
    this.ox = snap(roomW <= W ? (W - roomW) / 2 : Math.max(W - roomW, Math.min(0, W / 2 - ((f0 + f1) / 2) * this.PX)));
    this.oy = snap(top + Math.max(0, availH - this.h * this.PX) / 2);
    this.root.setPosition(this.ox, this.oy).setScale(this.PX);
    if (this.tagOpts) this.tags(true, this.tagOpts.size);
    this.scene.events.emit('stage:resize', this);
  }
  setPad(pad) { Object.assign(this.pad, pad); this.fit(); }
  setFocus(x0, x1) { this.focusRange = [x0, x1]; this.fit(); }
  addFocus(x0, x1) {
    const f = this.focusRange || [x0, x1];
    const n = [Math.min(f[0], x0), Math.max(f[1], x1)];
    if (!this.focusRange || n[0] !== f[0] || n[1] !== f[1]) this.setFocus(n[0], n[1]);
  }

  toScreen(ax, ay) { return { x: this.ox + ax * this.PX, y: this.oy + ay * this.PX }; }
  fromScreen(x, y) { return { ax: (x - this.ox) / this.PX, ay: (y - this.oy) / this.PX }; }

  layout(sd) {
    const L = sd.layout, cols = Math.max(1, sd.cols || 1), rows = Math.max(1, sd.rows || 1);
    const cellH = rows > 1 ? Math.min(STEP, Math.floor((FLOOR_Y - 20) / (rows - 1))) : STEP;
    let cellW = L === 'shelf' ? 24 : STEP;
    const line = L === 'row' || L === 'queue';
    // a long row / queue leaves HOME_GAP free floor at its left for the hero (never standing on the first thing)
    // (164 art px: a 10-long row still fits a 375 px phone at PX 2 with the hero beside it)
    const maxW = line ? this.w - HOME_GAP - 10 : this.w - 16;
    if (cols * cellW > maxW) cellW = Math.floor(maxW / cols);
    const ay = y => FLOOR_Y - y * cellH;
    let shift = 0;
    if (line) {
      const left = 96 - (cols * cellW) / 2;
      if (left < HOME_GAP) shift = Math.min(HOME_GAP - left, this.w - 2 - (96 + (cols * cellW) / 2));
    }
    let axOf;
    if (L === 'pair') axOf = x => (cols < 2 ? 96 : 56 + x * (80 / (cols - 1)));
    else axOf = x => Math.round(96 + shift + (x - (cols - 1) / 2) * cellW);
    const pos = (x, y = 0) => ({ ax: axOf(x), ay: ay(y) });
    const ladders = [];
    if (L === 'column') ladders.push({ ax: Math.min(72, axOf(0) - 24), y0: FLOOR_Y, y1: ay(rows - 1) });
    if (L === 'shelf') ladders.push({ ax: axOf(0) - 20, y0: FLOOR_Y, y1: ay(rows - 1) });
    const standPoints = [];
    for (let y = 0; y < (L === 'column' || L === 'shelf' ? rows : 1); y++)
      for (let x = 0; x < cols; x++) standPoints.push({ ...pos(x, y), x, y });
    return { pos, standPoints, ladders, cellW, cellH, floorY: FLOOR_Y };
  }

  /** One object sprite (origin bottom-centre). Creatures come from makeCreature, the rest from artFrame. */
  makeSprite(kind, facing = 'right') {
    const s = this.scene, art = (KINDS[kind] && KINDS[kind].art) || kind;
    if (CREATURE.test(kind)) {
      for (const k of [kind, art]) {
        try { const c = makeCreature(s, k, facing); if (c) { if (c.setOrigin) c.setOrigin(0.5, 1); return c; } } catch (e) { /* try the art key */ }
      }
    }
    try {
      const f = artFrame(art);
      if (f && s.textures.exists(f.texture)) return s.add.image(0, 0, f.texture, f.frame).setOrigin(0.5, 1);
    } catch (e) { /* fallback below */ }
    console.warn('[stage] no art for', kind);
    return s.add.rectangle(0, 0, 12, 12, 0x9ca3af).setOrigin(0.5, 1);
  }

  drawScene(sd, { level = this.level, markers = false } = {}) {
    this.clearScene();
    const s = this.scene, lay = this.layout(sd), L = sd.layout;
    const cols = Math.max(1, sd.cols || 1), rows = Math.max(1, sd.rows || 1);
    this.current = { scene: sd, layout: lay };
    // the hero's home: floor just left of everything; the focus covers home + scene (+ extraFocus)
    let edge = lay.pos(0, 0).ax - lay.cellW / 2;
    for (const l of lay.ladders) edge = Math.min(edge, l.ax - 6);
    this.home = { ax: Math.max(8, Math.round(edge - 9)), ay: FLOOR_Y };
    const pet = this.hero && this.hero.pet && this.hero.pet.visible; // the pet trails 14 art px left of the hero
    let fx0 = Math.max(0, this.home.ax - (pet ? 22 : 9)), fx1 = this.home.ax + 9;
    for (const o of [...(sd.objects || []), ...(sd.slots || [])]) { const p = lay.pos(o.x, o.y); fx0 = Math.min(fx0, p.ax - 10); fx1 = Math.max(fx1, p.ax + 10); }
    for (const l of lay.ladders) { fx0 = Math.min(fx0, l.ax - 6); fx1 = Math.max(fx1, l.ax + 6); }
    if (this.extraFocus) { fx0 = Math.min(fx0, this.extraFocus[0]); fx1 = Math.max(fx1, this.extraFocus[1]); }
    this.setFocus(fx0, fx1);
    if (this.hero && this.hero.active) { this.scene.tweens.killTweensOf(this.hero); this.hero.setPosition(this.home.ax, this.home.ay).setAngle(0); }
    const g = s.add.graphics();
    this.objs.add(g);
    // furniture: shelf planks and ladders (pixel style, drawn in art px)
    if (L === 'column' || L === 'shelf') {
      const x0 = lay.pos(0).ax - lay.cellW / 2 - 2, x1 = lay.pos(cols - 1).ax + lay.cellW / 2 + 2;
      g.fillStyle(0x5b3a1e, 1).fillRect(x0, lay.pos(0, rows - 1).ay - 18, 2, FLOOR_Y - lay.pos(0, rows - 1).ay + 18);
      g.fillRect(x1 - 2, lay.pos(0, rows - 1).ay - 18, 2, FLOOR_Y - lay.pos(0, rows - 1).ay + 18);
      for (let y = 1; y < rows; y++) {
        const py = lay.pos(0, y).ay;
        g.fillStyle(0x8b5a2b, 1).fillRect(x0, py, x1 - x0, 2);
        g.fillStyle(0x5b3a1e, 1).fillRect(x0, py + 2, x1 - x0, 1);
      }
      for (const l of lay.ladders) {
        const top = l.y1 - 14;
        g.fillStyle(0x7c4a1e, 1).fillRect(l.ax - 5, top, 1, l.y0 - top).fillRect(l.ax + 4, top, 1, l.y0 - top);
        g.fillStyle(0xa16207, 1);
        for (let y = l.y0 - 3; y > top; y -= 4) g.fillRect(l.ax - 4, y, 8, 1);
      }
    }
    // objects + soft shadows
    for (const o of sd.objects || []) {
      const p = lay.pos(o.x, o.y);
      g.fillStyle(0x000000, 0.25).fillEllipse(p.ax, p.ay, 12, 3);
      const sp = this.makeSprite(o.kind, o.facing || sd.queueFacing || 'right');
      sp.setPosition(p.ax, p.ay);
      sp.objId = o.id; sp.kind = o.kind; sp.gx = o.x; sp.gy = o.y;
      this.objs.add(sp);
      this.sprites[o.id] = sp;
      // facing arrows under queue creatures at full support
      if (L === 'queue' && level >= 3) {
        const f = o.facing || sd.queueFacing || 'right', d = f === 'left' ? -1 : 1;
        g.fillStyle(0xfde047, 0.9).fillRect(p.ax - 3 * d - (d < 0 ? 4 : 0), p.ay + 3, 5, 1);
        g.fillTriangle(p.ax + 2 * d, p.ay + 1, p.ax + 2 * d, p.ay + 6, p.ax + 5 * d, p.ay + 3.5);
      }
    }
    // empty places: dashed markers (support 3 and 2) + tap zones (≥ 48 CSS px)
    const hs = Math.max(16, Math.ceil(48 / this.PX));
    (sd.slots || []).forEach((sl, i) => {
      const p = lay.pos(sl.x, sl.y);
      let marker = null;
      if (level >= 2 || markers) {
        marker = s.add.graphics();
        marker.fillStyle(0xfef3c7, level >= 3 ? 0.9 : level >= 2 ? 0.55 : 0.4);
        for (let k = 0; k < 14; k += 3) {
          marker.fillRect(p.ax - 7 + k, p.ay - 15, 2, 1).fillRect(p.ax - 7 + k, p.ay - 1, 2, 1);
          marker.fillRect(p.ax - 7, p.ay - 15 + k, 1, 2).fillRect(p.ax + 6, p.ay - 15 + k, 1, 2);
        }
        this.objs.add(marker);
      }
      const z = s.add.zone(p.ax, p.ay - 8, hs, hs).setInteractive({ useHandCursor: true });
      Object.assign(z, { slotIndex: i, ax: p.ax, ay: p.ay, gx: sl.x, gy: sl.y, marker });
      this.objs.add(z);
      this.slots.push(z);
    });
    return { sprites: this.sprites, slots: this.slots };
  }

  slotIndexAt(ax, ay) {
    if (!this.current) return -1;
    const { cellW, cellH } = this.current.layout;
    let best = -1, bd = Infinity;
    this.slots.forEach((z, i) => {
      const dx = Math.abs(z.ax - ax), dy = Math.abs(z.ay - ay);
      if (dx <= cellW / 2 && dy <= cellH / 2 && dx + dy < bd) { bd = dx + dy; best = i; }
    });
    return best;
  }

  clearHints() {
    this.hints.each(o => this.scene.tweens.killTweensOf(o));
    this.hints.removeAll(true);
  }

  clearScene() {
    this.clearHints();
    this.objs.each(o => this.scene.tweens.killTweensOf(o));
    this.objs.removeAll(true);
    this.sprites = {}; this.slots = []; this.current = null; this.focusRange = null;
  }

  /** Pulsing gold halo behind a sprite (hint step 2). */
  glow(sprite, on = true) {
    if (!sprite) return;
    if (sprite.__glow) { this.scene.tweens.killTweensOf(sprite.__glow); sprite.__glow.destroy(); sprite.__glow = null; }
    if (!on || !sprite.parentContainer) return;
    const h = sprite.displayHeight || sprite.height || 16, r = Math.max(8, h * 0.7);
    const g = this.scene.add.graphics();
    g.fillStyle(0xfde047, 0.45).fillCircle(0, 0, r);
    g.lineStyle(1, 0xfef9c3, 1).strokeCircle(0, 0, r);
    g.setPosition(sprite.x, sprite.y - h / 2);
    const parent = sprite.parentContainer;
    parent.addAt(g, Math.max(0, parent.getIndex(sprite)));
    sprite.__glow = g;
    if (!reduced()) this.scene.tweens.add({ targets: g, scale: { from: 0.85, to: 1.12 }, alpha: { from: 1, to: 0.6 }, duration: 520, yoyo: true, repeat: -1 });
  }

  /** Chunky pixel arrow with its tip at (ax, ay), pointing `dir`; bobs gently. Cleared by clearHints/clearScene. */
  arrow(ax, ay, dir = 'right') {
    const g = this.scene.add.graphics();
    const draw = (c, o) => {
      g.fillStyle(c, 1);
      g.fillRect(-12 - o, -1 - o, 7 + 2 * o, 3 + 2 * o);                 // shaft (pointing right, tip at 0,0)
      g.fillTriangle(-6 - o, -5 - o * 1.5, -6 - o, 5 + o * 1.5, 0 + o, 0);
    };
    draw(0x7c2d12, 1); draw(0xfacc15, 0);
    const rot = { right: 0, down: Math.PI / 2, left: Math.PI, up: -Math.PI / 2 }[dir] ?? 0;
    g.setPosition(ax, ay).setRotation(rot);
    this.hints.add(g);
    if (!reduced()) {
      const dx = Math.cos(rot) * -3, dy = Math.sin(rot) * -3;
      this.scene.tweens.add({ targets: g, x: ax + dx, y: ay + dy, duration: 420, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    }
    return g;
  }

  /** 左 / 右 tags on the room's left and right walls (smooth text, not scaled by PX). */
  tags(on, size = 'big') {
    this.tagLayer.removeAll(true);
    this.tagObjs = null;
    this.tagOpts = on ? { size } : null;
    if (!on) return null;
    const s = this.scene, big = size !== 'small';
    const bw = big ? 66 : 44, bh = big ? 74 : 44;
    const make = (zh, en, side) => {
      const c = s.add.container(0, 0);
      const g = s.add.graphics();
      g.fillStyle(0x000000, 0.25).fillRoundedRect(-bw / 2 + 2, -bh / 2 + 4, bw, bh, 12);
      g.fillStyle(0xfffbeb, 1).fillRoundedRect(-bw / 2, -bh / 2, bw, bh, 12);
      g.lineStyle(4, 0xb45309, 1).strokeRoundedRect(-bw / 2, -bh / 2, bw, bh, 12);
      const t = s.add.text(0, big ? -8 : 0, zh, textStyle(big ? 36 : 24, '#7c2d12')).setOrigin(0.5);
      c.add([g, t]);
      if (big) c.add(s.add.text(0, 24, en, textStyle(13, '#92400e', { fontStyle: 'normal' })).setOrigin(0.5));
      const inset = 6 + bw / 2 / this.PX;
      const p = this.toScreen(side === 'left' ? inset : this.w - inset, 40);
      c.setPosition(Math.max(bw / 2 + 4, Math.min(this.scene.scale.width - bw / 2 - 4, p.x)), p.y);
      this.tagLayer.add(c);
      return c;
    };
    this.tagObjs = { left: make('左', 'left', 'left'), right: make('右', 'right', 'right') };
    return this.tagObjs;
  }
}
