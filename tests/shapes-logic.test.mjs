import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FAMILIES, FAMILY, MODEL_IDS, familyOf, posesOf, rolls, rollStyle, topIsFlat, bottomIsFlat, canPlace,
  FACTS, FACT_KEYS, CLUE_TEXT, candidatesFor, clueSequence, OBJECTS, objectById,
  TILE_TEMPLATES, templateById, tileAnswer, TILE_ANSWERS, ANSWER_TEXT,
  simplify, countSides, segmentsMeet, isSimplePolygon, polygonArea, checkPeg,
  PIECES, PIECE_IDS, footprint, PUZZLES, puzzleById, checkDrop, isPuzzleDone,
  WHEEL_CHOICES, BODY_CHOICES, HEAD_CHOICES, checkBuild, genBoss,
  COURSES, ZONES, LINES, genCourse, genRush3d, genRush2d,
  starsFor, PARTS, SLOTS, ROBOT_NAMES, robotName, emptyProgress, recordResult, mergeProgress,
  isZoneOpen, isCourseOpen, isZoneCleared, isRushOpen, isBossOpen, nextCourse,
  validateGalleryEntry, shuffle, lcg, BASIC_PART, LOOKS, LOOK_INFO, ownedItems, unseenItems, markSeen,
} from '../shapes-logic.js';

const SEEDS = Array.from({ length: 40 }, (_, i) => i + 1);
const UNLOCK_BOTH = { a: true, b: true };
const allStars = keys => Object.fromEntries(keys.map(k => [k, 1]));

test('families: P1 names only, every model maps to one', () => {
  assert.deepEqual(FAMILIES, ['prism', 'cylinder', 'pyramid', 'cone', 'sphere']);
  assert.deepEqual(FAMILIES.map(f => FAMILY[f].zh), ['角柱', '圓柱', '角錐', '圓錐', '球']);
  for (const m of MODEL_IDS) assert.ok(FAMILIES.includes(familyOf(m)), m);
});

test('rolling table: curved side rolls, flat faces do not', () => {
  assert.equal(rolls('sphere'), true);
  assert.equal(rolls('cylinder', 'side'), true);
  assert.equal(rolls('cylinder', 'upright'), false);
  assert.equal(rolls('cone', 'side'), true);
  assert.equal(rolls('cone', 'upright'), false);
  for (const m of ['cube', 'cuboid', 'triPrism', 'hexPrism', 'sqPyramid', 'triPyramid']) assert.equal(rolls(m), false, m);
  assert.equal(rollStyle('sphere'), 'any');
  assert.equal(rollStyle('cylinder', 'side'), 'straight');
  assert.equal(rollStyle('cone', 'side'), 'circle');
  assert.equal(rollStyle('cube'), null);
  assert.deepEqual(posesOf('cube'), ['upright']);
  assert.deepEqual(posesOf('cone'), ['upright', 'side']);
});

test('stacking: flat top below, flat bottom on top, pointy/round only last, sphere never', () => {
  assert.ok(canPlace('cube', 'cylinder', false));
  assert.ok(canPlace('cone', 'cube', true));
  assert.ok(!canPlace('cone', 'cube', false));
  assert.ok(!canPlace('sphere', 'cube', true));
  assert.ok(!canPlace('cube', 'sqPyramid', true));
  assert.ok(topIsFlat('hexPrism') && !topIsFlat('cone') && !topIsFlat('sphere'));
  assert.ok(bottomIsFlat('cone') && !bottomIsFlat('sphere'));
});

test('facts: every family has a unique row and clue text exists', () => {
  const rows = FAMILIES.map(f => FACT_KEYS.map(k => FACTS[f][k]).join());
  assert.equal(new Set(rows).size, 5);
  for (const k of FACT_KEYS) { assert.ok(CLUE_TEXT[k].true.zh); assert.ok(CLUE_TEXT[k].false.zh); }
});

