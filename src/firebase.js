/* ============================================================
   FIREBASE REALTIME DATABASE
   Config comes from Vite env vars (see .env.example). Vite inlines
   VITE_* values at build time, so they ship inside the bundle —
   that is expected for a Firebase web app: the API key identifies
   the project, it does not grant access. Writes are gated by
   Database Rules (database.rules.json), not by hiding this key.
============================================================ */
import { initializeApp } from 'firebase/app';
import { getDatabase, ref, set, onValue, serverTimestamp } from 'firebase/database';
import { TOURNAMENT_ID } from './config.js';

const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL:       import.meta.env.VITE_FIREBASE_DATABASE_URL,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID,
};

/* databaseURL is the one value the Realtime Database genuinely cannot work
   without, so it decides whether we run live or fall back to local-only. */
export const isConfigured = Boolean(firebaseConfig.databaseURL && firebaseConfig.apiKey);

export const missingKeys = Object.entries(firebaseConfig)
  .filter(([, v]) => !v)
  .map(([k]) => k);

let db = null;
if (isConfigured) {
  try {
    db = getDatabase(initializeApp(firebaseConfig));
  } catch (err) {
    console.error('[firebase] init failed:', err);
    db = null;
  }
}

export const isLive = () => db !== null;

const boardRef = () => ref(db, `tournaments/${TOURNAMENT_ID}`);

/* ---------- shape translation ----------
   Firebase turns an object whose keys are "1","2","3" into a JS ARRAY on read,
   which would quietly reshape `results`. Store match keys as m1/m2/m3 so the
   value round-trips as a plain object. */
const toDb = state => ({
  teams: state.teams,
  results: Object.fromEntries(Object.entries(state.results).map(([m, v]) => [`m${m}`, v])),
  updated: state.updated,
});

export const fromDb = value => {
  if (!value) return null;
  const results = {};
  for (const [k, v] of Object.entries(value.results || {})) {
    const m = String(k).replace(/^m/, '');
    if (v) results[m] = v;
  }
  return { teams: value.teams || [], results, updated: value.updated || null };
};

/* Subscribe to the board. onNext receives normalised state (or null when the
   board has never been written). Returns an unsubscribe function. */
export function subscribe(onNext, onError) {
  if (!db) return () => {};
  return onValue(
    boardRef(),
    snap => onNext(fromDb(snap.val())),
    err => { console.error('[firebase] read failed:', err); onError?.(err); }
  );
}

/* Watch the SDK's own connection state so the header can show LIVE vs OFFLINE. */
export function subscribeConnection(onChange) {
  if (!db) return () => {};
  return onValue(ref(db, '.info/connected'), snap => onChange(snap.val() === true));
}

/* Publish the whole board. Last write wins — see README on concurrent admins. */
export async function publish(state) {
  if (!db) throw new Error('Firebase is not configured');
  await set(boardRef(), toDb(state));
}

export { serverTimestamp };
