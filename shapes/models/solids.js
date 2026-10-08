// The nine toy solids. Every solid fits a 1×1×1 box, origin = centre of its upright bounding box.
// Geometries are cached (userData.shared) so scene switches never dispose them.
// Group layout: group > holder (rotated for pose 'side') > [body, face]; plus an optional blob shadow on the floor.
import * as THREE from 'three';
import { familyOf, posesOf, MODELS } from '../../shapes-logic.js?v=202610081258';
import { toyColor } from '../theme.js?v=202610081258';
import { blobShadow } from '../engine/stage.js?v=202610081258';
import { makePatch, addFace } from './faces.js?v=202610081258';

export { setMood, blink } from './faces.js?v=202610081258';

const TAU = Math.PI * 2;
const SPECS = {};

// Regular n-gon prism / pyramid with a flat side facing +z. Vertices follow three's CylinderGeometry
// (x = r sin t, z = r cos t), starting at -PI/n so the side between vertex 0 and 1 faces +z.
function polySolid(n, r, h, apex) {
  const t0 = -Math.PI / n;
  const ring = y => Array.from({ length: n }, (_, i) => [r * Math.sin(t0 + (i * TAU) / n), y, r * Math.cos(t0 + (i * TAU) / n)]);
  let v = apex ? [...ring(-h / 2), [0, h / 2, 0]] : [...ring(-h / 2), ...ring(h / 2)];
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (const p of v) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], p[k]); mx[k] = Math.max(mx[k], p[k]); }
  const c = mn.map((a, k) => (a + mx[k]) / 2);
  v = v.map(p => p.map((a, k) => +(a - c[k]).toFixed(5)));
  const cyc = Array.from({ length: n }, (_, i) => i);
  const faces = apex
    ? [cyc, ...cyc.map(i => [i, (i + 1) % n, n])]
    : [cyc, cyc.map(i => n + i), ...cyc.map(i => [i, (i + 1) % n, n + ((i + 1) % n), n + i])];
  const geo = apex ? new THREE.ConeGeometry(r, h, n, 1, false, t0) : new THREE.CylinderGeometry(r, r, h, n, 1, false, t0);
  geo.translate(-c[0], -c[1], -c[2]);
  return { geo, vertices: v, faces, front: mx[2] - c[2], base: -(mx[1] - mn[1]) / 2, top: (mx[1] - mn[1]) / 2, apexZ: -c[2] };
}

// ---- specs: geometry, physics shape and the face patch (per pose) of each model ----
function build(id) {
  const fam = familyOf(id);
  switch (id) {
    case 'cube': return {
      geo: new THREE.BoxGeometry(0.9, 0.9, 0.9), flat: true, phys: { type: 'box', half: [0.45, 0.45, 0.45] },
      faceSurf: () => (u, v) => [u * 0.3, v * 0.3, 0.45],
    };
    case 'cuboid': return {
      geo: new THREE.BoxGeometry(1, 0.6, 0.6), flat: true, phys: { type: 'box', half: [0.5, 0.3, 0.3] },
      faceSurf: () => (u, v) => [u * 0.24, v * 0.24, 0.3],
    };
    case 'triPrism': case 'hexPrism': {
      const tri = id === 'triPrism', s = polySolid(tri ? 3 : 6, tri ? 0.57 : 0.5, tri ? 0.9 : 0.8, false), w = tri ? 0.3 : 0.2;
      return { geo: s.geo, flat: true, phys: { type: 'convex', vertices: s.vertices, faces: s.faces }, faceSurf: () => (u, v) => [u * w, v * w, s.front] };
    }
    case 'sqPyramid': case 'triPyramid': {
      const sq = id === 'sqPyramid', s = polySolid(sq ? 4 : 3, sq ? 0.64 : 0.57, 0.9, true);
      const B = new THREE.Vector3(0, s.base, s.front), A = new THREE.Vector3(0, s.top, s.apexZ);
      const L = A.distanceTo(B), dir = A.clone().sub(B).normalize(), sc = 0.31 * L, w = 0.18;
      return {
        geo: s.geo, flat: true, phys: { type: 'convex', vertices: s.vertices, faces: s.faces },
        // on the slanted front face, a bit above the base edge
        faceSurf: () => (u, v) => { const p = B.clone().addScaledVector(dir, sc + v * w); return [p.x + u * w, p.y, p.z]; },
      };
    }
    case 'cylinder': {
      const r = 0.4, h = 0.9, w = 0.26;
      return {
        geo: new THREE.CylinderGeometry(r, r, h, 32), flat: false, phys: { type: 'cylinder', rTop: r, rBottom: r, h },
        faceSurf: pose => pose === 'side'
          ? (u, v) => { const a = (v * w) / r; return [r * Math.sin(a), -u * w, r * Math.cos(a)]; } // lying: u runs along the axis
          : (u, v) => { const a = (u * w) / r; return [r * Math.sin(a), v * w, r * Math.cos(a)]; },
      };
    }
    case 'cone': {
      const r = 0.45, h = 0.9, rho = y => (r * (h / 2 - y)) / h;
      return {
        geo: new THREE.ConeGeometry(r, h, 32), flat: false, phys: { type: 'cylinder', rTop: 0.01, rBottom: r, h },
        tilt: Math.atan2(r, h), // lying on a line of its side: the axis rises by this angle towards the base
        faceSurf: pose => pose === 'side'
          ? (u, v) => { const y = -0.02 - u * 0.2, a = (v * 0.2) / rho(-0.02); return [rho(y) * Math.sin(a), y, rho(y) * Math.cos(a)]; }
          : (u, v) => { const y = -0.12 + v * 0.2, a = (u * 0.2) / rho(-0.12); return [rho(y) * Math.sin(a), y, rho(y) * Math.cos(a)]; },
      };
    }
    case 'sphere': {
      const R = 0.5;
      return {
        geo: new THREE.SphereGeometry(R, 32, 16), flat: false, phys: { type: 'sphere', r: R },
        faceSurf: () => (u, v) => { const a = u * 0.62, e = 0.06 + v * 0.62; return [R * Math.cos(e) * Math.sin(a), R * Math.sin(e), R * Math.cos(e) * Math.cos(a)]; },
      };
    }
    default: throw new Error(`Unknown solid "${id}" (${fam})`);
  }
}