test('clueSequence pins down the family with at most 4 useful clues', () => {
  for (const seed of SEEDS) for (const f of FAMILIES) {
    const clues = clueSequence(f, lcg(seed));
    assert.deepEqual(candidatesFor(clues), [f]);
    assert.ok(clues.length >= 1 && clues.length <= 4);
    for (let i = 1; i <= clues.length; i++) assert.ok(candidatesFor(clues.slice(0, i)).length < candidatesFor(clues.slice(0, i - 1)).length, 'each clue rules something out');
  }
});

test('everyday objects: 12, every family at least twice', () => {
  assert.equal(OBJECTS.length, 12);
  for (const f of FAMILIES) assert.ok(OBJECTS.filter(o => o.family === f).length >= 2, f);
  assert.equal(objectById('can').family, 'cylinder');
  assert.equal(new Set(OBJECTS.map(o => o.id)).size, 12);
});

test('tile templates: declared sides match counted sides; dented and irregular exist for 4, 5, 6', () => {
  for (const t of TILE_TEMPLATES) {
    if (t.circle) continue;
    assert.equal(countSides(t.points), t.sides, t.id);
    assert.ok(isSimplePolygon(simplify(t.points)), t.id + ' simple');
  }
  for (const n of [4, 5, 6]) assert.ok(TILE_TEMPLATES.some(t => t.sides === n && t.dented), 'dented ' + n);
  for (const n of [3, 4, 5, 6]) assert.ok(TILE_TEMPLATES.some(t => t.sides === n && t.irregular), 'irregular ' + n);
  assert.equal(tileAnswer(templateById('circle')), 'circle');
  assert.equal(tileAnswer(templateById('hex-L')), 6);
  for (const a of TILE_ANSWERS) assert.ok(ANSWER_TEXT[a].zh);
});

test('simplify: straight-through pegs merge, doubling back is rejected', () => {
  assert.deepEqual(simplify([[0, 0], [1, 0], [2, 0], [2, 2], [0, 2]]), [[0, 0], [2, 0], [2, 2], [0, 2]]);
  assert.equal(countSides([[0, 0], [2, 0], [2, 2], [0, 2], [0, 0]]), 4, 'closing point equal to first');
  assert.equal(simplify([[0, 0], [2, 0], [1, 0], [1, 2]]), null, 'goes back along a line');
});

test('segmentsMeet and isSimplePolygon', () => {
  assert.ok(segmentsMeet([0, 0], [2, 2], [0, 2], [2, 0]));
  assert.ok(segmentsMeet([0, 0], [2, 0], [1, 0], [1, 2]), 'touching counts');
  assert.ok(!segmentsMeet([0, 0], [1, 0], [0, 1], [1, 1]));
  assert.ok(!isSimplePolygon([[0, 0], [2, 2], [2, 0], [0, 2]]), 'bow tie');
  assert.ok(isSimplePolygon([[0, 0], [2, 0], [2, 2], [0, 2]]));
  assert.equal(polygonArea([[0, 0], [2, 0], [2, 2], [0, 2]]), 4);
});

test('checkPeg reasons', () => {
  const sq = [[0, 0], [3, 0], [3, 3], [0, 3]];
  assert.deepEqual(checkPeg({ points: sq, closed: true }, 4), { ok: true, sides: 4, reason: null });
  assert.equal(checkPeg({ points: sq, closed: false }, 4).reason, 'open');
  assert.equal(checkPeg({ points: sq, closed: true }, 5).reason, 'wrong-sides');
  assert.equal(checkPeg({ points: [[0, 0], [1, 0], [2, 0]], closed: true }, 3).reason, 'flat');
  assert.equal(checkPeg({ points: [[0, 0], [2, 2], [2, 0], [0, 2]], closed: true }, 4).reason, 'crossing');
  const house = [[2, 0], [4, 2], [4, 4], [0, 4], [0, 2]];
  assert.equal(checkPeg({ points: house, closed: true }, 5).ok, true);
  const dented = [[0, 0], [4, 0], [4, 4], [2, 2], [0, 4]];
  assert.equal(checkPeg({ points: dented, closed: true }, 5).ok, true, 'dented shapes are fine');
  const withMid = [[0, 0], [2, 0], [4, 0], [4, 4], [0, 4]];
  assert.equal(checkPeg({ points: withMid, closed: true }, 4).ok, true, 'peg in the middle of a side is not a corner');
});

