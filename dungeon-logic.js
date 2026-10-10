// Treasure Dungeon 尋寶地下城 rules (P1 1S3 上下左右前後之間). Pure: no imports, no DOM, no Phaser.
// Unit tested in tests/dungeon-logic.test.mjs. Every answer is decided here; scenes only animate it.
//
// Coordinates: a Scene is a small grid. x grows to the screen's right (0 = leftmost), y grows UPWARD
// (0 = floor). Queues are one row of creatures on the floor sharing `queueFacing`.
//   Scene = { layout: 'pair'|'row'|'queue'|'column'|'shelf', cols, rows,
//             objects: [{ id, kind, x, y, facing? }], slots: [{ x, y }], queueFacing? }

// ======================================================================
// rng
// ======================================================================

/** Seeded generator for tests and repeatable rounds (?seed=). Returns () => [0,1). */
export function lcg(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
/** One random element of arr. */
export const pick = (arr, rng = Math.random) => arr[Math.floor(rng() * arr.length)];
/** Shuffled copy of arr (Fisher–Yates). */
export function shuffle(arr, rng = Math.random) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
const randInt = (lo, hi, rng) => lo + Math.floor(rng() * (hi - lo + 1)); // inclusive

// ======================================================================
// catalogue
// ======================================================================

/** Every thing that can stand in a scene or be named in a clue. `art` is the frame key T3 maps. */
export const KINDS = {
  torch:       { zh: '火把',       en: 'torch',        art: 'torch' },
  shield:      { zh: '盾',         en: 'shield',       art: 'shield' },
  sword:       { zh: '劍',         en: 'sword',        art: 'sword' },
  bow:         { zh: '弓',         en: 'bow',          art: 'bow' },
  axe:         { zh: '斧',         en: 'axe',          art: 'axe' },
  helmet:      { zh: '頭盔',       en: 'helmet',       art: 'helmet' },
  potionRed:   { zh: '紅藥水',     en: 'red potion',   art: 'potion.red' },
  potionBlue:  { zh: '藍藥水',     en: 'blue potion',  art: 'potion.blue' },
  potionGreen: { zh: '綠藥水',     en: 'green potion', art: 'potion.green' },
  book:        { zh: '書',         en: 'book',         art: 'book' },
  key:         { zh: '鑰匙',       en: 'key',          art: 'key' },
  chestStar:   { zh: '星星寶箱',   en: 'star chest',   art: 'chest.star' },
  chestMoon:   { zh: '月亮寶箱',   en: 'moon chest',   art: 'chest.moon' },
  chestHeart:  { zh: '心心寶箱',   en: 'heart chest',  art: 'chest.heart' },
  chestSun:    { zh: '太陽寶箱',   en: 'sun chest',    art: 'chest.sun' },
  crate:       { zh: '木箱',       en: 'crate',        art: 'crate' },
  barrel:      { zh: '木桶',       en: 'barrel',       art: 'barrel' },
  gem:         { zh: '寶石',       en: 'gem',          art: 'gem' },
  slimeGreen:  { zh: '綠史萊姆',   en: 'green slime',  art: 'slime.green' },
  slimePink:   { zh: '粉紅史萊姆', en: 'pink slime',   art: 'slime.pink' },
  slimeBlue:   { zh: '藍史萊姆',   en: 'blue slime',   art: 'slime.blue' },
  slimeYellow: { zh: '黃史萊姆',   en: 'yellow slime', art: 'slime.yellow' },
  bat:         { zh: '蝙蝠',       en: 'bat',          art: 'bat' },
  owl:         { zh: '貓頭鷹',     en: 'owl',          art: 'owl' },
  hero:        { zh: '小騎士',     en: 'knight',       art: 'hero' },
};

export const REL = ['left', 'right', 'above', 'below', 'front', 'back', 'between', 'side'];
export const REL_ZH = { left: '左面', right: '右面', above: '上面', below: '下面', front: '前面', back: '後面' };
const REL_EN = { left: 'left of', right: 'right of', above: 'above', below: 'below', front: 'in front of', back: 'behind' };
const OPPOSITE = { left: 'right', right: 'left', above: 'below', below: 'above', front: 'back', back: 'front' };
/** Relation families: the pair a choose clue offers, and the floor that teaches it. */
const FAM = { lr: ['left', 'right'], fb: ['front', 'back'], ud: ['above', 'below'] };
const FAMILY_OF_FLOOR = { 1: 'lr', 2: 'fb', 3: 'ud' };

// Object pools (kinds) per use. Answer candidates differ by kind/mark only, never by a clue colour.
const SLIMES = ['slimeGreen', 'slimePink', 'slimeBlue', 'slimeYellow'];
const CHESTS = ['chestStar', 'chestMoon', 'chestHeart', 'chestSun'];
const WEAPONS = ['shield', 'sword', 'bow', 'axe', 'helmet'];
const WALL = ['torch', 'shield', 'sword', 'bow', 'axe', 'helmet'];
const ROW_STUFF = [...CHESTS, 'crate', 'barrel'];
const JUDGE_ROW = [...CHESTS, 'torch', 'crate', 'barrel'];
const TREASURES = ['gem', 'book', 'key', 'potionRed', 'potionBlue', 'potionGreen', 'helmet'];
const SHELF_STUFF = ['potionRed', 'potionBlue', 'potionGreen', 'book', 'helmet', 'gem', 'key'];
const TOWER = ['crate', 'barrel', ...CHESTS, 'book'];
const BOXES = ['crate', ...CHESTS]; // 'make' towers stack boxes only, so the prompt can say 箱子
const COLUMN_STUFF = ['bat', 'owl', 'crate', 'barrel', 'book', 'helmet', ...CHESTS];
const BOSS_REFS = ['shield', 'sword', 'bow', 'axe', 'torch', 'book', 'helmet'];
const POOLS = { lr: ROW_STUFF, fb: SLIMES, ud: SHELF_STUFF };

// ======================================================================
// relations
// ======================================================================

const objById = (scene, id) => (id == null ? null : scene.objects.find(o => o.id === id) || null);
const same = (p, q) => p.x === q.x && p.y === q.y;

/** Core rule on positions. Returns true/false, or null when the spec says the things are not comparable. */
function relAt(scene, rel, a, b, c, side) {
  if (!a) return null;
  if (rel === 'side') {
    if (scene.cols % 2 !== 0 || (side !== 'left' && side !== 'right')) return null;
    return side === 'left' ? a.x < scene.cols / 2 : a.x >= scene.cols / 2;
  }
  if (!b || same(a, b)) return null;
  switch (rel) {
    case 'left': case 'right':
      if (a.y !== b.y) return null;
      return rel === 'left' ? a.x < b.x : a.x > b.x;
    case 'above': case 'below':
      if (a.x !== b.x) return null;
      return rel === 'above' ? a.y > b.y : a.y < b.y;
    case 'front': case 'back': {
      if (scene.layout !== 'queue' || a.y !== 0 || b.y !== 0) return null;
      const f = scene.queueFacing;
      if (f !== 'left' && f !== 'right') return null;
      const inFront = f === 'right' ? a.x > b.x : a.x < b.x;
      return rel === 'front' ? inFront : !inFront;
    }
    case 'between': {
      if (!c || same(a, c) || same(b, c)) return null;
      if (a.y === b.y && b.y === c.y) return Math.min(b.x, c.x) < a.x && a.x < Math.max(b.x, c.x);
      if (a.x === b.x && b.x === c.x) return Math.min(b.y, c.y) < a.y && a.y < Math.max(b.y, c.y);
      return null;
    }
    default: return null;
  }
}

/**
 * Is object aId in relation `rel` to bId (and cId for 'between')?
 * left/right: same y; above/below: same x; front/back: both in the queue (uses scene.queueFacing);
 * between: all three on one row, one column or the queue, a strictly between b and c;
 * side: absolute half, needs an even scene.cols ('left' = x < cols/2), b and c unused, `side` = 'left'|'right'.
 * @returns {true|false|null} null when not comparable (or an id is unknown).
 */
export function relation(scene, rel, aId, bId, cId, side) {
  return relAt(scene, rel, objById(scene, aId), objById(scene, bId), objById(scene, cId), side);
}

/**
 * Same rules for an empty place {x,y}. For rel 'side' the side may be given as the 6th argument
 * or (shorter) in place of bId: slotRelation(scene, 'side', slot, 'left').
 */
export function slotRelation(scene, rel, slot, bId, cId, side) {
  if (rel === 'side') return relAt(scene, rel, slot, null, null, side ?? bId);
  return relAt(scene, rel, slot, objById(scene, bId), objById(scene, cId));
}

// ======================================================================
// sentences  { rel, a, b?, c?, side? }
// ======================================================================

/** Name of an id: the object's kind in the scene, else the id itself as a KINDS key (solve items). */
function kindOf(scene, id) {
  const o = objById(scene, id);
  return o ? o.kind : id;
}
const zhOf = (scene, id) => KINDS[kindOf(scene, id)].zh;
const enOf = (scene, id) => KINDS[kindOf(scene, id)].en;

/** 「盾在劍的左面」 / 「盾在劍和弓之間」 / 「盾在左面」 and the English line. */
export function sentenceText(scene, s) {
  const A = zhOf(scene, s.a), a = enOf(scene, s.a);
  const cap = t => t[0].toUpperCase() + t.slice(1);
  if (s.rel === 'side') return { zh: `${A}在${REL_ZH[s.side]}`, en: cap(`the ${a} is on the ${s.side}.`) };
  if (s.rel === 'between') {
    return { zh: `${A}在${zhOf(scene, s.b)}和${zhOf(scene, s.c)}之間`, en: cap(`the ${a} is between the ${enOf(scene, s.b)} and the ${enOf(scene, s.c)}.`) };
  }
  return { zh: `${A}在${zhOf(scene, s.b)}的${REL_ZH[s.rel]}`, en: cap(`the ${a} is ${REL_EN[s.rel]} the ${enOf(scene, s.b)}.`) };
}

/** Truth of a sentence in a scene: true / false / null (not comparable). */
export const truthOf = (scene, s) => relation(scene, s.rel, s.a, s.b, s.c, s.side);

/** Ids whose kind appears once in the scene: only these may be named in a clue. */
function nameable(scene) {
  const n = {};
  for (const o of scene.objects) n[o.kind] = (n[o.kind] || 0) + 1;
  return scene.objects.filter(o => n[o.kind] === 1).map(o => o.id);
}

/** Every comparable sentence about nameable objects using `rels`. */
function allSentences(scene, rels) {
  const ids = nameable(scene), out = [];
  for (const rel of rels) {
    if (rel === 'side') {
      for (const a of ids) for (const side of ['left', 'right']) out.push({ rel, a, side });
    } else if (rel === 'between') {
      for (const a of ids) for (const b of ids) for (const c of ids) {
        if (a !== b && a !== c && b < c) out.push({ rel, a, b, c });
      }
    } else {
      for (const a of ids) for (const b of ids) if (a !== b) out.push({ rel, a, b });
    }
  }
  return out.filter(s => truthOf(scene, s) !== null);
}

/**
 * Three sentences about the scene, exactly one true, all comparable, all different (used by 'make').
 * Each sentence also carries its text: { rel, a, b?, c?, side?, zh, en }.
 * Throws when the scene cannot give one true and two false sentences (fewer than 2 nameable objects).
 */
export function sentencesFor(scene, rng, rels) {
  const all = allSentences(scene, rels);
  const yes = all.filter(s => truthOf(scene, s)), no = all.filter(s => !truthOf(scene, s));
  if (!yes.length || no.length < 2) throw new Error('sentencesFor: scene too small for 3 sentences');
  const t = pick(yes, rng);
  // prefer false sentences about the same things (near misses), then any
  const near = shuffle(no.filter(s => s.a === t.a || s.b === t.a), rng);
  const rest = shuffle(no.filter(s => !near.includes(s)), rng);
  const out = [t, ...near.concat(rest).slice(0, 2)];
  return shuffle(out, rng).map(s => ({ ...s, ...sentenceText(scene, s) }));
}

// ======================================================================
// scene building (internal)
// ======================================================================

const cellsOf = (cols, rows) => {
  const out = [];
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) out.push({ x, y });
  return out;
};
const sortCells = cells => cells.sort((p, q) => p.y - q.y || p.x - q.x);

