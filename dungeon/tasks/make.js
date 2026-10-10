// 'make' clue (F1R5 hooks, F2R5 parade, F3R5 tower): the child drags 2–3 items from the tray onto any empty
// places (a queue can turn round with 🔄), taps 完成, then picks the one true sentence out of three
// (sentencesFor on the child's own arrangement). Grading: checkAnswer(clue, { scene, sentence }).
// Hints: 1 the clue replays (room.wrong), 2 the things the true sentence names glow, 3 the true sentence turns green
// and is read aloud, then the room moves on.
import { checkAnswer, sentencesFor, truthOf } from '../../dungeon-logic.js?v=0';
import { DragBoard, SentencePanel, TaskButton, wait, reduced } from './drag.js?v=0';
import { hop } from '../art.js?v=0';
import { voice } from '../voice.js?v=0';
import { sfx } from '../sfx.js?v=0';

export default class MakeTask {
  constructor(room, clue) {
    this.room = room; this.clue = clue; this.dead = false; this.glowed = [];
    this.onShutdown = () => { this.dead = true; this.destroy(); };
    room.events.once('shutdown', this.onShutdown);
  }

  async run() {
    const { room, clue } = this, sc = clue.scene, st = room.stage;
    st.drawScene(sc);
    room.ui.prompt(clue.ask.zh, clue.ask.en);
    const queue = sc.layout === 'queue';
    this.facing = sc.queueFacing || 'right';
    const board = this.board = new DragBoard(room, { kinds: clue.items, facing: this.facing, trayAx: sc.layout === 'column' ? 150 : 96 });
    const done = this.done = new TaskButton(room, { zh: '完成', en: 'Done', icon: '✔', enabled: false });
    board.onChange = () => done.enable(board.allPlaced());
    if (queue) {
      this.flip = new TaskButton(room, { zh: '轉身', en: 'Turn round', icon: '🔄', side: 'left', w: 150 });
      this.flip.onTap = () => {
        this.facing = this.facing === 'left' ? 'right' : 'left';
        board.setFacing(this.facing);
        sfx.whoosh();
        board.items.forEach(it => { try { hop(it.sprite); } catch (e) { /* no hop */ } });
      };
    }

    // 1. arrange
    let arranged, sentences;
    for (;;) {
      const ok = await done.wait();
      if (!ok || this.dead) return;
      if (!board.allPlaced()) continue;
      arranged = this.arranged();
      try { sentences = sentencesFor(arranged, room.bridge.rng, clue.rels); break; }
      catch (e) { console.warn('[make]', e); room.ui.toast('再排一排', 'Try another way', 1400); }
    }

    // 2. pick the true sentence
    board.lock(true); board.hideTray();
    done.hide(); if (this.flip) this.flip.hide();
    room.ui.prompt('哪一句是對的？', 'Which sentence is true?');
    const panel = this.panel = new SentencePanel(room, sentences, { pickable: true, avoid: () => board.contentRect() });
    const trueIdx = sentences.findIndex(s => truthOf(arranged, s) === true);
    for (;;) {
      const i = await panel.pick();
      if (i == null || this.dead) return;
      const s = sentences[i];
      if (checkAnswer(clue, { scene: arranged, sentence: s })) {
        panel.show(i);
        await room.right();
        return;
      }
      panel.flash(i);
      const step = await room.wrong(s);
      if (this.dead) return;
      if (step === 2) this.glowTrue(sentences[trueIdx]);
      if (step >= 3) {
        this.glowTrue(sentences[trueIdx]);
        panel.show(trueIdx);
        await Promise.all([voice.say(sentences[trueIdx].zh), wait(room, reduced() ? 1200 : 1800)]);
        return;
      }
    }
  }

  /** The child's scene: the items in their slots (ids = kinds), the queue's facing. */
  arranged() {
    const sc = this.clue.scene, b = this.board;
    const used = new Set(b.items.map(it => it.slot));
    const out = {
      ...sc,
      objects: b.items.map(it => {
        const sl = sc.slots[it.slot];
        return { id: it.kind, kind: it.kind, x: sl.x, y: sl.y, ...(sc.layout === 'queue' ? { facing: this.facing } : {}) };
      }),
      slots: sc.slots.filter((_, i) => !used.has(i)).map(s => ({ ...s })),
    };
    if (sc.layout === 'queue') out.queueFacing = this.facing;
    return out;
  }

  glowTrue(s) {
    if (!s) return;
    for (const id of [s.a, s.b, s.c]) {
      const sp = id && this.board.sprite(id);
      if (sp && !this.glowed.includes(sp)) { this.room.stage.glow(sp, true); this.glowed.push(sp); }
    }
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.room.events.off('shutdown', this.onShutdown);
    this.glowed.forEach(sp => { try { this.room.stage.glow(sp, false); } catch (e) { /* gone */ } });
    [this.panel, this.done, this.flip, this.board].forEach(o => { if (o) try { o.destroy(); } catch (e) { /* gone */ } });
  }
}
