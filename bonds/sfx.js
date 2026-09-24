// Tiny synth for Rod Town. Call sfx.unlock() on the first user gesture.
const AC = window.AudioContext || window.webkitAudioContext;
let ctx = null;
const KEY = 'rodtown.muted';
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
function noise({ dur = 0.2, gain = 0.15, delay = 0, hp = 800 }) {
  if (muted || !ctx) return;
  const t = ctx.currentTime + delay;
  const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
  const d = buf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  f.type = 'highpass'; f.frequency.value = hp; g.gain.value = gain;
  src.buffer = buf; src.connect(f); f.connect(g); g.connect(ctx.destination); src.start(t);
}

export const sfx = {
  unlock() { if (!ctx && AC) ctx = new AC(); if (ctx && ctx.state === 'suspended') ctx.resume(); },
  get muted() { return muted; },
  set muted(v) { muted = !!v; try { localStorage.setItem(KEY, muted ? '1' : '0'); } catch (e) { /* ignore */ } },
  boing(len) { const f = 880 - (len - 1) * 60; tone({ type: 'sine', f0: f, f1: f * 1.6, dur: 0.14 }); },
  snap() { tone({ type: 'square', f0: 1200, f1: 600, dur: 0.05, gain: 0.12 }); },
  tick(i = 0) { tone({ type: 'triangle', f0: 600 + i * 45, dur: 0.05, gain: 0.12 }); },
  bonk() { tone({ type: 'sine', f0: 220, f1: 140, dur: 0.18, gain: 0.2 }); },
  toot() { tone({ type: 'square', f0: 392, dur: 0.18, gain: 0.12 }); tone({ type: 'square', f0: 523, dur: 0.28, gain: 0.12, delay: 0.2 }); },
  saw() { noise({ dur: 0.25, gain: 0.12, hp: 2000 }); },
  star(i = 0) { tone({ type: 'triangle', f0: 523 * Math.pow(1.26, i), dur: 0.25, gain: 0.2 }); },
  fanfare() { [523, 659, 784, 1047].forEach((f, i) => tone({ type: 'triangle', f0: f, dur: 0.3, gain: 0.18, delay: i * 0.12 })); },
  whoosh() { noise({ dur: 0.35, gain: 0.08, hp: 400 }); },
  page() { noise({ dur: 0.12, gain: 0.08, hp: 3000 }); },
  clock() { tone({ type: 'square', f0: 1500, dur: 0.03, gain: 0.08 }); },
};
