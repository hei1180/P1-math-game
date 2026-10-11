// 'select' clue (spec §1 select-all, R4 rooms): 「哪些在…？答案可多於一個」. Tap things to ring / unring them,
// then 「完成」. Graded with checkAnswer(clue, [ids]) (set-equal). A wrong set is one mistake: the bat shows the
// right set (they glow, wrong rings drop off) and the child confirms by ringing the glowing ones and tapping 完成.
// Further wrong tries follow the hint ladder; step 3 rings the answers and reads the sentence.
import { checkAnswer, sentenceText, KINDS } from '../../dungeon-logic.js?v=202610112341';
import { voice } from '../voice.js?v=202610112341';
import { sfx } from '../sfx.js?v=202610112341';
import { reduced, wait, afterSpeech, tapZone, wiggle, relDir, dirTo, arrowFrom, hopQueue, flashFeet } from './choose.js?v=202610112341';

export default class SelectTask {
  constructor(room, clue) { this.room = room; this.clue = clue; this.dead = false; this.sel = new Set(); this.rings = {}; this.locked = false; }

  get sprites() { return this.room.stage.sprites; }

  ring(id, on, colour = 0x38bdf8) {
    const { room } = this, st = room.stage, sp = this.sprites[id];
    if (this.rings[id]) { room.tweens.killTweensOf(this.rings[id]); this.rings[id].destroy(); delete this.rings[id]; }
    if (!on || !sp) return;
    const g = room.add.graphics();
    g.lineStyle(2, 0xffffff, 1).strokeCircle(0, 0, 11);
    g.lineStyle(1, colour, 1).strokeCircle(0, 0, 12.5).strokeCircle(0, 0, 9.5);
    g.setPosition(sp.x, sp.y - 8);
    st.objs.add(g);
    this.rings[id] = g;
    if (!reduced()) room.tweens.add({ targets: g, scale: { from: 1.3, to: 1 }, duration: 160, ease: 'Back.easeOut' });
  }

  toggle(sp) {
    if (this.locked || this.dead) return;
    const id = sp.objId;
    if (this.sel.has(id)) { this.sel.delete(id); this.ring(id, false); sfx.boop(); }
    else {
      this.sel.add(id); this.ring(id, true); sfx.pop();
      wiggle(this.room, sp);
      const k = KINDS[sp.kind]; if (k) voice.say(k.zh);
    }
  }

  /** 「在火把的左面」 / "left of the torch." — the clue's place words, from the logic's sentence text. */
  placeWords() {
    const c = this.clue, a = c.answers[0];
    const t = sentenceText(c.scene, { rel: c.rel, a, b: c.b, c: c.c });
    const name = KINDS[this.sprites[a] ? this.sprites[a].kind : ''];
    return { zh: name ? t.zh.slice(name.zh.length) : t.zh, en: t.en.replace(/^The .+? is /, '') };
  }

  /** The bat shows which are right: answers glow, rings on wrong ones drop off. */
  showSet() {
    const { room, clue } = this, st = room.stage;
    st.clearHints();
    for (const id of Object.keys(this.sprites)) st.glow(this.sprites[id], clue.answers.includes(id));
    for (const id of [...this.sel]) {
      if (clue.answers.includes(id)) continue;
      this.sel.delete(id);
      const g = this.rings[id];
      if (g && !reduced()) { delete this.rings[id]; room.tweens.add({ targets: g, y: g.y + 10, alpha: 0, duration: 300, onComplete: () => g.destroy() }); }
      else this.ring(id, false);
    }
  }

  /** Hint step 2 extra: an arrow from the reference toward the clue's side (both ends for 之間). */
  arrows() {
    const { room, clue } = this, st = room.stage, b = this.sprites[clue.b], c = this.sprites[clue.c];
    if (clue.rel === 'between') { if (b && c) { arrowFrom(st, b, dirTo(b, c)); arrowFrom(st, c, dirTo(c, b)); } }
    else { arrowFrom(st, b, relDir(clue.scene, clue.rel)); if (clue.rel === 'front' || clue.rel === 'back') flashFeet(room); }
  }

  async showAnswer() {
    const { room, clue } = this;
    this.locked = true;
    this.showSet();
    this.arrows();
    for (const id of clue.answers) { this.sel.add(id); this.ring(id, true, 0x22c55e); }
    const p = this.placeWords();
    const sp = room.ui.prompt(`發光的都${p.zh}`, `The glowing ones are ${p.en}`);
    await Promise.all([sp, wait(room, 2600)]);
  }

  async run() {
    const { room, clue } = this, st = room.stage, ui = room.ui;
    st.drawScene(clue.scene);
    Object.values(this.sprites).forEach(sp => tapZone(st, sp, x => this.toggle(x)));
    if (clue.level >= 3) { st.glow(this.sprites[clue.b], true); if (clue.c) st.glow(this.sprites[clue.c], true); }
    ui.prompt(clue.ask.zh, clue.ask.en);
    hopQueue(room);
    for (;;) {
      const r = await ui.button({ id: 'done', zh: '完成', en: 'Done', icon: '✔' });
      if (r == null || this.dead) return;
      const picked = [...this.sel];
      if (!picked.length) {                               // nothing ringed yet: a nudge, not a mistake
        ui.toast('先點選答案，再按完成', 'Tap the answers first, then Done');
        voice.say('先點選答案，再按完成');
        continue;
      }
      if (checkAnswer(clue, picked)) {
        this.locked = true;
        picked.forEach(id => this.ring(id, true, 0x22c55e));
        await room.right();
        return;
      }
      this.locked = true;
      const step = await room.wrong(picked);
      if (this.dead) return;
      if (step >= 3) { await this.showAnswer(); return; }
      this.showSet();
      if (step >= 2) this.arrows();
      this.locked = false;
      ui.toast('發光的都是答案，全部圈起來，再按完成', 'The glowing ones are answers. Ring them all, then tap Done.', 2600);
      await afterSpeech(room, { max: 3000 });
      if (this.dead) return;
      voice.say('發光的都是答案，全部圈起來，再按完成');
    }
  }

  destroy() {
    this.dead = true;
    this.room.ui.removeButton('done');
  }
}
