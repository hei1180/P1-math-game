// 'go' clue (spec §1, §2): the child walks the hero to the place the clue says and taps 🔍 在這裡！.
// Any slot in clue.answers is right. The button appears when a tap-walk ends on an empty place and is one-shot
// (after a wrong try the hero has to move again). Hints: 1 replay (room), 2 glow + arrow, 3 the hero walks
// to an answer and the sentence is read with the answer filled in. keyTwist: the key pops out of the place.
import { checkAnswer } from '../../dungeon-logic.js?v=202610112341';
import { attachWalk, glowRefs, hintArrows, answerSentence, nearestAnswer, popItem } from '../hero-walk.js?v=202610112341';
import { sfx } from '../sfx.js?v=202610112341';
import { fx } from '../fx.js?v=202610112341';

export default class GoTask {
  constructor(room, clue) {
    this.room = room; this.clue = clue;
    this.walk = null; this.tryRes = null; this.queued = null; this.dead = false; this.done = false;
  }

  async run() {
    const { room, clue } = this;
    room.stage.drawScene(clue.scene);
    if (clue.level >= 3) glowRefs(room, clue);
    this.walk = attachWalk(room, { onStart: () => this.hideHere(), onStop: pt => this.showHere(pt) });
    room.ui.prompt(clue.ask.zh, clue.ask.en);
    let hinted = false;
    for (;;) {
      const picked = await this.nextTry();
      if (picked == null || this.dead) return;
      if (checkAnswer(clue, picked)) {
        this.finishWalking();
        const z = room.stage.slots[picked];
        if (clue.keyTwist && z) popItem(room, 'key', z.ax, z.ay);
        await room.right();
        return;
      }
      const step = await room.wrong(picked);
      if (this.dead) return;
      if (step >= 2 && !hinted) { hinted = true; hintArrows(room, clue); }
      if (step >= 3) { await this.showAnswer(); return; }
    }
  }

  nextTry() {
    if (this.queued != null) { const q = this.queued; this.queued = null; return Promise.resolve(q); }
    return new Promise(r => { this.tryRes = r; });
  }

  showHere(pt) {
    if (this.dead || this.done || pt.slotIndex == null) return;
    sfx.pop();
    this.room.ui.button({ id: 'here', icon: '🔍', zh: '在這裡！', en: "I'm here!" }).then(id => {
      if (id !== 'here' || this.dead || this.done) return;
      if (this.tryRes) { const r = this.tryRes; this.tryRes = null; r(pt.slotIndex); }
      else this.queued = pt.slotIndex;
    });
  }
  hideHere() { this.room.ui.removeButton('here'); }

  finishWalking() {
    this.done = true;
    this.hideHere();
    if (this.walk) this.walk.enable(false);
  }

  /** Hint step 3: walk to the closest answer place and read the sentence with the answer in it. */
  async showAnswer() {
    const { room, clue } = this;
    this.finishWalking();
    const i = nearestAnswer(room, clue, room.hero.x, room.hero.y);
    const z = room.stage.slots[i];
    if (z) {
      await this.walk.walkTo({ ax: z.ax, ay: z.ay, slotIndex: i });
      if (this.dead) return;
      const p = room.stage.toScreen(z.ax, z.ay - 10);
      fx.sparkle(room, p.x, p.y);
      if (clue.keyTwist) popItem(room, 'key', z.ax, z.ay);
    }
    const s = answerSentence(clue, i, clue.keyTwist ? 'key' : 'hero');
    await Promise.all([room.ui.prompt(s.zh, s.en), room.wait(1800)]);
  }

  destroy() {
    this.dead = true;
    if (this.tryRes) { const r = this.tryRes; this.tryRes = null; r(null); }
    this.room.ui.removeButton('here');
    if (this.walk) this.walk.destroy();
  }
}