/** Kinds for n objects: distinct while the pool lasts, then repeats (repeats are never named). */
function kindsFor(pool, n, rng) {
  const out = shuffle(pool, rng).slice(0, n);
  while (out.length < n) out.push(pick(pool, rng));
  return out;
}

/**
 * Build a scene: n objects on random cells, the other cells become slots when `withSlots`.
 * Object ids are 'o0', 'o1', … in cell order. Queues get facing on every member.
 */
function buildScene({ layout, cols, rows, n, pool, rng, withSlots = false, facing, fixedKinds, firstCells = [] }) {
  const has = c => firstCells.some(f => f.x === c.x && f.y === c.y);
  const cells = firstCells.concat(shuffle(cellsOf(cols, rows).filter(c => !has(c)), rng));
  const objCells = sortCells(cells.slice(0, n));
  const slotCells = withSlots ? sortCells(cells.slice(n)) : [];
  const kinds = fixedKinds || kindsFor(pool, n, rng);
  const scene = {
    layout, cols, rows,
    objects: objCells.map((p, i) => ({ id: `o${i}`, kind: kinds[i], x: p.x, y: p.y })),
    slots: slotCells.map(p => ({ x: p.x, y: p.y })),
  };
  if (layout === 'queue') {
    scene.queueFacing = facing || 'right';
    scene.objects.forEach(o => { o.facing = scene.queueFacing; });
  }
  return scene;
}

/** A queue scene turned round: same places, facing swapped. */
function turnRound(scene) {
  const f = scene.queueFacing === 'left' ? 'right' : 'left';
  return { ...scene, queueFacing: f, objects: scene.objects.map(o => ({ ...o, facing: f })), slots: scene.slots.map(s => ({ ...s })) };
}

/** Line layout for a family: lr → row, fb → queue, ud → column. */
const lineLayout = fam => (fam === 'lr' ? 'row' : fam === 'fb' ? 'queue' : 'column');
const lineScene = (fam, len, n, pool, rng, withSlots) => {
  const layout = lineLayout(fam);
  return buildScene({
    layout, cols: layout === 'column' ? 1 : len, rows: layout === 'column' ? len : 1, n, pool, rng, withSlots,
    facing: layout === 'queue' ? pick(['left', 'right'], rng) : undefined,
  });
};

/**
 * Scene with empty places for go/place clues, sized by support level.
 * Slots: level 3 → 2–3, level 2 → 3–4, level 1 → 5–6. lr = row, fb = queue,
 * ud = a column (level 3) or a 3-level shelf of 2 (level 2) / 3 (level 1) columns.
 */
function placesScene(fam, level, pool, rng, between = false) {
  if (fam === 'ud' && level < 3) {
    const cols = level === 2 ? 2 : 3;
    const n = level === 2 ? randInt(2, 3, rng) : randInt(3, 4, rng);
    // a 之間 clue needs one column with things on the top and bottom shelves
    const x = randInt(0, cols - 1, rng);
    const firstCells = between ? [{ x, y: 0 }, { x, y: 2 }] : [];
    return buildScene({ layout: 'shelf', cols, rows: 3, n, pool, rng, withSlots: true, firstCells });
  }
  const nSlots = level === 3 ? randInt(2, 3, rng) : level === 2 ? randInt(3, 4, rng) : randInt(5, 6, rng);
  const nObj = level === 3 ? 2 : level === 2 ? 3 : randInt(3, 4, rng);
  return lineScene(fam, nObj + nSlots, nObj, pool, rng, true);
}

// ======================================================================
// clue text
// ======================================================================

