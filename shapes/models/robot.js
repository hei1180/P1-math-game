// Robots. makeRobot = the child's own robot (parts, walk / dance / wave / hop).
// makeBuildRobot = the Boss test-drive robot, assembled from solids + a tile window, with scripted drives.
// All geometry / materials / textures are cached and flagged userData.shared, so disposeTree never frees them.
import * as THREE from 'three';
import { PARTS, SLOTS, BASIC_PART, posesOf, familyOf, shuffle, TILE_TEMPLATES, templateById } from '../../shapes-logic.js?v=0';
import { TOY_COLORS } from '../theme.js?v=0';
import { tween, cancelTweens } from '../engine/tween.js?v=0';
import { disposeTree } from '../engine/stage.js?v=0';
import * as Solids from './solids.js?v=0';
import * as Tiles from './tiles.js?v=0';

// ------------------------------------------------------------------ part names
export const PART_INFO = {};
for (const p of Object.values(PARTS)) PART_INFO[p.id] = { zh: p.zh, slot: p.slot };
const BASIC_ZH = { 'wheels-basic': '普通輪', 'head-basic': '普通頭', 'arms-basic': '普通手', 'paint-blue': '藍色油', none: '沒有' };
for (const [slot, id] of Object.entries(BASIC_PART)) {
  // 'none' is the basic value of two slots (antenna, badge), so it carries no single slot
  if (!PART_INFO[id]) PART_INFO[id] = { zh: BASIC_ZH[id] || id, slot: id === 'none' ? null : slot };
}

// ------------------------------------------------------------------ caches
const cache = new Map();
function memo(key, make) {
  let v = cache.get(key);
  if (!v) { v = make(); v.userData.shared = true; cache.set(key, v); }
  return v;
}
const geo = (k, make) => memo('g:' + k, make);
const mat = (k, params) => memo('m:' + k, () => new THREE.MeshStandardMaterial({ roughness: 0.6, metalness: 0.05, ...params }));
const tex = (k, w, h, draw) => memo('t:' + k, () => {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
});
const mesh = (g, m) => new THREE.Mesh(g, m);
const at = (o, x = 0, y = 0, z = 0) => { o.position.set(x, y, z); return o; };

/** Box with rounded edges / corners (the core has no RoundedBoxGeometry). */
function roundedBox(w, h, d, r, seg = 5) {
  const g = new THREE.BoxGeometry(w, h, d, seg, seg, seg), p = g.attributes.position;
  const hx = w / 2 - r, hy = h / 2 - r, hz = d / 2 - r, v = new THREE.Vector3(), c = new THREE.Vector3();
  const n = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    c.set(Math.max(-hx, Math.min(hx, v.x)), Math.max(-hy, Math.min(hy, v.y)), Math.max(-hz, Math.min(hz, v.z)));
    v.sub(c).normalize(); n.set([v.x, v.y, v.z], i * 3);
    p.setXYZ(i, c.x + v.x * r, c.y + v.y * r, c.z + v.z * r);
  }
  g.setAttribute('normal', new THREE.BufferAttribute(n, 3));
  return g;
}

/** Thin cylinder from a to b (for the lightning antenna). */
function stick(a, b, r, m) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), d = B.clone().sub(A), len = d.length();
  const s = mesh(geo('unit-stick', () => new THREE.CylinderGeometry(1, 1, 1, 8)), m);
  s.scale.set(r, len, r); s.position.copy(A).add(B).multiplyScalar(0.5);
  s.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  return s;
}

const starShape = (R, r) => {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) { const a = Math.PI / 2 + (i * Math.PI) / 5, k = i % 2 ? r : R; (i ? s.lineTo : s.moveTo).call(s, Math.cos(a) * k, Math.sin(a) * k); }
  s.closePath(); return s;
};

// ------------------------------------------------------------------ materials
const M = {
  tyre: () => mat('tyre', { color: 0x1f2937, roughness: 0.9 }),
  hub: () => mat('hub', { color: 0xcbd5e1, metalness: 0.5, roughness: 0.35 }),
  metal: () => mat('metal', { color: 0x94a3b8, metalness: 0.55, roughness: 0.4 }),
  dark: () => mat('dark', { color: 0x334155 }),
  gold: () => mat('gold', { color: 0xfacc15, metalness: 0.5, roughness: 0.3 }),
  leaf: () => mat('leaf', { color: 0x16a34a }),
  petal: () => mat('petal', { color: 0xf472b6 }),
  glow: () => mat('glow', { color: 0xfde047, emissive: 0xfacc15, emissiveIntensity: 0.9 }),
  paint(id) {
    if (id === 'paint-rainbow') {
      const t = tex('rainbow', 8, 128, (g, w, h) => {
        const gr = g.createLinearGradient(0, 0, 0, h);
        ['#ef4444', '#f97316', '#facc15', '#22c55e', '#06b6d4', '#3b82f6', '#a855f7'].forEach((c, i, a) => gr.addColorStop(i / (a.length - 1), c));
        g.fillStyle = gr; g.fillRect(0, 0, w, h);
      });
      return mat('paint-rainbow', { map: t, roughness: 0.4 });
    }
    return mat('paint-blue', { color: 0x3b82f6, roughness: 0.4 });
  },
};

