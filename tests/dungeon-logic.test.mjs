import test from 'node:test';
import assert from 'node:assert/strict';
import {
  lcg, pick, shuffle, KINDS, REL, REL_ZH,
  relation, slotRelation, sentenceText, truthOf, sentencesFor,
  validateClue, checkAnswer, checkSolve, confusionOf,
  FLOORS, ROOMS, roomByKey, roomsOf, nextRoom, DEFAULT_LEVEL, levelFor, genRoom, genRush,
  hintStep, mistakesFor, starsFor, coinsPerAnswer, chestCoins, FLOOR_BONUS, FLOOR_LOOK, CHEST_LOOKS, floorMedal,
  SKINS, HAIR_STYLES, HAIR_COLOURS, TUNICS, SEXES, HERO_NAMES, heroName, SHOP, LATER_SLOTS, buy, equip,
  COSMETICS, COSMETIC_SLOTS, ownedCosmetics, validateGalleryEntry,
  OUTFITS, WEAPONS, SHOP_LOOKS, LOOKS, lookById, applyLook, SHOP_PRICE,
  emptyProgress, recordResult, mergeProgress,
  isFloorCleared, isFloorOpen, isRoomOpen, isRushOpen,
} from '../dungeon-logic.js';

const SEEDS = Array.from({ length: 50 }, (_, i) => i + 1);
const ALL_KEYS = ROOMS.map(r => r.key);
const starsAll = (keys, n = 1) => Object.fromEntries(keys.map(k => [k, n]));
/** Every position relation a clue relies on (waves have none). */
function relsOf(c) {
  if (c.kind === 'wave') return [];
  if (c.kind === 'make') return c.rels;
  if (c.kind === 'solve') return c.sentences.map(s => s.rel);
  if (c.kind === 'pick') return c.conds.map(d => d.rel);
  if (c.kind === 'judge') return [c.sentence.rel];
  return [c.rel];
}

const ROW = {
  layout: 'row', cols: 3, rows: 1,
  objects: [{ id: 'a', kind: 'shield', x: 0, y: 0 }, { id: 'b', kind: 'sword', x: 2, y: 0 }],
  slots: [{ x: 1, y: 0 }],
};

test('1 relation: row compares left/right only', () => {
  assert.equal(relation(ROW, 'left', 'a', 'b'), true);
  assert.equal(relation(ROW, 'right', 'a', 'b'), false);
  assert.equal(relation(ROW, 'above', 'a', 'b'), null);
});

test('2 relation: column compares above/below only; diagonals are null', () => {
  const col = { layout: 'column', cols: 1, rows: 3, objects: [{ id: 'a', kind: 'book', x: 0, y: 2 }, { id: 'b', kind: 'crate', x: 0, y: 0 }], slots: [] };
  assert.equal(relation(col, 'above', 'a', 'b'), true);
  assert.equal(relation(col, 'below', 'a', 'b'), false);
  assert.equal(relation(col, 'left', 'a', 'b'), null);
  const shelf = { layout: 'shelf', cols: 2, rows: 2, objects: [{ id: 'a', kind: 'book', x: 0, y: 1 }, { id: 'c', kind: 'gem', x: 1, y: 0 }], slots: [] };
  assert.equal(relation(shelf, 'above', 'a', 'c'), null);
  assert.equal(relation(shelf, 'below', 'c', 'a'), null);
});

test('3 relation: queue front/back follow the facing; turning round swaps', () => {
  const q = f => ({
    layout: 'queue', cols: 3, rows: 1, queueFacing: f, slots: [],
    objects: ['p', 'q', 'r'].map((id, x) => ({ id, kind: ['slimeGreen', 'slimePink', 'slimeBlue'][x], x, y: 0, facing: f })),
  });
  assert.equal(relation(q('right'), 'front', 'r', 'q'), true);
  assert.equal(relation(q('right'), 'back', 'p', 'q'), true);
  assert.equal(relation(q('right'), 'front', 'p', 'q'), false);
  assert.equal(relation(q('left'), 'front', 'p', 'q'), true);
  assert.equal(relation(q('left'), 'back', 'r', 'q'), true);
  assert.equal(relation(ROW, 'front', 'a', 'b'), null, 'front/back only in a queue');
});

test('4 relation: between is strict and needs one line', () => {
  const mk = ax => ({ layout: 'row', cols: 4, rows: 1, slots: [], objects: [
    { id: 'a', kind: 'shield', x: ax, y: 0 }, { id: 'b', kind: 'sword', x: 0, y: 0 }, { id: 'c', kind: 'bow', x: 2, y: 0 }] });
  assert.equal(relation(mk(1), 'between', 'a', 'b', 'c'), true);
  assert.equal(relation(mk(3), 'between', 'a', 'b', 'c'), false);
  const mixed = { layout: 'shelf', cols: 3, rows: 3, slots: [], objects: [
    { id: 'a', kind: 'shield', x: 1, y: 1 }, { id: 'b', kind: 'sword', x: 0, y: 1 }, { id: 'c', kind: 'bow', x: 1, y: 2 }] };
  assert.equal(relation(mixed, 'between', 'a', 'b', 'c'), null);
  const col = { layout: 'column', cols: 1, rows: 3, slots: [], objects: [
    { id: 'a', kind: 'shield', x: 0, y: 1 }, { id: 'b', kind: 'sword', x: 0, y: 0 }, { id: 'c', kind: 'bow', x: 0, y: 2 }] };
  assert.equal(relation(col, 'between', 'a', 'b', 'c'), true);
});

