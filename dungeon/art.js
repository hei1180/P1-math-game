// Art for Treasure Dungeon 尋寶地下城: two Kenney CC0 sheets + code-drawn sprites in the same 16 px flat style.
//
//   preloadArt(scene)      Boot.preload: loads the sheets 'td' (Tiny Dungeon) and 'rc' (Roguelike Characters)
//   buildArt(scene)        Boot.create: draws every code texture once (idempotent), NEAREST on all art
//   artFrame(key)          -> { texture, frame } for every key in ART_KEYS (also logic-style ids: 'slimeGreen', 'helmetCrown', 'petCat')
//   makeHero(scene, look, { view: 'front'|'back' }) -> Container (16 × 16 art px, origin bottom-centre)
//        .setLook(look)  .setPetSide('left'|'right')  .parts {body,pants,tunic,hair,helmet,swordL?,swordR?}  .pet  .hands
//   makeCreature(scene, kind, facing) -> Sprite (origin bottom-centre) with .setFacing(f)   hop(sprite, opts) -> Tween
//   makeBackdrop(scene, floor) -> Container 192 × 108 art px (.floorY = 92)
//   HERO_ART  option tables (index -> colour / frame; helmets and pets keyed by logic id)   ART_KEYS
//
// look = { hero: { skin, hairStyle, hairColour, tunic, name }, equipped: { helmet, pet, ... } }
//   skin / hairColour / tunic: index into HERO_ART (0-based) or a '#rrggbb' colour; hairStyle: index or id.
//   equipped.helmet / .pet: logic id ('helmetCrown', 'petCat'), index into HERO_ART.helmetOrder / petOrder, or null.
// Code-drawn creatures face RIGHT in their texture (eyes on the right); setFacing('left') flips them.
// Every texture is NEAREST-filtered; never smooth-scale. Phaser is the global from the <script> tag.
import { KENNEY, TD_STONE, FLOOR_STONE, RC, PAL, SLIME_COLOURS, PIX, HAIR_BACK, CHEST_MARKS } from './art-frames.js?v=0';

export const ART_PX = 16;
export const FLOOR_Y = 92;

const T = key => 'art:' + key;            // texture key of a code-drawn art key
const nearest = () => Phaser.Textures.FilterMode.NEAREST;
const reduced = () => !!(window.__dungeonLessMotion
  || (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches));

// ---------------------------------------------------------------- hero option tables
// Colours match dungeon-logic.js SKINS / HAIR_COLOURS / TUNICS and HAIR_STYLES ids (same order).
export const HERO_ART = {
  skins: ['#ffe0c4', '#f6c9a0', '#e0a878', '#c68a5a', '#9a6440', '#6b4428'],
  hairStyles: [
    { id: 'short', frame: RC.hair.short },
    { id: 'spiky', frame: RC.hair.spiky },
    { id: 'bob', frame: RC.hair.bob },
    { id: 'long', frame: RC.hair.long },
    { id: 'buns', frame: RC.hair.buns },
  ],
  hairColours: ['#2b2118', '#5a3a22', '#a0642c', '#e0b050', '#c8452c', '#7a7f8c'],
  tunics: ['#d94c4c', '#e8903a', '#e8c94a', '#5bb35b', '#3fa7c9', '#4a6fd6', '#9a5bd6', '#e06fa8'],
  // helmets keyed by logic id: { id, art (icon key), frame (rc index) | code: true }
  helmets: {},
  helmetOrder: ['helmetPlain', 'helmetHorned', 'helmetCrown', 'helmetWizard', 'helmetHood',
    'helmetCap', 'helmetFlower', 'helmetPirate', 'helmetGold'],
  // pets keyed by logic id: { id, art }
  pets: {},
  petOrder: ['petSlime', 'petGhost', 'petCat', 'petOwlet', 'petDragon', 'petChick', 'petBunny', 'petFrog'],
};
for (const id of HERO_ART.helmetOrder) {
  const frame = RC.helmets[id];
  HERO_ART.helmets[id] = frame != null ? { id, art: dotted(id), frame } : { id, art: dotted(id), code: true };
}
for (const id of HERO_ART.petOrder) HERO_ART.pets[id] = { id, art: dotted(id) };

