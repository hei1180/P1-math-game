// Hero walking for go / place clues (spec §1 Free steering) and the hint visuals both clues share.
//
//   walk = attachWalk(room, { walk = true, names = true, onStart?(pt), onStop?(pt) })
//     Puts the hero on the floor at the room's home spot, then listens to taps on the room:
//       tap an object  -> it wiggles (creatures hop) and its KINDS name is spoken + shown (names on)
//       tap elsewhere  -> the hero walks to the nearest stop (walk on): every empty place (slot) + home.
//     Path: along the floor / shelf level; to change level it walks to the ladder, climbs, then walks on.
//     ~40 art px/s, one walk never takes longer than 1.8 s; less motion: ≤ 150 ms, no bob or sway.
//     onStart / onStop fire only for walks started by a tap (onStop only when the hero arrives).
//   walk.walkTo(pt {ax, ay}) -> Promise<boolean>   true when arrived, false when cut off by another walk
//   walk.nearest(ax, ay) -> stop | null           stop = { ax, ay, x?, y?, slotIndex?, home? }
//   walk.enable(on)   walk.names(on)   walk.current (stop the hero stands on, null while walking)
//   walk.walking      walk.home -> stop    walk.destroy()   (also on scene shutdown)
//
//   glowRefs(room, clue)          gold glow on the reference object(s) b (and c)
//   hintArrows(room, clue)        hint step 2: glow + arrow(s) on the answer side (queues hop to show facing)
//   answerSentence(clue, slotIndex, kind) -> {zh, en}   e.g. 「小騎士在星星寶箱的右面」 (logic sentenceText)
//   nearestAnswer(room, clue, ax, ay) -> slot index    the answer slot closest to a point
//   popItem(room, kind, ax, ay)   a found item (the key) pops up out of a place with a sparkle
import { KINDS, sentenceText } from '../dungeon-logic.js?v=0';
import { FLOOR_Y } from './stage.js?v=0';
import { hop } from './art.js?v=0';
import { voice } from './voice.js?v=0';
import { fx } from './fx.js?v=0';
import { textStyle } from './theme.js?v=0';