const nm = (scene, id) => KINDS[kindOf(scene, id)];
const T = {
  choose(scene, fam, a, b) {
    const A = nm(scene, a);
    if (fam === 'side') return { zh: `${A.zh}在左面還是右面？`, en: `Is the ${A.en} on the left or the right?` };
    const B = nm(scene, b), [r1, r2] = FAM[fam];
    const en = { lr: 'left or right of', fb: 'in front of or behind', ud: 'above or below' }[fam];
    return { zh: `${A.zh}在${B.zh}的${REL_ZH[r1]}還是${REL_ZH[r2]}？`, en: `Is the ${A.en} ${en} the ${B.en}?` };
  },
  go(scene, rel, b, c, keyTwist) {
    const B = nm(scene, b);
    if (rel === 'between') {
      const C = nm(scene, c);
      return keyTwist
        ? { zh: `鑰匙在${B.zh}和${C.zh}之間，走過去！`, en: `The key is between the ${B.en} and the ${C.en}. Go!` }
        : { zh: `走到${B.zh}和${C.zh}之間`, en: `Go between the ${B.en} and the ${C.en}.` };
    }
    return keyTwist
      ? { zh: `鑰匙在${B.zh}的${REL_ZH[rel]}，走過去！`, en: `The key is ${REL_EN[rel]} the ${B.en}. Go!` }
      : { zh: `走到${B.zh}的${REL_ZH[rel]}`, en: `Go ${REL_EN[rel]} the ${B.en}.` };
  },
  place(scene, item, rel, b, c) {
    const I = KINDS[item], B = nm(scene, b);
    if (rel === 'between') {
      const C = nm(scene, c);
      return { zh: `把${I.zh}放在${B.zh}和${C.zh}之間`, en: `Put the ${I.en} between the ${B.en} and the ${C.en}.` };
    }
    return { zh: `把${I.zh}放在${B.zh}的${REL_ZH[rel]}`, en: `Put the ${I.en} ${REL_EN[rel]} the ${B.en}.` };
  },
  judge: () => ({ zh: '貓頭鷹說得對嗎？', en: 'Is the owl right?' }),
  select(scene, rel, b, c) {
    const B = nm(scene, b);
    if (rel === 'between') {
      const C = nm(scene, c);
      return { zh: `哪些在${B.zh}和${C.zh}之間？答案可多於一個`, en: `Which are between the ${B.en} and the ${C.en}? There may be more than one.` };
    }
    return { zh: `哪些在${B.zh}的${REL_ZH[rel]}？答案可多於一個`, en: `Which are ${REL_EN[rel]} the ${B.en}? There may be more than one.` };
  },
  riddle(scene, conds) {
    const [p, q] = conds, B = nm(scene, p.b), C = nm(scene, q.b);
    return {
      zh: `寶石在${B.zh}的${REL_ZH[p.rel]}，也在${C.zh}的${REL_ZH[q.rel]}。找出寶石！`,
      en: `The gem is ${REL_EN[p.rel]} the ${B.en} and ${REL_EN[q.rel]} the ${C.en}. Find the gem!`,
    };
  },
  rushPick(scene, b, c) {
    const B = nm(scene, b), C = nm(scene, c);
    return { zh: `哪隻怪物在${B.zh}和${C.zh}之間？`, en: `Which monster is between the ${B.en} and the ${C.en}?` };
  },
  make: fam => (fam === 'fb'
    ? { zh: '把史萊姆排好隊，然後選出正確的句子', en: 'Line up the slimes, then pick the true sentence.' }
    : fam === 'ud'
      ? { zh: '把箱子疊高，然後選出正確的句子', en: 'Stack the boxes up, then pick the true sentence.' }
      : { zh: '把寶物放好，然後選出正確的句子', en: 'Put your treasures anywhere, then pick the true sentence.' }),
  // Deviation: the plan's template says 玩具 (toys); the shelf holds treasures from KINDS, so 寶物.
  solve: () => ({ zh: '依提示把寶物放上架', en: 'Put the treasures on the shelf to match the clues.' }),
  wave: () => ({ zh: '怪物來了！', en: 'Monsters are coming!' }),
};

// ======================================================================
// clue generators (internal). Each returns a clue or null (caller retries).
// Common clue fields: kind, scene, ask {zh,en}, level, rel.
// ======================================================================

/**
 * choose: two big signs. fam 'side' = absolute (pair, cols 2); else relational in a line of
 * 2 (level 3), 3 (level 2) or 4 (level 1) objects. Extra fields: choices, answer, a, b?.
 */
function genChoose(fam, level, rng, pool) {
  if (fam === 'side') {
    const scene = buildScene({ layout: 'pair', cols: 2, rows: 1, n: 2, pool, rng });
    const a = pick(scene.objects, rng).id;
    const answer = relation(scene, 'side', a, null, null, 'left') ? 'left' : 'right';
    return { kind: 'choose', scene, ask: T.choose(scene, 'side', a), level, rel: 'side', choices: ['left', 'right'], answer, a };
  }
  const n = level === 3 ? 2 : level === 2 ? 3 : 4;
  const scene = n === 2 && fam === 'lr'
    ? buildScene({ layout: 'pair', cols: 2, rows: 1, n: 2, pool, rng })
    : lineScene(fam, n, n, pool, rng, false);
  const ids = nameable(scene);
  if (ids.length < 2) return null;
  const [a, b] = shuffle(ids, rng);
  const choices = FAM[fam].slice();
  const answer = relation(scene, choices[0], a, b) ? choices[0] : choices[1];
  return { kind: 'choose', scene, ask: T.choose(scene, fam, a, b), level, rel: answer, choices, answer, a, b };
}

/** All (rel, b, c?) for empty places whose answer set is non-empty and not every place. */
function slotOptions(scene, rels) {
  const ids = nameable(scene), out = [];
  const ans = (rel, b, c) => scene.slots.map((s, i) => (slotRelation(scene, rel, s, b, c) === true ? i : -1)).filter(i => i >= 0);
  for (const rel of rels) {
    if (rel === 'between') {
      for (const b of ids) for (const c of ids) if (b < c) out.push({ rel, b, c, answers: ans(rel, b, c) });
    } else for (const b of ids) out.push({ rel, b, answers: ans(rel, b) });
  }
  return out.filter(o => o.answers.length > 0 && o.answers.length < scene.slots.length);
}
const orderBC = (o, rng) => (o.c && rng() < 0.5 ? { ...o, b: o.c, c: o.b } : o);

/** go: walk to an empty place. Extra fields: answers [slot idx], b, c?, keyTwist?. */
function genGo(fam, level, rng, { pool = POOLS[fam], between = false, onlyBetween = false, keyTwist = true, scene: given } = {}) {
  const scene = given || placesScene(fam, level, pool, rng, onlyBetween);
  const rels = onlyBetween ? ['between'] : between ? [...FAM[fam], 'between'] : FAM[fam];
  const opts = slotOptions(scene, rels);
  if (!opts.length) return null;
  const o = orderBC(pick(opts, rng), rng);
  const twist = keyTwist && rng() < 0.35;
  const clue = { kind: 'go', scene, ask: T.go(scene, o.rel, o.b, o.c, twist), level, rel: o.rel, answers: o.answers, b: o.b };
  if (o.c) clue.c = o.c;
  if (twist) clue.keyTwist = true;
  return clue;
}

/** place: drag `item` (a kind not in the scene) to a place. Extra fields: item, answers, b, c?. */
function genPlace(fam, level, rng, { pool = POOLS[fam], items, between = true, scene: given } = {}) {
  const scene = given || placesScene(fam, level, pool, rng);
  const free = (items || pool).filter(k => !scene.objects.some(o => o.kind === k));
  if (!free.length) return null;
  const rels = between ? [...FAM[fam], 'between'] : FAM[fam];
  const opts = slotOptions(scene, rels);
  if (!opts.length) return null;
  const o = orderBC(pick(opts, rng), rng);
  const item = pick(free, rng);
  const clue = { kind: 'place', scene, ask: T.place(scene, item, o.rel, o.b, o.c), level, rel: o.rel, item, answers: o.answers, b: o.b };
  if (o.c) clue.c = o.c;
  return clue;
}

/** Objects-only line for judge/select: 3 (level 3), 4 (level 2) or 5 (level 1) things. */
const judgeScene = (fam, level, pool, rng) => {
  const n = level === 3 ? 3 : level === 2 ? 4 : 5;
  return lineScene(fam, n, n, pool, rng, false);
};

/** judge: the owl says a sentence (true or false). Extra fields: sentence {rel,a,b,c?,zh,en}, answer. */
function genJudge(fam, level, rng, { pool = POOLS[fam], between = true } = {}) {
  const scene = judgeScene(fam, level, pool, rng);
  const all = allSentences(scene, between ? [...FAM[fam], 'between'] : FAM[fam]);
  const want = rng() < 0.5;
  const fit = all.filter(s => truthOf(scene, s) === want);
  if (!fit.length) return null;
  const s = pick(fit, rng);
  return { kind: 'judge', scene, ask: T.judge(), level, rel: s.rel, sentence: { ...s, ...sentenceText(scene, s) }, answer: want };
}

/** Answer set of a select clue: every other object meeting the relation. */
const selectAnswers = (scene, rel, b, c) => scene.objects
  .filter(o => o.id !== b && o.id !== c && relation(scene, rel, o.id, b, c) === true).map(o => o.id);