/** 'helmetCrown' -> 'helmet.crown', 'slimeGreen' -> 'slime.green' (logic ids to art keys). */
function dotted(id) { return id.replace(/^([a-z]+)([A-Z])(.*)$/, (_, a, b, c) => `${a}.${b.toLowerCase()}${c}`); }

// ---------------------------------------------------------------- registry
const ART = {};   // art key -> { texture, frame }
for (const [k, [sheet, idx]] of Object.entries(KENNEY)) ART[k] = { texture: sheet, frame: idx };
const CODE_KEYS = ['bat', 'mole', 'owl', 'dragon', 'dragon.sleep',
  'pet.slime', 'pet.ghost', 'pet.cat', 'pet.owlet', 'pet.dragon', 'pet.chick', 'pet.bunny', 'pet.frog',
  'bow', 'book', 'key', 'gem', 'crate', 'helmet', 'torch', 'torch.2',
  'ladder', 'shelf', 'tag.frame', 'hand.left', 'hand.right', 'foot', 'sparkle', 'coin', 'sword.foam', 'hero'];
for (const k of CODE_KEYS) ART[k] = { texture: T(k), frame: undefined };
for (const c of Object.keys(SLIME_COLOURS)) ART['slime.' + c] = { texture: T('slime.' + c), frame: undefined };
for (const m of Object.keys(CHEST_MARKS)) ART['chest.' + m] = { texture: T('chest.' + m), frame: undefined };
for (const h of Object.values(HERO_ART.helmets)) {
  ART[h.art] = h.code ? { texture: T(h.id + '.front'), frame: undefined } : { texture: 'rc', frame: h.frame };
}
ART.potion = ART['potion.red'];
ART.slime = ART['slime.green'];

/** Every art key artFrame() knows. */
export const ART_KEYS = Object.keys(ART);

const warned = new Set();
/** Art key (or logic id like 'slimeGreen') -> art key, or null. */
export function artKey(key) {
  if (key == null) return null;
  if (ART[key]) return key;
  const d = dotted(String(key));
  return ART[d] ? d : null;
}

/** { texture, frame } for an art key; a magenta placeholder (and one warning) for unknown keys. */
export function artFrame(key) {
  const k = artKey(key);
  if (k) return ART[k];
  if (!warned.has(key)) { warned.add(key); console.warn('[art] unknown art key', key); }
  return { texture: T('missing'), frame: undefined };
}

// ---------------------------------------------------------------- loading and building
/** Boot.preload: the two Kenney sheets. */
export function preloadArt(scene) {
  if (!scene.textures.exists('td')) {
    scene.load.spritesheet('td', 'dungeon/assets/tiny-dungeon.png?v=0', { frameWidth: 16, frameHeight: 16 });
  }
  if (!scene.textures.exists('rc')) {
    scene.load.spritesheet('rc', 'dungeon/assets/roguelike-characters.png?v=0', { frameWidth: 16, frameHeight: 16, spacing: 1 });
  }
}

