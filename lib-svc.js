// Data services: loading the app's data, accounts, notifications, files, mail.
// Pages call these instead of touching the database directly for anything shared.
import { db, withNewAccount, isEmailInUse, authEmail, dbError } from "./lib-db.js";
import { S, T, t, lk, cmp, num, sleep } from "./lib-core.js";
import { calcBatch, statRow, rollOf, ADMIN_ID, defaultBatches, findBatch, hasBatch, classGroups, batchSpec, isGd, DEFAULT_FEE } from "./lib-stats.js";

export const active = (u) => u.active !== false && u.ap !== false;
const byBatch = (a, b) => (+a.cls || 99) - (+b.cls || 99) || cmp(a.grp, b.grp) || cmp(a.name, b.name);

// ---------- signed-in person ----------
// Builds S.me from a profile document. A teacher with `ca` is a co-admin (me.co = true).
export function setMe(pid, data) {
  nc = { t: 0, p: null };
  S.pid = pid;
  S.me = { ...data, id: pid, co: data.role === "teacher" && data.ca === true };
  return S.me;
}
export async function reloadMe() {
  const d = await db.get("users/" + S.pid);
  if (d) setMe(S.pid, d);
  return S.me;
}

// ---------- loading ----------
export async function loadInst() {
  try { S.INST = (await db.get("config/inst")) || {}; } catch (e) { S.INST = {}; }
}
// Fills S.B / S.U / S.TC / S.PEND for the signed-in person.
export async function loadCore() {
  const me = S.me;
  await loadInst();
  if (me.role === "student") {
    S.B = me.bid ? [await db.get("batches/" + me.bid)].filter(Boolean) : [];
    S.U = []; S.TC = []; S.PEND = [];
  } else if (me.role === "teacher" && !me.co) {
    const all = await db.list("batches");
    S.B = all.filter((b) => (me.bids || []).includes(b.id));
    const lists = await Promise.all(S.B.map((b) => db.list("users", ["bid", "==", b.id])));
    S.U = lists.flat().filter((u) => u.role === "student" && active(u));
    S.TC = []; S.PEND = [];
  } else {
    const [B, st, tc] = await Promise.all([db.list("batches"), db.list("users", ["role", "==", "student"]), db.list("users", ["role", "==", "teacher"])]);
    S.B = B;
    S.PEND = [...st, ...tc].filter((u) => u.ap === false);
    S.U = st.filter((u) => u.ap !== false);
    S.TC = tc.filter((u) => u.ap !== false);
  }
  S.B.sort(byBatch);
  if (!S.B.some((b) => b.id === S.bid)) S.bid = (S.B[0] || {}).id || null;
}
export async function reloadPeople() { await loadCore(); }

// Ready-made batches (Class 4-8, and Class 9-12 for each group), one for the boys and one for the girls. Created once by the admin.
export async function ensureDefaultBatches() {
  const have = S.B.length ? S.B : await db.list("batches");
  const ops = [];
  for (const d of defaultBatches()) {
    if (hasBatch(have, d.cls, d.grp, d.gd)) continue;
    const { id, ...x } = d;
    ops.push({ set: ["batches/" + id, { ...x, start: monthStart(), auto: true }] });
  }
  if (ops.length) { await db.batch(ops); await loadCore(); }
  return ops.length;
}
// For an academy that already has batches: make the missing Boys and Girls batch of every class / group that has a batch.
// Nobody is moved; new registrations then go to the right one. Returns how many batches were made.
export async function ensureGenderBatches() {
  const have = S.B.length ? S.B : await db.list("batches");
  const ops = [];
  for (const { cls, grp } of classGroups(have)) {
    for (const gd of ["M", "F"]) {
      if (hasBatch(have, cls, grp, gd)) continue;
      const { id, ...x } = batchSpec(cls, grp, gd);
      ops.push({ set: ["batches/" + id, { ...x, start: monthStart(), auto: true }] });
    }
  }
  if (ops.length) { await db.batch(ops); await loadCore(); }
  return ops.length;
}
export const monthStart = () => T().slice(0, 8) + "01";

