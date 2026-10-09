// Picnic Park 野餐樂園 — pure logic for 1N2 基本加法和減法 (textbook ch. 8 加法, 9 減法, 10 0 的認識).
// Chapters, Bloom-ordered level plans, question generators, adaptive difficulty, stars, progress.
// No DOM, no Firebase: unit tested in tests/picnic-logic.test.mjs.
//
// Curriculum boundaries (EDB KS1 notes, 1N2): both parts single-digit (so sums ≤ 18, never 12 + 5),
// picture-based stories, horizontal form only, related-fact families, commutativity of + only.

// ---------- Chapters and levels ----------

export const CHAPTERS = [
  { key: 'add', title: '基本加法', en: 'Addition', place: '甜品店', placeEn: 'Bakery', icon: '🧁', buddy: '🐱', buddyName: '貓貓' },
  { key: 'sub', title: '基本減法', en: 'Subtraction', place: '開心農場', placeEn: 'Farm', icon: '🐑', buddy: '🐶', buddyName: '狗狗' },
  { key: 'zero', title: '0 的認識', en: 'Zero', place: '鳥巢樹', placeEn: 'Nest tree', icon: '🪺', buddy: '🐥', buddyName: '小雞' },
];
export const QUESTIONS_PER_LEVEL = 6;
export const chapter = key => CHAPTERS.find(c => c.key === key);

/**
 * Five levels per chapter, ordered up Bloom's taxonomy (remember/understand → apply → analyse → evaluate/create).
 * plan: the question kind for each of the 6 slots (see GENERATORS). intro: the worked example shown before the level
 * (gradual release: I do → we do → you do). helpFrom: from which slot the on-screen helper is hidden until asked for
 * (support fades inside the level).
 */
export const LEVELS = {
  add: [
    { title: '認識加法', en: 'Putting together', bloom: '理解 Understand',
      goal: '把兩組東西合起來，數一數共有多少。',
      intro: { lines: ['6 和 2 合成為 8。', '6 加 2 等於 8。'], eq: [6, '+', 2, '=', 8], visual: { kind: 'frames', parts: [6, 2] } },
      plan: ['addCountOn', 'addCountOn', 'addCountOn', 'addCountOn', 'addCountOn', 'addCountOn'] },
    { title: '用橫式記錄', en: 'Write the sum', bloom: '應用 Apply',
      goal: '看圖，用 + 和 = 寫出橫式。',
      intro: { lines: ['地上有 🚗 4 輛和 🚌 2 輛。', '共有 6 輛，橫式是 4 + 2 = 6。'], eq: [4, '+', 2, '=', 6], visual: { kind: 'groups', groups: [{ e: '🚗', n: 4 }, { e: '🚌', n: 2 }] } },
      plan: ['addBuildEq', 'addBuildEq', 'addBuildEq', 'addBuildEq', 'addBuildEq', 'addBuildEq'] },
    { title: '加法口算', en: 'Adding in my head', bloom: '應用 Apply',
      goal: '心裏計算，快快找出答案。',
      intro: { lines: ['9 + 4：先湊成 10，', '9 加 1 是 10，10 加 3 是 13。'], eq: [9, '+', 4, '=', 13], visual: { kind: 'frames', parts: [9, 4] } },
      plan: ['addCompute', 'addCompute', 'addStoryChoice', 'addCompute', 'addCompute', 'addStoryChoice'], helpFrom: 3 },
    { title: '有趣的加法', en: 'Swap and find', bloom: '分析 Analyse',
      goal: '把相加的兩個數交換位置，結果不變。',
      intro: { lines: ['象爸爸有 6 + 8 根香蕉，象媽媽有 8 + 6 根。', '兩個數交換位置，結果不變！'], eq: [6, '+', 8, '=', 8, '+', 6], visual: { kind: 'groups', groups: [{ e: '🍌', n: 6 }, { e: '🍏', n: 8 }] } },
      plan: ['addSwap', 'addSameAs', 'addSwapLeft', 'addMissing', 'addSwap', 'addMissingFirst'] },
    { title: '小老師', en: 'Little teacher', bloom: '評鑑・創造 Evaluate & Create',
      goal: '檢查別人的答案，再用數卡自己組成算式。',
      intro: { lines: ['小熊說 5 + 7 = 11，對不對？', '數一數：5 + 7 = 12，小熊錯了！'], eq: [5, '+', 7, '=', 12], visual: { kind: 'frames', parts: [5, 7] } },
      plan: ['addJudge', 'addJudge', 'addCards', 'addBuildEq', 'addJudge', 'addCards'] },
  ],
  sub: [
    { title: '認識減法', en: 'Taking away', bloom: '理解 Understand',
      goal: '拿走一些，數一數還有多少。',
      intro: { lines: ['8 隻羊，走了 3 隻，還有 5 隻。', '8 減 3 等於 5。'], eq: [8, '−', 3, '=', 5], visual: { kind: 'row', e: '🐑', n: 8, crossed: 3 } },
      plan: ['subTakeAway', 'subTakeAway', 'subTakeAway', 'subTakeAway', 'subTakeAway', 'subTakeAway'] },
    { title: '比一比', en: 'How many more?', bloom: '理解 Understand',
      goal: '一對一配對，沒有配對的就是相差的數量。',
      intro: { lines: ['🥕 9 個，🥬 6 個，一對一配對。', '🥕 比 🥬 多 3 個：9 − 6 = 3。'], eq: [9, '−', 6, '=', 3], visual: { kind: 'pairs', a: { e: '🥕', n: 9 }, b: { e: '🥬', n: 6 } } },
      plan: ['subCompare', 'subCompare', 'subCompare', 'subCompare', 'subCompare', 'subCompare'] },
    { title: '減法口算', en: 'Subtract in my head', bloom: '應用 Apply',
      goal: '看圖寫橫式，再心算減法。',
      intro: { lines: ['桌上原有 14 杯，取去 8 杯。', '14 − 8 = 6，桌上還有 6 杯。'], eq: [14, '−', 8, '=', 6], visual: { kind: 'row', e: '🥤', n: 14, crossed: 8 } },
      plan: ['subBuildEq', 'subCompute', 'subBuildEq', 'subCompute', 'addCompute', 'subCompute'], helpFrom: 3 },
    { title: '加和減的關係', en: 'Add and subtract are friends', bloom: '分析 Analyse',
      goal: '用加法幫忙找減法的答案，分辨甚麼時候用 + 或 −。',
      intro: { lines: ['5 + 3 = 8，所以 8 − 3 = 5。', '加 3 再減 3，又回到 5！'], eq: [8, '−', 3, '=', 5], visual: { kind: 'arc', a: 5, b: 3, c: 8 } },
      plan: ['subFamily', 'subOpChoice', 'subMissing', 'subFamily', 'subOpChoice', 'subMissing'] },
    { title: '小老師', en: 'Little teacher', bloom: '評鑑・創造 Evaluate & Create',
      goal: '找出錯處，再用 3 張數卡組成 4 道算式。',
      intro: { lines: ['用 6、8、14 可以組成：', '6 + 8 = 14，8 + 6 = 14，14 − 6 = 8，14 − 8 = 6。'], eq: [14, '−', 6, '=', 8], visual: { kind: 'cards', cards: [6, 8, 14] } },
      plan: ['subJudge', 'subCards', 'mixBuildEq', 'subJudge', 'mixBuildEq', 'subJudge'] },
  ],
  zero: [
    { title: '認識 0', en: 'Meet zero', bloom: '記憶・理解 Remember & Understand',
      goal: '0 表示沒有。',
      intro: { lines: ['藥袋裏原有 3 粒，吃完了。', '藥袋裏還有 0 粒。0 表示沒有。'], eq: [3, '−', 3, '=', 0], visual: { kind: 'row', e: '💊', n: 3, crossed: 3 } },
      plan: ['zeroEatAll', 'zeroCups', 'zeroBigSmall', 'zeroEatAll', 'zeroBigSmall', 'zeroCups'] },
    { title: '0 的加法', en: 'Adding zero', bloom: '理解 Understand',
      goal: '加 0，數量不變。',
      intro: { lines: ['一個鳥巢有 3 隻，另一個沒有。', '共有 3 隻：3 + 0 = 3。'], eq: [3, '+', 0, '=', 3], visual: { kind: 'groups', groups: [{ e: '🐥', n: 3 }, { e: '🐥', n: 0 }] } },
      plan: ['zeroAddStory', 'zeroAddStory', 'zeroAddStory', 'zeroAddCompute', 'zeroAddStory', 'zeroAddCompute'] },
    { title: '0 的減法', en: 'Subtracting zero', bloom: '應用 Apply',
      goal: '減 0，數量不變；全部拿走，就剩下 0。',
      intro: { lines: ['碟上有 12 個，沒有被吃去：12 − 0 = 12。', '樹上 2 隻全部飛走：2 − 2 = 0。'], eq: [12, '−', 0, '=', 12], visual: { kind: 'row', e: '🍮', n: 12, crossed: 0 } },
      plan: ['zeroSubNone', 'zeroEatAll', 'zeroSubCompute', 'zeroSubNone', 'zeroSubCompute', 'zeroEatAll'] },
    { title: '0 的規律', en: 'Zero patterns', bloom: '分析 Analyse',
      goal: '找出 0 的規律。',
      intro: { lines: ['5 − 5 = 0，8 − 8 = 0。', '一個數減去自己，得 0！'], eq: [8, '−', 8, '=', 0], visual: { kind: 'row', e: '🍪', n: 8, crossed: 8 } },
      plan: ['zeroMixCompute', 'zeroPattern', 'zeroMissing', 'zeroMixCompute', 'zeroMissing', 'zeroPattern'] },
    { title: '單元挑戰', en: 'Unit challenge', bloom: '評鑑・創造 Evaluate & Create',
      goal: '加、減和 0 一起來！',
      intro: { lines: ['蛋糕上沒有蠟燭，另一個有 6 枝。', '兩個共有 6 枝：0 + 6 = 6。'], eq: [0, '+', 6, '=', 6], visual: { kind: 'groups', groups: [{ e: '🕯️', n: 0 }, { e: '🕯️', n: 6 }] } },
      plan: ['zeroJudge', 'zeroBuildEq', 'mixBuildEq', 'zeroJudge', 'subCards', 'mixCompute'] },
  ],
};