/** Boot.create: draw every code texture once and set NEAREST on all art. Safe to call again. */
export function buildArt(scene) {
  const tx = scene.textures;
  for (const k of ['td', 'rc']) if (tx.exists(k)) tx.get(k).setFilter(nearest());
  if (tx.exists(T('missing'))) return;

  // creatures, objects, effects, hero parts
  for (const [k, spec] of Object.entries(PIX)) if (k !== 'slime') paint(scene, T(k), spec);
  for (const [c, pal] of Object.entries(SLIME_COLOURS)) paint(scene, T('slime.' + c), { ...PIX.slime, pal });
  const sleepy = PIX.dragon.rows.map((r, i) => (i === 5 ? r.replace('WK', 'mm') : i === 6 ? r.replace('WK', 'kk') : r));
  paint(scene, T('dragon.sleep'), { ...PIX.dragon, rows: sleepy });
  paint(scene, T('hand.right'), { ...PIX['hand.left'], rows: PIX['hand.left'].rows.map(r => [...r].reverse().join('')) });

  // marked chests: Tiny Dungeon chest + a cream badge with a dark mark (same colours on every chest)
  for (const [m, rows] of Object.entries(CHEST_MARKS)) {
    canvasTex(scene, T('chest.' + m), 16, 16, ctx => {
      drawFrame(scene, ctx, 'td', KENNEY.chest[1]);
      ctx.fillStyle = PAL.c;
      ctx.fillRect(5, 4, 6, 8); ctx.fillRect(4, 5, 8, 6);
      ctx.fillStyle = PAL.outline;
      rows.forEach((r, y) => [...r].forEach((ch, x) => { if (ch === '#') ctx.fillRect(5 + x, 5 + y, 1, 1); }));
    });
  }

  // default hero picture for KINDS.hero
  const keys = heroKeys(scene, { hero: { skin: 1, hairStyle: 0, hairColour: 1, tunic: 4 }, equipped: {} }, 'front');
  canvasTex(scene, T('hero'), 16, 16, ctx => {
    for (const k of [keys.body, keys.pants, keys.tunic, keys.hair]) {
      if (k.frame != null) drawFrame(scene, ctx, k.texture, k.frame);
      else ctx.drawImage(scene.textures.get(k.texture).getSourceImage(), 0, 0);
    }
  });

  canvasTex(scene, T('missing'), 16, 16, ctx => {
    ctx.fillStyle = '#ff00ff'; ctx.fillRect(0, 0, 16, 16); ctx.fillStyle = '#000'; ctx.fillRect(4, 4, 8, 8);
  });
}

// ---------------------------------------------------------------- canvas helpers
function canvasTex(scene, key, w, h, draw) {
  if (scene.textures.exists(key)) return key;
  const tex = scene.textures.createCanvas(key, w, h);
  const ctx = tex.getContext();
  ctx.imageSmoothingEnabled = false;
  draw(ctx);
  tex.refresh();
  tex.setFilter(nearest());
  return key;
}

function drawFrame(scene, ctx, sheet, idx, x = 0, y = 0) {
  const fr = scene.textures.getFrame(sheet, idx);
  ctx.drawImage(fr.source.image, fr.cutX, fr.cutY, fr.cutWidth, fr.cutHeight, x, y, fr.cutWidth, fr.cutHeight);
}

/** Pixel map -> canvas texture. spec { rows, pal?, outline? (default on), size? [w, h] }. */
function paint(scene, key, spec) {
  const rows = spec.rows;
  const w = spec.size ? spec.size[0] : Math.max(...rows.map(r => r.length));
  const h = spec.size ? spec.size[1] : rows.length;
  return canvasTex(scene, key, w, h, ctx => {
    const filled = new Uint8Array(w * h);
    rows.forEach((r, y) => [...r].forEach((ch, x) => {
      if (ch === '.' || ch === ' ') return;
      const col = (spec.pal && spec.pal[ch]) || PAL[ch];
      if (!col) throw new Error(`[art] ${key}: no colour for '${ch}'`);
      ctx.fillStyle = col; ctx.fillRect(x, y, 1, 1); filled[y * w + x] = 1;
    }));
    if (spec.outline === false) return;
    ctx.fillStyle = PAL.outline;
    const on = (x, y) => x >= 0 && y >= 0 && x < w && y < h && filled[y * w + x];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (!filled[y * w + x] && (on(x - 1, y) || on(x + 1, y) || on(x, y - 1) || on(x, y + 1))) ctx.fillRect(x, y, 1, 1);
    }
  });
}