// ------------------------------------------------------------------ child's robot parts
const R = { wheel: 0.3, wheelW: 0.22 };

function buildWheels(id) {
  const g = new THREE.Group();
  const tyre = geo('wheel-tyre', () => new THREE.CylinderGeometry(R.wheel, R.wheel, R.wheelW, 24).rotateZ(Math.PI / 2));
  g.userData.spins = [];
  for (const s of [-1, 1]) {
    const mount = at(new THREE.Group(), s * 0.58, R.wheel, 0), spin = new THREE.Group();
    mount.add(spin); g.add(mount); g.userData.spins.push(spin);
    const face = new THREE.Group(); face.rotation.y = s * Math.PI / 2; face.position.x = s * (R.wheelW / 2); spin.add(face); // face +z points outward
    if (id === 'wheels-flower') {
      spin.add(mesh(tyre, M.leaf()));
      face.add(at(mesh(geo('fl-centre', () => new THREE.CylinderGeometry(0.075, 0.075, 0.03, 16).rotateX(Math.PI / 2)), M.gold()), 0, 0, 0.012));
      for (let i = 0; i < 6; i++) {
        const a = (i * Math.PI) / 3, p = mesh(geo('fl-petal', () => new THREE.CylinderGeometry(0.075, 0.075, 0.025, 14).rotateX(Math.PI / 2)), M.petal());
        face.add(at(p, Math.cos(a) * 0.15, Math.sin(a) * 0.15, 0.008));
      }
    } else if (id === 'wheels-star') {
      spin.add(mesh(tyre, M.tyre()));
      const st = mesh(geo('star-wheel', () => new THREE.ExtrudeGeometry(starShape(0.24, 0.11), { depth: 0.03, bevelEnabled: false })), M.gold());
      face.add(at(st, 0, 0, 0.0));
    } else { // basic
      spin.add(mesh(tyre, M.tyre()));
      face.add(at(mesh(geo('hub', () => new THREE.CylinderGeometry(0.15, 0.15, 0.03, 18).rotateX(Math.PI / 2)), M.hub()), 0, 0, 0.012));
      face.add(at(mesh(geo('hub-bar', () => new THREE.BoxGeometry(0.06, 0.26, 0.03)), M.dark()), 0, 0, 0.03));
    }
  }
  return g;
}

function buildArm(id, s) {
  const pivot = new THREE.Group(); pivot.position.set(s * 0.52, 1.08, 0);
  pivot.add(mesh(geo('shoulder', () => new THREE.SphereGeometry(0.09, 12, 10)), M.metal()));
  if (id === 'arms-spring') {
    const coil = geo('coil', () => {
      const pts = []; for (let i = 0; i <= 80; i++) { const t = i / 80, a = t * Math.PI * 2 * 5; pts.push(new THREE.Vector3(Math.cos(a) * 0.075, -t * 0.42, Math.sin(a) * 0.075)); }
      return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 100, 0.022, 6);
    });
    pivot.add(mesh(coil, M.gold()));
    pivot.add(at(mesh(geo('fist', () => new THREE.SphereGeometry(0.11, 14, 10)), M.petal()), 0, -0.52, 0));
  } else if (id === 'arms-claw') {
    pivot.add(at(mesh(geo('claw-arm', () => new THREE.CylinderGeometry(0.055, 0.055, 0.34, 10)), M.metal()), 0, -0.17, 0));
    pivot.add(at(mesh(geo('claw-wrist', () => new THREE.BoxGeometry(0.2, 0.07, 0.1)), M.dark()), 0, -0.36, 0));
    for (const k of [-1, 1]) {
      const pr = new THREE.Group(); pr.position.set(k * 0.085, -0.38, 0); pr.rotation.z = -k * 0.4;
      pr.add(at(mesh(geo('claw-prong', () => new THREE.BoxGeometry(0.05, 0.22, 0.07)), mat('claw', { color: 0xef4444, metalness: 0.3 })), 0, -0.11, 0));
      const tip = at(mesh(geo('claw-tip', () => new THREE.BoxGeometry(0.05, 0.09, 0.07)), mat('claw', { color: 0xef4444 })), -k * 0.035, -0.255, 0); tip.rotation.z = k * 0.7; pr.add(tip);
      pivot.add(pr);
    }
  } else { // basic
    pivot.add(at(mesh(geo('arm', () => new THREE.CylinderGeometry(0.055, 0.055, 0.4, 10)), M.metal()), 0, -0.2, 0));
    pivot.add(at(mesh(geo('hand', () => new THREE.SphereGeometry(0.1, 14, 10)), M.hub()), 0, -0.46, 0));
  }
  pivot.rotation.z = s * ARM_REST;
  pivot.userData.s = s;
  return pivot;
}
const ARM_REST = 0.2;

