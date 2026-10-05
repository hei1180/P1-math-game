// A3 摸摸袋 Mystery bag. A solid hides in a cloth bag. Clues come out of the bag one by one (icon + words + voice);
// the child picks the matching friend (tap the 3-D friend, or the big buttons at the bottom).
// Grading: only shapes-logic (candidatesFor over the item's clues). A wrong friend greys out and the next clue shows.
// After the 2nd wrong pick on a bag (hint): every remaining clue shows at once and every friend the clues rule out greys out.
import * as THREE from 'three';
import { CourseScene } from '../CourseScene.js?v=202610051406';
import { tween, wait, motion } from '../../engine/tween.js?v=202610051406';
import { blobShadow } from '../../engine/stage.js?v=202610051406';
import { voice } from '../../engine/voice.js?v=202610051406';
import { SCENE, toyColor } from '../../theme.js?v=202610051406';
import { sfx } from '../../sfx.js?v=202610051406';
import { makeSolid, setMood, blink } from '../../models/solids.js?v=202610051406';
import { sparkle } from '../../fx3d.js?v=202610051406';
import { FAMILIES, FAMILY, MODEL_IDS, familyOf, CLUE_TEXT, candidatesFor, shuffle, pick } from '../../../shapes-logic.js?v=202610051406';

// The friend that stands in the row for each family (a solid's twin comes out of the bag in any model of its family).
const REP = { prism: 'cube', cylinder: 'cylinder', pyramid: 'sqPyramid', cone: 'cone', sphere: 'sphere' };
const ICON = { rolls: '🛞', apex: '🔺', allFlat: '🟦', circleFace: '⭕' }; // a false value gets a red ✖ on top
const CJK = '"PingFang TC","Microsoft JhengHei",system-ui,sans-serif'; // canvas text must resolve to a CJK face
const INK = '#1f2937';
const GREY = new THREE.Color(0x9ca3af);

const BAG = { x: 0, z: -2.4, y: 0.62, scale: 0.95, top: 2.05 }; // bag stands on the table at this spot
const ROW_Z = 0.9;

function rrect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.arcTo(x + w, y, x + w, y + r, r);
  g.lineTo(x + w, y + h - r); g.arcTo(x + w, y + h, x + w - r, y + h, r);
  g.lineTo(x + r, y + h); g.arcTo(x, y + h, x, y + h - r, r);
  g.lineTo(x, y + r); g.arcTo(x, y, x + r, y, r);
  g.closePath();
}
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t; // per instance: disposed with the scene
}

/** A small standing label: white board with the big word and the English below, on a short post. */
function makeSign(zh, en) {
  const g = new THREE.Group();
  const tex = canvasTex(256, 128, (c, w, h) => {
    rrect(c, 4, 4, w - 8, h - 8, 18); c.fillStyle = '#fff'; c.fill(); c.lineWidth = 6; c.strokeStyle = INK; c.stroke();
    c.fillStyle = INK; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.font = `bold 60px ${CJK}`; c.fillText(zh, w / 2, 52);
    c.font = `600 28px ${CJK}`; c.fillStyle = '#6b7280'; c.fillText(en, w / 2, 102);
  });
  const board = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.65), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide, transparent: true }));
  board.position.y = 0.33; board.rotation.x = -0.55;
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.2, 0.08), new THREE.MeshLambertMaterial({ color: SCENE.bench }));
  post.position.y = 0.1;
  g.add(post, board);
  return g;
}

