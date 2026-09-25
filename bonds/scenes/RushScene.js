// Rod Town 數棒鎮 — timed Rush for one world: mixed Build / Break on the linked board, scored by the
// shared combo / fever / timer engine through the bridge (DOM HUD), plus in-canvas juice:
// combo badge that grows and shakes, marquee lights that speed up at combo 3/4/5, fever rainbow rail +
// cool rods + zoom pulses, last-5-seconds red vignette with clock ticks.
// Start data: { w }. Test hook: scene.__test = { answer(), play(correct), step(), state() }.
import { genRush } from '../../bonds-logic.js?v=202609251524';
import { FONT, WORLD_THEME } from '../theme.js?v=202609251524';
import { fx } from '../fx.js?v=202609251524';
import { sfx } from '../sfx.js?v=202609251524';
import { Board } from '../ui/Board.js?v=202609251524';
import { Tray } from '../ui/Tray.js?v=202609251524';
import { DPR, worldPos, reducedMotion } from '../ui/Rod.js?v=202609251524';
import { domLeft, backButton, makeBubble } from '../ui/Chrome.js?v=202609251524';

const BUILD_PTS = 10, BREAK_PTS = 15;
const LIGHT_PERIOD = [900, 900, 900, 480, 300, 150]; // ms per chase step by combo (index = min(combo, 5))
const hsv = (h, s = 0.8, v = 1) => Phaser.Display.Color.HSVToRGB(((h % 1) + 1) % 1, s, v).color;
const T = (scene, x, y, s, size, color = '#1f2937', extra = {}) =>
  scene.add.text(x, y, String(s), { fontFamily: FONT, fontStyle: 'bold', fontSize: `${Math.round(size)}px`, color, resolution: DPR, padding: { x: 2, y: 3 }, ...extra }).setOrigin(0.5);

export class RushScene extends Phaser.Scene {
  constructor() { super('Rush'); }
  init(data) { this.w = Math.min(4, Math.max(1, (data && data.w) || 1)); }

  create() {
    const bridge = this.bridge = this.registry.get('bridge');
    this.state = 'countdown'; // countdown | play | over | left
    this.q = null;
    this.busy = false;
    this.fever = false;
    this.combo = 0;
    this.lastSec = null;
    this.lightT = 0; this.lightPhase = 0;
    this.cam = this.cameras.main;
    this.input.enabled = true; // finish() turns it off; the input plugin survives restarts

    this.bg = this.add.graphics().setDepth(-10);
    this.lights = this.add.container(0, 0).setDepth(-5);
    this.board = new Board(this, { fast: true }); // short merge sequence (≈ 0.8-1 s) keeps the rush flowing
    this.tray = new Tray(this);
    this.tray.setEnabled(false);
    this.tray.on('choose', rod => this.onChoose(rod));
    this.board.on('cut', k => this.onCut(k));
    this.rainbow = null;

    this.th = WORLD_THEME[this.w] || WORLD_THEME[1];
    this.top = 84; this.comboX = 0;
    this.backBtn = backButton(this, () => this.leave()).setDepth(30);
    this.bubble = makeBubble(this).setDepth(20);
    this.bubble.stroke = this.th.accent;
    this.makeCombo();

    if (!this.textures.exists('rushVignette')) this.textures.createCanvas('rushVignette', 256, 256);
    this.vignette = this.add.image(0, 0, 'rushVignette').setOrigin(0).setDepth(900).setVisible(false);
    this.bigSec = T(this, 0, 0, '', 150, '#ef4444', { stroke: '#ffffff', strokeThickness: 10 }).setDepth(890).setAlpha(0);
    this.dim = this.add.graphics().setDepth(940);
    this.cdText = T(this, 0, 0, '', 120, '#f97316', { stroke: '#ffffff', strokeThickness: 12 }).setDepth(950).setAlpha(0);
    this.cdSub = T(this, 0, 0, '', 20, '#ffffff', { stroke: '#1f2937', strokeThickness: 5 }).setDepth(950);

    this.setBubble('⏱', '準備好了嗎？', 'Get ready!');
    this.scale.on('resize', this.relayout, this);
    this.events.once('shutdown', this.cleanup, this);
    this.relayout();
    fx.irisIn(this);
    this.countdown();

    this.__test = {
      answer: () => (this.board.step === 'cut' ? this.q.a : this.q ? this.q.b : null),
      step: () => this.board.step,
      state: () => bridge.rushState(),
      /** Perform one right (default) or wrong move programmatically; returns the value used. */
      play: (correct = true) => {
        const q = this.q;
        if (!q || this.state !== 'play') return null;
        if (this.board.step === 'cut') {
          const k = correct ? q.a : (q.a === 1 ? 2 : 1);
          this.board.emit('cut', k);
          return k;
        }
        const rod = this.tray.rods.find(r => (correct ? r.len === q.b : r.len !== q.b) && !r._busy);
        if (!rod) return null;
        rod._busy = true;
        this.tray.emit('choose', rod);
        return rod.len;
      },
    };
  }

