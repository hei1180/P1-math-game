// Picnic Park sounds (tiny Web Audio synth) and Cantonese read-aloud (speechSynthesis, zh-HK when available).
// One 🔊 switch mutes both. Call audio.unlock() on the first user gesture.
import { speakable } from '../picnic-logic.js?v=202610100109';

const AC = window.AudioContext || window.webkitAudioContext;
let ctx = null;
const KEY = 'picnic.muted';
let muted = false;
try { muted = localStorage.getItem(KEY) === '1'; } catch (e) { /* private mode */ }

function tone({ type = 'sine', f0, f1 = f0, dur = 0.12, gain = 0.18, delay = 0 }) {
  if (muted || !ctx) return;
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
  g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(ctx.destination); o.start(t); o.stop(t + dur + 0.02);
}

let voice = null;
function pickVoice() {
  if (!('speechSynthesis' in window)) return;
  const vs = speechSynthesis.getVoices();
  voice = vs.find(v => /zh[-_]HK/i.test(v.lang)) || vs.find(v => /yue/i.test(v.lang)) || vs.find(v => /zh[-_]TW/i.test(v.lang)) || vs.find(v => /^zh/i.test(v.lang)) || null;
}
if ('speechSynthesis' in window) { pickVoice(); speechSynthesis.addEventListener?.('voiceschanged', pickVoice); }

export const audio = {
  unlock() { if (!ctx && AC) ctx = new AC(); if (ctx && ctx.state === 'suspended') ctx.resume(); },
  get muted() { return muted; },
  set muted(v) { muted = !!v; if (muted) this.hush(); try { localStorage.setItem(KEY, muted ? '1' : '0'); } catch (e) { /* ignore */ } },
  /** Read Chinese text aloud (emoji stripped, symbols spoken as words). */
  say(text) {
    if (muted || !('speechSynthesis' in window) || !text) return;
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(speakable(text));
      u.lang = voice ? voice.lang : 'zh-HK'; if (voice) u.voice = voice;
      u.rate = 0.9; u.pitch = 1.1;
      speechSynthesis.speak(u);
    } catch (e) { /* speech unavailable */ }
  },
  hush() { try { if ('speechSynthesis' in window) speechSynthesis.cancel(); } catch (e) { /* ignore */ } },
  tap() { tone({ type: 'triangle', f0: 700, f1: 900, dur: 0.06, gain: 0.12 }); },
  count(i = 0) { tone({ type: 'triangle', f0: 520 * Math.pow(1.06, i), dur: 0.1, gain: 0.16 }); },
  cross() { tone({ type: 'sawtooth', f0: 900, f1: 300, dur: 0.09, gain: 0.07 }); },
  right() { tone({ type: 'triangle', f0: 660, dur: 0.1 }); tone({ type: 'triangle', f0: 880, dur: 0.16, delay: 0.09 }); tone({ type: 'triangle', f0: 1320, dur: 0.2, gain: 0.1, delay: 0.18 }); },
  soft() { tone({ type: 'sine', f0: 330, f1: 220, dur: 0.2, gain: 0.16 }); },
  pop() { tone({ type: 'sine', f0: 500, f1: 1100, dur: 0.08, gain: 0.14 }); },
  star(i = 0) { tone({ type: 'triangle', f0: 523 * Math.pow(1.26, i), dur: 0.25, gain: 0.2 }); },
  fanfare() { [523, 659, 784, 1047].forEach((f, i) => tone({ type: 'triangle', f0: f, dur: 0.3, gain: 0.18, delay: i * 0.12 })); },
  bonus() { [784, 988, 1175, 1568].forEach((f, i) => tone({ type: 'sine', f0: f, dur: 0.12, gain: 0.12, delay: i * 0.06 })); },
};
