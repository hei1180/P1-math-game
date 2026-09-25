// Rod Town adventure map 冒險地圖: four stacked worlds (W1 at the bottom) joined by one winding railway
// through 28 stations, fog over locked worlds, the player's train, streak flame and the sticker book.
import { WORLDS, RODS, LEVEL_COUNT, levelKey, isWorldOpen, isLevelOpen, isRushOpen } from '../../bonds-logic.js?v=202609251810';
import { UI, WORLD_THEME, textStyle } from '../theme.js?v=202609251810';
import { fx } from '../fx.js?v=202609251810';
import { sfx } from '../sfx.js?v=202609251810';
import { domLeft, roundButton, starPts } from '../ui/Chrome.js?v=202609251810';

const PER_WORLD = LEVEL_COUNT + 1; // levels 1..6 + boss house
// Horizontal position (0..1 of the track span) of level 1..6 and the boss in each world. Each world's
// level 1 sits straight above the previous boss so the railway climbs cleanly from world to world.
const PATH = {
  1: [0.3, 0.7, 0.86, 0.5, 0.14, 0.38, 0.78],
  2: [0.78, 0.45, 0.24, 0.5, 0.84, 0.62, 0.3],
  3: [0.3, 0.7, 0.86, 0.55, 0.16, 0.4, 0.75],
  4: [0.75, 0.4, 0.16, 0.45, 0.84, 0.6, 0.3],
};
const DECOR = {
  1: ['🌼', '🌷', '🌻', '🍀', '🌼', '🦋', '🐞'],
  2: ['🐚', '🦀', '🌴', '⛱️', '🐚', '🌴'],
  3: ['🍄', '🌲', '🌳', '🌲', '🍄', '🦉', '🐿️'],
  4: ['❄️', '⛄', '🐧', '🌲', '❄️', '🌲', '🐧'],
};
const LIVELY = new Set(['🦋', '🐞', '🦀', '🦉', '🐿️', '🐧']);
const BALLAST = { 1: 0xe9d8a6, 2: 0xc9a86a, 3: 0xcdb892, 4: 0xcbd5e1 };
// Medal for a cleared station's best stars: 3★ gold, 2★ silver, 1★ bronze.
const MEDAL = {
  3: { face: 0xfacc15, rim: 0xb45309, deep: 0xd97706, lite: 0xfef9c3, ribA: 0xef4444, ribB: 0x2563eb },
  2: { face: 0xe2e8f0, rim: 0x475569, deep: 0x94a3b8, lite: 0xffffff, ribA: 0x2563eb, ribB: 0x93c5fd },
  1: { face: 0xe29a5e, rim: 0x7c2d12, deep: 0xb45f2b, lite: 0xfde2c8, ribA: 0x16a34a, ribB: 0x86efac },
};
const LOCK_TEXT = {
  teacher: ['🔒 老師未開放', 'Locked'],
  house: ['🔒 打敗上一個世界的屋', 'Beat the previous house'],
};

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const css = hex => '#' + hex.toString(16).padStart(6, '0');
function mix(a, b, t) {
  const ch = s => [(a >> s) & 255, (b >> s) & 255];
  const m = s => { const [x, y] = ch(s); return Math.round(x + (y - x) * t); };
  return (m(16) << 16) | (m(8) << 8) | m(0);
}
function rngFrom(seed) { // mulberry32: stable decoration layout per world
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
/** Set scroll factor on an object and every descendant (input hit tests use each child's own factor). */
function setSF(obj, f) { if (obj.setScrollFactor) obj.setScrollFactor(f); if (obj.list) obj.list.forEach(c => setSF(c, f)); return obj; }

// ---- sticker rods: real Rod buddies when bonds/ui/Rod.js exists, a plain coloured bar otherwise ----
let rodModule = null;
const loadRod = () => (rodModule = rodModule || import('../ui/Rod.js?v=202609251810').catch(() => null));
function makeStickerRod(scene, x, y, len, unit) {
  const holder = scene.add.container(x, y);
  const fallback = () => { // same look as Rod: one square tall, joined squares, a face on the right end, no number
    const u = unit, w = len * u, h = u, rad = Math.max(2, Math.min(u * 0.22, 9)), b = Math.max(1, u * 0.075);
    const hex = RODS[len].hex, edge = len === 1 ? 0x94a3b8 : mix(hex, 0x000000, 0.28);
    const g = scene.add.graphics();
    g.fillStyle(0x000000, 0.15).fillRoundedRect(2, -h / 2 + 3, w, h, rad);
    g.fillStyle(len === 1 ? 0xdfe5ec : mix(hex, 0x000000, 0.09), 1).fillRoundedRect(0, -h / 2, w, h, rad);
    for (let i = 0; i < len; i++) {
      g.fillStyle(hex, 1).fillRoundedRect(i * u + b, -h / 2 + b * 0.7, u - 2 * b, h - b * 1.9, Math.min(u * 0.16, 6));
      g.fillStyle(0xffffff, len === 1 ? 0.9 : 0.3).fillRoundedRect(i * u + b * 1.5, -h / 2 + b, u - 3 * b, h * 0.15, Math.min(u * 0.08, 3));
    }
    g.lineStyle(Math.max(1, u * 0.045), edge, 0.6);
    for (let i = 1; i < len; i++) g.lineBetween(i * u, -h / 2 + 1, i * u, h / 2 - 1);
    g.lineStyle(Math.max(1.5, u * 0.05), edge, 1).strokeRoundedRect(0, -h / 2, w, h, rad);
    const fx0 = w - u / 2, dx = u * 0.21, er = Math.max(1.5, u * 0.13);
    g.fillStyle(0xffffff, 1).fillCircle(fx0 - dx, -u * 0.06, er).fillCircle(fx0 + dx, -u * 0.06, er);
    g.fillStyle(UI.ink, 1).fillCircle(fx0 - dx, -u * 0.06, er * 0.55).fillCircle(fx0 + dx, -u * 0.06, er * 0.55);
    g.lineStyle(Math.max(1.2, u * 0.055), len >= 6 && len <= 9 ? 0xffffff : UI.ink, 1);
    g.beginPath(); g.arc(fx0, u * 0.12, u * 0.12, Math.PI * 0.2, Math.PI * 0.8, false); g.strokePath();
    holder.add(g);
    setSF(holder, holder.scrollFactorX);
  };
  loadRod().then(mod => {
    if (!holder.scene) return; // closed / rebuilt meanwhile
    let rod = null;
    if (mod && mod.Rod) {
      try { rod = new mod.Rod(scene, 0, 0, len, { unit, labels: true }); } catch (e) { console.warn('sticker rod', e); rod = null; }
    }
    if (!rod) { fallback(); return; }
    holder.add(rod);
    setSF(rod, holder.scrollFactorX);
    if (typeof rod.mood === 'function') rod.mood('happy');
  });
  return holder;
}

// Start data: { focusW?, justDone?: { key, stars, newBest, prev?, sticker }, goTo?: { w, level: 1..6 | 'boss' } }.
// justDone plays the after-win sequence (medal award, fog, train to the next station, sticker); goTo ("Next" from a
// level) then chugs the train on to that station and opens it.
export class MapScene extends Phaser.Scene {
  constructor() { super('Map'); }
  init(data) { this.startData = data || {}; this.firstBuild = true; }

  create() {
    this.bridge = this.registry.get('bridge');
    this.cam = this.cameras.main;
    this.drag = null; this.vel = 0; this.leaving = false; this.book = null;
    this.makeTextures();
    this.build();
    fx.irisIn(this); this.pinIris();
    this.bindInput();
    this.onResize = () => {
      if (this.resizeTimer) this.resizeTimer.remove();
      this.resizeTimer = this.time.delayedCall(120, () => this.rebuild());
    };
    this.scale.on('resize', this.onResize);
    this.events.once('shutdown', () => { this.scale.off('resize', this.onResize); this.book = null; this.drag = null; });
  }

  /** fx.iris masks are drawn in world space; pin the one just created to the screen so it wipes from the centre of the view. */
  pinIris() {
    const list = this.children.list, g = list[list.length - 1];
    const m = g && g.mask && g.mask.geometryMask;
    if (m && m.setScrollFactor) m.setScrollFactor(0);
  }

  rebuild() {
    if (this.leaving) return;
    const L = this.L, H0 = this.scale.height;
    const frac = (this.cam.scrollY + H0 / 2) / L.mapH;
    const bookOpen = !!this.book;
    const target = this.travelTarget ? this.travelTarget.idx : -1; // a trip (or the Next sequence) was under way
    this.tweens.killAll(); this.time.removeAllEvents();
    this.children.list.slice().forEach(o => o.destroy());
    this.__fxLive = { n: 0 };
    this.book = null; this.drag = null; this.vel = 0;
    this.build();
    this.cam.scrollY = this.clampScroll(frac * this.L.mapH - this.scale.height / 2);
    if (target >= 0) { this.openNode(this.L.nodes[target]); return; } // the resize cut the trip short: open the stage now
    if (bookOpen) this.openBook(null, true);
  }

  // ---------------------------------------------------------------- layout
  layout() {
    const W = this.scale.width, H = this.scale.height;
    const r = Math.round(clamp(Math.min(W, H) / 14, 24, 30));
    const sp = Math.round(clamp(H * 0.12, 80, 100));
    const titleH = 116, bottomPad = 64, headH = 96, footH = 110;
    const bandH = bottomPad + 6 * sp + titleH;
    const mapH = headH + 4 * bandH + footH;
    const span = Math.min(W - 2 * (r + 22), 560);
    const xOf = f => W / 2 + (f - 0.5) * span;
    const top = w => headH + (4 - w) * bandH;
    const nodes = [];
    for (let w = 1; w <= 4; w++) {
      for (let i = 0; i < PER_WORLD; i++) {
        const level = i < LEVEL_COUNT ? i + 1 : 'boss';
        nodes.push({ w, level, i, idx: nodes.length, key: levelKey(w, level), x: xOf(PATH[w][i]), y: top(w) + bandH - bottomPad - i * sp });
      }
    }
    return { W, H, r, sp, titleH, headH, footH, bandH, mapH, span, xOf, top, nodes, start: { x: xOf(0.5), y: mapH - 48 } };
  }
  bandOf(y) { const L = this.L; return clamp(4 - Math.floor((y - L.headH) / L.bandH), 1, 4); }
  clampScroll(v) { return clamp(v, 0, Math.max(0, this.L.mapH - this.scale.height)); }

  // ---------------------------------------------------------------- build
  build() {
    const b = this.bridge;
    this.P = b.progress || { levels: {}, stickers: [], streak: { count: 0, lastDay: null } };
    this.unlock = (b.settings && b.settings.bondsUnlock) || {};
    this.test = !!b.testMode;
    const L = this.L = this.layout();
    const { W, nodes } = L;
    // no cam.setBounds: clampScroll() keeps the scroll in range (Phaser's bounds clamp assumes a centred camera origin)

    for (const n of nodes) {
      n.stars = this.P.levels[n.key] || 0;
      n.open = n.stars > 0 || isLevelOpen(this.P, n.w, n.level, this.unlock, this.test);
      n.medal = clamp(n.stars, 0, 3);
    }
    this.worldOpen = w => isWorldOpen(this.P, w, this.unlock, this.test);

    // Railway: one Catmull-Rom spline from the start station through all 28 stations.
    this.spline = new Phaser.Curves.Spline([new Phaser.Math.Vector2(L.start.x, L.start.y), ...nodes.map(n => new Phaser.Math.Vector2(n.x, n.y))]);
    this.spline.arcLengthDivisions = 3000;
    const pts = this.trackPts = this.spline.getSpacedPoints(Math.ceil(this.spline.getLength() / 12));
    this.normals = pts.map((p, i) => {
      const a = pts[Math.max(0, i - 1)], c = pts[Math.min(pts.length - 1, i + 1)];
      const dx = c.x - a.x, dy = c.y - a.y, d = Math.hypot(dx, dy) || 1;
      return { x: -dy / d, y: dx / d };
    });

    // Train rest spot: the next station to play (after the latest completed one), else the latest completed.
    let last = -1;
    nodes.forEach(n => { if (n.stars > 0) last = n.idx; });
    const front = last + 1 < nodes.length && nodes[last + 1].open ? last + 1 : Math.max(last, 0);
    this.current = nodes.find(n => n.open && !n.stars) || null;

    const jd = this.firstBuild ? this.startData.justDone : null;
    this.firstBuild = false;
    let plan = null;
    if (jd && jd.key) {
      const from = nodes.find(n => n.key === jd.key);
      if (from) {
        const to = from.idx + 1 < nodes.length && nodes[from.idx + 1].open ? nodes[from.idx + 1] : null;
        const m = /^w(\d)-boss$/.exec(jd.key);
        const k = m ? Number(m[1]) : 0;
        const fogW = k && k < 4 && jd.sticker === k && !this.test && this.worldOpen(k + 1) ? k + 1 : 0;
        // Medal award: test mode saves nothing, so the finished station shows at least this run's stars.
        from.medal = clamp(Math.max(from.stars, Math.round(Number(jd.stars) || 0)), 0, 3);
        const award = !!jd.newBest && from.medal > 0;
        const prevMedal = award ? clamp(Math.round(Number(jd.prev) || 0), 0, from.medal - 1) : from.medal;
        // "Next" from a level: after the win sequence the train carries on to goTo and opens it.
        const g = this.startData.goTo;
        const goKey = g && g.w >= 1 && g.w <= 4 && (g.level === 'boss' || (g.level >= 1 && g.level <= LEVEL_COUNT)) ? levelKey(g.w, g.level) : null;
        const goTo = goKey ? nodes.find(n => n.key === goKey && n.open) || null : null;
        plan = { from, to, fogW, sticker: jd.sticker || null, award, prevMedal, goTo };
      }
    }
    this.plan = plan;
    this.traveling = !!(plan && plan.goTo); // the Next sequence runs on its own: taps wait until the stage opens
    this.travelTarget = plan && plan.goTo ? plan.goTo : null;

    this.layers = {};
    this.fogs = {};
    for (let w = 1; w <= 4; w++) this.buildWorld(w);
    for (let w = 1; w <= 4; w++) {
      if (!this.worldOpen(w)) this.fogs[w] = this.makeFog(w, this.unlock['w' + w] ? 'house' : 'teacher');
      else if (plan && plan.fogW === w) this.fogs[w] = this.makeFog(w, 'house');
    }
    this.buildClouds();
    this.buildTrain(plan ? plan.from.idx : front);
    this.buildHud();

    // Initial camera position.
    let fy;
    if (plan) fy = plan.to ? (plan.from.y + plan.to.y) / 2 : plan.from.y;
    else {
      let fw = Number(this.startData.focusW) || 0;
      if (!(fw >= 1 && fw <= 4)) { fw = 1; for (let w = 1; w <= 4; w++) if (this.worldOpen(w)) fw = w; }
      const tn = nodes[this.trainIdx];
      const inW = nodes.filter(n => n.w === fw);
      fy = tn.w === fw ? tn.y : (inW.find(n => n.open && !n.stars) || inW[2]).y;
    }
    this.cam.scrollY = this.clampScroll(fy - L.H * 0.55);
    if (plan) this.playWin(plan);
  }

  // ---------------------------------------------------------------- world bands
  buildWorld(w) {
    const L = this.L, { W, r, bandH } = L;
    const th = WORLD_THEME[w], wd = WORLDS[w - 1];
    const t = L.top(w);
    const layer = this.layers[w] = this.add.container(0, 0).setDepth(1);
    layer.range = [w === 4 ? 0 : t, w === 1 ? L.mapH : t + bandH];
    const rng = rngFrom(1000 + w * 97);
    const g = this.add.graphics();
    layer.add(g);
    const bottom = w === 1 ? L.mapH : t + bandH;

    if (w === 4) { // header sky with snowy peaks behind the top of the map
      const steps = 8;
      for (let i = 0; i < steps; i++) g.fillStyle(mix(0xbfdbfe, th.sky, i / (steps - 1)), 1).fillRect(0, (L.headH * i) / steps, W, L.headH / steps + 1);
      for (let x = -40, k = 0; x < W + 40; x += 84, k++) {
        const pw = 110, ph = 44 + (k % 3) * 12, bx = x, by = t + 12;
        g.fillStyle(0x94a3b8, 1).fillTriangle(bx, by, bx + pw / 2, by - ph, bx + pw, by);
        g.fillStyle(0xffffff, 1).fillTriangle(bx + pw * 0.33, by - ph * 0.66, bx + pw / 2, by - ph, bx + pw * 0.67, by - ph * 0.66);
      }
    }
    g.fillStyle(th.ground, 1).fillRect(0, t, W, bottom - t);
    if (w === 4) { // wavy snow line over the peak bases
      const pts = [];
      for (let x = 0; x <= W + 20; x += 20) pts.push({ x, y: t + 4 + 6 * Math.sin(x / 40) });
      pts.push({ x: W + 20, y: t + 30 }, { x: 0, y: t + 30 });
      g.fillStyle(th.ground, 1).fillPoints(pts, true);
    }

    // Ground texture patches.
    const lite = w === 3 ? th.sky : mix(th.ground, 0xffffff, 0.3), dark = mix(th.ground, 0x000000, w === 3 ? 0.18 : 0.08);
    for (let k = 0; k < 16; k++) {
      const px = rng() * W, py = t + rng() * (bottom - t), pw = 60 + rng() * 120;
      g.fillStyle(k % 3 ? lite : (w === 4 ? th.sky : dark), w === 3 && k % 3 ? 0.18 : 0.45).fillEllipse(px, py, pw, pw * 0.45);
    }

    // Beach: sea along the left edge with a foamy shore and rolling wave lines.
    this.seaW = 0;
    if (w === 2) {
      const seaW = this.seaW = Math.max(W * 0.1, (W - L.span) / 2 - 10);
      const shore = [];
      for (let y = t; y <= t + bandH; y += 16) shore.push({ x: seaW + 7 * Math.sin((y - t) / 38), y });
      g.fillStyle(th.sky, 1).fillPoints([{ x: 0, y: t }, ...shore, { x: 0, y: t + bandH }], true);
      g.fillStyle(0x38bdf8, 0.35).fillPoints([{ x: 0, y: t }, ...shore.map(p => ({ x: p.x * 0.55, y: p.y })), { x: 0, y: t + bandH }], true);
      const foam = this.add.graphics();
      foam.lineStyle(4, 0xffffff, 0.9).strokePoints(shore);
      layer.add(foam);
      this.tweens.add({ targets: foam, alpha: 0.35, x: -3, duration: 1300, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      const waves = Math.round(bandH / 64);
      for (let k = 0; k < waves; k++) {
        const wx = 6 + rng() * Math.max(4, seaW - 34), wy = t + 20 + (k + rng() * 0.6) * (bandH - 40) / waves;
        const wg = this.add.graphics({ x: wx, y: wy });
        const wp = []; for (let i = 0; i <= 8; i++) wp.push({ x: i * 3, y: 3 * Math.sin(i * Math.PI / 4) });
        wg.lineStyle(2.5, 0xffffff, 0.9).strokePoints(wp);
        layer.add(wg);
        this.tweens.add({ targets: wg, x: wx + 8, alpha: 0.25, duration: 1400 + rng() * 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut', delay: rng() * 800 });
      }
      if (seaW > 90) for (let k = 0; k < 2; k++) this.addDecor(layer, k ? '⛵' : '🐠', 14 + rng() * (seaW - 50), t + 80 + rng() * (bandH - 160), 28, true, rng);
    }

    // Fringe: the ground of the world above spills over this band's top edge.
    if (w < 4) {
      const up = WORLD_THEME[w + 1].ground, pts = [];
      for (let x = 0; x <= W + 16; x += 16) pts.push({ x, y: t + 12 + 7 * Math.sin(x / 34 + w) });
      g.fillStyle(up, 1).fillPoints([{ x: 0, y: t }, ...pts, { x: W + 16, y: t }], true);
      g.lineStyle(3, 0xffffff, 0.3).strokePoints(pts);
    }

    // Start station below world 1.
    if (w === 1) {
      const s = L.start;
      g.fillStyle(0x000000, 0.12).fillRoundedRect(s.x - 60, s.y - 10, 120, 30, 10);
      g.fillStyle(0x94a3b8, 1).fillRoundedRect(s.x - 58, s.y - 14, 116, 26, 10);
      const hx = s.x + 88 > W - 10 ? s.x - 96 : s.x + 70;
      g.fillStyle(0xfffbeb, 1).fillRect(hx, s.y - 34, 40, 30);
      g.fillStyle(UI.bad, 1).fillTriangle(hx - 6, s.y - 34, hx + 20, s.y - 54, hx + 46, s.y - 34);
      g.fillStyle(0x92400e, 1).fillRoundedRect(hx + 14, s.y - 20, 12, 16, 3);
      const st = this.add.text(s.x, s.y + 30, '🚉 起點 Start', textStyle(16, '#14532d', { stroke: '#ffffff', strokeThickness: 4, padding: { x: 2, y: 4 } })).setOrigin(0.5);
      layer.add(st);
    }

    // Pond in the meadow.
    const pondAt = w === 1 ? this.freeSpot(w, 46, rng, []) : null;
    const placed = [];
    if (pondAt) {
      g.fillStyle(mix(th.ground, 0x065f46, 0.25), 1).fillEllipse(pondAt.x, pondAt.y + 3, 96, 58);
      g.fillStyle(th.sky, 1).fillEllipse(pondAt.x, pondAt.y, 88, 50);
      g.fillStyle(0xffffff, 0.5).fillEllipse(pondAt.x - 16, pondAt.y - 8, 30, 8);
      placed.push({ x: pondAt.x, y: pondAt.y, rad: 50 });
      this.addDecor(layer, '🦆', pondAt.x + 8, pondAt.y, 26, true, rng);
    }

    // Railway section for this band (drawn under the stations).
    const tg = this.add.graphics();
    layer.add(tg);
    this.drawTrack(tg, w);

    // Title sign + Rush pill on the side away from the boss house and the climbing track.
    const boss = L.nodes[(w - 1) * PER_WORLD + LEVEL_COUNT];
    const pad = 10;
    const [lo, hi] = boss.x > W / 2 ? [pad, boss.x - r * 1.5 - 18] : [boss.x + r * 1.5 + 18, W - pad];
    const sx = (lo + hi) / 2;
    const sign = this.makeSign(w, sx, t + 50, hi - lo);
    layer.add(sign);
    const rushOpen = isRushOpen(this.P, w, this.unlock, this.test);
    const pill = this.makeRush(w, sx, boss.y, rushOpen);
    layer.add(pill);
    placed.push({ x: sx, y: t + 50, rad: Math.min(hi - lo, 230) / 2 + 6 }, { x: sx, y: boss.y, rad: 66 });

    // Scattered decorations that avoid the railway, stations, sign and pill.
    const count = Math.round(clamp((W * bandH) / 11000, 10, 30) * (w === 3 ? 1.3 : 1));
    for (let k = 0; k < count; k++) {
      const size = 22 + rng() * 14;
      const at = this.freeSpot(w, size * 0.6, rng, placed);
      if (!at) continue;
      placed.push({ x: at.x, y: at.y, rad: size * 0.6 });
      const list = DECOR[w];
      this.addDecor(layer, list[Math.floor(rng() * list.length)], at.x, at.y, size, false, rng);
    }

    // Fireflies in the forest.
    if (w === 3) {
      const ff = this.add.particles(0, 0, 'dot', {
        x: { min: 0, max: W }, y: { min: t + 20, max: t + bandH - 20 }, lifespan: 2600, speed: { min: 4, max: 18 },
        scale: { start: 0.35, end: 0.1 }, alpha: { start: 1, end: 0 }, tint: [0xfde047, 0xfef08a], frequency: 420, blendMode: 'ADD',
      });
      layer.add(ff);
    }

    for (const n of L.nodes) if (n.w === w) layer.add(this.makeNode(n));
  }

  freeSpot(w, rad, rng, placed) {
    const L = this.L, t = L.top(w), bottom = w === 1 ? L.mapH - 70 : t + L.bandH;
    const minX = w === 2 ? this.seaW + 14 + rad : rad + 4;
    for (let tries = 0; tries < 40; tries++) {
      const x = minX + rng() * (L.W - rad - 4 - minX), y = t + 24 + rad + rng() * (bottom - t - 48 - 2 * rad);
      if (x < minX) continue;
      let ok = true;
      for (const p of this.trackPts) if (Math.abs(p.y - y) < rad + 22 && Math.hypot(p.x - x, p.y - y) < rad + 20) { ok = false; break; }
      if (!ok) continue;
      for (const n of L.nodes) if (Math.hypot(n.x - x, n.y - y) < rad + L.r * 1.6 + 14) { ok = false; break; }
      if (!ok) continue;
      for (const p of placed) if (Math.hypot(p.x - x, p.y - y) < rad + p.rad + 4) { ok = false; break; }
      if (ok) return { x, y };
    }
    return null;
  }

  addDecor(layer, emoji, x, y, size, lively, rng) {
    const d = this.add.text(x, y, emoji, { fontSize: `${Math.round(size)}px`, padding: { x: 2, y: 4 } }).setOrigin(0.5);
    layer.add(d);
    if (lively || LIVELY.has(emoji)) {
      if (emoji === '🦋' || emoji === '🐠' || emoji === '⛵') this.tweens.add({ targets: d, x: x + 14, y: y - 8, duration: 1800 + rng() * 1200, yoyo: true, repeat: -1, ease: 'Sine.easeInOut', delay: rng() * 1000 });
      else this.tweens.add({ targets: d, angle: { from: -8, to: 8 }, duration: 700 + rng() * 500, yoyo: true, repeat: -1, ease: 'Sine.easeInOut', delay: rng() * 800 });
    } else if (rng() < 0.3) {
      this.tweens.add({ targets: d, angle: { from: -4, to: 4 }, duration: 1600 + rng() * 800, yoyo: true, repeat: -1, ease: 'Sine.easeInOut', delay: rng() * 1500 });
    }
    return d;
  }

  drawTrack(g, w) {
    const pts = this.trackPts, nv = this.normals, n = pts.length, r = this.L.r;
    const inBand = i => i >= 0 && i < n && this.bandOf(pts[i].y) === w;
    const runs = []; let cur = null;
    for (let i = 0; i < n; i++) {
      if (inBand(i) || inBand(i - 1) || inBand(i + 1)) (cur = cur || []).push(i);
      else if (cur) { runs.push(cur); cur = null; }
    }
    if (cur) runs.push(cur);
    const off = (i, d) => ({ x: pts[i].x + nv[i].x * d, y: pts[i].y + nv[i].y * d });
    for (const run of runs) {
      g.lineStyle(r * 1.05, 0x000000, 0.12).strokePoints(run.map(i => ({ x: pts[i].x, y: pts[i].y + 4 })));
      g.lineStyle(r * 0.85, BALLAST[w], 1).strokePoints(run.map(i => pts[i]));
    }
    const half = r * 0.4;
    g.lineStyle(4, 0x8b5a2b, 1);
    for (let i = 0; i < n; i++) if (inBand(i)) g.lineBetween(pts[i].x - nv[i].x * half, pts[i].y - nv[i].y * half, pts[i].x + nv[i].x * half, pts[i].y + nv[i].y * half);
    const gap = r * 0.2;
    for (const run of runs) {
      g.lineStyle(3, 0x475569, 1).strokePoints(run.map(i => off(i, gap)));
      g.strokePoints(run.map(i => off(i, -gap)));
    }
  }

  makeSign(w, x, y, maxW) {
    const th = WORLD_THEME[w], wd = WORLDS[w - 1];
    const c = this.add.container(x, y);
    const big = this.add.text(0, -9, `${th.emoji} W${w} ${wd.zh}`, textStyle(24, '#1f2937', { padding: { x: 2, y: 4 } })).setOrigin(0.5);
    const small = this.add.text(0, 17, `${wd.en} · ${wd.min}-${wd.max}`, textStyle(14, '#475569')).setOrigin(0.5);
    const bw = Math.max(big.width, small.width) + 34, bh = 66;
    const g = this.add.graphics();
    g.fillStyle(0x8b5a2b, 1).fillRect(-bw / 2 + 18, bh / 2 - 6, 8, 18).fillRect(bw / 2 - 26, bh / 2 - 6, 8, 18);
    g.fillStyle(0x000000, 0.15).fillRoundedRect(-bw / 2 + 3, -bh / 2 + 5, bw, bh, 16);
    g.fillStyle(UI.paper, 1).fillRoundedRect(-bw / 2, -bh / 2, bw, bh, 16);
    g.lineStyle(4, th.accent, 1).strokeRoundedRect(-bw / 2, -bh / 2, bw, bh, 16);
    c.add([g, big, small]);
    c.setScale(Math.min(1, maxW / (bw + 4)));
    return c;
  }

  makeRush(w, x, y, open) {
    const c = this.add.container(x, y);
    const pw = 118, ph = 48;
    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.15).fillRoundedRect(-pw / 2 + 2, -ph / 2 + 4, pw, ph, ph / 2);
    g.fillStyle(open ? 0xf97316 : 0xe5e7eb, 1).fillRoundedRect(-pw / 2, -ph / 2, pw, ph, ph / 2);
    g.lineStyle(3, open ? 0xffffff : 0xcbd5e1, 1).strokeRoundedRect(-pw / 2, -ph / 2, pw, ph, ph / 2);
    const label = this.add.text(0, 0, '⏱ Rush', textStyle(21, open ? '#ffffff' : '#9ca3af', { padding: { x: 2, y: 4 } })).setOrigin(0.5);
    c.add([g, label]);
    if (!open) c.add(this.add.text(pw / 2 - 6, -ph / 2 + 2, '🔒', { fontSize: '17px', padding: { x: 2, y: 3 } }).setOrigin(0.5));
    else this.tweens.add({ targets: c, scale: 1.06, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    c.setSize(pw, ph).setInteractive({ useHandCursor: true });
    c.on('pointerup', () => {
      if (!this.tapOK()) return;
      if (open) { sfx.whoosh(); this.leave('Rush', { w }); }
      else { sfx.bonk(); this.wobble(c); fx.floatText(this, x, y - 30, '先打敗數字屋 🏠', '#f97316'); }
    });
    return c;
  }

  makeNode(n) {
    const r = this.L.r, th = WORLD_THEME[n.w], boss = n.level === 'boss';
    const c = this.add.container(n.x, n.y);
    const shadowY = boss ? r * 1.1 : r * 0.8;
    c.add(this.add.ellipse(0, shadowY, (boss ? 2.6 : 1.8) * r, r * 0.55, 0x000000, 0.18));
    const body = this.add.container(0, 0);
    if (this.current === n) {
      const glow = this.add.circle(0, boss ? r * 0.2 : 0, boss ? r * 1.5 : r + 6, UI.gold, 0.7);
      body.add(glow);
      this.tweens.add({ targets: glow, scale: 1.35, alpha: 0, duration: 1300, repeat: -1, ease: 'Sine.easeOut' });
    }
    const g = this.add.graphics();
    body.add(g);
    // Before a justDone award the finished station still wears its old medal (or none); awardMedal() upgrades it.
    const shown = this.plan && this.plan.from === n && this.plan.award ? this.plan.prevMedal : n.medal;
    if (boss) this.drawHouse(g, body, n, th);
    else {
      this.drawLevelFace(g, n, shown);
      if (n.open) body.add(this.add.text(0, 1, String(n.level), textStyle(r * 1.05, n.medal ? '#ffffff' : css(th.accent), { padding: { x: 2, y: 4 } })).setOrigin(0.5));
      else body.add(this.add.text(0, 0, '🔒', { fontSize: `${Math.round(r * 0.9)}px`, padding: { x: 2, y: 4 } }).setOrigin(0.5));
    }
    n.faceG = g;
    c.add(body);
    n.medalView = null;
    if (n.medal > 0) { // the "done" signal: a medal hanging at the station's lower right
      const R = boss ? r * 0.66 : r * 0.6;
      const m = this.makeMedal(shown || n.medal, R);
      if (boss) m.setPosition(r * 1.0, -r * 0.2).setAngle(-16);
      else m.setPosition(r * 0.5, r * 0.62).setAngle(-24);
      m.rest = m.angle;
      if (!shown) m.setScale(0); // first clear: pops in with the award
      body.add(m);
      if (!fx.lessMotion) this.tweens.add({ targets: m, angle: m.rest + 7, duration: 1500 + (n.idx % 5) * 90, yoyo: true, repeat: -1, ease: 'Sine.easeInOut', delay: (n.idx * 211) % 1500 });
      n.medalView = m;
    }
    if (n.open) this.tweens.add({ targets: body, y: { from: -3, to: 3 }, duration: 1200, yoyo: true, repeat: -1, ease: 'Sine.easeInOut', delay: (n.idx * 173) % 1200 });

    const hs = boss ? r * 3 : r * 2 + 20;
    c.setSize(hs, hs).setInteractive({ hitArea: new Phaser.Geom.Circle(hs / 2, hs / 2, hs / 2), hitAreaCallback: Phaser.Geom.Circle.Contains, useHandCursor: n.open });
    c.on('pointerdown', () => { if (!this.book && !this.traveling && !this.leaving) this.tweens.add({ targets: body, scale: 0.88, duration: 70 }); });
    c.on('pointerout', () => { body.setScale(1); });
    c.on('pointerup', () => {
      body.setScale(1);
      if (!this.tapOK()) return;
      if (n.open) {
        this.tweens.add({ targets: body, scale: 1.2, duration: 120, yoyo: true });
        this.travelTo(n, () => this.openNode(n));
      } else {
        sfx.bonk(); this.wobble(body);
        fx.floatText(this, n.x, n.y - r, '🔒', '#64748b');
      }
    });
    n.view = c; n.body = body;
    return c;
  }

  /** Level station face: grey when locked, white with a world-accent rim when open, accent fill with a medal-coloured rim when cleared. */
  drawLevelFace(g, n, tier) {
    const r = this.L.r, th = WORLD_THEME[n.w], done = n.medal > 0;
    g.clear();
    g.fillStyle(!n.open ? 0xd1d5db : done ? th.accent : 0xffffff, 1).fillCircle(0, 0, r);
    if (tier) {
      const M = MEDAL[tier];
      g.lineStyle(6, M.face, 1).strokeCircle(0, 0, r);
      g.lineStyle(1.5, M.rim, 0.85).strokeCircle(0, 0, r + 3).strokeCircle(0, 0, r - 3);
    } else g.lineStyle(5, !n.open ? 0x9ca3af : done ? 0xffffff : th.accent, 1).strokeCircle(0, 0, r);
    g.fillStyle(0xffffff, n.open && !done ? 0.0 : 0.3).fillEllipse(-r * 0.3, -r * 0.42, r * 0.8, r * 0.4);
  }

  // ---------------------------------------------------------------- medals
  /** A hanging medal: the container sits at the ribbon's pin, the disc hangs L below it (so an angle tween swings it). */
  makeMedal(tier, R) {
    const m = this.add.container(0, 0);
    const g = this.add.graphics();
    m.add(g);
    m.g = g; m.R = R; m.Lh = R * 1.55; m.tier = tier;
    this.drawMedal(m, tier);
    return m;
  }

  drawMedal(m, tier) {
    const g = m.g, R = m.R, L = m.Lh, M = MEDAL[tier];
    m.tier = tier;
    g.clear();
    // ribbon: two crossed tails from the pin down behind the disc
    const tail = (sx, col, stripe) => {
      const pts = [{ x: sx * 0.9 * R, y: 0 }, { x: sx * 0.28 * R, y: 0 }, { x: -sx * 0.3 * R, y: L - 0.3 * R }, { x: sx * 0.3 * R, y: L - 0.3 * R }];
      g.fillStyle(col, 1).fillPoints(pts, true);
      g.lineStyle(Math.max(1.5, R * 0.14), stripe, 0.9).lineBetween(sx * 0.59 * R, 0, 0, L - 0.3 * R);
      g.lineStyle(1, 0x000000, 0.3).strokePoints(pts, true, true);
    };
    tail(-1, M.ribA, M.ribB);
    tail(1, M.ribB, M.ribA);
    g.fillStyle(0x475569, 1).fillRoundedRect(-0.95 * R, -0.22 * R, 1.9 * R, 0.36 * R, 0.12 * R); // pin bar
    // disc: shadow, rim, face, inner ring
    g.fillStyle(0x000000, 0.22).fillCircle(1.5, L + 2.5, R);
    g.fillStyle(M.rim, 1).fillCircle(0, L, R);
    g.fillStyle(M.deep, 1).fillCircle(0, L, R * 0.88);
    g.fillStyle(M.face, 1).fillCircle(0, L, R * 0.8);
    g.lineStyle(Math.max(1, R * 0.07), M.deep, 0.8).strokeCircle(0, L, R * 0.64);
    // embossed star: light edge up-left, dark edge down-right, face on top
    const sr = R * 0.5, e = Math.max(0.8, R * 0.07);
    g.fillStyle(M.lite, 1).fillPoints(starPts(sr, -e, L - e), true);
    g.fillStyle(M.rim, 0.75).fillPoints(starPts(sr, e, L + e), true);
    g.fillStyle(mix(M.face, 0xffffff, 0.25), 1).fillPoints(starPts(sr, 0, L), true);
    // shine
    g.fillStyle(0xffffff, 0.65).fillEllipse(-R * 0.36, L - R * 0.42, R * 0.52, R * 0.24);
    g.fillStyle(0xffffff, 0.9).fillCircle(R * 0.42, L - R * 0.46, Math.max(1, R * 0.08));
  }

  /** Disc centre of a node's medal in world space. */
  medalAt(n) {
    const m = n.medalView, a = Phaser.Math.DegToRad(m.angle);
    return { x: n.x + n.body.x + m.x - m.Lh * Math.sin(a), y: n.y + n.body.y + m.y + m.Lh * Math.cos(a) };
  }

  /** A white band sweeps diagonally across the disc (clipped to the disc: chord polygons, no mask). */
  shineMedal(m, times = 1) {
    if (fx.lessMotion || !m.active) return;
    const g = this.add.graphics();
    m.add(g);
    const R = m.R * 0.8, L = m.Lh, u = { x: Math.SQRT1_2, y: Math.SQRT1_2 }, v = { x: -u.y, y: u.x }, bw = R * 0.45;
    const chord = d => { const h = Math.sqrt(Math.max(0, R * R - d * d)); return [{ x: d * u.x + h * v.x, y: L + d * u.y + h * v.y }, { x: d * u.x - h * v.x, y: L + d * u.y - h * v.y }]; };
    const s = { d: -R - bw };
    this.tweens.add({
      targets: s, d: R, duration: 420, ease: 'Sine.easeInOut', repeat: times - 1, repeatDelay: 160,
      onUpdate: () => {
        g.clear();
        const d1 = clamp(s.d, -R, R), d2 = clamp(s.d + bw, -R, R);
        if (d2 - d1 < 0.5) return;
        const [a, b] = chord(d1), [c2, d] = chord(d2);
        g.fillStyle(0xffffff, 0.75).fillPoints([a, b, d, c2], true);
      },
      onComplete: () => g.destroy(),
    });
  }

  /** justDone: a new best pops the medal in (or flips the old one over to the better medal) with a shine and a star sound. */
  awardMedal(plan) {
    const n = plan.from, m = n.medalView;
    if (!m || !plan.award || !m.active) return false;
    const tier = n.medal, upgrade = plan.prevMedal > 0;
    const pop = () => {
      this.drawMedal(m, tier);
      if (n.level !== 'boss') this.drawLevelFace(n.faceG, n, tier);
      m.setScale(fx.lessMotion ? 1 : 0.2);
      this.tweens.add({ targets: m, scale: 1, duration: 420, ease: 'Back.easeOut', easeParams: [3] });
      sfx.star(tier + 1);
      const p = this.medalAt(n), M = MEDAL[tier];
      fx.burst(this, p.x, p.y, { count: tier === 3 ? 14 : 10, tint: [M.face, M.lite, 0xffffff] });
      this.time.delayedCall(260, () => { if (m.active) { this.shineMedal(m, tier === 3 ? 2 : 1); sfx.star(4); } });
    };
    if (upgrade && !fx.lessMotion) this.tweens.add({ targets: m, scaleX: 0, duration: 140, ease: 'Sine.easeIn', onComplete: pop });
    else pop();
    return true;
  }

  drawHouse(g, body, n, th) {
    const r = this.L.r, open = n.open;
    const bw = r * 2.2, top = -r * 0.3, bh = r * 1.3;
    const wall = open ? UI.paper : 0xe5e7eb, roof = open ? th.accent : 0x9ca3af, line = open ? UI.ink : 0x9ca3af;
    g.fillStyle(open ? 0xf59e0b : 0x9ca3af, 1).fillRect(r * 0.45, -r * 1.2, r * 0.3, r * 0.6); // chimney
    g.fillStyle(wall, 1).fillRect(-bw / 2, top, bw, bh);
    g.lineStyle(3, line, 0.7).strokeRect(-bw / 2, top, bw, bh);
    g.fillStyle(roof, 1).fillTriangle(-bw / 2 - 8, top + 2, 0, -r * 1.45, bw / 2 + 8, top + 2);
    g.lineStyle(3, 0xffffff, 0.8).strokeTriangle(-bw / 2 - 8, top + 2, 0, -r * 1.45, bw / 2 + 8, top + 2);
    g.fillStyle(open ? 0x92400e : 0x9ca3af, 1).fillRoundedRect(-r * 0.3, top + bh - r * 0.85, r * 0.6, r * 0.85, { tl: 8, tr: 8, bl: 0, br: 0 });
    g.fillStyle(open ? 0xfde047 : 0xf3f4f6, 1).fillRect(-bw / 2 + r * 0.22, top + r * 0.25, r * 0.42, r * 0.42).fillRect(bw / 2 - r * 0.64, top + r * 0.25, r * 0.42, r * 0.42);
    g.lineStyle(2, 0x6b7280, 1).lineBetween(0, -r * 1.45, 0, -r * 1.95);
    g.fillStyle(open ? UI.bad : 0x9ca3af, 1).fillTriangle(0, -r * 1.95, r * 0.5, -r * 1.8, 0, -r * 1.65);
    if (!open) body.add(this.add.text(0, top + bh * 0.45, '🔒', { fontSize: `${Math.round(r * 0.8)}px`, padding: { x: 2, y: 4 } }).setOrigin(0.5));
  }

  // ---------------------------------------------------------------- fog
  makeFog(w, why) {
    const L = this.L, { W, bandH } = L, t = L.top(w);
    const h = w === 1 ? L.mapH - t : bandH;
    const c = this.add.container(0, 0).setDepth(8);
    c.range = [t - 40, t + h + 40];
    const rect = this.add.rectangle(0, t - 4, W, h + 8, 0xffffff, 0.85).setOrigin(0);
    c.add(rect);
    const rng = rngFrom(77 + w);
    const puffs = [];
    for (const edge of [t + 10, t + h - 24]) { // keep the puffy rim inside the band so neighbour signs stay readable
      for (let x = -10; x < W + 40; x += 40) {
        const p = this.add.image(x + rng() * 16, edge + (rng() - 0.5) * 14, 'puff').setScale(1.6 + rng() * 0.8).setAlpha(0.95);
        puffs.push(p);
      }
    }
    for (let k = 0; k < 8; k++) puffs.push(this.add.image(rng() * W, t + 40 + rng() * (h - 80), 'puff').setScale(3 + rng() * 3).setAlpha(0.55));
    puffs.forEach(p => { c.add(p); this.tweens.add({ targets: p, x: p.x + 10 + rng() * 14, duration: 2600 + rng() * 2400, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' }); });

    const th = WORLD_THEME[w], wd = WORLDS[w - 1];
    const [zh, en] = LOCK_TEXT[why];
    const card = this.add.container(W / 2, t + bandH / 2);
    const head = this.add.text(0, -40, `${th.emoji} W${w} ${wd.zh} ${wd.en}`, textStyle(16, '#64748b', { padding: { x: 2, y: 4 } })).setOrigin(0.5);
    const big = this.add.text(0, -6, zh, textStyle(26, '#1f2937', { padding: { x: 2, y: 4 } })).setOrigin(0.5);
    const small = this.add.text(0, 26, en, textStyle(16, '#475569')).setOrigin(0.5);
    const cw = Math.max(head.width, big.width, small.width) + 40, ch = 116;
    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.08).fillRoundedRect(-cw / 2 + 3, -ch / 2 + 6, cw, ch, 20);
    g.fillStyle(0xffffff, 1).fillRoundedRect(-cw / 2, -ch / 2, cw, ch, 20);
    g.lineStyle(3, 0xcbd5e1, 1).strokeRoundedRect(-cw / 2, -ch / 2, cw, ch, 20);
    card.add([g, head, big, small]);
    card.setScale(Math.min(1, (W - 24) / cw));
    c.add(card);
    this.tweens.add({ targets: card, y: card.y - 5, duration: 1600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    rect.setInteractive();
    rect.on('pointerup', () => { if (!this.tapOK()) return; sfx.bonk(); this.wobble(card); });
    c.card = card; c.puffs = puffs;
    return c;
  }

  clearFog(w) {
    const c = this.fogs[w];
    if (!c) return;
    delete this.fogs[w];
    sfx.whoosh();
    c.list.forEach(o => o.disableInteractive && o.input && o.disableInteractive());
    this.tweens.add({ targets: c.card, scale: c.card.scale * 1.25, duration: 700, ease: 'Cubic.easeOut' });
    c.puffs.forEach((p, i) => this.tweens.add({ targets: p, scale: p.scale * 1.7, x: p.x + (p.x < this.L.W / 2 ? -60 : 60), duration: 700, ease: 'Cubic.easeOut', delay: (i % 5) * 20 }));
    this.tweens.add({ targets: c, alpha: 0, duration: 700, ease: 'Sine.easeIn', onComplete: () => c.destroy() });
    fx.burst(this, c.card.x, c.card.y, { count: 14 });
  }

  // ---------------------------------------------------------------- clouds, train, HUD
  buildClouds() {
    const L = this.L, f = 0.55;
    const range = f * Math.max(0, L.mapH - L.H) + L.H + 120;
    const count = Math.max(4, Math.ceil(range / 260));
    this.clouds = [];
    const rng = rngFrom(4242);
    for (let k = 0; k < count; k++) {
      const c = this.add.container(rng() * (L.W + 200) - 100, -60 + (k + rng() * 0.7) * (range / count)).setDepth(7).setAlpha(0.38);
      [[-24, 5, 1.3], [0, -6, 1.8], [24, 5, 1.4], [4, 9, 1.5]].forEach(([x, y, s]) => c.add(this.add.image(x, y, 'puff').setScale(s)));
      c.setScale(0.8 + rng() * 0.7);
      setSF(c, f);
      c.vx = 5 + rng() * 9;
      this.clouds.push(c);
    }
  }

  makeTextures() {
    if (this.textures.exists('mapTrain')) return;
    const g = this.make.graphics({ add: false });
    g.fillStyle(0x1e3a8a, 1).fillRect(2, 2, 26, 6);
    g.fillStyle(0x2563eb, 1).fillRoundedRect(4, 6, 22, 27, 4);
    g.fillStyle(0xe0f2fe, 1).fillRoundedRect(8, 11, 14, 10, 3);
    g.fillStyle(0xef4444, 1).fillRoundedRect(22, 15, 32, 18, 8);
    g.fillStyle(0xfacc15, 1).fillRect(31, 15, 3, 18).fillRect(42, 15, 3, 18);
    g.fillStyle(0x1f2937, 1).fillRect(43, 5, 7, 11);
    g.fillStyle(0xfacc15, 1).fillRect(41, 2, 11, 4);
    g.fillStyle(0xfde68a, 1).fillCircle(53, 24, 7);
    g.fillStyle(0x1f2937, 1).fillCircle(51, 22, 1.5).fillCircle(55.5, 22, 1.5);
    g.lineStyle(1.5, 0x1f2937, 1).beginPath().arc(53, 24.5, 3.2, 0.3, Math.PI - 0.3).strokePath();
    g.fillStyle(0x374151, 1).fillRect(4, 31, 52, 4);
    g.fillStyle(0xfacc15, 1).fillTriangle(55, 30, 62, 38, 55, 38);
    [13, 29, 44].forEach(x => { g.fillStyle(0x1f2937, 1).fillCircle(x, 37, 6); g.fillStyle(0x9ca3af, 1).fillCircle(x, 37, 2); });
    g.generateTexture('mapTrain', 64, 44);
    g.destroy();
  }

  trainSpot(idx) {
    const n = this.L.nodes[idx], r = this.L.r;
    return { x: n.x, y: n.y - (n.level === 'boss' ? r * 1.35 : r * 0.95), t: (idx + 1) / this.L.nodes.length };
  }

  buildTrain(idx) {
    const r = this.L.r;
    this.trainIdx = idx;
    const s = this.trainSpot(idx);
    const c = this.train = this.add.container(s.x, s.y).setDepth(5);
    const scale = (r * 2.3) / 64;
    const img = this.add.image(0, 0, 'mapTrain').setOrigin(0.5, 1).setScale(scale);
    c.add(img);
    const name = (this.bridge.player && this.bridge.player.name) || '';
    if (name) {
      const tag = this.add.text(0, -44 * scale - 12, name.slice(0, 8), textStyle(13, '#ffffff', { backgroundColor: '#1f2937cc', padding: { x: 6, y: 2 } })).setOrigin(0.5);
      c.add(tag);
    }
    c.img = img; c.scaleF = scale;
    this.tweens.add({ targets: img, y: -1.5, duration: 420, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    this.time.addEvent({ delay: 700, loop: true, callback: () => this.steam() });
  }

  steam() {
    const c = this.train;
    if (!c || !c.active || fx.lessMotion) return;
    const s = c.scaleF, dir = c.img.flipX ? -1 : 1;
    const p = this.add.image(c.x + dir * (46 - 32) * s, c.y - 42 * s, 'puff').setDepth(6).setScale(0.25).setAlpha(0.85);
    this.tweens.add({ targets: p, y: p.y - 26, x: p.x - dir * 6, scale: 0.75, alpha: 0, duration: 950, ease: 'Sine.easeOut', onComplete: () => p.destroy() });
  }

  /** Fraction of the railway's length at a train spot (for constant-speed travel along the spline). */
  arcU(t) {
    const ls = this.spline.getLengths(), n = ls.length - 1;
    return ls[clamp(Math.round(t * n), 0, n)] / ls[n];
  }

  /** Trip time for the distance between two stations: ~0.5 s next door, ≤ 1.5 s across the map. */
  travelDur(fromIdx, toIdx) {
    const len = this.spline.getLength() * Math.abs(this.arcU(this.trainSpot(toIdx).t) - this.arcU(this.trainSpot(fromIdx).t));
    const d = clamp(350 + len * 0.7, 500, 1500);
    return fx.lessMotion ? Math.round(d * 0.6) : d;
  }

  /** Chug the player's train along the railway to station toIdx (toot, steam, camera follows), then onDone. */
  chug(toIdx, dur, onDone) {
    const L = this.L, nodes = L.nodes, from = nodes[this.trainIdx], to = nodes[toIdx];
    const a = this.trainSpot(from.idx), b = this.trainSpot(toIdx);
    const offA = a.y - from.y, offB = b.y - to.y;
    const uA = this.arcU(a.t), uB = this.arcU(b.t);
    this.tweens.killTweensOf(this.train);
    this.train.setPosition(a.x, a.y);
    sfx.toot();
    const u = { v: 0 };
    let px = this.train.x, lastPuff = 0;
    this.tweens.add({
      targets: u, v: 1, duration: dur, ease: 'Sine.easeInOut',
      onUpdate: () => {
        const p = this.spline.getPoint(this.spline.getUtoTmapping(uA + (uB - uA) * u.v));
        this.train.setPosition(p.x, p.y + offA + (offB - offA) * u.v);
        if (Math.abs(p.x - px) > 0.5) this.train.img.setFlipX(p.x < px);
        px = p.x;
        if (this.time.now - lastPuff > 150) { lastPuff = this.time.now; this.steam(); }
        if (!this.drag) this.cam.scrollY = this.clampScroll(Phaser.Math.Linear(this.cam.scrollY, this.train.y - L.H * 0.55, 0.2));
      },
      onComplete: () => {
        this.trainIdx = toIdx;
        this.train.setPosition(b.x, b.y);
        this.train.img.setFlipX(false);
        fx.puff(this, this.train.x, this.train.y);
        this.tweens.add({ targets: this.train, y: b.y - 8, duration: 140, yoyo: true });
        if (onDone) onDone();
      },
    });
  }

  /** Tap on an open station: the train travels there (or hops "ready" if it is already there), then onDone. Taps meanwhile are ignored. */
  travelTo(n, onDone) {
    if (this.leaving) return;
    this.traveling = true; this.travelTarget = n;
    if (n.idx === this.trainIdx) {
      sfx.tick(5);
      const y0 = this.trainSpot(n.idx).y;
      this.tweens.killTweensOf(this.train);
      this.train.y = y0;
      this.tweens.add({ targets: this.train, y: y0 - 12, duration: 150, yoyo: true, ease: 'Quad.easeOut', onComplete: () => { this.steam(); if (onDone) onDone(); } });
      return;
    }
    this.chug(n.idx, this.travelDur(this.trainIdx, n.idx), () => this.time.delayedCall(120, () => { if (onDone) onDone(); }));
  }

  /** Iris into the station's Level / House. */
  openNode(n) {
    if (this.leaving) return;
    sfx.whoosh();
    fx.burst(this, n.x, n.y, { count: 8 });
    if (n.level === 'boss') this.leave('House', { w: n.w });
    else this.leave('Level', { w: n.w, level: n.level });
  }

  /**
   * After a win: award the finished station's medal, clear fog of a newly opened world, chug to the next station,
   * show a new sticker. With plan.goTo ("Next" from a level) the train carries on to that station and opens it.
   */
  playWin(plan) {
    let t = 450;
    this.time.delayedCall(t, () => { fx.burst(this, plan.from.x, plan.from.y, { count: 12 }); sfx.star(1); this.awardMedal(plan); });
    if (plan.award) t += 650; // let the medal pop and shine before the train leaves
    if (plan.fogW) { t += 150; this.time.delayedCall(t, () => this.clearFog(plan.fogW)); t += 750; }
    const go = plan.goTo;
    const openGo = () => {
      if (!go || plan.sticker) { this.traveling = false; this.travelTarget = null; return; }
      if (this.trainIdx === go.idx) this.time.delayedCall(250, () => this.openNode(go));
      else this.travelTo(go, () => this.openNode(go));
    };
    if (plan.to) {
      t += 150;
      const dur = fx.lessMotion ? 450 : 1000;
      this.time.delayedCall(t, () => this.chug(plan.to.idx, dur, openGo));
      t += dur + 350;
    } else {
      this.time.delayedCall(t + 100, () => this.tweens.add({ targets: this.train, y: this.train.y - 10, duration: 160, yoyo: true, repeat: 1 }));
      t += 500;
      if (go) this.time.delayedCall(t, openGo);
    }
    if (plan.sticker) this.time.delayedCall(t, () => this.openBook(plan.sticker));
  }

  hudButton(x, y, emoji, onTap, sound) {
    return roundButton(this, { icon: emoji, sound, onTap: () => { if (this.leaving || this.book || this.traveling) return; onTap(); } }).setPosition(x, y);
  }

  buildHud() {
    const L = this.L;
    const hud = this.hud = this.add.container(0, 0).setDepth(100);
    // The DOM leaderboard covers the whole game; stop the map underneath so its "back" button (go('Map')) starts it fresh.
    hud.add(this.hudButton(34, 36, '🏆', () => { this.bridge.showLeaderboard(1); this.scene.stop(); }, () => sfx.tick(3)));
    const bookBtn = this.hudButton(96, 36, '📒', () => this.openBook(null));
    const got = [1, 2, 3, 4].filter(w => this.hasSticker(w)).length;
    if (got) {
      bookBtn.add(this.add.circle(19, -19, 11, UI.bad, 1));
      bookBtn.add(this.add.text(19, -19, String(got), textStyle(13, '#ffffff')).setOrigin(0.5));
    }
    hud.add(bookBtn);

    const st = this.P.streak || {};
    const y = this.bridge.today(), yd = new Date(y + 'T00:00:00Z'); yd.setUTCDate(yd.getUTCDate() - 1);
    const live = st.lastDay === y || st.lastDay === yd.toISOString().slice(0, 10);
    if (st.count > 0 && live) {
      const c = this.add.container(0, 36);
      const txt = this.add.text(0, 1, `🔥 ${st.count}`, textStyle(26, '#c2410c', { padding: { x: 2, y: 4 } })).setOrigin(0.5);
      const pw = txt.width + 28, ph = 48;
      const g = this.add.graphics();
      g.fillStyle(0x000000, 0.15).fillRoundedRect(-pw / 2 + 2, -ph / 2 + 3, pw, ph, ph / 2);
      g.fillStyle(0xfff7ed, 1).fillRoundedRect(-pw / 2, -ph / 2, pw, ph, ph / 2);
      g.lineStyle(3, 0xfb923c, 1).strokeRoundedRect(-pw / 2, -ph / 2, pw, ph, ph / 2);
      c.add([g, txt]);
      // centred between the book button and the DOM test / mute / admin buttons
      c.x = clamp((128 + domLeft(this)) / 2, 128 + pw / 2, L.W - pw / 2 - 8);
      c.setSize(pw, ph).setInteractive();
      c.on('pointerup', () => { if (!this.tapOK()) return; sfx.star(0); fx.floatText(this, c.x, this.cam.scrollY + 80, `連續 ${st.count} 天！`, '#f97316'); });
      this.tweens.add({ targets: txt, scale: 1.12, duration: 650, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      hud.add(c);
      this.streakPill = c;
    }
    setSF(hud, 0);
  }

  hasSticker(w) {
    const P = this.P;
    return (P.stickers || []).includes('w' + w) || (P.levels[levelKey(w, 'boss')] || 0) > 0 || (this.plan && this.plan.sticker === w);
  }

  // ---------------------------------------------------------------- sticker book
  openBook(newW, instant) {
    if (this.book || this.leaving) return;
    const { width: W, height: H } = this.scale;
    this.drag = null; this.vel = 0;
    const layer = this.book = this.add.container(0, 0).setDepth(500);
    const dim = this.add.rectangle(0, 0, W, H, 0x0f172a, 0.55).setOrigin(0).setInteractive();
    dim.on('pointerup', () => this.closeBook());
    layer.add(dim);
    const pw = Math.min(W - 24, 540), ph = Math.min(H - 32, 520);
    const panel = this.add.container(W / 2, H / 2);
    layer.add(panel);
    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.25).fillRoundedRect(-pw / 2 + 4, -ph / 2 + 8, pw, ph, 22);
    g.fillStyle(0x92400e, 1).fillRoundedRect(-pw / 2, -ph / 2, pw, ph, 22);
    g.fillStyle(UI.paper, 1).fillRoundedRect(-pw / 2 + 8, -ph / 2 + 8, pw - 16, ph - 16, 16);
    for (let y = -ph / 2 + 36; y < ph / 2 - 20; y += 34) { g.fillStyle(0xd6d3d1, 1).fillCircle(-pw / 2 + 22, y, 6); g.fillStyle(0x78716c, 1).fillCircle(-pw / 2 + 22, y, 3); }
    panel.add(g);
    panel.setSize(pw, ph).setInteractive(); // swallow taps on the page
    const got = [1, 2, 3, 4].filter(w => this.hasSticker(w)).length;
    panel.add(this.add.text(0, -ph / 2 + 36, '📒 貼紙簿', textStyle(28, '#1f2937', { padding: { x: 2, y: 4 } })).setOrigin(0.5));
    panel.add(this.add.text(0, -ph / 2 + 64, `Sticker book · ${got}/4`, textStyle(14, '#78716c')).setOrigin(0.5));
    const close = this.add.container(pw / 2 - 30, -ph / 2 + 32);
    const cg = this.add.graphics();
    cg.fillStyle(UI.bad, 1).fillCircle(0, 0, 20);
    cg.lineStyle(4, 0xffffff, 1).lineBetween(-7, -7, 7, 7).lineBetween(-7, 7, 7, -7);
    close.add(cg);
    close.setSize(48, 48).setInteractive({ useHandCursor: true });
    close.on('pointerup', () => this.closeBook());
    panel.add(close);

    const left = -pw / 2 + 40, right = pw / 2 - 16, rowTop = -ph / 2 + 86;
    const rowH = (ph / 2 - 16 - rowTop) / 4;
    const lw = Math.min(96, (right - left) * 0.3);
    // rods are one square tall; hats / hair reach ≈ 0.45·unit above, so rods sit 0.2·unit low in their row
    const unit = Math.floor(Math.min((right - left - lw - 30) / 10, (rowH - 16) / 1.6));
    let popTarget = null;
    for (let w = 1; w <= 4; w++) {
      const wd = WORLDS[w - 1], th = WORLD_THEME[w];
      const cy = rowTop + (w - 0.5) * rowH;
      const rg = this.add.graphics();
      rg.fillStyle(th.sky, 0.6).fillRoundedRect(left, cy - rowH / 2 + 4, right - left, rowH - 8, 14);
      panel.add(rg);
      const l1 = this.add.text(left + 10, cy - 9, `${th.emoji} W${w}`, textStyle(17, '#1f2937', { padding: { x: 1, y: 4 } })).setOrigin(0, 0.5);
      const l2 = this.add.text(left + 10, cy + 13, `${wd.zh} ${wd.en}`, textStyle(12, '#475569')).setOrigin(0, 0.5);
      [l1, l2].forEach(t => { if (t.width > lw) t.setScale(lw / t.width); panel.add(t); });
      const rx = left + lw + 18, len = wd.sticker;
      if (this.hasSticker(w)) {
        const rod = makeStickerRod(this, rx, cy + Math.round(unit * 0.2), len, unit);
        panel.add(rod);
        if (newW === w) { rod.setScale(0); popTarget = rod; }
      } else {
        const h = unit, rad = Math.max(2, Math.min(unit * 0.22, 8)); // ghost rod: one square tall, square cells
        const sg = this.add.graphics();
        sg.fillStyle(0x94a3b8, 0.3).fillRoundedRect(rx, cy - h / 2, len * unit, h, rad);
        sg.lineStyle(1.5, 0x94a3b8, 0.6);
        for (let i = 1; i < len; i++) sg.lineBetween(rx + i * unit, cy - h / 2 + 2, rx + i * unit, cy + h / 2 - 2);
        sg.lineStyle(2, 0x94a3b8, 0.8).strokeRoundedRect(rx, cy - h / 2, len * unit, h, rad);
        panel.add(sg);
        panel.add(this.add.text(rx + (len * unit) / 2, cy, '?', textStyle(Math.max(12, h * 0.75), '#94a3b8')).setOrigin(0.5));
        if (rowH > 70) panel.add(this.add.text(rx, cy + h / 2 + 12, '🏠 打敗數字屋 Beat the house', textStyle(11, '#64748b', { padding: { x: 1, y: 3 } })).setOrigin(0, 0.5));
      }
    }
    setSF(layer, 0);

    sfx.page();
    if (instant) return;
    panel.scaleX = 0;
    this.tweens.add({ targets: panel, scaleX: 1, duration: fx.lessMotion ? 150 : 420, ease: 'Back.easeOut' });
    if (popTarget) {
      this.time.delayedCall(480, () => {
        if (!popTarget.scene) return;
        this.tweens.add({ targets: popTarget, scale: 1, duration: 420, ease: 'Back.easeOut' });
        sfx.fanfare();
        const wx = W / 2 + popTarget.x + (WORLDS[newW - 1].sticker * unit) / 2, wy = H / 2 + popTarget.y + this.cam.scrollY;
        fx.burst(this, wx, wy, { count: 16 });
        fx.floatText(this, wx, wy - 20, '新貼紙！', '#f97316');
      });
    }
  }

  closeBook() {
    const layer = this.book;
    if (!layer) return;
    sfx.page();
    this.book = null;
    layer.list.forEach(o => o.input && o.disableInteractive());
    this.tweens.add({ targets: layer, alpha: 0, duration: 160, onComplete: () => layer.destroy() });
  }

  // ---------------------------------------------------------------- input + navigation
  tapOK() { return !this.leaving && !this.book && !this.traveling && (!this.drag || this.drag.moved < 12); }

  wobble(target) {
    this.tweens.add({ targets: target, angle: { from: -9, to: 9 }, duration: 70, yoyo: true, repeat: 2, onComplete: () => target.setAngle(0) });
  }

  leave(key, data) {
    if (this.leaving) return;
    this.leaving = true;
    this.time.delayedCall(90, () => { fx.iris(this, key, data); this.pinIris(); });
  }

  bindInput() {
    const py = p => p.y / this.cam.zoom; // screen y in CSS px (the camera zooms by DPR, see hidpi.js)
    this.input.on('pointerdown', p => {
      if (this.book || this.leaving || this.traveling || this.drag) return; // no scrolling while the train travels (the camera follows it)
      this.drag = { id: p.id, y0: py(p), s0: this.cam.scrollY, moved: 0, ly: py(p), lt: performance.now(), v: 0 };
      this.vel = 0;
    });
    this.input.on('pointermove', p => {
      const d = this.drag;
      if (!d || d.id !== p.id || !p.isDown) return;
      const dy = py(p) - d.y0;
      d.moved = Math.max(d.moved, Math.abs(dy));
      this.cam.scrollY = this.clampScroll(d.s0 - dy);
      const now = performance.now(), dt = now - d.lt;
      if (dt > 0) d.v = 0.6 * ((d.ly - py(p)) / dt) + 0.4 * d.v;
      d.ly = py(p); d.lt = now;
    });
    const end = p => {
      const d = this.drag;
      if (!d || d.id !== p.id) return;
      if (d.moved > 12 && performance.now() - d.lt < 90) this.vel = clamp(d.v, -4, 4);
      this.drag = null;
    };
    this.input.on('pointerup', end);
    this.input.on('pointerupoutside', end);
    this.input.on('wheel', (p, over, dx, dy) => {
      if (this.book || this.leaving || this.traveling) return;
      this.vel = 0;
      this.cam.scrollY = this.clampScroll(this.cam.scrollY + dy);
    });
  }

  update(time, delta) {
    if (!this.L) return;
    const cam = this.cam;
    if (!this.drag && Math.abs(this.vel) > 0.02) {
      const before = cam.scrollY;
      cam.scrollY = this.clampScroll(cam.scrollY + this.vel * delta);
      this.vel = cam.scrollY === before ? 0 : this.vel * Math.pow(0.94, delta / 16.7);
    }
    const W = this.L.W;
    if (this.clouds) for (const c of this.clouds) { c.x += (c.vx * delta) / 1000; if (c.x > W + 110) c.x = -110; }
    // Only draw the worlds (and fog) near the view.
    const y0 = cam.scrollY - 80, y1 = cam.scrollY + cam.height / cam.zoom + 80;
    for (const w in this.layers) { const l = this.layers[w]; l.visible = l.range[1] > y0 && l.range[0] < y1; }
    for (const w in this.fogs) { const f = this.fogs[w]; f.visible = f.range[1] > y0 && f.range[0] < y1; }
  }
}
