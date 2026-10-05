// Rush (timed, leaderboard). A conveyor carries things from the left to a "later" crate on the right; sort each one
// into the right bin. Zone 'a' (shapes3d): solids and everyday objects -> 5 family bins with friend faces.
// Zone 'b' (shapes2d): flat tiles -> 3 / 4 / 5 / 6 / circle mouths.
//   - Tap a bin: the highlighted front item flies in. Or drag any item to a bin (or to the crate: "later").
//   - Items that reach the end of the belt fall into the "later" crate: no penalty, no points.
//   - Right: bridge.rushHit(true, 10) and a floating +points; wrong: bridge.rushHit(false, 10), the bin goes "oops" and
//     the item bounces away. Fever (shared engine) speeds the belt up and sparkles.
// Timer and score/combo HUD are the page's DOM HUD (bridge.rushStart). Time up: 「時間到！」 then bridge.rushEnd(zone)
// (rank popup, then leaderboard; closing it goes to the Workshop). ⬅ during play: bridge.rushAbort() then the Workshop.
// Everything lives in the z = 0 plane (a side view), so dragging tracks the finger exactly.
import * as THREE from 'three';
import { Scene } from '../engine/scenes.js?v=202610051459';
import { tween, wait, motion } from '../engine/tween.js?v=202610051459';
import { disposeTree } from '../engine/stage.js?v=202610051459';
import { sfx } from '../sfx.js?v=202610051459';
import { voice } from '../engine/voice.js?v=202610051459';
import { FONT, SCENE, TOY_COLORS, toyColor } from '../theme.js?v=202610051459';
import { sparkle, puff } from '../fx3d.js?v=202610051459';
import { makeSolid } from '../models/solids.js?v=202610051459';
import { makeTile } from '../models/tiles.js?v=202610051459';
import { makeObject } from '../models/objects.js?v=202610051459';
import { faceTexture } from '../models/faces.js?v=202610051459';
import { FAMILIES, FAMILY, TILE_ANSWERS, ANSWER_TEXT, genRush3d, genRush2d, shuffle } from '../../shapes-logic.js?v=202610051459';

// ---- layout (x right, y up) ----
const BELT = { x0: -4.3, x1: 3.9, top: 3.3, h: 0.35 };       // belt: left end, right end (items fall off here), top surface height
const BIN = { w: 1.3, h: 1.5, pitch: 1.35, y: 0, z: -0.8 };  // bins stand on the floor behind the item plane
const CRATE = { x: 3.95, w: 1.1, h: 1.0 };                    // under the belt end, right of the last bin
const ITEM_S = 1.1;                                           // size of an item on the belt
const ITEM_Y = BELT.top + ITEM_S / 2;                         // centre height of an item on the belt
const MAX_ON_BELT = 3, GAP = 1.5, SPEED = 1.35, FEVER_SPEED = 2.0;
const DROP_BELOW = 2.7;                                       // released lower than this: bin / crate; higher: back on the belt
const PLANE = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0); // drag plane z = 0

const MOUTH = { 3: 'tri-eq', 4: 'quad-square', 5: 'pent-reg', 6: 'hex-reg', circle: 'circle' };
const TEXT = {
  a: { zh: '放進正確的箱子！', en: 'Put each one in the right bin!' },
  b: { zh: '餵進正確的嘴巴！', en: 'Feed each tile to the right mouth!' },
};

const lam = c => new THREE.MeshLambertMaterial({ color: c });
function plaque(w, h, draw) {
  const c = document.createElement('canvas'); c.width = Math.round(w * 128); c.height = Math.round(h * 128);
  draw(c.getContext('2d'), c.width, c.height);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false }));
}
function roundRect(g, x, y, w, h, r) {
  g.beginPath(); g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.arcTo(x + w, y, x + w, y + r, r); g.lineTo(x + w, y + h - r); g.arcTo(x + w, y + h, x + w - r, y + h, r);
  g.lineTo(x + r, y + h); g.arcTo(x, y + h, x, y + h - r, r); g.lineTo(x, y + r); g.arcTo(x, y, x + r, y, r); g.closePath();
}
const labelPlaque = (zh, en, w = 1.12, h = 0.5) => plaque(w, h, (g, W, H) => {
  g.fillStyle = '#fffbeb'; roundRect(g, 3, 3, W - 6, H - 6, 14); g.fill(); g.lineWidth = 4; g.strokeStyle = '#475569'; g.stroke();
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#1f2937';
  g.font = `bold ${Math.round(H * 0.5)}px ${FONT}`; g.fillText(zh, W / 2, H * 0.4);
  g.font = `${Math.round(H * 0.24)}px ${FONT}`; g.fillStyle = '#6b7280'; g.fillText(en, W / 2, H * 0.8);
});
function stripeTexture() {
  const c = document.createElement('canvas'); c.width = 64; c.height = 16;
  const g = c.getContext('2d'); g.fillStyle = '#475569'; g.fillRect(0, 0, 64, 16); g.fillStyle = '#64748b'; g.fillRect(0, 0, 8, 16); g.fillRect(32, 0, 8, 16);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(10, 1);
  return t;
}

