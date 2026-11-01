// Attendance, homework, class routine and guardian results (SMS / WhatsApp / email to guardians).
import { db } from "./lib-db.js";
import {
  S, esc, t, page, act, onInput, onChange, onSubmit, formData, pageState, refresh, isStaff, isAdmin, isStudent, instName, T, fmtDate,
  smsHref, waHref, addBN, activeStudents, curBatch, f1, n2, batchOf,
} from "./lib-core.js";
import { icon, avatar, tag, empty, notice, card, row, btn, chips, input, select, textarea, batchPicker, ring, ask, form, toast, modal } from "./lib-ui.js";
import { batchData, dropBatchCache, recalcBatch, getStats, notify, logAct, sendMail, downloadFile, delFile } from "./lib-svc.js";

const noBatch = () => empty(S.me && S.me.role === "student" ? t("You are not in a batch yet.") : t("Add a batch first."), "layers");
const gwho = (s) => t("Guardian of {n}", { n: s.name });

// ---------- messages to guardians ----------
const absMsg = (s, d) => t("{inst}: Dear Guardian, {name} (Roll {roll}) was absent from {batch} on {d}.", { inst: instName(), name: s.name, roll: s.roll, batch: (S.B.find((b) => b.id === s.bid) || {}).name || t("class"), d });
function guardianBtns(s, text, mailAct, mailSubject) {
  const p = s.gphone;
  return `${p ? `<a class="btn btn--sm" href="${esc(smsHref(p, text))}">${icon("sms")}SMS</a><a class="btn btn--sm" target="_blank" rel="noopener" href="${esc(waHref(p, text))}">${icon("phone")}WhatsApp</a>` : `<span class="mut sm">${esc(t("No guardian phone."))}</span>`}${s.gem ? btn(t("Email"), mailAct, { arg: s.id, sm: true, ic: "mail" }) : ""}`;
}
const absRows = (list, d) => list.map((s) => `<div class="item" style="flex-wrap:wrap">${avatar(s, 36)}<div class="item-b"><b class="item-t">${esc(s.name)}</b><span class="mut">${esc(t("Roll {r}", { r: s.roll }))}</span></div><div class="item-a" style="flex-basis:100%;justify-content:flex-start">${guardianBtns(s, absMsg(s, d), "att-mail")}</div></div>`).join("");

