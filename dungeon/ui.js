// Treasure Dungeon UI kit: Phaser-drawn panels and buttons with smooth text, in a top-level container
// (depth 500) that ignores the pixel stage's scale. All sizes are CSS px (hidpi.js zooms cameras by DPR).
//
//   ui = new UI(scene)                    ui.stage = PixelStage (optional: choices sit beside the room when it fits)
//   ui.topH                               CSS px the top bar needs (pass to PixelStage { top: () => ui.topH })
//   ui.prompt(zh, en = '', { speak = true }) -> Promise (speech done)   top bar with 🔈 replay
//   ui.say(zh?)                           speak zh (default: the last prompt)
//   ui.choices([{ id, zh, en?, icon? }]) -> Promise<id|null>   big buttons; calling again with the same ids re-arms them
//   ui.mark(id, good) -> Promise          flash a choice green ✓ / red ✗     ui.clearChoices()
//   ui.button({ id, zh, en?, icon?, x?, y?, w?, h? }) -> Promise<id|null>   one-shot yellow button (default bottom-right);
//                                         removed when tapped; ui.removeButton(id) removes it and resolves null
//   ui.dots(states)                       'good' | 'bad' | 'now' | null per clue, bottom centre
//   ui.coins(n, animate = true)           coin counter top-right (left of the DOM corner buttons)   ui.coinTarget() -> {x, y}
//   ui.toast(zh, en = '', ms = 1500) -> Promise
//   ui.endPanel({ title, stars, newBest, coins, next = true }) -> Promise<'next'|'map'|'retry'>   title: string or {zh, en}
//   ui.card({ zh, en?, icon?, buttons = [{ id:'ok', zh:'繼續', en:'Continue' }] }) -> Promise<id>
//   ui.back(onBack)                       ← button top-left
//   ui.clear()                            remove everything (pending promises resolve null)
//   ui.modalOpen                          true while an end panel / card blocks the room
// Buttons give a tick + press squash on pointerdown and act on pointerup. Every tappable thing is ≥ 48 px.
import { UI as C, textStyle } from './theme.js?v=0';
import { sfx } from './sfx.js?v=0';
import { voice } from './voice.js?v=0';
import { fx } from './fx.js?v=0';

const reduced = () => fx.lessMotion || (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
const dur = ms => (reduced() ? Math.min(ms, 150) : ms);
const RIGHT_DOM = 190;

/** Left edge (CSS px) of the DOM button cluster (test badge, mute, admin) floating over the top-right. */
export function domLeft(scene) {
  const W = scene.scale.width;
  try {
    const el = document.getElementById('muteBtn'), cv = scene.game.canvas;
    if (el && el.parentElement && cv) {
      const r = el.parentElement.getBoundingClientRect(), c = cv.getBoundingClientRect();
      if (r.width > 0 && c.width > 0) return (r.left - c.left) * (W / c.width) - 8;
    }
  } catch (e) { /* fall through */ }
  return W - RIGHT_DOM;
}

export function starPts(r, cx = 0, cy = 0, inner = 0.5) {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const rr = i % 2 ? r * inner : r, a = -Math.PI / 2 + (i * Math.PI) / 5;
    pts.push(new Phaser.Geom.Point(cx + rr * Math.cos(a), cy + rr * Math.sin(a)));
  }
  return pts;
}

