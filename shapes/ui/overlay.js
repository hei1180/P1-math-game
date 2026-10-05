// Robot Workshop DOM overlay: prompts, answer buttons, progress dots, toasts, end panel, modal cards.
// Everything is built with textContent (never innerHTML with data). The root (#ui) lets taps through;
// only the controls we add switch pointer-events back on.
import { FONT } from '../theme.js?v=202610051406';
import { sfx } from '../sfx.js?v=202610051406';
import { voice } from '../engine/voice.js?v=202610051406';
import { motion } from '../engine/tween.js?v=202610051406';

const S = { root: null, top: null, prompt: null, dots: null, choices: null, toast: null, modal: null, back: null, say: '', gen: 0, ch: null };

function el(tag, cls = '', text = null) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== null && text !== '') e.textContent = text;
  return e;
}
const speak = zh => { try { return Promise.resolve(voice.say(zh)).catch(() => {}); } catch (e) { return Promise.resolve(); } };
const later = (ms, gen, fn) => setTimeout(() => { if (gen === S.gen) fn(); }, motion.less ? ms * 0.5 : ms);

/** Put `node` in slot `key` (replacing what was there), under the root. */
function put(key, node) {
  if (S[key]) S[key].remove();
  S[key] = node;
  S.root.appendChild(node);
  return node;
}
function drop(key) { if (S[key]) { S[key].remove(); S[key] = null; } }

/** Top-centre column that holds the prompt card and the progress dots (below the corner buttons). */
function topColumn() {
  if (!S.top) {
    S.top = el('div', 'absolute inset-x-0 top-14 flex flex-col items-center gap-2 px-2');
    S.top.style.pointerEvents = 'none';
    S.root.appendChild(S.top);
  }
  return S.top;
}

function button(cls, minH = 56) {
  const b = el('button', `bubbly-btn pointer-events-auto rounded-2xl font-bold ${cls}`);
  b.type = 'button';
  b.style.minHeight = minH + 'px';
  b.style.fontFamily = FONT;
  return b;
}

/** A modal backdrop that blocks taps to the canvas and holds one centred panel. */
function modal(panel) {
  const back = el('div', 'absolute inset-0 flex items-center justify-center p-4 bg-black/50');
  back.style.pointerEvents = 'auto';
  back.style.fontFamily = FONT;
  back.appendChild(panel);
  return put('modal', back);
}