// ---------- notifications and activity log ----------
// to: "batch" (needs bid), "admin", or a person id
// document id that sorts NEWEST FIRST, so a list can read just the latest few (db.recent)
export const timeId = () => String(9e12 - Date.now()).padStart(13, "0") + Math.random().toString(36).slice(2, 7);
export const notify = (to, text, bid) => db.set("nt/" + timeId(), { to, t: text, d: Date.now(), ...(bid ? { bid } : {}) }).catch(() => {});
// co-admins are logged for the admin (log); plain teachers leave a notice for the admin (alerts)
export const logAct = (msg) => {
  const me = S.me;
  if (!me || me.role === "student" || (me.role === "admin" && !me.co)) return;
  const b = S.B.find((x) => x.id === S.bid), text = msg + (b ? " (" + b.name + ")" : "");
  if (me.co) db.set("log/" + timeId(), { uid: S.pid, by: me.name, msg: text, t: Date.now() }).catch(() => {});
  else if (b) db.set("nt/" + timeId(), { to: "admin", t: me.name + ": " + text, d: Date.now(), bid: b.id }).catch(() => {});
};
let nc = { t: 0, p: null };
// the bell and the dashboard both ask: share one answer for a few seconds (force = true after sending a notice)
export function getNotices(force = false) {
  if (!force && nc.p && Date.now() - nc.t < 15000) return nc.p;
  nc = { t: Date.now(), p: loadNotices() };
  nc.p.catch(() => { nc = { t: 0, p: null }; });
  return nc.p;
}
async function loadNotices() {
  const me = S.me;
  let q;
  const N = 25;
  if (me.role === "student") q = await Promise.all([me.bid ? db.recent("nt", N, ["to", "==", "batch"], ["bid", "==", me.bid]) : [], db.recent("nt", N, ["to", "==", S.pid])]);
  else if (me.role === "teacher" && !me.co) q = await Promise.all([...(me.bids || []).map((b) => db.recent("nt", N, ["to", "==", "batch"], ["bid", "==", b])), db.recent("nt", N, ["to", "==", S.pid])]);
  else q = [await db.recent("nt", N, ["to", "==", "admin"]), await db.recent("nt", N, ["to", "==", S.pid])];
  return q.flat().sort((a, b) => b.d - a.d).slice(0, 40);
}
export const seenKey = () => "seen" + S.pid;
export const unseenCount = (list) => { let s = 0; try { s = +localStorage.getItem(seenKey()) || 0; } catch (e) { /* ignore */ } return list.filter((n) => n.d > s).length; };
export const markSeen = () => { try { localStorage.setItem(seenKey(), Date.now()); } catch (e) { /* ignore */ } };

// ---------- batch data + statistics ----------
const cache = {};
export async function batchData(bid, force = false) {
  if (!force && cache[bid]) return cache[bid];
  const [att, exams, pa] = await Promise.all([db.list("att", ["bid", "==", bid]), db.list("exams", ["bid", "==", bid]), db.list("pa", ["bid", "==", bid])]);
  return (cache[bid] = { att, exams, pa });
}
export const dropBatchCache = (bid) => { if (bid) delete cache[bid]; else for (const k of Object.keys(cache)) delete cache[k]; };

// Recalculate this month's numbers + ranks of a batch and store them in ONE document (bstat/<batch>)
// that the students read. Pages call this after saving attendance, marks, performance, or batch changes.
export async function recalcBatch(bid) {
  const b = S.B.find((x) => x.id === bid);
  if (!b) return [];
  dropBatchCache(bid);
  const d = await batchData(bid, true);
  const rows = calcBatch({ students: S.U.filter((s) => s.bid === bid && active(s)), att: d.att, exams: d.exams, perf: d.pa, from: b.start });
  const map = {};
  rows.forEach((r) => { map[r.id] = statRow(r); });
  await db.set("bstat/" + bid, { bid, from: b.start, t: Date.now(), n: rows.length, rows: map });
  return rows;
}
export async function getStats(bid) {
  try { return (await db.get("bstat/" + bid)) || { rows: {} }; } catch (e) { return { rows: {} }; }
}

// ---------- accounts ----------
const tempPassword = () => Math.random().toString(36).slice(2, 8) + "A1";
const suffix4 = () => (Math.random().toString(36) + "0000").replace(/[^a-z0-9]/g, "").slice(0, 4);
// the red text of a failed step: what was being done + the reason (and the Firebase code, so that it can be looked up)
const stepError = (what, e) => { const x = new Error(what + " failed: " + dbError(e) + (e && e.code ? " [" + e.code + "]" : "")); x.code = e && e.code; return x; };
const isDenied = (e) => e && (e.code === "permission-denied" || /permission/i.test(String(e.message || "")));

