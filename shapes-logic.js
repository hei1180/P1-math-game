// Robot Workshop rules. Pure: no imports, no DOM, no three.js. Unit tested in tests/shapes-logic.test.mjs.
// Answers are always graded here; three.js / physics only animate what this file decides.

// ---------- Solids (1S1) ----------
export const FAMILIES = ['prism', 'cylinder', 'pyramid', 'cone', 'sphere'];
export const FAMILY = {
  prism:    { zh: '角柱', en: 'prism',    friend: 'Blocky', friendZh: '方方' },
  cylinder: { zh: '圓柱', en: 'cylinder', friend: 'Rolly',  friendZh: '滾滾' },
  pyramid:  { zh: '角錐', en: 'pyramid',  friend: 'Peak',   friendZh: '尖尖' },
  cone:     { zh: '圓錐', en: 'cone',     friend: 'Dizzy',  friendZh: '暈暈' },
  sphere:   { zh: '球',   en: 'sphere',   friend: 'Bobo',   friendZh: '波波' },
};

/** Concrete 3-D models. Every prism is just 角柱 and every pyramid just 角錐 (no type names in P1). */
export const MODELS = {
  cube: { family: 'prism' }, cuboid: { family: 'prism' }, triPrism: { family: 'prism' }, hexPrism: { family: 'prism' },
  cylinder: { family: 'cylinder' },
  sqPyramid: { family: 'pyramid' }, triPyramid: { family: 'pyramid' },
  cone: { family: 'cone' },
  sphere: { family: 'sphere' },
};
export const MODEL_IDS = Object.keys(MODELS);
export const familyOf = id => MODELS[id].family;

/** 'upright' = standing on its base; 'side' = lying on its curved side (cylinder and cone only). Never oblique. */
export const posesOf = id => (['cylinder', 'cone'].includes(familyOf(id)) ? ['upright', 'side'] : ['upright']);
export function rolls(id, pose = 'upright') {
  const f = familyOf(id);
  if (f === 'sphere') return true;
  if (f === 'cylinder' || f === 'cone') return pose === 'side';
  return false;
}
/** How a rolling solid moves: 'any' (sphere), 'straight' (cylinder on its side), 'circle' (cone on its side), null = slides. */
export function rollStyle(id, pose = 'upright') {
  if (!rolls(id, pose)) return null;
  const f = familyOf(id);
  return f === 'sphere' ? 'any' : f === 'cone' ? 'circle' : 'straight';
}
/** Standing upright: is the top flat (something can sit on it)? */
export const topIsFlat = id => ['prism', 'cylinder'].includes(familyOf(id));
/** Standing upright: is the bottom flat (it can sit on something)? */
export const bottomIsFlat = id => familyOf(id) !== 'sphere';
/** Tower rule: piece can go on `below` (upright); only the last piece may have a pointy or round top. */
export function canPlace(piece, below, isLast) {
  return topIsFlat(below) && bottomIsFlat(piece) && (isLast || topIsFlat(piece));
}

/** Mystery-bag facts. Every family has a different row, so clues can always pin one down. */
export const FACTS = {
  prism:    { rolls: false, apex: false, allFlat: true,  circleFace: false },
  pyramid:  { rolls: false, apex: true,  allFlat: true,  circleFace: false },
  cylinder: { rolls: true,  apex: false, allFlat: false, circleFace: true },
  cone:     { rolls: true,  apex: true,  allFlat: false, circleFace: true },
  sphere:   { rolls: true,  apex: false, allFlat: false, circleFace: false },
};
export const FACT_KEYS = ['rolls', 'apex', 'allFlat', 'circleFace'];
export const CLUE_TEXT = {
  rolls:      { true: { zh: '我會滾', en: 'I can roll' },               false: { zh: '我不會滾', en: "I can't roll" } },
  apex:       { true: { zh: '我有尖頂', en: 'I have a pointy top' },     false: { zh: '我沒有尖頂', en: 'No pointy top' } },
  allFlat:    { true: { zh: '我全部面都是平的', en: 'All my faces are flat' }, false: { zh: '我有彎彎的面', en: 'I have a curved face' } },
  circleFace: { true: { zh: '我有圓形的面', en: 'I have a circle face' }, false: { zh: '我沒有圓形的面', en: 'No circle face' } },
};
export const candidatesFor = clues => FAMILIES.filter(f => clues.every(c => FACTS[f][c.fact] === c.value));
/** Clues (in reveal order) that narrow the 5 families down to `family`. Skips clues that rule nothing out. */
export function clueSequence(family, rng = Math.random) {
  const clues = [];
  let left = FAMILIES.slice();
  for (const fact of shuffle(FACT_KEYS, rng)) {
    const value = FACTS[family][fact];
    const next = left.filter(f => FACTS[f][fact] === value);
    if (next.length < left.length) { clues.push({ fact, value }); left = next; }
    if (left.length === 1) break;
  }
  return clues;
}