test('footprint turns in quarter steps and normalises to the top-left', () => {
  assert.deepEqual(footprint('tri', 0, 0, 0).sort(), ['0,0,s', '0,0,w']);
  assert.deepEqual(footprint('tri', 0, 0, 1).sort(), ['0,0,n', '0,0,w']);
  assert.deepEqual(footprint('tri', 0, 0, 3).sort(), ['0,0,e', '0,0,s']);
  assert.deepEqual(footprint('rect', 2, 1, 1).map(k => k.slice(0, 3)).filter((v, i, a) => a.indexOf(v) === i).sort(), ['2,1', '2,2']);
  assert.deepEqual(footprint('circle', 1, 1, 2), ['1,1,c']);
  for (const id of PIECE_IDS) assert.equal(footprint(id, 0, 0, 4).sort().join(), footprint(id, 0, 0, 0).sort().join(), id);
});

test('puzzles are solvable from their pieces and drops are checked', () => {
  for (const p of PUZZLES) {
    const covered = new Set();
    for (const s of p.solution) {
      const r = checkDrop(p, covered, s.p, s.x, s.y, s.r);
      assert.ok(r.ok, p.id + ' ' + s.p);
      r.keys.forEach(k => covered.add(k));
    }
    assert.ok(isPuzzleDone(p, covered), p.id);
    assert.ok(p.solution.length >= 3 && p.solution.length <= 5, p.id + ' 3-5 pieces');
  }
  const house = puzzleById('house');
  assert.equal(checkDrop(house, new Set(), 'bigsq', 1, 1, 0).ok, false, 'outside the outline');
  const c = new Set(footprint('bigsq', 0, 1, 0));
  assert.equal(checkDrop(house, c, 'sq', 0, 1, 0).ok, false, 'overlap');
  assert.equal(checkDrop(house, c, 'tri', 0, 0, 0).ok, false, 'wrong turn');
});

test('checkBuild: driving order of failures', () => {
  const job = { kind: 'job', panel: 5, head: { fact: 'apex', value: true }, panels: [] };
  const good = { wheels: 'cylinder', body: 'cuboid', head: 'cone', panel: 'pent-house' };
  assert.deepEqual(checkBuild(job, good), { ok: true, fail: null });
  assert.equal(checkBuild(job, { ...good, wheels: 'cube' }).fail, 'wheels-flat');
  assert.equal(checkBuild(job, { ...good, wheels: 'sphere' }).fail, 'wheels-sphere');
  assert.equal(checkBuild(job, { ...good, wheels: 'cone' }).fail, 'wheels-cone');
  assert.equal(checkBuild(job, { ...good, body: 'sqPyramid' }).fail, 'body-top');
  assert.equal(checkBuild(job, { ...good, head: 'sphere' }).fail, 'head-rolls');
  assert.equal(checkBuild(job, { ...good, head: 'cube' }).fail, 'head-wrong');
  assert.equal(checkBuild(job, { ...good, panel: 'hex-reg' }).fail, 'panel');
});

test('genBoss: 3 solvable jobs with different window sides', () => {
  for (const seed of SEEDS) {
    const jobs = genBoss(lcg(seed));
    assert.equal(jobs.length, 3);
    assert.equal(new Set(jobs.map(j => j.panel)).size, 3);
    for (const j of jobs) {
      assert.equal(j.panels.length, 4);
      const panel = j.panels.find(id => tileAnswer(templateById(id)) === j.panel);
      const head = HEAD_CHOICES.find(h => checkBuild(j, { wheels: 'cylinder', body: 'cuboid', head: h, panel }).ok);
      assert.ok(panel && head, 'solvable');
      assert.ok(WHEEL_CHOICES.includes('cylinder') && BODY_CHOICES.includes('cuboid'));
    }
  }
});

