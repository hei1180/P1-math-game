// Tiny synth for Treasure Dungeon. Call sfx.unlock() on the first user gesture.
const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
let ctx = null;
const KEY = 'dungeon.muted';
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
  unlock() { if (!ctx && AC) ctx = new AC(); if (ctx && ctx.state !== 'running') ctx.resume().catch(() => {}); }, // also iOS 'interrupted'
  get muted() { return muted; },
  set muted(v) { muted = !!v; try { localStorage.setItem(KEY, muted ? '1' : '0'); } catch (e) { /* ignore */ } if (muted && sfx.onMute) sfx.onMute(); },
  onMute: null, // hook: voice.js stops speech here
  tick(i = 0) { tone({ type: 'triangle', f0: 600 + i * 45, dur: 0.05, gain: 0.12 }); },
  ding() { tone({ type: 'triangle', f0: 880, dur: 0.3, gain: 0.18 }); tone({ type: 'sine', f0: 1760, dur: 0.2, gain: 0.06 }); },
  bonk() { tone({ type: 'sine', f0: 220, f1: 140, dur: 0.18, gain: 0.2 }); },
  boop() { tone({ type: 'sine', f0: 520, f1: 380, dur: 0.1, gain: 0.15 }); },
  pop() { tone({ type: 'sine', f0: 400, f1: 900, dur: 0.07, gain: 0.18 }); },
  coin() { tone({ type: 'square', f0: 988, dur: 0.06, gain: 0.08 }); tone({ type: 'square', f0: 1319, dur: 0.18, gain: 0.08, delay: 0.06 }); },
  star(i = 0) { tone({ type: 'triangle', f0: 523 * Math.pow(1.26, i), dur: 0.25, gain: 0.2 }); },
  fanfare() { [523, 659, 784, 1047].forEach((f, i) => tone({ type: 'triangle', f0: f, dur: 0.3, gain: 0.18, delay: i * 0.12 })); },
  whoosh() { noise({ dur: 0.35, gain: 0.08, hp: 400 }); },
  door() { tone({ type: 'square', f0: 110, f1: 80, dur: 0.25, gain: 0.12 }); noise({ dur: 0.2, gain: 0.06, hp: 200, lp: 1200, delay: 0.05 }); },
  swing() { noise({ dur: 0.14, gain: 0.1, hp: 1500 }); tone({ type: 'sine', f0: 300, f1: 700, dur: 0.12, gain: 0.08 }); },
};
