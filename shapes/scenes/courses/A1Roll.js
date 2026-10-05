// A1 會滾嗎？ Roll or not. A solid sits at the top of a ramp; the child says 會滾 / 不會滾, then watches the answer.
// Grading is shapes-logic rolls(); the motion is SCRIPTED (tweens along a precomputed path) by rollStyle():
//   'any' sphere: rolls down and wobbles off the mat   'straight' lying cylinder: rolls straight
//   'circle' lying cone: rolls in an arc               null: slides down slowly with a scrape
import * as THREE from 'three';
import { CourseScene } from '../CourseScene.js?v=202610051406';
import { FAMILY, familyOf, rolls, rollStyle } from '../../../shapes-logic.js?v=202610051406';
import { tween, wait, motion } from '../../engine/tween.js?v=202610051406';
import { disposeTree, blobShadow } from '../../engine/stage.js?v=202610051406';
import { SCENE, toyColor } from '../../theme.js?v=202610051406';
import { sfx } from '../../sfx.js?v=202610051406';
import { voice } from '../../engine/voice.js?v=202610051406';
import { makeSolid, setMood, blink } from '../../models/solids.js?v=202610051406';
import { puff } from '../../fx3d.js?v=202610051406';

// ---- the set: a ramp that runs from back-left toward the camera, then a landing mat ----
const PSI = 0.5;                       // yaw of the downhill direction (0 = straight at the camera)
const ALPHA = 0.36;                    // slope (rad, about 20 degrees)
const RAMP_LEN = 3.4;                  // along the slope
const D = new THREE.Vector2(Math.sin(PSI), Math.cos(PSI)); // downhill, on the floor (x, z)
const HLEN = RAMP_LEN * Math.cos(ALPHA);  // horizontal length of the ramp
const RISE = RAMP_LEN * Math.sin(ALPHA);  // height of the ramp top
const P0 = { x: -1.95, z: -2.75 };     // top end of the ramp (centre line)
const U0 = 0.5;                        // the solid starts this far down from the top (horizontal)
const MAT_LEN = 3.0, MAT_W = 2.9;
const STEP = 0.03;                     // path sample spacing

const smooth = t => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const clamp01 = t => Math.min(1, Math.max(0, t));

/** Ground under a point u metres down the ramp (horizontal): height and the pitch the solid takes. */
function ground(u) {
  if (u < HLEN) return { y: RISE - u * Math.tan(ALPHA), pitch: ALPHA };
  return { y: 0, pitch: ALPHA * Math.max(0, 1 - (u - HLEN) / 0.4) };
}

/** Sample the scripted path of a solid: x, z, heading, roll angle by arc length. */
function makePath(style, total, rollR) {
  const n = Math.ceil(total / STEP);
  const xs = new Float32Array(n + 1), zs = new Float32Array(n + 1), hs = new Float32Array(n + 1), sp = new Float32Array(n + 1);
  const lat = style === 'circle' ? 0.5 : 0; // the cone's circle bends to its right, so it starts a little to its left
  let x = P0.x + D.x * U0 + lat * Math.cos(PSI), z = P0.z + D.y * U0 - lat * Math.sin(PSI), h = PSI, spin = 0, s = 0;
  const ramp = HLEN - U0;
  const put = i => { xs[i] = x; zs[i] = z; hs[i] = h; sp[i] = spin; };
  put(0);
  for (let i = 1; i <= n; i++) {
    s += STEP;
    if (style === 'circle') {
      // curves a little on the ramp, then circles on the mat (a cone rolls round its tip)
      const f = smooth((s - ramp - 0.9) / 0.5);
      if (s <= ramp) h = PSI - 0.2 * smooth(s / ramp); else h -= (f / 0.55) * STEP;
      spin += (STEP / 0.45) * (0.6 + 0.9 * f);
    } else if (style === 'any') {
      h = PSI + 0.16 * Math.sin(s * 2.3) * smooth((s - ramp * 0.5) / 1.5);
      spin += STEP / rollR;
    } else if (style === 'straight') {
      spin += STEP / rollR;
    }
    x += Math.sin(h) * STEP; z += Math.cos(h) * STEP;
    put(i);
  }
  return { xs, zs, hs, sp, n, total: n * STEP, ramp };
}

