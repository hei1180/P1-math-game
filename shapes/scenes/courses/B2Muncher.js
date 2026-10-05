// B2 吃板機 Panel Muncher (1S2: name a flat shape by counting its sides).
// A friendly machine has five mouths: 3, 4, 5, 6 sides and 圓形. Each tile (regular, irregular, dented, turned) slides onto the bench;
// the child can tap it to light up its sides one by one with spoken numbers, then drags it into the right mouth.
// Mouths are labelled with text + side-count dots (never a colour code). Grading: the item's answer from genCourse (tileAnswer).
// Bench scene: the camera looks down at ~55 degrees, everything lies flat.
import * as THREE from 'three';
import { CourseScene } from '../CourseScene.js?v=0';
import { tween, wait, motion } from '../../engine/tween.js?v=0';
import { voice } from '../../engine/voice.js?v=0';
import { disposeTree } from '../../engine/stage.js?v=0';
import { FONT, SCENE, toyColor } from '../../theme.js?v=0';
import { sfx } from '../../sfx.js?v=0';
import { sparkle } from '../../fx3d.js?v=0';
import { makeTile } from '../../models/tiles.js?v=0';
import { TILE_ANSWERS, ANSWER_TEXT } from '../../../shapes-logic.js?v=0';

const ELEV = (55 * Math.PI) / 180, SIN = Math.sin(ELEV), COS = Math.cos(ELEV);
const CN = ['零', '一', '二', '三', '四', '五', '六'];
const TILE = { size: 1.5, thickness: 0.14 };
const HOME = new THREE.Vector3(0, 0.01, 1.7);
const CARD = { w: 1.5, d: 2.1, gap: 1.62, z: -1.35 };
const HOLE_Z = -1.8; // world z of the middle of a mouth

/**
 * Put the camera ~55 degrees above `look`, as close as possible while every point in `pts` stays on screen
 * (clear of the prompt bar at the top and `bottom` px at the bottom), with the content centred in the free band.
 * (The same helper lives in B1Lines.js; the two course files are independent on purpose.)
 */
function fitView(stage, pts, look, { top = 175, bottom = 24, side = 0.88, ms = 0 } = {}) {
  const cam = stage.camera, h = Math.max(1, stage.height);
  const yHi = 1 - (2 * top) / h, yLo = -1 + (2 * bottom) / h, mid = (yHi + yLo) / 2;
  const tanV = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
  const v = new THREE.Vector3(), L = new THREE.Vector3(...look);
  const measure = d => {
    cam.position.set(L.x, L.y + SIN * d, L.z + COS * d); cam.lookAt(L); cam.updateMatrixWorld();
    let x = 0, y0 = 1e9, y1 = -1e9;
    for (const p of pts) { v.copy(p).project(cam); x = Math.max(x, Math.abs(v.x)); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y); }
    return { x, y0, y1 };
  };
  const centre = d => {
    L.z = look[2];
    let m = measure(d);
    for (let pass = 0; pass < 2; pass++) { L.z -= (((m.y0 + m.y1) / 2 - mid) * d * tanV) / SIN; m = measure(d); }
    return m;
  };
  let best = 40;
  for (let d = 6; d <= 40; d += 0.25) {
    const m = centre(d);
    if (m.x <= side && m.y0 >= yLo && m.y1 <= yHi) { best = d; break; }
  }
  centre(best);
  stage.setView([L.x, L.y + SIN * best, L.z + COS * best], [L.x, L.y, L.z], ms);
}