test('5 relation: absolute side needs an even number of columns', () => {
  const s = cols => ({ layout: 'pair', cols, rows: 1, slots: [], objects: [{ id: 'a', kind: 'torch', x: 0, y: 0 }, { id: 'b', kind: 'shield', x: cols - 1, y: 0 }] });
  assert.equal(relation(s(2), 'side', 'a', undefined, undefined, 'left'), true);
  assert.equal(relation(s(2), 'side', 'a', undefined, undefined, 'right'), false);
  assert.equal(relation(s(2), 'side', 'b', undefined, undefined, 'right'), true);
  assert.equal(relation(s(3), 'side', 'a', undefined, undefined, 'left'), null);
});

test('6 slotRelation: empty place between two objects', () => {
  const sc = { layout: 'row', cols: 3, rows: 1, slots: [{ x: 1, y: 0 }], objects: [{ id: 'b', kind: 'sword', x: 0, y: 0 }, { id: 'c', kind: 'bow', x: 2, y: 0 }] };
  assert.equal(slotRelation(sc, 'between', sc.slots[0], 'b', 'c'), true);
  assert.equal(slotRelation(sc, 'right', sc.slots[0], 'b'), true);
  assert.equal(slotRelation(sc, 'above', sc.slots[0], 'b'), null);
});

test('7 sentenceText: P1 sentence patterns', () => {
  const sc = { layout: 'row', cols: 4, rows: 1, slots: [], objects: [
    { id: 'a', kind: 'shield', x: 1, y: 0 }, { id: 'b', kind: 'sword', x: 2, y: 0 }, { id: 'c', kind: 'bow', x: 0, y: 0 }] };
  assert.equal(sentenceText(sc, { rel: 'left', a: 'a', b: 'b' }).zh, '盾在劍的左面');
  assert.equal(sentenceText(sc, { rel: 'between', a: 'a', b: 'b', c: 'c' }).zh, '盾在劍和弓之間');
  assert.equal(sentenceText(sc, { rel: 'side', a: 'a', side: 'left' }).zh, '盾在左面');
  assert.ok(sentenceText(sc, { rel: 'left', a: 'a', b: 'b' }).en.length > 0);
  assert.deepEqual(Object.keys(REL_ZH).sort(), ['above', 'back', 'below', 'front', 'left', 'right']);
  assert.ok(REL.includes('between') && REL.includes('side'));
});

test('8 sentencesFor: three sentences, exactly one true, all comparable', () => {
  const scenes = [
    { layout: 'row', cols: 5, rows: 1, slots: [], objects: [
      { id: 'a', kind: 'gem', x: 0, y: 0 }, { id: 'b', kind: 'book', x: 2, y: 0 }, { id: 'c', kind: 'key', x: 4, y: 0 }] },
    { layout: 'queue', cols: 4, rows: 1, queueFacing: 'left', slots: [], objects: [
      { id: 'a', kind: 'slimeGreen', x: 0, y: 0, facing: 'left' }, { id: 'b', kind: 'slimeBlue', x: 1, y: 0, facing: 'left' }, { id: 'c', kind: 'slimePink', x: 3, y: 0, facing: 'left' }] },
    { layout: 'column', cols: 1, rows: 3, slots: [], objects: [
      { id: 'a', kind: 'crate', x: 0, y: 0 }, { id: 'b', kind: 'barrel', x: 0, y: 1 }] },
  ];
  const rels = [['left', 'right', 'between'], ['front', 'back', 'between'], ['above', 'below', 'between']];
  for (const seed of Array.from({ length: 20 }, (_, i) => i + 1)) {
    scenes.forEach((sc, i) => {
      const ss = sentencesFor(sc, lcg(seed), rels[i]);
      assert.equal(ss.length, 3);
      const t = ss.map(s => truthOf(sc, s));
      assert.ok(t.every(v => v !== null), JSON.stringify(ss));
      assert.equal(t.filter(v => v === true).length, 1);
      assert.equal(new Set(ss.map(s => sentenceText(sc, s).zh)).size, 3, 'three different sentences');
    });
  }
});

