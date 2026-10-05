// My Robot (the Garage): the child's robot on a turntable. One finger turns it. Slot tabs pick wheels / head / arms /
// antenna / paint / badge; parts not earned yet are dark silhouettes that say which course gives them. The name is picked
// from ROBOT_NAMES plus a number with − / + buttons (no keyboard, no free text anywhere). 保存 Save → bridge.saveRobot.
import * as THREE from 'three';
import { Scene } from '../engine/scenes.js?v=0';
import { wait } from '../engine/tween.js?v=0';
import { SLOTS, BASIC_PART, PARTS, ROBOT_NAMES, robotName } from '../../shapes-logic.js?v=0';
import { makeRobot, PART_INFO } from '../models/robot.js?v=0';
import { SCENE, FONT } from '../theme.js?v=0';
import { sfx } from '../sfx.js?v=0';
import { confetti } from '../fx3d.js?v=0';

const SLOT_INFO = {
  wheels:  { zh: '輪子', en: 'Wheels',  icon: '⚙️' },
  head:    { zh: '頭',   en: 'Head',    icon: '🤖' },
  arms:    { zh: '手',   en: 'Arms',    icon: '💪' },
  antenna: { zh: '天線', en: 'Antenna', icon: '📡' },
  paint:   { zh: '油漆', en: 'Paint',   icon: '🎨' },
  badge:   { zh: '徽章', en: 'Badge',   icon: '🏅' },
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
  'antenna-zigzag': 'Zigzag antenna', 'paint-blue': 'Blue paint', 'paint-rainbow': 'Rainbow paint', 'badge-gold': 'Gold badge', none: 'None',
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
    this.yaw = 0;
    this.size = '';

    // the owned set: basics + earned parts; test mode (teacher / dev) owns everything so every part can be tried
    this.owned = new Set(Object.values(BASIC_PART));
    for (const id of (bridge.testMode ? Object.values(PARTS).map(p => p.id) : bridge.progress.parts)) this.owned.add(id);

    this.buildRoom();
    this.buildTurntable();
    input.spin(this.pivot, { speed: 0.012 });

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

  /** The turntable only turns about the vertical axis (Input.spin also tilts, so keep just the yaw). */
  update() {
    const q = this.pivot.quaternion;
    if (q.x !== 0 || q.z !== 0) {
      const e = new THREE.Euler().setFromQuaternion(q, 'YXZ');
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), e.y);
    }
    const sig = `${this.stage.width}x${this.stage.height}x${this.panel ? this.panel.offsetHeight : 0}`;
    if (sig !== this.size) this.frame();
  }

  /** Put the robot in the free area above the panel, whatever the screen shape. */
  frame() {
    const st = this.stage, ph = this.panel ? this.panel.offsetHeight : 260;
    this.size = `${st.width}x${st.height}x${ph}`;
    const f = Math.min(0.62, ph / Math.max(1, st.height)), t = 0.16, aspect = st.width / Math.max(1, st.height); // t = the name sign at the top
    const d = Math.max(3.9 / ((1 - f - t) * K), 3.6 / (K * aspect), 5);
    const ly = 1.15 - ((f - t) / 2) * K * d; // look a little lower so the robot sits between the sign and the panel
    st.setView([0, ly + 1.2, d], [0, ly, 0]);
  }

  /** The robot reacts (wave / hop / dance). Skipped while another reaction runs. */
  async react(kind) {
    if (this.busy || !this.alive) return;
    this.busy = true;
    try { await this.live(this.robot.userData[kind]({ on: n => { if (n === 'beat') sfx.tick(Math.floor(Math.random() * 6)); else if (n === 'boing') sfx.boing(); } })); }
    finally { this.busy = false; }
  }

  // ---------------------------------------------------------------- panel
  buildPanel() {
    const panel = this.panel = E('div', `position:absolute;left:0;right:0;bottom:0;display:flex;flex-direction:column;gap:8px;padding:8px 8px max(8px, env(safe-area-inset-bottom));background:rgba(255,251,235,.95);border-top:4px solid #fcd34d;border-radius:20px 20px 0 0;pointer-events:auto;font-family:${FONT};max-width:720px;margin:0 auto`);
    this.tabsEl = E('div', 'display:flex;gap:4px');
    this.bodyEl = E('div', 'display:flex;flex-direction:column;gap:8px;min-height:92px;justify-content:center');
    this.saveBtn = button('background:#22c55e;color:#fff;border:4px solid #16a34a;font-size:20px;padding:4px 16px;min-height:56px', () => this.save());
    lines(this.saveBtn, '保存', 'Save', 'font-size:22px', 'font-size:11px;font-weight:400;opacity:.85');
    panel.append(this.tabsEl, this.bodyEl, this.saveBtn);
    document.getElementById('ui').appendChild(panel);
    this.renderTabs(); this.renderBody();
  }

  renderTabs() {
    this.tabsEl.replaceChildren();
    for (const key of [...SLOTS, 'name']) {
      const info = key === 'name' ? NAME_TAB : SLOT_INFO[key], on = key === this.tab;
      const b = button(`flex:1;min-width:0;padding:2px 0;border:3px solid ${on ? '#f59e0b' : '#d1d5db'};background:${on ? '#fef3c7' : '#fff'};color:#1f2937;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:56px`, () => { this.tab = key; sfx.tick(0); this.renderTabs(); this.renderBody(); });
      b.setAttribute('aria-label', `${info.zh} ${info.en}`);
      b.append(E('div', 'font-size:22px;line-height:1.1', info.icon), E('div', 'font-size:12px;line-height:1.1', info.zh));
      this.tabsEl.appendChild(b);
    }
  }

  renderBody() {
    this.bodyEl.replaceChildren();
    if (this.tab === 'name') this.renderName(); else this.renderParts(this.tab);
  }

  partKey(id) { return Object.keys(PARTS).find(k => PARTS[k].id === id); }

  renderParts(slot) {
    const ids = [BASIC_PART[slot], ...Object.values(PARTS).filter(p => p.slot === slot).map(p => p.id)];
    const row = E('div', 'display:flex;gap:8px;justify-content:center');
    for (const id of ids) {
      const own = this.owned.has(id), on = this.cfg[slot] === id;
      const b = button(`flex:1;max-width:190px;min-height:84px;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:4px;border:4px solid ${on ? '#f59e0b' : own ? '#6ee7b7' : '#9ca3af'};background:${on ? '#fef3c7' : own ? '#fff' : '#e5e7eb'};color:#1f2937`, () => this.pick(slot, id, own));
      const zh = (PART_INFO[id] && PART_INFO[id].zh) || id;
      // locked parts are dark silhouettes
      b.appendChild(E('div', `font-size:34px;line-height:1.1;${own ? '' : 'filter:brightness(0);opacity:.45'}`, PART_ICON[id] || '❓'));
      b.appendChild(E('div', `font-size:16px;line-height:1.15;${own ? '' : 'opacity:.6'}`, own ? zh : `🔒 ${zh}`));
      if (own) b.appendChild(E('div', 'font-size:11px;font-weight:400;opacity:.7;line-height:1.1', PART_EN[id] || ''));
      else {
        const k = this.partKey(id), what = k === 'boss' ? '測試跑道' : k;
        b.appendChild(E('div', 'font-size:13px;line-height:1.15;color:#b45309', `完成 ${what} 得到`));
        b.appendChild(E('div', 'font-size:10px;font-weight:400;line-height:1.1;opacity:.75', `Finish ${k === 'boss' ? 'the Test Track' : k} to get it`));
      }
      b.setAttribute('aria-label', own ? `${zh} ${PART_EN[id] || ''}` : `${zh} locked`);
      row.appendChild(b);
    }
    this.bodyEl.appendChild(row);
  }

  pick(slot, id, own) {
    if (!own) {
      sfx.bonk();
      const k = this.partKey(id);
      this.ui.toast(`完成 ${k === 'boss' ? '測試跑道' : k} 得到`, `Finish ${k === 'boss' ? 'the Test Track' : k} to get this part`, 1600);
      return;
    }
    if (this.cfg[slot] !== id) {
      this.cfg[slot] = id;
      this.robot.userData.setPart(slot, id);
      this.stage.invalidate(); // the stage renders on demand
      sfx.pop();
      this.renderBody();
    }
    this.react('hop');
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

  async save() {
    if (this.saving) return;
    this.saving = true;
    this.saveBtn.style.opacity = '0.6';
    try {
      try { await this.live(this.bridge.saveRobot({ ...this.cfg })); } catch (e) { console.error('saveRobot failed', e); this.ui.toast('未能儲存', 'Not saved', 1800); return false; }
      this.savedJson = JSON.stringify(this.cfg);
      sfx.fanfare();
      confetti(this.stage, new THREE.Vector3(0, 2, 0.5), 40, this.root);
      this.ui.toast('已保存！', 'Saved!', 1400);
      while (this.busy) await this.live(wait(60)); // let a running hop / wave finish first
      await this.react('dance');
      return true;
    } finally { this.saving = false; if (this.alive) this.saveBtn.style.opacity = ''; }
  }

  async askBack() {
    if (!this.dirty()) { this.go('Workshop'); return; }
    const id = await this.live(this.ui.card({
      zh: '要保存嗎？', en: 'Save your robot?', icon: '🤖',
      buttons: [{ id: 'save', zh: '保存', en: 'Save' }, { id: 'drop', zh: '不保存', en: "Don't save" }, { id: 'stay', zh: '繼續改', en: 'Keep editing' }],
    }));
    if (id === 'stay') return;
    if (id === 'save' && !(await this.save())) return;
    if (this.alive) this.go('Workshop');
  }
}
