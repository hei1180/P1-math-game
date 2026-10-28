// Picnic Park DOM renderers: pictures (visuals), equations and the seven question screens.
// A question renderer builds into `root` and reports through api:
//   api.submit(ok, picked, el)  final answer (the runner counts tries, praises, scaffolds)
//   api.partial(msg)            a correct inner step (count-on finished, one card equation found…)
//   api.say(msg)                buddy speaks without judging
// and returns { reveal() } — the last scaffold rung: show the right answer so the child can finish errorlessly.
import { eqMatches, eqIsTrue } from '../picnic-logic.js?v=202610112341';
import { audio } from './audio.js?v=202610112341';

export function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style') el.style.cssText = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat(Infinity)) if (c != null && c !== false) el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return el;
}
const re = (el, cls) => { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); };
export const shake = el => re(el, 'pk-shake');
export const popIn = el => re(el, 'pk-pop');
const wait = ms => new Promise(r => setTimeout(r, ms));

// ---------- Equation strip ----------

/** Horizontal equation; '?' becomes the answer box. Returns { el, fill(v) }. */
export function equation(tokens, { small = false } = {}) {
  let box = null;
  const el = h('div', { class: 'pk-eq' + (small ? ' small' : ''), 'aria-label': tokens.map(t => (t === '?' ? '□' : t)).join(' ') },
    tokens.map(t => {
      if (t === '?') { box = h('span', { class: 'pk-box' }, ''); return box; }
      const op = typeof t === 'string';
      return h('span', { class: op ? 'pk-op' : 'pk-num' }, t);
    }));
  return { el, fill(v) { if (box) { box.textContent = v; box.classList.add('filled'); popIn(box); } } };
}

// ---------- Pictures ----------

function tenFrame(cells) {
  return h('div', { class: 'pk-frame' }, cells.map(c => h('span', { class: 'pk-cell' + (c ? ' ' + c : '') })));
}
/** parts [a, b]: a orange then b green dots, filling frame 1 then frame 2. */
function frames(parts, { hideSecond = false } = {}) {
  const [a, b] = parts; const total = a + b;
  const nFrames = total > 10 ? 2 : 1;
  const cells = [];
  for (let i = 0; i < nFrames * 10; i++) cells.push(i < a ? 'dot a' : i < total ? (hideSecond ? 'ghost' : 'dot b') : '');
  const wrap = h('div', { class: 'pk-frames' });
  for (let f = 0; f < nFrames; f++) wrap.append(tenFrame(cells.slice(f * 10, f * 10 + 10)));
  return wrap;
}
function emojiGrid(e, n, { crossed = 0, cls = '' } = {}) {
  const g = h('div', { class: 'pk-grid ' + cls });
  for (let i = 0; i < n; i++) g.append(h('span', { class: 'pk-item' + (i >= n - crossed ? ' crossed' : '') }, e));
  if (n === 0) g.append(h('span', { class: 'pk-empty' }, '沒有'));
  return g;
}

