// RoomScene ('Room', data { key }): one non-wave room. Generates the room's clues (dungeon-logic genRoom),
// draws backdrop + hero, and runs each clue through its task (dungeon/tasks). Owns the shared bookkeeping:
// hint ladder (wrong), rewards (right), stars, end chest, bridge.complete and the end panel.
//
// For tasks:  room.stage (PixelStage)  room.ui (UI)  room.hero (Container from makeHero, in stage.front, art px)
//             room.bridge  room.key  room.level  room.room ({key, level, clues})  room.clue  room.clueIndex  room.wrongTries
//             await room.wrong(picked) -> step 1|2|3   (1 the clue is replayed here; 2 the task glows; 3 the task shows the answer, then resolves)
//             await room.right()                   (ding, sparkle, 做得好！, per-answer coin, dot turns good)
//             room.heroScreen() -> {x, y}          hero's head in CSS px
//             room.fufu / room.flapFufu()          蝠蝠 Fu-fu, the guide bat hanging in the room's top-left corner;
//                                                  flaps when a clue is read (ui.prompt / 🔈), on hints and on 做得好！
// Start data: { key } (consumed in init, so a later start without data never replays an old room).
import { genRoom, roomByKey, nextRoom, hintStep, mistakesFor, starsFor, coinsPerAnswer, chestCoins, confusionOf,
         KINDS, CHEST_LOOKS, FLOOR_LOOK, SHOP, equip } from '../dungeon-logic.js?v=202610112341';
import { makeHero, makeBackdrop, artFrame, makeCreature } from './art.js?v=202610112341';
import { PixelStage, FLOOR_Y } from './stage.js?v=202610112341';
import { UI } from './ui.js?v=202610112341';
import { TASKS } from './tasks/index.js?v=202610112341';
import { sfx } from './sfx.js?v=202610112341';
import { voice } from './voice.js?v=202610112341';
import { fx } from './fx.js?v=202610112341';
import { textStyle } from './theme.js?v=202610112341';

