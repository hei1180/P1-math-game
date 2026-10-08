// My Robot (the Garage): the child's robot on a turntable. One finger turns it. Slot tabs pick wheels / head / arms /
// antenna / colour / badge / face; parts not earned yet are dark silhouettes (grey swatches) that say which course gives them.
// Items the child has not looked at yet carry a red 「新」 dot (bridge.markSeen when their tab opens). The name is picked
// from ROBOT_NAMES plus a number with − / + buttons (no keyboard, no free text anywhere).
// 保存 Save → bridge.saveRobot, a short dance, then back to the Workshop by itself.
import * as THREE from 'three';
import { Scene } from '../engine/scenes.js?v=202610081258';
import { wait, motion } from '../engine/tween.js?v=202610081258';
import { SLOTS, BASIC_PART, PARTS, LOOKS, LOOK_INFO, COURSES, courseByKey, ROBOT_NAMES, robotName, ownedItems, unseenItems } from '../../shapes-logic.js?v=202610081258';
import { makeRobot, PART_INFO, faceIcon, paintCss } from '../models/robot.js?v=202610081258';
import { SCENE, FONT } from '../theme.js?v=202610081258';
import { sfx } from '../sfx.js?v=202610081258';
import { confetti } from '../fx3d.js?v=202610081258';

const SLOT_INFO = {
  wheels:  { zh: '輪子', en: 'Wheels',  icon: '⚙️' },
  head:    { zh: '頭',   en: 'Head',    icon: '🤖' },
  arms:    { zh: '手',   en: 'Arms',    icon: '💪' },
  antenna: { zh: '天線', en: 'Antenna', icon: '📡' },
  paint:   { zh: '顏色', en: 'Colour',  icon: '🎨' },
  badge:   { zh: '徽章', en: 'Badge',   icon: '🏅' },
  face:    { zh: '表情', en: 'Face',    icon: '😊' },
};
const NAME_TAB = { zh: '名字', en: 'Name', icon: '🏷️' };
const PART_ICON = {
  'wheels-basic': '⚫', 'wheels-star': '⭐', 'wheels-flower': '🌸',
  'head-basic': '🙂', 'head-tv': '📺', 'head-dome': '🔮',
  'arms-basic': '✋', 'arms-spring': '🌀', 'arms-claw': '🦀',
  'antenna-zigzag': '⚡', 'paint-blue': '🔵', 'paint-rainbow': '🌈', 'badge-gold': '🏅', none: '🚫',
};
const PART_EN = {
  'wheels-basic': 'Plain wheels', 'wheels-star': 'Star wheels', 'wheels-flower': 'Flower wheels',
  'head-basic': 'Plain head', 'head-tv': 'TV head', 'head-dome': 'Dome head',
  'arms-basic': 'Plain arms', 'arms-spring': 'Spring arms', 'arms-claw': 'Claw arms',
  'antenna-zigzag': 'Zigzag antenna', 'paint-rainbow': 'Rainbow', 'badge-gold': 'Gold badge', none: 'None',
  'paint-blue': 'Blue', 'paint-red': 'Red', 'paint-yellow': 'Yellow', 'paint-green': 'Green', 'paint-orange': 'Orange',
  'paint-pink': 'Pink', 'paint-purple': 'Purple', 'paint-white': 'White', 'paint-black': 'Black', 'paint-gold': 'Gold',
  'face-smile': 'Smile', 'face-happy': 'Happy', 'face-wink': 'Wink', 'face-surprised': 'Surprised', 'face-cool': 'Cool',
  'face-silly': 'Silly', 'face-sleepy': 'Sleepy', 'face-love': 'Love', 'face-star': 'Star eyes', 'face-proud': 'Proud',
};
const COURSE_ORDER = [...COURSES.map(c => c.key), 'boss'];
/** Which course gives an item (PARTS first, then LOOKS); null for basics. */
const courseOf = id => COURSE_ORDER.find(k => (PARTS[k] && PARTS[k].id === id) || (LOOKS[k] && LOOKS[k].includes(id))) || null;
/** Course name for 「完成 X 可得到」. */
const courseZh = k => (k === 'boss' ? '測試跑道' : (courseByKey(k) || { zh: k }).zh);
const courseEn = k => (k === 'boss' ? 'the Test Track' : (courseByKey(k) || { en: k }).en);
/** A slot's options: the basic item, then earned items in course order. */
function optionsFor(slot) {
  const ids = [BASIC_PART[slot]];
  for (const k of COURSE_ORDER) for (const id of [PARTS[k] && PARTS[k].id, ...(LOOKS[k] || [])]) {
    if (id && !ids.includes(id) && ((PART_INFO[id] && PART_INFO[id].slot === slot) || (LOOK_INFO[id] && LOOK_INFO[id].slot === slot))) ids.push(id);
  }
  return ids;
}
/** The small red 「新」 dot on a new item or on a tab that holds one. */
const newDot = () => {
  const d = E('div', 'position:absolute;top:-6px;right:-6px;min-width:22px;height:22px;padding:0 3px;box-sizing:border-box;border-radius:11px;background:#ef4444;color:#fff;border:2px solid #fff;font-size:12px;font-weight:700;line-height:18px;text-align:center;pointer-events:none;box-shadow:0 1px 3px rgba(0,0,0,.25)', '新');
  d.className = 'new-dot';
  return d;
};
const K = 2 * Math.tan((20 * Math.PI) / 180); // visible height = K × camera distance (fov 40)

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
const lines = (b, zh, en, zhCss = 'font-size:18px', enCss = 'font-size:11px;font-weight:400;opacity:.75') => {
  b.append(E('div', zhCss + ';line-height:1.15', zh), E('div', enCss + ';line-height:1.15', en));
};

