// Dev-only gallery of every model (open with shapes.html?dev&scene=Sandbox): solids with faces, tiles, B4 pieces,
// the house puzzle solved on its outline, wires, a pegboard with a band. One finger turns the whole table.
import * as THREE from 'three';
import { Scene } from '../engine/scenes.js?v=202610051459';
import { MODEL_IDS, posesOf, TILE_TEMPLATES, PIECE_IDS, puzzleById, LINES } from '../../shapes-logic.js?v=202610051459';
import { SCENE, toyColor } from '../theme.js?v=202610051459';
import { makeSolid, setMood, blink } from '../models/solids.js?v=202610051459';
import { MOODS } from '../models/faces.js?v=202610051459';
import { makeTile, makePiece, makeOutline, makeWire, makePegboard, makeBand, makeLaser, makeCurve } from '../models/tiles.js?v=202610051459';

const VIEWS = {
  all:    { pos: [0, 18.5, 10.4],   look: [0, 0, -1.2] },
  solids: { pos: [-1.5, 4, -1.8],   look: [-1.5, 0.4, -5.4] },
  tiles:  { pos: [-3.8, 6.5, 1],    look: [-3.8, 0, -2.7] },
  pieces: { pos: [-1, 8, 6.5],      look: [-1, 0, 1.2] },
  puzzle: { pos: [-2, 7, 9.5],      look: [-2, 0, 4.6] },
  wires:  { pos: [0, 4.5, -2.6],    look: [0, 0.4, -7.8] },
  peg:    { pos: [6, 3.4, 4],       look: [6, 1.7, -1.6] },
};

export class SandboxScene extends Scene {
  async enter() {
    const { stage, input, ui, bridge } = this;
    const rng = bridge.rng, world = this.world = new THREE.Group();
    this.root.add(world);
    const parts = this.parts = { solids: [], tiles: [], pieces: [], wires: [] };

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshStandardMaterial({ color: SCENE.floor, roughness: 1 }));
    floor.rotation.x = -Math.PI / 2; world.add(floor);

    // solids: every model upright, then the two that can lie down, then one without a face
    MODEL_IDS.forEach((id, i) => {
      const s = makeSolid(id, { color: toyColor(rng) });
      s.position.set(-8.2 + i * 1.45, s.userData.restY, -5.4); world.add(s); parts.solids.push(s);
    });
    let sx = 5.2;
    for (const id of MODEL_IDS) for (const pose of posesOf(id)) {
      if (pose !== 'side') continue;
      const s = makeSolid(id, { color: toyColor(rng), pose });
      s.position.set(sx, s.userData.restY, -5.4); sx += 1.5; world.add(s); parts.solids.push(s);
    }
    const bare = makeSolid('cube', { color: toyColor(rng), face: false });
    bare.position.set(sx, bare.userData.restY, -5.4); world.add(bare);

    TILE_TEMPLATES.forEach((t, i) => {
      const m = makeTile(t.id, { color: toyColor(rng) });
      m.position.set(-8.2 + (i % 8) * 1.3, 0, i < 8 ? -3.4 : -2); world.add(m); parts.tiles.push(m);
    });

    // every piece at r = 0..3 (cell 0.5), top-left of the footprint at the position
    PIECE_IDS.forEach((id, i) => {
      for (let r = 0; r < 4; r++) {
        const m = makePiece(id, { color: toyColor(rng), cell: 0.5, r });
        m.position.set(-8.2 + (i * 2 + (r % 2)) * 1.35, 0, r < 2 ? 0.4 : 1.9); world.add(m); parts.pieces.push(m);
      }
    });

    // the house solved on its outline, and the robot face outline on its own
    const cell = 0.6, house = puzzleById('house');
    const out = makeOutline(house, { cell }); out.position.set(-6.5, 0, 3.6); world.add(out);
    this.house = [];
    for (const s of house.solution) {
      const m = makePiece(s.p, { color: toyColor(rng), cell, r: s.r });
      m.position.set(-6.5 + s.x * cell, 0, 3.6 + s.y * cell); world.add(m); this.house.push(m);
    }
    const face = makeOutline(puzzleById('face'), { cell: 0.5 }); face.position.set(-4, 0, 3.6); world.add(face);
    const boat = makeOutline(puzzleById('boat'), { cell: 0.5 }); boat.position.set(-1.2, 0, 3.6); world.add(boat);
    world.add(makeLaser([1.4, 0.08, 4], [3.4, 0.08, 4]));
    world.add(makeCurve([1.4, 0.08, 5], [3.4, 0.08, 5], 0.4));

    LINES.forEach((l, i) => {
      const w = makeWire(l.id, { color: toyColor(rng) });
      w.position.set(-7.7 + i * 2.2, 0.65, -7.8); world.add(w); parts.wires.push(w);
    });

    const peg = this.peg = makePegboard({ spacing: 0.62 });
    peg.position.set(6, 1.75, -1.6); world.add(peg);
    const band = this.band = makeBand({ radius: 0.03 }); peg.add(band);
    const pg = peg.userData.pegs;
    band.userData.set([[2, 0], [4, 2], [3, 4], [1, 4], [0, 2]].map(([x, y]) => pg[x][y].position), true);

    stage.setView(VIEWS.all.pos, VIEWS.all.look);
    input.spin(world, { speed: 0.006 });
    stage.invalidate();

    ui.prompt('材料樣板', 'Sandbox (dev): turn the table with one finger', { speak: false });
    ui.back(() => this.go('Workshop'));
    const items = [
      ['all', '全部', 'All'], ['solids', '立體', 'Solids'], ['tiles', '平面', 'Tiles'], ['pieces', '圖塊', 'Pieces'], ['puzzle', '拼砌', 'Puzzle'],
      ['wires', '線', 'Wires'], ['peg', '釘板', 'Peg'], ['mood', '心情', 'Mood'], ['blink', '眨眼', 'Blink'], ['reset', '重設', 'Reset'],
    ].map(([id, zh, en]) => ({ id, zh, en }));
    let mood = 0;
    for (;;) {
      const id = await this.live(ui.choices(items, { columns: 5 }));
      if (VIEWS[id]) this.showView(id);
      else if (id === 'reset') { world.quaternion.identity(); this.showView('all'); }
      else if (id === 'mood') { mood = (mood + 1) % MOODS.length; await Promise.all(parts.solids.map(s => setMood(s, MOODS[mood]))); }
      else if (id === 'blink') await Promise.all(parts.solids.map(s => blink(s)));
    }
  }

  showView(key) {
    this.stage.setView(VIEWS[key].pos, VIEWS[key].look, 600);
  }
}
