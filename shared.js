// Shared runtime for both games. Loaded as <script type="module"> import.
// DOM contract: see docs/superpowers/plans/2026-09-14-number-shop.md ("DOM contract").
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js";
import { getFirestore, collection, doc, getDoc, setDoc, getDocs, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";
import { DEFAULT_TROPHY, TROPHY_ICON, TROPHY_LABEL, trophyFor, validateCutoffs } from './trophy.js?v=202609251810';
import { gameOf, modeLabel } from './labels.js?v=202609251810';

export { TROPHY_ICON, TROPHY_LABEL };

// ---------- Firebase ----------
const firebaseConfig = {
  apiKey: "AIzaSyAdCj3BAfeU737QdpBQMPkfp1wWrNcBWc0",
  authDomain: "p1-maths.firebaseapp.com",
  projectId: "p1-maths",
  storageBucket: "p1-maths.firebasestorage.app",
  messagingSenderId: "593709237589",
  appId: "1:593709237589:web:d71dd6020234b554865bdc",
  measurementId: "G-ZWXELF5EK5"
};
export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
const provider = new GoogleAuthProvider();

export const TEACHER_PIN = '1128';
export const TEACHER_EMAILS = ['cyh@clam.edu.hk'];
export const NUM_KEYS = ['num1', 'num2', 'num3', 'num4'];
const defaultNumUnlock = () => Object.fromEntries(NUM_KEYS.map(k => [k, false]));
export const BONDS_KEYS = ['w1', 'w2', 'w3', 'w4'];
const defaultBondsUnlock = () => Object.fromEntries(BONDS_KEYS.map(k => [k, false]));
export const DEFAULT_SETTINGS = { timeLimit: 30, unlockMedium: false, unlockHard: false, numTimeLimit: 30, numUnlock: defaultNumUnlock(), bondsUnlock: defaultBondsUnlock(), bondsTimeLimit: 60, lessMotion: false, trophy: { ...DEFAULT_TROPHY }, sheetUrl: '' };

export const player = { name: 'Guest', uid: null, email: '', highScores: {} };
export const settings = { ...DEFAULT_SETTINGS, numUnlock: defaultNumUnlock(), bondsUnlock: defaultBondsUnlock(), trophy: { ...DEFAULT_TROPHY } };

/** Teacher test mode: this browser tab only, all levels open, nothing saved. Cleared when the tab closes. */
const TEST_KEY = 'p1maths.testMode';
const readTestMode = () => { try { return sessionStorage.getItem(TEST_KEY) === '1'; } catch (e) { return false; } };
export const session = { testMode: readTestMode() };
export function enterTestMode() {
  session.testMode = true;
  try { sessionStorage.setItem(TEST_KEY, '1'); } catch (e) { /* private mode: in-memory only */ }
  showTestBadge();
}
function showTestBadge() { document.querySelectorAll('.test-badge').forEach(b => b.classList.remove('hidden')); }

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------- Auth ----------
export function signIn() {
  initAudio();
  return signInWithPopup(auth, provider).catch(err => { console.error(err); alert('Login failed. Check console.'); });
}

/**
 * cb(player) fires after settings + high scores are loaded.
 * onSignedOut() fires when Firebase reports no session (show the login button then, not before).
 */
export function onUser(cb, onSignedOut = () => {}) {
  onAuthStateChanged(auth, async (user) => {
    if (!user) { onSignedOut(); return; }
    player.name = user.displayName || user.email.split('@')[0];
    player.uid = user.uid;
    player.email = user.email || '';
    await Promise.all([loadSettings(), loadMyHighScores()]);
    cb(player);
  });
}

// ---------- Audio + particles ----------
const AC = window.AudioContext || window.webkitAudioContext;
let audioCtx;
export function initAudio() { if (!audioCtx) audioCtx = new AC(); if (audioCtx.state === 'suspended') audioCtx.resume(); }

/** A page with its own sound engine (Rod Town: soft synth + its own mute) can silence these shared beeps. */
export const sharedSound = { on: true };

export function playSound(type) {
  if (!audioCtx || !sharedSound.on) return;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.connect(gain); gain.connect(audioCtx.destination);
  const now = audioCtx.currentTime;
  if (type === 'click') {
    const base = 400 + engine.combo * 40;
    osc.type = 'sine'; osc.frequency.setValueAtTime(base, now); osc.frequency.exponentialRampToValueAtTime(base + 200, now + 0.1);
    gain.gain.setValueAtTime(0.3, now); gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
    osc.start(now); osc.stop(now + 0.1);
  } else if (type === 'success') {
    osc.type = 'triangle'; osc.frequency.setValueAtTime(440, now); osc.frequency.setValueAtTime(554, now + 0.1); osc.frequency.setValueAtTime(659, now + 0.2);
    gain.gain.setValueAtTime(0.3, now); gain.gain.linearRampToValueAtTime(0, now + 0.4);
    osc.start(now); osc.stop(now + 0.4);
  } else if (type === 'error') {
    osc.type = 'sawtooth'; osc.frequency.setValueAtTime(150, now); osc.frequency.linearRampToValueAtTime(100, now + 0.3);
    gain.gain.setValueAtTime(0.3, now); gain.gain.linearRampToValueAtTime(0, now + 0.3);
    osc.start(now); osc.stop(now + 0.3);
  }
}

export function spawnParticle(x, y, text) {
  const el = document.createElement('div');
  el.className = 'particle'; el.innerText = text;
  el.style.left = `${x - 20}px`; el.style.top = `${y - 20}px`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 600);
}

