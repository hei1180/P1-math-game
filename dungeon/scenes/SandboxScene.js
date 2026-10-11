// Sandbox (dev only, ?dev&scene=Sandbox): every art key, hero looks front/back, a slime queue that turns,
// and each clue layout drawn from a hard-coded Scene object.
// Layouts are drawn by the game's own PixelStage (same grid, slot markers, tags and hero home as the rooms).
// preload / buildArt are idempotent, so it also works when opened straight from ?scene=Sandbox.
import { ART_KEYS, artFrame, preloadArt, buildArt, makeHero, makeCreature, hop, makeBackdrop, HERO_ART, FLOOR_Y } from '../art.js?v=202610112341';
import { PixelStage } from '../stage.js?v=202610112341';

const FONT = '"Chalkboard SE","Comic Sans MS","PingFang TC","Microsoft JhengHei",sans-serif';
const RES = Math.min(3, Math.max(1, window.devicePixelRatio || 1));
const TOP = 64, BOTTOM = 72;
const PAGES = [
  { id: 'sprites', zh: '圖鑑', en: 'Sprites' },
  { id: 'hero', zh: '勇士', en: 'Hero' },
  { id: 'queue', zh: '排隊', en: 'Queue' },
  { id: 'layouts', zh: '位置', en: 'Layouts' },
];

// Hard-coded clue scenes (Scene contract: x to the right, y up, 0 = floor).
const LAYOUTS = {
  pair: { layout: 'pair', cols: 2, rows: 1, objects: [{ id: 'a', kind: 'shield', x: 0, y: 0 }, { id: 'b', kind: 'sword', x: 1, y: 0 }], slots: [] },
  row: { layout: 'row', cols: 5, rows: 1, slots: [{ x: 2, y: 0 }], objects: [
    { id: 'a', kind: 'torch', x: 0, y: 0 }, { id: 'b', kind: 'bow', x: 1, y: 0 },
    { id: 'c', kind: 'axe', x: 3, y: 0 }, { id: 'd', kind: 'helmet', x: 4, y: 0 }] },
  queue: { layout: 'queue', cols: 4, rows: 1, queueFacing: 'left', slots: [], objects: [
    { id: 'a', kind: 'slimeGreen', x: 0, y: 0, facing: 'left' }, { id: 'b', kind: 'slimePink', x: 1, y: 0, facing: 'left' },
    { id: 'c', kind: 'slimeBlue', x: 2, y: 0, facing: 'left' }, { id: 'd', kind: 'slimeYellow', x: 3, y: 0, facing: 'left' }] },
  column: { layout: 'column', cols: 1, rows: 4, slots: [{ x: 0, y: 3 }], objects: [
    { id: 'a', kind: 'crate', x: 0, y: 0 }, { id: 'b', kind: 'barrel', x: 0, y: 1 }, { id: 'c', kind: 'chestStar', x: 0, y: 2 }] },
  shelf: { layout: 'shelf', cols: 3, rows: 3, slots: [{ x: 1, y: 1 }, { x: 2, y: 2 }], objects: [
    { id: 'a', kind: 'potionRed', x: 0, y: 0 }, { id: 'b', kind: 'potionBlue', x: 1, y: 0 }, { id: 'c', kind: 'gem', x: 2, y: 0 },
    { id: 'd', kind: 'book', x: 0, y: 1 }, { id: 'e', kind: 'key', x: 2, y: 1 }, { id: 'f', kind: 'chestMoon', x: 0, y: 2 },
    { id: 'g', kind: 'chestHeart', x: 1, y: 2 }] },
};

export default class SandboxScene extends Phaser.Scene {
  constructor() { super('Sandbox'); }

  preload() { preloadArt(this); }

  create() {
    buildArt(this);
    this.page = this.page || 'sprites';
    this.layoutId = this.layoutId || 'pair';
    this.look = this.look || { hero: { skin: 1, hairStyle: 0, hairColour: 1, tunic: 4 }, equipped: { helmet: null, pet: 'petSlime' } };
    this.dragonAwake = true;
    this.cameras.main.setBackgroundColor('#2b2533');
    this.render();
    const onResize = () => this.render();
    this.scale.on('resize', onResize);
    this.events.once('shutdown', () => this.scale.off('resize', onResize));
  }

  // ---------------------------------------------------------------- frame
  text(x, y, s, size = 16, color = '#ffffff', extra = {}) {
    return this.add.text(x, y, s, { fontFamily: FONT, fontSize: `${size}px`, color, fontStyle: 'bold', padding: { x: 2, y: 4 }, resolution: RES, ...extra });
  }