  // ---------------------------------------------------------------- building blocks
  makeCombo() {
    const c = this.comboC = this.add.container(0, 46).setDepth(25).setAlpha(0);
    this.comboG = this.add.graphics();
    this.comboNum = T(this, 0, -3, '0', 26, '#ffffff', { stroke: '#7c2d12', strokeThickness: 4 });
    this.comboLbl = T(this, 0, 16, '連擊', 10, '#ffffff');
    c.add([this.comboG, this.comboNum, this.comboLbl]);
    this.drawComboBadge(false);
  }

  drawComboBadge(hot) {
    const g = this.comboG; g.clear();
    g.fillStyle(0x000000, 0.18).fillCircle(0, 3, 26);
    g.fillStyle(hot ? 0xf97316 : this.combo > 0 ? 0xa855f7 : 0x9ca3af, 1).fillCircle(0, 0, 26);
    g.lineStyle(3, hot ? 0xfde047 : 0xffffff, 1).strokeCircle(0, 0, 26);
  }

  setBubble(icon, zh, en) { this.bubble.setText(icon, zh, en); }

  // ---------------------------------------------------------------- layout
  relayout() {
    const W = this.scale.width, H = this.scale.height;
    const th = this.th;
    this.bg.clear();
    this.bg.fillGradientStyle(th.sky, th.sky, 0xffffff, 0xffffff, 1).fillRect(0, 0, W, H);
    this.bg.fillStyle(th.ground, 0.5).fillEllipse(W * 0.25, H + 20, W * 0.9, H * 0.35).fillEllipse(W * 0.8, H + 30, W * 0.8, H * 0.3);
    // marquee lights along the top
    this.lights.removeAll(true);
    const n = Math.max(8, Math.floor((W - 16) / 24));
    const sp = (W - 16) / (n - 1);
    this.lightsG = this.add.graphics();
    this.lightsG.lineStyle(2, 0x475569, 0.6).lineBetween(8, 9, W - 8, 9);
    this.lights.add(this.lightsG);
    this.bulbs = [];
    for (let i = 0; i < n; i++) {
      const b = this.add.circle(8 + i * sp, 11, 5, 0xfacc15, 1).setStrokeStyle(1.5, 0xffffff, 0.9);
      this.bulbs.push(b); this.lights.add(b);
    }
    this.paintLights();
    // top bar: back button, bubble, combo badge — all left of the DOM test / mute / admin buttons
    this.backBtn.setPosition(34, 46);
    this.comboX = domLeft(this) - 40; // the badge grows to r ≈ 42 at high combos
    this.comboC.setPosition(this.comboX, 46);
    const bx0 = 66, rowW = this.comboX - 44 - bx0;
    if (rowW >= 300) { const bw = Math.min(560, rowW); this.bubble.layout(bx0 + (rowW - bw) / 2, 17, bw, 58); this.top = 92; }
    else { this.bubble.layout(10, 94, W - 20, 58); this.top = 160; } // narrow: own row, clear of the grown combo badge
    const TOP = this.top;
    // board + tray (LevelScene rules: wide when W > 1.1 H → board left 65 %, tray column right)
    const m = 10;
    if (W > H * 1.1) {
      const bw = Math.round(W * 0.65);
      this.board.layout(m, TOP, bw - m, H - TOP - m);
      this.tray.layout(bw + m, TOP, W - bw - 2 * m, H - TOP - m, true);
    } else {
      const trayH = Math.round(Math.max(130, Math.min(240, H * 0.22)));
      this.board.layout(m, TOP, W - 2 * m, H - TOP - trayH - 2 * m);
      this.tray.layout(m, H - trayH - m, W - 2 * m, trayH, false);
    }
    this.tray.setUnit(this.board.unit);
    this.tray.dropZone = this.board.trackRect;
    // overlays
    this.dim.clear().fillStyle(0x1f2937, 0.35).fillRect(0, 0, W, H);
    this.cdText.setPosition(W / 2, H / 2 - 10);
    this.cdSub.setPosition(W / 2, H / 2 + 70);
    this.bigSec.setPosition(W / 2, H / 2);
    if (this.vignette.visible) this.drawVignette();
  }