test('9 genRoom: every room, level and seed gives valid clues that follow the spec', () => {
  const FLOOR_RELS = { 1: ['left', 'right', 'between', 'side'], 2: ['front', 'back', 'between'], 3: ['above', 'below', 'between'] };
  for (const key of ALL_KEYS) {
    const room = roomByKey(key);
    for (const level of [1, 2, 3]) {
      for (const seed of SEEDS) {
        const r = genRoom(key, lcg(seed), level);
        const where = `${key} L${level} seed ${seed}`;
        assert.equal(r.key, key);
        assert.equal(r.level, level);
        const cl = r.clues;
        for (const c of cl) {
          assert.equal(validateClue(c), true, where);
          assert.equal(c.level, level, where);
          assert.ok(c.ask && c.ask.zh && c.ask.en, where);
        }
        const kinds = cl.map(c => c.kind);
        const count = k => kinds.filter(x => x === k).length;
        if (room.wave) {
          assert.deepEqual(kinds, ['wave', 'wave', 'wave'], where);
          assert.deepEqual(cl.map(c => c.monsters.length), [4, 6, 8], where);
          const sides = room.floor === 1 ? ['left', 'right'] : ['up', 'down'];
          for (const c of cl) assert.ok(c.monsters.every(m => sides.includes(m.side)), where);
          continue;
        }
        if (key === 'F4R5') {
          assert.deepEqual(kinds, ['pick', 'pick', 'pick'], where);
          for (const c of cl) { assert.equal(c.conds.length, 2, where); assert.equal(c.answers.length, 1, where); }
          continue;
        }
        if (key === 'F4R2') assert.deepEqual(kinds, ['solve', 'solve'], where); // spec §2: two bigger puzzles
        else assert.ok(cl.length >= 4 && cl.length <= 5, `${where}: ${cl.length} clues`);
        if (room.idx === 4) { assert.equal(count('judge'), 3, where); assert.equal(count('select'), 2, where); }
        if (room.idx === 1 && room.floor > 1) {
          assert.equal(cl.length, 5, where);
          assert.ok(cl[0].review && cl[1].review, where);
          assert.ok(cl.slice(2).every(c => !c.review), where);
        } else assert.ok(cl.every(c => !c.review), where);
        if (FLOOR_RELS[room.floor]) {
          for (const c of cl.filter(c => !c.review)) for (const rel of relsOf(c)) assert.ok(FLOOR_RELS[room.floor].includes(rel), `${where}: ${rel}`);
        }
        for (const c of cl.filter(c => c.kind === 'go' || c.kind === 'place')) {
          if (level === 1) assert.ok(c.scene.slots.length >= 5, `${where}: ${c.scene.slots.length} slots`);
          if (level === 2) assert.ok(c.scene.slots.length >= 3 && c.scene.slots.length <= 4, `${where}: ${c.scene.slots.length} slots`);
          if (level === 3) assert.ok(c.scene.slots.length <= 3, `${where}: ${c.scene.slots.length} slots`);
        }
      }
    }
  }
  // spec §2 room shapes at the default level
  const kindsOf = key => genRoom(key, lcg(9)).clues.map(c => c.kind);
  assert.deepEqual(kindsOf('F1R1'), ['choose', 'choose', 'choose', 'choose']);
  assert.deepEqual(kindsOf('F1R2'), ['go', 'go', 'go', 'go']);
  assert.deepEqual(kindsOf('F1R3'), ['place', 'place', 'place', 'place']);
  assert.deepEqual(kindsOf('F1R5'), ['make', 'make', 'go', 'go']);
  assert.deepEqual(kindsOf('F2R1').slice(2), ['choose', 'choose', 'choose']);
  assert.deepEqual(kindsOf('F4R2'), ['solve', 'solve']);
  assert.deepEqual(kindsOf('F4R3'), ['go', 'go', 'go', 'go']);
  assert.ok(genRoom('F1R5', lcg(3)).clues.slice(2).every(c => c.rel === 'between'));
  assert.equal(genRoom('F1R1', lcg(3)).level, DEFAULT_LEVEL.F1R1);
  // turn round: clues 3–4 of F2R3 face the other way
  const t = genRoom('F2R3', lcg(4)).clues;
  assert.notEqual(t[0].scene.queueFacing, t[2].scene.queueFacing);
  assert.equal(t[2].turned, true);
  // deterministic
  assert.deepEqual(genRoom('F3R3', lcg(5)), genRoom('F3R3', lcg(5)));
});

