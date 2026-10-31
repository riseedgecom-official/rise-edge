// Data services: loading the app's data, accounts, notifications, files, mail.
// Pages call these instead of touching the database directly for anything shared.
import { db, withNewAccount, isEmailInUse, authEmail } from "./lib-db.js";
import { S, T, lk, cmp, num, sleep } from "./lib-core.js";
import { calcBatch, statRow, rollOf, rollPrefix, counterKey, defaultBatches, findBatch, DEFAULT_FEE } from "./lib-stats.js";

export const active = (u) => u.active !== false && u.ap !== false;
const byBatch = (a, b) => (+a.cls || 99) - (+b.cls || 99) || cmp(a.grp, b.grp) || cmp(a.name, b.name);

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

// Ready-made batches (Class 4-8, and Class 9-12 for each group). Created once by the admin.
export async function ensureDefaultBatches() {
  const have = S.B.length ? S.B : await db.list("batches");
  const ops = [];
  for (const d of defaultBatches()) {
    if (findBatch(have, d.cls, d.grp)) continue;
    const { id, ...x } = d;
    ops.push({ set: ["batches/" + id, { ...x, start: monthStart(), auto: true }] });
  }
  if (ops.length) { await db.batch(ops); await loadCore(); }
}
export const monthStart = () => T().slice(0, 8) + "01";

// ---------- notifications and activity log ----------
// to: "batch" (needs bid), "admin", or a person id
export const notify = (to, text, bid) => db.add("nt", { to, t: text, d: Date.now(), ...(bid ? { bid } : {}) }).catch(() => {});
export const logAct = (msg) => {
  if (!S.me || !S.me.co) return;
  const b = S.B.find((x) => x.id === S.bid);
  db.add("log", { uid: S.pid, by: S.me.name, msg: msg + (b ? " (" + b.name + ")" : ""), t: Date.now() }).catch(() => {});
};
export async function getNotices() {
  const me = S.me;
  let q;
  if (me.role === "student") q = await Promise.all([me.bid ? db.list("nt", ["to", "==", "batch"], ["bid", "==", me.bid]) : [], db.list("nt", ["to", "==", S.pid])]);
  else if (me.role === "teacher" && !me.co) q = await Promise.all([...(me.bids || []).map((b) => db.list("nt", ["to", "==", "batch"], ["bid", "==", b])), db.list("nt", ["to", "==", S.pid])]);
  else q = [await db.list("nt", ["to", "==", "admin"]), await db.list("nt", ["to", "==", S.pid])];
  return q.flat().sort((a, b) => b.d - a.d).slice(0, 40);
}
export const seenKey = () => "seen" + S.pid;
export const unseenCount = (list) => { let s = 0; try { s = +localStorage.getItem(seenKey()) || 0; } catch (e) { /* ignore */ } return list.filter((n) => n.d > s).length; };
export const markSeen = () => { try { localStorage.setItem(seenKey(), Date.now()); } catch (e) { /* ignore */ } };

// ---------- batch data + statistics ----------
const cache = {};
export async function batchData(bid, force = false) {
  if (!force && cache[bid]) return cache[bid];
  const [att, exams, hw] = await Promise.all([db.list("att", ["bid", "==", bid]), db.list("exams", ["bid", "==", bid]), db.list("hw", ["bid", "==", bid])]);
  return (cache[bid] = { att, exams, hw });
}
export const dropBatchCache = (bid) => { if (bid) delete cache[bid]; else for (const k of Object.keys(cache)) delete cache[k]; };

