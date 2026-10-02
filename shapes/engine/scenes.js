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
    this.ctx = ctx; this.classes = {}; this.scene = null; this.key = null; this.busy = false;
    if (!ctx.go) ctx.go = (key, data) => this.go(key, data);
    ctx.stage.onUpdate(dt => { if (this.scene) this.scene.update(dt); });
  }

  register(key, SceneClass) { this.classes[key] = SceneClass; }

  async go(key, data) {
    if (this.busy) return;
    const Cls = this.classes[key];
    if (!Cls) throw new Error(`Unknown scene "${key}"`);
    const { stage, input, ui } = this.ctx;
    this.busy = true;
    try {
      const old = this.scene;
      this.scene = null;
      if (old) {
        try { await old.exit(); } finally {
          input.clear(); ui.clear(); cancelTweens();
          stage.scene.remove(old.root); disposeTree(old.root);
        }
      } else { input.clear(); ui.clear(); cancelTweens(); }
      const next = new Cls(this.ctx);
      this.key = key; stage.scene.add(next.root); stage.invalidate();
      this.scene = next;
      await next.enter(data);
    } finally { this.busy = false; }
  }
}
