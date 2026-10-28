// Picnic Park 野餐樂園 entry: login bridge, map, level intro (worked example), question runner, end card.
//
// Teaching design (see docs/superpowers/specs/2026-10-10-picnic-park-design.md):
// - Bloom: each chapter's five levels climb understand → apply → analyse → evaluate/create.
// - Scaffolding: worked example before every level; on a slip the buddy gives a word hint, then a picture,
//   then shows the answer so the child finishes errorlessly; adaptive difficulty follows first-try answers.
// - Reinforcement: instant sound + praise, a treat flies to the basket for every answer, a bonus for three
//   first-try answers in a row, stars per level, a sticker and unit notes when a chapter is finished.
import { signIn, onUser, player, settings, session, enterTestMode, mountTeacherModal, logAttempt } from '../shared.js?v=202610112341';
import {
  CHAPTERS, LEVELS, QUESTIONS_PER_LEVEL, chapter, levelOf, levelKey, modeKey, makeRng, makeQuestion, nextDiff, startDiff,
  starsFor, isChapterOpen, isLevelOpen, chapterStars, recordResult, PRAISE, RETRY,
} from '../picnic-logic.js?v=202610112341';
import { loadProgress, saveProgress } from '../picnic-progress.js?v=202610112341';
import { audio } from './audio.js?v=202610112341';
import { h, RENDER, visual, equation, burstAt, flyEmoji, shake, popIn } from './render.js?v=202610112341';

const $ = id => document.getElementById(id);
const app = () => $('app');
const params = new URLSearchParams(location.search);
const seed = params.has('seed') ? Number(params.get('seed')) : Date.now();
const rng = makeRng(seed);
const pickOne = arr => arr[Math.floor(Math.random() * arr.length)];

const state = { progress: null, run: null };
const unlock = () => settings.picnicUnlock || {};
const testMode = () => session.testMode;

// ---------- Buddy (speech bubble that hints and praises) ----------

function buddySay(text, { speak = true, mood = '' } = {}) {
  const b = $('buddy'); if (!b) return;
  b.querySelector('.pk-bubble').textContent = text;
  b.classList.remove('hidden', 'happy', 'think'); if (mood) b.classList.add(mood);
  popIn(b.querySelector('.pk-bubble'));
  if (speak) audio.say(text);
}
function buddyFace(e) { const f = $('buddy')?.querySelector('.pk-buddy-face'); if (f) f.textContent = e; }

// ---------- Map ----------

function showMap() {
  audio.hush();
  state.run = null;
  const p = state.progress;
  const stickers = CHAPTERS.map(c => h('span', { class: 'pk-sticker' + (p.stickers.includes(c.key) ? ' got' : ''), title: c.title }, p.stickers.includes(c.key) ? c.icon : '❔'));
  app().replaceChildren(
    h('div', { class: 'pk-map' },
      h('header', { class: 'pk-map-head' },
        h('a', { href: 'index.html', class: 'pk-back', 'aria-label': '返回 Back' }, '⬅'),
        h('h1', {}, '🧺 Picnic Park 野餐樂園', h('small', {}, '基本加法和減法 · 加法・減法・0')),
        h('div', { class: 'pk-basket', id: 'basket', title: '收集到的野餐食物' }, '🧺 ', h('b', {}, p.treats || 0))),
      h('div', { class: 'pk-stickers' }, '貼紙 Stickers：', stickers),
      h('div', { class: 'pk-chapters' }, CHAPTERS.map(c => chapterCard(c))),
      h('div', { class: 'pk-map-foot' }, '每個地方大約 10 分鐘。About 10 minutes per place.')));
}

