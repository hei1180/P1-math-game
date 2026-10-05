// WebGL stage: one renderer, camera, lights and the page's single rAF loop.
import * as THREE from 'three';
import { SCENE } from '../theme.js?v=202610051459';
import { tween, tickTweens, cancelTweens } from './tween.js?v=202610051459';

// Free GPU memory for an object tree (geometries, materials, textures).
// Anything with userData.shared === true (cached by a model module) is left alone.
export function disposeTree(root) {
  const keep = x => x.userData && x.userData.shared;
  root.traverse(o => {
    if (o.geometry && !keep(o.geometry)) o.geometry.dispose();
    const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
    for (const m of mats) {
      if (keep(m)) continue;
      for (const k in m) if (m[k] && m[k].isTexture && !keep(m[k])) m[k].dispose();
      m.dispose();
    }
  });
}

let shadowTex = null;
function shadowTexture() {
  if (shadowTex) return shadowTex;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(0,0,0,0.35)'); grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
  shadowTex = new THREE.CanvasTexture(c); shadowTex.userData.shared = true; // cached: never disposed
  return shadowTex;
}

// Soft round shadow decal lying on the floor (y = 0.002).
export function blobShadow(radius = 0.5) {
  const m = new THREE.Mesh(
    new THREE.CircleGeometry(radius, 24),
    new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; m.position.y = 0.002;
  return m;
}

export class Stage {
  static supported() {
    try {
      const c = document.createElement('canvas');
      if (!window.WebGLRenderingContext) return false;
      const gl = c.getContext('webgl2') || c.getContext('webgl');
      if (!gl) return false;
      const lose = gl.getExtension('WEBGL_lose_context'); if (lose) lose.loseContext(); // free the probe
      return true;
    } catch (e) { return false; }
  }

  constructor(container) {
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    const cv = this.renderer.domElement;
    cv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none';
    if (getComputedStyle(container).position === 'static') container.style.position = 'relative';
    container.appendChild(cv);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(SCENE.sky);
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
    this.camera.position.set(0, 6, 9); this.camera.lookAt(0, 0, 0);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0xb8a888, 1.4));
    const sun = new THREE.DirectionalLight(0xffffff, 1.6); sun.position.set(4, 9, 6);
    this.scene.add(sun);

    this._updates = new Set(); this._awake = new Set();
    this._dirty = true; this._viewing = false; this._viewId = 0; this._raf = 0; this._last = performance.now();
    this._view = { px: 0, py: 6, pz: 9, lx: 0, ly: 0, lz: 0 };

    this._resize();
    this._ro = new ResizeObserver(() => this.resize());
    this._ro.observe(container);
    this._vis = () => { if (!document.hidden) this.invalidate(); };
    document.addEventListener('visibilitychange', this._vis);
    const loop = () => {
      this._raf = requestAnimationFrame(loop);
      const now = performance.now(), dt = Math.min((now - this._last) / 1000, 0.05);
      this._last = now;
      if (!document.hidden) this._frame(dt);
    };
    this._raf = requestAnimationFrame(loop);
  }

  _resize() {
    const w = Math.max(1, this.container.clientWidth), h = Math.max(1, this.container.clientHeight);
    this.width = w; this.height = h;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    this._dirty = true;
  }

  // Re-measure the container and draw at once (no blank frame while resizing / rotating).
  resize() { this._resize(); this._dirty = false; this.renderer.render(this.scene, this.camera); }

  _frame(dt) {
    const ran = tickTweens(dt);
    if (this._viewing) this._applyView();
    for (const fn of this._updates) { try { fn(dt); } catch (e) { console.error(e); } }
    if (ran || this._awake.size || this._dirty) { this._dirty = false; this.renderer.render(this.scene, this.camera); }
  }

  _applyView() {
    const v = this._view;
    this.camera.position.set(v.px, v.py, v.pz); this.camera.lookAt(v.lx, v.ly, v.lz);
  }

  // Move the camera (tweened when ms > 0). A newer call supersedes a running one.
  setView(pos, look, ms = 0) {
    const v = this._view, to = { px: pos[0], py: pos[1], pz: pos[2], lx: look[0], ly: look[1], lz: look[2] };
    cancelTweens(v);
    const id = ++this._viewId;
    if (ms <= 0) {
      Object.assign(v, to); this._viewing = false; this._applyView(); this.invalidate();
      return Promise.resolve();
    }
    this._viewing = true;
    return tween(v, to, { ms, ease: 'inOutCubic' }).then(() => { if (id === this._viewId) this._viewing = false; });
  }

  onUpdate(fn) { this._updates.add(fn); return () => this._updates.delete(fn); }
  awake(token, on) { if (on) this._awake.add(token); else this._awake.delete(token); }
  invalidate() { this._dirty = true; }
  step(ms = 16.7) { this._frame(ms / 1000); }

  // CSS px position inside the container.
  toScreen(o) {
    const v = new THREE.Vector3();
    if (o.isObject3D) { o.updateWorldMatrix(true, false); o.getWorldPosition(v); } else v.copy(o);
    this.camera.updateMatrixWorld();
    v.project(this.camera);
    return { x: (v.x * 0.5 + 0.5) * this.width, y: (-v.y * 0.5 + 0.5) * this.height };
  }

  dispose() {
    cancelAnimationFrame(this._raf); this._ro.disconnect(); document.removeEventListener('visibilitychange', this._vis);
    this._updates.clear(); this._awake.clear();
    disposeTree(this.scene);
    this.renderer.dispose(); this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }
}