  // ---------------------------------------------------------------- countdown → start
  countdown() {
    this.cdSub.setText(`W${this.w} 快閃挑戰 Rush!`);
    const steps = [['3', '#ef4444'], ['2', '#f97316'], ['1', '#22c55e'], ['開始!', '#2563eb']];
    steps.forEach(([s, col], i) => this.time.delayedCall(450 + i * 800, () => {
      if (this.state !== 'countdown') return;
      const go = i === steps.length - 1;
      this.cdText.setText(s).setColor(col).setFontSize(go ? 84 : 130).setAlpha(1).setScale(0.2).setAngle(go ? 0 : (i % 2 ? 8 : -8));
      this.tweens.killTweensOf(this.cdText);
      this.tweens.add({ targets: this.cdText, scale: 1, angle: 0, duration: 260, ease: 'Back.easeOut' });
      this.tweens.add({ targets: this.cdText, alpha: 0, scale: 1.5, delay: 520, duration: 260, ease: 'Quad.easeIn' });
      if (go) { sfx.toot(); fx.burst(this, this.scale.width / 2, this.scale.height / 2, { count: 16 }); this.start(); }
      else { sfx.tick(i * 4); fx.shake(this, 0.004); }
    }));
  }

  start() {
    this.state = 'play';
    this.tweens.add({ targets: [this.dim, this.cdSub], alpha: 0, duration: 250 });
    this.bridge.rushStart(this.w, () => this.finish());
    this.fixScale(); // the DOM HUD just took space from #phaser
    this.comboC.setAlpha(1);
    this.updateCombo(this.bridge.rushState(), false);
    this.comboC.setScale(0.2);
    this.tweens.add({ targets: this.comboC, scale: 1, duration: 300, ease: 'Back.easeOut' });
    this.next();
  }

  // ---------------------------------------------------------------- question loop
  next() {
    if (this.state !== 'play') return;
    this.q = genRush(this.w, Math.random, this.q);
    const q = this.q;
    this.busy = false;
    this.board.setQuestion(q, { labels: true });
    if (q.type === 'build') {
      this.setBubble('🚂', `合成 ${q.n}：還差多少？`, `Make ${q.n}: what's missing?`);
      this.tray.setRods(q.tray, { unit: this.board.unit, labels: true });
      this.tray.setEnabled(true);
    } else {
      this.setBubble('🪚', `分解 ${q.n}：切出 ${q.a}`, `Split ${q.n}: cut off ${q.a}`);
      this.tray.setRods([], { unit: this.board.unit, labels: true });
      this.tray.setEnabled(false);
    }
    this.tray.dropZone = this.board.trackRect;
    this.applyMood();
  }

