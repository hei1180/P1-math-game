/**
 * Linked board — rod track, two-colour ten-frames, bond diagram and equation (Rod Town 數棒鎮).
 *
 * Contract (rt-common.md "UI objects"):
 *   new Board(scene)                         Container (stays at 0,0; everything is drawn in world coords)
 *   board.layout(x, y, w, h)                 fit the four views into this rect (re-renders the current state)
 *   board.unit                               px per rod unit = min(floor((w − 24) / n), 44); valid after
 *                                            layout() + setQuestion() (it depends on n)
 *   board.trackRect                          Phaser.Geom.Rectangle (world) around the rail — use as tray.dropZone.
 *                                            The same instance is mutated on layout, so a stored reference stays valid.
 *   board.setQuestion(q, { labels })         build: parks rod a, outlines the gap; break: shows the log with cut points
 *   board.on('cut', k => ...)                break step 1: child tapped cut point k (1..n−1)
 *   board.cutAt(k) -> Promise                saw, split into rods k and n−k, park rod a, gap for b (step 2)
 *   board.placeAnswer(rod) -> Promise        rod flies into the gap; frames, diagram and equation fill
 *   board.rejectAt()                         wrong answer: gap flashes red once (break step 1: log wobbles + bonk)
 *   board.playMakeTen() -> Promise           make-ten hint (n ≥ 11, neither part 10); no-op otherwise
 *   board.celebrate() -> Promise             glow, burst, bond lines; build: engine + roll-out; break: halves hop
 *                                            onto the diagram. Resolves ≤ 600 ms; setQuestion() may be called at
 *                                            once (the old train keeps rolling out, the new one rolls in)
 *   board.frames -> { litA, litB }           lit ten-frame cells per part (logical, updated immediately)
 *
 * Extras:
 *   new Board(scene, { panel = true })       panel: soft paper card behind the board for readability
 *   board.step                               'idle' | 'build' | 'cut' | 'cutting' | 'answer' | 'done'
 *                                            (build = waiting for rod b; cut = break step 1; answer = break step 2)
 *   board.q                                  the board's copy of the question { type, n, a, b }
 *   board.setLabels(bool)                    toggle rod numbers + ruler numbers live
 *   board.rodA / board.rodB                  the parked / placed Rod objects (or null)
 *
 * Ten-frame placement: n ≤ 10 → part a then part b in frame 1 (frame 2 dimmed);
 *   n ≥ 11 → part a in frame 1, part b in frame 2 (textbook two-colour ten-frames, enables make-ten).
 */
import { RODS, makeTenMove } from '../../bonds-logic.js?v=0';
import { FONT, UI } from '../theme.js?v=0';
import { fx } from '../fx.js?v=0';
import { sfx } from '../sfx.js?v=0';
import { Rod, DPR, dur, tweenP, sleep, worldPos, reparent, darker } from './Rod.js?v=0';

const GO = Phaser.GameObjects;
const clamp = Phaser.Math.Clamp;
const WOOD = 0xfde68a, WOOD_EDGE = 0xd97706, LOG = 0x9ca3af, LOG_EDGE = 0x6b7280, GHOST = 0xcbd5e1, CUT = 0xea580c;

const txt = (scene, x, y, s, size, color = '#1f2937', extra = {}) =>
  new GO.Text(scene, x, y, String(s), { fontFamily: FONT, fontStyle: 'bold', fontSize: `${Math.max(8, Math.round(size))}px`, color, resolution: DPR, ...extra }).setOrigin(0.5);
function killDeep(scene, obj) {
  if (!obj || !scene.tweens) return;
  scene.tweens.killTweensOf(obj);
  if (obj.list) obj.list.forEach(c => killDeep(scene, c));
}
function clearLayer(scene, layer) { layer.list.slice().forEach(c => killDeep(scene, c)); layer.removeAll(true); }
const edgeOf = hex => (hex === RODS[1].hex ? 0x94a3b8 : darker(hex, 25));

