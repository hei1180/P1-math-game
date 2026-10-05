// Free Build: no target, no marks. Start data { mode: 'peg' | 'tiles' }.
//  peg   - pegboard: tap pegs in order, the band closes itself, the prompt counts the sides live (countSides).
//  tiles - a 10 × 10 canvas of quarter-cells with an unlimited tray of PIECE_IDS. Pick a piece (↻ turns it), then press on the
//          canvas: a ghost follows the finger (green = fits, red = no room) and the piece is put down when the finger lifts, so a
//          plain tap works too. 🧽 then tap a piece takes it away, ↩ undoes the last change. Pieces never overlap (footprint keys).
// 保存 Save → bridge.saveCreation({ kind:'peg', pts } | { kind:'tiles', placed }); a 7th save asks before dropping the oldest.
// The panel sits at the bottom, or at the right on a short screen (landscape phone) so the board keeps its size. No keyboard, no free text.
import * as THREE from 'three';
import { Scene } from '../engine/scenes.js?v=0';
import { tween } from '../engine/tween.js?v=0';
import { disposeTree } from '../engine/stage.js?v=0';
import { PEG_GRID, PIECE_IDS, PIECES, footprint, countSides, checkPeg } from '../../shapes-logic.js?v=0';
import { makePegboard, makeBand, makePiece } from '../models/tiles.js?v=0';
import { SCENE, FONT, pieceColor } from '../theme.js?v=0';
import { sfx } from '../sfx.js?v=0';
import { confetti } from '../fx3d.js?v=0';

const GRID = 10, MAX_PIECES = 30, MAX_PEGS = 20, MAX_SAVED = 6; // limits follow validateGalleryEntry
const K = 2 * Math.tan((20 * Math.PI) / 180); // visible height = K × camera distance (fov 40)
const SVGNS = 'http://www.w3.org/2000/svg';
const FLOOR = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

// Each piece drawn in a 2 × 2 box, centred on (1, 1), the way footprint() lays it out for r = 0 (y runs down).
const ICON = {
  sq:     { rect: [0.5, 0.5, 1, 1] },
  rect:   { rect: [0, 0.5, 2, 1] },
  bigsq:  { rect: [0, 0, 2, 2] },
  tri:    { poly: '0.5,0.5 0.5,1.5 1.5,1.5' },
  bigtri: { poly: '0,0 0,2 2,2' },
  circle: { circle: [1, 1, 0.5] },
};

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
function pieceIcon(id) {
  const svg = document.createElementNS(SVGNS, 'svg');
  svg.setAttribute('viewBox', '-0.1 -0.1 2.2 2.2');
  svg.setAttribute('width', '34'); svg.setAttribute('height', '34');
  svg.style.transition = 'transform .15s';
  const d = ICON[id];
  const sh = document.createElementNS(SVGNS, d.rect ? 'rect' : d.poly ? 'polygon' : 'circle');
  if (d.rect) ['x', 'y', 'width', 'height'].forEach((k, i) => sh.setAttribute(k, d.rect[i]));
  else if (d.poly) sh.setAttribute('points', d.poly);
  else ['cx', 'cy', 'r'].forEach((k, i) => sh.setAttribute(k, d.circle[i]));
  sh.setAttribute('fill', '#64748b'); sh.setAttribute('stroke', '#1f2937'); sh.setAttribute('stroke-width', '0.08');
  svg.appendChild(sh);
  return svg;
}

export class FreeBuildScene extends Scene {
  async enter(data) {
    const { ui } = this;
    this.mode = data && data.mode === 'tiles' ? 'tiles' : 'peg';
    this.savedKey = '';
    this.side = null;
    this.points = [];            // peg: [[x, y], ...] in tap order
    this.placed = [];            // tiles: [{ p, x, y, r, mesh }]
    this.history = [];           // tiles: what ↩ undoes ({ type: 'add' | 'del', item })
    this.tool = 'sq';            // tiles: a piece id or 'erase'
    this.r = 0;                  // tiles: quarter turns of the piece in hand
    this.aim = null;             // tiles: where the ghost is { x, y, ok }

    if (this.mode === 'peg') this.buildPeg(); else this.buildTiles();
    this.buildPanel();
    ui.back(() => this.askLeave());
    this.frame();
    this.changed(true);
    this.stage.invalidate();
  }

