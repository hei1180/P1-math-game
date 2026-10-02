// Small 3-D effects: confetti, sparkle, dust puff. Each effect is a Group of cheap meshes that animates
// from stage.onUpdate, keeps rendering awake while it runs, and removes + disposes itself at the end
// (or as soon as its parent was removed, e.g. the scene was left).
import * as THREE from 'three';
import { TOY_COLORS } from './theme.js?v=0';
import { motion } from './engine/tween.js?v=0';
import { disposeTree } from './engine/stage.js?v=0';

let seq = 0;

/** Run `step(dt, t01)` for `life` seconds, then clean up. */
function run(stage, group, parent, life, step) {
  const token = 'fx3d-' + (++seq);
  parent.add(group);
  stage.awake(token, true);
  let t = 0, off = null;
  const done = () => {
    if (off) off();
    stage.awake(token, false);
    if (group.parent) group.parent.remove(group);
    disposeTree(group);
    stage.invalidate();
  };
  off = stage.onUpdate(dt => {
    if (!group.parent) { done(); return; } // parent (the scene) was disposed
    t += dt;
    if (t >= life) { done(); return; }
    step(dt, t / life);
  });
}

const rnd = (a, b) => a + Math.random() * (b - a);

/** Colourful paper bits that fly up and fall. `at` is a world position (default: above the middle of the floor). Skipped with Less motion. */
export function confetti(stage, at = new THREE.Vector3(0, 1.5, 0), n = 40, parent = stage.scene) {
  if (motion.less) return;
  const group = new THREE.Group();
  const geo = new THREE.PlaneGeometry(0.12, 0.08);
  const mats = TOY_COLORS.map(c => new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide }));
  const bits = [];
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(geo, mats[i % mats.length]);
    m.position.copy(at);
    m.rotation.set(rnd(0, 6), rnd(0, 6), rnd(0, 6));
    group.add(m);
    bits.push({ m, v: new THREE.Vector3(rnd(-2, 2), rnd(2.5, 5), rnd(-2, 2)), spin: new THREE.Vector3(rnd(-8, 8), rnd(-8, 8), rnd(-8, 8)) });
  }
  run(stage, group, parent, 1.6, (dt, t) => {
    const s = t > 0.8 ? 1 - (t - 0.8) / 0.2 : 1; // shrink away at the end
    for (const b of bits) {
      b.v.y -= 9 * dt;
      b.m.position.addScaledVector(b.v, dt);
      b.m.rotation.x += b.spin.x * dt; b.m.rotation.y += b.spin.y * dt; b.m.rotation.z += b.spin.z * dt;
      b.m.scale.setScalar(Math.max(0.001, s));
    }
  });
}

/** A ring of gold glints bursting out of an object (or a point), fading as they go. */
export function sparkle(stage, object3D, parent = stage.scene) {
  const centre = new THREE.Vector3();
  if (object3D.isObject3D) { object3D.updateWorldMatrix(true, false); object3D.getWorldPosition(centre); } else centre.copy(object3D);
  const group = new THREE.Group();
  const geo = new THREE.OctahedronGeometry(0.07);
  const mat = new THREE.MeshBasicMaterial({ color: 0xfacc15, transparent: true });
  const n = 12, glints = [];
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(geo, mat);
    m.position.copy(centre);
    group.add(m);
    const a = (i / n) * Math.PI * 2;
    glints.push({ m, dir: new THREE.Vector3(Math.cos(a), rnd(-0.2, 0.6), Math.sin(a)).normalize(), sp: rnd(0.9, 1.6) });
  }
  const life = motion.less ? 0.5 : 0.9;
  run(stage, group, parent, life, (dt, t) => {
    mat.opacity = 1 - t;
    for (const g of glints) {
      g.m.position.addScaledVector(g.dir, g.sp * dt * (1.2 - t));
      g.m.rotation.y += 6 * dt;
      g.m.scale.setScalar(1 + 0.6 * Math.sin(t * Math.PI));
    }
  });
}

/** A ring of dust puffs rolling outward on the floor (landings, bumps). `position` is a world Vector3. */
export function puff(stage, position, parent = stage.scene) {
  const group = new THREE.Group();
  const geo = new THREE.SphereGeometry(0.1, 8, 6);
  const mat = new THREE.MeshBasicMaterial({ color: 0xf5efe6, transparent: true });
  const n = 8, bits = [];
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(position.x, Math.max(position.y, 0.08), position.z);
    group.add(m);
    const a = (i / n) * Math.PI * 2 + rnd(-0.2, 0.2);
    bits.push({ m, dir: new THREE.Vector3(Math.cos(a), 0.25, Math.sin(a)) });
  }
  const life = motion.less ? 0.3 : 0.6;
  run(stage, group, parent, life, (dt, t) => {
    mat.opacity = 0.9 * (1 - t);
    for (const b of bits) {
      b.m.position.addScaledVector(b.dir, 1.4 * dt * (1 - t));
      b.m.scale.setScalar(1 + 1.8 * t);
    }
  });
}