/** Re-trigger a CSS animation class on an element. */
export function replay(el, cls) { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); }

// ---------- Combo / fever engine ----------
export const engine = { score: 0, combo: 0, maxCombo: 0, totalAttempts: 0, correctAttempts: 0, isFever: false, feverTimeout: null, timeLeft: 0, timerId: null };

export function resetEngine(timeLimit) {
  stopTimer(); endFever();
  Object.assign(engine, { score: 0, combo: 0, maxCombo: 0, totalAttempts: 0, correctAttempts: 0, timeLeft: timeLimit });
  updateHud();
}

export function updateHud() {
  $('scoreDisplay').innerText = engine.score;
  $('comboDisplay').innerText = engine.combo;
  $('timerDisplay').innerText = engine.timeLeft;
}

export function triggerWiggle() { if (engine.isFever) replay($('gameScreen'), 'fever-wiggle'); }

export function endFever() {
  clearTimeout(engine.feverTimeout);
  engine.isFever = false;
  $('gameScreen').classList.remove('fever-mode', 'fever-wiggle');
  $('feverOverlayText').style.display = 'none';
}

/**
 * Record one answer. Returns points awarded (0 when wrong).
 * Correct: combo++, fever at 5 (x2, 10 s refresh), success sound.
 * Wrong: combo reset, fever ends, error sound.
 */
export function registerHit(correct, basePoints) {
  engine.totalAttempts++;
  if (!correct) {
    playSound('error'); endFever(); engine.combo = 0; updateHud();
    return 0;
  }
  engine.correctAttempts++;
  playSound('success');
  engine.combo++;
  if (engine.combo > engine.maxCombo) engine.maxCombo = engine.combo;
  let points = basePoints;
  if (engine.combo >= 5) {
    if (!engine.isFever) { engine.isFever = true; $('gameScreen').classList.add('fever-mode'); $('feverOverlayText').style.display = 'block'; }
    points *= 2;
    clearTimeout(engine.feverTimeout);
    engine.feverTimeout = setTimeout(() => { endFever(); engine.combo = 0; updateHud(); }, 10000);
  }
  engine.score += points;
  updateHud();
  return points;
}