/** Everyday objects for A4 / Rush 3-D (built from primitives in shapes/models/objects.js, no photos). */
export const OBJECTS = [
  { id: 'can',         zh: '汽水罐',     en: 'drink can',     family: 'cylinder' },
  { id: 'drum',        zh: '鼓',         en: 'drum',          family: 'cylinder' },
  { id: 'ball',        zh: '皮球',       en: 'ball',          family: 'sphere' },
  { id: 'globe',       zh: '地球儀',     en: 'globe',         family: 'sphere' },
  { id: 'partyHat',    zh: '派對帽',     en: 'party hat',     family: 'cone' },
  { id: 'trafficCone', zh: '雪糕筒',     en: 'traffic cone',  family: 'cone' },
  { id: 'dice',        zh: '骰子',       en: 'dice',          family: 'prism' },
  { id: 'tissueBox',   zh: '紙巾盒',     en: 'tissue box',    family: 'prism' },
  { id: 'tent',        zh: '帳篷',       en: 'tent',          family: 'prism' },
  { id: 'pencilBox',   zh: '筆盒',       en: 'pencil box',    family: 'prism' },
  { id: 'paperweight', zh: '金字塔擺設', en: 'pyramid paperweight', family: 'pyramid' },
  { id: 'teaBag',      zh: '三角茶包',   en: 'pyramid tea bag', family: 'pyramid' },
];
export const objectById = id => OBJECTS.find(o => o.id === id);

// ---------- Flat shapes (1S2) ----------
const r3 = v => Math.round(v * 1000) / 1000;
const regular = n => Array.from({ length: n }, (_, i) => {
  const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
  return [r3(Math.cos(a)), r3(Math.sin(a))];
});
/** Tile outlines in a 2×2 box centred on 0 (y down). `sides` must equal countSides(points). Colour is never tied to type. */
export const TILE_TEMPLATES = [
  { id: 'tri-eq',     sides: 3, points: regular(3) },
  { id: 'tri-right',  sides: 3, points: [[-1, 1], [1, 1], [-1, -1]], irregular: true },
  { id: 'tri-thin',   sides: 3, points: [[-1, 0.6], [1, 0.6], [0.4, -1]], irregular: true },
  { id: 'quad-square', sides: 4, points: [[-1, -1], [1, -1], [1, 1], [-1, 1]] },
  { id: 'quad-rect',  sides: 4, points: [[-1, -0.5], [1, -0.5], [1, 0.5], [-1, 0.5]] },
  { id: 'quad-kite',  sides: 4, points: [[0, -1], [0.6, -0.2], [0, 1], [-0.6, -0.2]], irregular: true },
  { id: 'quad-odd',   sides: 4, points: [[-1, -0.6], [0.8, -1], [1, 0.7], [-0.5, 1]], irregular: true },
  { id: 'quad-dart',  sides: 4, points: [[0, -1], [1, 1], [0, 0.3], [-1, 1]], irregular: true, dented: true },
  { id: 'pent-reg',   sides: 5, points: regular(5) },
  { id: 'pent-house', sides: 5, points: [[0, -1], [1, -0.2], [1, 1], [-1, 1], [-1, -0.2]], irregular: true },
  { id: 'pent-dent',  sides: 5, points: [[-1, -1], [1, -1], [1, 1], [0, 0.2], [-1, 1]], irregular: true, dented: true },
  { id: 'hex-reg',    sides: 6, points: regular(6) },
  { id: 'hex-long',   sides: 6, points: [[-1, 0], [-0.5, -0.6], [0.5, -0.6], [1, 0], [0.5, 0.6], [-0.5, 0.6]], irregular: true },
  { id: 'hex-L',      sides: 6, points: [[-1, -1], [0, -1], [0, 0], [1, 0], [1, 1], [-1, 1]], irregular: true, dented: true },
  { id: 'circle',     sides: 0, circle: true },
];
export const templateById = id => TILE_TEMPLATES.find(t => t.id === id);
/** B2 / Rush 2-D answer: number of sides, or 'circle'. */
export const tileAnswer = t => (t.circle ? 'circle' : t.sides);
export const TILE_ANSWERS = [3, 4, 5, 6, 'circle'];
export const ANSWER_TEXT = {
  3: { zh: '三角形', en: '3 sides' }, 4: { zh: '四邊形', en: '4 sides' }, 5: { zh: '五邊形', en: '5 sides' },
  6: { zh: '六邊形', en: '6 sides' }, circle: { zh: '圓形', en: 'circle' },
};

