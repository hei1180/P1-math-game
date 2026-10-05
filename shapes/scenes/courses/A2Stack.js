// A2 疊高塔 Stack tower. Two towers (2 + 3 pieces) on a table, each starting on a cuboid base. Per item a tray of 3 solids.
// Grading is shapes-logic canPlace(piece, topModel, isLast). Physics only shows the result:
//  - a right piece is set down on the tower with a short bounce and then becomes a static body, so a right answer can never
//    make a tower fall;
//  - a wrong piece is dropped on the tower as a dynamic body, rolls / topples off with a crash and flies back to the tray.
import * as THREE from 'three';
import { CourseScene } from '../CourseScene.js?v=202610051406';
import { FAMILY, familyOf, canPlace, topIsFlat, bottomIsFlat } from '../../../shapes-logic.js?v=202610051406';
import { tween, wait, motion } from '../../engine/tween.js?v=202610051406';
import { disposeTree } from '../../engine/stage.js?v=202610051406';
import { createPhysics } from '../../engine/physics.js?v=202610051406';
import { SCENE, toyColor } from '../../theme.js?v=202610051406';
import { sfx } from '../../sfx.js?v=202610051406';
import { voice } from '../../engine/voice.js?v=202610051406';
import { makeSolid, setMood, physicsShapeOf } from '../../models/solids.js?v=202610051406';
import { puff } from '../../fx3d.js?v=202610051406';

const TABLE_Y = 0.6;                     // table top
const TOWER_Z = -0.6;
const TOWER_X = [-2.4, 2.4];
const TRAY = { y: TABLE_Y + 0.08, z: 1.05, xs: [-1.3, 0, 1.3] };
const BASE_SCALE = 1.2;                  // the cuboid base is a bit bigger than the pieces
const HOVER = 0.45;                      // pieces hover this far above the tower before they drop
const NOMINAL = 0.9;                     // nominal piece height, for the target flags
const DRAG_PLANE = new THREE.Plane(new THREE.Vector3(0, 0, 1), -(TRAY.z + 0.15));

export class A2Stack extends CourseScene {
  static courseKey = 'A2';