function chapterCard(c) {
  const p = state.progress;
  const open = isChapterOpen(c.key, unlock(), testMode());
  const stars = chapterStars(p, c.key);
  const done = p.stickers.includes(c.key);
  return h('section', { class: `pk-chapter ch-${c.key}` + (open ? '' : ' locked') },
    h('div', { class: 'pk-ch-head' },
      h('span', { class: 'pk-ch-icon' }, c.icon),
      h('div', {}, h('div', { class: 'pk-ch-title' }, c.title, ' ', h('small', {}, c.en)), h('div', { class: 'pk-ch-place' }, `${c.place} ${c.placeEn}`)),
      h('div', { class: 'pk-ch-stars' }, `⭐ ${stars}/15`)),
    h('ol', { class: 'pk-path' }, LEVELS[c.key].map((lv, i) => {
      const n = i + 1;
      const lvOpen = isLevelOpen(p, c.key, n, unlock(), testMode());
      const s = p.levels[levelKey(c.key, n)] || 0;
      return h('li', {},
        h('button', { class: 'pk-stone' + (s ? ' done' : '') + (lvOpen ? '' : ' locked'), disabled: !lvOpen, onclick: () => startLevel(c.key, n) },
          h('span', { class: 'pk-stone-n' }, lvOpen ? n : '🔒'),
          h('span', { class: 'pk-stone-t' }, lv.title, h('small', {}, lv.bloom)),
          h('span', { class: 'pk-stone-s' }, s ? '⭐'.repeat(s) + '☆'.repeat(3 - s) : lvOpen ? '▶' : '')));
    })),
    done ? h('button', { class: 'pk-notes-btn', onclick: () => showNotes(c.key) }, '📒 單元筆記 Unit notes') : null,
    open ? null : h('div', { class: 'pk-lock-note' }, '🔒 老師未開放 Not open yet'));
}

// ---------- Level intro: worked example (I do) ----------

function startLevel(ch, n) {
  audio.unlock();
  const c = chapter(ch), lv = levelOf(ch, n);
  const eq = equation(lv.intro.eq);
  const lines = lv.intro.lines.map(t => h('p', { class: 'pk-intro-line' }, t));
  app().replaceChildren(h('div', { class: `pk-intro ch-${ch}` },
    h('div', { class: 'pk-intro-card' },
      h('div', { class: 'pk-intro-tag' }, `${c.icon} ${c.title} · 第 ${n} 關 · ${lv.bloom}`),
      h('h2', {}, lv.title, h('small', {}, lv.en)),
      h('div', { class: 'pk-goal' }, '🎯 ', lv.goal),
      h('div', { class: 'pk-example' }, h('div', { class: 'pk-example-tag' }, `${c.buddy} 我示範給你看`), visual(lv.intro.visual) || '', lines, eq.el),
      h('div', { class: 'pk-intro-btns' },
        h('button', { class: 'pk-btn ghost', onclick: () => showMap() }, '⬅ 地圖'),
        h('button', { class: 'pk-btn ghost', onclick: () => audio.say(lv.goal + lv.intro.lines.join('')) }, '🔈 再聽'),
        h('button', { class: 'pk-btn go', onclick: () => play(ch, n) }, '開始！Start ▶')))));
  lines.forEach((l, i) => { l.style.animationDelay = `${0.3 + i * 0.6}s`; });
  audio.say(lv.goal + lv.intro.lines.join(''));
}

// ---------- Runner ----------

function play(ch, n) {
  audio.hush();
  const c = chapter(ch);
  state.run = { ch, n, i: 0, mistakes: 0, tries: 0, treats: 0, ...{ diff: startDiff(n), streak: 0 }, run3: 0, prevItem: null, t0: Date.now(), confusions: [], busy: false, view: null, q: null };
  app().replaceChildren(h('div', { class: `pk-play ch-${ch}` },
    h('header', { class: 'pk-top' },
      h('button', { class: 'pk-back', 'aria-label': '離開 Leave', onclick: confirmLeave }, '⬅'),
      h('div', { class: 'pk-top-title' }, `${c.icon} ${levelOf(ch, n).title}`),
      h('div', { class: 'pk-dots', id: 'dots' }, Array.from({ length: QUESTIONS_PER_LEVEL }, () => h('span', { class: 'pk-dot' }))),
      h('button', { class: 'pk-hint-btn', id: 'hintBtn', 'aria-label': '提示 Hint', onclick: askHelp }, '💡'),
      h('div', { class: 'pk-basket', id: 'basket' }, c.icon, ' ', h('b', { id: 'treatCount' }, 0))),
    h('main', { class: 'pk-stage', id: 'stage' }),
    h('div', { id: 'buddy', class: 'pk-buddy hidden' }, h('span', { class: 'pk-buddy-face' }, c.buddy), h('div', { class: 'pk-bubble' }, ''))));
  nextQuestion();
}

