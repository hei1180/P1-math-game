// Flat things: B2 tiles, B4 pieces and outlines, B1 wires and laser/curve lines, B3 pegboard and band.
// Geometries are cached (userData.shared). Tiles, pieces and outlines lie in the XZ plane, template/cell y (down) = world +z.
// Wires stand in the XY plane facing +z (rotate x by -PI/2 to lay one flat).
import * as THREE from 'three';
import { templateById, PIECES, footprint, PEG_GRID, LINES } from '../../shapes-logic.js?v=0';
import { toyColor, SCENE } from '../theme.js?v=0';

const cache = new Map();
function cached(key, make) {
  let g = cache.get(key);
  if (!g) { g = make(); g.userData.shared = true; cache.set(key, g); }
  return g;
}
const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0, ...extra });
const v3 = p => (p.isVector3 ? p.clone() : new THREE.Vector3(p[0], p[1], p[2]));

// Extrude shapes (drawn with y = -world z) into a plate lying on y = 0 with its top at `thickness`.
// bevelOffset = -bevel keeps the widest part of the plate exactly on the outline.
function plate(shapes, thickness, size) {
  const bt = Math.min(0.02 * size, thickness / 4), bs = Math.min(0.02, 0.04 * size);
  const geo = new THREE.ExtrudeGeometry(shapes, {
    depth: thickness - 2 * bt, bevelEnabled: true, bevelThickness: bt, bevelSize: bs, bevelOffset: -bs, bevelSegments: 2, curveSegments: 48, steps: 1,
  });
  geo.translate(0, 0, bt);
  geo.rotateX(-Math.PI / 2);
  return geo;
}

/** Flat plastic tile from TILE_TEMPLATES, centred on the origin in a size × size box, top at y = thickness. */
export function makeTile(templateId, { color = toyColor(), size = 1, thickness = 0.12 } = {}) {
  const t = templateById(templateId);
  if (!t) throw new Error(`Unknown tile "${templateId}"`);
  const geo = cached(`tile|${templateId}|${size}|${thickness}`, () => {
    const s = size / 2, sh = new THREE.Shape();
    if (t.circle) sh.absarc(0, 0, s, 0, Math.PI * 2, false);
    else t.points.forEach(([x, y], i) => (i ? sh.lineTo(x * s, -y * s) : sh.moveTo(x * s, -y * s)));
    return plate([sh], thickness, size);
  });
  const m = new THREE.Mesh(geo, std(color));
  m.userData = { templateId, size, thickness };
  return m;
}

// ---- union outline of quarter-triangles (half-cell integer coordinates) ----
const QUARTERS = {
  n: (x, y) => [[x + 1, y + 1], [x, y], [x + 2, y]],
  e: (x, y) => [[x + 1, y + 1], [x + 2, y], [x + 2, y + 2]],
  s: (x, y) => [[x + 1, y + 1], [x + 2, y + 2], [x, y + 2]],
  w: (x, y) => [[x + 1, y + 1], [x, y + 2], [x, y]],
};
const pk = p => p[0] + ',' + p[1];