  async setup() {
    const { stage } = this;
    const R = this.root;
    this.busy = false; this.waiter = null; this.active = null; this.tray = []; this.lastWrong = null;

    // ---- the table, the tray ----
    const wood = new THREE.MeshLambertMaterial({ color: SCENE.bench }), dark = new THREE.MeshLambertMaterial({ color: 0x8b5a2b });
    this.physics = await this.live(createPhysics(stage));
    const ph = this.physics;
    ph.addGround({ y: 0 });
    const top = new THREE.Mesh(new THREE.BoxGeometry(8.4, 0.2, 3.6), wood);
    top.position.set(0, TABLE_Y - 0.1, 0.1);
    R.add(top);
    ph.addBox(top, { size: [8.4, 0.2, 3.6], mass: 0 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.22, TABLE_Y - 0.2, 0.22), dark);
      leg.position.set(sx * 3.95, (TABLE_Y - 0.2) / 2, 0.1 + sz * 1.5);
      R.add(leg);
    }
    // a low lip round the table, plus invisible walls above it: toppled pieces stay on the table (and in view)
    for (const [w, d, x, z] of [[0.15, 3.6, -4.125, 0.1], [0.15, 3.6, 4.125, 0.1], [8.4, 0.15, 0, -1.725], [8.4, 0.15, 0, 1.925]]) {
      const lip = new THREE.Mesh(new THREE.BoxGeometry(w, 0.2, d), dark);
      lip.position.set(x, TABLE_Y + 0.1, z);
      R.add(lip);
      const wall = new THREE.Object3D();
      wall.position.set(x, TABLE_Y + 1.5, z);
      ph.addBox(wall, { size: [w + 0.1, 3, d + 0.1], mass: 0 });
    }
    const tray = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.08, 1.5), new THREE.MeshLambertMaterial({ color: 0xfde68a }));
    tray.position.set(0, TABLE_Y + 0.04, TRAY.z);
    R.add(tray);

    // ---- two tower spots: cuboid base, target flag, spot pad ----
    this.towers = TOWER_X.map((x, i) => {
      const base = makeSolid('cuboid', { color: toyColor(this.bridge.rng), shadow: false });
      base.scale.setScalar(BASE_SCALE);
      const h = base.userData.height * BASE_SCALE;
      base.position.set(x, TABLE_Y + h / 2, TOWER_Z);
      R.add(base);
      ph.addBox(base, { size: [1 * BASE_SCALE, h, 0.6 * BASE_SCALE], mass: 0 });
      const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.95, 0.02, 32), new THREE.MeshLambertMaterial({ color: 0xfde68a }));
      pad.position.set(x, TABLE_Y + 0.01, TOWER_Z);
      R.add(pad);
      const pieces = i === 0 ? 2 : 3;
      const flagY = TABLE_Y + h + pieces * NOMINAL;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, flagY - TABLE_Y, 8), new THREE.MeshLambertMaterial({ color: 0x64748b }));
      pole.position.set(x + 0.8, TABLE_Y + (flagY - TABLE_Y) / 2, TOWER_Z - 0.55);
      const flag = new THREE.Group();
      const cloth = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.32), new THREE.MeshBasicMaterial({ color: 0xfacc15, side: THREE.DoubleSide }));
      cloth.position.set(0.28, 0, 0);
      flag.add(cloth);
      flag.position.set(x + 0.8, flagY - 0.18, TOWER_Z - 0.55);
      R.add(pole, flag);
      return { x, base, flag, topY: TABLE_Y + h, topModel: 'cuboid', pieces: [], dir: i === 0 ? -1 : 1, done: false };
    });

    // ---- the pointer: a gold arrow over the tower being built ----
    this.arrow = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.65, 16), new THREE.MeshLambertMaterial({ color: 0xfacc15, emissive: 0x7a5c00 }));
    this.arrow.rotation.x = Math.PI;
    this.arrow.visible = false;
    R.add(this.arrow);
    this.bobT = 0;
    this.offBob = stage.onUpdate(dt => {
      if (!this.arrow.visible || motion.less || !this.target) return;
      this.bobT += dt;
      this.arrow.position.y = this.arrowY + Math.sin(this.bobT * 4) * 0.08;
    });

    ph.start();
    this.fitView();
    this.offResize = stage.onUpdate(() => { if (stage.width !== this._fw || stage.height !== this._fh) this.fitView(); });

    // taps and drags on tray pieces
    this.input.onTap(() => this.tray, mesh => this.choose(mesh));
    stage.invalidate();
  }

  /** Frame the table for the current aspect ratio. */
  fitView() {
    const { stage } = this;
    this._fw = stage.width; this._fh = stage.height;
    const aspect = stage.width / stage.height, tanV = Math.tan(THREE.MathUtils.degToRad(20)), tanH = tanV * aspect;
    const dist = Math.max(4.45 / tanH, 2.55 / tanV) + 0.4;
    const look = [0, 1.8, 0.2], dir = new THREE.Vector3(0, 0.5, 0.86).normalize();
    stage.setView([look[0], look[1] + dir.y * dist, look[2] + dir.z * dist], look);
  }

  async exit() {
    if (this.offResize) this.offResize();
    if (this.offBob) this.offBob();
    this.stage.awake('a2-bob', false);
    if (this.physics) this.physics.dispose();
    this.waiter = null; this.tray = [];
    await super.exit();
  }

  // ---------------------------------------------------------------- one item

  async playItem(item) {
    const { ui } = this;
    const T = this.towers[item.tower];
    this.target = T;
    this.showArrow(T);
    await this.live(this.fillTray(item.tray));
    if (item.isLast) ui.prompt('最後一個，放在最頂！', 'The last one goes on the very top!');
    else ui.prompt('哪一個可以疊上去？', 'Which can go on top?');

    for (;;) {
      const mesh = await this.live(this.pick());
      this.busy = true;
      const model = mesh.userData.modelId;
      // grading (shapes-logic only)
      const ok = canPlace(model, T.topModel, item.isLast);
      this.arrow.visible = false;
      await this.live(this.flyAbove(mesh, T));
      if (ok) {
        await this.live(this.setDown(mesh, T, model));
        this.removeFromTray(mesh);
        this.active = null;
        break;
      }
      const reason = !bottomIsFlat(model) ? '底部是圓的' : '頂部不平';
      this.lastWrong = reason;
      await this.live(this.topple(mesh, T));
      await this.live(this.sendBack(mesh));
      this.active = null;
      this.busy = false;
      this.showArrow(T);
      await this.wrong(item, reason, FAMILY[familyOf(model)].zh);
    }

    // the leftovers go away; the tower stays
    this.hideArrow();
    if (item.isLast) {
      T.done = true;
      await this.live(this.finishTower(T));
    }
    await this.live(this.clearTray());
    this.busy = false;
  }

  // ---------------------------------------------------------------- tray

  async fillTray(models) {
    this.tray = [];
    const jobs = models.map((id, i) => {
      const m = makeSolid(id, { color: toyColor(this.bridge.rng), shadow: false });
      m.userData.slot = new THREE.Vector3(TRAY.xs[i], TRAY.y + m.userData.restY, TRAY.z);
      m.position.copy(m.userData.slot);
      m.scale.setScalar(0.01);
      this.root.add(m);
      this.tray.push(m);
      m.userData.offDrag = this.input.drag(m, {
        plane: DRAG_PLANE, lift: 0.1,
        onStart: () => { if (!this.busy && this.waiter) sfx.tick(); },
        onEnd: (obj, pt, { cancelled }) => this.dropped(obj, cancelled),
      });
      return tween(m.scale, { x: 1, y: 1, z: 1 }, { ms: 320, ease: 'outBack', delay: i * 110 });
    });
    sfx.pop();
    await Promise.all(jobs);
  }

  removeFromTray(mesh) {
    this.tray = this.tray.filter(m => m !== mesh);
    if (mesh.userData.offDrag) { mesh.userData.offDrag(); mesh.userData.offDrag = null; }
  }

  async clearTray() {
    const left = this.tray.slice();
    this.tray = [];
    for (const m of left) if (m.userData.offDrag) { m.userData.offDrag(); m.userData.offDrag = null; }
    if (!left.length) return;
    sfx.pop();
    await Promise.all(left.map((m, i) => tween(m.scale, { x: 0.01, y: 0.01, z: 0.01 }, { ms: 220, ease: 'inOutCubic', delay: i * 60 })));
    for (const m of left) { this.root.remove(m); disposeTree(m); }
    this.stage.invalidate();
  }

  // ---------------------------------------------------------------- choosing

  /** Resolves with the tray piece the child picks (tap, or drag onto the tower). */
  pick() { return new Promise(resolve => { this.waiter = resolve; }); }

  choose(mesh) {
    if (!this.waiter || this.busy || !this.tray.includes(mesh)) return;
    const w = this.waiter; this.waiter = null; this.active = mesh; w(mesh);
  }

  /** A dragged piece was let go: onto the tower it counts, anywhere else it goes back to its place. */
  dropped(mesh, cancelled) {
    if (!this.tray.includes(mesh) || mesh === this.active) return; // the chosen piece is flying: motion owns it
    const slot = mesh.userData.slot;
    if (mesh.position.distanceTo(slot) < 0.25) { mesh.position.copy(slot); this.stage.invalidate(); return; } // just a tap: onTap decides
    if (!cancelled && !this.busy && this.waiter && this.nearTower(mesh)) { this.choose(mesh); return; }
    this.glideTo(mesh, slot, 260);
  }

  nearTower(mesh) {
    const T = this.target;
    if (!T) return false;
    const { stage } = this;
    const p = stage.toScreen(mesh), s = stage.toScreen(mesh.userData.slot);
    // one world unit in pixels: on a narrow phone the whole table is small, so a fixed pixel radius would cover it
    const a = stage.toScreen(new THREE.Vector3(T.x, TABLE_Y, TOWER_Z)), b = stage.toScreen(new THREE.Vector3(T.x + 1, TABLE_Y, TOWER_Z));
    const lim = Math.min(Math.max(110, stage.height * 0.2), 1.6 * Math.hypot(b.x - a.x, b.y - a.y));
    for (const y of [T.topY + 0.4, (T.topY + TABLE_Y) / 2, TABLE_Y + 0.3]) {
      const q = stage.toScreen(new THREE.Vector3(T.x, y, TOWER_Z));
      const d = Math.hypot(p.x - q.x, p.y - q.y);
      if (d < lim && d < 0.6 * Math.hypot(s.x - q.x, s.y - q.y)) return true; // and clearly nearer the tower than its tray place
    }
    return false;
  }

  // ---------------------------------------------------------------- motion helpers

  /** Fly a mesh to `pos` (and upright) along an arc. */
  fly(mesh, pos, { ms = 450, arc = 0.7, ease = 'inOutCubic' } = {}) {
    const p0 = mesh.position.clone(), q0 = mesh.quaternion.clone(), q1 = new THREE.Quaternion();
    const drv = {
      _t: 0,
      get t() { return this._t; },
      set t(v) {
        this._t = v;
        mesh.position.lerpVectors(p0, pos, v);
        mesh.position.y += Math.sin(Math.PI * v) * arc;
        mesh.quaternion.slerpQuaternions(q0, q1, v);
      },
    };
    return tween(drv, { t: 1 }, { ms, ease });
  }

  glideTo(mesh, pos, ms = 260) { sfx.whoosh(); return this.fly(mesh, pos, { ms, arc: 0.2 }); }

  /** Hover over the tower, ready to drop. */
  async flyAbove(mesh, T) {
    sfx.whoosh();
    const r = mesh.userData.restY;
    await this.fly(mesh, new THREE.Vector3(T.x, T.topY + r + HOVER, TOWER_Z), { ms: 480, arc: 0.6 });
  }

  /** Right answer: drop onto the tower, bounce, and lock it in place (static body). */
  async setDown(mesh, T, model) {
    const r = mesh.userData.restY, y = T.topY + r;
    await tween(mesh.position, { y }, { ms: 380, ease: 'outBounce' });
    mesh.position.set(T.x, y, TOWER_Z);
    sfx.clunk();
    setMood(mesh, 'happy');
    this.physics.addSolid(mesh, physicsShapeOf(model), { mass: 0 });
    puff(this.stage, new THREE.Vector3(T.x, T.topY, TOWER_Z), this.root);
    if (!motion.less) {
      mesh.scale.y = 0.85;
      await tween(mesh.scale, { y: 1 }, { ms: 220, ease: 'outBack' });
    }
    T.topY = y + mesh.userData.top;
    T.topModel = model;
    T.pieces.push(mesh);
    this.stage.invalidate();
  }

  /** Wrong answer: let go over the tower as a dynamic body; it rolls or tumbles off. */
  async topple(mesh, T) {
    const model = mesh.userData.modelId, ph = this.physics;
    setMood(mesh, 'oops');
    const body = ph.addSolid(mesh, physicsShapeOf(model), { mass: 1 });
    const out = T.dir, round = model === 'sphere';
    // off to the side and a little toward the child, so it stays in view and on the table
    body.linearDamping = round ? 0.1 : 0.4; body.angularDamping = round ? 0.1 : 0.4; // a ball keeps rolling, the rest tumble
    body.velocity.set(out * (round ? 1.1 : 1.3), round ? 0.3 : 0.7, round ? 0.4 : 0.7);
    body.angularVelocity.set(round ? 0 : 2, 0, round ? -out * 3 : -out * 5);
    setTimeout(() => { if (this.alive) sfx.crash(); }, 380);
    sfx.boing();
    await ph.settle(2600);
    ph.remove(body);
    setMood(mesh, 'dizzy');
    this.stage.invalidate();
    await wait(450);
  }

  /** Back to its place in the tray. */
  async sendBack(mesh) {
    const slot = mesh.userData.slot;
    sfx.whoosh();
    await this.fly(mesh, slot, { ms: 650, arc: 1.2 });
    mesh.position.copy(slot);
    setMood(mesh, 'normal');
  }

  // ---------------------------------------------------------------- arrow, flags

  showArrow(T) {
    this.arrowY = T.topY + 0.8;
    this.arrow.position.set(T.x, this.arrowY, TOWER_Z);
    this.arrow.visible = true;
    if (!motion.less) this.stage.awake('a2-bob', true);
    this.stage.invalidate();
  }

  hideArrow() {
    this.arrow.visible = false;
    this.stage.awake('a2-bob', false);
    this.stage.invalidate();
  }

  /** The tower is finished: the flag waves. */
  async finishTower(T) {
    sfx.star(1);
    this.confetti(T.x, T.topY + 0.6, TOWER_Z, 24);
    for (const m of T.pieces) setMood(m, 'happy');
    if (motion.less) { T.flag.rotation.y = 0.5; await wait(300); return; }
    for (const a of [0.7, -0.7, 0.5, -0.5, 0.25, 0]) await tween(T.flag.rotation, { y: a }, { ms: 140, ease: 'linear' });
  }

  // ---------------------------------------------------------------- hint

  /** 2nd wrong answer on this item: the flat tops glow, and the rule is said. */
  async hint(item) {
    const T = this.towers[item.tower];
    let zh = '頂部要平平的，才可以疊上去', en = 'The top must be flat to stack on it';
    if (this.lastWrong === '底部是圓的') { zh = '球的底部是圓的，疊不穩'; en = 'A ball is round underneath, so it cannot stay'; }
    const plates = [];
    const plate = (x, y, z, w, d) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.05, d), new THREE.MeshBasicMaterial({ color: 0xfacc15, transparent: true, opacity: 0 }));
      m.position.set(x, y + 0.03, z);
      this.root.add(m); plates.push(m);
    };
    plate(T.x, T.topY, TOWER_Z, 1.0, 0.8);
    if (!item.isLast) for (const m of this.tray) if (topIsFlat(m.userData.modelId)) plate(m.position.x, m.position.y + m.userData.top, m.position.z, 0.8, 0.8);
    this.ui.toast(zh, en, 3200);
    const pulses = (async () => {
      for (let k = 0; k < 3; k++) {
        await Promise.all(plates.map(p => tween(p.material, { opacity: 0.85 }, { ms: 260, ease: 'linear' })));
        await Promise.all(plates.map(p => tween(p.material, { opacity: 0.25 }, { ms: 260, ease: 'linear' })));
      }
    })();
    await this.live(Promise.all([voice.say(zh), pulses, wait(2400)]));
    for (const p of plates) { this.root.remove(p); disposeTree(p); }
    this.stage.invalidate();
  }
}