// ---------- Polygon geometry (pegboard, B3) ----------
const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
const sgn = v => (v > 1e-9 ? 1 : v < -1e-9 ? -1 : 0);
const same = (a, b) => a[0] === b[0] && a[1] === b[1];
/**
 * Drop repeated points and straight-through corners (a peg the band passes straight over).
 * Returns null when the band doubles back on itself along a line.
 */
export function simplify(points) {
  let p = points.filter((q, i) => i === 0 || !same(q, points[i - 1]));
  if (p.length > 1 && same(p[0], p[p.length - 1])) p = p.slice(0, -1);
  let changed = true;
  while (changed && p.length >= 3) {
    changed = false;
    for (let i = 0; i < p.length; i++) {
      const a = p[(i - 1 + p.length) % p.length], b = p[i], c = p[(i + 1) % p.length];
      if (sgn(cross(a, b, c)) !== 0) continue;
      const dot = (b[0] - a[0]) * (c[0] - b[0]) + (b[1] - a[1]) * (c[1] - b[1]);
      if (dot <= 0) return null; // doubles back
      p.splice(i, 1); changed = true; break;
    }
  }
  return p;
}
export function countSides(points) {
  const p = simplify(points);
  return p && p.length >= 3 ? p.length : 0;
}
const onSeg = (p, q, r) => Math.min(p[0], r[0]) <= q[0] && q[0] <= Math.max(p[0], r[0]) && Math.min(p[1], r[1]) <= q[1] && q[1] <= Math.max(p[1], r[1]);
/** Do segments p1q1 and p2q2 meet (touching counts)? */
export function segmentsMeet(p1, q1, p2, q2) {
  const o1 = sgn(cross(p1, q1, p2)), o2 = sgn(cross(p1, q1, q2)), o3 = sgn(cross(p2, q2, p1)), o4 = sgn(cross(p2, q2, q1));
  if (o1 !== o2 && o3 !== o4) return true;
  return (o1 === 0 && onSeg(p1, p2, q1)) || (o2 === 0 && onSeg(p1, q2, q1)) || (o3 === 0 && onSeg(p2, p1, q2)) || (o4 === 0 && onSeg(p2, q1, q2));
}
/** Simple polygon: no two non-neighbouring sides meet (so no crossing and no touching at a peg). */
export function isSimplePolygon(p) {
  const n = p.length;
  if (n < 3) return false;
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    if (j === i + 1 || (i === 0 && j === n - 1)) continue;
    if (segmentsMeet(p[i], p[(i + 1) % n], p[j], p[(j + 1) % n])) return false;
  }
  return true;
}
export const polygonArea = p => Math.abs(p.reduce((s, a, i) => { const b = p[(i + 1) % p.length]; return s + a[0] * b[1] - b[0] * a[1]; }, 0)) / 2;
/**
 * Grade a pegboard band. band = { points: [[x,y],...] peg coords in tap order, closed: bool }.
 * reason: null | 'open' | 'flat' | 'crossing' | 'wrong-sides'.
 */