/** keys 'x,y,q' -> { loops: [[ [x,y]... ]] in cell units (collinear points dropped), circles: [[cx,cy]] } */
function outlineOf(keys) {
  const count = new Map(), circles = [];
  for (const k of keys) {
    const [x, y, q] = k.split(',');
    if (q === 'c') { circles.push([+x + 0.5, +y + 0.5]); continue; }
    const tri = QUARTERS[q](2 * +x, 2 * +y);
    for (let i = 0; i < 3; i++) {
      const a = tri[i], b = tri[(i + 1) % 3], key = [pk(a), pk(b)].sort().join('|');
      const e = count.get(key) || { a, b, n: 0 }; e.n++; count.set(key, e);
    }
  }
  const adj = new Map();
  for (const e of count.values()) {
    if (e.n !== 1) continue; // shared by two triangles: inside the shape
    for (const [p, q] of [[e.a, e.b], [e.b, e.a]]) { const k = pk(p); if (!adj.has(k)) adj.set(k, []); adj.get(k).push(q); }
  }
  const used = new Set(), edgeKey = (a, b) => [pk(a), pk(b)].sort().join('|'), loops = [];
  for (const [k0, nb] of adj) {
    for (const first of nb) {
      if (used.has(edgeKey(k0.split(',').map(Number), first))) continue;
      const start = k0.split(',').map(Number), pts = [start];
      let cur = first;
      used.add(edgeKey(start, first));
      while (pk(cur) !== pk(start)) {
        pts.push(cur);
        const next = (adj.get(pk(cur)) || []).find(n => !used.has(edgeKey(cur, n)));
        if (!next) break;
        used.add(edgeKey(cur, next)); cur = next;
      }
      // drop points that lie straight between their neighbours
      let p = pts;
      for (let changed = true; changed && p.length > 3;) {
        changed = false;
        for (let i = 0; i < p.length; i++) {
          const a = p[(i - 1 + p.length) % p.length], b = p[i], c = p[(i + 1) % p.length];
          if ((b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]) === 0) { p = p.filter((_, j) => j !== i); changed = true; break; }
        }
      }
      loops.push(p.map(([x, y]) => [x / 2, y / 2]));
    }
  }
  return { loops, circles };
}
const area = p => p.reduce((s, a, i) => { const b = p[(i + 1) % p.length]; return s + a[0] * b[1] - b[0] * a[1]; }, 0) / 2;
function inside(pt, poly) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
/** THREE.Shapes (y = -world z) for the loops (a loop inside a bigger one is a hole) and the round sockets. */
function shapesOf({ loops, circles }, cell) {
  const ordered = loops.slice().sort((a, b) => Math.abs(area(b)) - Math.abs(area(a))), outers = [];
  const pt = p => new THREE.Vector2(p[0] * cell, -p[1] * cell);
  for (const l of ordered) {
    const onOrIn = (q, o) => inside(q, o.poly) || o.poly.some(c => c[0] === q[0] && c[1] === q[1]);
    const host = outers.find(o => l.every(q => onOrIn(q, o)));
    if (host) host.holes.push(l); else outers.push({ poly: l, holes: [] });
  }
  const shapes = outers.map(o => {
    const s = new THREE.Shape(o.poly.map(pt));
    for (const h of o.holes) s.holes.push(new THREE.Path(h.map(pt)));
    return s;
  });
  for (const [cx, cy] of circles) { const s = new THREE.Shape(); s.absarc(cx * cell, -cy * cell, 0.5 * cell, 0, Math.PI * 2, false); shapes.push(s); }
  return shapes;
}

/**
 * B4 piece. Geometry is baked for r clockwise quarter turns and `cell`, with the top-left corner of its footprint at the origin
 * (cells run +x right and +z down), top at y = 0.12 * cell. Set mesh.position to (x * cell, 0, y * cell) of the footprint.
 */
export function makePiece(pieceId, { color = toyColor(), cell = 1, r = 0 } = {}) {
  if (!PIECES[pieceId]) throw new Error(`Unknown piece "${pieceId}"`);
  r = ((r % 4) + 4) % 4;
  const keys = footprint(pieceId, 0, 0, r);
  const geo = cached(`piece|${pieceId}|${r}|${cell}`, () => plate(shapesOf(outlineOf(keys), cell), 0.12 * cell, cell));
  const m = new THREE.Mesh(geo, std(color));
  const xs = keys.map(k => +k.split(',')[0]), ys = keys.map(k => +k.split(',')[1]);
  m.userData = { pieceId, r, cell, cols: Math.max(...xs) + 1, rows: Math.max(...ys) + 1 };
  return m;
}

