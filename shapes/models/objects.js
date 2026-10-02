// Everyday objects for A4 / Rush 3-D: primitives + canvas textures, no photos, no brands.
// Every object sits in a 1x1x1 box centred on the origin (the globe's little stand hangs below that box)
// and is clearly one family's shape: its main body is the cylinder / sphere / cone / prism / pyramid.
import * as THREE from 'three';
import { OBJECTS } from '../../shapes-logic.js?v=0';

// ---- shared caches: geometries, materials and textures are built once and never disposed (userData.shared) ----
const cache = new Map();
function memo(key, make) {
  let v = cache.get(key);
  if (!v) { v = make(); v.userData.shared = true; cache.set(key, v); }
  return v;
}
const geo = (key, make) => memo('g:' + key, make);
const tex = (key, w, h, draw) => memo('t:' + key, () => {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
});
const mat = (key, params) => memo('m:' + key, () => new THREE.MeshStandardMaterial({ roughness: 0.65, metalness: 0, ...params }));
const texMat = (key, t, params = {}) => mat(key, { map: t, ...params });
// Not theme FONT: that stack leads with Latin handwriting fonts; the can label is canvas text and must resolve to a CJK face first.
const FONT = '"PingFang TC","Microsoft JhengHei",system-ui,sans-serif';

const mesh = (g, m) => new THREE.Mesh(g, m);
function at(o, x = 0, y = 0, z = 0) { o.position.set(x, y, z); return o; }

// Cylinder / cone texture seam: turn the geometry so u = 0.5 faces the camera (+z).
const faceFront = g => { g.rotateY(Math.PI); return g; };

// ---- flat-faced polyhedra: faces [{ v:[[x,y,z]..], uv:[[u,v]..], m }], wound outward automatically ----
function polyGeo(faces, centre = [0, 0, 0]) {
  const pos = [], uvs = [], g = new THREE.BufferGeometry();
  const mats = [...new Set(faces.map(f => f.m))].sort((a, b) => a - b);
  const N = new THREE.Vector3(), C = new THREE.Vector3(), E1 = new THREE.Vector3(), E2 = new THREE.Vector3(), Q = new THREE.Vector3();
  let start = 0;
  for (const m of mats) {
    let count = 0;
    for (const f of faces.filter(x => x.m === m)) {
      const v = f.v.slice(), uv = f.uv.slice();
      E1.fromArray(v[1]).sub(Q.fromArray(v[0])); E2.fromArray(v[2]).sub(Q); N.copy(E1).cross(E2); // (v1-v0) x (v2-v0)
      C.set(0, 0, 0); v.forEach(p => C.add(Q.fromArray(p))); C.divideScalar(v.length).sub(Q.fromArray(centre));
      if (N.dot(C) < 0) { v.reverse(); uv.reverse(); }
      for (let i = 1; i < v.length - 1; i++) for (const k of [0, i, i + 1]) { pos.push(...v[k]); uvs.push(...uv[k]); count += 1; }
    }
    g.addGroup(start, count, m); start += count;
  }
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.computeVertexNormals();
  return g;
}

// Shift a group's children so its bounding box is centred on the origin.
function recentre(g) {
  const c = new THREE.Box3().setFromObject(g).getCenter(new THREE.Vector3());
  g.children.forEach(o => o.position.sub(c));
  return g;
}

