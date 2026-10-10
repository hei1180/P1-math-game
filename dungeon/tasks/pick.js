// 'pick' clue: tap the one thing the clue means (boss riddles F4R5, also usable for the Rush 之間 pick).
// Only candidates are graded (checkAnswer(clue, id)); tapping a named reference wiggles it and says its name.
// Right: the chest opens and the gem pops out. Hints: 1 replay; 2 the named things glow + arrows to their sides;
// 3 the answer chest glows and opens, and the riddle is read with the answer shown.
// Boss room (room.info.boss): a grumpy, sleepy baby dragon sits at the right. It yawns after each riddle and falls
// asleep (Zzz) after the last one; then RoomScene's end chest opens. Mistakes never end the boss.
import { checkAnswer, sentenceText } from '../../dungeon-logic.js?v=0';
import { artFrame, makeCreature } from '../art.js?v=0';
import { FLOOR_Y } from '../stage.js?v=0';
import { textStyle } from '../theme.js?v=0';
import { voice } from '../voice.js?v=0';
import { sfx } from '../sfx.js?v=0';
import { fx } from '../fx.js?v=0';
import { reduced, wait, tapZone, sayName, wiggle, relDir, dirTo, arrowFrom, hopQueue } from './choose.js?v=0';

const DRAGON_AX = 170;

/** The boss state lives on the room for one run (the RoomScene object is reused on restart). */
function bossOf(room) {
  const b = room.__boss;
  if (b && b.runId === room.runId && b.dragon && b.dragon.active) return b;
  const dragon = makeCreature(room, 'dragon', 'left');
  dragon.setPosition(DRAGON_AX, FLOOR_Y);
  room.stage.front.add(dragon);
  return (room.__boss = { runId: room.runId, dragon, done: 0, intro: false, zzz: null });
}

export default class PickTask {
  constructor(room, clue) { this.room = room; this.clue = clue; this.dead = false; this.busy = false; this.extras = []; }

  get sprites() { return this.room.stage.sprites; }
  get isBoss() { return !!(this.room.info && this.room.info.boss); }

  /** Open a chest sprite and pop the gem out of it. */
  reveal(sp) {
    const { room } = this, st = room.stage;
    if (!sp) return;
    try { const f = artFrame('chest.open'); if (/^chest/.test(sp.kind) && room.textures.exists(f.texture)) sp.setTexture(f.texture, f.frame); } catch (e) { /* keep closed */ }
    const g = artFrame('gem');
    const gem = room.add.image(sp.x, sp.y - 6, g.texture, g.frame).setOrigin(0.5, 1);
    st.objs.add(gem);
    room.tweens.add({ targets: gem, y: sp.y - 16, duration: reduced() ? 120 : 380, ease: 'Back.easeOut' });
    const p = st.toScreen(sp.x, sp.y - 16);
    fx.sparkle(room, p.x, p.y);
  }

  answerText() {
    const c = this.clue, ans = c.answers[0];
    if (c.conds.length === 1) {
      const d = c.conds[0];
      return sentenceText(c.scene, { rel: d.rel, a: ans, b: d.b, c: d.c });
    }
    return { zh: `${c.ask.zh.replace(/。?找出寶石！?$/, '')}。寶石在這裏！`, en: `${c.ask.en.replace(/ ?Find the gem!?$/, '')} Here it is!` };
  }

  /** Hint step 2: every named thing glows, with an arrow toward the side the clue names. */
  hint() {
    const { room, clue } = this, st = room.stage;
    st.clearHints();
    for (const d of clue.conds) {
      const b = this.sprites[d.b], c = this.sprites[d.c];
      st.glow(b, true);
      if (d.rel === 'between') { st.glow(c, true); if (b && c) { arrowFrom(st, b, dirTo(b, c)); arrowFrom(st, c, dirTo(c, b)); } }
      else arrowFrom(st, b, relDir(clue.scene, d.rel));
    }
  }

  async showAnswer() {
    const { room, clue } = this, st = room.stage, sp = this.sprites[clue.answers[0]];
    this.hint();
    st.glow(sp, true);
    sfx.pop();
    this.reveal(sp);
    const t = this.answerText();
    const s = room.ui.prompt(t.zh, t.en);
    await Promise.all([s, wait(room, 2600)]);
  }