test('10 checkAnswer for each clue kind', () => {
  const choose = genRoom('F1R1', lcg(2)).clues[0];
  assert.equal(checkAnswer(choose, choose.answer), true);
  assert.equal(checkAnswer(choose, choose.choices.find(c => c !== choose.answer)), false);

  const go = genRoom('F1R2', lcg(2), 1).clues[0];
  for (const i of go.answers) assert.equal(checkAnswer(go, i), true);
  const wrongSlot = go.scene.slots.findIndex((_, i) => !go.answers.includes(i));
  assert.equal(checkAnswer(go, wrongSlot), false);

  const place = genRoom('F1R3', lcg(2)).clues[0];
  assert.equal(checkAnswer(place, place.answers[0]), true);

  const room4 = genRoom('F1R4', lcg(2)).clues;
  const judge = room4.find(c => c.kind === 'judge');
  assert.equal(checkAnswer(judge, judge.answer), true);
  assert.equal(checkAnswer(judge, !judge.answer), false);
  assert.ok(judge.sentence.zh, 'judge carries the owl sentence text');

  const sel = room4.find(c => c.kind === 'select');
  assert.equal(checkAnswer(sel, sel.answers.slice().reverse()), true, 'order free');
  if (sel.answers.length > 1) assert.equal(checkAnswer(sel, sel.answers.slice(1)), false, 'missing one');
  const extra = sel.scene.objects.map(o => o.id).find(id => !sel.answers.includes(id) && id !== sel.b);
  assert.equal(checkAnswer(sel, sel.answers.concat(extra)), false, 'extra one');

  const pk = genRoom('F4R5', lcg(2)).clues[0];
  assert.equal(checkAnswer(pk, pk.answers[0]), true);
  assert.equal(checkAnswer(pk, pk.candidates.find(id => id !== pk.answers[0])), false);

  const wave = genRoom('F1R6', lcg(2)).clues[0];
  const m0 = wave.monsters[0];
  assert.equal(checkAnswer(wave, { i: 0, side: m0.side }), true);
  assert.equal(checkAnswer(wave, { i: 0, side: m0.side === 'left' ? 'right' : 'left' }), false);
  assert.equal(checkAnswer(wave, wave.monsters.map(m => m.side)), true);
  assert.deepEqual(confusionOf(wave, { i: 0, side: m0.side === 'left' ? 'right' : 'left' }), { want: m0.side, picked: m0.side === 'left' ? 'right' : 'left' });

  const ch2 = genRoom('F2R1', lcg(2)).clues[2];
  const bad = ch2.choices.find(c => c !== ch2.answer);
  assert.deepEqual(confusionOf(ch2, bad), { want: ch2.answer, picked: bad });

  const mk = genRoom('F1R5', lcg(2)).clues[0];
  const arranged = { ...mk.scene, objects: mk.items.map((k, i) => ({ id: k, kind: k, x: mk.scene.slots[i].x, y: mk.scene.slots[i].y })) };
  const ss = sentencesFor(arranged, lcg(1), mk.rels);
  const good = ss.find(s => truthOf(arranged, s));
  assert.equal(checkAnswer(mk, { scene: arranged, sentence: good }), true);
  assert.equal(checkAnswer(mk, { scene: arranged, sentence: ss.find(s => s !== good) }), false);
});

test('11 checkSolve: the shelf puzzle', () => {
  for (const seed of SEEDS.slice(0, 10)) {
    for (const c of genRoom('F4R2', lcg(seed)).clues) {
      assert.equal(checkSolve(c, c.answer), true);
      assert.equal(checkAnswer(c, c.answer), true);
      const [k1, k2] = c.items;
      const swapped = { ...c.answer, [k1]: c.answer[k2], [k2]: c.answer[k1] };
      assert.equal(checkSolve(c, swapped), false, 'swap fails (the answer is unique)');
      const missing = { ...c.answer }; delete missing[k1];
      assert.equal(checkSolve(c, missing), false);
      assert.ok(c.sentences.length >= 2 && c.sentences.length <= 3);
      assert.ok(c.sentences.every(s => s.zh));
    }
  }
});

test('12 levelFor: default, adaptive keep-support rule', () => {
  assert.equal(levelFor('F1R1'), 3);
  assert.equal(levelFor('F1R3'), 2);
  assert.equal(levelFor('F1R5'), 1);
  assert.equal(levelFor('F4R1'), 2);
  assert.equal(levelFor('F4R2'), 1);
  assert.equal(levelFor('F1R3', 3, 3), 3);
  assert.equal(levelFor('F1R3', 2, 3), 2);
  assert.equal(levelFor('F1R3', 5, 1), 2, 'never less support than the default');
  assert.equal(DEFAULT_LEVEL.F1R6, 1);
  assert.equal(DEFAULT_LEVEL.F2R4, 2);
});

test('13 hint ladder, mistakes and stars', () => {
  assert.deepEqual([0, 1, 2, 3, 4].map(hintStep), [0, 1, 2, 3, 3]);
  assert.equal(mistakesFor(2, false), 2);
  assert.equal(mistakesFor(2, true), 3);
  assert.equal(mistakesFor(0, false), 0);
  assert.deepEqual([0, 1, 2, 3, 9].map(starsFor), [3, 2, 2, 1, 1]);
});

