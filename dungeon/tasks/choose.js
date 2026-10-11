// 'choose' clue (spec §1, §2 R1 rooms): two big signs 左面/右面, 前面/後面 or 上面/下面.
// F1R1 opens with the wall-tag demo (「這邊是左面」 then 右). Queue clues hop the slimes once so their facing shows
// (the stage draws footprint arrows under them at support level 3). Grading only through checkAnswer.
//
// Also exports small helpers shared by the judge / select / pick tasks (same folder, no new files).
import { checkAnswer, sentenceText, KINDS } from '../../dungeon-logic.js?v=202610112341';
import { artFrame, hop } from '../art.js?v=202610112341';
import { FLOOR_Y } from '../stage.js?v=202610112341';
import { voice } from '../voice.js?v=202610112341';
import { sfx } from '../sfx.js?v=202610112341';
import { fx } from '../fx.js?v=202610112341';

// ---------------------------------------------------------------- shared helpers
export const reduced = () => fx.lessMotion || !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
export const wait = (scene, ms) => new Promise(res => scene.time.delayedCall(ms, res));
export const WORDS = {
  left: { zh: '左面', en: 'left' }, right: { zh: '右面', en: 'right' },
  front: { zh: '前面', en: 'in front' }, back: { zh: '後面', en: 'behind' },
  above: { zh: '上面', en: 'above' }, below: { zh: '下面', en: 'below' },
};
export const OPPOSITE = { left: 'right', right: 'left', above: 'below', below: 'above', front: 'back', back: 'front' };

/** Resolves when speech has finished (polls speechSynthesis.speaking), at most `max` ms; at least `min` ms. */
export async function afterSpeech(scene, { min = 0, max = 4500 } = {}) {
  const t0 = Date.now();
  await wait(scene, 120);
  const synth = window.speechSynthesis;
  while (Date.now() - t0 < max && synth && synth.speaking) await wait(scene, 120);
  const left = min - (Date.now() - t0);
  if (left > 0) await wait(scene, left);
}

/** Interactive zone over a stage sprite (art px), ≥ 48 CSS px, kept ≥ 48 px on resize. */
export function tapZone(stage, sprite, onTap, { h = 16 } = {}) {
  const scene = stage.scene;
  const size = () => Math.max(16, Math.ceil(48 / stage.PX));
  const z = scene.add.zone(sprite.x, sprite.y - h / 2, size(), Math.max(size(), h)).setInteractive({ useHandCursor: true });
  z.on('pointerup', () => onTap(sprite));
  stage.objs.add(z);
  const onResize = () => { if (z.active) { z.setSize(size(), Math.max(size(), h)); z.input.hitArea.setTo(0, 0, z.width, z.height); } };
  scene.events.on('stage:resize', onResize);
  z.once('destroy', () => scene.events.off('stage:resize', onResize));
  return z;
}

/** Little wiggle (no motion with less motion). */
export function wiggle(scene, sprite) {
  if (!sprite || !sprite.active || reduced()) return;
  scene.tweens.killTweensOf(sprite);
  sprite.setAngle(0);
  scene.tweens.add({ targets: sprite, angle: { from: -12, to: 12 }, duration: 70, yoyo: true, repeat: 2, onComplete: () => sprite.setAngle(0) });
}
/** Vocabulary support: wiggle and say the object's name. */
export function sayName(scene, sprite) {
  wiggle(scene, sprite);
  const k = KINDS[sprite.kind];
  if (k) voice.say(k.zh);
}

/** Screen direction of a relation word in a scene: left/right/up/down (front/back from the queue facing). */
export function relDir(sceneData, rel) {
  if (rel === 'left' || rel === 'right') return rel;
  if (rel === 'above') return 'up';
  if (rel === 'below') return 'down';
  const f = sceneData.queueFacing === 'left' ? 'left' : 'right';
  if (rel === 'front') return f;
  if (rel === 'back') return f === 'left' ? 'right' : 'left';
  return null;
}
/** Direction from sprite p to sprite q on the grid (gx, gy; gy grows upward). */
export function dirTo(p, q) {
  if (p.gy === q.gy) return q.gx < p.gx ? 'left' : 'right';
  return q.gy > p.gy ? 'up' : 'down';
}
/** Hint arrow next to a sprite, pointing `dir` away from it. */
export function arrowFrom(stage, sprite, dir, h = 16) {
  if (!sprite || !dir) return null;
  const x = sprite.x, y = sprite.y - h / 2;
  const L = stage.current && stage.current.scene.layout;
  if ((dir === 'left' || dir === 'right') && (L === 'pair' || L === 'row' || L === 'queue')) {
    // floor lines: above the thing, so it never hides its neighbour
    return stage.arrow(x + (dir === 'left' ? -11 : 11), sprite.y - h - 5, dir);
  }
  if (dir === 'left') return stage.arrow(x - 15, y, 'left');
  if (dir === 'right') return stage.arrow(x + 15, y, 'right');
  if (dir === 'up') return stage.arrow(x + 10, y - 9, 'up');
  return stage.arrow(x + 10, y + 10, 'down');
}
/** Every queue creature hops once, staggered, so its facing is seen. */
export function hopQueue(room) {
  const st = room.stage, sd = st.current && st.current.scene;
  if (!sd || sd.layout !== 'queue') return;
  Object.values(st.sprites).forEach((s, i) => {
    if (!s.active) return;
    if (reduced()) { room.tweens.add({ targets: s, y: s.y - 1, duration: 70, yoyo: true, delay: i * 60 }); return; }
    hop(s, { delay: i * 140 });
  });
}
/** Hint: footprints under the queue blink in the facing direction ("the queue's facing flashes"). */
export function flashFeet(room) {
  const st = room.stage, sd = st.current && st.current.scene;
  if (!sd || sd.layout !== 'queue') return;
  const f = artFrame('foot'), left = sd.queueFacing === 'left';
  Object.values(st.sprites).forEach(s => {
    const im = room.add.image(s.x + (left ? -4 : 4), FLOOR_Y + 9, f.texture, f.frame).setFlipX(left);
    st.hints.add(im);
    if (!reduced()) room.tweens.add({ targets: im, alpha: { from: 1, to: 0.25 }, duration: 380, yoyo: true, repeat: -1 });
  });
}