/** One solid on the ramp: mover (position, heading, pitch) > pivot (roll about its axis) > solid. */
class Rig {
  constructor(model, pose, color) {
    const solid = this.solid = makeSolid(model, { color, pose, shadow: false });
    const ud = solid.userData;
    this.restY = ud.restY;
    const holder = solid.children[0];
    this.pivot = new THREE.Group();
    this.pivot.position.copy(holder.position);   // the true axis passes through the body centre
    solid.position.copy(holder.position).negate();
    this.pivot.add(solid);
    this.axis = model === 'sphere' ? new THREE.Vector3(1, 0, 0) : ud.axis.clone();
    if (this.axis.x < 0) this.axis.negate();
    this.shadow = blobShadow(0.55);
    this.shadow.position.y = -this.restY + 0.02;
    this.mover = new THREE.Group();
    this.mover.add(this.shadow, this.pivot);
    this._hop = 0; // extra height (drop-in, hop)
    this.last = null;
    this.qa = new THREE.Quaternion(); this.qb = new THREE.Quaternion();
  }

  get hop() { return this._hop; }
  set hop(v) { this._hop = v; if (this.last) this.place(...this.last); }

  /** Put the solid at arc length s of `path`. */
  place(path, s, jitter = 0) {
    this.last = [path, s, jitter];
    const k = clamp01(s / path.total) * path.n, i = Math.min(Math.floor(k), path.n - 1), f = k - i;
    const lerp = a => a[i] + (a[i + 1] - a[i]) * f;
    const x = lerp(path.xs), z = lerp(path.zs), h = lerp(path.hs), spin = lerp(path.sp);
    const u = (x - P0.x) * D.x + (z - P0.z) * D.y;
    const g = ground(u);
    const pitch = g.pitch * Math.cos(h - PSI);
    const r = this.restY;
    this.mover.position.set(x + Math.sin(h) * Math.sin(pitch) * r, g.y + Math.cos(pitch) * r + this._hop + jitter, z + Math.cos(h) * Math.sin(pitch) * r);
    this.qa.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, h);
    this.qb.setFromAxisAngle(new THREE.Vector3(1, 0, 0), pitch);
    this.mover.quaternion.copy(this.qa).multiply(this.qb);
    this.pivot.quaternion.setFromAxisAngle(this.axis, spin);
    this.u = u;
  }
}

export class A1Roll extends CourseScene {
  static courseKey = 'A1';