/** Rounded pill button: (icon +) big Chinese, small English. c.paint(fill, rim) recolours it. */
export function pill(scene, { zh, en = '', icon = '', w = 150, h = 64, fill = 0xffffff, ink = '#1f2937', rim = C.gold, size = 24 }, onTap) {
  const c = scene.add.container(0, 0);
  const g = scene.add.graphics();
  const draw = (f, r) => {
    g.clear();
    g.fillStyle(0x000000, 0.22).fillRoundedRect(-w / 2 + 2, -h / 2 + 5, w, h, 20);
    g.fillStyle(f, 1).fillRoundedRect(-w / 2, -h / 2, w, h, 20);
    g.lineStyle(4, r, 1).strokeRoundedRect(-w / 2, -h / 2, w, h, 20);
  };
  draw(fill, rim);
  const a = scene.add.text(0, en ? -9 : 0, (icon ? icon + ' ' : '') + zh, textStyle(size, ink)).setOrigin(0.5);
  c.add([g, a]);
  let b = null;
  if (en) { b = scene.add.text(0, h / 2 - 16, en, textStyle(13, ink, { fontStyle: 'normal' })).setOrigin(0.5).setAlpha(0.8); c.add(b); }
  [a, b].forEach(o => { if (o && o.width > w - 14) o.setScale((w - 14) / o.width); });
  c.setSize(w, h).setInteractive({ useHandCursor: true });
  let down = false;
  c.baseScale = 1; // layouts that shrink a button set this too
  c.on('pointerdown', () => { down = true; sfx.tick(5); scene.tweens.add({ targets: c, scale: c.baseScale * 0.92, duration: 60 }); });
  c.on('pointerout', () => { down = false; scene.tweens.killTweensOf(c); c.setScale(c.baseScale); });
  c.on('pointerup', () => { scene.tweens.killTweensOf(c); c.setScale(c.baseScale); if (!down) return; down = false; if (onTap) onTap(); });
  c.paint = (f, r = rim) => draw(f, r);
  c.w = w; c.h = h;
  return c;
}

export class UI {
  constructor(scene) {
    this.scene = scene;
    this.root = scene.add.container(0, 0).setDepth(500);
    this.stage = null;
    this.lastSay = '';
    this.coinN = null;
    this.parts = {}; this.lay = {};
    this.btns = {};
    this.pending = new Set();
    this.choiceBtns = null; this.choiceIds = ''; this.choiceRes = null;
    this.modalOpen = false;
    const onResize = () => this.layout();
    scene.scale.on('resize', onResize);
    scene.events.once('shutdown', () => { scene.scale.off('resize', onResize); voice.stop(); this.pending.clear(); });
  }
  get W() { return this.scene.scale.width; }
  get H() { return this.scene.scale.height; }
  get topH() { return this._oneRow() ? 72 : 136; }
  _oneRow() { return domLeft(this.scene) - 104 - 74 >= 320; }
  _barRect() {
    if (this._oneRow()) {
      const x0 = 74, x1 = domLeft(this.scene) - 104, w = Math.min(820, x1 - x0);
      return { x: x0 + (x1 - x0 - w) / 2, y: 6, w, h: 60 };
    }
    // narrow: the bar gets its own row; the coin counter sits at its left when the DOM buttons leave no room in row 1
    const x0 = this._coinsInRow1() ? 8 : 112, w = Math.min(820, this.W - 8 - x0);
    return { x: x0 + (this.W - 8 - x0 - w) / 2, y: 70, w, h: 60 };
  }
  _coinsInRow1() { return domLeft(this.scene) - 96 >= 70; }
  _coinsPos() {
    if (this._oneRow() || this._coinsInRow1()) return { x: domLeft(this.scene) - 50, y: 34 };
    return { x: 56, y: 100 };
  }

  /** Replace part `name` with container `c`, positioned by `relayout` now and on every resize. */
  _set(name, c, relayout) {
    this._drop(name);
    this.parts[name] = c;
    this.root.add(c);
    if (relayout) { this.lay[name] = relayout; relayout(); }
    return c;
  }
  _drop(name) {
    if (this.parts[name]) { this.scene.tweens.killTweensOf(this.parts[name]); this.parts[name].destroy(); }
    delete this.parts[name]; delete this.lay[name];
  }
  _promise(fn) {
    return new Promise(res => {
      const r = v => { if (!this.pending.has(r)) return; this.pending.delete(r); res(v); };
      this.pending.add(r);
      fn(r);
    });
  }
  layout() { Object.values(this.lay).forEach(f => f()); }

  say(zh = this.lastSay) {
    try { return Promise.resolve(voice.say(zh)).catch(() => {}); } catch (e) { return Promise.resolve(); }
  }

