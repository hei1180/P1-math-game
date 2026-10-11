// Treasure Dungeon entry: DOM shell wiring, the bridge to shared.js / Firestore, Phaser boot.
// The bridge is the only link between scenes and shared.js; scenes read it with this.registry.get('bridge').
import { signIn, onUser, player, settings, session, enterTestMode, initAudio, engine, resetEngine, registerHit, endFever,
         startTimer, stopTimer, saveScore, renderLeaderboard, showRankPopup, mountTeacherModal, sharedSound, logAttempt } from '../shared.js?v=202610112341';
import { lcg, recordResult, levelFor, roomByKey, roomsOf } from '../dungeon-logic.js?v=202610112341';
import { loadProgress, saveProgress } from '../dungeon-progress.js?v=202610112341';
import { sfx } from './sfx.js?v=202610112341';
import { voice } from './voice.js?v=202610112341';
import { fx } from './fx.js?v=202610112341';
import { scaleConfig, installHiDPI } from '../bonds/hidpi.js?v=202610112341';
import { BootScene } from './scenes/BootScene.js?v=202610112341';
import { MapScene } from './scenes/MapScene.js?v=202610112341';
import { MakeHeroScene } from './scenes/MakeHeroScene.js?v=202610112341';
import { ShopScene } from './scenes/ShopScene.js?v=202610112341';
import { RoomScene } from './RoomScene.js?v=202610112341';
import { WavesScene } from './scenes/WavesScene.js?v=202610112341';
import { RushScene } from './scenes/RushScene.js?v=202610112341';
import * as SandboxMod from './scenes/SandboxScene.js?v=202610112341';

const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
// Treasure Dungeon has its own synth and obeys its own 🔇 button, so the shared engine's beeps stay off.
sharedSound.on = false;

// ---- dev mode: localhost / private LAN, only with ?dev ----
const host = location.hostname;
const isDevHost = ['localhost', '127.0.0.1'].includes(host) || /^192\.168\.\d+\.\d+$/.test(host) || /^10\.\d+\.\d+\.\d+$/.test(host)
  || /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/.test(host);
const DEV = isDevHost && params.has('dev');

const SCORE_KEY = 'dungeon';
const TABS = [{ key: SCORE_KEY, label: '寶藏快手 Rush' }];
const timeLimit = () => settings.dungeonTimeLimit || 60;
let game = null;
let pendingCoins = 0;
const forcedLevel = DEV && /^[123]$/.test(params.get('level') || '') ? parseInt(params.get('level'), 10) : null;
// last result per room in this sitting, for the adaptive support rule
const lastMistakes = {}, lastLevel = {};

const bridge = {
  player, settings,
  get unlock() { return settings.dungeonUnlock || {}; },
  previewLocks: false, // dev: set true to see real lock states while in test mode
  get testMode() { return session.testMode && !this.previewLocks; },
  progress: null,
  rng: Math.random,
  devStart: null, // dev only: { key, data } that Boot opens instead of the map (?scene=)
  sitting: { rooms: 0, wellDoneShown: false },

  /** Coins to show on the counter: saved coins + coins earned in the room being played. */
  get coins() { return ((this.progress && this.progress.coins) || 0) + pendingCoins; },
  /** Live counter only; the room's coins are saved with complete(). */
  addCoins(n) { pendingCoins += n; return this.coins; },

  /** Support level for a room: adaptive rule from the room before (same floor) in this sitting; ?level= overrides in dev. */
  levelFor(key) {
    if (forcedLevel) return forcedLevel;
    const r = roomByKey(key);
    const keys = r ? roomsOf(r.floor) : [], i = keys.indexOf(key), prev = i > 0 ? keys[i - 1] : null;
    return levelFor(key, prev ? lastMistakes[prev] || 0 : 0, prev ? lastLevel[prev] : undefined);
  },

  /**
   * A room is finished. extra: { mistakes, hints, durationSec, confusions: [{want, picked}], coins, level }.
   * Logs the attempt, records the result (memory only in test mode) and saves.
   * @returns {Promise<{newBest, floorCleared, bonus, chestLook}>}
   */
  async complete(key, stars, extra = {}) {
    const confusions = (extra.confusions || []).slice(0, 5).map(c => ({ item: c.item ?? c.want, picked: c.picked }));
    // Not awaited; logAttempt skips test mode itself and never throws.
    logAttempt({ game: 'dungeon', mode: 'dungeon' + key, kind: 'level', stars, mistakes: extra.mistakes ?? null, durationSec: extra.durationSec ?? null, confusions });
    lastMistakes[key] = extra.mistakes || 0;
    if (extra.level) lastLevel[key] = extra.level;
    this.sitting.rooms++;
    const r = recordResult(this.progress, key, stars, extra.coins ?? pendingCoins);
    pendingCoins = 0;
    this.progress = r.progress; // test mode keeps results in memory only (leaving test mode reloads the page)
    if (!session.testMode) await saveProgress(player.uid, r.progress);
    return { newBest: r.newBest, floorCleared: r.floorCleared, bonus: r.bonus, chestLook: r.chestLook || null };
  },

  /** Hero / buy / equip changes: fn(progress) -> new progress, then save (not in test mode). */
  async saveLook(fn) {
    this.progress = fn(this.progress);
    if (session.testMode) return;
    await saveProgress(player.uid, this.progress);
  },

  rushStart(onTimeUp) {
    initAudio();
    setHud(true);
    resetEngine(timeLimit());
    startTimer(timeLimit(), onTimeUp);
  },
  rushHit(correct, base) { return registerHit(correct, base); },
  rushState() { return { score: engine.score, combo: engine.combo, isFever: engine.isFever, timeLeft: engine.timeLeft }; },
  rushEnd() {
    stopTimer(); endFever();
    setHud(false);
    return saveScore(SCORE_KEY).then(() => new Promise(res => showRankPopup(engine.score, () => { bridge.showLeaderboard(); res(); })));
  },
  rushAbort() { stopTimer(); endFever(); setHud(false); },
  showLeaderboard() { $('leaderboardScreen').classList.remove('hidden'); renderLeaderboard(TABS, SCORE_KEY); },
};