export class GarageScene extends Scene {
  async enter() {
    const { stage, input, ui, bridge } = this;
    this.cfg = { ...BASIC_PART, ...bridge.progress.robot };
    if (!this.cfg.name) this.cfg.name = null;
    this.savedJson = JSON.stringify(this.cfg);
    this.tab = 'wheels';
    this.busy = false;
    this.leaving = false;
    this.side = null;
    this.tabCols = 0;

    // the owned set: basics + earned parts + colours / faces of cleared courses; test mode (teacher / dev) owns everything
    this.owned = new Set(bridge.testMode ? SLOTS.flatMap(optionsFor) : ownedItems(bridge.progress));
    this.unseen = new Set(unseenItems(bridge.progress)); // items with a 「新」 dot still to come on their tab
    this.fresh = new Set(); // new items on the open tab: their dot stays until the child leaves the tab

    this.buildRoom();
    this.buildTurntable();
    this.buildTurnHandle();

    this.buildPanel();
    this.refreshName(true);
    ui.back(() => this.askBack());
    this.frame();
    stage.invalidate();
    this.react('wave');
  }

  // ---------------------------------------------------------------- 3-D
  buildRoom() {
    const floor = new THREE.Mesh(new THREE.BoxGeometry(40, 0.3, 40), new THREE.MeshLambertMaterial({ color: SCENE.floor }));
    floor.position.set(0, -0.15, 14); // long, so a tall phone screen still shows floor under the panel
    const wall = new THREE.Mesh(new THREE.BoxGeometry(40, 20, 0.3), new THREE.MeshLambertMaterial({ color: SCENE.wall }));
    wall.position.set(0, 10, -4.65);
    const bench = new THREE.Mesh(new THREE.BoxGeometry(40, 0.5, 0.35), new THREE.MeshLambertMaterial({ color: SCENE.bench }));
    bench.position.set(0, 0.25, -4.4);
    this.root.add(floor, wall, bench);
  }