export function checkPeg(band, target) {
  if (!band.closed) return { ok: false, sides: 0, reason: 'open' };
  const pts = band.points;
  if (pts.length < 3 || pts.every(q => sgn(cross(pts[0], pts[1], q)) === 0)) return { ok: false, sides: 0, reason: 'flat' };
  const p = simplify(pts);
  if (p === null) return { ok: false, sides: 0, reason: 'crossing' };
  if (p.length < 3) return { ok: false, sides: 0, reason: 'flat' };
  if (!isSimplePolygon(p)) return { ok: false, sides: p.length, reason: 'crossing' };
  if (polygonArea(p) === 0) return { ok: false, sides: 0, reason: 'flat' };
  return { ok: p.length === target, sides: p.length, reason: p.length === target ? null : 'wrong-sides' };
}
export const PEG_GRID = 5; // pegs 0..4 in x and y

// ---------- Silhouette puzzles (B4) ----------
// Grid cells (x, y), y down. Each cell has 4 quarter-triangles n/e/s/w meeting at its centre, plus 'c' for a
// round socket. A key is 'x,y,q'. Tiles turn in 90° steps (r = 0..3, clockwise).
const ALLQ = ['n', 'e', 's', 'w'];
export const PIECES = {
  sq:     { zh: '四邊形', kind: 4, cells: [[0, 0, ALLQ]] },
  rect:   { zh: '長四邊形', kind: 4, cells: [[0, 0, ALLQ], [1, 0, ALLQ]] },
  bigsq:  { zh: '大四邊形', kind: 4, cells: [[0, 0, ALLQ], [1, 0, ALLQ], [0, 1, ALLQ], [1, 1, ALLQ]] },
  tri:    { zh: '三角形', kind: 3, cells: [[0, 0, ['s', 'w']]] },
  bigtri: { zh: '大三角形', kind: 3, cells: [[0, 1, ALLQ], [0, 0, ['s', 'w']], [1, 1, ['s', 'w']]] },
  circle: { zh: '圓形', kind: 'circle', cells: [[0, 0, ['c']]] },
};
export const PIECE_IDS = Object.keys(PIECES);
const ROTQ = { n: 'e', e: 's', s: 'w', w: 'n', c: 'c' };
/** Keys covered by piece `id` with its top-left at (x, y) after r clockwise quarter turns. */
export function footprint(id, x, y, r = 0) {
  let cells = PIECES[id].cells.flatMap(([dx, dy, qs]) => qs.map(q => [dx, dy, q]));
  for (let k = 0; k < ((r % 4) + 4) % 4; k++) cells = cells.map(([dx, dy, q]) => [-dy, dx, ROTQ[q]]);
  const mx = Math.min(...cells.map(c => c[0])), my = Math.min(...cells.map(c => c[1]));
  return cells.map(([dx, dy, q]) => `${x + dx - mx},${y + dy - my},${q}`);
}
const solved = (id, zh, en, solution) => ({ id, zh, en, solution, cells: [...new Set(solution.flatMap(s => footprint(s.p, s.x, s.y, s.r)))] });
/** Outlines are the union of a known solution, so every puzzle is solvable. Pieces offered = solution pieces. */
export const PUZZLES = [
  solved('house', '小屋', 'house', [{ p: 'tri', x: 0, y: 0, r: 3 }, { p: 'tri', x: 1, y: 0, r: 0 }, { p: 'bigsq', x: 0, y: 1, r: 0 }]),
  solved('face', '機械人臉', 'robot face', [
    { p: 'circle', x: 1, y: 0, r: 0 }, { p: 'circle', x: 2, y: 0, r: 0 }, { p: 'bigsq', x: 1, y: 1, r: 0 },
    { p: 'tri', x: 0, y: 1, r: 3 }, { p: 'tri', x: 3, y: 1, r: 0 }]),
  solved('rocket', '火箭', 'rocket', [
    { p: 'tri', x: 1, y: 0, r: 3 }, { p: 'tri', x: 2, y: 0, r: 0 }, { p: 'bigsq', x: 1, y: 1, r: 0 },
    { p: 'tri', x: 0, y: 2, r: 3 }, { p: 'tri', x: 3, y: 2, r: 0 }]),
  solved('boat', '小船', 'boat', [
    { p: 'bigtri', x: 1, y: 0, r: 0 }, { p: 'rect', x: 0, y: 2, r: 0 }, { p: 'rect', x: 2, y: 2, r: 0 }]),
];
export const puzzleById = id => PUZZLES.find(p => p.id === id);
/** Can piece go at (x,y,r) given the set of already covered keys? */
export function checkDrop(puzzle, covered, id, x, y, r) {
  const keys = footprint(id, x, y, r);
  const inside = new Set(puzzle.cells);
  const ok = keys.every(k => inside.has(k) && !covered.has(k));
  return { ok, keys };
}
export const isPuzzleDone = (puzzle, covered) => puzzle.cells.every(k => covered.has(k));