/** select: tap all that fit. Extra fields: answers [ids], b, c?. Prefers 2+ answers. */
function genSelect(fam, level, rng, { pool = POOLS[fam], between = false } = {}) {
  const scene = judgeScene(fam, level, pool, rng);
  const ids = nameable(scene), opts = [];
  for (const rel of between ? [...FAM[fam], 'between'] : FAM[fam]) {
    if (rel === 'between') {
      for (const b of ids) for (const c of ids) if (b < c) opts.push({ rel, b, c });
    } else for (const b of ids) opts.push({ rel, b });
  }
  const ok = opts.map(o => ({ ...o, answers: selectAnswers(scene, o.rel, o.b, o.c) }))
    .filter(o => o.answers.length >= 1 && o.answers.length < scene.objects.length - (o.c ? 2 : 1));
  if (!ok.length) return null;
  const multi = ok.filter(o => o.answers.length >= 2);
  const o = orderBC(pick(multi.length ? multi : ok, rng), rng);
  const clue = { kind: 'select', scene, ask: T.select(scene, o.rel, o.b, o.c), level, rel: o.rel, answers: o.answers, b: o.b };
  if (o.c) clue.c = o.c;
  return clue;
}

/**
 * make: an empty line; the child places `items` anywhere, then picks the true one of
 * sentencesFor(arranged, rng, rels). Level 3 → 2 items, else 3. Queues start facing right (🔄 flips).
 */
function genMake(fam, level, rng) {
  const nItems = level === 3 ? 2 : 3;
  const items = shuffle(fam === 'lr' ? TREASURES : fam === 'fb' ? SLIMES : BOXES, rng).slice(0, nItems);
  const len = fam === 'ud' ? nItems : nItems + 2; // a tower stacks with no gaps; hooks / a parade have spare places
  const scene = buildScene({ layout: lineLayout(fam), cols: fam === 'ud' ? 1 : len, rows: fam === 'ud' ? len : 1, n: 0, pool: [], rng, withSlots: true, facing: 'right' });
  const rels = [...FAM[fam], 'between'];
  return { kind: 'make', scene, ask: T.make(fam), level, rel: rels[0], items, rels };
}

/** Every placement of `items` into distinct slot indices. */
function placements(items, nSlots) {
  const out = [];
  const rec = (i, used, cur) => {
    if (i === items.length) { out.push({ ...cur }); return; }
    for (let s = 0; s < nSlots; s++) if (!used.has(s)) { used.add(s); cur[items[i]] = s; rec(i + 1, used, cur); used.delete(s); delete cur[items[i]]; }
  };
  rec(0, new Set(), {});
  return out;
}
/** The solve scene with items standing in their slots (ids = kinds). */
function placedScene(clue, placement) {
  const sc = clue.scene;
  return { ...sc, objects: sc.objects.concat(clue.items.map(k => ({ id: k, kind: k, x: sc.slots[placement[k]].x, y: sc.slots[placement[k]].y }))) };
}
const solutionsOf = clue => placements(clue.items, clue.scene.slots.length).filter(p => checkSolve(clue, p));

/**
 * solve (textbook p77): a 2-column shelf (2×2 first, then 2×3), one thing already placed.
 * 2×2 → 2 items, 2×3 → 3 items; 2–3 sentences with exactly one solution. Ids = kinds.
 * Extra fields: items, sentences [{rel,a,b?,c?,side?,zh,en}], answer {kind: slotIndex}.
 */
function genSolve(rows, level, rng) {
  const nItems = rows === 2 ? 2 : 3;
  const kinds = shuffle(TREASURES, rng).slice(0, nItems + 1);
  const [fixed, ...items] = kinds;
  const cells = shuffle(cellsOf(2, rows), rng);
  const scene = {
    layout: 'shelf', cols: 2, rows,
    objects: [{ id: fixed, kind: fixed, x: cells[0].x, y: cells[0].y }],
    slots: sortCells(cells.slice(1)).map(p => ({ x: p.x, y: p.y })),
  };
  const target = {};
  const free = shuffle(scene.slots.map((_, i) => i), rng);
  items.forEach((k, i) => { target[k] = free[i]; });
  const full = placedScene({ scene, items }, target);
  // true sentences that mention at least one item
  const cand = shuffle(allSentences(full, ['side', 'left', 'right', 'above', 'below', 'between'])
    .filter(s => truthOf(full, s) && [s.a, s.b, s.c].some(id => items.includes(id))), rng);
  for (const size of [2, 3]) {
    const combos = [];
    const rec = (start, cur) => {
      if (cur.length === size) { combos.push(cur.slice()); return; }
      for (let i = start; i < cand.length && combos.length < 400; i++) { cur.push(cand[i]); rec(i + 1, cur); cur.pop(); }
    };
    rec(0, []);
    for (const ss of combos) {
      const clue = { kind: 'solve', scene, ask: T.solve(), level, rel: ss[0].rel, items, sentences: ss, answer: target };
      if (solutionsOf(clue).length === 1) {
        clue.sentences = ss.map(s => ({ ...s, ...sentenceText(full, s) }));
        return clue;
      }
    }
  }
  return null;
}

/**
 * pick (boss riddle, F4R5): a shelf of chests (one hides the gem) and two named things.
 * 「寶石在{B}的{REL1}，也在{C}的{REL2}」: exactly one chest meets both, and each clue alone
 * leaves 2+ chests, so both are needed. Grid 3×3 with 6 chests (level 3), 3×3 with 7 (level 2), 4×3 with 8–10 (level 1).
 * Extra fields: candidates [chest ids], conds [{rel,b},{rel,b}], answers [id].
 */
function genRiddle(level, rng) {
  for (let t = 0; t < 10; t++) { const c = riddleOnce(level, rng); if (c) return c; } // sparse grids need a few scenes
  return null;
}
function riddleOnce(level, rng) {
  const [cols, rows] = level === 1 ? [4, 3] : [3, 3];
  const cells = cols * rows, empties = level === 3 ? 1 : level === 2 ? 0 : randInt(0, 2, rng);
  const refs = shuffle(BOSS_REFS, rng).slice(0, 2);
  const kinds = refs.concat(kindsFor(CHESTS, cells - 2 - empties, rng));
  const scene = buildScene({ layout: 'shelf', cols, rows, n: kinds.length, pool: [], rng, fixedKinds: shuffle(kinds, rng) });
  const B = scene.objects.find(o => o.kind === refs[0]).id, C = scene.objects.find(o => o.kind === refs[1]).id;
  const candidates = scene.objects.filter(o => CHESTS.includes(o.kind)).map(o => o.id);
  const fits = (rel, b) => candidates.filter(id => relation(scene, rel, id, b) === true);
  const opts = [];
  for (const r1 of ['left', 'right', 'above', 'below']) for (const r2 of ['left', 'right', 'above', 'below']) {
    const f1 = fits(r1, B), f2 = fits(r2, C), both = f1.filter(id => f2.includes(id));
    if (both.length === 1 && f1.length >= 2 && f2.length >= 2) opts.push({ conds: [{ rel: r1, b: B }, { rel: r2, b: C }], answers: both });
  }
  if (!opts.length) return null;
  const o = pick(opts, rng);
  if (rng() < 0.5) o.conds.reverse();
  return { kind: 'pick', scene, ask: T.riddle(scene, o.conds), level, rel: o.conds[0].rel, candidates, conds: o.conds, answers: o.answers };
}

/** pick (Rush 之間): a row with two named things and slimes; exactly one slime strictly between. */
function genRushPick(rng) {
  const cols = randInt(5, 7, rng);
  const refs = shuffle(['torch', 'shield', 'barrel', 'crate', 'book'], rng).slice(0, 2);
  const nMon = randInt(2, Math.min(4, cols - 2), rng);
  const scene = buildScene({ layout: 'row', cols, rows: 1, n: nMon + 2, pool: [], rng, fixedKinds: shuffle(refs.concat(kindsFor(SLIMES, nMon, rng)), rng) });
  const B = scene.objects.find(o => o.kind === refs[0]).id, C = scene.objects.find(o => o.kind === refs[1]).id;
  const candidates = scene.objects.filter(o => SLIMES.includes(o.kind)).map(o => o.id);
  const answers = candidates.filter(id => relation(scene, 'between', id, B, C) === true);
  if (answers.length !== 1 || candidates.length < 2) return null;
  return { kind: 'pick', scene, ask: T.rushPick(scene, B, C), level: 1, rel: 'between', candidates, conds: [{ rel: 'between', b: B, c: C }], answers };
}

const WAVE_SIDES = { lr: ['left', 'right'], ud: ['up', 'down'], mix: ['left', 'right', 'up', 'down'] };
const MONSTER_FOR = { left: 'slime', right: 'slime', up: 'bat', down: 'mole' };
/**
 * wave: monsters coming from sides. mode 'lr'|'ud'|'mix'; both/all sides appear; never 3 in a row
 * from the same side. scene is null (the waves scene draws its own corridor). rel = mode.
 * Extra fields: mode, monsters [{side, type}].
 */