// ---------- attendance ----------
const A = () => pageState("att");
const isLeave = (s, d) => (s.lv || []).includes(d);
page("attendance", async () => {
  if (!S.bid) return noBatch();
  if (isStudent()) return studentAttendance();
  const st = A(), d = st.date || (st.date = T()), k = S.bid + "_" + d;
  const L = activeStudents();
  if (st.k !== k) {
    const x = await db.get("att/" + k).catch(() => null);
    st.k = k; st.saved = !!x; st.m = {};
    L.forEach((s) => { st.m[s.id] = x && (x.A || []).includes(s.id) ? "A" : x && (x.E || []).includes(s.id) ? "E" : !x && isLeave(s, d) ? "E" : "P"; });
  }
  L.forEach((s) => { if (!st.m[s.id]) st.m[s.id] = "P"; });
  const cnt = (c) => L.filter((s) => st.m[s.id] === c).length;
  const abs = L.filter((s) => st.m[s.id] === "A");
  return `${batchPicker()}
  <div class="card stack-s"><div class="inline">${input("date", { type: "date", value: d, "data-change": "att-date" })}${btn(t("All present"), "att-all", { ic: "check" })}</div>
    <div class="row">${st.saved ? tag(t("Class day saved"), "ok") : tag(t("Not saved: not counted as a class day"), "warn")}<span class="mut sm" id="att-cnt">${attCount(cnt("P"), cnt("A"), cnt("E"))}</span></div></div>
  <div class="card mt">${L.length ? L.map((s) => `<div class="omr"><div class="omr-n"><b>${esc(s.name)}</b><span class="mut sm">${esc(s.roll || "")}${isLeave(s, d) ? " · " + esc(t("on leave")) : ""}</span></div><div class="bubbles" data-sid="${esc(s.id)}">${["P", "A", "E"].map((c) => `<button type="button" class="bub ${c.toLowerCase()}" data-act="att-set" data-arg="${esc(s.id)}|${c}" aria-pressed="${st.m[s.id] === c}" aria-label="${esc({ P: t("Present"), A: t("Absent"), E: t("Excused") }[c])}" data-free="1">${c}</button>`).join("")}</div></div>`).join("") : empty(t("No students in this batch."), "users")}
    ${L.length ? `<div class="mt">${btn(t("Save class day"), "att-save", { kind: "pri", ic: "check", extra: 'style="width:100%"' })}</div>` : ""}
    <p class="mut sm mt">${esc(t("P = Present, A = Absent, E = Excused (leave)."))}</p></div>
  ${st.saved && abs.length ? `<div class="mt">${card(t("Absent alert to guardians"), `<div class="list">${absRows(abs, d)}</div>`)}</div>` : ""}
  ${st.saved && isStaff() ? `<div class="mt tc">${btn(t("Delete this class day"), "att-del", { sm: true, kind: "bad", ic: "trash" })}</div>` : ""}`;
}, { title: "Attendance" });
const attCount = (p, a, e) => `${t("Present")} ${p} · ${t("Absent")} ${a} · ${t("Excused")} ${e}`;
onChange("att-date", (el) => { const st = A(); if (el.value) { st.date = el.value; st.k = ""; refresh(); } });
act("att-all", () => { const st = A(); Object.keys(st.m).forEach((k) => (st.m[k] = "P")); refresh(); });
act("att-set", (el) => {
  const [id, c] = el.dataset.arg.split("|"), st = A();
  st.m[id] = c;
  el.parentElement.querySelectorAll(".bub").forEach((b) => b.setAttribute("aria-pressed", b === el ? "true" : "false"));
  const L = activeStudents(), n = (x) => L.filter((s) => st.m[s.id] === x).length, e = document.getElementById("att-cnt");
  if (e) e.textContent = attCount(n("P"), n("A"), n("E"));
});
act("att-save", async () => {
  const st = A(), m = st.m, ids = (c) => Object.keys(m).filter((k) => m[k] === c);
  await db.set("att/" + st.k, { bid: S.bid, date: st.date, A: ids("A"), E: ids("E") });
  await recalcBatch(S.bid);
  logAct("Saved attendance of " + st.date);
  st.saved = true;
  toast(t("Saved"), "ok");
  refresh();
});
act("att-del", async () => {
  const st = A();
  if (!(await ask(t("Delete the saved attendance of {d}?", { d: fmtDate(st.date) }), { danger: true, ok: t("Delete") }))) return;
  await db.del("att/" + st.k);
  await recalcBatch(S.bid);
  logAct("Deleted attendance of " + st.date);
  st.k = "";
  refresh();
});
act("att-mail", async (el) => {
  const s = S.U.find((x) => x.id === el.dataset.arg);
  if (!s || !s.gem) return;
  const r = await sendMail(s.gem, gwho(s), t("Absent: {n}", { n: s.name }), absMsg(s, A().date || T()));
  toast(r || t("Email sent"), r ? "bad" : "ok");
});

async function studentAttendance() {
  const b = curBatch(), r = ((await getStats(S.bid)).rows || {})[S.pid];
  if (!r || !(r.p + r.a)) return card(t("My attendance"), empty(t("No class day has been recorded this month yet."), "calendar"));
  const tot = r.p + r.a;
  return `${card(t("My attendance"), `<div class="rings">${ring((r.p / tot) * 100, t("Attendance"), "var(--ok)")}</div>
    <div class="grid g3 mt"><div class="stat" style="--c:var(--ok)"><span class="stat-top">${icon("check")}${esc(t("Present"))}</span><span class="stat-v">${r.p}</span></div><div class="stat" style="--c:var(--bad)"><span class="stat-top">${icon("x")}${esc(t("Absent"))}</span><span class="stat-v">${r.a}</span></div><div class="stat"><span class="stat-top">${icon("calendar")}${esc(t("Class days"))}</span><span class="stat-v">${tot}</span></div></div>
    <p class="mut sm mt">${esc(t("Counted from {d}.", { d: fmtDate((b || {}).start) }))}</p>`)}`;
}