/** Any picture described by a visual object from picnic-logic. */
export function visual(v) {
  if (!v) return null;
  switch (v.kind) {
    case 'frames': return h('div', { class: 'pk-visual' }, frames(v.parts, v));
    case 'groups':
      return h('div', { class: 'pk-visual pk-groups' }, v.groups.map((g, i) => [
        i > 0 && g.more ? h('span', { class: 'pk-arrow' }, '⬅ 多放') : null,
        h('div', { class: 'pk-plate' + (g.more ? ' more' : '') + (g.nest ? ' nest' : '') + (g.cake ? ' cake' : '') },
          emojiGrid(g.e, g.n), g.nest ? h('div', { class: 'pk-base' }, '🪺') : g.cake ? h('div', { class: 'pk-base' }, '🎂') : null),
      ]));
    case 'row': return h('div', { class: 'pk-visual' }, emojiGrid(v.e, v.n, { crossed: v.crossed, cls: 'row' }));
    case 'pairs': return h('div', { class: 'pk-visual' }, pairsView(v.a, v.b).el);
    case 'arc': return h('div', { class: 'pk-visual' }, arc(v));
    case 'swap': {
      const c = v.a + v.b;
      return h('div', { class: 'pk-visual pk-swap' },
        equation([v.a, '+', v.b, '=', c], { small: true }).el,
        h('div', { class: 'pk-swap-arrows' }, '⇅ 交換位置，結果不變'),
        equation([v.b, '+', v.a, '=', c], { small: true }).el);
    }
    case 'boxes':
      return h('div', { class: 'pk-visual pk-boxes' }, v.counts.map((n, i) =>
        h('div', { class: 'pk-cup' }, h('div', { class: 'pk-cup-in' }, v.cap ? h('span', { class: 'pk-many' }, `${v.e} × ${v.labels[i]}`) : emojiGrid(v.e, n)),
          h('div', { class: 'pk-cup-label' }, v.labels[i] + (v.showCounts && !v.cap && !/^\d+$/.test(v.labels[i]) ? `：${n}` : '')))));
    case 'numberline': {
      const max = Math.max(...v.mark, 10);
      const line = h('div', { class: 'pk-nline' });
      for (let i = 0; i <= max; i++) line.append(h('span', { class: 'pk-tick' + (v.mark.includes(i) ? ' mark' : '') }, i));
      return h('div', { class: 'pk-visual' }, line, h('div', { class: 'pk-note' }, '越左邊，越小。0 在最左邊。'));
    }
    case 'keywords':
      return h('div', { class: 'pk-visual pk-keys' },
        h('div', { class: 'pk-key add' }, h('b', {}, '+'), ' 共有・合計・多放・再來'),
        h('div', { class: 'pk-key sub' }, h('b', {}, '−'), ' 還有・餘下・取去・相差・多多少・少多少'));
    case 'rules':
      return h('div', { class: 'pk-visual pk-keys' },
        h('div', { class: 'pk-key add' }, '加 0 或減 0，數量不變：7 + 0 = 7，0 + 7 = 7，7 − 0 = 7'),
        h('div', { class: 'pk-key sub' }, '減去自己，得 0：7 − 7 = 0'));
    case 'cards': return h('div', { class: 'pk-visual pk-cards' }, v.cards.map(c => h('span', { class: 'pk-card' }, c)));
    default: return null;
  }
}

/** a —(+b)→ c on top, c —(−b)→ a below (textbook 加和減的關係). */
function arc({ a, b, c, hideA, hideB, hideC }) {
  const q = (v, hide) => (hide ? '?' : v);
  const svg = `<svg viewBox="0 0 140 80" width="140" height="80" aria-hidden="true">
    <defs><marker id="pkArrB" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#2563eb"/></marker>
    <marker id="pkArrG" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#16a34a"/></marker></defs>
    <path d="M10 34 Q70 -6 130 34" fill="none" stroke="#2563eb" stroke-width="4" marker-end="url(#pkArrB)"/>
    <path d="M130 46 Q70 86 10 46" fill="none" stroke="#16a34a" stroke-width="4" marker-end="url(#pkArrG)"/></svg>`;
  const mid = h('span', { class: 'pk-arc-svg' }); mid.innerHTML = svg;
  return h('div', { class: 'pk-arc' },
    h('div', { class: 'pk-arc-top' }, `+ ${q(b, hideB)}`),
    h('div', { class: 'pk-arc-mid' }, h('span', { class: 'pk-arc-n' }, q(a, hideA)), mid, h('span', { class: 'pk-arc-n' }, q(c, hideC))),
    h('div', { class: 'pk-arc-bot' }, `− ${q(b, hideB)}`));
}