const hex2 = (r, g, b) => '#' + [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
const rgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
const shade = (hex, f) => { const [r, g, b] = rgb(hex); return hex2(r * f, g * f, b * f); };

/** Copy a sheet frame into a new canvas texture, swapping exact colours (map: '#src' -> '#dst'). */
function recolour(scene, key, sheet, idx, map, post) {
  return canvasTex(scene, key, 16, 16, ctx => {
    drawFrame(scene, ctx, sheet, idx);
    const lower = {};
    for (const [a, b] of Object.entries(map)) lower[a.toLowerCase()] = b;
    const img = ctx.getImageData(0, 0, 16, 16), d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 128) continue;
      const to = lower[hex2(d[i], d[i + 1], d[i + 2])];
      if (to) { const [r, g, b] = rgb(to); d[i] = r; d[i + 1] = g; d[i + 2] = b; }
    }
    ctx.putImageData(img, 0, 0);
    if (post) post(ctx);
  });
}

/** Back of a helmet: the front with the face hole (head cols 4–11) filled with its main colour. */
function fillFaceHole(ctx) {
  const img = ctx.getImageData(0, 0, 16, 16), d = img.data, count = {};
  for (let i = 0; i < d.length; i += 4) if (d[i + 3] >= 128) { const k = `${d[i]},${d[i + 1]},${d[i + 2]}`; count[k] = (count[k] || 0) + 1; }
  const main = Object.entries(count).sort((a, b) => b[1] - a[1])[0];
  if (!main) return;
  const [r, g, b] = main[0].split(',').map(Number);
  for (let y = 1; y <= 7; y++) {
    const xs = [];
    for (let x = 0; x < 16; x++) if (d[(y * 16 + x) * 4 + 3] >= 128) xs.push(x);
    if (xs.length < 2) continue;
    for (let x = Math.max(xs[0], 4); x <= Math.min(xs[xs.length - 1], 11); x++) {
      const i = (y * 16 + x) * 4;
      if (d[i + 3] < 128) { d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255; }
    }
  }
  ctx.putImageData(img, 0, 0);
}

// ---------------------------------------------------------------- hero
const pickColour = (v, list) => (typeof v === 'string' && v[0] === '#' ? v : list[((v | 0) % list.length + list.length) % list.length]);
function pickStyle(v) {
  if (typeof v === 'string') return HERO_ART.hairStyles.find(s => s.id === v) || HERO_ART.hairStyles[0];
  return HERO_ART.hairStyles[((v | 0) % 5 + 5) % 5];
}
function pickId(v, order) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return order[v] || null;
  return order.includes(v) ? v : null;
}

/** Texture keys ({texture, frame}) for each hero layer of a look in one view. */
function heroKeys(scene, look, view) {
  const h = (look && look.hero) || {}, eq = (look && look.equipped) || {};
  const skin = pickColour(h.skin ?? 0, HERO_ART.skins);
  const hairC = pickColour(h.hairColour ?? 1, HERO_ART.hairColours);
  const tunic = pickColour(h.tunic ?? 0, HERO_ART.tunics);
  const style = pickStyle(h.hairStyle ?? 0);
  const S = RC.bodySrc, H = RC.hairSrc, U = RC.tunicSrc;
  const back = view === 'back';
  const tex = key => ({ texture: key, frame: undefined });

  const body = tex(recolour(scene, `hero.body${back ? 'B' : ''}.${skin}`, 'rc', RC.body,
    { [S.main]: skin, [S.shade]: shade(skin, 0.75), [S.eye]: back ? skin : shade(skin, 0.42) }));
  const tun = tex(recolour(scene, `hero.tunic.${tunic}`, 'rc', RC.tunic, { [U.main]: tunic, [U.shade]: shade(tunic, 0.72) }));
  const hair = back
    ? tex(paint(scene, `hero.hairB.${style.id}.${hairC}`,
      { rows: HAIR_BACK[style.id], pal: { h: hairC, s: shade(hairC, 0.7) }, outline: false, size: [16, 16] }))
    : tex(recolour(scene, `hero.hair.${style.id}.${hairC}`, 'rc', style.frame, { [H.main]: hairC, [H.shade]: shade(hairC, 0.7) }));

  let helmet = null;
  const hid = pickId(eq.helmet, HERO_ART.helmetOrder);
  if (hid) {
    const def = HERO_ART.helmets[hid];
    if (!back) helmet = def.code ? tex(T(hid + '.front')) : { texture: 'rc', frame: def.frame };
    else if (PIX[hid + '.back']) helmet = tex(T(hid + '.back'));
    else if (def.code) helmet = tex(canvasTex(scene, `hero.helmB.${hid}`, 16, 16, ctx => {
      ctx.drawImage(scene.textures.get(T(hid + '.front')).getSourceImage(), 0, 0); fillFaceHole(ctx);
    }));
    else helmet = tex(recolour(scene, `hero.helmB.${hid}`, 'rc', def.frame, {}, fillFaceHole));
  }
  const pid = pickId(eq.pet, HERO_ART.petOrder);
  const pet = pid ? artFrame(HERO_ART.pets[pid].art) : null;
  return { body, pants: { texture: 'rc', frame: RC.pants }, tunic: tun, hair, helmet, pet };
}

