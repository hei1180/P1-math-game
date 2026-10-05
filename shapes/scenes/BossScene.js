// Boss 測試跑道 Test Track (mixed). Three job cards: pick wheels, body, head and a window from shelves of 3-D parts,
// watch the live robot change, press 出發, and the robot drives the track. Grading is only checkBuild(); the
// scripted drive (robot.userData.drive) just animates the fail code. Failures are funny and never shaming: the robot
// goes back to its bay, the faulty part glows, and after the 2nd failed drive the right choice glows in that row.
// After 3 good builds: trophy, fanfare, fireworks (Less motion: just the trophy), then the base class's end panel.
import * as THREE from 'three';
import { CourseScene } from './CourseScene.js?v=202610051406';
import { tween, wait, motion } from '../engine/tween.js?v=202610051406';
import { disposeTree } from '../engine/stage.js?v=202610051406';
import { sfx } from '../sfx.js?v=202610051406';
import { voice } from '../engine/voice.js?v=202610051406';
import { FONT, SCENE, TOY_COLORS, toyColor } from '../theme.js?v=202610051406';
import { confetti, sparkle, puff } from '../fx3d.js?v=202610051406';
import { makeSolid } from '../models/solids.js?v=202610051406';
import { makeTile } from '../models/tiles.js?v=202610051406';
import { makeBuildRobot } from '../models/robot.js?v=202610051406';
import {
  WHEEL_CHOICES, BODY_CHOICES, HEAD_CHOICES, checkBuild, familyOf, bottomIsFlat, FACTS, FAMILY, CLUE_TEXT, ANSWER_TEXT,
  tileAnswer, templateById, shuffle, lcg,
} from '../../shapes-logic.js?v=202610051406';

// ---- world layout (x right, y up, z towards the camera). The robot drives along +x on the lane. ----
const BAY_X = -3.9, LANE_Z = 0.6, FINISH_X = BAY_X + 8.3;
const RACK = { z: -1.6, labelX: -1.55, cell0: -0.45, pitch: 0.98 };
const ROWS = [
  { slot: 'wheels', zh: '輪', en: 'Wheels', icon: '🛞', y: 4.55 },
  { slot: 'body', zh: '身體', en: 'Body', icon: '📦', y: 3.4 },
  { slot: 'head', zh: '頭', en: 'Head', icon: '🙂', y: 2.25 },
  { slot: 'panel', zh: '窗', en: 'Window', icon: '🪟', y: 1.1 },
];
const SLOT_ORDER = ROWS.map(r => r.slot); // driving order: wheels, body, head, panel
const ITEM = 0.74;                        // scale of a part on the shelf

const FAIL_SLOT = { 'wheels-flat': 'wheels', 'wheels-sphere': 'wheels', 'wheels-cone': 'wheels', 'body-top': 'body', 'head-rolls': 'head', 'head-wrong': 'head', panel: 'panel' };
const FAIL_TEXT = {
  'wheels-flat':   { zh: '輪子滾不動！', en: "These wheels can't roll!" },
  'wheels-sphere': { zh: '球輪四處亂滾！', en: 'Ball wheels roll everywhere!' },
  'wheels-cone':   { zh: '圓錐輪只會轉圈圈！', en: 'Cone wheels go round and round!' },
  'body-top':      { zh: '頭放不穩，滑走了！', en: 'The head slid off!' },
  'head-rolls':    { zh: '頭滾走了！', en: 'The head rolled away!' },
  'head-wrong':    { zh: '看看路牌，要換另一個頭！', en: 'Check the sign: a different head!' },
  panel:           { zh: '窗不合適，彈走了！', en: 'The window popped out!' },
};
const HEAD_ICON = {
  apex: { true: '🔺', false: '🔲' }, circleFace: { true: '⭕', false: '🔷' }, allFlat: { true: '🧊', false: '🔵' },
};
const NAME = { 1: '一', 2: '二', 3: '三' };

const lam = c => new THREE.MeshLambertMaterial({ color: c });
const box = (w, h, d, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); return m; };