/** Two rows matched one-to-one, dashed links between pairs. Returns { el, extras } (unmatched items of the longer row). */
function pairsView(A, B) {
  const m = Math.min(A.n, B.n);
  const rowA = h('div', { class: 'pk-prow' }), links = h('div', { class: 'pk-prow links' }), rowB = h('div', { class: 'pk-prow' });
  const extras = [];
  const cols = Math.max(A.n, B.n);
  for (let i = 0; i < cols; i++) {
    const ia = h('span', { class: 'pk-item' + (i < A.n ? '' : ' blank') }, i < A.n ? A.e : '');
    const ib = h('span', { class: 'pk-item' + (i < B.n ? '' : ' blank') }, i < B.n ? B.e : '');
    rowA.append(ia); rowB.append(ib);
    links.append(h('span', { class: 'pk-link' + (i < m ? ' on' : '') }));
    if (i >= m) extras.push(A.n > B.n ? ia : ib);
  }
  return { el: h('div', { class: 'pk-pairs', style: `--cols:${cols}` }, rowA, links, rowB), extras };
}

// ---------- Answer widgets ----------

/** A row of big answer buttons. onPick(value, button). Returns { el, reveal(ans), lock() }. */
function choiceRow(choices, onPick, { big = false } = {}) {
  const btns = choices.map(c => h('button', { class: 'pk-choice' + (big ? ' big' : ''), onclick: e => onPick(c, e.currentTarget) }, String(c)));
  return {
    el: h('div', { class: 'pk-choices' }, btns),
    reveal(ans) { for (const b of btns) { const ok = b.textContent === String(ans); b.disabled = !ok; b.classList.toggle('pk-reveal', ok); } },
    lock() { btns.forEach(b => { b.disabled = true; }); },
    unlock() { btns.forEach(b => { b.disabled = false; }); },
  };
}

function promptCard(q, api) {
  return h('div', { class: 'pk-prompt' },
    h('button', { class: 'pk-say', 'aria-label': '讀題 Read aloud', onclick: () => audio.say(q.prompt + (q.sub ? q.sub : '')) }, '🔈'),
    h('div', {}, h('div', { class: 'pk-prompt-zh' }, q.prompt), q.sub ? h('div', { class: 'pk-prompt-sub' }, q.sub) : null, h('div', { class: 'pk-prompt-en' }, q.en)));
}

/** Choice step shared by the story screens: equation + choices, revealed after the hands-on step. */
function answerStep(q, api, holder) {
  const eq = q.eq ? equation(q.eq) : null;
  const row = choiceRow(q.choices, (v, btn) => {
    const ok = String(v) === String(q.answer);
    if (ok) { row.lock(); eq?.fill(v); }
    api.submit(ok, v, btn);
  }, { big: q.big });
  holder.replaceChildren(...[eq?.el, row.el].filter(Boolean));
  holder.classList.add('pk-show');
  return row;
}

// ---------- Question screens ----------

