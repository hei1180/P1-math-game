// 展覽廳 Gallery: every classmate's hero on a podium, with the name they show on the leaderboard.
// Own entry first, marked 「我」; the teacher also gets 🙈 Hide / 👁 Show. Swipe (or ◀ ▶) to look along the row.
// No likes, no counts, no free text: the only text from other players is the name they already show on the board.
import { validateGalleryEntry, heroName } from '../../dungeon-logic.js?v=202610112341';
import { UI, pill } from '../ui.js?v=202610112341';
import { fx } from '../fx.js?v=202610112341';
import { sfx } from '../sfx.js?v=202610112341';
import { voice } from '../voice.js?v=202610112341';
import { textStyle } from '../theme.js?v=202610112341';
import { makeHero } from '../art.js?v=202610112341';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export class GalleryScene extends Phaser.Scene {
  constructor() { super('Gallery'); }
  init(data) {
    this.startData = data || {};
    this.sys.settings.data = {}; // Phaser would hand this data to a later start that passes none
  }

  create() {
    this.bridge = this.registry.get('bridge');
    this.ui = new UI(this);
    this.leaving = false; this.busy = false;
    this.scroll = 0; this.maxScroll = 0; this.drag = null;
    this.ui.back(() => this.leave());
    this.ui.prompt('展覽廳', "Gallery — everyone's hero", { speak: false });
    fx.irisIn(this);
    this.begin();
    let t = null;
    const onResize = () => { if (t) t.remove(); t = this.time.delayedCall(120, () => this.rebuild()); };
    this.scale.on('resize', onResize);
    this.events.once('shutdown', () => { this.scale.off('resize', onResize); voice.stop(); });
    this.bindInput();
  }

  async begin() {
    const g = this.bridge.gallery;
    if (!g.enabled) { await this.card('🔒', '展覽廳暫時關閉', 'The gallery is closed for now'); return this.leave(); }
    let list;
    try { list = await g.load(); if (!Array.isArray(list)) throw new Error('gallery.load failed'); }
    catch (e) { console.warn('[gallery]', e); await this.card('📡', '暫時未能載入', "Can't load right now"); return this.leave(); }
    this.entries = this.prepare(list);
    if (!this.entries.length) { await this.card('🖼️', '還未有作品', 'No heroes here yet'); return this.leave(); }
    this.build();
  }

  async card(icon, zh, en) {
    this.ui.hidePrompt();
    await this.ui.card({ icon, zh, en, buttons: [{ id: 'back', zh: '返回', en: 'Back' }] });
  }

  /** Keep entries the same check the database applies; mine first; students never see hidden ones. */
  prepare(list) {
    const me = this.bridge.player && this.bridge.player.uid;
    const teacher = !!this.bridge.gallery.isTeacher;
    const out = [];
    for (const raw of list) {
      if (!raw || typeof raw !== 'object') continue;
      const { uid, ...rest } = raw;
      const hidden = rest.hidden === true;
      if (!validateGalleryEntry({ playerName: rest.playerName, hero: rest.hero, equipped: rest.equipped, hidden })) continue;
      if (hidden && !teacher) continue;
      out.push({ uid: uid || null, playerName: rest.playerName || '', hero: rest.hero, equipped: rest.equipped || {}, hidden, own: !!me && uid === me });
    }
    return out.sort((a, b) => (b.own ? 1 : 0) - (a.own ? 1 : 0));
  }

  // ---------------------------------------------------------------- build
  rebuild() { if (this.leaving) return; if (this.row) this.row.destroy(true); if (this.maskG) this.maskG.destroy(); if (this.fixed) this.fixed.destroy(); this.build(); }

  build() {
    const W = this.scale.width, H = this.scale.height;
    const top = this.ui.topH + 8, bottom = 18;
    const view = this.view = { x0: 8, x1: W - 8, y0: top + 34, y1: H - bottom };
    const per = clamp(Math.round(W / 190), 2, 5);
    const cw = this.cw = (view.x1 - view.x0) / per;
    const gap = Math.min(16, cw * 0.1);
    this.step = cw + gap;
    let scale = Math.max(2, Math.floor(cw / 36));
    const maxHeroH = (view.y1 - view.y0) * 0.62;
    while (16 * scale > maxHeroH && scale > 2) scale--;
    this.heroScale = scale;
    this.ph = Math.max(14, Math.round(cw * 0.14));
    this.podY = view.y0 + 16 * scale + this.ph / 2 + 6;
    this.maxScroll = Math.max(0, this.entries.length * this.step - gap - (view.x1 - view.x0));
    this.scroll = clamp(this.scroll, 0, this.maxScroll);

    this.row = this.add.container(0, 0);
    this.entries.forEach(e => this.row.add(this.cell(e)));

    const mk = this.make.graphics({ add: false });
    mk.fillStyle(0xffffff).fillRect(view.x0, view.y0 - 40, view.x1 - view.x0, view.y1 - view.y0 + 44);
    this.maskG = mk;
    this.row.setMask(mk.createGeometryMask());

    this.fixed = this.add.container(0, 0);
    this.arrows = [-1, 1].map(dir => {
      const b = pill(this, { zh: dir < 0 ? '◀' : '▶', w: 56, h: 72, size: 26, fill: 0xffffff, rim: 0xb45309 }, () => this.page(dir));
      b.setPosition(dir < 0 ? 34 : W - 34, view.y0 + (view.y1 - view.y0) * 0.45);
      this.fixed.add(b);
      return b;
    });
    this.layout();
  }

  /** One podium: the hero, a name sign and (teacher only) a hide toggle. */
  cell(e) {
    const c = this.add.container(0, 0);
    const cw = this.cw, ph = this.ph, pw = cw * 0.66;
    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.25).fillRoundedRect(-pw / 2 + 2, -ph / 2 + 4, pw, ph, 7);
    g.fillStyle(0x3a2c48, 1).fillRoundedRect(-pw / 2, -ph / 2, pw, ph, 7);
    g.lineStyle(3, e.own ? 0xfacc15 : 0x6b5f78, 1).strokeRoundedRect(-pw / 2, -ph / 2, pw, ph, 7);
    c.add(g);

    const grey = e.hidden && !!this.bridge.gallery.isTeacher;
    let h;
    try { h = makeHero(this, { hero: { ...(e.hero || {}) }, equipped: e.equipped || {} }, { view: 'front' }); }
    catch (err) { console.warn('[gallery] hero', err); h = this.add.rectangle(0, 0, 10, 16, 0x3b82f6).setOrigin(0.5, 1); }
    h.setScale(this.heroScale);
    h.setPosition(0, -ph / 2);
    if (grey) h.setAlpha(0.35);
    c.add(h);

    const sw = cw - 10, sh = 42;
    const sign = this.add.container(0, ph / 2 + 8 + sh / 2);
    const sg = this.add.graphics();
    sg.fillStyle(grey ? 0xd1d5db : 0xfffbeb, 1).fillRoundedRect(-sw / 2, -sh / 2, sw, sh, 9);
    sg.lineStyle(3, grey ? 0x9ca3af : e.own ? 0xf59e0b : 0x6ee7b7, 1).strokeRoundedRect(-sw / 2, -sh / 2, sw, sh, 9);
    sign.add(sg);
    const nm = this.add.text(0, -6, (e.own ? '我 ' : '') + (e.playerName || '？'), textStyle(16, grey ? '#6b7280' : '#1f2937')).setOrigin(0.5);
    if (nm.width > sw - 8) nm.setScale((sw - 8) / nm.width);
    const sub = this.add.text(0, 12, heroName(e.hero) || '', textStyle(11, '#6b7280', { fontStyle: 'normal' })).setOrigin(0.5);
    if (sub.width > sw - 8) sub.setScale((sw - 8) / sub.width);
    sign.add([nm, sub]);
    c.add(sign);

    if (this.bridge.gallery.isTeacher && e.uid) {
      const b = pill(this, { zh: e.hidden ? '顯示' : '隱藏', en: e.hidden ? 'Show' : 'Hide', w: Math.min(104, sw), h: 44, size: 15 }, () => this.toggleHidden(c));
      b.setPosition(0, ph / 2 + 8 + sh + 26);
      c.add(b);
      c.btn = b;
    }
    c.entry = e;
    return c;
  }

  layout() {
    if (!this.row) return;
    const base = this.view.x0 + this.cw / 2;
    this.row.list.forEach((c, i) => c.setPosition(base + i * this.step - this.scroll, this.podY));
    const max = this.maxScroll;
    if (this.arrows) {
      this.arrows[0].setVisible(max > 0 && this.scroll > 0.5);
      this.arrows[1].setVisible(max > 0 && this.scroll < max - 0.5);
    }
  }

  async toggleHidden(cell) {
    const e = cell.entry;
    if (!e || !e.uid || this.busy || this.leaving) return;
    this.busy = true;
    try {
      const ok = await this.bridge.gallery.setHidden(e.uid, !e.hidden);
      if (!ok) { sfx.boop(); this.ui.toast('未能更改', 'Not changed', 1400); return; }
      e.hidden = !e.hidden;
      sfx.pop();
      this.rebuild();
    } catch (err) { console.warn('[gallery] hide', err); sfx.boop(); this.ui.toast('未能更改', 'Not changed', 1400); }
    finally { this.busy = false; }
  }

  page(dir) {
    if (this.leaving) return;
    sfx.tick(dir > 0 ? 3 : 1);
    this.scroll = clamp(this.scroll + dir * (this.cw + this.step * 0.5), 0, this.maxScroll);
    this.layout();
  }

  bindInput() {
    this.input.on('pointerdown', p => { this.drag = { x: p.worldX, s: this.scroll }; this.dragMoved = false; });
    this.input.on('pointermove', p => {
      if (!this.drag || !p.isDown || !this.maxScroll) return;
      const dx = p.worldX - this.drag.x;
      if (Math.abs(dx) > 10) this.dragMoved = true;
      if (this.dragMoved) { this.scroll = clamp(this.drag.s - dx, 0, this.maxScroll); this.layout(); }
    });
    this.input.on('pointerup', () => { this.drag = null; });
    this.input.on('wheel', (p, o, dx, dy) => { if (!this.dragMoved) { this.scroll = clamp(this.scroll + dx + dy, 0, this.maxScroll); this.layout(); } });
  }

  leave() {
    if (this.leaving) return;
    this.leaving = true;
    sfx.door();
    fx.iris(this, 'Map', {});
  }
}