// ---------------------------------------------------------------- choose
export default class ChooseTask {
  constructor(room, clue) { this.room = room; this.clue = clue; this.dead = false; this.demoGlow = []; }

  get sprites() { return this.room.stage.sprites; }

  /** F1R1: the big 左 tag lights up 「這邊是左面」, then 右 (no hands or body steps). */
  async demo() {
    const { room } = this, st = room.stage, ui = room.ui;
    const hadTags = !!st.tagObjs;
    if (!hadTags) st.tags(true, 'big');
    for (const side of ['left', 'right']) {
      if (this.dead) return;
      const tag = st.tagObjs && st.tagObjs[side];
      let ring = null;
      if (tag && tag.active) {
        ring = room.add.graphics();
        ring.fillStyle(0xfde047, 0.55).fillRoundedRect(-44, -48, 88, 96, 18);
        ring.lineStyle(4, 0xfacc15, 1).strokeRoundedRect(-44, -48, 88, 96, 18);
        tag.addAt(ring, 0);
        if (!reduced()) room.tweens.add({ targets: tag, scale: { from: 1, to: 1.15 }, duration: 320, yoyo: true, repeat: 2 });
      }
      sfx.pop();
      const w = WORDS[side];
      const sp = ui.prompt(`這邊是${w.zh}`, `This side is ${w.en}.`);
      await Promise.all([sp, wait(room, 1500)]);
      if (tag && tag.active) { room.tweens.killTweensOf(tag); tag.setScale(1); }
      if (ring && ring.active) ring.destroy();
    }
    if (!hadTags && !this.dead) st.tags(false);
  }

  options() {
    return this.clue.choices.map(id => ({ id, zh: WORDS[id].zh, en: WORDS[id].en }));
  }

  /** The clue's sentence with the answer filled in (for showing the answer). */
  answerText() {
    const c = this.clue;
    return c.rel === 'side'
      ? sentenceText(c.scene, { rel: 'side', a: c.a, side: c.answer })
      : sentenceText(c.scene, { rel: c.answer, a: c.a, b: c.b });
  }

  /** Hint step 2: reference glows, arrow from it toward the answer side (queues: footprints flash). */
  hint() {
    const { room, clue } = this, st = room.stage, a = this.sprites[clue.a], b = this.sprites[clue.b];
    st.clearHints();
    if (clue.rel === 'side') {
      st.glow(a, true);
      arrowFrom(st, a, clue.answer);               // points from the thing toward its wall
    } else {
      st.glow(b, true);
      arrowFrom(st, b, a && b ? dirTo(b, a) : null);
      flashFeet(room);
    }
  }

  async showAnswer() {
    const { room, clue } = this, st = room.stage, a = this.sprites[clue.a], b = this.sprites[clue.b];
    this.hint();
    st.glow(a, true);
    if (b) st.glow(b, true);
    room.ui.mark(clue.answer, true);
    const t = this.answerText();
    const sp = room.ui.prompt(t.zh, t.en);
    await Promise.all([sp, wait(room, 2200)]);
  }

  async run() {
    const { room, clue } = this, st = room.stage, ui = room.ui;
    st.drawScene(clue.scene);
    Object.values(this.sprites).forEach(s => tapZone(st, s, sp => sayName(room, sp)));
    if (room.key === 'F1R1' && room.clueIndex === 0) await this.demo();
    if (this.dead) return;
    if (clue.level >= 3 && clue.b) st.glow(this.sprites[clue.b], true);   // S3: the reference object glows
    ui.prompt(clue.ask.zh, clue.ask.en);
    hopQueue(room);
    for (;;) {
      const id = await ui.choices(this.options());
      if (id == null || this.dead) return;               // UI cleared (scene left)
      if (checkAnswer(clue, id)) {
        await ui.mark(id, true);
        if (this.dead) return;
        await room.right();
        return;
      }
      ui.mark(id, false);
      const step = await room.wrong(id);
      if (this.dead) return;
      if (step === 1) hopQueue(room);
      if (step === 2) this.hint();
      if (step >= 3) { await this.showAnswer(); return; }
    }
  }

  destroy() {
    this.dead = true;
    this.room.ui.clearChoices();
  }
}