  async exit() {
    if (this.ro) this.ro.disconnect();
    if (this.unbind) this.unbind();
  }

  // ---------------------------------------------------------------- pegboard
  buildPeg() {
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(40, 30), new THREE.MeshLambertMaterial({ color: SCENE.wall }));
    wall.position.z = -0.3;
    this.root.add(wall);
    const board = this.board = makePegboard({ spacing: 1 });
    const band = this.band = makeBand({ radius: 0.07 });
    board.add(band);
    this.root.add(board);
    this.input.onTap(() => board.userData.hits, hit => this.tapPeg(hit.userData.peg));
  }

  tapPeg([x, y]) {
    const i = this.points.findIndex(p => p[0] === x && p[1] === y);
    if (i >= 0 && i === this.points.length - 1) this.points.pop();      // tap the last peg again = take it back
    else if (i >= 0) { sfx.bonk(); return; }                            // already in the band
    else if (this.points.length >= MAX_PEGS) { sfx.bonk(); this.ui.toast('釘夠了', 'That is enough pegs', 1200); return; }
    else { this.points.push([x, y]); sfx.tick(this.points.length); }
    this.changed();
  }

  /** What the band makes: sides = countSides, and a reason when it cannot be a shape. */
  pegState() {
    const n = this.points.length;
    if (n < 3) return { sides: 0, ok: false, zh: n ? '再點釘子' : '點釘子', en: n ? 'Tap more pegs' : 'Tap the pegs' };
    const sides = countSides(this.points), r = checkPeg({ points: this.points, closed: true }, 0);
    if (sides >= 3 && r.reason === 'wrong-sides') return { sides, ok: true, zh: `${sides} 條邊`, en: `${sides} sides` }; // target 0 is never met, so 'wrong-sides' = a real shape
    return { sides: 0, ok: false, zh: r.reason === 'crossing' ? '交叉了' : '再加釘子', en: r.reason === 'crossing' ? 'It crosses itself' : 'Add more pegs' };
  }

  paintPeg() {
    const pegs = this.board.userData.pegs, used = new Set(this.points.map(p => p.join(',')));
    for (let x = 0; x < PEG_GRID; x++) for (let y = 0; y < PEG_GRID; y++) pegs[x][y].material.color.set(used.has(`${x},${y}`) ? 0xf97316 : 0xf8fafc);
    const pts = this.points.map(([x, y]) => pegs[x][y].position);
    this.band.userData.set(pts, pts.length >= 3);
  }

  // ---------------------------------------------------------------- tiles canvas
  buildTiles() {
    const table = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshLambertMaterial({ color: SCENE.wall }));
    table.rotation.x = -Math.PI / 2; table.position.y = -0.12;
    this.root.add(table);
    const board = this.board = new THREE.Group();
    board.position.set(-GRID / 2, 0, -GRID / 2);
    const base = new THREE.Mesh(new THREE.BoxGeometry(GRID, 0.12, GRID), new THREE.MeshLambertMaterial({ color: 0xfff7e0 }));
    base.position.set(GRID / 2, -0.06, GRID / 2);
    board.add(base);
    // cell lines, plus faint diagonals so the four quarters of a cell can be seen
    const lines = [], diag = [];
    for (let i = 0; i <= GRID; i++) lines.push(i, 0.004, 0, i, 0.004, GRID, 0, 0.004, i, GRID, 0.004, i);
    for (let x = 0; x < GRID; x++) for (let y = 0; y < GRID; y++) diag.push(x, 0.003, y, x + 1, 0.003, y + 1, x + 1, 0.003, y, x, 0.003, y + 1);
    const seg = (pts, color) => {
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      return new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color }));
    };
    board.add(seg(diag, 0xd8c9a4), seg(lines, 0x64748b));
    this.root.add(board);
    this.ray = new THREE.Raycaster();
    this.bindPointer();
  }

  /** Press, drag and lift on the canvas: a ghost follows the finger, the piece goes down on release. */
  bindPointer() {
    const cv = this.stage.renderer.domElement;
    const down = e => {
      if (!this.alive || this.ptr || !this.input.enabled || (e.pointerType === 'mouse' && e.button !== 0)) return;
      this.ptr = e.pointerId;
      try { cv.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      this.aimAt(e);
    };
    const move = e => { if (this.ptr === e.pointerId) this.aimAt(e); };
    const up = e => {
      if (this.ptr !== e.pointerId) return;
      this.ptr = null;
      if (this.alive) this.release(e);
    };
    const cancel = e => { if (this.ptr === e.pointerId) { this.ptr = null; this.hideGhost(); } };
    const on = { pointerdown: down, pointermove: move, pointerup: up, pointercancel: cancel };
    for (const k in on) cv.addEventListener(k, on[k]);
    this.unbind = () => { for (const k in on) cv.removeEventListener(k, on[k]); this.unbind = null; };
  }

  /** The board cell position (in cells, board frame) under a pointer event, or null when it misses the table. */
  cellPoint(e) {
    const cv = this.stage.renderer.domElement, r = cv.getBoundingClientRect();
    this.stage.camera.updateMatrixWorld();
    this.ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), this.stage.camera);
    const hit = this.ray.ray.intersectPlane(FLOOR, new THREE.Vector3());
    return hit ? this.board.worldToLocal(hit) : null;
  }

  /** Top-left cell for the piece in hand when it is centred on the point (clamped so it stays on the board). */
  placeFor(pt) {
    const keys0 = footprint(this.tool, 0, 0, this.r);
    const cols = Math.max(...keys0.map(k => +k.split(',')[0])) + 1, rows = Math.max(...keys0.map(k => +k.split(',')[1])) + 1;
    return {
      x: Math.max(0, Math.min(GRID - cols, Math.floor(pt.x - cols / 2 + 0.5))),
      y: Math.max(0, Math.min(GRID - rows, Math.floor(pt.z - rows / 2 + 0.5))),
    };
  }

  aimAt(e) {
    if (this.tool === 'erase') return;
    const pt = this.cellPoint(e);
    if (!pt) return;
    const { x, y } = this.placeFor(pt), ok = this.placed.length < MAX_PIECES && this.fits(footprint(this.tool, x, y, this.r));
    this.aim = { x, y, ok };
    const sig = `${this.tool}|${this.r}`;
    if (!this.ghost || this.ghost.sig !== sig) {
      this.hideGhost();
      const m = makePiece(this.tool, { color: 0x22c55e, cell: 1, r: this.r });
      m.material.transparent = true; m.material.opacity = 0.75;
      this.ghost = m; m.sig = sig; this.board.add(m);
    }
    this.ghost.material.color.set(ok ? 0x22c55e : 0xef4444);
    this.ghost.position.set(x, 0.08, y);
    this.stage.invalidate();
  }

  hideGhost() {
    if (this.ghost) { this.board.remove(this.ghost); disposeTree(this.ghost); this.ghost = null; this.stage.invalidate(); }
    this.aim = null;
  }

  release(e) {
    if (this.tool === 'erase') {
      const pt = this.cellPoint(e);
      if (!pt) return;
      const hit = this.ray.intersectObjects(this.placed.map(t => t.mesh), false)[0];
      const item = hit && this.placed.find(t => t.mesh === hit.object);
      if (item) { this.removeItem(item); this.history.push({ type: 'del', item }); sfx.pop(); this.changed(); }
      return;
    }
    const a = this.aim;
    this.hideGhost();
    if (!a) return;
    if (this.placed.length >= MAX_PIECES) { sfx.bonk(); this.ui.toast('圖塊夠了', 'That is enough pieces', 1200); return; }
    if (!a.ok) { sfx.bonk(); this.flashNo(a.x, a.y); return; }
    const item = { p: this.tool, x: a.x, y: a.y, r: this.r, mesh: null };
    this.mountItem(item, true);
    this.history.push({ type: 'add', item });
    sfx.pop(); this.changed();
  }

  /** (Re)build an item's mesh and put it on the board. */
  mountItem(item, bounce) {
    const mesh = item.mesh = makePiece(item.p, { color: pieceColor(item.x, item.y, item.r), cell: 1, r: item.r });
    mesh.position.set(item.x, bounce ? 0.35 : 0, item.y);
    this.board.add(mesh);
    this.placed.push(item);
    if (bounce) tween(mesh.position, { y: 0 }, { ms: 150, ease: 'outBounce' });
  }

  removeItem(item) {
    this.placed.splice(this.placed.indexOf(item), 1);
    this.board.remove(item.mesh); disposeTree(item.mesh);
  }

  undo() {
    if (this.mode === 'peg') { if (this.points.length) { this.points.pop(); sfx.tick(0); this.changed(); } return; }
    const h = this.history.pop();
    if (!h) return;
    if (h.type === 'add') this.removeItem(h.item); else this.mountItem(h.item, false);
    sfx.tick(0); this.changed();
  }

  /** Quarter-cell keys taken so far; a round socket 'c' fills its whole cell, so it also blocks the quarters there. */
  fits(keys) {
    const quarters = new Set(), rounds = new Set();
    for (const t of this.placed) for (const k of footprint(t.p, t.x, t.y, t.r)) {
      const [x, y, q] = k.split(',');
      if (q === 'c') rounds.add(`${x},${y}`); else quarters.add(k);
    }
    return keys.every(k => {
      const [x, y, q] = k.split(','), cell = `${x},${y}`;
      if (q === 'c') return !rounds.has(cell) && !['n', 'e', 's', 'w'].some(d => quarters.has(`${cell},${d}`));
      return !rounds.has(cell) && !quarters.has(k);
    });
  }

  /** A red ghost where the piece did not fit, fading away. */
  flashNo(x, y) {
    const g = makePiece(this.tool, { color: 0xef4444, cell: 1, r: this.r });
    g.material.transparent = true; g.material.opacity = 0.85;
    g.position.set(x, 0.05, y);
    this.board.add(g);
    this.stage.invalidate();
    tween(g.material, { opacity: 0 }, { ms: 450 }).then(() => { if (g.parent) g.parent.remove(g); disposeTree(g); this.stage.invalidate(); });
  }

  // ---------------------------------------------------------------- panel
  buildPanel() {
    const panel = this.panel = E('div');
    this.toolsEl = E('div', 'display:flex;flex-direction:column;gap:6px;flex:1 1 auto;min-height:0;overflow-y:auto');
    this.saveBtn = button('flex:none;background:#22c55e;color:#fff;border:4px solid #16a34a;min-height:52px;padding:2px 16px', () => this.save());
    this.saveBtn.append(E('div', 'font-size:22px;line-height:1.15', '保存'), E('div', 'font-size:11px;font-weight:400;opacity:.85;line-height:1.1', 'Save'));
    panel.append(this.toolsEl, this.saveBtn);
    const root = document.getElementById('ui');
    root.appendChild(panel);
    this.layoutPanel();
    this.renderTools();
    // re-fit only when the screen or the panel changes size (no layout reads every frame)
    this.ro = new ResizeObserver(() => { if (this.alive) this.onResize(); });
    this.ro.observe(root); this.ro.observe(panel);
  }

  /** Bottom panel on a normal screen, a side panel on a short one (landscape phone). */
  layoutPanel() {
    const side = this.stage.height < 500;
    if (side === this.side) return false;
    this.side = side;
    this.panel.style.cssText = `position:absolute;display:flex;flex-direction:column;gap:6px;box-sizing:border-box;background:rgba(255,251,235,.95);pointer-events:auto;font-family:${FONT};` + (side
      ? `right:0;top:${this.mode === 'tiles' ? 64 : 110}px;bottom:0;width:min(46%,380px);padding:8px;border-left:4px solid #fcd34d;border-radius:20px 0 0 0`
      : 'left:0;right:0;bottom:0;max-width:720px;margin:0 auto;padding:8px 8px max(8px, env(safe-area-inset-bottom));border-top:4px solid #fcd34d;border-radius:20px 20px 0 0');
    if (this.toolsEl && this.toolsEl.firstChild) { this.renderTools(); this.paintPrompt(); }
    return true;
  }

  onResize() {
    if (typeof this.stage.resize === 'function') this.stage.resize(); // measure first, then fit
    this.layoutPanel();
    this.frame();
  }

  /** A compact button: icon, big Chinese line, tiny English line. */
  toolBtn(zh, en, icon, onClick, on = false) {
    const b = button(`min-width:0;min-height:56px;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:1px 2px;border:3px solid ${on ? '#f59e0b' : '#d1d5db'};background:${on ? '#fef3c7' : '#fff'};color:#1f2937`, onClick);
    b.append(E('span', 'font-size:20px;line-height:1.05', icon), E('span', 'font-size:13px;line-height:1.1', zh), E('span', 'font-size:9px;font-weight:400;line-height:1.1;opacity:.75', en));
    b.setAttribute('aria-label', `${zh} ${en}`);
    return b;
  }

  /** n equal columns on a bottom panel, 3 on a side panel. */
  grid(n) {
    return E('div', `display:grid;gap:6px;grid-template-columns:repeat(${this.side ? 3 : n},minmax(0,1fr))`);
  }

  renderTools() {
    this.toolsEl.replaceChildren();
    const tools = this.grid(this.mode === 'peg' ? 4 : 6);
    // the mode switch lives in the tool row, so the panel stays short
    tools.append(
      this.toolBtn('釘板', 'Pegs', '📌', () => this.switchMode('peg'), this.mode === 'peg'),
      this.toolBtn('圖塊', 'Tiles', '🧩', () => this.switchMode('tiles'), this.mode === 'tiles'),
      this.toolBtn('還原', 'Undo', '↩', () => this.undo()));
    if (this.mode === 'tiles') {
      tools.append(
        this.toolBtn('轉一轉', 'Turn', '↻', () => { this.r = (this.r + 1) % 4; sfx.tick(2); if (this.tool === 'erase') this.tool = 'sq'; this.renderTools(); this.paintPrompt(); }),
        this.toolBtn('擦走', 'Erase', '🧽', () => { this.tool = this.tool === 'erase' ? 'sq' : 'erase'; sfx.tick(1); this.renderTools(); this.paintPrompt(); }, this.tool === 'erase'));
    }
    tools.append(this.toolBtn('清除', 'Clear', '🗑', () => this.clear()));
    if (this.mode === 'tiles') {
      const pieces = this.grid(6);
      for (const id of PIECE_IDS) {
        const on = this.tool === id;
        const b = button(`min-width:0;padding:2px;border:3px solid ${on ? '#f59e0b' : '#d1d5db'};background:${on ? '#fef3c7' : '#fff'};display:flex;align-items:center;justify-content:center;min-height:52px`, () => { this.tool = id; sfx.tick(0); this.renderTools(); this.paintPrompt(); });
        b.setAttribute('aria-label', PIECES[id].zh);
        const icon = pieceIcon(id);
        icon.style.transform = `rotate(${this.r * 90}deg)`;
        b.appendChild(icon);
        pieces.appendChild(b);
      }
      this.toolsEl.append(pieces, tools);
    } else this.toolsEl.append(tools);
  }

  /** The prompt at the top: the live side count for pegs, a short hint for tiles. */
  paintPrompt(first) {
    if (this.mode === 'tiles' && this.side) { this.ui.hidePrompt(); return; } // a landscape phone has no room for the hint
    if (this.mode === 'peg') { const s = this.pegState(); this.ui.prompt(s.zh, s.en, { speak: false }); return; }
    if (this.tool === 'erase') this.ui.prompt('點圖塊擦走', 'Tap a piece to take it away', { speak: false });
    else this.ui.prompt(first ? '自由創作' : '拖圖塊上去', first ? 'Free build: drag a piece onto the canvas' : 'Drag a piece onto the canvas', { speak: first });
  }

  changed(first = false) {
    if (this.mode === 'peg') this.paintPeg();
    this.paintPrompt(first);
    this.stage.invalidate();
  }

  clear() {
    const n = this.mode === 'peg' ? this.points.length : this.placed.length;
    if (!n) return;
    const go = () => {
      if (this.mode === 'peg') this.points = [];
      else { for (const t of [...this.placed]) this.removeItem(t); this.history = []; }
      sfx.pop(); this.changed();
    };
    if (this.mode === 'tiles' && n > 3) {
      this.ui.card({ zh: '全部清除？', en: 'Clear everything?', icon: '🗑', buttons: [{ id: 'yes', zh: '清除', en: 'Clear' }, { id: 'no', zh: '不要', en: 'No' }] })
        .then(id => { if (id === 'yes' && this.alive) go(); });
    } else go();
  }

  // ---------------------------------------------------------------- camera
  /** Fit the board into the free area (above the panel, or left of it), whatever the screen shape. Runs when something resized. */
  frame() {
    const st = this.stage, W = st.width, H = st.height, aspect = W / Math.max(1, H);
    const side = this.side, f = side ? 0 : Math.min(0.62, this.panel.offsetHeight / Math.max(1, H)), fw = side ? Math.min(0.6, this.panel.offsetWidth / Math.max(1, W)) : 0;
    const t = side && this.mode === 'tiles' ? 0.1 : 0.18, u = 1 - f - t; // t = the prompt (or the corner buttons) at the top
    const x = (fw / 2) * K * aspect; // × distance below
    if (this.mode === 'peg') {
      const B = 5.8, d = Math.max(B / (u * K), B / (K * aspect * (1 - fw)), 6), y = -((f - t) / 2) * K * d, lx = x * d;
      st.setView([lx, y + 0.5, d], [lx, y, 0]);
    } else {
      const B = GRID + 0.8, h = Math.max(B / (u * K), B / (K * aspect * (1 - fw)), 8), z = ((f - t) / 2) * K * h, lx = x * h;
      st.setView([lx, h, z + 0.4], [lx, 0, z]);
    }
  }

  // ---------------------------------------------------------------- save / leave
  creation() {
    if (this.mode === 'peg') {
      const s = this.pegState();
      return s.ok ? { kind: 'peg', pts: this.points.flat() } : null;
    }
    if (!this.placed.length) return null;
    return { kind: 'tiles', placed: this.placed.map(({ p, x, y, r }) => ({ p, x, y, r })) };
  }

  dirty() { const c = this.creation(); return !!c && JSON.stringify(c) !== this.savedKey; }

  /** One save at a time: a second call while one is in flight gets the same promise. */
  save() {
    if (!this.savePromise) this.savePromise = this.doSave().finally(() => { this.savePromise = null; });
    return this.savePromise;
  }

  async doSave() {
    const c = this.creation();
    if (!c) {
      sfx.bonk();
      if (this.mode === 'peg') this.ui.toast('先做一個形狀', 'Make a shape first', 1500); else this.ui.toast('先放一些圖塊', 'Put some pieces down first', 1500);
      return false;
    }
    const key = JSON.stringify(c);
    if (key === this.savedKey) { this.ui.toast('已保存！', 'Saved!', 1000); return true; }
    if (this.bridge.creations.length >= MAX_SAVED) {
      const id = await this.live(this.ui.card({
        zh: '已經有 6 個作品', en: 'You have 6 already. Saving replaces your oldest one.', icon: '📦',
        buttons: [{ id: 'save', zh: '保存', en: 'Save' }, { id: 'no', zh: '不保存', en: "Don't save" }],
      }));
      if (id !== 'save') return false;
    }
    try { await this.live(this.bridge.saveCreation(c)); } catch (e) { console.error('saveCreation failed', e); this.ui.toast('未能儲存', 'Not saved', 1800); return false; }
    if (!this.bridge.creations.includes(c)) { this.ui.toast('未能儲存', 'Not saved', 1800); return false; } // the bridge refused it
    this.savedKey = key;
    sfx.fanfare();
    confetti(this.stage, new THREE.Vector3(0, 2, 0), 40, this.root);
    this.ui.toast('已保存！', 'Saved!', 1400);
    return true;
  }

  /** Leaving (back, or another mode) with something unsaved asks first. */
  async confirmLeave() {
    if (!this.dirty()) return true;
    const id = await this.live(this.ui.card({
      zh: '要保存嗎？', en: 'Save before you go?', icon: '🧩',
      buttons: [{ id: 'save', zh: '保存', en: 'Save' }, { id: 'drop', zh: '不保存', en: "Don't save" }, { id: 'stay', zh: '繼續做', en: 'Keep building' }],
    }));
    if (id === 'stay') return false;
    if (id === 'save') return this.save();
    return true;
  }

  async askLeave() {
    if (this.leaving) return;
    this.leaving = true;
    const ok = await this.confirmLeave();
    if (ok && this.alive) this.go('Workshop'); else this.leaving = false;
  }

  async switchMode(mode) {
    if (mode === this.mode || this.leaving) return;
    this.leaving = true;
    const ok = await this.confirmLeave();
    if (ok && this.alive) this.go('FreeBuild', { mode }); else this.leaving = false;
  }
}
