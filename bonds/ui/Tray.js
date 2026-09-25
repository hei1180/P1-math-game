/**
 * Rod tray — the shelf of answer rods (Rod Town 數棒鎮).
 *
 * Contract (rt-common.md "UI objects"):
 *   new Tray(scene)                                   Container (stays at 0,0; everything is in world coords)
 *   tray.layout(x, y, w, h, vertical)                 rect of the tray; vertical = one rod per shelf (wide screens)
 *   tray.setRods(lengths, { unit, labels })           replaces the rods (pop-in); unit is capped so all rods fit
 *   tray.rods                                         Rod[] currently on the tray (getter)
 *   tray.on('choose', rod => ...)                     tap, or drag released over tray.dropZone
 *   tray.dropZone                                     Phaser.Geom.Rectangle in world coords, set by the scene
 *   tray.returnRod(rod) -> Promise                    wrong answer: lunge toward dropZone, sad arc home
 *   tray.setEnabled(bool)                             false = ignore input
 *
 * Extras:
 *   tray.unit                  the unit actually used after capping (read-only)
 *   tray.setUnit(unit)         change the requested unit and re-arrange (e.g. after board.layout on resize)
 *   tray.setLabels(bool)       API-compatible: stores the flag and passes it to the rods (rods never show a
 *                              number since the square-rod redesign, so nothing changes on screen)
 *   tray.enabled               current enabled flag
 * Behaviour notes:
 *   - Horizontal mode packs rods into centred rows (wrapping); vertical mode is a staircase column.
 *     Shelf pitch ≥ 48 px so every rod's hit area (≥ 44 px tall) is separate.
 *   - pointerdown picks the rod at once (boing + lift < 100 ms); pointerup without moving > 10 px = tap.
 *   - A chosen rod stays lifted and ignores input until returnRod() or it leaves the tray
 *     (board.placeAnswer). If neither happens within 1.5 s it quietly settles home.
 *   - Rods that left the tray (placed on the board) are never destroyed by setRods().
 */
import { Rod, dur, tweenP, reparent } from './Rod.js?v=202609251311';

const PAD = 12;
const GAP = 12;

export class Tray extends Phaser.GameObjects.Container {
  constructor(scene) {
    super(scene, 0, 0);
    scene.add.existing(this);
    this.setDepth(10);
    this.dropZone = null;
    this.enabled = true;
    this.vertical = false;
    this.rect = new Phaser.Geom.Rectangle(0, 0, scene.scale.width, 140);
    this.unit = 32;
    this._req = 32;
    this._labels = true;
    this._rods = [];
    this._press = null;
    this.bg = new Phaser.GameObjects.Graphics(scene);
    this.add(this.bg);
    scene.input.on('pointermove', this._onMove, this);
    scene.input.on('pointerup', this._onUp, this);
    scene.input.on('pointerupoutside', this._onUp, this);
  }

  get rods() { return this._rods.filter(r => r.active && r.parentContainer === this); }

  layout(x, y, w, h, vertical) {
    this.rect.setTo(x, y, w, h);
    this.vertical = !!vertical;
    this._arrange(false);
    return this;
  }

  setRods(lengths, { unit, labels = true } = {}) {
    this._press = null;
    for (const r of this.rods) r.destroy();
    this._rods = [];
    if (unit) this._req = unit;
    this._labels = labels;
    for (const len of lengths) {
      const rod = new Rod(this.scene, 0, 0, len, { unit: this._req, labels });
      this.add(rod);
      rod.hit.setInteractive({ useHandCursor: true });
      rod.hit.on('pointerdown', p => this._onDown(rod, p));
      this._rods.push(rod);
    }
    this._arrange(true);
    return this;
  }

  setUnit(unit) { this._req = unit; this._arrange(false); return this; }

  setLabels(v) { this._labels = !!v; for (const r of this.rods) r.setLabelVisible(this._labels); return this; }

  setEnabled(v) { this.enabled = !!v; return this; }

  /** Greedy packing for a unit size. */
  _pack(u) {
    const availW = this.rect.width - 2 * PAD;
    const rodH = u; // rods are one square tall (Rod.h); hats/hair reach ≈ 0.45u above
    const pitch = Math.max(48, u * 1.6 + 12);
    const lens = this.rods.map(r => r.len);
    const rows = [];
    if (this.vertical) {
      for (const l of lens) { if (l * u > availW) return null; rows.push([l]); }
    } else {
      let row = [], wsum = 0;
      for (const l of lens) {
        const w = l * u;
        if (w > availW) return null;
        if (row.length && wsum + GAP + w > availW) { rows.push(row); row = []; wsum = 0; }
        wsum += (row.length ? GAP : 0) + w;
        row.push(l);
      }
      if (row.length) rows.push(row);
    }
    return { u, rows, pitch, rodH, dy: Math.round(u * 0.22), height: rows.length * pitch }; // dy: centre rods under their hats
  }