  button(x, y, zh, en, onTap, { w = 96, h = 52, on = false } = {}) {
    const c = this.add.container(x, y);
    const g = this.add.graphics();
    g.fillStyle(on ? 0xfacc15 : 0xfffbeb, 1).fillRoundedRect(-w / 2, -h / 2, w, h, 12);
    g.lineStyle(3, 0x1f2937, 1).strokeRoundedRect(-w / 2, -h / 2, w, h, 12);
    const a = this.text(0, en ? -8 : 0, zh, 20, '#1f2937').setOrigin(0.5);
    c.add([g, a]);
    if (en) c.add(this.text(0, 13, en, 11, '#4b5563').setOrigin(0.5));
    c.setSize(w, h).setInteractive({ useHandCursor: true });
    c.on('pointerup', onTap);
    return c;
  }

  render() {
    if (this.stage) { this.stage.destroy(); this.stage = null; }
    this.tweens.killAll();
    this.time.removeAllEvents();
    this.children.removeAll(true);
    const W = this.scale.width, H = this.scale.height;
    this.W = W; this.H = H;
    this.PX = Math.max(1, Math.floor(Math.min(W / 192, (H - TOP - BOTTOM) / 108)));
    this.ox = Math.round((W - 192 * this.PX) / 2);
    this.oy = Math.round(TOP + Math.max(0, (H - TOP - BOTTOM) - 108 * this.PX) / 2);

    const n = PAGES.length, bw = Math.min(110, (W - 16 - (n - 1) * 6) / n - 0);
    PAGES.forEach((p, i) => this.button(8 + bw / 2 + i * (bw + 6), TOP / 2, p.zh, p.en,
      () => { this.page = p.id; this.render(); }, { w: bw, on: this.page === p.id }));
    if (this.scene.manager.keys.Map) {
      this.button(W - 56, H - BOTTOM / 2, '返回', 'Back', () => this.scene.start('Map'), { w: 96 });
    }
    this.root = this.add.container(this.ox, this.oy).setScale(this.PX);
    this[`page_${this.page}`]();
    this.text(8, H - 18, `PX ×${this.PX} · Art: Kenney.nl (CC0)`, 11, '#9ca3af');
  }

  /** Art px inside the room -> CSS px. */
  toScreen(ax, ay) { return { x: this.ox + ax * this.PX, y: this.oy + ay * this.PX }; }

  // ---------------------------------------------------------------- pages
  page_sprites() {
    this.root.destroy();
    const W = this.W, availH = this.H - TOP - BOTTOM + 40, N = ART_KEYS.length;
    let g = this.PX, cols, rows;
    for (; g >= 1; g--) {
      cols = Math.max(1, Math.floor((W - 16) / (34 * g)));
      rows = Math.ceil(N / cols);
      if (rows * (34 * g + 12) <= availH) break;
    }
    g = Math.max(1, g);
    const cw = 34 * g, ch = 34 * g + 12, x0 = Math.round((W - cols * cw) / 2);
    ART_KEYS.forEach((k, i) => {
      const cx = x0 + (i % cols) * cw + cw / 2, cy = TOP + 8 + Math.floor(i / cols) * ch;
      const f = artFrame(k);
      const s = this.add.image(Math.round(cx), Math.round(cy + 28 * g), f.texture, f.frame).setOrigin(0.5, 1).setScale(g);
      if (/^(slime|bat$|mole$|owl$|dragon|pet\.)/.test(k)) s.facing = 'right';
      const t = this.text(cx, cy + 28 * g + 1, k, 10, '#e5e7eb').setOrigin(0.5, 0);
      if (t.width > cw - 2) t.setScale((cw - 2) / t.width);
    });
  }

  page_hero() {
    this.root.add(makeBackdrop(this, 1));
    // top row: every helmet (front), second row: the same looks from behind
    const ids = HERO_ART.helmetOrder;
    ids.forEach((id, i) => {
      const look = { hero: { skin: i % 6, hairStyle: i % 5, hairColour: (i + 2) % 6, tunic: i % 8 }, equipped: { helmet: id, pet: null } };
      const x = 16 + i * 20;
      this.root.add(makeHero(this, look, { view: 'front' }).setPosition(x, 36));
      this.root.add(makeHero(this, look, { view: 'back' }).setPosition(x, 62));
    });
    // floor: the hero being edited, front and back, with the pet
    const front = makeHero(this, this.look, { view: 'front' }).setPosition(80, FLOOR_Y).setPetSide('left');
    const back = makeHero(this, this.look, { view: 'back' }).setPosition(118, FLOOR_Y).setPetSide('right');
    this.root.add([front, back]);
    // every pet along the floor edges
    HERO_ART.petOrder.forEach((id, i) => {
      const x = i < 4 ? 10 + i * 13 : 143 + (i - 4) * 13;
      this.root.add(makeCreature(this, HERO_ART.pets[id].art, 'right').setPosition(x, FLOOR_Y));
    });

    const h = this.look.hero, eq = this.look.equipped;
    const cyc = (v, n) => ((v | 0) + 1) % n;
    const opts = [
      ['膚色', 'Skin', () => { h.skin = cyc(h.skin, 6); }],
      ['髮型', 'Hair', () => { h.hairStyle = cyc(h.hairStyle, 5); }],
      ['髮色', 'Colour', () => { h.hairColour = cyc(h.hairColour, 6); }],
      ['衣服', 'Tunic', () => { h.tunic = cyc(h.tunic, 8); }],
      ['頭盔', 'Helmet', () => { const o = [null, ...HERO_ART.helmetOrder]; eq.helmet = o[(o.indexOf(eq.helmet) + 1) % o.length]; }],
      ['寵物', 'Pet', () => { const o = [null, ...HERO_ART.petOrder]; eq.pet = o[(o.indexOf(eq.pet) + 1) % o.length]; }],
    ];
    const bw = Math.min(96, (this.W - 16) / opts.length - 6);
    opts.forEach(([zh, en, f], i) => this.button(8 + bw / 2 + i * (bw + 6), this.H - BOTTOM / 2 - 6, zh, en,
      () => { f(); front.setLook(this.look); back.setLook(this.look); this.showLook(); }, { w: bw }));
    this.lookText = this.text(this.W / 2, this.oy + 108 * this.PX + 2, '', 12, '#fde68a').setOrigin(0.5, 0);
    this.showLook();
  }