// ---------- Timer ----------
export function startTimer(seconds, onEnd) {
  stopTimer();
  engine.timeLeft = seconds; updateHud();
  engine.timerId = setInterval(() => {
    engine.timeLeft--; updateHud();
    if (engine.timeLeft <= 0) { stopTimer(); onEnd(); }
  }, 1000);
}
export function stopTimer() { clearInterval(engine.timerId); engine.timerId = null; }
// ---------- Data ----------
export async function loadSettings() {
  try {
    const snap = await getDoc(doc(db, 'settings', 'global'));
    if (snap.exists()) {
      const d = snap.data();
      Object.assign(settings, DEFAULT_SETTINGS, d);
      settings.trophy = validateCutoffs(d.trophy) ? { ...d.trophy } : { ...DEFAULT_TROPHY };
      settings.numUnlock = { ...defaultNumUnlock(), ...(d.numUnlock || {}) };
      settings.bondsUnlock = { ...defaultBondsUnlock(), ...(d.bondsUnlock || {}) };
      settings.sheetUrl = typeof d.sheetUrl === 'string' ? d.sheetUrl.trim() : '';
    }
  } catch (e) { console.warn('settings offline', e); }
}

export async function saveSettings(patch) {
  Object.assign(settings, patch);
  try { await setDoc(doc(db, 'settings', 'global'), settings); return true; }
  catch (e) { console.warn('settings save failed', e); return false; }
}

export async function loadMyHighScores() {
  player.highScores = {};
  try {
    const snap = await getDocs(collection(db, 'scores'));
    snap.forEach(d => { const s = d.data(); if (s.uid === player.uid && s.score > (player.highScores[s.mode] || 0)) player.highScores[s.mode] = s.score; });
  } catch (e) { console.warn('scores offline', e); }
}

/** Timer length (s) behind a timed mode key: Market, Number Shop or Rod Town Rush. */
function timeLimitOf(modeKey) {
  const g = gameOf(modeKey);
  return g === 'numbers' ? settings.numTimeLimit : g === 'bonds' ? settings.bondsTimeLimit : settings.timeLimit;
}

/**
 * Accuracy % from engine; the best-score doc is saved only if higher than stored,
 * but every finished game is logged as an attempt. Returns accuracy.
 */
export async function saveScore(modeKey) {
  const accuracy = engine.totalAttempts ? Math.round(engine.correctAttempts / engine.totalAttempts * 100) : 0;
  if (session.testMode) return accuracy; // teacher testing: never touch scores
  // Not awaited: the attempt log must never hold up (or break) the end-of-game flow.
  logAttempt({ game: gameOf(modeKey), mode: modeKey, kind: 'timed', score: engine.score, accuracy, maxCombo: engine.maxCombo, durationSec: timeLimitOf(modeKey) });
  if (engine.score > (player.highScores[modeKey] || 0)) player.highScores[modeKey] = engine.score;
  try {
    const ref = doc(db, 'scores', `${player.uid}_${modeKey}`);
    const prev = await getDoc(ref);
    if (!prev.exists() || engine.score > prev.data().score) {
      await setDoc(ref, { playerName: player.name, uid: player.uid, email: player.email || '', score: engine.score, maxCombo: engine.maxCombo, accuracy, mode: modeKey, timestamp: serverTimestamp() });
    }
  } catch (e) { console.warn('score save failed', e); }
  return accuracy;
}

// ---------- Attempt log (teacher data) ----------
const ATTEMPT_NUMBERS = ['score', 'accuracy', 'maxCombo', 'stars', 'mistakes', 'durationSec'];
const pad2 = n => String(n).padStart(2, '0');
/** Device-local calendar day, YYYY-MM-DD. */
function localDay(d = new Date()) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }

/** Test seam: when `write` is a function, logAttempt hands it the row instead of Firestore + the sheet POST. */
export const __attemptSink = { write: null };

/**
 * One document per finished game in `attempts` (contract: docs/superpowers/specs/2026-09-25-teacher-data-design.md),
 * plus a fire-and-forget row to the teacher's Google Sheet when settings.sheetUrl is an https URL.
 * Skipped in test mode or when nobody is signed in. Never throws.
 * fields: { game?, mode, kind: 'timed' | 'level', score?, accuracy?, maxCombo?, stars?, mistakes?, durationSec? }
 */
