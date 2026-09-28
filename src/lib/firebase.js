import { initializeApp } from 'firebase/app';
import { getAuth, onAuthStateChanged, signInAnonymously, createUserWithEmailAndPassword, signInWithEmailAndPassword, signInWithPopup, GoogleAuthProvider, signOut, sendEmailVerification } from 'firebase/auth';
import { getFirestore, collection, doc, getDocs, getDoc, setDoc, writeBatch } from 'firebase/firestore';
const config = { apiKey: import.meta.env.VITE_FIREBASE_API_KEY, authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN, projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID, appId: import.meta.env.VITE_FIREBASE_APP_ID };
export const enabled = !!(config.apiKey && config.authDomain && config.projectId && config.appId);
const app = enabled ? initializeApp(config) : null;
export const auth = app ? getAuth(app) : null;
const db = app ? getFirestore(app) : null;
const appId = import.meta.env.VITE_FIREBASE_ARTIFACT_ID || 'sat-vocamaster';
export const authActions = { onAuthStateChanged, signInAnonymously, createUserWithEmailAndPassword, signInWithEmailAndPassword, signInWithPopup, GoogleAuthProvider, signOut, sendEmailVerification };
const path = uid => ['artifacts', appId, 'users', uid];
export async function loadRemote(uid) {
  if (!db) return null;
  const base = path(uid);
  const [profile, states, sessions] = await Promise.all([
    getDoc(doc(db,...base,'profile','settings')),
    getDocs(collection(db,...base,'word_states')),
    getDocs(collection(db,...base,'study_sessions'))
  ]);
  const raw = profile.exists() ? profile.data() : {};
  return { settings: raw.settings || {}, xp: raw.xp || 0, activity: raw.activity || {}, states: Object.fromEntries(states.docs.map(d => [d.id,d.data()])), sessions: sessions.docs.map(d => d.data()).sort((a,b)=>b.timestamp-a.timestamp).slice(0,500) };
}
export async function saveRemote(uid, data, changedWord, newSession) {
  if (!db) return;
  const base = path(uid);
  const batch = writeBatch(db);
  batch.set(doc(db,...base,'profile','settings'),{ settings:data.settings, xp:data.xp, activity:data.activity },{merge:true});
  if (changedWord && data.states[changedWord]) batch.set(doc(db,...base,'word_states',changedWord),data.states[changedWord]);
  if (newSession) batch.set(doc(db,...base,'study_sessions',newSession.id),newSession);
  await batch.commit();
}
export async function uploadLocal(uid, data) {
  if (!db) return;
  const base = path(uid);
  // Firestore batches are limited to 500 writes. Sync local reviews in chunks.
  const entries = Object.entries(data.states);
  for (let i=0;i<entries.length;i+=400) {
    const batch=writeBatch(db);
    for (const [id,state] of entries.slice(i,i+400)) batch.set(doc(db,...base,'word_states',id),state);
    await batch.commit();
  }
  const batch=writeBatch(db);
  batch.set(doc(db,...base,'profile','settings'),{settings:data.settings,xp:data.xp,activity:data.activity});
  for (const session of data.sessions.slice(0,100)) batch.set(doc(db,...base,'study_sessions',session.id),session);
  await batch.commit();
}