// ---------- Robots, boss jobs ----------
export const WHEEL_CHOICES = ['sphere', 'cylinder', 'cube', 'cone'];
export const BODY_CHOICES = ['cuboid', 'sphere', 'sqPyramid', 'cylinder'];
export const HEAD_CHOICES = ['sphere', 'cube', 'cone', 'sqPyramid', 'cylinder'];
const HEAD_NEEDS = [{ fact: 'apex', value: true }, { fact: 'apex', value: false }, { fact: 'circleFace', value: true }, { fact: 'allFlat', value: true }];
/**
 * Test-drive result, first failure in driving order (wheels → body → head → panel).
 * fail: null | 'wheels-flat' | 'wheels-sphere' | 'wheels-cone' | 'body-top' | 'head-rolls' | 'head-wrong' | 'panel'
 */
export function checkBuild(job, build) {
  const wf = familyOf(build.wheels);
  if (wf === 'sphere') return { ok: false, fail: 'wheels-sphere' };
  if (wf === 'cone') return { ok: false, fail: 'wheels-cone' };
  if (!rolls(build.wheels, 'side')) return { ok: false, fail: 'wheels-flat' };
  if (!topIsFlat(build.body)) return { ok: false, fail: 'body-top' };
  if (!bottomIsFlat(build.head)) return { ok: false, fail: 'head-rolls' };
  if (FACTS[familyOf(build.head)][job.head.fact] !== job.head.value) return { ok: false, fail: 'head-wrong' };
  if (tileAnswer(templateById(build.panel)) !== job.panel) return { ok: false, fail: 'panel' };
  return { ok: true, fail: null };
}
const polyTemplatesWith = n => TILE_TEMPLATES.filter(t => !t.circle && t.sides === n);
/** 3 job cards: different window sides, different head needs; each offers 4 panels incl. ≥1 right one. */
export function genBoss(rng = Math.random) {
  const sides = shuffle([3, 4, 5, 6], rng).slice(0, 3);
  const heads = shuffle(HEAD_NEEDS, rng).slice(0, 3);
  return sides.map((panel, i) => {
    const right = pick(polyTemplatesWith(panel), rng).id;
    const others = shuffle(TILE_TEMPLATES.filter(t => !t.circle && t.sides !== panel), rng).slice(0, 3).map(t => t.id);
    return { kind: 'job', panel, head: heads[i], panels: shuffle([right, ...others], rng) };
  });
}