export const WALK_SPEED = 40;      // art px per second
export const WALK_MAX_MS = 1800;   // a 6-year-old never waits longer than this for one walk
const reduced = () => fx.lessMotion || (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

/** The hero's resting spot for a drawn scene: on the floor, left of everything. */
function homeStop(stage) {
  if (!stage.current) return { ax: 12, ay: FLOOR_Y, home: true };
  return { ax: stage.home.ax, ay: stage.home.ay, home: true }; // PixelStage.drawScene picks it (left of the scene)
}

export function attachWalk(room, { walk = true, names = true, onStart = null, onStop = null } = {}) {
  const scene = room, stage = room.stage, hero = room.hero;
  let walkOn = walk, namesOn = names, cur = null, tween = null, pending = null, label = null, dead = false;
  const home = homeStop(stage);

  const stops = () => {
    const out = stage.slots.map(z => ({ ax: z.ax, ay: z.ay, x: z.gx, y: z.gy, slotIndex: z.slotIndex }));
    out.push(home);
    return out;
  };
  const nearestD = (ax, ay) => {
    let best = null;
    for (const s of stops()) {
      const d = Math.hypot(s.ax - ax, s.ay - 8 - ay);
      if (!best || d < best.d) best = { pt: s, d };
    }
    return best;
  };
  /** Object sprite under an art point (hit box ≥ 48 CSS px), with its distance. */
  const objectAt = (ax, ay) => {
    const hs = Math.max(16, Math.ceil(48 / stage.PX)) / 2;
    let best = null;
    for (const sp of Object.values(stage.sprites)) {
      if (!sp || !sp.active || !sp.kind) continue;
      const w = sp.displayWidth || 16, h = sp.displayHeight || 16, cy = sp.y - h / 2;
      const dx = Math.abs(sp.x - ax), dy = Math.abs(cy - ay);
      if (dx > Math.max(w / 2, hs) || dy > Math.max(h / 2, hs)) continue;
      const d = Math.hypot(dx, dy);
      if (!best || d < best.d) best = { sp, d };
    }
    return best;
  };

  function stopWalk() {
    if (tween) { const t = tween; tween = null; t.stop(); }
    if (pending) { const r = pending; pending = null; r(false); }
  }

  function walkTo(t) {
    stopWalk();
    if (dead) return Promise.resolve(false);
    const L = stage.current && stage.current.layout.ladders[0];
    const pts = [{ x: hero.x, y: hero.y }];
    if (L && Math.abs(hero.y - t.ay) >= 0.5) pts.push({ x: L.ax, y: hero.y }, { x: L.ax, y: t.ay });
    pts.push({ x: t.ax, y: t.ay });
    const segs = [];
    let total = 0;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i], len = Math.hypot(b.x - a.x, b.y - a.y);
      if (len < 0.01) continue;
      segs.push({ a, b, len, at: total, vertical: Math.abs(b.x - a.x) < 0.01 });
      total += len;
    }
    scene.tweens.killTweensOf(hero);
    hero.setAngle(0);
    if (total < 0.5) { hero.setPosition(t.ax, t.ay); cur = t; return Promise.resolve(true); }
    cur = null;
    const calm = reduced();
    const ms = calm ? Math.min(150, total * 10) : Math.max(250, Math.min(WALK_MAX_MS, total / WALK_SPEED * 1000));
    const at = d => {
      const s = segs.find(g => d <= g.at + g.len) || segs[segs.length - 1];
      const k = Math.max(0, Math.min(1, (d - s.at) / s.len));
      let x = s.a.x + (s.b.x - s.a.x) * k, y = s.a.y + (s.b.y - s.a.y) * k, ang = 0;
      if (!calm) {
        if (s.vertical) ang = Math.floor(d / 4) % 2 ? 6 : -6;          // climbing sway
        else y -= Math.floor(d / 5) % 2;                                  // 1 px step bob
      }
      if (!s.vertical && hero.setPetSide) {
        const side = s.b.x > s.a.x ? 'left' : 'right';                   // the pet trails behind
        if (hero.petSide !== side) hero.setPetSide(side);
      }
      hero.setPosition(x, y).setAngle(ang);
    };
    return new Promise(res => {
      pending = res;
      const k = { d: 0 };
      const me = tween = scene.tweens.add({
        targets: k, d: total, duration: ms, ease: 'Linear',
        onUpdate: () => { if (tween === me) at(k.d); },
        onComplete: () => {
          if (tween !== me) return;
          tween = null;
          hero.setPosition(t.ax, t.ay).setAngle(0);
          cur = t;
          const r = pending; pending = null;
          if (r) r(true);
        },
      });
    });
  }

  function sayName(sp) {
    const K = KINDS[sp.kind];
    if (!K) return;
    voice.say(K.zh);
    if (!reduced()) {
      if (sp.setFacing) hop(sp);
      else {
        if (sp.__wig) { sp.__wig.stop(); sp.setAngle(0); }
        sp.__wig = scene.tweens.add({ targets: sp, angle: { from: -10, to: 10 }, duration: 80, yoyo: true, repeat: 2,
          onComplete: () => { sp.setAngle(0); sp.__wig = null; }, onStop: () => { sp.setAngle(0); sp.__wig = null; } });
      }
    }
    if (label) label.destroy();
    const p = stage.toScreen(sp.x, sp.y - (sp.displayHeight || 16) - 2);
    const c = label = scene.add.container(p.x, p.y).setDepth(40);
    const a = scene.add.text(0, -16, K.zh, textStyle(22, '#ffffff', { stroke: '#1c1917', strokeThickness: 5 })).setOrigin(0.5, 1);
    const b = scene.add.text(0, -2, K.en, textStyle(13, '#fde68a', { stroke: '#1c1917', strokeThickness: 4, fontStyle: 'normal' })).setOrigin(0.5, 1);
    c.add([a, b]);
    scene.time.delayedCall(1300, () => { if (c.active) { c.destroy(); if (label === c) label = null; } });
  }

  const onDown = (p, over) => {
    if (dead || !stage.current || (room.ui && room.ui.modalOpen)) return;
    if (over && over.some(o => !stage.slots.includes(o))) return;   // a button, the dragged item, …
    const a = stage.fromScreen(p.worldX, p.worldY);
    if (a.ax < 0 || a.ay < 0 || a.ax > stage.w || a.ay > stage.h) return;
    const ob = namesOn ? objectAt(a.ax, a.ay) : null;
    const st = walkOn ? nearestD(a.ax, a.ay) : null;
    if (ob && (!st || ob.d <= st.d)) { sayName(ob.sp); return; }
    if (!st) return;
    const pt = st.pt;
    if (cur && !tween && cur.ax === pt.ax && cur.ay === pt.ay) return;   // already there
    if (onStart) onStart(pt);
    walkTo(pt).then(ok => { if (ok && !dead && onStop) onStop(pt); });
  };
  scene.input.on('pointerdown', onDown);

  function destroy() {
    if (dead) return;
    dead = true;
    stopWalk();
    scene.input.off('pointerdown', onDown);
    if (label) { label.destroy(); label = null; }
    if (hero && hero.active) hero.setAngle(0);
  }
  scene.events.once('shutdown', destroy);

  // start every clue from the floor at home (the scene was just redrawn)
  scene.tweens.killTweensOf(hero);
  hero.setPosition(home.ax, home.ay).setAngle(0);
  if (hero.setPetSide) hero.setPetSide('left');
  cur = home;

  return {
    walkTo, destroy,
    nearest: (ax, ay) => { const n = nearestD(ax, ay); return n ? n.pt : null; },
    enable(on) { walkOn = !!on; },
    names(on) { namesOn = !!on; },
    get current() { return cur; },
    get walking() { return !!tween; },
    get home() { return home; },
  };
}

