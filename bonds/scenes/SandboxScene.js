// Dev sandbox for the Rod / Tray / Board objects: bonds.html?dev&sandbox
// Test hooks: scene.ask(type, n, a) sets a specific question; scene.board, scene.tray, scene.q, scene.mistakes.
import { genBuild, genBreak, trayFor, makeTenMove } from '../../bonds-logic.js?v=202609250809';
import { FONT, WORLD_THEME } from '../theme.js?v=202609250809';
import { fx } from '../fx.js?v=202609250809';
import { sfx } from '../sfx.js?v=202609250809';
import { Board } from '../ui/Board.js?v=202609250809';
import { Tray } from '../ui/Tray.js?v=202609250809';
import { DPR } from '../ui/Rod.js?v=202609250809';

const RIGHT_DOM = 190; // DOM test badge + mute + admin buttons, top-right

export class SandboxScene extends Phaser.Scene {
  constructor() { super('Sandbox'); }

  create() {
    this.mode = 'build';
    this.labels = true;
    this.world = 3;
    this.mistakes = 0;
    this.busy = false;
    this.q = null;
    this.bg = this.add.graphics().setDepth(-10);
    this.board = new Board(this);
    this.tray = new Tray(this);
    this.tray.on('choose', rod => this.onChoose(rod));
    this.board.on('cut', k => this.onCut(k));
    this.buttons = [
      this.button('合成 Build', () => { this.mode = 'build'; this.next(); }),
      this.button('分解 Break', () => { this.mode = 'break'; this.next(); }),
      this.button('💡 10', () => this.hint()),
      this.button('123', () => this.toggleLabels()),
    ];
    this.scale.on('resize', this.relayout, this);
    this.events.once('shutdown', () => this.scale.off('resize', this.relayout, this));
    this.relayout();
    this.next();
  }

  button(label, onTap) {
    const c = this.add.container(0, 0).setDepth(20);
    const t = this.add.text(0, 0, label, { fontFamily: FONT, fontStyle: 'bold', fontSize: '16px', color: '#1f2937', resolution: DPR }).setOrigin(0.5);
    const w = Math.max(48, t.width + 20), h = 44;
    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.12).fillRoundedRect(-w / 2 + 1, -h / 2 + 4, w, h, 14);
    g.fillStyle(0xffffff, 1).fillRoundedRect(-w / 2, -h / 2, w, h, 14);
    g.lineStyle(3, 0xfbbf24, 1).strokeRoundedRect(-w / 2, -h / 2, w, h, 14);
    c.add([g, t]);
    c.btnW = w;
    c.setSize(w, h).setInteractive({ useHandCursor: true });
    c.on('pointerdown', () => { sfx.tick(4); this.tweens.add({ targets: c, scale: 0.9, duration: 60, yoyo: true }); onTap(); });
    return c;
  }

  relayout() {
    const W = this.scale.width, H = this.scale.height;
    const th = WORLD_THEME[this.world] || WORLD_THEME[1];
    this.bg.clear();
    this.bg.fillGradientStyle(th.sky, th.sky, 0xffffff, 0xffffff, 1).fillRect(0, 0, W, H);
    this.bg.fillStyle(th.ground, 0.5).fillEllipse(W * 0.25, H + 20, W * 0.9, H * 0.35).fillEllipse(W * 0.8, H + 30, W * 0.8, H * 0.3);
    // buttons: top-left, wrapping under the DOM badge/mute/admin cluster on narrow screens
    let x = 10, y = 30, avail = W - RIGHT_DOM;
    for (const b of this.buttons) {
      if (x + b.btnW > avail + 10 && x > 10) { x = 10; y += 50; avail = W - 20; }
      b.setPosition(x + b.btnW / 2, y);
      x += b.btnW + 6;
    }
    const TOP = this.top = y + 28;
    const m = 10;
    if (W < H) {
      const trayH = Math.round(Math.max(130, Math.min(240, H * 0.22)));
      this.board.layout(m, TOP, W - 2 * m, H - TOP - trayH - 2 * m);
      this.tray.layout(m, H - trayH - m, W - 2 * m, trayH, false);
    } else {
      const bw = Math.round(W * 0.64);
      this.board.layout(m, TOP, bw - m, H - TOP - m);
      this.tray.layout(bw + m, TOP, W - bw - 2 * m, H - TOP - m, true);
    }
    this.tray.setUnit(this.board.unit);
    this.tray.dropZone = this.board.trackRect;
  }

  /** Test hook: ask a specific question. */
  ask(type, n, a) {
    const b = n - a;
    this.next({ type, n, a, b, tray: trayFor(b, Math.random) });
    return this.q;
  }

  next(q) {
    this.q = q || (this.mode === 'build' ? genBuild(this.world, Math.random, this.q) : genBreak(this.world, Math.random, this.q));
    this.mode = this.q.type;
    this.busy = false;
    this.board.setQuestion(this.q, { labels: this.labels });
    if (this.q.type === 'build') {
      this.tray.setRods(this.q.tray, { unit: this.board.unit, labels: this.labels });
      this.tray.setEnabled(true);
    } else {
      this.tray.setRods([], { unit: this.board.unit, labels: this.labels });
      this.tray.setEnabled(false);
    }
    this.tray.dropZone = this.board.trackRect;
  }

  async onChoose(rod) {
    const q = this.q;
    const ready = !this.busy && (q.type === 'build' ? this.board.step === 'build' : this.board.step === 'answer');
    if (!ready) { this.tray.returnRod(rod); return; }
    if (rod.len === q.b) {
      this.busy = true;
      this.tray.setEnabled(false);
      await this.board.placeAnswer(rod);
      await this.board.celebrate();
      this.next();
    } else {
      this.mistakes++;
      this.tray.returnRod(rod);
      this.board.rejectAt();
    }
  }

  async onCut(k) {
    if (this.busy || this.board.step !== 'cut') return;
    if (k === this.q.a) {
      this.busy = true;
      await this.board.cutAt(k);
      this.tray.setRods(this.q.tray, { unit: this.board.unit, labels: this.labels });
      this.tray.setEnabled(true);
      this.busy = false;
    } else {
      this.mistakes++;
      this.board.rejectAt();
    }
  }

  hint() {
    const q = this.q;
    if (q && makeTenMove(q.a, q.b)) this.board.playMakeTen();
    else fx.floatText(this, this.scale.width / 2, this.top + 40, '≥ 11 only', '#6b7280');
  }

  toggleLabels() {
    this.labels = !this.labels;
    this.board.setLabels(this.labels);
    this.tray.setLabels(this.labels);
  }
}
