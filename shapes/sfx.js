// Tiny synth for Robot Workshop. Call sfx.unlock() on the first user gesture.
const AC = window.AudioContext || window.webkitAudioContext;
let ctx = null;
const KEY = 'robot.muted';
let muted = false;
try { muted = localStorage.getItem(KEY) === '1'; } catch (e) { /* private mode */ }

function tone({ type = 'sine', f0, f1 = f0, dur = 0.12, gain = 0.2, delay = 0 }) {
  if (muted || !ctx) return;
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
  g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(ctx.destination); o.start(t); o.stop(t + dur + 0.02);
}
// Noise burst, fading out; hp = high-pass, lp = optional low-pass (Hz).
function noise({ dur = 0.2, gain = 0.15, delay = 0, hp = 800, lp = 0 }) {
  if (muted || !ctx) return;
  const t = ctx.currentTime + delay;
  const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
  const d = buf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  f.type = 'highpass'; f.frequency.value = hp; g.gain.value = gain;
  src.buffer = buf; src.connect(f);
  if (lp) { const l = ctx.createBiquadFilter(); l.type = 'lowpass'; l.frequency.value = lp; f.connect(l); l.connect(g); } else f.connect(g);
  g.connect(ctx.destination); src.start(t);
}

export const sfx = {
  unlock() { if (!ctx && AC) ctx = new AC(); if (ctx && ctx.state === 'suspended') ctx.resume(); },
  get muted() { return muted; },
  set muted(v) { muted = !!v; try { localStorage.setItem(KEY, muted ? '1' : '0'); } catch (e) { /* ignore */ } },
  tick(i = 0) { tone({ type: 'triangle', f0: 600 + i * 45, dur: 0.05, gain: 0.12 }); },
  pop() { tone({ type: 'sine', f0: 400, f1: 900, dur: 0.07, gain: 0.18 }); },
  ding() { tone({ type: 'triangle', f0: 880, dur: 0.3, gain: 0.18 }); tone({ type: 'sine', f0: 1760, dur: 0.2, gain: 0.06 }); },
  bonk() { tone({ type: 'sine', f0: 220, f1: 140, dur: 0.18, gain: 0.2 }); },
  clunk() { tone({ type: 'square', f0: 140, f1: 50, dur: 0.16, gain: 0.2 }); noise({ dur: 0.06, gain: 0.08, hp: 200, lp: 900 }); },
  boing() { tone({ type: 'sine', f0: 200, f1: 700, dur: 0.22, gain: 0.2 }); },
  spring() { [0, 1, 2, 3].forEach(i => tone({ type: 'sine', f0: i % 2 ? 420 : 640, f1: i % 2 ? 640 : 420, dur: 0.07, gain: 0.15, delay: i * 0.07 })); },
  whoosh() { noise({ dur: 0.35, gain: 0.08, hp: 400 }); },
  roll(ms = 600) { noise({ dur: Math.max(0.1, ms / 1000), gain: 0.1, hp: 60, lp: 350 }); },
  star(i = 0) { tone({ type: 'triangle', f0: 523 * Math.pow(1.26, i), dur: 0.25, gain: 0.2 }); },
  fanfare() { [523, 659, 784, 1047].forEach((f, i) => tone({ type: 'triangle', f0: f, dur: 0.3, gain: 0.18, delay: i * 0.12 })); },
  zap() { tone({ type: 'square', f0: 1400, f1: 120, dur: 0.14, gain: 0.12 }); },
  crash() { noise({ dur: 0.5, gain: 0.2, hp: 300 }); tone({ type: 'sawtooth', f0: 400, f1: 60, dur: 0.45, gain: 0.12 }); },
  munch() { [0, 1, 2].forEach(i => noise({ dur: 0.07, gain: 0.14, hp: 500, lp: 3000, delay: i * 0.1 })); },
};