/** Dark silhouette of puzzle.cells (cell (x, y) at world (x * cell, 0, y * cell)) with a faint grid over its box. */
export function makeOutline(puzzle, { cell = 1 } = {}) {
  const g = new THREE.Group();
  const shapes = shapesOf(outlineOf(puzzle.cells), cell);
  const sil = new THREE.Mesh(new THREE.ShapeGeometry(shapes, 48), std(SCENE.dark, { roughness: 1, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
  sil.rotation.x = -Math.PI / 2; sil.position.y = 0.004; sil.name = 'silhouette';
  g.add(sil);
  const xs = puzzle.cells.map(k => +k.split(',')[0]), ys = puzzle.cells.map(k => +k.split(',')[1]);
  const x0 = Math.min(...xs), y0 = Math.min(...ys), x1 = Math.max(...xs) + 1, y1 = Math.max(...ys) + 1, pts = [];
  for (let x = x0; x <= x1; x++) pts.push(x * cell, 0.008, y0 * cell, x * cell, 0.008, y1 * cell);
  for (let y = y0; y <= y1; y++) pts.push(x0 * cell, 0.008, y * cell, x1 * cell, 0.008, y * cell);
  const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  const grid = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.22 }));
  grid.name = 'grid';
  g.add(grid);
  g.userData = { puzzleId: puzzle.id, cell, x0, y0, cols: x1 - x0, rows: y1 - y0 };
  return g;
}

// ---- B1 wires: straight and curved things, standing in the XY plane, about 2 wide, centred on the origin ----
const tube = (curve, segs, r) => new THREE.TubeGeometry(curve, segs, r, 10, false);
const mesh = (geo, color, extra) => new THREE.Mesh(geo, std(color, extra));