test('genCourse A1: 5 items, at least 2 roll and 2 do not, answers match the table', () => {
  for (const seed of SEEDS) {
    const items = genCourse('A1', lcg(seed));
    assert.equal(items.length, 5);
    assert.ok(items.filter(i => i.answer).length >= 2 && items.filter(i => !i.answer).length >= 2);
    for (const i of items) { assert.equal(i.answer, rolls(i.model, i.pose)); assert.ok(posesOf(i.model).includes(i.pose)); }
  }
});

test('genCourse A2: 2 towers, 5 placements, each tray has a right and a wrong piece', () => {
  for (const seed of SEEDS) {
    const items = genCourse('A2', lcg(seed));
    assert.deepEqual(items.map(i => [i.tower, i.isLast]), [[0, false], [0, true], [1, false], [1, false], [1, true]]);
    for (const i of items) {
      assert.equal(i.tray.length, 3);
      assert.equal(new Set(i.tray).size, 3);
      assert.ok(i.tray.some(m => canPlace(m, 'cuboid', i.isLast)) && i.tray.some(m => !canPlace(m, 'cuboid', i.isLast)));
    }
  }
});

test('genCourse A3: each family once, clues solve it', () => {
  for (const seed of SEEDS) {
    const items = genCourse('A3', lcg(seed));
    assert.deepEqual(items.map(i => i.family).sort(), FAMILIES.slice().sort());
    for (const i of items) assert.deepEqual(candidatesFor(i.clues), [i.family]);
  }
});

test('genCourse A4: 5 different objects from at least 3 families', () => {
  for (const seed of SEEDS) {
    const items = genCourse('A4', lcg(seed));
    assert.equal(new Set(items.map(i => i.object)).size, 5);
    assert.ok(new Set(items.map(i => i.answer)).size >= 3);
    for (const i of items) assert.equal(objectById(i.object).family, i.answer);
  }
});

test('genCourse B1: 3 sorts with both answers, then the two dot tasks', () => {
  for (const seed of SEEDS) {
    const items = genCourse('B1', lcg(seed));
    assert.equal(items.length, 5);
    const sorts = items.slice(0, 3);
    assert.ok(sorts.every(i => i.kind === 'line'));
    assert.ok(sorts.some(i => i.answer === 'straight') && sorts.some(i => i.answer === 'curved'));
    for (const i of sorts) assert.equal(LINES.find(l => l.id === i.line).curved, i.answer === 'curved');
    assert.deepEqual(items.slice(3).map(i => i.kind), ['dots-connect', 'dots-howmany']);
    assert.equal(items[4].answer, 'one');
  }
});

test('genCourse B2: 5 turned tiles, 4+ different answers, an odd one and a dented one', () => {
  for (const seed of SEEDS) {
    const items = genCourse('B2', lcg(seed));
    assert.equal(items.length, 5);
    assert.ok(new Set(items.map(i => i.answer)).size >= 4);
    assert.ok(items.some(i => templateById(i.tile).irregular) && items.some(i => templateById(i.tile).dented));
    for (const i of items) { assert.equal(i.answer, tileAnswer(templateById(i.tile))); assert.ok(i.rot % 30 === 0 && i.rot < 360); }
  }
});

test('genCourse B3, B4, boss', () => {
  const b3 = genCourse('B3', lcg(3));
  assert.deepEqual(b3.map(i => i.target).sort(), [3, 4, 5, 6]);
  const b4 = genCourse('B4', lcg(3));
  assert.equal(b4.length, 2);
  assert.notEqual(b4[0].puzzle, b4[1].puzzle);
  for (const i of b4) assert.deepEqual(i.pieces.slice().sort(), puzzleById(i.puzzle).solution.map(s => s.p).sort());
  assert.equal(genCourse('boss', lcg(3)).length, 3);
  assert.throws(() => genCourse('Z9'));
});

test('rush items carry the right answer', () => {
  for (const seed of SEEDS) {
    const r = lcg(seed);
    const a = genRush3d(r);
    assert.equal(a.answer, a.object ? objectById(a.object).family : familyOf(a.model));
    const b = genRush2d(r);
    assert.equal(b.answer, tileAnswer(templateById(b.tile)));
  }
});

