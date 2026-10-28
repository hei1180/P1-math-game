// 製作英雄 Make your hero: a big front-view hero in a mirror, rows of swatches (sex, skin, hair style,
// hair colour, outfit, clothes colour, weapon) and a preset name + number (two arrows, no free text).
// Outfit / weapon swatches show the garment or weapon itself (the others show a little head / colour dot).
// 「出發！」 saves with bridge.saveLook and opens data.then (default 'Map'). First visit (no hero yet) comes
// here from Boot; later the Shop's 換造型 tab opens it (free changes, ← goes back without saving). Swatches for
// paid outfits, weapons and cosmetics only appear once bought in the shop.
import { SKINS, HAIR_STYLES, HAIR_COLOURS, TUNICS, SEXES, HERO_NAMES, OUTFITS, WEAPONS, ownedCosmetics } from '../../dungeon-logic.js?v=202610112341';
import { UI, pill } from '../ui.js?v=202610112341';
import { fx } from '../fx.js?v=202610112341';
import { sfx } from '../sfx.js?v=202610112341';
import { voice } from '../voice.js?v=202610112341';
import { textStyle } from '../theme.js?v=202610112341';
import { makeHero, outfitTexture, itemIcon } from '../art.js?v=202610112341';
import { RC } from '../art-frames.js?v=202610112341';