function dashedRoundRect(g, x, y, w, h, r, dash = 8, gap = 5) {
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

export class Board extends Phaser.GameObjects.Container {
  constructor(scene, { panel = true } = {}) {
    super(scene, 0, 0);
    scene.add.existing(this);
    this.panel = panel;
    this.rect = new Phaser.Geom.Rectangle(0, 0, scene.scale.width, scene.scale.height * 0.65);
    this.trackRect = new Phaser.Geom.Rectangle();
    this.unit = 32;
    this.q = null;
    this.labels = true;
    this.step = 'idle';
    this.rodA = null;
    this.rodB = null;
    this.track = null;
    this._lit = { a: 0, b: 0 };
    this._shown = { a: 0, b: 0 };
    this._qid = 0;
    this._answered = false;
    this._rollIn = false;
    this._mt = null;
    this._cells = [];
    this.panelG = new GO.Graphics(scene);
    this.frameLayer = new GO.Container(scene, 0, 0);
    this.diagLayer = new GO.Container(scene, 0, 0);
    this.eqLayer = new GO.Container(scene, 0, 0);
    this.trackLayer = new GO.Container(scene, 0, 0);
    this.fxLayer = new GO.Container(scene, 0, 0);
    this.add([this.panelG, this.frameLayer, this.diagLayer, this.eqLayer, this.trackLayer, this.fxLayer]);
    this._geom();
  }

  get frames() { return { litA: this._lit.a, litB: this._lit.b }; }

  // ------------------------------------------------------------------ layout
  layout(x, y, w, h) {
    this.rect.setTo(x, y, w, h);
    this._geom();
    if (this.q) this._renderAll(false); else this._drawPanel();
    return this;
  }

  _geom() {
    const { x, y, width: w, height: h } = this.rect;
    const n = this.q ? this.q.n : 10;
    const unit = Math.max(8, Math.min(Math.floor((w - 24) / n), 44));
    const rodH = Math.max(22, unit * 1.4);
    const railH = rodH + 12;
    const above = Math.round(clamp(unit * 0.62, 11, 16) * 1.6 + 8); // ruler numbers + cut marker
    const below = 26; // ticks + 5/10/15 labels
    const trackBlock = above + railH + below;
    let fs = clamp(Math.min(w * 0.085, h * 0.075), 20, 50);
    let R = clamp(Math.min(w, h) * 0.075, 18, 46);
    let cell = clamp(Math.min(Math.floor((w - 32) / 10.7), h * 0.07), 14, 46);
    const sizes = () => ({ eqH: fs * 1.8, diagH: R * 2 + R * 0.55 + R * 0.85 * 2, framesH: cell * 2 + 8 });
    let s = sizes();
    let need = s.eqH + s.diagH + s.framesH + trackBlock;
    const maxH = h - 20;
    if (need > maxH) {
      const k = Math.max(0.45, (maxH - trackBlock) / (need - trackBlock));
      fs = Math.max(16, fs * k); R = Math.max(14, R * k); cell = Math.max(11, cell * k);
      s = sizes(); need = s.eqH + s.diagH + s.framesH + trackBlock;
    }
    const gap = clamp((h - need) / 5, 4, 34);
    let cy = y + Math.max(4, (h - need - gap * 3) / 2);
    const eqY = cy + s.eqH / 2; cy += s.eqH + gap;
    const diagTop = cy; cy += s.diagH + gap;
    const trackY = cy + above + railH / 2; cy += trackBlock + gap;
    const framesTop = cy;
    const r = R * 0.85;
    const x0 = Math.round(x + (w - n * unit) / 2);
    this.unit = unit;
    this.g = {
      x, y, w, h, n, unit, rodH, railH, above, fs, R, r, cell, eqY, eqH: s.eqH, cx: x + w / 2,
      wholeY: diagTop + R, partY: diagTop + R * 2 + R * 0.55 + r, partDX: Math.min(w * 0.3, R * 2.1),
      trackY, x0, framesTop, framesH: s.framesH,
      top: eqY - s.eqH / 2, bottom: framesTop + s.framesH,
    };
    this.trackRect.setTo(x0 - 16, trackY - railH / 2 - 26, n * unit + 32, railH + 52);
  }

  _drawPanel() {
    const g = this.panelG; g.clear();
    if (!this.panel || !this.q) return;
    const G = this.g, { x, width: w } = this.rect;
    const y1 = G.top - 10, y2 = G.bottom + 12;
    g.fillStyle(0x000000, 0.07).fillRoundedRect(x + 2, y1 + 5, w - 4, y2 - y1, 22);
    g.fillStyle(0xffffff, 0.78).fillRoundedRect(x, y1, w, y2 - y1, 22);
    g.lineStyle(3, 0xffffff, 1).strokeRoundedRect(x, y1, w, y2 - y1, 22);
  }

  _renderAll(anim) {
    this._drawPanel();
    this._renderEq(anim);
    this._renderDiag(anim);
    this._renderFrames();
    this._renderTrack();
    this._placeRods();
  }

  // ------------------------------------------------------------------ question state
  setQuestion(q, { labels = true } = {}) {
    const s = this.scene;
    this._qid++;
    this._cancelMakeTen();
    this.q = { type: q.type, n: q.n, a: q.a, b: q.b != null ? q.b : q.n - q.a };
    this.labels = labels;
    this.step = q.type === 'break' ? 'cut' : 'build';
    this._answered = false;
    this._lit = { a: this.step === 'build' ? this.q.a : 0, b: 0 };
    this._shown = { a: 0, b: 0 };
    if (this.track) {
      if (!this.track._leaving) { killDeep(s, this.track); this.track.destroy(); }
      this.track = null;
    }
    this.rodA = this.rodB = null;
    this._geom();
    this.track = this._newTrack();
    const G = this.g;
    if (this.step === 'build') {
      this.rodA = new Rod(s, G.x0, G.trackY, this.q.a, { unit: G.unit, labels });
      this.track.rodsC.add(this.rodA);
    }
    this._renderAll(true);
    if (this.step === 'build') this._lightCells('a', this.q.a, { silent: true, step: 25 });
    const t = this.track;
    if (this._rollIn) {
      this._rollIn = false;
      t.x = -(G.x0 + G.n * G.unit + 60);
      s.tweens.add({ targets: t, x: 0, duration: dur(380), ease: 'Cubic.easeOut' });
    } else {
      t.setAlpha(0);
      s.tweens.add({ targets: t, alpha: 1, duration: dur(200) });
      if (this.rodA) this.rodA.popIn(80);
    }
    return this;
  }

  setLabels(v) {
    this.labels = !!v;
    for (const r of [this.rodA, this.rodB]) if (r && r.active) r.setLabelVisible(this.labels);
    if (this.q) this._renderTrack();
    return this;
  }

  // ------------------------------------------------------------------ equation
  _eqTokens() {
    const q = this.q;
    if (!q) return null;
    if (this.step === 'cut' || this.step === 'cutting') return 'cut';
    const A = { k: 'chip', v: q.a, len: q.a }, N = { k: 'num', v: q.n };
    const B = this._answered ? { k: 'chip', v: q.b, len: q.b, box: true } : { k: 'box' };
    if (q.type === 'build') return [A, { k: 'op', v: '+' }, B, { k: 'op', v: '=' }, N];
    return [N, { k: 'op', v: '−' }, A, { k: 'op', v: '=' }, B];
  }

  _token(t, fs) {
    const s = this.scene, c = new GO.Container(s, 0, 0);
    const ch = fs * 1.25;
    if (t.k === 'num' || t.k === 'op' || t.k === 'word') {
      const tx = txt(s, 0, 0, t.v, t.k === 'op' ? fs * 0.95 : fs, t.k === 'op' ? '#6b7280' : '#1f2937');
      c.add(tx); c.tokW = tx.width;
    } else if (t.k === 'chip') {
      const hex = t.hex != null ? t.hex : RODS[t.len].hex;
      const light = hex === GHOST;
      const tx = txt(s, 0, 0, t.v, fs * 0.92, light ? '#1f2937' : '#ffffff', light ? {} : { stroke: '#1f2937', strokeThickness: Math.max(3, Math.round(fs * 0.14)) });
      const w = Math.max(ch, tx.width + fs * 0.5);
      const g = new GO.Graphics(s);
      g.fillStyle(0x000000, 0.12).fillRoundedRect(-w / 2 + 1, -ch / 2 + 3, w, ch, ch * 0.3);
      g.fillStyle(hex, 1).fillRoundedRect(-w / 2, -ch / 2, w, ch, ch * 0.3);
      g.fillStyle(0xffffff, 0.28).fillRoundedRect(-w / 2 + 3, -ch / 2 + 3, w - 6, ch * 0.22, ch * 0.1);
      g.lineStyle(2.5, edgeOf(hex), 1).strokeRoundedRect(-w / 2, -ch / 2, w, ch, ch * 0.3);
      c.add([g, tx]); c.tokW = w;
    } else if (t.k === 'box') {
      const w = ch * 1.1, g = new GO.Graphics(s);
      g.fillStyle(0xffffff, 1).fillRoundedRect(-w / 2, -ch / 2, w, ch, ch * 0.25);
      g.lineStyle(3, UI.ink, 0.85);
      dashedRoundRect(g, -w / 2, -ch / 2, w, ch, ch * 0.25, 7, 4);
      c.add(g); c.tokW = w;
      s.tweens.add({ targets: g, alpha: 0.45, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    }
    c.tok = t;
    return c;
  }

  _renderEq(anim, tokens = this._eqTokens()) {
    const s = this.scene, G = this.g;
    clearLayer(s, this.eqLayer);
    this._eqToks = [];
    if (!tokens) return;
    const fs = G.fs, ch = fs * 1.25, cx = G.cx;
    if (tokens === 'cut') {
      const q = this.q;
      const row = [{ k: 'word', v: '✂️ 切出' }, { k: 'chip', v: q.a, len: q.a }];
      const objs = row.map(t => this._token(t, fs));
      const tw = objs.reduce((a, o) => a + o.tokW, 0) + fs * 0.3;
      this._pill(cx, G.eqY, Math.max(tw, fs * 3) + fs * 1.1, G.eqH * 0.98);
      let x = cx - tw / 2;
      const y1 = G.eqY - fs * 0.22;
      objs.forEach(o => { o.setPosition(x + o.tokW / 2, y1); x += o.tokW + fs * 0.3; this.eqLayer.add(o); this._eqToks.push(o); });
      const en = txt(s, cx, G.eqY + fs * 0.64, `Cut off ${q.a}`, fs * 0.42, '#6b7280');
      this.eqLayer.add(en); this._eqToks.push(en);
    } else {
      const objs = tokens.map(t => this._token(t, fs));
      const sp = fs * 0.28;
      const tw = objs.reduce((a, o) => a + o.tokW, 0) + sp * (objs.length - 1);
      this._pill(cx, G.eqY, tw + fs * 1.1, ch + fs * 0.5);
      let x = cx - tw / 2;
      objs.forEach(o => { o.setPosition(x + o.tokW / 2, G.eqY); x += o.tokW + sp; this.eqLayer.add(o); this._eqToks.push(o); });
    }
    if (anim) this._eqToks.forEach((o, i) => { o.setScale(0.6).setAlpha(0); s.tweens.add({ targets: o, scale: 1, alpha: 1, delay: i * 40, duration: dur(220), ease: 'Back.easeOut' }); });
  }

  _pill(cx, cy, w, h) {
    const g = new GO.Graphics(this.scene);
    g.fillStyle(0x000000, 0.08).fillRoundedRect(cx - w / 2 + 2, cy - h / 2 + 4, w, h, h * 0.3);
    g.fillStyle(UI.paper, 1).fillRoundedRect(cx - w / 2, cy - h / 2, w, h, h * 0.3);
    g.lineStyle(3, 0xfbbf24, 1).strokeRoundedRect(cx - w / 2, cy - h / 2, w, h, h * 0.3);
    this.eqLayer.add(g);
    this._eqPill = g;
  }

  _morphEq(tokens) {
    const s = this.scene, old = this._eqToks || [];
    if (!old.length) { this._renderEq(true, tokens); return; }
    s.tweens.add({ targets: old, scale: 0.6, alpha: 0, duration: dur(120), ease: 'Quad.easeIn', onComplete: () => { if (this.active) this._renderEq(true, tokens); } });
  }

  // ------------------------------------------------------------------ bond diagram
  _renderDiag(anim) {
    const s = this.scene, G = this.g, q = this.q;
    clearLayer(s, this.diagLayer);
    this.parts = null;
    if (!q) return;
    const showParts = !(this.step === 'cut' || this.step === 'cutting');
    this.linesG = new GO.Graphics(s);
    this.diagLayer.add(this.linesG);
    const whole = new GO.Container(s, G.cx, G.wholeY);
    const wg = new GO.Graphics(s);
    wg.fillStyle(0x000000, 0.1).fillCircle(1, 4, G.R);
    wg.fillStyle(0xffffff, 1).fillCircle(0, 0, G.R);
    wg.lineStyle(Math.max(3, G.R * 0.1), UI.ink, 1).strokeCircle(0, 0, G.R);
    whole.add([wg, txt(s, 0, 0, q.n, G.R * 0.95)]);
    this.diagLayer.add(whole);
    this.wholeC = whole;
    if (showParts) {
      this.parts = {
        a: new GO.Container(s, G.cx - G.partDX, G.partY),
        b: new GO.Container(s, G.cx + G.partDX, G.partY),
      };
      this.diagLayer.add([this.parts.a, this.parts.b]);
      this._paintPart('a', true);
      this._paintPart('b', this._answered);
      this._drawLines(1);
      if (anim) {
        [this.parts.a, this.parts.b].forEach((p, i) => { p.setScale(0.2); s.tweens.add({ targets: p, scale: 1, delay: 60 + i * 60, duration: dur(260), ease: 'Back.easeOut' }); });
      }
    }
    if (anim) { whole.setScale(0.5); s.tweens.add({ targets: whole, scale: 1, duration: dur(260), ease: 'Back.easeOut' }); }
  }

  _paintPart(which, known) {
    const s = this.scene, G = this.g, c = this.parts && this.parts[which];
    if (!c) return;
    killDeep(s, c);
    c.removeAll(true);
    const r = G.r, g = new GO.Graphics(s), v = this.q[which];
    if (known) {
      const hex = RODS[v].hex;
      g.fillStyle(0x000000, 0.1).fillCircle(1, 4, r);
      g.fillStyle(hex, 1).fillCircle(0, 0, r);
      g.fillStyle(0xffffff, 0.25).fillEllipse(0, -r * 0.45, r * 1.1, r * 0.5);
      g.lineStyle(Math.max(3, r * 0.1), edgeOf(hex), 1).strokeCircle(0, 0, r);
      c.add([g, txt(s, 0, 0, v, r * 0.95, '#ffffff', { stroke: '#1f2937', strokeThickness: Math.max(3, Math.round(r * 0.14)) })]);
    } else {
      g.fillStyle(0xffffff, 1).fillCircle(0, 0, r);
      g.lineStyle(Math.max(2.5, r * 0.09), UI.ink, 0.5);
      const segs = 14;
      for (let i = 0; i < segs; i++) { g.beginPath(); g.arc(0, 0, r, (i * 2 * Math.PI) / segs, ((i + 0.55) * 2 * Math.PI) / segs, false); g.strokePath(); }
      c.add([g, txt(s, 0, 0, '?', r * 0.95, '#9ca3af')]);
    }
  }

  _drawLines(p, color = UI.ink, alpha = 0.55) {
    const G = this.g, g = this.linesG;
    if (!g || !g.active) return;
    g.clear();
    if (!this.parts) return;
    g.lineStyle(Math.max(3, G.R * 0.1), color, alpha);
    for (const sgn of [-1, 1]) {
      const px = G.cx + sgn * G.partDX, dx = px - G.cx, dy = G.partY - G.wholeY, d = Math.hypot(dx, dy);
      const x1 = G.cx + (dx / d) * G.R, y1 = G.wholeY + (dy / d) * G.R;
      const x2 = px - (dx / d) * G.r, y2 = G.partY - (dy / d) * G.r;
      g.lineBetween(x1, y1, x1 + (x2 - x1) * p, y1 + (y2 - y1) * p);
    }
  }

  // ------------------------------------------------------------------ ten-frames
  _idx(part, j) {
    if (part === 'a') return j;
    return this.q.n <= 10 ? this.q.a + j : 10 + j;
  }

  _cellPos(i) {
    const G = this.g, c = G.cell, fgap = Math.round(c * 0.6);
    const left = G.cx - (10 * c + fgap) / 2, top = G.framesTop + 4;
    return { x: left + (i >= 10 ? 5 * c + fgap : 0) + (i % 5) * c + c / 2, y: top + Math.floor((i % 10) / 5) * c + c / 2 };
  }

  _drawCell(g, mode) {
    const c = this.g.cell, s = c - Math.max(4, c * 0.16);
    g.clear();
    if (mode == null) return g;
    if (mode === 'ph') { g.lineStyle(1.5, UI.ink, 0.22).strokeCircle(0, 0, s * 0.2); return g; }
    const hex = mode;
    g.fillStyle(hex, 1).fillRoundedRect(-s / 2, -s / 2, s, s, s * 0.28);
    g.fillStyle(0xffffff, 0.3).fillRoundedRect(-s / 2 + 2, -s / 2 + 2, s - 4, s * 0.25, s * 0.12);
    g.lineStyle(1.5, edgeOf(hex), 1).strokeRoundedRect(-s / 2, -s / 2, s, s, s * 0.28);
    return g;
  }

  _cellGfx(mode, i) {
    const g = this._drawCell(new GO.Graphics(this.scene), mode);
    const p = this._cellPos(i);
    return g.setPosition(p.x, p.y);
  }

  _cellMode(i) {
    const q = this.q;
    if (!q || this.step === 'cut' || this.step === 'cutting') return null;
    for (const part of ['a', 'b']) {
      const len = q[part];
      for (let j = 0; j < len; j++) {
        if (this._idx(part, j) === i) return j < this._shown[part] ? RODS[len].hex : 'ph';
      }
    }
    return null;
  }

  _renderFrames() {
    const s = this.scene, G = this.g;
    clearLayer(s, this.frameLayer);
    this._cells = [];
    if (!this.q) return;
    const c = G.cell, fgap = Math.round(c * 0.6), left = G.cx - (10 * c + fgap) / 2, top = G.framesTop + 4;
    for (let f = 0; f < 2; f++) {
      const g = new GO.Graphics(s), fxl = left + f * (5 * c + fgap);
      g.fillStyle(0x000000, 0.08).fillRoundedRect(fxl - 3 + 1, top - 3 + 3, 5 * c + 6, 2 * c + 6, 8);
      g.fillStyle(0xffffff, 1).fillRoundedRect(fxl - 3, top - 3, 5 * c + 6, 2 * c + 6, 8);
      g.lineStyle(1, UI.ink, 0.18);
      for (let i = 1; i < 5; i++) g.lineBetween(fxl + i * c, top, fxl + i * c, top + 2 * c);
      g.lineBetween(fxl, top + c, fxl + 5 * c, top + c);
      g.lineStyle(2.5, UI.ink, 0.85).strokeRoundedRect(fxl - 3, top - 3, 5 * c + 6, 2 * c + 6, 8);
      if (f === 1 && this.q.n <= 10) g.setAlpha(0.35);
      this.frameLayer.add(g);
    }
    for (let i = 0; i < 20; i++) {
      const cg = this._cellGfx(this._cellMode(i), i);
      this.frameLayer.add(cg);
      this._cells.push(cg);
    }
  }

  /** Pop `count` cells of `part` in one by one (40 ms apart) with rising ticks. */
  _lightCells(part, count, { silent = false, step = 40, tick0 = 0 } = {}) {
    const qid = this._qid, s = this.scene, len = this.q[part];
    for (let j = 0; j < count; j++) {
      s.time.delayedCall(j * step, () => {
        if (qid !== this._qid || !this.active) return;
        this._shown[part] = Math.max(this._shown[part], j + 1);
        const i = this._idx(part, j), cg = this._cells[i];
        if (!cg || !cg.active) return;
        this._drawCell(cg, RODS[len].hex);
        cg.setScale(0);
        s.tweens.add({ targets: cg, scale: 1, duration: dur(170), ease: 'Back.easeOut' });
        if (!silent) sfx.tick(tick0 + j);
      });
    }
  }

  // ------------------------------------------------------------------ track
  _newTrack() {
    const s = this.scene, t = new GO.Container(s, 0, 0);
    t.railG = new GO.Graphics(s);
    t.labelsC = new GO.Container(s, 0, 0);
    t.gapG = new GO.Graphics(s);
    t.flashG = new GO.Graphics(s).setAlpha(0);
    t.logC = new GO.Container(s, 0, 0);
    t.logG = new GO.Graphics(s);
    t.hlG = new GO.Graphics(s);
    t.logC.add([t.logG, t.hlG]);
    t.rodsC = new GO.Container(s, 0, 0);
    t.markerG = new GO.Graphics(s).setVisible(false);
    t.zone = new GO.Zone(s, 0, 0, 10, 10);
    t.add([t.railG, t.labelsC, t.gapG, t.flashG, t.logC, t.rodsC, t.markerG, t.zone]);
    this.trackLayer.add(t);
    s.tweens.add({ targets: t.gapG, alpha: 0.4, duration: 750, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    // cut-point input (break step 1)
    const kOf = p => {
      const G = this.g;
      return clamp(Math.round((p.worldX - t.x - G.x0) / G.unit), 1, G.n - 1);
    };
    t.zone.on('pointerover', p => { if (this.step === 'cut' && !t.pressed) this._showMarker(kOf(p), false); });
    t.zone.on('pointermove', p => { if (this.step === 'cut') this._showMarker(kOf(p), !!t.pressed); });
    t.zone.on('pointerout', () => { t.pressed = false; if (this.step === 'cut') this._hideMarker(); });
    t.zone.on('pointerdown', p => {
      if (this.step !== 'cut') return;
      t.pressed = true;
      const k = kOf(p);
      this._showMarker(k, true);
      sfx.tick(k);
      s.tweens.add({ targets: t.logC, y: t.logC.y + 3, duration: 60, yoyo: true });
    });
    t.zone.on('pointerup', p => {
      if (this.step !== 'cut' || !t.pressed) return;
      t.pressed = false;
      this.emit('cut', kOf(p));
    });
    return t;
  }

  _showMarker(k, strong) {
    const t = this.track, G = this.g;
    if (!t) return;
    const m = t.markerG, lh = G.rodH * 1.08, ty = G.trackY;
    const fsR = clamp(G.unit * 0.62, 11, 16);
    const tipY = ty - lh / 2 - (this.labels ? fsR * 1.35 + 3 : 3);
    const ms = clamp(G.unit * 0.7, 12, 20);
    m.clear().setVisible(true).setAlpha(strong ? 1 : 0.55);
    m.x = G.x0 + k * G.unit;
    m.fillStyle(CUT, 1).fillTriangle(-ms * 0.55, tipY - ms, ms * 0.55, tipY - ms, 0, tipY);
    m.lineStyle(2, 0xffffff, 1).strokeTriangle(-ms * 0.55, tipY - ms, ms * 0.55, tipY - ms, 0, tipY);
    m.lineStyle(2.5, CUT, 1);
    for (let y = ty - lh / 2 - 2; y < ty + lh / 2 + 2; y += 7) m.lineBetween(0, y, 0, Math.min(y + 4, ty + lh / 2 + 2));
    const hl = t.hlG, W = G.n * G.unit;
    hl.clear();
    if (strong) hl.fillStyle(0xffffff, 0.35).fillRoundedRect(-W / 2 + 2, -lh / 2 + 2, k * G.unit - 3, lh - 4, 6);
  }

  _hideMarker() {
    const t = this.track;
    if (!t) return;
    t.markerG.setVisible(false);
    t.hlG.clear();
  }

  _renderTrack() {
    const t = this.track, G = this.g, s = this.scene, q = this.q;
    if (!t || !q) return;
    const n = G.n, u = G.unit, x0 = G.x0, ty = G.trackY, rh = G.railH, rodH = G.rodH;
    const W = n * u;
    const cutting = this.step === 'cut' || this.step === 'cutting';
    // rail
    const r = t.railG; r.clear();
    r.fillStyle(0x000000, 0.1).fillRoundedRect(x0 - 8, ty - rh / 2 + 4, W + 16, rh, 10);
    r.fillStyle(WOOD, 1).fillRoundedRect(x0 - 8, ty - rh / 2, W + 16, rh, 10);
    r.fillStyle(0xfcd34d, 0.55).fillRoundedRect(x0, ty - rodH / 2, W, rodH, 6);
    r.lineStyle(1, WOOD_EDGE, 0.35);
    for (let i = 1; i < n; i++) r.lineBetween(x0 + i * u, ty - rodH / 2 + 3, x0 + i * u, ty + rodH / 2 - 3);
    r.lineStyle(2.5, WOOD_EDGE, 1).strokeRoundedRect(x0 - 8, ty - rh / 2, W + 16, rh, 10);
    const yb = ty + rh / 2 + 2;
    for (let i = 0; i <= n; i++) {
      const big = i % 5 === 0, ten = i === 10;
      r.lineStyle(ten ? 3.5 : big ? 2.5 : 1.5, UI.ink, big ? 0.85 : 0.45);
      r.lineBetween(x0 + i * u, yb, x0 + i * u, yb + (ten ? 12 : big ? 9 : 5));
    }
    // labels
    clearLayer(s, t.labelsC);
    if (this.labels && !cutting) {
      const fsl = clamp(u * 0.55, 11, 16);
      for (const v of [5, 10, 15]) if (v <= n) t.labelsC.add(txt(s, x0 + v * u, yb + 14 + fsl * 0.45, v, fsl, '#1f2937'));
    }
    // gap for part b
    const gg = t.gapG; gg.clear();
    const fl = t.flashG; fl.clear();
    if (!cutting && !this._answered && this.step !== 'done') {
      const gx = x0 + q.a * u, gw = q.b * u, gy = ty - rodH / 2;
      gg.fillStyle(0xffffff, 0.75).fillRoundedRect(gx + 1, gy, gw - 2, rodH, 8);
      gg.lineStyle(2.5, UI.ink, 0.8);
      dashedRoundRect(gg, gx + 1, gy, gw - 2, rodH, Math.min(8, rodH / 2), 7, 5);
      fl.fillStyle(UI.bad, 0.28).fillRoundedRect(gx + 1, gy, gw - 2, rodH, 8);
      fl.lineStyle(3.5, UI.bad, 1).strokeRoundedRect(gx + 1, gy, gw - 2, rodH, 8);
    }
    // log (break step 1)
    const lg = t.logG; lg.clear();
    t.logC.setVisible(cutting).setPosition(x0 + W / 2, ty);
    t.hlG.clear();
    t.markerG.setVisible(false);
    if (cutting) {
      const lh = rodH * 1.08, rr = Math.min(lh * 0.3, 12);
      lg.fillStyle(0x000000, 0.12).fillRoundedRect(-W / 2 + 2, -lh / 2 + 5, W - 4, lh, rr);
      lg.fillStyle(LOG, 1).fillRoundedRect(-W / 2, -lh / 2, W, lh, rr);
      lg.fillStyle(0xffffff, 0.22).fillRoundedRect(-W / 2 + 3, -lh / 2 + 3, W - 6, lh * 0.2, rr * 0.5);
      lg.lineStyle(1.5, LOG_EDGE, 0.45);
      [-0.22, 0.04, 0.26].forEach((fy, li) => {
        const pts = [];
        for (let xx = -W / 2 + 6; xx <= W / 2 - lh * 0.45; xx += 4) pts.push(new Phaser.Math.Vector2(xx, fy * lh + Math.sin(xx * 0.07 + li * 2) * lh * 0.05));
        if (pts.length > 1) lg.strokePoints(pts, false);
      });
      // end grain
      const ex = W / 2 - lh * 0.24;
      lg.fillStyle(0xd1d5db, 1).fillEllipse(ex, 0, lh * 0.42, lh * 0.86);
      lg.lineStyle(1.2, LOG_EDGE, 0.7).strokeEllipse(ex, 0, lh * 0.28, lh * 0.56).strokeEllipse(ex, 0, lh * 0.13, lh * 0.26);
      lg.lineStyle(1.8, 0x4b5563, 0.7);
      for (let i = 1; i < n; i++) {
        const xx = -W / 2 + i * u;
        lg.lineBetween(xx, -lh / 2 + 1, xx, -lh / 2 + lh * 0.2);
        lg.lineBetween(xx, lh / 2 - lh * 0.2, xx, lh / 2 - 1);
      }
      lg.lineStyle(2.5, LOG_EDGE, 1).strokeRoundedRect(-W / 2, -lh / 2, W, lh, rr);
      if (this.labels) {
        const fsR = clamp(u * 0.62, 11, 16);
        for (let i = 1; i < n; i++) t.labelsC.add(txt(s, x0 + i * u, ty - lh / 2 - fsR * 0.7, i, fsR, i % 5 === 0 ? '#1f2937' : '#6b7280'));
      }
    }
    // cut zone
    const z = t.zone;
    z.setPosition(x0 + W / 2, ty - G.above / 2 + 4).setSize(W + u, rh + G.above + 24);
    if (this.step === 'cut') { if (!z.input) z.setInteractive({ useHandCursor: true }); else z.input.enabled = true; } else if (z.input) z.input.enabled = false;
  }

  _placeRods() {
    const t = this.track, G = this.g;
    if (!t) return;
    for (const [rod, off] of [[this.rodA, 0], [this.rodB, this.q ? this.q.a : 0]]) {
      if (!rod || !rod.active || rod.parentContainer !== t.rodsC) continue;
      if (rod.unit !== G.unit) rod.setUnit(G.unit);
      rod.setPosition(G.x0 + off * G.unit, G.trackY).setScale(1);
      rod.home = { x: rod.x, y: rod.y };
    }
  }

  // ------------------------------------------------------------------ actions
  async cutAt(k) {
    if (this.step !== 'cut' || !this.track) return;
    const s = this.scene, q = this.q, qid = this._qid, t = this.track;
    k = clamp(Math.round(k), 1, q.n - 1);
    q.a = k; q.b = q.n - k;
    this.step = 'cutting';
    this._hideMarker();
    if (t.zone.input) t.zone.input.enabled = false;
    this._geom();
    const G = this.g, u = G.unit, ty = G.trackY, lh = G.rodH * 1.08, cx = G.x0 + k * u;
    // saw swipe
    const saw = new GO.Graphics(s);
    const bw = clamp(u * 0.32, 6, 12), bh = lh * 1.5;
    saw.fillStyle(0xe5e7eb, 1).fillRect(-bw / 2, -bh, bw, bh);
    saw.fillStyle(0x9ca3af, 1);
    for (let yy = -bh; yy < 0; yy += 6) saw.fillTriangle(-bw / 2, yy, -bw / 2 - 4, yy + 3, -bw / 2, yy + 6);
    saw.lineStyle(1.5, 0x6b7280, 1).strokeRect(-bw / 2, -bh, bw, bh);
    saw.fillStyle(0xf97316, 1).fillRoundedRect(-bw * 1.2, -bh - lh * 0.45, bw * 2.4, lh * 0.5, 5);
    saw.lineStyle(2, 0xc2410c, 1).strokeRoundedRect(-bw * 1.2, -bh - lh * 0.45, bw * 2.4, lh * 0.5, 5);
    saw.setPosition(cx, ty - lh / 2 - 4);
    this.fxLayer.add(saw);
    sfx.saw();
    fx.sparks(s, cx, ty - lh / 2);
    const st = { t: 0 };
    await tweenP(s, {
      targets: st, t: 1, duration: dur(230), ease: 'Sine.easeIn',
      onUpdate: () => { if (saw.active) saw.setPosition(cx + Math.sin(st.t * 40) * 3, ty - lh / 2 - 4 + st.t * (lh + bh * 0.5)); },
    });
    s.tweens.add({ targets: saw, alpha: 0, duration: 120, onComplete: () => saw.destroy() });
    if (qid !== this._qid || !this.active) return;
    fx.sparks(s, cx, ty);
    fx.puff(s, cx, ty + lh / 2);
    // split into two rods
    t.logC.setVisible(false);
    clearLayer(s, t.labelsC);
    const rA = new Rod(s, G.x0, ty, k, { unit: u, labels: this.labels });
    const rB = new Rod(s, cx, ty, q.n - k, { unit: u, labels: this.labels });
    t.rodsC.add([rA, rB]);
    rA.mood('happy', 700); rB.mood('happy', 700);
    sfx.boing(k);
    rA.arcTo(G.x0, ty, { height: 14, duration: 200 });
    await rB.arcTo(cx + Math.min(24, u * 0.8), ty, { height: 22, duration: 200 });
    if (qid !== this._qid || !this.active) return;
    // step 2 state
    this.rodA = rA;
    this.step = 'answer';
    this._lit.a = k;
    this._renderEq(true);
    this._renderDiag(true);
    this._renderFrames();
    this._renderTrack();
    this._placeRods();
    this._lightCells('a', k, { step: 30 });
    // piece b hops onto its diagram circle and fades (the child now finds it in the tray)
    if (this.parts) {
      reparent(rB, this.fxLayer);
      const sc = Math.min(1, (G.r * 1.8) / (rB.len * rB.unit));
      const tx = G.cx + G.partDX - (rB.len * rB.unit * sc) / 2;
      s.tweens.add({ targets: rB, scaleX: sc, scaleY: sc, alpha: 0, duration: dur(420), ease: 'Quad.easeIn' });
      rB.arcTo(tx, G.partY, { height: 50, duration: 420 }).then(() => { if (rB.active) rB.destroy(); });
    } else rB.destroy();
    t.gapG.setAlpha(0);
    await sleep(s, 60);
  }

  async placeAnswer(rod) {
    if (!rod || !rod.active || !this.q || this._answered || !(this.step === 'build' || this.step === 'answer')) return;
    const s = this.scene, q = this.q, qid = this._qid;
    this._cancelMakeTen();
    this._answered = true;
    this._lit.b = q.b;
    this.rodB = rod;
    rod._busy = true;
    reparent(rod, null);
    rod.setDepth(50);
    if (Math.abs(rod.unit - this.unit) > 0.01) rod.morphUnit(this.unit);
    const G = this.g, t = this.track;
    await rod.snapTo(G.x0 + q.a * G.unit + t.x, G.trackY + t.y);
    if (!rod.active || qid !== this._qid || !this.active) return;
    reparent(rod, t.rodsC);
    rod.setDepth(0);
    rod._busy = false;
    this._placeRods();
    rod.mood('happy', 800);
    if (this.rodA && this.rodA.active) this.rodA.mood('happy', 800);
    t.gapG.clear(); t.flashG.clear();
    this._lightCells('b', q.b, { tick0: q.a });
    this._renderEq(false);
    const box = (this._eqToks || []).find(o => o.tok && o.tok.box);
    if (box) {
      box.setScale(0.3);
      s.tweens.add({ targets: box, scale: 1, duration: dur(280), ease: 'Back.easeOut' });
      fx.burst(s, box.x, box.y, { count: 6 });
    }
    if (this.parts) {
      this._paintPart('b', true);
      this.parts.b.setScale(0.4);
      s.tweens.add({ targets: this.parts.b, scale: 1, duration: dur(280), ease: 'Back.easeOut' });
    }
  }

  rejectAt() {
    const s = this.scene, t = this.track;
    if (!t) return;
    if (this.step === 'cut') {
      sfx.bonk();
      killDeep(s, t.logC);
      t.logC.angle = 0;
      s.tweens.add({ targets: t.logC, angle: { from: -2.5, to: 2.5 }, duration: dur(60), yoyo: true, repeat: 2, ease: 'Sine.easeInOut', onComplete: () => { t.logC.angle = 0; } });
      t.markerG.setVisible(true).setAlpha(1);
      s.tweens.add({ targets: t.markerG, alpha: 0, delay: 150, duration: 200, onComplete: () => t.markerG.setVisible(false) });
      return;
    }
    s.tweens.killTweensOf(t.flashG);
    t.flashG.setAlpha(1).x = 0;
    s.tweens.add({ targets: t.flashG, alpha: 0, delay: 150, duration: dur(200) });
    s.tweens.add({ targets: [t.flashG, t.gapG], x: { from: -4, to: 0 }, duration: dur(220), ease: 'Elastic.easeOut' });
  }

  _makeEngine() {
    const s = this.scene, G = this.g, h = G.rodH;
    const c = new GO.Container(s, G.x0 + G.n * G.unit + 2, G.trackY);
    const g = new GO.Graphics(s);
    const ew = h * 2.1, base = h / 2, cabW = ew * 0.42, cabTop = base - h * 1.9;
    const bx = cabW - 2, bw = ew - cabW - h * 0.05, btop = base - h * 1.1;
    g.fillStyle(0x374151, 1).fillRect(-6, -h * 0.12, 10, h * 0.24);
    g.fillStyle(0x374151, 1).fillRoundedRect(0, base - h * 0.38, ew, h * 0.3, 4);
    g.fillStyle(0xdc2626, 1).fillRoundedRect(2, cabTop + h * 0.25, cabW, base - h * 0.3 - (cabTop + h * 0.25), 6);
    g.lineStyle(2, 0x7f1d1d, 1).strokeRoundedRect(2, cabTop + h * 0.25, cabW, base - h * 0.3 - (cabTop + h * 0.25), 6);
    g.fillStyle(0x7f1d1d, 1).fillRoundedRect(-3, cabTop + h * 0.08, cabW + 10, h * 0.24, 5);
    g.fillStyle(0xfde68a, 1).fillRoundedRect(2 + cabW * 0.22, cabTop + h * 0.45, cabW * 0.56, h * 0.45, 4);
    g.fillStyle(0xef4444, 1).fillRoundedRect(bx, btop, bw, h * 0.8, h * 0.3);
    g.lineStyle(2, 0x7f1d1d, 1).strokeRoundedRect(bx, btop, bw, h * 0.8, h * 0.3);
    g.fillStyle(0xfacc15, 1).fillRect(bx + bw * 0.28, btop + 1, h * 0.12, h * 0.8 - 2).fillRect(bx + bw * 0.58, btop + 1, h * 0.12, h * 0.8 - 2);
    const chx = bx + bw * 0.72;
    g.fillStyle(0x1f2937, 1).fillRect(chx - h * 0.14, btop - h * 0.45, h * 0.28, h * 0.46);
    g.fillRoundedRect(chx - h * 0.22, btop - h * 0.6, h * 0.44, h * 0.18, 3);
    g.fillStyle(0xfef08a, 1).fillCircle(bx + bw - 2, btop + h * 0.3, h * 0.12);
    g.fillStyle(0xfacc15, 1).fillTriangle(ew - h * 0.05, base - h * 0.38, ew + h * 0.35, base + h * 0.05, ew - h * 0.05, base + h * 0.05);
    const wr = h * 0.3;
    for (const wx of [ew * 0.18, ew * 0.5, ew * 0.8]) { g.fillStyle(0x111827, 1).fillCircle(wx, base, wr); g.fillStyle(0x9ca3af, 1).fillCircle(wx, base, wr * 0.4); }
    c.add(g);
    c.chimney = { x: chx, y: btop - h * 0.6 };
    return c;
  }

  async celebrate() {
    const s = this.scene, q = this.q, t = this.track, G = this.g;
    if (!q || !t) return;
    this.step = 'done';
    this._cancelMakeTen();
    const rods = [this.rodA, this.rodB].filter(r => r && r.active);
    rods.forEach((r, i) => { r.mood('happy', 1000); s.time.delayedCall(i * 110, () => r.glow()); });
    const midX = G.x0 + (G.n * G.unit) / 2 + t.x;
    fx.burst(s, midX, G.trackY, { count: 14 });
    sfx.star(2);
    // bond lines draw on in green, circles pulse
    const lp = { p: 0 }, qid = this._qid;
    s.tweens.add({ targets: lp, p: 1, duration: dur(300), ease: 'Quad.easeOut', onUpdate: () => { if (qid === this._qid) this._drawLines(lp.p, UI.good, 0.95); } });
    const pulse = [this.wholeC, ...(this.parts ? [this.parts.a, this.parts.b] : [])].filter(Boolean);
    s.tweens.add({ targets: pulse, scale: 1.15, duration: dur(130), yoyo: true, ease: 'Quad.easeOut' });
    (this._eqToks || []).forEach((o, i) => s.tweens.add({ targets: o, scale: 1.15, delay: i * 40, duration: dur(110), yoyo: true }));
    if (q.type === 'build') {
      await sleep(s, 140);
      if (!t.active) return;
      const eng = this._makeEngine();
      t.add(eng);
      eng.setScale(0.2);
      s.tweens.add({ targets: eng, scale: 1, duration: dur(160), ease: 'Back.easeOut' });
      sfx.toot();
      await sleep(s, 120);
      if (!t.active) return;
      t._leaving = true;
      this._rollIn = true;
      const dist = s.scale.width - (G.x0 - 20) + 40;
      const puff = () => { if (t.active) { const w = worldPos(eng); fx.puff(s, w.x + eng.chimney.x, w.y + eng.chimney.y); } };
      puff();
      [120, 240, 360].forEach(ms => s.time.delayedCall(ms, puff));
      s.tweens.add({ targets: t, x: t.x + dist, duration: dur(420), ease: 'Cubic.easeIn', onComplete: () => { killDeep(s, t); t.destroy(); } });
      await sleep(s, 280);
    } else {
      await sleep(s, 160);
      if (!this.parts) return;
      const tgt = [['a', this.rodA], ['b', this.rodB]];
      tgt.forEach(([p, rod], i) => {
        if (!rod || !rod.active) return;
        reparent(rod, this.fxLayer);
        const pc = this.parts[p];
        const sc = Math.min(1, (G.r * 1.8) / (rod.len * rod.unit));
        const tx = pc.x - (rod.len * rod.unit * sc) / 2;
        s.tweens.add({ targets: rod, scaleX: sc, scaleY: sc, duration: dur(320), delay: i * 60, ease: 'Quad.easeOut' });
        s.time.delayedCall(i * 60, () => rod.arcTo(tx, pc.y, { height: 40, duration: 320 }).then(() => {
          if (!rod.active) return;
          sfx.tick(6 + i * 3);
          if (pc.active) s.tweens.add({ targets: pc, scale: 1.2, duration: 90, yoyo: true });
          s.tweens.add({ targets: rod, alpha: 0, duration: 160, onComplete: () => rod.destroy() });
        }));
      });
      this.rodA = this.rodB = null;
      await sleep(s, 400);
    }
  }

  // ------------------------------------------------------------------ make-ten hint
  _cancelMakeTen() {
    const mt = this._mt;
    if (!mt) return;
    mt.alive = false;
    this._mt = null;
    mt.objs.forEach(o => { if (o.active) { this.scene.tweens.killTweensOf(o); o.destroy(); } });
    mt.hidden.forEach(i => { const c = this._cells[i]; if (c && c.active) c.setVisible(true); });
  }

  async playMakeTen() {
    const q = this.q;
    if (!q || !(this.step === 'build' || this.step === 'answer' || this.step === 'done') || this._mt) return;
    const mv = makeTenMove(q.a, q.b);
    if (!mv) return;
    const s = this.scene, qid = this._qid;
    const mt = (this._mt = { objs: [], hidden: [], alive: true });
    const ok = () => mt.alive && qid === this._qid && this.active;
    const lit = p => this._lit[p] > 0;
    const colorOf = p => (lit(p) ? RODS[q[p]].hex : GHOST);
    const add = o => { this.fxLayer.add(o); mt.objs.push(o); return o; };
    // ghost cells for a part that is not placed yet
    const ghosts = { a: [], b: [] };
    for (const p of ['a', 'b']) {
      if (lit(p)) continue;
      for (let j = 0; j < q[p]; j++) {
        const g = add(this._cellGfx(GHOST, this._idx(p, j)).setAlpha(0));
        s.tweens.add({ targets: g, alpha: 1, duration: dur(150), delay: j * 15 });
        ghosts[p].push(g);
      }
    }
    sfx.whoosh();
    await sleep(s, 200);
    if (!ok()) return;
    const { from, to, count } = mv;
    const movers = [];
    for (let m = 0; m < count; m++) {
      const j = q[from] - 1 - m;
      const srcI = this._idx(from, j), dstI = this._idx(to, q[to] + m);
      let obj;
      if (lit(from)) {
        const c = this._cells[srcI];
        if (c) { c.setVisible(false); mt.hidden.push(srcI); }
        obj = add(this._cellGfx(colorOf(from), srcI));
      } else obj = ghosts[from][j];
      movers.push({ obj, src: this._cellPos(srcI), dst: this._cellPos(dstI) });
    }
    const hop = (obj, a, b, ms, h) => {
      const st = { t: 0 };
      return tweenP(s, { targets: st, t: 1, duration: dur(ms), ease: 'Sine.easeInOut', onUpdate: () => { if (obj.active) obj.setPosition(a.x + (b.x - a.x) * st.t, a.y + (b.y - a.y) * st.t - 4 * h * st.t * (1 - st.t)); } });
    };
    const lift = this.g.cell * 1.6;
    for (let m = 0; m < movers.length; m++) {
      const mvr = movers[m];
      hop(mvr.obj, mvr.src, mvr.dst, 280, lift).then(() => { if (ok()) sfx.tick(10 + m); });
      await sleep(s, 190);
      if (!ok()) return;
    }
    await sleep(s, 260);
    if (!ok()) return;
    // the target frame becomes an orange ten
    const f = this._idx(to, 0) >= 10 ? 1 : 0;
    const tens = [];
    for (let c = 0; c < 10; c++) {
      const o = add(this._cellGfx(RODS[10].hex, f * 10 + c).setAlpha(0));
      tens.push(o);
      s.tweens.add({ targets: o, alpha: 1, delay: c * 18, duration: dur(120) });
    }
    const p0 = this._cellPos(f * 10), c = this.g.cell;
    const flash = add(new GO.Graphics(s));
    flash.fillStyle(0xffffff, 1).fillRoundedRect(p0.x - c / 2 - 4, p0.y - c / 2 - 4, 5 * c + 8, 2 * c + 8, 8);
    s.tweens.add({ targets: flash, alpha: 0, duration: dur(320) });
    sfx.star(3);
    fx.sparks(s, p0.x + 2 * c, p0.y + c / 2);
    const smaller = q[from];
    this._morphEq([
      { k: 'chip', v: 10, len: 10 }, { k: 'op', v: '+' },
      { k: 'chip', v: q.n - 10, len: smaller, hex: colorOf(from) }, { k: 'op', v: '=' }, { k: 'num', v: q.n },
    ]);
    await sleep(s, 1350);
    if (!ok()) return;
    // ease everything back
    s.tweens.add({ targets: tens, alpha: 0, duration: dur(200) });
    movers.forEach(mvr => hop(mvr.obj, mvr.dst, mvr.src, 300, lift * 0.6));
    this._morphEq(this._eqTokens());
    await sleep(s, 330);
    if (!ok()) return;
    const gl = [...ghosts.a, ...ghosts.b];
    if (gl.length) await tweenP(s, { targets: gl, alpha: 0, duration: dur(150) });
    if (this._mt === mt) this._cancelMakeTen();
  }

  destroy(fromScene) {
    this._qid++;
    if (this._mt) this._mt.alive = false;
    if (this.scene && this.scene.tweens) killDeep(this.scene, this);
    super.destroy(fromScene);
  }
}