// ROLL NUMBERS. A roll number is the smallest free number of its kind and year: when an account is deleted its number is free again and
// the next registration gets it. The admin's ID (ADMIN_ID) is never given to anybody else.
// Which numbers are taken is read from the login documents (public: one per account) and from the loaded lists.
async function takenRolls() {
  const set = new Set();
  try { (await db.list("login")).forEach((x) => set.add(String(x.id).toLowerCase())); } catch (e) { /* ignore */ }
  [...S.U, ...S.TC, ...S.PEND].forEach((x) => { if (x && x.roll) set.add(String(x.roll).toLowerCase()); });
  return set;
}
function nextFree(role, year, taken) {
  for (let n = 1; n < 100000; n++) {
    const roll = rollOf(role, year, n), k = roll.toLowerCase();
    if (roll === ADMIN_ID || taken.has(k)) continue;
    return n;
  }
  throw new Error("No roll number is free.");
}
// A login for this roll. The plain address (roll@rise.local) is used when it is free. When it is not - an earlier account with this roll
// number was deleted, and a browser cannot delete a login that is not its own - the address gets a short random ending, so the number
// can be used again. fn(uid, tdb, email) runs while signed in as the new login.
async function openLogin(roll, pw, fn, plainOnly) {
  const plain = authEmail(roll);
  try { return await withNewAccount(plain, pw, (uid, tdb) => fn(uid, tdb, plain)); } catch (e) { if (!isEmailInUse(e) || plainOnly) throw e; }
  const alias = String(roll).toLowerCase() + "." + suffix4() + "@rise.local";
  return withNewAccount(alias, pw, (uid, tdb) => fn(uid, tdb, alias));
}
// Admin / co-admin adds a student or teacher. Returns {roll, pw, id}.
export async function createAccount(role, data) {
  const year = new Date().getFullYear(), pw = tempPassword(), taken = await takenRolls();
  for (let i = 0; i < 30; i++) {
    const n = nextFree(role, year, taken), roll = rollOf(role, year, n), key = roll.toLowerCase();
    taken.add(key);
    if (await db.get("login/" + key)) continue;
    const got = await openLogin(roll, pw, async (uid, tdb, email) => ({ uid, email })).catch((e) => { throw stepError("Making the login (" + roll + ")", e); });
    await db.batch([
      { set: ["users/" + got.uid, { ...data, role, roll, active: true, ap: true, mustChange: true, createdAt: Date.now() }] },
      { set: ["login/" + key, { es: [got.email] }] },
    ]).catch((e) => { throw stepError("Saving the profile and the login lookup of " + roll, e); });
    return { roll, pw, id: got.uid };
  }
  throw new Error("Could not create a roll number. Please try again.");
}

// Student / teacher registers himself. The account exists at once but ap=false until approved.
export async function selfRegister(d) {
  const st = d.role === "student", year = new Date().getFullYear();
  const open = await db.get("config/reg").catch(() => null);
  if (open && open.open === false) throw new Error("Registration is closed right now.");
  let bid = "";
  if (st) { try { bid = (findBatch(await db.list("batches"), d.cls, d.grp, d.gd) || {}).id || ""; } catch (e) { /* ignore */ } }
  const base = st
    ? { role: "student", name: d.name, nick: d.nick || "", gphone: d.gphone || "", gem: d.gem || "", bid, cls: d.cls, school: d.school || "", grp: d.grp || "", ...(isGd(d.gd) ? { gd: d.gd } : {}), phone: d.phone, addr: d.addr || "", email: d.email }
    : { role: "teacher", name: d.name, nick: d.nick || "", subject: d.subject || "", cls: d.cls || "", phone: d.phone, addr: d.addr || "", email: d.email, bids: [] };
  const taken = await takenRolls();
  let plainOnly = false;   // set when the rules refuse the longer address: then only numbers that were never used are tried
  for (let i = 0; i < 40; i++) {
    const n = nextFree(d.role, year, taken), roll = rollOf(d.role, year, n), lkKey = roll.toLowerCase();
    taken.add(lkKey);
    if (await db.get("login/" + lkKey).catch(() => null)) continue;
    try {
      return await openLogin(roll, d.pw, async (uid, tdb, email) => {
        await tdb.set("login/" + lkKey, { es: [email] });   // first: this claims the number (a login document that exists cannot be written again)
        await tdb.set("users/" + uid, { ...base, roll, active: true, mustChange: false, ap: false });
        await tdb.set("reg/" + timeId(), { role: d.role, name: d.name, phone: d.phone, email: d.email, roll, st: "auto", t: Date.now() }).catch(() => {});
        return { roll, email, pw: d.pw };
      }, plainOnly);
    } catch (e) {
      if (isEmailInUse(e)) continue;
      if (isDenied(e)) { plainOnly = true; continue; }   // somebody took the number a moment ago, or the old rules do not allow the longer address
      throw e;
    }
  }
  throw new Error("Could not create a roll number. Please try again.");
}

