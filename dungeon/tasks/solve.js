// 'solve' clue (F4R2 shelf puzzle, textbook p77): a 2×2 / 2×3 shelf with one thing already on it, 2–3 sentences
// (shown in a list, each with 🔈, read one by one at the start). The child drags every item onto the shelf and taps
// 完成 → checkAnswer (checkSolve). Wrong: each sentence that is not true turns red and the items it names wobble
// (one mistake). Hints: 2 the things the first broken sentence names glow, 3 the items fly to the answer.
import { checkAnswer, truthOf } from '../../dungeon-logic.js?v=202610112341';
import { DragBoard, SentencePanel, TaskButton, wait, reduced } from './drag.js?v=202610112341';

export default class SolveTask {
  constructor(room, clue) {
    this.room = room; this.clue = clue; this.dead = false; this.glowed = [];
    this.onShutdown = () => { this.dead = true; this.destroy(); };
    room.events.once('shutdown', this.onShutdown);
  }

  async run() {
    const { room, clue } = this, sc = clue.scene;
    room.stage.drawScene(sc, { markers: true });
    const board = this.board = new DragBoard(room, { kinds: clue.items, trayAx: 150 });
    const done = this.done = new TaskButton(room, { zh: '完成', en: 'Done', icon: '✔', enabled: false });
    const panel = this.panel = new SentencePanel(room, clue.sentences, { pickable: false, reserveBottom: 92, avoid: () => board.contentRect() });
    board.onChange = () => done.enable(board.allPlaced());
    board.onPick = () => { panel.paintAll('normal'); this.unglow(); };
    this.readAll();

    for (;;) {
      const ok = await done.wait();
      if (!ok || this.dead) return;
      if (!board.allPlaced()) continue;
      this.reading = false;
      const placement = board.placement();
      if (checkAnswer(clue, placement)) {
        board.lock(true);
        done.enable(false);
        panel.paintAll('good');
        await room.right();
        return;
      }
      const full = this.placedScene(placement);
      const broken = clue.sentences.map((s, i) => (truthOf(full, s) === true ? -1 : i)).filter(i => i >= 0);
      const movers = new Set();
      broken.forEach(i => {
        panel.paint(i, 'bad');
        const s = clue.sentences[i];
        [s.a, s.b, s.c].forEach(id => { if (id && clue.items.includes(id)) movers.add(id); });
      });
      movers.forEach(k => board.wobble(board.sprite(k)));
      const step = await room.wrong(placement);
      if (this.dead) return;
      if (step === 2 && broken.length) {
        const s = clue.sentences[broken[0]];
        [s.a, s.b, s.c].forEach(id => { const sp = id && board.sprite(id); if (sp) { room.stage.glow(sp, true); this.glowed.push(sp); } });
      }
      if (step >= 3) {
        this.unglow();
        done.enable(false);
        await board.moveTo(clue.answer);
        if (this.dead) return;
        panel.paintAll('good');
        await wait(room, reduced() ? 1200 : 1800);
        return;
      }
    }
  }

  /** Prompt, then each sentence read aloud in turn (its row lights up). Stops when the child taps 完成. */
  async readAll() {
    const { room, clue } = this;
    this.reading = true;
    await room.ui.prompt(clue.ask.zh, clue.ask.en);
    for (let i = 0; i < clue.sentences.length; i++) {
      if (!this.reading || this.dead || !this.panel) return;
      if (this.panel.state[i] !== 'normal') continue;
      this.panel.paint(i, 'speak');
      await room.ui.say(clue.sentences[i].zh);
      if (this.dead || !this.panel) return;
      if (this.panel.state[i] === 'speak') this.panel.paint(i, 'normal');
    }
    this.reading = false;
  }

  /** The shelf with the items in their places (ids = kinds), as dungeon-logic grades it. */
  placedScene(placement) {
    const sc = this.clue.scene;
    return { ...sc, objects: sc.objects.concat(this.clue.items.map(k => ({ id: k, kind: k, x: sc.slots[placement[k]].x, y: sc.slots[placement[k]].y }))) };
  }

  unglow() {
    this.glowed.forEach(sp => { try { this.room.stage.glow(sp, false); } catch (e) { /* gone */ } });
    this.glowed = [];
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.reading = false;
    this.room.events.off('shutdown', this.onShutdown);
    this.unglow();
    [this.panel, this.done, this.board].forEach(o => { if (o) try { o.destroy(); } catch (e) { /* gone */ } });
  }
}