  async setup() {
    const { stage } = this;
    const R = this.root;
    const wood = new THREE.MeshLambertMaterial({ color: SCENE.bench });
    const dark = new THREE.MeshLambertMaterial({ color: 0x8b5a2b });
    const yaw = PSI;
    // ramp board: its top surface runs from (P0, RISE) down to the floor
    const board = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.2, RAMP_LEN + 0.2), wood);
    const mid = { x: P0.x + D.x * HLEN / 2, z: P0.z + D.y * HLEN / 2, y: RISE / 2 };
    board.rotation.order = 'YXZ';
    board.rotation.set(ALPHA, yaw, 0);
    // centre of the board is 0.1 below the surface along the normal
    const nrm = new THREE.Vector3(Math.sin(ALPHA) * D.x, Math.cos(ALPHA), Math.sin(ALPHA) * D.y);
    board.position.set(mid.x - nrm.x * 0.1, mid.y - nrm.y * 0.1, mid.z - nrm.z * 0.1);
    R.add(board);
    // rails
    for (const side of [-1, 1]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.2, RAMP_LEN + 0.2), dark);
      rail.rotation.order = 'YXZ'; rail.rotation.set(ALPHA, yaw, 0);
      const lat = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw)).multiplyScalar(side * 1.15);
      rail.position.set(board.position.x + lat.x + nrm.x * 0.15, board.position.y + nrm.y * 0.15, board.position.z + lat.z + nrm.z * 0.15);
      R.add(rail);
    }
    // top stopper and two legs
    const stop = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.3, 0.14), dark);
    stop.rotation.order = 'YXZ'; stop.rotation.set(ALPHA, yaw, 0);
    stop.position.set(P0.x - D.x * 0.12 + nrm.x * 0.1, RISE + nrm.y * 0.1, P0.z - D.y * 0.12 + nrm.z * 0.1);
    R.add(stop);
    for (const side of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.14, RISE, 0.14), dark);
      const lat = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw)).multiplyScalar(side * 1.05);
      leg.position.set(P0.x + D.x * 0.25 + lat.x, (RISE - 0.45) / 2, P0.z + D.y * 0.25 + lat.z);
      leg.scale.y = (RISE - 0.45) / RISE;
      R.add(leg);
    }
    // landing mat
    const mat = new THREE.Mesh(new THREE.BoxGeometry(MAT_W, 0.08, MAT_LEN), new THREE.MeshLambertMaterial({ color: 0x7dd3fc }));
    mat.rotation.y = yaw;
    const mc = HLEN + MAT_LEN / 2 - 0.1;
    mat.position.set(P0.x + D.x * mc, 0.04, P0.z + D.y * mc);
    R.add(mat);
    const edge = new THREE.Mesh(new THREE.BoxGeometry(MAT_W + 0.16, 0.05, MAT_LEN + 0.16), new THREE.MeshLambertMaterial({ color: 0x38bdf8 }));
    edge.rotation.y = yaw; edge.position.set(mat.position.x, 0.025, mat.position.z);
    R.add(edge);

    this.fitView();
    this.offResize = stage.onUpdate(() => { if (stage.width !== this._fw || stage.height !== this._fh) this.fitView(); });
    stage.invalidate();
  }

  /** Frame the set for the current aspect ratio (iPad portrait, phone, landscape). */
  fitView() {
    const { stage } = this;
    this._fw = stage.width; this._fh = stage.height;
    const aspect = stage.width / stage.height, tanV = Math.tan(THREE.MathUtils.degToRad(20)), tanH = tanV * aspect;
    const dist = Math.max(3.6 / tanH, 2.9 / tanV) + 2.2;
    const look = [0, 0.5, 0.1], dir = new THREE.Vector3(0, 0.55, 0.84).normalize();
    this.stage.setView([look[0], look[1] + dir.y * dist, look[2] + dir.z * dist], look);
  }

  async exit() {
    if (this.offResize) this.offResize();
    this.rig = null;
    await super.exit();
  }

  async playItem(item) {
    const { ui, stage } = this;
    const label = FAMILY[familyOf(item.model)].zh + (item.pose === 'side' ? '(側放)' : '');
    const rig = this.rig = new Rig(item.model, item.pose, toyColor(this.bridge.rng));
    this.root.add(rig.mover);
    const style = rollStyle(item.model, item.pose);
    const rollR = item.model === 'sphere' ? 0.5 : 0.4;
    const total = style === 'any' ? HLEN - U0 + 3.4 : style === 'straight' ? HLEN - U0 + 2.3 : style === 'circle' ? HLEN - U0 + 4.4 : HLEN - U0 + 0.5;
    const path = makePath(style, total, rollR);
    this.path = path;

    rig.place(path, 0);
    await this.live(this.dropIn(rig, path));

    ui.prompt('它會滾下去嗎？', 'Will it roll?');
    const choices = [
      { id: 'yes', zh: '會滾', en: 'It rolls', icon: '🛞' },
      { id: 'no', zh: '不會滾', en: "It doesn't roll", icon: '🧱' },
    ];
    rig.waiting = true;
    this.blinkLater(rig);
    for (;;) {
      const id = await this.live(ui.choices(choices));
      if ((id === 'yes') === rolls(item.model, item.pose)) { ui.mark(id, true); break; }
      ui.mark(id, false);
      await this.live(this.shake(rig));
      await this.wrong(item, id === 'yes' ? '會滾' : '不會滾', label);
    }
    rig.waiting = false;
    ui.clearChoices();
    const says = rolls(item.model, item.pose);
    ui.prompt(says ? '會滾！' : '不會滾！', says ? 'It rolls!' : "It doesn't roll!");
    await this.live(this.run(rig, path, style));
    await this.live(this.popAway(rig));
  }

  /** The friend drops in at the top of the ramp and squashes on landing. */
  async dropIn(rig) {
    sfx.pop();
    rig.hop = 1.8;
    rig.mover.scale.setScalar(0.5);
    rig.place(this.path, 0);
    this.stage.invalidate();
    const t1 = tween(rig, { hop: 0 }, { ms: 520, ease: 'outBounce' });
    const t2 = tween(rig.mover.scale, { x: 1, y: 1, z: 1 }, { ms: 260, ease: 'outBack' });
    await Promise.all([t1, t2]);
    rig.place(this.path, 0);
    sfx.clunk();
    puff(this.stage, new THREE.Vector3(rig.mover.position.x, 0.1 + rig.mover.position.y - rig.restY, rig.mover.position.z), this.root);
    if (!motion.less) {
      rig.mover.scale.y = 0.82;
      await tween(rig.mover.scale, { y: 1 }, { ms: 220, ease: 'outBack' });
    }
  }

  /** Blink now and then while the child thinks. */
  blinkLater(rig) {
    const tick = () => {
      if (!this.alive || !rig.waiting) return;
      blink(rig.solid);
      rig.timer = setTimeout(tick, 2200 + Math.random() * 1800);
    };
    rig.timer = setTimeout(tick, 1500);
  }

  /** A wrong pick: the friend shakes its head "no" and looks worried for a moment. */
  async shake(rig) {
    setMood(rig.solid, 'oops');
    if (motion.less) await this.live(wait(250));
    else {
      for (const a of [0.45, -0.45, 0.3, -0.3, 0]) await this.live(tween(rig.pivot.rotation, { y: a }, { ms: 80, ease: 'linear' }));
    }
    await this.live(wait(200));
    setMood(rig.solid, 'normal');
  }

  /** The scripted motion for the right answer. */
  async run(rig, path, style) {
    const { stage } = this;
    clearTimeout(rig.timer);
    rig.pivot.rotation.set(0, 0, 0);
    setMood(rig.solid, style ? 'dizzy' : 'happy');
    const ms = style === null ? 2600 : style === 'circle' ? 4800 : 3000;
    const sBase = path.ramp, root = this.root;
    let landed = false;
    const drv = {
      _p: 0,
      get p() { return this._p; },
      set p(v) {
        this._p = v;
        const s = path.total * v;
        const jit = style === null && !motion.less && s < sBase ? Math.sin(s * 90) * 0.012 : 0;
        rig.place(path, s, jit);
        if (!landed && s >= sBase) {
          landed = true;
          if (style) { sfx.clunk(); puff(stage, new THREE.Vector3(rig.mover.position.x, 0.1, rig.mover.position.z), root); }
        }
      },
    };
    if (style) { sfx.whoosh(); sfx.roll(ms * 0.8); } else sfx.roll(ms);
    await tween(drv, { p: 1 }, { ms, ease: 'inOutCubic' });
    if (style === 'any') { sfx.boing(); }
    await wait(style ? 350 : 200);
    setMood(rig.solid, 'happy');
    await wait(450);
  }

  async popAway(rig) {
    sfx.pop();
    await tween(rig.mover.scale, { x: 0.01, y: 0.01, z: 0.01 }, { ms: 220, ease: 'inOutCubic' });
    this.root.remove(rig.mover);
    disposeTree(rig.mover);
    this.stage.invalidate();
  }

  /** 2nd wrong answer: the friend says why. */
  async hint(item) {
    const rig = this.rig;
    let zh, en;
    if (rolls(item.model, item.pose)) { zh = '我有彎彎的面，所以會滾'; en = 'I have a curved surface, so I roll'; }
    else if (['cylinder', 'cone'].includes(familyOf(item.model))) { zh = '我平放時不會滾，側放時就會滾'; en = "I don't roll standing up, but I roll on my side"; }
    else { zh = '我的面都是平的，所以不會滾'; en = 'All my faces are flat, so I do not roll'; }
    if (rig) setMood(rig.solid, 'happy');
    this.ui.toast(zh, en, 3200);
    const hop = rig && !motion.less ? this.hopOnce(rig) : Promise.resolve();
    await this.live(Promise.all([voice.say(zh), hop, wait(2600)]));
    if (rig) setMood(rig.solid, 'normal');
  }

  async hopOnce(rig) {
    await tween(rig, { hop: 0.25 }, { ms: 160 });
    await tween(rig, { hop: 0 }, { ms: 260, ease: 'outBounce' });
  }
}
