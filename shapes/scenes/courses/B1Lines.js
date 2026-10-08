// B1 直線曲線 Straight or curved (1S2: point, straight line, curved line).
// Items 1-3: a wire lies on the bench; drag it (or tap a basket) to the 直線 or 曲線 basket.
// Item 4: tap two glowing points (點) and a straight laser joins them.
// Item 5: how many straight lines join the two points? One. Then a demo: many curves can.
// Bench scene: the camera looks down at ~55 degrees. Grading is by the item answers from genCourse (shapes-logic.js).
import * as THREE from 'three';
import { CourseScene } from '../CourseScene.js?v=202610081258';
import { tween, wait, motion } from '../../engine/tween.js?v=202610081258';
import { voice } from '../../engine/voice.js?v=202610081258';
import { FONT, SCENE, toyColor } from '../../theme.js?v=202610081258';
import { sfx } from '../../sfx.js?v=202610081258';
import { disposeTree } from '../../engine/stage.js?v=202610081258';
import { makeWire, makeLaser, makeCurve } from '../../models/tiles.js?v=202610081258';
import { LINES, shuffle } from '../../../shapes-logic.js?v=202610081258';

const ELEV = (55 * Math.PI) / 180, SIN = Math.sin(ELEV), COS = Math.cos(ELEV);
const Y_AXIS = new THREE.Vector3(0, 1, 0);

/**
 * Put the camera ~55 degrees above `look`, as close as possible while every point in `pts` stays on screen
 * (clear of the prompt bar at the top and `bottom` px of buttons at the bottom), with the content centred in the free band.
 * (The same helper lives in B2Muncher.js; the two course files are independent on purpose.)
 */
function fitView(stage, pts, look, { top: topPx = 175, bottom = 24, side = 0.86, ms = 0 } = {}) {
  const cam = stage.camera, h = Math.max(1, stage.height), top = Math.min(topPx, h * 0.3); // landscape phones: keep the stage big
  const yHi = 1 - (2 * top) / h, yLo = -1 + (2 * bottom) / h, mid = (yHi + yLo) / 2;
  const tanV = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
  const v = new THREE.Vector3(), L = new THREE.Vector3(...look);
  const measure = d => {
    cam.position.set(L.x, L.y + SIN * d, L.z + COS * d); cam.lookAt(L); cam.updateMatrixWorld();
    let x = 0, y0 = 1e9, y1 = -1e9;
    for (const p of pts) { v.copy(p).project(cam); x = Math.max(x, Math.abs(v.x)); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y); }
    return { x, y0, y1 };
  };
  let best = 40;
  for (let d = 6; d <= 40; d += 0.25) {
    L.z = look[2];
    let m = measure(d);
    for (let pass = 0; pass < 2; pass++) { // slide the look point along z to centre the content in the free band
      L.z -= (((m.y0 + m.y1) / 2 - mid) * d * tanV) / SIN;
      m = measure(d);
    }
    if (m.x <= side && m.y0 >= yLo && m.y1 <= yHi) { best = d; break; }
  }
  L.z = look[2];
  let m = measure(best);
  for (let pass = 0; pass < 2; pass++) { L.z -= (((m.y0 + m.y1) / 2 - mid) * best * tanV) / SIN; m = measure(best); }
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
const flatPlane = (w, d, map) => {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshBasicMaterial({ map }));
  m.rotation.x = -Math.PI / 2;
  return m;
};

// ---- baskets ----
const BASKET = { w: 2.5, d: 2.0, h: 0.55, t: 0.12 };

function drawIcon(g, kind, cx, cy) {
  g.save(); g.strokeStyle = '#334155'; g.fillStyle = '#e5e7eb'; g.lineWidth = 6; g.lineCap = 'round';
  if (kind === 'straight') { // ruler
    rr(g, cx - 70, cy - 22, 140, 44, 6); g.fill(); g.stroke();
    g.lineWidth = 4;
    for (let i = 0; i <= 8; i++) { g.beginPath(); g.moveTo(cx - 60 + i * 15, cy - 22); g.lineTo(cx - 60 + i * 15, cy - (i % 2 ? 6 : 2) + 0); g.stroke(); }
  } else { // wave
    g.lineWidth = 9; g.beginPath();
    for (let i = 0; i <= 40; i++) { const x = cx - 70 + i * 3.5, y = cy + Math.sin((i / 40) * Math.PI * 2) * 22; if (i) g.lineTo(x, y); else g.moveTo(x, y); }
    g.stroke();
  }
  g.restore();
}