function nextQuestion() {
  const r = state.run;
  r.tries = 0; r.busy = false; r.helpShown = false;
  r.q = makeQuestion(r.ch, r.n, r.i, r.diff, rng, r.prevItem);
  r.prevItem = r.q.item;
  [...$('dots').children].forEach((d, j) => { d.className = 'pk-dot' + (j < r.i ? ' done' : j === r.i ? ' now' : ''); });
  $('buddy').classList.add('hidden'); buddyFace(chapter(r.ch).buddy);
  const stage = $('stage');
  stage.replaceChildren();
  const box = h('div', { class: 'pk-q pk-enter' });
  stage.append(box);
  r.view = RENDER[r.q.type](r.q, box, { submit, partial, say: t => buddySay(t) });
  const lv = levelOf(r.ch, r.n);
  if (lv.helpFrom != null && r.i < lv.helpFrom) showHelp(false); // supported phase of the level; fades from slot helpFrom
  audio.say(r.q.prompt + (r.q.sub || ''));
}

function showHelp(speak = true) {
  const r = state.run; if (!r || r.helpShown) return;
  r.helpShown = true;
  // Inline, right above where the child answers, so the picture never hides the buttons.
  const panel = h('div', { class: 'pk-help' }, h('div', { class: 'pk-help-tag' }, '💡 ', r.q.hint), visual(r.q.help) || '');
  const box = $('stage').querySelector('.pk-q');
  const act = box.querySelector('.pk-answer.pk-show, .pk-choices, .pk-builder');
  if (act && act.parentElement === box) box.insertBefore(panel, act); else box.append(panel);
  popIn(panel);
  requestAnimationFrame(() => $('stage').scrollTo({ top: $('stage').scrollHeight, behavior: 'smooth' }));
  if (speak) audio.say(r.q.hint);
}
/** Child-initiated help: free, no star cost (the help is the reward for asking). */
function askHelp() { audio.tap(); if (state.run?.helpShown) { audio.say(state.run.q.hint); return; } showHelp(true); buddyFace('🤔'); }

function partial(msg) {
  audio.pop();
  if (msg) buddySay(msg, { mood: 'happy' });
}

function submit(ok, picked, el, why = null) {
  const r = state.run; if (!r || r.busy) return;
  if (ok) {
    r.busy = true;
    const firstTry = r.tries === 0;
    audio.right(); burstAt(el, firstTry ? ['⭐', '✨', '🌟'] : ['✨', '👍']);
    r.treats++;
    $('treatCount').textContent = r.treats;
    flyEmoji(el, $('basket'), chapter(r.ch).icon).then(() => popIn($('basket')));
    if (firstTry) r.run3++; else r.run3 = 0;
    const bonus = firstTry && r.run3 > 0 && r.run3 % 3 === 0;
    buddyFace(bonus ? '🤩' : '😄');
    buddySay(r.tries >= 3 ? '我們一起做到了！下次你自己試試。' : bonus ? `連續答對 ${r.run3} 題！送你一份驚喜！🎁` : pickOne(PRAISE), { mood: 'happy' });
    if (bonus) { r.treats++; $('treatCount').textContent = r.treats; audio.bonus(); burstAt($('basket'), ['🎁', '🌈', '⭐'], 10); }
    const nd = nextDiff({ diff: r.diff, streak: r.streak }, r.tries + 1);
    r.diff = nd.diff; r.streak = nd.streak;
    r.i++;
    setTimeout(() => (r.i >= QUESTIONS_PER_LEVEL ? finishLevel() : nextQuestion()), bonus ? 2200 : 1500);
    return;
  }
  // Slip: one mistake, then climb the scaffold ladder (hint → picture → shown answer).
  r.tries++; r.mistakes++; r.run3 = 0;
  if (r.confusions.length < 5 && r.q.item != null) r.confusions.push({ item: r.q.item, picked: String(picked) });
  audio.soft(); if (el) shake(el);
  buddyFace('🤔');
  if (r.tries === 1) buddySay(`${pickOne(RETRY)}${why || r.q.hint}`, { mood: 'think' });
  else if (r.tries === 2) { buddySay(why || '看看下面的圖，幫你想一想。', { mood: 'think' }); showHelp(false); }
  else { showHelp(false); r.view.reveal(); buddySay('答案在這裏，按一下吧！', { mood: 'think' }); }
}