// ---------- Courses ----------
export const COURSES = [
  { key: 'A1', zone: 'a', zh: '會滾嗎？', en: 'Roll or not' },
  { key: 'A2', zone: 'a', zh: '疊高塔', en: 'Stack tower' },
  { key: 'A3', zone: 'a', zh: '摸摸袋', en: 'Mystery bag' },
  { key: 'A4', zone: 'a', zh: '生活中的立體', en: 'Everyday solids' },
  { key: 'B1', zone: 'b', zh: '直線曲線', en: 'Straight or curved' },
  { key: 'B2', zone: 'b', zh: '吃板機', en: 'Panel Muncher' },
  { key: 'B3', zone: 'b', zh: '釘板', en: 'Pegboard' },
  { key: 'B4', zone: 'b', zh: '拼砌', en: 'Silhouette' },
];
export const ZONES = {
  a: { zh: '立體車房', en: 'Solid Garage', keys: ['A1', 'A2', 'A3', 'A4'], rush: 'shapes3d' },
  b: { zh: '平面工作枱', en: 'Panel Bench', keys: ['B1', 'B2', 'B3', 'B4'], rush: 'shapes2d' },
};
export const courseByKey = key => COURSES.find(c => c.key === key);
export const LINES = [
  { id: 'ruler', zh: '間尺', curved: false }, { id: 'chopstick', zh: '筷子', curved: false },
  { id: 'pencil', zh: '鉛筆', curved: false }, { id: 'stick', zh: '木棒', curved: false },
  { id: 'rainbow', zh: '彩虹', curved: true }, { id: 'snake', zh: '小蛇', curved: true },
  { id: 'hose', zh: '水喉', curved: true }, { id: 'wave', zh: '波浪', curved: true },
];

/** Items for one course. A1, A2, A3, A4, B1, B2: 5 items; B3: 4 targets; B4: 2 puzzles; boss: 3 jobs. */
export function genCourse(key, rng = Math.random) {
  switch (key) {
    case 'A1': {
      const combos = MODEL_IDS.flatMap(m => posesOf(m).map(pose => ({ kind: 'roll', model: m, pose, answer: rolls(m, pose) })));
      const yes = shuffle(combos.filter(c => c.answer), rng), no = shuffle(combos.filter(c => !c.answer), rng);
      return shuffle([yes[0], yes[1], no[0], no[1], rng() < 0.5 ? yes[2] : no[2]], rng);
    }
    case 'A2': {
      const steps = [{ tower: 0, isLast: false }, { tower: 0, isLast: true }, { tower: 1, isLast: false }, { tower: 1, isLast: false }, { tower: 1, isLast: true }];
      return steps.map(s => ({ kind: 'stack', ...s, tray: stackTray(s.isLast, rng) }));
    }
    case 'A3':
      return shuffle(FAMILIES, rng).map(family => ({ kind: 'bag', family, clues: clueSequence(family, rng), choices: FAMILIES.slice() }));
    case 'A4': {
      for (;;) {
        const objs = shuffle(OBJECTS, rng).slice(0, 5);
        if (new Set(objs.map(o => o.family)).size >= 3) return objs.map(o => ({ kind: 'object', object: o.id, answer: o.family }));
      }
    }
    case 'B1': {
      const straight = shuffle(LINES.filter(l => !l.curved), rng), curved = shuffle(LINES.filter(l => l.curved), rng);
      const sorts = shuffle([straight[0], curved[0], rng() < 0.5 ? straight[1] : curved[1]], rng)
        .map(l => ({ kind: 'line', line: l.id, answer: l.curved ? 'curved' : 'straight' }));
      return [...sorts, { kind: 'dots-connect' }, { kind: 'dots-howmany', answer: 'one' }];
    }
    case 'B2': {
      for (;;) {
        const tiles = Array.from({ length: 5 }, () => pick(TILE_TEMPLATES, rng));
        const answers = new Set(tiles.map(tileAnswer));
        if (answers.size >= 4 && tiles.some(t => t.irregular) && tiles.some(t => t.dented)) {
          return tiles.map(t => ({ kind: 'tile', tile: t.id, rot: Math.floor(rng() * 12) * 30, answer: tileAnswer(t) }));
        }
      }
    }
    case 'B3':
      return shuffle([3, 4, 5, 6], rng).map((target, i) => ({ kind: 'peg', target, prompt: i % 2 ? 'any' : 'make' }));
    case 'B4':
      return shuffle(PUZZLES, rng).slice(0, 2).map(p => ({ kind: 'puzzle', puzzle: p.id, pieces: shuffle(p.solution.map(s => s.p), rng) }));
    case 'boss':
      return genBoss(rng);
    default:
      throw new Error('unknown course ' + key);
  }
}
function stackTray(isLast, rng) {
  const good = MODEL_IDS.filter(m => bottomIsFlat(m) && (isLast || topIsFlat(m)));
  const bad = MODEL_IDS.filter(m => !good.includes(m));
  const g = shuffle(good, rng), b = shuffle(bad, rng);
  return shuffle([g[0], b[0], rng() < 0.5 && b[1] ? b[1] : g[1]], rng); // last step: only the sphere is bad
}

