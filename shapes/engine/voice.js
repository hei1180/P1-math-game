// zh-HK speech via speechSynthesis; silent when no voice or muted.
import { sfx } from '../sfx.js?v=0';

const synth = typeof window !== 'undefined' ? window.speechSynthesis : null;
let picked = null;

export const voice = {
  available: false,
  say(zh) {
    if (sfx.muted || !synth || !picked || !zh) return Promise.resolve();
    synth.cancel();
    return new Promise(resolve => {
      const u = new SpeechSynthesisUtterance(zh);
      u.voice = picked; u.lang = picked.lang; u.rate = 0.9;
      const timer = setTimeout(done, 4000);
      function done() { clearTimeout(timer); resolve(); }
      u.onend = done; u.onerror = done;
      synth.speak(u);
    });
  },
  stop() { if (synth) synth.cancel(); },
};

function pickVoice() {
  const low = v => (v.lang || '').toLowerCase().replace('_', '-');
  const vs = synth.getVoices();
  picked = vs.find(v => low(v) === 'zh-hk') || vs.find(v => low(v).includes('yue')) || vs.find(v => low(v).includes('zh-hk')) || null;
  voice.available = !!picked;
}

if (synth) {
  pickVoice();
  synth.addEventListener('voiceschanged', pickVoice);
}