export async function logAttempt(fields) {
  try {
    if (session.testMode || !player.uid) return;
    const mode = String(fields.mode);
    const row = {
      uid: player.uid, name: player.name, email: player.email || '',
      game: fields.game || gameOf(mode), mode, modeLabel: modeLabel(mode), kind: fields.kind,
    };
    for (const k of ATTEMPT_NUMBERS) row[k] = Number.isFinite(fields[k]) ? fields[k] : null;
    row.ts = serverTimestamp();
    row.day = localDay();
    if (typeof __attemptSink.write === 'function') { __attemptSink.write(row); return; }
    let write; // addDoc can throw synchronously; the sheet row still goes out
    try { write = addDoc(collection(db, 'attempts'), row); } catch (e) { write = Promise.reject(e); }
    postToSheet({ ...row, ts: new Date().toISOString() });
    await write;
  } catch (e) { console.warn('attempt log failed', e); }
}

function postToSheet(row) {
  const url = typeof settings.sheetUrl === 'string' ? settings.sheetUrl.trim() : '';
  if (!/^https:\/\/\S+$/.test(url)) return;
  try {
    fetch(url, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(row) })
      .catch(e => console.warn('sheet sync failed', e));
  } catch (e) { console.warn('sheet sync failed', e); }
}

export async function getTop10(modeKey) {
  const snap = await getDocs(collection(db, 'scores'));
  const rows = [];
  snap.forEach(d => { const s = d.data(); if (s.mode === modeKey) rows.push(s); });
  rows.sort((a, b) => b.score - a.score);
  return rows.slice(0, 10);
}

// ---------- Trophies + unlocks ----------
export function trophyOf(score) { return trophyFor(score, settings.trophy); }

export function isUnlocked(prevKey, teacherOk = true) {
  if (session.testMode) return true;
  if (!teacherOk) return false;
  if (!prevKey) return true;
  return (player.highScores[prevKey] || 0) >= settings.trophy.bronze;
}

/**
 * Update a level button: lock state + subtitle line.
 * btn must contain a `.level-sub` element.
 */
export function refreshLevelButton(btn, key, prevKey, prevLabel, teacherOk = true) {
  const sub = btn.querySelector('.level-sub');
  const scoreOk = isUnlocked(prevKey);
  const open = scoreOk && (teacherOk || session.testMode);
  btn.classList.toggle('opacity-50', !open);
  btn.classList.toggle('cursor-not-allowed', !open);
  btn.dataset.locked = open ? '' : '1';
  if (session.testMode) {
    sub.textContent = '🧪 測試模式 Test mode';
  } else if (open) {
    const best = player.highScores[key] || 0;
    const t = trophyOf(best);
    sub.textContent = t ? `${TROPHY_ICON[t]} ${TROPHY_LABEL[t]} · 最高 Best ${best}` : '尚未遊玩 Not played yet';
  } else if (!scoreOk) {
    sub.textContent = `🔒 需要 ${prevLabel} 🥉 ${settings.trophy.bronze} 分 / Need ${prevLabel} Bronze (${settings.trophy.bronze})`;
  } else {
    sub.textContent = '🔒 老師未開放 Locked by teacher';
  }
}