function makeBasket(answer, zh, en) {
  const { w, d, h, t } = BASKET, g = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: SCENE.bench, roughness: 0.8 });
  const inner = new THREE.MeshStandardMaterial({ color: 0x8a5a2b, roughness: 0.9 });
  const part = (sx, sy, sz, px, py, pz, mat) => { const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat); m.position.set(px, py, pz); g.add(m); };
  part(w, 0.1, d, 0, 0.05, 0, inner);
  part(w, h, t, 0, h / 2, -d / 2, wood);
  part(w, h * 0.7, t, 0, (h * 0.7) / 2, d / 2, wood);
  part(t, h, d, -w / 2, h / 2, 0, wood);
  part(t, h, d, w / 2, h / 2, 0, wood);
  const label = flatPlane(w, 0.98, textureOf(512, 200, (c, W, H) => {
    c.fillStyle = '#fffbeb'; rr(c, 6, 6, W - 12, H - 12, 28); c.fill();
    c.strokeStyle = '#334155'; c.lineWidth = 8; c.stroke();
    drawIcon(c, answer, 120, 100);
    c.fillStyle = '#1f2937'; c.textAlign = 'center';
    c.font = `bold 78px ${FONT}`; c.fillText(zh, 360, 108);
    c.font = `34px ${FONT}`; c.fillStyle = '#475569'; c.fillText(en, 360, 156);
  }));
  label.position.set(0, 0.02, d / 2 + 0.72);
  g.add(label);
  g.userData = { answer };
  return g;
}

export class B1Lines extends CourseScene {
  static courseKey = 'B1';

  async setup() {
    const { root } = this;
    this.mode = 'sort';
    this.pickResolve = null; this.tapResolve = null; this.offDrag = null; this.holder = null; this.wireHome = new THREE.Vector3(0, 0.18, 0.15);
    this.laser = null; this.pulsing = []; this.pulseT = 0;

    // two baskets; which side is which is random
    const sides = shuffle([['straight', '直線', 'Straight'], ['curved', '曲線', 'Curved']], this.bridge.rng);
    this.baskets = sides.map(([a, zh, en], i) => {
      const b = makeBasket(a, zh, en);
      b.position.set(i === 0 ? -3.15 : 3.15, 0, -0.45);
      root.add(b);
      return b;
    });

    // the two points of the dot tasks (built when the sorting is over)
    this.dotPos = shuffle([[[-2.3, -0.4], [2.3, 0.9]], [[-2.2, 0.8], [2.2, -0.5]], [[-2.4, 0.2], [2.4, 0.6]]], this.bridge.rng)[0]
      .map(([x, z]) => new THREE.Vector3(x, 0.26, z));

    const pts = [];
    for (const sx of [-1, 1]) for (const [y, z] of [[0, 2.1], [0.6, -1.5]]) pts.push(new THREE.Vector3(sx * 4.5, y, z));
    pts.push(new THREE.Vector3(-1.7, 0.3, -0.8), new THREE.Vector3(1.7, 0.3, 1.1));
    this.fitPts = pts; this.fitLook = [0, 0, 0.2];
    this.fit();

    // taps: baskets (while a sort is waiting) and dots (while a dot task is waiting)
    this.input.onTap(() => (this.pickResolve ? this.baskets : []), b => {
      const r = this.pickResolve; if (!r) return;
      this.pickResolve = null; r({ answer: b.userData.answer, basket: b });
    });
    this.dots = [];
    this.input.onTap(() => (this.tapResolve ? this.dots : []), d => {
      const r = this.tapResolve; if (!r) return;
      this.tapResolve = null; r(d);
    });
  }

  /** Tweens and waits that never resume once the scene was left. */
  tw(target, to, opts) { return this.live(tween(target, to, opts)); }
  sleep(ms) { return this.live(wait(ms)); }

  /** Remove an object from the scene and free its GPU memory. */
  discard(obj) {
    this.root.remove(obj); disposeTree(obj);
    this.stage.invalidate();
  }

  fit(ms = 0) {
    const { stage } = this;
    this._viewKey = `${stage.camera.aspect.toFixed(3)}|${stage.height}`;
    const howMany = this.items && this.items[this.index] && this.items[this.index].kind === 'dots-howmany';
    fitView(stage, this.mode === 'dots' ? this.dotFitPts : this.fitPts, this.mode === 'dots' ? this.dotLook : this.fitLook, { bottom: howMany ? 120 : 24, ms });
  }

