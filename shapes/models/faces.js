// Faces for the five solid friends. One shared CanvasTexture per (family, mood), so a face costs no memory:
// setMood / blink only swap the material's map. The ink colour is the same for every family (colour never codes the shape).
import * as THREE from 'three';
import { tween } from '../engine/tween.js?v=0';

export const MOODS = ['normal', 'happy', 'oops', 'dizzy'];
const INK = '#1f2937', WHITE = '#ffffff';
const SIZE = 192;
const cache = new Map();

function line(g, w = 3.2) { g.strokeStyle = INK; g.lineWidth = w; g.lineCap = 'round'; g.lineJoin = 'round'; }
function disc(g, x, y, r, fill = WHITE, stroke = true) {
  g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fillStyle = fill; g.fill();
  if (stroke) { line(g, 2.6); g.stroke(); }
}
function pupil(g, x, y, r, shine = true) {
  disc(g, x, y, r, INK, false);
  if (shine) disc(g, x + r * 0.32, y - r * 0.34, r * 0.34, WHITE, false);
}
function spiral(g, x, y, r) {
  disc(g, x, y, r, WHITE);
  g.beginPath();
  for (let t = 0; t <= 4.2 * Math.PI; t += 0.2) {
    const rr = (t / (4.2 * Math.PI)) * (r - 2.5), px = x + rr * Math.cos(t), py = y + rr * Math.sin(t);
    if (t === 0) g.moveTo(px, py); else g.lineTo(px, py);
  }
  line(g, 2.2); g.stroke();
}
// ctx.roundRect is missing on Safari < 16 (older school iPads), so draw the rounded square by hand
function rrect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.arcTo(x + w, y, x + w, y + r, r);
  g.lineTo(x + w, y + h - r); g.arcTo(x + w, y + h, x + w - r, y + h, r);
  g.lineTo(x + r, y + h); g.arcTo(x, y + h, x, y + h - r, r);
  g.lineTo(x, y + r); g.arcTo(x, y, x + r, y, r);
  g.closePath();
}
function closedEye(g, x, y, r) { g.beginPath(); g.arc(x, y - r * 0.2, r, 0.18 * Math.PI, 0.82 * Math.PI); line(g, 3.4); g.stroke(); }
function happyEye(g, x, y, r) { g.beginPath(); g.arc(x, y + r * 0.45, r, 1.15 * Math.PI, 1.85 * Math.PI); line(g, 3.4); g.stroke(); }

// Eyes by personality. Bobo (sphere) big round; Rolly (cylinder) sleepy; Blocky (prism) square-ish;
// Peak (pyramid) proud with brows; Dizzy (cone) mismatched and wandering.
function eyes(g, family, L, R, y) {
  switch (family) {
    case 'sphere':
      for (const x of [L, R]) { disc(g, x, y, 13); pupil(g, x, y + 1, 7); }
      break;
    case 'cylinder': // half-shut eyes tilted down at the outer ends: gentle and sleepy, not cross
      for (const [x, rot] of [[L, -0.2], [R, 0.2]]) {
        g.save(); g.translate(x, y - 2); g.rotate(rot);
        g.beginPath(); g.arc(0, 0, 11, 0, Math.PI); g.closePath(); g.fillStyle = WHITE; g.fill(); line(g, 2.8); g.stroke();
        g.save(); g.beginPath(); g.arc(0, 0, 11, 0, Math.PI); g.clip(); disc(g, 0, 5.5, 4.2, INK, false); disc(g, 1.5, 4, 1.4, WHITE, false); g.restore();
        g.restore();
      }
      break;
    case 'prism':
      for (const x of [L, R]) {
        rrect(g, x - 11, y - 11, 22, 22, 4); g.fillStyle = WHITE; g.fill(); line(g, 2.6); g.stroke();
        g.fillStyle = INK; g.fillRect(x - 4.5, y - 4, 9, 9);
      }
      break;
    case 'pyramid':
      for (const x of [L, R]) {
        g.beginPath(); g.ellipse(x, y, 9.5, 11.5, 0, 0, Math.PI * 2); g.fillStyle = WHITE; g.fill(); line(g, 2.6); g.stroke();
        pupil(g, x, y - 1.5, 5.2);
      }
      g.beginPath(); g.moveTo(L - 11, y - 19); g.lineTo(L + 9, y - 14); line(g, 3.4); g.stroke();
      g.beginPath(); g.moveTo(R + 11, y - 19); g.lineTo(R - 9, y - 14); g.stroke();
      break;
    default: // cone
      disc(g, L, y, 13); pupil(g, L + 3, y + 2, 6.5);
      disc(g, R, y + 1, 9); pupil(g, R - 2, y - 1, 4.6);
  }
}

function mouth(g, family, y) {
  line(g, 3.4); g.beginPath();
  switch (family) {
    case 'sphere': g.arc(50, y - 8, 11, 0.2 * Math.PI, 0.8 * Math.PI); break;
    case 'cylinder': g.ellipse(50, y + 1, 6, 4, 0, 0, Math.PI * 2); break;
    case 'prism': g.moveTo(39, y - 2); g.lineTo(43, y + 3); g.lineTo(57, y + 3); g.lineTo(61, y - 2); break;
    case 'pyramid': g.arc(50, y - 11, 16, 0.14 * Math.PI, 0.8 * Math.PI); break;
    default: g.moveTo(37, y); g.bezierCurveTo(43, y - 7, 47, y + 7, 53, y); g.bezierCurveTo(57, y - 5, 60, y + 3, 63, y - 1);
  }
  g.stroke();
}

