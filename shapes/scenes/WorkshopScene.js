// The Workshop map 工場: one 3-D floor with a pad for every station. The child's robot stands on the pad it
// visited last, walks to the pad that is tapped and then the scene starts (the Rod Town "Next" pattern).
//
// Start data: { justDone?: { key, stars, newBest, part }, goTo?: course key | 'rush-a' | 'rush-b' | null }.
//  - justDone: the medal of that pad pops (and "new part" shows); goTo: the robot walks on to that pad and starts it.
// Two floor plans, picked by whichever lets the camera sit closest for the current screen shape:
//  'wide' both zones side by side (landscape), 'stack' zones in two rows of five (tablets), 'tall' a 3-column snake (phone portrait).
// The robot's name chip, the trophy and home buttons are DOM (in #ui, like BootScene) so they stay big and crisp.
import * as THREE from 'three';
import { Scene } from '../engine/scenes.js?v=202610051406';
import { tween, wait, motion } from '../engine/tween.js?v=202610051406';
import { disposeTree, blobShadow } from '../engine/stage.js?v=202610051406';
import { voice } from '../engine/voice.js?v=202610051406';
import { FONT, SCENE, toyColor } from '../theme.js?v=202610051406';
import { sfx } from '../sfx.js?v=202610051406';
import { sparkle, confetti } from '../fx3d.js?v=202610051406';
import { makeRobot } from '../models/robot.js?v=202610051406';
import { makeSolid, blink } from '../models/solids.js?v=202610051406';
import { COURSES, ZONES, PARTS, lcg, nextCourse, robotName, isCourseOpen, isRushOpen, isBossOpen, isZoneOpen, isZoneCleared } from '../../shapes-logic.js?v=202610051406';

// ------------------------------------------------------------------ stations
const ZONE_COLOR = { a: 0xf59e0b, b: 0x0ea5e9 };
const ZONE_CSS = { a: '#d97706', b: '#0284c7' };
const STATIONS = {};
for (const c of COURSES) STATIONS[c.key] = { key: c.key, kind: 'course', zone: c.zone, zh: c.zh, en: c.en, badge: c.key, color: ZONE_COLOR[c.zone], css: ZONE_CSS[c.zone] };
STATIONS['rush-a'] = { key: 'rush-a', kind: 'rush', zone: 'a', zh: '快手挑戰', en: 'Rush 3-D', badge: '⚡', color: 0xa855f7, css: '#9333ea' };
STATIONS['rush-b'] = { key: 'rush-b', kind: 'rush', zone: 'b', zh: '快手挑戰', en: 'Rush 2-D', badge: '⚡', color: 0xa855f7, css: '#9333ea' };
STATIONS.boss = { key: 'boss', kind: 'boss', zh: '測試跑道', en: 'Test Track', badge: '🏁', color: 0xef4444, css: '#dc2626' };
STATIONS.garage = { key: 'garage', kind: 'garage', zh: '我的機械人', en: 'My Robot', badge: '🔧', color: 0x22c55e, css: '#16a34a' };
STATIONS.free = { key: 'free', kind: 'free', zh: '自由創作', en: 'Free Build', badge: '🎨', color: 0xec4899, css: '#db2777' };
STATIONS.gallery = { key: 'gallery', kind: 'gallery', zh: '展覽廳', en: 'Gallery', badge: '🖼️', color: 0x14b8a6, css: '#0d9488' };

const ZONE_BANNER = {
  a: { zh: ZONES.a.zh, en: ZONES.a.en, css: ZONE_CSS.a },
  b: { zh: ZONES.b.zh, en: ZONES.b.en, css: ZONE_CSS.b },
};

const LOCK = {
  teacher: ['老師未開放', "Teacher hasn't opened this yet"],
  prev: ['先完成上一關', 'Finish the previous course first'],
  clear: ['完成全部關卡才可開始', 'Clear every course first'],
};

/** Where a station leads: [scene key, start data]. */
function targetOf(key) {
  if (/^[AB]\d$/.test(key)) return [key, { key }];
  if (key === 'rush-a') return ['Rush', { zone: 'a' }];
  if (key === 'rush-b') return ['Rush', { zone: 'b' }];
  if (key === 'boss') return ['Boss'];
  if (key === 'free') return ['FreeBuild', { mode: 'peg' }];
  return [{ garage: 'Garage', gallery: 'Gallery' }[key]];
}

// ------------------------------------------------------------------ floor plans
const PAD_H = 0.14; // top surface of a pad