  async tap(sp) {
    if (this.busy || this.dead) return;
    const { room, clue } = this;
    if (!clue.candidates.includes(sp.objId)) { sayName(room, sp); return; }   // a named reference: vocabulary only
    this.busy = true;
    sfx.tick(2);
    if (checkAnswer(clue, sp.objId)) {
      sfx.pop();
      this.reveal(sp);
      await wait(room, reduced() ? 150 : 450);
      if (this.dead) return;
      await room.right();
      this.finishTap('right');
      return;
    }
    wiggle(room, sp);
    const step = await room.wrong(sp.objId);
    if (this.dead) return;
    if (step === 2) this.hint();
    if (step >= 3) { await this.showAnswer(); this.finishTap('shown'); return; }
    this.busy = false;
  }

  // ---------------------------------------------------------------- boss dragon
  async bossIntro() {
    const { room } = this, boss = bossOf(room);
    if (boss.intro) return;
    boss.intro = true;
    const p = room.stage.toScreen(boss.dragon.x - 6, boss.dragon.y - 24);
    fx.floatText(room, p.x, p.y, '哼！', '#16a34a');
    if (!reduced()) room.tweens.add({ targets: boss.dragon, x: boss.dragon.x - 2, duration: 60, yoyo: true, repeat: 3 });
    voice.say('答對三個謎題，小龍就會睡着');
    await room.ui.toast('答對三個謎題，小龍就會睡着', 'Solve 3 riddles and the dragon falls asleep.', 2400);
  }

  async yawn(boss) {
    const { room } = this, d = boss.dragon;
    const awake = { texture: d.texture.key, frame: d.frame.name }, sleepy = artFrame('dragon.sleep');
    if (room.textures.exists(sleepy.texture)) d.setTexture(sleepy.texture, sleepy.frame);
    sfx.whoosh();
    const p = room.stage.toScreen(d.x - 10, d.y - 22);
    fx.floatText(room, p.x, p.y, '呵～', '#a16207');
    if (!reduced()) await new Promise(res => room.tweens.add({ targets: d, y: d.y - 2, duration: 300, yoyo: true, onComplete: res }));
    await wait(room, reduced() ? 400 : 500);
    if (d.active) d.setTexture(awake.texture, awake.frame);
  }

  sleep(boss) {
    const { room } = this, d = boss.dragon, st = room.stage;
    const f = artFrame('dragon.sleep');
    if (room.textures.exists(f.texture)) d.setTexture(f.texture, f.frame);
    const z = room.add.text(0, 0, 'Z z z', textStyle(26, '#e0f2fe', { stroke: '#1e3a8a', strokeThickness: 5 })).setOrigin(0, 1).setDepth(30);
    const place = () => { if (!z.active) return; const p = st.toScreen(d.x + 2, d.y - 22); z.setPosition(p.x, p.y); };
    place();
    room.events.on('stage:resize', place);
    z.once('destroy', () => room.events.off('stage:resize', place));
    if (!reduced()) room.tweens.add({ targets: z, y: '-=10', alpha: { from: 1, to: 0.45 }, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    boss.zzz = z;
    sfx.fanfare();
    voice.say('小龍睡着了！寶箱打開了！');
    return room.ui.toast('小龍睡着了！寶箱打開了！', 'The dragon is asleep! The chest opens!', 2200);
  }

  async afterRiddle() {
    if (!this.isBoss || this.dead) return;
    const { room } = this, boss = bossOf(room);
    boss.done++;
    const total = room.room.clues.filter(c => c.kind === 'pick').length;
    if (boss.done >= total) await this.sleep(boss);
    else await this.yawn(boss);
  }

  finishTap(how) { this.resolve && this.resolve(how); }

  async run() {
    const { room, clue } = this, st = room.stage, ui = room.ui;
    st.drawScene(clue.scene);
    const refs = clue.conds.flatMap(d => [d.b, d.c]).filter(Boolean);
    Object.values(this.sprites).forEach(sp => tapZone(st, sp, x => this.tap(x)));
    if (this.isBoss) bossOf(room);
    if (clue.level >= 3) refs.forEach(id => st.glow(this.sprites[id], true));
    hopQueue(room);
    if (this.isBoss && room.clueIndex === 0) { await this.bossIntro(); if (this.dead) return; }
    const done = new Promise(res => { this.resolve = res; });
    ui.prompt(clue.ask.zh, clue.ask.en);
    const how = await done;
    if (this.dead || how == null) return;
    await this.afterRiddle();
  }

  destroy() {
    this.dead = true;
    if (this.resolve) this.resolve(null);
  }
}