  async onChoose(rod) {
    const q = this.q;
    const ready = this.state === 'play' && !this.busy && q && (q.type === 'build' ? this.board.step === 'build' : this.board.step === 'answer');
    if (!ready) { this.tray.returnRod(rod); return; }
    const base = q.type === 'build' ? BUILD_PTS : BREAK_PTS;
    const p = worldPos(rod), rx = p.x + (rod.len * rod.unit) / 2, ry = p.y - 20;
    if (rod.len === q.b) {
      this.busy = true;
      this.tray.setEnabled(false);
      const pts = this.bridge.rushHit(true, base);
      this.scorePop(rx, ry, pts);
      this.juice(true);
      await this.board.placeAnswer(rod);
      if (this.state !== 'play') return;
      await this.board.celebrate();
      if (this.state !== 'play') return;
      this.next();
    } else {
      this.bridge.rushHit(false, base);
      this.tray.returnRod(rod);
      this.board.rejectAt();
      this.juice(false);
    }
  }

  async onCut(k) {
    if (this.state !== 'play' || this.busy || this.board.step !== 'cut') return;
    const q = this.q;
    if (k === q.a) {
      this.busy = true;
      await this.board.cutAt(k);
      if (this.state !== 'play' || this.q !== q) return;
      this.setBubble('❓', `${q.n} − ${q.a} = ？`, `What's left?`);
      this.tray.setRods(q.tray, { unit: this.board.unit, labels: true });
      this.tray.setEnabled(true);
      this.applyMood();
      this.busy = false;
    } else {
      this.bridge.rushHit(false, BREAK_PTS);
      this.board.rejectAt();
      this.juice(false);
    }
  }

  // ---------------------------------------------------------------- juice
  scorePop(x, y, pts) {
    const fever = this.bridge.rushState().isFever;
    fx.floatText(this, x, y, '+' + pts, fever ? '#db2777' : '#f97316');
    if (fever) this.time.delayedCall(90, () => fx.floatText(this, x + 34, y - 18, '×2', '#7c3aed'));
  }

  juice(correct) {
    const st = this.bridge.rushState();
    const wasFever = this.fever;
    this.updateCombo(st, true);
    if (st.isFever !== this.fever) this.setFever(st.isFever);
    if (!correct) return;
    if (st.isFever) {
      fx.zoomPulse(this, 0.03);
      if (!wasFever) {
        fx.shake(this, 0.008);
        fx.burst(this, this.comboC.x, this.comboC.y, { count: 20, tint: [0xef4444, 0xfacc15, 0x22c55e, 0x3b82f6, 0xa855f7] });
        const t = T(this, this.scale.width / 2, this.top + 70, '😎 FEVER!', 44, '#f97316', { stroke: '#ffffff', strokeThickness: 8 }).setDepth(960).setScale(0.3);
        this.tweens.add({ targets: t, scale: 1.1, duration: 260, ease: 'Back.easeOut' });
        this.tweens.add({ targets: t, alpha: 0, y: t.y - 40, delay: 700, duration: 350, onComplete: () => t.destroy() });
      }
    } else if (st.combo >= 3) {
      fx.burst(this, this.comboC.x, this.comboC.y, { count: 4 + st.combo });
    }
  }

  updateCombo(st, animate) {
    const prev = this.combo;
    this.combo = st.combo;
    const c = this.comboC;
    this.comboNum.setText(String(st.combo));
    this.drawComboBadge(st.isFever);
    const target = Math.min(1.6, 1 + 0.1 * st.combo);
    this.tweens.killTweensOf(c);
    c.x = this.comboX;
    c.angle = 0;
    if (!animate || reducedMotion()) { c.setScale(target); return; }
    if (st.combo > prev) {
      c.setScale(target * 1.35);
      this.tweens.add({ targets: c, scale: target, duration: 260, ease: 'Back.easeOut' });
      const amp = Math.min(10, 2 + st.combo);
      this.tweens.add({ targets: c, angle: { from: -amp, to: amp }, duration: 55, yoyo: true, repeat: 3, onComplete: () => { c.angle = 0; } });
    } else if (st.combo < prev) {
      this.tweens.add({ targets: c, scale: target, duration: 220, ease: 'Quad.easeOut' });
      this.tweens.add({ targets: c, x: c.x + 5, duration: 45, yoyo: true, repeat: 3, onComplete: () => { c.x = this.comboX; } });
    } else c.setScale(target);
  }