/**
 * The child's hero. Front view: Kenney layers (body, trousers, tunic, hair, helmet). Back view (wave rooms):
 * eye-less body, back hair and helmet backs, and a foam sword in each hand (.parts.swordL / swordR, grip at the hand).
 * The pet (if equipped) trails beside the hero, outside the 16 × 16 box: .pet (null when none).
 */
export function makeHero(scene, look, { view = 'front' } = {}) {
  const c = scene.add.container(0, 0);
  c.view = view;
  c.setSize(16, 16);
  const img = () => scene.add.image(0, 0, T('missing')).setOrigin(0.5, 1);
  c.pet = scene.add.image(-14, 0, T('missing')).setOrigin(0.5, 1).setVisible(false);
  c.parts = { body: img(), pants: img(), tunic: img(), hair: img(), helmet: img() };
  c.add([c.pet, c.parts.body, c.parts.pants, c.parts.tunic, c.parts.hair, c.parts.helmet]);
  // hand positions (art px, relative to the bottom-centre origin)
  c.hands = { left: { x: -6, y: -3 }, right: { x: 6, y: -3 } };
  if (view === 'back') {
    c.parts.swordL = scene.add.image(c.hands.left.x, c.hands.left.y, T('sword.foam')).setOrigin(0.5, 0.8).setAngle(-20);
    c.parts.swordR = scene.add.image(c.hands.right.x, c.hands.right.y, T('sword.foam')).setOrigin(0.5, 0.8).setAngle(20);
    c.add([c.parts.swordL, c.parts.swordR]);
  }
  c.petSide = 'left';
  c.setLook = newLook => {
    c.look = newLook;
    const k = heroKeys(scene, newLook, view);
    for (const name of ['body', 'pants', 'tunic', 'hair']) c.parts[name].setTexture(k[name].texture, k[name].frame);
    if (k.helmet) c.parts.helmet.setTexture(k.helmet.texture, k.helmet.frame).setVisible(true);
    else c.parts.helmet.setVisible(false);
    if (k.pet) c.pet.setTexture(k.pet.texture, k.pet.frame).setVisible(true);
    else c.pet.setVisible(false);
    return c;
  };
  /** Put the pet on one side, facing the hero (it trails behind the walking direction). */
  c.setPetSide = side => {
    c.petSide = side;
    c.pet.x = side === 'right' ? 14 : -14;
    c.pet.setFlipX(side === 'right');
    return c;
  };
  c.setLook(look);
  return c;
}

// ---------------------------------------------------------------- creatures
/** A creature or object sprite (origin bottom-centre). Code-drawn creatures face right; .setFacing('left') flips. */
export function makeCreature(scene, kind, facing = 'right') {
  const key = artKey(kind) || kind;
  const f = artFrame(key);
  const s = scene.add.sprite(0, 0, f.texture, f.frame).setOrigin(0.5, 1);
  s.artKey = key;
  s.setFacing = fc => { s.facing = fc === 'left' ? 'left' : 'right'; s.setFlipX(s.facing === 'left'); return s; };
  s.setFacing(facing);
  return s;
}

