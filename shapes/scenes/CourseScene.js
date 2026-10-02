// Base class of every course (A1-A4, B1-B4) and the boss. The base runs the whole flow inside enter():
// genCourse -> setup -> playItem x N -> finish (stars, bridge.complete, new part, end panel, routing).
// Subclasses only build their set (setup) and play one item (playItem / hint).
//
// IMPORTANT for subclasses: wrap every await in playItem() and hint() in `this.live(...)`
// (e.g. `await this.live(tween(...))`, `const id = await this.live(this.ui.choices(...))`).
// When the child leaves with the back button the manager cancels all tweens, which RESOLVES their promises;
// live() makes sure nothing continues after that (no next item, no bridge.complete from a left course).
import * as THREE from 'three';
import { Scene } from '../engine/scenes.js?v=0';
import { tween, wait } from '../engine/tween.js?v=0';
import { SCENE } from '../theme.js?v=0';
import { sfx } from '../sfx.js?v=0';
import { confetti, sparkle } from '../fx3d.js?v=0';
import { genCourse, courseByKey, starsFor, nextCourse, isCourseOpen, isZoneCleared, recordResult, PARTS } from '../../shapes-logic.js?v=0';

const BOSS = { key: 'boss', zone: null, zh: '測試跑道', en: 'Test Track' };

export class CourseScene extends Scene {
  /**
   * data.key = course key ('A1'...'B4', 'boss'). Without it the key is 'boss' (BossScene is started with no data).
   * Scene key = course key, except the boss whose scene key is 'Boss'.
   */
  async enter(data) {
    const key = (data && data.key) || 'boss';
    this.key = key;
    this.course = courseByKey(key) || BOSS;
    this.items = genCourse(key, this.bridge.rng);
    this.index = 0;
    this.mistakes = 0;
    this.confusions = [];   // [{ item, picked }], at most 5 kept
    this.tries = [];        // wrong answers so far, per item index
    this.results = this.items.map(() => null);
    this.startProgress = this.bridge.progress; // to see whether this run clears the zone
    this.t0 = performance.now();
    this.leaving = false;

    this.buildRoom();
    this.stage.setView([0, 5, 8], [0, 0.5, 0]);
    this.ui.back(() => this.askLeave());
    this.ui.dots(this.results);
    this.ui.toast(this.course.zh, this.course.en, 1200);

    await this.live(this.setup());
    for (let i = 0; i < this.items.length; i++) {
      this.index = i;
      this.results[i] = 'now';
      this.ui.dots(this.results);
      await this.live(this.playItem(this.items[i], i));
      await this.live(this.right(this.items[i]));
    }
    await this.finish();
  }

  /** Floor and back wall shared by all courses. Subclasses add their own set to this.root in setup(). */
  buildRoom() {
    const floor = new THREE.Mesh(new THREE.BoxGeometry(14, 0.3, 9), new THREE.MeshLambertMaterial({ color: SCENE.floor }));
    floor.position.set(0, -0.15, 0);
    const wall = new THREE.Mesh(new THREE.BoxGeometry(14, 5, 0.3), new THREE.MeshLambertMaterial({ color: 0xdbeafe }));
    wall.position.set(0, 2.5, -4.65);
    const bench = new THREE.Mesh(new THREE.BoxGeometry(14, 0.5, 0.35), new THREE.MeshLambertMaterial({ color: SCENE.bench }));
    bench.position.set(0, 0.25, -4.4);
    this.root.add(floor, wall, bench);
  }

  /** Subclass: build the set (add to this.root), set the camera if the default does not suit. */
  async setup() {}

  /** Subclass: play one item; resolve when it was answered right. Call this.wrong(...) for each wrong answer. */
  async playItem(item, i) {}

  /** Subclass: short demo of the property, shown after the 2nd wrong answer on the same item. */
  async hint(item) {}

  /**
   * A wrong answer. itemLabel and picked are short strings for the teacher's log (e.g. 'cone upright', 'rolls').
   * The 2nd wrong answer on one item runs hint(item) once. Mistakes keep counting after a hint.
   */
  async wrong(item, picked, itemLabel) {
    this.mistakes++;
    if (this.confusions.length < 5) this.confusions.push({ item: itemLabel, picked });
    try { sfx.bonk(); } catch (e) { /* ignore */ }
    const n = this.tries[this.index] = (this.tries[this.index] || 0) + 1;
    if (n === 2) await this.live(this.hint(item));
  }

