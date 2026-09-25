// Rod Town 數棒鎮 levels: 合成 Build (train station) and 分解 Break (rod cutter).
// Five questions on the linked board, a progress dot per question, stars at the end.
// Start data: { w: 1..4, level: 1..6 }.
// Test hook: scene.__test = { answer(), mistakes(), index(), step(), q() }.
import { levelPlan, starsFor, levelKey, makeTenMove, isLevelOpen, LEVEL_COUNT, world } from '../../bonds-logic.js?v=202609251524';
import { UI, WORLD_THEME } from '../theme.js?v=202609251524';
import { fx } from '../fx.js?v=202609251524';
import { sfx } from '../sfx.js?v=202609251524';
import { Board } from '../ui/Board.js?v=202609251524';
import { Tray } from '../ui/Tray.js?v=202609251524';
import { dur, reducedMotion } from '../ui/Rod.js?v=202609251524';
import { T, domLeft, roundButton, backButton, makeBubble, pillButton, drawStarSlot, drawPanel, dropStar, newBestBadge, shineStars } from '../ui/Chrome.js?v=202609251524';

const QN = 5;
const PRAISE = [['好叻！', '#16a34a'], ['正呀！', '#f97316'], ['好棒！', '#2563eb'], ['Yeah!', '#a855f7'], ['叻叻！', '#db2777']];
const END_MSG = {
  3: ['完美！', 'Perfect!'],
  2: ['好叻！', 'Great job!'],
  1: ['做得好！', 'Well done!'],
};
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export class LevelScene extends Phaser.Scene {
  constructor() { super('Level'); }
  init(data) { this.startData = data || {}; }

  create() {
    const d = this.startData;
    this.bridge = this.registry.get('bridge') || {};
    this.w = clamp(Math.round(Number(d.w) || 1), 1, 4);
    this.level = clamp(Math.round(Number(d.level) || 1), 1, LEVEL_COUNT);
    this.th = WORLD_THEME[this.w];
    this.plan = levelPlan(this.w, this.level, Math.random);
    this.labels = this.plan.labels;
    this.idx = 0; this.done = 0; this.mistakes = 0; this.wrongHere = 0; this.gen = 0;
    this.busy = true; this.ended = false; this.leaving = false; this.hinting = false; this.dead = false;
    this.q = null; this.trayShown = false; this.trayOff = { x: 0, y: 0 };
    this.endLayer = null; this.result = null; this.bubbleRect = null;
    this.hintRoom = world(this.w).max >= 11; // only worlds with n ≥ 11 can ever show 💡

    this.bg = this.add.graphics().setDepth(-10);
    this.makeClouds();
    this.buildTopBar();
    this.board = new Board(this);
    this.tray = new Tray(this);
    this.tray.setVisible(false).setEnabled(false);
    this.tray.on('choose', rod => this.onChoose(rod));
    this.board.on('cut', k => this.onCut(k));

    this.onResize = () => this.relayout();
    this.scale.on('resize', this.onResize);
    this.events.once('shutdown', () => { this.scale.off('resize', this.onResize); this.gen++; this.dead = true; });

    this.relayout();
    this.__test = {
      answer: () => (this.q && this.board.step === 'cut' ? this.q.a : this.q ? this.q.b : null),
      mistakes: () => this.mistakes,
      index: () => this.idx,
      step: () => (this.ended ? 'end' : this.board.step),
      q: () => this.q,
    };
    this.startQuestion(0);
    fx.irisIn(this);
  }

  // ---------------------------------------------------------------- scenery + top bar
  makeClouds() {
    this.clouds = [0, 1, 2].map(i => {
      const g = this.add.graphics().setDepth(-9).setAlpha(0.85);
      const s = 0.7 + 0.25 * i;
      g.fillStyle(0xffffff, 1).fillCircle(0, 0, 22 * s).fillCircle(24 * s, -10 * s, 28 * s).fillCircle(52 * s, 0, 20 * s).fillRoundedRect(-8 * s, 0, 70 * s, 16 * s, 8 * s);
      g.vx = 6 + 5 * i;
      g.fy = [0.16, 0.42, 0.7][i];
      g.x = Math.random() * this.scale.width;
      return g;
    });
  }

  drawBg(W, H) {
    const th = this.th;
    this.bg.clear();
    this.bg.fillGradientStyle(th.sky, th.sky, 0xffffff, 0xffffff, 1).fillRect(0, 0, W, H);
    this.bg.fillStyle(th.ground, 0.55).fillEllipse(W * 0.25, H + 20, W * 0.9, H * 0.35).fillEllipse(W * 0.8, H + 30, W * 0.8, H * 0.3);
    this.clouds.forEach(c => { c.y = H * c.fy; });
  }

  buildTopBar() {
    this.backBtn = backButton(this, () => { if (!this.endLayer) this.leave('Map', { focusW: this.w }); }).setDepth(60);
    this.titleLong = `${this.th.emoji} W${this.w} · 第 ${this.level} 關`;
    this.titleShort = `${this.th.emoji} 第 ${this.level} 關`;
    this.titleT = this.add.text(0, 0, this.titleLong, T(20)).setOrigin(0, 0.5).setDepth(60);
    this.dots = [];
    for (let i = 0; i < QN; i++) this.dots.push(this.add.graphics().setDepth(60));
    // instruction bubble
    this.bubble = makeBubble(this).setDepth(55);
    this.bubble.stroke = this.th.accent;
    // break step 1: a friendly pointer where the tray will slide in
    const ct = this.cutTip = this.add.container(0, 0).setDepth(5).setAlpha(0);
    const ctBg = this.add.graphics();
    ctBg.fillStyle(UI.paper, 0.9).fillRoundedRect(-112, -34, 224, 68, 22);
    ct.add([this.add.text(0, -12, '👆 點木頭切開', T(22, '#57534e')).setOrigin(0.5), this.add.text(0, 16, 'Tap the log to cut it', T(14, '#78716c')).setOrigin(0.5)]);
    ct.addAt(ctBg, 0);
    this.hintBtn = roundButton(this, { icon: '💡', fill: 0xfef9c3, rim: 0xfacc15, onTap: () => this.hint() }).setDepth(60).setVisible(false);
  }

  drawDots() {
    this.dots.forEach((g, i) => {
      g.clear();
      if (i < this.done) {
        g.fillStyle(0x000000, 0.15).fillCircle(0, 2, 8);
        g.fillStyle(UI.gold, 1).fillCircle(0, 0, 8);
        g.lineStyle(2, 0xffffff, 1).strokeCircle(0, 0, 8);
      } else if (i === this.idx && !this.ended) {
        g.fillStyle(0xffffff, 1).fillCircle(0, 0, 8);
        g.lineStyle(3, this.th.accent, 1).strokeCircle(0, 0, 8);
      } else {
        g.fillStyle(0xffffff, 0.7).fillCircle(0, 0, 7);
        g.lineStyle(2, 0x94a3b8, 0.8).strokeCircle(0, 0, 7);
      }
    });
  }

  markDone(i) {
    this.done = Math.max(this.done, i + 1);
    this.drawDots();
    const g = this.dots[i];
    if (g) { g.setScale(0.3); this.tweens.add({ targets: g, scale: 1, duration: dur(260), ease: 'Back.easeOut', easeParams: [3] }); }
  }

  setBubble(icon, zh, en) { this.bubble.setText(icon, zh, en); }

  // ---------------------------------------------------------------- layout
  relayout() {
    const W = this.scale.width, H = this.scale.height;
    this.drawBg(W, H);
    this.backBtn.setPosition(34, 36);
    const tx = 66, domL = domLeft(this);
    this.titleT.setText(this.titleLong).setScale(1);
    if (tx + this.titleT.width > domL) this.titleT.setText(this.titleShort);
    if (tx + this.titleT.width > domL) this.titleT.setScale(Math.max(0.6, (domL - tx) / this.titleT.width));
    this.titleT.setPosition(tx, 24);
    this.dots.forEach((g, i) => g.setPosition(tx + 9 + i * 21, 52));
    const leftR = tx + Math.max(this.titleT.displayWidth, QN * 21) + 14;
    const hintW = this.hintRoom ? 62 : 0;
    const rowW = domL - leftR - hintW;
    let bx, by, bw, bh, TOP;
    if (rowW >= 330) { // wide: bubble shares the top row
      bh = 64; by = 6; bw = Math.min(rowW, 620); bx = leftR + (rowW - bw) / 2; TOP = by + bh + 10;
    } else { // narrow: bubble gets its own row under the title
      bh = H >= 760 ? 66 : 58; by = 72; bx = 10; bw = W - 20 - hintW; TOP = by + bh + 8;
    }
    this.bubbleRect = { bx, by, bw, bh };
    this.bubble.layout(bx, by, bw, bh);
    this.hintBtn.setPosition(bx + bw + 8 + 26, by + bh / 2);

    const m = 10;
    if (W > H * 1.1) {
      const bw2 = Math.round(W * 0.65);
      this.board.layout(m, TOP, bw2 - m, H - TOP - m);
      this.tray.layout(bw2 + m, TOP, W - bw2 - 2 * m, H - TOP - m, true);
      this.trayOff = { x: W - bw2 + 30, y: 0 };
    } else {
      const trayH = Math.round(clamp(H * 0.22, 124, 230));
      this.board.layout(m, TOP, W - 2 * m, H - TOP - trayH - 2 * m);
      this.tray.layout(m, H - trayH - m, W - 2 * m, trayH, false);
      this.trayOff = { x: 0, y: trayH + m + 30 };
    }
    this.tray.setUnit(this.board.unit);
    this.tray.dropZone = this.board.trackRect;
    const tr = this.tray.rect;
    this.cutTip.list[1].setText(this.tray.vertical ? '👈 點木頭切開' : '👆 點木頭切開');
    this.cutTip.setPosition(tr.centerX, tr.centerY).setScale(Math.min(1, (tr.width - 16) / 200));
    this.tweens.killTweensOf(this.tray);
    if (this.trayShown) this.tray.setPosition(0, 0).setVisible(true);
    else this.tray.setPosition(this.trayOff.x, this.trayOff.y).setVisible(false);
    if (this.endLayer) this.layoutEnd();
  }

  update(time, delta) {
    const W = this.scale.width;
    if (this.clouds) for (const c of this.clouds) { c.x += (c.vx * delta) / 1000; if (c.x > W + 40) c.x = -110; }
  }

  // ---------------------------------------------------------------- tray show / hide
  showTray(lengths) {
    const t = this.tray;
    t.setRods(lengths, { unit: this.board.unit, labels: this.labels });
    t.dropZone = this.board.trackRect;
    t.setEnabled(true);
    if (this.trayShown) return;
    this.trayShown = true;
    this.tweens.killTweensOf(t);
    t.setVisible(true).setPosition(this.trayOff.x, this.trayOff.y);
    this.tweens.add({ targets: t, x: 0, y: 0, duration: dur(300), ease: 'Back.easeOut', easeParams: [1.2] });
    sfx.whoosh();
  }

  hideTray() {
    const t = this.tray;
    t.setEnabled(false);
    if (!this.trayShown) { t.setVisible(false); return; }
    this.trayShown = false;
    this.tweens.killTweensOf(t);
    this.tweens.add({ targets: t, x: this.trayOff.x, y: this.trayOff.y, duration: dur(220), ease: 'Cubic.easeIn', onComplete: () => { if (!this.trayShown) t.setVisible(false); } });
  }

  // ---------------------------------------------------------------- question flow
  startQuestion(i) {
    this.gen++;
    this.idx = i; this.wrongHere = 0; this.hinting = false;
    const q = this.q = this.plan.questions[i];
    this.board.setQuestion(q, { labels: this.labels });
    this.tray.dropZone = this.board.trackRect;
    if (q.type === 'build') {
      this.setBubble('🚂', `合成 ${q.n}：還差多少？`, `Make ${q.n}: what's missing?`);
      this.showTray(q.tray);
    } else {
      this.setBubble('🪚', `分解 ${q.n}：切出 ${q.a}`, `Split ${q.n}: cut off ${q.a}`);
      this.hideTray();
    }
    this.showCutTip(q.type === 'break');
    this.busy = false;
    this.drawDots();
    this.updateHint();
  }

  showCutTip(on) {
    const ct = this.cutTip;
    this.tweens.killTweensOf(ct);
    this.tweens.add({ targets: ct, alpha: on ? 1 : 0, duration: dur(on ? 300 : 120), delay: on ? 250 : 0 });
  }

  canHint() {
    const q = this.q;
    return !!(q && !this.ended && !this.busy && q.type === 'build' && this.board.step === 'build' && makeTenMove(q.a, q.b));
  }

  updateHint() {
    const b = this.hintBtn, show = this.canHint();
    if (show === b.visible) return;
    this.tweens.killTweensOf(b);
    if (show) {
      b.setVisible(true).setAlpha(1).setScale(0);
      this.tweens.add({ targets: b, scale: 1, duration: dur(260), ease: 'Back.easeOut' });
      if (!reducedMotion()) this.tweens.add({ targets: b, angle: { from: -8, to: 8 }, duration: 700, yoyo: true, repeat: -1, delay: 300, ease: 'Sine.easeInOut' });
    } else {
      b.setAngle(0);
      this.tweens.add({ targets: b, scale: 0, duration: dur(140), onComplete: () => b.setVisible(false).setScale(1) });
    }
  }

  settle(rod) { // a chosen rod that is not being judged goes home quietly
    rod._returning = true;
    rod.bounceBack({ quiet: true }).then(() => { if (rod.active) { rod._busy = false; rod._returning = false; } });
  }

  miss() { this.mistakes++; this.wrongHere++; }

  async onChoose(rod) {
    const q = this.q, b = this.board;
    // answering during the make-ten hint is fine: the board cancels the hint when a rod lands
    const ready = q && !this.busy && !this.ended && (q.type === 'build' ? b.step === 'build' : b.step === 'answer');
    if (!ready) { this.settle(rod); return; }
    if (rod.len === q.b) {
      const gen = this.gen;
      this.busy = true;
      this.tray.setEnabled(false);
      this.updateHint();
      await b.placeAnswer(rod);
      if (gen !== this.gen) return;
      this.praise();
      this.markDone(this.idx);
      await b.celebrate();
      if (gen !== this.gen) return;
      this.nextQuestion();
    } else {
      this.miss();
      this.tray.returnRod(rod);
      rod.mood('sad');
      b.rejectAt();
      if (this.wrongHere >= 3) this.nudgeRod(q.b);
    }
  }

  async onCut(k) {
    const q = this.q;
    if (!q || this.busy || this.ended || this.board.step !== 'cut') return;
    if (k === q.a) {
      const gen = this.gen;
      this.busy = true;
      this.showCutTip(false);
      await this.board.cutAt(k);
      if (gen !== this.gen) return;
      this.wrongHere = 0;
      this.setBubble('❓', `${q.n} − ${q.a} = ？`, `What's left?`);
      this.showTray(q.tray);
      this.busy = false;
    } else {
      this.miss();
      this.board.rejectAt(); // log wobble + bonk
      if (this.wrongHere >= 3) this.nudgeCut(q.a);
    }
  }

  nextQuestion() {
    if (this.idx + 1 < QN) this.startQuestion(this.idx + 1);
    else this.finish();
  }

  praise() {
    const [t, c] = PRAISE[Math.floor(Math.random() * PRAISE.length)];
    const r = this.bubbleRect;
    fx.floatText(this, r.bx + r.bw / 2, r.by + r.bh + 18, t, c);
  }

  /** After 3 wrong rods on one question: the right rod shines and hops. */
  nudgeRod(len) {
    const rod = this.tray.rods.find(r => r.len === len && !r._busy);
    if (!rod) return;
    rod.mood('happy', 900);
    rod.glow().then(() => rod.active && rod.glow());
    this.tweens.add({ targets: rod.lift, y: -10, duration: dur(150), yoyo: true, repeat: 1, ease: 'Quad.easeOut' });
  }

  /** After 3 wrong cuts: a bouncing arrow over the right cut point. */
  nudgeCut(a) {
    const tr = this.board.trackRect, u = this.board.unit;
    const x = tr.x + 16 + a * u, y = tr.y + 4;
    const t = this.add.text(x, y, '⬇', { fontSize: '30px', padding: { x: 2, y: 4 } }).setOrigin(0.5, 1).setDepth(70);
    this.tweens.add({ targets: t, y: y - 10, duration: 260, yoyo: true, repeat: 3, ease: 'Sine.easeInOut', onComplete: () => t.destroy() });
  }

  async hint() {
    if (this.busy || this.hinting || this.leaving || !this.canHint()) return;
    const gen = this.gen, b = this.hintBtn;
    this.hinting = true; // the tray stays live: a child who gets it mid-hint can answer at once
    b.setAlpha(0.5);
    await this.board.playMakeTen();
    if (gen !== this.gen) return;
    this.hinting = false;
    b.setAlpha(1);
  }

  async finish() {
    this.ended = true;
    this.hideTray();
    this.showCutTip(false);
    this.updateHint();
    this.drawDots();
    const stars = starsFor(this.mistakes);
    let result = { newBest: false, sticker: null };
    try {
      if (this.bridge.complete) {
        const r = await this.bridge.complete(levelKey(this.w, this.level), stars);
        if (r) result = { newBest: !!r.newBest, sticker: r.sticker == null ? null : r.sticker };
      }
    } catch (e) { console.warn('[Level] could not save the result', e); }
    if (this.dead) return;
    this.result = { stars, ...result };
    this.time.delayedCall(200, () => this.showEnd());
  }

  // ---------------------------------------------------------------- navigation
  leave(key, data) {
    if (this.leaving) return;
    this.leaving = true;
    this.tray.setEnabled(false);
    this.time.delayedCall(90, () => fx.iris(this, key, data));
  }

  nextTarget() {
    const br = this.bridge;
    const P = br.progress || { levels: {}, stickers: [], streak: { count: 0, lastDay: null } };
    const unlock = (br.settings && br.settings.bondsUnlock) || {};
    const lv = this.level < LEVEL_COUNT ? this.level + 1 : 'boss';
    if (!isLevelOpen(P, this.w, lv, unlock, !!br.testMode)) return null;
    return lv === 'boss' ? { key: 'House', data: { w: this.w }, zh: '🏠 數字屋', en: 'Number house' }
      : { key: 'Level', data: { w: this.w, level: lv }, zh: '▶ 下一關', en: 'Next' };
  }

  // ---------------------------------------------------------------- end panel
  pill(zh, en, fill, ink, stroke, onTap) {
    return pillButton(this, zh, en, { fill, ink, stroke }, () => { if (!this.leaving) onTap(); });
  }

  showEnd() {
    if (this.dead || this.endLayer) return;
    const { stars, newBest } = this.result, th = this.th;
    const PW = 400, PH = 410;
    const layer = this.endLayer = this.add.container(0, 0).setDepth(500);
    const dim = this.endDim = this.add.rectangle(0, 0, 10, 10, 0x0f172a, 0.45).setOrigin(0).setInteractive();
    dim.setAlpha(0);
    this.tweens.add({ targets: dim, alpha: 1, duration: 200 });
    const p = this.endPanel = this.add.container(0, 0);
    layer.add([dim, p]);

    const g = this.add.graphics();
    drawPanel(g, PW, PH, th.accent);
    p.add(g);
    p.setSize(PW, PH).setInteractive();

    p.add(this.add.text(0, -PH / 2 + 46, '完成！', T(40, '#1f2937')).setOrigin(0.5));
    p.add(this.add.text(0, -PH / 2 + 82, `Level complete · W${this.w}-${this.level}`, T(15, '#64748b')).setOrigin(0.5));

    // star slots: middle one larger and higher
    this.slots = [{ x: -104, y: -8, r: 38 }, { x: 0, y: -24, r: 48 }, { x: 104, y: -8, r: 38 }];
    const sg = this.add.graphics();
    for (const s of this.slots) drawStarSlot(sg, s.r, s.x, s.y);
    p.add(sg);

    const [mz, me] = END_MSG[stars];
    this.endMsg = [this.add.text(0, 62, mz, T(24, '#1f2937')).setOrigin(0.5), this.add.text(0, 90, me, T(14, '#64748b')).setOrigin(0.5)];
    this.endMsg.forEach(o => o.setAlpha(0));
    p.add(this.endMsg);

    // buttons
    const nx = this.nextTarget();
    const btns = [
      this.pill('🗺 地圖', 'Map', 0xffffff, '#1f2937', th.accent, () => {
        sfx.whoosh();
        this.leave('Map', { focusW: this.w, justDone: { key: levelKey(this.w, this.level), stars, ...this.resultData() } });
      }),
      this.pill('🔁 再玩', 'Replay', 0xffffff, '#1f2937', th.accent, () => { sfx.whoosh(); this.leave('Level', { w: this.w, level: this.level }); }),
    ];
    if (nx) btns.push(this.pill(nx.zh, nx.en, 0xf97316, '#ffffff', 0xffffff, () => { sfx.whoosh(); this.leave(nx.key, nx.data); }));
    const gap = 12, total = btns.reduce((s, b) => s + b.pw, 0) + gap * (btns.length - 1);
    let x = -total / 2;
    btns.forEach(b => { b.setPosition(x + b.pw / 2, PH / 2 - 56); x += b.pw + gap; p.add(b); });
    if (nx) this.tweens.add({ targets: btns[btns.length - 1], scale: 1.06, duration: 700, yoyo: true, repeat: -1, delay: 1400, ease: 'Sine.easeInOut' });

    this.PW = PW; this.PH = PH;
    this.layoutEnd();
    const k = p.scale;
    p.setScale(k * 0.6).setAlpha(0);
    this.tweens.add({ targets: p, scale: k, alpha: 1, duration: dur(360), ease: 'Back.easeOut' });
    sfx.fanfare();

    const t0 = 480, step = 300;
    for (let i = 0; i < stars; i++) this.time.delayedCall(t0 + i * step, () => this.dropStar(i));
    const tEnd = t0 + (stars - 1) * step + 320;
    this.time.delayedCall(tEnd, () => {
      this.endMsg.forEach((o, i) => this.tweens.add({ targets: o, alpha: 1, y: { from: o.y + 10, to: o.y }, duration: dur(240), delay: i * 60 }));
      fx.confetti(this);
      if (newBest) this.newBestBadge();
      if (stars === 3 && newBest) this.shine();
    });
  }

  resultData() { const r = this.result || {}; return { newBest: !!r.newBest, sticker: r.sticker == null ? null : r.sticker }; }

  layoutEnd() {
    const W = this.scale.width, H = this.scale.height;
    this.endDim.setSize(W, H);
    if (this.endDim.input) this.endDim.input.hitArea.setTo(0, 0, W, H);
    const k = Math.min(1, (W - 24) / this.PW, (H - 24) / this.PH);
    this.tweens.killTweensOf(this.endPanel);
    this.endPanel.setPosition(W / 2, H / 2).setScale(k).setAlpha(1);
  }

  dropStar(i) {
    if (this.dead || !this.endPanel) return;
    dropStar(this, this.endPanel, this.slots[i], i);
  }

  newBestBadge() { newBestBadge(this, this.endPanel, this.PW, this.PH); }

  /** First-time 3★: a gold-white shine sweeps across the three stars. */
  shine() { if (!this.dead) shineStars(this, this.endPanel, this.slots, 501); }

}