// Admin gives a new temporary password. Firebase cannot change another person's password from the
// browser, so the person gets a NEW login and the old one is switched off (map/<uid> = "_").
export async function resetPassword(u) {
  const pw = tempPassword(), alias = String(u.roll).toLowerCase() + "." + Math.random().toString(36).slice(2, 6) + "@rise.local";
  const uid = await withNewAccount(alias, pw, async (x) => x);
  const old = u.cu || u.id;
  await db.batch([
    { set: ["map/" + uid, { sid: u.id }] },
    ...(old !== uid ? [{ set: ["map/" + old, { sid: "_" }] }] : []),
    { upd: ["users/" + u.id, { cu: uid, mustChange: true }] },
    { set: ["login/" + String(u.roll).toLowerCase(), { es: [alias] }] },
  ]);
  u.cu = uid; u.mustChange = true;
  return pw;
}

// ---------- admin transfer ----------
// The main admin hands the admin role to a teacher. ONE atomic batch: the teacher becomes admin, the old admin becomes a
// co-admin (so access is never lost) and a history entry is written. Nothing changes unless all of it is saved.
export async function transferAdmin(toId) {
  const me = S.me;
  if (!me || me.role !== "admin" || me.co) throw new Error(t("Only the main admin can transfer admin access."));
  if (!toId || toId === S.pid) throw new Error(t("Choose another person."));
  const [to, from] = await Promise.all([db.get("users/" + toId), db.get("users/" + S.pid)]);   // fresh copies, not the cached lists
  if (!from || from.role !== "admin") throw new Error(t("You are not the admin any more. Reload the page."));
  if (!to || to.role !== "teacher") throw new Error(t("Only a teacher can become the admin."));
  if (to.active === false || to.ap === false) throw new Error(t("This account is not active."));
  if (to.mustChange === true) throw new Error(t("This teacher has not signed in and set a password yet."));
  const now = Date.now(), ops = [];
  const back = { role: "teacher", ca: true, active: true, ap: true, mustChange: false, bids: Array.isArray(from.bids) ? from.bids : [], pa: now };   // previous admin = co-admin
  if (!from.roll) {   // a teacher-style login ID, so the old admin can be listed, given a new password, and so on
    const year = new Date().getFullYear(), taken = await takenRolls();
    for (let i = 0; i < 30; i++) {
      const n = nextFree("teacher", year, taken), roll = rollOf("teacher", year, n), key = roll.toLowerCase();
      taken.add(key);
      if (await db.get("login/" + key)) continue;
      back.roll = roll;
      ops.push({ set: ["login/" + key, { es: [from.email || authEmail(roll)] }] });
      break;
    }
  }
  ops.push(
    { upd: ["users/" + toId, { role: "admin", ca: false, ta: now }] },
    { upd: ["users/" + S.pid, back] },
    { set: ["xfer/" + timeId(), { from: S.pid, fromName: from.name || "", fromEmail: from.email || "", to: toId, toName: to.name || "", toRoll: to.roll || "", wasCo: to.ca === true, t: now, d: T() }] },
    { set: ["nt/" + timeId(), { to: toId, t: t("You are now the admin of {n}. Reload the app to see the admin menu.", { n: (S.INST && S.INST.name) || "Rise Edge Academy" }), d: now }] },
  );
  await db.batch(ops);
  const [a, b] = await Promise.all([db.get("users/" + toId), db.get("users/" + S.pid)]);   // make sure somebody is admin
  if (!a || a.role !== "admin" || !b || b.role !== "teacher" || b.ca !== true) throw new Error(t("The transfer could not be confirmed. Open the Admin transfer page and check the history."));
  return { toName: to.name || "", wasCo: to.ca === true };
}