export const ui = {
  /** el = #ui */
  mount(root) {
    S.root = root;
    root.style.fontFamily = FONT;
  },

  prompt(zh, en = '', { speak: say = true } = {}) {
    const col = topColumn();
    if (S.prompt) S.prompt.remove();
    const card = el('div', 'flex items-center gap-2 bg-white rounded-2xl shadow-lg border-4 border-emerald-200 px-2 py-1 max-w-full');
    card.style.pointerEvents = 'auto';
    const replay = button('bg-emerald-100 text-2xl flex-none', 48);
    replay.style.width = '48px';
    replay.textContent = '🔈';
    replay.setAttribute('aria-label', '再聽一次 Replay');
    replay.addEventListener('click', () => { speak(S.say); });
    const text = el('div', 'text-center px-1 min-w-0');
    text.appendChild(el('div', 'text-xl md:text-3xl font-bold text-gray-800 leading-tight', zh));
    if (en) text.appendChild(el('div', 'text-xs md:text-lg text-gray-500 leading-tight', en));
    card.append(replay, text);
    S.prompt = card;
    col.insertBefore(card, col.firstChild);
    S.say = zh;
    return say ? speak(zh) : Promise.resolve();
  },
  hidePrompt() { drop('prompt'); },

  /** Answer buttons. Resolves with the tapped id; the buttons stay until clearChoices(). */
  choices(items, { columns } = {}) {
    const sig = JSON.stringify([columns || 0, items.map(c => [c.id, c.zh, c.en || '', c.icon || ''])]);
    return new Promise(resolve => {
      if (S.choices && S.ch && S.ch.sig === sig) { S.ch.resolve = resolve; return; } // same buttons: just listen again
      const n = items.length;
      const cols = columns || (n <= 3 ? n : n === 4 ? 2 : 3);
      const wrap = el('div', 'absolute inset-x-0 bottom-0 flex justify-center px-3 pb-3');
      wrap.style.pointerEvents = 'none';
      wrap.style.paddingBottom = 'max(0.75rem, env(safe-area-inset-bottom))';
      const grid = el('div', 'flex flex-wrap justify-center gap-3 w-full max-w-3xl overflow-y-auto');
      grid.style.maxHeight = '55%';
      grid.style.pointerEvents = 'none';
      const buttons = new Map();
      for (const c of items) {
        const b = button('bg-white border-4 border-emerald-300 flex items-center justify-center gap-2 px-2 py-1 text-gray-800', 64);
        b.style.width = `calc((100% - ${(cols - 1) * 12}px) / ${cols})`;
        if (c.icon) b.appendChild(el('span', 'text-3xl flex-none', c.icon));
        const t = el('span', 'flex flex-col items-center leading-tight min-w-0');
        t.appendChild(el('span', 'text-xl md:text-2xl', c.zh));
        if (c.en) t.appendChild(el('span', 'text-xs md:text-sm font-normal text-gray-500', c.en));
        b.appendChild(t);
        b.addEventListener('click', () => {
          const r = S.ch && S.ch.resolve;
          if (!r) return;
          S.ch.resolve = null;
          r(c.id);
        });
        buttons.set(c.id, b);
        grid.appendChild(b);
      }
      wrap.appendChild(grid);
      put('choices', wrap);
      S.ch = { sig, buttons, resolve };
    });
  },
  /** Flash a choice green (good) or red (not quite). */
  mark(id, good) {
    const b = S.ch && S.ch.buttons.get(id);
    if (!b) return;
    const reset = () => {
      b.classList.remove('bg-green-300', 'border-green-600', 'bg-red-300', 'border-red-600', 'animate-shake');
      b.classList.add('bg-white', 'border-emerald-300');
    };
    clearTimeout(b._flash); // re-marking restarts the flash instead of stacking classes
    reset();
    b.classList.remove('bg-white', 'border-emerald-300');
    b.classList.add(good ? 'bg-green-300' : 'bg-red-300', good ? 'border-green-600' : 'border-red-600');
    if (!good && !motion.less) b.classList.add('animate-shake');
    const gen = S.gen;
    b._flash = setTimeout(() => { if (gen === S.gen) reset(); }, 700);
  },
  clearChoices() { drop('choices'); S.ch = null; },

  /** results: array of 'good' | 'bad' | 'now' | null, one per item. */
  dots(results) {
    const col = topColumn();
    if (S.dots) S.dots.remove();
    const row = el('div', 'flex items-center gap-2 bg-white/80 rounded-full px-3 py-2');
    row.style.pointerEvents = 'none';
    for (const r of results) {
      const d = el('span', 'inline-block w-4 h-4 md:w-5 md:h-5 rounded-full border-2 border-gray-500');
      d.classList.add(r === 'good' ? 'bg-green-500' : r === 'bad' ? 'bg-red-500' : r === 'now' ? 'bg-yellow-300' : 'bg-gray-200');
      if (r === 'now') d.classList.add('ui-pulse');
      row.appendChild(d);
    }
    S.dots = row;
    col.appendChild(row);
  },

  toast(zh, en = '', ms = 1500) {
    // Sits over the prompt bar at the top so it never hides the shape the child is looking at.
    const wrap = el('div', 'absolute inset-x-0 flex justify-center px-4');
    wrap.style.top = '0.5rem';
    wrap.style.zIndex = '30';
    wrap.style.pointerEvents = 'none';
    const card = el('div', 'ui-pop bg-gray-900/85 text-white rounded-2xl px-5 py-3 text-center max-w-full');
    card.appendChild(el('div', 'text-2xl md:text-4xl font-bold', zh));
    if (en) card.appendChild(el('div', 'text-sm md:text-lg opacity-80', en));
    wrap.appendChild(card);
    put('toast', wrap);
    const gen = S.gen;
    setTimeout(() => { if (gen === S.gen && S.toast === wrap) drop('toast'); }, ms);
  },

  /** End-of-course panel. Resolves 'next' | 'map' | 'retry'. */
  endPanel({ title, stars = 0, newBest = false, partZh = '' }) {
    return new Promise(resolve => {
      const gen = S.gen;
      const panel = el('div', 'ui-pop bg-white rounded-3xl border-4 border-yellow-300 p-5 w-full max-w-sm text-center');
      panel.appendChild(el('div', 'text-3xl md:text-4xl font-bold text-gray-800 mb-3', title));
      const row = el('div', 'flex justify-center gap-2 mb-3');
      const starEls = [];
      for (let i = 0; i < 3; i++) {
        const s = el('span', 'text-5xl md:text-6xl inline-block', '⭐');
        s.style.opacity = '0';
        s.style.transform = 'scale(0.4)';
        s.style.transition = 'transform .3s cubic-bezier(.34,1.56,.64,1), opacity .2s';
        starEls.push(s); row.appendChild(s);
      }
      panel.appendChild(row);
      const extra = el('div', 'min-h-[3.5rem] mb-3');
      panel.appendChild(extra);
      const btns = el('div', 'flex flex-col gap-2');
      const mk = (parent, id, zh, en, cls) => {
        const b = button(cls + ' text-xl py-2 px-4', 56);
        b.appendChild(el('span', '', zh));
        b.appendChild(el('span', 'block text-xs font-normal opacity-80', en));
        b.addEventListener('click', () => { drop('modal'); resolve(id); });
        parent.appendChild(b);
      };
      mk(btns, 'next', '下一關', 'Next', 'bg-green-500 text-white border-4 border-green-600');
      const small = el('div', 'flex gap-2');
      mk(small, 'retry', '再玩', 'Retry', 'bg-yellow-300 text-yellow-900 border-4 border-yellow-500 flex-1');
      mk(small, 'map', '工場', 'Map', 'bg-sky-200 text-sky-900 border-4 border-sky-400 flex-1');
      btns.appendChild(small);
      panel.appendChild(btns);
      modal(panel);

      const step = 350; // later() halves delays under Less motion
      for (let i = 0; i < 3; i++) {
        if (i < stars) {
          later(step * (i + 1), gen, () => {
            starEls[i].style.opacity = '1'; starEls[i].style.transform = 'scale(1)';
            try { sfx.star(i); } catch (e) { /* ignore */ }
          });
        } else {
          starEls[i].style.opacity = '0.2'; starEls[i].style.transform = 'scale(1)'; starEls[i].style.filter = 'grayscale(1)';
        }
      }
      later(step * (stars + 1), gen, () => {
        if (newBest) extra.appendChild(el('div', 'ui-pop text-xl font-bold text-orange-500', '新紀錄 New best!'));
        if (partZh) extra.appendChild(el('div', 'ui-pop text-lg font-bold text-emerald-600', `新零件 New part: ${partZh}`));
      });
    });
  },

  /** Modal card: icon, big line, small line, buttons. Resolves the tapped button id. */
  card({ zh, en = '', icon = '', buttons = [] }) {
    return new Promise(resolve => {
      const panel = el('div', 'ui-pop bg-white rounded-3xl border-4 border-emerald-300 p-5 w-full max-w-sm text-center');
      if (icon) panel.appendChild(el('div', 'text-6xl mb-2', icon));
      panel.appendChild(el('div', 'text-2xl md:text-3xl font-bold text-gray-800', zh));
      if (en) panel.appendChild(el('div', 'text-sm md:text-lg text-gray-500 mt-1', en));
      const col = el('div', 'flex flex-col gap-2 mt-4');
      for (const b of buttons) {
        const btn = button('bg-emerald-500 text-white border-4 border-emerald-600 text-xl py-2 px-4', 56);
        btn.appendChild(el('span', '', b.zh));
        if (b.en) btn.appendChild(el('span', 'block text-xs font-normal opacity-80', b.en));
        btn.addEventListener('click', () => { drop('modal'); resolve(b.id); });
        col.appendChild(btn);
      }
      panel.appendChild(col);
      modal(panel);
    });
  },

  /** ⬅ button, top-left. back(null) removes it. */
  back(onBack) {
    drop('back');
    if (!onBack) return;
    const b = button('absolute left-2 top-2 bg-white/90 text-2xl border-2 border-gray-300', 48);
    b.style.width = '48px';
    b.textContent = '⬅';
    b.setAttribute('aria-label', '返回 Back');
    b.addEventListener('click', onBack);
    put('back', b);
  },

  /** Remove everything this overlay added (the corner buttons live outside #ui, so they stay). */
  clear() {
    S.gen++;
    for (const k of ['top', 'choices', 'toast', 'modal', 'back']) drop(k);
    S.prompt = null; S.dots = null; S.ch = null; S.say = '';
    if (S.root) S.root.replaceChildren();
    try { voice.stop(); } catch (e) { /* ignore */ }
  },
};