  update(dt) {
    const { stage } = this;
    if (this._viewKey && this._viewKey !== `${stage.camera.aspect.toFixed(3)}|${stage.height}`) this.fit();
    if (this.pulsing.length && !motion.less) {
      this.pulseT += dt;
      const s = 1 + 0.22 * Math.sin(this.pulseT * 6);
      for (const d of this.pulsing) d.userData.ring.scale.setScalar(s);
      stage.invalidate();
    }
  }

  /** Rings of these dots pulse (an invitation to tap); [] stops it. */
  pulse(list) {
    for (const d of this.dots) { d.userData.ring.scale.setScalar(1); }
    this.pulsing = list;
    this.stage.awake('b1-pulse', list.length > 0 && !motion.less);
    if (motion.less) for (const d of list) d.userData.ring.scale.setScalar(1.25);
    this.stage.invalidate();
  }

  async exit() {
    this.stage.awake('b1-pulse', false);
    await super.exit();
  }

  // ------------------------------------------------------------------ items
  async playItem(item) {
    if (item.kind === 'line') return this.playSort(item);
    if (item.kind === 'dots-connect') return this.playConnect();
    return this.playHowMany(item);
  }

  // ---- sorting ----
  spawnWire(lineId) {
    const holder = new THREE.Group();
    const inner = makeWire(lineId, { color: toyColor(this.bridge.rng) });
    inner.rotation.x = -Math.PI / 2; inner.scale.setScalar(1.5);
    const hit = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.6, 1.5), new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.y = 0.2;
    holder.add(inner, hit);
    holder.userData.inner = inner;
    holder.position.set(this.wireHome.x, 3.4, this.wireHome.z);
    this.root.add(holder);
    this.holder = holder;
    return holder;
  }

  basketAt(pt) {
    let best = null, bd = 1e9;
    for (const b of this.baskets) {
      const dx = Math.abs(pt.x - b.position.x), dz = Math.abs(pt.z - b.position.z);
      if (dx < BASKET.w / 2 + 0.35 && dz < BASKET.d / 2 + 0.35 && dx + dz < bd) { best = b; bd = dx + dz; }
    }
    return best;
  }

  hover(b) {
    if (this.hovered === b) return;
    this.hovered = b;
    for (const k of this.baskets) k.scale.setScalar(k === b ? 1.07 : 1);
    this.stage.invalidate();
  }

  armWire(holder) {
    if (this.offDrag) this.offDrag();
    this.offDrag = this.input.drag(holder, {
      lift: 0.5,
      onMove: (o, pt) => this.hover(this.basketAt(pt)),
      onEnd: async (o, pt, { cancelled }) => {
        const b = cancelled ? null : this.basketAt(pt);
        this.hover(null);
        if (b && this.pickResolve) { const r = this.pickResolve; this.pickResolve = null; r({ answer: b.userData.answer, basket: b }); return; }
        await this.tw(o.position, { x: this.wireHome.x, y: this.wireHome.y, z: this.wireHome.z }, { ms: 220 }); // dropped nowhere: back
      },
    });
  }
  disarmWire() { if (this.offDrag) { this.offDrag(); this.offDrag = null; } }

  async wobble(obj) {
    if (motion.less) return;
    for (const a of [0.3, -0.3, 0]) await this.tw(obj.rotation, { y: a }, { ms: 90 });
  }

  async playSort(item) {
    const { ui } = this;
    const info = LINES.find(l => l.id === item.line);
    ui.prompt('這是直線還是曲線？放進正確的籃子。', 'Straight or curved? Put it in the right basket.', { speak: this.index === 0 });
    const holder = this.spawnWire(item.line);
    sfx.pop();
    await this.tw(holder.position, { y: this.wireHome.y }, { ms: 450, ease: 'outBounce' });
    for (;;) {
      this.armWire(holder);
      const pick = await this.live(new Promise(r => { this.pickResolve = r; }));
      this.disarmWire();
      if (pick.answer === item.answer) {
        await this.live(this.dropIn(holder, pick.basket));
        this.discard(holder);
        this.holder = null;
        return;
      }
      await this.live(this.reject(holder, pick.basket));
      await this.wrong(item, pick.answer, info.zh);
    }
  }

  async dropIn(holder, basket) {
    const bx = basket.position.x, bz = basket.position.z;
    await this.tw(holder.position, { x: bx, y: 1.5, z: bz }, { ms: 260 });
    sfx.pop();
    await Promise.all([
      this.tw(holder.position, { y: 0.35 }, { ms: 220, ease: 'outBounce' }),
      this.tw(holder.scale, { x: 0.45, y: 0.45, z: 0.45 }, { ms: 220 }),
    ]);
    if (!motion.less) { await this.tw(basket.scale, { y: 1.12 }, { ms: 90 }); await this.tw(basket.scale, { y: 1 }, { ms: 110 }); }
    await this.tw(holder.scale, { x: 0.01, y: 0.01, z: 0.01 }, { ms: 160 });
  }

  async reject(holder, basket) {
    sfx.boing();
    const h = this.wireHome;
    const shake = async () => {
      if (motion.less) return;
      const x0 = basket.position.x;
      for (const dx of [0.14, -0.14, 0.08, 0]) await this.tw(basket.position, { x: x0 + dx }, { ms: 60 });
    };
    await Promise.all([
      shake(),
      this.tw(holder.position, { x: h.x, y: h.y, z: h.z }, { ms: 400, ease: 'outBack' }),
      this.wobble(holder),
    ]);
  }

  /** Demo after two wrong answers: a straight laser from end to end. A straight wire lies along it, a curved one bows away from it. */
  async hint(item) {
    if (item.kind === 'dots-howmany') { await this.tryAnother(); return; }
    if (item.kind !== 'line' || !this.holder) return;
    const holder = this.holder;
    holder.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(holder.userData.inner);
    const y = 0.4, z = (box.min.z + box.max.z) / 2;
    const beam = this.shoot(new THREE.Vector3(box.min.x - 0.1, y, z), new THREE.Vector3(box.max.x + 0.1, y, z), { color: 0xef4444, radius: 0.03 });
    sfx.zap();
    await this.tw(beam.inner.scale, { y: beam.len }, { ms: 350 });
    const straight = item.answer === 'straight';
    this.ui.toast(straight ? '直線是直的，沒有彎曲' : '曲線是彎彎的', straight ? 'A straight line does not bend.' : 'A curved line bends away from the straight line.', 2600);
    await Promise.all([this.live(voice.say(straight ? '直線是直的，沒有彎曲' : '曲線是彎彎的')), this.sleep(1800)]);
    this.discard(beam.pivot);
  }

  // ---- dots ----
  async toDots() {
    if (this.mode === 'dots') return;
    this.mode = 'dots';
    const [a, b] = this.dotPos, mid = a.clone().lerp(b, 0.5), n = b.clone().sub(a).normalize();
    n.set(-n.z, 0, n.x); // sideways: room for the curves of the demo
    this.dotFitPts = [a, b, mid.clone().addScaledVector(n, 1.9), mid.clone().addScaledVector(n, -1.9), a.clone().add(new THREE.Vector3(0, 0, 1.1)), b.clone().add(new THREE.Vector3(0, 0, 1.1))];
    this.dotLook = [mid.x, 0, mid.z];
    this.fit(500);
    await this.live(Promise.all(this.baskets.map(b => this.tw(b.scale, { x: 0.01, y: 0.01, z: 0.01 }, { ms: 300 }))));
    for (const b of this.baskets) b.visible = false;
    this.dotPos.forEach(p => {
      const g = new THREE.Group();
      const core = new THREE.Mesh(new THREE.SphereGeometry(0.26, 24, 16), new THREE.MeshStandardMaterial({ color: 0xfde047, emissive: 0xfacc15, emissiveIntensity: 0.7, roughness: 0.3 }));
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.38, 0.54, 32), new THREE.MeshBasicMaterial({ color: 0xfacc15, transparent: true, opacity: 0.75, side: THREE.DoubleSide }));
      ring.rotation.x = -Math.PI / 2; ring.position.y = -0.24;
      const hit = new THREE.Mesh(new THREE.SphereGeometry(0.85, 10, 8), new THREE.MeshBasicMaterial({ visible: false }));
      const label = flatPlane(0.95, 0.5, textureOf(256, 134, (c, W, H) => {
        c.fillStyle = '#fffbeb'; rr(c, 4, 4, W - 8, H - 8, 24); c.fill(); c.strokeStyle = '#334155'; c.lineWidth = 6; c.stroke();
        c.fillStyle = '#1f2937'; c.textAlign = 'center'; c.font = `bold 62px ${FONT}`; c.fillText('點', W / 2, 74);
        c.font = `26px ${FONT}`; c.fillStyle = '#475569'; c.fillText('dot', W / 2, 110);
      }));
      label.position.set(0, -0.23, 0.95);
      g.add(core, ring, hit, label);
      g.position.copy(p); g.scale.setScalar(0.01);
      g.userData = { ring };
      this.root.add(g); this.dots.push(g);
    });
    sfx.pop();
    await this.live(Promise.all(this.dots.map(d => this.tw(d.scale, { x: 1, y: 1, z: 1 }, { ms: 350, ease: 'outBack' }))));
  }

  waitTap() { return new Promise(r => { this.tapResolve = r; }); }

  /** A beam that starts at a, grows towards b (grow inner.scale.y to len). Returns { pivot, inner, len }. */
  shoot(a, b, opts) {
    const dir = b.clone().sub(a), len = dir.length();
    const pivot = new THREE.Group(); pivot.position.copy(a);
    const inner = new THREE.Group(); inner.quaternion.setFromUnitVectors(Y_AXIS, dir.normalize()); inner.scale.y = 0.001;
    inner.add(makeLaser(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 1, 0), opts));
    pivot.add(inner); this.root.add(pivot);
    this.stage.invalidate();
    return { pivot, inner, len };
  }

  async playConnect() {
    const { ui } = this;
    await this.toDots();
    ui.prompt('用直線連接兩點', 'Join the two dots with a straight line.');
    this.pulse(this.dots.slice());
    let first = null, second = null;
    while (!second) {
      const d = await this.live(this.waitTap());
      sfx.tick(first ? 3 : 0);
      if (!first) {
        first = d; d.userData.ring.material.color.set(0xffffff);
        this.pulse(this.dots.filter(x => x !== d));
      } else if (d === first) { // tapped the same one again: start over
        d.userData.ring.material.color.set(0xfacc15); first = null; this.pulse(this.dots.slice());
      } else second = d;
    }
    this.pulse([]);
    this.laser = this.shoot(first.position, second.position, { color: 0xef4444, radius: 0.04 });
    sfx.zap();
    await this.tw(this.laser.inner.scale, { y: this.laser.len }, { ms: 320 });
    ui.toast('這是一條直線！', 'A straight line!', 1500);
    await this.sleep(1100);
  }

  /** Make sure the two dots and the first laser exist (also when this item is replayed without the connect step). */
  async ensureLaser() {
    await this.toDots();
    if (this.laser) return;
    this.laser = this.shoot(this.dots[0].position, this.dots[1].position, { color: 0xef4444, radius: 0.04 });
    this.laser.inner.scale.y = this.laser.len;
  }

  async playHowMany(item) {
    const { ui } = this;
    await this.ensureLaser();
    this.fit(400); // leave room for the buttons
    ui.prompt('可以畫多少條直線連接這兩點？', 'How many straight lines can join these two dots?');
    const opts = shuffle([{ id: 'one', zh: '1 條', en: 'One' }, { id: 'many', zh: '很多條', en: 'Many' }], this.bridge.rng);
    for (;;) {
      const id = await this.live(ui.choices(opts));
      if (id === item.answer) {
        ui.mark(id, true);
        ui.clearChoices();
        await this.live(this.curveDemo());
        return;
      }
      ui.mark(id, false);
      await this.wrong(item, id, '連接兩點的直線');
      if (this.tries[this.index] !== 2) await this.live(this.tryAnother()); // after the 2nd wrong answer hint() already showed it
    }
  }

  /** Try to add a second straight line: it swings in and lands exactly on the first one. */
  async tryAnother() {
    const [a, b] = this.dotPos;
    const beam = this.shoot(a, b, { color: 0x2563eb, radius: 0.06 });
    beam.pivot.rotation.y = 0.4;
    sfx.zap();
    await this.tw(beam.inner.scale, { y: beam.len }, { ms: 300 });
    this.ui.toast('只可以畫一條直線', 'Only one! The new line lands right on the first.', 2600);
    sfx.boing();
    await this.tw(beam.pivot.rotation, { y: 0 }, { ms: 450, ease: 'outBack' });
    await Promise.all([this.live(voice.say('只可以畫一條直線，第二條會和第一條重疊')), this.sleep(1500)]);
    this.discard(beam.pivot);
  }

  /** Many curves go through the same two points. */
  async curveDemo() {
    const [a, b] = this.dotPos;
    const say = this.ui.prompt('但是曲線可以畫很多條！', 'But many curves can!');
    for (const bend of [1.7, -1.3, 0.9, -0.7]) {
      let col = toyColor(this.bridge.rng);
      if (col === 0xef4444) col = 0x3b82f6; // not the laser's red
      const c = makeCurve(a, b, bend, { color: col, radius: 0.04 });
      const total = c.geometry.index.count, N = 10;
      c.geometry.setDrawRange(0, 0);
      this.root.add(c);
      sfx.pop();
      for (let k = 1; k <= N; k++) {
        c.geometry.setDrawRange(0, Math.round((total * k) / N / 6) * 6);
        this.stage.invalidate();
        await this.sleep(35);
      }
      await this.sleep(120);
    }
    await this.live(Promise.all([say, this.sleep(800)]));
  }
}