test('14 coins: continuous in R1/R2/waves, chest in R3–R5 and floor 4', () => {
  assert.equal(coinsPerAnswer('F1R1'), 1);
  assert.equal(coinsPerAnswer('F2R2'), 1);
  assert.equal(coinsPerAnswer('F1R3'), 0);
  assert.equal(coinsPerAnswer('F1R6'), 1);
  assert.equal(chestCoins('F1R3', 3), 11);
  assert.equal(chestCoins('F2R5', 1), 7);
  assert.equal(chestCoins('F4R2', 2), 9);
  assert.equal(chestCoins('F1R1', 3), 0);
  assert.equal(chestCoins('F1R6', 3), 0);
  assert.equal(FLOOR_BONUS, 10);
});

test('15 recordResult: best stars, coins, floor bonus and look once', () => {
  let p = emptyProgress();
  let r = recordResult(p, 'F1R1', 2, 4);
  assert.equal(r.newBest, true);
  assert.equal(r.progress.coins, 4);
  assert.equal(p.coins, 0, 'pure');
  r = recordResult(r.progress, 'F1R1', 1, 3);
  assert.equal(r.newBest, false);
  assert.equal(r.progress.stars.F1R1, 2);
  assert.equal(r.progress.coins, 7);
  p = { ...emptyProgress(), stars: starsAll(roomsOf(1).filter(k => k !== 'F1R6')) };
  r = recordResult(p, 'F1R6', 3, 8);
  assert.equal(r.floorCleared, 1);
  assert.equal(r.bonus, 10);
  assert.equal(r.progress.coins, 18);
  assert.ok(r.progress.looks.includes(FLOOR_LOOK[1]));
  assert.equal(FLOOR_LOOK[1], 'helmetHorned');
  const again = recordResult(r.progress, 'F1R6', 3, 0);
  assert.equal(again.floorCleared, null);
  assert.equal(again.bonus, 0);
  assert.equal(again.progress.coins, 18);
  assert.equal(again.progress.looks.filter(l => l === 'helmetHorned').length, 1);
  p = { ...emptyProgress(), stars: starsAll(roomsOf(4).filter(k => k !== 'F4R5')) };
  r = recordResult(p, 'F4R5', 1, 0);
  assert.ok(r.progress.looks.includes('petDragon'));
  assert.equal(r.floorCleared, 4);
  assert.equal(floorMedal(r.progress, 4), 'bronze');
  assert.equal(floorMedal({ stars: starsAll(roomsOf(1), 3) }, 1), 'gold');
  assert.equal(floorMedal({ stars: { ...starsAll(roomsOf(1), 2), F1R1: 3 } }, 1), 'silver');
  assert.equal(floorMedal(emptyProgress(), 1), null);
});

test('16 shop: buy and equip', () => {
  assert.equal(SHOP.filter(s => s.slot === 'helmet' && s.price !== null).length, 5);
  assert.equal(SHOP.filter(s => s.slot === 'pet' && s.price !== null).length, 4);
  assert.ok(SHOP.every(s => s.price === null || (s.price >= 10 && s.price <= 30)));
  assert.deepEqual(LATER_SLOTS, ['cape', 'badge', 'trail']);
  const helm = SHOP.find(s => s.slot === 'helmet');
  let p = { ...emptyProgress(), coins: helm.price - 1 };
  assert.deepEqual(buy(p, helm.id), { ok: false, progress: p, reason: 'price' });
  p = { ...p, coins: helm.price + 5 };
  const r = buy(p, helm.id);
  assert.equal(r.ok, true);
  assert.equal(r.progress.coins, 5);
  assert.ok(r.progress.looks.includes(helm.id));
  assert.equal(buy({ ...r.progress, coins: 99 }, helm.id).reason, 'owned');
  assert.equal(buy({ ...p, coins: 999 }, 'petDragon').reason, 'notForSale');
  const eq = equip(r.progress, 'helmet', helm.id);
  assert.equal(eq.equipped.helmet, helm.id);
  assert.equal(equip(eq, 'helmet', null).equipped.helmet, null);
  const pet = SHOP.find(s => s.slot === 'pet' && s.price !== null);
  assert.deepEqual(equip(eq, 'pet', pet.id), eq, 'not owned → unchanged');
  assert.deepEqual(equip(eq, 'pet', helm.id), eq, 'wrong slot → unchanged');
  // hero bits
  assert.equal(SKINS.length, 6); assert.equal(HAIR_STYLES.length, 5); assert.equal(HAIR_COLOURS.length, 6); assert.equal(TUNICS.length, 8);
  assert.ok(HERO_NAMES.length >= 12);
  assert.equal(heroName({ name: { i: 0, n: 3 } }), `${HERO_NAMES[0].zh} 3`);
  assert.equal(heroName(null), '');
});