test('stars', () => {
  assert.deepEqual([0, 1, 2, 3, 9].map(starsFor), [3, 2, 2, 1, 1]);
});

test('recordResult: best stars kept, part only on first clear', () => {
  let p = emptyProgress();
  let r = recordResult(p, 'A1', 2);
  assert.equal(r.part, PARTS.A1.id);
  assert.equal(r.newBest, true);
  assert.equal(p.stars.A1, undefined, 'input not mutated');
  r = recordResult(r.progress, 'A1', 3);
  assert.equal(r.part, null);
  assert.equal(r.newBest, true);
  r = recordResult(r.progress, 'A1', 1);
  assert.equal(r.newBest, false);
  assert.equal(r.progress.stars.A1, 3);
  assert.deepEqual(r.progress.parts, [PARTS.A1.id]);
  for (const k of [...ZONES.a.keys, ...ZONES.b.keys, 'boss']) assert.ok(SLOTS.includes(PARTS[k].slot), k);
});

test('mergeProgress: max stars, union parts, named robot wins', () => {
  const a = { stars: { A1: 3, A2: 1 }, parts: ['x'], robot: { ...emptyProgress().robot, name: { i: 0, n: 1 } } };
  const b = { stars: { A2: 2, B1: 1 }, parts: ['y'], robot: { ...emptyProgress().robot, name: null } };
  const m = mergeProgress(a, b);
  assert.deepEqual(m.stars, { A1: 3, A2: 2, B1: 1 });
  assert.deepEqual(m.parts.sort(), ['x', 'y']);
  assert.deepEqual(m.robot.name, { i: 0, n: 1 });
  assert.deepEqual(m.creations, []);
  const peg = { kind: 'peg', pts: [0, 0, 4, 0, 4, 4] };
  assert.deepEqual(mergeProgress({ ...a, creations: [peg] }, { ...b, creations: [] }).creations, [peg], 'local creations kept when remote has none');
  assert.deepEqual(mergeProgress(emptyProgress(), { ...b, creations: [peg] }).creations, [peg]);
  assert.equal(mergeProgress(a, null), a);
});

test('looks: a colour and a face per first clear, derived from stars; seen tracking', () => {
  for (const [k, ids] of Object.entries(LOOKS)) {
    assert.ok(ZONES.a.keys.includes(k) || ZONES.b.keys.includes(k) || k === 'boss', k);
    assert.deepEqual(ids.map(id => LOOK_INFO[id].slot), ['paint', 'face'], k);
  }
  assert.equal(LOOK_INFO[BASIC_PART.paint].slot, 'paint');
  assert.equal(LOOK_INFO[BASIC_PART.face].slot, 'face');
  const all = Object.values(LOOKS).flat();
  assert.equal(new Set(all).size, all.length, 'no look given twice');
  let r = recordResult(emptyProgress(), 'A1', 1);
  assert.deepEqual(r.looks, LOOKS.A1);
  assert.deepEqual(recordResult(r.progress, 'A1', 3).looks, [], 'only on the first clear');
  assert.ok(LOOKS.A1.every(id => ownedItems(r.progress).includes(id)));
  assert.ok(!ownedItems(r.progress).includes(LOOKS.A2[0]));
  assert.deepEqual(unseenItems(emptyProgress()), [], 'basics are never new');
  assert.deepEqual(unseenItems(r.progress).sort(), [PARTS.A1.id, ...LOOKS.A1].sort());
  const seen = markSeen(r.progress, [PARTS.A1.id, LOOKS.A1[0]]);
  assert.deepEqual(unseenItems(seen), [LOOKS.A1[1]]);
  assert.equal(r.progress.seen.length, 0, 'markSeen does not mutate');
  // a player from before looks existed: stars give the looks, and they show as new
  const legacy = { stars: { A1: 2 }, parts: [PARTS.A1.id], robot: { name: null }, creations: [] };
  assert.ok(ownedItems(legacy).includes('paint-red'));
  assert.ok(unseenItems(legacy).includes('face-happy'));
  assert.deepEqual(mergeProgress(seen, { ...legacy, seen: ['x'] }).seen.sort(), [...seen.seen, 'x'].sort());
  assert.equal(mergeProgress(emptyProgress(), legacy).robot.face, BASIC_PART.face, 'old robots get the basic face');
});