/** hasGallery false: the front row has two pads. Returns pad positions, banners, scenery spots and the points the camera must fit. */
function makeLayout(name, hasGallery) {
  const L = { name, pads: [], banners: [], friends: [], props: [] };
  const front = ['garage', 'free', ...(hasGallery ? ['gallery'] : [])];
  if (name === 'wide') {
    Object.assign(L, { padR: 0.8, signW: 2.05, signH: 0.95, pitch: (48 * Math.PI) / 180, topPx: 12, botPx: 66, floor: [-12, 12, -7.3, 6.8], wallZ: -7.6, roadW: 7 });
    const sp = 2.2, rowZ = 0;
    ZONES.a.keys.concat('rush-a').forEach((k, i) => L.pads.push({ key: k, x: -10.2 + i * sp, z: rowZ }));
    ZONES.b.keys.concat('rush-b').forEach((k, i) => L.pads.push({ key: k, x: 1.4 + i * sp, z: rowZ }));
    L.pads.push({ key: 'boss', x: 0, z: -5.1 });
    const xs = hasGallery ? [-4.4, 0, 4.4] : [-2.2, 2.2];
    front.forEach((k, i) => L.pads.push({ key: k, x: xs[i], z: 4.5 }));
    L.banners.push({ zone: 'a', x: -5.8, z: -2.5, w: 5.6 }, { zone: 'b', x: 5.8, z: -2.5, w: 5.6 });
    L.paths = [[-10.2, 0, -1.4, 0], [1.4, 0, 10.2, 0]];
    L.friends = [[-10, 4.7], [-8.6, 5.3], [-7.2, 4.7], [7.2, 4.8], [9.0, 5.3]];
    L.windows = [-9.2, -6.2, 6.2, 9.2]; L.gears = [-2.4, 2.4];
    L.props = [['conveyor', -8.2, -5.7], ['toolbox', -5.2, -5.9], ['toolbox', 5.4, -5.9], ['crates', 8.6, -5.7]];
    L.road = [0, -5.1];
  } else if (name === 'stack') {
    Object.assign(L, { padR: 0.85, signW: 2.15, signH: 1.0, pitch: (50 * Math.PI) / 180, topPx: 12, botPx: 66, floor: [-6.7, 6.7, -13.2, 7.2], wallZ: -13.5, roadW: 6.4 });
    const sp = 2.3;
    ZONES.a.keys.concat('rush-a').forEach((k, i) => L.pads.push({ key: k, x: (i - 2) * sp, z: -6 }));
    ZONES.b.keys.concat('rush-b').forEach((k, i) => L.pads.push({ key: k, x: (i - 2) * sp, z: -0.4 }));
    L.pads.push({ key: 'boss', x: 0, z: -11.6 });
    const xs = hasGallery ? [-3.4, 0, 3.4] : [-1.7, 1.7];
    front.forEach((k, i) => L.pads.push({ key: k, x: xs[i], z: 3.9 }));
    L.banners.push({ zone: 'a', x: 0, z: -8.1, w: 5.4 }, { zone: 'b', x: 0, z: -2.5, w: 5.4 });
    L.paths = [[-2 * sp, -6, 2 * sp, -6], [-2 * sp, -0.4, 2 * sp, -0.4]];
    L.friends = [[-4.8, -12.3], [-4.8, -10.5], [4.8, -12.3], [4.8, -10.5], [-4.8, -8.9]];
    L.windows = [-3.6, 3.6]; L.gears = [0];
    L.props = [['toolbox', 4.8, -8.9]];
    L.road = [0, -11.6];
  } else {
    Object.assign(L, { padR: 0.95, signW: 3.0, signH: 1.1, pitch: (52 * Math.PI) / 180, topPx: 56, botPx: 66, floor: [-5.7, 5.7, -16.1, 11.2], wallZ: -16.4, roadW: 6.4 });
    const sp = 3.3;
    const snake = (keys, z0) => keys.forEach((k, i) => L.pads.push(i < 3 ? { key: k, x: (i - 1) * sp, z: z0 } : { key: k, x: i === 3 ? sp : 0, z: z0 + 3.4 }));
    snake(ZONES.a.keys.concat('rush-a'), -8.6);
    snake(ZONES.b.keys.concat('rush-b'), 0.4);
    L.pads.push({ key: 'boss', x: 0, z: -14.2 });
    const xs = hasGallery ? [-sp, 0, sp] : [-1.7, 1.7];
    front.forEach((k, i) => L.pads.push({ key: k, x: xs[i], z: 8 }));
    L.banners.push({ zone: 'a', x: 0, z: -11.3, w: 5.4 }, { zone: 'b', x: 0, z: -1.9, w: 5.4 });
    L.paths = [[-sp, -8.6, sp, -8.6], [sp, -8.6, sp, -5.2], [sp, -5.2, 0, -5.2], [-sp, 0.4, sp, 0.4], [sp, 0.4, sp, 3.8], [sp, 3.8, 0, 3.8]];
    L.friends = [[-4.5, -14.4], [-4.5, -12.5], [4.5, -14.4], [4.5, -12.5], [-4.5, -10.6]];
    L.windows = [-3.8, 3.8]; L.gears = [0];
    L.props = [['toolbox', 4.5, -10.4]];
    L.road = [0, -14.2];
  }
  const pad = L.padR, fp = L.signH * Math.sin(L.pitch);
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  const grow = (a, b, c, d) => { x0 = Math.min(x0, a); x1 = Math.max(x1, b); z0 = Math.min(z0, c); z1 = Math.max(z1, d); };
  for (const p of L.pads) grow(p.x - Math.max(pad + 0.1, L.signW / 2), p.x + Math.max(pad + 0.1, L.signW / 2), p.z - pad - 0.1, p.z + pad + 0.3 + fp);
  for (const b of L.banners) grow(b.x - b.w / 2, b.x + b.w / 2, b.z - 0.6, b.z + 0.6);
  L.cx = (x0 + x1) / 2; L.cz = (z0 + z1) / 2;
  L.fitPts = [];
  for (const [x, z, y] of [[x0, z0, 1.9], [x1, z0, 1.9], [x0, z1, 0], [x1, z1, 0], [x0, z0, 0], [x1, z0, 0]]) L.fitPts.push(new THREE.Vector3(x, y, z));
  return L;
}