/** A flat sign: canvas texture on a plane facing +z. draw(g, W, H) paints it; 128 px per world unit. */
function plaque(w, h, draw, { transparent = true } = {}) {
  const c = document.createElement('canvas'); c.width = Math.round(w * 128); c.height = Math.round(h * 128);
  draw(c.getContext('2d'), c.width, c.height);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: t, transparent, depthWrite: false }));
}
function roundRect(g, x, y, w, h, r) {
  g.beginPath(); g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.arcTo(x + w, y, x + w, y + r, r); g.lineTo(x + w, y + h - r); g.arcTo(x + w, y + h, x + w - r, y + h, r);
  g.lineTo(x + r, y + h); g.arcTo(x, y + h, x, y + h - r, r); g.lineTo(x, y + r); g.arcTo(x, y, x + r, y, r); g.closePath();
}
const labelPlaque = (row) => plaque(1.05, 0.62, (g, W, H) => {
  g.fillStyle = '#fffbeb'; roundRect(g, 3, 3, W - 6, H - 6, 16); g.fill(); g.lineWidth = 5; g.strokeStyle = '#d97706'; g.stroke();
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#1f2937';
  g.font = '34px sans-serif'; g.fillText(row.icon, W * 0.2, H / 2);
  g.font = `bold 36px ${FONT}`; g.fillText(row.zh, W * 0.62, H * 0.38);
  g.font = `15px ${FONT}`; g.fillStyle = '#6b7280'; g.fillText(row.en, W * 0.62, H * 0.74);
});
const signPlaque = (zh, en, bg) => plaque(2.2, 0.8, (g, W, H) => {
  g.fillStyle = bg; roundRect(g, 3, 3, W - 6, H - 6, 18); g.fill(); g.lineWidth = 6; g.strokeStyle = '#ffffff'; g.stroke();
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#ffffff';
  g.font = `bold 56px ${FONT}`; g.fillText(zh, W / 2, H * 0.4);
  g.font = `bold 24px ${FONT}`; g.fillText(en, W / 2, H * 0.8);
});
function checkerTexture(cols, rows) {
  const c = document.createElement('canvas'); c.width = cols * 16; c.height = rows * 16;
  const g = c.getContext('2d');
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) { g.fillStyle = (x + y) % 2 ? '#1f2937' : '#ffffff'; g.fillRect(x * 16, y * 16, 16, 16); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.magFilter = THREE.NearestFilter;
  return t;
}
function polygonIcon(n, size = 48) {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '-26 -26 52 52'); s.setAttribute('width', size); s.setAttribute('height', size);
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
  const pts = []; for (let i = 0; i < n; i++) { const a = -Math.PI / 2 + (i * 2 * Math.PI) / n; pts.push((Math.cos(a) * 22).toFixed(1) + ',' + (Math.sin(a) * 22).toFixed(1)); }
  p.setAttribute('points', pts.join(' ')); p.setAttribute('fill', '#fbbf24'); p.setAttribute('stroke', '#92400e'); p.setAttribute('stroke-width', '3'); p.setAttribute('stroke-linejoin', 'round');
  s.appendChild(p); return s;
}

export class BossScene extends CourseScene {
  static courseKey = 'boss';

  // ------------------------------------------------------------------ set
  async setup() {
    this.cells = [];          // tappable shelf cells { group, slot, id, marker, holder }
    this.rowGroups = {};      // slot -> Group holding that row's cells
    this.labels = {};         // slot -> { plaque, back }
    this.glows = [];          // { mesh, kind, slot }
    this.build = {}; this.picked = {};
    this.robot = null; this.sign = null; this.trophy = null;
    this.canPick = false; this.busy = false;
    this.camMode = 'static'; this.cam = null; this.camTarget = null; this.sizeKey = '';
    this.colorSeed = 1; this.clock = 0;

    this.buildExtras();
    this.buildTrack();
    this.buildRack();
    this.input.onTap(() => this.cells.map(c => c.group), cell => this.pick(this.cells.find(c => c.group === cell)));
    this.modeName = 'build';
    this.applyLayout();
    this.setStatic(this.viewFor('build'), 0);
  }

  /** Bigger floor and wall than the base room, so a wide screen never shows the sky at the sides. */
  buildExtras() {
    const ground = box(60, 0.3, 30, lam(SCENE.floor), 0, -0.17, -4);
    const wall = box(60, 5, 0.3, lam(SCENE.wall), 0, 2.5, -4.9);
    this.root.add(ground, wall);
  }