async function finishLevel() {
  const r = state.run;
  audio.hush();
  const stars = starsFor(r.mistakes);
  const durationSec = Math.round((Date.now() - r.t0) / 1000);
  logAttempt({ game: 'picnic', mode: modeKey(r.ch, r.n), kind: 'level', stars, mistakes: r.mistakes, durationSec, confusions: r.confusions });
  const res = recordResult(state.progress, r.ch, r.n, stars, r.treats);
  if (!testMode()) { state.progress = res.progress; saveProgress(player.uid, res.progress); }
  const c = chapter(r.ch);
  const hasNext = r.n < LEVELS[r.ch].length;
  const starEls = [0, 1, 2].map(i => h('span', { class: 'pk-big-star' + (i < stars ? ' on' : '') }, i < stars ? '⭐' : '☆'));
  const msg = stars === 3 ? '完美！你是數學小高手！' : stars === 2 ? '做得好！再玩一次可以拿 3 粒星。' : '完成了！多練習會越來越好。';
  app().replaceChildren(h('div', { class: `pk-end ch-${r.ch}` },
    h('div', { class: 'pk-end-card' },
      h('div', { class: 'pk-end-buddy' }, c.buddy),
      h('h2', {}, `${levelOf(r.ch, r.n).title} 完成！`),
      h('div', { class: 'pk-stars-row' }, starEls),
      h('p', { class: 'pk-end-msg' }, msg),
      h('div', { class: 'pk-plate-row' }, Array.from({ length: Math.min(r.treats, 12) }, () => h('span', {}, c.icon)), h('b', {}, ` × ${r.treats}`)),
      testMode() ? h('div', { class: 'pk-note' }, '🧪 測試模式：不會儲存 Test mode: not saved') : null,
      h('div', { class: 'pk-intro-btns' },
        h('button', { class: 'pk-btn ghost', onclick: showMap }, '🗺️ 地圖'),
        h('button', { class: 'pk-btn ghost', onclick: () => startLevel(r.ch, r.n) }, '🔁 再玩'),
        hasNext ? h('button', { class: 'pk-btn go', onclick: () => startLevel(r.ch, r.n + 1) }, '下一關 ▶') : null))));
  starEls.forEach((s, i) => { if (i < stars) setTimeout(() => { popIn(s); audio.star(i); }, 300 + i * 350); });
  audio.say(`${levelOf(r.ch, r.n).title}完成！${msg}`);
  if (res.sticker && !testMode()) setTimeout(() => showSticker(r.ch), 2200);
  else if (testMode() && !hasNext) setTimeout(() => showSticker(r.ch), 2200);
}

// ---------- Chapter sticker and unit notes (consolidation) ----------

