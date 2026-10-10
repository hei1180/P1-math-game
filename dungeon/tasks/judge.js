// 'judge' clue (spec §1 owl, R4 rooms): the owl perches on the wall and says a sentence about the room in a
// smooth-text speech bubble (also spoken). The child taps ✓ 對 or ✗ 不對. Grading only through checkAnswer.
// Hints: 1 the bat asks again, then the owl repeats; 2 the named reference glows + an arrow to the side the owl
// named; 3 shows why (both things glow, arrow to where the thing really is, the true sentence is read).
import { checkAnswer, sentenceText, truthOf } from '../../dungeon-logic.js?v=0';
import { makeCreature, hop } from '../art.js?v=0';
import { textStyle, UI as C } from '../theme.js?v=0';
import { voice } from '../voice.js?v=0';
import { sfx } from '../sfx.js?v=0';
import { reduced, wait, afterSpeech, tapZone, sayName, relDir, dirTo, arrowFrom, hopQueue, flashFeet, OPPOSITE } from './choose.js?v=0';

const BTN = [{ id: 'yes', zh: '對', en: 'Right', icon: '✓' }, { id: 'no', zh: '不對', en: 'Not right', icon: '✗' }];

export default class JudgeTask {
  constructor(room, clue) { this.room = room; this.clue = clue; this.dead = false; this.bubble = null; this.owl = null; }

  get sprites() { return this.room.stage.sprites; }
  get s() { return this.clue.sentence; }

  /** Owl on a wall bracket: top-right above a floor line, or right of a column. Not on any line of the clue. */
  placeOwl() {
    const { room } = this, st = room.stage, sd = this.clue.scene;
    let ax = 160, ay = 30;
    if (sd.layout === 'column' || sd.layout === 'shelf') { ax = 152; ay = 76; }   // below the backdrop torch
    else if (st.tagObjs && st.tagObjs.right) ax = Math.min(160, Math.floor(st.fromScreen(st.tagObjs.right.x - 40, 0).ax) - 10);
    const g = room.add.graphics();
    g.fillStyle(0x5b3a1e, 1).fillRect(ax - 8, ay, 16, 2);
    g.fillStyle(0x8b5a2b, 1).fillRect(ax - 8, ay, 16, 1).fillRect(ax + 4, ay + 2, 2, 5);
    st.objs.add(g);
    const owl = this.owl = makeCreature(room, 'owl', 'left');
    owl.setPosition(ax, ay);
    owl.kind = 'owl';
    st.objs.add(owl);
    tapZone(st, owl, () => this.owlSay());
  }

  /** Smooth-text speech bubble (screen px, depth 30), placed where it fits; tail points at the owl. */
  makeBubble() {
    const { room } = this, sc = room;
    const c = sc.add.container(0, 0).setDepth(30);
    const g = sc.add.graphics();
    const tz = sc.add.text(0, 0, this.s.zh, textStyle(26, '#1f2937', { align: 'center' })).setOrigin(0.5, 0);
    const te = sc.add.text(0, 0, this.s.en, textStyle(14, '#57534e', { fontStyle: 'normal', align: 'center' })).setOrigin(0.5, 0);
    const hit = sc.add.zone(0, 0, 10, 10).setOrigin(0, 0).setInteractive({ useHandCursor: true });
    hit.on('pointerup', () => this.owlSay());
    c.add([g, tz, te, hit]);
    c.hit = hit;
    this.bubble = c;
    const relayout = () => { if (c.active && this.owl && this.owl.active) this.layoutBubble(c, g, tz, te); };
    relayout();
    sc.events.on('stage:resize', relayout);
    c.once('destroy', () => sc.events.off('stage:resize', relayout));
    if (!reduced()) sc.tweens.add({ targets: c, alpha: { from: 0, to: 1 }, duration: 220 });
  }

