// Tiny tween engine. Stage calls tickTweens() each frame.
export const motion = { less: false };

export const ease = {
  linear: t => t,
  outCubic: t => 1 - Math.pow(1 - t, 3),
  inOutCubic: t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  outBack: t => { const c = 1.70158; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); },
  outBounce: t => {
    const n = 7.5625, d = 2.75;
    if (t < 1 / d) return n * t * t;
    if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75;
    if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375;
    return n * (t -= 2.625 / d) * t + 0.984375;
  },
};

let active = [];

// Tween numeric props of target to `to`; start values are read on the first tick.
export function tween(target, to, { ms = 300, ease: e = 'outCubic', delay = 0 } = {}) {
  if (motion.less) { ms *= 0.5; delay *= 0.5; if (e === 'outBack' || e === 'outBounce') e = 'outCubic'; }
  return new Promise(resolve => {
    active.push({ target, to, ms: Math.max(1, ms), fn: ease[e] || ease.outCubic, wait: delay / 1000, t: 0, from: null, resolve });
  });
}

export function wait(ms) { return tween({}, {}, { ms, ease: 'linear' }); }

export function tickTweens(dt) {
  if (!active.length) return false;
  const list = active; active = [];
  const keep = [];
  for (const a of list) {
    if (a.wait > 0) { a.wait -= dt; if (a.wait > 0) { keep.push(a); continue; } }
    if (!a.from) { a.from = {}; for (const k in a.to) a.from[k] = a.target[k]; }
    a.t += dt * 1000;
    const p = Math.min(1, a.t / a.ms), k = a.fn(p);
    for (const key in a.to) a.target[key] = a.from[key] + (a.to[key] - a.from[key]) * k;
    if (p >= 1) a.resolve(); else keep.push(a);
  }
  active = keep.concat(active); // tweens started inside resolve callbacks run next tick
  return true;
}

export function cancelTweens(target) {
  const gone = target ? active.filter(a => a.target === target) : active;
  active = target ? active.filter(a => a.target !== target) : [];
  gone.forEach(a => a.resolve());
}