export class RushScene extends Scene {
  async enter({ zone = 'a' } = {}) {
    this.zone = zone === 'b' ? 'b' : 'a';
    this.items = [];            // { id, holder, data, x, state: 'belt' | 'held' | 'busy', off }
    this.nextId = 1; this.spawnT = 0.3; this.clock = 0; this.hue = 0; this.feverT = 0;
    this.running = false; this.ended = false; this.rushOn = false; this.timeIsUp = false; this.sel = null;
    this.lastAnswers = [];
    this.hover = null; this.sizeKey = '';

    // shared by every item: an invisible hit box (marked shared so disposing one item never frees it; exit() does)
    this.hitGeo = new THREE.BoxGeometry(1.3, 1.3, 1.0); this.hitGeo.userData.shared = true;
    this.hitMat = new THREE.MeshBasicMaterial({ visible: false }); this.hitMat.userData.shared = true;

    this.buildRoom();
    this.buildBelt();
    this.buildBins();
    this.buildCrate();
    this.buildHighlight();
    this.stage.setView(...this.viewArgs());
    this.input.onTap(() => this.bins.map(b => b.group), g => { const b = this.bins.find(x => x.group === g); if (b) this.sendFront(b); });
    this.ui.back(() => this.leave());

    await this.live(this.ui.prompt(TEXT[this.zone].zh, TEXT[this.zone].en));
    await this.live(wait(900));
    this.ui.hidePrompt();
    this.ui.toast('開始！', 'Go!', 800);
    this.begin();
  }

  // ------------------------------------------------------------------ set
  buildRoom() {
    const floor = new THREE.Mesh(new THREE.BoxGeometry(60, 0.3, 60), lam(SCENE.floor)); floor.position.set(0, -0.15, 6);
    const wall = new THREE.Mesh(new THREE.BoxGeometry(60, 14, 0.3), lam(SCENE.wall)); wall.position.set(0, 7, -4.0);
    const bench = new THREE.Mesh(new THREE.BoxGeometry(60, 0.4, 0.4), lam(SCENE.bench)); bench.position.set(0, 0.2, -3.7);
    this.root.add(floor, wall, bench);
  }

  buildBelt() {
    const len = BELT.x1 - BELT.x0, cx = (BELT.x0 + BELT.x1) / 2, y = BELT.top - BELT.h / 2;
    this.stripe = stripeTexture();
    this.beltTop = new THREE.MeshLambertMaterial({ map: this.stripe });
    const side = lam(0x334155);
    const belt = new THREE.Mesh(new THREE.BoxGeometry(len, BELT.h, 1.2), [side, side, this.beltTop, side, side, side]);
    belt.position.set(cx, y, 0);
    const roller = new THREE.CylinderGeometry(BELT.h / 2 + 0.03, BELT.h / 2 + 0.03, 1.3, 16).rotateX(Math.PI / 2), steel = lam(SCENE.metal);
    for (const x of [BELT.x0, BELT.x1]) { const r = new THREE.Mesh(roller, steel); r.position.set(x, y, 0); this.root.add(r); }
    const leg = new THREE.BoxGeometry(0.2, y - 0.1, 0.9);
    for (const x of [BELT.x0 + 0.3, BELT.x1 - 0.3]) { const l = new THREE.Mesh(leg, steel); l.position.set(x, (y - 0.1) / 2 + 0.05, -0.1); this.root.add(l); }
    this.root.add(belt);
  }