export const RENDER = {
  /** Generic: prompt, optional picture, equation with a box, choices. */
  choice(q, root, api) {
    const eq = q.eq ? equation(q.eq) : null;
    const row = choiceRow(q.choices, (v, btn) => {
      const ok = String(v) === String(q.answer);
      if (ok) { row.lock(); eq?.fill(v); }
      api.submit(ok, v, btn);
    }, { big: q.big });
    root.append(promptCard(q, api), visual(q.visual) || '', eq ? eq.el : '', row.el);
    return { reveal: () => row.reveal(q.answer) };
  },

  /** Count on: move the second group into the ten-frame one by one, then answer. */
  countOn(q, root, api) {
    const total = q.a + q.b;
    const nFrames = total > 10 ? 2 : 1;
    const cells = [];
    const frameWrap = h('div', { class: 'pk-frames' });
    for (let f = 0; f < nFrames; f++) {
      const fr = h('div', { class: 'pk-frame' });
      for (let i = 0; i < 10; i++) { const c = h('span', { class: 'pk-cell' }); cells.push(c); fr.append(c); }
      frameWrap.append(fr);
    }
    for (let i = 0; i < q.a; i++) cells[i].classList.add('dot', 'a');
    const count = h('div', { class: 'pk-count' }, String(q.a));
    let moved = 0;
    const groupA = h('div', { class: 'pk-plate' }, emojiGrid(q.itemA, q.a));
    const tokens = [];
    const groupB = h('div', { class: 'pk-plate more tappable' }, h('div', { class: 'pk-grid' }, Array.from({ length: q.b }, () => {
      const t = h('button', { class: 'pk-item tap', 'aria-label': '移到十格框', onclick: () => moveOne(t) }, q.itemB);
      tokens.push(t); return t;
    })));
    const holder = h('div', { class: 'pk-answer' });
    const tapLine = h('div', { class: 'pk-tapline' }, '👆 ', q.tapLine);
    let row = null;
    function moveOne(t) {
      if (t.disabled) return;
      t.disabled = true; t.classList.add('gone');
      const cell = cells[q.a + moved]; moved++;
      cell.classList.add('dot', 'b'); popIn(cell);
      count.textContent = String(q.a + moved); popIn(count);
      audio.count(moved); audio.say(String(q.a + moved));
      if (moved === q.b) {
        tapLine.textContent = '✅ 數好了！共有多少？';
        setTimeout(() => { row = answerStep(q, api, holder); }, 350);
        api.partial?.(null);
      }
    }
    root.append(promptCard(q, api),
      h('div', { class: 'pk-visual pk-groups' }, groupA, h('span', { class: 'pk-arrow' }, q.story === 'addOn' ? '⬅ 多放' : '和'), groupB),
      h('div', { class: 'pk-visual pk-row-center' }, frameWrap, count), tapLine, holder);
    return { reveal() { tokens.forEach(t => moveOne(t)); setTimeout(() => row?.reveal(q.answer), 400); } };
  },

  /** Take away: cross out k items, then answer. k = 0 skips straight to the answer. */
  takeAway(q, root, api) {
    let crossed = 0;
    const items = [];
    const grid = h('div', { class: 'pk-grid row big' }, Array.from({ length: q.n }, () => {
      const t = h('button', { class: 'pk-item tap', 'aria-label': '畫走', onclick: () => cross(t) }, q.e);
      items.push(t); return t;
    }));
    const holder = h('div', { class: 'pk-answer' });
    const tapLine = h('div', { class: 'pk-tapline' }, '👆 ', q.tapLine);
    let row = null;
    function cross(t) {
      if (t.disabled) return;
      if (crossed >= q.k) { shake(t); audio.soft(); api.say(q.k === 0 ? '一個也沒有拿走，不用畫。' : `只畫 ${q.k} 個就夠了。`); return; }
      t.disabled = true; t.classList.add('crossed'); crossed++;
      audio.cross();
      if (crossed === q.k) done();
    }
    function done() {
      tapLine.textContent = q.k === 0 ? '✅ 沒有拿走。還有多少？' : '✅ 畫好了！還有多少？';
      items.forEach(t => { t.disabled = true; });
      setTimeout(() => { row = answerStep(q, api, holder); }, 350);
    }
    root.append(promptCard(q, api), h('div', { class: 'pk-visual' }, grid), tapLine, holder);
    if (q.k === 0) setTimeout(done, 900);
    return { reveal() { items.forEach(t => { if (crossed < q.k) cross(t); }); setTimeout(() => row?.reveal(q.answer), 400); } };
  },

  /** Compare: pairs are linked; circle the unmatched ones, then answer. */
  compare(q, root, api) {
    const pv = pairsView(q.a, q.b);
    let circled = 0;
    const holder = h('div', { class: 'pk-answer' });
    const tapLine = h('div', { class: 'pk-tapline' }, '👆 ', q.tapLine);
    let row = null;
    const extras = new Set(pv.extras);
    pv.el.querySelectorAll('.pk-prow:not(.links) .pk-item:not(.blank)').forEach(it => {
      it.classList.add('tap'); it.setAttribute('role', 'button');
      it.addEventListener('click', () => {
        if (it.classList.contains('circled')) return;
        if (!extras.has(it)) { shake(it); audio.soft(); api.say('這個已經有配對了。'); return; }
        it.classList.add('circled'); circled++; audio.count(circled); audio.say(String(circled));
        if (circled === extras.size) {
          tapLine.textContent = '✅ 圈好了！';
          setTimeout(() => { row = answerStep(q, api, holder); }, 350);
        }
      });
    });
    root.append(promptCard(q, api), h('div', { class: 'pk-visual' }, pv.el), tapLine, holder);
    return { reveal() { extras.forEach(it => it.click()); setTimeout(() => row?.reveal(q.answer), 400); } };
  },

  /** Fill □○□○□ with number and sign tiles. */
  buildEq(q, root, api) {
    const b = builder(q, api, eq => {
      if (eqMatches(eq, q.accept)) { b.lock(true); api.submit(true, eq.join(' '), b.el); return; }
      const why = eqIsTrue(eq) ? '算式是對的，但和圖意不一樣。看看題目的數字。' : null;
      api.submit(false, eq.join(' '), b.el, why);
    });
    root.append(promptCard(q, api), visual(q.visual) || '', b.el);
    return { reveal: () => b.show(q.accept[0]) };
  },

  /** Number cards: build `need` different true sentences from three cards. */
  cards(q, root, api) {
    const found = [];
    const list = h('div', { class: 'pk-found' }, Array.from({ length: q.need }, () => h('div', { class: 'pk-found-slot' }, '？')));
    const b = builder({ ...q, tiles: [...q.cards].sort((x, y) => x - y) }, api, eq => {
      const key = eq.join(' ');
      if (!eqMatches(eq, q.accept)) {
        api.submit(false, key, b.el, eqIsTrue(eq) ? '要用這三張數卡。' : null);
        return;
      }
      if (found.includes(key)) { api.say('這一道已經寫過了，試試另一道！'); shake(b.el); b.clear(); return; }
      const slot = list.children[found.length];
      found.push(key); slot.textContent = key; slot.classList.add('done'); popIn(slot);
      b.clear();
      if (found.length === q.need) { b.lock(true); api.submit(true, 'cards', slot); }
      else api.partial(`還有 ${q.need - found.length} 道！`);
    }, { cards: true });
    root.append(promptCard(q, api), h('div', { class: 'pk-visual pk-cards' }, q.cards.map(c => h('span', { class: 'pk-card' }, c))), list, b.el);
    return { reveal: () => { const next = q.accept.find(a => !found.includes(a.join(' '))); if (next) b.show(next); } };
  },

  /** Little teacher: is the claim right? If it is wrong, fix it. */
  judge(q, root, api) {
    const holder = h('div', { class: 'pk-answer pk-show' });
    const claim = h('div', { class: 'pk-claim' }, h('span', { class: 'pk-speaker' }, q.speaker), h('div', { class: 'pk-bubble' }, q.claim));
    let fixRow = null;
    const row = choiceRow(['✔ 對', '✘ 錯'], (v, btn) => {
      const saysRight = v === '✔ 對';
      if (saysRight !== q.right) { api.submit(false, v, btn); return; }
      row.lock(); btn.classList.add('pk-picked');
      if (q.right || !q.fix) { api.submit(true, v, btn); return; }
      api.partial('對，是錯的！那正確的答案是甚麼？');
      const eq = equation(q.fix.eq);
      fixRow = choiceRow(q.fix.choices, (fv, fbtn) => {
        const ok = String(fv) === String(q.fix.answer);
        if (ok) { fixRow.lock(); eq.fill(fv); }
        api.submit(ok, fv, fbtn);
      });
      holder.append(h('div', { class: 'pk-prompt-sub' }, q.fix.prompt), eq.el, fixRow.el);
    }, { big: true });
    holder.append(row.el);
    root.append(promptCard(q, api), claim, holder);
    return { reveal() { if (fixRow) fixRow.reveal(q.fix.answer); else row.reveal(q.right ? '✔ 對' : '✘ 錯'); } };
  },
};

