// One-finger pointer input on the stage canvas: tap, drag on a plane, spin.
import * as THREE from 'three';

const TAP_PX = 10, TAP_MS = 400;
const FLOOR = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

const shown = o => { for (; o; o = o.parent) if (!o.visible) return false; return true; };

export class Input {
  constructor(stage) {
    this.stage = stage;
    this.enabled = true;
    this._taps = new Set(); this._drags = new Set(); this._spins = new Set();
    this._ray = new THREE.Raycaster();
    this._p = null; // active pointer { id, x, y, t, mode, ... }
    const cv = this.el = stage.renderer.domElement;
    this._on = { pointerdown: e => this._down(e), pointermove: e => this._move(e), pointerup: e => this._up(e), pointercancel: e => this._cancel(e) };
    for (const k in this._on) cv.addEventListener(k, this._on[k]);
  }

  // Fire fn(target, point) when a registered object (or a child of it) is tapped.
  onTap(targets, fn) { const r = { targets, fn }; this._taps.add(r); return () => this._taps.delete(r); }

  // Let one finger drag obj over a plane; the object is lifted by `lift` while held and
  // put back on the plane just before onEnd, which may return a Promise.
  drag(obj, { plane = 'floor', lift = 0.2, onStart, onMove, onEnd } = {}) {
    const r = { obj, plane: plane === 'floor' ? FLOOR : plane, lift, onStart, onMove, onEnd };
    this._drags.add(r); return () => this._drags.delete(r);
  }

  // One-finger drag turns obj about the world y and x axes.
  spin(obj, { speed = 0.01 } = {}) {
    const r = { obj, speed }; this._spins.add(r); return () => this._spins.delete(r);
  }

  clear() { this._taps.clear(); this._drags.clear(); this._spins.clear(); this._p = null; }

  dispose() { this.clear(); for (const k in this._on) this.el.removeEventListener(k, this._on[k]); }

  _ndc(e) {
    const r = this.el.getBoundingClientRect();
    return new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  }

  _cast(e) {
    this.stage.camera.updateMatrixWorld();
    this._ray.setFromCamera(this._ndc(e), this.stage.camera);
    return this._ray;
  }

  // Nearest visible hit among `targets` -> { target, point, dist } | null
  _hit(targets, ray) {
    const list = targets.filter(t => t && shown(t));
    for (const h of ray.intersectObjects(list, true)) {
      if (!shown(h.object)) continue;
      let t = h.object; while (t && !list.includes(t)) t = t.parent;
      if (t) return { target: t, point: h.point, dist: h.distance };
    }
    return null;
  }

  _planeHit(ray, plane, out) { return ray.ray.intersectPlane(plane, out); }

  _down(e) {
    if (!this.enabled || this._p || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const ray = this._cast(e);
    const p = this._p = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now(), moved: false, mode: 'tap' };
    try { this.el.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }

    // a draggable under the finger wins, then a spinnable one
    let best = null;
    for (const r of this._drags) { const h = this._hit([r.obj], ray); if (h && (!best || h.dist < best.h.dist)) best = { r, h }; }
    if (best) {
      const { r } = best, pt = new THREE.Vector3();
      if (this._planeHit(ray, r.plane, pt)) {
        const wp = r.obj.getWorldPosition(new THREE.Vector3());
        const off = wp.sub(pt); // keeps the grab point and the height above the plane
        Object.assign(p, { mode: 'drag', r, off, point: pt });
        if (r.onStart) r.onStart(r.obj);
        this._place(p, pt, r.lift);
        return;
      }
    }
    for (const r of this._spins) if (this._hit([r.obj], ray)) { Object.assign(p, { mode: 'spin', r, lx: e.clientX, ly: e.clientY }); return; }
  }

  _place(p, pt, lift) {
    const { r, off } = p, w = pt.clone().add(off).addScaledVector(r.plane.normal, lift);
    if (r.obj.parent) r.obj.parent.worldToLocal(w);
    r.obj.position.copy(w);
    this.stage.invalidate();
  }

  _move(e) {
    const p = this._p;
    if (!p || e.pointerId !== p.id) return;
    if (Math.hypot(e.clientX - p.x, e.clientY - p.y) > TAP_PX) p.moved = true;
    if (p.mode === 'drag') {
      const pt = p.point;
      if (this._planeHit(this._cast(e), p.r.plane, pt)) { this._place(p, pt, p.r.lift); if (p.r.onMove) p.r.onMove(p.r.obj, pt.clone()); }
    } else if (p.mode === 'spin') {
      const dx = e.clientX - p.lx, dy = e.clientY - p.ly, o = p.r.obj, k = p.r.speed;
      p.lx = e.clientX; p.ly = e.clientY;
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(dy * k, dx * k, 0, 'YXZ'));
      o.quaternion.premultiply(q); this.stage.invalidate();
    }
  }

  async _up(e) {
    const p = this._p;
    if (!p || e.pointerId !== p.id) return;
    try { this.el.releasePointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    const quick = !p.moved && performance.now() - p.t <= TAP_MS;
    if (p.mode === 'drag') {
      const r = p.r, pt = p.point;
      this._planeHit(this._cast(e), r.plane, pt);
      this._place(p, pt, 0);
      try { if (r.onEnd) await r.onEnd(r.obj, pt.clone()); } finally { if (this._p === p) this._p = null; }
    } else this._p = null;
    if (quick && this.enabled) this._tap(e); // a press without movement is still a tap
  }

  _cancel(e) {
    const p = this._p;
    if (!p || e.pointerId !== p.id) return;
    if (p.mode === 'drag') { this._place(p, p.point, 0); if (p.r.onEnd) p.r.onEnd(p.r.obj, p.point.clone()); }
    this._p = null;
  }

  _tap(e) {
    const ray = this._cast(e);
    let best = null;
    for (const r of this._taps) {
      const targets = typeof r.targets === 'function' ? r.targets() : r.targets;
      const h = this._hit(targets || [], ray);
      if (h && (!best || h.dist < best.h.dist)) best = { r, h };
    }
    if (best) best.r.fn(best.h.target, best.h.point);
  }
}
