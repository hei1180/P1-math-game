// zh-HK speech via speechSynthesis; silent when no voice or muted.
import { sfx } from '../sfx.js?v=202610081258';

const synth = typeof window !== 'undefined' ? window.speechSynthesis : null;
let picked = null, current = null; // current: keep a reference so the utterance is not garbage-collected mid-speech

function pickVoice() {
  if (!synth) return;
  const low = v => (v.lang || '').toLowerCase().replace('_', '-');
  const vs = synth.getVoices();
  picked = vs.find(v => low(v) === 'zh-hk') || vs.find(v => low(v).includes('yue')) || vs.find(v => low(v).includes('zh-hk')) || null;
  voice.available = !!picked;
}

export const voice = {
  available: false,
  say(zh) {
    if (sfx.muted || !synth || !zh) return Promise.resolve();
    if (!picked) pickVoice(); // voices may load late
    if (!picked) return Promise.resolve();
    synth.cancel();
    return new Promise(resolve => {
      const u = current = new SpeechSynthesisUtterance(zh);
      u.voice = picked; u.lang = picked.lang; u.rate = 0.9;
      const timer = setTimeout(done, 4000);
      function done() { clearTimeout(timer); if (current === u) current = null; resolve(); }
      u.onend = done; u.onerror = done;
      synth.speak(u);
    });
  },
  stop() { if (synth) synth.cancel(); },
};

if (synth) {
  pickVoice();
  synth.addEventListener('voiceschanged', pickVoice);
  sfx.onMute = () => voice.stop();
}