  buildBins() {
    this.bins = [];
    const answers = this.zone === 'a' ? FAMILIES.slice() : TILE_ANSWERS.slice();
    const cols = shuffle(TOY_COLORS, this.bridge.rng); // colours never tell which bin is which
    const body = new THREE.BoxGeometry(BIN.w, BIN.h, 0.9), inset = new THREE.PlaneGeometry(BIN.w * 0.82, 0.62), facePlane = new THREE.PlaneGeometry(0.8, 0.8);
    const mid = (answers.length - 1) / 2;
    answers.forEach((ans, i) => {
      const group = new THREE.Group(); group.position.set((i - mid) * BIN.pitch, BIN.y, BIN.z);
      const box = new THREE.Mesh(body, lam(cols[i % cols.length])); box.position.y = BIN.h / 2; group.add(box);
      const mouth = new THREE.Mesh(inset, new THREE.MeshBasicMaterial({ color: 0x1e293b })); mouth.rotation.x = -Math.PI / 2; mouth.position.set(0, BIN.h + 0.005, 0.0); group.add(mouth);
      const bin = { answer: ans, group, x: group.position.x, face: null, family: null };
      if (this.zone === 'a') {
        const m = new THREE.Mesh(facePlane, new THREE.MeshBasicMaterial({ map: faceTexture(ans, 'normal'), transparent: true, depthWrite: false }));
        m.position.set(0, 0.55, 0.455); group.add(m); bin.face = m; bin.family = ans;
        const lab = labelPlaque(FAMILY[ans].zh, FAMILY[ans].en); lab.position.set(0, BIN.h - 0.3, 0.46); group.add(lab);
      } else {
        const hole = makeTile(MOUTH[ans], { color: 0x1e293b, size: 0.78, thickness: 0.05 });
        const stand = new THREE.Group(); stand.rotation.x = Math.PI / 2; stand.position.set(0, 0.55, 0.455); stand.add(hole); group.add(stand);
        const lab = labelPlaque(ANSWER_TEXT[ans].zh, ANSWER_TEXT[ans].en); lab.position.set(0, BIN.h - 0.3, 0.46); group.add(lab);
      }
      this.root.add(group); this.bins.push(bin);
    });
  }