  /** The item was answered right (the base calls this after playItem; calling it twice for one item does nothing). */
  async right(item) {
    if (this._rightFor === this.index) return;
    this._rightFor = this.index;
    try { sfx.ding(); } catch (e) { /* ignore */ }
    this.results[this.index] = 'good';
    this.ui.dots(this.results);
    this.confetti(0, 1.5, 0, 18);
    await this.live(wait(450));
  }

  /** 3-D confetti burst at a world position (skipped with Less motion). */
  confetti(x = 0, y = 1.5, z = 0, n = 40) {
    confetti(this.stage, new THREE.Vector3(x, y, z), n, this.root);
  }

  async finish() {
    const { key, bridge, ui } = this;
    ui.back(null); ui.hidePrompt(); ui.clearChoices();
    const stars = starsFor(this.mistakes);
    const durationSec = Math.round((performance.now() - this.t0) / 1000);
    let r = { newBest: false, part: null };
    try {
      r = await this.live(bridge.complete(key, stars, { mistakes: this.mistakes, durationSec, confusions: this.confusions }));
    } catch (e) { console.error('complete failed', e); }

    if (r.part) await this.live(this.flyPart(key));
    else if (stars >= 2) this.confetti(0, 1.5, 0, 50);

    const choice = await this.live(ui.endPanel({
      title: '做得好！', stars, newBest: !!r.newBest,
      partZh: r.part && PARTS[key] ? PARTS[key].zh : '',
    }));

    const justDone = { key, stars, newBest: !!r.newBest, part: r.part || null };
    if (choice === 'retry') { this.go(key === 'boss' ? 'Boss' : key, key === 'boss' ? undefined : { key }); return; }
    if (choice === 'map') { this.go('Workshop', { justDone }); return; }
    this.go('Workshop', { justDone, goTo: this.routeAfter(stars) });
  }

  /** Where the map walks the robot next: the next open course, else the zone's Rush when it was just cleared, else null. */
  routeAfter(stars) {
    const { key, bridge, course } = this;
    if (!course.zone) return null; // boss
    // bridge.progress is not updated in test mode, so work from the result we just recorded (pure).
    const after = recordResult(bridge.progress, key, stars).progress;
    const next = nextCourse(key);
    if (next && isCourseOpen(after, next, bridge.settings.shapesUnlock, bridge.testMode)) return next;
    if (!next && isZoneCleared(after, course.zone) && !isZoneCleared(this.startProgress, course.zone)) return course.zone === 'a' ? 'rush-a' : 'rush-b';
    return null;
  }

  /** New part: a gold gem pops up, glints and shows its name (the robot model itself lives in the Garage / Workshop). */
  async flyPart(key) {
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.35), new THREE.MeshLambertMaterial({ color: 0xfacc15, emissive: 0x7a5c00 }));
    gem.position.set(0, 1, 0); gem.scale.setScalar(0.01);
    this.root.add(gem);
    try { sfx.star(2); } catch (e) { /* ignore */ }
    await this.live(tween(gem.scale, { x: 1, y: 1, z: 1 }, { ms: 400, ease: 'outBack' }));
    sparkle(this.stage, gem, this.root);
    this.ui.toast('新零件！', `New part: ${PARTS[key].zh}`, 1400);
    await this.live(tween(gem.position, { y: 2.6 }, { ms: 700, ease: 'inOutCubic' }));
    await this.live(tween(gem.scale, { x: 0.01, y: 0.01, z: 0.01 }, { ms: 250 }));
    this.root.remove(gem);
    gem.geometry.dispose(); gem.material.dispose();
    this.stage.invalidate();
  }

  /** ⬅ during a course: ask, then leave to the Workshop without saving anything. */
  async askLeave() {
    if (this.leaving || !this.alive) return;
    this.leaving = true;
    const was = this.input.enabled;
    this.input.enabled = false; // the card's backdrop blocks the canvas anyway; this also stops drags in flight
    const id = await this.ui.card({
      zh: '離開這關？', en: 'Leave?', icon: '🚪',
      buttons: [{ id: 'leave', zh: '離開', en: 'Leave' }, { id: 'stay', zh: '繼續', en: 'Keep playing' }],
    });
    this.input.enabled = was; // the Input object is shared by all scenes
    this.leaving = false;
    if (id === 'leave' && this.alive) this.go('Workshop');
  }
}