/** □○□○□ builder with tiles. onCheck(tokens) when the child taps ✔. */
function builder(q, api, onCheck, { cards = false } = {}) {
  const kinds = ['n', 'o', 'n', 'o', 'n'];
  const vals = [null, null, null, null, null];
  const slots = kinds.map((k, i) => h('button', { class: 'pk-slot ' + (k === 'n' ? 'num' : 'op'), 'aria-label': k === 'n' ? '數字格' : '符號圈', onclick: () => clearAt(i) }, ''));
  const check = h('button', { class: 'pk-check', disabled: true, onclick: () => onCheck(vals.map((v, i) => (kinds[i] === 'n' ? Number(v) : v))) }, '✔ 完成');
  const numTiles = q.tiles.map(n => h('button', { class: 'pk-tile num', onclick: () => put('n', n) }, n));
  const opTiles = q.ops.map(o => h('button', { class: 'pk-tile op', onclick: () => put('o', o) }, o));
  let locked = false;
  function render() { slots.forEach((s, i) => { s.textContent = vals[i] ?? ''; s.classList.toggle('filled', vals[i] != null); }); check.disabled = locked || vals.some(v => v == null); }
  function put(kind, v) {
    if (locked) return;
    const i = vals.findIndex((x, j) => x == null && kinds[j] === kind);
    if (i < 0) { audio.soft(); shake(kind === 'n' ? slots[0].parentElement : slots[1].parentElement); return; }
    vals[i] = v; audio.tap(); render(); popIn(slots[i]);
  }
  function clearAt(i) { if (locked || vals[i] == null) return; vals[i] = null; audio.tap(); render(); }
  render();
  const el = h('div', { class: 'pk-builder' },
    h('div', { class: 'pk-slots' }, slots),
    h('div', { class: 'pk-tiles' }, h('div', { class: 'pk-tile-row' }, numTiles), h('div', { class: 'pk-tile-row' }, opTiles, check)),
    h('div', { class: 'pk-note' }, cards ? '按數卡和符號放進格內；按格子可以清除。' : '按數字和符號放進 □ 和 ○ 內；按格子可以清除。'));
  return {
    el,
    clear() { vals.fill(null); render(); },
    lock(v) { locked = v; render(); },
    /** Reveal rung: fill the right sentence; the child taps ✔ to finish. */
    show(tokens) { tokens.forEach((t, i) => { vals[i] = t; }); render(); slots.forEach(s => s.classList.add('pk-reveal-slot')); check.classList.add('pk-reveal'); },
  };
}