  setFever(on) {
    this.fever = on;
    this.bubble.setStroke(on ? 0xf97316 : this.th.accent);
    this.applyMood();
    if (!on && this.rainbow && this.rainbow.active) this.rainbow.clear();
  }

  /** Sunglasses for every visible rod in fever; back to normal otherwise. */
  applyMood() {
    const m = this.fever ? 'cool' : 'normal';
    const rods = [...this.tray.rods, this.board.rodA, this.board.rodB].filter(r => r && r.active);
    rods.forEach(r => r.mood(m));
  }

  paintLights() {
    if (!this.bulbs) return;
    const fever = this.fever, ph = this.lightPhase, t = this.time.now / 1000;
    this.bulbs.forEach((b, i) => {
      const on = (i + ph) % 3 === 0;
      if (fever) b.setFillStyle(hsv(i / 10 + t * 0.6), on ? 1 : 0.55);
      else b.setFillStyle(on ? 0xfde047 : 0xfef9c3, on ? 1 : 0.6);
      b.setScale(on ? 1.25 : 1);
    });
  }

  drawRainbow() {
    const t = this.board.track, G = this.board.g;
    if (!t || !t.active || !G) return;
    if (!this.rainbow || !this.rainbow.active || this.rainbow.parentContainer !== t) {
      this.rainbow = new Phaser.GameObjects.Graphics(this);
      t.addAt(this.rainbow, 1); // above the wooden rail, below gap / log / rods
    }
    const g = this.rainbow; g.clear();
    const W = G.n * G.unit + 16, x = G.x0 - 8, y = G.trackY - G.railH / 2, h = G.railH;
    const k = Math.max(8, G.n * 2), sw = W / k, hue0 = this.time.now / 1400;
    for (let i = 0; i < k; i++) g.fillStyle(hsv(hue0 + i / k), 0.5).fillRect(x + i * sw, y, sw + 0.5, h);
    g.lineStyle(4, hsv(hue0 + 0.5, 0.9, 1), 1).strokeRoundedRect(x - 2, y - 2, W + 4, h + 4, 12);
  }

  /** Red radial vignette (canvas gradient, stretched to the screen); it closes in as the clock runs down. */
  drawVignette() {
    const tex = this.textures.get('rushVignette'), ctx = tex.getContext();
    const left = Math.max(1, this.bridge.rushState().timeLeft);
    const k = Math.min(1, (6 - left) / 5); // 0.2 at 5 s … 1 at 1 s
    ctx.clearRect(0, 0, 256, 256);
    const gr = ctx.createRadialGradient(128, 128, 128 * (0.95 - 0.4 * k), 128, 128, 182);
    gr.addColorStop(0, 'rgba(220,38,38,0)');
    gr.addColorStop(0.6, `rgba(220,38,38,${0.35 + 0.2 * k})`);
    gr.addColorStop(1, `rgba(185,28,28,${0.75 + 0.15 * k})`);
    ctx.fillStyle = gr;
    ctx.fillRect(0, 0, 256, 256);
    tex.refresh();
    this.vignette.setDisplaySize(this.scale.width, this.scale.height);
  }

  lastSeconds(left) {
    sfx.clock();
    this.vignette.setVisible(true);
    this.drawVignette();
    this.tweens.killTweensOf(this.vignette);
    this.vignette.setAlpha(1);
    this.tweens.add({ targets: this.vignette, alpha: 0.45, duration: 480, yoyo: true, ease: 'Sine.easeInOut' });
    this.bigSec.setText(String(left)).setAlpha(0.45).setScale(0.6);
    this.tweens.killTweensOf(this.bigSec);
    this.tweens.add({ targets: this.bigSec, scale: 1.3, alpha: 0, duration: 850, ease: 'Quad.easeOut' });
    const el = document.getElementById('timerDisplay');
    if (el && el.animate) {
      el.style.display = 'inline-block';
      el.animate([{ transform: 'scale(1.6)', color: '#dc2626' }, { transform: 'scale(1)' }], { duration: 400, easing: 'ease-out' });
    }
  }

