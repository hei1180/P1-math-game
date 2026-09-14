// Pure DOM animation helpers. No Firebase, no game state.

function re(el, cls) { if (!el) return; el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); }

export function squish(el) { re(el, 'squish'); }
export function bounce(el) { re(el, 'bounce'); }
export function popScore(el) { re(el, 'pop-score'); }
export function flashRed(el) { re(el, 'flash-red'); }

/** Radial emoji burst at viewport point (x, y). */
export function burst(x, y, emojis = ['⭐', '✨', '🌟'], n = 8) {
  for (let i = 0; i < n; i++) {
    const el = document.createElement('span');
    el.className = 'burst-piece';
    el.textContent = emojis[i % emojis.length];
    const ang = (i / n) * Math.PI * 2 + Math.random() * 0.5;
    const dist = 50 + Math.random() * 50;
    el.style.left = `${x}px`; el.style.top = `${y}px`;
    el.style.setProperty('--dx', `${Math.cos(ang) * dist}px`);
    el.style.setProperty('--dy', `${Math.sin(ang) * dist - 30}px`);
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 650);
  }
}

/**
 * Fly `html` from the centre of `from` (element or DOMRect) to the centre of `toEl`, then call onArrive.
 * Duration 350 ms. The clone is removed afterwards.
 */
export function flyTo(from, toEl, html, onArrive) {
  const a = from.getBoundingClientRect ? from.getBoundingClientRect() : from;
  const b = toEl.getBoundingClientRect();
  const el = document.createElement('div');
  el.className = 'fly'; el.innerHTML = html;
  el.style.transform = `translate(${a.left + a.width / 2}px, ${a.top + a.height / 2}px) translate(-50%, -50%)`;
  document.body.appendChild(el);
  requestAnimationFrame(() => requestAnimationFrame(() => {
    el.style.transform = `translate(${b.left + b.width / 2}px, ${b.top + b.height / 2}px) translate(-50%, -50%) scale(0.9)`;
  }));
  setTimeout(() => { el.remove(); if (onArrive) onArrive(); }, 360);
}

/** Temporarily replace an element's text (a face emoji); restores after ms. */
export function react(el, emoji, ms = 600) {
  if (!el) return;
  if (el._face === undefined) el._face = el.textContent;
  el.textContent = emoji;
  clearTimeout(el._faceTimer);
  el._faceTimer = setTimeout(() => { el.textContent = el._face; }, ms);
}