// today's absent students for the staff dashboard
export async function absentToday() {
  if (!S.me || S.me.role === "student" || !S.B.length) return "";
  const d = T();
  const docs = await Promise.all(S.B.map((b) => db.get("att/" + b.id + "_" + d).catch(() => null)));
  const ab = [];
  docs.forEach((x) => { if (x) (x.A || []).forEach((id) => { const s = S.U.find((u) => u.id === id); if (s) ab.push(s); }); });
  if (!ab.length) return "";
  return card(t("Absent today") + ` (${ab.length})`, `<div class="list">${absRows(ab, d)}</div>`);
}

// ---------- homework ----------
const H = () => pageState("hw");
page("homework", async () => {
  if (!S.bid) return noBatch();
  const L = (isStudent() ? await db.list("hw", ["bid", "==", S.bid]) : (await batchData(S.bid)).hw).slice().sort((a, b) => (b.date > a.date ? 1 : b.date < a.date ? -1 : 0));
  if (isStudent()) {
    return L.length ? `<div class="card"><div class="list">${L.map((h) => { const dn = (h.D || []).includes(S.pid); return row({ title: h.title, sub: fmtDate(h.date), right: `${h.fid ? btn(t("File"), "hw-file", { arg: h.fid, sm: true, ic: "download" }) : ""}${tag(dn ? t("Done") : t("Not done"), dn ? "ok" : "bad")}` }); }).join("")}</div></div>` : empty(t("No homework yet."), "book");
  }
  const st = H(), cur = L.find((h) => h.id === st.id);
  const stu = activeStudents();
  if (cur && st.hid !== cur.id) { st.hid = cur.id; st.D = [...(cur.D || [])]; }
  return `${batchPicker()}
  <form class="card stack-s" data-submit="hw-add"><h3>${esc(t("New homework"))}</h3>${input("title", { placeholder: t("Homework"), label: t("Homework") })}${input("date", { type: "date", value: T(), label: t("Date") })}<button class="btn btn--pri" type="submit">${icon("plus")}${esc(t("Add homework"))}</button></form>
  <div class="card mt">${L.length ? `<div class="list">${L.map((h) => row({ title: h.title, sub: fmtDate(h.date) + " · " + t("{n} done", { n: (h.D || []).length }) + "/" + stu.length, right: icon(h.id === st.id ? "down" : "right"), act: "hw-open", arg: h.id })).join("")}</div>` : empty(t("No homework yet."), "book")}</div>
  ${cur ? `<div class="card mt"><div class="card-h"><h3>${esc(cur.title)}</h3>${btn(t("All done"), "hw-all", { sm: true })}</div>
    ${stu.map((s) => `<div class="omr"><div class="omr-n"><b>${esc(s.name)}</b><span class="mut sm">${esc(s.roll || "")}</span></div><button class="sw" data-act="hw-tog" data-arg="${esc(s.id)}" aria-pressed="${st.D.includes(s.id)}" data-free="1" aria-label="${esc(t("Done"))}"></button></div>`).join("")}
    <div class="row mt">${btn(t("Save"), "hw-save", { kind: "pri", ic: "check" })}${cur.fid ? btn(t("File"), "hw-file", { arg: cur.fid, ic: "download" }) : ""}${isStaff() ? btn(t("Delete"), "hw-del", { arg: cur.id, kind: "bad", ic: "trash" }) : ""}</div></div>` : ""}`;
}, { title: "Homework" });
onSubmit("hw-add", async (el) => {
  const f = formData(el.closest("form"));
  if (!f.title.trim()) return toast(t("Write the homework"), "bad");
  const id = await db.add("hw", { bid: S.bid, title: f.title.trim(), date: f.date || T(), D: [] });
  dropBatchCache(S.bid);
  notify("batch", t("New homework: {n}", { n: f.title.trim() }), S.bid);
  H().id = id;
  refresh();
});
act("hw-open", (el) => { const st = H(); st.id = st.id === el.dataset.arg ? "" : el.dataset.arg; st.hid = ""; refresh(); });
act("hw-tog", (el) => {
  const st = H(), id = el.dataset.arg, i = st.D.indexOf(id);
  i < 0 ? st.D.push(id) : st.D.splice(i, 1);
  el.setAttribute("aria-pressed", String(i < 0));
});
act("hw-all", () => { const st = H(); st.D = activeStudents().map((s) => s.id); refresh(); });
act("hw-save", async () => {
  const st = H(), h = (await batchData(S.bid)).hw.find((x) => x.id === st.id);
  if (!h) return;
  const { id, ...x } = h;
  await db.set("hw/" + id, { ...x, D: st.D });
  await recalcBatch(S.bid);
  toast(t("Saved"), "ok");
  st.hid = ""; refresh();
});
act("hw-del", async (el) => {
  const h = (await batchData(S.bid)).hw.find((x) => x.id === el.dataset.arg);
  if (!(await ask(t("Delete this homework?"), { danger: true, ok: t("Delete") }))) return;
  if (h && h.fid) await delFile(h.fid).catch(() => {});
  await db.del("hw/" + el.dataset.arg);
  await recalcBatch(S.bid);
  logAct("Deleted homework");
  H().id = ""; H().hid = ""; refresh();
});
act("hw-file", async (el) => { toast(t("Downloading…")); await downloadFile(el.dataset.arg); });

