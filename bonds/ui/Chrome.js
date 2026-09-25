/**
 * Shared scene chrome for Rod Town 數棒鎮 — the small widgets every scene uses, so they look and
 * behave the same everywhere (Map, Level, House, Rush).
 *
 *   T(size, color?, extra?)                     text style (FONT, bold, crisp, padded for CJK)
 *   domLeft(scene)                              left edge (game px) of the DOM test/mute/admin cluster
 *   roundButton(scene, { icon | draw, onTap, r?, fill?, rim?, sound? })   white circle button
 *   backButton(scene, onTap)                    roundButton with a drawn ← arrow
 *   makeBubble(scene)                           instruction bubble: .setText(icon, zh, en) .layout(x, y, w, h) .setStroke(hex)
 *   pillButton(scene, zh, en, { fill, ink, stroke, w?, h? }, onTap)   end-panel button (.pw = width)
 *   starPts(r, cx?, cy?, inner?)                points of a 5-point star
 *   drawStarSlot(g, r, x, y)                    empty grey star slot
 *   makeGoldStar(scene, r)                      gold star Graphics centred on (0, 0)
 *   drawPanel(g, w, h, accent)                  end panel frame: world-accent rim, paper inside
 *   dropStar(scene, panel, slot, i)             end-panel star drops into slot {x, y, r} with a thud (+ shake on the 3rd)
 *   newBestBadge(scene, panel, w, h)            red "新紀錄！ New best" tag on the panel's top-right corner
 *   shineStars(scene, panel, slots, depth)      first-time 3★: a gold-white shine sweeps across the stars
 *
 * Buttons give sound + a press squash on pointerdown (< 100 ms) and act on pointerup.
 */
import { UI, textStyle } from '../theme.js?v=202609251311';
import { sfx } from '../sfx.js?v=202609251311';
import { fx } from '../fx.js?v=202609251311';
import { DPR, dur, reducedMotion } from './Rod.js?v=202609251311';

export const T = (size, color = '#1f2937', extra = {}) => textStyle(size, color, { padding: { x: 2, y: 4 }, resolution: DPR, ...extra });

const RIGHT_DOM = 190; // fallback width of the DOM test badge + mute + admin cluster, top-right

/** Left edge (game px) of the DOM button cluster (test badge, mute, admin) floating over the top-right. */
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

/** White circle button with an emoji `icon` or a `draw(g, r)` glyph. */
export function roundButton(scene, { icon = null, draw = null, onTap, r = 25, fill = 0xffffff, rim = 0xfde68a, sound = () => sfx.tick(4) }) {
  const c = scene.add.container(0, 0);
  const g = scene.add.graphics();
  g.fillStyle(0x000000, 0.15).fillCircle(0, 3, r);
  g.fillStyle(fill, 0.95).fillCircle(0, 0, r);
  g.lineStyle(3, rim, 1).strokeCircle(0, 0, r);
  if (draw) draw(g, r);
  c.add(g);
  if (icon) c.add(scene.add.text(0, 1, icon, { fontSize: `${Math.round(r * 1.05)}px`, padding: { x: 2, y: 4 }, resolution: DPR }).setOrigin(0.5));
  const hs = 2 * r + 6;
  c.setSize(hs, hs).setInteractive({ hitArea: new Phaser.Geom.Circle(hs / 2, hs / 2, r + 5), hitAreaCallback: Phaser.Geom.Circle.Contains, useHandCursor: true });
  c.bg = g;
  c.on('pointerdown', () => { if (sound) sound(); scene.tweens.add({ targets: c, scale: 0.86, duration: 60 }); });
  c.on('pointerout', () => c.setScale(1));
  c.on('pointerup', () => { c.setScale(1); onTap(); });
  return c;
}

/** The ← back button used by every scene (drawn, not an emoji: '⬅' renders pale on some systems). */
export function backButton(scene, onTap) {
  return roundButton(scene, {
    onTap, sound: () => sfx.tick(2),
    draw: g => {
      g.lineStyle(5, UI.ink, 1).beginPath().moveTo(9, 0).lineTo(-9, 0).strokePath();
      g.beginPath().moveTo(-1, -8).lineTo(-9, 0).lineTo(-1, 8).strokePath();
    },
  });
}