function textureOf(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
function rr(g, x, y, w, h, r) {
  g.beginPath(); g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

/** A mouth card (flat, lying on the machine's lip): the mouth on top, the label (text + side-count dots) below. All five look alike. */
function mouthTexture(answer) {
  const { zh, en } = ANSWER_TEXT[answer];
  return textureOf(300, 420, (g, W) => {
    g.fillStyle = '#475569'; rr(g, 0, 0, W, 420, 26); g.fill();
    g.fillStyle = '#fb7185'; rr(g, 14, 14, 272, 216, 64); g.fill();            // lips
    g.fillStyle = '#111827'; rr(g, 40, 40, 220, 165, 46); g.fill();              // inside of the mouth
    g.fillStyle = '#f87171'; g.beginPath(); g.ellipse(150, 200, 62, 30, 0, Math.PI, 0); g.fill(); // tongue
    g.fillStyle = '#ffffff';
    for (let i = 0; i < 5; i++) { rr(g, 50 + i * 40, 40, 34, 30, 6); g.fill(); rr(g, 50 + i * 40, 176, 34, 30, 6); g.fill(); } // teeth
    g.fillStyle = '#fffbeb'; rr(g, 10, 240, 280, 170, 22); g.fill();             // label
    g.strokeStyle = '#334155'; g.lineWidth = 5; g.stroke();
    g.fillStyle = '#1f2937'; g.textAlign = 'center';
    g.font = `bold 56px ${FONT}`; g.fillText(zh, W / 2, 298);
    if (answer === 'circle') { g.lineWidth = 7; g.beginPath(); g.arc(W / 2, 341, 17, 0, Math.PI * 2); g.stroke(); }
    else {
      for (let i = 0; i < answer; i++) { g.beginPath(); g.arc(W / 2 + (i - (answer - 1) / 2) * 38, 341, 13, 0, Math.PI * 2); g.fill(); }
    }
    g.font = `30px ${FONT}`; g.fillStyle = '#475569'; g.fillText(en, W / 2, 392);
  });
}

function digitSprite(n) {
  const tex = textureOf(64, 64, g => {
    g.fillStyle = '#ffffff'; g.beginPath(); g.arc(32, 32, 28, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#111827'; g.lineWidth = 5; g.stroke();
    g.fillStyle = '#111827'; g.font = `bold 40px ${FONT}`; g.textAlign = 'center'; g.fillText(String(n), 32, 46);
  });
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
  sp.renderOrder = 5;
  return sp;
}

function starGeometry() {
  const sh = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? 0.2 : 0.46, a = Math.PI / 2 + (i * Math.PI) / 5;
    (i ? sh.lineTo : sh.moveTo).call(sh, Math.cos(a) * r, Math.sin(a) * r);
  }
  const g = new THREE.ExtrudeGeometry(sh, { depth: 0.12, bevelEnabled: false });
  g.translate(0, 0, -0.06);
  return g;
}

export class B2Muncher extends CourseScene {
  static courseKey = 'B2';

  async setup() {
    const { root } = this;
    this.tile = null; this.offDrag = null; this.dropResolve = null; this.hovered = -1;
    this.countGen = 0; this.countGrp = null;
    const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, ...extra });
    const box = (w, h, d, x, y, z, m) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); return o; };

    // the machine: a body with googly eyes and an antenna, and a low lip with five mouths on it
    const machine = this.machine = new THREE.Group();
    machine.add(box(8.9, 2.0, 1.7, 0, 1.0, -3.4, mat(SCENE.metal)));
    machine.add(box(8.3, 0.12, 0.5, 0, 1.4, -2.52, mat(SCENE.dark)));
    for (const sx of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.42, 20, 14), mat(0xffffff, { roughness: 0.3 }));
      eye.position.set(sx * 1.0, 2.35, -3.0);
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.2, 14, 10), mat(0x111827, { roughness: 0.3 }));
      pupil.position.set(sx * 1.0, 2.43, -2.62);
      machine.add(eye, pupil);
    }
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.8, 8), mat(SCENE.dark));
    rod.position.set(3.6, 2.4, -3.4);
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.17, 14, 10), mat(0xfacc15, { emissive: 0x7a5c00 }));
    ball.position.set(3.6, 2.85, -3.4);
    machine.add(rod, ball);
    root.add(machine);
    root.add(box(8.4, 0.16, 2.5, 0, 0.08, -1.3, mat(SCENE.dark)));

    this.mouths = TILE_ANSWERS.map((a, i) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(CARD.w, CARD.d), new THREE.MeshBasicMaterial({ map: mouthTexture(a) }));
      m.rotation.x = -Math.PI / 2;
      m.position.set((i - 2) * CARD.gap, 0.17, CARD.z);
      m.userData = { answer: a };
      root.add(m);
      return m;
    });

    const pts = [];
    for (const sx of [-1, 1]) pts.push(new THREE.Vector3(sx * 4.45, 0, 2.7), new THREE.Vector3(sx * 4.45, 2.6, -4.2));
    pts.push(new THREE.Vector3(0, 3.4, -3.2));
    this.fitPts = pts; this.fitLook = [0, 0, -0.8];
    this.fit();

    this.input.onTap(() => (this.tile && this.armed ? [this.tile] : []), () => { this.countSides(this.tile); });
  }

  tw(target, to, opts) { return this.live(tween(target, to, opts)); }
  sleep(ms) { return this.live(wait(ms)); }

  fit() {
    const { stage } = this;
    this._viewKey = `${stage.camera.aspect.toFixed(3)}|${stage.height}`;
    fitView(stage, this.fitPts, this.fitLook);
  }
  update() {
    const { stage } = this;
    if (this._viewKey && this._viewKey !== `${stage.camera.aspect.toFixed(3)}|${stage.height}`) this.fit();
  }

  discard(obj) { this.root.remove(obj); disposeTree(obj); this.stage.invalidate(); }

  // ------------------------------------------------------------------ one item
  async playItem(item, i) {
    const { ui } = this;
    ui.prompt('它有幾多條邊？餵給對的嘴巴', 'How many sides? Feed the right mouth.', { speak: i === 0 });
    await this.slideIn(item);
    for (;;) {
      this.arm(true);
      const m = await this.live(new Promise(r => { this.dropResolve = r; }));
      this.arm(false);
      const picked = TILE_ANSWERS[m];
      if (picked === item.answer) { await this.munch(m); return; }
      await this.spit(m);
      await this.wrong(item, String(picked), ANSWER_TEXT[item.answer].zh);
    }
  }

  async slideIn(item) {
    const tile = makeTile(item.tile, { color: toyColor(this.bridge.rng), size: TILE.size, thickness: TILE.thickness });
    tile.rotation.y = (-item.rot * Math.PI) / 180; // a turned shape is the same shape
    tile.position.set(7, HOME.y, HOME.z);
    const hit = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.3, 1.9), new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.y = 0.1;
    tile.add(hit);
    this.root.add(tile);
    this.tile = tile;
    sfx.whoosh();
    await this.tw(tile.position, { x: HOME.x }, { ms: 450 });
  }

  /** The tile can be dragged (and tapped to count) while armed. */
  arm(on) {
    if (this.offDrag) { this.offDrag(); this.offDrag = null; }
    this.armed = on;
    if (!on || !this.tile) return;
    this.offDrag = this.input.drag(this.tile, {
      lift: 0.6,
      onStart: () => { this.stopCount(); },
      onMove: (o, pt) => this.hover(this.mouthAt(pt)),
      onEnd: async (o, pt, { cancelled }) => {
        const m = cancelled ? -1 : this.mouthAt(pt);
        this.hover(-1);
        if (m >= 0 && this.dropResolve) { const r = this.dropResolve; this.dropResolve = null; r(m); return; }
        if (o.position.distanceTo(HOME) < 0.25) o.position.copy(HOME); // a tap, not a drag
        else await tween(o.position, { x: HOME.x, y: HOME.y, z: HOME.z }, { ms: 250 }); // dropped nowhere: back
      },
    });
  }

  mouthAt(pt) {
    if (pt.z > -0.05 || pt.z < -2.7) return -1;
    let best = -1, bd = 1e9;
    this.mouths.forEach((m, i) => { const d = Math.abs(pt.x - m.position.x); if (d < CARD.w / 2 + 0.1 && d < bd) { best = i; bd = d; } });
    return best;
  }
  hover(i) {
    if (this.hovered === i) return;
    this.hovered = i;
    this.mouths.forEach((m, k) => m.scale.setScalar(k === i ? 1.07 : 1));
    this.stage.invalidate();
  }

  // ---- feeding ----
  async chew() {
    if (motion.less) { await this.tw(this.machine.scale, { y: 1.06 }, { ms: 120 }); await this.tw(this.machine.scale, { y: 1 }, { ms: 120 }); return; }
    for (let k = 0; k < 2; k++) { await this.tw(this.machine.scale, { y: 1.08 }, { ms: 110 }); await this.tw(this.machine.scale, { y: 1 }, { ms: 110 }); }
  }

  async toMouth(m) {
    const t = this.tile, x = this.mouths[m].position.x;
    await this.tw(t.position, { x, y: 0.5, z: HOLE_Z }, { ms: 230 });
  }

  async munch(m) {
    const t = this.tile;
    await this.toMouth(m);
    sfx.munch();
    await Promise.all([this.tw(t.scale, { x: 0.02, y: 0.02, z: 0.02 }, { ms: 320, ease: 'inOutCubic' }), this.chew()]);
    this.stopCount();
    this.tile = null;
    this.discard(t);
    await this.burp();
  }

  /** The machine burps a star. */
  async burp() {
    const star = new THREE.Mesh(starGeometry(), new THREE.MeshStandardMaterial({ color: 0xfacc15, emissive: 0x7a5c00, roughness: 0.4 }));
    star.rotation.x = -ELEV; // faces the camera
    star.position.set(0, 2.5, -3.0); star.scale.setScalar(0.01);
    this.root.add(star);
    sfx.pop();
    await Promise.all([this.tw(star.scale, { x: 1.5, y: 1.5, z: 1.5 }, { ms: 300, ease: 'outBack' }), this.tw(star.position, { y: 3.1 }, { ms: 550 })]);
    sparkle(this.stage, star, this.root);
    await this.tw(star.scale, { x: 0.01, y: 0.01, z: 0.01 }, { ms: 200 });
    this.discard(star);
  }

  /** Wrong mouth: it bites, then spits the tile back to the bench. */
  async spit(m) {
    const t = this.tile, mouth = this.mouths[m];
    await this.toMouth(m);
    await this.tw(t.scale, { x: 0.6, y: 0.6, z: 0.6 }, { ms: 120 });
    sfx.boing();
    if (!motion.less) { // the mouth squashes
      await this.tw(mouth.scale, { x: 1.1, y: 0.9, z: 1 }, { ms: 80 });
      await this.tw(mouth.scale, { x: 1, y: 1, z: 1 }, { ms: 100 });
    }
    await Promise.all([
      this.tw(t.scale, { x: 1, y: 1, z: 1 }, { ms: 380, ease: 'outBack' }),
      this.tw(t.position, { x: HOME.x, z: HOME.z }, { ms: 460 }),
      (async () => { await this.tw(t.position, { y: 1.7 }, { ms: 200 }); await this.tw(t.position, { y: HOME.y }, { ms: 260, ease: 'outBounce' }); })(),
    ]);
  }

  // ---- counting the sides ----
  stopCount() {
    this.countGen++;
    if (this.countGrp) { this.discard(this.countGrp); this.countGrp = null; }
    try { voice.stop(); } catch (e) { /* ignore */ }
  }

  /**
   * Light up the sides one by one (1, 2, 3 ... spoken). Uses tile.userData.points (mesh space) turned by the tile's own rotation,
   * so dented and turned tiles still get every side. A circle has no sides to count: a ring lights up instead.
   */
  async countSides(tile) {
    if (!tile) return;
    this.stopCount();
    const gen = this.countGen;
    const grp = this.countGrp = new THREE.Group();
    this.root.add(grp);
    tile.updateMatrixWorld(true);
    const ud = tile.userData, y = ud.top + HOME.y + 0.04;
    // a lit edge: a white tube with a dark rim, so it shows on any tile colour
    const dark = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.4 });
    const lit = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.6, roughness: 0.3 });
    const ball = new THREE.SphereGeometry(1, 10, 8);
    const up = new THREE.Vector3(0, 1, 0);
    const edge = (a, b) => {
      const g = new THREE.Group(), dir = b.clone().sub(a), len = dir.length(), q = new THREE.Quaternion().setFromUnitVectors(up, dir.clone().normalize());
      for (const [r, m, dy] of [[0.08, dark, 0], [0.05, lit, 0.07]]) {
        const bar = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 10), m);
        bar.position.copy(a).lerp(b, 0.5); bar.position.y += dy; bar.quaternion.copy(q);
        g.add(bar);
        for (const p of [a, b]) { const c = new THREE.Mesh(ball, m); c.scale.setScalar(r); c.position.copy(p); c.position.y += dy; g.add(c); }
      }
      return g;
    };

    if (!ud.points) {
      for (const [r, m, dy] of [[0.08, dark, 0], [0.05, lit, 0.07]]) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(ud.radius + 0.03, r, 8, 64), m);
        ring.rotation.x = Math.PI / 2; ring.position.set(tile.position.x, y + dy, tile.position.z);
        grp.add(ring);
      }
      sfx.tick(0); this.stage.invalidate();
      this.ui.toast('圓形', 'A circle', 1800);
      await this.live(Promise.all([voice.say('它是圓形'), wait(900)]));
      return;
    }

    const W = ud.points.map(([x, z]) => tile.localToWorld(new THREE.Vector3(x, y, z)));
    const n = W.length;
    const cx = W.reduce((t, p) => t + p.x, 0) / n, cz = W.reduce((t, p) => t + p.z, 0) / n;
    const inside = (px, pz) => { // is (px, pz) inside the outline? (even-odd rule)
      let c = false;
      for (let i = 0, j = n - 1; i < n; j = i++) {
        if ((W[i].z > pz) !== (W[j].z > pz) && px < ((W[j].x - W[i].x) * (pz - W[i].z)) / (W[j].z - W[i].z) + W[i].x) c = !c;
      }
      return c;
    };
    const badges = [];
    for (let i = 0; i < n; i++) {
      const a = W[i], b = W[(i + 1) % n], dir = b.clone().sub(a), len = dir.length();
      const mid = a.clone().lerp(b, 0.5);
      // the number floats just outside the outline (also for a dented tile: test which side is outside)
      let nx = dir.z / len, nz = -dir.x / len;
      if (inside(mid.x + nx * 0.08, mid.z + nz * 0.08)) { nx = -nx; nz = -nz; }
      // lean away from the middle of the tile too, so the numbers of two short sides in a dent do not crowd each other
      const rx = mid.x - cx, rz = mid.z - cz, rl = Math.hypot(rx, rz) || 1;
      if ((rx * nx + rz * nz) / rl > 0.2) { nx += rx / rl; nz += rz / rl; const nl = Math.hypot(nx, nz); nx /= nl; nz /= nl; }
      const sp = digitSprite(i + 1);
      sp.position.set(mid.x + nx * 0.45, y + 0.32, mid.z + nz * 0.45);
      for (let k = 0; k < 6; k++) { // two numbers too close (short sides in a dent): push the new one away from the other
        const near = badges.find(o => Math.hypot(o.position.x - sp.position.x, o.position.z - sp.position.z) < 0.52);
        if (!near) break;
        const dx = sp.position.x - near.position.x, dz = sp.position.z - near.position.z, dl = Math.hypot(dx, dz) || 1;
        sp.position.x += (dx / dl) * 0.2; sp.position.z += (dz / dl) * 0.2;
      }
      badges.push(sp);
      sp.scale.setScalar(0.01);
      grp.add(edge(a, b), sp);
      sfx.tick(i);
      this.stage.invalidate();
      const say = voice.say(CN[i + 1]);
      await this.live(Promise.all([tween(sp.scale, { x: 0.46, y: 0.46, z: 0.46 }, { ms: 160, ease: 'outBack' }), say, wait(420)]));
      if (gen !== this.countGen) return;
    }
    this.ui.toast(`${CN[n]}條邊`, `${n} sides`, 1800);
    await this.live(Promise.all([voice.say(`共有${CN[n]}條邊`), wait(700)]));
  }

  /** After two wrong answers: the sides light up one by one with numbers, by themselves. */
  async hint() {
    if (this.tile) await this.countSides(this.tile);
  }
}
