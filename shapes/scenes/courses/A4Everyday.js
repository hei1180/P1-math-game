// A4 生活中的立體 Everyday solids. An everyday object rides in on a conveyor on a little pad.
// One finger on the OBJECT turns it (look from every side); one finger on the PAD drags it over a bin and lets go.
// Tapping a bin does the same (no dragging needed). Each of the 5 bins is labelled with a family and shows its friend.
// Grading: the bin's family against item.answer (from shapes-logic). A wrong bin spits the object out; the 2nd wrong
// on one object runs the hint: the right friend jumps next to the object and both glow.
import * as THREE from 'three';
import { CourseScene } from '../CourseScene.js?v=202610081243';
import { tween, wait, motion } from '../../engine/tween.js?v=202610081243';
import { blobShadow } from '../../engine/stage.js?v=202610081243';
import { voice } from '../../engine/voice.js?v=202610081243';
import { SCENE, toyColor } from '../../theme.js?v=202610081243';
import { sfx } from '../../sfx.js?v=202610081243';
import { makeSolid, setMood, blink } from '../../models/solids.js?v=202610081243';
import { makeObject } from '../../models/objects.js?v=202610081243';
import { FAMILIES, FAMILY, objectById, shuffle } from '../../../shapes-logic.js?v=202610081243';

const REP = { prism: 'cube', cylinder: 'cylinder', pyramid: 'sqPyramid', cone: 'cone', sphere: 'sphere' };
const CJK = '"PingFang TC","Microsoft JhengHei",system-ui,sans-serif'; // canvas text must resolve to a CJK face
const INK = '#1f2937';

const BIN = { z: -1.2, w: 1.6, d: 1.2, h: 0.7, gap: 2.0 };
const FRIEND = { z: -3.1, scale: 0.8 };
const SHELF = { h: 0.75, d: 1.3, w: 10.8 }; // the friends stand on a shelf behind the bins
const BELT = { z: 2.3, top: 0.3 };
const GRIP_DZ = 1.2;                              // the grip sits this far in front of the pad
const SPOT = new THREE.Vector3(0, 0, BELT.z);   // where the pad (and object) stop on the belt
const START_X = -7.6, EXIT_X = 7.6;
const OBJ_SCALE = 1.15;

function rrect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.arcTo(x + w, y, x + w, y + r, r);
  g.lineTo(x + w, y + h - r); g.arcTo(x + w, y + h, x + w - r, y + h, r);
  g.lineTo(x + r, y + h); g.arcTo(x, y + h, x, y + h - r, r);
  g.lineTo(x, y + r); g.arcTo(x, y, x + r, y, r);
  g.closePath();
}
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t; // per instance: disposed with the scene
}

/** One bin: an open crate with the family word and the English on its front. Origin on the floor, centre of the crate. */
function makeBin(zh, en, wood, dark) {
  const g = new THREE.Group();
  const { w, d, h } = BIN, t = 0.1;
  const add = (sx, sy, sz, x, y, z, m) => { const o = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), m); o.position.set(x, y, z); g.add(o); return o; };
  add(w, 0.08, d, 0, 0.04, 0, dark);
  add(w, h, t, 0, h / 2, d / 2 - t / 2, wood);
  add(w, h, t, 0, h / 2, -d / 2 + t / 2, wood);
  add(t, h, d, -w / 2 + t / 2, h / 2, 0, wood);
  add(t, h, d, w / 2 - t / 2, h / 2, 0, wood);
  const tex = canvasTex(256, 112, (c, cw, ch) => {
    rrect(c, 4, 4, cw - 8, ch - 8, 16); c.fillStyle = '#fff'; c.fill(); c.lineWidth = 6; c.strokeStyle = INK; c.stroke();
    c.fillStyle = INK; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.font = `bold 58px ${CJK}`; c.fillText(zh, cw / 2, 46);
    c.font = `600 27px ${CJK}`; c.fillStyle = '#6b7280'; c.fillText(en, cw / 2, 90);
  });
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.57), new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
  sign.position.set(0, h / 2, d / 2 + 0.01);
  g.add(sign);
  return g;
}

