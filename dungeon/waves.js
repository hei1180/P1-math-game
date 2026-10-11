// Monster waves engine (spec §5), shared by WavesScene (wave rooms F1R6 / F3R6) and RushScene.
//
//   field = new WaveField(scene, { stage, ui, floor, look, hooks: { onBop(m, pt), onWrong(m, side), onReach(m) } })
//     Draws a corridor in stage.back (backdrop with the floor raised to FLOOR and a dirt cut-through below it),
//     the back-view hero centred at (HERO_X, FLOOR) in stage.front, and big control buttons (CSS px, depth 450):
//     lr: the hero's LEFT hand on the screen's left, RIGHT hand on the right; ud: 上 above the head, 下 at the feet.
//   field.setMode('lr'|'ud'|'mix'|null)   which buttons show
//   field.show(on)                        hero + buttons visible (Rush hides them for the 之間 pick clue)
//   field.runWave(clue, { timed, dur, gap, announce, glow }) -> Promise<{ bops, wrongs, reached }>
//     One monster at a time (clue.monsters[i]); grading via checkAnswer(clue, { i, side }).
//     untimed (wave rooms): the monster walks in slowly and waits; a wrong side → shield bonk 「哎呀！」, it stays.
//     timed (Rush): it keeps coming; reaching the hero → shield bonk, onReach, it leaves.
//     announce: voice 「左面！」 per monster (wave 1 only); glow: the side it comes from glows briefly.
//   field.tap(side)  same as pressing a button      field.current() -> { i, side, state } | null
//   field.stop()     end the running wave now        field.destroy()
// Slimes come along the floor from the sides, bats drop from the ceiling, moles pop up in the dirt below the hero.
import { checkAnswer } from '../dungeon-logic.js?v=202610112341';
import { makeHero, makeBackdrop, makeCreature, artFrame } from './art.js?v=202610112341';
import { UI as C, textStyle } from './theme.js?v=202610112341';
import { sfx } from './sfx.js?v=202610112341';
import { voice } from './voice.js?v=202610112341';
import { fx } from './fx.js?v=202610112341';