const LR = new Set(['left', 'right', 'side']);
const reduced = () => fx.lessMotion || (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
/** Silhouette (color) or normal (null) for a sprite or a container tree. */
function tintAll(o, color) {
  if (!o) return;
  if (o.list) o.list.forEach(c => tintAll(c, color));
  else if (o.setTintFill) { if (color === null) o.clearTint(); else o.setTintFill(color); }
  else if (o.setFillStyle && o.fillColor !== undefined) { // shapes have no tint
    if (color === null) { if (o.__fill !== undefined) o.setFillStyle(o.__fill); }
    else { if (o.__fill === undefined) o.__fill = o.fillColor; o.setFillStyle(color); }
  }
}

export class RoomScene extends Phaser.Scene {
  constructor() { super('Room'); this.runId = 0; }

  init(data) {
    this.startData = data || {};
    this.sys.settings.data = {}; // Phaser would hand this data to a later start that passes none
  }

  create() {
    const bridge = this.bridge = this.registry.get('bridge');
    this.key = this.startData.key;
    this.info = roomByKey(this.key);
    this.task = null;
    if (!this.info) { this.scene.start('Map'); return; }
    if (this.info.wave) { this.scene.start('Waves', { key: this.key }); return; }
    fx.irisIn(this);
    this.level = bridge.levelFor(this.key);
    this.room = genRoom(this.key, bridge.rng, this.level);
    this.mistakes = 0; this.hints = 0; this.confusions = []; this.coinsEarned = 0; this.t0 = Date.now();
    this.clue = null; this.clueIndex = -1; this.wrongTries = 0; this.clueMistakes = 0;

    this.ui = new UI(this);
    this.stage = new PixelStage(this, { top: () => this.ui.topH, bottom: 30 });
    this.stage.level = this.level;
    this.ui.stage = this.stage;
    try { const bd = makeBackdrop(this, this.info.floor); if (bd) this.stage.back.add(bd); } catch (e) { console.warn('[room] backdrop', e); }
    this.hero = this.makeHeroSprite();
    this.hero.setPosition(12, FLOOR_Y);
    this.stage.front.add(this.hero);
    this.stage.hero = this.hero;
    if (this.info.boss) this.stage.extraFocus = [150, 190]; // the dragon (tasks/pick.js) sits at ax 170
    this.makeFufu();

    this.ui.back(() => { voice.stop(); fx.iris(this, 'Map', {}); });
    this.ui.coins(bridge.coins, false);
    this.states = this.room.clues.map(() => null);
    this.ui.dots(this.states);
    const lr = this.room.clues.some(c => LR.has(c.rel) && c.scene && c.scene.layout !== 'queue');
    if (lr && this.level >= 2) this.stage.tags(true, this.level >= 3 ? 'big' : 'small');

    const id = ++this.runId;
    this.events.once('shutdown', () => { if (this.runId === id) this.runId++; voice.stop(); });
    this.run(id).catch(e => console.error('[room]', e));
  }

  makeHeroSprite(equipped) {
    const p = this.bridge.progress || {};
    try { return makeHero(this, { hero: p.hero || null, equipped: equipped || p.equipped || {} }, { view: 'front' }); }
    catch (e) {
      console.warn('[room] hero', e);
      const c = this.add.container(0, 0);
      c.add(this.add.rectangle(0, 0, 10, 16, 0x3b82f6).setOrigin(0.5, 1));
      return c;
    }
  }

  wait(ms) { return new Promise(res => this.time.delayedCall(ms, res)); }

  /** 蝠蝠 Fu-fu (spec §1): hangs upside down from the ceiling at the visible top-left; flaps when it talks. */
  makeFufu() {
    let bat;
    try { bat = makeCreature(this, 'bat', 'right'); } catch (e) { return; }
    bat.setOrigin(0.5, 0).setFlipY(true);
    this.stage.front.add(bat);
    this.fufu = bat;
    const place = () => {
      if (!bat.active) return;
      const vis = Math.max(0, this.stage.fromScreen(0, 0).ax);
      bat.setPosition(Math.round(vis + 12), 3);
      // a clue that has its own bat (F3 columns) hides Fu-fu, so there is never a second bat to mix up
      const cur = this.stage.current;
      bat.setVisible(!(cur && (cur.scene.objects || []).some(o => o.kind === 'bat')));
    };
    place();
    this.events.on('stage:resize', place);
    this.events.once('shutdown', () => this.events.off('stage:resize', place));
    // flap whenever a clue is read (prompt) or replayed (🔈)
    const ui = this.ui, prompt = ui.prompt.bind(ui), say = ui.say.bind(ui);
    ui.prompt = (zh, en, opts = {}) => { if (opts.speak !== false) this.flapFufu(); return prompt(zh, en, opts); };
    ui.say = zh => { this.flapFufu(); return say(zh); };
  }

  flapFufu(times = 3) {
    const bat = this.fufu;
    if (!bat || !bat.active) return;
    this.tweens.killTweensOf(bat);
    bat.setScale(1).setAngle(0);
    if (reduced()) { bat.setTint(0xfde68a); this.time.delayedCall(150, () => bat.active && bat.clearTint()); return; }
    this.tweens.add({ targets: bat, scaleX: 0.55, duration: 90, yoyo: true, repeat: times * 2 - 1, ease: 'Sine.easeInOut',
      onComplete: () => bat.setScale(1) });
    this.tweens.add({ targets: bat, angle: { from: -8, to: 8 }, duration: 180, yoyo: true, repeat: times - 1, onComplete: () => bat.setAngle(0) });
  }
  heroScreen() { return this.stage.toScreen(this.hero.x, this.hero.y - 16); }

  async run(id) {
    const clues = this.room.clues;
    for (let i = 0; i < clues.length; i++) {
      if (id !== this.runId) return;
      const clue = this.clue = clues[i];
      this.clueIndex = i; this.wrongTries = 0; this.clueMistakes = 0; this.clueSteps = new Set(); this.clueRight = false;
      this.states[i] = 'now'; this.ui.dots(this.states);
      this.stage.clearScene();
      const Task = TASKS[clue.kind];
      if (!Task) { console.warn('[room] no task for', clue.kind); continue; }
      const task = this.task = new Task(this, clue);
      try { await task.run(); } catch (e) { console.error('[room] task', clue.kind, e); }
      finally {
        try { task.destroy(); } catch (e) { /* ignore */ }
        if (id === this.runId && this.task === task) this.task = null; // a stale run never touches a newer run's task
      }
      if (id !== this.runId) return;
      this.mistakes += this.clueMistakes;
      this.states[i] = this.clueRight ? 'good' : 'bad';
      this.ui.dots(this.states);
      await this.wait(250);
    }
    if (id !== this.runId) return;
    await this.finish(id);
  }

  /** A wrong try on the current clue. Returns the hint step (1 replay, 2 glow + arrow, 3 show the answer). */
  async wrong(picked) {
    const clue = this.clue;
    this.wrongTries++;
    const step = hintStep(this.wrongTries);
    this.clueMistakes = mistakesFor(this.wrongTries, step >= 3);
    if (step >= 2 && !this.clueSteps.has(step)) { this.clueSteps.add(step); this.hints++; }
    if (this.confusions.length < 5) {
      try {
        const c = confusionOf(clue, picked);
        if (c && c.want != null && c.picked != null) this.confusions.push({ item: String(c.want), picked: String(c.picked) });
      } catch (e) { /* no confusion for this pick */ }
    }
    sfx.bonk();
    if (!reduced()) {
      this.tweens.killTweensOf(this.hero);
      this.hero.setAngle(0);
      this.tweens.add({ targets: this.hero, angle: { from: -14, to: 0 }, duration: 450, ease: 'Elastic.easeOut' });
    }
    const hs = this.heroScreen();
    fx.floatText(this, hs.x, hs.y - 10, '哎呀！', '#f97316');
    if (step === 1) this.ui.prompt(clue.ask.zh, clue.ask.en);           // replay the clue (Fu-fu flaps)
    if (step === 2) this.flapFufu(2);
    if (step >= 3) { this.flapFufu(4); this.ui.toast('蝠蝠幫你！', 'Fu-fu shows you', 1400); }
    await this.wait(reduced() ? 150 : 350);
    return step;
  }

  /** The current clue is answered right. */
  async right() {
    this.clueRight = true;
    sfx.ding();
    const hs = this.heroScreen();
    fx.sparkle(this, hs.x, hs.y);
    fx.floatText(this, hs.x, hs.y - 20, '做得好！', '#22c55e');
    voice.say('做得好！');
    this.flapFufu(2);
    const n = coinsPerAnswer(this.key);
    if (n > 0) {
      this.coinsEarned += n;
      this.bridge.addCoins(n);
      this.flyCoin(hs.x, hs.y, () => this.ui.coins(this.bridge.coins));
    }
    if (this.clueIndex >= 0) { this.states[this.clueIndex] = 'good'; this.ui.dots(this.states); }
    await this.wait(reduced() ? 300 : 750);
  }

  /** A coin flies from (x, y) to the coin counter (CSS px). */
  flyCoin(x, y, onArrive, delay = 0) {
    const t = this.ui.coinTarget();
    let c;
    if (this.textures.exists('coin')) c = this.add.image(x, y, 'coin').setScale(Math.max(2, this.stage.PX));
    else c = this.add.image(x, y, 'fx.dot').setTint(0xfacc15).setScale(1.2);
    c.setDepth(600).setAlpha(0);
    this.tweens.add({
      targets: c, x: t.x, y: t.y, alpha: { from: 1, to: 1 }, delay, duration: reduced() ? 150 : 520, ease: 'Cubic.easeIn',
      onComplete: () => { c.destroy(); sfx.coin(); if (onArrive) onArrive(); },
    });
  }

  /** End-of-room chest: coins (and on a first clear of a CHEST_LOOKS room, a costume piece shown as a silhouette first). */
  async chest(coins, lookItem) {
    const st = this.stage;
    st.clearScene(); st.tags(false);
    st.setFocus(60, 132);
    this.tweens.killTweensOf(this.hero);
    this.hero.setPosition(72, FLOOR_Y).setAngle(0);
    this.ui.prompt('寶箱！', 'Treasure chest!', { speak: false });
    let chest;
    try { const f = artFrame(KINDS.chestStar.art); chest = this.add.image(0, 0, f.texture, f.frame).setOrigin(0.5, 1); }
    catch (e) { chest = this.add.rectangle(0, 0, 14, 11, 0xb45309).setOrigin(0.5, 1); }
    chest.setPosition(96, FLOOR_Y);
    st.front.add(chest);
    let piece = null, pieceText = null;
    if (lookItem) {
      piece = this.lookPreview(lookItem);
      if (piece) { piece.setPosition(96, 70).setScale(2); st.front.add(piece); tintAll(piece, 0x1e1b2e); }
      else {
        const p = st.toScreen(96, 60);
        pieceText = this.add.text(p.x, p.y, '❓', { fontSize: '48px', padding: { x: 4, y: 6 } }).setOrigin(0.5).setDepth(30);
      }
      voice.say('寶箱裏有新裝備！');
      await this.ui.toast('寶箱裏有新裝備！', 'Something new in the chest!', 1600);
    }
    // open
    if (!reduced()) await new Promise(res => this.tweens.add({ targets: chest, scaleX: 1.25, scaleY: 0.8, duration: 140, yoyo: true, repeat: 1, onComplete: res }));
    try { const f = artFrame('chest.open'); if (f && this.textures.exists(f.texture)) chest.setTexture(f.texture, f.frame); } catch (e) { /* no open frame */ }
    const cp = st.toScreen(96, FLOOR_Y - 10);
    fx.burst(this, cp.x, cp.y);
    if (lookItem) {
      sfx.fanfare();
      if (piece) tintAll(piece, null);
      if (pieceText) pieceText.setText('✨');
      const p = st.toScreen(96, 40);
      const name = this.add.text(p.x, p.y, `${lookItem.zh} ${lookItem.en}`, textStyle(24, '#fde68a', { stroke: '#1c1917', strokeThickness: 5 })).setOrigin(0.5).setDepth(30);
      this.chestExtras = [piece, pieceText, name];
    } else this.chestExtras = [];
    if (coins > 0) {
      this.bridge.addCoins(coins);
      const total = this.bridge.coins;
      for (let i = 0; i < coins; i++) this.flyCoin(cp.x + (i % 3 - 1) * 10, cp.y, i === coins - 1 ? () => this.ui.coins(total) : null, reduced() ? 0 : i * 70);
      await this.wait(reduced() ? 300 : 600 + coins * 70);
    }
    await this.wait(400);
  }

  /** A display object for a look id (art px, origin bottom-centre), or null. */
  lookPreview(item) {
    const keys = [item.id, `${item.slot}.${item.id.replace(/^(pet|helmet)/, '').toLowerCase()}`];
    for (const k of keys) {
      try { const f = artFrame(k); if (f && this.textures.exists(f.texture)) return this.add.image(0, 0, f.texture, f.frame).setOrigin(0.5, 1); }
      catch (e) { /* next */ }
    }
    try {
      const p = this.bridge.progress || {};
      return makeHero(this, { hero: p.hero || null, equipped: { ...(p.equipped || {}), [item.slot]: item.id } }, { view: 'front' });
    } catch (e) { return null; }
  }

  async finish(id) {
    const bridge = this.bridge, key = this.key;
    const stars = starsFor(this.mistakes);
    const chestN = chestCoins(key, stars);
    const lookId = CHEST_LOOKS[key] && !((bridge.progress && bridge.progress.looks) || []).includes(CHEST_LOOKS[key]) ? CHEST_LOOKS[key] : null;
    const lookItem = lookId ? SHOP.find(s => s.id === lookId) || { id: lookId, slot: 'helmet', zh: lookId, en: '' } : null;
    if (chestN > 0 || lookItem) await this.chest(chestN, lookItem);
    if (id !== this.runId) return;
    const hadLooks = ((bridge.progress && bridge.progress.looks) || []).slice();
    const res = await bridge.complete(key, stars, {
      mistakes: this.mistakes, hints: this.hints, durationSec: Math.round((Date.now() - this.t0) / 1000),
      confusions: this.confusions, coins: this.coinsEarned + chestN, level: this.level,
    });
    if (id !== this.runId) return;
    this.ui.coins(bridge.coins);
    if (res.chestLook && lookItem) {
      const pick = await this.ui.card({ icon: '🎁', zh: `新裝備：${lookItem.zh}`, en: `New look: ${lookItem.en}`,
        buttons: [{ id: 'wear', zh: '穿上', en: 'Wear it' }, { id: 'go', zh: '繼續', en: 'Continue' }] });
      if (id !== this.runId) return;
      if (pick === 'wear') {
        await bridge.saveLook(p => equip(p, lookItem.slot, lookItem.id));
        if (this.hero.setLook) try { this.hero.setLook({ hero: bridge.progress.hero, equipped: bridge.progress.equipped }); } catch (e) { /* ignore */ }
      }
    }
    (this.chestExtras || []).forEach(o => o && o.destroy());
    if (res.floorCleared) {
      sfx.fanfare(); fx.confetti(this);
      await this.ui.toast(`第${res.floorCleared}層完成！ +${res.bonus}`, `Floor ${res.floorCleared} cleared! +${res.bonus} coins`, 2200);
      if (id !== this.runId) return;
      this.ui.coins(bridge.coins);
      // the floor's free look (floor 2 slime pet, floor 4 baby dragon), as WavesScene does for floors 1 and 3
      const fid = FLOOR_LOOK[res.floorCleared], item = fid && SHOP.find(s => s.id === fid);
      if (item && !hadLooks.includes(fid)) {
        const pick = await this.ui.card({ icon: '🎁', zh: `新裝備：${item.zh}`, en: `New look: ${item.en}`,
          buttons: [{ id: 'wear', zh: '穿上', en: 'Wear it' }, { id: 'go', zh: '繼續', en: 'Continue' }] });
        if (id !== this.runId) return;
        if (pick === 'wear') {
          await bridge.saveLook(p => equip(p, item.slot, item.id));
          if (this.hero.setLook) try { this.hero.setLook({ hero: bridge.progress.hero, equipped: bridge.progress.equipped }); } catch (e) { /* ignore */ }
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
    const choice = await this.ui.endPanel({ title: { zh: this.info.zh, en: this.info.en }, stars, newBest: res.newBest, coins: this.coinsEarned + chestN, next: !!next });
    if (id !== this.runId) return;
    if (choice === 'retry') fx.iris(this, 'Room', { key });
    else if (choice === 'next' && next) fx.iris(this, 'Map', { justDone: key, goTo: next });
    else fx.iris(this, 'Map', { justDone: key });
  }
}