  update(time, delta) {
    if (!this.bulbs) return;
    const playing = this.state === 'play';
    const st = playing ? this.bridge.rushState() : null;
    if (st) {
      // the engine can drop fever / combo on its own (10 s fever timeout)
      if (st.combo !== this.combo) this.updateCombo(st, true);
      if (st.isFever !== this.fever) this.setFever(st.isFever);
      if (st.timeLeft !== this.lastSec) {
        this.lastSec = st.timeLeft;
        if (st.timeLeft <= 5 && st.timeLeft > 0) this.lastSeconds(st.timeLeft);
      }
    }
    const period = this.fever ? 110 : LIGHT_PERIOD[Math.min(5, this.combo)];
    this.lightT += delta;
    if (this.lightT >= period) { this.lightT = 0; this.lightPhase = (this.lightPhase + 1) % 3; this.paintLights(); }
    else if (this.fever) this.paintLights();
    if (this.fever && playing) this.drawRainbow();
  }

  // ---------------------------------------------------------------- end / leave
  async finish() {
    if (this.state !== 'play') return;
    this.state = 'over';
    this.busy = true;
    this.tray.setEnabled(false);
    this.input.enabled = false;
    this.tweens.killTweensOf(this.vignette);
    this.vignette.setVisible(false);
    this.bigSec.setAlpha(0);
    const W = this.scale.width, H = this.scale.height;
    this.dim.setAlpha(1);
    const t = T(this, W / 2, H / 2, '時間到！', 64, '#ef4444', { stroke: '#ffffff', strokeThickness: 10 }).setDepth(960).setScale(0.2);
    const e = T(this, W / 2, H / 2 + 56, "Time's up!", 26, '#ffffff', { stroke: '#1f2937', strokeThickness: 6 }).setDepth(960).setAlpha(0);
    this.tweens.add({ targets: t, scale: 1, duration: 320, ease: 'Back.easeOut' });
    this.tweens.add({ targets: e, alpha: 1, delay: 200, duration: 200 });
    sfx.fanfare();
    fx.fireworks(this);
    this.resetTimerStyle();
    await new Promise(r => this.time.delayedCall(1100, r));
    if (this.state !== 'over') return;
    const done = this.bridge.rushEnd(this.w); // rank popup, then the DOM leaderboard ("Back to map" → Map)
    this.fixScale(); // HUD hidden synchronously by rushEnd
    await done;
  }

  leave() {
    if (this.state === 'over' || this.state === 'left') return;
    const wasPlaying = this.state === 'play';
    this.state = 'left';
    this.tray.setEnabled(false);
    if (wasPlaying) { this.bridge.rushAbort(); this.fixScale(); } // nothing saved
    this.resetTimerStyle();
    sfx.whoosh();
    fx.iris(this, 'Map', { focusW: this.w });
  }

  /**
   * Re-measure #phaser after the DOM HUD was shown / hidden. The bridge calls game.scale.refresh(), but
   * Phaser 3.90's refresh() sizes the canvas from the *cached* parent size and only then re-reads the
   * parent, so the canvas stays one state behind (and the 500 ms poll then sees no change). Reading the
   * parent first and refreshing again gives the right size at once (emits 'resize' → relayout).
   */
  fixScale() {
    const S = this.scale;
    S.getParentBounds();
    S.refresh();
  }

  resetTimerStyle() {
    const el = document.getElementById('timerDisplay');
    if (el) el.style.display = '';
  }

  cleanup() {
    this.scale.off('resize', this.relayout, this);
    if (this.state === 'play') { this.bridge.rushAbort(); this.fixScale(); } // stopped from outside mid-run (dev go(), restart)
    this.state = 'left';
    this.resetTimerStyle();
  }
}