const reduced = () => fx.lessMotion || (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const hexN = s => parseInt(String(s).slice(1), 16);

/**
 * Mirror frame (wooden frame, pale glass) centred at (cx, cy), w × h CSS px. Returns the container;
 * .glass = { x, y, w, h } inner glass rect (scene coords).
 */
export function drawMirror(scene, cx, cy, w, h) {
  const c = scene.add.container(cx, cy), g = scene.add.graphics();
  const r = Math.min(w, h) * 0.18, b = clamp(Math.min(w, h) * 0.06, 8, 16);
  g.fillStyle(0x000000, 0.3).fillRoundedRect(-w / 2 + 4, -h / 2 + 8, w, h, r);
  g.fillStyle(0x92400e, 1).fillRoundedRect(-w / 2, -h / 2, w, h, r);
  g.lineStyle(3, 0xfacc15, 1).strokeRoundedRect(-w / 2 + 3, -h / 2 + 3, w - 6, h - 6, r - 2);
  const gw = w - 2 * b, gh = h - 2 * b;
  g.fillStyle(0xdbeafe, 1).fillRoundedRect(-gw / 2, -gh / 2, gw, gh, Math.max(4, r - b));
  g.fillStyle(0xbfdbfe, 1).fillRoundedRect(-gw / 2, gh * 0.18, gw, gh * 0.32, { tl: 0, tr: 0, bl: Math.max(4, r - b), br: Math.max(4, r - b) });
  g.fillStyle(0xffffff, 0.55).fillTriangle(-gw / 2 + 10, -gh / 2 + 10, -gw / 2 + gw * 0.32, -gh / 2 + 10, -gw / 2 + 10, -gh / 2 + gh * 0.4);
  // little gems on the frame
  g.fillStyle(0xef4444, 1).fillCircle(0, -h / 2 + b / 2, Math.max(3, b * 0.35));
  g.fillStyle(0x22c55e, 1).fillCircle(-w / 2 + b / 2, 0, Math.max(3, b * 0.3)).fillCircle(w / 2 - b / 2, 0, Math.max(3, b * 0.3));
  c.add(g);
  c.glass = { x: cx - gw / 2, y: cy - gh / 2, w: gw, h: gh };
  return c;
}

/** A tappable round swatch (≥ 48 px). c.setOn(bool) shows the gold ring. */
function swatch(scene, x, y, size, drawFace, onTap) {
  const c = scene.add.container(x, y), ring = scene.add.graphics(), face = scene.add.container(0, 0);
  const r = size / 2 - 5;
  drawFace(face, r);
  c.add([ring, face]);
  c.setOn = on => {
    ring.clear();
    ring.fillStyle(0x000000, 0.25).fillCircle(1, 3, r + 3);
    ring.lineStyle(on ? 6 : 3, on ? 0xfacc15 : 0xffffff, 1).strokeCircle(0, 0, r + (on ? 1 : 0));
    c.setScale(on ? 1.08 : 1);
  };
  c.setOn(false);
  c.setSize(size, size).setInteractive({ useHandCursor: true });
  c.on('pointerup', onTap);  // onTap(pointer) checks drag / visibility
  return c;
}

export class MakeHeroScene extends Phaser.Scene {
  constructor() { super('MakeHero'); }
  init(data) {
    this.startData = data || {};
    this.sys.settings.data = {}; // Phaser would hand this data to a later start that passes none
  }

  create() {
    const bridge = this.bridge = this.registry.get('bridge');
    const p = bridge.progress || {};
    this.then = this.startData.then || 'Map';
    this.first = !p.hero;
    const rng = bridge.rng || Math.random;
    const h = p.hero || {};
    const idxOf = (list, v, d) => { const i = list.indexOf(v); return i >= 0 ? i : typeof v === 'number' && list[v] ? v : d; };
    // lists = the free starter options plus any cosmetics this player has bought (they add swatches).
    // A preset 套裝 can leave the hero on a colour that is not in the starter list; keep it as an extra swatch so
    // opening 製作英雄 never silently changes the child's skin / hair / clothes.
    const withCurrent = (list, v) => (typeof v === 'string' && v && !list.includes(v) ? [...list, v] : list);
    this.lists = {
      sex: SEXES,
      skin: withCurrent([...SKINS, ...ownedCosmetics(p, 'skin').map(c => c.colour)], h.skin),
      hairStyle: HAIR_STYLES,
      hairColour: withCurrent([...HAIR_COLOURS, ...ownedCosmetics(p, 'hairColour').map(c => c.colour)], h.hairColour),
      tunic: withCurrent([...TUNICS, ...ownedCosmetics(p, 'tunic').map(c => c.colour)], h.tunic),
    };
    // choices as indices into the lists; saved as the colour / style ids themselves
    this.sel = {
      sex: Math.max(0, SEXES.indexOf(h.sex)),
      skin: idxOf(this.lists.skin, h.skin, 1),
      hairStyle: idxOf(HAIR_STYLES, h.hairStyle, 0),
      hairColour: idxOf(this.lists.hairColour, h.hairColour, 1),
      tunic: idxOf(this.lists.tunic, h.tunic, 4),
    };
    this.name = h.name && HERO_NAMES[h.name.i] ? { ...h.name } : { i: Math.floor(rng() * HERO_NAMES.length), n: 1 + Math.floor(rng() * 99) };
    this.leaving = false;
    // outfit and weapon live in `equipped` (like helmet / pet). Paid ones appear only once bought.
    const owns = id => (p.looks || []).includes(id);
    const eq = p.equipped || {};
    // A 套裝 costume is not in OUTFITS, so keep the one being worn as a synthetic row entry (otherwise opening
    // 製作英雄 would quietly put the child back in a plain tunic).
    const allOutfits = OUTFITS.slice();
    if (eq.outfit && !allOutfits.some(o => o.id === eq.outfit)) {
      allOutfits.unshift({ id: eq.outfit, slot: 'outfit', zh: '套裝', en: 'Costume', price: null });
    }
    this.outfitList = allOutfits.filter(o => o.price == null || owns(o.id));
    this.weaponList = [null, ...WEAPONS.filter(w => w.price == null || owns(w.id))];
    this.sel.outfit = Math.max(0, this.outfitList.findIndex(o => o.id === (eq.outfit || 'tunic')));
    this.sel.weapon = Math.max(0, this.weaponList.findIndex(w => (w ? w.id : null) === (eq.weapon || null)));

    this.ui = new UI(this);
    this.ui.prompt(this.first ? '製作你的英雄！' : '換個樣子', this.first ? 'Make your hero' : 'Change your look', { speak: true });
    if (!this.first) this.ui.back(() => this.leave(false));
    this.build();
    fx.irisIn(this);
    this.input.on('pointerdown', p => { this.drag = { y: p.worldY, s: this.ctrlScroll || 0 }; this.dragMoved = false; });
    this.input.on('pointermove', p => {
      if (!this.drag || !p.isDown || !this.ctrlMax) return;
      const dy = p.worldY - this.drag.y;
      if (Math.abs(dy) > 10) this.dragMoved = true;
      if (this.dragMoved) this.setCtrlScroll(this.drag.s - dy);
    });
    this.input.on('pointerup', () => { this.drag = null; });
    this.input.on('wheel', (p, o, dx, dy) => this.setCtrlScroll((this.ctrlScroll || 0) + dy));
    let t = null;
    const onResize = () => { if (t) t.remove(); t = this.time.delayedCall(120, () => this.build()); };
    this.scale.on('resize', onResize);
    this.events.once('shutdown', () => { this.scale.off('resize', onResize); voice.stop(); });
  }

  hero() {
    return {
      sex: SEXES[this.sel.sex],
      skin: this.lists.skin[this.sel.skin], hairStyle: HAIR_STYLES[this.sel.hairStyle],
      hairColour: this.lists.hairColour[this.sel.hairColour], tunic: this.lists.tunic[this.sel.tunic], name: { ...this.name },
    };
  }
  look() {
    const outfit = this.outfitList[this.sel.outfit], weapon = this.weaponList[this.sel.weapon];
    return { hero: this.hero(), equipped: { outfit: outfit ? outfit.id : 'tunic', weapon: weapon ? weapon.id : null } };
  }

  rows() {
    return [
      { key: 'sex', zh: '性別', en: 'Boy / girl', n: this.lists.sex.length },
      { key: 'skin', zh: '皮膚', en: 'Skin', n: this.lists.skin.length },
      { key: 'hairStyle', zh: '髮型', en: 'Hair', n: this.lists.hairStyle.length },
      { key: 'hairColour', zh: '髮色', en: 'Hair colour', n: this.lists.hairColour.length },
      { key: 'outfit', zh: '服裝', en: 'Outfit', n: this.outfitList.length },
      { key: 'tunic', zh: '衣服顏色', en: 'Clothes colour', n: this.lists.tunic.length },
      { key: 'weapon', zh: '武器', en: 'Weapon', n: this.weaponList.length },
    ];
  }

  /** Destroy the built layer and every mask it created (masks live outside the display list, so they leak otherwise). */
  teardown() {
    if (this.layer) { this.layer.destroy(); this.layer = null; }
    (this.swMasks || []).forEach(g => g.destroy());
    this.swMasks = [];
    if (this.ctrlMaskG) { this.ctrlMaskG.destroy(); this.ctrlMaskG = null; }
  }

  build() {
    const W = this.scale.width, H = this.scale.height, top = this.ui.topH + 6;
    this.teardown();
    this.layer = this.add.container(0, 0);
    const wide = W >= 640 && W > H * 1.1;
    const goH = 72, nameH = 66;
    const rows = this.rows();
    // wide: mirror + name + 出發 on the left, swatch rows on the right. Narrow: everything stacked.
    const leftW = wide ? clamp(W * 0.36, 220, 360) : 0;
    const cw = wide ? Math.min(600, W - leftW - 40) : Math.min(560, W - 24);
    const availH = wide ? H - top - 8 : H - top - 8 - nameH - goH - 110; // narrow keeps ≥ 110 px for the mirror
    let S = 0, inline = false, perLine = 1, rowH = () => 0, ctrlH = Infinity;
    // biggest swatch pitch (54 → 48) and label placement that fit the height
    for (const pitch of [54, 50, 48]) {
      for (const inl of [true, false]) {
        const per = Math.max(1, Math.floor((inl ? cw - 84 : cw) / pitch));
        if (inl && per < 6) continue;
        const rh = r => Math.ceil(r.n / per) * pitch + (inl ? 0 : 24) + 6;
        const h = rows.reduce((a, r) => a + rh(r), 0);
        if (h <= availH || pitch === 48) { S = pitch; inline = inl; perLine = per; rowH = rh; ctrlH = h; break; }
      }
      if (S) break;
    }
    let mx, my, mw, mh, cx0, cy0, ny, gy, ncx, nameSpan;
    if (wide) {
      mh = clamp(H - top - nameH - goH - 16, 72, (leftW - 16) * 1.3); mw = Math.min(leftW - 16, mh * 0.9);
      const colH = mh + nameH + goH + 8, y0 = top + Math.max(0, (H - top - colH) / 2);
      mx = 16 + leftW / 2; my = y0 + mh / 2;
      ny = y0 + mh + 4 + nameH / 2; gy = ny + nameH / 2 + goH / 2;
      ncx = mx; nameSpan = leftW;
      cx0 = W - 16 - cw; cy0 = Math.max(top, top + (H - top - ctrlH) / 2);
      this.ctrlView = { y: cy0, h: Math.min(ctrlH, H - 8 - cy0) };
    } else {
      mh = clamp(H - top - ctrlH - nameH - goH - 16, 110, 300); mw = Math.min(W - 32, mh * 0.85);
      mx = W / 2; my = top + mh / 2;
      cx0 = (W - cw) / 2; cy0 = top + mh + 10;
      this.ctrlView = { y: cy0, h: Math.min(ctrlH, H - 8 - nameH - goH - cy0) };
      ny = cy0 + this.ctrlView.h + nameH / 2; gy = ny + nameH / 2 + goH / 2;
      ncx = W / 2; nameSpan = cw;
    }
    // mirror + hero (integer scale, NEAREST)
    const mirror = drawMirror(this, mx, my, mw, mh);
    this.layer.add(mirror);
    const gl = mirror.glass;
    const M = Math.max(2, Math.floor(Math.min(gl.w / 22, (gl.h - 8) / 19)));
    this.heroC = makeHero(this, this.look(), { view: 'front' }).setScale(M);
    this.heroC.setPosition(gl.x + gl.w / 2, gl.y + gl.h - Math.max(4, gl.h * 0.08));
    this.layer.add(this.heroC);

    // swatch rows (in their own container; it scrolls when the screen is too short)
    this.ctrl = this.add.container(0, 0);
    this.layer.add(this.ctrl);
    this.sw = {};
    this.swMasks = [];
    let y = cy0;
    rows.forEach(r => {
      const lab = this.add.text(cx0, inline ? y + S / 2 - 8 : y, r.zh, textStyle(20, '#fde68a')).setOrigin(0, inline ? 0.5 : 0);
      const labE = this.add.text(inline ? cx0 : cx0 + lab.width + 4, inline ? y + S / 2 + 12 : y + 6, r.en, textStyle(12, '#e7e5e4', { fontStyle: 'normal' })).setOrigin(0, inline ? 0.5 : 0);
      this.ctrl.add([lab, labE]);
      const sx0 = inline ? cx0 + 84 : cx0, sy0 = inline ? y : y + 24;
      this.sw[r.key] = [];
      for (let i = 0; i < r.n; i++) {
        const lines = Math.ceil(r.n / perLine), per = Math.ceil(r.n / lines); // balanced lines (8 → 4 + 4)
        const col = i % per, line = Math.floor(i / per);
        const s = swatch(this, sx0 + col * S + S / 2, sy0 + line * S + S / 2, S, (face, rad) => this.face(face, r.key, i, rad), ptr => this.tapSwatch(ptr, r.key, i));
        this.sw[r.key].push(s);
        this.ctrl.add(s);
      }
      y += rowH(r);
    });
    this.ctrlMax = Math.max(0, ctrlH - this.ctrlView.h);
    this.ctrlScroll = 0;
    if (this.ctrlMax > 0) {
      const mk = this.make.graphics({ add: false });
      mk.fillStyle(0xffffff).fillRect(0, this.ctrlView.y - 2, W, this.ctrlView.h + 4);
      this.ctrl.setMask(mk.createGeometryMask());
      this.ctrlMaskG = mk;
      this.more = this.add.text(cx0 + cw - 4, this.ctrlView.y + this.ctrlView.h - 2, '▼', textStyle(18, '#fde68a')).setOrigin(1, 1).setAlpha(0.85);
      this.layer.add(this.more);
    } else this.more = null;
    this.paintSwatches();

    // name: ◀ 勇勇 37 ▶
    const arrow = (dir, x) => {
      const b = pill(this, { zh: dir < 0 ? '◀' : '▶', w: 56, h: 56, size: 26, fill: 0xffffff, rim: 0xb45309 }, () => this.cycleName(dir));
      b.setPosition(x, ny);
      return b;
    };
    const nameW = clamp(nameSpan - 140, 110, 220);
    const ng = this.add.graphics();
    ng.fillStyle(0xfffbeb, 1).fillRoundedRect(ncx - nameW / 2, ny - 28, nameW, 56, 18).lineStyle(3, 0xfacc15, 1).strokeRoundedRect(ncx - nameW / 2, ny - 28, nameW, 56, 18);
    this.nameZh = this.add.text(ncx, ny - 8, '', textStyle(24, '#7c2d12')).setOrigin(0.5);
    this.nameEn = this.add.text(ncx, ny + 15, '', textStyle(12, '#92400e', { fontStyle: 'normal' })).setOrigin(0.5);
    this.layer.add([ng, this.nameZh, this.nameEn, arrow(-1, ncx - nameW / 2 - 34), arrow(1, ncx + nameW / 2 + 34)]);
    this.paintName();

    // 出發！
    const go = pill(this, { zh: '出發！', en: "Let's go!", w: 200, h: 64, size: 28, fill: 0xfde047, rim: 0xb45309 }, () => this.leave(true));
    go.setPosition(ncx, gy);
    this.layer.add(go);
    if (!reduced()) this.tweens.add({ targets: go, scale: { from: 1, to: 1.05 }, duration: 700, yoyo: true, repeat: 2, delay: 600 });
  }

  /** Swatch face: colour dot, a little head (sex / hair style), or the item itself (outfit / weapon). */
  face(c, key, i, r) {
    const g = this.add.graphics();
    c.add(g);
    if (key === 'outfit' || key === 'weapon') {
      g.fillStyle(key === 'weapon' ? 0xfff1cf : 0xdbeafe, 1).fillCircle(0, 0, r);
      if (key === 'weapon') {
        const w = this.weaponList[i];
        if (w) c.add(itemIcon(this, RC.weapons[w.id].tex, RC.weapons[w.id].frame, r * 1.7));
        else c.add(this.add.text(0, 0, '空手', textStyle(Math.max(11, r * 0.55), '#78716c')).setOrigin(0.5));
      } else {
        // the garment on its own, recoloured like the hero's clothes (and kept in step when the colour changes)
        c.setIcon = colour => {
          if (c.icon && c.iconColour === colour) return;
          if (c.icon) c.icon.destroy();
          c.iconColour = colour;
          c.icon = itemIcon(this, outfitTexture(this, this.outfitList[i].id, colour), undefined, r * 1.7);
          c.add(c.icon);
        };
        c.setIcon(this.hero().tunic);
      }
      return;
    }
    if (key === 'hairStyle' || key === 'sex') {
      const bg = key === 'sex' ? (SEXES[i] === 'girl' ? 0xfbcfe8 : 0xcfe4ff) : 0xdbeafe;
      g.fillStyle(bg, 1).fillCircle(0, 0, r);
      const look = this.look();
      if (key === 'sex') { look.hero.sex = SEXES[i]; look.hero.hairStyle = SEXES[i] === 'girl' ? 'long' : 'short'; }
      else look.hero.hairStyle = HAIR_STYLES[i];
      const m = makeHero(this, look, { view: 'front' }).setScale(Math.max(2, Math.floor((r * 2) / 12)));
      m.setPosition(0, r * 1.25 + m.scale * 4);
      // only the head shows: clip with a circular mask
      const mk = this.make.graphics({ add: false });
      c.hairHero = m; c.maskG = mk; c.maskR = r;
      this.swMasks.push(mk);
      m.setMask(mk.createGeometryMask());
      c.add(m);
      return;
    }
    g.fillStyle(hexN(this.lists[key][i]), 1).fillCircle(0, 0, r);
    g.fillStyle(0xffffff, 0.35).fillCircle(-r * 0.35, -r * 0.35, r * 0.28);
  }

  paintSwatches() {
    for (const [key, list] of Object.entries(this.sw)) list.forEach((s, i) => s.setOn(this.sel[key] === i));
    // mini-hero faces follow skin / hair colour / tunic; their masks follow the swatch position
    const refresh = (s, look) => {
      const face = s.list[1], m = face && face.hairHero;
      if (!m) return;
      m.setLook(look);
      face.maskG.clear().fillStyle(0xffffff).fillCircle(s.x, s.y + this.ctrl.y, face.maskR * s.scale);
    };
    (this.sw.hairStyle || []).forEach((s, i) => { const look = this.look(); look.hero.hairStyle = HAIR_STYLES[i]; refresh(s, look); });
    (this.sw.sex || []).forEach((s, i) => { const look = this.look(); look.hero.sex = SEXES[i]; look.hero.hairStyle = SEXES[i] === 'girl' ? 'long' : 'short'; refresh(s, look); });
    // outfit icons are recoloured with the hero's clothes, so keep them in step with the cloth-colour row
    const tunic = this.hero().tunic;
    (this.sw.outfit || []).forEach(s => { const f = s.list[1]; if (f && f.setIcon) f.setIcon(tunic); });
  }

  paintName() {
    const n = HERO_NAMES[this.name.i];
    this.nameZh.setText(`${n.zh} ${this.name.n}`);
    this.nameEn.setText(`${n.en} ${this.name.n}`);
  }

  tapSwatch(ptr, key, i) {
    const v = this.ctrlView;
    if (this.dragMoved || (v && (ptr.worldY < v.y - 2 || ptr.worldY > v.y + v.h + 2))) return;
    this.pick(key, i);
  }

  setCtrlScroll(v) {
    if (!this.ctrl) return;
    this.ctrlScroll = clamp(v, 0, this.ctrlMax || 0);
    this.ctrl.y = -this.ctrlScroll;
    this.paintSwatches();
    if (this.more) this.more.setVisible(this.ctrlScroll < this.ctrlMax - 4);
  }

  pick(key, i) {
    if (this.leaving) return;
    sfx.pop();
    this.sel[key] = i;
    // choosing boy / girl also picks a fitting hair style (still free to change straight after)
    if (key === 'sex') this.sel.hairStyle = HAIR_STYLES.indexOf(SEXES[i] === 'girl' ? 'long' : 'short');
    this.heroC.setLook(this.look());
    this.paintSwatches();
    this.happy();
  }

  cycleName(dir) {
    if (this.leaving) return;
    this.name.i = (this.name.i + dir + HERO_NAMES.length) % HERO_NAMES.length;
    this.paintName();
    voice.say(HERO_NAMES[this.name.i].zh);
  }

  happy() {
    if (reduced()) return;
    const h = this.heroC, y0 = h.__y0 ?? (h.__y0 = h.y);
    this.tweens.killTweensOf(h);
    h.y = y0;
    this.tweens.add({ targets: h, y: y0 - h.scale * 2, duration: 110, yoyo: true, ease: 'Quad.easeOut' });
  }

  async leave(save) {
    if (this.leaving || this.ui.modalOpen) return;
    this.leaving = true;
    if (save) {
      sfx.fanfare();
      const hero = this.hero();
      const eq = this.look().equipped;
      try { await this.bridge.saveLook(p => ({ ...p, hero, equipped: { ...(p.equipped || {}), ...eq } })); } catch (e) { console.warn('[makeHero] save', e); }
    }
    fx.iris(this, this.then, {});
  }
}