function genWave(mode, count, level, rng) {
  const sides = WAVE_SIDES[mode];
  for (let t = 0; t < 50; t++) {
    const list = [];
    for (let i = 0; i < count; i++) {
      let s = pick(sides, rng);
      if (i >= 2 && list[i - 1] === s && list[i - 2] === s) s = pick(sides.filter(x => x !== s), rng);
      list.push(s);
    }
    if (sides.every(s => list.includes(s)) || count < sides.length) {
      return { kind: 'wave', scene: null, ask: T.wave(), level, rel: mode, mode, monsters: list.map(side => ({ side, type: MONSTER_FOR[side] })) };
    }
  }
  return null;
}

/** Words of a clue, to avoid the same sentence twice in one room. */
const wordsOf = c => (c.kind === 'judge' ? c.sentence.zh : c.ask.zh);
let roomWords = null; // Set while genRoom runs (keeps rooms varied; reset every call)

/** Retry a generator until it gives a valid clue (max 20 tries), else throw. */
function make(gen, extra) {
  let last, repeat = null;
  for (let t = 0; t < 20; t++) {
    const clue = gen();
    if (!clue) continue;
    Object.assign(clue, extra);
    try { validateClue(clue); } catch (e) { last = e; continue; }
    const fixedText = clue.kind === 'make' || clue.kind === 'solve' || clue.kind === 'wave';
    if (roomWords && !fixedText && roomWords.has(wordsOf(clue))) { repeat = repeat || clue; continue; }
    if (roomWords && !fixedText) roomWords.add(wordsOf(clue));
    return clue;
  }
  if (repeat) return repeat; // a repeated sentence (new picture) beats no clue
  throw new Error(`clue generation failed${last ? `: ${last.message}` : ''}`);
}

// ======================================================================
// validation and grading
// ======================================================================

const LAYOUTS = ['pair', 'row', 'queue', 'column', 'shelf'];
const fail = msg => { throw new Error(msg); };
const sameSet = (p, q) => p.length === q.length && new Set(p).size === p.length && p.every(v => q.includes(v));

function checkScene(sc) {
  if (!sc || !LAYOUTS.includes(sc.layout)) fail('bad layout');
  if (!(sc.cols >= 1 && sc.rows >= 1)) fail('bad size');
  if (['pair', 'row', 'queue'].includes(sc.layout) && sc.rows !== 1) fail('line must have rows 1');
  if (sc.layout === 'column' && sc.cols !== 1) fail('column must have cols 1');
  const seen = new Set(), ids = new Set();
  for (const p of [...sc.objects, ...sc.slots]) {
    if (!(p.x >= 0 && p.x < sc.cols && p.y >= 0 && p.y < sc.rows)) fail('out of the grid');
    const k = `${p.x},${p.y}`;
    if (seen.has(k)) fail(`two things at ${k}`);
    seen.add(k);
  }
  for (const o of sc.objects) {
    if (!KINDS[o.kind]) fail(`unknown kind ${o.kind}`);
    if (ids.has(o.id)) fail(`duplicate id ${o.id}`);
    ids.add(o.id);
    if (sc.layout === 'queue' && o.facing !== sc.queueFacing) fail('queue member facing');
  }
  if (sc.layout === 'queue' && !['left', 'right'].includes(sc.queueFacing)) fail('queue facing');
}
/** Named ids must exist and have a kind seen once in the scene (else the clue's words are ambiguous). */
function checkNamed(sc, ids) {
  const ok = nameable(sc);
  for (const id of ids) if (id != null && !ok.includes(id)) fail(`ambiguous or missing name ${id}`);
}
const slotAnswers = (sc, rel, b, c) => sc.slots.map((s, i) => (slotRelation(sc, rel, s, b, c) === true ? i : -1)).filter(i => i >= 0);

/**
 * Recompute a clue's answers from its scene and check them. Returns true or throws Error(reason).
 * Rules: answers non-empty; choose/pick exactly one; go/place/select leave at least one wrong
 * candidate; every relation used is comparable; named things are unambiguous.
 */
export function validateClue(clue) {
  if (!clue || !clue.kind) fail('no clue');
  if (!clue.ask || !clue.ask.zh || !clue.ask.en) fail('no ask text');
  if (![1, 2, 3].includes(clue.level)) fail('bad level');
  const sc = clue.scene;
  if (clue.kind !== 'wave') checkScene(sc);
  switch (clue.kind) {
    case 'choose': {
      const pairs = [['left', 'right'], ['front', 'back'], ['above', 'below']];
      if (!pairs.some(p => sameSet(p, clue.choices))) fail('bad choices');
      if (clue.rel === 'side') {
        checkNamed(sc, [clue.a]);
        if (!sameSet(clue.choices, ['left', 'right'])) fail('side choices');
        const t = clue.choices.filter(s => relation(sc, 'side', clue.a, null, null, s) === true);
        if (t.length !== 1 || t[0] !== clue.answer) fail('side answer');
      } else {
        checkNamed(sc, [clue.a, clue.b]);
        const v = clue.choices.map(r => relation(sc, r, clue.a, clue.b));
        if (v.includes(null)) fail('choose not comparable');
        const t = clue.choices.filter((_, i) => v[i]);
        if (t.length !== 1 || t[0] !== clue.answer) fail('choose answer');
      }
      return true;
    }
    case 'go': case 'place': {
      if (clue.kind === 'place' && (!KINDS[clue.item] || sc.objects.some(o => o.kind === clue.item))) fail('bad item');
      checkNamed(sc, [clue.b, clue.c]);
      if (clue.rel === 'between' ? !clue.c : !FAM.lr.concat(FAM.fb, FAM.ud).includes(clue.rel)) fail('bad rel');
      const a = slotAnswers(sc, clue.rel, clue.b, clue.c);
      if (!a.length) fail('no answer');
      if (a.length >= sc.slots.length) fail('every place is right');
      if (!sameSet(a, clue.answers)) fail('answers differ');
      return true;
    }
    case 'judge': {
      const s = clue.sentence;
      checkNamed(sc, [s.a, s.b, s.c]);
      const t = truthOf(sc, s);
      if (t === null) fail('judge not comparable');
      if (t !== clue.answer) fail('judge answer');
      if (s.zh !== sentenceText(sc, s).zh) fail('judge text');
      return true;
    }
    case 'select': {
      checkNamed(sc, [clue.b, clue.c]);
      const a = selectAnswers(sc, clue.rel, clue.b, clue.c);
      if (!a.length) fail('no answer');
      if (a.length >= sc.objects.length - (clue.c ? 2 : 1)) fail('every one is right');
      if (!sameSet(a, clue.answers)) fail('answers differ');
      return true;
    }
    case 'pick': {
      checkNamed(sc, clue.conds.flatMap(d => [d.b, d.c]));
      const a = clue.candidates.filter(id => clue.conds.every(d => relation(sc, d.rel, id, d.b, d.c) === true));
      if (a.length !== 1) fail(`pick needs one answer, got ${a.length}`);
      if (!sameSet(a, clue.answers)) fail('answers differ');
      return true;
    }
    case 'make': {
      if (sc.objects.length) fail('make starts empty');
      if (!(clue.items.length >= 2 && clue.items.length <= 3) || new Set(clue.items).size !== clue.items.length) fail('make items');
      if (!clue.items.every(k => KINDS[k])) fail('make kind');
      if (sc.slots.length < clue.items.length) fail('make slots');
      if (!clue.rels.length || !clue.rels.every(r => REL.includes(r))) fail('make rels');
      const arranged = { ...sc, objects: clue.items.map((k, i) => ({ id: k, kind: k, x: sc.slots[i].x, y: sc.slots[i].y, ...(sc.queueFacing ? { facing: sc.queueFacing } : {}) })) };
      sentencesFor(arranged, lcg(1), clue.rels); // throws if no 3 sentences
      return true;
    }
    case 'solve': {
      if (!(clue.sentences.length >= 2 && clue.sentences.length <= 3)) fail('solve sentences');
      if (!checkSolve(clue, clue.answer)) fail('solve answer');
      if (solutionsOf(clue).length !== 1) fail('solve not unique');
      return true;
    }
    case 'wave': {
      const sides = WAVE_SIDES[clue.mode];
      if (!sides || !clue.monsters.length) fail('bad wave');
      if (!clue.monsters.every(m => sides.includes(m.side) && m.type === MONSTER_FOR[m.side])) fail('wave monster');
      return true;
    }
    default: fail(`unknown kind ${clue.kind}`);
  }
}

