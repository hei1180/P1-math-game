// B3 釘板 Pegboard: stretch a rubber band round pegs to make a shape with the asked number of sides.
// The board stands upright facing the camera (easiest to tap). Taps go to the invisible hit spheres of the pegs.
// Grading is checkPeg only: 'crossing' / 'flat' are not mistakes (toast + clear), 'wrong-sides' is.
import * as THREE from 'three';
import { CourseScene } from '../CourseScene.js?v=202610081243';
import { makePegboard, makeBand } from '../../models/tiles.js?v=202610081243';
import { tween, wait } from '../../engine/tween.js?v=202610081243';
import { disposeTree } from '../../engine/stage.js?v=202610081243';
import { sfx } from '../../sfx.js?v=202610081243';
import { voice } from '../../engine/voice.js?v=202610081243';
import { toyColor, FONT } from '../../theme.js?v=202610081243';
import { sparkle } from '../../fx3d.js?v=202610081243';
import { checkPeg, simplify, ANSWER_TEXT, PEG_GRID } from '../../../shapes-logic.js?v=202610081243';

const S = 0.9;                       // peg spacing
const BOARD = (PEG_GRID + 0.2) * S;  // board edge length
const BOARD_Z = -2.4;                // board stands on the floor in front of the wall
const PEG_WHITE = 0xf8fafc, PEG_USED = 0xfacc15, PEG_FIRST = 0x22c55e;
const NUM_ZH = ['一', '二', '三', '四', '五', '六'];
const MAX_POINTS = 20;               // keeps a saved creation (flat pts) under the 40-number limit
// Sample shapes for the hint (each is a valid simple polygon with exactly that many sides).
const SAMPLES = {
  3: [[1, 3], [3, 3], [2, 1]],
  4: [[1, 1], [3, 1], [3, 3], [1, 3]],
  5: [[1, 3], [3, 3], [3, 1], [2, 0], [1, 1]],
  6: [[1, 0], [3, 0], [4, 2], [3, 4], [1, 4], [0, 2]],
};

export class B3Pegboard extends CourseScene {
  static courseKey = 'B3';

  async setup() {
    this.board = makePegboard({ spacing: S });
    this.board.position.set(0, BOARD / 2 + 0.02, BOARD_Z);
    this.root.add(this.board);
    this.pegs = this.board.userData.pegs;
    this.bandColor = toyColor(this.bridge.rng);
    this.band = makeBand({ color: this.bandColor, radius: 0.06 });
    this.board.add(this.band);

    this.seq = []; this.closed = false; this.busy = true;
    this.queue = []; this.wake = null; this.bar = null;
    this.input.onTap(this.board.userData.hits, hit => this.push({ type: 'peg', peg: hit.userData.peg }));
    this.frame();
  }

  // ---------- camera: fit the board between the prompt (top) and the buttons (bottom) ----------
  frame() {
    const { width: w, height: h, camera } = this.stage;
    if (!w || !h) return;
    this._fw = w; this._fh = h;
    const top = Math.min(185, h * 0.3), bottom = Math.min(96, h * 0.16);
    const ppu = Math.max(20, Math.min((h - top - bottom) / (BOARD * 1.04), (w - 12) / (BOARD * 1.04)));
    const dist = h / ppu / 2 / Math.tan((camera.fov * Math.PI) / 360);
    const ty = BOARD / 2 + 0.02 + (top - bottom) / 2 / ppu;
    this.stage.setView([0, ty, BOARD_Z + dist], [0, ty, BOARD_Z]);
  }
  update() { if (this.stage.width !== this._fw || this.stage.height !== this._fh) this.frame(); }