test('17 mergeProgress', () => {
  const a = { ...emptyProgress(), stars: { F1R1: 3, F1R2: 1 }, coins: 20, looks: ['helmetPlain'], floorBonus: [1] };
  const b = { ...emptyProgress(), stars: { F1R1: 2, F1R2: 2, F1R3: 1 }, coins: 12, looks: ['petCat'], hero: { skin: SKINS[0] } };
  const m = mergeProgress(a, b);
  assert.deepEqual(m.stars, { F1R1: 3, F1R2: 2, F1R3: 1 });
  assert.equal(m.coins, 20);
  assert.deepEqual(m.looks.sort(), ['helmetPlain', 'petCat']);
  assert.deepEqual(m.floorBonus, [1]);
  assert.deepEqual(m.hero, { skin: SKINS[0] });
  assert.equal(mergeProgress(a, null), a);
});

test('18 unlocks', () => {
  const none = { f1: false, f2: false, f3: false, f4: false };
  const all = { f1: true, f2: true, f3: true, f4: true };
  const p0 = emptyProgress();
  assert.equal(isFloorOpen(p0, 1, none, false), false);
  assert.equal(isFloorOpen(p0, 1, all, false), true);
  assert.equal(isFloorOpen(p0, 4, none, true), true, 'test mode');
  assert.equal(isRoomOpen(p0, 'F3R5', none, true), true);
  assert.equal(isRushOpen(p0, none, true), true);
  assert.equal(isRoomOpen(p0, 'F1R1', all, false), true);
  assert.equal(isRoomOpen(p0, 'F1R2', all, false), false);
  assert.equal(isRoomOpen({ ...p0, stars: { F1R1: 1 } }, 'F1R2', all, false), true);
  assert.equal(isFloorOpen(p0, 2, all, false), false);
  const f1done = { ...p0, stars: starsAll(roomsOf(1)) };
  assert.equal(isFloorCleared(f1done, 1), true);
  assert.equal(isFloorOpen(f1done, 2, all, false), true);
  assert.equal(isFloorOpen(f1done, 2, { ...all, f2: false }, false), false);
  assert.equal(isRoomOpen(f1done, 'F2R1', all, false), true);
  assert.equal(isRushOpen(f1done, all, false), false);
  const everything = { ...p0, stars: starsAll(ALL_KEYS) };
  assert.equal(isRushOpen(everything, all, false), true);
  assert.equal(isRushOpen(everything, { ...all, f4: false }, false), false);
  // room list
  assert.deepEqual(FLOORS, [1, 2, 3, 4]);
  assert.deepEqual(roomsOf(1), ['F1R1', 'F1R2', 'F1R3', 'F1R4', 'F1R5', 'F1R6']);
  assert.equal(roomsOf(2).length, 5); assert.equal(roomsOf(3).length, 6); assert.equal(roomsOf(4).length, 5);
  assert.equal(nextRoom('F1R1'), 'F1R2');
  assert.equal(nextRoom('F4R5'), null);
  assert.equal(roomByKey('F1R1').zh, '火把走廊');
  assert.ok(roomByKey('F3R6').wave);
});

test('19 genRush: waves lr → ud → mixed with a between pick clue in between', () => {
  const g = genRush(lcg(1));
  const cl = Array.from({ length: 30 }, () => g.next());
  for (const c of cl) assert.equal(validateClue(c), true);
  assert.equal(cl[0].kind, 'wave');
  assert.equal(cl[0].mode, 'lr');
  assert.ok(cl[0].monsters.every(m => m.side === 'left' || m.side === 'right'));
  assert.equal(cl[1].kind, 'pick');
  assert.equal(cl[1].rel, 'between');
  assert.equal(cl[1].answers.length, 1);
  const waves = cl.filter(c => c.kind === 'wave');
  assert.deepEqual(waves.slice(0, 3).map(w => w.mode), ['lr', 'ud', 'mix']);
  assert.ok(waves[3].monsters.length > waves[0].monsters.length, 'waves grow');
  for (let i = 1; i < cl.length; i++) assert.ok(!(cl[i].kind === 'wave' && cl[i - 1].kind === 'wave'), 'a pick between waves');
  const again = genRush(lcg(1));
  assert.deepEqual(again.next(), cl[0], 'deterministic');
});

test('20 KINDS: art keys and kinds used by the generators', () => {
  for (const [k, v] of Object.entries(KINDS)) {
    assert.ok(typeof v.art === 'string' && v.art.length > 0, k);
    assert.ok(v.zh && v.en, k);
  }
  const used = new Set();
  for (const key of ALL_KEYS) for (const level of [1, 2, 3]) for (const seed of SEEDS.slice(0, 10)) {
    for (const c of genRoom(key, lcg(seed), level).clues) {
      if (c.scene) for (const o of c.scene.objects) used.add(o.kind);
      if (c.item) used.add(c.item);
      for (const k of c.items || []) used.add(k);
    }
  }
  for (const k of used) assert.ok(KINDS[k], k);
  // rng helpers
  const r = lcg(3);
  assert.ok([1, 2, 3].includes(pick([1, 2, 3], r)));
  assert.deepEqual(shuffle([1, 2, 3, 4], lcg(1)).sort(), [1, 2, 3, 4]);
});