export const FLOOR = 68, HERO_X = 96;
const HEAD = FLOOR - 16, DIRT = FLOOR + 10;
export const SIDE_ZH = { left: '左面', right: '右面', up: '上面', down: '下面' };
export const MODE_PROMPT = {
  lr: { zh: '怪物來了！按左手或右手', en: 'Monsters! Tap the left hand or the right hand.' },
  ud: { zh: '怪物來了！按上或下', en: 'Monsters! Tap up or down.' },
  mix: { zh: '怪物來了！按左、右、上或下', en: 'Monsters! Tap left, right, up or down.' },
};
const MODE_SIDES = { lr: ['left', 'right'], ud: ['up', 'down'], mix: ['left', 'right', 'up', 'down'] };
const SLIMES = ['slime.green', 'slime.pink', 'slime.blue', 'slime.yellow'];
const KEYS = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' };
const reduced = () => fx.lessMotion || (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
const dur = ms => (reduced() ? Math.min(ms, 150) : ms);

export class WaveField {
  constructor(scene, { stage, ui, floor = 1, look = null, hooks = {} }) {
    this.scene = scene; this.stage = stage; this.ui = ui; this.hooks = hooks;
    this.mode = null; this.cur = null; this.token = 0; this.clue = null; this.timed = false;
    this.lockUntil = 0; this.visible = true; this.alive = true;
    this.buildCorridor(floor);
    this.buildHero(look);
    this.btnLayer = scene.add.container(0, 0).setDepth(450);
    this.btns = {};
    for (const side of ['left', 'right', 'up', 'down']) this.btns[side] = this.makeButton(side);
    this.setMode(null);
    this.onResize = () => this.layout();
    scene.events.on('stage:resize', this.onResize);
    this.onUpdate = (t, dt) => this.update(dt);
    scene.events.on('update', this.onUpdate);
    this.onKey = e => { const s = KEYS[e.key]; if (s && this.mode && MODE_SIDES[this.mode].includes(s)) this.tap(s); };
    if (scene.input.keyboard) scene.input.keyboard.on('keydown', this.onKey);
    scene.events.once('shutdown', () => this.destroy());
    this.layout();
  }

  // ---------------------------------------------------------------- building
  buildCorridor(floor) {
    const s = this.scene, st = this.stage;
    let bd = null;
    try { bd = makeBackdrop(s, floor); } catch (e) { console.warn('[waves] backdrop', e); }
    if (bd) {
      // raise the floor strip and the door to FLOOR (the door ends the corridor, right behind the hero)
      bd.list.forEach(o => { if (o.type === 'Image' && o.texture && /slab$/.test(o.texture.key)) o.y = FLOOR; });
      if (bd.door) bd.door.setOrigin(0.5, 1).setPosition(HERO_X, FLOOR).clearTint(); // no clue places here
      st.back.add(bd);
    }
    const g = s.add.graphics();
    // dirt cut-through under the floor, with pebbles and the moles' tunnel under the hero
    g.fillStyle(0x5b4030, 1).fillRect(0, DIRT, 192, 108 - DIRT + 24);
    g.fillStyle(0x3b2a20, 1).fillRect(0, DIRT, 192, 1);
    g.fillStyle(0x6e5038, 1);
    [[12, 86], [30, 98], [52, 90], [70, 102], [124, 94], [142, 86], [160, 100], [180, 92], [22, 104], [170, 106]]
      .forEach(([x, y]) => g.fillRect(x, y, 3, 2));
    g.fillStyle(0x7f6a58, 1);
    [[40, 84], [150, 96], [8, 94], [184, 84]].forEach(([x, y]) => g.fillRect(x, y, 2, 2));
    g.fillStyle(0x2e2019, 1).fillEllipse(HERO_X, 100, 26, 18).fillRect(HERO_X - 5, DIRT + 1, 10, 12);
    // ceiling crack above the hero (bats come from here)
    g.fillStyle(0x1c1626, 1).fillEllipse(HERO_X, 2, 22, 6);
    st.back.add(g);
  }

  buildHero(look) {
    const s = this.scene;
    try { this.hero = makeHero(s, look || { hero: null, equipped: {} }, { view: 'back' }); }
    catch (e) {
      console.warn('[waves] hero', e);
      this.hero = s.add.container(0, 0);
      this.hero.add(s.add.rectangle(0, 0, 10, 16, 0x3b82f6).setOrigin(0.5, 1));
    }
    this.hero.setPosition(HERO_X, FLOOR);
    const f = artFrame('shield');
    this.shield = s.add.image(0, 0, f.texture, f.frame).setAlpha(0);
    this.stage.front.add([this.hero, this.shield]);
  }

  /** Geometry in art px for the current PX (buttons keep ≥ 54 CSS px). */
  geom() {
    const PX = this.stage.PX, R = Math.round(Math.max(27, Math.min(46, PX * 9))), r = R / PX;
    const dx = 9 + r, upY = HEAD - 1 - r, downY = FLOOR + 1 + r;
    return {
      R, r,
      btn: { left: { ax: HERO_X - dx, ay: FLOOR - 8 }, right: { ax: HERO_X + dx, ay: FLOOR - 8 }, up: { ax: HERO_X, ay: upY }, down: { ax: HERO_X, ay: downY } },
      wait: {
        left: { ax: HERO_X - dx - r - 8, ay: FLOOR }, right: { ax: HERO_X + dx + r + 8, ay: FLOOR },
        up: { ax: HERO_X, ay: Math.max(15, upY - r - 2) }, down: { ax: HERO_X, ay: Math.min(107, downY + r + 13) },
      },
      spawn: { left: { ax: 4, ay: FLOOR }, right: { ax: 188, ay: FLOOR }, up: { ax: HERO_X, ay: 12 }, down: { ax: HERO_X, ay: 112 } },
      touch: { left: { ax: HERO_X - 15, ay: FLOOR }, right: { ax: HERO_X + 15, ay: FLOOR }, up: { ax: HERO_X, ay: HEAD - 1 }, down: { ax: HERO_X, ay: DIRT + 12 } },
    };
  }

  makeButton(side) {
    const s = this.scene, c = s.add.container(0, 0);
    c.halo = s.add.graphics(); c.face = s.add.graphics(); c.hint = s.add.graphics();
    c.add([c.halo, c.face]);
    if (side === 'left' || side === 'right') {
      const f = artFrame('hand.' + side);
      c.icon = s.add.image(0, 0, f.texture, f.frame);
      c.label = s.add.text(0, 0, side === 'left' ? '左' : '右', textStyle(14, '#7c2d12'));
    } else {
      c.icon = s.add.text(0, 0, side === 'up' ? '上' : '下', textStyle(26, '#7c2d12'));
      c.label = s.add.text(0, 0, side === 'up' ? '▲' : '▼', textStyle(12, '#b45309'));
    }
    c.icon.setOrigin(0.5); c.label.setOrigin(0.5);
    c.add([c.icon, c.label, c.hint]);
    c.side = side;
    c.on('pointerdown', () => {
      s.tweens.killTweensOf(c); c.setScale(0.9);
      s.tweens.add({ targets: c, scale: 1, duration: 120 });
      this.tap(side);
    });
    this.btnLayer.add(c);
    return c;
  }

  layout() {
    if (!this.alive) return;
    const g = this.geom(), R = g.R;
    for (const [side, c] of Object.entries(this.btns)) {
      const p = this.stage.toScreen(g.btn[side].ax, g.btn[side].ay);
      c.setPosition(p.x, p.y);
      c.halo.clear().fillStyle(0xfde047, 0.35).fillCircle(0, 0, R + 6);
      c.face.clear().fillStyle(0x000000, 0.25).fillCircle(0, 3, R)
        .fillStyle(C.paper, 0.78).fillCircle(0, 0, R).lineStyle(3, 0xd97706, 1).strokeCircle(0, 0, R);
      if (side === 'left' || side === 'right') {
        const k = Math.max(2, Math.floor(R * 1.15 / 16));
        c.icon.setScale(k).setPosition(0, -R * 0.2);
        c.label.setFontSize(Math.max(13, Math.round(R * 0.42))).setPosition(0, R * 0.66);
      } else {
        c.icon.setFontSize(Math.round(R * 0.9)).setPosition(0, side === 'up' ? R * 0.12 : -R * 0.12);
        c.label.setFontSize(Math.max(11, Math.round(R * 0.36))).setPosition(0, side === 'up' ? -R * 0.6 : R * 0.62);
      }
      c.setSize(2 * R, 2 * R);
      if (c.input) c.input.hitArea.setTo(R, R, R + 3);
      else c.setInteractive(new Phaser.Geom.Circle(R, R, R + 3), Phaser.Geom.Circle.Contains);
      if (c.input) c.input.cursor = 'pointer';
      if (!c.pulse && !reduced()) c.pulse = this.scene.tweens.add({ targets: c.halo, alpha: { from: 1, to: 0.4 }, duration: 700, yoyo: true, repeat: -1 });
    }
  }

  setMode(mode) {
    this.mode = mode;
    const on = mode ? MODE_SIDES[mode] : [];
    for (const [side, c] of Object.entries(this.btns)) {
      const vis = this.visible && on.includes(side);
      c.setVisible(vis);
      if (c.input) c.input.enabled = vis;
    }
    // 上下 waves only use the middle of the corridor: zoom in there (bigger hero on phones); 左右 needs the sides
    if (mode) {
      const st = this.stage, f = mode === 'ud' ? [60, 132] : null, cur = st.focusRange;
      if (f && !(cur && cur[0] === f[0] && cur[1] === f[1])) st.setFocus(f[0], f[1]);
      else if (!f && cur && !st.current) { st.focusRange = null; st.fit(); }
    }
  }

  show(on) {
    this.visible = on;
    this.hero.setVisible(on);
    this.setMode(this.mode);
  }

  current() { const m = this.cur; return m ? { i: m.i, side: m.side, state: m.state } : null; }

  wait(ms) { return new Promise(res => this.scene.time.delayedCall(ms, res)); }

  // ---------------------------------------------------------------- waves
  async runWave(clue, { timed = false, dur: d = null, gap = 450, announce = false, glow = false } = {}) {
    const token = ++this.token;
    this.clue = clue; this.timed = timed;
    this.setMode(clue.mode);
    const res = { bops: 0, wrongs: 0, reached: 0 };
    this.res = res;
    const shift = Math.floor(Math.random() * 4);
    for (let i = 0; i < clue.monsters.length; i++) {
      if (token !== this.token || !this.alive) break;
      const m = clue.monsters[i];
      const ms = typeof d === 'function' ? d(m.type) : d || { slime: 2600, bat: 1600, mole: 900 }[m.type] || 2000;
      const out = await this.spawn(m, i, { dur: ms, announce, glow, colour: SLIMES[(i + shift) % 4] });
      if (out === 'bop') res.bops++; else if (out === 'reach') res.reached++;
      if (token !== this.token || !this.alive) break;
      await this.wait(gap);
    }
    if (token === this.token) this.cur = null;
    return res;
  }

  spawn(m, i, { dur: ms, announce, glow, colour }) {
    const s = this.scene;
    const key = m.type === 'slime' ? colour : m.type;
    const facing = m.side === 'left' ? 'right' : m.side === 'right' ? 'left' : (i % 2 ? 'left' : 'right');
    let spr;
    try { spr = makeCreature(s, key, facing); } catch (e) { spr = s.add.rectangle(0, 0, 12, 10, 0x22c55e).setOrigin(0.5, 1); }
    this.stage.objs.add(spr);
    const mon = { i, side: m.side, type: m.type, spr, t: 0, dur: ms, state: 'in', off: { x: 0, y: 0 }, wrong: 0, age: 0 };
    mon.ease = this.timed ? (t => t) : m.type === 'slime' ? (t => t) : Phaser.Math.Easing.Sine.Out;
    if (reduced() && !this.timed) mon.t = 1;          // less motion: appear at the waiting spot
    spr.setAlpha(0);
    s.tweens.add({ targets: spr, alpha: 1, duration: dur(220) });
    this.cur = mon;
    this.place(mon);
    if (announce) { voice.say(SIDE_ZH[m.side] + '！'); sfx.boop(); }
    if (glow) this.glowSide(m.side);
    if (m.type === 'mole') { const p = this.screenOf(mon); fx.puff(s, p.x, p.y); }
    return new Promise(res => { mon.done = v => { if (mon.state === 'done') return; mon.state = 'done'; this.clearHint(); res(v); }; });
  }

  posOf(m) {
    const g = this.geom(), a = g.spawn[m.side], b = (this.timed ? g.touch : g.wait)[m.side];
    const e = m.ease(Math.min(1, m.t));
    let bob = 0;
    if (!reduced()) {
      if (m.type === 'slime') bob = -Math.abs(Math.sin(m.age / 160)) * (m.t < 1 || this.timed ? 3 : 1.5);
      else if (m.type === 'bat') bob = Math.sin(m.age / 140) * 1.5;
    }
    return { ax: a.ax + (b.ax - a.ax) * e + m.off.x, ay: a.ay + (b.ay - a.ay) * e + m.off.y + bob };
  }
  place(m) { const p = this.posOf(m); m.spr.setPosition(Math.round(p.ax), Math.round(p.ay)); }
  screenOf(m) { const p = this.posOf(m); return this.stage.toScreen(p.ax, p.ay - 6); }

  update(dt) {
    const m = this.cur;
    if (!m || !m.spr || !m.spr.active || m.state === 'done') return;
    m.age += dt;
    if ((m.state === 'in' || m.state === 'bonk') && m.t < 1) {
      m.t = Math.min(1, m.t + dt / m.dur);
      if (m.t >= 1 && this.timed && m.state === 'in') { this.place(m); this.reach(m); return; }
    }
    if (m.state !== 'pop') this.place(m);
  }

  // ---------------------------------------------------------------- input
  tap(side) {
    if (!this.alive || !this.visible || !this.mode || !MODE_SIDES[this.mode].includes(side)) return;
    const now = this.scene.time.now, m = this.cur;
    if (now < this.lockUntil || !m || m.state !== 'in') return;
    if (checkAnswer(this.clue, { i: m.i, side })) this.bop(m, side);
    else this.miss(m, side);
  }

  bop(m, side) {
    m.state = 'pop';
    this.lockUntil = this.scene.time.now + 220;
    this.swing(side, true);
    this.scene.time.delayedCall(dur(110), () => {
      if (!m.spr.active) { m.done('bop'); return; }
      const pt = this.screenOf(m);
      sfx.pop();
      fx.sparkle(this.scene, pt.x, pt.y);
      this.scene.tweens.add({ targets: m.spr, scale: 1.6, alpha: 0, duration: dur(160), onComplete: () => m.spr.destroy() });
      if (this.hooks.onBop) this.hooks.onBop(m, pt);
      m.done('bop');
    });
  }

  miss(m, side) {
    m.wrong++;
    if (this.res) this.res.wrongs++;
    m.state = 'bonk';
    this.lockUntil = this.scene.time.now + 420;
    this.swing(side, false);
    if (this.hooks.onWrong) this.hooks.onWrong(m, side);
    this.scene.time.delayedCall(dur(140), () => {
      if (m.state !== 'bonk') return;
      this.bonk(m);
      this.scene.time.delayedCall(dur(260), () => {
        if (m.state !== 'bonk') return;
        m.state = 'in';
        if (!this.timed && m.wrong >= 2) this.hintButton(m.side);
        if (this.timed && m.t >= 1) this.reach(m);
      });
    });
  }

  reach(m) {
    m.state = 'leave';
    this.bonk(m);
    if (this.hooks.onReach) this.hooks.onReach(m);
    const s = this.scene, k = { t: m.t };
    s.tweens.add({
      targets: k, t: Math.max(0, m.t - 0.35), delay: dur(200), duration: dur(380),
      onUpdate: () => { m.t = k.t; if (m.spr.active) this.place(m); },
    });
    s.tweens.add({ targets: m.spr, alpha: 0, delay: dur(200), duration: dur(380), onComplete: () => { m.spr.destroy(); m.done('reach'); } });
  }

  // ---------------------------------------------------------------- animation
  swing(side, hit) {
    const s = this.scene, P = this.hero.parts || {};
    const useL = side === 'left' || side === 'down';
    const sw = useL ? P.swordL : P.swordR;
    if (hit) sfx.swing(); else sfx.whoosh();
    if (!sw) return;
    const home = useL ? { x: -6, y: -3, angle: -20 } : { x: 6, y: -3, angle: 20 };
    const pose = { left: { x: -8, y: -6, angle: -100 }, right: { x: 8, y: -6, angle: 100 }, up: { x: 3, y: -15, angle: 0 }, down: { x: -3, y: 1, angle: 180 } }[side];
    s.tweens.killTweensOf(sw);
    sw.setPosition(home.x, home.y).setAngle(home.angle);
    s.tweens.add({ targets: sw, ...pose, duration: dur(90), yoyo: true, hold: reduced() ? 60 : 120, ease: 'Quad.easeOut' });
    if (!reduced()) {
      const lean = { left: { x: HERO_X - 2 }, right: { x: HERO_X + 2 }, up: { y: FLOOR - 2 }, down: { y: FLOOR + 1 } }[side];
      s.tweens.add({ targets: this.hero, ...lean, duration: 90, yoyo: true, hold: 80, onComplete: () => this.hero.setPosition(HERO_X, FLOOR) });
    }
  }

  /** The monster bonks the hero's shield: funny wobble, 「哎呀！」. Nothing is lost. */
  bonk(m) {
    const s = this.scene, sh = this.shield;
    sfx.bonk();
    const at = { left: [HERO_X - 10, FLOOR - 7], right: [HERO_X + 10, FLOOR - 7], up: [HERO_X, HEAD - 5], down: [HERO_X, FLOOR + 3] }[m.side];
    s.tweens.killTweensOf(sh);
    sh.setPosition(at[0], at[1]).setAlpha(1).setAngle(0);
    if (!reduced()) s.tweens.add({ targets: sh, angle: { from: -18, to: 0 }, duration: 380, ease: 'Elastic.easeOut' });
    s.tweens.add({ targets: sh, alpha: 0, delay: dur(420), duration: dur(200) });
    const dir = { left: [5, 0], right: [-5, 0], up: [0, 5], down: [0, -5] }[m.side];
    if (!reduced()) {
      s.tweens.add({ targets: m.off, x: dir[0], y: dir[1], duration: 90, yoyo: true, onComplete: () => { m.off.x = 0; m.off.y = 0; } });
      s.tweens.killTweensOf(this.hero);
      this.hero.setPosition(HERO_X, FLOOR).setAngle(0);
      s.tweens.add({ targets: this.hero, angle: { from: m.side === 'left' ? 12 : -12, to: 0 }, duration: 450, ease: 'Elastic.easeOut' });
    }
    const p = this.stage.toScreen(HERO_X, HEAD - 4);
    fx.floatText(s, p.x, p.y, '哎呀！', '#f97316');
  }

  /** Wave 1 support: the side a monster comes from glows briefly. */
  glowSide(side) {
    const s = this.scene, g = s.add.graphics();
    g.fillStyle(0xfde047, 0.35);
    if (side === 'left') g.fillRect(0, 30, 22, FLOOR - 30);
    else if (side === 'right') g.fillRect(170, 30, 22, FLOOR - 30);
    else if (side === 'up') g.fillEllipse(HERO_X, 8, 40, 16);
    else g.fillEllipse(HERO_X, 100, 40, 18);
    this.stage.hints.add(g);
    s.tweens.add({ targets: g, alpha: 0, delay: reduced() ? 500 : 300, duration: dur(700), onComplete: () => g.destroy() });
  }

  /** After two wrong sides on one monster (wave rooms): the right button gets a gold ring. */
  hintButton(side) {
    this.clearHint();
    const c = this.btns[side], R = this.geom().R;
    c.hint.clear().lineStyle(6, C.gold, 1).strokeCircle(0, 0, R + 4);
    this.hinted = c;
    if (this.hooks.onHint) this.hooks.onHint(side);
    if (!reduced()) c.hintTween = this.scene.tweens.add({ targets: c.hint, alpha: { from: 1, to: 0.3 }, duration: 400, yoyo: true, repeat: -1 });
  }
  clearHint() {
    const c = this.hinted;
    if (!c) return;
    if (c.hintTween) { c.hintTween.stop(); c.hintTween = null; }
    c.hint.clear().setAlpha(1);
    this.hinted = null;
  }

  // ---------------------------------------------------------------- end
  stop() {
    this.token++;
    const m = this.cur;
    this.cur = null;
    if (m) { if (m.spr && m.spr.active) m.spr.destroy(); if (m.done) m.done('stop'); }
    this.clearHint();
  }

  destroy() {
    if (!this.alive) return;
    this.stop();
    this.alive = false;
    const s = this.scene;
    s.events.off('stage:resize', this.onResize);
    s.events.off('update', this.onUpdate);
    if (s.input && s.input.keyboard) s.input.keyboard.off('keydown', this.onKey);
  }
}

