// Rod Town entry: DOM shell wiring, bridge to shared.js, Phaser boot.
import { signIn, onUser, player, settings, session, enterTestMode, initAudio, engine, resetEngine, registerHit, endFever,
         startTimer, stopTimer, saveScore, renderLeaderboard, showRankPopup, mountTeacherModal, sharedSound } from '../shared.js?v=202609251311';
import { recordResult } from '../bonds-logic.js?v=202609251311';
import { loadProgress, saveProgress, today } from '../bonds-progress.js?v=202609251311';
import { sfx } from './sfx.js?v=202609251311';
import { fx } from './fx.js?v=202609251311';
import { scaleConfig, installHiDPI } from './hidpi.js?v=202609251311';
import { BootScene } from './scenes/BootScene.js?v=202609251311';
import { MapScene } from './scenes/MapScene.js?v=202609251311';
import { LevelScene } from './scenes/LevelScene.js?v=202609251311';
import { HouseScene } from './scenes/HouseScene.js?v=202609251311';
import { RushScene } from './scenes/RushScene.js?v=202609251311';
import { SandboxScene } from './scenes/SandboxScene.js?v=202609251311';

const $ = id => document.getElementById(id);
// Rush feedback comes from Rod Town's own synth (soft bonk, no buzzer) and obeys its 🔇 button,
// so the shared engine's success / error beeps stay off on this page.
sharedSound.on = false;
const TABS = [1, 2, 3, 4].map(w => ({ key: 'bonds' + w, label: 'W' + w }));
let game = null;

const bridge = {
  player, settings,
  previewLocks: false, // dev: set true to see real lock/fog/sticker states while in test mode
  get testMode() { return session.testMode && !this.previewLocks; },
  progress: null,
  today,
  async complete(key, stars) {
    const r = recordResult(this.progress, key, stars, today());
    if (session.testMode) {
      if (this.previewLocks) this.progress = r.progress; // dev preview: keep in memory only, never saved
      return { newBest: r.newBest, sticker: this.previewLocks ? r.sticker : null };
    }
    this.progress = r.progress; await saveProgress(player.uid, r.progress);
    return { newBest: r.newBest, sticker: r.sticker };
  },
  rushStart(w, onTimeUp) {
    initAudio();
    setHud(true);
    resetEngine(settings.bondsTimeLimit);
    startTimer(settings.bondsTimeLimit, onTimeUp);
  },
  rushHit(correct, base) { return registerHit(correct, base); },
  rushState() { return { score: engine.score, combo: engine.combo, isFever: engine.isFever, timeLeft: engine.timeLeft }; },
  rushEnd(w) {
    stopTimer(); endFever();
    setHud(false);
    return saveScore('bonds' + w).then(() => new Promise(res => showRankPopup(engine.score, () => { bridge.showLeaderboard(w); res(); })));
  },
  rushAbort() { stopTimer(); endFever(); setHud(false); },
  showLeaderboard(w) { $('leaderboardScreen').classList.remove('hidden'); renderLeaderboard(TABS, 'bonds' + w); },
};

/** Show/hide the Rush HUD; resize the canvas from the parent's new size and move the corner buttons out of the HUD's way. */
function setHud(on) {
  $('hud').classList.toggle('hidden', !on);
  $('cornerBtns').classList.toggle('top-14', on);
  $('cornerBtns').classList.toggle('top-2', !on);
  game.scale.getParentBounds();
  game.scale.refresh();
}

// Less motion follows the teacher setting live (also when settings change after the game started).
Object.defineProperty(fx, 'lessMotion', { get: () => !!settings.lessMotion, set: v => { settings.lessMotion = !!v; }, configurable: true });

function startGame() {
  $('loginScreen').classList.add('hidden');
  $('gameScreen').classList.remove('hidden');
  if (game) return;
  game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'phaser',
    backgroundColor: '#e0f2fe',
    scale: scaleConfig('phaser'), // device-pixel canvas for retina screens (bonds/hidpi.js)
    input: { activePointers: 2 },
    render: { antialias: true, roundPixels: false },
    scene: [BootScene, MapScene, LevelScene, HouseScene, RushScene, SandboxScene],
  });
  installHiDPI(game, 'phaser');
  game.registry.set('bridge', bridge);
  window.__rodTown = { game, bridge, go: (key, data) => { game.scene.getScenes(true).forEach(s => { if (s.scene.key !== key) s.scene.stop(); }); game.scene.start(key, data); } };
}

// ---- DOM wiring ----
$('loginBtn').addEventListener('click', signIn);
$('muteBtn').textContent = sfx.muted ? '🔇' : '🔊';
$('muteBtn').addEventListener('click', () => { sfx.muted = !sfx.muted; $('muteBtn').textContent = sfx.muted ? '🔇' : '🔊'; });
document.addEventListener('pointerdown', () => sfx.unlock(), { once: false, passive: true });
document.querySelectorAll('[data-lb]').forEach(b => b.addEventListener('click', () => renderLeaderboard(TABS, 'bonds' + b.dataset.lb)));
$('lbBack').addEventListener('click', () => { $('leaderboardScreen').classList.add('hidden'); if (game) window.__rodTown.go('Map'); });
mountTeacherModal(() => { if (game && game.scene.isActive('Map')) window.__rodTown.go('Map'); });

const isLocal = ['localhost', '127.0.0.1'].includes(location.hostname);
if (isLocal && new URLSearchParams(location.search).has('dev')) {
  player.name = 'Dev'; enterTestMode();
  loadProgress(null).then(p => { bridge.progress = p; startGame(); });
} else {
  onUser(async p => { bridge.progress = await loadProgress(p.uid); startGame(); },
         () => { $('loginSpinner').classList.add('hidden'); $('loginBtn').classList.remove('hidden'); });
}