  prompt(zh, en = '', { speak = true } = {}) {
    const s = this.scene;
    this.lastSay = zh;
    const c = s.add.container(0, 0);
    const g = s.add.graphics();
    const spk = s.add.container(0, 0);
    const sg = s.add.graphics();
    sg.fillStyle(0xfde68a, 1).fillCircle(0, 0, 22).lineStyle(3, 0xd97706, 1).strokeCircle(0, 0, 22);
    spk.add([sg, s.add.text(0, 1, '🔈', { fontSize: '22px', padding: { x: 2, y: 4 } }).setOrigin(0.5)]);
    spk.setSize(52, 52).setInteractive({ useHandCursor: true });
    spk.on('pointerdown', () => { sfx.tick(3); s.tweens.add({ targets: spk, scale: 0.88, duration: 60 }); });
    spk.on('pointerout', () => { s.tweens.killTweensOf(spk); spk.setScale(1); });
    spk.on('pointerup', () => { s.tweens.killTweensOf(spk); spk.setScale(1); this.say(); });
    const tz = s.add.text(0, 0, zh, textStyle(26, '#1f2937')).setOrigin(0.5);
    const te = s.add.text(0, 0, en, textStyle(14, '#57534e', { fontStyle: 'normal' })).setOrigin(0.5);
    c.add([g, spk, tz, te]);
    const relayout = () => {
      const r = this._barRect(), left = 62, avail = r.w - left - 12;
      tz.setStyle({ wordWrap: null }).setFontSize(26).setScale(1);
      if (tz.width > avail) tz.setFontSize(Math.max(20, Math.floor(26 * avail / tz.width)));
      if (tz.width > avail) tz.setWordWrapWidth(avail, true);
      te.setScale(1); if (te.width > avail) te.setScale(avail / te.width);
      const h = Math.max(r.h, tz.height + (en ? te.height : 0) + 4);
      c.setPosition(r.x, r.y);
      g.clear();
      g.fillStyle(0x000000, 0.22).fillRoundedRect(2, 4, r.w, h, 18);
      g.fillStyle(C.paper, 1).fillRoundedRect(0, 0, r.w, h, 18);
      g.lineStyle(3, C.gold, 1).strokeRoundedRect(0, 0, r.w, h, 18);
      spk.setPosition(32, h / 2);
      const cx = left + avail / 2;
      if (en) { tz.setPosition(cx, (h - te.height) / 2 + 1); te.setPosition(cx, h - te.height / 2 - 2); }
      else tz.setPosition(cx, h / 2);
    };
    this._set('prompt', c, relayout);
    c.setAlpha(0);
    s.tweens.add({ targets: c, alpha: 1, duration: dur(200) });
    return speak ? this.say(zh) : Promise.resolve();
  }

  back(onBack) {
    const s = this.scene, c = s.add.container(0, 0), g = s.add.graphics(), r = 26;
    g.fillStyle(0x000000, 0.2).fillCircle(0, 3, r);
    g.fillStyle(0xffffff, 0.95).fillCircle(0, 0, r);
    g.lineStyle(3, 0xfde68a, 1).strokeCircle(0, 0, r);
    g.lineStyle(5, C.ink, 1).beginPath().moveTo(9, 0).lineTo(-9, 0).strokePath();
    g.beginPath().moveTo(-1, -8).lineTo(-9, 0).lineTo(-1, 8).strokePath();
    c.add(g);
    c.setSize(2 * r + 6, 2 * r + 6).setInteractive({ useHandCursor: true });
    c.on('pointerdown', () => { sfx.tick(2); s.tweens.add({ targets: c, scale: 0.86, duration: 60 }); });
    c.on('pointerout', () => { s.tweens.killTweensOf(c); c.setScale(1); });
    c.on('pointerup', () => { s.tweens.killTweensOf(c); c.setScale(1); if (!this.modalOpen) onBack(); });
    return this._set('back', c, () => c.setPosition(36, 36));
  }

  coins(n, animate = true) {
    const s = this.scene;
    if (!this.parts.coins) {
      const c = s.add.container(0, 0), g = s.add.graphics();
      g.fillStyle(0x1c1917, 0.7).fillRoundedRect(-46, -22, 92, 44, 22);
      g.fillStyle(0xb45309, 1).fillCircle(-24, 0, 14);
      g.fillStyle(0xfacc15, 1).fillCircle(-24, -1, 12);
      g.lineStyle(2, 0xfef08a, 1).strokeCircle(-24, -1, 7);
      const t = s.add.text(10, 0, '0', textStyle(24, '#fef08a')).setOrigin(0.5);
      c.add([g, t]);
      c.t = t;
      this._set('coins', c, () => { const p = this._coinsPos(); c.setPosition(p.x, p.y); });
    }
    const c = this.parts.coins, from = this.coinN ?? n;
    this.coinN = n;
    s.tweens.killTweensOf(c);
    if (!animate || from === n || reduced()) { c.t.setText(String(n)); c.setScale(1); return; }
    const k = { v: from };
    s.tweens.add({ targets: k, v: n, duration: 400, onUpdate: () => c.t.setText(String(Math.round(k.v))), onComplete: () => c.t.setText(String(n)) });
    s.tweens.add({ targets: c, scale: { from: 1.25, to: 1 }, duration: 260, ease: 'Back.easeOut' });
  }
  coinTarget() { const c = this.parts.coins; return c ? { x: c.x - 24, y: c.y } : { x: this.W - 60, y: 34 }; }

