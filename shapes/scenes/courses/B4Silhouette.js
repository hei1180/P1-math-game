// B4 拼砌 Silhouette: drag shapes from the tray onto a dark outline; they snap to the grid, ⟳ turns the selected one a quarter.
// Grading is checkDrop / isPuzzleDone only. A drop that does not fit goes back to the tray and counts as a mistake.
// Placed pieces can be picked up again (so nobody gets stuck). A piece dropped well away from the outline just goes home.
import * as THREE from 'three';
import { CourseScene } from '../CourseScene.js?v=0';
import { makePiece, makeOutline } from '../../models/tiles.js?v=0';
import { tween, wait, cancelTweens, motion } from '../../engine/tween.js?v=0';
import { disposeTree } from '../../engine/stage.js?v=0';
import { sfx } from '../../sfx.js?v=0';
import { voice } from '../../engine/voice.js?v=0';
import { toyColor, FONT } from '../../theme.js?v=0';
import { sparkle } from '../../fx3d.js?v=0';
import { PIECES, puzzleById, footprint, checkDrop, isPuzzleDone } from '../../../shapes-logic.js?v=0';

const CELL = 1;
const GAP = 0.45;        // space between tray slots
const TILT = 0.15;       // camera tilt from straight down (rad)
const MOVE_MIN = 0.2;    // a press that moved less than this is a tap (select), not a drop

export class B4Silhouette extends CourseScene {
  static courseKey = 'B4';

  async setup() {
    this.stuff = new THREE.Group();
    this.root.add(this.stuff);
    this.offs = [];
    this.pcs = []; this.covered = new Set(); this.placed = [];
    this.sel = null; this.dragging = null; this.bar = null;
    this.mkTurnButton();
  }

  async exit() {
    if (this.turnBtn) this.turnBtn.remove();
    this.hideBar();
    await super.exit();
  }