  buildCrate() {
    const g = this.crate = new THREE.Group(); g.position.set(CRATE.x, 0, 0);
    const wood = lam(0xb7791f), dark = lam(0x7c4a0f);
    const part = (w, h, d, x, y, z, m = wood) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); g.add(b); };
    part(CRATE.w, 0.1, 0.9, 0, 0.05, 0, dark);
    part(CRATE.w, CRATE.h, 0.08, 0, CRATE.h / 2, -0.41);
    part(0.08, CRATE.h, 0.9, -CRATE.w / 2, CRATE.h / 2, 0);
    part(0.08, CRATE.h, 0.9, CRATE.w / 2, CRATE.h / 2, 0);
    part(CRATE.w, CRATE.h * 0.55, 0.08, 0, CRATE.h * 0.275, 0.41);
    const lab = labelPlaque('等一下', 'Later', 0.95, 0.44); lab.position.set(0, 0.4, 0.47); g.add(lab);
    this.root.add(g);
  }

  buildHighlight() {
    this.hi = new THREE.Mesh(new THREE.CircleGeometry(0.78, 32), new THREE.MeshBasicMaterial({ color: 0xfde047, transparent: true, opacity: 0.6, depthWrite: false }));
    this.hi.position.z = -0.3; this.hi.visible = false; this.root.add(this.hi);
  }

  // ------------------------------------------------------------------ camera
  viewArgs() {
    const asp = this.stage.width / Math.max(1, this.stage.height), t = Math.tan(THREE.MathUtils.degToRad(20));
    const w = 9.4, h = 6.6, cx = 0.05, cy = 2.4;
    const d = Math.max(w / 2 / (t * asp), h / 2 / t);
    return [[cx, cy + 0.6 + d * 0.06, d], [cx, cy, 0]];
  }

  // ------------------------------------------------------------------ play
  begin() {
    this.running = true; this.rushOn = true;
    this.bridge.rushStart(this.zone, () => this.timeUp());
    this.stage.awake('rush', true);
    this.spawn();
  }

  async timeUp() {
    if (this.ended || !this.alive) return;
    this.ended = true; this.running = false; this.timeIsUp = true;
    for (const it of this.items.filter(i => i.state === 'held')) this.retire(it); // nothing stays in a hand when time is up
    this.setHover(null);
    this.hi.visible = false;
    this.ui.toast('時間到！', "Time's up!", 1800);
    try { sfx.fanfare(); } catch (e) { /* ignore */ }
    voice.say('時間到');
    await this.live(wait(1500));
    this.rushOn = false;
    await this.live(this.bridge.rushEnd(this.zone)); // rank popup, then the leaderboard; closing that goes to the Workshop
  }

  /** ⬅: stop the timer and HUD without saving, back to the Workshop. */
  leave() {
    if (!this.alive || this.timeIsUp) return; // after 「時間到」 the score is going to be saved: ⬅ does nothing
    this.running = false; this.ended = true;
    if (this.rushOn) { this.rushOn = false; this.bridge.rushAbort(); }
    this.go('Workshop');
  }

  newData() {
    const gen = this.zone === 'a' ? genRush3d : genRush2d;
    let d = gen(this.bridge.rng);
    for (let k = 0; k < 4 && this.lastAnswers.length >= 2 && this.lastAnswers.every(a => a === d.answer); k++) d = gen(this.bridge.rng); // not 3 of a kind in a row
    this.lastAnswers.push(d.answer); if (this.lastAnswers.length > 2) this.lastAnswers.shift();
    return d;
  }

  makeBody(d) {
    const holder = new THREE.Group(), inner = new THREE.Group(); inner.scale.setScalar(ITEM_S); holder.add(inner);
    if (d.kind === 'sort3d') {
      inner.add(d.object ? makeObject(d.object) : makeSolid(d.model, { color: toyColor(this.bridge.rng), face: true, pose: d.pose, shadow: false }));
    } else {
      const tile = makeTile(d.tile, { color: toyColor(this.bridge.rng), size: 1, thickness: 0.12 });
      tile.rotation.y = -d.rot * Math.PI / 180; // turned tiles
      const stand = new THREE.Group(); stand.rotation.x = Math.PI / 2; stand.add(tile); stand.position.z = -0.06; inner.add(stand); // stands up facing the camera
    }
    holder.add(new THREE.Mesh(this.hitGeo, this.hitMat));
    return holder;
  }

  spawn() {
    const data = this.newData(), holder = this.makeBody(data);
    const it = { id: this.nextId++, holder, data, answer: data.answer, x: BELT.x0 + 0.3, state: 'belt', off: null };
    holder.position.set(it.x, ITEM_Y, 0); holder.scale.setScalar(0.01);
    this.root.add(holder);
    tween(holder.scale, { x: 1, y: 1, z: 1 }, { ms: 220, ease: 'outBack' });
    it.off = this.input.drag(holder, {
      plane: PLANE, lift: 0,
      onStart: o => { if (it.state === 'belt' && !this.ended) { it.state = 'held'; it.start = o.position.clone(); try { sfx.tick(); } catch (e) { /* ignore */ } } },
      onMove: (o, pt) => this.setHover(it.state === 'held' ? this.binAt(pt) : null),
      // not returned: Input awaits onEnd and would block every press until the animation finished
      onEnd: (o, pt, ev) => { this.dropped(it, pt, !!(ev && ev.cancelled)); },
    });
    this.items.push(it);
    this.spawnT = this.bridge.rushState().isFever ? 1.0 : 1.4;
  }

  /** The bin under a world point of the drag plane: below the belt and within a bin's column (the columns touch). */
  binAt(pt) {
    if (pt.y >= DROP_BELOW) return null;
    return this.bins.find(b => Math.abs(pt.x - b.x) <= BIN.pitch / 2) || null;
  }
  setHover(bin) {
    if (this.hover === bin) return;
    if (this.hover) this.hover.group.scale.set(1, 1, 1);
    this.hover = bin;
    if (bin) bin.group.scale.set(1.06, 1.06, 1.06);
    this.stage.invalidate();
  }

  dropped(it, pt, cancelled) {
    this.setHover(null);
    if (it.state !== 'held') return;
    const h = it.holder;
    if (cancelled || this.ended || !this.alive) { this.backToBelt(it, h.position.x); return; }
    // a press without movement selects the item: the next bin tap sends this one (no sideways snap)
    if (h.position.distanceTo(it.start) < 0.15) { it.state = 'belt'; h.position.copy(it.start); this.sel = it; this.stage.invalidate(); return; }
    const bin = this.binAt(pt);
    if (bin) { this.sendTo(it, bin); return; }
    if (pt.y < DROP_BELOW && pt.x > BELT.x1 - 0.1) { this.toCrate(it, false); return; } // dropped on the "later" crate
    this.backToBelt(it, pt.x);
  }

  backToBelt(it, x) {
    it.x = Math.max(BELT.x0 + 0.2, Math.min(BELT.x1 - 0.2, x));
    it.holder.position.set(it.x, ITEM_Y, 0);
    it.state = 'belt';
    this.stage.invalidate();
  }

  /** The highlighted item: the one nearest the end of the belt. */
  front() {
    if (this.sel && this.sel.state === 'belt' && this.items.includes(this.sel)) return this.sel; // chosen by a press on it
    let f = null;
    for (const it of this.items) if (it.state === 'belt' && (!f || it.x > f.x)) f = it;
    return f;
  }

  /** Tap on a bin: the front item flies in. (Public: also used to test.) */
  sendFront(bin) {
    if (this.ended || !this.running) return null;
    const it = this.front();
    if (!it) return null;
    this.sendTo(it, bin);
    return it;
  }

  retire(it) {
    if (it.off) { it.off(); it.off = null; }
    if (this.sel === it) this.sel = null;
    this.items = this.items.filter(x => x !== it);
    this.root.remove(it.holder);
    disposeTree(it.holder);
    this.stage.invalidate();
  }

  async sendTo(it, bin) {
    if (this.ended || it.state === 'busy') return;
    // grade at the moment of choice (the answer comes from shapes-logic's genRush3d / genRush2d); then animate
    it.state = 'busy'; if (this.sel === it) this.sel = null;
    if (it.off) { it.off(); it.off = null; }
    const right = it.answer === bin.answer;
    const pts = this.bridge.rushHit(right, 10);
    const fever = this.bridge.rushState().isFever;
    const h = it.holder, mouth = BIN.h + 0.35;
    await this.live(Promise.all([
      tween(h.position, { x: bin.x, y: mouth, z: 0 }, { ms: 300, ease: 'outCubic' }),
      tween(h.scale, { x: 0.6, y: 0.6, z: 0.6 }, { ms: 300, ease: 'outCubic' }),
    ]));
    if (right) {
      try { sfx.munch(); sfx.ding(); } catch (e) { /* ignore */ }
      this.mood(bin, 'happy', 700);
      this.pop(bin, fever);
      this.floatText(`+${pts}`, bin.x, BIN.h + 0.6, fever ? '#f97316' : '#16a34a');
      if (fever) sparkle(this.stage, new THREE.Vector3(bin.x, BIN.h + 0.4, 0), this.root);
      await this.live(Promise.all([
        tween(h.position, { y: BIN.h - 0.5 }, { ms: 220, ease: 'inOutCubic' }),
        tween(h.scale, { x: 0.01, y: 0.01, z: 0.01 }, { ms: 220 }),
      ]));
    } else {
      try { sfx.boing(); } catch (e) { /* ignore */ }
      this.mood(bin, 'oops', 800);
      this.wobble(bin);
      puff(this.stage, new THREE.Vector3(bin.x, BIN.h + 0.2, 0.3), this.root);
      const dir = Math.random() < 0.5 ? -1 : 1;
      await this.live(Promise.all([
        tween(h.position, { x: bin.x + dir * 1.6, y: BIN.h + 1.5 }, { ms: 260, ease: 'outCubic' }),
        tween(h.rotation, { z: dir * -2.5 }, { ms: 520, ease: 'outCubic' }),
      ]));
      await this.live(Promise.all([
        tween(h.position, { y: 0.2, x: bin.x + dir * 2.4, z: 1.2 }, { ms: 380, ease: 'inOutCubic' }),
        tween(h.scale, { x: 0.01, y: 0.01, z: 0.01 }, { ms: 380 }),
      ]));
    }
    this.retire(it);
  }

  /** Falls off the end of the belt (or dropped on the crate): into the "later" crate, no points either way. */
  async toCrate(it, fromBelt = true) {
    if (it.state === 'busy') return;
    it.state = 'busy'; if (this.sel === it) this.sel = null;
    if (it.off) { it.off(); it.off = null; }
    const h = it.holder;
    try { sfx.tick(); } catch (e) { /* ignore */ }
    if (fromBelt) await this.live(Promise.all([tween(h.position, { x: CRATE.x - 0.2 }, { ms: 260, ease: 'outCubic' }), tween(h.rotation, { z: -0.7 }, { ms: 260 })]));
    else await this.live(tween(h.position, { x: CRATE.x, y: 2.0 }, { ms: 200, ease: 'outCubic' }));
    await this.live(Promise.all([
      tween(h.position, { x: CRATE.x, y: 0.55 }, { ms: 420, ease: 'outBounce' }),
      tween(h.scale, { x: 0.55, y: 0.55, z: 0.55 }, { ms: 420 }),
    ]));
    await this.live(wait(160));
    this.retire(it);
  }

  // ------------------------------------------------------------------ small effects
  mood(bin, mood, ms) {
    if (!bin.face) return;
    bin.face.material.map = faceTexture(bin.family, mood);
    this.stage.invalidate();
    this.live(wait(ms)).then(() => { if (bin.face) { bin.face.material.map = faceTexture(bin.family, 'normal'); this.stage.invalidate(); } });
  }
  pop(bin) {
    const g = bin.group;
    g.scale.set(1.12, 0.88, 1.12);
    tween(g.scale, { x: 1, y: 1, z: 1 }, { ms: 300, ease: 'outBack' });
  }
  async wobble(bin) {
    const g = bin.group;
    for (const a of motion.less ? [0] : [0.12, -0.12, 0.08, -0.08, 0]) await this.live(tween(g.rotation, { z: a }, { ms: 70, ease: 'inOutCubic' }));
  }

  /** A DOM number that floats up from a 3-D point and fades. */
  floatText(text, x, y, color) {
    const host = document.getElementById('ui');
    if (!host) return;
    const p = this.stage.toScreen(new THREE.Vector3(x, y, 0.6));
    const e = document.createElement('div');
    e.textContent = text;
    e.style.cssText = `position:absolute;left:${p.x}px;top:${p.y}px;transform:translate(-50%,0);pointer-events:none;font:bold 34px ${FONT};color:${color};-webkit-text-stroke:3px #fff;paint-order:stroke fill;text-shadow:0 2px 0 rgba(0,0,0,.25);transition:transform .9s ease-out, opacity .9s ease-in;opacity:1`;
    host.appendChild(e);
    requestAnimationFrame(() => requestAnimationFrame(() => { e.style.transform = `translate(-50%,${motion.less ? -20 : -70}px)`; e.style.opacity = '0'; }));
    setTimeout(() => e.remove(), 1000);
  }

  // ------------------------------------------------------------------ frame loop
  update(dt) {
    this.clock += dt;
    const key = this.stage.width + 'x' + this.stage.height;
    if (key !== this.sizeKey) { this.sizeKey = key; this.stage.setView(...this.viewArgs()); } // HUD shown / rotated: refit
    if (!this.running) return;
    const fever = this.bridge.rushState().isFever;
    const speed = fever ? FEVER_SPEED : SPEED;
    // belt stripes roll to the right; rainbow while in fever
    this.stripe.offset.x -= (speed / (BELT.x1 - BELT.x0)) * dt * 10;
    if (fever) { this.hue = (this.hue + dt * 0.9) % 1; this.beltTop.color.setHSL(this.hue, 0.8, 0.7); } else this.beltTop.color.setRGB(1, 1, 1);
    if (fever && (this.feverT -= dt) <= 0) { this.feverT = 0.8; sparkle(this.stage, new THREE.Vector3(BELT.x0 + Math.random() * (BELT.x1 - BELT.x0), BELT.top + 0.9, 0.3), this.root); }
    // move items, front first, so each keeps a gap to the one ahead
    const belt = this.items.filter(i => i.state === 'belt').sort((a, b) => b.x - a.x);
    let ahead = Infinity;
    for (const it of belt) {
      const limit = ahead - GAP;
      it.x = Math.min(it.x + speed * dt, Math.max(it.x, limit));
      it.holder.position.x = it.x; it.holder.position.y = ITEM_Y;
      ahead = it.x;
    }
    if (belt.length && belt[0].x >= BELT.x1) this.toCrate(belt[0]);
    // spawn
    const onBelt = this.items.filter(i => i.state === 'belt' || i.state === 'held').length;
    this.spawnT -= dt;
    if (this.spawnT <= 0 && onBelt < MAX_ON_BELT && !this.items.some(i => i.state === 'belt' && i.x < BELT.x0 + GAP)) this.spawn();
    // highlight the front item
    const f = this.front();
    this.hi.visible = !!f;
    if (f) { this.hi.position.x = f.x; this.hi.position.y = ITEM_Y; this.hi.material.opacity = 0.45 + 0.2 * Math.sin(this.clock * 6); }
    this.stage.invalidate();
  }

  async exit() {
    this.stage.awake('rush', false);
    if (this.rushOn) { this.rushOn = false; this.bridge.rushAbort(); } // left another way: stop the timer and hide the HUD
    this.running = false;
    for (const it of this.items) if (it.off) it.off();
    this.hitGeo.dispose(); this.hitMat.dispose();
  }
}