/** Rush items. 3-D: everyday object or solid → family. 2-D: tile → sides / circle. */
export function genRush3d(rng = Math.random) {
  if (rng() < 0.5) { const o = pick(OBJECTS, rng); return { kind: 'sort3d', object: o.id, answer: o.family }; }
  const model = pick(MODEL_IDS, rng);
  return { kind: 'sort3d', model, pose: pick(posesOf(model), rng), answer: familyOf(model) };
}
export function genRush2d(rng = Math.random) {
  const t = pick(TILE_TEMPLATES, rng);
  return { kind: 'sort2d', tile: t.id, rot: Math.floor(rng() * 12) * 30, answer: tileAnswer(t) };
}

// ---------- Stars, progress, unlocks ----------
export const starsFor = mistakes => (mistakes === 0 ? 3 : mistakes <= 2 ? 2 : 1);
export const PARTS = {
  A1: { id: 'wheels-star',    slot: 'wheels',  zh: '星星輪' },
  A2: { id: 'arms-spring',    slot: 'arms',    zh: '彈弓手' },
  A3: { id: 'head-tv',        slot: 'head',    zh: '電視頭' },
  A4: { id: 'paint-rainbow',  slot: 'paint',   zh: '彩虹油' },
  B1: { id: 'antenna-zigzag', slot: 'antenna', zh: '閃電天線' },
  B2: { id: 'head-dome',      slot: 'head',    zh: '圓頂頭' },
  B3: { id: 'arms-claw',      slot: 'arms',    zh: '夾夾手' },
  B4: { id: 'wheels-flower',  slot: 'wheels',  zh: '花花輪' },
  boss: { id: 'badge-gold',   slot: 'badge',   zh: '金章' },
};
export const SLOTS = ['wheels', 'head', 'arms', 'antenna', 'paint', 'badge'];
export const BASIC_PART = { wheels: 'wheels-basic', head: 'head-basic', arms: 'arms-basic', antenna: 'none', paint: 'paint-blue', badge: 'none' };
export const ROBOT_NAMES = [
  { zh: '叮叮', en: 'Ding-ding' }, { zh: '閃閃', en: 'Shiny' }, { zh: '咚咚', en: 'Dong-dong' }, { zh: '嘟嘟', en: 'Doo-doo' },
  { zh: '星星', en: 'Star' }, { zh: '雷雷', en: 'Zap' }, { zh: '噗噗', en: 'Puff' }, { zh: '啾啾', en: 'Chirp' },
];
/** name = { i: index into ROBOT_NAMES, n: 1..99 } → '叮叮 7'. */
export const robotName = name => (name ? `${ROBOT_NAMES[name.i].zh} ${name.n}` : '');
export const emptyProgress = () => ({ stars: {}, parts: [], robot: { name: null, ...BASIC_PART }, creations: [] });

