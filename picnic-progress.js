// Picnic Park progress: Firestore picnicProgress/{uid} + localStorage mirror, merged on load.
import { db, player } from './shared.js?v=202610100109';
import { doc, getDoc, setDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js';
import { emptyProgress, mergeProgress } from './picnic-logic.js?v=202610100109';

const lsKey = uid => `picnicProgress:${uid}`;
const readLocal = uid => { try { return JSON.parse(localStorage.getItem(lsKey(uid)) || 'null'); } catch (e) { return null; } };
const writeLocal = (uid, p) => { try { localStorage.setItem(lsKey(uid), JSON.stringify(p)); } catch (e) { /* ignore */ } };

export async function loadProgress(uid) {
  let remote = null;
  if (uid) {
    try { const snap = await getDoc(doc(db, 'picnicProgress', uid)); if (snap.exists()) remote = snap.data(); }
    catch (e) { console.warn('progress offline', e); }
  }
  return mergeProgress(mergeProgress(emptyProgress(), readLocal(uid || 'guest')), remote);
}

export async function saveProgress(uid, progress) {
  writeLocal(uid || 'guest', progress);
  if (!uid) return;
  try { await setDoc(doc(db, 'picnicProgress', uid), { ...progress, name: player.name, email: player.email || '', updatedAt: serverTimestamp() }); }
  catch (e) { console.warn('progress save failed', e); }
}