test('21 chest costume pieces: fixed rooms, first clear only, not for sale', () => {
  assert.deepEqual(Object.keys(CHEST_LOOKS), ['F1R3', 'F1R5', 'F2R3', 'F2R5', 'F3R3', 'F3R5', 'F4R3']);
  for (const [key, id] of Object.entries(CHEST_LOOKS)) {
    assert.ok(chestCoins(key, 1) > 0, key + ' has an end chest');
    const item = SHOP.find(s => s.id === id);
    assert.ok(item, id + ' in SHOP');
    assert.equal(item.price, null);
    assert.equal(item.earnedBy, 'chest');
    assert.ok(['helmet', 'pet'].includes(item.slot));
    assert.equal(buy({ ...emptyProgress(), coins: 999 }, id).reason, 'notForSale');
  }
  let r = recordResult(emptyProgress(), 'F1R3', 1, 7);
  assert.equal(r.chestLook, 'helmetCap');
  assert.ok(r.progress.looks.includes('helmetCap'));
  const again = recordResult(r.progress, 'F1R3', 3, 11);
  assert.equal(again.chestLook, null, 'replay gives coins only');
  assert.equal(again.progress.looks.filter(l => l === 'helmetCap').length, 1);
  assert.equal(recordResult(emptyProgress(), 'F1R4', 3, 11).chestLook, null);
  const worn = equip(r.progress, 'helmet', 'helmetCap');
  assert.equal(worn.equipped.helmet, 'helmetCap');
});

test('make prompt names what the child arranges (slimes / boxes / treasures)', () => {
  const BOXES = new Set(['crate', 'chestStar', 'chestMoon', 'chestHeart', 'chestSun']);
  for (const seed of [1, 2, 3, 7, 11]) {
    for (const [key, word] of [['F1R5', '寶物'], ['F2R5', '史萊姆'], ['F3R5', '箱']]) {
      for (const level of [1, 2, 3]) {
        const makes = genRoom(key, lcg(seed), level).clues.filter(c => c.kind === 'make');
        assert.ok(makes.length > 0, key);
        for (const c of makes) {
          assert.ok(c.ask.zh.includes(word), `${key}: ${c.ask.zh}`);
          if (key !== 'F1R5') assert.ok(!c.ask.zh.includes('寶物'), `${key}: ${c.ask.zh}`);
          if (key === 'F3R5') assert.ok(c.items.every(k => BOXES.has(k)), `${key} items ${c.items}`);
          if (key === 'F2R5') assert.ok(/slime/i.test(c.ask.en), c.ask.en);
        }
      }
    }
  }
});