/** Every item placed (distinct slots) and every sentence true. placement = { kind: slotIndex }. */
export function checkSolve(clue, placement) {
  if (!placement) return false;
  const used = new Set();
  for (const k of clue.items) {
    const s = placement[k];
    if (!Number.isInteger(s) || s < 0 || s >= clue.scene.slots.length || used.has(s)) return false;
    used.add(s);
  }
  const sc = placedScene(clue, placement);
  return clue.sentences.every(s => truthOf(sc, s) === true);
}

/**
 * Grade one try.
 *   choose: the picked choice      go/place: a slot index (any in answers)     judge: boolean
 *   select: array of ids (set-equal, order free)       pick: one id
 *   make: { scene: the child's arranged scene, sentence } → that sentence is true there
 *   solve: placement { kind: slotIndex } (checkSolve)
 *   wave: { i, side } for one monster, or an array with a side for every monster
 */
export function checkAnswer(clue, picked) {
  switch (clue.kind) {
    case 'choose': return picked === clue.answer;
    case 'go': case 'place': return clue.answers.includes(picked);
    case 'judge': return picked === clue.answer;
    case 'select': return Array.isArray(picked) && sameSet(picked, clue.answers);
    case 'pick': return clue.answers.length === 1 && picked === clue.answers[0];
    case 'make': return !!(picked && picked.scene && picked.sentence) && truthOf(picked.scene, picked.sentence) === true;
    case 'solve': return checkSolve(clue, picked);
    case 'wave':
      if (Array.isArray(picked)) return picked.length === clue.monsters.length && picked.every((s, i) => s === clue.monsters[i].side);
      return !!picked && !!clue.monsters[picked.i] && clue.monsters[picked.i].side === picked.side;
    default: return false;
  }
}

/**
 * What the child mixed up, for the teacher log: { want, picked }.
 * choose: the two choices; go/place: the relation the picked place really has to the reference
 * (the opposite one, 'outside' for between, else 'other'); select/pick: the opposite relation if a
 * picked object has it, else 'other'; judge: 'true'/'false'; wave: the two sides; make/solve: 'other'.
 */
export function confusionOf(clue, picked) {
  const opp = clue.rel in OPPOSITE ? OPPOSITE[clue.rel] : null;
  switch (clue.kind) {
    case 'choose': return { want: clue.answer, picked };
    case 'go': case 'place': {
      const slot = clue.scene.slots[picked];
      if (!slot) return { want: clue.rel, picked: 'other' };
      if (clue.rel === 'between') return { want: 'between', picked: 'outside' };
      return { want: clue.rel, picked: opp && slotRelation(clue.scene, opp, slot, clue.b) === true ? opp : 'other' };
    }
    case 'select': case 'pick': {
      const ids = Array.isArray(picked) ? picked : [picked];
      const b = clue.kind === 'pick' ? clue.conds[0].b : clue.b;
      const hit = opp && ids.some(id => relation(clue.scene, opp, id, b) === true);
      return { want: clue.rel, picked: hit ? opp : 'other' };
    }
    case 'judge': return { want: String(clue.answer), picked: String(picked) };
    case 'wave': {
      const i = Array.isArray(picked) ? picked.findIndex((s, k) => s !== clue.monsters[k].side) : picked && picked.i;
      const m = clue.monsters[i];
      return { want: m ? m.side : clue.mode, picked: Array.isArray(picked) ? picked[i] : picked && picked.side };
    }
    default: return { want: clue.rel, picked: 'other' };
  }
}

// ======================================================================
// rooms
// ======================================================================

export const FLOORS = [1, 2, 3, 4];
/** Spec §2. Order = play order (R6 wave rooms last on floors 1 and 3). */
export const ROOMS = [
  { key: 'F1R1', floor: 1, idx: 1, zh: '火把走廊', en: 'Torch hall' },
  { key: 'F1R2', floor: 1, idx: 2, zh: '寶箱排排', en: 'Chest row' },
  { key: 'F1R3', floor: 1, idx: 3, zh: '兵器架', en: 'Weapon rack' },
  { key: 'F1R4', floor: 1, idx: 4, zh: '貓頭鷹問你', en: "Owl's check" },
  { key: 'F1R5', floor: 1, idx: 5, zh: '我的寶庫', en: 'My vault' },
  { key: 'F1R6', floor: 1, idx: 6, zh: '怪物來了！', en: 'Monster waves', wave: true },
  { key: 'F2R1', floor: 2, idx: 1, zh: '史萊姆列隊', en: 'Slime line' },
  { key: 'F2R2', floor: 2, idx: 2, zh: '排隊入門', en: 'Queue at the gate' },
  { key: 'F2R3', floor: 2, idx: 3, zh: '轉身！', en: 'Turn round' },
  { key: 'F2R4', floor: 2, idx: 4, zh: '貓頭鷹問你', en: "Owl's check" },
  { key: 'F2R5', floor: 2, idx: 5, zh: '我的巡遊', en: 'My parade' },
  { key: 'F3R1', floor: 3, idx: 1, zh: '倒掛蝠蝠', en: 'Upside-down bat' },
  { key: 'F3R2', floor: 3, idx: 2, zh: '爬梯子', en: 'Ladders' },
  { key: 'F3R3', floor: 3, idx: 3, zh: '藥水架', en: 'Potion shelf' },
  { key: 'F3R4', floor: 3, idx: 4, zh: '貓頭鷹問你', en: "Owl's check" },
  { key: 'F3R5', floor: 3, idx: 5, zh: '我的高塔', en: 'My tower' },
  { key: 'F3R6', floor: 3, idx: 6, zh: '蝙蝠和地鼠', en: 'Bats and moles', wave: true },
  { key: 'F4R1', floor: 4, idx: 1, zh: '熱身', en: 'Warm-up' },
  { key: 'F4R2', floor: 4, idx: 2, zh: '玩具架解難', en: 'Shelf puzzle' },
  { key: 'F4R3', floor: 4, idx: 3, zh: '迷路走廊', en: 'Maze corridor' },
  { key: 'F4R4', floor: 4, idx: 4, zh: '巴士站', en: 'Bus stop' },
  { key: 'F4R5', floor: 4, idx: 5, zh: '龍的寶庫', en: 'Dragon vault', boss: true },
];
export const roomByKey = key => ROOMS.find(r => r.key === key) || null;
export const roomsOf = floor => ROOMS.filter(r => r.floor === floor).map(r => r.key);
/** The next room in play order (crosses floors: F1R6 → F2R1), or null after the boss. */
export function nextRoom(key) {
  const i = ROOMS.findIndex(r => r.key === key);
  return i >= 0 && i < ROOMS.length - 1 ? ROOMS[i + 1].key : null;
}

/** Spec §3 support level by room: 3 = full support (S3) … 1 = least (S1). */
export const DEFAULT_LEVEL = Object.fromEntries(ROOMS.map(r => [r.key,
  r.floor === 4 ? (r.idx === 1 ? 2 : 1) : ({ 1: 3, 2: 3, 3: 2, 4: 2, 5: 1, 6: 1 })[r.idx]]));
/** Adaptive rule: 3+ mistakes in the previous room keeps its level when that is more support. */
export function levelFor(key, prevMistakes = 0, prevLevel) {
  const d = DEFAULT_LEVEL[key];
  return prevMistakes >= 3 && prevLevel ? Math.max(d, prevLevel) : d;
}

/** Floor family pools for review / warm-up clues. */
function reviewClue(floors, level, rng) {
  const fam = FAMILY_OF_FLOOR[pick(floors, rng)];
  return rng() < 0.5
    ? make(() => genChoose(fam, level, rng, POOLS[fam]), { review: true })
    : make(() => genGo(fam, level, rng, { keyTwist: false }), { review: true });
}
const reviews = (floor, level, rng) => {
  const earlier = FLOORS.filter(f => f < floor && f < 4);
  return [reviewClue(earlier, level, rng), reviewClue(earlier, level, rng)];
};

/** F2R3: one queue for 4 place clues; it turns round before clue 3 (clue.turned = true). */
function turnRoomClues(level, rng) {
  for (let t = 0; t < 20; t++) {
    const base = placesScene('fb', level, SLIMES.slice(0, 3), rng);
    const turned = turnRound(base);
    const out = [];
    for (const sc of [base, base, turned, turned]) {
      let c = null;
      for (let k = 0; k < 10 && !c; k++) {
        const g = genPlace('fb', level, rng, { scene: sc, items: SLIMES });
        try { if (g) { validateClue(g); c = g; } } catch { /* try again */ }
      }
      if (!c) break;
      out.push(c);
    }
    if (out.length === 4) { out[2].turned = true; return out; }
  }
  throw new Error('F2R3 generation failed');
}