export const levelOf = (ch, n) => LEVELS[ch][n - 1];
export const levelKey = (ch, n) => `${ch}-${n}`;
/** Attempt mode for the teacher log: 'add', 3 → 'picnicAdd3'. */
export const modeKey = (ch, n) => `picnic${ch[0].toUpperCase()}${ch.slice(1)}${n}`;

// ---------- Random helpers ----------

/** Seeded PRNG (mulberry32), returns floats in [0, 1). */
export function makeRng(seed = Date.now()) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const ri = (rng, lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));
const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];
export function shuffle(rng, arr) { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

// ---------- Difficulty (adaptive, 0..2) ----------

/** Sum ranges per difficulty: 0 = within 10, 1 = bridging 10, 2 = up to 18. */
export const SUM_RANGE = [[2, 10], [6, 14], [10, 18]];

/** Two single-digit parts (1-9) whose sum lies in the difficulty range. */
export function pair(rng, diff) {
  const [lo, hi] = SUM_RANGE[clampDiff(diff)];
  for (;;) {
    const a = ri(rng, 1, 9), b = ri(rng, 1, 9);
    if (a + b >= lo && a + b <= hi) return [a, b];
  }
}
export const clampDiff = d => Math.max(0, Math.min(2, d | 0));

/**
 * Reinforcement-driven pacing: two first-try answers in a row step the difficulty up,
 * a question that needed the helper (2+ tries) steps it down. Returns { diff, streak }.
 */
export function nextDiff({ diff, streak }, tries) {
  if (tries <= 1) {
    const s = streak + 1;
    return s >= 2 ? { diff: clampDiff(diff + 1), streak: 0 } : { diff, streak: s };
  }
  return { diff: tries >= 2 ? clampDiff(diff - 1) : diff, streak: 0 };
}
/** Starting difficulty for a level: early levels start easy, later ones a step higher. */
export const startDiff = n => (n <= 2 ? 0 : 1);

// ---------- Choices ----------

/** n unique answer choices (ascending) containing ans; near misses and the given typical slips first. */
export function numChoices(rng, ans, { lo = 0, hi = 18, n = 4, slips = [] } = {}) {
  const out = new Set([ans]);
  const cands = [...slips, ...shuffle(rng, [ans + 1, ans - 1]), ...shuffle(rng, [ans + 2, ans - 2, ans + 3, ans - 3])];
  for (const c of cands) { if (out.size >= n) break; if (Number.isInteger(c) && c >= lo && c <= hi) out.add(c); }
  for (let c = lo; out.size < n && c <= hi; c++) out.add(c);
  return [...out].sort((x, y) => x - y);
}

// ---------- Story material (Traditional Chinese, HK classroom phrasing) ----------

const COMBINE = [
  { where: '盤上有', a: { e: '🧁', n: '杯子蛋糕' }, b: { e: '🍩', n: '冬甩' }, cat: '甜點', unit: '個' },
  { where: '籃裏有', a: { e: '🍎', n: '紅蘋果' }, b: { e: '🍏', n: '青蘋果' }, cat: '蘋果', unit: '個' },
  { where: '地上有', a: { e: '🚗', n: '私家車' }, b: { e: '🚌', n: '巴士' }, cat: '玩具車', unit: '輛' },
  { where: '花瓶裏有', a: { e: '🌷', n: '鬱金香' }, b: { e: '🌻', n: '向日葵' }, cat: '花', unit: '枝' },
  { where: '魚缸裏有', a: { e: '🐟', n: '藍魚' }, b: { e: '🐠', n: '金魚' }, cat: '魚', unit: '條' },
  { where: '桌上有', a: { e: '🥐', n: '牛角包' }, b: { e: '🍞', n: '麵包' }, cat: '包', unit: '個' },
];
const ADD_ON = [
  { where: '雪櫃裏', e: '🧃', verb: '爸爸多放', cat: '果汁', unit: '盒' },
  { where: '魚缸裏', e: '🐠', verb: '爸爸多放', cat: '魚', unit: '條' },
  { where: '花瓶裏', e: '🌷', verb: '媽媽多放', cat: '花', unit: '枝' },
  { where: '盒子裏', e: '🍬', verb: '哥哥多放', cat: '糖果', unit: '粒' },
  { where: '樹上', e: '🐦', verb: '再飛來', cat: '鳥', unit: '隻' },
  { where: '碟上', e: '🍪', verb: '媽媽再做了', cat: '曲奇', unit: '塊' },
];
const TAKE_AWAY = [
  { where: '羊欄裏', e: '🐑', verb: '走了', cat: '羊', unit: '隻' },
  { where: '地上', e: '🧺', verb: '取去', cat: '籃子', unit: '個' },
  { where: '餐盤上', e: '🍡', verb: '吃去', cat: '丸子', unit: '串' },
  { where: '桌上', e: '🥛', verb: '售出', cat: '牛奶', unit: '瓶' },
  { where: '沙灘上', e: '🦀', verb: '走了', cat: '蟹', unit: '隻' },
  { where: '派對上', e: '🎈', verb: '飛走了', cat: '氣球', unit: '個' },
  { where: '桌上', e: '🥤', verb: '同學們取去', cat: '杯', unit: '杯', noCat: true },
];
const COMPARE = [
  { where: '田裏有', a: { e: '🥕', n: '紅蘿蔔' }, b: { e: '🥬', n: '白菜' }, unit: '個' },
  { where: '農場裏有', a: { e: '🐔', n: '雞' }, b: { e: '🦆', n: '鴨' }, unit: '隻' },
  { where: '生日會有', a: { e: '👧', n: '女孩' }, b: { e: '👦', n: '男孩' }, unit: '個' },
  { where: '碟上有', a: { e: '🍓', n: '士多啤梨' }, b: { e: '🍒', n: '車厘子' }, unit: '粒' },
  { where: '音樂室有', a: { e: '🥁', n: '鼓' }, b: { e: '🎸', n: '結他' }, unit: '個' },
  { where: '沙灘上有', a: { e: '🐚', n: '貝殼' }, b: { e: '⭐', n: '海星' }, unit: '個' },
];
const ALL_GONE = [
  { where: '藥袋裏', e: '💊', verb: '媽媽全部吃完了', cat: '藥丸', unit: '粒' },
  { where: '樹上', e: '🐦', verb: '全部都飛走了', cat: '鳥', unit: '隻' },
  { where: '碟上', e: '🍪', verb: '全部被吃去了', cat: '曲奇', unit: '塊' },
  { where: '花瓶裏', e: '🌹', verb: '全部被拿走了', cat: '花', unit: '枝' },
];
const NONE_GONE = [
  { where: '碟上', e: '🍮', verb: '沒有被吃去', cat: '布甸', unit: '個' },
  { where: '樹上', e: '🐦', verb: '沒有一隻飛走', cat: '鳥', unit: '隻' },
  { where: '籃裏', e: '🍊', verb: '沒有被拿走', cat: '橙', unit: '個' },
];
const CUPS = [{ e: '🪥', cat: '牙刷', unit: '支', box: '杯子' }, { e: '✏️', cat: '鉛筆', unit: '枝', box: '筆筒' }, { e: '🥚', cat: '蛋', unit: '隻', box: '籃子' }];
const JUDGES = ['🐻', '🐰', '🐼', '🦊'];

/** Plain text for speech: no emoji, − read as 減, □ read as 幾多. */
export function speakable(s) {
  return String(s).replace(/[\p{Extended_Pictographic}️‍]/gu, '').replace(/−/g, ' 減 ').replace(/\+/g, ' 加 ')
    .replace(/=/g, ' 等於 ').replace(/□/g, '幾多').replace(/\s+/g, ' ').trim();
}
const eqText = toks => toks.map(t => (t === '?' ? '□' : t)).join(' ');

// ---------- Question generators ----------
// Every question: { kind, type, prompt, en, answer, choices?, eq?, visual?, help, hint, item }
//   type    — which screen renders it (countOn, takeAway, compare, buildEq, cards, choice, judge)
//   eq      — horizontal equation tokens; '?' marks the box the child fills
//   hint    — tier-1 scaffold (words); help — tier-2 scaffold (picture) shown after a second slip
//   item    — short label for the teacher's "confusions" log, e.g. '7+5'

function addCountOn(rng, diff) {
  const [a, b] = pair(rng, Math.min(diff, 1));
  const ans = a + b;
  if (rng() < 0.5) {
    const s = pick(rng, COMBINE);
    return { type: 'countOn', story: 'combine', a, b, itemA: s.a.e, itemB: s.b.e,
      prompt: `${s.where} ${s.a.e} ${a} ${s.unit}和 ${s.b.e} ${b} ${s.unit}。共有${s.cat}多少${s.unit}？`,
      en: `${a} and ${b}. How many altogether?`, tapLine: `把 ${s.b.e} 移到十格框`,
      answer: ans, choices: numChoices(rng, ans, { lo: 1 }), eq: [a, '+', b, '=', '?'], unit: s.unit,
      hint: '先數橙色的，再接着數綠色的。', help: { kind: 'frames', parts: [a, b] }, item: `${a}+${b}` };
  }
  const s = pick(rng, ADD_ON);
  return { type: 'countOn', story: 'addOn', a, b, itemA: s.e, itemB: s.e,
    prompt: `${s.where}原有 ${s.e} ${a} ${s.unit}，${s.verb} ${b} ${s.unit}。${s.where}現在有${s.cat}多少${s.unit}？`,
    en: `There were ${a}. ${b} more came. How many now?`, tapLine: `把多放的 ${s.e} 移到十格框`,
    answer: ans, choices: numChoices(rng, ans, { lo: 1 }), eq: [a, '+', b, '=', '?'], unit: s.unit,
    hint: `由 ${a} 開始，接着數 ${b} 個。`, help: { kind: 'frames', parts: [a, b] }, item: `${a}+${b}` };
}

function addStory(rng, diff) {
  const [a, b] = pair(rng, diff);
  if (rng() < 0.5) {
    const s = pick(rng, COMBINE);
    return { a, b, prompt: `${s.where} ${s.a.e} ${a} ${s.unit}和 ${s.b.e} ${b} ${s.unit}。共有${s.cat}多少${s.unit}？`,
      en: `${a} and ${b}. How many altogether?`, unit: s.unit,
      visual: { kind: 'groups', groups: [{ e: s.a.e, n: a }, { e: s.b.e, n: b }] } };
  }
  const s = pick(rng, ADD_ON);
  return { a, b, prompt: `${s.where}原有 ${s.e} ${a} ${s.unit}，${s.verb} ${b} ${s.unit}後，${s.where}現在有${s.cat}多少${s.unit}？`,
    en: `There were ${a}. ${b} more came. How many now?`, unit: s.unit,
    visual: { kind: 'groups', groups: [{ e: s.e, n: a }, { e: s.e, n: b, more: true }] } };
}

function addBuildEq(rng, diff) {
  const st = addStory(rng, diff);
  const c = st.a + st.b;
  return { type: 'buildEq', prompt: st.prompt, en: st.en + ' Write the number sentence.', visual: st.visual,
    tiles: tilesFor(rng, [st.a, st.b, c]), ops: ['+', '−', '='], answer: c,
    accept: [[st.a, '+', st.b, '=', c], [st.b, '+', st.a, '=', c]],
    hint: '「共有」、「多放」用加法 +。', help: { kind: 'frames', parts: [st.a, st.b] }, item: `${st.a}+${st.b}` };
}

/** Number tiles for □○□○□: the needed numbers plus one or two near distractors, ascending, unique. */
export function tilesFor(rng, nums) {
  const set = new Set(nums);
  const extra = shuffle(rng, nums.flatMap(v => [v + 1, v - 1])).filter(v => v >= 0 && v <= 18 && !set.has(v));
  for (const v of extra) { if (set.size >= Math.max(5, new Set(nums).size + 2)) break; set.add(v); }
  return [...set].sort((x, y) => x - y);
}

function addCompute(rng, diff) {
  const [a, b] = pair(rng, diff);
  const ans = a + b;
  return { type: 'choice', prompt: '把答案填在 □ 內。', en: 'Fill in the box.', eq: [a, '+', b, '=', '?'],
    answer: ans, choices: numChoices(rng, ans, { lo: 1, slips: [Math.abs(a - b)] }),
    hint: a + b > 10 ? `先湊成 10：${Math.max(a, b)} 加 ${10 - Math.max(a, b)} 是 10。` : `由 ${Math.max(a, b)} 開始，接着數 ${Math.min(a, b)}。`,
    help: { kind: 'frames', parts: [a, b] }, item: `${a}+${b}` };
}

function addStoryChoice(rng, diff) {
  const st = addStory(rng, diff);
  const ans = st.a + st.b;
  return { type: 'choice', prompt: st.prompt, en: st.en, visual: st.visual, eq: [st.a, '+', st.b, '=', '?'], unit: st.unit,
    answer: ans, choices: numChoices(rng, ans, { lo: 1 }), hint: '「共有」、「多放」，用加法。',
    help: { kind: 'frames', parts: [st.a, st.b] }, item: `${st.a}+${st.b}` };
}

function addSwap(rng, diff) {
  const [a, b] = distinctPair(rng, diff);
  return { type: 'choice', prompt: '把答案填在 □ 內。', en: 'Swap the numbers — same answer.', eq: [a, '+', b, '=', '?', '+', a],
    answer: b, choices: numChoices(rng, b, { lo: 1, hi: 18, slips: [a + b, a] }),
    hint: '相加的兩個數交換位置，結果不變。', help: { kind: 'swap', a, b }, item: `${a}+${b}=□+${a}` };
}

function addSwapLeft(rng, diff) {
  const [a, b] = distinctPair(rng, diff);
  return { type: 'choice', prompt: '把答案填在 □ 內。', en: 'Swap the numbers — same answer.', eq: ['?', '+', b, '=', b, '+', a],
    answer: a, choices: numChoices(rng, a, { lo: 1, hi: 18, slips: [a + b, b] }),
    hint: '兩邊用的是同樣的兩個數。', help: { kind: 'swap', a, b }, item: `□+${b}=${b}+${a}` };
}

function addSameAs(rng, diff) {
  const [a, b] = distinctPair(rng, diff);
  const right = `${b} + ${a}`;
  const near = b + 1 <= 9 ? b + 1 : b - 1;
  const wrong = shuffle(rng, [...new Set([`${a} + ${a}`, `${b} + ${b}`, `${a} + ${near}`, `${near} + ${a}`])]).slice(0, 2);
  return { type: 'choice', prompt: `哪一個算式和 ${a} + ${b} 的結果一樣？`, en: `Which gives the same answer as ${a} + ${b}?`,
    answer: right, choices: shuffle(rng, [right, ...wrong]),
    hint: '找一找：同樣的兩個數，交換了位置。', help: { kind: 'swap', a, b }, item: `=${a}+${b}` };
}

function addMissing(rng, diff) {
  const [a, b] = pair(rng, diff);
  const c = a + b;
  return { type: 'choice', prompt: '把答案填在 □ 內。', en: 'What is missing?', eq: [a, '+', '?', '=', c],
    answer: b, choices: numChoices(rng, b, { lo: 1, hi: 18, slips: [c] }),
    hint: `由 ${a} 開始數到 ${c}，數了多少？`, help: { kind: 'frames', parts: [a, b], hideSecond: true }, item: `${a}+□=${c}` };
}

function addMissingFirst(rng, diff) {
  const [a, b] = pair(rng, diff);
  const c = a + b;
  return { type: 'choice', prompt: '把答案填在 □ 內。', en: 'What is missing?', eq: ['?', '+', b, '=', c],
    answer: a, choices: numChoices(rng, a, { lo: 1, hi: 18, slips: [c] }),
    hint: `甚麼數加 ${b} 等於 ${c}？`, help: { kind: 'frames', parts: [b, a], hideSecond: true }, item: `□+${b}=${c}` };
}

function addJudge(rng, diff) {
  const [a, b] = pair(rng, Math.max(1, diff));
  const c = a + b;
  const who = pick(rng, JUDGES);
  if (rng() < 0.35) {
    return { type: 'judge', speaker: who, claim: `${a} + ${b} = ${c}`, right: true, answer: true,
      prompt: `${who} 說：「${a} + ${b} = ${c}」。對不對？`, en: 'Is it right?',
      hint: '自己算一算，再比較。', help: { kind: 'frames', parts: [a, b] }, item: `${a}+${b}=${c}?` };
  }
  const bad = c + pick(rng, [-1, 1]);
  return { type: 'judge', speaker: who, claim: `${a} + ${b} = ${bad}`, right: false, answer: false,
    prompt: `${who} 說：「${a} + ${b} = ${bad}」。對不對？`, en: 'Is it right?',
    fix: { prompt: '正確的答案是：', eq: [a, '+', b, '=', '?'], answer: c, choices: numChoices(rng, c, { lo: 1, slips: [bad] }) },
    hint: '自己算一算，再比較。', help: { kind: 'frames', parts: [a, b] }, item: `${a}+${b}=${bad}?` };
}

function addCards(rng, diff) {
  const [a, b] = distinctPair(rng, Math.max(1, diff));
  const c = a + b;
  return { type: 'cards', cards: shuffle(rng, [a, b, c]), ops: ['+', '='], need: 2,
    prompt: `用 ${a}、${b}、${c} 三張數卡，組成 2 道加法算式。`, en: 'Make 2 addition sentences with the 3 cards.',
    accept: [[a, '+', b, '=', c], [b, '+', a, '=', c]], answer: c,
    hint: '最大的數是「和」，放在 = 後面。', help: { kind: 'swap', a, b }, item: `cards ${a},${b},${c}` };
}

function distinctPair(rng, diff) { for (;;) { const p = pair(rng, diff); if (p[0] !== p[1]) return p; } }

// --- Subtraction ---

/** Minuend, subtrahend, difference with subtrahend and difference single-digit (1-9). */
function subTriple(rng, diff) { const [k, r] = pair(rng, diff); return [k + r, k, r]; }

function subTakeAway(rng, diff) {
  const [n, k, r] = subTriple(rng, Math.min(diff, 1));
  const s = pick(rng, TAKE_AWAY);
  return { type: 'takeAway', n, k, e: s.e,
    prompt: `${s.where}原有 ${s.e} ${n} ${s.unit}，${s.verb} ${k} ${s.unit}。${s.where}還有${s.noCat ? '' : s.cat}多少${s.unit}？`,
    en: `There were ${n}. ${k} went away. How many are left?`, tapLine: `在 ${k} 個 ${s.e} 上畫「/」`,
    answer: r, choices: numChoices(rng, r, { lo: 0, slips: [n + k] }), eq: [n, '−', k, '=', '?'], unit: s.unit,
    hint: '數一數沒有畫「/」的。', help: { kind: 'row', e: s.e, n, crossed: k }, item: `${n}-${k}` };
}

function compareStory(rng, diff) {
  const [small, d] = pair(rng, Math.min(diff, 1));
  const big = small + d;
  const s = pick(rng, COMPARE);
  const ask = pick(rng, ['more', 'less', 'diff']);
  const aBig = ask === 'more' ? true : ask === 'less' ? true : rng() < 0.5;
  const na = aBig ? big : small, nb = aBig ? small : big;
  const askText = ask === 'more' ? `${s.a.e} 比 ${s.b.e} 多多少${s.unit}？`
    : ask === 'less' ? `${s.b.e} 比 ${s.a.e} 少多少${s.unit}？`
      : `${s.a.e} 和 ${s.b.e} 的數量相差多少${s.unit}？`;
  return { s, na, nb, big, small, d, ask,
    prompt: `${s.where} ${s.a.e}${s.a.n} ${na} ${s.unit}和 ${s.b.e}${s.b.n} ${nb} ${s.unit}。${askText}`,
    en: ask === 'more' ? 'How many more?' : ask === 'less' ? 'How many fewer?' : 'What is the difference?' };
}

function subCompare(rng, diff) {
  const st = compareStory(rng, diff);
  return { type: 'compare', a: { e: st.s.a.e, n: st.na }, b: { e: st.s.b.e, n: st.nb }, ask: st.ask,
    prompt: st.prompt, en: st.en, tapLine: '把沒有配對的圈起來', unit: st.s.unit,
    answer: st.d, choices: numChoices(rng, st.d, { lo: 0, slips: [st.big + st.small] }), eq: [st.big, '−', st.small, '=', '?'],
    hint: '一對一配對，數一數沒有配對的。', help: { kind: 'pairs', a: { e: st.s.a.e, n: st.na }, b: { e: st.s.b.e, n: st.nb } }, item: `${st.big}-${st.small}` };
}

function subBuildEq(rng, diff) {
  if (rng() < 0.5) {
    const [n, k, r] = subTriple(rng, diff);
    const s = pick(rng, TAKE_AWAY);
    return { type: 'buildEq', prompt: `${s.where}原有 ${s.e} ${n} ${s.unit}，${s.verb} ${k} ${s.unit}。${s.where}還有${s.noCat ? '' : s.cat}多少${s.unit}？`,
      en: 'Write the number sentence.', visual: { kind: 'row', e: s.e, n, crossed: k },
      tiles: tilesFor(rng, [n, k, r]), ops: ['+', '−', '='], answer: r, accept: [[n, '−', k, '=', r]],
      hint: '「還有」、「餘下」用減法 −。大的數放在前面。', help: { kind: 'row', e: s.e, n, crossed: k }, item: `${n}-${k}` };
  }
  const st = compareStory(rng, diff);
  return { type: 'buildEq', prompt: st.prompt, en: st.en + ' Write the number sentence.',
    visual: { kind: 'pairs', a: { e: st.s.a.e, n: st.na }, b: { e: st.s.b.e, n: st.nb } },
    tiles: tilesFor(rng, [st.big, st.small, st.d]), ops: ['+', '−', '='], answer: st.d, accept: [[st.big, '−', st.small, '=', st.d]],
    hint: '「相差」、「多多少」、「少多少」用減法 −，大的數減小的數。', help: { kind: 'pairs', a: { e: st.s.a.e, n: st.na }, b: { e: st.s.b.e, n: st.nb } }, item: `${st.big}-${st.small}` };
}

function subCompute(rng, diff) {
  const [n, k, r] = subTriple(rng, diff);
  return { type: 'choice', prompt: '把答案填在 □ 內。', en: 'Fill in the box.', eq: [n, '−', k, '=', '?'],
    answer: r, choices: numChoices(rng, r, { lo: 0, slips: [n + k] }),
    hint: `想一想：${k} 加多少等於 ${n}？`, help: { kind: 'arc', a: r, b: k, c: n, hideA: true }, item: `${n}-${k}` };
}

function subFamily(rng, diff) {
  const [a, b] = pair(rng, diff);
  const c = a + b;
  return { type: 'choice', prompt: `${a} + ${b} = ${c}。把答案填在 □ 內。`, en: 'Use the addition fact.',
    visual: { kind: 'arc', a, b, c }, eq: [c, '−', b, '=', '?'],
    answer: a, choices: numChoices(rng, a, { lo: 0, slips: [c + b, b] }),
    hint: `加 ${b} 再減 ${b}，回到原來的數。`, help: { kind: 'arc', a, b, c }, item: `${c}-${b} (family)` };
}

function subOpChoice(rng, diff) {
  const useAdd = rng() < 0.5;
  let st, q;
  if (useAdd) { st = addStory(rng, diff); q = { op: '+', item: `${st.a}+${st.b}` }; }
  else if (rng() < 0.5) {
    const [n, k] = subTriple(rng, diff); const s = pick(rng, TAKE_AWAY);
    st = { prompt: `${s.where}原有 ${s.e} ${n} ${s.unit}，${s.verb} ${k} ${s.unit}。${s.where}還有${s.noCat ? '' : s.cat}多少${s.unit}？`, visual: { kind: 'row', e: s.e, n, crossed: k } };
    q = { op: '−', item: `${n}-${k}` };
  } else {
    const c = compareStory(rng, diff);
    st = { prompt: c.prompt, visual: { kind: 'pairs', a: { e: c.s.a.e, n: c.na }, b: { e: c.s.b.e, n: c.nb } } };
    q = { op: '−', item: `${c.big}-${c.small}` };
  }
  return { type: 'choice', prompt: st.prompt, sub: '要用加法還是減法？', en: 'Add or subtract?', visual: st.visual,
    answer: q.op, choices: ['+', '−'], big: true,
    hint: '「共有」、「多放」用 +；「還有」、「相差」用 −。', help: { kind: 'keywords' }, item: `op ${q.item}` };
}

function subMissing(rng, diff) {
  const [n, k, r] = subTriple(rng, diff);
  if (rng() < 0.5) {
    return { type: 'choice', prompt: '把答案填在 □ 內。', en: 'What is missing?', eq: [n, '−', '?', '=', r],
      answer: k, choices: numChoices(rng, k, { lo: 0, slips: [n + r] }),
      hint: `${r} 加多少等於 ${n}？`, help: { kind: 'arc', a: r, b: k, c: n, hideB: true }, item: `${n}-□=${r}` };
  }
  return { type: 'choice', prompt: '把答案填在 □ 內。', en: 'What is missing?', eq: ['?', '−', k, '=', r],
    answer: n, choices: numChoices(rng, n, { lo: 1, slips: [r > k ? r - k : k - r] }),
    hint: `把 ${r} 和 ${k} 加起來。`, help: { kind: 'arc', a: r, b: k, c: n, hideC: true }, item: `□-${k}=${r}` };
}

function subJudge(rng, diff) {
  const roll = rng();
  const who = pick(rng, JUDGES);
  if (roll < 0.25) {
    const [a, b] = distinctPair(rng, 0); const big = Math.max(a, b), small = Math.min(a, b);
    return { type: 'judge', speaker: who, claim: `${big} − ${small} 可以寫成 ${small} − ${big}`, right: false, answer: false,
      prompt: `${who} 說：「${big} − ${small} 可以寫成 ${small} − ${big}」。對不對？`, en: 'Can we swap the numbers in a subtraction?',
      hint: `${small} 個拿走 ${big} 個，夠不夠？`, help: { kind: 'row', e: '🍎', n: small, crossed: 0 }, item: 'swap −?' };
  }
  const [n, k, r] = subTriple(rng, Math.max(1, diff));
  if (roll < 0.45) {
    return { type: 'judge', speaker: who, claim: `${n} − ${k} = ${r}`, right: true, answer: true,
      prompt: `${who} 說：「${n} − ${k} = ${r}」。對不對？`, en: 'Is it right?',
      hint: `用加法檢查：${r} + ${k} 是不是 ${n}？`, help: { kind: 'arc', a: r, b: k, c: n }, item: `${n}-${k}=${r}?` };
  }
  const bad = r + pick(rng, [-1, 1]);
  return { type: 'judge', speaker: who, claim: `${n} − ${k} = ${bad}`, right: false, answer: false,
    prompt: `${who} 說：「${n} − ${k} = ${bad}」。對不對？`, en: 'Is it right?',
    fix: { prompt: '正確的答案是：', eq: [n, '−', k, '=', '?'], answer: r, choices: numChoices(rng, r, { lo: 0, slips: [bad] }) },
    hint: `用加法檢查：${bad} + ${k} 是不是 ${n}？`, help: { kind: 'arc', a: r, b: k, c: n }, item: `${n}-${k}=${bad}?` };
}

function subCards(rng, diff) {
  const [a, b] = distinctPair(rng, Math.max(1, diff));
  const c = a + b;
  return { type: 'cards', cards: shuffle(rng, [a, b, c]), ops: ['+', '−', '='], need: 4,
    prompt: `用 ${a}、${b}、${c} 三張數卡，組成 4 道算式（2 道加法、2 道減法）。`, en: 'Make 4 number sentences with the 3 cards.',
    accept: [[a, '+', b, '=', c], [b, '+', a, '=', c], [c, '−', a, '=', b], [c, '−', b, '=', a]], answer: c,
    hint: '加法：小 + 小 = 大；減法：大 − 小 = 小。', help: { kind: 'arc', a, b, c }, item: `cards ${a},${b},${c}` };
}

function mixBuildEq(rng, diff) {
  return rng() < 0.5 ? addBuildEq(rng, diff) : subBuildEq(rng, diff);
}
function mixCompute(rng, diff) {
  return rng() < 0.5 ? addCompute(rng, diff) : subCompute(rng, diff);
}

// --- Zero ---

function zeroEatAll(rng, diff) {
  const n = ri(rng, 2, diff >= 1 ? 9 : 5);
  const s = pick(rng, ALL_GONE);
  return { type: 'takeAway', n, k: n, e: s.e,
    prompt: `${s.where}原有 ${s.e} ${n} ${s.unit}，${s.verb}。${s.where}還有${s.cat}多少${s.unit}？`,
    en: `There were ${n}. All of them went. How many are left?`, tapLine: `在每個 ${s.e} 上畫「/」`,
    answer: 0, choices: numChoices(rng, 0, { lo: 0, slips: [n, 1] }), eq: [n, '−', n, '=', '?'], unit: s.unit,
    hint: '全部都沒有了，還有幾個？', help: { kind: 'row', e: s.e, n, crossed: n }, item: `${n}-${n}` };
}

function zeroCups(rng) {
  const s = pick(rng, CUPS);
  const counts = shuffle(rng, [0, ri(rng, 2, 4), ri(rng, 5, 7)]);
  const target = counts.indexOf(0);
  const labels = ['甲', '乙', '丙'];
  return { type: 'choice', prompt: `哪一個${s.box}內沒有${s.cat}？`, en: `Which ${s.box === '杯子' ? 'cup' : 'box'} has none?`,
    visual: { kind: 'boxes', e: s.e, counts, labels }, answer: labels[target], choices: labels,
    hint: '沒有，就是 0。', help: { kind: 'boxes', e: s.e, counts, labels, showCounts: true }, item: 'which is 0' };
}

function zeroBigSmall(rng) {
  const n = ri(rng, 1, 18);
  const zeroFirst = rng() < 0.5;
  const ans = zeroFirst ? '小' : '大';
  return { type: 'choice', prompt: zeroFirst ? `0 比 ${n}（大／小）？` : `${n} 比 0（大／小）？`, en: zeroFirst ? `Is 0 bigger or smaller than ${n}?` : `Is ${n} bigger or smaller than 0?`,
    visual: { kind: 'boxes', e: '🪥', counts: zeroFirst ? [0, Math.min(n, 9)] : [Math.min(n, 9), 0], labels: zeroFirst ? ['0', String(n)] : [String(n), '0'], showCounts: true, cap: n > 9 },
    answer: ans, choices: ['大', '小'], big: true,
    hint: '0 表示沒有，比任何數都小。', help: { kind: 'numberline', mark: [0, n] }, item: zeroFirst ? `0 vs ${n}` : `${n} vs 0` };
}

function zeroAddStory(rng, diff) {
  const v = ri(rng, 1, diff >= 1 ? 9 : 6);
  const roll = rng();
  if (roll < 0.34) {
    return { type: 'choice', prompt: `一個鳥巢有 🐥 ${v} 隻，另一個鳥巢沒有 🐥。圖中共有 🐥 多少隻？`, en: 'One nest is empty. How many chicks altogether?',
      visual: { kind: 'groups', groups: [{ e: '🐥', n: v, nest: true }, { e: '🐥', n: 0, nest: true }] }, eq: [v, '+', 0, '=', '?'],
      answer: v, choices: numChoices(rng, v, { lo: 0, slips: [0] }), unit: '隻',
      hint: '加 0，數量不變。', help: { kind: 'frames', parts: [v, 0] }, item: `${v}+0` };
  }
  if (roll < 0.67) {
    return { type: 'choice', prompt: `海邊原沒有 🕊️，飛來了 ${v} 隻後，海邊有 🕊️ 多少隻？`, en: `There were none. ${v} flew in. How many now?`,
      visual: { kind: 'groups', groups: [{ e: '🕊️', n: 0 }, { e: '🕊️', n: v, more: true }] }, eq: [0, '+', v, '=', '?'],
      answer: v, choices: numChoices(rng, v, { lo: 0, slips: [0] }), unit: '隻',
      hint: '0 加一個數，得那個數。', help: { kind: 'frames', parts: [0, v] }, item: `0+${v}` };
  }
  const n = ri(rng, 3, 9);
  return { type: 'choice', prompt: `公園裏原有 🐦 ${n} 隻，沒有 🐦 飛來。公園裏現有 🐦 多少隻？`, en: `${n} birds, none flew in. How many now?`,
    visual: { kind: 'groups', groups: [{ e: '🐦', n }, { e: '🐦', n: 0, more: true }] }, eq: [n, '+', '?', '=', n],
    answer: 0, choices: numChoices(rng, 0, { lo: 0, slips: [n, 1] }), unit: '隻',
    hint: '沒有飛來，就是加 0。', help: { kind: 'frames', parts: [n, 0] }, item: `${n}+□=${n}` };
}

function zeroAddCompute(rng, diff) {
  const v = ri(rng, 1, diff >= 1 ? 18 : 9);
  const left = rng() < 0.5;
  return { type: 'choice', prompt: '把答案填在 □ 內。', en: 'Fill in the box.', eq: left ? [0, '+', v, '=', '?'] : [v, '+', 0, '=', '?'],
    answer: v, choices: numChoices(rng, v, { lo: 0, slips: [0, v + 1] }), hint: '加 0，數量不變。', help: { kind: 'frames', parts: left ? [0, Math.min(v, 9)] : [Math.min(v, 9), 0] },
    item: left ? `0+${v}` : `${v}+0` };
}

function zeroSubNone(rng, diff) {
  const n = ri(rng, 3, diff >= 1 ? 12 : 9);
  const s = pick(rng, NONE_GONE);
  return { type: 'takeAway', n, k: 0, e: s.e,
    prompt: `${s.where}有 ${s.e} ${n} ${s.unit}，${s.verb}。${s.where}還有${s.cat}多少${s.unit}？`,
    en: `${n} here and none taken. How many are left?`, tapLine: '一個也沒有拿走！',
    answer: n, choices: numChoices(rng, n, { lo: 0, slips: [0] }), eq: [n, '−', 0, '=', '?'], unit: s.unit,
    hint: '減 0，數量不變。', help: { kind: 'row', e: s.e, n, crossed: 0 }, item: `${n}-0` };
}

function zeroSubCompute(rng, diff) {
  const n = ri(rng, 1, diff >= 1 ? 18 : 9);
  const self = rng() < 0.5;
  return { type: 'choice', prompt: '把答案填在 □ 內。', en: 'Fill in the box.', eq: self ? [n, '−', n, '=', '?'] : [n, '−', 0, '=', '?'],
    answer: self ? 0 : n, choices: numChoices(rng, self ? 0 : n, { lo: 0, slips: self ? [n, 1] : [0] }),
    hint: self ? '全部拿走，就剩下 0。' : '減 0，數量不變。', help: { kind: 'row', e: '🍪', n: Math.min(n, 18), crossed: self ? Math.min(n, 18) : 0 },
    item: self ? `${n}-${n}` : `${n}-0` };
}

function zeroMixCompute(rng, diff) {
  const n = ri(rng, 1, 18);
  const forms = [
    { eq: [0, '+', n, '=', '?'], ans: n, item: `0+${n}`, hint: '加 0，數量不變。' },
    { eq: [n, '−', 0, '=', '?'], ans: n, item: `${n}-0`, hint: '減 0，數量不變。' },
    { eq: [n, '−', n, '=', '?'], ans: 0, item: `${n}-${n}`, hint: '一個數減去自己，得 0。' },
    { eq: [0, '+', 0, '=', '?'], ans: 0, item: '0+0', hint: '沒有加沒有，還是沒有。' },
  ];
  const f = rng() < 0.12 ? forms[3] : pick(rng, forms.slice(0, 3));
  return { type: 'choice', prompt: '把答案填在 □ 內。', en: 'Fill in the box.', eq: f.eq, answer: f.ans,
    choices: numChoices(rng, f.ans, { lo: 0, slips: f.ans === 0 ? [n, 1] : [0] }), hint: f.hint,
    help: { kind: 'rules' }, item: f.item };
}

function zeroMissing(rng) {
  const n = ri(rng, 2, 18);
  const forms = [
    { eq: [n, '−', '?', '=', n], ans: 0, item: `${n}-□=${n}` },
    { eq: ['?', '+', 0, '=', n], ans: n, item: `□+0=${n}` },
    { eq: [n, '−', '?', '=', 0], ans: n, item: `${n}-□=0` },
    { eq: [0, '+', '?', '=', n], ans: n, item: `0+□=${n}` },
  ];
  const f = pick(rng, forms);
  return { type: 'choice', prompt: '把答案填在 □ 內。', en: 'What is missing?', eq: f.eq, answer: f.ans,
    choices: numChoices(rng, f.ans, { lo: 0, slips: f.ans === 0 ? [n, 1] : [0] }), hint: '想一想 0 的規律。', help: { kind: 'rules' }, item: f.item };
}

/**
 * Analyse the zero rules, not just apply one: find the sentence whose answer differs from the rest,
 * or the one sentence that makes 0. Every option uses the same number, so only the rule decides.
 */
function zeroPattern(rng) {
  const v = ri(rng, 2, 18);
  const same = [`${v} − 0`, `0 + ${v}`, `${v} + 0`];
  if (rng() < 0.6) {
    const right = `${v} − ${v}`;
    return { type: 'choice', prompt: '哪一道算式的答案和其他的不一樣？', en: 'Which one has a different answer?',
      answer: right, choices: shuffle(rng, [right, ...same]),
      hint: `先算一算每一道：加 0、減 0 還是 ${v}；減去自己呢？`, help: { kind: 'rules' }, item: `odd ${v}` };
  }
  const right = `${v} − ${v}`;
  return { type: 'choice', prompt: '哪一道算式的答案是 0？', en: 'Which one equals 0?',
    answer: right, choices: shuffle(rng, [right, ...shuffle(rng, same).slice(0, 2)]),
    hint: '全部拿走，才會剩下 0。', help: { kind: 'rules' }, item: `=0 ${v}` };
}

function zeroJudge(rng) {
  const n = ri(rng, 2, 15);
  const who = pick(rng, JUDGES);
  const forms = [
    { claim: `${n} − 0 = 0`, right: false, eq: [n, '−', 0, '=', '?'], ans: n, item: `${n}-0=0?` },
    { claim: `0 + ${n} = ${n}`, right: true, item: `0+${n}=${n}?` },
    { claim: `${n} − ${n} = ${n}`, right: false, eq: [n, '−', n, '=', '?'], ans: 0, item: `${n}-${n}=${n}?` },
    { claim: '0 + 0 = 0', right: true, item: '0+0=0?' },
    { claim: `${n} + 0 = ${n + 1}`, right: false, eq: [n, '+', 0, '=', '?'], ans: n, item: `${n}+0=${n + 1}?` },
  ];
  const f = pick(rng, forms);
  return { type: 'judge', speaker: who, claim: f.claim, right: f.right, answer: f.right,
    prompt: `${who} 說：「${f.claim}」。對不對？`, en: 'Is it right?',
    fix: f.right ? undefined : { prompt: '正確的答案是：', eq: f.eq, answer: f.ans, choices: numChoices(rng, f.ans, { lo: 0, slips: [0, n] }) },
    hint: '想一想 0 的規律。', help: { kind: 'rules' }, item: f.item };
}

function zeroBuildEq(rng, diff) {
  const roll = rng();
  if (roll < 0.34) {
    const v = ri(rng, 2, 9);
    return { type: 'buildEq', prompt: `一個蛋糕上沒有 🕯️，另一個蛋糕上有 🕯️ ${v} 枝。兩個蛋糕共有 🕯️ 多少枝？`, en: 'Write the number sentence.',
      visual: { kind: 'groups', groups: [{ e: '🕯️', n: 0, cake: true }, { e: '🕯️', n: v, cake: true }] },
      tiles: tilesFor(rng, [0, v]), ops: ['+', '−', '='], answer: v, accept: [[0, '+', v, '=', v], [v, '+', 0, '=', v]],
      hint: '「共有」用加法。沒有就是 0。', help: { kind: 'frames', parts: [0, v] }, item: `0+${v}` };
  }
  if (roll < 0.67) {
    const n = ri(rng, 4, 12);
    return { type: 'buildEq', prompt: `碟上有 🍮 ${n} 個，沒有被吃去。碟上還有 🍮 多少個？`, en: 'Write the number sentence.',
      visual: { kind: 'row', e: '🍮', n, crossed: 0 },
      tiles: tilesFor(rng, [0, n]), ops: ['+', '−', '='], answer: n, accept: [[n, '−', 0, '=', n]],
      hint: '「還有」用減法。沒有被吃去，就是減 0。', help: { kind: 'row', e: '🍮', n, crossed: 0 }, item: `${n}-0` };
  }
  const n = ri(rng, 2, 9);
  return { type: 'buildEq', prompt: `樹上原有 🐦 ${n} 隻，全部都飛走了。樹上還有 🐦 多少隻？`, en: 'Write the number sentence.',
    visual: { kind: 'row', e: '🐦', n, crossed: n },
    tiles: tilesFor(rng, [0, n]), ops: ['+', '−', '='], answer: 0, accept: [[n, '−', n, '=', 0]],
    hint: '全部飛走了，就是減去全部。', help: { kind: 'row', e: '🐦', n, crossed: n }, item: `${n}-${n}` };
}

export const GENERATORS = {
  addCountOn, addBuildEq, addCompute, addStoryChoice, addSwap, addSwapLeft, addSameAs, addMissing, addMissingFirst, addJudge, addCards,
  subTakeAway, subCompare, subBuildEq, subCompute, subFamily, subOpChoice, subMissing, subJudge, subCards, mixBuildEq, mixCompute,
  zeroEatAll, zeroCups, zeroBigSmall, zeroAddStory, zeroAddCompute, zeroSubNone, zeroSubCompute, zeroMixCompute, zeroMissing, zeroPattern, zeroJudge, zeroBuildEq,
};

/** Question for slot `i` of a level, at difficulty `diff`. Avoids repeating the previous question's item. */
export function makeQuestion(ch, n, i, diff, rng, prevItem = null) {
  const kind = levelOf(ch, n).plan[i];
  const gen = GENERATORS[kind];
  if (!gen) throw new Error('unknown question kind ' + kind);
  let q;
  for (let t = 0; t < 8; t++) { q = gen(rng, clampDiff(diff)); if (q.item !== prevItem) break; }
  return { ...q, kind, slot: i, diff: clampDiff(diff) };
}

/** True when the token list matches one of the accepted equations (numbers compared as numbers). */
export function eqMatches(tokens, accept) {
  return accept.some(a => a.length === tokens.length && a.every((t, i) => String(t) === String(tokens[i])));
}
/** Is a built equation true at all? (Used to tell "true but not this story" from "wrong sum".) */
export function eqIsTrue(tokens) {
  if (tokens.length !== 5 || tokens[3] !== '=' || !['+', '−'].includes(tokens[1])) return false;
  const [a, op, b, , c] = tokens.map(t => (typeof t === 'number' ? t : t));
  if (![a, b, c].every(Number.isInteger)) return false;
  return op === '+' ? a + b === c : a - b === c;
}
export { eqText };

// ---------- Stars, unlocks, progress ----------

/** Stars from slips across the level: 0-1 → 3★, 2-4 → 2★, more → 1★. Finishing always earns at least 1★. */
export function starsFor(mistakes) { return mistakes <= 1 ? 3 : mistakes <= 4 ? 2 : 1; }

export function emptyProgress() { return { levels: {}, stickers: [], treats: 0 }; }

/** Level n of a chapter is open when the chapter is open and level n-1 has been completed. */
export function isChapterOpen(ch, unlock = {}, testMode = false) { return testMode || !!unlock[ch]; }
export function isLevelOpen(progress, ch, n, unlock = {}, testMode = false) {
  if (!isChapterOpen(ch, unlock, testMode)) return false;
  if (testMode || n === 1) return true;
  return (progress.levels[levelKey(ch, n - 1)] || 0) > 0;
}
export function chapterDone(progress, ch) { return LEVELS[ch].every((_, i) => (progress.levels[levelKey(ch, i + 1)] || 0) > 0); }
export function chapterStars(progress, ch) { return LEVELS[ch].reduce((s, _, i) => s + (progress.levels[levelKey(ch, i + 1)] || 0), 0); }

/** Record a finished level. Keeps the best stars, adds treats (one per question answered), awards the chapter sticker. */
export function recordResult(progress, ch, n, stars, treats = 0) {
  const key = levelKey(ch, n);
  const prev = progress.levels[key] || 0;
  const levels = { ...progress.levels, [key]: Math.max(prev, stars) };
  const next = { ...progress, levels, treats: (progress.treats || 0) + treats, stickers: [...(progress.stickers || [])] };
  let sticker = null;
  if (chapterDone(next, ch) && !next.stickers.includes(ch)) { next.stickers.push(ch); sticker = ch; }
  return { progress: next, newBest: stars > prev, sticker };
}

/** Merge two progress docs (local mirror and Firestore): best stars per level, union of stickers, larger treat count. */
export function mergeProgress(a, b) {
  const base = emptyProgress();
  if (!a && !b) return base;
  const x = a || base, y = b || base;
  const levels = { ...(x.levels || {}) };
  for (const [k, v] of Object.entries(y.levels || {})) if (typeof v === 'number') levels[k] = Math.max(levels[k] || 0, v);
  const stickers = [...new Set([...(x.stickers || []), ...(y.stickers || [])])].filter(s => CHAPTERS.some(c => c.key === s));
  return { levels, stickers, treats: Math.max(x.treats || 0, y.treats || 0) };
}

// ---------- Praise (variable verbal reinforcement) ----------
export const PRAISE = ['好棒！', '做得好！', '真聰明！', '答對了！', '太厲害了！', '你是數學小高手！', '對了，繼續加油！'];
export const RETRY = ['再想想。', '差一點點！再試一次。', '不要緊，再試試看。'];
