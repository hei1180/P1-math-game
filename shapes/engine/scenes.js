// Scene base class and manager. ctx = { stage, input, ui, bridge, go }.
import * as THREE from 'three';
import { disposeTree } from './stage.js?v=0';
import { cancelTweens } from './tween.js?v=0';

export class Scene {
  constructor(ctx) {
    this.ctx = ctx;
    ({ stage: this.stage, input: this.input, ui: this.ui, bridge: this.bridge, go: this.go } = ctx);
    this.root = new THREE.Group();
  }
  async enter(data) {}
  update(dt) {}
  async exit() {}
}

export class SceneManager {
  constructor(ctx) {
    this.ctx = ctx; this.classes = {}; this.scene = null; this.key = null; this.busy = false; this.pending = null;
    if (!ctx.go) ctx.go = (key, data) => this.go(key, data);
    ctx.stage.onUpdate(dt => { if (this.scene) this.scene.update(dt); });
  }

  register(key, SceneClass) { this.classes[key] = SceneClass; }

  // Swap scenes. `busy` covers only exit + swap, so a scene may call go() from inside its own
  // enter(). A go() that arrives mid-swap is remembered (latest wins) and used for the swap.
  async go(key, data) {
    if (!this.classes[key]) throw new Error(`Unknown scene "${key}"`);
    if (this.busy) { this.pending = { key, data }; return; }
    const { stage, input, ui } = this.ctx;
    let next, nextData;
    this.busy = true;
    try {
      const old = this.scene;
      this.scene = null;
      if (old) {
        try { await old.exit(); } catch (e) { console.error(e); } finally {
          input.clear(); ui.clear(); cancelTweens();
          stage.scene.remove(old.root); disposeTree(old.root);
        }
      } else { input.clear(); ui.clear(); cancelTweens(); }
      const req = this.pending || { key, data };
      this.pending = null;
      next = new this.classes[req.key](this.ctx); nextData = req.data;
      this.key = req.key; stage.scene.add(next.root); stage.invalidate();
      this.scene = next;
    } finally { this.busy = false; }
    await next.enter(nextData);
  }
}