const NOTES = {
  add: [['加法', '圖中共有蝴蝶 3 隻：1 + 2 = 3'], ['多放', '木頭上現有兔子 4 隻：3 + 1 = 4'], ['有趣的加法', '4 + 5 = 5 + 4，交換位置，結果不變']],
  sub: [['餘下', '池塘裏還有鴨子 4 隻：5 − 1 = 4'], ['相差', '兩種魚的數量相差 1 條：3 − 2 = 1'], ['加和減的關係', '6 + 3 = 9，9 − 3 = 6'], ['小心', '5 − 3 不可以寫成 3 − 5']],
  zero: [['0 的認識', '荷葉上有青蛙 0 隻，0 表示沒有'], ['加 0、減 0', '3 + 0 = 3，0 + 3 = 3，3 − 0 = 3'], ['減去自己', '5 − 5 = 0']],
};

function showSticker(ch) {
  const c = chapter(ch);
  audio.fanfare();
  const layer = h('div', { class: 'pk-modal' }, h('div', { class: 'pk-modal-card pk-sticker-card' },
    h('div', { class: 'pk-sticker-big' }, c.icon),
    h('h2', {}, `${c.place}完成！`),
    h('p', {}, `你得到「${c.title}」貼紙！`),
    notesList(ch),
    h('button', { class: 'pk-btn go', onclick: () => { layer.remove(); showMap(); } }, '太好了！')));
  document.body.append(layer);
  burstAt(layer.querySelector('.pk-sticker-big'), ['🎉', '⭐', c.icon], 14);
  audio.say(`${c.place}完成！你得到${c.title}貼紙！`);
}
function notesList(ch) {
  return h('div', { class: 'pk-notes' }, h('div', { class: 'pk-notes-tag' }, '📒 單元筆記'), NOTES[ch].map(([k, v]) => h('div', { class: 'pk-note-row' }, h('b', {}, k), v)));
}
function showNotes(ch) {
  const layer = h('div', { class: 'pk-modal', onclick: e => { if (e.target === layer) layer.remove(); } },
    h('div', { class: 'pk-modal-card' }, h('h2', {}, `${chapter(ch).icon} ${chapter(ch).title}`), notesList(ch),
      h('button', { class: 'pk-btn go', onclick: () => layer.remove() }, '好')));
  document.body.append(layer);
}

function confirmLeave() {
  const layer = h('div', { class: 'pk-modal' }, h('div', { class: 'pk-modal-card' },
    h('h2', {}, '離開這一關？'), h('p', {}, 'Leave this level? Your answers here will not be saved.'),
    h('div', { class: 'pk-intro-btns' },
      h('button', { class: 'pk-btn ghost', onclick: () => layer.remove() }, '繼續玩'),
      h('button', { class: 'pk-btn go', onclick: () => { layer.remove(); showMap(); } }, '回地圖'))));
  document.body.append(layer);
}

// ---------- Boot ----------

function startGame() {
  $('loginScreen').classList.add('hidden');
  $('gameScreen').classList.remove('hidden');
  document.documentElement.classList.toggle('less-motion', !!settings.lessMotion);
  const sc = params.get('scene'); // dev: ?scene=add-3 jumps straight to a level
  const m = sc && /^(add|sub|zero)-([1-5])$/.exec(sc);
  if (m && testMode()) play(m[1], Number(m[2])); else showMap();
}

$('loginBtn').addEventListener('click', signIn);
$('muteBtn').textContent = audio.muted ? '🔇' : '🔊';
$('muteBtn').addEventListener('click', () => { audio.muted = !audio.muted; $('muteBtn').textContent = audio.muted ? '🔇' : '🔊'; });
document.addEventListener('pointerdown', () => audio.unlock(), { passive: true });
mountTeacherModal(() => { if (!state.run) showMap(); document.documentElement.classList.toggle('less-motion', !!settings.lessMotion); });
window.__picnic = { state, play, startLevel, showMap, showSticker };

const isLocal = ['localhost', '127.0.0.1'].includes(location.hostname) || /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(location.hostname);
if (isLocal && params.has('dev')) {
  player.name = 'Dev'; enterTestMode();
  loadProgress(null).then(p => { state.progress = p; startGame(); });
} else {
  onUser(async p => { state.progress = await loadProgress(p.uid); startGame(); },
         () => { $('loginSpinner').classList.add('hidden'); $('loginBtn').classList.remove('hidden'); });
}