const faceTex = (key, draw) => tex('face-' + key, 256, 160, draw);
const FACE = {
  basic: () => faceTex('basic', (g, w, h) => {
    g.fillStyle = '#fff'; for (const x of [78, 178]) { g.beginPath(); g.ellipse(x, 66, 30, 34, 0, 0, 7); g.fill(); }
    g.fillStyle = '#111827'; for (const x of [82, 174]) { g.beginPath(); g.arc(x, 72, 16, 0, 7); g.fill(); }
    g.fillStyle = '#fff'; for (const x of [88, 180]) { g.beginPath(); g.arc(x, 64, 5, 0, 7); g.fill(); }
    g.strokeStyle = '#111827'; g.lineWidth = 9; g.lineCap = 'round'; g.beginPath(); g.arc(128, 96, 36, 0.25, Math.PI - 0.25); g.stroke();
    g.fillStyle = 'rgba(244,114,182,.7)'; for (const x of [30, 226]) { g.beginPath(); g.ellipse(x, 106, 16, 10, 0, 0, 7); g.fill(); }
  }),
  tv: () => faceTex('tv', (g, w, h) => {
    g.fillStyle = '#052e16'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#4ade80'; g.lineWidth = 11; g.lineCap = 'round';
    for (const x of [78, 178]) { g.beginPath(); g.arc(x, 76, 24, Math.PI * 1.1, Math.PI * 1.9); g.stroke(); }
    g.beginPath(); g.arc(128, 90, 40, 0.3, Math.PI - 0.3); g.stroke();
    g.fillStyle = 'rgba(74,222,128,.12)'; for (let y = 0; y < h; y += 8) g.fillRect(0, y, w, 3);
  }),
};
const HEAD_TOP = { 'head-basic': 0.6, 'head-tv': 0.68, 'head-dome': 0.52 };

function buildHead(id, paint) {
  const g = new THREE.Group();
  if (id === 'head-tv') {
    g.add(at(mesh(geo('tv', () => roundedBox(0.86, 0.68, 0.52, 0.09)), M.dark()), 0, 0.34, 0));
    const scr = mesh(geo('tv-screen', () => new THREE.PlaneGeometry(0.68, 0.5)), mat('tv-screen', { map: FACE.tv(), emissiveMap: FACE.tv(), emissive: 0xffffff, emissiveIntensity: 0.6 }));
    g.add(at(scr, 0, 0.35, 0.262));
    for (const [x, y] of [[0.36, 0.1], [0.36, 0.2]]) g.add(at(mesh(geo('knob', () => new THREE.CylinderGeometry(0.03, 0.03, 0.04, 10).rotateZ(Math.PI / 2)), M.gold()), x + 0.07, y + 0.3, 0));
  } else if (id === 'head-dome') {
    g.add(at(mesh(geo('dome-base', () => new THREE.CylinderGeometry(0.42, 0.44, 0.12, 28)), M.metal()), 0, 0.06, 0));
    g.add(at(mesh(geo('dome-inner', () => new THREE.SphereGeometry(0.25, 20, 14)), mat('dome-inner', { color: 0xfde68a })), 0, 0.37, 0));
    for (const x of [-0.1, 0.1]) g.add(at(mesh(geo('dome-eye', () => new THREE.SphereGeometry(0.045, 10, 8)), mat('eye', { color: 0x111827 })), x, 0.42, 0.22));
    const sm = at(mesh(geo('dome-smile', () => new THREE.TorusGeometry(0.07, 0.014, 6, 14, Math.PI)), mat('eye', { color: 0x111827 })), 0, 0.33, 0.235); sm.rotation.z = Math.PI; g.add(sm);
    g.add(at(mesh(geo('dome-glass', () => new THREE.SphereGeometry(0.42, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2)), mat('dome-glass', { color: 0xbae6fd, transparent: true, opacity: 0.38, roughness: 0.05, depthWrite: false })), 0, 0.12, 0));
  } else {
    g.add(at(mesh(geo('head', () => roundedBox(0.76, 0.6, 0.6, 0.14)), M.paint(paint)), 0, 0.3, 0));
    g.add(at(mesh(geo('face-plane', () => new THREE.PlaneGeometry(0.58, 0.36)), mat('face-basic', { map: FACE.basic(), transparent: true, roughness: 0.8 })), 0, 0.3, 0.301));
  }
  return g;
}

function buildAntenna(id, headId) {
  if (id !== 'antenna-zigzag') return null;
  const g = at(new THREE.Group(), 0, 1.18 + (HEAD_TOP[headId] || 0.6), 0), m = M.metal();
  const pts = [[0, 0, 0], [0, 0.12, 0], [0.1, 0.22, 0], [-0.1, 0.32, 0], [0.1, 0.42, 0], [0, 0.52, 0]];
  for (let i = 0; i < pts.length - 1; i++) g.add(stick(pts[i], pts[i + 1], 0.02, m));
  for (const p of pts.slice(1, -1)) g.add(at(mesh(geo('ant-joint', () => new THREE.SphereGeometry(0.026, 8, 6)), m), ...p));
  g.add(at(mesh(geo('ant-tip', () => new THREE.SphereGeometry(0.075, 14, 10)), M.glow()), 0, 0.56, 0));
  return g;
}