/** Show/hide the Rush HUD; resize the canvas from the parent's new size and move the corner buttons out of the HUD's way. */
function setHud(on) {
  $('hud').classList.toggle('hidden', !on);
  $('cornerBtns').classList.toggle('top-14', on);
  $('cornerBtns').classList.toggle('top-2', !on);
  if (!game) return;
  game.scale.getParentBounds();
  game.scale.refresh();
}

// Less motion follows the teacher setting live (also when settings change after the game started).
Object.defineProperty(fx, 'lessMotion', { get: () => !!settings.lessMotion, set: v => { settings.lessMotion = !!v; }, configurable: true });
// art.js (hop, idle motion) reads this global so it needs no import of fx / settings.
Object.defineProperty(window, '__dungeonLessMotion', { get: () => !!settings.lessMotion, configurable: true });

/** Stop every running scene except `key`, then start `key`. */
function go(key, data) {
  game.scene.getScenes(true).forEach(s => { if (s.scene.key !== key) s.scene.stop(); });
  game.scene.start(key, data);
}

function startGame() {
  $('loginScreen').classList.add('hidden');
  $('gameScreen').classList.remove('hidden');
  if (game) return;
  const Sandbox = SandboxMod.SandboxScene || SandboxMod.default;
  game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'phaser',
    backgroundColor: '#2a1f33',
    scale: scaleConfig('phaser'), // device-pixel canvas for retina screens (bonds/hidpi.js)
    input: { activePointers: 2 },
    render: { antialias: true, roundPixels: true }, // no global pixelArt: text stays smooth; art textures are NEAREST (art.js)
    scene: [BootScene, MapScene, MakeHeroScene, ShopScene, RoomScene, WavesScene, RushScene, ...(Sandbox ? [Sandbox] : [])],
  });
  installHiDPI(game, 'phaser');
  game.registry.set('bridge', bridge);
  window.__dungeon = { game, bridge, go };
}

// ---- DOM wiring ----
$('loginBtn').addEventListener('click', signIn);
const paintMute = () => {
  $('muteBtn').textContent = sfx.muted ? '🔇' : '🔊';
  $('muteBtn').setAttribute('aria-label', sfx.muted ? '開聲音 Sound on' : '關聲音 Sound off');
};
paintMute();
$('muteBtn').addEventListener('click', () => { sfx.muted = !sfx.muted; if (sfx.muted) voice.stop(); paintMute(); });
for (const ev of ['pointerdown', 'pointerup', 'click']) document.addEventListener(ev, () => sfx.unlock(), { passive: true }); // iOS unlocks audio on up/click
document.querySelectorAll('[data-lb]').forEach(b => b.addEventListener('click', () => renderLeaderboard(TABS, b.dataset.lb)));
// Leaderboard is a pop-up over the (blurred) game. Opened from the map, closing just reveals the map again;
// opened after a Rush, closing goes back to the map.
function closeLeaderboard() {
  if ($('leaderboardScreen').classList.contains('hidden')) return;
  $('leaderboardScreen').classList.add('hidden');
  if (game && !game.scene.isActive('Map')) go('Map');
}
$('lbBack').addEventListener('click', closeLeaderboard);
$('lbClose').addEventListener('click', closeLeaderboard);
$('leaderboardScreen').addEventListener('click', e => { if (e.target === e.currentTarget) closeLeaderboard(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeLeaderboard(); });
// After the teacher saves settings (unlocks, Less motion, time) refresh the map.
mountTeacherModal(() => { if (game && game.scene.isActive('Map')) go('Map'); });

if (DEV) {
  player.name = 'Dev'; enterTestMode();
  if (params.has('seed')) bridge.rng = lcg(parseInt(params.get('seed'), 10) || 0);
  const want = params.get('scene');
  if (want) {
    const room = roomByKey(want);
    if (room) bridge.devStart = { key: room.wave ? 'Waves' : 'Room', data: { key: want } };
    else if (want === 'Waves') bridge.devStart = { key: 'Waves', data: { key: 'F1R6' } };
    else if (['Map', 'Shop', 'MakeHero', 'Rush', 'Sandbox'].includes(want)) bridge.devStart = { key: want, data: {} };
  }
  loadProgress(null).then(p => { bridge.progress = p; startGame(); });
} else {
  onUser(async p => { bridge.progress = await loadProgress(p.uid); startGame(); },
         () => { $('loginSpinner').classList.add('hidden'); $('loginBtn').classList.remove('hidden'); });
}