// ------------------------------------------------------------------ camera fit
const fitCam = new THREE.PerspectiveCamera(40, 1, 0.1, 300);
/** Smallest camera distance that shows every fit point inside the screen margins; also centres the view. */
let safeBottomPx = null;
/** env(safe-area-inset-bottom) in px, read once through a hidden probe. */
function safeBottom() {
  if (safeBottomPx === null) {
    safeBottomPx = 0;
    try {
      const d = document.createElement('div');
      d.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none;padding-bottom:env(safe-area-inset-bottom,0px)';
      document.body.appendChild(d);
      safeBottomPx = parseFloat(getComputedStyle(d).paddingBottom) || 0;
      d.remove();
    } catch (e) { /* ignore */ }
  }
  return safeBottomPx;
}
function fitCamera(L, W, H) {
  const cam = fitCam; cam.aspect = W / H; cam.updateProjectionMatrix();
  const lim = { x: 1 - 28 / W, top: 1 - (2 * L.topPx) / H, bot: -(1 - (2 * (L.botPx + safeBottom())) / H) };
  const dir = new THREE.Vector3(0, Math.sin(L.pitch), Math.cos(L.pitch));
  const look = new THREE.Vector3(L.cx, 0.3, L.cz), v = new THREE.Vector3();
  let d = 20, box = null;
  const place = () => { cam.position.copy(look).addScaledVector(dir, d); cam.lookAt(look); cam.updateMatrixWorld(true); };
  const measure = () => {
    const b = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity, ok: true };
    for (const p of L.fitPts) {
      v.copy(p).applyMatrix4(cam.matrixWorldInverse);
      if (v.z > -0.5) b.ok = false;
      v.copy(p).project(cam);
      b.x0 = Math.min(b.x0, v.x); b.x1 = Math.max(b.x1, v.x); b.y0 = Math.min(b.y0, v.y); b.y1 = Math.max(b.y1, v.y);
    }
    return b;
  };
  const fits = () => { place(); box = measure(); return box.ok && box.x0 >= -lim.x && box.x1 <= lim.x && box.y1 <= lim.top && box.y0 >= lim.bot; };
  for (let pass = 0; pass < 4; pass++) {
    let lo = 4, hi = 200;
    for (let i = 0; i < 26; i++) { const mid = (lo + hi) / 2; d = mid; if (fits()) hi = mid; else lo = mid; }
    d = hi; fits();
    if (pass === 3) break;
    const hh = d * Math.tan((20 * Math.PI) / 180), hw = hh * cam.aspect;
    const right = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0), up = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 1);
    look.addScaledVector(right, ((box.x0 + box.x1) / 2) * hw).addScaledVector(up, ((box.y0 + box.y1) / 2 - (lim.top + lim.bot) / 2) * hh);
  }
  return { d, pos: cam.position.clone(), look: look.clone() };
}

// ------------------------------------------------------------------ canvas helpers
function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function rrect(g, x, y, w, h, r) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
function fitText(g, text, maxW, size, weight = 'bold') {
  for (; size > 8; size -= 2) { g.font = `${weight} ${size}px ${FONT}`; if (g.measureText(text).width <= maxW) break; }
  return size;
}
function texOf(c, repeat) {
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  return t;
}
const EMOJI_FONT = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';

/** Pad sign: badge, big Chinese line, small English line. */
function signTexture(st, W, H, locked) {
  const c = canvas(W, H), g = c.getContext('2d');
  const edge = locked ? '#9ca3af' : st.css;
  g.fillStyle = locked ? '#e5e7eb' : '#fffbeb'; rrect(g, 6, 6, W - 12, H - 12, H * 0.22); g.fill();
  g.lineWidth = 10; g.strokeStyle = edge; g.stroke();
  const bd = H * 0.62, bx = 22 + bd / 2, by = H / 2;
  g.fillStyle = locked ? '#9ca3af' : st.css; g.beginPath(); g.arc(bx, by, bd / 2, 0, Math.PI * 2); g.fill();
  g.textAlign = 'center'; g.textBaseline = 'middle';
  if (st.kind === 'course') { g.fillStyle = '#fff'; g.font = `bold ${bd * 0.55}px ${FONT}`; g.fillText(st.badge, bx, by + 2); }
  else { g.font = `${bd * 0.6}px ${EMOJI_FONT}`; g.globalAlpha = locked ? 0.55 : 1; g.fillText(st.badge, bx, by + 3); g.globalAlpha = 1; }
  const tx = 22 + bd + 14, tw = W - tx - 24, cx = tx + tw / 2;
  g.fillStyle = locked ? '#6b7280' : '#1f2937';
  const two = st.zh.length >= 6; // a long name (生活中的立體) goes on two lines instead of shrinking
  if (two) {
    const h = Math.ceil(st.zh.length / 2), a = st.zh.slice(0, h), b = st.zh.slice(h);
    const zs = Math.min(fitText(g, a, tw, H * 0.3), fitText(g, b, tw, H * 0.3)); g.font = `bold ${zs}px ${FONT}`;
    g.fillText(a, cx, H * 0.26); g.fillText(b, cx, H * 0.53);
  } else { const zs = fitText(g, st.zh, tw, H * 0.4); g.font = `bold ${zs}px ${FONT}`; g.fillText(st.zh, cx, H * 0.36); }
  g.fillStyle = locked ? '#9ca3af' : '#6b7280';
  const es = fitText(g, st.en, tw, two ? H * 0.17 : H * 0.2, 'normal'); g.font = `${es}px ${FONT}`; g.fillText(st.en, cx, two ? H * 0.8 : H * 0.74);
  return texOf(c);
}