// ---------- routine ----------
const DY = ["Sat", "Sun", "Mon", "Tue", "Wed", "Thu", "Fri"], JD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DYBN = { Sat: "শনি", Sun: "রবি", Mon: "সোম", Tue: "মঙ্গল", Wed: "বুধ", Thu: "বৃহঃ", Fri: "শুক্র" };
const dayName = (d) => (S.lang === "bn" ? DYBN[d] || d : d);
const t12 = (x) => { if (!x) return ""; const [h, m] = x.split(":").map(Number); return (h % 12 || 12) + ":" + String(m).padStart(2, "0") + " " + (h < 12 ? "AM" : "PM"); };
async function rtGet(bid) { try { const d = await db.get("rt/" + bid); return (d && d.rows) || []; } catch (e) { return []; } }
const rtSort = (L) => [...L].sort((x, y) => DY.indexOf(x.d) - DY.indexOf(y.d) || (x.a || "").localeCompare(y.a || ""));
const rtRow = (x, del) => row({ title: `${t12(x.a)}${x.e ? " – " + t12(x.e) : ""} · ${x.s}`, sub: esc([x.n, x.r].filter(Boolean).join(" · ")), right: del ? btn(t("Delete"), "rt-del", { arg: x.id, sm: true, kind: "bad" }) : "" });
const rtList = (L, del) => DY.map((d) => { const r = L.filter((x) => x.d === d); return r.length ? `<div class="mb"><b class="gold" style="color:var(--blue)">${esc(dayName(d))}</b><div class="list">${r.map((x) => rtRow(x, del)).join("")}</div></div>` : ""; }).join("") || empty(t("No routine yet."), "clock");
page("routine", async () => {
  if (!S.bid) return noBatch();
  const L = rtSort(await rtGet(S.bid)), ed = isStaff();
  const tl = S.TC.filter((x) => (x.bids || []).includes(S.bid) && x.active !== false);
  return `${batchPicker()}${ed ? `<form class="card stack-s mb" data-submit="rt-add"><h3>${esc(t("Add class"))}</h3>
    <div class="grid g2">${select("d", DY.map((d) => [d, dayName(d)]), "Sat", { label: t("Day") })}${input("s", { label: t("Subject") })}${input("a", { type: "time", value: "16:00", label: t("Start") })}${input("e", { type: "time", value: "17:00", label: t("End") })}
    ${select("n", [["", t("Teacher (optional)")], ...tl.map((x) => [x.name, x.name])], "", { label: t("Teacher") })}${input("r", { label: t("Room (optional)") })}</div>
    <button class="btn btn--pri" type="submit">${icon("plus")}${esc(t("Add class"))}</button></form>` : ""}
    ${card(t("Class routine"), rtList(L, ed))}`;
}, { title: "Routine" });
onSubmit("rt-add", async (el) => {
  const f = formData(el.closest("form"));
  if (!f.s.trim()) return toast(t("Write the subject"), "bad");
  if (!f.a) return toast(t("Choose the start time"), "bad");
  if (f.e && f.e <= f.a) return toast(t("End time must be after the start time"), "bad");
  const L = await rtGet(S.bid);
  L.push({ id: "r" + Date.now().toString(36), d: f.d, a: f.a, e: f.e, s: f.s.trim(), n: f.n, r: f.r.trim() });
  await db.set("rt/" + S.bid, { bid: S.bid, rows: L });
  logAct("Added a class to the routine");
  refresh();
});
act("rt-del", async (el) => {
  if (!(await ask(t("Delete this class from the routine?"), { danger: true, ok: t("Delete") }))) return;
  await db.set("rt/" + S.bid, { bid: S.bid, rows: (await rtGet(S.bid)).filter((x) => x.id !== el.dataset.arg) });
  logAct("Removed a class from the routine");
  refresh();
});
// today's classes (student dashboard)
export async function todayClasses() {
  const bid = S.me && S.me.role === "student" ? S.me.bid : S.bid;
  if (!bid) return "";
  const td = JD[new Date().getDay()], L = rtSort((await rtGet(bid)).filter((x) => x.d === td));
  return card(t("Today's classes") + ` (${dayName(td)})`, L.length ? `<div class="list">${L.map((x) => rtRow(x, false)).join("")}</div>` : `<p class="mut">${esc(t("No class today."))}</p>`);
}

