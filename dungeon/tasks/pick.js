// STUB (Task 4): 'pick' clue — replaced by its own task (T5–T7). Draws the clue's scene, shows the clue,
// then waits for 「下一題」 (counts as right) or 「答錯」 (a wrong try, to exercise the hint ladder).
export default class PickTask {
  constructor(room, clue) { this.room = room; this.clue = clue; }
  async run() {
    const { room, clue } = this;
    if (clue.scene) room.stage.drawScene(clue.scene);
    room.ui.prompt(clue.ask.zh, clue.ask.en);
    for (;;) {
      const id = await room.ui.choices([{ id: 'next', zh: '下一題', en: 'Next (stub)' }, { id: 'wrong', zh: '答錯', en: 'Wrong (stub)' }]);
      if (id === 'next') { room.ui.clearChoices(); await room.right(); return; }
      if (id !== 'wrong') return; // UI cleared (scene left)
      const step = await room.wrong(null);
      if (step >= 3) { room.ui.clearChoices(); return; }
    }
  }
  destroy() { this.room.ui.clearChoices(); }
}