/** Cloth bag (lathe), drawstring and a "?" patch. Origin on the table, height ~2 before scaling. */
function makeBag() {
  const g = new THREE.Group();
  const prof = [[0, 0], [0.5, 0.02], [0.8, 0.2], [0.92, 0.55], [0.82, 0.95], [0.55, 1.28], [0.34, 1.45], [0.32, 1.58], [0.5, 1.82], [0.62, 2.05]];
  const cloth = new THREE.MeshLambertMaterial({ color: 0xc99a5b, side: THREE.DoubleSide });
  g.add(new THREE.Mesh(new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 28), cloth));
  const dark = new THREE.Mesh(new THREE.CircleGeometry(0.5, 20), new THREE.MeshBasicMaterial({ color: 0x3b2a1a }));
  dark.rotation.x = -Math.PI / 2; dark.position.y = 1.7; g.add(dark);
  const string = new THREE.MeshLambertMaterial({ color: 0xdc2626 });
  const tie = new THREE.Mesh(new THREE.TorusGeometry(0.37, 0.055, 8, 24), string);
  tie.rotation.x = Math.PI / 2; tie.position.y = 1.5; g.add(tie);
  for (const s of [-1, 1]) { // two dangling ends
    const end = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.36, 6), string);
    end.position.set(0.14 * s, 1.28, 0.4); end.rotation.z = 0.25 * s; g.add(end);
  }
  const q = canvasTex(128, 128, (c, w, h) => {
    c.fillStyle = '#fff7e0'; c.beginPath(); c.arc(w / 2, h / 2, 56, 0, 7); c.fill();
    c.lineWidth = 6; c.strokeStyle = '#92400e'; c.stroke();
    c.fillStyle = '#92400e'; c.font = `bold 88px ${CJK}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('?', w / 2, h / 2 + 6);
  });
  // a patch hugging the bag: the same profile (slightly fatter) over a slice of the turn, facing +z
  const sub = [[0.851, 0.35], [0.92, 0.55], [0.82, 0.95], [0.738, 1.05]].map(([r, y]) => new THREE.Vector2(r * 1.02, y));
  const patch = new THREE.Mesh(new THREE.LatheGeometry(sub, 12, -0.62, 1.24), new THREE.MeshLambertMaterial({ map: q, transparent: true, side: THREE.DoubleSide }));
  g.add(patch);
  return g;
}

export class A3Bag extends CourseScene {
  static courseKey = 'A3';

  async setup() {
    const { stage, root, bridge } = this;
    const rng = bridge.rng;
    this.waiting = false; this.t = 0; this.blinkT = 2;
    this.cur = null;

    // table + bag
    const top = new THREE.Mesh(new THREE.CylinderGeometry(1.35, 1.2, 0.14, 28), new THREE.MeshLambertMaterial({ color: SCENE.bench }));
    top.position.set(BAG.x, BAG.y - 0.07, BAG.z);
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.42, BAG.y - 0.14, 14), new THREE.MeshLambertMaterial({ color: SCENE.dark }));
    leg.position.set(BAG.x, (BAG.y - 0.14) / 2, BAG.z);
    root.add(top, leg);
    this.bag = makeBag();
    this.bag.scale.setScalar(BAG.scale);
    this.bag.position.set(BAG.x, BAG.y + 6, BAG.z); // drops in for the first item
    root.add(this.bag);

    // the five friends, in a random order, each with a label sign in front of it
    this.friends = [];
    this.friendOf = {};
    shuffle(FAMILIES, rng).forEach((f, i) => {
      const s = makeSolid(REP[f], { color: toyColor(rng), shadow: false });
      const x = -3.8 + i * 1.9;
      s.position.set(x, s.userData.restY, ROW_Z);
      s.userData.baseY = s.position.y;
      s.userData.baseRot = s.rotation.y = Math.atan2(-x, 9 - ROW_Z) * 0.7; // looks towards the middle
      s.userData.family = f;
      s.userData.baseColor = s.userData.body.material.color.clone();
      const sh = blobShadow(0.62); sh.position.set(x, 0.002, ROW_Z);
      const sign = makeSign(FAMILY[f].zh, FAMILY[f].en);
      sign.position.set(x, 0, ROW_Z + 1.4);
      root.add(sh, s, sign);
      this.friends.push(s); this.friendOf[f] = s;
    });

    this.input.onTap(() => this.friends, friend => this.onFriend(friend));
    this.bubble = null;
    this.frame(true);
  }

  /** Camera: keep the whole row and the bag in view whatever the screen shape. */
  frame(force) {
    const st = this.stage, w = st.width, h = st.height;
    if (!force && w === this._fw && h === this._fh) return;
    this._fw = w; this._fh = h;
    const aspect = w / Math.max(1, h);
    const need = 11.4 / (2 * Math.tan(THREE.MathUtils.degToRad(20)) * aspect);
    const dist = Math.max(10.4, need);
    const look = new THREE.Vector3(0, 0.6, -0.9);
    const pos = look.clone().addScaledVector(new THREE.Vector3(0, 0.5, 0.86).normalize(), dist);
    st.setView(pos.toArray(), look.toArray());
    this.placeBubble();
  }

  update(dt) {
    if (!this.cur) return;
    this.frame(false);
    if (!this.waiting || motion.less) return;
    this.t += dt;
    const ph = this.t % 3.4;
    const amp = ph < 1.1 ? Math.exp(-ph * 2.2) * 0.13 : 0; // a wiggle every few seconds
    this.bag.rotation.z = Math.sin(ph * 20) * amp;
    this.bag.rotation.x = Math.cos(ph * 17) * amp * 0.5;
    this.blinkT -= dt;
    if (this.blinkT <= 0) {
      this.blinkT = 1.8 + Math.random() * 2.2;
      const open = this.friends.filter(f => !this.cur.out.has(f.userData.family));
      if (open.length) blink(open[Math.floor(Math.random() * open.length)]);
    }
  }

  setWaiting(on) {
    this.waiting = on;
    this.stage.awake('A3-idle', on && !motion.less);
    if (!on) { this.bag.rotation.z = 0; this.bag.rotation.x = 0; this.stage.invalidate(); }
  }

  async exit() {
    this.stage.awake('A3-idle', false);
    this.dropBubble(); // the bubble lives in #ui outside the overlay's tracking: remove it when leaving mid-course
    await super.exit();
  }

  // ---------------------------------------------------------------- one bag
  async playItem(item, i) {
    const { ui } = this;
    this.cur = { item, shown: 0, out: new Set(), resolve: null, solid: null };
    await this.live(this.resetFriends());
    if (i === 0) ui.prompt('袋入面是哪位朋友？聽聽線索', 'Who is in the bag? Listen to the clues.', { speak: false });
    else ui.hidePrompt();

    // a new hidden solid goes into the bag (any model of the family)
    const model = pick(MODEL_IDS.filter(id => familyOf(id) === item.family), this.bridge.rng);
    const s = this.cur.solid = makeSolid(model, { color: toyColor(this.bridge.rng), shadow: false });
    s.visible = false;
    s.position.set(BAG.x, BAG.y + BAG.top * BAG.scale, BAG.z);
    this.root.add(s);

    // the bag drops in (first bag) or hops (later bags)
    sfx.whoosh();
    if (this.bag.position.y > BAG.y + 0.01) {
      await this.live(tween(this.bag.position, { y: BAG.y }, { ms: 600, ease: 'outBounce' }));
    } else {
      await this.live(tween(this.bag.scale, { y: BAG.scale * 0.8 }, { ms: 90 }));
      await this.live(tween(this.bag.scale, { y: BAG.scale }, { ms: 260, ease: 'outBack' }));
    }
    if (i === 0) { await this.live(voice.say('袋入面是哪位朋友？聽聽線索。')); ui.hidePrompt(); } // the bubble is the prompt from here on
    await this.live(this.revealNext());

    for (;;) {
      this.setWaiting(true);
      const picked = await this.live(this.ask());
      this.setWaiting(false);
      // grading lives in shapes-logic: the family must fit every clue of this bag
      if (candidatesFor(item.clues).includes(picked)) { await this.live(this.solve(item, picked)); return; }
      const friend = this.friendOf[picked];
      this.cur.out.add(picked);
      const shake = this.disappoint(friend);
      await this.wrong(item, picked, `bag ${item.family}`);
      await this.live(shake);
      if (this.cur.shown < item.clues.length) await this.live(this.revealNext());
    }
  }

  /** Resolves with a family id: the child tapped a friend in the 3-D row, or one of the buttons. */
  ask() {
    const left = FAMILIES.filter(f => !this.cur.out.has(f));
    const n = left.length;
    const wide = typeof window !== 'undefined' && window.innerWidth >= 700;
    const opts = left.map(f => ({ id: f, zh: FAMILY[f].zh, en: FAMILY[f].friend }));
    return new Promise(res => {
      this.cur.resolve = res;
      this.ui.choices(opts, { columns: n <= 3 ? Math.max(n, 2) : wide ? n : undefined }).then(id => {
        if (this.cur && this.cur.resolve === res) { this.cur.resolve = null; res(id); }
      });
    });
  }

  onFriend(friend) {
    const c = this.cur;
    if (!c || !c.resolve) return;
    const f = friend.userData.family;
    if (c.out.has(f)) { this.shake(friend); return; } // already ruled out: just a head shake, not a mistake
    const r = c.resolve; c.resolve = null; r(f);
  }

  // ---------------------------------------------------------------- clues
  /** Show the next clue (or the next `count` clues at once) as cards in the speech bubble, and say them. */
  async revealNext(count = 1) {
    const c = this.cur, said = [];
    for (let k = 0; k < count && c.shown < c.item.clues.length; k++) {
      const clue = c.item.clues[c.shown++];
      const text = CLUE_TEXT[clue.fact][String(clue.value)];
      this.addChip(clue, text);
      said.push(text.zh);
      sfx.pop();
      if (!motion.less) { // the bag hops each time it speaks
        tween(this.bag.position, { y: BAG.y + 0.18 }, { ms: 110 }).then(() => tween(this.bag.position, { y: BAG.y }, { ms: 200, ease: 'outBounce' }));
      }
      if (k < count - 1) await this.live(wait(260));
    }
    voice.say(said.join('，')); // not awaited: the child may answer at any time
  }

  addChip(clue, text) {
    if (!this.bubble) this.makeBubble();
    const row = this.bubble.row;
    for (const el of row.children) el.style.boxShadow = 'none';
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'ui-pop';
    chip.setAttribute('aria-label', `${text.zh} ${text.en}`);
    Object.assign(chip.style, {
      pointerEvents: 'auto', minHeight: '64px', minWidth: '96px', maxWidth: '170px', padding: '4px 8px', borderRadius: '16px',
      border: '3px solid #fcd34d', background: '#fffbeb', display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', boxShadow: '0 0 0 4px #facc15', fontFamily: 'inherit', cursor: 'pointer', lineHeight: '1.15',
    });
    const icon = document.createElement('span');
    Object.assign(icon.style, { position: 'relative', display: 'inline-block', fontSize: '34px', lineHeight: '40px', width: '44px', height: '40px', textAlign: 'center' });
    const pic = document.createElement('span'); pic.textContent = ICON[clue.fact]; if (!clue.value) pic.style.opacity = '0.5';
    icon.appendChild(pic);
    if (!clue.value) { // false value: a red cross over the picture
      const x = document.createElement('span'); x.textContent = '✖'; x.setAttribute('aria-hidden', 'true');
      Object.assign(x.style, { position: 'absolute', inset: '0', color: '#dc2626', fontWeight: '900', fontSize: '38px', lineHeight: '40px', textShadow: '0 0 3px #fff, 0 0 3px #fff, 0 0 5px #fff' });
      icon.appendChild(x);
    }
    const zh = document.createElement('span'); zh.textContent = text.zh;
    Object.assign(zh.style, { fontSize: '18px', fontWeight: '700', color: '#1f2937' });
    const en = document.createElement('span'); en.textContent = text.en;
    Object.assign(en.style, { fontSize: '11px', color: '#6b7280' });
    chip.append(icon, zh, en);
    chip.addEventListener('click', () => { try { voice.say(text.zh); } catch (e) { /* ignore */ } });
    row.appendChild(chip);
    this.placeBubble();
  }

  makeBubble() {
    const host = document.getElementById('ui');
    const wrap = document.createElement('div');
    Object.assign(wrap.style, {
      position: 'absolute', left: '50%', transform: 'translateX(-50%)', pointerEvents: 'none', maxWidth: '96%', width: 'max-content',
      display: 'flex', flexDirection: 'column', alignItems: 'center', top: '120px',
    });
    const row = document.createElement('div');
    Object.assign(row.style, {
      display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '8px', padding: '8px', background: '#fff',
      border: '4px solid #fcd34d', borderRadius: '24px', boxShadow: '0 4px 12px rgba(0,0,0,.2)',
    });
    const tail = document.createElement('div');
    Object.assign(tail.style, { width: '0', height: '0', borderLeft: '14px solid transparent', borderRight: '14px solid transparent', borderTop: '18px solid #fcd34d' });
    wrap.append(row, tail);
    if (host) host.appendChild(wrap);
    this.bubble = { wrap, row };
  }

  /** The bubble sits just above the bag's mouth (clamped below the prompt). */
  placeBubble() {
    if (!this.bubble) return;
    const p = this.stage.toScreen(new THREE.Vector3(BAG.x, BAG.y + BAG.top * BAG.scale + 0.2, BAG.z));
    const h = this.bubble.wrap.offsetHeight;
    this.bubble.wrap.style.top = Math.max(96, Math.round(p.y - h)) + 'px';
  }

  dropBubble() {
    if (this.bubble) { this.bubble.wrap.remove(); this.bubble = null; }
  }

  // ---------------------------------------------------------------- friends
  /** Head shake: no-op under Less motion. */
  async shake(friend) {
    if (motion.less) return;
    const base = friend.userData.baseRot, r = friend.rotation;
    for (const a of [0.5, -0.5, 0.35, -0.2, 0]) await this.live(tween(r, { y: base + a }, { ms: 80, ease: 'linear' }));
  }

  /** A wrong friend: shakes its head, looks sad and turns grey. */
  async disappoint(friend) {
    setMood(friend, 'oops');
    const g = friend.userData.body.material.color, face = friend.userData.face.mesh.material.color;
    const grey = tween(g, { r: GREY.r, g: GREY.g, b: GREY.b }, { ms: 300 });
    const dim = tween(face, { r: 0.7, g: 0.7, b: 0.7 }, { ms: 300 });
    await this.live(Promise.all([this.shake(friend), grey, dim]));
  }

  async resetFriends() {
    const jobs = [];
    for (const f of this.friends) {
      const u = f.userData;
      if (u.face && u.face.mood !== 'normal') setMood(f, 'normal');
      const c = u.baseColor, g = u.body.material.color;
      if (g.r !== c.r || g.g !== c.g || g.b !== c.b) jobs.push(tween(g, { r: c.r, g: c.g, b: c.b }, { ms: 200 }));
      const fc = u.face.mesh.material.color;
      if (fc.r !== 1) jobs.push(tween(fc, { r: 1, g: 1, b: 1 }, { ms: 200 }));
      f.rotation.y = u.baseRot; f.position.y = u.baseY;
    }
    // the last bag's solid shrinks away
    const old = this.oldSolid;
    if (old) {
      this.oldSolid = null;
      jobs.push(tween(old.scale, { x: 0.01, y: 0.01, z: 0.01 }, { ms: 200 }).then(() => this.disposeSolid(old)));
    }
    this.dropBubble();
    await Promise.all(jobs);
    this.stage.invalidate();
  }

  disposeSolid(s) {
    if (s.parent) s.parent.remove(s);
    s.traverse(o => {
      if (o.geometry && !(o.geometry.userData && o.geometry.userData.shared)) o.geometry.dispose();
      const m = o.material;
      if (m && !(m.userData && m.userData.shared)) m.dispose();
    });
    this.stage.invalidate();
  }

  // ---------------------------------------------------------------- right answer
  /** The solid pops out of the bag and high-fives its twin in the row. */
  async solve(item, picked) {
    const c = this.cur, s = c.solid, twin = this.friendOf[item.family];
    this.ui.clearChoices();
    const first = c.shown === 1;
    s.visible = true; s.scale.setScalar(0.3);
    sfx.pop();
    this.bag.scale.set(BAG.scale * 1.12, BAG.scale * 0.85, BAG.scale * 1.12); // squeezed as it pops
    const up = BAG.y + BAG.top * BAG.scale + 1.1;
    await this.live(Promise.all([
      tween(this.bag.scale, { x: BAG.scale, y: BAG.scale, z: BAG.scale }, { ms: 350, ease: 'outBack' }),
      tween(s.scale, { x: 1, y: 1, z: 1 }, { ms: 300, ease: 'outBack' }),
      tween(s.position, { y: up }, { ms: 380 }),
    ]));
    setMood(s, 'happy'); setMood(twin, 'happy');
    if (first && !motion.less) sparkle(this.stage, s, this.root); // guessed on the first clue: bonus glitter (cosmetic)
    // over to its twin, then the high five: the twin hops up to meet it
    const meet = twin.userData.baseY + twin.userData.restY + 0.7;
    await this.live(Promise.all([
      tween(s.position, { x: twin.position.x, z: twin.position.z, y: meet + 0.4 }, { ms: 450, ease: 'inOutCubic' }),
      tween(s.rotation, { y: Math.PI * 2 }, { ms: 450, ease: 'inOutCubic' }),
    ]));
    s.rotation.y = 0;
    sfx.boing();
    await this.live(tween(twin.position, { y: twin.userData.baseY + 0.35 }, { ms: 120 }));
    sfx.ding();
    if (first && !motion.less) sparkle(this.stage, new THREE.Vector3(twin.position.x, meet, twin.position.z), this.root);
    await this.live(tween(twin.position, { y: twin.userData.baseY }, { ms: 380, ease: 'outBounce' }));
    this.oldSolid = s; c.solid = null;
    if (this.index === this.items.length - 1) this.dropBubble();
  }

  // ---------------------------------------------------------------- hint (2nd wrong on this bag)
  async hint(item) {
    const c = this.cur;
    const left = item.clues.length - c.shown;
    if (left > 0) await this.live(this.revealNext(left)); // every remaining clue at once
    // every friend the clues rule out greys out
    const fits = candidatesFor(item.clues.slice(0, c.shown));
    const jobs = [];
    for (const f of FAMILIES) {
      if (fits.includes(f) || c.out.has(f)) continue;
      c.out.add(f);
      jobs.push(this.disappoint(this.friendOf[f]));
    }
    await this.live(Promise.all(jobs));
    await this.live(wait(300));
  }
}