/** Room recipes (spec §2). Each returns the clue list for a level. */
const RECIPES = {
  F1R1: (L, r) => [
    make(() => genChoose('side', L, r, WALL)), make(() => genChoose('side', L, r, WALL)),
    make(() => genChoose('lr', L, r, WALL)), make(() => genChoose('lr', L, r, WALL)),
  ],
  F1R2: (L, r) => times(4, () => make(() => genGo('lr', L, r, { pool: ROW_STUFF }))),
  F1R3: (L, r) => times(4, () => make(() => genPlace('lr', L, r, { pool: WEAPONS.concat('torch'), items: WEAPONS }))),
  F1R4: (L, r) => [...times(3, () => make(() => genJudge('lr', L, r, { pool: JUDGE_ROW }))), ...times(2, () => make(() => genSelect('lr', L, r, { pool: JUDGE_ROW })))],
  F1R5: (L, r) => [make(() => genMake('lr', L, r)), make(() => genMake('lr', L, r)),
    ...times(2, () => make(() => genGo('lr', L, r, { pool: ROW_STUFF, onlyBetween: true })))],
  F1R6: (L, r) => [4, 6, 8].map(n => make(() => genWave('lr', n, L, r))),

  F2R1: (L, r) => [...reviews(2, L, r), ...times(3, () => make(() => genChoose('fb', L, r, SLIMES)))],
  F2R2: (L, r) => times(4, () => make(() => genGo('fb', L, r, { keyTwist: false }))),
  F2R3: (L, r) => turnRoomClues(L, r),
  F2R4: (L, r) => [...times(3, () => make(() => genJudge('fb', L, r))), ...times(2, () => make(() => genSelect('fb', L, r)))],
  F2R5: (L, r) => [make(() => genMake('fb', L, r)), make(() => genMake('fb', L, r)),
    ...times(2, () => make(() => genGo('fb', L, r, { onlyBetween: true, keyTwist: false })))],

  F3R1: (L, r) => [...reviews(3, L, r), ...times(3, () => make(() => genChoose('ud', L, r, COLUMN_STUFF)))],
  F3R2: (L, r) => times(4, () => make(() => genGo('ud', L, r, { pool: ['crate', 'barrel', 'book', 'helmet', ...CHESTS] }))),
  F3R3: (L, r) => times(4, () => make(() => genPlace('ud', L, r, { pool: SHELF_STUFF, items: ['potionRed', 'potionBlue', 'potionGreen', 'book', 'helmet'] }))),
  F3R4: (L, r) => [...times(3, () => make(() => genJudge('ud', L, r, { pool: COLUMN_STUFF }))), ...times(2, () => make(() => genSelect('ud', L, r, { pool: COLUMN_STUFF })))],
  F3R5: (L, r) => [make(() => genMake('ud', L, r)), make(() => genMake('ud', L, r)),
    ...times(2, () => make(() => genGo('ud', L, r, { pool: TOWER, onlyBetween: true })))],
  F3R6: (L, r) => [4, 6, 8].map(n => make(() => genWave('ud', n, L, r))),

  F4R1: (L, r) => [...reviews(4, L, r), ...times(3, () => reviewClue([1, 2, 3], L, r)).map(c => { delete c.review; return c; })],
  F4R2: (L, r) => [make(() => genSolve(2, L, r)), make(() => genSolve(3, L, r))],
  F4R3: (L, r) => shuffle(['lr', 'fb', 'ud', pick(['lr', 'fb', 'ud'], r)], r)
    .map(fam => make(() => genGo(fam, L, r, { between: true }), { chain: true })),
  F4R4: (L, r) => [...times(3, () => make(() => genJudge('fb', L, r))), ...times(2, () => make(() => genSelect('fb', L, r, { between: true })))],
  F4R5: (L, r) => times(3, () => make(() => genRiddle(L, r))),
};
function times(n, f) { return Array.from({ length: n }, f); }

/**
 * Generate a room's clues. Every clue passes validateClue and carries `level`.
 * level 3: 2–3 candidate places; level 2: 3–4; level 1: 5+ (lines and shelves get longer).
 * R1 of floors 2–4 starts with 2 review clues (clue.review = true). F1R6/F3R6: 3 waves of 4, 6, 8.
 * F2R3: clue 3 has turned = true (the queue turned round). F4R3: clue.chain = true (maze doors).
 */
export function genRoom(key, rng, level = DEFAULT_LEVEL[key]) {
  const recipe = RECIPES[key];
  if (!recipe) throw new Error(`unknown room ${key}`);
  roomWords = new Set();
  let clues;
  try { clues = recipe(level, rng); } finally { roomWords = null; }
  for (const c of clues) c.level = level;
  return { key, level, clues };
}

/**
 * Rush: an endless list. Waves cycle lr → ud → mix, each one monster longer (4 up to 12),
 * with one 'pick' 之間 clue after every wave. clue.wave = wave number (0, 1, …) for speed.
 */
export function genRush(rng) {
  const modes = ['lr', 'ud', 'mix'];
  let w = 0, pickNext = false;
  return {
    next() {
      if (pickNext) { pickNext = false; return make(() => genRushPick(rng)); }
      pickNext = true;
      const n = Math.min(12, 4 + w);
      const c = make(() => genWave(modes[w % 3], n, 1, rng), { wave: w });
      w++;
      return c;
    },
  };
}

// ======================================================================
// grading and rewards
// ======================================================================

/** Hint ladder: 1 replay, 2 glow + arrow, 3 show the answer (and move on). */
export const hintStep = wrongTries => Math.max(0, Math.min(3, wrongTries | 0));
/** Mistakes for one clue: one per wrong try; an answer shown by Fu-fu counts 3. */
export const mistakesFor = (wrongTries, shown) => (shown ? 3 : wrongTries);
/** 0 → 3★, 1–2 → 2★, else 1★. */
export const starsFor = mistakes => (mistakes === 0 ? 3 : mistakes <= 2 ? 2 : 1);
/** +1 coin per right answer in R1, R2 (every floor) and wave rooms; else 0. */
export function coinsPerAnswer(key) {
  const r = roomByKey(key);
  return r && (r.idx <= 2 || r.wave) ? 1 : 0;
}
/** End-of-room chest: R3–R5 and every floor-4 room (not waves): 5 + 2 × stars; else 0. */
export function chestCoins(key, stars) {
  const r = roomByKey(key);
  if (!r || r.wave) return 0;
  return r.floor === 4 || (r.idx >= 3 && r.idx <= 5) ? 5 + 2 * stars : 0;
}
export const FLOOR_BONUS = 10;
/** Free look on the first clear of each floor (floor 4's comes with the boss). */
export const FLOOR_LOOK = { 1: 'helmetHorned', 2: 'petSlime', 3: 'helmetCrown', 4: 'petDragon' };
/**
 * Costume pieces inside some end chests: fixed rooms, given on the first clear only (replays give coins).
 * Chest-only items (SHOP price null, earnedBy 'chest'); the chest shows the piece's silhouette before it opens.
 */
export const CHEST_LOOKS = {
  F1R3: 'helmetCap', F1R5: 'petChick', F2R3: 'helmetFlower', F2R5: 'petBunny',
  F3R3: 'helmetPirate', F3R5: 'petFrog', F4R3: 'helmetGold',
};
/** 'gold' all 3★, 'silver' average ≥ 2★, 'bronze' finished, null not cleared. */
export function floorMedal(progress, floor) {
  const keys = roomsOf(floor), st = keys.map(k => (progress.stars || {})[k] || 0);
  if (st.some(s => s < 1)) return null;
  if (st.every(s => s === 3)) return 'gold';
  return st.reduce((a, b) => a + b, 0) / st.length >= 2 ? 'silver' : 'bronze';
}

// ======================================================================
// hero and shop
// ======================================================================