test('unlocks: zones by teacher, courses in order, rush and boss', () => {
  const p = emptyProgress();
  assert.ok(!isZoneOpen(p, 'a', { a: false, b: true }, false));
  assert.ok(isZoneOpen(p, 'a', {}, true), 'test mode');
  assert.ok(isCourseOpen(p, 'A1', { a: true }, false));
  assert.ok(!isCourseOpen(p, 'A2', { a: true }, false));
  assert.ok(isCourseOpen({ ...p, stars: { A1: 1 } }, 'A2', { a: true }, false));
  assert.ok(!isCourseOpen({ ...p, stars: { A1: 1 } }, 'A2', { a: false }, false));
  const aDone = { ...p, stars: allStars(ZONES.a.keys) };
  assert.ok(isZoneCleared(aDone, 'a') && !isZoneCleared(aDone, 'b'));
  assert.ok(isRushOpen(aDone, 'a', { a: true }, false));
  assert.ok(!isRushOpen(aDone, 'b', UNLOCK_BOTH, false));
  assert.ok(!isBossOpen(aDone, UNLOCK_BOTH, false));
  const both = { ...p, stars: allStars([...ZONES.a.keys, ...ZONES.b.keys]) };
  assert.ok(isBossOpen(both, UNLOCK_BOTH, false));
  assert.ok(!isBossOpen(both, { a: true, b: false }, false));
  assert.ok(isBossOpen(p, {}, true));
  assert.equal(nextCourse('A1'), 'A2');
  assert.equal(nextCourse('A4'), null);
  assert.equal(COURSES.length, 8);
});

test('robot names come from the preset list', () => {
  assert.equal(robotName({ i: 0, n: 7 }), `${ROBOT_NAMES[0].zh} 7`);
  assert.equal(robotName(null), '');
});

test('validateGalleryEntry', () => {
  const ok = {
    playerName: 'Chan Tai Man', hidden: false,
    robot: { ...emptyProgress().robot, name: { i: 1, n: 12 } },
    creations: [{ kind: 'peg', pts: [0, 0, 4, 0, 4, 4] }, { kind: 'tiles', placed: [{ p: 'tri', x: 0, y: 0, r: 3 }] }],
  };
  assert.ok(validateGalleryEntry(ok));
  assert.ok(validateGalleryEntry({ ...ok, robot: { ...ok.robot, name: null } }));
  const { face, ...noFace } = ok.robot;
  assert.ok(validateGalleryEntry({ ...ok, robot: noFace }), 'entries saved before faces');
  assert.ok(!validateGalleryEntry({ ...ok, robot: { ...ok.robot, face: 7 } }));
  assert.ok(!validateGalleryEntry({ ...ok, message: 'hi' }), 'no extra (free text) fields');
  assert.ok(!validateGalleryEntry({ ...ok, creations: Array(7).fill(ok.creations[0]) }));
  assert.ok(!validateGalleryEntry({ ...ok, creations: [{ kind: 'peg', pts: [0, 0, 9, 9] }] }), 'peg off the board');
  assert.ok(!validateGalleryEntry({ ...ok, creations: [{ kind: 'peg', pts: [0, 0, 1] }] }), 'odd number count');
  assert.ok(!validateGalleryEntry({ ...ok, creations: [{ kind: 'tiles', placed: [{ p: 'star', x: 0, y: 0, r: 0 }] }] }));
  assert.ok(!validateGalleryEntry({ ...ok, robot: { ...ok.robot, name: { i: 99, n: 1 } } }));
  assert.ok(!validateGalleryEntry({ ...ok, hidden: 'no' }));
});

test('shuffle keeps items and is repeatable with a seed', () => {
  assert.deepEqual(shuffle([1, 2, 3, 4], lcg(5)).sort(), [1, 2, 3, 4]);
  assert.deepEqual(shuffle([1, 2, 3, 4], lcg(5)), shuffle([1, 2, 3, 4], lcg(5)));
});