test('cosmetics: buy then wear adds a swatch; only owned items of the right slot work', () => {
  assert.deepEqual(SEXES, ['boy', 'girl']);
  assert.deepEqual(COSMETIC_SLOTS, ['skin', 'hairColour', 'tunic']);
  assert.ok(COSMETICS.length >= 9 && COSMETICS.every(c => c.price > 0 && /^#[0-9a-f]{6}$/i.test(c.colour)));
  const hero = { sex: 'boy', skin: SKINS[1], hairStyle: 'short', hairColour: HAIR_COLOURS[1], tunic: TUNICS[4] };
  const p0 = { ...emptyProgress(), hero };
  const item = COSMETICS.find(c => c.slot === 'skin');
  assert.equal(buy(p0, item.id).reason, 'price', 'too few coins');
  const p1 = { ...p0, coins: 100 };
  const b = buy(p1, item.id);
  assert.equal(b.ok, true);
  assert.equal(b.progress.coins, 100 - item.price);
  assert.ok(b.progress.looks.includes(item.id));
  assert.equal(buy(b.progress, item.id).reason, 'owned');
  const w = equip(b.progress, item.slot, item.id);
  assert.equal(w.hero.skin, item.colour);
  assert.equal(w.equipped.skin, undefined, 'cosmetics never touch the equipped slots');
  const other = COSMETICS.find(c => c.slot === 'tunic');
  assert.equal(equip(b.progress, 'skin', other.id), b.progress, 'wrong slot ignored');
  assert.equal(equip(p0, item.slot, item.id), p0, 'unowned ignored');
  assert.deepEqual(ownedCosmetics(b.progress, 'skin').map(c => c.id), [item.id], 'only the bought one is offered');
  assert.deepEqual(ownedCosmetics(emptyProgress(), 'skin'), []);
});

test('gallery entry validation accepts the real look and rejects junk', () => {
  const look = { playerName: '勇勇 3', hero: { sex: 'girl', skin: '#ffe0c4', hairStyle: 'long', hairColour: '#2b2118', tunic: '#d94c4c', name: { i: 0, n: 3 } }, equipped: { helmet: 'helmetCrown', pet: 'petCat' }, hidden: false };
  assert.equal(validateGalleryEntry(look), true);
  assert.equal(validateGalleryEntry({ playerName: 'x', hero: { skin: 1 } }), true, 'minimal look is fine');
  assert.equal(validateGalleryEntry(null), false);
  assert.equal(validateGalleryEntry({ playerName: 'x', hero: null }), false);
  assert.equal(validateGalleryEntry({ hero: {} }), false, 'a name is required');
  assert.equal(validateGalleryEntry({ playerName: 'x'.repeat(41), hero: {} }), false);
  assert.equal(validateGalleryEntry({ playerName: 'x', hero: { sex: 'cat' } }), false);
  assert.equal(validateGalleryEntry({ playerName: 'x', hero: { tunic: 'blue' } }), false, 'not a hex colour');
  assert.equal(validateGalleryEntry({ playerName: 'x', hero: { hairStyle: 3 } }), false, 'style is a string id');
  assert.equal(validateGalleryEntry({ playerName: 'x', hero: {}, equipped: { helmet: 'petCat' } }), false, 'id must match the slot');
  assert.equal(validateGalleryEntry({ playerName: 'x', hero: {}, hidden: 'no' }), false);
});

test('outfits and weapons: free ones wearable, paid ones need buying, null weapon = empty hands', () => {
  const p = { ...emptyProgress(), hero: { sex: 'boy', skin: SKINS[1], hairStyle: 'short', hairColour: HAIR_COLOURS[1], tunic: TUNICS[4] } };
  assert.ok(OUTFITS.length >= 3 && WEAPONS.length >= 3);
  const freeO = OUTFITS.find(o => o.price == null), paidO = OUTFITS.find(o => o.price != null);
  assert.equal(equip(p, 'outfit', freeO.id).equipped.outfit, freeO.id, 'a free outfit needs no purchase');
  assert.equal(equip(p, 'outfit', paidO.id), p, 'a paid outfit is rejected until bought');
  const bought = buy({ ...p, coins: 100 }, paidO.id);
  assert.equal(bought.ok, true);
  assert.equal(equip(bought.progress, 'outfit', paidO.id).equipped.outfit, paidO.id);
  const freeW = WEAPONS.find(w => w.price == null), paidW = WEAPONS.find(w => w.price != null);
  assert.equal(equip(p, 'weapon', freeW.id).equipped.weapon, freeW.id);
  assert.equal(equip(p, 'weapon', null).equipped.weapon, null, 'empty hands');
  assert.equal(equip(p, 'weapon', paidW.id), p, 'a paid weapon is rejected until bought');
  assert.ok(SHOP_LOOKS.some(i => i.slot === 'outfit') && SHOP_LOOKS.some(i => i.slot === 'weapon') && SHOP_LOOKS.some(i => i.slot === 'tunic'));
});

test('shop is flat-priced and richer (more colours, weapons, preset looks)', () => {
  const paid = [...SHOP, ...COSMETICS, ...OUTFITS, ...WEAPONS, ...LOOKS].filter(i => i.price != null);
  assert.ok(paid.length > 0 && paid.every(i => i.price === SHOP_PRICE), 'every paid item is the flat price');
  assert.ok(COSMETICS.filter(c => c.slot === 'skin').length >= 5, 'skins');
  assert.ok(COSMETICS.filter(c => c.slot === 'hairColour').length >= 8, 'hair colours');
  assert.ok(COSMETICS.filter(c => c.slot === 'tunic').length >= 10, 'cloth colours');
  assert.ok(WEAPONS.some(w => w.id === 'mace') && WEAPONS.some(w => w.id === 'bow'), 'new weapons');
  assert.ok(LOOKS.length >= 8 && LOOKS.every(l => l.slot === 'look' && l.hero && l.equipped), 'preset looks');
  assert.ok(SHOP_LOOKS.some(i => i.slot === 'look'), 'the shop sells the looks');
});

test('套裝 preset looks: applying needs ownership and sets the whole hero in one go', () => {
  const base = { ...emptyProgress(), hero: { sex: 'boy', skin: '#ffe0c4', hairStyle: 'short', hairColour: '#2b2118', tunic: '#d94c4c' } };
  const look = LOOKS.find(l => l.hero.sex === 'girl');
  assert.equal(equip(base, 'look', look.id), base, 'not owned → refused');
  assert.equal(applyLook(base, look.id), base, 'applyLook needs ownership too');
  const bought = buy({ ...base, coins: SHOP_PRICE }, look.id);
  assert.equal(bought.ok, true);
  const p = equip(bought.progress, 'look', look.id);
  assert.equal(p.hero.sex, look.hero.sex);
  assert.equal(p.hero.hairColour, look.hero.hairColour);
  assert.equal(p.hero.tunic, look.hero.tunic);
  assert.equal(p.equipped.outfit, look.equipped.outfit);
  assert.equal(p.equipped.weapon, look.equipped.weapon);
  assert.equal(lookById(look.id).id, look.id);
  assert.equal(lookById('nope'), null);
});