  // ---------- DOM ----------
  mkTurnButton() {
    const root = document.getElementById('ui');
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('aria-label', '轉一轉 Turn');
    b.className = 'bubbly-btn';
    b.style.cssText = `position:absolute;display:none;left:50%;bottom:12px;transform:translateX(-50%);min-width:96px;height:56px;padding:0 18px;border-radius:28px;border:4px solid #34d399;background:#fff;color:#1f2937;font-weight:700;font-size:22px;font-family:${FONT};pointer-events:auto;touch-action:manipulation;box-shadow:0 2px 8px rgba(0,0,0,.25)`;
    b.textContent = '⟳ 轉';
    b.addEventListener('click', () => { this.doTurn(); });
    if (root) root.appendChild(b);
    this.turnBtn = b;
  }
  showBar(items) {
    this.hideBar();
    const root = document.getElementById('ui');
    if (!root) return;
    const wrap = document.createElement('div');
    wrap.style.cssText = 'position:absolute;left:0;right:0;bottom:0;display:flex;justify-content:center;gap:12px;padding:0 12px max(12px, env(safe-area-inset-bottom));pointer-events:none';
    for (const it of items) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'bubbly-btn';
      b.style.cssText = `pointer-events:auto;min-height:56px;min-width:56px;padding:6px 16px;border-radius:16px;border:4px solid ${it.border || '#6ee7b7'};background:#fff;color:#1f2937;font-weight:700;font-family:${FONT};line-height:1.15;touch-action:manipulation`;
      const zh = document.createElement('div'); zh.textContent = it.zh; zh.style.fontSize = '20px';
      b.appendChild(zh);
      if (it.en) { const en = document.createElement('div'); en.textContent = it.en; en.style.cssText = 'font-size:12px;font-weight:400;color:#6b7280'; b.appendChild(en); }
      b.addEventListener('click', () => it.onClick(b));
      wrap.appendChild(b);
    }
    root.appendChild(wrap);
    this.bar = wrap;
  }
  hideBar() { if (this.bar) { this.bar.remove(); this.bar = null; } }

  /**
   * The ⟳ 轉 button sits at a fixed spot (bottom centre, nothing under it) and turns the selected piece.
   * It is dimmed while no tray piece is selected, and hidden while the picture celebrates.
   */
  placeTurnButton() {
    const b = this.turnBtn, pc = this.sel;
    if (!b) return;
    if (this.finished || !this.alive || !this.pcs.length) { b.style.display = 'none'; return; }
    const on = !!pc && !pc.placed && !this.dragging;
    b.style.display = 'block';
    b.style.opacity = on ? '1' : '0.45';
  }
  update() {
    const { width: w, height: h } = this.stage;
    if (this.lay && (w !== this._fw || h !== this._fh)) this.frame();
  }

  // ---------- layout ----------
  /** Shelf-pack the pieces (each in a square slot of its longer side) into rows no wider than `wt`. */
  pack(sizes, wt) {
    const rows = [];
    let cur = { items: [], w: 0, h: 0 };
    sizes.forEach((s, i) => {
      const need = s + (cur.items.length ? GAP : 0);
      if (cur.items.length && cur.w + need > wt) { rows.push(cur); cur = { items: [], w: 0, h: 0 }; }
      cur.w += s + (cur.items.length ? GAP : 0); cur.h = Math.max(cur.h, s); cur.items.push(i);
    });
    rows.push(cur);
    return { rows, w: Math.max(...rows.map(r => r.w)), h: rows.reduce((a, r) => a + r.h, 0) + GAP * (rows.length - 1) };
  }
  /** Tray beside the outline or below it, whichever lets the cells be bigger on this screen. */
  chooseLayout(sizes, ob) {
    const { width: w, height: h } = this.stage;
    const top = Math.min(185, h * 0.3), bottom = Math.min(84, h * 0.12);
    const availW = Math.max(60, w - 16), availH = Math.max(60, h - top - bottom);
    const maxS = Math.max(...sizes);
    let best = null;
    const consider = lay => {
      const ppu = Math.min(availW / (lay.width + 0.8), availH / ((lay.height + 0.8) * 0.95));
      if (!best || ppu > best.ppu) best = { ...lay, ppu };
    };
    for (const wt of [2.5, 3.5, 4.5, 5.5].filter(v => v >= maxS)) {
      const pk = this.pack(sizes, wt), g = 1.0;
      const width = pk.w + g + ob.cols, height = Math.max(pk.h, ob.rows);
      consider({ pk, width, height, tray: { x: 0, z: (height - pk.h) / 2 }, out: { x: pk.w + g, z: (height - ob.rows) / 2 } });
    }
    for (const wt of [3, 4.5, 6, 7.5].filter(v => v >= maxS)) {
      const pk = this.pack(sizes, wt), g = 1.0;
      const width = Math.max(pk.w, ob.cols), height = ob.rows + g + pk.h;
      consider({ pk, width, height, tray: { x: (width - pk.w) / 2, z: ob.rows + g }, out: { x: (width - ob.cols) / 2, z: 0 } });
    }
    return best;
  }
  frame() {
    const lay = this.lay;
    const { width: w, height: h, camera } = this.stage;
    if (!lay || !w || !h) return;
    this._fw = w; this._fh = h;
    const top = Math.min(185, h * 0.3), bottom = Math.min(84, h * 0.12);
    const ppu = Math.max(20, Math.min((w - 16) / (lay.width + 0.8), (h - top - bottom) / ((lay.height + 0.8) * 0.95)) * 0.95);
    const dist = h / ppu / 2 / Math.tan((camera.fov * Math.PI) / 360);
    const tz = -(top - bottom) / 2 / ppu;       // moving the look-at point away pushes the layout down the screen
    this.stage.setView([0, Math.cos(TILT) * dist, tz + Math.sin(TILT) * dist], [0, 0, tz]);
  }

  // ---------- one puzzle ----------
  clearStuff() {
    for (const off of this.offs) off();
    this.offs = [];
    for (const c of [...this.stuff.children]) { this.stuff.remove(c); disposeTree(c); }
    this.pcs = []; this.covered = new Set(); this.placed = [];
    this.sel = null; this.dragging = null; this.ghost = null; this.finished = false;
    this.placeTurnButton();
  }

  async playItem(item) {
    this.hideBar();
    this.clearStuff();
    this.input.enabled = true;
    const puzzle = this.puzzle = puzzleById(item.puzzle);
    this.item = item;
    this.pending = null;

    const outline = this.outline = makeOutline(puzzle, { cell: CELL });
    const ob = outline.userData;
    // pieces (rotation 0), then layout
    const used = new Set();
    this.pcs = item.pieces.map((id, i) => {
      let color = toyColor(this.bridge.rng);
      for (let t = 0; used.has(color) && t < 20; t++) color = toyColor(this.bridge.rng); // neighbours look different
      used.add(color);
      const mesh = makePiece(id, { color, cell: CELL, r: 0 });
      const holder = new THREE.Group();
      holder.add(mesh);
      const pc = { id, i, color, mesh, holder, hit: null, r: 0, placed: false, size: Math.max(mesh.userData.cols, mesh.userData.rows), slot: null };
      this.mkHit(pc);
      return pc;
    });
    const lay = this.lay = this.chooseLayout(this.pcs.map(p => p.size), ob);
    const cx = -lay.width / 2, cz = -lay.height / 2;
    // outline: puzzle cell (x0, y0) lands on the layout's outline corner
    this.ox = cx + lay.out.x - ob.x0 * CELL; this.oz = cz + lay.out.z - ob.y0 * CELL;
    outline.position.set(this.ox, 0, this.oz);
    this.stuff.add(outline);
    // tray plate + slots
    const plate = new THREE.Mesh(new THREE.BoxGeometry(lay.pk.w + 0.6, 0.04, lay.pk.h + 0.6), new THREE.MeshLambertMaterial({ color: 0xe9d5ad }));
    plate.position.set(cx + lay.tray.x + lay.pk.w / 2, 0.006 - 0.02, cz + lay.tray.z + lay.pk.h / 2);
    this.stuff.add(plate);
    let rz = cz + lay.tray.z;
    for (const row of lay.pk.rows) {
      let rx = cx + lay.tray.x + (lay.pk.w - row.w) / 2;
      for (const i of row.items) {
        const pc = this.pcs[i];
        pc.slot = { x: rx, z: rz + (row.h - pc.size) / 2, s: pc.size };
        rx += pc.size + GAP;
      }
      rz += row.h + GAP;
    }
    for (const pc of this.pcs) {
      this.putAtSlot(pc);
      this.stuff.add(pc.holder);
      this.offs.push(this.input.drag(pc.holder, {
        plane: 'floor', lift: 0.25,
        onStart: () => this.onStart(pc),
        onMove: () => this.onMove(pc),
        onEnd: (o, pt, { cancelled }) => this.onEnd(pc, cancelled),
      }));
    }
    this.frame();
    this.placeTurnButton();
    this.stage.invalidate();

    this.ui.prompt(`拼出${puzzle.zh}`, `Fill the ${puzzle.en} shape with the pieces`);
    this.done = new Promise(res => { this.resolveDone = res; });
    await this.live(this.done);
    await this.live(this.pending);                   // a hint may still be showing
    await this.live(this.celebrate());
  }

  /**
   * A generous invisible box over the piece's whole footprint, so a small or thin piece (a triangle, say) is easy to grab by any
   * part of its square. Placed pieces drop it (their real shape is picked instead, so neighbours in the picture stay reachable).
   */
  mkHit(pc) {
    if (pc.hit) { pc.holder.remove(pc.hit); pc.hit.geometry.dispose(); pc.hit.material.dispose(); }
    const { cols, rows } = pc.mesh.userData;
    const m = new THREE.Mesh(new THREE.BoxGeometry(cols * CELL, 0.3, rows * CELL), new THREE.MeshBasicMaterial({ visible: false }));
    m.position.set(cols * CELL / 2, 0.1, rows * CELL / 2);
    m.name = 'pieceHit';
    m.visible = !pc.placed;
    pc.holder.add(m);
    pc.hit = m;
  }

  /** Slot position for pc at its current turn: the footprint is centred in the slot's square. */
  slotPos(pc) {
    const { cols, rows } = pc.mesh.userData, s = pc.slot;
    return { x: s.x + (s.s - cols * CELL) / 2, z: s.z + (s.s - rows * CELL) / 2 };
  }
  putAtSlot(pc) { const p = this.slotPos(pc); pc.holder.position.set(p.x, 0, p.z); }
  async goHome(pc) {
    const p = this.slotPos(pc);
    await this.live(tween(pc.holder.position, { x: p.x, y: 0, z: p.z }, { ms: 260, ease: 'outCubic' }));
  }

  // ---------- selecting and turning ----------
  select(pc) {
    if (this.sel && this.sel.mesh) this.sel.mesh.material.emissive.setHex(0x000000);
    this.sel = pc;
    if (pc) pc.mesh.material.emissive.setHex(0x3b3b2a);
    this.placeTurnButton();
    this.stage.invalidate();
  }
  /** Turn the selected piece a quarter (rebuilt at the new r). Quick taps all count: the little hop is only for show. */
  doTurn() {
    const pc = this.sel;
    if (!pc || pc.placed || this.dragging || this.finished || !this.alive) return;
    pc.r = (pc.r + 1) % 4;
    const old = pc.mesh;
    pc.mesh = makePiece(pc.id, { color: pc.color, cell: CELL, r: pc.r });
    pc.mesh.material.emissive.setHex(0x3b3b2a);
    pc.holder.remove(old); old.material.dispose();
    pc.holder.add(pc.mesh);
    this.mkHit(pc);
    cancelTweens(pc.holder.position);
    this.putAtSlot(pc);
    sfx.tick(1);
    this.placeTurnButton();
    this.stage.invalidate();
    const pos = pc.holder.position, hop = pc.hop = (pc.hop || 0) + 1;
    tween(pos, { y: 0.3 }, { ms: 90 }).then(() => { if (pc.hop === hop && !this.dragging) return tween(pos, { y: 0 }, { ms: 140 }); });
  }

  // ---------- dragging ----------
  /** Which puzzle cell the piece's top-left is nearest to. */
  snapOf(pc) {
    const p = pc.holder.position;
    return { x: Math.round((p.x - this.ox) / CELL), y: Math.round((p.z - this.oz) / CELL) };
  }
  overlapsOutline(keys) {
    const ob = this.outline.userData;
    return keys.some(k => { const [x, y] = k.split(','); return +x >= ob.x0 && +x < ob.x0 + ob.cols && +y >= ob.y0 && +y < ob.y0 + ob.rows; });
  }
  worldOf(x, y) { return { x: this.ox + x * CELL, z: this.oz + y * CELL }; }

  onStart(pc) {
    if (this.finished) return;
    pc.hop = (pc.hop || 0) + 1; cancelTweens(pc.holder.position); pc.holder.position.y = 0; // a turn hop may still be running
    this.dragging = pc;
    this.start = pc.holder.position.clone();
    pc.wasPlaced = pc.placed;
    if (pc.placed) this.unplace(pc);                // lifted out: its cells are free while it is held
    this.select(pc);
    this.mkGhost(pc);
    sfx.tick(0);
  }
  unplace(pc) {
    for (const k of pc.keys) this.covered.delete(k);
    this.placed = this.placed.filter(e => e.pc !== pc);
    pc.placed = false;
    if (pc.hit) pc.hit.visible = true;
  }
  replace(pc) {
    for (const k of pc.keys) this.covered.add(k);
    this.placed.push({ pc, p: pc.id, x: pc.px, y: pc.py, r: pc.r });
    pc.placed = true;
    if (pc.hit) pc.hit.visible = false;
  }
  mkGhost(pc) {
    const g = makePiece(pc.id, { color: 0xffffff, cell: CELL, r: pc.r });
    g.material.dispose();
    g.material = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.4, depthWrite: false });
    g.visible = false; g.position.y = 0.03;
    this.stuff.add(g);
    this.ghost = g;
  }
  dropGhost() {
    if (!this.ghost) return;
    this.stuff.remove(this.ghost); disposeTree(this.ghost); this.ghost = null;
  }
  onMove(pc) {
    const g = this.ghost;
    if (!g || this.dragging !== pc) return;
    const s = this.snapOf(pc), keys = footprint(pc.id, s.x, s.y, pc.r);
    g.visible = this.overlapsOutline(keys);
    const w = this.worldOf(s.x, s.y);
    g.position.set(w.x, 0.03, w.z);
  }

  async onEnd(pc, cancelled) {
    if (this.finished || this.dragging !== pc) return;
    this.dragging = null;
    this.dropGhost();
    const moved = Math.hypot(pc.holder.position.x - this.start.x, pc.holder.position.z - this.start.z) > MOVE_MIN;
    if (cancelled || !moved) {
      if (pc.wasPlaced) { pc.holder.position.set(this.start.x, 0, this.start.z); this.replace(pc); }
      else if (cancelled) await this.goHome(pc);
      else pc.holder.position.y = 0;
      this.placeTurnButton(); this.stage.invalidate();
      return;                                        // a tap: just selected
    }
    const s = this.snapOf(pc), res = checkDrop(this.puzzle, this.covered, pc.id, s.x, s.y, pc.r);
    if (!this.overlapsOutline(res.keys)) {           // dropped back in the tray area: not a mistake
      await this.goHome(pc);
      this.placeTurnButton();
      return;
    }
    if (res.ok) {
      pc.px = s.x; pc.py = s.y; pc.keys = res.keys;
      this.replace(pc);
      const w = this.worldOf(s.x, s.y);
      await this.live(tween(pc.holder.position, { x: w.x, y: 0, z: w.z }, { ms: 110 }));
      sfx.pop();
      this.placeTurnButton();
      if (isPuzzleDone(this.puzzle, this.covered)) { this.finished = true; this.placeTurnButton(); this.resolveDone(); }
      return;
    }
    // Does not fit: it counts (wrong() bonks at once) and the piece goes back to the tray. The 2nd wrong answer's hint runs in the
    // background so the pointer is free again; playItem waits for it (this.pending) before the puzzle can end.
    this.ui.toast('放不下，試試轉一轉', "Doesn't fit. Try turning it", 1600);
    const w = this.wrong(this.item, PIECES[pc.id].zh, this.puzzle.zh).catch(console.error);
    this.pending = Promise.all([this.pending, w]);
    await this.goHome(pc);
    this.placeTurnButton();
  }

  // ---------- puzzle done: light up, the picture comes alive, optional save ----------
  async celebrate() {
    const pz = this.puzzle, ob = this.outline.userData;
    this.input.enabled = false;
    this.finished = true;
    this.placeTurnButton();
    if (this.sel) this.sel.mesh.material.emissive.setHex(0x000000);

    let saved = false;
    this.showBar([{
      id: 'save', zh: '⭐ 保存到我的作品', en: 'Save to my creations', border: '#facc15',
      onClick: b => {
        if (saved) return;
        saved = true;
        b.firstChild.textContent = '✓ 已保存'; b.style.opacity = '0.75';
        const placed = this.placed.map(({ p, x, y, r }) => ({ p, x, y, r }));
        try { Promise.resolve(this.bridge.saveCreation({ kind: 'tiles', placed })).catch(e => console.warn('save failed', e)); } catch (e) { console.warn('save failed', e); }
        sfx.ding();
      },
    }]);

    const art = new THREE.Group();
    this.stuff.add(art);
    for (const pc of this.pcs) art.add(pc.holder);
    for (const pc of this.pcs) {
      pc.mesh.material.emissiveIntensity = 0;
      pc.mesh.material.emissive.setHex(0xffffff);
      tween(pc.mesh.material, { emissiveIntensity: 0.35 }, { ms: 500 });
    }
    sparkle(this.stage, this.outline, this.root);
    const zh = `做好了！${pz.zh}`;
    this.ui.toast(zh, `A ${pz.en}!`, 1600);
    voice.say(zh);
    await this.live(wait(450));

    const cx = this.ox + (ob.x0 + ob.cols / 2) * CELL, bottom = this.oz + (ob.y0 + ob.rows) * CELL;
    if (pz.id === 'house') {
      const sq = pz.solution.find(s => s.p === 'bigsq');
      const win = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.06, 0.6), new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.6 }));
      win.position.set(this.ox + (sq.x + 1) * CELL, 0.15, this.oz + (sq.y + 1) * CELL);
      art.add(win);
      this.stage.invalidate();
      await this.live(wait(500));
      win.material.color.setHex(0xfde047); win.material.emissive.setHex(0xfacc15); win.material.emissiveIntensity = 1;   // the light goes on
      sfx.pop(); sparkle(this.stage, win, this.root);
      await this.live(tween(win.scale, { x: 1.25, z: 1.25 }, { ms: 200 }));
      await this.live(tween(win.scale, { x: 1, z: 1 }, { ms: 200 }));
    } else if (pz.id === 'rocket') {
      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.38, 1.1, 14), new THREE.MeshStandardMaterial({ color: 0xfb923c, emissive: 0xf97316, emissiveIntensity: 1 }));
      flame.rotation.x = Math.PI / 2; flame.position.set(cx, 0.15, bottom + 0.55);
      flame.scale.setScalar(0.01);
      art.add(flame);
      sfx.whoosh();
      await this.live(tween(flame.scale, { x: 1, y: 1, z: 1 }, { ms: 250, ease: 'outBack' }));
      if (!motion.less) for (const dx of [0.07, -0.07, 0.07, 0]) await this.live(tween(art.position, { x: dx }, { ms: 60, ease: 'linear' }));
      await this.live(tween(art.position, { y: 4, z: -12 }, { ms: 1300, ease: 'inOutCubic' }));   // blast off
    } else if (pz.id === 'face') {
      const eye = this.pcs.filter(p => p.id === 'circle')[1] || this.pcs.find(p => p.id === 'circle');
      if (eye) {
        const z0 = eye.holder.position.z, k = 0.15;
        sfx.boing();
        await this.live(tween(eye.holder.scale, { z: k }, { ms: 140 }));
        eye.holder.position.z = z0 + 0.5 * CELL * (1 - k);                 // squash about the eye's centre
        await this.live(wait(380));
        await this.live(tween(eye.holder.scale, { z: 1 }, { ms: 160 }));
        eye.holder.position.z = z0;
      }
    } else if (pz.id === 'boat') {
      sfx.whoosh();
      await this.live(tween(art.position, { z: 0.08 }, { ms: 140 }));
      await this.live(tween(art.position, { x: 13 }, { ms: 1700, ease: 'inOutCubic' }));       // sails away
    } else {
      for (const pc of this.pcs) await this.live(tween(pc.holder.position, { y: 0.3 }, { ms: 120 }).then(() => tween(pc.holder.position, { y: 0 }, { ms: 140 })));
    }
    await this.live(wait(saved ? 500 : 2200));       // time to tap Save, then on
    this.hideBar();
  }

  // ---------- hint (2nd wrong drop): the next solution piece blinks at its spot, turned the right way ----------
  async hint(item) {
    const pz = this.puzzle;
    if (this.finished) return;
    const free = s => footprint(s.p, s.x, s.y, s.r).every(k => !this.covered.has(k));
    const avail = s => this.pcs.some(pc => pc.id === s.p && !pc.placed);
    let next = pz.solution.find(s => free(s) && avail(s));
    if (!next) {                                     // the pieces placed so far block every solution spot: start over
      if (this.dragging || this.finished) return;
      this.ui.toast('再試一次', 'Try again', 1200);
      for (const pc of [...this.pcs].filter(p => p.placed)) { this.unplace(pc); await this.goHome(pc); }
      next = pz.solution.find(s => free(s) && avail(s));
      if (!next || this.finished) return;
    }
    const w = this.worldOf(next.x, next.y);
    const g = makePiece(next.p, { color: 0xffffff, cell: CELL, r: next.r });
    g.material.dispose();
    g.material = new THREE.MeshBasicMaterial({ color: 0xfde047, transparent: true, opacity: 0.9, depthWrite: false });
    g.position.set(w.x, 0.16, w.z);
    this.stuff.add(g);
    const pc = this.pcs.find(p => p.id === next.p && !p.placed);
    if (pc) this.select(pc);
    this.ui.toast(`試試放這裏：${PIECES[next.p].zh}`, 'Try this one here', 2400);
    voice.say(`試試放這裏：${PIECES[next.p].zh}`);
    for (let i = 0; i < 3 && !this.finished; i++) {
      await this.live(tween(g.material, { opacity: 0.2 }, { ms: 360, ease: 'linear' }));
      await this.live(tween(g.material, { opacity: 0.95 }, { ms: 360, ease: 'linear' }));
    }
    this.stuff.remove(g); disposeTree(g);
    this.stage.invalidate();
  }
}
