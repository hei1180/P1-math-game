// Gallery 展覽廳: the whole class's robots on podiums in a row, each with a name sign (the player name, as on the leaderboard).
// Swipe (or ◀ ▶) to look along the row; tap a robot to see that player's saved creations laid flat on a table.
// Only ~12 podiums ever exist: they are re-used as the row scrolls (the robots swap parts, the signs are redrawn), so memory stays flat.
// Own entry comes first, marked 「我」. The teacher also gets 🙈 Hide / 👁 Show per entry (hidden ones look grey, for the teacher only).
// No likes, no counts, no free text: the only text from other players is the name they already show on the leaderboard.
import * as THREE from 'three';
import { Scene } from '../engine/scenes.js?v=202610051406';
import { tween, cancelTweens } from '../engine/tween.js?v=202610051406';
import { disposeTree } from '../engine/stage.js?v=202610051406';
import { SLOTS, BASIC_PART, robotName, PEG_GRID, validateGalleryEntry } from '../../shapes-logic.js?v=202610051406';
import { makeRobot, PART_INFO } from '../models/robot.js?v=202610051406';
import { makePegboard, makeBand, makePiece } from '../models/tiles.js?v=202610051406';
import { SCENE, FONT, pieceColor } from '../theme.js?v=202610051406';
import { sfx } from '../sfx.js?v=202610051406';

const SPACING = 2.6, MAX_CELLS = 12;
const K = 2 * Math.tan((20 * Math.PI) / 180); // visible height = K × camera distance (fov 40)
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

const E = (tag, css = '', text = '') => {
  const e = document.createElement(tag);
  if (css) e.style.cssText = css;
  if (text) e.textContent = text;
  return e;
};
function button(css, onClick) {
  const b = E('button', `min-height:48px;min-width:48px;border-radius:16px;font-family:${FONT};font-weight:700;cursor:pointer;pointer-events:auto;${css}`);
  b.type = 'button';
  b.className = 'bubbly-btn';
  b.addEventListener('click', onClick);
  return b;
}