/** Instruction bubble: paper card with a world-accent rim, an icon on the left, big Chinese + small English. */
export function makeBubble(scene) {
  const b = scene.add.container(0, 0);
  b.bg = scene.add.graphics();
  b.icon = scene.add.text(0, 0, '', { fontSize: '26px', padding: { x: 2, y: 4 }, resolution: DPR }).setOrigin(0.5);
  b.zh = scene.add.text(0, 0, '', T(24)).setOrigin(0.5);
  b.en = scene.add.text(0, 0, '', T(14, '#475569')).setOrigin(0.5);
  b.add([b.bg, b.icon, b.zh, b.en]);
  b.rect = null; b.content = null; b.stroke = UI.gold;
  b.render = () => {
    const r = b.rect, t = b.content;
    if (!r || !t) return b;
    const { x, y, w, h } = r;
    b.setPosition(x + w / 2, y + h / 2);
    const g = b.bg;
    g.clear();
    g.fillStyle(0x000000, 0.12).fillRoundedRect(-w / 2 + 2, -h / 2 + 4, w, h, 18);
    g.fillStyle(UI.paper, 1).fillRoundedRect(-w / 2, -h / 2, w, h, 18);
    g.lineStyle(3, b.stroke, 1).strokeRoundedRect(-w / 2, -h / 2, w, h, 18);
    const big = h >= 64, hasIcon = !!t.icon;
    b.icon.setText(t.icon || '').setFontSize(big ? 30 : 26).setPosition(-w / 2 + 28, 0);
    b.zh.setText(t.zh).setFontSize(big ? 28 : 24).setScale(1);
    b.en.setText(t.en).setFontSize(big ? 15 : 14).setScale(1);
    const left = -w / 2 + (hasIcon ? 52 : 12), right = w / 2 - 12, avail = right - left;
    [b.zh, b.en].forEach(o => { if (o.width > avail) o.setScale(avail / o.width); });
    const cx = (left + right) / 2;
    b.zh.setPosition(cx, big ? -10 : -9);
    b.en.setPosition(cx, big ? 18 : 16);
    return b;
  };
  b.layout = (x, y, w, h) => { b.rect = { x, y, w, h }; return b.render(); };
  b.setStroke = hex => { b.stroke = hex; return b.render(); };
  b.setText = (icon, zh, en) => {
    b.content = { icon, zh, en };
    b.render();
    scene.tweens.killTweensOf(b);
    b.setScale(0.9);
    scene.tweens.add({ targets: b, scale: 1, duration: dur(240), ease: 'Back.easeOut' });
    return b;
  };
  return b;
}

/** Rounded end-panel button: big Chinese + small English. */
export function pillButton(scene, zh, en, { fill = 0xffffff, ink = '#1f2937', stroke = UI.gold, w = 118, h = 66 } = {}, onTap) {
  const c = scene.add.container(0, 0);
  const g = scene.add.graphics();
  g.fillStyle(0x000000, 0.18).fillRoundedRect(-w / 2 + 2, -h / 2 + 5, w, h, 22);
  g.fillStyle(fill, 1).fillRoundedRect(-w / 2, -h / 2, w, h, 22);
  g.lineStyle(3, stroke, 1).strokeRoundedRect(-w / 2, -h / 2, w, h, 22);
  const a = scene.add.text(0, -9, zh, T(20, ink)).setOrigin(0.5);
  const b = scene.add.text(0, 17, en, T(13, ink, { fontStyle: 'normal' })).setOrigin(0.5).setAlpha(0.85);
  [a, b].forEach(o => { if (o.width > w - 10) o.setScale((w - 10) / o.width); });
  c.add([g, a, b]);
  c.setSize(w, h).setInteractive({ useHandCursor: true });
  c.on('pointerdown', () => { sfx.tick(6); scene.tweens.add({ targets: c, scale: 0.9, duration: 60 }); });
  c.on('pointerout', () => c.setScale(1));
  c.on('pointerup', () => { c.setScale(1); onTap(); });
  c.pw = w;
  return c;
}

export function starPts(r, cx = 0, cy = 0, inner = 0.5) {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const rr = i % 2 ? r * inner : r, a = -Math.PI / 2 + (i * Math.PI) / 5;
    pts.push(new Phaser.Geom.Point(cx + rr * Math.cos(a), cy + rr * Math.sin(a)));
  }
  return pts;
}