  buildTrack() {
    const root = this.root, len = FINISH_X - BAY_X + 4.6, cx = BAY_X - 1.6 + len / 2;
    const signs = this.signs = new THREE.Group(); root.add(signs); // start / finish boards: shown only while the robot drives (they would cover the shelves)
    root.add(box(len, 0.04, 1.7, lam(0x64748b), cx, 0.02, LANE_Z));
    // dashed centre line
    const dash = new THREE.BoxGeometry(0.5, 0.045, 0.07), white = lam(0xffffff);
    for (let x = BAY_X + 0.9; x < FINISH_X - 0.3; x += 1.1) { const d = new THREE.Mesh(dash, white); d.position.set(x, 0.025, LANE_Z); root.add(d); }
    // the robot bay: a round pad with a yellow ring
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 0.07, 32), lam(0x475569)); pad.position.set(BAY_X, 0.04, LANE_Z);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.12, 0.045, 8, 40), lam(0xfacc15)); ring.rotation.x = Math.PI / 2; ring.position.set(BAY_X, 0.08, LANE_Z);
    root.add(pad, ring);
    // start sign (a board on two posts behind the lane) and start line
    const post = new THREE.CylinderGeometry(0.05, 0.05, 1.5, 8), steel = lam(SCENE.metal);
    const startSign = signPlaque('出發', 'START', '#16a34a'); startSign.position.set(BAY_X + 1.6, 1.55, LANE_Z - 1.15);
    signs.add(startSign);
    for (const dx of [-0.95, 0.95]) { const p = new THREE.Mesh(post, steel); p.position.set(BAY_X + 1.6 + dx, 0.75, LANE_Z - 1.15); signs.add(p); }
    root.add(box(0.12, 0.05, 1.7, lam(0xffffff), BAY_X + 1.5, 0.045, LANE_Z));
    // bumps along the lane
    const bump = new THREE.SphereGeometry(0.5, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2), bm = lam(0xf59e0b);
    for (const dx of [3.4, 4.9, 6.2]) { const b = new THREE.Mesh(bump, bm); b.scale.set(0.55, 0.2, 1.5); b.position.set(BAY_X + dx, 0.04, LANE_Z); root.add(b); }
    // finish: checkered line, sign and flag
    const chk = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 1.7), new THREE.MeshBasicMaterial({ map: checkerTexture(2, 7) }));
    chk.rotation.x = -Math.PI / 2; chk.position.set(FINISH_X, 0.05, LANE_Z); root.add(chk);
    const finSign = signPlaque('終點', 'FINISH', '#dc2626'); finSign.position.set(FINISH_X + 0.2, 1.55, LANE_Z - 1.15); signs.add(finSign);
    for (const dx of [-0.95, 0.95]) { const p = new THREE.Mesh(post, steel); p.position.set(FINISH_X + 0.2 + dx, 0.75, LANE_Z - 1.15); signs.add(p); }
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 2.2, 8), steel); pole.position.set(FINISH_X + 1.5, 1.1, LANE_Z - 0.9);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.45), new THREE.MeshBasicMaterial({ map: checkerTexture(4, 3), side: THREE.DoubleSide }));
    flag.position.set(FINISH_X + 1.5 + 0.35, 1.95, LANE_Z - 0.9); this.flag = flag;
    signs.add(pole, flag); signs.visible = false;
  }

  /** The shelf rack at the back: four rows, each with a label and tappable 3-D parts. */
  buildRack() {
    const rack = this.rack = new THREE.Group(); this.root.add(rack);
    const wood = lam(SCENE.bench);
    rack.add(box(6.5, 5.0, 0.12, lam(0xfde68a), 0.95, 2.85, RACK.z - 0.45)); // back board
    for (const x of [-2.3, 4.2]) rack.add(box(0.14, 5.3, 0.9, wood, x, 2.65, RACK.z - 0.1)); // side posts
    for (const r of ROWS) {
      rack.add(box(6.4, 0.1, 0.8, wood, 0.95, r.y - 0.47, RACK.z)); // board
      const lab = labelPlaque(r); lab.position.set(RACK.labelX, r.y, RACK.z + 0.3);
      const back = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.78), new THREE.MeshBasicMaterial({ color: 0xf97316 })); // lit when the fix is in this row
      back.position.set(RACK.labelX, r.y, RACK.z + 0.28); back.visible = false;
      rack.add(back, lab); this.labels[r.slot] = { plaque: lab, back };
    }
    const cols = shuffle(TOY_COLORS, this.bridge.rng);
    this.fillRow('wheels', WHEEL_CHOICES, cols);
    this.fillRow('body', BODY_CHOICES, cols.slice(2));
    this.fillRow('head', HEAD_CHOICES, cols.slice(4).concat(cols));
  }

  /** (Re)build one shelf row. ids: model ids (wheels / body / head) or tile template ids (panel). */
  fillRow(slot, ids, cols) {
    const old = this.rowGroups[slot];
    if (old) { this.rack.remove(old); disposeTree(old); this.cells = this.cells.filter(c => c.slot !== slot); }
    const row = ROWS.find(r => r.slot === slot), g = this.rowGroups[slot] = new THREE.Group();
    this.rack.add(g);
    const hitBox = new THREE.BoxGeometry(0.96, 1.05, 0.8), hitMat = new THREE.MeshBasicMaterial({ visible: false });
    ids.forEach((id, i) => {
      const cell = new THREE.Group(); cell.position.set(RACK.cell0 + i * RACK.pitch, row.y, RACK.z);
      const proxy = new THREE.Mesh(hitBox, hitMat); cell.add(proxy);
      const marker = new THREE.Mesh(new THREE.CircleGeometry(0.44, 28), new THREE.MeshBasicMaterial({ color: 0x86efac }));
      marker.position.z = -0.32; marker.visible = false; cell.add(marker);
      const holder = new THREE.Group(); holder.scale.setScalar(ITEM); cell.add(holder);
      if (slot === 'panel') {
        const tile = makeTile(id, { color: cols[i % cols.length], size: 1.0, thickness: 0.12 });
        const stand = new THREE.Group(); stand.rotation.x = Math.PI / 2; stand.add(tile); holder.add(stand); // stands up facing the camera
      } else {
        holder.add(makeSolid(id, { color: cols[i % cols.length], face: true, shadow: false }));
      }
      g.add(cell);
      this.cells.push({ group: cell, slot, id, marker, holder });
    });
    this.stage.invalidate();
  }

  // ------------------------------------------------------------------ camera
  /** Camera that fits a w × h box (world units) centred on (cx, cy) in the z = 0 plane, for the current aspect. */
  frame(cx, cy, w, h) {
    const asp = this.stage.width / Math.max(1, this.stage.height), t = Math.tan(THREE.MathUtils.degToRad(20));
    const d = Math.max(w / 2 / (t * asp), h / 2 / t);
    return { pos: [cx, cy + 0.5 + d * 0.1, d], look: [cx, cy, 0] };
  }
  get portrait() { return this.stage.width / Math.max(1, this.stage.height) < 0.9; }
  /** Tall screens (phones): the rack goes above the bay and the frame is tight, so shelf cells stay big enough to touch. */
  applyLayout() { if (this.rack) this.rack.position.set(this.portrait ? -3 : 0, this.portrait ? 2.6 : 0, 0); }
  viewFor(mode) {
    if (mode === 'build') return this.portrait ? this.frame(-2.05, 3.7, 6.6, 8.4) : this.frame(-0.5, 2.7, 10.8, 8.2);
    if (mode === 'trophy') return this.frame(0, 1.8, 9.6, 5.8);
    // 'follow': a window around the robot, kept ahead of it
    const x = this.robot ? Math.max(this.robot.position.x + 1.3, BAY_X + 1.3) : BAY_X + 1.3;
    return this.frame(x, 1.5, 6.8, 3.9);
  }
  setStatic(v, ms = 0) {
    this.camMode = 'static'; this.camTarget = v;
    this.cam = { px: v.pos[0], py: v.pos[1], pz: v.pos[2], lx: v.look[0], ly: v.look[1], lz: v.look[2] };
    return this.stage.setView(v.pos, v.look, ms);
  }

  update(dt) {
    this.clock += dt;
    if (!this.alive) return;
    // keep the framing right after a resize / rotation
    const key = this.stage.width + 'x' + this.stage.height;
    if (key !== this.sizeKey) {
      this.sizeKey = key;
      this.applyLayout();
      if (this.camMode === 'static' && this.camTarget && this.modeName) this.setStatic(this.viewFor(this.modeName), 0);
    }
    if (this.camMode === 'follow' && this.cam) {
      const v = this.viewFor('follow'), k = 1 - Math.exp(-6 * dt), c = this.cam;
      c.px += (v.pos[0] - c.px) * k; c.py += (v.pos[1] - c.py) * k; c.pz += (v.pos[2] - c.pz) * k;
      c.lx += (v.look[0] - c.lx) * k; c.ly += (v.look[1] - c.ly) * k; c.lz += (v.look[2] - c.lz) * k;
      this.stage.setView([c.px, c.py, c.pz], [c.lx, c.ly, c.lz], 0);
    }
    if (this.glows.length) {
      const o = 0.3 + 0.2 * Math.sin(this.clock * 6);
      for (const g of this.glows) g.mesh.material.opacity = g.base * (0.6 + o);
      this.stage.invalidate();
    }
    if (this.trophy && !motion.less) { this.trophy.rotation.y += dt * 0.9; this.stage.invalidate(); }
    if (this.flag && !motion.less) { this.flag.rotation.y = Math.sin(this.clock * 3) * 0.12; this.stage.invalidate(); }
  }

  async view(mode, ms = 650) {
    this.modeName = mode;
    if (mode === 'follow') { this.camMode = 'follow'; return; }
    await this.live(this.setStatic(this.viewFor(mode), ms));
  }

  // ------------------------------------------------------------------ glow helpers
  clearGlows(kind) {
    this.glows = this.glows.filter(g => {
      if (kind && g.kind !== kind) return true;
      if (g.mesh.parent) g.mesh.parent.remove(g.mesh);
      disposeTree(g.mesh);
      return false;
    });
    for (const l of Object.values(this.labels)) if (!kind || kind === 'label') l.back.visible = false;
    this.stage.awake('boss-glow', this.glows.length > 0);
    this.stage.invalidate();
  }
  addGlow(mesh, kind, base = 0.55) {
    mesh.material.transparent = true; mesh.material.depthWrite = false; mesh.material.opacity = base;
    mesh.renderOrder = 2;
    this.glows.push({ mesh, kind, base });
    this.stage.awake('boss-glow', true);
  }

  /** Orange halo(s) around the part of the robot that failed (robot.userData.partNodes). */
  glowRobotPart(slot) {
    const r = this.robot; if (!r) return;
    const pn = r.userData.partNodes && r.userData.partNodes[slot];
    const nodes = pn ? [].concat(pn) : [r]; // no part nodes: glow the whole robot rather than nothing
    r.updateMatrixWorld(true);
    for (const n of nodes) {
      const b = new THREE.Box3().setFromObject(n), size = b.getSize(new THREE.Vector3()), c = b.getCenter(new THREE.Vector3());
      const halo = new THREE.Mesh(new THREE.SphereGeometry(0.5, 16, 12), new THREE.MeshBasicMaterial({ color: 0xfb923c, blending: THREE.AdditiveBlending }));
      halo.scale.set(Math.max(size.x, 0.3) * 1.25, Math.max(size.y, 0.3) * 1.25, Math.max(size.z, 0.3) * 1.5);
      halo.position.copy(c); this.root.add(halo); this.addGlow(halo, 'part', 0.4);
    }
    const l = this.labels[slot]; if (l) l.back.visible = true;
    this.stage.invalidate();
  }

  /** Choices in a row that would not fail in that row, given what is picked elsewhere (fails later in driving order are fine). */
  rightChoices(slot) {
    return this.cells.filter(c => c.slot === slot).filter(c => {
      const r = checkBuild(this.job, { ...this.build, [slot]: c.id });
      return r.ok || SLOT_ORDER.indexOf(FAIL_SLOT[r.fail]) > SLOT_ORDER.indexOf(slot);
    });
  }

  // ------------------------------------------------------------------ the live robot
  setRobot(pop = false) {
    const old = this.robot;
    if (old) { this.root.remove(old); disposeTree(old); }
    const r = this.robot = makeBuildRobot({ ...this.build }, { rng: lcg(this.colorSeed) });
    r.position.set(BAY_X, 0, LANE_Z);
    this.root.add(r);
    if (pop) { r.scale.setScalar(0.01); tween(r.scale, { x: 1, y: 1, z: 1 }, { ms: 320, ease: 'outBack' }); }
    this.stage.invalidate();
    return r;
  }

  pick(cell) {
    if (!cell || !this.canPick || this.busy || this.leaving) return;
    const { slot, id } = cell;
    this.build[slot] = id; this.picked[slot] = true;
    for (const c of this.cells) if (c.slot === slot) c.marker.visible = c.id === id;
    // fixing a row clears its failure glow and hint
    if (this.fixSlot === slot) { this.clearGlows(); this.fixSlot = null; }
    cell.holder.scale.setScalar(ITEM * 1.25); tween(cell.holder.scale, { x: ITEM, y: ITEM, z: ITEM }, { ms: 260, ease: 'outBack' });
    try { sfx.pop(); } catch (e) { /* ignore */ }
    voice.say(slot === 'panel' ? ANSWER_TEXT[tileAnswer(templateById(id))].zh : FAMILY[familyOf(id)].zh);
    this.setRobot(true);
    this.updateGo();
  }

  /** 出發 looks greyed out until all four rows are picked (tapping it early still gives the friendly toast). */
  updateGo() {
    const b = [...document.querySelectorAll('#ui button')].find(x => x.textContent.includes('出發'));
    if (!b) return;
    const ok = this.allPicked();
    b.style.opacity = ok ? '' : '0.45'; b.style.filter = ok ? '' : 'grayscale(1)';
    b.setAttribute('aria-disabled', ok ? 'false' : 'true');
  }

  allPicked() { return SLOT_ORDER.every(s => this.picked[s]); }

  /** A fresh job: unpicked rows, a random-looking starter robot (Go stays locked until all four rows are chosen). */
  startJob(job) {
    const rng = this.bridge.rng;
    this.colorSeed = 1 + Math.floor(rng() * 1e6);
    const r = a => a[Math.floor(rng() * a.length) % a.length];
    this.build = { wheels: r(WHEEL_CHOICES), body: r(BODY_CHOICES), head: r(HEAD_CHOICES), panel: job.panels[0] };
    this.picked = {}; this.fixSlot = null;
    const cols = shuffle(TOY_COLORS, rng);
    this.fillRow('panel', job.panels, cols);
    for (const c of this.cells) c.marker.visible = false;
    this.clearGlows();
    this.rack.visible = true; this.signs.visible = false;
    this.setRobot(true);
  }

  // ------------------------------------------------------------------ job card (3 icon rows) and play loop
  jobCard(job, i) {
    return new Promise(resolve => {
      const host = document.getElementById('ui');
      const back = document.createElement('div');
      back.className = 'absolute inset-0 flex items-center justify-center p-4 bg-black/50';
      back.style.cssText = `pointer-events:auto;font-family:${FONT}`;
      const panel = document.createElement('div');
      panel.className = 'ui-pop bg-white rounded-3xl border-4 border-emerald-300 p-4 w-full max-w-sm text-center';
      const title = document.createElement('div'); title.className = 'text-3xl font-bold text-gray-800'; title.textContent = `任務 ${i + 1}`;
      const sub = document.createElement('div'); sub.className = 'text-sm text-gray-500 mb-2'; sub.textContent = `Job ${i + 1} of ${this.items.length}: build a robot`;
      panel.append(title, sub);
      const need = CLUE_TEXT[job.head.fact][job.head.value];
      const rows = [
        { icon: '🛞', zh: '輪子要會滾動', en: 'Wheels that can roll' },
        { icon: HEAD_ICON[job.head.fact][job.head.value], zh: need.zh, en: `Head: ${need.en}` },
        { svg: polygonIcon(job.panel), zh: `${ANSWER_TEXT[job.panel].zh}窗`, en: `A window with ${ANSWER_TEXT[job.panel].en}` },
      ];
      for (const r of rows) {
        const row = document.createElement('div'); row.className = 'flex items-center gap-3 bg-amber-50 rounded-2xl px-3 py-2 mb-2 text-left';
        const ic = document.createElement('div'); ic.className = 'flex-none flex items-center justify-center text-4xl'; ic.style.cssText = 'width:56px;height:56px';
        if (r.svg) ic.appendChild(r.svg); else ic.textContent = r.icon;
        const tx = document.createElement('div'); tx.className = 'min-w-0';
        const z = document.createElement('div'); z.className = 'text-xl font-bold text-gray-800 leading-tight'; z.textContent = r.zh;
        const e = document.createElement('div'); e.className = 'text-xs text-gray-500 leading-tight'; e.textContent = r.en;
        tx.append(z, e); row.append(ic, tx); panel.appendChild(row);
      }
      const go = document.createElement('button'); go.type = 'button';
      go.className = 'bubbly-btn rounded-2xl font-bold bg-emerald-500 text-white border-4 border-emerald-600 text-xl py-2 px-6 mt-2 w-full';
      go.style.cssText = `min-height:56px;font-family:${FONT}`;
      go.innerHTML = '<span>開始</span><span class="block text-xs font-normal opacity-80">Start</span>';
      go.addEventListener('click', () => { back.remove(); resolve(); });
      panel.appendChild(go); back.appendChild(panel); host.appendChild(back);
      voice.say(`任務${NAME[i + 1] || i + 1}。輪子要會滾動。${need.zh}。${ANSWER_TEXT[job.panel].zh}窗。`);
    });
  }

  async playItem(job, i) {
    this.job = job;
    this.ui.hidePrompt();
    this.startJob(job);
    await this.view('build');
    await this.live(this.jobCard(job, i));
    this.ui.prompt(`🛞 輪子要會滾動 · ${HEAD_ICON[job.head.fact][job.head.value]} ${CLUE_TEXT[job.head.fact][job.head.value].zh} · 🪟 ${ANSWER_TEXT[job.panel].zh}窗`,
      `Wheels that roll · ${CLUE_TEXT[job.head.fact][job.head.value].en} · ${ANSWER_TEXT[job.panel].en} window`, { speak: false });
    this.canPick = true;
    for (;;) {
      const goP = this.ui.choices([{ id: 'go', zh: '出發！', en: 'Go!', icon: '🚦' }]);
      this.updateGo();
      await this.live(goP);
      await this.holdWhileLeaving();
      if (this.busy) continue;
      if (!this.allPicked()) {
        this.ui.toast('先選齊四樣零件！', 'Pick all four parts first!', 1300);
        voice.say('先選齊四樣零件');
        for (const s of SLOT_ORDER.filter(s => !this.picked[s])) { const p = this.labels[s].plaque; p.scale.setScalar(1.25); tween(p.scale, { x: 1, y: 1, z: 1 }, { ms: 450, ease: 'outBack' }); }
        continue;
      }
      this.busy = true; this.canPick = false;
      this.ui.clearChoices(); this.clearGlows(); this.fixSlot = null;
      const res = checkBuild(job, { ...this.build });
      await this.testDrive(res, job);
      if (res.ok) { this.busy = false; return; }
      // failure: robot back in its bay, faulty part glows, then the base counts the mistake (2nd one runs hint())
      this.robot.userData.reset();
      this.fixSlot = FAIL_SLOT[res.fail]; this.lastFail = res.fail;
      this.rack.visible = true; this.signs.visible = false;
      await this.view('build');
      this.glowRobotPart(this.fixSlot);
      this.busy = false; this.canPick = true;
      await this.wrong(job, res.fail, this.build[FAIL_SLOT[res.fail]]); // item = the faulty part's model / tile id, picked = fail code
    }
  }

  /** The right choices in the faulty row glow (called by the base after the 2nd wrong drive on a job). */
  async hint(job) {
    const r = checkBuild(job, this.build);                       // what failed, worked out again so the row is never empty
    const slot = r.fail ? FAIL_SLOT[r.fail] : this.fixSlot;
    if (!slot) return;
    this.fixSlot = slot;
    for (const c of this.rightChoices(slot)) {
      const disc = new THREE.Mesh(new THREE.CircleGeometry(0.46, 28), new THREE.MeshBasicMaterial({ color: 0xfde047, blending: THREE.AdditiveBlending }));
      disc.position.set(0, 0, -0.2); c.group.add(disc); this.addGlow(disc, 'hint', 0.7);
    }
    this.ui.toast('試試發光的零件！', 'Try the glowing part!', 1600);
    voice.say('試試發光的零件');
    await this.live(wait(900));
  }

  // ------------------------------------------------------------------ test drive
  makeSign(job) {
    const need = HEAD_CHOICES.find(h => bottomIsFlat(h) && FACTS[familyOf(h)][job.head.fact] === job.head.value);
    return need ? makeSolid(need, { color: toyColor(this.bridge.rng), face: false, shadow: false }) : null;
  }
  dropSign() { if (this.sign) { disposeTree(this.sign); this.sign = null; } }

  async testDrive(res, job) {
    this.rack.visible = false; this.signs.visible = true;
    await this.view('follow');
    this.dropSign();
    if (res.fail === 'head-wrong') this.sign = this.makeSign(job);
    const text = res.fail ? FAIL_TEXT[res.fail] : null;
    const on = name => {
      try {
        if (name === 'go') sfx.roll(res.fail ? 400 : 1500);
        else if (name === 'clunk') sfx.clunk();
        else if (name === 'oops') { sfx.boing(); if (text) this.ui.toast(text.zh, text.en, 1500); }
        else if (name === 'land') { sfx.bonk(); puff(this.stage, new THREE.Vector3(this.robot.position.x, 0.1, this.robot.position.z), this.root); }
        else if (name === 'wave' && text) { this.ui.toast('再試一次！', 'Try again!', 1100); voice.say(text.zh + '再試一次'); }
        else if (name === 'finish' && !res.fail) sfx.star(2);
      } catch (e) { console.error(e); }
    };
    const fin = this.robot.userData.drive(res.fail, { sign: this.sign, on });
    this.stage.awake('boss-drive', true);
    try { await this.live(fin); } finally { this.stage.awake('boss-drive', false); }
    if (!res.fail) await this.live(this.celebrate());
    else await this.live(wait(250));
    this.dropSign();
  }

  /** Crossing the finish: confetti, a happy hop and a spin. */
  async celebrate() {
    const r = this.robot, x = r.position.x;
    this.confetti(x, 1.6, LANE_Z, 36); // (skipped with Less motion, which also drops the sparkle, hops and spin)
    if (motion.less) { await this.live(wait(300)); return; }
    sparkle(this.stage, new THREE.Vector3(x, 1.4, LANE_Z), this.root);
    for (let k = 0; k < 2; k++) {
      await this.live(tween(r.position, { y: 0.4 }, { ms: 180, ease: 'outCubic' }));
      await this.live(tween(r.position, { y: 0 }, { ms: 260, ease: 'outBounce' }));
    }
    await this.live(tween(r.rotation, { y: Math.PI * 2 }, { ms: 650, ease: 'inOutCubic' }));
    r.rotation.y = 0;
    await this.live(wait(250));
  }

  // ------------------------------------------------------------------ trophy (after the third good build)
  makeTrophy() {
    const g = new THREE.Group();
    const gold = new THREE.MeshStandardMaterial({ color: 0xfacc15, metalness: 0.55, roughness: 0.3, emissive: 0x6b4e00, emissiveIntensity: 0.35 });
    const stone = new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.6 });
    const podium = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.5, 1.1), stone); podium.position.y = 0.25;
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.5, 0.14, 24), gold); base.position.y = 0.57;
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.16, 0.5, 16), gold); stem.position.y = 0.89;
    const prof = [[0.001, 0], [0.2, 0.04], [0.42, 0.28], [0.58, 0.62], [0.6, 0.78], [0.52, 0.78], [0.5, 0.6], [0.34, 0.3], [0.001, 0.14]].map(([x, y]) => new THREE.Vector2(x, y));
    const cup = new THREE.Mesh(new THREE.LatheGeometry(prof, 28), gold); cup.position.y = 1.12; cup.material = gold.clone(); cup.material.side = THREE.DoubleSide;
    const handles = [-1, 1].map(s => { const h = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.05, 8, 18), gold); h.position.set(s * 0.62, 1.55, 0); return h; });
    const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.2), new THREE.MeshStandardMaterial({ color: 0xfff7ae, emissive: 0xffd400, emissiveIntensity: 0.8 })); star.position.y = 2.15;
    const top = new THREE.Group(); top.add(base, stem, cup, ...handles, star); // everything but the podium turns
    g.add(podium, top); g.userData.top = top;
    return g;
  }

  async finish() {
    await this.holdWhileLeaving();
    this.ui.back(null); this.ui.hidePrompt(); this.ui.clearChoices();
    this.clearGlows(); this.rack.visible = false; this.signs.visible = false; // the start / finish boards would cover the trophy
    this.canPick = false;
    if (this.robot) { this.robot.userData.reset(); this.robot.position.set(2.6, 0, LANE_Z); this.robot.rotation.set(0, 0, 0); }
    await this.view('trophy', 700);
    const trophy = this.makeTrophy(); this.trophy = trophy.userData.top; // update() turns the cup (not the podium)
    trophy.position.set(-0.9, 0, LANE_Z); trophy.scale.setScalar(0.01); this.root.add(trophy);
    this.stage.awake('boss-trophy', true);
    try { sfx.fanfare(); } catch (e) { /* ignore */ }
    this.ui.toast('測試冠軍！', 'Test Track Champion!', 2200);
    voice.say('測試冠軍！好叻呀！');
    const grow = tween(trophy.scale, { x: 1, y: 1, z: 1 }, { ms: 800, ease: 'outBack' });
    if (!motion.less) {
      sparkle(this.stage, new THREE.Vector3(-0.9, 1.6, LANE_Z), this.root);
      // fireworks: three bursts of confetti in the sky, one after another
      this.confetti(-3.2, 3.2, 0, 40);
      this.live(wait(350)).then(() => this.confetti(0.2, 3.8, -0.5, 40));
      this.live(wait(700)).then(() => this.confetti(3.4, 3.2, 0, 40));
    }
    // the robot dances beside it
    const r = this.robot;
    const dance = motion.less ? Promise.resolve() : (async () => {
      for (let k = 0; k < 3 && r; k++) {
        await this.live(tween(r.position, { y: 0.45 }, { ms: 200 }));
        await this.live(tween(r.position, { y: 0 }, { ms: 280, ease: 'outBounce' }));
      }
      if (r) { await this.live(tween(r.rotation, { y: Math.PI * 2 }, { ms: 700, ease: 'inOutCubic' })); r.rotation.y = 0; }
    })();
    await this.live(grow);
    await this.live(dance);
    await this.live(wait(900));
    await super.finish();
  }

  async exit() {
    for (const t of ['boss-glow', 'boss-drive', 'boss-trophy']) this.stage.awake(t, false);
    this.dropSign();
    this.stage.invalidate();
    await super.exit();
  }
}