/** Conveyor belt: dark strip with cross bars (scrolled by tweening the texture offset) and two side rails. */
function makeBelt() {
  const g = new THREE.Group();
  const tex = canvasTex(128, 64, (c, w, h) => {
    c.fillStyle = '#475569'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#64748b'; c.fillRect(0, 0, 16, h); c.fillRect(64, 0, 16, h);
  });
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(7, 1);
  const len = 17, depth = 2.5;
  const belt = new THREE.Mesh(new THREE.BoxGeometry(len, BELT.top, depth), [
    new THREE.MeshLambertMaterial({ color: SCENE.dark }), new THREE.MeshLambertMaterial({ color: SCENE.dark }),
    new THREE.MeshLambertMaterial({ map: tex }), new THREE.MeshLambertMaterial({ color: SCENE.dark }),
    new THREE.MeshLambertMaterial({ color: SCENE.dark }), new THREE.MeshLambertMaterial({ color: SCENE.dark }),
  ]);
  belt.position.set(0, BELT.top / 2, BELT.z);
  g.add(belt);
  g.userData.tex = tex;
  return g;
}

/** The plain round pad the object stands on (it follows the grip). */
function makeDisc() {
  const top = canvasTex(128, 128, (c, w, h) => {
    c.fillStyle = '#fef3c7'; c.fillRect(0, 0, w, h);
    c.strokeStyle = '#f59e0b'; c.lineWidth = 8; c.beginPath(); c.arc(w / 2, h / 2, 56, 0, 7); c.stroke();
  });
  const side = new THREE.MeshLambertMaterial({ color: 0xf59e0b });
  return new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, 0.12, 32), [side, new THREE.MeshBasicMaterial({ map: top }), side]);
}

/**
 * The grip in front of the pad: a round disc with a four-way arrow. THIS is what one finger drags (the pad and the object follow);
 * the object itself is only for turning, so the two never fight for the same touch. A big invisible ball around it is the hit area.
 */
function makeGrip() {
  const top = canvasTex(128, 128, (c, w, h) => {
    c.fillStyle = '#fef3c7'; c.fillRect(0, 0, w, h);
    c.strokeStyle = '#f59e0b'; c.lineWidth = 8; c.beginPath(); c.arc(w / 2, h / 2, 54, 0, 7); c.stroke();
    c.fillStyle = '#d97706';
    for (let k = 0; k < 4; k++) {
      c.save(); c.translate(w / 2, h / 2); c.rotate(k * Math.PI / 2);
      c.beginPath(); c.moveTo(0, -46); c.lineTo(14, -28); c.lineTo(-14, -28); c.closePath(); c.fill();
      c.restore();
    }
  });
  const side = new THREE.MeshLambertMaterial({ color: 0xf59e0b });
  const grip = new THREE.Group();
  grip.add(new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.12, 28), [side, new THREE.MeshBasicMaterial({ map: top }), side]));
  const hit = new THREE.Mesh(new THREE.SphereGeometry(0.7, 8, 6), new THREE.MeshBasicMaterial({ visible: false }));
  grip.add(hit);
  grip.userData.half = 0.06;
  return grip;
}

/**
 * Some object meshes (cones: party hat, traffic cone) have a geometry group whose material index is past the end of the
 * mesh's material array; three.js's raycaster then throws, so touching the object would do nothing. Pad each such array
 * (the array is per mesh; the materials themselves stay shared and untouched).
 */
function safeRaycast(obj) {
  obj.traverse(o => {
    if (!o.isMesh || !Array.isArray(o.material) || !o.geometry.groups.length) return;
    const need = Math.max(...o.geometry.groups.map(g => g.materialIndex)) + 1;
    while (o.material.length < need) o.material = [...o.material, o.material[o.material.length - 1]];
  });
}