  dots(states) {
    const s = this.scene, c = s.add.container(0, 0), g = s.add.graphics();
    const n = states.length, gap = 26;
    states.forEach((st, i) => {
      const x = (i - (n - 1) / 2) * gap;
      if (st === 'now') { g.fillStyle(0xffffff, 1).fillCircle(x, 0, 10); g.lineStyle(3, C.gold, 1).strokeCircle(x, 0, 10); }
      else if (st === 'good') { g.fillStyle(C.good, 1).fillCircle(x, 0, 8); g.lineStyle(2, 0xffffff, 0.8).strokeCircle(x, 0, 8); }
      else if (st === 'bad') { g.fillStyle(0xf59e0b, 1).fillCircle(x, 0, 8); g.lineStyle(2, 0xffffff, 0.8).strokeCircle(x, 0, 8); }
      else { g.fillStyle(0x000000, 0.35).fillCircle(x, 0, 8); g.lineStyle(2, 0xd6d3d1, 0.9).strokeCircle(x, 0, 8); }
    });
    c.add(g);
    this._set('dots', c, () => c.setPosition(this.W / 2, this.H - 16));
  }

  choices(list) {
    const s = this.scene, ids = list.map(o => o.id).join('|');
    if (!this.parts.choices || this.choiceIds !== ids) {
      const c = s.add.container(0, 0);
      this.choiceBtns = {};
      this.choiceIds = ids;
      list.forEach(o => {
        const b = pill(s, { zh: o.zh, en: o.en || '', icon: o.icon || '', w: 150, h: 80, size: 32 }, () => { if (this.choiceRes) this.choiceRes(o.id); });
        b.choiceId = o.id;
        this.choiceBtns[o.id] = b;
        c.add(b);
      });
      const btns = Object.values(this.choiceBtns);
      this._set('choices', c, () => {
        const st = this.stage, n = btns.length, side = st ? st.ox : 0;
        if (st && side >= 176 && n <= 3) {
          const x = this.W - side / 2, gap = 96;
          btns.forEach((b, i) => b.setPosition(x, st.oy + st.h * st.PX / 2 + (i - (n - 1) / 2) * gap).setScale(1));
          btns.forEach(b => { b.baseScale = 1; });
        } else {
          const gap = Math.min(170, (this.W - 16) / n), k = Math.min(1, (gap - 12) / 150);
          btns.forEach((b, i) => { b.baseScale = k; b.setPosition(this.W / 2 + (i - (n - 1) / 2) * gap, this.H - 36 - 40 * k - 4).setScale(k); });
        }
      });
      c.setAlpha(0);
      s.tweens.add({ targets: c, alpha: 1, duration: dur(180) });
    } else Object.values(this.choiceBtns).forEach(b => b.paint(0xffffff));
    if (this.choiceRes) this.choiceRes(null);
    return this._promise(r => { this.choiceRes = v => { this.choiceRes = null; r(v); }; });
  }

  mark(id, good) {
    const b = this.choiceBtns && this.choiceBtns[id];
    if (!b) return Promise.resolve();
    b.paint(good ? 0xbbf7d0 : 0xfecaca, good ? C.good : C.bad);
    const t = this.scene.add.text(b.w / 2 - 16, -b.h / 2 + 12, good ? '✓' : '✗', textStyle(26, good ? '#15803d' : '#b91c1c')).setOrigin(0.5);
    b.add(t);
    if (!good && !reduced()) this.scene.tweens.add({ targets: b, x: b.x + 6, duration: 50, yoyo: true, repeat: 3 });
    return new Promise(res => this.scene.time.delayedCall(dur(550), () => { if (t.active) t.destroy(); if (b.active && !good) b.paint(0xffffff); res(); }));
  }

  clearChoices() {
    if (this.choiceRes) this.choiceRes(null);
    this._drop('choices');
    this.choiceBtns = null; this.choiceIds = '';
  }