  showLook() {
    if (!this.lookText) return;
    const h = this.look.hero, eq = this.look.equipped;
    this.lookText.setText(`skin ${h.skin} · hair ${HERO_ART.hairStyles[h.hairStyle].id} · colour ${h.hairColour} · tunic ${h.tunic} · ${eq.helmet || 'no helmet'} · ${eq.pet || 'no pet'}`);
  }

  page_queue() {
    this.root.add(makeBackdrop(this, 2));
    this.facing = this.facing || 'right';
    const kinds = ['slimeGreen', 'slimePink', 'slimeBlue', 'slimeYellow'];
    this.queue = kinds.map((k, i) => makeCreature(this, k, this.facing).setPosition(60 + i * 24, FLOOR_Y));
    this.feet = this.queue.map(s => makeCreature(this, 'foot', this.facing).setPosition(s.x, FLOOR_Y + 13).setAlpha(0.8));
    const bat = makeCreature(this, 'bat', this.facing).setPosition(40, 30);
    const owl = makeCreature(this, 'owl', this.facing).setPosition(24, FLOOR_Y);
    const mole = makeCreature(this, 'mole', this.facing).setPosition(168, FLOOR_Y);
    const dragon = makeCreature(this, this.dragonAwake ? 'dragon' : 'dragon.sleep', this.facing).setPosition(150, 60);
    const hang = makeCreature(this, 'bat.front').setPosition(96, 20).setFlipY(true);
    this.critters = [...this.queue, ...this.feet, bat, owl, mole, dragon];
    this.root.add([...this.feet, ...this.queue, bat, owl, mole, dragon, hang]);
    this.queue.forEach((s, i) => hop(s, { repeat: -1, delay: i * 150 }));
    const p = this.toScreen(96, 4);
    this.text(p.x, p.y, this.facing === 'right' ? '向右 → facing right' : '← 向左 facing left', 18, '#ffffff',
      { stroke: '#1f2937', strokeThickness: 4 }).setOrigin(0.5, 0);
    this.button(this.W / 2 - 64, this.H - BOTTOM / 2 - 6, '轉身', 'Turn', () => {
      this.facing = this.facing === 'right' ? 'left' : 'right'; this.render();
    }, { w: 112 });
    this.button(this.W / 2 + 64, this.H - BOTTOM / 2 - 6, '小龍', 'Dragon', () => {
      this.dragonAwake = !this.dragonAwake; this.render();
    }, { w: 112 });
  }

  page_layouts() {
    const sd = LAYOUTS[this.layoutId];
    this.root.destroy();
    const st = this.stage = new PixelStage(this, { top: TOP, bottom: BOTTOM });
    st.back.add(makeBackdrop(this, 3));
    st.hero = makeHero(this, this.look, { view: 'front' });
    st.front.add(st.hero);
    st.level = 3;
    st.drawScene(sd);
    st.tags(true, 'big');
    const ids = Object.keys(LAYOUTS), bw = Math.min(96, (this.W - 16) / ids.length - 6);
    ids.forEach((id, i) => this.button(8 + bw / 2 + i * (bw + 6), this.H - BOTTOM / 2 - 6, id, '',
      () => { this.layoutId = id; this.render(); }, { w: bw, on: id === this.layoutId }));
    const p = st.toScreen(96, 4);
    this.text(this.W / 2, Math.max(TOP + 30, p.y), `layout: ${sd.layout} (${sd.cols}×${sd.rows}) · PX ×${st.PX}`, 14, '#ffffff',
      { stroke: '#1f2937', strokeThickness: 4 }).setOrigin(0.5, 0).setDepth(30);
  }
}