  // ---------- DOM buttons (bottom bar) ----------
  showBar(items) {
    this.hideBar();
    const root = document.getElementById('ui');
    if (!root) return;
    const wrap = document.createElement('div');
    wrap.style.cssText = 'position:absolute;left:0;right:0;bottom:0;display:flex;justify-content:center;gap:12px;padding:0 12px max(12px, env(safe-area-inset-bottom));pointer-events:none';
    const buttons = {};
    for (const it of items) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'bubbly-btn';
      b.style.cssText = `pointer-events:auto;min-height:56px;min-width:56px;padding:6px 16px;border-radius:16px;border:4px solid ${it.border || '#6ee7b7'};background:${it.bg || '#fff'};color:#1f2937;font-weight:700;font-family:${FONT};line-height:1.15;touch-action:manipulation`;
      const zh = document.createElement('div'); zh.textContent = it.zh; zh.style.fontSize = '20px';
      b.appendChild(zh);
      if (it.en) { const en = document.createElement('div'); en.textContent = it.en; en.style.cssText = 'font-size:12px;font-weight:400;color:#6b7280'; b.appendChild(en); }
      b.addEventListener('click', () => it.onClick(b));
      wrap.appendChild(b); buttons[it.id] = b;
    }
    root.appendChild(wrap);
    this.bar = { wrap, buttons };
  }
  hideBar() { if (this.bar) { this.bar.wrap.remove(); this.bar = null; } }
  playBar() {
    this.showBar([
      { id: 'undo', zh: '↩ 上一步', en: 'Undo', onClick: () => this.push({ type: 'undo' }) },
      { id: 'clear', zh: '🗑 清除', en: 'Clear', onClick: () => this.push({ type: 'clear' }) },
    ]);
  }

  // ---------- events (taps and buttons are queued; dropped while an answer is being handled) ----------
  push(ev) {
    if (this.busy || !this.alive) return;
    this.queue.push(ev);
    const w = this.wake; this.wake = null;
    if (w) w();
  }
  async nextEvent() {
    while (!this.queue.length) await new Promise(r => { this.wake = r; });
    return this.queue.shift();
  }

  // ---------- drawing ----------
  refresh() {
    const pts = this.seq.map(([x, y]) => this.pegs[x][y].position);
    this.band.userData.set(pts, this.closed);
    for (let x = 0; x < PEG_GRID; x++) for (let y = 0; y < PEG_GRID; y++) this.pegs[x][y].material.color.setHex(PEG_WHITE);
    this.seq.forEach(([x, y], i) => this.pegs[x][y].material.color.setHex(i === 0 ? PEG_FIRST : PEG_USED));
    this.band.material.emissiveIntensity = 0;
    this.stage.invalidate();
  }
  pop(x, y) {
    const s = this.pegs[x][y].scale;
    tween(s, { x: 1.35, y: 1.35, z: 1.35 }, { ms: 90 }).then(() => tween(s, { x: 1, y: 1, z: 1 }, { ms: 160 }));
  }
  segment(a, b, color, radius, lift = 0.04) {
    const m = makeBand({ color, radius });
    const pa = this.pegs[a[0]][a[1]].position.clone(), pb = this.pegs[b[0]][b[1]].position.clone();
    pa.z += lift; pb.z += lift;
    m.userData.set([pa, pb], false);
    this.board.add(m);
    return m;
  }

  // ---------- one item ----------
  async playItem(item) {
    const n = item.target, t = ANSWER_TEXT[n];
    this.target = n;
    this.seq = []; this.closed = false; this.queue.length = 0;
    this.refresh();
    this.playBar();
    const any = item.prompt === 'any';
    this.ui.prompt(any ? `圍出任何一個${t.zh}，形狀由你決定` : `圍出一個${t.zh}`,
      any ? `Make any ${n}-sided shape, you choose` : `Make a ${n}-sided shape`);
    this.busy = false;
    for (;;) {
      const ev = await this.live(this.nextEvent());
      this.busy = true;
      let done = false;
      try { done = await this.live(this.handle(ev, item)); } finally { if (!done) this.busy = false; }
      if (done) break;
    }                                                // (the Save button, if shown, stays until the next item replaces the bar)
  }

  async finish() { this.hideBar(); await super.finish(); }

  async handle(ev, item) {
    if (ev.type === 'undo') {
      if (this.closed) this.closed = false; else this.seq.pop();
      sfx.tick(0); this.refresh(); return false;
    }
    if (ev.type === 'clear') {
      if (this.seq.length) sfx.whoosh();
      this.seq = []; this.closed = false; this.refresh(); return false;
    }
    if (this.closed) { this.closed = false; this.refresh(); }   // a closed band after wrong sides: a peg tap reopens it
    const [x, y] = ev.peg, last = this.seq[this.seq.length - 1], first = this.seq[0];
    if (last && last[0] === x && last[1] === y) return false;
    if (first && first[0] === x && first[1] === y && this.seq.length >= 2) {
      this.closed = true; this.refresh(); sfx.spring(); this.pop(x, y);
      return this.grade(item);
    }
    if (this.seq.length >= MAX_POINTS) return false;
    this.seq.push([x, y]); this.refresh(); sfx.spring(); this.pop(x, y);
    return false;
  }

  async grade(item) {
    const t = ANSWER_TEXT[this.target];
    const res = checkPeg({ points: this.seq.map(p => p.slice()), closed: true }, this.target);
    if (res.ok) { await this.celebrate(); return true; }
    if (res.reason === 'wrong-sides') {
      const zh = `這個圖形有 ${res.sides} 條邊，要有 ${this.target} 條邊`;
      this.ui.toast(zh, `This has ${res.sides} sides, we need ${this.target}`, 2400);
      voice.say(zh);
      await this.live(this.wrong(item, res.sides, t.zh)); // the band stays: Undo and fix
      return false;
    }
    // crossing / flat: not a mistake
    if (res.reason === 'crossing') this.ui.toast('橡筋交叉了', 'The band crosses itself', 1800);
    else this.ui.toast('要圍出一個圖形', 'Make a closed shape', 1800);
    await this.live(wait(1400));
    this.seq = []; this.closed = false; this.refresh();
    return false;
  }

  /** ok: the band glows, the sides light up and are counted aloud; the child may save it (optional, never blocks). */
  async celebrate() {
    const poly = simplify(this.seq.map(p => p.slice())) || this.seq;
    const n = poly.length, pts = poly.flat();
    this.band.material.emissive.setHex(0xfb923c);
    tween(this.band.material, { emissiveIntensity: 0.9 }, { ms: 300 });
    sparkle(this.stage, this.board, this.root);

    let saved = false;
    this.showBar([{
      id: 'save', zh: '⭐ 保存到我的作品', en: 'Save to my creations', border: '#facc15',
      onClick: b => {
        if (saved) return;
        saved = true;
        b.firstChild.textContent = '✓ 已保存'; b.style.opacity = '0.75';
        try { Promise.resolve(this.bridge.saveCreation({ kind: 'peg', pts })).catch(e => console.warn('save failed', e)); } catch (e) { console.warn('save failed', e); }
        sfx.ding();
      },
    }]);

    const lit = [];
    for (let i = 0; i < n; i++) {
      lit.push(this.segment(poly[i], poly[(i + 1) % n], 0xfef08a, 0.1));
      sfx.tick(i);
      this.ui.toast(`${i + 1}`, '', 700);
      await this.live(Promise.all([voice.say(NUM_ZH[i] || String(i + 1)), wait(520)]));
    }
    const zh = `${n} 條邊，${ANSWER_TEXT[n].zh}`;
    this.ui.toast(zh, `${n} sides`, 1800);
    await this.live(Promise.all([voice.say(zh), wait(900)]));
    for (const m of lit) { this.board.remove(m); disposeTree(m); }
    await this.live(wait(saved ? 700 : 3600));        // time to tap Save; the button stays until the next item starts
  }

  // ---------- hint (2nd wrong answer): a ghost sample shape with that many sides ----------
  async hint(item) {
    const pts = SAMPLES[item.target];
    if (!pts) return;
    const ghost = makeBand({ color: 0x38bdf8, radius: 0.09 });
    ghost.material.transparent = true; ghost.material.opacity = 0.9;
    ghost.userData.set(pts.map(([x, y]) => { const p = this.pegs[x][y].position.clone(); p.z += 0.07; return p; }), true);
    this.board.add(ghost);
    this.ui.toast(`像這樣，有 ${item.target} 條邊`, `Like this: ${item.target} sides`, 2400);
    for (let i = 0; i < 3; i++) {
      await this.live(tween(ghost.material, { opacity: 0.25 }, { ms: 380, ease: 'linear' }));
      await this.live(tween(ghost.material, { opacity: 0.95 }, { ms: 380, ease: 'linear' }));
    }
    await this.live(wait(300));
    this.board.remove(ghost); disposeTree(ghost);
    this.stage.invalidate();
  }
}