/** A soft glowing disc (additive), turned to face the camera by the scene. */
function makeHalo() {
  const tex = canvasTex(64, 64, (c, w, h) => {
    const g = c.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    g.addColorStop(0, 'rgba(255,240,150,1)'); g.addColorStop(0.55, 'rgba(255,214,60,.55)'); g.addColorStop(1, 'rgba(255,214,60,0)');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
  });
  const m = new THREE.Mesh(new THREE.CircleGeometry(1, 28), new THREE.MeshBasicMaterial({
    map: tex, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  m.renderOrder = 5; m.visible = false;
  return m;
}

export class A4Everyday extends CourseScene {
  static courseKey = 'A4';

  async setup() {
    const { root, input, bridge } = this;
    const rng = bridge.rng;
    this.sync = false; this.wrap = null; this.pickResolve = null; this.blinkT = 2; this.hover = null; this.token = 0;

    // five bins in a random order, each with its friend standing behind it
    const wood = new THREE.MeshLambertMaterial({ color: SCENE.bench }), dark = new THREE.MeshLambertMaterial({ color: 0x5b4636 });
    this.bins = []; this.friendOf = {}; this.binOf = {};
    shuffle(FAMILIES, rng).forEach((f, i) => {
      const x = (i - 2) * BIN.gap;
      const bin = makeBin(FAMILY[f].zh, FAMILY[f].en, wood, dark);
      bin.position.set(x, 0, BIN.z);
      bin.userData.family = f;
      const s = makeSolid(REP[f], { color: toyColor(rng), shadow: false });
      s.scale.setScalar(FRIEND.scale);
      s.userData.floorY = s.userData.restY * FRIEND.scale;
      s.position.set(x, SHELF.h + s.userData.floorY, FRIEND.z);
      s.userData.baseX = x; s.userData.baseY = s.position.y; s.userData.baseZ = FRIEND.z;
      s.userData.baseRot = s.rotation.y = Math.atan2(-x, 9 - FRIEND.z) * 0.6;
      s.userData.family = f;
      const sh = blobShadow(0.55); sh.position.set(x, SHELF.h + 0.004, FRIEND.z);
      root.add(sh, bin, s);
      this.bins.push(bin); this.friendOf[f] = s; this.binOf[f] = bin;
    });
    this.friends = Object.values(this.friendOf);
    const shelf = new THREE.Mesh(new THREE.BoxGeometry(SHELF.w, SHELF.h, SHELF.d), new THREE.MeshLambertMaterial({ color: SCENE.metal }));
    shelf.position.set(0, SHELF.h / 2, FRIEND.z); root.add(shelf);

    // conveyor, pad, glow discs
    this.belt = makeBelt(); root.add(this.belt);
    this.pad = makeGrip();                     // the dragged thing (the grip); `disc` and the object follow it
    this.padY = BELT.top + this.pad.userData.half;
    this.pad.position.set(START_X, this.padY, BELT.z + GRIP_DZ);
    this.disc = makeDisc();
    this.disc.position.set(START_X, this.padY, BELT.z);
    root.add(this.disc, this.pad);
    this.halos = [makeHalo(), makeHalo()];
    root.add(...this.halos);

    // tap a bin = put it in that bin; drag handle = the pad (the object itself is for turning)
    input.onTap(() => this.bins, bin => this.choose(bin.userData.family));
    this.frame(true);
  }

  armDrag() {
    if (this.offDrag) return;
    this.offDrag = this.input.drag(this.pad, {
      lift: 0.25,
      onStart: () => { this.sync = true; sfx.tick(0); },
      onMove: pad => this.setHover(this.binAt(pad.position.x, pad.position.z - GRIP_DZ)),
      onEnd: (pad, pt, { cancelled }) => {
        this.setHover(null);
        const bin = cancelled ? null : this.binAt(pad.position.x, pad.position.z - GRIP_DZ); // a cancelled touch is never a drop
        if (bin) this.choose(bin.userData.family);
        else if (this.wrap) tween(pad.position, { x: SPOT.x, y: this.padY, z: SPOT.z + GRIP_DZ }, { ms: 260 }); // let go in the open: slide back
      },
    });
  }
  disarmDrag() { if (this.offDrag) { this.offDrag(); this.offDrag = null; } this.setHover(null); }

  /** The bin under a point on the floor (generous: the pad only has to be over the crate or just in front of it). */
  binAt(x, z) {
    if (z > BIN.z + 1.7 || z < BIN.z - 1.4) return null;
    let best = null, bd = 1.05;
    for (const b of this.bins) { const d = Math.abs(b.position.x - x); if (d < bd) { bd = d; best = b; } }
    return best;
  }
  setHover(bin) {
    if (this.hover === bin) return;
    if (this.hover) this.hover.scale.setScalar(1);
    this.hover = bin;
    if (bin) { bin.scale.setScalar(1.08); sfx.tick(1); }
    this.stage.invalidate();
  }

  /** The child chose a bin (drop or tap). Only counts while a question is open. */
  choose(family) {
    const r = this.pickResolve;
    if (!r) return;
    this.pickResolve = null;
    try { voice.say(FAMILY[family].zh); } catch (e) { /* ignore */ }
    r(family);
  }
  ask() { return new Promise(res => { this.pickResolve = res; }); }

  /** Camera: whole row of bins and the belt in view whatever the screen shape. */
  frame(force) {
    const st = this.stage, w = st.width, h = st.height;
    if (!force && w === this._fw && h === this._fh) return;
    this._fw = w; this._fh = h;
    const aspect = w / Math.max(1, h);
    const need = 11.4 / (2 * Math.tan(THREE.MathUtils.degToRad(20)) * aspect);
    const dist = Math.max(10.4, need);
    const look = new THREE.Vector3(0, 0.5, 0.15);
    st.setView(look.clone().addScaledVector(new THREE.Vector3(0, 0.52, 0.86).normalize(), dist).toArray(), look.toArray());
  }

  update(dt) {
    if (!this.pad) return;
    this.frame(false);
    const p = this.pad.position;
    this.disc.position.set(p.x, p.y, p.z - GRIP_DZ);                 // the pad follows the grip
    if (this.sync && this.wrap) this.wrap.position.set(p.x, p.y + this.wrapDY, p.z - GRIP_DZ); // the object rides on the pad
    if (!motion.less && this.pickResolve) {
      this.blinkT -= dt;
      if (this.blinkT <= 0) { this.blinkT = 1.8 + Math.random() * 2.2; blink(this.friends[Math.floor(Math.random() * this.friends.length)]); }
    }
  }

  // ---------------------------------------------------------------- one object
  async playItem(item, i) {
    const { ui } = this;
    const o = objectById(item.object), token = ++this.token;
    this.resetFriends();
    // the object arrives on the belt (it turns once on its way, as a hint that it can be turned)
    const wrap = this.wrap = new THREE.Group();
    const obj = makeObject(item.object);
    obj.scale.setScalar(OBJ_SCALE);
    safeRaycast(obj);
    wrap.add(obj);
    this.root.add(wrap);
    wrap.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(wrap);
    this.wrapDY = this.pad.userData.half - box.min.y; // pad top sits half above the pad's centre
    this.pad.position.set(START_X, this.padY, BELT.z + GRIP_DZ);
    wrap.position.set(START_X, this.padY + this.wrapDY, BELT.z);
    wrap.rotation.y = -Math.PI * 2 * 0.9;
    this.sync = true;
    this.offSpin = this.input.spin(wrap, { speed: 0.012 });
    this.disarmDrag();
    sfx.whoosh();
    this.scroll(2.4, 700);
    await this.live(Promise.all([
      tween(this.pad.position, { x: SPOT.x }, { ms: 700, ease: 'outCubic' }),
      tween(wrap.rotation, { y: 0.35 }, { ms: 700, ease: 'outCubic' }),
    ]));
    this.armDrag();

    // prompts: name it and ask for a spin, then say what to do (the child may already be playing)
    const asked = (async () => {
      await this.live(Promise.all([
        ui.prompt(`這是${o.zh}。轉一轉，看清楚。`, `A ${o.en}. Spin it and look.`),
        wait(2600),
      ]));
      if (token !== this.token || !this.pickResolve) return;
      ui.prompt('拖動箭頭，放進正確的箱子', 'Drag the arrows into the right bin, or tap a bin', { speak: false });
    })();

    for (;;) {
      const family = await this.live(this.ask());
      this.token++; // stops the prompt chain
      if (family === item.answer) { await this.live(this.dropIn(item, family)); return; }
      await this.live(this.spitOut(item, family));
      await this.wrong(item, family, o.zh);
    }
  }

  scroll(by, ms) { tween(this.belt.userData.tex.offset, { x: this.belt.userData.tex.offset.x - by }, { ms, ease: 'linear' }); }

  /** Right bin: the object drops in, the friend cheers. */
  async dropIn(item, family) {
    const wrap = this.wrap, bin = this.binOf[family], friend = this.friendOf[family];
    this.sync = false; this.disarmDrag();
    this.offSpin && this.offSpin(); this.offSpin = null;
    this.ui.hidePrompt();
    const bx = bin.position.x, over = BIN.h + 0.9;
    await this.live(Promise.all([
      tween(wrap.position, { x: bx, y: over, z: BIN.z }, { ms: 280, ease: 'inOutCubic' }),
      tween(this.pad.position, { x: EXIT_X, y: this.padY, z: BELT.z + GRIP_DZ }, { ms: 700, ease: 'inOutCubic' }),
    ]));
    sfx.pop();
    await this.live(Promise.all([
      tween(wrap.position, { y: BIN.h * 0.45 }, { ms: 220, ease: 'outCubic' }),
      tween(wrap.scale, { x: 0.55, y: 0.55, z: 0.55 }, { ms: 220 }),
    ]));
    sfx.ding();
    await this.live(tween(wrap.scale, { x: 0.01, y: 0.01, z: 0.01 }, { ms: 140 }));
    this.root.remove(wrap); this.wrap = null; // shared geometry / materials: nothing to dispose
    setMood(friend, 'happy');
    this.confetti(bx, BIN.h + 0.6, BIN.z, 14);
    await this.live(this.hop(friend, 2));
  }

  /** Wrong bin: it drops in, the bin's friend shakes its head, the object is spat out and rolls back to the pad. */
  async spitOut(item, family) {
    const wrap = this.wrap, bin = this.binOf[family], friend = this.friendOf[family], pad = this.pad;
    this.sync = false; this.disarmDrag();
    const bx = bin.position.x;
    await this.live(Promise.all([
      tween(wrap.position, { x: bx, y: BIN.h + 0.5, z: BIN.z }, { ms: 220, ease: 'inOutCubic' }),
      tween(pad.position, { x: SPOT.x, y: this.padY, z: SPOT.z + GRIP_DZ }, { ms: 420, ease: 'inOutCubic' }),
    ]));
    setMood(friend, 'oops');
    const shake = this.shake(friend);
    sfx.boing();
    const rest = this.padY + this.wrapDY;
    await this.live(tween(wrap.position, { y: 3.4 }, { ms: 260, ease: 'outCubic' }));
    await this.live(Promise.all([
      tween(wrap.position, { x: SPOT.x, z: SPOT.z }, { ms: 460, ease: 'inOutCubic' }),
      tween(wrap.position, { y: rest }, { ms: 460, ease: 'outBounce' }),
    ]));
    await this.live(shake);
    setMood(friend, 'normal');
    this.sync = true; this.armDrag();
  }

  // ---------------------------------------------------------------- friends
  async shake(friend) {
    if (motion.less) return;
    const base = friend.userData.baseRot, r = friend.rotation;
    for (const a of [0.5, -0.5, 0.35, -0.2, 0]) await this.live(tween(r, { y: base + a }, { ms: 80, ease: 'linear' }));
  }

  async hop(friend, n = 1) {
    const y0 = friend.position.y;
    for (let k = 0; k < n; k++) {
      sfx.boing();
      await this.live(tween(friend.position, { y: y0 + 0.55 }, { ms: 140 }));
      await this.live(tween(friend.position, { y: y0 }, { ms: 300, ease: 'outBounce' }));
    }
  }

  resetFriends() {
    for (const f of this.friends) {
      const u = f.userData;
      if (u.face && u.face.mood !== 'normal') setMood(f, 'normal');
      f.position.set(u.baseX, u.baseY, u.baseZ); f.rotation.y = u.baseRot;
    }
    this.stage.invalidate();
  }

  // ---------------------------------------------------------------- hint (2nd wrong on this object)
  async hint(item) {
    const o = objectById(item.object), family = item.answer, friend = this.friendOf[family], wrap = this.wrap, u = friend.userData;
    this.sync = true; this.disarmDrag();
    const land = new THREE.Vector3(SPOT.x + 1.6, BELT.top + u.floorY, SPOT.z - 0.1);
    voice.say(`${o.zh}是${FAMILY[family].zh}`); // not awaited
    setMood(friend, 'happy');
    // jump over to the object
    const y0 = u.baseY;
    await this.live(Promise.all([
      tween(friend.position, { x: land.x, z: land.z }, { ms: 650, ease: 'inOutCubic' }),
      (async () => {
        await this.live(tween(friend.position, { y: y0 + 2.2 }, { ms: 320, ease: 'outCubic' }));
        await this.live(tween(friend.position, { y: land.y }, { ms: 330, ease: 'outBounce' }));
      })(),
    ]));
    sfx.ding();
    // both glow
    const cam = this.stage.camera;
    const [h1, h2] = this.halos;
    const centreO = new THREE.Vector3(wrap.position.x, wrap.position.y, wrap.position.z + 0.6);
    const centreF = new THREE.Vector3(friend.position.x, friend.position.y, friend.position.z + 0.5);
    for (const [h, c, s] of [[h1, centreO, 1.15], [h2, centreF, 0.95]]) {
      h.position.copy(c); h.scale.setScalar(s); h.quaternion.copy(cam.quaternion); h.visible = true; h.material.opacity = 0;
    }
    await this.live(Promise.all([tween(h1.material, { opacity: 0.55 }, { ms: 260 }), tween(h2.material, { opacity: 0.55 }, { ms: 260 })]));
    await this.live(this.hop(friend, 1));
    await this.live(wait(900));
    await this.live(Promise.all([tween(h1.material, { opacity: 0 }, { ms: 260 }), tween(h2.material, { opacity: 0 }, { ms: 260 })]));
    h1.visible = h2.visible = false;
    // back home
    await this.live(Promise.all([
      tween(friend.position, { x: u.baseX, z: u.baseZ }, { ms: 600, ease: 'inOutCubic' }),
      (async () => {
        await this.live(tween(friend.position, { y: land.y + 1.4 }, { ms: 300, ease: 'outCubic' }));
        await this.live(tween(friend.position, { y: u.baseY }, { ms: 300, ease: 'outBounce' }));
      })(),
    ]));
    setMood(friend, 'normal');
    this.armDrag();
  }
}