  _arrange(pop) {
    const rods = this.rods;
    const availH = this.rect.height - 2 * PAD;
    let plan = null;
    for (let u = Math.max(8, Math.floor(this._req)); u >= 8; u--) {
      plan = this._pack(u);
      if (plan && plan.height <= availH) break;
    }
    if (!plan) plan = this._pack(8) || { u: 8, rows: rods.map(r => [r.len]), pitch: 48, rodH: 8, dy: 2, height: rods.length * 48 };
    this.unit = plan.u;
    if (plan.rows.length) { // spread shelves a little when there is room
      plan.pitch = Math.max(plan.pitch, Math.min(plan.pitch * 1.5, availH / plan.rows.length));
      plan.height = plan.rows.length * plan.pitch;
    }
    this._drawBg(plan);
    const { x, y, width: w, height: h } = this.rect;
    const top = y + (h - plan.height) / 2 + plan.pitch / 2;
    let i = 0;
    const blockW = Math.max(0, ...rods.map(r => r.len * plan.u));
    plan.rows.forEach((row, ri) => {
      const rowW = row.reduce((s, l) => s + l * plan.u, 0) + GAP * (row.length - 1);
      let rx = this.vertical ? x + (w - blockW) / 2 : x + (w - rowW) / 2;
      const ry = top + ri * plan.pitch + plan.dy;
      for (const len of row) {
        const rod = rods[i++];
        if (rod.unit !== plan.u) rod.setUnit(plan.u);
        rod.home = { x: rx, y: ry };
        const busy = rod._busy || (this._press && this._press.rod === rod);
        if (!busy) {
          this.scene.tweens.killTweensOf(rod);
          rod.setPosition(rx, ry).setScale(1);
          if (pop) rod.popIn(i * 60);
        }
        rx += len * plan.u + GAP;
      }
    });
  }

  _drawBg(plan) {
    const g = this.bg, { x, y, width: w, height: h } = this.rect;
    g.clear();
    g.fillStyle(0x000000, 0.08).fillRoundedRect(x + 2, y + 5, w - 4, h - 2, 20);
    g.fillStyle(0xfffbeb, 0.95).fillRoundedRect(x, y, w, h, 20);
    g.lineStyle(3, 0xfbbf24, 1).strokeRoundedRect(x, y, w, h, 20);
    // one wooden shelf plank under each row
    const top = y + (h - plan.height) / 2 + plan.pitch / 2;
    const blockW = Math.max(0, ...this.rods.map(r => r.len * plan.u));
    plan.rows.forEach((row, ri) => {
      const rowW = this.vertical ? blockW : row.reduce((s, l) => s + l * plan.u, 0) + GAP * (row.length - 1);
      const py = top + ri * plan.pitch + plan.dy + plan.rodH / 2 + 3;
      const px = x + (w - rowW) / 2 - 10;
      g.fillStyle(0xd97706, 0.9).fillRoundedRect(px, py, rowW + 20, 6, 3);
      g.fillStyle(0xfcd34d, 1).fillRoundedRect(px, py, rowW + 20, 3, 2);
    });
  }

  // ---------- input ----------
  _onDown(rod, p) {
    if (!this.enabled || this._press || rod._busy || !rod.active) return;
    this._press = { rod, id: p.id, sx: p.worldX, sy: p.worldY, ox: rod.x - p.worldX, oy: rod.y - p.worldY, drag: false };
    this.bringToTop(rod);
    rod.pick();
  }

  _onMove(p) {
    const pr = this._press;
    if (!pr || p.id !== pr.id || !pr.rod.active) return;
    if (!pr.drag && Math.hypot(p.worldX - pr.sx, p.worldY - pr.sy) > 10) pr.drag = true;
    if (pr.drag) pr.rod.setPosition(p.worldX + pr.ox, p.worldY + pr.oy);
  }

  _onUp(p) {
    const pr = this._press;
    if (!pr || p.id !== pr.id) return;
    this._press = null;
    const rod = pr.rod;
    if (!rod.active) return;
    if (!this.enabled) { rod.bounceBack({ quiet: true }); return; }
    let ok = !pr.drag;
    if (pr.drag && this.dropZone) {
      const dz = this.dropZone, C = Phaser.Geom.Rectangle.Contains;
      const cx = rod.x + (rod.len * rod.unit) / 2;
      ok = C(dz, p.worldX, p.worldY) || C(dz, cx, rod.y);
    }
    if (!ok) { rod.bounceBack({ quiet: true }); return; }
    rod._busy = true;
    this.emit('choose', rod);
    // Safety net: a consumer that neither places nor returns the rod.
    this.scene.time.delayedCall(1500, () => {
      if (rod.active && rod._busy && !rod._returning && rod.parentContainer === this) {
        rod.bounceBack({ quiet: true }).then(() => { rod._busy = false; });
      }
    });
  }

  async returnRod(rod) {
    if (!rod || !rod.active) return;
    if (rod.parentContainer !== this) reparent(rod, this);
    rod._busy = true;
    rod._returning = true;
    const home = rod.home;
    const W = rod.len * rod.unit;
    if (this.dropZone && Math.hypot(rod.x - home.x, rod.y - home.y) < 20) {
      // tapped: lunge toward the gap, then bounce back home
      const dz = this.dropZone;
      const dx = dz.centerX - (rod.x + W / 2), dy = dz.centerY - rod.y;
      const d = Math.hypot(dx, dy) || 1, k = Math.min(110, d * 0.3) / d;
      await tweenP(this.scene, { targets: rod, x: rod.x + dx * k, y: rod.y + dy * k, duration: dur(130), ease: 'Quad.easeOut' });
    }
    await rod.bounceBack();
    if (rod.active) { rod._busy = false; rod._returning = false; }
  }

  destroy(fromScene) {
    const s = this.scene;
    if (s && s.input) {
      s.input.off('pointermove', this._onMove, this);
      s.input.off('pointerup', this._onUp, this);
      s.input.off('pointerupoutside', this._onUp, this);
    }
    super.destroy(fromScene);
  }
}