// Deleting a person: the profile, the login and everything that belongs to the person. The roll number is free again afterwards (see nextFree),
// and whoever gets it next starts with nothing. The profile and login go first (that is what must happen); the rest is cleaned up one
// collection at a time, so a co-admin, who may not touch fees, still deletes the person and only the fee records stay behind.
export async function removeUser(u) {
  const ops = [{ del: "users/" + u.id }];
  if (u.roll) ops.push({ del: "login/" + String(u.roll).toLowerCase() });
  ops.push({ set: ["map/" + (u.cu || u.id), { sid: "_" }] });
  for (const sub of ["hist", "reports"]) {
    try { (await db.list("users/" + u.id + "/" + sub)).forEach((x) => ops.push({ del: "users/" + u.id + "/" + sub + "/" + x.id })); } catch (e) { /* ignore */ }
  }
  await db.batch(ops);
  await purgeUserData(u);
}
async function purgeUserData(u) {
  const id = u.id, bid = u.bid, roll = u.roll;
  const step = async (fn) => { try { await fn(); } catch (e) { /* not allowed or not there: go on with the rest */ } };
  const wipe = (col, field, val) => step(async () => {
    const L = await db.list(col, [field, "==", val]);
    if (L.length) await db.batch(L.map((x) => ({ del: col + "/" + x.id })));
    return L;
  });
  // records that point at the person
  await step(async () => { const R = await db.list("pr", ["sid", "==", id]); if (R.length) await db.batch([...R.map((x) => ({ del: "pi/" + x.id })), ...R.map((x) => ({ del: "pr/" + x.id }))]); });
  for (const [col, f] of [["pay", "sid"], ["sf", "sid"], ["rq", "sid"], ["pf", "sid"], ["nt", "to"], ["sal", "tid"]]) await wipe(col, f, id);
  await step(() => db.del("ms/" + id));
  if (roll) { await wipe("fp", "roll", roll); await wipe("reg", "roll", roll); }
  // marks, attendance and so on inside the documents of the class
  if (bid) {
    await step(async () => {
      for (const a of await db.list("att", ["bid", "==", bid])) {
        const A = (a.A || []).filter((x) => x !== id), E = (a.E || []).filter((x) => x !== id);
        if (A.length !== (a.A || []).length || E.length !== (a.E || []).length) await db.upd("att/" + a.id, { A, E });
      }
    });
    await step(async () => {
      for (const e of await db.list("exams", ["bid", "==", bid])) {
        let hit = false;
        const subs = (e.subs || []).map((x) => { const y = { ...x }; if (y.m && id in y.m) { y.m = { ...y.m }; delete y.m[id]; hit = true; } if (y.dm && id in y.dm) { y.dm = { ...y.dm }; delete y.dm[id]; hit = true; } return y; });
        if (hit) await db.upd("exams/" + e.id, { subs });
      }
    });
    await step(async () => {
      for (const a of await db.list("pa", ["bid", "==", bid])) if (a.m && id in a.m) { const m = { ...a.m }; delete m[id]; await db.upd("pa/" + a.id, { m }); }
    });
    await step(async () => {
      for (const r of await db.list("rep", ["bid", "==", bid])) if (r.c && id in r.c) { const c = { ...r.c }; delete c[id]; await db.upd("rep/" + r.id, { c }); }
    });
    await step(async () => {   // the monthly top students poster
      for (const y of await db.list("yr", ["bid", "==", bid])) { const top = (y.top || []).filter((x) => x.id !== id); if (top.length !== (y.top || []).length) await db.upd("yr/" + y.id, { top }); }
    });
    await step(async () => {
      const b = await db.get("bstat/" + bid);
      if (b && b.rows && id in b.rows) { const rows = { ...b.rows }; delete rows[id]; await db.set("bstat/" + bid, { ...b, rows, n: Object.keys(rows).length }); }
    });
    if (roll) await step(async () => {
      for (const r of await db.list("records", ["bid", "==", bid])) {
        const rows = (r.rows || []).filter((x) => x.roll !== roll);
        if (rows.length !== (r.rows || []).length) await db.upd("records/" + r.id, { rows });
      }
    });
    dropBatchCache(bid);
  }
}

// ---------- institute settings + mail ----------
export async function saveInst(patch) {
  S.INST = { ...S.INST, ...patch };
  await db.set("config/inst", S.INST);
}
export const defaultFee = () => (+S.INST.fee > 0 ? +S.INST.fee : DEFAULT_FEE);