// ---------- guardian results ----------
function gRows(e) {
  const held = (e.subs || []).filter((u) => u.st === "H");
  const R = activeStudents().map((s) => {
    let g = 0, tt = 0;
    const pt = held.map((u) => { const m = +((u.m || {})[s.id] || 0); g += m; tt += u.total; return u.n + " " + m + "/" + u.total; });
    return { s, g: n2(g), tt: n2(tt), pt };
  });
  const vs = [...new Set(R.filter((r) => r.tt).map((r) => r.g))].sort((a, b) => b - a);
  R.forEach((r) => {
    r.rk = r.tt ? vs.indexOf(r.g) + 1 : 0;
    r.txt = `${instName()}: ${r.s.name} (${t("Roll {r}", { r: r.s.roll })}) - ${e.title}: ${r.pt.join(", ") || t("no subject held")}. ${t("Total")} ${r.g}/${r.tt}${r.tt ? " (" + Math.round((r.g / r.tt) * 100) + "%)" : ""}${r.rk ? ", " + t("Rank") + " #" + r.rk : ""}.`;
  });
  return R;
}
let GR = [];
// one line per student: photo with nickname and roll below on the left, small send buttons on the right
function guardRow(r, i) {
  const s = r.s, text = t("Dear Guardian, ") + r.txt, p = s.gphone;
  const b = (href, ic, label, ext = "") => `<a class="btn btn--xs" ${ext} href="${esc(href)}">${icon(ic)}${label}</a>`;
  return `<div class="gr">
    <div class="gr-id"><button type="button" class="gr-pic" data-act="gr-info" data-arg="${i}" aria-label="${esc(s.name)}">${avatar(s, 52)}</button><b>${esc(s.nick || s.name)}</b><span class="mut">${esc(s.roll || "")}</span>${r.tt ? `<span class="mut gr-m">${esc(r.g + "/" + r.tt + (r.rk ? " · #" + r.rk : ""))}</span>` : ""}</div>
    <div class="gr-a">${p ? b(waHref(p, text), "phone", "WhatsApp", 'target="_blank" rel="noopener"') + b(smsHref(p, text), "sms", "SMS") : `<span class="mut sm">${esc(t("No guardian phone."))}</span>`}${s.gem ? btn(t("Email"), "gr-one", { arg: i, ic: "mail", xs: true }) : ""}</div>
  </div>`;
}
page("guardian", async () => {
  if (!S.bid) return noBatch();
  const st = pageState("gr");
  const E = (await db.list("exams", ["bid", "==", S.bid])).filter((e) => e.pub !== false).sort((a, b) => (b.date > a.date ? 1 : -1));
  const e = E.find((x) => x.id === st.eid) || E[0];
  if (!e) return `${batchPicker()}${empty(t("No published exam yet. Publish an exam result first."), "clip")}`;
  st.eid = e.id; st.exam = e;
  GR = gRows(e);
  return `${batchPicker()}<div class="mb">${select("eid", E.map((x) => [x.id, x.title + " · " + x.date]), e.id, { "data-change": "gr-pick" })}</div>
  ${card(t("Send result to guardians"), `<p class="mut">${esc(t("Tap SMS or WhatsApp for each guardian (free, uses your own phone). Email works when a guardian email is saved."))}</p>${btn(t("Email all guardians"), "gr-all", { kind: "pri", ic: "mail" })}`)}
  <div class="card mt"><div class="list">${GR.map(guardRow).join("")}</div></div>`;
}, { title: "Guardian results" });
// tap the photo: the student's details (read only)
act("gr-info", (el) => {
  const r = GR[+el.dataset.arg];
  if (!r) return;
  const s = r.s, kv = (k, v) => (v ? `<div class="item"><div class="item-b"><span class="mut">${esc(k)}</span><b>${esc(v)}</b></div></div>` : "");
  const cls = s.cls ? t("Class {n}", { n: s.cls }) + (s.grp ? " · " + t(s.grp) : "") : "";
  const m = modal(`<div class="row-nw">${avatar(s, 56)}<div class="sp"><h3 style="margin:0">${esc(s.name)}</h3><span class="mut">${esc(s.roll || "")}</span></div></div>
    <div class="list mt">${kv(t("Nickname"), s.nick)}${kv(t("Class"), cls)}${kv(t("Batch"), (batchOf(s.bid) || {}).name)}${kv(t("School / college"), s.school)}${kv(t("Phone"), s.phone)}${kv(t("Guardian name"), s.gname)}${kv(t("Guardian's phone"), s.gphone)}${kv(t("Guardian's email"), s.gem)}${kv(t("Blood group"), s.bg)}${kv(t("Address"), s.addr)}${r.tt ? kv(t("Total"), `${r.g}/${r.tt}${r.rk ? " · " + t("Rank") + " #" + r.rk : ""}`) : ""}</div>
    <div class="mod-f"><button class="btn" data-x>${esc(t("Close"))}</button></div>`);
  m.body.addEventListener("click", (e) => { if (e.target.closest("[data-x]")) m.close(); });
});
onChange("gr-pick", (el) => { pageState("gr").eid = el.value; refresh(); });
const sendOne = (r, e) => sendMail(r.s.gem, gwho(r.s), t("Result: {e} - {n}", { e: e.title, n: r.s.name }), t("Dear Guardian, ") + r.txt);
act("gr-one", async (el) => {
  const r = GR[+el.dataset.arg];
  if (!r || !r.s.gem) return toast(t("No guardian email saved."), "bad");
  const x = await sendOne(r, pageState("gr").exam);
  toast(x || t("Email sent"), x ? "bad" : "ok");
});
act("gr-all", async () => {
  const e = pageState("gr").exam, R = GR.filter((r) => r.s.gem);
  if (!R.length) return toast(t("No guardian email is saved yet."), "bad");
  let ok = 0, er = "";
  for (const r of R) { const x = await sendOne(r, e); x ? (er = x) : ok++; await new Promise((o) => setTimeout(o, 700)); }
  toast(t("Emails sent: {a} / {b}", { a: ok, b: R.length }) + (er ? " · " + er : ""), er ? "bad" : "ok");
});

