// Robot Workshop entry: DOM shell wiring, bridge to shared.js, three.js boot.
import { signIn, onUser, player, settings, session, enterTestMode, initAudio, engine, resetEngine, registerHit, endFever,
         startTimer, stopTimer, saveScore, renderLeaderboard, showRankPopup, mountTeacherModal, sharedSound, logAttempt, isTeacherEmail } from '../shared.js?v=202610051459';
import { recordResult, validateGalleryEntry, ZONES, lcg, SLOTS, BASIC_PART, markSeen } from '../shapes-logic.js?v=202610051459';
import { loadProgress, saveProgress, loadGallery, saveGalleryEntry, setGalleryHidden } from '../shapes-progress.js?v=202610051459';
import { sfx } from './sfx.js?v=202610051459';
import { voice } from './engine/voice.js?v=202610051459';
import { motion } from './engine/tween.js?v=202610051459';
import { Stage } from './engine/stage.js?v=202610051459';
import { Input } from './engine/input.js?v=202610051459';
import { SceneManager } from './engine/scenes.js?v=202610051459';
import { ui } from './ui/overlay.js?v=202610051459';
import { SCENES } from './scenes/index.js?v=202610051459';

const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
// Robot Workshop has its own sfx and obeys its own 🔇 button, so the shared engine's beeps stay off.
sharedSound.on = false;

// ---- dev mode: localhost / private LAN, only with ?dev ----
const host = location.hostname;
const isDevHost = ['localhost', '127.0.0.1'].includes(host) || /^192\.168\.\d+\.\d+$/.test(host) || /^10\.\d+\.\d+\.\d+$/.test(host)
  || /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/.test(host);
const DEV = isDevHost && params.has('dev');
if (DEV && params.has('nowebgl')) HTMLCanvasElement.prototype.getContext = () => null; // check the no-WebGL message

const TABS = [{ key: 'shapes3d', label: '立體 3-D' }, { key: 'shapes2d', label: '平面 2-D' }];
let stage = null, input = null, scenes = null;

// Less motion follows the teacher setting live, and the device's own reduced-motion preference.
const reduced = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
Object.defineProperty(motion, 'less', { get: () => !!settings.lessMotion || reduced.matches, set: v => { settings.lessMotion = !!v; }, configurable: true });

const goTo = (key, data) => scenes.go(key, data);
// every slot, face included (a robot saved before faces existed gets the basic face; Firestore refuses undefined values)
const robotForGallery = r => ({ name: r.name ?? null, ...Object.fromEntries(SLOTS.map(s => [s, r[s] ?? BASIC_PART[s]])) });

const bridge = {
  player, settings,
  previewLocks: false, // dev: set true to see real lock states while in test mode
  get testMode() { return session.testMode && !this.previewLocks; },
  progress: null,
  rng: Math.random,
  devStart: null, // dev only: { key, data } to open after Boot (?scene=)
  sitting: { courses: 0, wellDoneShown: false },
  get creations() { return this.progress.creations; },

  /** extra: { mistakes, durationSec, confusions } from the course, for the teacher's attempt log. */
  async complete(key, stars, extra = {}) {
    const mode = key === 'boss' ? 'shapesBoss' : 'shapes' + key;
    // Not awaited; logAttempt skips test mode itself and never throws.
    logAttempt({ game: 'shapes', mode, kind: 'level', stars, mistakes: extra.mistakes ?? null, durationSec: extra.durationSec ?? null, confusions: extra.confusions || [] });
    const r = recordResult(this.progress, key, stars);
    this.sitting.courses++;
    this.progress = r.progress;
    // Test mode keeps results in memory only (medals show while trying it out); leaving test mode reloads the page.
    if (session.testMode) return { newBest: r.newBest, part: r.part, looks: r.looks };
    await saveProgress(player.uid, r.progress);
    return { newBest: r.newBest, part: r.part, looks: r.looks };
  },

  /** The Garage showed these items: they stop being "new". bridge.progress changes at once (the Workshop badge reads it); saved in the background. */
  markSeen(ids) {
    const before = (this.progress.seen || []).length, next = markSeen(this.progress, ids || []);
    if (next.seen.length === before) return;
    this.progress = next;
    if (session.testMode || !player.uid) return;
    saveProgress(player.uid, this.progress).catch(e => console.warn('markSeen: progress not saved', e));
  },

  async saveRobot(robot) {
    this.progress = { ...this.progress, robot: { ...robot } };
    if (session.testMode) return;
    await saveProgress(player.uid, this.progress);
    await bridge.gallery.publish();
  },
  /** Keep at most 6 creations (the oldest goes first). */
  async saveCreation(c) {
    // An invalid creation would make every later gallery publish fail validation, so refuse it here.
    if (!validateGalleryEntry({ playerName: '', robot: robotForGallery(this.progress.robot), creations: [c], hidden: false })) {
      console.warn('creation invalid, not saved', c);
      return;
    }
    this.progress = { ...this.progress, creations: [...this.progress.creations, c].slice(-6) };
    if (session.testMode) return;
    await saveProgress(player.uid, this.progress);
    await bridge.gallery.publish();
  },

  rushStart(zone, onTimeUp) {
    initAudio();
    setHud(true);
    const secs = settings.shapesTimeLimit || 60;
    resetEngine(secs);
    startTimer(secs, onTimeUp);
  },
  rushHit(correct, base) { return registerHit(correct, base); },
  rushState() { return { score: engine.score, combo: engine.combo, isFever: engine.isFever, timeLeft: engine.timeLeft }; },
  rushEnd(zone) {
    stopTimer(); endFever();
    setHud(false);
    return saveScore(ZONES[zone].rush).then(() => new Promise(res => showRankPopup(engine.score, () => { bridge.showLeaderboard(zone); res(); })));
  },
  rushAbort() { stopTimer(); endFever(); setHud(false); },
  showLeaderboard(zone) {
    const key = ZONES[zone] ? ZONES[zone].rush : zone; // 'a' | 'b' | 'shapes3d' | 'shapes2d'
    $('leaderboardScreen').classList.remove('hidden');
    renderLeaderboard(TABS, key);
  },

  gallery: {
    isTeacher: false,
    get enabled() { return settings.shapesGallery !== false; },
    /** Visible entries (all entries for the teacher); [] when the gallery is off; null when the load failed (offline). */
    async load() { return bridge.gallery.enabled ? loadGallery({ teacher: bridge.gallery.isTeacher }) : []; },
    /** Write this player's robot and creations to the gallery (never in test mode or when signed out). */
    async publish() {
      if (!bridge.gallery.enabled || session.testMode || !player.uid) return;
      const p = bridge.progress;
      await saveGalleryEntry(player.uid, { playerName: player.name, robot: robotForGallery(p.robot), creations: p.creations });
    },
    /** Teacher only, and never in dev / test mode (nothing is written then). */
    async setHidden(uid, hidden) { return bridge.gallery.isTeacher && !session.testMode && !DEV ? setGalleryHidden(uid, hidden) : false; },
  },
};

