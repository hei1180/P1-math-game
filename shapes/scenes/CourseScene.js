// Base class of every course (A1-A4, B1-B4) and the boss. The base runs the whole flow inside enter():
// genCourse -> setup -> playItem x N -> finish (stars, bridge.complete, new part, end panel, routing).
// Subclasses only build their set (setup) and play one item (playItem / hint).
//
// ---------------------------------------------------------------------------------------------
// Subclass contract
//  - Start data: { key } with the course key ('A1'...'B4'). The boss has no start data, so BossScene declares
//    `static courseKey = 'boss'`. With neither a key nor a courseKey, enter() throws.
//  - setup(): build the set. playItem(item, i): play one item and RETURN when it was answered right.
//    Do not call right() or finish() yourself; the base does, after playItem returns.
//  - For every wrong answer: `await this.wrong(item, picked, label)`. It is async because the 2nd wrong answer
//    on the same item runs hint(item) inside it. Mistakes keep counting after a hint.
//  - Wrap EVERY await inside playItem() and hint() in `this.live(...)` (tweens, ui.choices, waits, ...). Leaving
//    with ⬅ cancels all tweens, which RESOLVES their promises; live() makes sure nothing continues after that
//    (no next item, no bridge.complete from a course that was left).
//  - Put every mesh and effect on this.root (never stage.scene) so it is disposed with the scene.
//    Use this.confetti(...) and sparkle(this.stage, obj, this.root) from fx3d.js.
//  - Input handlers registered through this.input are cleared by the manager when the scene is left.
//  - If you override exit(), call `await super.exit()` (it re-enables the shared Input).
//  - Progress dots: 'now' while an item is played, 'good' once solved. 'bad' is deliberately unused: mistakes
//    show in the stars, not as red dots. this.index is the current item (0-based).
//  - The base sets the camera to [0,5,8] looking at [0,0.5,0] before setup(); setup() may call stage.setView().
//  - Boss: nothing may assume 5 items (genCourse gives B3 4, B4 2, boss 3).
// ---------------------------------------------------------------------------------------------
import * as THREE from 'three';
import { Scene } from '../engine/scenes.js?v=202610051406';
import { tween, wait } from '../engine/tween.js?v=202610051406';
import { SCENE } from '../theme.js?v=202610051406';
import { sfx } from '../sfx.js?v=202610051406';
import { confetti, sparkle } from '../fx3d.js?v=202610051406';
import { genCourse, courseByKey, starsFor, nextCourse, isCourseOpen, isZoneCleared, recordResult, PARTS } from '../../shapes-logic.js?v=202610051406';

const BOSS = { key: 'boss', zone: null, zh: '測試跑道', en: 'Test Track' };

export class CourseScene extends Scene {
  /** Subclass sets this when the scene is started without data (BossScene: 'boss'). */
  static courseKey = null;

  /** Scene key = course key, except the boss whose scene key is 'Boss'. */
  async enter({ key } = {}) {
    key = key ?? this.constructor.courseKey;
    if (!key) throw new Error('CourseScene: start data has no key and the class has no static courseKey');
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
      await this.holdWhileLeaving();
      await this.live(this.right(this.items[i]));
    }
    await this.finish();
  }

  /** Do not advance or finish behind the open leave card. */
  async holdWhileLeaving() {
    while (this.leaving) await this.live(wait(100));
  }

  /** Subclasses that override exit() must call `await super.exit()`. */
  async exit() { this.input.enabled = true; }

  /** Floor and back wall shared by all courses. Subclasses add their own set to this.root in setup(). */
  buildRoom() {
    const floor = new THREE.Mesh(new THREE.BoxGeometry(14, 0.3, 9), new THREE.MeshLambertMaterial({ color: SCENE.floor }));
    floor.position.set(0, -0.15, 0);
    const wall = new THREE.Mesh(new THREE.BoxGeometry(14, 5, 0.3), new THREE.MeshLambertMaterial({ color: SCENE.wall }));
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

  /** 3-D confetti burst at world position (x, y, z), n bits (skipped with Less motion). Defaults: (0, 1.5, 0), 40. */
  confetti(x = 0, y = 1.5, z = 0, n = 40) {
    confetti(this.stage, new THREE.Vector3(x, y, z), n, this.root);
  }

  async finish() {
    const { key, bridge, ui } = this;
    await this.holdWhileLeaving();
    ui.back(null); ui.hidePrompt(); ui.clearChoices();
    const stars = starsFor(this.mistakes);
    const durationSec = Math.round((performance.now() - this.t0) / 1000);
    let r = { newBest: false, part: null };
    try {
      r = await this.live(bridge.complete(key, stars, { mistakes: this.mistakes, durationSec, confusions: this.confusions }));
    } catch (e) {
      console.error('complete failed', e);
      if (e instanceof TypeError || e instanceof ReferenceError) throw e; // a bug, not a save problem
      ui.toast('未能儲存', 'Progress not saved', 2000);
    }

    if (r.part) await this.live(this.flyPart(key));
    else if (stars >= 2) this.confetti(0, 1.5, 0, 50);

    const choice = await this.live(ui.endPanel({
      title: '做得好！', stars, newBest: !!r.newBest,
      partZh: r.part && PARTS[key] ? PARTS[key].zh : '',
    }));

    // Leaving the scene: go() is intentionally not awaited (it would only resolve after the next scene's enter).
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
    this.ui.toast('新零件！', `New part: ${PARTS[key].zh}`, 900);
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
    this.input.enabled = was; // the Input object is shared by all scenes (exit() also re-enables it)
    if (id === 'leave') { if (this.alive) this.go('Workshop'); return; } // stays "leaving" so the loop never advances
    this.leaving = false;
  }
}
