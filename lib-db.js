// Thin wrapper around Firebase (Auth + Firestore). Every other file talks to the
// database only through this module, so nothing else needs to know about Firebase.
import { initializeApp, deleteApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  initializeAuth, getAuth, browserLocalPersistence, indexedDBLocalPersistence,
  signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut,
  onAuthStateChanged, updatePassword, EmailAuthProvider, reauthenticateWithCredential,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, doc, getDoc, getDocs, setDoc, updateDoc, addDoc, deleteDoc,
  collection, query, where, writeBatch,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { cfg } from "./config.js";

export const configured = !!(cfg && cfg.apiKey && cfg.projectId && cfg.appId && !/PASTE|YOUR_/i.test(cfg.apiKey));

const app = initializeApp(cfg);
const auth = initializeAuth(app, { persistence: [browserLocalPersistence, indexedDBLocalPersistence] });

const seg = (p) => p.split("/").filter(Boolean);
const snapOf = (d) => ({ id: d.id, ...d.data() });
// Firestore rejects `undefined`; drop it (also inside nested objects / arrays).
export function clean(v) {
  if (Array.isArray(v)) return v.map(clean);
  if (v && typeof v === "object" && Object.getPrototypeOf(v) === Object.prototype) {
    const o = {};
    for (const k of Object.keys(v)) if (v[k] !== undefined) o[k] = clean(v[k]);
    return o;
  }
  return v;
}

function makeApi(fs) {
  return {
    async get(path) {
      const s = await getDoc(doc(fs, ...seg(path)));
      return s.exists() ? snapOf(s) : null;
    },
    // conds: [field, op, value] ... (equality filters only, so no index is needed)
    async list(path, ...conds) {
      const c = collection(fs, ...seg(path));
      const q = conds.length ? query(c, ...conds.map(([f, o, v]) => where(f, o, v))) : c;
      return (await getDocs(q)).docs.map(snapOf);
    },
    async set(path, data, merge) {
      await setDoc(doc(fs, ...seg(path)), clean(data), merge ? { merge: true } : undefined);
    },
    async upd(path, data) {
      await updateDoc(doc(fs, ...seg(path)), clean(data));
    },
    async add(path, data) {
      return (await addDoc(collection(fs, ...seg(path)), clean(data))).id;
    },
    async del(path) {
      await deleteDoc(doc(fs, ...seg(path)));
    },
    newId(path) {
      return doc(collection(fs, ...seg(path))).id;
    },
    // ops: {set:[path,data,merge?]} | {upd:[path,data]} | {del:path}
    async batch(ops) {
      for (let i = 0; i < ops.length; i += 400) {
        const b = writeBatch(fs);
        for (const o of ops.slice(i, i + 400)) {
          if (o.set) b.set(doc(fs, ...seg(o.set[0])), clean(o.set[1]), o.set[2] ? { merge: true } : {});
          else if (o.upd) b.update(doc(fs, ...seg(o.upd[0])), clean(o.upd[1]));
          else if (o.del) b.delete(doc(fs, ...seg(o.del)));
        }
        await b.commit();
      }
    },
  };
}

export const db = makeApi(getFirestore(app));

// ---------- auth ----------
export const authEmail = (key) => String(key).trim().toLowerCase() + "@rise.local";
export const onAuth = (cb) => onAuthStateChanged(auth, cb);
export const signIn = (email, pw) => signInWithEmailAndPassword(auth, email, pw);
export const signOutNow = () => signOut(auth);
export const currentUid = () => (auth.currentUser ? auth.currentUser.uid : null);
export const currentEmail = () => (auth.currentUser ? auth.currentUser.email : "");

export async function changePassword(current, next) {
  const u = auth.currentUser;
  await reauthenticateWithCredential(u, EmailAuthProvider.credential(u.email, current));
  await updatePassword(u, next);
}

// Create a Firebase login WITHOUT signing the current user out: it is done on a
// temporary second app. `fn(uid, tdb)` runs while signed in as the new account
// (tdb = the same database api, but acting as the new user).
export async function withNewAccount(email, pw, fn) {
  const tapp = initializeApp(cfg, "t" + Date.now() + Math.random().toString(36).slice(2, 6));
  const a2 = getAuth(tapp);
  let cred = null;
  try {
    cred = await createUserWithEmailAndPassword(a2, email, pw);
    return await fn(cred.user.uid, makeApi(getFirestore(tapp)));
  } catch (e) {
    if (cred) { try { await cred.user.delete(); } catch (x) { /* ignore */ } }
    throw e;
  } finally {
    try { await signOut(a2); } catch (x) { /* ignore */ }
    try { await deleteApp(tapp); } catch (x) { /* ignore */ }
  }
}

export const isEmailInUse = (e) => e && e.code === "auth/email-already-in-use";

// A short, plain explanation for the most common failures.
export function dbError(e) {
  const code = (e && e.code) || "";
  const m = String((e && e.message) || e || "");
  if (/permission|insufficient/i.test(code + m)) return "The database rules block this. Publish the latest firestore.rules (see README).";
  if (/unavailable|offline|network/i.test(code + m)) return "Cannot reach the database. Check the internet connection.";
  if (/too-many-requests/.test(code)) return "Too many tries. Please wait a few minutes.";
  if (/weak-password/.test(code)) return "The password is too weak (minimum 6 characters).";
  if (/email-already-in-use/.test(code)) return "This ID is already taken.";
  if (/network-request-failed/.test(code)) return "Network problem. Check the internet connection.";
  if (/api-key|invalid-api/.test(code + m)) return "config.js has a wrong Firebase key.";
  if (/operation-not-allowed/.test(code)) return "Email/Password sign-in is not turned on in Firebase > Authentication.";
  if (/quota|resource-exhausted/i.test(code + m)) return "The free Firebase quota for today is used up. Try again tomorrow.";
  return m || "Something went wrong.";
}