/** Paint a name sign: player name, robot name under it, gold 「我」 badge for my own. Grey when hidden (teacher view). */
function drawSign(canvas, { name, robot, own, grey }) {
  const g = canvas.getContext('2d'), w = canvas.width, h = canvas.height;
  g.clearRect(0, 0, w, h);
  g.fillStyle = grey ? '#d1d5db' : '#fffbeb'; g.strokeStyle = grey ? '#9ca3af' : own ? '#f59e0b' : '#6ee7b7'; g.lineWidth = 8;
  g.beginPath(); if (g.roundRect) g.roundRect(5, 5, w - 10, h - 10, 18); else g.rect(5, 5, w - 10, h - 10); g.fill(); g.stroke();
  let left = 20;
  if (own) {
    g.fillStyle = grey ? '#9ca3af' : '#f59e0b'; g.beginPath(); g.arc(48, h / 2, 28, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#fff'; g.font = `bold 34px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('我', 48, h / 2 + 2);
    left = 86;
  }
  const maxW = w - left - 16;
  let text = Array.from(name || ''), size = 40;
  g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillStyle = grey ? '#6b7280' : '#1f2937';
  const measure = () => { g.font = `bold ${size}px ${FONT}`; return g.measureText(text.join('')).width; };
  while (size > 20 && measure() > maxW) size -= 2;
  if (measure() > maxW) { // still too long at the smallest size: cut it and add …
    while (text.length > 1 && measure() > maxW) text.pop();
    text.push('…');
    while (text.length > 2 && measure() > maxW) text.splice(-2, 1);
  }
  g.fillText(text.join(''), left, own || robot ? 36 : h / 2);
  if (robot) { g.font = `24px ${FONT}`; g.fillStyle = '#6b7280'; g.fillText(robot, left, 74); }
}

/** Only a part that belongs in that slot (other players' data is not trusted): anything else becomes the basic part. */
const partFor = (slot, id) => (id === BASIC_PART[slot] || (PART_INFO[id] && PART_INFO[id].slot === slot) ? id : BASIC_PART[slot]);

export class GalleryScene extends Scene {
  async enter() {
    const { ui, bridge } = this;
    this.s = { scroll: 0 };           // tweened by the arrows
    this.entries = [];
    this.pool = []; this.free = []; this.active = new Map();
    this.detail = null;
    this.size = '';
    this.lastScroll = null;
    ui.back(() => this.go('Workshop'));

    if (!bridge.gallery.enabled) {
      await this.live(ui.card({ zh: '展覽廳暫時關閉', en: 'The gallery is closed for now', icon: '🔒', buttons: [{ id: 'back', zh: '返回', en: 'Back' }] }));
      this.go('Workshop');
      return;
    }

    ui.prompt('載入中…', 'Loading…', { speak: false });
    let list;
    try {
      list = await this.live(bridge.gallery.load());
      if (!Array.isArray(list)) throw new Error('gallery.load failed'); // null = the load failed; [] = nothing there
    } catch (e) {
      console.warn('gallery load failed', e);
      return this.fail();
    }
    const entries = this.prepare(list);
    if (!entries.length) {
      ui.hidePrompt();
      await this.live(ui.card({ zh: '還未有作品', en: 'No work here yet', icon: '🖼️', buttons: [{ id: 'back', zh: '返回', en: 'Back' }] }));
      this.go('Workshop');
      return;
    }
    this.entries = entries;
    this.buildRoom();
    this.buildUi();
    ui.prompt('展覽廳', 'Gallery: swipe to look, tap a robot', { speak: false });
    this.frame();
    this.layout();
    this.stage.invalidate();
  }

  async fail() {
    this.ui.hidePrompt();
    await this.live(this.ui.card({ zh: '暫時未能載入', en: "Can't load right now", icon: '📡', buttons: [{ id: 'back', zh: '返回', en: 'Back' }] }));
    this.go('Workshop');
  }

  /** Keep entries that pass the same check the database applies; mine first; students never see hidden ones. */
  prepare(list) {
    const { bridge } = this, me = bridge.player && bridge.player.uid, teacher = !!bridge.gallery.isTeacher;
    const out = [];
    for (const raw of list) {
      if (!raw || typeof raw !== 'object') continue;
      const { uid, ...rest } = raw;
      const hidden = rest.hidden === true;
      if (!validateGalleryEntry({ ...rest, hidden })) continue;
      if (hidden && !teacher) continue;
      out.push({ uid: uid || null, playerName: rest.playerName, robot: rest.robot, creations: rest.creations, hidden, own: !!me && uid === me });
    }
    return out.sort((a, b) => (b.own ? 1 : 0) - (a.own ? 1 : 0)); // stable: the rest keep their order
  }

  // ---------------------------------------------------------------- 3-D
  buildRoom() {
    const floor = new THREE.Mesh(new THREE.BoxGeometry(80, 0.3, 44), new THREE.MeshLambertMaterial({ color: SCENE.floor }));
    floor.position.set(0, -0.15, 16); // long, so a tall phone screen still shows floor under the row
    const wall = new THREE.Mesh(new THREE.BoxGeometry(80, 24, 0.3), new THREE.MeshLambertMaterial({ color: SCENE.wall }));
    wall.position.set(0, 12, -4.5);
    this.root.add(floor, wall);
    // stripes on the floor slide with the row, so it is clear that the room moves
    this.stripes = new THREE.Group();
    const sm = new THREE.MeshLambertMaterial({ color: 0xe6d3b0 }), sg = new THREE.BoxGeometry(0.7, 0.01, 44);
    for (let i = -30; i <= 30; i++) { const m = new THREE.Mesh(sg, sm); m.position.set(i * 1.4, 0.005, 16); this.stripes.add(m); }
    this.root.add(this.stripes);

    this.strip = new THREE.Group();
    this.root.add(this.strip);
    // an invisible backdrop that takes the swipe (the row scrolls with the finger)
    const proxy = this.proxy = new THREE.Mesh(new THREE.PlaneGeometry(400, 60), new THREE.MeshBasicMaterial({ visible: false }));
    proxy.position.set(0, 0, -1.4);
    this.strip.add(proxy);
    let start = 0;
    this.input.drag(proxy, {
      plane: new THREE.Plane(new THREE.Vector3(0, 0, 1), 1.4), lift: 0,
      onStart: () => { cancelTweens(this.s); start = this.s.scroll; },
      onMove: obj => { if (!this.detail) this.s.scroll = clamp(start - obj.position.x, 0, this.scrollMax()); },
      onEnd: obj => { obj.position.set(0, 0, -1.4); },
    });
    this.input.onTap(() => [...this.active.values()].map(c => c.group), g => { const c = this.pool.find(p => p.group === g); if (c && c.entry && !this.detail) this.openEntry(c.entry); });
  }

  makeCell() {
    const group = new THREE.Group();
    const podium = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 1.05, 0.4, 32), new THREE.MeshStandardMaterial({ color: SCENE.metal, roughness: 0.5 }));
    podium.position.y = 0.2;
    const robot = makeRobot({});
    robot.position.y = 0.4;
    const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 96;
    const tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace;
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 2.2 * 96 / 256), new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
    sign.position.set(0, 0.42, 1.25);
    const veil = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 2.0, 20), new THREE.MeshBasicMaterial({ color: 0x9ca3af, transparent: true, opacity: 0.6 }));
    veil.position.y = 1.4; veil.visible = false;
    const hit = new THREE.Mesh(new THREE.BoxGeometry(2.2, 2.7, 1.9), new THREE.MeshBasicMaterial({ visible: false })); // a roomy tap target
    hit.position.y = 1.35;
    group.add(podium, robot, sign, veil, hit);
    const cell = { group, robot, canvas, tex, veil, entry: null, key: '', btn: null };
    if (this.bridge.gallery.isTeacher) {
      cell.btn = button('position:absolute;transform:translate(-50%,0);padding:2px 10px;border:3px solid #9ca3af;background:#fff;color:#1f2937;display:none;white-space:nowrap', () => this.toggleHidden(cell));
      this.tLayer.appendChild(cell.btn);
    }
    this.strip.add(group);
    this.pool.push(cell);
    return cell;
  }

  /** Put an entry on a podium: robot parts, sign, grey veil. */
  assign(cell, entry) {
    cell.entry = entry;
    const key = SLOTS.map(s => partFor(s, entry.robot[s])).join('|');
    if (key !== cell.key) {
      for (const s of SLOTS) cell.robot.userData.setPart(s, partFor(s, entry.robot[s]));
      cell.key = key;
    }
    this.paintCell(cell);
  }

  paintCell(cell) {
    const e = cell.entry, grey = e.hidden && !!this.bridge.gallery.isTeacher;
    drawSign(cell.canvas, { name: e.playerName, robot: e.robot.name ? robotName(e.robot.name) : '', own: e.own, grey });
    cell.tex.needsUpdate = true;
    cell.veil.visible = grey;
    if (cell.btn) {
      cell.btn.replaceChildren(E('span', 'font-size:22px', e.hidden ? '👁' : '🙈'), E('span', 'font-size:15px;margin-left:6px', e.hidden ? '顯示' : '隱藏'), E('span', 'font-size:10px;font-weight:400;margin-left:4px;opacity:.75', e.hidden ? 'Show' : 'Hide'));
      cell.btn.setAttribute('aria-label', `${e.hidden ? 'Show' : 'Hide'} ${e.playerName}`);
    }
    this.stage.invalidate();
  }

  async toggleHidden(cell) {
    const e = cell.entry;
    if (!e || !e.uid || cell.busy) return;
    cell.busy = true;
    try {
      const ok = await this.live(this.bridge.gallery.setHidden(e.uid, !e.hidden));
      if (!ok) { sfx.bonk(); this.ui.toast('未能更改', 'Not changed', 1400); return; }
      e.hidden = !e.hidden; // the entry object lives on even if the podium was re-used meanwhile
      sfx.pop();
      if (cell.entry === e) this.paintCell(cell);
    } catch (err) { console.warn('setHidden failed', err); sfx.bonk(); this.ui.toast('未能更改', 'Not changed', 1400); }
    finally { cell.busy = false; }
  }

  // ---------------------------------------------------------------- scrolling and layout
  cols() { return clamp(Math.round((this.stage.width / Math.max(1, this.stage.height)) * 2.4), 2, 5); }
  viewW() { return this.cols() * SPACING; }
  scrollMax() { return Math.max(0, this.entries.length * SPACING - this.viewW()); }

  frame() {
    const st = this.stage, aspect = st.width / Math.max(1, st.height);
    this.size = `${st.width}x${st.height}`;
    if (this.detail) { this.frameDetail(); return; }
    this.s.scroll = Math.min(this.s.scroll, this.scrollMax()); // the row may fit better after a resize
    const d = Math.max((this.viewW() * (aspect < 1 ? 1.08 : 1.25)) / (K * aspect), 7); // a little wider than the podiums, so the signs and arms are not cropped
    st.setView([0, 3, d], [0, 0.9, 0]);
    this.lastScroll = null; // lay the row out again for the new width
  }

  /** x of entry i, in world units (the row is centred when it fits on screen, else it scrolls). */
  xOf(i) {
    const n = this.entries.length, W = this.viewW(), total = n * SPACING;
    const base = total <= W ? -total / 2 : -W / 2 - this.s.scroll;
    return base + SPACING * (i + 0.5);
  }

  update() {
    const st = this.stage;
    if (!this.entries.length) return;
    if (`${st.width}x${st.height}` !== this.size) this.frame();
    if (!this.detail && this.s.scroll !== this.lastScroll) this.layout();
  }

  layout() {
    this.lastScroll = this.s.scroll;
    const lim = this.viewW() / 2 + SPACING * 1.2, want = [];
    for (let i = 0; i < this.entries.length; i++) if (Math.abs(this.xOf(i)) < lim) want.push(i);
    want.sort((a, b) => Math.abs(this.xOf(a)) - Math.abs(this.xOf(b)));
    const keep = new Set(want.slice(0, MAX_CELLS));
    for (const [i, c] of this.active) if (!keep.has(i)) { this.active.delete(i); c.group.visible = false; c.entry = null; if (c.btn) c.btn.style.display = 'none'; this.free.push(c); }
    for (const i of keep) {
      let c = this.active.get(i);
      if (!c) { c = this.free.pop() || (this.pool.length < MAX_CELLS ? this.makeCell() : null); if (!c) continue; this.active.set(i, c); this.assign(c, this.entries[i]); c.group.visible = true; }
      c.group.position.x = this.xOf(i);
    }
    this.stripes.position.x = -(this.s.scroll % 2.8);
    this.placeUi();
    this.stage.invalidate();
  }

  // ---------------------------------------------------------------- DOM: arrows, teacher buttons
  buildUi() {
    const layer = document.getElementById('ui');
    this.tLayer = E('div', 'position:absolute;inset:0;pointer-events:none;overflow:hidden');
    layer.appendChild(this.tLayer);
    const arrow = (dir) => {
      const b = button(`position:absolute;top:42%;${dir < 0 ? 'left' : 'right'}:6px;width:56px;height:72px;font-size:28px;background:rgba(255,255,255,.92);border:3px solid #d1d5db;color:#1f2937;padding:0`, () => this.page(dir));
      b.textContent = dir < 0 ? '◀' : '▶';
      b.setAttribute('aria-label', dir < 0 ? '向左 Left' : '向右 Right');
      this.tLayer.appendChild(b);
      return b;
    };
    this.arrows = [arrow(-1), arrow(1)];
  }

  page(dir) {
    const step = SPACING * Math.max(1, this.cols() - 1);
    cancelTweens(this.s);
    sfx.tick(dir > 0 ? 3 : 1);
    tween(this.s, { scroll: clamp(this.s.scroll + dir * step, 0, this.scrollMax()) }, { ms: 380, ease: 'inOutCubic' });
  }

  placeUi() {
    if (!this.tLayer) return;
    const max = this.scrollMax(), vis = !this.detail;
    this.arrows[0].style.display = vis && max > 0 && this.s.scroll > 0.01 ? '' : 'none';
    this.arrows[1].style.display = vis && max > 0 && this.s.scroll < max - 0.01 ? '' : 'none';
    for (const c of this.pool) {
      if (!c.btn) continue;
      if (!vis || !c.entry || !c.group.visible) { c.btn.style.display = 'none'; continue; }
      const p = this.stage.toScreen(new THREE.Vector3(c.group.position.x, -0.15, 1.25));
      c.btn.style.display = '';
      c.btn.style.left = `${p.x}px`; c.btn.style.top = `${p.y + 4}px`;
    }
  }

  // ---------------------------------------------------------------- one player's creations
  openEntry(entry) {
    sfx.pop();
    this.detail = new THREE.Group();
    this.detail.position.y = 0.06; // the table top clears the floor, so nothing flickers
    this.root.add(this.detail);
    this.strip.visible = false; this.stripes.visible = false;
    const aspect = this.stage.width / Math.max(1, this.stage.height);
    const cols = aspect < 1 ? 2 : 3, rows = aspect < 1 ? 3 : 2, slot = 2.9;
    const signH = 1.2, depth = rows * slot + 0.6 + signH; // room at the front of the table for the name sign
    const table = new THREE.Mesh(new THREE.BoxGeometry(cols * slot + 0.6, 0.3, depth), new THREE.MeshLambertMaterial({ color: SCENE.metal }));
    table.position.y = -0.15;
    this.detail.add(table);
    this.detailBox = { w: cols * slot + 0.6, d: depth };
    entry.creations.forEach((c, i) => {
      const x = ((i % cols) - (cols - 1) / 2) * slot, z = (Math.floor(i / cols) - (rows - 1) / 2) * slot - signH / 2;
      const g = c.kind === 'peg' ? this.flatPeg(c) : this.flatTiles(c);
      g.position.x += x; g.position.z += z;
      this.detail.add(g);
    });
    // the player's name lives on a sign lying on the table (the 🔈 button never reads another child's name aloud)
    const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 96;
    drawSign(canvas, { name: entry.playerName, robot: entry.robot.name ? robotName(entry.robot.name) : '', own: entry.own, grey: false });
    const tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace;
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.6 * 96 / 256), new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
    sign.rotation.x = -Math.PI / 2; sign.position.set(0, 0.02, rows * slot / 2 + 0.15);
    this.detail.add(sign);
    this.placeUi();
    this.ui.back(() => this.closeEntry());
    if (entry.creations.length) this.ui.prompt(entry.own ? '我的作品' : '作品', entry.own ? 'My work' : 'Creations', { speak: false });
    else this.ui.prompt('還未有作品', 'No creations yet', { speak: false });
    this.frameDetail(500);
    this.stage.invalidate();
  }

  /** A pegboard lying on the table, the band rebuilt from the saved peg list. */
  flatPeg(c) {
    const s = 0.5, g = new THREE.Group(), board = makePegboard({ spacing: s });
    const band = makeBand({ radius: 0.035 });
    board.add(band);
    const pegs = board.userData.pegs, pts = [];
    for (let i = 0; i + 1 < c.pts.length; i += 2) { const x = c.pts[i], y = c.pts[i + 1]; if (x < PEG_GRID && y < PEG_GRID) pts.push(pegs[x][y].position); }
    band.userData.set(pts, pts.length >= 3);
    board.rotation.x = -Math.PI / 2; board.position.y = 0.2 * s; // lie down: the front face turns up
    g.add(board);
    return g;
  }

  /** A tiles picture on its 10 × 10 board, small. */
  flatTiles(c) {
    const cell = 0.26, size = cell * 10, g = new THREE.Group();
    const base = new THREE.Mesh(new THREE.BoxGeometry(size, 0.05, size), new THREE.MeshLambertMaterial({ color: 0xfff7e0 }));
    base.position.y = 0.025; // lies on the table, its top face at y = 0.05 where the pieces start
    g.add(base);
    for (const t of c.placed) {
      const m = makePiece(t.p, { color: pieceColor(t.x, t.y, t.r), cell, r: t.r });
      m.position.set(t.x * cell - size / 2, 0.05, t.y * cell - size / 2);
      g.add(m);
    }
    return g;
  }

  frameDetail(ms = 0) {
    const st = this.stage, aspect = st.width / Math.max(1, st.height), t = 0.18, f = 0.04, u = 1 - f - t;
    const { w, d } = this.detailBox || { w: 9, d: 6 };
    const h = Math.max(d / (u * K), w / (K * aspect), 7), z = ((f - t) / 2) * K * h;
    st.setView([0, h, z + 1.4], [0, 0, z], ms);
  }

  closeEntry() {
    if (!this.detail) return;
    this.root.remove(this.detail); disposeTree(this.detail); this.detail = null;
    this.strip.visible = true; this.stripes.visible = true;
    this.ui.back(() => this.go('Workshop'));
    this.ui.prompt('展覽廳', 'Gallery: swipe to look, tap a robot', { speak: false });
    this.frame();
    this.layout();
  }
}