/** Small celebratory particle burst at an element (emoji). */
export function burstAt(el, emojis = ['⭐', '✨', '🌟'], n = 8) {
  if (!el || document.documentElement.classList.contains('less-motion')) return;
  const r = el.getBoundingClientRect();
  const x = r.left + r.width / 2, y = r.top + r.height / 2;
  for (let i = 0; i < n; i++) {
    const p = h('span', { class: 'pk-burst' }, emojis[i % emojis.length]);
    const ang = (i / n) * Math.PI * 2 + Math.random() * 0.5, dist = 50 + Math.random() * 50;
    p.style.left = x + 'px'; p.style.top = y + 'px';
    p.style.setProperty('--dx', Math.cos(ang) * dist + 'px'); p.style.setProperty('--dy', Math.sin(ang) * dist - 30 + 'px');
    document.body.append(p); setTimeout(() => p.remove(), 700);
  }
}

/** Fly an emoji from one element to another (treat → basket). */
export function flyEmoji(fromEl, toEl, e) {
  if (!fromEl || !toEl) return Promise.resolve();
  const a = fromEl.getBoundingClientRect(), b = toEl.getBoundingClientRect();
  const p = h('span', { class: 'pk-fly' }, e);
  p.style.transform = `translate(${a.left + a.width / 2}px, ${a.top + a.height / 2}px) translate(-50%,-50%) scale(1.4)`;
  document.body.append(p);
  requestAnimationFrame(() => requestAnimationFrame(() => {
    p.style.transform = `translate(${b.left + b.width / 2}px, ${b.top + b.height / 2}px) translate(-50%,-50%) scale(.7)`;
  }));
  return wait(620).then(() => p.remove());
}