/** Show/hide the Rush HUD, move the corner buttons out of its way and let the canvas follow its parent's new size. */
function setHud(on) {
  $('hud').classList.toggle('hidden', !on);
  $('cornerBtns').classList.toggle('top-14', on);
  $('cornerBtns').classList.toggle('top-2', !on);
  if (!stage) return;
  if (typeof stage.resize === 'function') stage.resize(); // the container's ResizeObserver also catches this
  stage.invalidate();
}

function showNoWebgl() {
  $('loginScreen').classList.add('hidden');
  $('gameScreen').classList.add('hidden');
  $('noWebgl').classList.remove('hidden');
}

function startGame() {
  if (stage) return;
  if (!Stage.supported()) { showNoWebgl(); return; }
  $('loginScreen').classList.add('hidden');
  $('gameScreen').classList.remove('hidden');
  try {
    stage = new Stage($('stage'));
    input = new Input(stage);
    ui.mount($('ui'));
    scenes = new SceneManager({ stage, input, ui, bridge, go: goTo });
    for (const [key, cls] of Object.entries(SCENES)) scenes.register(key, cls);
  } catch (e) {
    console.error('boot failed', e);
    stage = null; scenes = null;
    showNoWebgl();
    return;
  }
  window.__robot = { stage, scenes, bridge, go: goTo };
  scenes.go('Boot').catch(console.error);
}

// ---- DOM wiring ----
$('loginBtn').addEventListener('click', signIn);
const paintMute = () => {
  $('muteBtn').textContent = sfx.muted ? '🔇' : '🔊';
  $('muteBtn').setAttribute('aria-label', sfx.muted ? '開聲音 Sound on' : '關聲音 Sound off');
};
paintMute();
$('muteBtn').addEventListener('click', () => { sfx.muted = !sfx.muted; if (sfx.muted) voice.stop(); paintMute(); });
for (const ev of ['pointerdown', 'pointerup', 'click']) document.addEventListener(ev, () => sfx.unlock(), { passive: true }); // iOS only unlocks audio on up/click
document.querySelectorAll('[data-lb]').forEach(b => b.addEventListener('click', () => renderLeaderboard(TABS, b.dataset.lb)));
// Leaderboard is a pop-up over the (blurred) game. Opened from the Workshop, closing just reveals it again;
// opened after a Rush, closing goes back to the Workshop.
function closeLeaderboard() {
  if ($('leaderboardScreen').classList.contains('hidden')) return;
  $('leaderboardScreen').classList.add('hidden');
  if (scenes && scenes.key !== 'Workshop') goTo('Workshop');
}
$('lbBack').addEventListener('click', closeLeaderboard);
$('lbClose').addEventListener('click', closeLeaderboard);
$('leaderboardScreen').addEventListener('click', e => { if (e.target === e.currentTarget) closeLeaderboard(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeLeaderboard(); });
// After the teacher saves settings (unlocks, Less motion, gallery switch) refresh the Workshop.
mountTeacherModal(() => { if (scenes && scenes.key === 'Workshop') goTo('Workshop'); });

if (DEV) {
  player.name = 'Dev'; enterTestMode();
  bridge.gallery.isTeacher = true; // lets the gallery hide buttons be tried; the real check is the email hash below
  if (params.has('seed')) bridge.rng = lcg(parseInt(params.get('seed'), 10) || 0);
  const want = params.get('scene');
  if (want && SCENES[want]) bridge.devStart = { key: want, data: /^[AB]\d$/.test(want) ? { key: want } : want === 'Rush' ? { zone: params.get('zone') === 'b' ? 'b' : 'a' } : want === 'FreeBuild' ? { mode: 'peg' } : {} };
  loadProgress(null).then(p => { bridge.progress = p; startGame(); });
} else {
  onUser(async p => {
    bridge.progress = await loadProgress(p.uid);
    bridge.gallery.isTeacher = await isTeacherEmail(p.email);
    startGame();
  }, () => { $('loginSpinner').classList.add('hidden'); $('loginBtn').classList.remove('hidden'); });
}