// =================================== the twelve objects ===================================
const BUILD = {
  // ---- cylinders ----
  can() {
    const side = tex('can-side', 512, 256, (g, w, h) => {
      const s = g.createLinearGradient(0, 0, w, 0);
      s.addColorStop(0, '#cbd5e1'); s.addColorStop(0.5, '#f8fafc'); s.addColorStop(1, '#cbd5e1');
      g.fillStyle = s; g.fillRect(0, 0, w, h);
      g.fillStyle = '#ef4444'; g.fillRect(0, 56, w, 150);
      g.fillStyle = '#fde047'; g.fillRect(0, 56, w, 10); g.fillRect(0, 196, w, 10);
      g.fillStyle = '#fff'; g.beginPath(); g.moveTo(0, 150);
      for (let x = 0; x <= w; x += 8) g.lineTo(x, 150 + Math.sin(x / 40 + 1) * 14);
      g.lineTo(w, 166); for (let x = w; x >= 0; x -= 8) g.lineTo(x, 166 + Math.sin(x / 40 + 1) * 14); g.fill();
      for (const [x, y, r] of [[170, 100, 9], [200, 124, 6], [330, 98, 7], [352, 128, 10], [300, 180, 6], [210, 182, 8]]) { g.beginPath(); g.arc(x, y, r, 0, 7); g.fillStyle = 'rgba(255,255,255,.85)'; g.fill(); }
      g.fillStyle = '#fff'; g.font = `bold 54px ${FONT}`; g.textAlign = 'center'; g.fillText('汽水', w / 2, 118);
    });
    const metal = mat('can-metal', { color: 0xe2e8f0, metalness: 0.5, roughness: 0.35 });
    const g = new THREE.Group();
    g.add(mesh(geo('can', () => faceFront(new THREE.CylinderGeometry(0.31, 0.31, 0.94, 40))), [texMat('can-side', side, { roughness: 0.35, metalness: 0.2 }), metal, metal]));
    const rim = at(mesh(geo('can-rim', () => new THREE.TorusGeometry(0.285, 0.022, 8, 40)), metal), 0, 0.47, 0); rim.rotation.x = Math.PI / 2; g.add(rim);
    const ring = at(mesh(geo('can-pull', () => new THREE.TorusGeometry(0.07, 0.016, 8, 20)), metal), 0.07, 0.49, 0.1); ring.rotation.x = Math.PI / 2; g.add(ring);
    g.add(at(mesh(geo('can-tab', () => new THREE.BoxGeometry(0.16, 0.014, 0.1)), metal), -0.04, 0.485, 0));
    return g;
  },

  drum() {
    const side = tex('drum-side', 512, 256, (g, w, h) => {
      g.fillStyle = '#2563eb'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#e2e8f0'; g.fillRect(0, 0, w, 26); g.fillRect(0, h - 26, w, 26);
      g.fillStyle = '#94a3b8'; g.fillRect(0, 26, w, 5); g.fillRect(0, h - 31, w, 5);
      g.strokeStyle = '#fef9c3'; g.lineWidth = 7; g.lineJoin = 'round'; g.beginPath();
      for (let i = 0; i <= 16; i++) { const x = (i / 16) * w; g.lineTo(x, i % 2 ? 40 : h - 40); } g.stroke();
      g.fillStyle = '#cbd5e1'; for (let i = 0; i < 16; i++) { g.beginPath(); g.arc((i + 0.5) * w / 16, i % 2 ? 40 : h - 40, 8, 0, 7); g.fill(); }
    });
    const skin = tex('drum-skin', 256, 256, (g, w) => {
      g.fillStyle = '#e2e8f0'; g.fillRect(0, 0, w, w);
      g.fillStyle = '#fefce8'; g.beginPath(); g.arc(w / 2, w / 2, w / 2 - 14, 0, 7); g.fill();
      g.strokeStyle = '#cbd5e1'; g.lineWidth = 3; g.beginPath(); g.arc(w / 2, w / 2, w / 2 - 36, 0, 7); g.stroke();
    });
    const g = new THREE.Group();
    g.add(mesh(geo('drum', () => faceFront(new THREE.CylinderGeometry(0.48, 0.48, 0.58, 44))),
      [texMat('drum-side', side), texMat('drum-skin', skin, { roughness: 0.9 }), mat('drum-bottom', { color: 0x1e3a8a })]));
    const stickG = geo('stick', () => new THREE.CylinderGeometry(0.022, 0.022, 0.62, 10)), tip = geo('stick-tip', () => new THREE.SphereGeometry(0.04, 10, 8));
    const wood = mat('wood', { color: 0xd6a36a });
    for (const a of [0.55, -0.55]) {
      const s = new THREE.Group(); s.add(mesh(stickG, wood)); s.add(at(mesh(tip, wood), 0, 0.31, 0)); s.add(at(mesh(tip, wood), 0, -0.31, 0));
      s.rotation.x = Math.PI / 2; // lying flat on the skin
      const h = new THREE.Group(); h.add(s); h.rotation.y = a; h.position.y = 0.315; g.add(h);
    }
    return g;
  },

  // ---- spheres ----
  ball() {
    const t = tex('ball', 512, 256, (g, w, h) => {
      const cols = ['#ef4444', '#fff', '#3b82f6', '#fde047', '#fff', '#22c55e', '#f97316', '#fff'];
      const n = cols.length;
      for (let i = 0; i < n; i++) { g.fillStyle = cols[i]; g.fillRect(i * w / n, 0, w / n + 1, h); }
      g.fillStyle = '#fff'; g.fillRect(0, 0, w, 22); g.fillRect(0, h - 22, w, 22);
      g.fillStyle = 'rgba(0,0,0,.18)'; for (let i = 0; i < n; i++) g.fillRect(i * w / n, 0, 3, h);
    });
    return new THREE.Group().add(mesh(geo('sph', () => new THREE.SphereGeometry(0.5, 40, 28)), texMat('ball', t, { roughness: 0.35 })));
  },

  globe() {
    const t = tex('globe', 512, 256, (g, w, h) => {
      g.fillStyle = '#38a3e8'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#4ade80';
      const blob = (pts) => { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x * w, y * h) : g.moveTo(x * w, y * h))); g.closePath(); g.fill(); };
      blob([[.05, .22], [.14, .14], [.26, .16], [.3, .3], [.24, .42], [.16, .4], [.1, .32]]);
      blob([[.24, .55], [.3, .5], [.34, .62], [.31, .82], [.26, .78], [.24, .66]]);
      blob([[.46, .2], [.58, .14], [.7, .18], [.82, .24], [.78, .38], [.66, .36], [.56, .46], [.5, .4], [.47, .3]]);
      blob([[.52, .5], [.6, .48], [.64, .64], [.58, .76], [.53, .66]]);
      blob([[.78, .62], [.88, .6], [.9, .72], [.8, .74]]);
      g.fillStyle = '#f8fafc'; g.fillRect(0, 0, w, 14); g.fillRect(0, h - 16, w, 16);
      g.strokeStyle = 'rgba(255,255,255,.45)'; g.lineWidth = 1.5;
      for (let i = 1; i < 12; i++) { g.beginPath(); g.moveTo(i * w / 12, 0); g.lineTo(i * w / 12, h); g.stroke(); }
      for (let i = 1; i < 6; i++) { g.beginPath(); g.moveTo(0, i * h / 6); g.lineTo(w, i * h / 6); g.stroke(); }
    });
    const metal = mat('globe-metal', { color: 0x94a3b8, metalness: 0.6, roughness: 0.4 });
    const g = new THREE.Group();
    const ball = mesh(geo('sph', () => new THREE.SphereGeometry(0.5, 40, 28)), texMat('globe', t, { roughness: 0.4 }));
    ball.rotation.y = -0.6; g.add(ball);
    const arc = mesh(geo('globe-arc', () => new THREE.TorusGeometry(0.535, 0.016, 8, 48, Math.PI)), metal);
    const arcG = new THREE.Group(); arc.rotation.z = -Math.PI / 2; arcG.add(arc); arcG.rotation.y = -0.5; g.add(arcG);
    // the stand hangs below the 1x1x1 box; the sphere is the object
    g.add(at(mesh(geo('globe-stem', () => new THREE.CylinderGeometry(0.03, 0.03, 0.26, 10)), metal), 0, -0.6, 0));
    g.add(at(mesh(geo('globe-base', () => new THREE.CylinderGeometry(0.24, 0.27, 0.06, 28)), mat('globe-base', { color: 0x475569 })), 0, -0.75, 0));
    return g;
  },

  // ---- cones ----
  partyHat() {
    const t = tex('hat', 512, 256, (g, w, h) => {
      g.fillStyle = '#ec4899'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#fde047';
      for (let i = -4; i < 14; i++) { g.beginPath(); g.moveTo(i * 60, h); g.lineTo(i * 60 + 28, h); g.lineTo(i * 60 + 28 + 130, 0); g.lineTo(i * 60 + 130, 0); g.fill(); }
      g.fillStyle = '#fff'; for (const [x, y] of [[60, 200], [190, 150], [310, 205], [430, 160], [120, 90], [260, 70], [380, 100], [480, 60]]) { g.beginPath(); g.arc(x, y, 9, 0, 7); g.fill(); }
      g.fillStyle = '#22c55e'; g.fillRect(0, h - 26, w, 26);
      g.fillStyle = '#fff'; for (let i = 0; i < 16; i++) { g.beginPath(); g.arc(i * 32 + 16, h - 13, 5, 0, 7); g.fill(); }
    });
    const g = new THREE.Group();
    g.add(at(mesh(geo('hat', () => faceFront(new THREE.ConeGeometry(0.4, 0.86, 44))), [texMat('hat', t), mat('hat-base', { color: 0x9d174d })]), 0, -0.07, 0));
    g.add(at(mesh(geo('hat-pom', () => new THREE.SphereGeometry(0.1, 16, 12)), mat('hat-pom', { color: 0xfde047, roughness: 0.95 })), 0, 0.39, 0));
    return g;
  },

  trafficCone() {
    const t = tex('tcone', 256, 256, (g, w, h) => {
      g.fillStyle = '#f97316'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#fff'; g.fillRect(0, 70, w, 52); g.fillRect(0, 150, w, 38);
      g.fillStyle = 'rgba(0,0,0,.12)'; g.fillRect(0, 0, 3, h);
    });
    const g = new THREE.Group();
    g.add(at(mesh(geo('tcone-plate', () => new THREE.BoxGeometry(0.98, 0.06, 0.98)), mat('tcone-plate', { color: 0xc2410c })), 0, -0.47, 0));
    g.add(at(mesh(geo('tcone', () => faceFront(new THREE.CylinderGeometry(0.045, 0.36, 0.92, 44))), [texMat('tcone', t), mat('tcone-top', { color: 0xf97316 }), mat('tcone-bot', { color: 0x9a3412 })]), 0, 0.0, 0));
    return g;
  },

  // ---- prisms ----
  dice() {
    const face = n => tex('die' + n, 128, 128, (g, w) => {
      g.fillStyle = '#fefce8'; g.fillRect(0, 0, w, w);
      g.strokeStyle = '#e7e5c8'; g.lineWidth = 8; g.strokeRect(0, 0, w, w);
      const P = { 1: [[1, 1]], 2: [[0, 0], [2, 2]], 3: [[0, 0], [1, 1], [2, 2]], 4: [[0, 0], [2, 0], [0, 2], [2, 2]], 5: [[0, 0], [2, 0], [1, 1], [0, 2], [2, 2]], 6: [[0, 0], [2, 0], [0, 1], [2, 1], [0, 2], [2, 2]] };
      for (const [x, y] of P[n]) { g.beginPath(); g.arc(24 + x * 40 + 4, 24 + y * 40 + 4, n === 1 ? 20 : 13, 0, 7); g.fillStyle = n === 1 ? '#dc2626' : '#1f2937'; g.fill(); }
    });
    const ms = [3, 4, 1, 6, 2, 5].map(n => texMat('die' + n, face(n), { roughness: 0.3 })); // +x -x +y -y +z -z
    return new THREE.Group().add(mesh(geo('die', () => new THREE.BoxGeometry(0.86, 0.86, 0.86)), ms));
  },

  tissueBox() {
    const side = tex('tissue-side', 256, 128, (g, w, h) => {
      g.fillStyle = '#7dd3fc'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#fff';
      for (const [x, y, r] of [[40, 40, 22], [130, 70, 28], [210, 36, 20], [80, 98, 14], [190, 104, 16]]) {
        for (let k = 0; k < 3; k++) { g.beginPath(); g.arc(x + (k - 1) * r * 0.9, y + (k === 1 ? -r * 0.35 : 0), r * 0.7, 0, 7); g.fill(); }
        g.fillRect(x - r * 1.5, y, r * 3, r * 0.5);
      }
    });
    const top = tex('tissue-top', 256, 128, (g, w, h) => {
      g.fillStyle = '#7dd3fc'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#e0f2fe'; g.beginPath(); g.ellipse(w / 2, h / 2, 100, 30, 0, 0, 7); g.fill();
      g.fillStyle = '#0c4a6e'; g.beginPath(); g.ellipse(w / 2, h / 2, 88, 20, 0, 0, 7); g.fill();
    });
    const sm = texMat('tissue-side', side), tm = texMat('tissue-top', top), bm = mat('tissue-bot', { color: 0x38bdf8 });
    const g = new THREE.Group();
    g.add(at(mesh(geo('tissue', () => new THREE.BoxGeometry(0.94, 0.5, 0.54)), [sm, sm, tm, bm, sm, sm]), 0, -0.14, 0));
    const paper = mat('tissue-paper', { color: 0xffffff, roughness: 1, side: THREE.DoubleSide });
    const sheetG = geo('tissue-sheet', () => {
      const s = new THREE.PlaneGeometry(0.36, 0.3, 12, 2), p = s.attributes.position;
      for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i); p.setZ(i, Math.sin(x * 22) * 0.035 * (0.4 + y + 0.15)); p.setY(i, y + 0.15 + Math.sin(x * 18) * 0.015); }
      s.computeVertexNormals(); return s;
    });
    for (const [x, z, ry, rz] of [[-0.04, 0.02, 0.12, 0.18], [0.07, -0.03, -0.35, -0.2], [0, 0.04, 1.4, 0.05]]) {
      const m = at(mesh(sheetG, paper), x, 0.09, z); m.rotation.set(0, ry, rz); g.add(m); // sheet foot sits in the slot, just under the lid
    }
    return recentre(g);
  },

  tent() {
    const W = 1.0, D = 0.88, H = 0.76, y0 = -H / 2;
    const door = tex('tent-door', 256, 256, (g, w, h) => {
      g.fillStyle = '#f97316'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#7c2d12'; g.beginPath(); g.moveTo(w * 0.5, h * 0.2); g.lineTo(w * 0.78, h); g.lineTo(w * 0.22, h); g.closePath(); g.fill();
      g.fillStyle = '#fde68a'; g.beginPath(); g.moveTo(w * 0.5, h * 0.2); g.lineTo(w * 0.5, h); g.lineTo(w * 0.22, h); g.closePath(); g.fill(); // flap folded back
      g.strokeStyle = '#fff'; g.lineWidth = 5; g.beginPath(); g.moveTo(w * 0.5, h * 0.2); g.lineTo(w * 0.5, h); g.stroke();
      g.fillStyle = '#fff'; g.beginPath(); g.arc(w * 0.5, h * 0.16, 7, 0, 7); g.fill();
    });
    const roof = tex('tent-roof', 128, 128, (g, w, h) => {
      g.fillStyle = '#f97316'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#fde68a'; for (let i = 0; i < 4; i++) g.fillRect(i * 32 + 12, 0, 12, h);
    });
    const back = tex('tent-back', 64, 64, (g, w, h) => { g.fillStyle = '#ea580c'; g.fillRect(0, 0, w, h); });
    const f = [
      { v: [[-W / 2, y0, D / 2], [W / 2, y0, D / 2], [0, y0 + H, D / 2]], uv: [[0, 0], [1, 0], [0.5, 1]], m: 0 },
      { v: [[-W / 2, y0, -D / 2], [W / 2, y0, -D / 2], [0, y0 + H, -D / 2]], uv: [[0, 0], [1, 0], [0.5, 1]], m: 1 },
      { v: [[-W / 2, y0, D / 2], [-W / 2, y0, -D / 2], [0, y0 + H, -D / 2], [0, y0 + H, D / 2]], uv: [[0, 0], [1, 0], [1, 1], [0, 1]], m: 2 },
      { v: [[W / 2, y0, D / 2], [W / 2, y0, -D / 2], [0, y0 + H, -D / 2], [0, y0 + H, D / 2]], uv: [[0, 0], [1, 0], [1, 1], [0, 1]], m: 2 },
      { v: [[-W / 2, y0, D / 2], [W / 2, y0, D / 2], [W / 2, y0, -D / 2], [-W / 2, y0, -D / 2]], uv: [[0, 0], [1, 0], [1, 1], [0, 1]], m: 3 },
    ];
    const g = new THREE.Group();
    g.add(mesh(geo('tent', () => polyGeo(f, [0, 0, 0])), [texMat('tent-door', door, { roughness: 0.9 }), texMat('tent-back', back, { roughness: 0.9 }), texMat('tent-roof', roof, { roughness: 0.9 }), mat('tent-floor', { color: 0x7c2d12 })]));
    return g;
  },

  pencilBox() {
    const top = tex('pbox-top', 512, 256, (g, w, h) => {
      g.fillStyle = '#a78bfa'; g.fillRect(0, 0, w, h);
      g.strokeStyle = '#7c3aed'; g.lineWidth = 8; g.strokeRect(10, 10, w - 20, h - 20);
      g.save(); g.translate(w / 2, h / 2); g.rotate(-0.38);
      g.fillStyle = '#facc15'; g.fillRect(-170, -26, 270, 52);
      g.fillStyle = '#ca8a04'; g.fillRect(-170, -4, 270, 8);
      g.fillStyle = '#d6a36a'; g.beginPath(); g.moveTo(100, -26); g.lineTo(170, 0); g.lineTo(100, 26); g.fill();
      g.fillStyle = '#1f2937'; g.beginPath(); g.moveTo(150, -8); g.lineTo(170, 0); g.lineTo(150, 8); g.fill();
      g.fillStyle = '#94a3b8'; g.fillRect(-206, -26, 36, 52);
      g.fillStyle = '#f9a8d4'; g.beginPath(); g.roundRect(-246, -26, 44, 52, 12); g.fill();
      g.restore();
      g.fillStyle = '#fde047'; for (const [x, y] of [[60, 50], [440, 200], [450, 60], [70, 205]]) { g.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 7 : 17; g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); } g.fill(); }
    });
    const side = tex('pbox-side', 256, 64, (g, w, h) => {
      g.fillStyle = '#8b5cf6'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#6d28d9'; g.fillRect(0, h * 0.4, w, 4);
    });
    const sm = texMat('pbox-side', side), tm = texMat('pbox-top', top, { roughness: 0.4 });
    const g = new THREE.Group();
    g.add(mesh(geo('pbox', () => new THREE.BoxGeometry(0.98, 0.3, 0.54)), [sm, sm, tm, mat('pbox-bot', { color: 0x6d28d9 }), sm, sm]));
    g.add(at(mesh(geo('pbox-latch', () => new THREE.BoxGeometry(0.12, 0.1, 0.03)), mat('pbox-latch', { color: 0xfacc15, metalness: 0.4 })), 0, 0.03, 0.275));
    return g;
  },

  // ---- pyramids ----
  paperweight() {
    const B = 0.9, H = 0.82, y0 = -H / 2, h = B / 2;
    const apex = [0, y0 + H, 0];
    const quad = [[-h, y0, h], [h, y0, h], [h, y0, -h], [-h, y0, -h]];
    const faces = quad.map((p, i) => ({ v: [p, quad[(i + 1) % 4], apex], uv: [[0, 0], [1, 0], [0.5, 1]], m: 0 }));
    faces.push({ v: quad, uv: [[0, 0], [1, 0], [1, 1], [0, 1]], m: 1 });
    const pg = geo('pw', () => polyGeo(faces, [0, 0, 0]));
    const glass = mat('pw-glass', { color: 0xfbbf24, transparent: true, opacity: 0.62, roughness: 0.05, metalness: 0.1, depthWrite: false });
    const g = new THREE.Group();
    // a solid little core so it reads as a glass pyramid with something inside
    const core = mesh(pg, mat('pw-core', { color: 0xb45309, roughness: 0.4, metalness: 0.3 })); core.scale.setScalar(0.5); core.position.y = y0 * 0.5; g.add(core);
    g.add(mesh(pg, [glass, glass]));
    const edges = geo('pw-edges', () => new THREE.EdgesGeometry(pg));
    g.add(new THREE.LineSegments(edges, memo('m:pw-line', () => new THREE.LineBasicMaterial({ color: 0xfffbeb, transparent: true, opacity: 0.9 }))));
    return g;
  },

  teaBag() {
    const R = 0.44, Hh = R * Math.sqrt(2), y0 = -Hh / 2;
    const base = [0, 1, 2].map(k => { const a = Math.PI / 2 + (k * 2 * Math.PI) / 3; return [R * Math.cos(a), y0, R * Math.sin(a)]; });
    const apex = [0, y0 + Hh, 0];
    const faces = [0, 1, 2].map(i => ({ v: [base[i], base[(i + 1) % 3], apex], uv: [[0, 0], [1, 0], [0.5, 1]], m: 0 }));
    faces.push({ v: base, uv: [[0, 0], [1, 0], [0.5, 1]], m: 1 });
    const mesht = tex('tea', 128, 128, (g, w) => {
      g.fillStyle = '#ecfccb'; g.fillRect(0, 0, w, w);
      g.strokeStyle = 'rgba(101,163,13,.35)'; g.lineWidth = 1; for (let i = 0; i < w; i += 8) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, w); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(w, i); g.stroke(); }
      g.fillStyle = '#4d7c0f'; for (let i = 0; i < 46; i++) { g.save(); g.translate((i * 53) % w, (i * 37 + i * i) % w); g.rotate(i); g.beginPath(); g.ellipse(0, 0, 6, 2.2, 0, 0, 7); g.fill(); g.restore(); }
    });
    const nylon = texMat('tea', mesht, { transparent: true, opacity: 0.92, roughness: 0.6 });
    const g = new THREE.Group();
    g.add(mesh(geo('tea', () => polyGeo(faces, [0, 0, 0])), [nylon, nylon]));
    const stringM = mat('tea-string', { color: 0xf8fafc });
    g.add(at(mesh(geo('tea-string', () => new THREE.CylinderGeometry(0.008, 0.008, 0.2, 6)), stringM), 0, y0 + Hh + 0.1, 0));
    const tag = tex('tea-tag', 64, 80, (g2, w, h) => {
      g2.fillStyle = '#fff'; g2.fillRect(0, 0, w, h); g2.strokeStyle = '#4d7c0f'; g2.lineWidth = 5; g2.strokeRect(3, 3, w - 6, h - 6);
      g2.fillStyle = '#65a30d'; g2.beginPath(); g2.ellipse(w / 2, h / 2, 10, 20, 0.6, 0, 7); g2.fill();
    });
    const tg = at(mesh(geo('tea-tag', () => new THREE.PlaneGeometry(0.13, 0.16)), mat('tea-tag', { map: tag, side: THREE.DoubleSide })), 0.08, y0 + Hh + 0.12, 0.0);
    tg.rotation.y = 0.4; g.add(tg);
    return recentre(g);
  },
};

/**
 * objectId -> Group fitting a 1x1x1 box (globe stand excepted), origin at the centre; userData = { objectId, family }.
 * Geometries, materials and textures are SHARED between all objects of a kind (never disposed): a scene that wants to
 * tint or fade one object must clone its material first. No shadow is added: the scene adds its own blobShadow.
 */
export function makeObject(objectId) {
  const spec = OBJECTS.find(o => o.id === objectId);
  if (!spec || !BUILD[objectId]) throw new Error('unknown object ' + objectId);
  const g = BUILD[objectId]();
  g.userData = { ...g.userData, objectId, family: spec.family };
  return g;
}