function spec(id) {
  if (!MODELS[id]) throw new Error(`Unknown solid "${id}"`);
  let s = SPECS[id];
  if (!s) {
    s = SPECS[id] = build(id);
    s.geo.userData.shared = true;
    s.patches = {};
  }
  return s;
}
function patch(id, pose) {
  const s = spec(id);
  return s.patches[pose] || (s.patches[pose] = makePatch(s.faceSurf(pose), 10, 10));
}

/**
 * Toy solid fitting a 1×1×1 box, origin = centre of its bounding box (in the pose it is in).
 * pose 'side' lays a cylinder on its curved side, or a cone on a line of its side (axis tilted so it rests naturally).
 * That pose is for scripted animation (A1 rolls and slides solids by tweening); physics is only for upright solids.
 * A blob shadow sits on the floor under it (shadow:false when the solid is lifted or simulated).
 * userData = {
 *   modelId, family, pose, body, shadow,
 *   restY    height of the origin above the floor when resting in this pose,
 *   height   bounding height in this pose (= 2 * restY),
 *   top      distance from the origin up to the top surface (= restY; what sits on it goes there),
 *   axis     unit Vector3, group space: the symmetry / rolling axis (y upright; along the lying axis for 'side'; for a cone, apex end).
 * }
 */
export function makeSolid(modelId, { color = toyColor(), face = true, pose = 'upright', shadow = true } = {}) {
  const s = spec(modelId), family = familyOf(modelId);
  if (!posesOf(modelId).includes(pose)) {
    if (typeof location !== 'undefined' && /[?&]dev\b/.test(location.search)) console.warn(`makeSolid: pose "${pose}" is not allowed for ${modelId}; using upright`);
    pose = 'upright';
  }
  const group = new THREE.Group();
  const holder = new THREE.Group();
  group.add(holder);
  const body = new THREE.Mesh(s.geo, new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0, flatShading: s.flat }));
  holder.add(body);
  const turn = pose === 'side' ? Math.PI / 2 + (s.tilt || 0) : 0;
  holder.rotation.z = turn;
  if (pose === 'side') { // keep the bounding box centred on the origin (a tilted cone's is not, by itself)
    group.updateMatrixWorld(true);
    const c = new THREE.Box3().setFromObject(body, true).getCenter(new THREE.Vector3());
    holder.position.set(-c.x, -c.y, -c.z);
  }
  if (face) addFace(group, family, patch(modelId, pose), holder);
  group.updateMatrixWorld(true);
  const restY = -new THREE.Box3().setFromObject(body, true).min.y;
  const axis = new THREE.Vector3(0, 1, 0).applyAxisAngle(new THREE.Vector3(0, 0, 1), turn);
  for (const k of ['x', 'y', 'z']) if (Math.abs(axis[k]) < 1e-9) axis[k] = 0;
  group.userData = { ...group.userData, modelId, family, pose, restY, height: 2 * restY, top: restY, axis, body };
  if (shadow) {
    const sh = blobShadow(0.55); sh.position.y = -restY + 0.002; group.add(sh); group.userData.shadow = sh;
  }
  return group;
}

/**
 * Shape spec for the physics engine, in the solid's upright frame with the origin at its box centre.
 * Physics is for upright solids only: the 'side' pose rotates an inner holder and has no matching shape (script it instead).
 * { type:'box', half } | { type:'sphere', r } | { type:'cylinder', rTop, rBottom, h } | { type:'convex', vertices, faces }
 * (a cone is a cylinder with a tiny rTop).
 */
export function physicsShapeOf(modelId) {
  return JSON.parse(JSON.stringify(spec(modelId).phys));
}