// ---------- Leaderboard ----------
/** tabs: [{key,label}] ; styles tab-<key> buttons and fills #leaderboardBody. */
export async function renderLeaderboard(tabs, activeKey) {
  for (const t of tabs) {
    const b = $('tab-' + t.key);
    b.classList.toggle('bg-white', t.key === activeKey);
    b.classList.toggle('text-purple-600', t.key === activeKey);
    b.classList.toggle('bg-purple-300', t.key !== activeKey);
    b.classList.toggle('text-purple-700', t.key !== activeKey);
  }
  const tbody = $('leaderboardBody');
  tbody.innerHTML = '<tr><td colspan="3" class="text-center py-4 text-gray-500">Loading...</td></tr>';
  try {
    const rows = await getTop10(activeKey);
    tbody.innerHTML = rows.map((r, i) => {
      const me = r.uid === player.uid ? 'bg-yellow-100 font-bold text-gray-900' : 'text-gray-700';
      const t = trophyOf(r.score);
      return `<tr class="${me} border-b border-purple-200"><td class="py-3 px-2">${i + 1}</td><td class="px-2">${t ? TROPHY_ICON[t] + ' ' : ''}${esc(r.playerName)}</td><td class="px-2">${esc(r.score)}</td></tr>`;
    }).join('');
    if (!rows.length) tbody.innerHTML = '<tr><td colspan="3" class="text-center py-4 text-gray-500">No scores yet in this mode!</td></tr>';
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="3" class="text-center py-4 text-red-500">Offline Score: ${engine.score}</td></tr>`;
  }
}

// ---------- Rank popup ----------
/** Shows #rankPopup for ~4 s with score + trophy, then calls onDone. */
export function showRankPopup(score, onDone) {
  const popup = $('rankPopup');
  popup.style.display = 'flex';
  $('rankScore').innerText = 'Saving Score...';
  $('rankTrophy').innerText = '';
  setTimeout(() => {
    const t = trophyOf(score);
    $('rankScore').innerText = `${score} 分`;
    $('rankTrophy').innerText = t ? `${TROPHY_ICON[t]} ${TROPHY_LABEL[t]}!` : '再接再厲 Try again!';
    replay($('rankTrophy'), 'rank-anim');
    setTimeout(() => { popup.style.display = 'none'; onDone(); }, 3000);
  }, 1000);
}
// ---------- Teacher modal ----------
const TEACHER_MODAL_HTML = `
<div id="adminModal" class="hidden absolute inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
  <div class="bg-white p-6 md:p-8 rounded-3xl w-full max-w-sm shadow-2xl max-h-[95dvh] overflow-y-auto">
    <div id="pinView">
      <h2 class="text-2xl font-bold mb-4 text-center">Teacher Access</h2>
      <input type="password" id="pinInput" placeholder="Enter PIN" class="border-4 border-gray-300 p-2 rounded-xl w-full mb-4 text-center text-xl focus:border-blue-500 outline-none">
      <div class="flex gap-2">
        <button id="pinCancel" class="bubbly-btn bg-gray-300 text-gray-700 p-3 rounded-xl flex-1 font-bold">Cancel</button>
        <button id="pinOk" class="bubbly-btn bg-blue-500 text-white p-3 rounded-xl flex-1 font-bold">Unlock</button>
      </div>
    </div>
    <div id="settingsView" class="hidden">
      <h2 class="text-2xl font-bold mb-2 text-center text-purple-600">Classroom Settings</h2>
      <a id="teacherDashLink" href="teacher.html" class="block text-center font-bold text-blue-600 underline mb-4">📊 Teacher dashboard / 教師數據</a>
      <div class="bg-gray-100 p-4 rounded-xl mb-4 border-2 border-gray-200">
        <label class="flex items-center gap-3 text-lg font-bold text-gray-700 mb-2 cursor-pointer"><input type="checkbox" id="settingMed" class="w-6 h-6 accent-yellow-500 rounded"> Unlock Medium (Market)</label>
        <label class="flex items-center gap-3 text-lg font-bold text-gray-700 cursor-pointer"><input type="checkbox" id="settingHard" class="w-6 h-6 accent-red-500 rounded"> Unlock Hard (Market)</label>
      </div>
      <div class="bg-indigo-50 p-4 rounded-xl mb-4 border-2 border-indigo-200">
        <div class="font-bold text-gray-700 mb-2">Number Shop 數字小店</div>
        <div class="grid grid-cols-2 gap-2">
          <label class="flex items-center gap-2 font-bold text-gray-700 cursor-pointer"><input type="checkbox" id="settingNum1" class="w-6 h-6 accent-indigo-500 rounded"> Lv1 比較</label>
          <label class="flex items-center gap-2 font-bold text-gray-700 cursor-pointer"><input type="checkbox" id="settingNum2" class="w-6 h-6 accent-indigo-500 rounded"> Lv2 奇偶</label>
          <label class="flex items-center gap-2 font-bold text-gray-700 cursor-pointer"><input type="checkbox" id="settingNum3" class="w-6 h-6 accent-indigo-500 rounded"> Lv3 數線</label>
          <label class="flex items-center gap-2 font-bold text-gray-700 cursor-pointer"><input type="checkbox" id="settingNum4" class="w-6 h-6 accent-indigo-500 rounded"> Lv4 奇偶線</label>
        </div>
      </div>
      <div class="bg-orange-50 p-4 rounded-xl mb-4 border-2 border-orange-200">
        <div class="font-bold text-gray-700 mb-2">Rod Town 數棒鎮</div>
        <div class="grid grid-cols-2 gap-2">
          <label class="flex items-center gap-2 font-bold text-gray-700 cursor-pointer"><input type="checkbox" id="settingBonds1" class="w-6 h-6 accent-orange-500 rounded"> W1 草地 2-9</label>
          <label class="flex items-center gap-2 font-bold text-gray-700 cursor-pointer"><input type="checkbox" id="settingBonds2" class="w-6 h-6 accent-orange-500 rounded"> W2 海邊 10</label>
          <label class="flex items-center gap-2 font-bold text-gray-700 cursor-pointer"><input type="checkbox" id="settingBonds3" class="w-6 h-6 accent-orange-500 rounded"> W3 森林 11-13</label>
          <label class="flex items-center gap-2 font-bold text-gray-700 cursor-pointer"><input type="checkbox" id="settingBonds4" class="w-6 h-6 accent-orange-500 rounded"> W4 雪山 14-18</label>
        </div>
        <label class="flex items-center gap-2 font-bold text-gray-700 mt-3">Rush time (s)<input type="number" id="settingBondsTime" min="10" max="300" class="border-2 border-gray-300 p-1 rounded-lg w-20 text-center font-bold outline-none"></label>
        <label class="flex items-center gap-2 font-bold text-gray-700 mt-2 cursor-pointer"><input type="checkbox" id="settingLessMotion" class="w-6 h-6 accent-gray-500 rounded"> Less motion 減少動畫</label>
      </div>
      <div class="grid grid-cols-2 gap-3 mb-4">
        <label class="text-sm font-bold text-gray-700 text-center">Market time (s)<input type="number" id="settingTime" min="10" max="300" class="border-4 border-gray-300 p-2 rounded-xl w-full text-center text-xl font-bold outline-none"></label>
        <label class="text-sm font-bold text-gray-700 text-center">Number Shop time (s)<input type="number" id="settingNumTime" min="10" max="300" class="border-4 border-gray-300 p-2 rounded-xl w-full text-center text-xl font-bold outline-none"></label>
      </div>
      <div class="bg-yellow-50 p-3 rounded-xl mb-4 border-2 border-yellow-200">
        <div class="font-bold text-gray-700 text-center mb-2">Trophy cutoffs</div>
        <div class="grid grid-cols-3 gap-2">
          <label class="text-sm font-bold text-center">🥉<input type="number" id="settingBronze" min="1" class="border-2 border-gray-300 p-1 rounded-lg w-full text-center font-bold outline-none"></label>
          <label class="text-sm font-bold text-center">🥈<input type="number" id="settingSilver" min="1" class="border-2 border-gray-300 p-1 rounded-lg w-full text-center font-bold outline-none"></label>
          <label class="text-sm font-bold text-center">🥇<input type="number" id="settingGold" min="1" class="border-2 border-gray-300 p-1 rounded-lg w-full text-center font-bold outline-none"></label>
        </div>
        <div class="text-xs text-gray-500 text-center mt-1">Unlock next level = 🥉 cutoff</div>
      </div>
      <div class="bg-green-50 p-3 rounded-xl mb-4 border-2 border-green-200">
        <label class="block text-sm font-bold text-gray-700">Google Sheet link (Apps Script URL)
          <input type="url" id="settingSheetUrl" placeholder="https://script.google.com/macros/s/…/exec" autocomplete="off" class="border-2 border-gray-300 p-1 rounded-lg w-full mt-1 text-sm outline-none"></label>
        <div class="text-xs text-gray-500 mt-1">Leave empty to turn off. 留空即不同步。</div>
      </div>
      <button id="settingsSave" class="bubbly-btn bg-green-500 text-white py-3 px-4 rounded-xl w-full font-bold text-xl">Save Global Settings</button>
      <button id="testModeBtn" class="bubbly-btn bg-purple-500 text-white py-2 px-4 rounded-xl w-full font-bold mt-3">🧪 Test mode (this device, all levels, no saving)</button>
    </div>
  </div>
</div>`;

/** Sheet link accepted by the teacher panel: empty (off) or an Apps Script web-app URL. */
const isSheetUrl = u => u === '' || /^https:\/\/script\.google\.com\/\S+$/.test(u);

/** Injects the modal into document.body and wires #adminBtn. onSaved() runs after a successful save. */
export function mountTeacherModal(onSaved) {
  if ($('adminModal')) throw new Error('teacher modal already mounted');
  if (!$('adminBtn')) throw new Error('DOM contract: missing #adminBtn');
  document.body.insertAdjacentHTML('beforeend', TEACHER_MODAL_HTML);
  const open = () => { $('adminModal').classList.remove('hidden'); $('pinView').classList.remove('hidden'); $('settingsView').classList.add('hidden'); $('pinInput').value = ''; };
  const close = () => { $('adminModal').classList.add('hidden'); $('pinInput').value = ''; };
  $('adminBtn').addEventListener('click', open);
  $('pinCancel').addEventListener('click', close);
  $('pinOk').addEventListener('click', () => {
    if ($('pinInput').value !== TEACHER_PIN) { alert('Incorrect PIN'); return; }
    $('pinView').classList.add('hidden'); $('settingsView').classList.remove('hidden');
    $('settingMed').checked = settings.unlockMedium; $('settingHard').checked = settings.unlockHard;
    NUM_KEYS.forEach((k, i) => { $('settingNum' + (i + 1)).checked = !!settings.numUnlock[k]; });
    BONDS_KEYS.forEach((k, i) => { $('settingBonds' + (i + 1)).checked = !!settings.bondsUnlock[k]; });
    $('settingBondsTime').value = settings.bondsTimeLimit; $('settingLessMotion').checked = !!settings.lessMotion;
    $('settingTime').value = settings.timeLimit; $('settingNumTime').value = settings.numTimeLimit;
    $('settingSheetUrl').value = settings.sheetUrl || '';
    $('settingBronze').value = settings.trophy.bronze; $('settingSilver').value = settings.trophy.silver; $('settingGold').value = settings.trophy.gold;
  });
  $('settingsSave').addEventListener('click', async () => {
    const trophy = { bronze: parseInt($('settingBronze').value), silver: parseInt($('settingSilver').value), gold: parseInt($('settingGold').value) };
    if (!validateCutoffs(trophy)) { alert('Trophy cutoffs must be numbers with Bronze < Silver < Gold.'); return; }
    const sheetUrl = $('settingSheetUrl').value.trim();
    if (!isSheetUrl(sheetUrl)) { alert('Google Sheet link must be empty or start with https://script.google.com/'); return; }
    const patch = {
      unlockMedium: $('settingMed').checked, unlockHard: $('settingHard').checked,
      timeLimit: parseInt($('settingTime').value) || 30, numTimeLimit: parseInt($('settingNumTime').value) || 30,
      numUnlock: Object.fromEntries(NUM_KEYS.map((k, i) => [k, $('settingNum' + (i + 1)).checked])),
      bondsUnlock: Object.fromEntries(BONDS_KEYS.map((k, i) => [k, $('settingBonds' + (i + 1)).checked])),
      bondsTimeLimit: parseInt($('settingBondsTime').value) || 60,
      lessMotion: $('settingLessMotion').checked,
      trophy, sheetUrl
    };
    const ok = await saveSettings(patch);
    alert(ok ? 'Settings saved globally.' : 'Saved locally only (offline).');
    close(); onSaved();
  });
  $('testModeBtn').addEventListener('click', () => { enterTestMode(); close(); onSaved(); });
  if (session.testMode) showTestBadge();
}