/**
 * One forward-leaning hop (or a looping idle hop with repeat: -1). Works on sprites with origin bottom-centre.
 * Less motion (window.__dungeonLessMotion or prefers-reduced-motion): 1 px, no lean, ≤ 150 ms.
 */
export function hop(sprite, { height = 3, repeat = 0, delay = 0, repeatDelay = 600 } = {}) {
  const scene = sprite.scene;
  if (sprite.__hop) { sprite.__hop.stop(); sprite.y = sprite.__hopY; sprite.angle = 0; }
  sprite.__hopY = sprite.y;
  const calm = reduced();
  const lean = calm ? 0 : (sprite.facing === 'left' ? -10 : 10);
  sprite.__hop = scene.tweens.add({
    targets: sprite,
    y: sprite.__hopY - (calm ? 1 : height),
    angle: lean,
    duration: calm ? 70 : 140,
    ease: 'Quad.easeOut',
    yoyo: true,
    delay,
    repeat,
    repeatDelay,
    onComplete: () => { sprite.y = sprite.__hopY; sprite.angle = 0; sprite.__hop = null; },
    onStop: () => { sprite.__hop = null; },
  });
  return sprite.__hop;
}

// ---------------------------------------------------------------- backdrop
/**
 * 192 × 108 art-px room: Tiny Dungeon brick faces tinted per floor (1 purple, 2 blue, 3 green, 4 gold),
 * a stone floor strip from y = 92, two flickering torches and one door in the middle.
 */
export function makeBackdrop(scene, floor = 1) {
  const P = FLOOR_STONE[floor] || FLOOR_STONE[1];
  const map = { [TD_STONE.mortar]: P.mortar, [TD_STONE.stone]: P.stone, [TD_STONE.hi]: P.hi,
    [TD_STONE.deep]: P.deep, [TD_STONE.mid]: P.mortar };
  const wall = recolour(scene, `bd.${floor}.wall`, 'td', KENNEY.wall[1], map);
  const grate = recolour(scene, `bd.${floor}.grate`, 'td', KENNEY['wall.grate'][1], map);
  const slab = recolour(scene, `bd.${floor}.slab`, 'td', KENNEY['floor.slab'][1], map);

  const c = scene.add.container(0, 0);
  c.setSize(192, 108);
  c.floorY = FLOOR_Y;
  for (let ty = 0; ty < 6; ty++) for (let tx = 0; tx < 12; tx++) {
    const isGrate = ty === 1 && (tx === 3 || tx === 8);
    c.add(scene.add.image(tx * 16, ty * 16, isGrate ? grate : wall).setOrigin(0, 0));
  }
  const g = scene.add.graphics();
  g.fillStyle(Phaser.Display.Color.HexStringToColor(P.ceiling).color, 1).fillRect(0, 0, 192, 3);
  c.add(g);
  for (let tx = 0; tx < 12; tx++) c.add(scene.add.image(tx * 16, FLOOR_Y, slab).setOrigin(0, 0));
  const edge = scene.add.graphics();
  edge.fillStyle(Phaser.Display.Color.HexStringToColor(P.deep).color, 1).fillRect(0, FLOOR_Y, 192, 1);
  c.add(edge);

  c.door = scene.add.image(96, FLOOR_Y, 'td', KENNEY.door[1]).setOrigin(0.5, 1);
  c.torches = [36, 156].map(x => scene.add.image(x, 52, T('torch')).setOrigin(0.5, 1));
  c.add([c.door, ...c.torches]);
  if (!reduced()) {
    let n = 0;
    const ev = scene.time.addEvent({ delay: 260, loop: true, callback: () => {
      n++;
      c.torches.forEach((t, i) => t.active && t.setTexture(T((n + i) % 2 ? 'torch.2' : 'torch')));
    } });
    c.once('destroy', () => ev.remove(false));
  }
  return c;
}