  layoutBubble(c, g, tz, te) {
    const { room } = this, st = room.stage, ui = room.ui, W = room.scale.width, H = room.scale.height;
    const sd = this.clue.scene, column = sd.layout === 'column' || sd.layout === 'shelf';
    const o = this.owl, PX = st.PX;
    const head = st.toScreen(o.x, o.y - 15), side = st.toScreen(o.x - 9, o.y - 9);
    const top = ui.topH + 6;
    const regions = [];
    // inside the room, beside the owl
    if (column) {
      const p = st.toScreen(112, 3), q = st.toScreen(188, o.y - 18);
      regions.push({ x0: p.x, x1: Math.min(q.x, W - 8), y0: Math.max(p.y, top), y1: q.y, anchor: 'below' });
    } else {
      let lx = 18;
      if (st.tagObjs && st.tagObjs.left) lx = st.fromScreen(st.tagObjs.left.x + 40, 0).ax + 2;
      const p = st.toScreen(lx, 3), q = st.toScreen(o.x - 11, 64);
      regions.push({ x0: Math.max(8, p.x), x1: q.x, y0: Math.max(p.y, top), y1: q.y, anchor: 'right' });
    }
    // above the room (phones / tablets in portrait)
    if (st.oy - top - 8 >= 64) regions.push({ x0: 8, x1: W - 8, y0: top, y1: st.oy + 2 * PX, anchor: 'below' });
    // left of the room (phones in landscape)
    if (st.ox >= 150) regions.push({ x0: 8, x1: st.ox - 6, y0: top, y1: H - 50, anchor: 'right' });

    const fit = (r, size) => {
      const maxW = Math.min(560, r.x1 - r.x0);
      if (maxW < 120) return null;
      tz.setFontSize(size).setWordWrapWidth(maxW - 28, true);
      te.setWordWrapWidth(Math.max(60, maxW - 28), true);
      const bw = Math.min(maxW, Math.max(tz.width, te.width) + 28), bh = tz.height + te.height + 18;
      return bh <= r.y1 - r.y0 ? { r, bw, bh, size } : null;
    };
    let pick = null;
    for (const size of [26, 22]) { for (const r of regions) { pick = fit(r, size); if (pick) break; } if (pick) break; }
    if (!pick) { // last resort: the inside region with small text, growing upward
      const r = regions[0];
      r.x1 = Math.max(r.x1, r.x0 + 180);
      tz.setFontSize(20).setWordWrapWidth(r.x1 - r.x0 - 28, true);
      te.setWordWrapWidth(r.x1 - r.x0 - 28, true);
      pick = { r, bw: Math.min(r.x1 - r.x0, Math.max(tz.width, te.width) + 28), bh: tz.height + te.height + 18 };
    }
    const { r, bw, bh } = pick;
    let bx, by;
    if (r.anchor === 'right') { bx = r.x1 - bw; by = Math.min(r.y1 - bh, Math.max(r.y0, side.y - bh / 2)); }
    else { bx = Math.max(r.x0, Math.min(r.x1 - bw, head.x - bw / 2)); by = r.y1 - bh; }
    by = Math.max(top, by);
    c.setPosition(bx, by);
    c.hit.setSize(bw, bh);
    c.hit.input.hitArea.setTo(0, 0, bw, bh);
    tz.setPosition(bw / 2, 8);
    te.setPosition(bw / 2, 8 + tz.height);
    // body + tail toward the owl (local coordinates)
    const T = r.anchor === 'right' ? { x: side.x - bx - 2, y: side.y - by } : { x: head.x - bx, y: head.y - by - 2 };
    g.clear();
    g.fillStyle(0x000000, 0.22).fillRoundedRect(2, 4, bw, bh, 16);
    g.fillStyle(C.paper, 1).fillRoundedRect(0, 0, bw, bh, 16);
    g.lineStyle(3, 0xb45309, 1).strokeRoundedRect(0, 0, bw, bh, 16);
    let b1, b2;
    if (T.x > bw) { const y = Math.max(14, Math.min(bh - 14, T.y)); b1 = { x: bw - 3, y: y - 8 }; b2 = { x: bw - 3, y: y + 8 }; }
    else if (T.y > bh) { const x = Math.max(18, Math.min(bw - 18, T.x)); b1 = { x: x - 9, y: bh - 3 }; b2 = { x: x + 9, y: bh - 3 }; }
    else return;
    g.fillStyle(C.paper, 1).fillTriangle(b1.x, b1.y, b2.x, b2.y, T.x, T.y);
    g.lineStyle(3, 0xb45309, 1).beginPath().moveTo(b1.x, b1.y).lineTo(T.x, T.y).lineTo(b2.x, b2.y).strokePath();
  }

