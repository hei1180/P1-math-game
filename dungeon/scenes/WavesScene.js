// WavesScene ('Waves', data { key }): the wave rooms 怪物來了！ (F1R6, 左右) and 蝙蝠和地鼠 (F3R6, 上下).
// genRoom gives 3 wave clues (4, 6, 8 monsters). No time pressure: monsters walk in slowly and wait at the hero.
// Wrong side = a mistake (shield bonk, 「哎呀！」, combo reset, the monster stays). 1 coin per bop.
// Stars, bridge.complete and the end panel as in RoomScene. Test hook: scene.__test = { tap(side), current() }.
import { genRoom, roomByKey, nextRoom, starsFor, coinsPerAnswer, confusionOf, FLOOR_LOOK, SHOP, equip } from '../../dungeon-logic.js?v=0';
import { artFrame } from '../art.js?v=0';
import { PixelStage } from '../stage.js?v=0';
import { UI } from '../ui.js?v=0';
import { WaveField, MODE_PROMPT } from '../waves.js?v=0';
import { sfx } from '../sfx.js?v=0';
import { voice } from '../voice.js?v=0';
import { fx } from '../fx.js?v=0';

const WAVE_ZH = ['一', '二', '三', '四', '五'];
const reduced = () => fx.lessMotion || (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

export class WavesScene extends Phaser.Scene {
  constructor() { super('Waves'); this.runId = 0; }

  create(data = {}) {
    const bridge = this.bridge = this.registry.get('bridge');
    this.key = data.key || 'F1R6';
    this.info = roomByKey(this.key);
    if (!this.info) { this.scene.start('Map'); return; }
    if (!this.info.wave) { this.scene.start('Room', { key: this.key }); return; }
    fx.irisIn(this);
    this.level = bridge.levelFor(this.key);
    this.room = genRoom(this.key, bridge.rng, this.level);
    this.mistakes = 0; this.hints = 0; this.confusions = []; this.coinsEarned = 0; this.combo = 0; this.t0 = Date.now();

    this.ui = new UI(this);
    this.stage = new PixelStage(this, { top: () => this.ui.topH, bottom: 30 });
    this.stage.level = this.level;
    this.ui.stage = this.stage;
    const p = bridge.progress || {};
    this.field = new WaveField(this, {
      stage: this.stage, ui: this.ui, floor: this.info.floor, look: { hero: p.hero || null, equipped: p.equipped || {} },
      hooks: { onBop: (m, pt) => this.onBop(m, pt), onWrong: (m, side) => this.onWrong(m, side), onHint: () => { this.hints++; } },
    });
    if (this.level >= 2 && this.room.clues.some(c => c.mode !== 'ud')) this.stage.tags(true, this.level >= 3 ? 'big' : 'small');

    this.ui.back(() => { voice.stop(); fx.iris(this, 'Map', {}); });
    this.ui.coins(bridge.coins, false);
    this.states = this.room.clues.map(() => null);
    this.ui.dots(this.states);
    this.__test = { tap: s => this.field.tap(s), current: () => this.field.current(), clue: () => this.field.clue };

    const id = ++this.runId;
    this.events.once('shutdown', () => { if (this.runId === id) this.runId++; voice.stop(); });
    this.run(id).catch(e => console.error('[waves]', e));
  }

  wait(ms) { return new Promise(res => this.time.delayedCall(ms, res)); }

  async run(id) {
    const clues = this.room.clues;
    for (let i = 0; i < clues.length; i++) {
      if (id !== this.runId) return;
      const clue = clues[i];
      this.states[i] = 'now'; this.ui.dots(this.states);
      const pr = MODE_PROMPT[clue.mode] || clue.ask;
      this.ui.prompt(pr.zh, pr.en, { speak: i === 0 });
      this.field.setMode(clue.mode);
      await this.ui.toast(`第${WAVE_ZH[i] || i + 1}波！`, `Wave ${i + 1}`, i === 0 ? 1600 : 1100);
      if (id !== this.runId) return;
      await this.field.runWave(clue, { announce: i === 0, glow: i === 0 || this.level >= 2 });
      if (id !== this.runId) return;
      this.states[i] = 'good'; this.ui.dots(this.states);
      if (i < clues.length - 1) { sfx.star(i); await this.wait(500); }
    }
    if (id !== this.runId) return;
    this.field.setMode(null);
    await this.finish(id);
  }

  onBop(m, pt) {
    this.combo++;
    if (this.combo >= 3) fx.floatText(this, pt.x, pt.y - 24, `${this.combo} 連擊！`, '#a855f7');
    const n = coinsPerAnswer(this.key);
    if (n > 0) {
      this.coinsEarned += n;
      this.bridge.addCoins(n);
      this.flyCoin(pt.x, pt.y, () => this.ui.coins(this.bridge.coins));
    }
  }

  onWrong(m, side) {
    this.mistakes++;
    this.combo = 0;
    if (this.confusions.length < 5) {
      try {
        const c = confusionOf(this.field.clue, { i: m.i, side });
        if (c && c.want != null && c.picked != null) this.confusions.push({ item: String(c.want), picked: String(c.picked) });
      } catch (e) { /* no confusion */ }
    }
  }

  /** A coin flies from (x, y) to the coin counter (CSS px). */
  flyCoin(x, y, onArrive) {
    const t = this.ui.coinTarget(), f = artFrame('coin');
    const c = this.add.image(x, y, f.texture, f.frame).setScale(Math.max(2, this.stage.PX)).setDepth(600);
    this.tweens.add({
      targets: c, x: t.x, y: t.y, duration: reduced() ? 150 : 520, ease: 'Cubic.easeIn',
      onComplete: () => { c.destroy(); sfx.coin(); if (onArrive) onArrive(); },
    });
  }

  async finish(id) {
    const bridge = this.bridge, key = this.key;
    const stars = starsFor(this.mistakes);
    await this.wait(500);
    if (id !== this.runId) return;
    const hadLooks = ((bridge.progress && bridge.progress.looks) || []).slice();
    const res = await bridge.complete(key, stars, {
      mistakes: this.mistakes, hints: this.hints, durationSec: Math.round((Date.now() - this.t0) / 1000),
      confusions: this.confusions, coins: this.coinsEarned, level: this.level,
    });
    if (id !== this.runId) return;
    this.ui.coins(bridge.coins);
    if (res.floorCleared) {
      sfx.fanfare(); fx.confetti(this);
      await this.ui.toast(`第${res.floorCleared}層完成！ +${res.bonus}`, `Floor ${res.floorCleared} cleared! +${res.bonus} coins`, 2200);
      if (id !== this.runId) return;
      this.ui.coins(bridge.coins);
      const lookId = FLOOR_LOOK[res.floorCleared], item = lookId && SHOP.find(s => s.id === lookId);
      if (item && !hadLooks.includes(lookId)) {
        const pick = await this.ui.card({ icon: '🎁', zh: `新裝備：${item.zh}`, en: `New look: ${item.en}`,
          buttons: [{ id: 'wear', zh: '穿上', en: 'Wear it' }, { id: 'go', zh: '繼續', en: 'Continue' }] });
        if (id !== this.runId) return;
        if (pick === 'wear') {
          await bridge.saveLook(p => equip(p, item.slot, item.id));
          const h = this.field.hero;
          if (h && h.setLook) try { h.setLook({ hero: bridge.progress.hero, equipped: bridge.progress.equipped }); } catch (e) { /* ignore */ }
        }
      }
    }
    if (bridge.sitting.rooms >= 3 && !bridge.sitting.wellDoneShown) {
      bridge.sitting.wellDoneShown = true;
      await this.ui.card({ icon: '🌟', zh: '今日做得好！', en: 'Great work today!', buttons: [{ id: 'go', zh: '繼續', en: 'Continue' }] });
      if (id !== this.runId) return;
    }
    if (stars === 3) sfx.fanfare();
    const next = nextRoom(key);
    const choice = await this.ui.endPanel({ title: { zh: this.info.zh, en: this.info.en }, stars, newBest: res.newBest, coins: this.coinsEarned, next: !!next });
    if (id !== this.runId) return;
    if (choice === 'retry') fx.iris(this, 'Waves', { key });
    else if (choice === 'next' && next) fx.iris(this, 'Map', { justDone: key, goTo: next });
    else fx.iris(this, 'Map', { justDone: key });
  }
}