  button({ id, zh, en = '', icon = '', x = null, y = null, w = 190, h = 76 }) {
    this.removeButton(id);
    const s = this.scene;
    return this._promise(r => {
      const b = pill(s, { zh, en, icon, w, h, fill: 0xfde047, rim: 0xb45309, size: 28 }, () => {
        if (this.modalOpen) return;
        delete this.btns[id];
        this._drop('btn:' + id);
        r(id);
      });
      this.btns[id] = { r };
      this._set('btn:' + id, b, () => b.setPosition(x ?? this.W - w / 2 - 16, y ?? this.H - 40 - h / 2));
      if (!reduced()) s.tweens.add({ targets: b, scale: { from: 0.6, to: 1 }, duration: 220, ease: 'Back.easeOut' });
    });
  }
  removeButton(id) {
    const e = this.btns[id];
    if (!e) return;
    delete this.btns[id];
    this._drop('btn:' + id);
    e.r(null);
  }

  toast(zh, en = '', ms = 1500) {
    const s = this.scene, c = s.add.container(0, 0), g = s.add.graphics();
    const a = s.add.text(0, en ? -10 : 0, zh, textStyle(26, '#ffffff')).setOrigin(0.5);
    const b = en ? s.add.text(0, 16, en, textStyle(14, '#e7e5e4', { fontStyle: 'normal' })).setOrigin(0.5) : null;
    const w = Math.max(a.width, b ? b.width : 0) + 40, h = en ? 70 : 52;
    g.fillStyle(0x1c1917, 0.82).fillRoundedRect(-w / 2, -h / 2, w, h, 22);
    c.add([g, a, ...(b ? [b] : [])]);
    this._set('toast', c, () => { c.setPosition(this.W / 2, this.H * 0.32); c.setScale(Math.min(1, (this.W - 16) / w)); });
    c.setAlpha(0);
    s.tweens.add({ targets: c, alpha: 1, duration: dur(160) });
    return new Promise(res => s.time.delayedCall(ms, () => {
      if (this.parts.toast !== c) { res(); return; }
      s.tweens.add({ targets: c, alpha: 0, duration: dur(200), onComplete: () => { if (this.parts.toast === c) this._drop('toast'); res(); } });
    }));
  }

  /** Dim blocker + centred panel container (w × h, scaled down to fit). */
  _modal(w, h) {
    const s = this.scene, c = s.add.container(0, 0);
    const blocker = s.add.rectangle(0, 0, 10, 10, 0x000000, 0.5).setOrigin(0).setInteractive();
    const panel = s.add.container(0, 0);
    const g = s.add.graphics();
    g.fillStyle(0x000000, 0.25).fillRoundedRect(-w / 2 + 3, -h / 2 + 6, w, h, 26);
    g.fillStyle(C.paper, 1).fillRoundedRect(-w / 2, -h / 2, w, h, 26);
    g.lineStyle(5, 0xb45309, 1).strokeRoundedRect(-w / 2, -h / 2, w, h, 26);
    panel.add(g);
    c.add([blocker, panel]);
    this._set('modal', c, () => {
      blocker.setSize(this.W, this.H);
      panel.setPosition(this.W / 2, this.H / 2).setScale(Math.min(1, (this.W - 24) / w, (this.H - 24) / h));
    });
    this.modalOpen = true;
    if (!reduced()) s.tweens.add({ targets: panel, scale: { from: panel.scale * 0.85, to: panel.scale }, duration: 260, ease: 'Back.easeOut' });
    return panel;
  }
  _closeModal() { this._drop('modal'); this.modalOpen = false; }