  owlSay() {
    if (this.dead) return Promise.resolve();
    if (this.owl && this.owl.active) hop(this.owl);
    if (this.bubble && this.bubble.active && !reduced()) {
      this.room.tweens.add({ targets: this.bubble, y: this.bubble.y - 6, duration: 120, yoyo: true });
    }
    return voice.say(this.s.zh);
  }

  /** Hint step 2: the named reference(s) glow; an arrow points to the side the owl named. */
  hint() {
    const { room } = this, st = room.stage, s = this.s, b = this.sprites[s.b], c = this.sprites[s.c];
    st.clearHints();
    st.glow(b, true);
    if (s.rel === 'between') {
      st.glow(c, true);
      if (b && c) { arrowFrom(st, b, dirTo(b, c)); arrowFrom(st, c, dirTo(c, b)); }
    } else {
      arrowFrom(st, b, relDir(this.clue.scene, s.rel));
      if (s.rel === 'front' || s.rel === 'back') flashFeet(room);
    }
  }

  /** Why: the true sentence, with the things glowing and an arrow to where the thing really is. */
  why() {
    const sd = this.clue.scene, s = this.s;
    if (this.clue.answer) return { zh: `貓頭鷹說得對：${s.zh}`, en: `The owl is right. ${s.en}` };
    const opp = OPPOSITE[s.rel];
    if (opp && truthOf(sd, { rel: opp, a: s.a, b: s.b }) === true) {
      const t = sentenceText(sd, { rel: opp, a: s.a, b: s.b });
      return { zh: `貓頭鷹說錯了。${t.zh}`, en: `The owl got it wrong. ${t.en}` };
    }
    return { zh: `貓頭鷹說錯了。${s.zh.replace('在', '不在')}`, en: `The owl got it wrong. ${s.en.replace(' is ', ' is not ')}` };
  }

  async showWhy() {
    const { room } = this, st = room.stage, s = this.s;
    const a = this.sprites[s.a], b = this.sprites[s.b], c = this.sprites[s.c];
    st.clearHints();
    [a, b, c].forEach(o => o && st.glow(o, true));
    if (s.rel === 'between') { if (b && c) { arrowFrom(st, b, dirTo(b, c)); arrowFrom(st, c, dirTo(c, b)); } }
    else if (a && b) arrowFrom(st, b, dirTo(b, a));
    room.ui.mark(this.clue.answer ? 'yes' : 'no', true);
    const t = this.why();
    const sp = room.ui.prompt(t.zh, t.en);
    await Promise.all([sp, wait(room, 2600)]);
  }

  async run() {
    const { room, clue } = this, st = room.stage, ui = room.ui;
    st.drawScene(clue.scene);
    Object.values(this.sprites).forEach(sp => tapZone(st, sp, x => sayName(room, x)));
    this.placeOwl();
    if (clue.level >= 3) { st.glow(this.sprites[this.s.b], true); if (this.s.c) st.glow(this.sprites[this.s.c], true); }
    ui.prompt(clue.ask.zh, clue.ask.en, { speak: false });
    ui.lastSay = `${this.s.zh}。${clue.ask.zh}`;      // 🔈 replays the owl's sentence and the question
    hopQueue(room);
    await wait(room, reduced() ? 100 : 300);
    if (this.dead) return;
    sfx.pop();
    this.makeBubble();
    await this.owlSay();
    if (this.dead) return;
    ui.say(clue.ask.zh);
    for (;;) {
      const id = await ui.choices(BTN);
      if (id == null || this.dead) return;
      const picked = id === 'yes';
      if (checkAnswer(clue, picked)) {
        await ui.mark(id, true);
        if (this.dead) return;
        await room.right();
        return;
      }
      ui.mark(id, false);
      const step = await room.wrong(picked);
      if (this.dead) return;
      ui.lastSay = `${this.s.zh}。${clue.ask.zh}`;
      if (step === 1) { await afterSpeech(room, { max: 3000 }); if (this.dead) return; this.owlSay(); }
      if (step === 2) this.hint();
      if (step >= 3) { await this.showWhy(); return; }
    }
  }

  destroy() {
    this.dead = true;
    this.room.ui.clearChoices();
    if (this.bubble) { this.room.tweens.killTweensOf(this.bubble); this.bubble.destroy(); this.bubble = null; }
  }
}