export function drawStarSlot(g, r, x, y) {
  g.fillStyle(0xe5e7eb, 1).fillPoints(starPts(r, x, y), true);
  g.lineStyle(4, 0xcbd5e1, 1).strokePoints(starPts(r, x, y), true, true);
}

export function makeGoldStar(scene, r) {
  const g = scene.add.graphics();
  g.fillStyle(0xf59e0b, 1).fillPoints(starPts(r + 3, 0, 3), true);
  g.fillStyle(UI.gold, 1).fillPoints(starPts(r, 0, 0), true);
  g.fillStyle(0xffffff, 0.55).fillCircle(-r * 0.22, -r * 0.3, r * 0.14);
  return g;
}

export function drawPanel(g, w, h, accent) {
  g.fillStyle(0x000000, 0.25).fillRoundedRect(-w / 2 + 4, -h / 2 + 8, w, h, 26);
  g.fillStyle(accent, 1).fillRoundedRect(-w / 2, -h / 2, w, h, 26);
  g.fillStyle(UI.paper, 1).fillRoundedRect(-w / 2 + 8, -h / 2 + 8, w - 16, h - 16, 20);
}

export function dropStar(scene, panel, s, i) {
  const c = scene.add.container(s.x, s.y - 150);
  c.add(makeGoldStar(scene, s.r));
  c.setScale(1.7).setAlpha(0);
  panel.add(c);
  scene.tweens.add({
    targets: c, y: s.y, scale: 1, alpha: 1, duration: dur(260), ease: 'Quad.easeIn',
    onComplete: () => {
      if (!c.active) return;
      sfx.star(i);
      scene.tweens.add({ targets: c, scaleY: 0.78, scaleX: 1.15, duration: 70, yoyo: true, ease: 'Quad.easeOut' });
      const k = panel.scale;
      fx.burst(scene, panel.x + s.x * k, panel.y + s.y * k, { count: 10 });
      if (i === 2) fx.shake(scene, 0.01);
    },
  });
  return c;
}

export function newBestBadge(scene, panel, w, h) {
  const c = scene.add.container(w / 2 - 64, -h / 2 + 26);
  const g = scene.add.graphics();
  g.fillStyle(UI.bad, 1).fillRoundedRect(-58, -20, 116, 40, 20);
  g.lineStyle(3, 0xffffff, 1).strokeRoundedRect(-58, -20, 116, 40, 20);
  c.add([g, scene.add.text(0, -7, '新紀錄！', T(15, '#ffffff')).setOrigin(0.5), scene.add.text(0, 11, 'New best', T(10, '#ffffff')).setOrigin(0.5)]);
  c.setAngle(12).setScale(0);
  panel.add(c);
  scene.tweens.add({ targets: c, scale: 1, duration: dur(300), ease: 'Back.easeOut', easeParams: [2.5] });
  return c;
}

export function shineStars(scene, panel, slots, depth) {
  if (reducedMotion() || !panel.active) return;
  const p = panel, k = p.scale;
  const mg = scene.make.graphics({ add: false });
  mg.fillStyle(0xffffff, 1);
  for (const s of slots) mg.fillPoints(starPts(s.r * k, p.x + s.x * k, p.y + s.y * k), true);
  const band = scene.add.graphics().setDepth(depth);
  const bw = 34 * k, bh = 140 * k;
  band.fillStyle(0xffffff, 0.75).fillPoints([{ x: 0, y: -bh / 2 }, { x: bw, y: -bh / 2 }, { x: bw - 30 * k, y: bh / 2 }, { x: -30 * k, y: bh / 2 }].map(o => new Phaser.Geom.Point(o.x, o.y)), true);
  band.fillStyle(0xfef3c7, 0.6).fillRect(bw + 4 * k, -bh / 2, 10 * k, bh);
  band.setMask(mg.createGeometryMask());
  const cy = slots.reduce((a, s) => a + s.y, 0) / slots.length;
  band.setPosition(p.x - 170 * k, p.y + cy * k);
  sfx.star(4);
  scene.tweens.add({
    targets: band, x: p.x + 170 * k, duration: 650, ease: 'Sine.easeInOut', repeat: 1, repeatDelay: 250,
    onComplete: () => { band.destroy(); mg.destroy(); },
  });
}
