// cannon-es world for the stage. Shape specs are passed in (nothing imported from models).
// Meshes must sit in world space (parent at the origin, unscaled).
export async function createPhysics(stage) {
  const CANNON = await import('cannon-es');
  return new Physics(stage, CANNON);
}

const STEP = 1 / 60;

export class Physics {
  constructor(stage, CANNON) {
    this.stage = stage; this.CANNON = CANNON;
    this.world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) });
    this.world.allowSleep = true;
    this.world.defaultContactMaterial.friction = 0.4;
    this.world.defaultContactMaterial.restitution = 0.1;
    this.items = []; // { mesh, body }
    this._off = null; this._wasMoving = false; this._acc = 0; this._time = 0; this._settlers = [];
  }

  _add(mesh, shape, mass) {
    const C = this.CANNON, body = new C.Body({ mass, shape, allowSleep: true, sleepSpeedLimit: 0.15, sleepTimeLimit: 0.4,
      linearDamping: 0.2, angularDamping: 0.5 }); // damping stands in for rolling friction so balls come to rest
    body.position.set(mesh.position.x, mesh.position.y, mesh.position.z);
    body.quaternion.set(mesh.quaternion.x, mesh.quaternion.y, mesh.quaternion.z, mesh.quaternion.w);
    this.world.addBody(body); this.items.push({ mesh, body });
    return body;
  }

  addGround({ y = 0 } = {}) {
    const C = this.CANNON, body = new C.Body({ mass: 0, shape: new C.Plane() });
    body.quaternion.setFromEuler(-Math.PI / 2, 0, 0); body.position.set(0, y, 0);
    this.world.addBody(body);
    return body;
  }

  _shape(s) {
    const C = this.CANNON;
    switch (s.type) {
      case 'box': return new C.Box(new C.Vec3(...s.half));
      case 'sphere': return new C.Sphere(s.r);
      case 'cylinder': return new C.Cylinder(s.rTop, s.rBottom, s.h, 16); // axis Y, like three.js
      case 'convex': {
        const vertices = (s.vertices || s.v).map(p => new C.Vec3(...p)), c = new C.Vec3();
        vertices.forEach(v => c.vadd(v, c)); c.scale(1 / vertices.length, c);
        // cannon wants counter-clockwise faces seen from outside: flip any that face the centre
        const faces = s.faces.map(f => {
          const a = vertices[f[0]], b = vertices[f[1]], d = vertices[f[2]];
          const n = b.vsub(a).cross(d.vsub(a));
          return n.dot(a.vsub(c)) < 0 ? [...f].reverse() : f;
        });
        return new C.ConvexPolyhedron({ vertices, faces });
      }
      default: throw new Error(`Unknown shape type "${s.type}"`);
    }
  }

  addSolid(mesh, shape, { mass = 1 } = {}) { return this._add(mesh, this._shape(shape), mass); }

  addBox(mesh, { size, mass = 0 }) {
    return this._add(mesh, new this.CANNON.Box(new this.CANNON.Vec3(size[0] / 2, size[1] / 2, size[2] / 2)), mass);
  }

  remove(body) {
    this.world.removeBody(body);
    this.items = this.items.filter(i => i.body !== body);
  }

  start() {
    if (this._off) return;
    this._off = this.stage.onUpdate(dt => this._tick(dt));
  }

  stop() {
    if (this._off) { this._off(); this._off = null; }
    this.stage.awake('physics', false);
  }

  _moving() { return this.items.some(({ body }) => body.mass > 0 && body.sleepState !== this.CANNON.Body.SLEEPING); }

  _tick(dt) {
    this._acc += dt;
    while (this._acc >= STEP) { this.world.step(STEP); this._acc -= STEP; this._time += STEP * 1000; }
    for (const { mesh, body } of this.items) {
      if (body.mass === 0) continue;
      mesh.position.set(body.position.x, body.position.y, body.position.z);
      mesh.quaternion.set(body.quaternion.x, body.quaternion.y, body.quaternion.z, body.quaternion.w);
    }
    const moving = this._moving();
    this.stage.awake('physics', moving);
    if (this._wasMoving && !moving) this.stage.invalidate(); // draw the final resting pose
    this._wasMoving = moving;
    if (this._settlers.length) {
      this._settlers = this._settlers.filter(s => {
        if (moving && this._time - s.t0 < s.max) return true;
        s.done(); return false;
      });
    }
  }

  // Resolves when every dynamic body sleeps, or after maxMs of simulated time.
  settle(maxMs = 2500) {
    return new Promise(resolve => {
      if (!this._off || !this._moving()) { resolve(); return; }
      const s = { t0: this._time, max: maxMs, done: () => { clearTimeout(guard); resolve(); } };
      const guard = setTimeout(() => { this._settlers = this._settlers.filter(x => x !== s); resolve(); }, maxMs + 1000);
      this._settlers.push(s);
    });
  }

  dispose() {
    this.stop();
    this._settlers.forEach(s => s.done()); this._settlers = [];
    this.items.forEach(({ body }) => this.world.removeBody(body)); this.items = [];
  }
}
