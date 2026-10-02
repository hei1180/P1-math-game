// Robot Workshop progress: Firestore shapesProgress/{uid} + localStorage mirror, merged on load.
// Gallery entries live in robotGallery/{uid} (see validateGalleryEntry in shapes-logic.js).
import { db, player } from './shared.js?v=0';
import { doc, getDoc, setDoc, getDocs, collection, query, where, limit, updateDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js';
import { emptyProgress, mergeProgress, validateGalleryEntry } from './shapes-logic.js?v=0';

const lsKey = uid => `shapesProgress:${uid}`;
const readLocal = uid => { try { return JSON.parse(localStorage.getItem(lsKey(uid)) || 'null'); } catch (e) { return null; } };
const writeLocal = (uid, p) => { try { localStorage.setItem(lsKey(uid), JSON.stringify(p)); } catch (e) { /* ignore */ } };

export async function loadProgress(uid) {
  let remote = null;
  if (uid) {
    try { const snap = await getDoc(doc(db, 'shapesProgress', uid)); if (snap.exists()) remote = snap.data(); }
    catch (e) { console.warn('progress offline', e); }
  }
  return mergeProgress(mergeProgress(emptyProgress(), readLocal(uid || 'guest')), remote);
}

export async function saveProgress(uid, progress) {
  writeLocal(uid || 'guest', progress);
  if (!uid) return;
  try { await setDoc(doc(db, 'shapesProgress', uid), { ...progress, name: player.name, email: player.email || '', updatedAt: serverTimestamp() }); }
  catch (e) { console.warn('progress save failed', e); }
}

/** Students see visible entries only (max 60); the teacher sees every entry. Any error gives []. */
export async function loadGallery({ teacher = false } = {}) {
  try {
    const col = collection(db, 'robotGallery');
    const snap = await getDocs(teacher ? col : query(col, where('hidden', '==', false), limit(60)));
    return snap.docs.map(d => ({ uid: d.id, ...d.data() }));
  } catch (e) { console.warn('gallery offline', e); return []; }
}

/** Write the player's own gallery entry. The existing `hidden` flag is kept (only the teacher changes it). */
export async function saveGalleryEntry(uid, entry) {
  if (!uid) return;
  try {
    const ref = doc(db, 'robotGallery', uid);
    let existing = null;
    try { const snap = await getDoc(ref); if (snap.exists()) existing = snap.data(); } catch (e) { /* offline: treat as new */ }
    const hidden = existing?.hidden ?? false;
    if (!validateGalleryEntry({ ...entry, hidden })) { console.warn('gallery entry invalid, not saved'); return; }
    await setDoc(ref, { ...entry, hidden, updatedAt: serverTimestamp() });
  } catch (e) { console.warn('gallery save failed', e); }
}

/** Teacher only (rules allow the teacher to update `hidden` and nothing else). */
export async function setGalleryHidden(uid, hidden) {
  try { await updateDoc(doc(db, 'robotGallery', uid), { hidden: !!hidden }); return true; }
  catch (e) { console.warn('gallery hide failed', e); return false; }
}
