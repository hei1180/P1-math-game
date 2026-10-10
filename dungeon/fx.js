// Visual effects shared by all Treasure Dungeon scenes. Textures ('fx.*') are made once by fx.makeTextures in BootScene.
// Effects are drawn in screen (CSS) px, outside the pixel stage, so they stay smooth.
import { FONT } from './theme.js?v=0';
const MAX_LIVE = 60;
// Live-particle budget per scene. Scene objects are reused on restart and a shutdown drops the pending
// "particles died" timers, so the budget is reset on every shutdown (else it leaks until no fx show).
const live = scene => {
  if (!scene.__fxHooked) {
    scene.__fxHooked = true;
    scene.events.on('shutdown', () => { scene.__fxLive = { n: 0 }; });
  }
  return (scene.__fxLive = scene.__fxLive || { n: 0 });
};
const reduced = () => fx.lessMotion || (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

function emitOnce(scene, x, y, texture, config, count) {
  const l = live(scene);
  const n = Math.max(0, Math.min(count, MAX_LIVE - l.n));
  if (!n) return;
  const em = scene.add.particles(x, y, texture, { emitting: false, ...config });
  em.setDepth(1000);
  l.n += n; em.explode(n);
  scene.time.delayedCall((config.lifespan?.max || config.lifespan || 800) + 100, () => { l.n = Math.max(0, l.n - n); em.destroy(); });
}

export const fx = {
  lessMotion: false,
  /** Particle textures; call once from BootScene.create. */
  makeTextures(scene) {
    if (scene.textures.exists('fx.star')) return;
    const g = scene.make.graphics({ add: false });
    g.fillStyle(0xffffff); g.fillCircle(8, 8, 8); g.generateTexture('fx.dot', 16, 16); g.clear();
    g.fillStyle(0xffffff); g.fillCircle(16, 16, 16); g.generateTexture('fx.puff', 32, 32); g.clear();
    g.fillStyle(0xffffff); g.fillRect(0, 0, 10, 6); g.generateTexture('fx.confetti', 10, 6); g.clear();
    g.fillStyle(0xffffff); g.fillRect(0, 0, 3, 12); g.generateTexture('fx.spark', 3, 12); g.clear();
    const pts = []; for (let i = 0; i < 10; i++) { const r = i % 2 ? 7 : 16; const a = -Math.PI / 2 + i * Math.PI / 5; pts.push(new Phaser.Geom.Point(16 + r * Math.cos(a), 16 + r * Math.sin(a))); }
    g.fillStyle(0xffffff); g.fillPoints(pts, true); g.generateTexture('fx.star', 32, 32); g.clear();
    // four-point twinkle
    g.fillStyle(0xffffff); g.fillPoints([[12, 0], [15, 9], [24, 12], [15, 15], [12, 24], [9, 15], [0, 12], [9, 9]].map(([x, y]) => new Phaser.Geom.Point(x, y)), true);
    g.generateTexture('fx.twinkle', 24, 24); g.destroy();
  },
  /** Gentle twinkles around (x, y): a right answer. */
  sparkle(scene, x, y) {
    emitOnce(scene, x, y, 'fx.twinkle', { x: { min: -30, max: 30 }, y: { min: -30, max: 30 }, speed: { min: 10, max: 50 }, scale: { start: 0.2, end: 1, ease: 'Sine.easeOut' }, alpha: { start: 1, end: 0 }, lifespan: 700, tint: [0xfef08a, 0xffffff, 0xfacc15] }, reduced() ? 4 : 10);
  },
  burst(scene, x, y, { count = 12, tint = [0xfacc15, 0xf97316, 0xffffff] } = {}) {
    emitOnce(scene, x, y, 'fx.star', { speed: { min: 120, max: 320 }, scale: { start: 0.9, end: 0 }, lifespan: 650, rotate: { min: 0, max: 360 }, tint }, reduced() ? 5 : count);
  },
  sparks(scene, x, y) { emitOnce(scene, x, y, 'fx.spark', { speed: { min: 150, max: 400 }, angle: { min: -140, max: -40 }, gravityY: 600, scale: { start: 0.7, end: 0 }, lifespan: 500, tint: [0xfde047, 0xffffff] }, 14); },
  puff(scene, x, y) { emitOnce(scene, x, y, 'fx.puff', { speed: { min: 20, max: 80 }, scale: { start: 0.5, end: 1.2 }, alpha: { start: 0.7, end: 0 }, lifespan: 500 }, 6); },
  confetti(scene) {
    if (reduced()) return;
    const w = scene.scale.width;
    emitOnce(scene, w / 2, -10, 'fx.confetti', { x: { min: -w / 2, max: w / 2 }, speedY: { min: 150, max: 350 }, speedX: { min: -80, max: 80 }, rotate: { min: 0, max: 360 }, gravityY: 200, lifespan: 2200, tint: [0xef4444, 0xfacc15, 0x22c55e, 0x3b82f6, 0xa855f7, 0xf97316] }, 50);
  },
  fireworks(scene) {
    if (reduced()) { fx.burst(scene, scene.scale.width / 2, scene.scale.height / 3); return; }
    for (let i = 0; i < 4; i++) scene.time.delayedCall(i * 300, () => fx.burst(scene, scene.scale.width * (0.2 + 0.2 * i), scene.scale.height * (0.2 + 0.1 * (i % 2)), { count: 14 }));
  },
  shake(scene, intensity = 0.006) { if (!reduced()) scene.cameras.main.shake(180, intensity); },
  /** Brief zoom-in around the screen centre, relative to the camera's base zoom (DPR on retina, see hidpi.js). */
  zoomPulse(scene, amount = 0.03) {
    const cam = scene.cameras.main;
    if (reduced() || cam.__pulsing) return;
    cam.__pulsing = true;
    const z0 = cam.zoom, sx0 = cam.scrollX, sy0 = cam.scrollY, k = { v: 1 };
    const apply = () => {
      const z = z0 * k.v;
      cam.setZoom(z);
      if (cam.originX === 0) { cam.scrollX = sx0 + cam.width / (2 * z0) - cam.width / (2 * z); cam.scrollY = sy0 + cam.height / (2 * z0) - cam.height / (2 * z); }
    };
    const done = () => { k.v = 1; apply(); cam.__pulsing = false; };
    scene.tweens.add({ targets: k, v: 1 + amount, duration: 120, yoyo: true, ease: 'Sine.easeOut', onUpdate: apply, onComplete: done, onStop: done });
  },
  floatText(scene, x, y, text, color = '#f97316') {
    const t = scene.add.text(x, y, text, { fontFamily: FONT, fontSize: '28px', fontStyle: 'bold', color, stroke: '#ffffff', strokeThickness: 5, padding: { x: 2, y: 4 } }).setOrigin(0.5).setDepth(1001);
    const half = (t.width * (reduced() ? 1 : 1.4)) / 2 + 4, W = scene.scale.width; // stay on screen at the edges
    t.x = Math.max(half, Math.min(W - half, x));
    scene.tweens.add({ targets: t, y: y - 60, alpha: 0, scale: reduced() ? 1 : 1.4, duration: reduced() ? 150 : 700, ease: 'Cubic.easeOut', onComplete: () => t.destroy() });
  },
  /** Circle-wipe out of the current scene, then start `targetKey` (which should call fx.irisIn in create). */
  iris(scene, targetKey, data) {
    const { width: w, height: h } = scene.scale;
    const g = scene.add.graphics().setDepth(2000).setScrollFactor(0);
    const r = { v: Math.hypot(w, h) };
    const mask = scene.make.graphics({ add: false }).setScrollFactor(0);
    const bmask = mask.createGeometryMask();
    bmask.setInvertAlpha(true);
    g.setMask(bmask);
    const update = () => {
      mask.clear();
      mask.fillStyle(0xffffff, 1);
      mask.fillCircle(w / 2, h / 2, r.v);
      g.clear();
      g.fillStyle(0x1f2937, 1);
      g.fillRect(0, 0, w, h);
    };
    update();
    scene.tweens.add({
      targets: r, v: 0, duration: reduced() ? 150 : 420, ease: 'Cubic.easeIn', onUpdate: update,
      onComplete: () => { mask.destroy(); scene.scene.start(targetKey, data); },
    });
  },
  /** Circle-wipe in, revealing the scene. Call from a scene's create() right after fx.iris started it. */
  irisIn(scene) {
    const { width: w, height: h } = scene.scale;
    const g = scene.add.graphics().setDepth(2000).setScrollFactor(0);
    const r = { v: 0 };
    const mask = scene.make.graphics({ add: false }).setScrollFactor(0);
    const bmask = mask.createGeometryMask();
    bmask.setInvertAlpha(true);
    g.setMask(bmask);
    const update = () => {
      mask.clear();
      mask.fillStyle(0xffffff, 1);
      mask.fillCircle(w / 2, h / 2, r.v);
      g.clear();
      g.fillStyle(0x1f2937, 1);
      g.fillRect(0, 0, w, h);
    };
    update();
    scene.tweens.add({
      targets: r, v: Math.hypot(w, h), duration: reduced() ? 150 : 420, ease: 'Cubic.easeOut', onUpdate: update,
      onComplete: () => { g.destroy(); mask.destroy(); },
    });
  },
};