function bannerTexture(zone, cleared, W, H) {
  const b = ZONE_BANNER[zone], c = canvas(W, H), g = c.getContext('2d');
  g.fillStyle = b.css; rrect(g, 6, 6, W - 12, H - 12, H * 0.3); g.fill();
  g.lineWidth = 8; g.strokeStyle = '#fff'; g.stroke();
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#fff';
  const zh = cleared ? `${b.zh} ✅` : b.zh;
  const zs = fitText(g, zh, W * 0.84, H * 0.5); g.font = `bold ${zs}px ${FONT}`; g.fillText(zh, W / 2, H * 0.4);
  const es = fitText(g, b.en, W * 0.8, H * 0.24, 'normal'); g.font = `${es}px ${FONT}`; g.fillText(b.en, W / 2, H * 0.78);
  return texOf(c);
}

const emojiTex = ch => { const c = canvas(128, 128), g = c.getContext('2d'); g.font = `104px ${EMOJI_FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(ch, 64, 70); return texOf(c); };

function floorTexture() {
  const c = canvas(128, 128), g = c.getContext('2d');
  g.fillStyle = '#f3e3c8'; g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#ead7b6'; g.fillRect(0, 0, 64, 64); g.fillRect(64, 64, 64, 64);
  g.strokeStyle = 'rgba(160,120,70,0.35)'; g.lineWidth = 3; g.strokeRect(0, 0, 128, 128);
  const t = texOf(c, true); t.repeat.set(1 / 2.2, 1 / 2.2); return t;
}
function roadTexture() {
  const c = canvas(512, 192), g = c.getContext('2d');
  g.fillStyle = '#374151'; g.fillRect(0, 0, 512, 192);
  for (let i = 0; i < 16; i++) { g.fillStyle = i % 2 ? '#fff' : '#ef4444'; g.fillRect(i * 32, 0, 32, 14); g.fillRect(i * 32, 178, 32, 14); }
  g.fillStyle = '#e5e7eb'; for (let i = 0; i < 6; i++) g.fillRect(40 + i * 62, 92, 34, 8);
  for (let r = 0; r < 6; r++) for (let k = 0; k < 2; k++) { g.fillStyle = (r + k) % 2 ? '#111827' : '#fff'; g.fillRect(468 + k * 22, 20 + r * 25, 22, 25); }
  return texOf(c);
}
function windowTexture() {
  const c = canvas(160, 128), g = c.getContext('2d');
  g.fillStyle = '#fff'; rrect(g, 2, 2, 156, 124, 10); g.fill();
  g.fillStyle = '#bae6fd'; g.fillRect(12, 12, 136, 104);
  g.fillStyle = 'rgba(255,255,255,0.6)'; g.beginPath(); g.moveTo(20, 108); g.lineTo(60, 20); g.lineTo(78, 20); g.lineTo(38, 108); g.fill();
  g.fillStyle = '#fff'; g.fillRect(77, 12, 6, 104); g.fillRect(12, 61, 136, 6);
  return texOf(c);
}
function pathTexture() {
  const c = canvas(64, 32), g = c.getContext('2d');
  g.fillStyle = '#64748b'; g.fillRect(0, 0, 64, 32);
  g.strokeStyle = '#cbd5e1'; g.lineWidth = 5; g.lineCap = 'round'; g.lineJoin = 'round';
  g.beginPath(); g.moveTo(20, 7); g.lineTo(34, 16); g.lineTo(20, 25); g.stroke();
  return texOf(c, true);
}

function gearGeometry(r, teeth) {
  const s = new THREE.Shape(), n = teeth * 4;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2, rad = i % 4 < 2 ? r : r * 0.8;
    const x = Math.cos(a) * rad, y = Math.sin(a) * rad;
    if (i === 0) s.moveTo(x, y); else s.lineTo(x, y);
  }
  const hole = new THREE.Path(); hole.absarc(0, 0, r * 0.28, 0, Math.PI * 2, true); s.holes.push(hole);
  return new THREE.ExtrudeGeometry(s, { depth: 0.14, bevelEnabled: false });
}

const lam = (color, extra = {}) => new THREE.MeshLambertMaterial({ color, ...extra });
const FRIENDS = ['sphere', 'cylinder', 'cone', 'cube', 'sqPyramid'];

// ================================================================== scene
export class WorkshopScene extends Scene {
  async enter(data) {
    const { justDone, goTo } = data || {};
    const { bridge, ui } = this;
    this.pads = {}; this.friends = []; this.gears = [];
    this.busy = true; this.walking = false; this.ready = false;
    this.t = 0; this.acc = 0; this.sz = [0, 0];
    this.layout = null; this.fit = null; this.world = null;
    const jd = justDone && STATIONS[justDone.key] ? justDone : null;
    this.shown = jd ? { [jd.key]: jd.stars } : {}; // stars to show for a pad even when bridge.progress lacks them (test mode)
    this.hidden = new Set(jd && jd.newBest ? [jd.key] : []); // medals that will pop in a moment

    this.robot = makeRobot(bridge.progress.robot);
    this.robot.add(blobShadow(0.62));
    this.root.add(this.robot);
    this.here = this.lastPad(jd);
    this.buildHud();
    this.relayout();
    this.input.onTap(() => Object.values(this.pads).map(p => p.group), g => this.onPad(g.userData.padKey));
    this.input.onTap(() => [this.robot], () => this.onPad(this.here));
    this.ready = true;
    this.busy = false;
    this.stage.invalidate();

    if (jd || (goTo && this.pads[goTo])) await this.afterCourse(jd, goTo);
    else await this.maybeWellDone();
  }

  async exit() { /* nothing is held awake: idle motion only pokes invalidate(); DOM hud is removed by ui.clear() */ }

  // ---------------------------------------------------------------- state
  get unlock() { return this.bridge.settings.shapesUnlock || {}; }
  get hasGallery() { return this.bridge.gallery.enabled; }
  starsOf(key) { return Math.max(this.bridge.progress.stars[key] || 0, this.shown[key] || 0); }

  /** { open, reason: 'teacher'|'prev'|'clear'|null, stars } */
  padState(key) {
    const { bridge } = this, p = bridge.progress, u = this.unlock, test = bridge.testMode, st = STATIONS[key];
    let open = true, reason = null;
    if (st.kind === 'course') {
      open = isCourseOpen(p, key, u, test);
      if (!open) reason = isZoneOpen(p, st.zone, u, test) ? 'prev' : 'teacher';
    } else if (st.kind === 'rush') {
      open = isRushOpen(p, st.zone, u, test);
      if (!open) reason = isZoneOpen(p, st.zone, u, test) ? 'clear' : 'teacher';
    } else if (st.kind === 'boss') {
      open = isBossOpen(p, u, test);
      if (!open) reason = u.a && u.b ? 'clear' : 'teacher';
    } else if (st.kind === 'free' || st.kind === 'gallery') {
      open = !!test || !!(u.a || u.b);
      if (!open) reason = 'teacher';
    }
    const stars = st.kind === 'course' || st.kind === 'boss' ? this.starsOf(key) : 0;
    return { open, reason, stars };
  }

  lastPad(jd) {
    let k = null;
    try { k = sessionStorage.getItem('robot.lastPad'); } catch (e) { /* ignore */ }
    if (!k && jd) k = jd.key;
    const ok = key => STATIONS[key] && (key !== 'gallery' || this.hasGallery);
    return ok(k) ? k : 'garage';
  }
  saveLast(k) { try { sessionStorage.setItem('robot.lastPad', k); } catch (e) { /* ignore */ } }

  // ---------------------------------------------------------------- layout, camera
  relayout() {
    const W = this.stage.width, H = this.stage.height;
    this.sz = [W, H];
    // the plan whose signs come out biggest on this screen (sign width in world units / camera distance)
    const cands = ['wide', 'stack', 'tall'].map(n => { const L = makeLayout(n, this.hasGallery); return { L, f: fitCamera(L, W, H) }; });
    cands.sort((a, b) => b.L.signW / b.f.d - a.L.signW / a.f.d);
    const { L, f } = cands[0];
    this.fit = f;
    if (!this.layout || this.layout.name !== L.name) {
      this.buildWorld(L);
      const p = this.pads[this.here] || this.pads.garage;
      this.robot.position.set(p.x, PAD_H, p.z);
    }
    this.view(this.robot.position.x, this.robot.position.z, 0);
  }

  /** Camera = the fitted view (everything is always on screen), eased a touch toward the robot's row. */
  view(x, z, ms) {
    const { pos, look } = this.fit, sz = (z - look.z) * 0.06;
    return this.stage.setView([pos.x, pos.y, pos.z + sz], [look.x, look.y, look.z + sz], ms);
  }

  // ---------------------------------------------------------------- world
  buildWorld(L) {
    if (this.world) { this.root.remove(this.world); disposeTree(this.world); }
    this.layout = L; this.pads = {}; this.friends = []; this.gears = [];
    const w = this.world = new THREE.Group();
    this.root.add(w);
    this.buildFloorAndWall(w, L);
    this.buildScenery(w, L);
    this.buildPads(w, L);
    this.buildFriends(w, L);
    this.stage.invalidate();
  }

  buildFloorAndWall(w, L) {
    const [x0, x1, z0, z1] = L.floor, r = 0.9;
    const s = new THREE.Shape(), y0 = -z1, y1 = -z0; // shape y becomes world -z
    s.moveTo(x0 + r, y0); s.lineTo(x1 - r, y0); s.absarc(x1 - r, y0 + r, r, -Math.PI / 2, 0); s.lineTo(x1, y1 - r); s.absarc(x1 - r, y1 - r, r, 0, Math.PI / 2);
    s.lineTo(x0 + r, y1); s.absarc(x0 + r, y1 - r, r, Math.PI / 2, Math.PI); s.lineTo(x0, y0 + r); s.absarc(x0 + r, y0 + r, r, Math.PI, Math.PI * 1.5);
    const geo = new THREE.ExtrudeGeometry(s, { depth: 0.4, bevelEnabled: false });
    geo.rotateX(-Math.PI / 2); geo.translate(0, -0.4, 0);
    const floor = new THREE.Mesh(geo, [lam(0xffffff, { map: floorTexture() }), lam(0xc9a66b)]);
    w.add(floor);

    const ww = x1 - x0, wall = new THREE.Mesh(new THREE.BoxGeometry(ww, 5, 0.3), lam(SCENE.wall));
    wall.position.set((x0 + x1) / 2, 2.5, L.wallZ); w.add(wall);
    const bench = new THREE.Mesh(new THREE.BoxGeometry(ww, 0.5, 0.35), lam(SCENE.bench));
    bench.position.set((x0 + x1) / 2, 0.25, L.wallZ + 0.3); w.add(bench);
    const winTex = windowTexture(), winGeo = new THREE.PlaneGeometry(1.9, 1.52);
    for (const x of L.windows) {
      const m = new THREE.Mesh(winGeo, new THREE.MeshBasicMaterial({ map: winTex, transparent: true }));
      m.position.set(x, 3, L.wallZ + 0.17); w.add(m);
    }
    const gg = gearGeometry(0.75, 9);
    L.gears.forEach((x, i) => {
      const g = new THREE.Mesh(gg, lam(i % 2 ? 0xf59e0b : SCENE.metal));
      g.position.set(x, 3.1, L.wallZ + 0.16); g.rotation.z = i; w.add(g); this.gears.push({ m: g, sp: i % 2 ? -0.25 : 0.25 });
    });
  }

  buildScenery(w, L) {
    // boss track
    const [rx, rz] = L.road;
    const road = new THREE.Mesh(new THREE.PlaneGeometry(L.roadW, 2.6), new THREE.MeshBasicMaterial({ map: roadTexture() }));
    road.rotation.x = -Math.PI / 2; road.position.set(rx, 0.012, rz); w.add(road);
    // conveyor paths between the pads of a zone
    const pt = pathTexture();
    for (const [ax, az, bx, bz] of L.paths) {
      const len = Math.hypot(bx - ax, bz - az), g = new THREE.PlaneGeometry(len, 0.5), uv = g.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * len * 1.2);
      const t = pt.clone(); t.needsUpdate = true;
      const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: t }));
      m.rotation.order = 'YXZ'; m.rotation.set(-Math.PI / 2, -Math.atan2(bz - az, bx - ax), 0); // flat, long side along the path
      m.position.set((ax + bx) / 2, 0.01, (az + bz) / 2);
      w.add(m);
    }
    // props
    for (const [kind, x, z] of L.props) {
      if (kind === 'toolbox') {
        const b = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.5, 0.55), lam(0xef4444)); b.position.set(x, 0.25, z);
        const lid = new THREE.Mesh(new THREE.BoxGeometry(1, 0.12, 0.6), lam(0xb91c1c)); lid.position.set(x, 0.56, z);
        w.add(b, lid);
      } else if (kind === 'crates') {
        const a = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 0.8), lam(0xd9a066)); a.position.set(x, 0.4, z);
        const b = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.6), lam(0xc08a50)); b.position.set(x + 0.2, 1.1, z + 0.05); b.rotation.y = 0.4;
        w.add(a, b);
      } else if (kind === 'conveyor') {
        const belt = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.3, 0.9), lam(SCENE.dark)); belt.position.set(x, 0.28, z);
        const rg = new THREE.CylinderGeometry(0.2, 0.2, 0.95, 12);
        for (const dx of [-1.8, 1.8]) { const r = new THREE.Mesh(rg, lam(SCENE.metal)); r.rotation.x = Math.PI / 2; r.position.set(x + dx, 0.28, z); w.add(r); }
        const parcel = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.45, 0.55), lam(0x22c55e)); parcel.position.set(x - 0.5, 0.65, z);
        w.add(belt, parcel);
      }
    }
    // zone banners
    const bh = L.name === 'wide' ? 1.0 : 1.1;
    for (const b of L.banners) {
      const cleared = isZoneCleared(this.bridge.progress, b.zone);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(b.w, bh), new THREE.MeshBasicMaterial({ map: bannerTexture(b.zone, cleared, 640, Math.round(640 * bh / b.w)), transparent: true }));
      this.tilt(m, bh, L); m.position.set(b.x, m.position.y, b.z); w.add(m);
    }
  }

  /** Lean a plate of height h back toward the camera, resting on the floor. */
  tilt(m, h, L) {
    m.rotation.x = -L.pitch;
    m.position.y = (h / 2) * Math.cos(L.pitch) + 0.03;
  }

  buildPads(w, L) {
    const r = L.padR, rimGeo = new THREE.CylinderGeometry(r + 0.1, r + 0.14, 0.12, 36), topGeo = new THREE.CylinderGeometry(r, r, 0.04, 36);
    const rimOpen = lam(0x475569), rimLocked = lam(0x6b7280), rimBoss = lam(0xf1f5f9); // the boss pad needs a light rim on the dark road
    const f = this.fit, tanH = Math.tan((20 * Math.PI) / 180), cam = f.pos, sinP = Math.sin(L.pitch);
    const signW = L.signW, signH = L.signH, signGeo = new THREE.PlaneGeometry(signW, signH);
    const fp = signH * Math.sin(L.pitch);
    const lockTex = emojiTex('🔒'), medalTex = [null, emojiTex('🥉'), emojiTex('🥈'), emojiTex('🥇')];
    this.tex = { medal: medalTex };
    for (const p of L.pads) {
      const st = STATIONS[p.key], state = this.padState(p.key);
      const g = new THREE.Group(); g.position.set(p.x, 0, p.z); g.userData.padKey = p.key;
      const rim = new THREE.Mesh(rimGeo, st.kind === 'boss' ? rimBoss : state.open ? rimOpen : rimLocked); rim.position.y = 0.06;
      const top = new THREE.Mesh(topGeo, state.open ? lam(st.color, { emissive: st.color, emissiveIntensity: 0.25 }) : lam(0x9ca3af));
      top.position.y = PAD_H - 0.02;
      const sign = new THREE.Mesh(signGeo, new THREE.MeshBasicMaterial({ map: signTexture(st, 512, Math.round(512 * signH / signW), !state.open), transparent: true }));
      this.tilt(sign, signH, L); sign.position.z = r + 0.14 + fp / 2;
      // invisible, larger tap target: at least ~56 px tall on screen at this pad's distance from the camera
      const dist = Math.hypot(cam.x - p.x, cam.y, cam.z - p.z), pxPerUnit = (this.stage.height / 2) / (dist * tanH);
      let near = Infinity; for (const q of L.pads) if (q !== p) near = Math.min(near, Math.hypot(q.x - p.x, q.z - p.z));
      const hitR = Math.min(Math.max(r + 0.1, 34 / (pxPerUnit * sinP)), near * 0.6 - 0.05);
      const hit = new THREE.Mesh(new THREE.CylinderGeometry(hitR, hitR, 0.12, 24), new THREE.MeshBasicMaterial({ visible: false }));
      hit.position.y = 0.08;
      g.add(rim, top, sign, hit);
      const pad = { key: p.key, x: p.x, z: p.z, group: g, top, state, medal: null, lock: null, glow: state.open };
      if (!state.open) {
        const lock = new THREE.Sprite(new THREE.SpriteMaterial({ map: lockTex, transparent: true, depthTest: false }));
        lock.scale.set(r * 0.9, r * 0.9, 1); lock.position.set(0, 0.62, 0); lock.renderOrder = 5; g.add(lock); pad.lock = lock;
      } else if (state.stars > 0 && !this.hidden.has(p.key)) this.setMedal(pad, state.stars);
      this.pads[p.key] = pad;
      w.add(g);
    }
  }

  medalSize() { return this.layout.padR * 1.5; }
  setMedal(pad, stars) {
    if (pad.medal) { pad.group.remove(pad.medal); pad.medal.material.dispose(); }
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tex.medal[stars], transparent: true, depthWrite: false }));
    const sz = this.medalSize();
    s.scale.set(sz, sz, 1); s.position.set(this.layout.padR + 0.1, 1.15, -this.layout.padR * 0.2); s.renderOrder = 5;
    pad.group.add(s); pad.medal = s;
    return s;
  }

  buildFriends(w, L) {
    const rng = lcg(11);
    FRIENDS.forEach((id, i) => {
      const spot = L.friends[i]; if (!spot) return;
      const f = makeSolid(id, { color: toyColor(rng) });
      f.scale.setScalar(0.85);
      f.position.set(spot[0], f.userData.restY * 0.85, spot[1]);
      f.rotation.y = spot[0] < 0 ? 0.35 : -0.35;
      w.add(f);
      this.friends.push({ obj: f, holder: f.children[0], phase: i * 1.7, nextBlink: 1.5 + i * 0.9 });
    });
  }

  // ---------------------------------------------------------------- HUD (DOM in #ui)
  buildHud() {
    const root = document.getElementById('ui');
    const mk = (cls, text, label) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = `bubbly-btn pointer-events-auto ${cls}`; b.style.fontFamily = FONT;
      if (text) b.textContent = text;
      if (label) b.setAttribute('aria-label', label);
      return b;
    };
    const trophy = mk('absolute left-2 top-2 w-12 h-12 rounded-xl bg-white/90 text-2xl border-2 border-yellow-400', '🏆', '排行榜 Leaderboard');
    trophy.addEventListener('click', () => { if (!this.busy) this.bridge.showLeaderboard('a'); });
    const home = mk('absolute top-2 w-12 h-12 rounded-xl bg-white/90 text-2xl border-2 border-gray-300', '🏠', '返回遊戲 Back to games');
    home.style.left = '60px';
    home.addEventListener('click', () => { if (!this.busy) location.href = 'index.html'; });
    const chip = mk('absolute left-1/2 rounded-2xl bg-white/95 border-4 border-emerald-300 px-4 py-1 leading-tight text-gray-800', '', '我的機械人 My Robot');
    chip.style.transform = 'translateX(-50%)'; chip.style.bottom = 'max(8px, env(safe-area-inset-bottom))'; chip.style.minHeight = '52px'; chip.style.minWidth = '120px';
    chip.addEventListener('click', () => { if (!this.busy) this.onPad('garage'); });
    this.chip = chip;
    const name = this.bridge.progress.robot.name;
    const zh = document.createElement('div'), en = document.createElement('div');
    zh.className = 'text-lg font-bold'; en.className = 'text-xs text-gray-500';
    if (name) { zh.textContent = `🤖 ${robotName(name)}`; en.textContent = '我的機械人 My Robot'; }
    else { zh.textContent = '🤖 幫我改名'; en.textContent = 'Name me'; }
    chip.append(zh, en);
    chip.setAttribute('aria-label', name ? `${robotName(name)} 我的機械人 My Robot` : '幫我改名 Name me');
    const wrap = document.createElement('div');
    wrap.className = 'absolute inset-0'; wrap.style.pointerEvents = 'none';
    wrap.append(trophy, home, chip);
    root.appendChild(wrap);
  }

  // ---------------------------------------------------------------- idle life (off with Less motion)
  update(dt) {
    if (!this.ready || !this.alive) return;
    const [W, H] = this.sz, st = this.stage;
    if ((st.width !== W || st.height !== H) && !this.walking) this.relayout();
    if (motion.less) return;
    this.t += dt; this.acc += dt;
    if (this.acc < 1 / 12) return; // ~12 frames a second is plenty for a gentle idle
    this.acc = 0;
    const t = this.t;
    for (const p of Object.values(this.pads)) if (p.glow) p.top.material.emissiveIntensity = 0.22 + 0.16 * (0.5 + 0.5 * Math.sin(t * 2.2 + p.x));
    for (const f of this.friends) {
      f.holder.position.y = Math.abs(Math.sin(t * 2 + f.phase)) * 0.06;
      if (t > f.nextBlink) { f.nextBlink = t + 2.5 + Math.random() * 3; blink(f.obj); }
    }
    for (const g of this.gears) g.m.rotation.z += g.sp * (1 / 12);
    st.invalidate();
  }

  // ---------------------------------------------------------------- taps and walking
  async onPad(key) {
    if (this.busy || !this.alive) return;
    const pad = this.pads[key]; if (!pad) return;
    if (!pad.state.open) {
      sfx.bonk();
      const [zh, en] = LOCK[pad.state.reason] || LOCK.teacher;
      try { voice.say(zh); } catch (e) { /* ignore */ } // children this age can't read the reason yet
      this.busy = true;
      await this.live(this.ui.card({ zh, en, icon: '🔒', buttons: [{ id: 'ok', zh: '知道了', en: 'OK' }] }));
      this.busy = false;
      return;
    }
    await this.launch(key);
  }

  /** Walk to the pad, hop, then start its scene. */
  async launch(key) {
    const pad = this.pads[key]; if (!pad) return;
    this.busy = true;
    try {
      await this.walkTo(pad);
      this.saveLast(key);
      await this.live(this.robot.userData.hop({ on: n => { if (n === 'boing') sfx.boing(); else if (n === 'land') sfx.pop(); } }));
      const [scene, data] = targetOf(key);
      this.go(scene, data).catch(e => { console.error(e); this.busy = false; });
    } catch (e) { console.error(e); this.busy = false; }
  }

  async walkTo(pad) {
    const r = this.robot, dx = pad.x - r.position.x, dz = pad.z - r.position.z, dist = Math.hypot(dx, dz);
    this.here = pad.key;
    if (dist < 0.05) return;
    this.walking = true;
    try {
      this.view(pad.x, pad.z, 700);
      if (dist <= 3) await this.live(r.userData.walkTo(pad.x, pad.z));
      else await this.live(this.dash(pad, dist));
      // face the camera again
      r.rotation.y = ((r.rotation.y + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
      await this.live(tween(r.rotation, { y: 0 }, { ms: 160, ease: 'inOutCubic' }));
    } finally { this.walking = false; }
  }

  /** A long walk in 1.5 s: the robot's own walkTo moves at a fixed speed, so turn, glide with a bob and spin the wheels here. */
  async dash(pad, dist) {
    const r = this.robot, rig = r.children[0];
    let d = Math.atan2(pad.x - r.position.x, pad.z - r.position.z) - r.rotation.y;
    d = ((d + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
    await this.live(tween(r.rotation, { y: r.rotation.y + d }, { ms: 200, ease: 'inOutCubic' }));
    const wheels = rig && rig.children.find(c => c.userData && c.userData.spins), spins = (wheels && wheels.userData.spins) || [];
    const ms = 1500;
    const bob = (async () => { for (let i = 0; i < 4 && rig; i++) { await this.live(tween(rig.position, { y: 0.07 }, { ms: ms / 8 })); await this.live(tween(rig.position, { y: 0 }, { ms: ms / 8 })); } })();
    await this.live(Promise.all([
      tween(r.position, { x: pad.x, z: pad.z }, { ms, ease: 'inOutCubic' }),
      ...spins.map(s => tween(s.rotation, { x: s.rotation.x + dist / 0.3 }, { ms, ease: 'inOutCubic' })),
      bob,
    ]));
    if (rig) rig.position.y = 0;
  }

  // ---------------------------------------------------------------- after a course
  async afterCourse(jd, goTo) {
    this.busy = true;
    await this.live(wait(350));
    if (jd) {
      const pad = this.pads[jd.key];
      if (pad && jd.stars > 0 && this.hidden.has(jd.key)) {
        this.hidden.delete(jd.key);
        const m = this.setMedal(pad, jd.stars), sz = this.medalSize();
        m.scale.set(0.001, 0.001, 1);
        sfx.star(Math.min(2, Math.max(0, jd.stars - 1)));
        await this.live(tween(m.scale, { x: sz, y: sz }, { ms: 450, ease: 'outBack' }));
        sparkle(this.stage, m, this.root);
        const nx = nextCourse(jd.key);
        if (nx && this.pads[nx] && this.pads[nx].state.open) sparkle(this.stage, new THREE.Vector3(this.pads[nx].x, 0.6, this.pads[nx].z), this.root);
        await this.live(wait(450));
      }
      if (jd.part && PARTS[jd.key]) {
        this.ui.toast('新零件！', `New part: ${PARTS[jd.key].zh}`, 1400);
        try { sfx.star(2); } catch (e) { /* ignore */ }
        await this.live(wait(1500));
      }
    }
    await this.maybeWellDone();
    this.busy = false;
    if (goTo && this.pads[goTo] && this.pads[goTo].state.open) await this.launch(goTo);
  }

  /** After 3 courses in one sitting: the robot dances, and the child decides. */
  async maybeWellDone() {
    const s = this.bridge.sitting;
    if (s.courses < 3 || s.wellDoneShown) return;
    s.wellDoneShown = true;
    const was = this.busy;
    this.busy = true;
    try { voice.say('今日做得好！'); } catch (e) { /* ignore */ }
    let on = true;
    const robot = this.robot.userData;
    const dancer = (async () => {
      if (motion.less) { await this.live(robot.wave()); return; }
      confetti(this.stage, new THREE.Vector3(this.robot.position.x, 1.6, this.robot.position.z), 40, this.root);
      while (on && this.alive) await this.live(robot.dance({ on: () => sfx.tick(0) }));
    })();
    const id = await this.live(this.ui.card({
      zh: '今日做得好！', en: 'Great job today!', icon: '🎉',
      buttons: [{ id: 'go', zh: '繼續', en: 'Continue' }, { id: 'done', zh: '休息', en: 'Done' }],
    }));
    on = false;
    if (id === 'done') { location.href = 'index.html'; await new Promise(() => {}); }
    dancer.catch(() => {}); // the current dance cycle (about a second) just finishes by itself
    this.busy = was;
  }
}