function buildBadge(id) {
  if (id !== 'badge-gold') return null;
  const g = at(new THREE.Group(), 0.0, 0.96, 0.36);
  g.add(mesh(geo('badge-disc', () => new THREE.CylinderGeometry(0.12, 0.12, 0.025, 24).rotateX(Math.PI / 2)), M.gold()));
  g.add(at(mesh(geo('badge-star', () => new THREE.ExtrudeGeometry(starShape(0.09, 0.04), { depth: 0.02, bevelEnabled: false })), mat('badge-star', { color: 0xdc2626 })), 0, 0, 0.013));
  for (const k of [-1, 1]) { const t = at(mesh(geo('badge-tail', () => new THREE.BoxGeometry(0.06, 0.12, 0.012)), mat('badge-tail', { color: 0xdc2626 })), k * 0.05, -0.15, -0.002); t.rotation.z = k * 0.22; g.add(t); }
  return g;
}

/** The child's robot. config = { wheels, head, arms, antenna, paint, badge } (missing slots use BASIC_PART). */
export function makeRobot(config = {}) {
  const cfg = { ...BASIC_PART }; for (const s of SLOTS) if (config[s] && PART_INFO[config[s]]) cfg[s] = config[s];
  const root = new THREE.Group(), rig = new THREE.Group(), slots = {}, ref = { armL: null, armR: null, spins: [], pending: 0 };
  root.add(rig);

  // fixed parts: body, neck, chest lights
  const bodyMesh = mesh(geo('body', () => roundedBox(0.9, 0.7, 0.7, 0.14)), M.paint(cfg.paint)); bodyMesh.position.y = 0.8;
  rig.add(bodyMesh);
  rig.add(at(mesh(geo('neck', () => new THREE.CylinderGeometry(0.1, 0.12, 0.1, 12)), M.metal()), 0, 1.17, 0));
  [0xef4444, 0xfacc15, 0x22c55e].forEach((c, i) => rig.add(at(mesh(geo('light', () => new THREE.SphereGeometry(0.04, 10, 8)), mat('light' + i, { color: c, emissive: c, emissiveIntensity: 0.5 })), (i - 1) * 0.13, 0.62, 0.352)));

  const put = (slot, g) => { if (slots[slot]) rig.remove(slots[slot]); slots[slot] = g; if (g) rig.add(g); };
  function rebuild(slot) {
    if (slot === 'wheels') { const g = buildWheels(cfg.wheels); ref.spins = g.userData.spins; put('wheels', g); }
    else if (slot === 'head') { const g = at(buildHead(cfg.head, cfg.paint), 0, 1.2, 0); put('head', g); rebuild('antenna'); }
    else if (slot === 'arms') { const g = new THREE.Group(), l = buildArm(cfg.arms, -1), r = buildArm(cfg.arms, 1); g.add(l, r); ref.armL = l; ref.armR = r; put('arms', g); }
    else if (slot === 'antenna') put('antenna', buildAntenna(cfg.antenna, cfg.head));
    else if (slot === 'badge') put('badge', buildBadge(cfg.badge));
    else if (slot === 'paint') { bodyMesh.material = M.paint(cfg.paint); rebuild('head'); }
  }
  for (const s of ['wheels', 'head', 'arms', 'badge', 'antenna']) rebuild(s);

  const T = (target, to, ms, ease = 'outCubic') => tween(target, to, { ms, ease });
  const hopUp = (h, ms) => T(rig.position, { y: h }, ms * 0.45, 'outCubic').then(() => T(rig.position, { y: 0 }, ms * 0.55, 'outBounce'));

  async function walkTo(x, z) {
    const dx = x - root.position.x, dz = z - root.position.z, dist = Math.hypot(dx, dz);
    if (dist < 0.01) return;
    let d = Math.atan2(dx, dz) - root.rotation.y; d = ((d + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI; // shortest turn
    await T(root.rotation, { y: root.rotation.y + d }, 140 + Math.abs(d) * 110, 'inOutCubic');
    let moving = true;
    const bob = (async () => { while (moving) { await T(rig.position, { y: 0.07 }, 150, 'outCubic'); await T(rig.position, { y: 0 }, 150, 'outCubic'); } })();
    const ms = (dist / 2) * 1000; // 2 units per second
    await Promise.all([T(root.position, { x, z }, ms, 'linear'), ...ref.spins.map(s => T(s.rotation, { x: s.rotation.x + dist / R.wheel }, ms, 'linear'))]);
    moving = false; await bob; rig.position.y = 0;
  }

  async function wave() {
    const a = ref.armR, up = 2.5;
    await T(a.rotation, { z: up }, 200, 'outBack');
    for (let i = 0; i < 3; i++) { await T(a.rotation, { z: up - 0.35 }, 110, 'inOutCubic'); await T(a.rotation, { z: up + 0.2 }, 110, 'inOutCubic'); }
    await T(a.rotation, { z: ARM_REST }, 200);
  }

  async function hop() {
    await Promise.all([hopUp(0.5, 480), T(rig.scale, { x: 0.94, y: 1.1, z: 0.94 }, 160)]);
    await T(rig.scale, { x: 1.1, y: 0.88, z: 1.1 }, 70);
    await T(rig.scale, { x: 1, y: 1, z: 1 }, 110, 'outBack');
  }

  async function dance() {
    const L = ref.armL, Rr = ref.armR;
    for (let i = 0; i < 5; i++) {
      const k = i % 2 ? 1 : -1;
      await Promise.all([
        T(rig.rotation, { y: k * 0.45, z: -k * 0.07 }, 260, 'inOutCubic'),
        hopUp(0.16, 260),
        T(L.rotation, { z: k > 0 ? -2.3 : -ARM_REST }, 260, 'outBack'),
        T(Rr.rotation, { z: k > 0 ? ARM_REST : 2.3 }, 260, 'outBack'),
      ]);
    }
    await Promise.all([T(rig.rotation, { y: 0, z: 0 }, 160), T(L.rotation, { z: -ARM_REST }, 160), T(Rr.rotation, { z: ARM_REST }, 160)]);
  }

  root.userData = {
    robot: true,
    setPart(slot, partId) {
      if (!SLOTS.includes(slot)) return;
      cfg[slot] = PART_INFO[partId] ? partId : BASIC_PART[slot];
      rebuild(slot);
    },
    walkTo, dance, wave, hop,
  };
  return root;
}

// ====================================================================== boss build robot
const SIGN = () => tex('sign', 128, 128, (g, w) => {
  g.fillStyle = '#fde047'; g.fillRect(0, 0, w, w); g.strokeStyle = '#1f2937'; g.lineWidth = 8; g.strokeRect(4, 4, w - 8, w - 8);
  g.fillStyle = '#1f2937'; g.font = 'bold 96px system-ui,sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('?', w / 2, w / 2 + 6);
});

/** Direction of the main cylinder / cone axis inside a freshly made solid (null when it cannot be told). */
function axisOf(solid) {
  solid.updateMatrixWorld(true);
  let dir = null;
  solid.traverse(o => {
    if (dir || !o.isMesh) return;
    if (o.geometry.type === 'CylinderGeometry' || o.geometry.type === 'ConeGeometry') dir = new THREE.Vector3(0, 1, 0).transformDirection(o.matrixWorld);
  });
  return dir;
}

const box3 = o => { o.updateMatrixWorld(true); return new THREE.Box3().setFromObject(o); };

/** Scale a tile / object uniformly so its widest side = size; re-centre it in x / z. Returns its height. */
function normalise(o, size) {
  let b = box3(o); const k = size / Math.max(b.max.x - b.min.x, b.max.z - b.min.z, 1e-6);
  o.scale.multiplyScalar(k); b = box3(o);
  o.position.x -= (b.max.x + b.min.x) / 2; o.position.z -= (b.max.z + b.min.z) / 2;
  return b.max.y - b.min.y;
}

/**
 * Boss robot: wheels (x2, lying on their side when the solid can), body, head, and a window tile on the body.
 * It faces the camera (+z) and drives to the right (+x). userData.drive(fail) plays the scripted run for a checkBuild
 * fail code (null = success, the robot drives off to the right). Optional: { rng } for the colours.
 */
export function makeBuildRobot(build, { rng = Math.random } = {}) {
  const cols = shuffle(TOY_COLORS, rng);
  const root = new THREE.Group(), rig = new THREE.Group(), stack = new THREE.Group();
  root.add(rig); rig.add(stack);

  // --- wheels: two, at the front and the back, axle along z so the camera sees the discs
  const wheelFam = familyOf(build.wheels), wheelPose = posesOf(build.wheels).includes('side') ? 'side' : 'upright';
  const wheelMounts = [], wheelSpins = [];
  for (const s of [-1, 1]) {
    const solid = Solids.makeSolid(build.wheels, { color: cols[0], face: false, pose: wheelPose });
    const ax = axisOf(solid), fix = new THREE.Group();
    fix.add(solid);
    if (wheelPose === 'side' && ax && Math.abs(ax.x) > Math.abs(ax.z)) fix.rotation.y = Math.PI / 2; // turn the axis to z
    fix.scale.setScalar(0.72);
    const spin = new THREE.Group(); spin.add(fix);
    const mount = new THREE.Group(); mount.add(spin); stack.add(mount);
    const b = box3(mount); mount.position.set(s * 0.46, -b.min.y, 0); // bottom on the ground
    wheelMounts.push(mount); wheelSpins.push(spin);
  }
  const wheelR = box3(wheelMounts[0]).max.y / 2;
  stack.add(at(mesh(geo('chassis', () => new THREE.BoxGeometry(1.1, 0.1, 0.3)), M.dark()), 0, 0.6, 0));

  // --- body
  const bodyFam = familyOf(build.body);
  const bodyG = new THREE.Group(); bodyG.add(Solids.makeSolid(build.body, { color: cols[1], face: false }));
  stack.add(bodyG); { const b = box3(bodyG); bodyG.position.y = 0.65 - b.min.y; }
  const bodyBox = box3(bodyG), bodyH = bodyBox.max.y - bodyBox.min.y;

  // --- head
  const headG = new THREE.Group(); headG.add(Solids.makeSolid(build.head, { color: cols[2], face: true }));
  headG.scale.setScalar(0.74); stack.add(headG);
  { const b = box3(headG); headG.position.y = bodyBox.max.y - b.min.y; }
  const headBox = box3(headG), headR = (headBox.max.x - headBox.min.x) / 2, headSphere = familyOf(build.head) === 'sphere';

  // --- window tile on the body front, following the surface (flat, slanted for a pyramid / cone, curved for the rest)
  const winSize = bodyFam === 'pyramid' || bodyFam === 'cone' ? 0.34 : 0.44;
  const yc = bodyBox.min.y + bodyH * (bodyFam === 'pyramid' || bodyFam === 'cone' ? 0.33 : 0.5);
  const hit = new THREE.Raycaster(new THREE.Vector3(0, yc, 3), new THREE.Vector3(0, 0, -1)).intersectObject(bodyG, true)[0];
  const P = hit ? hit.point.clone() : new THREE.Vector3(0, yc, 0.5);
  const N = hit && hit.face ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld) : new THREE.Vector3(0, 0, 1);
  if (N.z < 0.2) N.set(0, 0, 1);
  const mountAt = () => {
    const m = new THREE.Group(), tilt = new THREE.Group();
    m.position.copy(P); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), N); m.rotation.setFromQuaternion(m.quaternion);
    tilt.rotation.x = Math.PI / 2; m.add(tilt); return { m, tilt };
  };
  const win = mountAt(); const winTile = Tiles.makeTile(build.panel, { color: cols[3], size: 1, thickness: 0.12 });
  normalise(winTile, winSize); win.tilt.add(winTile); stack.add(win.m);

  // --- a little waving arm, near the top of the body on the right
  const armY = bodyBox.max.y - 0.2;
  const armHit = new THREE.Raycaster(new THREE.Vector3(3, armY, 0), new THREE.Vector3(-1, 0, 0)).intersectObject(bodyG, true)[0];
  const arm = new THREE.Group(); arm.position.set((armHit ? armHit.point.x : 0.4) - 0.1, armY, 0);
  arm.add(mesh(geo('b-shoulder', () => new THREE.SphereGeometry(0.07, 10, 8)), M.metal()));
  arm.add(at(mesh(geo('b-arm', () => new THREE.CylinderGeometry(0.042, 0.042, 0.46, 8)), M.metal()), 0, -0.23, 0));
  arm.add(at(mesh(geo('b-hand', () => new THREE.SphereGeometry(0.085, 12, 8)), M.hub()), 0, -0.5, 0));
  const ARM0 = 0.5; arm.rotation.z = ARM0; stack.add(arm);

  // --- pivot the whole thing about its vertical centre so flips stay above the ground
  const all = box3(stack), cY = (all.min.y + all.max.y) / 2;
  stack.position.y = -cY; rig.position.y = cY;

  // ---------------------------------------------------------------- animation
  const T = (target, to, ms, ease = 'outCubic') => tween(target, to, { ms, ease });
  const par = Promise.all.bind(Promise);
  const mood = m => { if (Solids.setMood) Solids.setMood(headG.children[0], m); };
  const hopY = (h, ms) => T(rig.position, { y: cY + h }, ms * 0.45, 'outCubic').then(() => T(rig.position, { y: cY }, ms * 0.55, 'outBounce'));
  const spin = (a, ms, ease = 'linear') => par(wheelSpins.map(w => T(w.rotation, { z: w.rotation.z + a }, ms, ease))); // negative = rolling right
  const rollBy = (dx, ms, ease) => spin(-dx / wheelR, ms, ease);
  const squash = ms => T(rig.scale, { x: 1.1, y: 0.9, z: 1.1 }, ms / 2).then(() => T(rig.scale, { x: 1, y: 1, z: 1 }, ms / 2, 'outBack'));
  const wave = async () => {
    await T(arm.rotation, { z: 2.5 }, 140, 'outBack');
    for (let i = 0; i < 2; i++) { await T(arm.rotation, { z: 2.15 }, 80, 'inOutCubic'); await T(arm.rotation, { z: 2.7 }, 80, 'inOutCubic'); }
    await T(arm.rotation, { z: ARM0 }, 140);
  };

  const parts = [rig, headG, bodyG, win.m, win.tilt, arm, ...wheelMounts, ...wheelSpins];
  const homes = parts.map(o => [o, o.position.clone(), o.rotation.clone(), o.scale.clone()]);
  const extras = new Set();
  let current = 0, started = false;
  function reset() {
    for (const [o, p, r, s] of homes) { cancelTweens(o.position); cancelTweens(o.rotation); cancelTweens(o.scale); o.position.copy(p); o.rotation.copy(r); o.scale.copy(s); }
    cancelTweens(root.position); cancelTweens(root.rotation);
    root.rotation.set(0, 0, 0);
    for (const x of extras) { x.parent && x.parent.remove(x); if (x.userData.own) disposeTree(x); }
    extras.clear(); mood('normal');
  }
  const run = async (id, steps) => { for (const s of steps) { if (id !== current) return false; await s(); } return id === current; };

  function drive(fail = null, opts = {}) {
    const id = ++current; reset();
    const x0 = root.position.x, z0 = root.position.z;
    const pxz = (x, z) => ({ x, z });
    const steps = [];
    const fin = async () => { root.rotation.set(0, 0, 0); rig.rotation.set(0, 0, 0); rig.position.y = cY; mood('normal'); };

    if (fail === null) {
      steps.push(() => { mood('happy'); return par([T(root.position, { x: x0 + 9 }, 1700, 'inOutCubic'), rollBy(9, 1700, 'inOutCubic'), hopY(0.07, 300).then(() => hopY(0.07, 300)).then(() => hopY(0.07, 300))]); });
    } else if (fail === 'wheels-flat') {
      for (const k of [1, 2]) steps.push(() => par([T(root.position, { x: x0 + 0.3 * k }, 230, 'linear'), hopY(0.14, 230), rollBy(0.15, 230)]));
      steps.push(() => { mood('oops'); return par([T(root.position, { x: x0 + 1.1 }, 380), T(rig.rotation, { z: -Math.PI }, 380), hopY(0.5, 380)]); });
      steps.push(() => par([spin(-7, 280), T(rig.rotation, { x: 0.1 }, 140).then(() => T(rig.rotation, { x: -0.1 }, 140))]));
      steps.push(() => { mood('normal'); return par([T(root.position, { x: x0 + 1.0 }, 320), T(rig.rotation, { z: -2 * Math.PI, x: 0 }, 320), hopY(0.45, 320)]); });
      steps.push(() => squash(100), fin, wave);
    } else if (fail === 'wheels-sphere') {
      steps.push(() => par([T(root.position, { x: x0 + 0.4 }, 220, 'linear'), rollBy(0.4, 220)]));
      steps.push(() => { mood('oops'); return par([T(root.position, pxz(x0 + 0.75, z0 + 1.1), 420, 'inOutCubic'), T(root.rotation, { y: -0.35 }, 420), spin(-5, 420)]); });
      steps.push(() => par([T(rig.rotation, { x: 0.5 }, 200), T(rig.position, { y: cY - 0.12 }, 200)]));
      steps.push(() => T(rig.rotation, { x: -0.3 }, 110, 'inOutCubic').then(() => T(rig.rotation, { x: 0.25 }, 110, 'inOutCubic')).then(() => T(rig.rotation, { x: 0 }, 110, 'inOutCubic')));
      steps.push(() => { mood('normal'); return par([T(root.position, pxz(x0 + 0.2, z0), 420, 'inOutCubic'), T(root.rotation, { y: 0 }, 420, 'inOutCubic'), T(rig.position, { y: cY }, 420), spin(2, 420)]); });
      steps.push(fin, wave);
    } else if (fail === 'wheels-cone') {
      const Rr = 0.62, circle = { _a: 0, get a() { return this._a; }, set a(v) { this._a = v; root.position.x = x0 + Rr * Math.sin(v); root.position.z = z0 - Rr + Rr * Math.cos(v); root.rotation.y = v; } };
      steps.push(() => par([T(circle, { a: Math.PI * 4 }, 1150, 'inOutCubic'), spin(-14, 1150, 'inOutCubic')]));
      steps.push(() => { root.rotation.y = 0; root.position.set(x0, root.position.y, z0); mood('dizzy'); return par([T(headG.rotation, { y: Math.PI * 2 }, 420, 'outCubic'), T(rig.rotation, { z: 0.1 }, 140).then(() => T(rig.rotation, { z: -0.1 }, 140)).then(() => T(rig.rotation, { z: 0 }, 140))]); });
      steps.push(() => { headG.rotation.y = 0; return Promise.resolve(); }, fin, wave);
    } else if (fail === 'body-top') {
      const dx = -(bodyBox.max.x + headR * 0.9) + 0.0, hb = headBox.min.y, h0 = headG.position;
      steps.push(() => par([T(root.position, { x: x0 + 0.5 }, 300, 'inOutCubic'), rollBy(0.5, 300, 'inOutCubic')]));
      steps.push(() => { mood('oops'); return T(headG.rotation, { z: -0.3 }, 140); });
      steps.push(() => par([T(headG.position, { x: h0.x + dx }, 520, 'outCubic'), T(headG.position, { y: h0.y - hb }, 520, 'outBounce'), T(headG.rotation, { z: headSphere ? -dx / headR : 0 }, 520, 'outCubic')]));
      steps.push(() => T(rig.rotation, { z: 0.1 }, 90).then(() => T(rig.rotation, { z: -0.1 }, 90)).then(() => T(rig.rotation, { z: 0 }, 90)));
      steps.push(fin, wave);
    } else if (fail === 'head-rolls') {
      const dx = -(bodyBox.max.x + headR * 0.9), hb = headBox.min.y, h0 = headG.position;
      steps.push(() => par([T(root.position, { x: x0 + 0.55 }, 280, 'inOutCubic'), rollBy(0.55, 280, 'inOutCubic')]));
      steps.push(() => T(headG.position, { x: h0.x + 0.07 }, 80).then(() => T(headG.position, { x: h0.x - 0.07 }, 80)));
      steps.push(() => { mood('oops'); return par([T(headG.position, { x: h0.x + dx }, 380, 'outCubic'), T(headG.position, { y: h0.y - hb }, 380, 'outBounce'), T(headG.rotation, { z: -dx / headR }, 380, 'outCubic')]); });
      steps.push(() => par([T(headG.position, { x: h0.x + dx - 1.7, z: 0.35 }, 560, 'outCubic'), T(headG.rotation, { z: -(dx - 1.7) / headR }, 560, 'outCubic')]));
      steps.push(() => T(rig.rotation, { z: 0.1 }, 90).then(() => T(rig.rotation, { z: -0.1 }, 90)));
      steps.push(fin, wave);
    } else if (fail === 'head-wrong') {
      const sign = new THREE.Group(); sign.userData.own = false; extras.add(sign);
      sign.add(at(mesh(geo('sign-post', () => new THREE.CylinderGeometry(0.03, 0.03, 0.9, 8)), M.metal()), 0, 0.45, 0));
      const board = at(mesh(geo('sign-board', () => new THREE.BoxGeometry(0.7, 0.7, 0.05)), [M.metal(), M.metal(), M.metal(), M.metal(), mat('sign', { map: SIGN() }), M.metal()]), 0, 1.0, 0); sign.add(board);
      if (opts.sign && opts.sign.isObject3D) { normalise(opts.sign, 0.5); opts.sign.position.set(0, 1.0, 0.04); sign.add(opts.sign); }
      sign.position.set(1.45, 0, -0.55); sign.scale.setScalar(0.001); root.add(sign); // child of root; slid back so it stays put in the world
      const hx = headG.position.x;
      steps.push(() => par([T(root.position, { x: x0 + 0.85 }, 520, 'inOutCubic'), T(sign.position, { x: 0.6 }, 520, 'inOutCubic'), rollBy(0.85, 520, 'inOutCubic'), T(sign.scale, { x: 1, y: 1, z: 1 }, 300, 'outBack')]));
      steps.push(() => T(rig.rotation, { z: -0.06 }, 70).then(() => T(rig.rotation, { z: 0 }, 70)));
      steps.push(() => { mood('oops'); return par([T(headG.rotation, { z: -0.28 }, 150), T(headG.position, { x: hx + 0.1 }, 150), T(arm.rotation, { z: 2.9 }, 200, 'outBack')]); });
      steps.push(async () => { for (let i = 0; i < 3; i++) { await T(arm.rotation, { z: 2.65 }, 80, 'inOutCubic'); await T(arm.rotation, { z: 3.0 }, 80, 'inOutCubic'); } });
      steps.push(() => par([T(headG.rotation, { z: 0 }, 140), T(headG.position, { x: hx }, 140), T(arm.rotation, { z: ARM0 }, 140)]));
      steps.push(fin, wave);
    } else if (fail === 'panel') {
      const holes = TILE_TEMPLATES.filter(t => !t.circle && t.id !== build.panel && t.sides !== templateById(build.panel).sides);
      const hole = mountAt(), ht = Tiles.makeTile((holes.find(t => t.sides === 6) || holes[0]).id, { color: 0x1e293b, size: 1, thickness: 0.02 });
      normalise(ht, winSize * 1.3); hole.tilt.add(ht); hole.m.userData.own = true; hole.m.position.addScaledVector(N, 0.01); stack.add(hole.m); extras.add(hole.m);
      const wp = win.m.position, floorY = 0.07;
      steps.push(() => par([T(root.position, { x: x0 + 0.6 }, 350, 'inOutCubic'), rollBy(0.6, 350, 'inOutCubic')]));
      steps.push(async () => { for (let i = 0; i < 3; i++) { await T(win.tilt.rotation, { y: 0.28 }, 35); await T(win.tilt.rotation, { y: -0.28 }, 35); } await T(win.tilt.rotation, { y: 0 }, 20); });
      steps.push(() => { mood('oops'); return par([T(win.m.position, { x: wp.x + 0.3, y: wp.y + 0.75, z: wp.z + 1.0 }, 420, 'outCubic'), T(win.tilt.rotation, { y: Math.PI * 4 }, 420), T(win.tilt.rotation, { x: 0 }, 420)]); });
      steps.push(() => T(win.m.position, { x: wp.x + 0.45, y: floorY, z: wp.z + 1.35 }, 280, 'outBounce'));
      steps.push(fin, wave);
    } else {
      steps.push(fin, wave);
    }
    return run(id, steps).then(ok => { if (ok) { fin(); } return ok; });
  }

  root.userData = { buildRobot: true, build: { ...build }, drive };
  return root;
}