function draw(g, family, mood, blink) {
  g.clearRect(0, 0, SIZE, SIZE);
  g.save(); g.scale(SIZE / 100, SIZE / 100);
  const L = 31, R = 69, y = 42, my = 68;
  if (mood === 'happy') {
    happyEye(g, L, y, 10); happyEye(g, R, y, 10);
    g.beginPath(); g.arc(50, 60, 15, 0, Math.PI); g.closePath(); g.fillStyle = INK; g.fill();
    g.beginPath(); g.arc(50, 74, 7, Math.PI, 2 * Math.PI); g.fillStyle = '#f87171'; g.fill();
  } else if (mood === 'oops') {
    for (const x of [L, R]) { disc(g, x, y, 13); pupil(g, x, y, 3.6, false); }
    g.beginPath(); g.ellipse(50, my + 2, 7, 9, 0, 0, Math.PI * 2); g.fillStyle = INK; g.fill();
    g.beginPath(); g.moveTo(86, 16); g.quadraticCurveTo(92, 28, 86, 31); g.quadraticCurveTo(80, 28, 86, 16); g.fillStyle = '#7dd3fc'; g.fill(); line(g, 1.6); g.stroke();
  } else if (mood === 'dizzy') {
    spiral(g, L, y, 13); spiral(g, R, y, 13); mouth(g, 'cone', my);
  } else {
    if (blink) { closedEye(g, L, y + 2, 10); closedEye(g, R, y + 2, 10); } else eyes(g, family, L, R, y);
    mouth(g, family, my);
  }
  g.restore();
}

/** Shared texture for family + mood ('blink' = eyes shut). */
export function faceTexture(family, mood = 'normal') {
  // happy, oops and dizzy faces ignore the family, so they share one texture each
  const key = ['happy', 'oops', 'dizzy'].includes(mood) ? mood : family + '|' + mood;
  let t = cache.get(key);
  if (!t) {
    const c = document.createElement('canvas'); c.width = c.height = SIZE;
    draw(c.getContext('2d'), family, mood === 'blink' ? 'normal' : mood, mood === 'blink');
    t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    t.userData.shared = true; cache.set(key, t);
  }
  return t;
}

/**
 * Curved or flat patch for the face. surf(u, v) -> [x, y, z] on the solid's surface for u, v in [-1, 1]
 * (u = right, v = up as the child sees it). Pushed out 6 mm so it never z-fights the body.
 */
export function makePatch(surf, nu = 10, nv = 10) {
  const pos = [], uv = [], idx = [];
  for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
    const u = -1 + (2 * i) / nu, v = -1 + (2 * j) / nv;
    pos.push(...surf(u, v)); uv.push(i / nu, j / nv);
  }
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
    const a = i + j * (nu + 1), b = a + 1, c = a + nu + 1, d = c + 1;
    idx.push(a, b, d, a, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  // push out along the outward normal (the solid is centred on the origin, so away from the origin is outward)
  g.computeVertexNormals();
  const p = g.attributes.position, n = g.attributes.normal, v = new THREE.Vector3(), nn = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i); nn.fromBufferAttribute(n, i);
    if (nn.dot(v) < 0) nn.negate();
    p.setXYZ(i, v.x + nn.x * 0.006, v.y + nn.y * 0.006, v.z + nn.z * 0.006);
  }
  g.userData.shared = true; // cached by solids.js
  return g;
}

/** Put a face on `group` (child of `parent`, default the group itself). patch = makePatch(...) geometry. */
export function addFace(group, family, patch, parent = group) {
  const mat = new THREE.MeshBasicMaterial({
    map: faceTexture(family, 'normal'), transparent: true, depthWrite: false, side: THREE.DoubleSide,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
  const mesh = new THREE.Mesh(patch, mat);
  mesh.name = 'face'; mesh.renderOrder = 1;
  parent.add(mesh);
  group.userData.face = { mesh, family, mood: 'normal', blinking: false };
  return mesh;
}

// The stage renders on demand, so a swapped texture needs one frame: a 1 ms tween asks for it.
const poke = () => tween({ v: 0 }, { v: 1 }, { ms: 1, ease: 'linear' });

/** mood: 'normal' | 'happy' | 'oops' | 'dizzy'. */
export function setMood(group, mood = 'normal') {
  const f = group.userData.face;
  if (!f) return Promise.resolve();
  f.mood = MOODS.includes(mood) ? mood : 'normal';
  f.mesh.material.map = faceTexture(f.family, f.mood);
  return poke();
}

/** Shut the eyes for a moment (only the normal mood blinks; other moods already have their own eyes). */
export async function blink(group) {
  const f = group.userData.face;
  if (!f || f.blinking) return;
  f.blinking = true;
  try {
    if (f.mood === 'normal') {
      f.mesh.material.map = faceTexture(f.family, 'blink');
      await tween({ v: 0 }, { v: 1 }, { ms: 160, ease: 'linear' });
      f.mesh.material.map = faceTexture(f.family, f.mood);
    }
    await poke();
  } finally { f.blinking = false; }
}
