// RushScene ('Rush'): 寶藏快手 Treasure Rush (spec §5b). Timed (bridge.rushStart, teacher time limit), shared
// combo / fever / score in the DOM HUD. Clues from genRush: monster waves lr → ud → mix that get faster, with a
// 之間 'pick' clue (tap the slime between two things) after every wave. Monsters keep coming; a wrong side or a
// monster reaching the hero resets the combo (rushHit(false)), never ends the run. Time up → bridge.rushEnd().
// Test hook: scene.__test = { tap(side), current(), clue(), pick(id), state() }.
import { genRush, checkAnswer } from '../../dungeon-logic.js?v=0';
import { artFrame } from '../art.js?v=0';
import { PixelStage, FLOOR_Y } from '../stage.js?v=0';
import { UI } from '../ui.js?v=0';
import { WaveField, MODE_PROMPT, FLOOR } from '../waves.js?v=0';
import { textStyle } from '../theme.js?v=0';
import { sfx } from '../sfx.js?v=0';
import { voice } from '../voice.js?v=0';
import { fx } from '../fx.js?v=0';

const BOP_PTS = 10, PICK_PTS = 20;
const MODE_TOAST = { lr: ['左面和右面', 'Left and right'], ud: ['上面和下面', 'Up and down'], mix: ['左右上下', 'All four'] };
/** Time (ms) a monster needs to reach the hero: shorter every wave. */
const rushDur = w => Math.max(1400, Math.round(3600 * Math.pow(0.88, w)));
const reduced = () => fx.lessMotion || (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

export class RushScene extends Phaser.Scene {
  constructor() { super('Rush'); this.runId = 0; }

  init() {
    this.sys.settings.data = {}; // Phaser would hand this data to a later start that passes none
  }

  create() {
    const bridge = this.bridge = this.registry.get('bridge');
    this.state = 'countdown'; // countdown | play | over | left
    this.pickRes = null; this.pickClue = null; this.zones = [];
    fx.irisIn(this);
    this.ui = new UI(this);
    this.stage = new PixelStage(this, { top: () => this.ui.topH, bottom: 12 });
    this.stage.level = 1;
    this.ui.stage = this.stage;
    const p = bridge.progress || {};
    this.field = new WaveField(this, {
      stage: this.stage, ui: this.ui, floor: 4, look: { hero: p.hero || null, equipped: p.equipped || {} },
      hooks: {
        onBop: (m, pt) => this.points(bridge.rushHit(true, BOP_PTS), pt),
        onWrong: () => bridge.rushHit(false, BOP_PTS),
        onReach: () => bridge.rushHit(false, BOP_PTS),
      },
    });
    this.ui.back(() => this.leave());
    this.ui.prompt('寶藏快手', 'Treasure Rush', { speak: false });
    this.cd = this.add.text(0, 0, '', textStyle(110, '#f97316', { stroke: '#ffffff', strokeThickness: 10 })).setOrigin(0.5).setDepth(900).setAlpha(0);
    this.__test = {
      tap: s => this.field.tap(s), current: () => this.field.current(), clue: () => this.pickClue || this.field.clue,
      pick: id => this.onPick(id), state: () => ({ state: this.state, ...bridge.rushState() }),
    };
    const id = ++this.runId;
    this.events.once('shutdown', () => this.cleanup(id));
    this.countdown(id);
  }

  wait(ms) { return new Promise(res => this.time.delayedCall(ms, res)); }

  async countdown(id) {
    const steps = [['3', '#ef4444'], ['2', '#f97316'], ['1', '#22c55e'], ['開始！', '#2563eb']];
    await this.wait(400);
    for (let i = 0; i < steps.length; i++) {
      if (id !== this.runId || this.state !== 'countdown') return;
      const [s, col] = steps[i], go = i === steps.length - 1;
      this.cd.setText(s).setColor(col).setFontSize(go ? 80 : 110).setPosition(this.scale.width / 2, this.scale.height / 2).setAlpha(1).setScale(reduced() ? 1 : 0.3);
      this.tweens.killTweensOf(this.cd);
      if (!reduced()) this.tweens.add({ targets: this.cd, scale: 1, duration: 240, ease: 'Back.easeOut' });
      this.tweens.add({ targets: this.cd, alpha: 0, delay: 520, duration: reduced() ? 150 : 240 });
      if (go) sfx.fanfare(); else sfx.tick(i * 4);
      await this.wait(go ? 400 : 800);
    }
    if (id !== this.runId || this.state !== 'countdown') return;
    this.state = 'play';
    this.bridge.rushStart(() => this.finish(id));
    this.loop(id).catch(e => console.error('[rush]', e));
  }

  async loop(id) {
    const gen = genRush(this.bridge.rng);
    while (id === this.runId && this.state === 'play') {
      const clue = gen.next();
      if (clue.kind === 'wave') await this.runWave(id, clue);
      else await this.runPick(id, clue);
      if (id !== this.runId || this.state !== 'play') return;
      await this.wait(250);
    }
  }

  async runWave(id, clue) {
    const pr = MODE_PROMPT[clue.mode];
    const first = (clue.wave || 0) === 0;
    this.ui.prompt(pr.zh, pr.en, { speak: first });
    this.field.setMode(clue.mode);
    const t = MODE_TOAST[clue.mode];
    await this.ui.toast(t[0], t[1], first ? 1200 : 700);
    if (id !== this.runId || this.state !== 'play') return;
    await this.field.runWave(clue, { timed: true, dur: rushDur(clue.wave || 0), gap: 150, announce: first, glow: first });
  }

  /** Floating points + a coin popping up where the monster was (CSS px). */
  points(pts, pt) {
    const f = artFrame('coin');
    const c = this.add.image(pt.x, pt.y, f.texture, f.frame).setScale(Math.max(2, this.stage.PX)).setDepth(600);
    this.tweens.add({ targets: c, y: pt.y - 40, alpha: 0, duration: reduced() ? 150 : 600, onComplete: () => c.destroy() });
    fx.floatText(this, pt.x, pt.y - 20, `+${pts}`, '#eab308');
  }

  // ---------------------------------------------------------------- 之間 pick clue (tap one slime)
  async runPick(id, clue) {
    const st = this.stage;
    this.field.show(false);
    this.pickClue = clue;
    st.objs.y = FLOOR - FLOOR_Y; // the stage draws scenes on the room floor; the corridor's floor is higher
    const { sprites } = st.drawScene(clue.scene, { level: 1 });
    const hs = Math.max(16, Math.ceil(52 / st.PX));
    this.zones = clue.candidates.map(cid => {
      const sp = sprites[cid];
      const z = this.add.zone(sp.x, sp.y - 6, hs, hs).setInteractive({ useHandCursor: true });
      z.on('pointerdown', () => this.onPick(cid));
      st.objs.add(z);
      return z;
    });
    this.ui.prompt(clue.ask.zh, clue.ask.en);
    let wrong = 0;
    for (;;) {
      const picked = await new Promise(res => { this.pickRes = res; });
      if (picked == null || id !== this.runId || this.state !== 'play') break;
      const sp = sprites[picked];
      if (checkAnswer(clue, picked)) {
        const p = st.toScreen(sp.x, sp.y - 6);
        sfx.ding(); fx.sparkle(this, p.x, p.y);
        this.points(this.bridge.rushHit(true, PICK_PTS), p);
        this.tweens.add({ targets: sp, scale: 1.6, alpha: 0, duration: reduced() ? 150 : 220 });
        await this.wait(500);
        break;
      }
      wrong++;
      this.bridge.rushHit(false, PICK_PTS);
      sfx.bonk();
      const p = st.toScreen(sp.x, sp.y - 14);
      fx.floatText(this, p.x, p.y, '哎呀！', '#f97316');
      if (!reduced()) this.tweens.add({ targets: sp, angle: { from: -16, to: 0 }, duration: 400, ease: 'Elastic.easeOut' });
      if (wrong >= 2) st.glow(sprites[clue.answers[0]], true);
    }
    this.pickRes = null; this.pickClue = null; this.zones = [];
    if (id !== this.runId) return;
    st.clearScene();
    st.objs.y = 0;
    if (this.state === 'play') this.field.show(true);
  }

  onPick(cid) { if (this.pickRes && this.state === 'play') this.pickRes(cid); }

  // ---------------------------------------------------------------- end / leave
  async finish(id) {
    if (id !== this.runId || this.state !== 'play') return;
    this.state = 'over';
    this.field.stop();
    this.field.setMode(null);
    if (this.pickRes) this.pickRes(null);
    this.zones.forEach(z => z.disableInteractive());
    voice.stop();
    const W = this.scale.width, H = this.scale.height;
    const t = this.add.text(W / 2, H / 2, '時間到！', textStyle(64, '#ef4444', { stroke: '#ffffff', strokeThickness: 10 })).setOrigin(0.5).setDepth(960);
    this.add.text(W / 2, H / 2 + 56, "Time's up!", textStyle(24, '#ffffff', { stroke: '#1f2937', strokeThickness: 6 })).setOrigin(0.5).setDepth(960);
    if (!reduced()) this.tweens.add({ targets: t, scale: { from: 0.3, to: 1 }, duration: 320, ease: 'Back.easeOut' });
    sfx.fanfare(); fx.confetti(this);
    await this.wait(1100);
    if (id !== this.runId || this.state !== 'over') return;
    await this.bridge.rushEnd(); // rank popup, then the leaderboard; closing it goes back to the map
  }

  leave() {
    if (this.state === 'over' || this.state === 'left') return;
    const wasPlaying = this.state === 'play';
    this.state = 'left';
    this.field.stop();
    if (this.pickRes) this.pickRes(null);
    if (wasPlaying) this.bridge.rushAbort(); // nothing saved
    voice.stop();
    sfx.whoosh();
    fx.iris(this, 'Map', {});
  }

  cleanup(id) {
    if (this.state === 'play') this.bridge.rushAbort(); // stopped from outside mid-run (dev go(), restart)
    this.state = 'left';
    if (this.pickRes) this.pickRes(null);
    if (this.runId === id) this.runId++;
    voice.stop();
  }
}
