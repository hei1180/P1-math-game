// 裝備室 Shop: a mirror with the hero; tabs 裝扮 Looks (a sectioned catalogue: 膚色 / 髮色 / 服裝 / 衣服顏色 /
// 武器) · 頭盔 Helmets · 寵物 Pets · 換造型 My hero (opens MakeHero). Every card shows a little hero wearing /
// holding the item (or a silhouette + how to get it for chest / boss pieces). A header control switches every
// card between 我的英雄 (your own hero) and 示範英雄 (a plain example hero) for easy comparing. Tapping an item
// tries it on for free; the button under the mirror is 買 (price) → buy and wear, owned → 穿上 / 除下.
import { SHOP, COSMETICS, OUTFITS, WEAPONS, buy, equip } from '../../dungeon-logic.js?v=202610112341';
import { UI, pill } from '../ui.js?v=202610112341';
import { fx } from '../fx.js?v=202610112341';
import { sfx } from '../sfx.js?v=202610112341';
import { voice } from '../voice.js?v=202610112341';
import { textStyle } from '../theme.js?v=202610112341';
import { makeHero, artFrame, heroPreview } from '../art.js?v=202610112341';
import { drawMirror } from './MakeHeroScene.js?v=202610112341';

const reduced = () => fx.lessMotion || (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const itemById = id => SHOP.find(s => s.id === id) || COSMETICS.find(c => c.id === id)
  || OUTFITS.find(o => o.id === id) || WEAPONS.find(w => w.id === id);
const TABS = [
  { id: 'dress', zh: '裝扮', en: 'Looks' },
  { id: 'helmet', zh: '頭盔', en: 'Helmets' },
  { id: 'pet', zh: '寵物', en: 'Pets' },
  { id: 'looks', zh: '換造型', en: 'My hero' },
];
const HOW = {
  chest: { zh: '在寶箱裏找到', en: 'Find it in a chest' },
  boss: { zh: '打敗小龍', en: 'Beat the dragon' },
};

export class ShopScene extends Phaser.Scene {
  constructor() { super('Shop'); }
  init(data) {
    this.startData = data || {};
    this.sys.settings.data = {}; // Phaser would hand this data to a later start that passes none
  }

  create() {
    this.bridge = this.registry.get('bridge');
    this.then = this.startData.then || 'Map';
    this.tab = this.registry.get('dungeon.shopTab') || 'dress';
    this.previewBase = this.registry.get('dungeon.shopBase') || 'hero'; // 'hero' (your hero) | 'model' (example)
    this.tryOn = null; // item id being tried on (free)
    this.leaving = false; this.busy = false;
    this.ui = new UI(this);
    this.ui.prompt('裝備室', 'Tap an item to try it on', { speak: !this.registry.get('dungeon.shopSaid') });
    this.registry.set('dungeon.shopSaid', true);
    this.ui.back(() => this.leave(this.then));
    this.ui.coins(this.bridge.coins, false);
    this.build();
    fx.irisIn(this);
    let t = null;
    const onResize = () => { if (t) t.remove(); t = this.time.delayedCall(120, () => this.rebuild()); };
    this.scale.on('resize', onResize);
    this.events.once('shutdown', () => { this.scale.off('resize', onResize); voice.stop(); });
    this.bindScroll();
  }

  get p() { return this.bridge.progress; }
  owned(id) { return (this.p.looks || []).includes(id); }
  wearing(item) {
    if (item.colour) return ((this.p.hero || {})[item.slot]) === item.colour;
    return (this.p.equipped || {})[item.slot] === item.id;
  }
  hidden(item) { return item.earnedBy != null && !this.owned(item.id); } // chest / boss piece not found yet

  look() {
    const eq = { ...(this.p.equipped || {}) };
    const hero = { ...(this.p.hero || {}) };
    const it = this.tryOn && itemById(this.tryOn);
    if (it) {
      if (it.colour) hero[it.slot] = it.colour; // a cosmetic recolours the hero itself
      else eq[it.slot] = it.id;
    }
    return { hero, equipped: eq };
  }

  /** The look each card previews: the chosen base hero with just this item applied. */
  previewLook(it) {
    const model = this.previewBase === 'model';
    const hero = model
      ? { sex: 'boy', skin: '#ffe0c4', hairStyle: 'short', hairColour: '#5a3a22', tunic: '#d94c4c' }
      : { ...(this.p.hero || {}) };
    const eq = model ? {} : { ...(this.p.equipped || {}) };
    if (it.colour) hero[it.slot] = it.colour;
    else eq[it.slot] = it.id;
    if (it.slot !== 'pet') eq.pet = null; // keep the art the same width on every non-pet card
    return { hero, equipped: eq };
  }

  /** The catalogue, grouped into sections (only the 裝扮 tab has more than one). */
  sections() {
    const bySlot = slot => COSMETICS.filter(c => c.slot === slot);
    if (this.tab === 'helmet') return [{ key: 'helmet', zh: '頭盔', en: 'Helmets', items: SHOP.filter(s => s.slot === 'helmet') }];
    if (this.tab === 'pet') return [{ key: 'pet', zh: '寵物', en: 'Pets', items: SHOP.filter(s => s.slot === 'pet') }];
    return [
      { key: 'skin', zh: '膚色', en: 'Skin', items: bySlot('skin') },
      { key: 'hair', zh: '髮色', en: 'Hair colour', items: bySlot('hairColour') },
      { key: 'outfit', zh: '服裝', en: 'Outfits', items: OUTFITS },
      { key: 'cloth', zh: '衣服顏色', en: 'Clothes colour', items: bySlot('tunic') },
      { key: 'weapon', zh: '武器', en: 'Weapons', items: WEAPONS },
    ];
  }

  rebuild() { if (this.layer) this.layer.destroy(); if (this.gridMask) this.gridMask.destroy(); this.build(); }

  build() {
    const W = this.scale.width, H = this.scale.height, top = this.ui.topH + 6;
    this.layer = this.add.container(0, 0);
    const wide = W >= 640 && W > H * 1.05;
    const actH = 76, toggleH = 46;
    let mx, my, mw, mh, gx, gy, gw, gh;
    if (wide) {
      mw = clamp(W * 0.32, 200, 320); mh = Math.min(H - top - actH - toggleH - 24, mw * 1.2);
      mx = 16 + mw / 2; my = top + 6 + mh / 2;
      gx = 16 + mw + 24; gy = top + 4; gw = W - gx - 16; gh = H - gy - 12;
    } else {
      mh = clamp(H * 0.22, 110, 200); mw = Math.min(W - 32, mh * 1.15);
      mx = W / 2; my = top + mh / 2;
      gx = 12; gy = top + mh + actH + toggleH + 4; gw = W - 24; gh = H - gy - 8;
    }
    // mirror with the hero (+ pet)
    const mirror = drawMirror(this, mx, my, mw, mh);
    this.layer.add(mirror);
    this.glass = mirror.glass;
    const M = Math.max(2, Math.floor(Math.min(this.glass.w / 30, (this.glass.h - 8) / 18)));
    this.heroC = makeHero(this, this.look(), { view: 'front' }).setScale(M);
    this.heroC.setPetSide('left');
    this.layer.add(this.heroC);
    this.placeHero();
    // action button under the mirror
    this.actPos = { x: mx, y: my + mh / 2 + actH / 2 + 2 };
    this.paintAction();
    // 我的英雄 / 示範英雄 preview-base control, under the action button
    this.buildBaseToggle(mx, my + mh / 2 + actH + toggleH / 2 + 4);

    // tabs
    const tabH = 52, n = TABS.length, tw = Math.min(150, (gw - 16) / n);
    TABS.forEach((t, i) => {
      const on = this.tab === t.id;
      const b = pill(this, { zh: t.zh, en: t.en, w: tw - 8, h: tabH, size: 20, fill: on ? 0xfde047 : 0xffffff, rim: on ? 0xb45309 : 0xa8a29e }, () => this.pickTab(t.id));
      b.setPosition(gx + gw / 2 + (i - (n - 1) / 2) * tw, gy + tabH / 2);
      this.layer.add(b);
    });

    // sectioned catalogue (a jump-bar when there is more than one section)
    const secs = this.sections();
    const jumpH = secs.length > 1 ? 42 : 4;
    if (secs.length > 1) this.buildJump(gx, gy + tabH + 4, gw, 36, secs);
    const area = { x: gx, y: gy + tabH + jumpH + 4, w: gw, h: Math.max(80, gh - tabH - jumpH - 4) };
    this.buildGrid(area, secs);
  }

  placeHero() {
    const gl = this.glass, h = this.heroC, pet = h.pet && h.pet.visible;
    h.setPosition(gl.x + gl.w / 2 + (pet ? 7 * h.scale : 0), gl.y + gl.h - Math.max(4, gl.h * 0.08));
  }

  /** Two little pills: preview every card on 我的英雄 or on a plain 示範英雄. */
  buildBaseToggle(cx, cy) {
    const opts = [['hero', '我的英雄'], ['model', '示範英雄']];
    const w = 112, h = 34;
    opts.forEach(([id, zh], i) => {
      const on = this.previewBase === id;
      const b = pill(this, { zh, en: '', w: w - 6, h, size: 16, fill: on ? 0xfde047 : 0xffffff, rim: on ? 0xb45309 : 0xa8a29e }, () => this.setBase(id));
      b.setPosition(cx + (i - 0.5) * w, cy);
      this.layer.add(b);
    });
  }

  setBase(id) {
    if (this.previewBase === id) return;
    sfx.tick(3);
    this.previewBase = id;
    this.registry.set('dungeon.shopBase', id);
    this.repaintGrid();
  }

  /** A row of category pills that scroll the catalogue to a section. */
  buildJump(x, y, w, h, secs) {
    const n = secs.length, pw = Math.min(118, (w - 8) / n), total = n * pw;
    const x0 = x + (w - total) / 2;
    secs.forEach((s, i) => {
      const b = pill(this, { zh: s.zh, en: '', w: pw - 6, h: 34, size: 16, fill: 0xffffff, rim: 0xa8a29e }, () => this.jumpTo(s.key));
      b.setPosition(x0 + i * pw + pw / 2, y + h / 2);
      this.layer.add(b);
    });
  }

  jumpTo(key) {
    const y = this.sectionY && this.sectionY[key];
    if (y == null) return;
    sfx.tick(3);
    this.setGridScroll(y - 4);
  }

  buildGrid(area, secs) {
    const cols = Math.max(2, Math.min(6, Math.floor(area.w / 104)));
    const cw = Math.min(150, Math.floor(area.w / cols)), ch = Math.round(cw * 1.28);
    const x0 = area.x + (area.w - cols * cw) / 2;
    const headH = secs.length > 1 ? 38 : 0;
    this.grid = this.add.container(0, 0);
    this.cards = {};
    this.sectionY = {};
    let y = 0;
    secs.forEach(s => {
      if (headH) {
        this.sectionY[s.key] = y;
        const zh = this.add.text(area.x + 4, area.y + y + headH / 2, s.zh, textStyle(20, '#fde68a')).setOrigin(0, 0.5);
        const en = this.add.text(area.x + 8 + zh.width, area.y + y + headH / 2 + 2, s.en, textStyle(12, '#a8a29e', { fontStyle: 'normal' })).setOrigin(0, 0.5);
        const line = this.add.graphics();
        line.lineStyle(2, 0xfacc15, 0.25).lineBetween(area.x + 4, area.y + y + headH - 5, area.x + area.w - 4, area.y + y + headH - 5);
        this.grid.add([zh, en, line]);
        y += headH;
      }
      s.items.forEach((it, i) => {
        const card = this.card(it, cw - 8, ch - 8);
        card.setPosition(x0 + (i % cols) * cw + cw / 2, area.y + y + Math.floor(i / cols) * ch + ch / 2);
        this.grid.add(card);
        this.cards[it.id] = card;
      });
      y += Math.ceil(s.items.length / cols) * ch + 8;
    });
    this.layer.addAt(this.grid, 0); // under the tabs, the jump-bar and the action button
    this.gridArea = area;
    this.gridMax = Math.max(0, y - area.h);
    this.gridScroll = 0;
    if (this.gridMax > 0) {
      this.gridMask = this.make.graphics({ add: false });
      this.gridMask.fillStyle(0xffffff).fillRect(area.x - 4, area.y - 4, area.w + 8, area.h + 8);
      this.grid.setMask(this.gridMask.createGeometryMask());
      const more = this.add.text(area.x + area.w - 6, area.y + area.h - 4, '▼', textStyle(18, '#fde68a')).setOrigin(1, 1).setAlpha(0.8);
      this.layer.add(more);
      this.moreHint = more;
    } else { this.gridMask = null; this.moreHint = null; }
  }

  /** One item card: a hero preview, the name, and a price / status footer. */
  card(it, w, h) {
    const c = this.add.container(0, 0), g = this.add.graphics();
    const hid = this.hidden(it), own = this.owned(it.id), wear = this.wearing(it), trying = this.tryOn === it.id;
    const fill = hid ? 0x44403c : wear ? 0xdcfce7 : 0xfffbeb;
    const rim = trying ? 0xfacc15 : wear ? 0x22c55e : hid ? 0x78716c : 0xd6d3d1;
    g.fillStyle(0x000000, 0.25).fillRoundedRect(-w / 2 + 2, -h / 2 + 4, w, h, 14);
    g.fillStyle(fill, 1).fillRoundedRect(-w / 2, -h / 2, w, h, 14);
    g.lineStyle(trying ? 6 : 3, rim, 1).strokeRoundedRect(-w / 2, -h / 2, w, h, 14);
    c.add(g);
    // preview: a little hero wearing / holding the item; hidden (chest / boss) pieces stay a silhouette
    const boxW = w - 12, boxH = Math.round(h * 0.60);
    const boxCy = -h / 2 + 6 + boxH / 2;
    if (hid) {
      const f = artFrame(it.id);
      const k = Math.max(2, Math.floor(Math.min(boxW / 20, boxH / 18)));
      c.add(this.add.image(0, boxCy + boxH / 2 - 4 - 8 * k, f.texture, f.frame).setScale(k).setTintFill(0x1c1917));
    } else {
      c.add(heroPreview(this, this.previewLook(it), { w: boxW, h: boxH, showPet: it.slot === 'pet' }).setPosition(0, boxCy));
    }
    // name
    const nz = this.add.text(0, -h / 2 + 6 + boxH + 12, hid ? '？？？' : it.zh, textStyle(17, hid ? '#e7e5e4' : '#1f2937')).setOrigin(0.5);
    if (nz.width > w - 8) nz.setScale((w - 8) / nz.width);
    c.add(nz);
    // price / status
    let st;
    if (hid) st = HOW[it.earnedBy] || HOW.chest;
    else if (wear) st = { zh: '穿著', en: 'Wearing' };
    else if (own) st = { zh: '已擁有', en: 'Yours' };
    else if (it.price == null) st = { zh: '免費', en: 'Free' };
    else st = null;
    if (st) {
      const t = this.add.text(0, h / 2 - 15, st.zh, textStyle(14, hid ? '#fde68a' : wear ? '#15803d' : '#57534e')).setOrigin(0.5);
      if (t.width > w - 8) t.setScale((w - 8) / t.width);
      c.add(t);
    } else {
      const coin = this.add.image(-15, h / 2 - 15, 'art:coin').setScale(1.6);
      c.add([coin, this.add.text(3, h / 2 - 15, String(it.price), textStyle(18, '#a16207')).setOrigin(0, 0.5)]);
    }
    if (wear && !hid) c.add(this.add.text(w / 2 - 14, -h / 2 + 14, '✓', textStyle(18, '#15803d')).setOrigin(0.5));
    c.setSize(w, h).setInteractive({ useHandCursor: true });
    c.on('pointerup', ptr => {
      const a = this.gridArea;
      if (this.dragMoved || (a && (ptr.worldY < a.y - 4 || ptr.worldY > a.y + a.h + 4))) return; // scrolled out of view
      this.tap(it);
    });
    return c;
  }

  repaintGrid() {
    const scroll = this.gridScroll;
    this.rebuild();
    this.setGridScroll(scroll);
  }

  /** The button under the mirror, for the item being tried on. */
  paintAction() {
    if (this.actBtn) { this.actBtn.destroy(); this.actBtn = null; }
    if (this.actCoin) { this.actCoin.destroy(); this.actCoin = null; }
    const it = this.tryOn && itemById(this.tryOn);
    let spec = null, note = null;
    if (it) {
      const buySpec = () => {
        const ok = this.bridge.coins >= it.price;
        return ok ? { zh: `買 ${it.price}`, en: 'Buy', act: 'buy' } : { zh: `買 ${it.price}`, en: `Need ${it.price - this.bridge.coins} more coins`, act: 'short', dim: true };
      };
      if (it.colour) {
        if (this.wearing(it)) note = { zh: `穿著中：${it.zh}`, en: 'Wearing' };
        else if (this.owned(it.id)) spec = { zh: '穿上', en: 'Wear', act: 'wear' };
        else if (it.price != null) spec = buySpec();
      } else if (this.wearing(it)) spec = { zh: '除下', en: 'Take off', act: 'off' };
      else if (this.owned(it.id) || it.price == null) spec = { zh: '穿上', en: 'Wear', act: 'wear' };
      else if (it.price != null) spec = buySpec();
    }
    if (!spec) {
      const t = this.add.text(this.actPos.x, this.actPos.y, note ? note.zh : '揀一件試穿', textStyle(18, note ? '#fde68a' : '#e7e5e4', { fontStyle: 'normal' })).setOrigin(0.5);
      const e = this.add.text(this.actPos.x, this.actPos.y + 20, note ? note.en : 'Tap an item to try it on', textStyle(12, note ? '#fde68a' : '#a8a29e', { fontStyle: 'normal' })).setOrigin(0.5);
      this.actBtn = this.add.container(0, 0, [t, e]);
      this.layer.add(this.actBtn);
      return;
    }
    const b = pill(this, { zh: spec.zh, en: spec.en, w: 200, h: 66, size: 26, fill: spec.dim ? 0xe7e5e4 : 0xfde047, rim: spec.dim ? 0xa8a29e : 0xb45309 }, () => this.act(spec.act, it));
    b.setPosition(this.actPos.x, this.actPos.y);
    this.actBtn = b;
    this.layer.add(b);
    // the same gold coin the game uses (never the 🪙 emoji, which some devices draw silver)
    if (spec.act === 'buy' || spec.act === 'short') {
      this.actCoin = this.add.image(this.actPos.x - 100 - 20, this.actPos.y, 'art:coin').setScale(1.9);
      this.layer.add(this.actCoin);
    }
  }

  tap(it) {
    if (this.leaving || this.busy || this.ui.modalOpen) return;
    if (this.hidden(it)) {
      sfx.boop();
      const how = HOW[it.earnedBy] || HOW.chest;
      voice.say(how.zh);
      this.ui.toast(how.zh, how.en, 1600);
      return;
    }
    sfx.pop();
    this.tryOn = this.tryOn === it.id && !this.owned(it.id) ? null : it.id;
    this.heroC.setLook(this.look());
    this.placeHero();
    if (!reduced()) {
      const y0 = this.heroC.y;
      this.tweens.add({ targets: this.heroC, y: y0 - this.heroC.scale * 2, duration: 110, yoyo: true, onComplete: () => { this.heroC.y = y0; } });
      fx.sparkle(this, this.heroC.x, this.heroC.y - 8 * this.heroC.scale);
    }
    this.repaintGrid();
  }

  async act(what, it) {
    if (this.busy || this.leaving || this.ui.modalOpen) return;
    const b = this.bridge;
    if (what === 'short') {
      sfx.boop();
      voice.say('金幣未夠，繼續尋寶吧！');
      this.ui.toast('金幣未夠', 'Not enough coins yet', 1500);
      return;
    }
    this.busy = true;
    try {
      if (what === 'buy') {
        const r = buy(b.progress, it.id);
        if (!r.ok) { this.busy = false; this.paintAction(); return; }
        await b.saveLook(p => equip(buy(p, it.id).progress, it.slot, it.id));
        sfx.coin(); fx.burst(this, this.heroC.x, this.heroC.y - 8 * this.heroC.scale);
        this.ui.coins(b.coins);
        voice.say('買咗！');
      } else if (what === 'wear') {
        await b.saveLook(p => equip(p, it.slot, it.id));
        sfx.ding();
      } else if (what === 'off') {
        await b.saveLook(p => equip(p, it.slot, null));
        this.tryOn = null;
        sfx.pop();
      }
    } catch (e) { console.warn('[shop]', e); }
    this.busy = false;
    this.heroC.setLook(this.look());
    this.placeHero();
    this.repaintGrid();
  }

  pickTab(id) {
    if (this.leaving || this.busy || this.ui.modalOpen) return;
    sfx.tick(3);
    if (id === 'looks') { this.leave('MakeHero', { then: 'Shop' }); return; }
    this.tab = id;
    this.registry.set('dungeon.shopTab', id);
    this.rebuild();
  }

  bindScroll() {
    this.input.on('pointerdown', p => { this.drag = { y: p.worldY, s: this.gridScroll }; this.dragMoved = false; });
    this.input.on('pointermove', p => {
      if (!this.drag || !p.isDown || !this.gridMax) return;
      const dy = p.worldY - this.drag.y;
      if (Math.abs(dy) > 10) this.dragMoved = true;
      if (this.dragMoved) this.setGridScroll(this.drag.s - dy);
    });
    this.input.on('pointerup', () => { this.drag = null; });
    this.input.on('wheel', (p, o, dx, dy) => this.setGridScroll(this.gridScroll + dy));
  }
  setGridScroll(v) {
    if (!this.grid) return;
    this.gridScroll = clamp(v, 0, this.gridMax || 0);
    this.grid.y = -this.gridScroll;
    if (this.moreHint) this.moreHint.setVisible(this.gridScroll < this.gridMax - 4);
  }

  leave(key, data = {}) {
    if (this.leaving) return;
    this.leaving = true;
    sfx.door();
    fx.iris(this, key, data);
  }
}
