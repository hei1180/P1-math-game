// 'place' clue (spec §1, §2): the item (clue.item) waits in a tray; the child drags it onto an empty place
// (or taps it, then taps a place). A drop away from every place just slides it back (no mistake).
// Right: it stays. Wrong: bonk, it slides back to the tray. Hints: 1 replay, 2 glow + arrow, 3 the item
// flies to an answer place and the sentence is read. clue.turned (F2R3): the queue turns round first.
import { checkAnswer, KINDS } from '../../dungeon-logic.js?v=202610112341';
import { attachWalk, glowRefs, hintArrows, answerSentence, nearestAnswer } from '../hero-walk.js?v=202610112341';
import { hop } from '../art.js?v=202610112341';
import { sfx } from '../sfx.js?v=202610112341';
import { voice } from '../voice.js?v=202610112341';
import { fx } from '../fx.js?v=202610112341';

const reduced = () => fx.lessMotion || (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
const DROP_R = 16; // art px from a place's centre that still counts as a drop there

export default class PlaceTask {
  constructor(room, clue) {
    this.room = room; this.clue = clue;
    this.walk = null; this.item = null; this.tray = null; this.mark = null;
    this.drag = null; this.selected = false; this.locked = true; this.dropRes = null; this.dead = false;
    this.handlers = [];
  }

  async run() {
    const { room, clue } = this, st = room.stage;
    if (clue.turned) await this.turnRound();
    if (this.dead) return;
    st.drawScene(clue.scene);
    if (clue.level >= 3) glowRefs(room, clue);
    this.walk = attachWalk(room, { walk: false });
    this.makeTray();
    room.ui.prompt(clue.ask.zh, clue.ask.en);
    this.locked = false;
    let hinted = false;
    for (;;) {
      const picked = await new Promise(r => { this.dropRes = r; });
      if (picked == null || this.dead) return;
      this.locked = true;
      if (checkAnswer(clue, picked)) {
        const z = st.slots[picked], p = st.toScreen(z.ax, z.ay - 8);
        fx.sparkle(room, p.x, p.y);
        await room.right();
        return;
      }
      const step = await room.wrong(picked);
      if (this.dead) return;
      if (step >= 2 && !hinted) { hinted = true; hintArrows(room, clue); }
      if (step >= 3) { await this.showAnswer(); return; }
      await this.toTray();
      if (this.dead) return;
      this.locked = false;
    }
  }

  /** F2R3: draw the queue with its old facing, then every creature turns round with a hop. */
  async turnRound() {
    const { room, clue } = this, st = room.stage, sc = clue.scene;
    const f = sc.queueFacing, old = f === 'left' ? 'right' : 'left';
    st.drawScene({ ...sc, queueFacing: old, objects: sc.objects.map(o => ({ ...o, facing: old })) });
    room.ui.prompt('全隊轉身！', 'The whole line turns round!');
    await room.wait(reduced() ? 150 : 700);
    const sprites = Object.values(st.sprites);
    sfx.whoosh();
    sprites.forEach((sp, i) => room.time.delayedCall(reduced() ? 0 : i * 140, () => {
      if (!sp.active) return;
      if (sp.setFacing) sp.setFacing(f);
      hop(sp);
    }));
    await room.wait(reduced() ? 200 : sprites.length * 140 + 600);
  }

  makeTray() {
    const { room, clue } = this, st = room.stage, L = st.current.layout, sc = clue.scene;
    let ax = 96, ay = 50;
    if (sc.layout === 'column' || sc.layout === 'shelf') {
      const right = L.pos(Math.max(1, sc.cols) - 1, 0).ax + L.cellW / 2 + 2;
      ax = Math.min(172, Math.round((right + st.w) / 2));
      ay = 84; // below the wall torch, beside the shelf
    }
    this.home = { ax, ay };
    st.addFocus(ax - 15, ax + 15); // the tray stays on screen when the stage zooms to the scene
    const g = this.tray = room.add.graphics();
    g.fillStyle(0x000000, 0.3).fillRect(ax - 12, ay - 20, 25, 24);
    g.fillStyle(0x1c1917, 0.75).fillRect(ax - 13, ay - 21, 26, 24);
    g.fillStyle(0xfacc15, 1).fillRect(ax - 13, ay - 21, 26, 1).fillRect(ax - 13, ay + 2, 26, 1)
      .fillRect(ax - 13, ay - 21, 1, 24).fillRect(ax + 12, ay - 21, 1, 24);
    st.objs.add(g);
    this.mark = room.add.graphics();
    st.hints.add(this.mark);

    const it = this.item = st.makeSprite(clue.item, sc.queueFacing || 'right');
    it.setPosition(ax, ay);
    st.front.add(it);
    const w = it.width || 16, h = it.height || 16, hs = Math.max(20, Math.ceil(52 / st.PX));
    it.setInteractive(new Phaser.Geom.Rectangle(w / 2 - hs / 2, h / 2 - hs / 2, hs, hs), Phaser.Geom.Rectangle.Contains);
    if (it.input) it.input.cursor = 'grab';
    this.bob(true);

    it.on('pointerdown', p => {
      if (this.locked || this.dead || room.ui.modalOpen) return;
      this.drag = { id: p.id, x0: p.worldX, y0: p.worldY, moved: false };
      this.bob(false);
    });
    this.on('pointermove', p => {
      const d = this.drag;
      if (!d || p.id !== d.id) return;
      if (!d.moved && Math.hypot(p.worldX - d.x0, p.worldY - d.y0) < 8) return;
      d.moved = true;
      if (this.selected) this.selected = false;
      const a = st.fromScreen(p.worldX, p.worldY);
      it.setPosition(a.ax, a.ay + h / 2);
      this.showMark(this.slotNear(it.x, it.y - h / 2));
    });
    const up = p => {
      const d = this.drag;
      if (!d || p.id !== d.id) return;
      this.drag = null;
      if (!d.moved) { this.select(); return; }
      const i = this.slotNear(it.x, it.y - h / 2);
      this.showMark(-1);
      if (i >= 0) this.dropAt(i); else this.toTray();
    };
    this.on('pointerup', up);
    this.on('pointerupoutside', up);
    // tap-to-place: after tapping the item, a tap on a place puts it there
    this.on('pointerdown', (p, over) => {
      if (!this.selected || this.locked || (over && over.includes(it))) return;
      this.selected = false;
      const a = st.fromScreen(p.worldX, p.worldY);
      const i = this.slotNear(a.ax, a.ay);
      if (i >= 0) this.dropAt(i); else this.toTray();
    });
  }

  on(ev, fn) { this.room.input.on(ev, fn); this.handlers.push([ev, fn]); }

  bob(on) {
    const it = this.item;
    if (!it) return;
    if (this.bobTw) { this.bobTw.stop(); this.bobTw = null; }
    if (on && !reduced()) this.bobTw = this.room.tweens.add({ targets: it, y: this.home.ay - 2, duration: 500, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  }

  select() {
    const it = this.item;
    this.selected = true;
    sfx.pop();
    it.setPosition(this.home.ax, this.home.ay - 4);
    voice.say(KINDS[this.clue.item].zh);
  }

  /** Nearest empty place to an art point (the item's centre), or -1. */
  slotNear(ax, cy) {
    let best = -1, bd = DROP_R;
    for (const z of this.room.stage.slots) {
      const d = Math.hypot(z.ax - ax, z.ay - 8 - cy);
      if (d <= bd) { bd = d; best = z.slotIndex; }
    }
    return best;
  }

  showMark(i) {
    const g = this.mark;
    if (!g) return;
    g.clear();
    const z = this.room.stage.slots[i];
    if (!z) return;
    g.fillStyle(0xfacc15, 0.35).fillRect(z.ax - 8, z.ay - 16, 16, 16);
    g.fillStyle(0xfacc15, 1).fillRect(z.ax - 9, z.ay - 17, 18, 1).fillRect(z.ax - 9, z.ay, 18, 1)
      .fillRect(z.ax - 9, z.ay - 17, 1, 18).fillRect(z.ax + 8, z.ay - 17, 1, 18);
  }

  moveTo(ax, ay, ms) {
    return new Promise(res => this.room.tweens.add({ targets: this.item, x: ax, y: ay, duration: reduced() ? Math.min(ms, 150) : ms, ease: 'Quad.easeOut', onComplete: res }));
  }

  async dropAt(i) {
    const z = this.room.stage.slots[i];
    this.locked = true;
    this.selected = false;
    this.bob(false);
    sfx.pop();
    await this.moveTo(z.ax, z.ay, 140);
    if (this.dead) return;
    if (this.dropRes) { const r = this.dropRes; this.dropRes = null; r(i); }
  }

  async toTray() {
    this.selected = false;
    this.bob(false);
    await this.moveTo(this.home.ax, this.home.ay, 300);
    if (!this.dead) this.bob(true);
  }

  /** Hint step 3: the item flies (an arc) to the closest answer place; the sentence is read. */
  async showAnswer() {
    const { room, clue } = this, st = room.stage, it = this.item;
    this.locked = true;
    this.bob(false);
    const i = nearestAnswer(room, clue, it.x, it.y), z = st.slots[i];
    if (z) {
      const x0 = it.x, y0 = it.y, k = { t: 0 };
      sfx.whoosh();
      await new Promise(res => room.tweens.add({
        targets: k, t: 1, duration: reduced() ? 150 : 700, ease: 'Sine.easeInOut',
        onUpdate: () => it.setPosition(x0 + (z.ax - x0) * k.t, y0 + (z.ay - y0) * k.t - (reduced() ? 0 : Math.sin(Math.PI * k.t) * 20)),
        onComplete: res,
      }));
      if (this.dead) return;
      it.setPosition(z.ax, z.ay);
      const p = st.toScreen(z.ax, z.ay - 8);
      fx.sparkle(room, p.x, p.y);
    }
    const s = answerSentence(clue, i, clue.item);
    await Promise.all([room.ui.prompt(s.zh, s.en), room.wait(1800)]);
  }

  destroy() {
    this.dead = true;
    if (this.dropRes) { const r = this.dropRes; this.dropRes = null; r(null); }
    this.handlers.forEach(([ev, fn]) => this.room.input.off(ev, fn));
    this.handlers = [];
    if (this.bobTw) this.bobTw.stop();
    if (this.item) { this.room.tweens.killTweensOf(this.item); this.item.destroy(); this.item = null; }
    if (this.walk) this.walk.destroy();
  }
}
