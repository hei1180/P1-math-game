// Rod Town progress: Firestore bondsProgress/{uid} + localStorage mirror, merged on load.
import { db, player } from './shared.js?v=202609251810';
import { doc, getDoc, setDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js';
import { emptyProgress, mergeProgress } from './bonds-logic.js?v=202609251810';

const lsKey = uid => `bondsProgress:${uid}`;
const readLocal = uid => { try { return JSON.parse(localStorage.getItem(lsKey(uid)) || 'null'); } catch (e) { return null; } };
const writeLocal = (uid, p) => { try { localStorage.setItem(lsKey(uid), JSON.stringify(p)); } catch (e) { /* ignore */ } };

export const today = () => new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD local

export async function loadProgress(uid) {
  let remote = null;
  if (uid) {
    try { const snap = await getDoc(doc(db, 'bondsProgress', uid)); if (snap.exists()) remote = snap.data(); }
    catch (e) { console.warn('progress offline', e); }
  }
  return mergeProgress(mergeProgress(emptyProgress(), readLocal(uid || 'guest')), remote);
}

export async function saveProgress(uid, progress) {
  writeLocal(uid || 'guest', progress);
  if (!uid) return;
  try { await setDoc(doc(db, 'bondsProgress', uid), { ...progress, name: player.name, email: player.email || '', updatedAt: serverTimestamp() }); }
  catch (e) { console.warn('progress save failed', e); }
}