addBN({
  "You are not in a batch yet.": "আপনি এখনো কোনো ব্যাচে নেই।", "{inst}: Dear Guardian, {name} (Roll {roll}) was absent from {batch} on {d}.": "{inst}: প্রিয় অভিভাবক, {name} (রোল {roll}) {d} তারিখে {batch} এ অনুপস্থিত ছিল।",
  "class": "ক্লাস", "Guardian of {n}": "{n} এর অভিভাবক", "No guardian phone.": "অভিভাবকের ফোন নেই।", "Roll {r}": "রোল {r}", "on leave": "ছুটিতে", "All present": "সবাই উপস্থিত", "Class day saved": "ক্লাসের দিন সংরক্ষিত হয়েছে",
  "Not saved: not counted as a class day": "সংরক্ষিত নয়: ক্লাস দিন হিসেবে গণ্য হবে না", "Present": "উপস্থিত", "Absent": "অনুপস্থিত", "Excused": "ছুটি", "No students in this batch.": "এই ব্যাচে কোনো ছাত্র নেই।", "Save class day": "ক্লাসের দিন সংরক্ষণ করুন",
  "P = Present, A = Absent, E = Excused (leave).": "P = উপস্থিত, A = অনুপস্থিত, E = ছুটি।", "Absent alert to guardians": "অভিভাবককে অনুপস্থিতির বার্তা", "Delete this class day": "এই ক্লাস দিন মুছুন", "Saved": "সংরক্ষিত",
  "Delete the saved attendance of {d}?": "{d} এর সংরক্ষিত উপস্থিতি মুছবেন?", "Absent: {n}": "অনুপস্থিত: {n}", "Email sent": "ইমেইল পাঠানো হয়েছে", "My attendance": "আমার উপস্থিতি", "Attendance": "উপস্থিতি",
  "No class day has been recorded this month yet.": "এই মাসে এখনো কোনো ক্লাস দিন রেকর্ড হয়নি।", "Class days": "ক্লাস দিন", "Counted from {d}.": "{d} থেকে গণনা।", "Absent today": "আজ অনুপস্থিত",
  "No homework yet.": "এখনো কোনো হোমওয়ার্ক নেই।", "Done": "সম্পন্ন", "Not done": "সম্পন্ন নয়", "File": "ফাইল", "New homework": "নতুন হোমওয়ার্ক", "Homework": "হোমওয়ার্ক", "Date": "তারিখ", "Add homework": "হোমওয়ার্ক যোগ করুন",
  "{n} done": "{n} জন করেছে", "All done": "সবাই করেছে", "Write the homework": "হোমওয়ার্ক লিখুন", "New homework: {n}": "নতুন হোমওয়ার্ক: {n}", "Delete this homework?": "এই হোমওয়ার্ক মুছবেন?", "Downloading…": "ডাউনলোড হচ্ছে…",
  "Add class": "ক্লাস যোগ করুন", "Day": "দিন", "Subject": "বিষয়", "Start": "শুরু", "End": "শেষ", "Teacher": "শিক্ষক", "Teacher (optional)": "শিক্ষক (ঐচ্ছিক)", "Room (optional)": "রুম (ঐচ্ছিক)", "Class routine": "ক্লাস রুটিন",
  "Write the subject": "বিষয় লিখুন", "Choose the start time": "শুরুর সময় বেছে নিন", "End time must be after the start time": "শেষের সময় শুরুর পরে হতে হবে", "Delete this class from the routine?": "রুটিন থেকে এই ক্লাস মুছবেন?",
  "No routine yet.": "এখনো কোনো রুটিন নেই।", "Today's classes": "আজকের ক্লাস", "No class today.": "আজ কোনো ক্লাস নেই।", "no subject held": "কোনো বিষয়ের পরীক্ষা হয়নি", "Total": "মোট", "Rank": "র‍্যাঙ্ক",
  "No published exam yet. Publish an exam result first.": "এখনো কোনো প্রকাশিত পরীক্ষা নেই। আগে পরীক্ষার ফল প্রকাশ করুন।", "Send result to guardians": "অভিভাবকদের ফল পাঠান", "Tap SMS or WhatsApp for each guardian (free, uses your own phone). Email works when a guardian email is saved.": "প্রতিটি অভিভাবকের জন্য SMS বা WhatsApp চাপুন (বিনামূল্যে, আপনার নিজের ফোন দিয়ে)। অভিভাবকের ইমেইল সেভ থাকলে ইমেইলও যাবে।",
  "Email all guardians": "সব অভিভাবককে ইমেইল", "Dear Guardian, ": "প্রিয় অভিভাবক, ", "Result: {e} - {n}": "ফলাফল: {e} - {n}", "No guardian email saved.": "অভিভাবকের ইমেইল সেভ নেই।", "No guardian email is saved yet.": "এখনো কোনো অভিভাবকের ইমেইল সেভ নেই।",
  "Emails sent: {a} / {b}": "ইমেইল পাঠানো হয়েছে: {a} / {b}", "Email": "ইমেইল", "Save": "সংরক্ষণ", "Delete": "মুছুন",
});