function wireParts(id) {
  const parts = [];
  const add = (geo, color, extra) => parts.push(mesh(geo, color, extra));
  switch (id) {
    case 'ruler': {
      add(new THREE.BoxGeometry(2, 0.26, 0.05), 0xfacc15);
      const ticks = [];
      for (let i = 0; i <= 20; i++) {
        const h = i % 5 === 0 ? 0.12 : 0.07, t = new THREE.BoxGeometry(0.02, h, 0.01);
        t.translate(-0.95 + i * 0.095, 0.13 - h / 2, 0.03); ticks.push(t);
      }
      parts.push(mesh(merge(ticks), 0x1f2937));
      break;
    }
    case 'chopstick': {
      const g = new THREE.CylinderGeometry(0.03, 0.065, 2, 12); g.rotateZ(Math.PI / 2); add(g, 0xc08a4b); // thick end on the right
      break;
    }
    case 'pencil': {
      const body = new THREE.CylinderGeometry(0.11, 0.11, 1.6, 6); body.rotateZ(Math.PI / 2); body.translate(-0.1, 0, 0); add(body, 0xfacc15);
      const wood = new THREE.ConeGeometry(0.11, 0.3, 6); wood.rotateZ(-Math.PI / 2); wood.translate(0.85, 0, 0); add(wood, 0xf3d9a8);
      const lead = new THREE.ConeGeometry(0.035, 0.1, 8); lead.rotateZ(-Math.PI / 2); lead.translate(1.0, 0, 0); add(lead, 0x1f2937);
      const band = new THREE.CylinderGeometry(0.115, 0.115, 0.1, 6); band.rotateZ(Math.PI / 2); band.translate(-0.95, 0, 0); add(band, 0x94a3b8, { metalness: 0.5 });
      const eraser = new THREE.CylinderGeometry(0.1, 0.1, 0.16, 12); eraser.rotateZ(Math.PI / 2); eraser.translate(-1.05, 0, 0); add(eraser, 0xf472b6);
      break;
    }
    case 'stick': {
      add(new THREE.BoxGeometry(2, 0.12, 0.12), 0xb7793c);
      break;
    }
    case 'rainbow': {
      [[0.8, 0xef4444], [0.67, 0xfacc15], [0.54, 0x3b82f6]].forEach(([r, c]) => {
        const pts = Array.from({ length: 33 }, (_, i) => { const a = (i / 32) * Math.PI; return new THREE.Vector3(r * Math.cos(a), r * Math.sin(a) - 0.4, 0); });
        add(tube(new THREE.CatmullRomCurve3(pts), 48, 0.06), c);
      });
      break;
    }
    case 'snake': {
      const c = new THREE.CatmullRomCurve3([[-1, -0.18], [-0.65, 0.22], [-0.25, -0.2], [0.15, 0.22], [0.55, -0.18], [0.85, 0.05]].map(([x, y]) => new THREE.Vector3(x, y, 0)));
      const h = c.getPoint(1), t = c.getPoint(0), hd = new THREE.SphereGeometry(0.15, 20, 14), tl = new THREE.SphereGeometry(0.09, 12, 10);
      hd.scale(1.15, 1, 1); hd.translate(h.x + 0.07, h.y + 0.02, 0); tl.translate(t.x, t.y, 0);
      add(merge([tube(c, 80, 0.09), hd, tl]), 0x84cc16);
      const eyes = [], pupils = [];
      for (const dy of [0.07, -0.05]) {
        const e = new THREE.SphereGeometry(0.045, 12, 10); e.translate(h.x + 0.1, h.y + 0.02 + dy, 0.12); eyes.push(e);
        const p = new THREE.SphereGeometry(0.022, 10, 8); p.translate(h.x + 0.115, h.y + 0.02 + dy, 0.15); pupils.push(p);
      }
      add(merge(eyes), 0xffffff); add(merge(pupils), 0x1f2937);
      break;
    }
    case 'hose': {
      const pts = [], turns = 2.1;
      for (let i = 0; i <= 90; i++) { const t = i / 90, a = t * turns * Math.PI * 2, r = 0.18 + 0.38 * t; pts.push(new THREE.Vector3(r * Math.cos(a), r * Math.sin(a), 0)); }
      add(tube(new THREE.CatmullRomCurve3(pts), 160, 0.07), 0x0ea5e9);
      const e = pts[pts.length - 1], d = pts[pts.length - 1].clone().sub(pts[pts.length - 2]).normalize();
      const nz = new THREE.CylinderGeometry(0.09, 0.07, 0.22, 14);
      nz.rotateZ(-Math.atan2(d.x, d.y)); nz.translate(e.x + d.x * 0.1, e.y + d.y * 0.1, 0); add(nz, 0xfacc15, { metalness: 0.3 });
      break;
    }
    case 'wave': {
      const pts = Array.from({ length: 41 }, (_, i) => { const x = -1 + i * 0.05; return new THREE.Vector3(x, 0.25 * Math.sin(x * Math.PI * 2), 0); });
      add(tube(new THREE.CatmullRomCurve3(pts), 120, 0.065), 0x06b6d4);
      break;
    }
    default: throw new Error(`Unknown line "${id}"`);
  }
  return parts;
}
// merge geometries into one (keeps the ruler's ticks to a single draw call)
function merge(geos) {
  const pos = [], nor = [];
  for (const src of geos) {
    const g = src.toNonIndexed();
    pos.push(...g.attributes.position.array); nor.push(...g.attributes.normal.array);
    g.dispose(); src.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  return out;
}

/** B1 straight / curved thing from LINES, standing in the XY plane facing +z, about 2 wide. userData = { lineId, curved }. */
export function makeWire(lineId) {
  const info = LINES.find(l => l.id === lineId);
  if (!info) throw new Error(`Unknown line "${lineId}"`);
  const g = new THREE.Group();
  for (const p of wireParts(lineId)) g.add(p);
  g.userData = { lineId, curved: info.curved };
  return g;
}

/** Straight laser beam between two points ([x,y,z] or Vector3). */
export function makeLaser(a, b, { color = 0xef4444, radius = 0.035 } = {}) {
  const A = v3(a), B = v3(b), len = Math.max(A.distanceTo(B), 1e-4);
  const m = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, len, 10),
    std(color, { emissive: color, emissiveIntensity: 0.6, roughness: 0.3 }));
  m.position.copy(A).lerp(B, 0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize());
  return m;
}

/** Curved line between two points: a bezier whose middle sits `bend` away from the straight line, sideways in the XZ plane. */
export function makeCurve(a, b, bend = 0.6, { color = 0xf97316, radius = 0.035 } = {}) {
  const A = v3(a), B = v3(b), d = B.clone().sub(A);
  const side = new THREE.Vector3(-d.z, 0, d.x);
  if (side.lengthSq() < 1e-9) side.set(0, 0, 1);
  side.normalize();
  const ctrl = A.clone().lerp(B, 0.5).addScaledVector(side, 2 * bend); // a quadratic bezier's middle is half-way to its control point
  const curve = new THREE.QuadraticBezierCurve3(A, ctrl, B);
  return new THREE.Mesh(new THREE.TubeGeometry(curve, 40, radius, 8, false), std(color, { emissive: color, emissiveIntensity: 0.4, roughness: 0.3 }));
}