export async function mailCfg() {
  try { return (await db.get("config/mail")) || {}; } catch (e) { return {}; }
}
// EmailJS (free): sends one mail through the academy's template 2 (subject + message). Returns "" or an error text.
export async function sendMail(to, name, subject, message) {
  const m = await mailCfg();
  if (!m.pk || !m.sid || !m.t2) return "Email is not set up (Settings > Email).";
  if (!to) return "No email address.";
  try {
    const p = { to_email: to, to_name: name, subject, message, site: location.origin + location.pathname };
    const x = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ service_id: m.sid, template_id: m.t2, user_id: m.pk, template_params: p }),
    });
    return x.ok ? "" : "Email service said: " + (await x.text());
  } catch (e) { return "Network error"; }
}

// ---------- files (stored in small pieces inside Firestore: no paid storage needed) ----------
const RAW = 600000;
const b64 = (blob) => new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(r.result.slice(r.result.indexOf(",") + 1)); r.onerror = () => no(r.error); r.readAsDataURL(blob); });
export const MAX_FILE = 12 * 1024 * 1024;
export async function putFile(bid, kind, title, blob, name, progress) {
  const id = db.newId("fl"), n = Math.max(1, Math.ceil(blob.size / RAW)), done = [];
  try {
    for (let i = 0; i < n; i++) {
      const k = i ? id + "_" + i : id;
      await db.set("fd/" + k, { bid, data: await b64(blob.slice(i * RAW, (i + 1) * RAW)) });
      done.push(k);
      if (progress) progress(i + 1, n);
    }
    await db.set("fl/" + id, { bid, kind, title, link: "", name: name || blob.name || "file", type: blob.type || "application/octet-stream", t: Date.now(), n, size: blob.size });
    return id;
  } catch (e) {
    for (const k of done) await db.del("fd/" + k).catch(() => {});
    throw e;
  }
}
export async function delFile(id) {
  let n = 1;
  try { n = ((await db.get("fl/" + id)) || {}).n || 1; } catch (e) { /* ignore */ }
  for (let i = 0; i < n; i++) await db.del("fd/" + (i ? id + "_" + i : id)).catch(() => {});
  await db.del("fl/" + id).catch(() => {});
}
export async function downloadFile(id, progress) {
  const m = await db.get("fl/" + id);
  if (!m) throw new Error("File not found");
  if (m.link) { if (/^https?:\/\//i.test(m.link)) window.open(m.link, "_blank", "noopener"); return; }
  const parts = [], n = m.n || 1;
  for (let i = 0; i < n; i++) {
    if (progress) progress(i + 1, n);
    const c = await db.get("fd/" + (i ? id + "_" + i : id));
    if (!c) throw new Error("File data is missing");
    const s = atob(c.data), y = new Uint8Array(s.length);
    for (let j = 0; j < s.length; j++) y[j] = s.charCodeAt(j);
    parts.push(y);
  }
  const url = URL.createObjectURL(new Blob(parts, { type: m.type || "application/octet-stream" }));
  const a = document.createElement("a");
  a.href = url; a.download = m.name || "file";
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

// shrink a photo to a small square JPEG data URL (stored inside the profile)
export function squarePhoto(file, size = 160) {
  return new Promise((ok, no) => {
    const im = new Image();
    im.onload = () => {
      const c = document.createElement("canvas"), m = Math.min(im.width, im.height);
      c.width = c.height = size;
      c.getContext("2d").drawImage(im, (im.width - m) / 2, (im.height - m) / 2, m, m, 0, 0, size, size);
      ok(c.toDataURL("image/jpeg", 0.8));
    };
    im.onerror = () => no(new Error("Could not read this image"));
    im.src = URL.createObjectURL(file);
  });
}
// shrink a screenshot until it fits in a Firestore document
export function shrinkImage(file, limit = 600000) {
  return new Promise((ok, no) => {
    const im = new Image();
    im.onload = () => {
      let d = "";
      for (const [z, q] of [[1400, 0.7], [1100, 0.55], [800, 0.5]]) {
        const r = Math.min(1, z / Math.max(im.width, im.height)), c = document.createElement("canvas");
        c.width = Math.round(im.width * r); c.height = Math.round(im.height * r);
        c.getContext("2d").drawImage(im, 0, 0, c.width, c.height);
        d = c.toDataURL("image/jpeg", q);
        if (d.length < limit) break;
      }
      d.length >= limit + 100000 ? no(new Error("The image is too big. Please choose another one.")) : ok(d);
    };
    im.onerror = () => no(new Error("Could not read this image"));
    im.src = URL.createObjectURL(file);
  });
}
export { sleep, lk, num };