  endPanel({ title, stars = 0, newBest = false, coins = 0, next = true } = {}) {
    const s = this.scene, w = 380, h = 340;
    const panel = this._modal(w, h);
    const t = typeof title === 'string' ? { zh: title, en: '' } : (title || { zh: '完成！', en: 'Done!' });
    const tz = s.add.text(0, -h / 2 + 38, t.zh, textStyle(32, '#7c2d12')).setOrigin(0.5);
    panel.add(tz);
    if (tz.width > w - 30) tz.setScale((w - 30) / tz.width);
    if (t.en) panel.add(s.add.text(0, -h / 2 + 70, t.en, textStyle(15, '#92400e', { fontStyle: 'normal' })).setOrigin(0.5));
    const slots = [-90, 0, 90].map((x, i) => ({ x, y: -26 - (i === 1 ? 10 : 0), r: i === 1 ? 38 : 32 }));
    const sg = s.add.graphics();
    slots.forEach(sl => { sg.fillStyle(0xe7e5e4, 1).fillPoints(starPts(sl.r, sl.x, sl.y), true); sg.lineStyle(4, 0xd6d3d1, 1).strokePoints(starPts(sl.r, sl.x, sl.y), true, true); });
    panel.add(sg);
    for (let i = 0; i < Math.min(3, stars); i++) {
      const sl = slots[i], st = s.add.graphics();
      st.fillStyle(C.gold, 1).fillPoints(starPts(sl.r), true);
      st.lineStyle(4, 0xd97706, 1).strokePoints(starPts(sl.r), true, true);
      st.setPosition(sl.x, sl.y).setScale(0);
      panel.add(st);
      s.tweens.add({ targets: st, scale: 1, duration: dur(320), delay: reduced() ? 0 : 250 + i * 320, ease: 'Back.easeOut', onStart: () => sfx.star(i) });
    }
    if (newBest) {
      const nb = s.add.container(w / 2 - 70, -h / 2 + 16).setAngle(10), ng = s.add.graphics();
      ng.fillStyle(C.bad, 1).fillRoundedRect(-58, -16, 116, 32, 14);
      nb.add([ng, s.add.text(0, 0, '新紀錄！New best', textStyle(14, '#ffffff')).setOrigin(0.5)]);
      panel.add(nb);
    }
    if (coins > 0) {
      const cg = s.add.graphics();
      cg.fillStyle(0xb45309, 1).fillCircle(-34, 46, 14).fillStyle(0xfacc15, 1).fillCircle(-34, 45, 12);
      panel.add([cg, s.add.text(-14, 46, `+${coins}`, textStyle(28, '#a16207')).setOrigin(0, 0.5)]);
    }
    return this._promise(r => {
      const opts = [{ id: 'retry', zh: '再玩', en: 'Again' }, { id: 'map', zh: '地圖', en: 'Map' }];
      if (next) opts.push({ id: 'next', zh: '下一關', en: 'Next' });
      const bw = 104, gap = 116;
      opts.forEach((o, i) => {
        const b = pill(s, { zh: o.zh, en: o.en, w: bw, h: 66, size: 22, fill: o.id === 'next' ? 0xfde047 : 0xffffff, rim: 0xb45309 }, () => { this._closeModal(); r(o.id); });
        b.setPosition((i - (opts.length - 1) / 2) * gap, h / 2 - 50);
        panel.add(b);
      });
    });
  }

  card({ zh, en = '', icon = '', buttons = [{ id: 'ok', zh: '繼續', en: 'Continue' }] } = {}) {
    const s = this.scene, w = 380, h = 250;
    const panel = this._modal(w, h);
    if (icon) panel.add(s.add.text(0, -h / 2 + 40, icon, { fontSize: '40px', padding: { x: 2, y: 6 } }).setOrigin(0.5));
    const tz = s.add.text(0, icon ? -20 : -40, zh, textStyle(32, '#7c2d12', { align: 'center', wordWrap: { width: w - 40, useAdvancedWrap: true } })).setOrigin(0.5);
    panel.add(tz);
    if (en) panel.add(s.add.text(0, tz.y + tz.height / 2 + 14, en, textStyle(15, '#92400e', { fontStyle: 'normal' })).setOrigin(0.5));
    return this._promise(r => {
      const gap = 170;
      buttons.forEach((o, i) => {
        const b = pill(s, { zh: o.zh, en: o.en || '', w: 150, h: 66, size: 24, fill: 0xfde047, rim: 0xb45309 }, () => { this._closeModal(); r(o.id); });
        b.setPosition((i - (buttons.length - 1) / 2) * gap, h / 2 - 50);
        panel.add(b);
      });
    });
  }

  clear() {
    [...this.pending].forEach(r => r(null));
    this.root.each(o => this.scene.tweens.killTweensOf(o));
    this.root.removeAll(true);
    this.parts = {}; this.lay = {}; this.btns = {};
    this.choiceBtns = null; this.choiceIds = ''; this.choiceRes = null;
    this.modalOpen = false;
  }
}