/**
 * Upright wooden pegboard facing +z, centred on the origin, front face at z = 0. userData.pegs[x][y] is a Mesh (x, y as in PEG_GRID,
 * y down: peg [0][0] is top-left) whose position is where a rubber band should run (on the shaft, in the board's own frame).
 */
export function makePegboard({ spacing = 1 } = {}) {
  const s = spacing, g = new THREE.Group(), half = (PEG_GRID - 1) / 2;
  const board = mesh(new THREE.BoxGeometry((PEG_GRID + 0.2) * s, (PEG_GRID + 0.2) * s, 0.2 * s), SCENE.bench, { roughness: 0.8 });
  board.position.z = -0.1 * s; g.add(board);
  const bandZ = 0.2 * s;
  const geo = cached(`peg|${s}`, () => {
    const p = [[0, 0], [0.1, 0], [0.1, 0.34], [0.17, 0.34], [0.17, 0.4], [0.0, 0.4]].map(([r, h]) => new THREE.Vector2(r * s, h * s));
    const l = new THREE.LatheGeometry(p, 16); l.rotateX(Math.PI / 2); l.translate(0, 0, -bandZ);
    return l;
  });
  const pegs = [];
  for (let x = 0; x < PEG_GRID; x++) {
    pegs[x] = [];
    for (let y = 0; y < PEG_GRID; y++) {
      const m = mesh(geo, 0xf8fafc, { roughness: 0.35 });
      m.position.set((x - half) * s, (half - y) * s, bandZ); m.userData = { peg: [x, y] };
      g.add(m); pegs[x][y] = m;
    }
  }
  g.userData = { pegs, spacing: s, bandZ };
  return g;
}

/**
 * Rubber band. userData.set(points3D, closed) rebuilds it as a rounded tube through the points ([x,y,z] or Vector3, in the
 * same frame as the mesh, e.g. peg positions with the band added to the pegboard group). Fewer than two points hides it.
 */
export function makeBand({ color = 0xf97316, radius = 0.05 } = {}) {
  const m = new THREE.Mesh(new THREE.BufferGeometry(), std(color, { roughness: 0.35 }));
  m.visible = false;
  m.userData.radius = radius;
  m.userData.set = (points, closed = false) => {
    m.geometry.dispose();
    const pts = points.map(v3).filter((p, i, a) => i === 0 || p.distanceTo(a[i - 1]) > 1e-6);
    if (pts.length > 1 && pts[0].distanceTo(pts[pts.length - 1]) < 1e-6) pts.pop();
    if (pts.length < 2) { m.geometry = new THREE.BufferGeometry(); m.visible = false; return; }
    const loop = closed && pts.length > 2, n = pts.length, k = 0.14, path = new THREE.CurvePath();
    const corner = i => {
      const p = pts[i], da = pts[(i - 1 + n) % n].clone().sub(p), db = pts[(i + 1) % n].clone().sub(p);
      return { p, a: p.clone().addScaledVector(da.clone().normalize(), Math.min(k, da.length() * 0.45)), b: p.clone().addScaledVector(db.clone().normalize(), Math.min(k, db.length() * 0.45)) };
    };
    const cs = pts.map((_, i) => corner(i));
    let from = loop ? cs[0].b : pts[0];
    for (let i = 1; i <= (loop ? n : n - 2); i++) {
      const c = cs[i % n];
      path.add(new THREE.LineCurve3(from, c.a));
      path.add(new THREE.QuadraticBezierCurve3(c.a, c.p, c.b)); from = c.b;
    }
    if (!loop) path.add(new THREE.LineCurve3(from, pts[n - 1]));
    m.geometry = new THREE.TubeGeometry(path, Math.max(24, n * 24), m.userData.radius, 10, loop);
    m.visible = true;
  };
  return m;
}