export const SKINS = ['#ffe0c4', '#f6c9a0', '#e0a878', '#c68a5a', '#9a6440', '#6b4428'];
export const HAIR_STYLES = ['short', 'spiky', 'bob', 'long', 'buns'];
export const HAIR_COLOURS = ['#2b2118', '#5a3a22', '#a0642c', '#e0b050', '#c8452c', '#7a7f8c'];
export const TUNICS = ['#d94c4c', '#e8903a', '#e8c94a', '#5bb35b', '#3fa7c9', '#4a6fd6', '#9a5bd6', '#e06fa8'];
export const HERO_NAMES = [
  { zh: '勇勇', en: 'Brave' }, { zh: '叮叮', en: 'Ding-ding' }, { zh: '星星', en: 'Star' }, { zh: '閃閃', en: 'Shiny' },
  { zh: '樂樂', en: 'Happy' }, { zh: '跳跳', en: 'Hoppy' }, { zh: '小虎', en: 'Tiger' }, { zh: '小熊', en: 'Bear' },
  { zh: '豆豆', en: 'Bean' }, { zh: '朗朗', en: 'Bright' }, { zh: '晴晴', en: 'Sunny' }, { zh: '寶寶', en: 'Treasure' },
];
/** hero.name = { i: index into HERO_NAMES, n: 1..99 } → '勇勇 3'; '' when not set. */
export const heroName = hero => (hero && hero.name && HERO_NAMES[hero.name.i] ? `${HERO_NAMES[hero.name.i].zh} ${hero.name.n}` : '');

/** Fixed prices, nothing random. petDragon only from beating the boss. */
export const SHOP = [
  { id: 'helmetPlain',  slot: 'helmet', zh: '頭盔',   en: 'Plain helm',  price: 10 },
  { id: 'helmetHood',   slot: 'helmet', zh: '斗篷帽', en: 'Hood',        price: 12 },
  { id: 'helmetHorned', slot: 'helmet', zh: '角頭盔', en: 'Horned helm', price: 15 },
  { id: 'helmetWizard', slot: 'helmet', zh: '巫師帽', en: 'Wizard hat',  price: 20 },
  { id: 'helmetCrown',  slot: 'helmet', zh: '皇冠',   en: 'Crown',       price: 25 },
  { id: 'petSlime',     slot: 'pet',    zh: '小史萊姆', en: 'Slime',     price: 15 },
  { id: 'petGhost',     slot: 'pet',    zh: '小幽靈', en: 'Ghost',       price: 20 },
  { id: 'petCat',       slot: 'pet',    zh: '小貓',   en: 'Cat',         price: 25 },
  { id: 'petOwlet',     slot: 'pet',    zh: '小貓頭鷹', en: 'Owlet',     price: 30 },
  { id: 'petDragon',    slot: 'pet',    zh: '小龍',   en: 'Baby dragon', price: null, earnedBy: 'boss' },
  // chest-only pieces (CHEST_LOOKS)
  { id: 'helmetCap',    slot: 'helmet', zh: '紅帽子', en: 'Red cap',     price: null, earnedBy: 'chest' },
  { id: 'helmetFlower', slot: 'helmet', zh: '花環',   en: 'Flower crown', price: null, earnedBy: 'chest' },
  { id: 'helmetPirate', slot: 'helmet', zh: '海盜帽', en: 'Pirate hat',  price: null, earnedBy: 'chest' },
  { id: 'helmetGold',   slot: 'helmet', zh: '金頭盔', en: 'Gold helm',   price: null, earnedBy: 'chest' },
  { id: 'petChick',     slot: 'pet',    zh: '小雞',   en: 'Chick',       price: null, earnedBy: 'chest' },
  { id: 'petBunny',     slot: 'pet',    zh: '小兔',   en: 'Bunny',       price: null, earnedBy: 'chest' },
  { id: 'petFrog',      slot: 'pet',    zh: '小青蛙', en: 'Frog',        price: null, earnedBy: 'chest' },
];
export const LATER_SLOTS = ['cape', 'badge', 'trail'];

const emptyEquipped = () => ({ helmet: null, pet: null, cape: null, badge: null, trail: null });
const norm = p => ({
  ...emptyProgress(), ...p,
  stars: { ...((p && p.stars) || {}) }, looks: ((p && p.looks) || []).slice(),
  equipped: { ...emptyEquipped(), ...((p && p.equipped) || {}) }, floorBonus: ((p && p.floorBonus) || []).slice(),
});

/** Buy a shop item. reason: 'notForSale' (unknown, boss or chest only), 'owned', 'price' (not enough coins). */
export function buy(progress, id) {
  const item = SHOP.find(s => s.id === id);
  if (!item || item.price === null) return { ok: false, progress, reason: 'notForSale' };
  if ((progress.looks || []).includes(id)) return { ok: false, progress, reason: 'owned' };
  if ((progress.coins || 0) < item.price) return { ok: false, progress, reason: 'price' };
  const p = norm(progress);
  p.coins -= item.price;
  p.looks.push(id);
  return { ok: true, progress: p };
}
/** Wear an owned item in its slot (or null to take it off). Not owned / wrong slot → unchanged. */
export function equip(progress, slot, id) {
  if (!(slot in emptyEquipped())) return progress;
  if (id !== null) {
    const item = SHOP.find(s => s.id === id);
    if (!item || item.slot !== slot || !(progress.looks || []).includes(id)) return progress;
  }
  const p = norm(progress);
  p.equipped[slot] = id;
  return p;
}

// ======================================================================
// progress
// ======================================================================

export const emptyProgress = () => ({ stars: {}, coins: 0, hero: null, looks: [], equipped: emptyEquipped(), floorBonus: [] });

/** All rooms of the floor have ≥ 1★. */
export const isFloorCleared = (p, floor) => roomsOf(floor).every(k => ((p && p.stars) || {})[k] >= 1);

/**
 * Record a finished room. Best stars kept; coins added. The first clear of a whole floor adds
 * FLOOR_BONUS once (floorBonus list) and FLOOR_LOOK[floor]; the boss's first clear adds petDragon;
 * the first clear of a CHEST_LOOKS room adds that costume piece (chestLook).
 * @returns {{progress, newBest:boolean, floorCleared:number|null, bonus:number, chestLook:string|null}}
 */
export function recordResult(progress, key, stars, coins = 0) {
  const p = norm(progress);
  const prev = p.stars[key] || 0;
  p.stars[key] = Math.max(prev, stars);
  p.coins += coins;
  const addLook = id => { if (id && !p.looks.includes(id)) p.looks.push(id); };
  if (key === 'F4R5' && prev === 0 && stars > 0) addLook('petDragon');
  const chestLook = prev === 0 && stars > 0 && CHEST_LOOKS[key] && !p.looks.includes(CHEST_LOOKS[key]) ? CHEST_LOOKS[key] : null;
  addLook(chestLook);
  const room = roomByKey(key);
  let floorCleared = null, bonus = 0;
  if (room && isFloorCleared(p, room.floor) && !p.floorBonus.includes(room.floor)) {
    floorCleared = room.floor;
    bonus = FLOOR_BONUS;
    p.coins += bonus;
    p.floorBonus.push(room.floor);
    addLook(FLOOR_LOOK[room.floor]);
  }
  return { progress: p, newBest: stars > prev, floorCleared, bonus, chestLook };
}

/** Merge two copies (e.g. Firestore + localStorage): stars max per room, coins max, looks and floorBonus union, hero/equipped b's if set. */
export function mergeProgress(a, b) {
  if (!b) return a;
  if (!a) return b;
  const A = norm(a), B = norm(b);
  const stars = { ...A.stars };
  for (const [k, v] of Object.entries(B.stars)) stars[k] = Math.max(stars[k] || 0, v);
  return {
    ...A, ...B, stars,
    coins: Math.max(A.coins || 0, B.coins || 0),
    looks: [...new Set([...A.looks, ...B.looks])],
    floorBonus: [...new Set([...A.floorBonus, ...B.floorBonus])],
    hero: b.hero || a.hero || null,
    equipped: b.equipped ? B.equipped : A.equipped,
  };
}

// ======================================================================
// unlocks   unlock = settings.dungeonUnlock { f1..f4 }
// ======================================================================

/** Ticked by the teacher, and (floor 2+) the floor before is cleared. Test mode opens everything. */
export function isFloorOpen(p, floor, unlock, testMode) {
  if (testMode) return true;
  if (!unlock || !unlock[`f${floor}`]) return false;
  return floor === 1 || isFloorCleared(p, floor - 1);
}
/** Floor open, and the room before in that floor has ≥ 1★. */
export function isRoomOpen(p, key, unlock, testMode) {
  if (testMode) return true;
  const r = roomByKey(key);
  if (!r || !isFloorOpen(p, r.floor, unlock, false)) return false;
  const keys = roomsOf(r.floor), i = keys.indexOf(key);
  return i === 0 || (((p && p.stars) || {})[keys[i - 1]] || 0) >= 1;
}
/** Floor 4 cleared and ticked. */
export const isRushOpen = (p, unlock, testMode) => !!testMode || (!!unlock && !!unlock.f4 && isFloorCleared(p, 4));