  buildTurntable() {
    const pivot = this.pivot = new THREE.Group();
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.6, 0.3, 40), new THREE.MeshStandardMaterial({ color: SCENE.metal, roughness: 0.5, metalness: 0.2 }));
    disc.position.y = 0.15;
    pivot.add(disc);
    const tickMat = new THREE.MeshStandardMaterial({ color: SCENE.dark, roughness: 0.7 }), goldMat = new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.5 });
    for (let i = 0; i < 12; i++) { // ticks round the rim so the turning shows (one is gold)
      const a = (i / 12) * Math.PI * 2, t = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.04, 0.34), i === 0 ? goldMat : tickMat);
      t.position.set(Math.sin(a) * 1.3, 0.31, Math.cos(a) * 1.3); t.rotation.y = a;
      pivot.add(t);
    }
    const robot = this.robot = makeRobot(this.cfg);
    robot.position.y = 0.3;
    pivot.add(robot);
    this.root.add(pivot);
  }

  /**
   * One finger anywhere on the robot or turntable turns it about the vertical axis: a big invisible box is dragged along a
   * vertical plane, and its sideways travel is the turn (a clean yaw, never a tilt).
   */
  buildTurnHandle() {
    const home = new THREE.Vector3(0, 1.4, 0);
    const proxy = new THREE.Mesh(new THREE.BoxGeometry(3.6, 2.8, 3.6), new THREE.MeshBasicMaterial({ visible: false }));
    proxy.position.copy(home);
    this.root.add(proxy);
    let start = 0;
    this.input.drag(proxy, {
      plane: new THREE.Plane(new THREE.Vector3(0, 0, 1), 0), lift: 0,
      onStart: () => { start = this.pivot.rotation.y; },
      onMove: o => { this.pivot.rotation.y = start + (o.position.x - home.x) * 1.6; this.stage.invalidate(); },
      onEnd: o => { o.position.copy(home); },
    });
  }

  /** Put the robot in the free area next to the panel (above it, or left of it on a short screen). Only runs when something resized. */
  frame() {
    const st = this.stage, W = st.width, H = st.height, aspect = W / Math.max(1, H);
    const side = this.side, f = side ? 0 : Math.min(0.62, this.panel.offsetHeight / Math.max(1, H)), fw = side ? Math.min(0.6, this.panel.offsetWidth / Math.max(1, W)) : 0;
    const t = 0.16; // the name sign at the top
    const d = Math.max(3.9 / ((1 - f - t) * K), 3.6 / (K * aspect * (1 - fw)), 5);
    const ly = 1.15 - ((f - t) / 2) * K * d, lx = (fw / 2) * K * d * aspect; // look past the robot so it sits in the free area
    st.setView([lx, Math.max(ly + 1.2, 0.6), d], [lx, ly, 0]); // never under the floor (a tall panel pushes the view down)
  }

  /** Bottom panel on a normal screen, a side panel on a short one (landscape phone). */
  layoutPanel() {
    const side = this.stage.height < 500;
    if (side === this.side) return false;
    this.side = side;
    this.panel.style.cssText = `position:absolute;display:flex;flex-direction:column;gap:8px;box-sizing:border-box;background:rgba(255,251,235,.95);pointer-events:auto;font-family:${FONT};` + (side
      ? 'right:0;top:110px;bottom:0;width:min(48%,400px);padding:8px;border-left:4px solid #fcd34d;border-radius:20px 0 0 0'
      : 'left:0;right:0;bottom:0;max-height:54%;max-width:720px;margin:0 auto;padding:8px 8px max(8px, env(safe-area-inset-bottom));border-top:4px solid #fcd34d;border-radius:20px 20px 0 0');
    // bottom panel: the tabs stay put and only the options scroll; short side panel: the tabs scroll with them
    if (side) this.scrollEl.prepend(this.tabsEl); else this.panel.prepend(this.tabsEl);
    return true;
  }

  onResize() {
    if (typeof this.stage.resize === 'function') this.stage.resize(); // measure first, then fit
    this.layoutPanel();
    if (this.tabColsWanted() !== this.tabCols) this.renderTabs();
    this.frame();
  }

  /** The robot reacts (wave / hop / dance). Skipped while another reaction runs. */
  async react(kind, opts = {}) {
    if (this.busy || !this.alive) return;
    this.busy = true;
    try { await this.live(this.robot.userData[kind]({ ...opts, on: n => { if (!this.alive) return; if (n === 'beat') sfx.tick(Math.floor(Math.random() * 6)); else if (n === 'boing') sfx.boing(); } })); }
    finally { this.busy = false; }
  }

  // ---------------------------------------------------------------- panel
  buildPanel() {
    const panel = this.panel = E('div');
    this.tabsEl = E('div', 'display:grid;gap:6px;flex:none;padding:6px 6px 0');
    this.bodyEl = E('div', 'flex:none;display:flex;flex-direction:column;gap:8px;min-height:92px;justify-content:center;padding:6px');
    const scroll = this.scrollEl = E('div', 'display:flex;flex-direction:column;gap:2px;flex:1 1 auto;min-height:0;overflow-y:auto');
    scroll.appendChild(this.bodyEl);
    this.saveBtn = button('flex:none;background:#22c55e;color:#fff;border:4px solid #16a34a;font-size:20px;padding:4px 16px;min-height:56px', () => this.save());
    lines(this.saveBtn, '保存', 'Save', 'font-size:22px', 'font-size:11px;font-weight:400;opacity:.85');
    panel.append(this.tabsEl, scroll, this.saveBtn);
    const root = document.getElementById('ui');
    root.appendChild(panel);
    this.layoutPanel();
    this.renderTabs(); this.renderBody();
    // re-fit only when the screen or the panel changes size (no layout reads every frame)
    this.ro = new ResizeObserver(() => { if (this.alive) this.onResize(); });
    this.ro.observe(root); this.ro.observe(panel);
  }

  async exit() { if (this.ro) this.ro.disconnect(); }

  /** 8 tabs in one row when the panel is wide, else 4 × 2 (each tab stays ≥ 48 px wide on a phone). */
  tabColsWanted() { return this.panel && this.panel.clientWidth >= 560 ? 8 : 4; }

  renderTabs() {
    this.tabsEl.replaceChildren();
    this.tabCols = this.tabColsWanted();
    this.tabsEl.style.gridTemplateColumns = `repeat(${this.tabCols}, minmax(0, 1fr))`;
    for (const key of [...SLOTS, 'name']) {
      const info = key === 'name' ? NAME_TAB : SLOT_INFO[key], on = key === this.tab;
      const b = button(`position:relative;min-width:0;padding:2px 0;border:3px solid ${on ? '#f59e0b' : '#d1d5db'};background:${on ? '#fef3c7' : '#fff'};color:#1f2937;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:56px`, () => this.openTab(key));
      const isNew = key !== 'name' && optionsFor(key).some(id => this.unseen.has(id));
      b.setAttribute('aria-label', `${info.zh} ${info.en}${isNew ? ' 新 new' : ''}`);
      b.append(E('div', 'font-size:22px;line-height:1.1', info.icon), E('div', 'font-size:13px;line-height:1.1', info.zh), E('div', 'font-size:9px;font-weight:400;opacity:.7;line-height:1.1', info.en));
      if (isNew) b.appendChild(newDot());
      this.tabsEl.appendChild(b);
    }
  }

  openTab(key) {
    if (key === this.tab) return;
    this.tab = key; sfx.tick(0);
    this.fresh = new Set();
    this.renderBody();
    this.renderTabs();
  }

  renderBody() {
    this.bodyEl.replaceChildren();
    if (this.tab === 'name') { this.renderName(); return; }
    // opening a slot shows its new items: they keep their dot while this tab is open, and count as seen from now on
    const seenNow = optionsFor(this.tab).filter(id => this.unseen.has(id));
    if (seenNow.length) {
      for (const id of seenNow) { this.unseen.delete(id); this.fresh.add(id); }
      if (this.bridge.markSeen) this.bridge.markSeen(seenNow);
      if (this.tabsEl.childElementCount) this.renderTabs();
    }
    if (this.tab === 'paint') this.renderSwatches();
    else if (this.tab === 'face') this.renderFaces();
    else this.renderParts(this.tab);
  }

  /** 「完成 X 可得到」 for a locked item. */
  lockedText(id) {
    const k = courseOf(id);
    return { zh: `完成 ${courseZh(k)} 可得到`, en: `Finish ${courseEn(k)} to get it` };
  }

  /** Grid for the many colours and faces: columns of ≥ 52 px (6 on a phone). */
  grid() { return E('div', 'display:grid;grid-template-columns:repeat(auto-fill,minmax(52px,1fr));gap:10px 4px'); }

  /** Caption under a grid that has locked items. */
  lockedCaption(ids) {
    if (ids.every(id => this.owned.has(id))) return;
    const c = E('div', 'text-align:center;color:#92400e;line-height:1.15');
    lines(c, '🔒 灰色的要完成關卡才可以得到', 'Grey ones: finish the course to get them', 'font-size:14px', 'font-size:10px;opacity:.75');
    this.bodyEl.appendChild(c);
  }

  renderSwatches() {
    const ids = optionsFor('paint'), grid = this.grid();
    for (const id of ids) {
      const own = this.owned.has(id), on = this.cfg.paint === id, zh = (PART_INFO[id] && PART_INFO[id].zh) || id;
      const b = button(`position:relative;min-height:70px;padding:2px 0;border:none;background:transparent;color:#1f2937;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;gap:3px;box-shadow:none`, () => this.pick('paint', id, own));
      const ring = on ? '0 0 0 4px #fff, 0 0 0 7px #f59e0b' : '0 1px 3px rgba(0,0,0,.25)';
      const sw = E('div', `width:42px;height:42px;flex:none;border-radius:50%;box-sizing:border-box;display:flex;align-items:center;justify-content:center;font-size:18px;box-shadow:${ring};` + (own
        ? `background:${paintCss(id)};border:3px solid rgba(0,0,0,.18)`
        : 'background:#d1d5db;border:3px dashed #9ca3af'), own ? '' : '🔒');
      b.appendChild(sw);
      if (own) { b.appendChild(E('div', 'font-size:14px;line-height:1.1', zh)); b.appendChild(E('div', 'font-size:9px;font-weight:400;opacity:.7;line-height:1', PART_EN[id] || '')); }
      else b.appendChild(E('div', 'font-size:10px;line-height:1.15;white-space:nowrap;letter-spacing:-.3px;color:#b45309', courseZh(courseOf(id))));
      if (this.fresh.has(id)) b.appendChild(newDot());
      b.setAttribute('aria-label', own ? `${zh} ${PART_EN[id] || ''}` : `${zh} ${this.lockedText(id).zh}`);
      grid.appendChild(b);
    }
    this.bodyEl.appendChild(grid);
    this.lockedCaption(ids);
  }

  renderFaces() {
    const ids = optionsFor('face'), grid = this.grid(), bg = paintCss(this.cfg.paint);
    for (const id of ids) {
      const own = this.owned.has(id), on = this.cfg.face === id, zh = (PART_INFO[id] && PART_INFO[id].zh) || id;
      const b = button(`position:relative;min-height:80px;padding:3px 0;border:3px solid ${on ? '#f59e0b' : own ? '#6ee7b7' : '#9ca3af'};background:${on ? '#fef3c7' : own ? '#fff' : '#e5e7eb'};color:#1f2937;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;gap:2px`, () => this.pick('face', id, own));
      const pic = E('div', `width:46px;height:32px;flex:none;border-radius:10px;display:flex;align-items:center;justify-content:center;background:${own ? bg : '#cbd5e1'}`);
      const img = E('img', `width:44px;height:27.5px;display:block;${own ? '' : 'filter:brightness(0);opacity:.35'}`);
      img.src = faceIcon(id); img.alt = ''; img.draggable = false;
      pic.appendChild(img);
      b.appendChild(pic);
      if (own) { b.appendChild(E('div', 'font-size:14px;line-height:1.1', zh)); b.appendChild(E('div', 'font-size:9px;font-weight:400;opacity:.7;line-height:1', PART_EN[id] || '')); }
      else b.appendChild(E('div', 'font-size:10px;line-height:1.15;white-space:nowrap;letter-spacing:-.3px;color:#b45309', courseZh(courseOf(id))));
      if (this.fresh.has(id)) b.appendChild(newDot());
      b.setAttribute('aria-label', own ? `${zh} ${PART_EN[id] || ''}` : `${zh} ${this.lockedText(id).zh}`);
      grid.appendChild(b);
    }
    this.bodyEl.appendChild(grid);
    this.lockedCaption(ids);
  }

  renderParts(slot) {
    const ids = optionsFor(slot);
    const row = E('div', 'display:flex;gap:8px;justify-content:center');
    for (const id of ids) {
      const own = this.owned.has(id), on = this.cfg[slot] === id;
      const b = button(`position:relative;flex:1;max-width:190px;min-height:84px;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:4px;border:4px solid ${on ? '#f59e0b' : own ? '#6ee7b7' : '#9ca3af'};background:${on ? '#fef3c7' : own ? '#fff' : '#e5e7eb'};color:#1f2937`, () => this.pick(slot, id, own));
      const zh = (PART_INFO[id] && PART_INFO[id].zh) || id;
      // locked parts are dark silhouettes
      b.appendChild(E('div', `font-size:34px;line-height:1.1;${own ? '' : 'filter:brightness(0);opacity:.45'}`, PART_ICON[id] || '❓'));
      b.appendChild(E('div', `font-size:16px;line-height:1.15;${own ? '' : 'opacity:.6'}`, own ? zh : `🔒 ${zh}`));
      if (own) b.appendChild(E('div', 'font-size:11px;font-weight:400;opacity:.7;line-height:1.1', PART_EN[id] || ''));
      else {
        const t = this.lockedText(id);
        b.appendChild(E('div', 'font-size:13px;line-height:1.15;color:#b45309', t.zh));
        b.appendChild(E('div', 'font-size:10px;font-weight:400;line-height:1.1;opacity:.75', t.en));
      }
      if (this.fresh.has(id)) b.appendChild(newDot());
      b.setAttribute('aria-label', own ? `${zh} ${PART_EN[id] || ''}` : `${zh} ${this.lockedText(id).zh}`);
      row.appendChild(b);
    }
    this.bodyEl.appendChild(row);
  }

  pick(slot, id, own) {
    if (this.leaving) return;
    if (!own) {
      sfx.bonk();
      const t = this.lockedText(id);
      this.ui.toast(t.zh, t.en, 1800);
      return;
    }
    this.fresh.delete(id);
    if (this.cfg[slot] !== id) {
      this.cfg[slot] = id;
      this.robot.userData.setPart(slot, id);
      this.stage.invalidate(); // the stage renders on demand
      sfx.pop();
      this.renderBody();
    }
    this.react(slot === 'face' ? 'wave' : 'hop');
  }

  // ---------------------------------------------------------------- name
  renderName() {
    const n = this.cfg.name;
    const grid = E('div', 'display:grid;grid-template-columns:repeat(4,1fr);gap:6px');
    ROBOT_NAMES.forEach((nm, i) => {
      const on = n && n.i === i;
      const b = button(`min-height:52px;padding:2px;border:3px solid ${on ? '#f59e0b' : '#d1d5db'};background:${on ? '#fef3c7' : '#fff'};color:#1f2937;display:flex;flex-direction:column;align-items:center;justify-content:center`, () => {
        this.cfg.name = { i, n: n ? n.n : 1 };
        sfx.pop(); this.refreshName(); this.renderBody();
      });
      lines(b, nm.zh, nm.en, 'font-size:18px', 'font-size:10px;font-weight:400;opacity:.75');
      grid.appendChild(b);
    });
    const num = E('div', 'display:flex;gap:6px;align-items:stretch;justify-content:center');
    const step = (label, d) => {
      const b = button(`flex:1;max-width:84px;font-size:22px;border:3px solid #93c5fd;background:#dbeafe;color:#1e3a8a;${n ? '' : 'opacity:.4'}`, () => {
        if (!this.cfg.name) return;
        this.cfg.name = { ...this.cfg.name, n: Math.max(1, Math.min(99, this.cfg.name.n + d)) };
        sfx.tick(d > 0 ? 3 : 1); this.refreshName(); this.renderBody();
      });
      b.textContent = label;
      b.setAttribute('aria-label', (d > 0 ? '加 plus ' : '減 minus ') + Math.abs(d));
      return b;
    };
    const shown = E('div', `min-width:72px;display:flex;align-items:center;justify-content:center;border-radius:16px;background:#fff;border:3px solid #fcd34d;font-size:28px;font-weight:700;font-family:${FONT};color:#1f2937`, n ? String(n.n) : '–');
    num.append(step('−10', -10), step('−', -1), shown, step('+', 1), step('+10', 10));
    this.bodyEl.append(grid, num);
  }

  /** The name sign at the top shows the robot's name (or 「我的機械人」 until one is picked). */
  refreshName(first = false) {
    const n = this.cfg.name;
    this.ui.prompt(n ? robotName(n) : '我的機械人', n ? `${ROBOT_NAMES[n.i].en} ${n.n}` : 'My Robot', { speak: first });
  }

  // ---------------------------------------------------------------- save / leave
  dirty() { return JSON.stringify(this.cfg) !== this.savedJson; }

  /** One save at a time: a second call while one is in flight gets the same promise. Resolves true when saved. */
  save() {
    if (this.leaving) return Promise.resolve(false);
    if (!this.savePromise) this.savePromise = this.doSave().finally(() => { this.savePromise = null; if (this.alive && !this.leaving) this.saveBtn.style.opacity = ''; });
    return this.savePromise;
  }

  async doSave() {
    const snapshot = JSON.stringify(this.cfg); // what is being saved; later edits made while it saves stay unsaved
    this.saveBtn.style.opacity = '0.6';
    try { await this.live(this.bridge.saveRobot({ ...this.cfg })); } catch (e) { console.error('saveRobot failed', e); this.ui.toast('未能保存', 'Not saved', 1800); return false; }
    this.savedJson = snapshot;
    this.leaveHappy().catch(console.error);
    return true;
  }

  /** Saved: a short happy dance (a wave with less motion), 「已保存！」, then back to the Workshop by itself (~1.2 s). */
  async leaveHappy() {
    this.leaving = true;
    this.panel.style.pointerEvents = 'none'; // nothing more to change: the robot is on its way back
    sfx.fanfare();
    confetti(this.stage, new THREE.Vector3(0, 2, 0.5), 40, this.root);
    this.ui.toast('已保存！', 'Saved!', 1400);
    while (this.busy) await this.live(wait(60)); // let a running hop / wave finish first
    await this.live(Promise.all([motion.less ? this.react('wave') : this.react('dance', { steps: 3 }), wait(1200)]));
    if (this.alive) this.go('Workshop');
  }

  async askBack() {
    if (this.leaving) return;
    if (!this.dirty()) { this.go('Workshop'); return; }
    const id = await this.live(this.ui.card({
      zh: '要保存嗎？', en: 'Save your robot?', icon: '🤖',
      buttons: [{ id: 'save', zh: '保存', en: 'Save' }, { id: 'drop', zh: '不保存', en: "Don't save" }, { id: 'stay', zh: '繼續改', en: 'Keep editing' }],
    }));
    if (id === 'stay') return;
    if (id === 'save') { await this.save(); return; } // saved → leaveHappy goes back by itself; failed → stay
    if (this.alive) this.go('Workshop');
  }
}