// Recalculate this month's numbers + ranks of a batch and store them in ONE document (bstat/<batch>)
// that the students read. Pages call this after saving attendance, marks, homework, or batch changes.
export async function recalcBatch(bid) {
  const b = S.B.find((x) => x.id === bid);
  if (!b) return [];
  dropBatchCache(bid);
  const d = await batchData(bid, true);
  const rows = calcBatch({ students: S.U.filter((s) => s.bid === bid && active(s)), ...d, from: b.start });
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
async function nextSerial(role, year) {
  const pre = rollPrefix(role, year), key = counterKey(role, year);
  let mx = 0;
  [...S.U, ...S.TC, ...S.PEND].forEach((x) => { const v = String(x.roll || ""); if (v.startsWith(pre)) mx = Math.max(mx, +v.slice(pre.length) || 0); });
  let c = 0;
  try { const d = await db.get("cn/" + key); c = (d && d.n) || 0; } catch (e) { /* ignore */ }
  return { n: Math.max(mx, c) + 1, key };
}
// Admin / co-admin adds a student or teacher. Returns {roll, pw, id}.
export async function createAccount(role, data) {
  const year = new Date().getFullYear(), pw = tempPassword();
  const q = await nextSerial(role, year);
  for (let i = 0; i < 30; i++) {
    const n = q.n + i, roll = rollOf(role, year, n), key = roll.toLowerCase(), email = authEmail(roll);
    if (await db.get("login/" + key)) continue;
    let uid;
    try { uid = await withNewAccount(email, pw, async (u) => u); } catch (e) { if (isEmailInUse(e)) continue; throw e; }
    await db.batch([
      { set: ["users/" + uid, { ...data, role, roll, active: true, ap: true, mustChange: true, createdAt: Date.now() }] },
      { set: ["login/" + key, { es: [email] }] },
      { set: ["cn/" + q.key, { n }] },
    ]);
    return { roll, pw, id: uid };
  }
  throw new Error("Could not create a roll number. Please try again.");
}

// Student / teacher registers himself. The account exists at once but ap=false until approved.
export async function selfRegister(d) {
  const st = d.role === "student", year = new Date().getFullYear(), pre = rollPrefix(d.role, year), key = counterKey(d.role, year);
  const open = await db.get("config/reg").catch(() => null);
  if (open && open.open === false) throw new Error("Registration is closed right now.");
  let c = 0;
  try { const x = await db.get("cn/" + key); c = (x && x.n) || 0; } catch (e) { /* ignore */ }
  let bid = "";
  if (st) { try { bid = (findBatch(await db.list("batches"), d.cls, d.grp) || {}).id || ""; } catch (e) { /* ignore */ } }
  const base = st
    ? { role: "student", name: d.name, nick: d.nick || "", gphone: d.gphone || "", gem: d.gem || "", bid, cls: d.cls, school: d.school || "", grp: d.grp || "", phone: d.phone, addr: d.addr || "", email: d.email }
    : { role: "teacher", name: d.name, nick: d.nick || "", subject: d.subject || "", cls: d.cls || "", phone: d.phone, addr: d.addr || "", email: d.email, bids: [] };
  let n = c;
  for (let i = 0; i < 40; i++) {
    n++;
    const roll = rollOf(d.role, year, n), lkKey = roll.toLowerCase(), email = authEmail(roll);
    if (await db.get("login/" + lkKey).catch(() => null)) continue;
    try {
      await withNewAccount(email, d.pw, async (uid, tdb) => {
        await tdb.set("users/" + uid, { ...base, roll, active: true, mustChange: false, ap: false });
        await tdb.set("login/" + lkKey, { es: [email] });
        await tdb.set("cn/" + key, { n }).catch(() => {});
        await tdb.add("reg", { role: d.role, name: d.name, phone: d.phone, email: d.email, roll, st: "auto", t: Date.now() }).catch(() => {});
      });
      return { roll, email, pw: d.pw };
    } catch (e) { if (isEmailInUse(e)) continue; throw e; }
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

export async function removeUser(u) {
  const ops = [{ del: "users/" + u.id }];
  if (u.roll) ops.push({ del: "login/" + String(u.roll).toLowerCase() });
  ops.push({ set: ["map/" + (u.cu || u.id), { sid: "_" }] });
  for (const sub of ["hist", "reports"]) {
    try { (await db.list("users/" + u.id + "/" + sub)).forEach((x) => ops.push({ del: "users/" + u.id + "/" + sub + "/" + x.id })); } catch (e) { /* ignore */ }
  }
  await db.batch(ops);
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
  if (m.link) { window.open(m.link, "_blank", "noopener"); return; }
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