// ---------------------------------------------------------------- hints shared by go / place

const refIds = clue => [clue.b, clue.c].filter(Boolean);
const OPP_DIR = { left: 'right', right: 'left', up: 'down', down: 'up' };

/** Screen direction of a relation in a scene ('front'/'back' follow the queue's facing). */
function dirOf(rel, scene) {
  if (rel === 'left' || rel === 'right') return rel;
  if (rel === 'above') return 'up';
  if (rel === 'below') return 'down';
  if (rel === 'front' || rel === 'back') return (rel === 'front') === (scene.queueFacing !== 'left') ? 'right' : 'left';
  return null;
}

export function glowRefs(room, clue) {
  for (const id of refIds(clue)) room.stage.glow(room.stage.sprites[id], true);
}

/** An arrow next to sprite `sp` pointing `dir`, starting at the sprite. */
function arrowFrom(room, sp, dir) {
  const st = room.stage, h = sp.displayHeight || 16;
  if (dir === 'left' || dir === 'right') return st.arrow(sp.x + (dir === 'right' ? 12 : -12), sp.y - h - 5, dir);
  // up / down: from the sprite's edge into the place above / below it
  return st.arrow(sp.x, dir === 'up' ? sp.y - h - 9 : sp.y + 9, dir);
}

export function hintArrows(room, clue) {
  const st = room.stage, sc = clue.scene;
  glowRefs(room, clue);
  const b = st.sprites[clue.b], c = clue.c ? st.sprites[clue.c] : null;
  if (!b) return;
  if (clue.rel === 'between' && c) {
    const vertical = b.gx === c.gx && b.gy !== c.gy;
    const toC = vertical ? (c.gy > b.gy ? 'up' : 'down') : (c.gx > b.gx ? 'right' : 'left');
    arrowFrom(room, b, toC);
    arrowFrom(room, c, OPP_DIR[toC]);
  } else {
    const d = dirOf(clue.rel, sc);
    if (d) arrowFrom(room, b, d);
  }
  if (sc.layout === 'queue') {
    Object.values(st.sprites).forEach((sp, i) => { if (sp.setFacing) hop(sp, { delay: i * 90 }); });
  }
}

/** The clue's sentence with the answer filled in: the hero / key / item at that place. */
export function answerSentence(clue, slotIndex, kind) {
  const sl = clue.scene.slots[slotIndex];
  const sc = { ...clue.scene, objects: clue.scene.objects.concat({ id: '__answer', kind, x: sl.x, y: sl.y }) };
  return sentenceText(sc, { rel: clue.rel, a: '__answer', b: clue.b, c: clue.c });
}

export function nearestAnswer(room, clue, ax, ay) {
  let best = clue.answers[0], bd = Infinity;
  for (const i of clue.answers) {
    const z = room.stage.slots[i];
    if (!z) continue;
    const d = Math.hypot(z.ax - ax, z.ay - ay);
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}

export function popItem(room, kind, ax, ay) {
  const st = room.stage, sp = st.makeSprite(kind);
  sp.setPosition(ax, ay);
  st.hints.add(sp);
  const p = st.toScreen(ax, ay - 12);
  fx.sparkle(room, p.x, p.y);
  if (reduced()) { sp.y = ay - 18; return sp; }
  room.tweens.add({ targets: sp, y: ay - 18, duration: 420, ease: 'Back.easeOut' });
  return sp;
}