/** Record a finished course. part = the part id earned on the first clear, else null. */
export function recordResult(progress, key, stars) {
  const prev = progress.stars[key] || 0;
  const p = { ...progress, stars: { ...progress.stars, [key]: Math.max(prev, stars) }, parts: progress.parts.slice(), robot: { ...progress.robot }, creations: (progress.creations || []).slice() };
  let part = null;
  if (prev === 0 && PARTS[key] && !p.parts.includes(PARTS[key].id)) { part = PARTS[key].id; p.parts.push(part); }
  return { progress: p, newBest: stars > prev, part };
}
/** Merge local and remote copies: best stars, union of parts, robot from b when b has one, creations from b when b has any. */
export function mergeProgress(a, b) {
  if (!b) return a;
  const stars = { ...a.stars };
  for (const [k, v] of Object.entries(b.stars || {})) stars[k] = Math.max(stars[k] || 0, v);
  const parts = [...new Set([...(a.parts || []), ...(b.parts || [])])];
  const robot = b.robot && b.robot.name ? { ...BASIC_PART, ...b.robot } : { ...BASIC_PART, ...a.robot };
  const creations = (b.creations && b.creations.length ? b.creations : a.creations || []).slice(0, 6);
  return { stars, parts, robot, creations };
}
export const isZoneOpen = (progress, zone, unlock, testMode) => !!testMode || !!(unlock && unlock[zone]);
export function isCourseOpen(progress, key, unlock, testMode) {
  if (testMode) return true;
  const c = courseByKey(key);
  if (!c || !isZoneOpen(progress, c.zone, unlock, false)) return false;
  const keys = ZONES[c.zone].keys, i = keys.indexOf(key);
  return i === 0 || (progress.stars[keys[i - 1]] || 0) >= 1;
}
export const isZoneCleared = (progress, zone) => ZONES[zone].keys.every(k => (progress.stars[k] || 0) >= 1);
export const isRushOpen = (progress, zone, unlock, testMode) => !!testMode || (isZoneOpen(progress, zone, unlock, false) && isZoneCleared(progress, zone));
export const isBossOpen = (progress, unlock, testMode) =>
  !!testMode || (isZoneOpen(progress, 'a', unlock, false) && isZoneOpen(progress, 'b', unlock, false) && isZoneCleared(progress, 'a') && isZoneCleared(progress, 'b'));
/** Next course after `key` in its zone, or null (then the map walks to the zone's Rush). */
export function nextCourse(key) {
  const c = courseByKey(key);
  if (!c) return null;
  const keys = ZONES[c.zone].keys, i = keys.indexOf(key);
  return i < keys.length - 1 ? keys[i + 1] : null;
}

// ---------- Gallery ----------
const isInt = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
const isStr = (v, max) => typeof v === 'string' && v.length <= max;
/**
 * Gallery entry written to robotGallery/{uid}. Firestore has no nested arrays, so peg points are flat [x0,y0,x1,y1,...].
 * { playerName, robot: { name:{i,n}, wheels, head, arms, antenna, paint, badge }, creations: [≤6], hidden }
 * creation: { kind:'peg', pts:[ints 0..4], ≤ 40 numbers } | { kind:'tiles', placed:[{ p, x 0..9, y 0..9, r 0..3 }] ≤ 30 }
 */
export function validateGalleryEntry(e) {
  if (!e || typeof e !== 'object') return false;
  const allowed = ['playerName', 'robot', 'creations', 'hidden', 'updatedAt'];
  if (Object.keys(e).some(k => !allowed.includes(k))) return false;
  if (!isStr(e.playerName, 100) || typeof e.hidden !== 'boolean') return false;
  const r = e.robot;
  if (!r || typeof r !== 'object') return false;
  if (r.name !== null && !(r.name && isInt(r.name.i, 0, ROBOT_NAMES.length - 1) && isInt(r.name.n, 1, 99))) return false;
  if (!SLOTS.every(s => isStr(r[s], 30))) return false;
  if (!Array.isArray(e.creations) || e.creations.length > 6) return false;
  return e.creations.every(c => {
    if (c.kind === 'peg') return Array.isArray(c.pts) && c.pts.length % 2 === 0 && c.pts.length <= 40 && c.pts.every(v => isInt(v, 0, PEG_GRID - 1));
    if (c.kind === 'tiles') return Array.isArray(c.placed) && c.placed.length <= 30
      && c.placed.every(t => PIECE_IDS.includes(t.p) && isInt(t.x, 0, 9) && isInt(t.y, 0, 9) && isInt(t.r, 0, 3));
    return false;
  });
}

// ---------- Random helpers ----------
export function shuffle(arr, rng = Math.random) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
export const pick = (arr, rng = Math.random) => arr[Math.floor(rng() * arr.length)];
/** Seeded generator for tests and repeatable rounds. */
export function lcg(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
