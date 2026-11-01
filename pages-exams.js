// Exams (create, marks, publish, result sheets), the dashboard "Exam ranks" box, and the syllabus.
import { db } from "./lib-db.js";
import {
  S, esc, t, page, act, onInput, onChange, onSubmit, formData, pageState, refresh, isStaff, isAdmin, isStudent, canPublish, instName, T, addDays, fmtDate,
  addBN, activeStudents, curBatch, f1, n2, batchOf, $, $$,
} from "./lib-core.js";
import { icon, avatar, tag, empty, notice, card, row, btn, chips, input, select, textarea, batchPicker, meter, ask, form, toast, showDoc } from "./lib-ui.js";
import { recalcBatch, notify, logAct, dropBatchCache } from "./lib-svc.js";
import { examRows, grade, subjectsFor } from "./lib-stats.js";

const noBatch = () => empty(isStudent() ? t("You are not in a batch yet.") : t("Add a batch first."), "layers");

// ---------- result sheet (printable) ----------
const gradeChip = (p) => { const g = grade(p); return `<span style="background:${g.bg};color:${g.fg};padding:3px 10px;border-radius:6px;font-weight:800">${g.g}</span>`; };
export function resultSheet(d) {
  const p = d.t ? (d.g / d.t) * 100 : null;
  const lb = (l, v) => `<div><div style="font-size:11px;color:#44547a">${esc(l)}</div><b>${esc(v)}</b></div>`;
  const TH = "text-align:left;padding:7px 9px;border-bottom:2px solid #9fb2d8;font-size:12px;color:#44547a";
  const TD = "padding:8px 9px;border-bottom:1px solid #cdd8ee";
  return `<div class="paper"><div style="display:flex;align-items:center;gap:12px;border-bottom:3px solid #f2b01e;padding-bottom:10px"><img src="logo.jpg" alt="" style="width:56px;height:56px;border-radius:50%"><div><div style="font-size:20px;font-weight:800;color:#0b3f99">${esc(instName())}</div><div style="font-size:12px;color:#44547a">${esc(t("Exam result sheet"))}</div></div></div>
  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-top:14px;border:1.5px solid #cdd8ee;border-radius:10px;padding:12px">${lb(t("Student"), d.name)}${lb(t("Roll"), d.roll)}${lb(t("Batch"), d.bn)}${lb(t("Exam"), d.title + " · " + d.date)}</div>
  <div style="overflow-x:auto;margin-top:14px"><table style="width:100%;border-collapse:collapse;border:1px solid #cdd8ee"><tr><th style="${TH}">${esc(t("Subject"))}</th><th style="${TH}">${esc(t("Marks"))}</th><th style="${TH}">${esc(t("Out of"))}</th><th style="${TH}">%</th></tr>
  ${(d.subs || []).map((x) => `<tr><td style="${TD}">${esc(x.n)}</td><td style="${TD}">${x.ab ? esc(t("Absent")) : n2(x.m)}</td><td style="${TD}">${n2(x.t)}</td><td style="${TD}">${x.t ? f1((x.m / x.t) * 100) : "–"}</td></tr>`).join("")}
  <tr><td style="${TD};font-weight:800">${esc(t("Total"))}</td><td style="${TD};font-weight:800">${n2(d.g)}</td><td style="${TD};font-weight:800">${n2(d.t)}</td><td style="${TD};font-weight:800">${f1(p)}</td></tr></table></div>
  <div style="display:flex;gap:16px;align-items:center;margin-top:14px;border:1.5px solid #cdd8ee;border-radius:10px;padding:12px"><div style="flex:1"><b>${esc(t("Grade"))}:</b> ${gradeChip(p)}</div><div style="flex:1;border-left:1px solid #cdd8ee;padding-left:16px"><b>${esc(t("Rank"))}:</b> #${d.rk} / ${d.n}</div></div>
  <div style="display:flex;justify-content:space-between;font-size:12px;margin-top:14px;color:#44547a"><span>${esc([S.INST.owner, S.INST.phone].filter(Boolean).join(" "))}</span><span>${esc(t("Generated"))}: ${T()}</span></div></div>`;
}

// ---------- publishing: each student gets his own copy of the result ----------
const rowDoc = (e, r) => ({ ty: "ex", eid: e.id, bid: e.bid, bn: (batchOf(e.bid) || {}).name || "", title: e.title, date: e.date, name: r.s.name, roll: r.s.roll, g: r.g, t: r.t, rk: r.rk, n: r.n, subs: r.subs });
async function syncExam(e, remove) {
  const L = S.U.filter((s) => s.bid === e.bid && s.active !== false), R = remove ? [] : examRows(e, L);
  const ops = R.length ? R.map((r) => ({ set: ["users/" + r.s.id + "/reports/ex_" + e.id, rowDoc(e, r)] })) : L.map((s) => ({ del: "users/" + s.id + "/reports/ex_" + e.id }));
  await db.batch(ops);
}

// ---------- exams ----------
const X = () => pageState("ex");
let E = [];
async function putExam(e) {
  const { id, ...x } = e;
  await db.set("exams/" + id, x);
  await recalcBatch(e.bid);
  if (e.pub !== false) await syncExam(e).catch(() => {});
}
page("exams", async () => {
  if (!S.bid) return noBatch();
  return isStudent() ? studentExams() : staffExams();
}, { title: "Exams" });

async function staffExams() {
  const st = X();
  E = (await db.list("exams", ["bid", "==", S.bid])).sort((a, b) => (b.date > a.date ? 1 : b.date < a.date ? -1 : 0));
  const e0 = E.find((x) => x.id === st.eid) || E[0];
  if (e0 && st.loaded !== e0.id) { st.loaded = e0.id; st.E = JSON.parse(JSON.stringify(e0)); st.si = 0; }
  if (!e0) st.E = null;
  const e = st.E, stu = activeStudents(), u = e && e.subs[st.si] ? e.subs[st.si] : null;
  const hidden = e && e.pub === false;
  const rows = e && e.subs.some((x) => x.st === "H") ? examRows(e, stu) : [];
  return `${batchPicker()}
  <form class="card stack-s" data-submit="ex-add"><h3>${esc(t("New exam"))}</h3><div class="grid g2">${input("title", { label: t("Exam name") })}${input("date", { type: "date", value: T(), label: t("Date") })}</div>
    ${input("subs", { label: t("Subjects and total marks"), placeholder: "Bangla 100, English 50.5", hint: t("Total marks of each subject: 10 to 200 (decimals allowed, e.g. 55.5)") })}<button class="btn btn--pri" type="submit">${icon("plus")}${esc(t("Create exam"))}</button></form>
  ${e ? `<div class="mt">${select("eid", E.map((x) => [x.id, x.title + " · " + x.date]), e.id, { "data-change": "ex-pick" })}</div>
  <div class="mt">${chips(e.subs.map((x, i) => ({ k: i, label: x.n + " · " + (x.st === "H" ? t("Held") : t("Not happened")) })), st.si, "ex-sub")}</div>
  <div class="card ${hidden ? "card--warn" : ""}"><div class="card-h"><h3>${esc(hidden ? t("Hidden from students") : t("Published to students"))}</h3>${canPublish() ? btn(hidden ? t("Publish results") : t("Hide results"), "ex-pub", { sm: true, kind: hidden ? "pri" : "", ic: hidden ? "eye" : "lock" }) : ""}</div>
    ${canPublish() ? "" : `<p class="mut sm">${esc(t("Marks stay hidden until a teacher with publish permission, or the admin, publishes."))}</p>`}</div>
  ${u ? `<div class="card mt"><div class="check" style="border:0"><span><b>${esc(u.n)}</b> <span class="mut">${esc(t("out of {n}", { n: u.total }))}</span><span class="hint">${esc(t("Held + blank = Absent (0). Not happened is left out."))}</span></span><button class="sw" aria-pressed="${u.st === "H"}" data-act="ex-held" aria-label="${esc(t("Held"))}"></button></div>
    <div id="ex-marks">${stu.map((s) => `<div class="omr"><div class="omr-n"><b>${esc(s.name)}</b><span class="mut sm">${esc(s.roll || "")}</span></div><input type="number" inputmode="decimal" style="width:96px" min="0" max="${u.total}" step="any" ${u.st === "H" ? "" : "disabled"} placeholder="${esc(t("Absent (0)"))}" value="${u.m && u.m[s.id] != null ? u.m[s.id] : ""}" data-input="ex-m" data-sid="${esc(s.id)}"></div>`).join("")}</div>
    <div class="row mt">${btn(t("Save marks"), "ex-save", { kind: "pri", ic: "check" })}${isStaff() ? btn(t("Delete exam"), "ex-del", { kind: "bad", ic: "trash" }) : ""}</div></div>` : ""}
  ${rows.length ? `<div class="mt">${card(t("Ranks"), `<div class="list">${rows.map((r, i) => row({ av: `<span class="medal ${r.rk > 3 ? "medal--n" : "medal--" + r.rk}">${r.rk}</span>`, title: r.s.name, sub: esc(`${n2(r.g)} / ${n2(r.t)} (${f1(r.t ? (r.g / r.t) * 100 : null)})`), right: gradeChip(r.t ? (r.g / r.t) * 100 : null), act: "ex-sheet", arg: r.s.id })).join("")}</div>`)}</div>` : ""}` : `<div class="mt">${empty(t("No exam yet."), "clip")}</div>`}`;
}

onSubmit("ex-add", async (el) => {
  const f = formData(el.closest("form")), title = f.title.trim();
  const P = f.subs.split(",").map((x) => x.trim()).filter(Boolean).map((x) => x.match(/^(.+?)\s+(\d+(?:\.\d+)?)$/));
  if (!title || !P.length) return toast(t("Add a name and subjects like: Bangla 100, English 50"), "bad");
  const bad = P.find((m) => !m || +m[2] < 10 || +m[2] > 200);
  if (bad) return toast(bad[1] ? t("{n}: total marks must be between 10 and 200", { n: bad[1] }) : t("Write each subject like: Bangla 100, English 50.5"), "bad");
  const id = await db.add("exams", { bid: S.bid, title, date: f.date || T(), subs: P.map((m) => ({ n: m[1].trim(), total: +m[2], st: "NH", m: {} })), pub: false });
  X().eid = id; X().loaded = "";
  refresh();
});
onChange("ex-pick", (el) => { const st = X(); st.eid = el.value; st.loaded = ""; refresh(); });
act("ex-sub", (el) => { X().si = +el.dataset.arg; refresh(); });
act("ex-held", async () => {
  const st = X(), u = st.E.subs[st.si];
  u.st = u.st === "H" ? "NH" : "H";
  await putExam(st.E);
  refresh();
});
onInput("ex-m", (el) => {
  const st = X(), u = st.E.subs[st.si], v = el.value;
  if (v === "" || isNaN(+v)) delete u.m[el.dataset.sid]; else u.m[el.dataset.sid] = Math.max(0, Math.min(n2(+v), u.total));
});
act("ex-save", async () => { await putExam(X().E); toast(t("Marks saved"), "ok"); X().loaded = ""; refresh(); });
act("ex-pub", async () => {
  const e = X().E, on = e.pub === false;
  e.pub = on;
  await putExam(e);
  if (!on) await syncExam(e, true).catch(() => {});
  else notify("batch", t("Result published: {n}", { n: e.title }), e.bid);
  logAct((on ? "Published " : "Hid ") + e.title);
  X().loaded = ""; refresh();
});
act("ex-del", async () => {
  const e = X().E;
  if (!(await ask(t("Delete the exam {n} and its marks?", { n: e.title }), { danger: true, ok: t("Delete") }))) return;
  await syncExam(e, true).catch(() => {});
  await db.del("exams/" + e.id);
  await recalcBatch(e.bid);
  logAct("Deleted exam " + e.title);
  X().eid = ""; X().loaded = ""; refresh();
});
act("ex-sheet", (el) => {
  const e = X().E, r = examRows(e, activeStudents()).find((x) => x.s.id === el.dataset.arg);
  if (r) showDoc(resultSheet(rowDoc(e, r)));
});

// student side: my published results
let XS = null, XSt = 0;
async function myResults(force) {
  if (!force && XS && Date.now() - XSt < 5 * 60e3) return XS;
  try { XS = (await db.list("users/" + S.pid + "/reports")).filter((x) => x.ty === "ex"); } catch (e) { XS = []; }
  XSt = Date.now();
  return XS;
}
async function studentExams() {
  const L = (await myResults(true)).sort((a, b) => (b.date > a.date ? 1 : -1));
  XL = L;
  return L.length ? `<div class="card"><div class="list">${L.map((x, i) => row({ title: x.title, sub: `${x.date} · ${n2(x.g)} / ${n2(x.t)} (${f1(x.t ? (x.g / x.t) * 100 : null)})`, right: `<span class="tag tag--gold">#${x.rk} / ${x.n}</span>`, act: "ex-mine", arg: i })).join("")}</div></div>` : empty(t("No published exam yet."), "clip");
}
let XL = [];
act("ex-mine", (el) => { const x = XL[+el.dataset.arg]; if (x) showDoc(resultSheet(x)); });

// ---------- exam ranks box (dashboard) ----------
const RK = () => pageState("rk");
function range() {
  const st = RK(), today = T(), m = today.slice(0, 7), p = st.p || "m";
  if (p === "w") return [addDays(today, -6), today];
  if (p === "y") return [today.slice(0, 4) + "-01-01", today.slice(0, 4) + "-12-31"];
  if (p === "c") { const a = st.a || m + "-01", b = st.b || today; return a > b ? [b, a] : [a, b]; }
  return [m + "-01", m + "-" + String(new Date(+m.slice(0, 4), +m.slice(5, 7), 0).getDate()).padStart(2, "0")];
}
let RKL = [], RKX = [];
async function rankInner() {
  const st = RK(), [a, b] = range(), p = st.p || "m";
  const bar = `${chips([["w", t("Week")], ["m", t("Month")], ["y", t("Year")], ["c", t("Custom")]].map(([k, l]) => ({ k, label: l })), p, "rk-p")}${p === "c" ? `<div class="inline mb"><input type="date" value="${a}" data-change="rk-a"><input type="date" value="${b}" data-change="rk-b"></div>` : `<p class="mut sm">${fmtDate(a)} – ${fmtDate(b)}</p>`}`;
  const head = `<div class="card-h"><h3>${esc(t("Exam ranks"))}</h3></div>`;
  if (isStudent()) {
    RKL = (await myResults()).filter((x) => x.date >= a && x.date <= b).sort((x, y) => (y.date > x.date ? 1 : -1));
    return head + bar + (RKL.length ? `<div class="list">${RKL.map((x, i) => row({ title: x.title, sub: `${x.date} · ${n2(x.g)} / ${n2(x.t)} (${f1(x.t ? (x.g / x.t) * 100 : null)})`, right: `<span class="tag tag--gold">#${x.rk} / ${x.n}</span>`, act: "rk-mine", arg: i })).join("")}</div>` : `<p class="mut">${esc(t("No published exam in this period."))}</p>`);
  }
  if (!S.bid) return head + `<p class="mut">${esc(t("No batch yet."))}</p>`;
  const ex = (await db.list("exams", ["bid", "==", S.bid]).catch(() => [])).filter((e) => e.pub !== false && e.date >= a && e.date <= b).sort((x, y) => (y.date > x.date ? 1 : -1));
  const stu = activeStudents();
  RKX = ex.map((e) => ({ e, R: examRows(e, stu) }));
  return head + `<div class="mb">${select("bid", S.B.map((x) => [x.id, x.name]), S.bid, { "data-change": "rk-bid" })}</div>` + bar +
    (RKX.map(({ e, R }, i) => { const av = R.length ? R.reduce((q, x) => q + (x.t ? (x.g / x.t) * 100 : 0), 0) / R.length : null; return `<details class="card" style="margin:8px 0"><summary><b>${esc(e.title)}</b> <span class="mut">${e.date} · ${esc(t("avg"))} ${f1(av)}</span></summary><div class="list mt">${R.map((r, j) => row({ title: r.s.name, sub: `${esc(r.s.roll || "")} · ${n2(r.g)} / ${n2(r.t)}`, right: `<span class="tag tag--gold">#${r.rk}</span>`, act: "rk-sheet", arg: i + "|" + j })).join("")}</div></details>`; }).join("") || `<p class="mut">${esc(t("No published exam in this period."))}</p>`) +
    (canPublish() && ex.length ? `<div class="mt">${btn(t("Update student results"), "rk-all", { sm: true, ic: "refresh" })}</div>` : "");
}
export async function ranksBox() { try { return `<section class="card" id="rk-box">${await rankInner()}</section>`; } catch (e) { return ""; } }
const redrawBox = async () => { const b = document.getElementById("rk-box"); if (b) b.innerHTML = await rankInner(); };
act("rk-p", (el) => { RK().p = el.dataset.arg; return redrawBox(); });
onChange("rk-a", (el) => { RK().a = el.value; return redrawBox(); });
onChange("rk-b", (el) => { RK().b = el.value; return redrawBox(); });
onChange("rk-bid", (el) => { S.bid = el.value; return redrawBox(); });
act("rk-mine", (el) => { const x = RKL[+el.dataset.arg]; if (x) showDoc(resultSheet(x)); });
act("rk-sheet", (el) => { const [i, j] = el.dataset.arg.split("|").map(Number), { e, R } = RKX[i] || {}; if (e && R[j]) showDoc(resultSheet(rowDoc(e, R[j]))); });
act("rk-all", async () => {
  const ex = (await db.list("exams", ["bid", "==", S.bid])).filter((e) => e.pub !== false);
  for (const e of ex) await syncExam(e);
  toast(t("Updated"), "ok");
});

// ---------- syllabus ----------
const Z = () => pageState("sy");
const ZMSG = "এখানে শুধুমাত্র সেই টপিক select করবা যেটাতে তোমার আত্মবিশ্বাস আছে যে তুমি পরীক্ষায় answer করতে পারবা";
const canEdit = () => isStaff();
page("syllabus", async () => {
  if (!S.bid) return noBatch();
  return isStudent() ? studentSyllabus() : staffSyllabus();
}, { title: "Syllabus" });
async function loadSD(bid) { const d = (await db.get("sd/" + bid).catch(() => null)) || {}; d.done = d.done || {}; d.cx = d.cx || []; d.tl = d.tl || {}; return d; }
let SD = {}, ZLIST = [];
async function staffSyllabus() {
  const st = Z(), b = curBatch();
  SD = await loadSD(S.bid);
  const M = await db.list("ms", ["bid", "==", S.bid]).catch(() => []);
  const g = b.grp || st.grp || "";
  ZLIST = subjectsFor(b.cls, g, SD);
  if (!ZLIST.some((x) => x.s === st.sj)) st.sj = (ZLIST[0] || {}).s;
  const y = ZLIST.find((x) => x.s === st.sj), dn = y ? SD.done[y.s] || [] : [];
  const stu = activeStudents().filter((s) => !g || !s.grp || s.grp === g);
  return `${batchPicker()}
  ${b.grp ? "" : `<div class="mb">${select("grp", [["", t("All groups")], ["Science", t("Science")], ["Commerce", t("Commerce")], ["Arts", t("Arts")]], st.grp || "", { "data-change": "sy-grp", label: t("Group") })}</div>`}
  ${y ? `<div class="mb">${select("sj", ZLIST.map((x) => x.s), st.sj, { "data-change": "sy-sj", label: t("Subject") })}</div>
  <div class="card"><div class="card-h"><h3>${esc(y.s)}</h3><span class="mut sm">${dn.length} / ${y.t.length}</span></div>${meter(y.t.length ? (dn.length / y.t.length) * 100 : 0, "var(--ok)")}
    <div class="mt">${y.t.map((x, i) => `<div class="check"><input type="checkbox" class="zt" value="${i}" ${dn.includes(i) ? "checked" : ""}><span>${esc(x)}</span>${canEdit() ? `<button class="icon-btn" style="width:34px;height:34px" data-act="sy-edit" data-arg="${i}" aria-label="${esc(t("Edit"))}">${icon("edit")}</button><button class="icon-btn" style="width:34px;height:34px" data-act="sy-del" data-arg="${i}" aria-label="${esc(t("Delete"))}">${icon("trash")}</button>` : ""}</div>`).join("") || `<p class="mut">${esc(t("No topics."))}</p>`}</div>
    <div class="row mt">${btn(t("Save progress"), "sy-save", { kind: "pri", ic: "check" })}</div>
    ${canEdit() ? `<div class="inline mt"><input id="sy-new" placeholder="${esc(t("New topic name"))}">${btn(t("Add topic"), "sy-add", { ic: "plus" })}</div>` : ""}</div>
  <div class="mt">${card(t("Student confidence") + " · " + y.s, stu.map((s) => { const c = (((M.find((m) => m.sid === s.id) || {}).c || {})[y.s]) || []; return `<details><summary>${esc(s.name)} · ${c.length} / ${y.t.length}</summary>${c.map((i) => `<div class="mut sm">✔ ${esc(y.t[i] || "")}</div>`).join("") || `<p class="mut sm">${esc(t("Nothing ticked yet."))}</p>`}</details>`; }).join("") || `<p class="mut">${esc(t("No students."))}</p>`)}</div>` : empty(t("No syllabus for this class yet."), "list")}
  <form class="card stack-s mt" data-submit="sy-extra"><h3>${esc(t("Add extra subject"))}</h3>${input("s", { label: t("Subject") })}${select("g", [["", t("All groups")], ["Science", t("Science")], ["Commerce", t("Commerce")], ["Arts", t("Arts")]], "", { label: t("Group") })}${textarea("t", { label: t("Topics / chapters, one per line"), rows: 5 })}<button class="btn btn--pri" type="submit">${icon("plus")}${esc(t("Add subject"))}</button></form>
  ${SD.cx.length ? card(t("Extra subjects"), `<div class="list">${SD.cx.map((c, i) => row({ title: c.s, sub: t("{n} topics", { n: c.t.length }) + (c.g ? " · " + t(c.g) : ""), right: btn(t("Delete"), "sy-xdel", { arg: i, sm: true, kind: "bad" }) })).join("")}</div>`) : ""}`;
}
onChange("sy-grp", (el) => { Z().grp = el.value; refresh(); });
onChange("sy-sj", (el) => { Z().sj = el.value; refresh(); });
const putSD = (patch) => db.set("sd/" + S.bid, { bid: S.bid, ...patch }, true);
act("sy-save", async () => {
  const sj = Z().sj;
  SD.done[sj] = $$(".zt").filter((b) => b.checked).map((b) => +b.value);
  await putSD({ done: SD.done });
  notify("batch", t("Syllabus updated: {n}", { n: sj }), S.bid);
  toast(t("Saved"), "ok"); refresh();
});
act("sy-xdel", async (el) => {
  if (!(await ask(t("Delete?"), { danger: true, ok: t("Delete") }))) return;
  SD.cx.splice(+el.dataset.arg, 1);
  await putSD({ cx: SD.cx });
  refresh();
});
onSubmit("sy-extra", async (el) => {
  const f = formData(el.closest("form")), tp = f.t.split("\n").map((x) => x.trim()).filter(Boolean);
  if (!f.s.trim() || !tp.length) return toast(t("Add the subject and topics"), "bad");
  SD.cx.push({ s: f.s.trim(), t: tp, g: f.g || "" });
  await putSD({ cx: SD.cx });
  logAct("Added a syllabus subject");
  refresh();
});
// admin / co-admin: change topic names or the list. Built-in subjects are copied into sd.tl[subject] on the first change.
async function setTopics(subj, list, map) {
  if (map) {
    const fx = (a) => [...new Set((a || []).map(map).filter((i) => i != null && i >= 0))];
    if (SD.done[subj]) SD.done[subj] = fx(SD.done[subj]);
    const M = await db.list("ms", ["bid", "==", S.bid]).catch(() => []);
    for (const m of M) { const c = m.c || {}; if (c[subj]) { c[subj] = fx(c[subj]); await db.upd("ms/" + m.id, { c }).catch(() => {}); } }
  }
  const k = SD.cx.findIndex((c) => c.s === subj);
  if (k >= 0) { SD.cx[k].t = list; await putSD({ done: SD.done, cx: SD.cx }); }
  else { SD.tl[subj] = list; await putSD({ done: SD.done, tl: SD.tl }); }
}
const curSubj = () => ZLIST.find((x) => x.s === Z().sj);
act("sy-del", async (el) => {
  const y = curSubj(), i = +el.dataset.arg;
  if (!y || !(await ask(t("Delete this topic?") + "\n" + y.t[i], { danger: true, ok: t("Delete") }))) return;
  await setTopics(y.s, y.t.filter((_, j) => j !== i), (j) => (j === i ? null : j > i ? j - 1 : j));
  logAct("Deleted a syllabus topic"); refresh();
});
act("sy-add", async () => {
  const y = curSubj(), n = (($("#sy-new") || {}).value || "").trim();
  if (!y || !n) return toast(t("New topic name"), "bad");
  await setTopics(y.s, [...y.t, n]);
  logAct("Added a syllabus topic"); refresh();
});
act("sy-edit", async (el) => {
  const y = curSubj(), i = +el.dataset.arg;
  if (!y) return;
  const r = await form(t("Edit topic name"), input("v", { value: y.t[i], label: t("Topic") }), {
    validate: (d) => (!d.v.trim() ? t("Topic name cannot be empty") : ""),
    onSave: async (d) => { const L = [...y.t]; L[i] = d.v.trim(); await setTopics(y.s, L); logAct("Edited a syllabus topic"); },
  });
  if (r) refresh();
});

// student: what the class finished + "my confidence" ticks
let ZM = { c: {} };
async function studentSyllabus() {
  const b = curBatch() || (await db.get("batches/" + S.me.bid).catch(() => null)) || {};
  const [sd, ms] = await Promise.all([loadSD(S.me.bid), db.get("ms/" + S.pid).catch(() => null)]);
  ZM = ms || { c: {} }; ZM.c = ZM.c || {};
  const L = subjectsFor(b.cls, S.me.grp || b.grp || "", sd);
  if (!L.length) return empty(t("No syllabus yet. Your batch class is not set."), "list");
  return `<div class="notice">${icon("info")}<div><b>${ZMSG}</b></div></div>
  <div class="mt stack">${L.map((y) => { const dn = sd.done[y.s] || [], c = ZM.c[y.s] || []; return `<details class="card"><summary><b>${esc(y.s)}</b> <span class="mut sm">${dn.length} / ${y.t.length} ${esc(t("finished in class"))} · ${c.length} ${esc(t("confident"))}</span></summary>
    <div class="mt">${meter(y.t.length ? (dn.length / y.t.length) * 100 : 0, "var(--ok)")}</div>
    ${y.t.map((x, i) => `<div class="check"><input type="checkbox" class="zm" data-s="${esc(y.s)}" value="${i}" ${c.includes(i) ? "checked" : ""}><span>${esc(x)}</span>${dn.includes(i) ? tag(t("Done in class"), "ok") : ""}</div>`).join("")}</details>`; }).join("")}</div>
  <div class="mt">${btn(t("Save"), "sy-mine", { kind: "pri", ic: "check" })}</div>`;
}
act("sy-mine", async () => {
  const c = {};
  $$(".zm").forEach((b) => { if (b.checked) (c[b.dataset.s] = c[b.dataset.s] || []).push(+b.value); });
  await db.set("ms/" + S.pid, { sid: S.pid, bid: S.me.bid, c, t: Date.now() });
  toast(t("Saved"), "ok");
});

addBN({
  "Exam result sheet": "পরীক্ষার ফলাফল পত্র", "Student": "ছাত্র", "Roll": "রোল", "Batch": "ব্যাচ", "Exam": "পরীক্ষা", "Subject": "বিষয়", "Marks": "নম্বর", "Out of": "পূর্ণমান", "Absent": "অনুপস্থিত", "Total": "মোট", "Grade": "গ্রেড", "Rank": "র‍্যাঙ্ক", "Generated": "তৈরি",
  "New exam": "নতুন পরীক্ষা", "Exam name": "পরীক্ষার নাম", "Date": "তারিখ", "Subjects and total marks": "বিষয় ও পূর্ণমান", "Create exam": "পরীক্ষা তৈরি করুন", "Held": "অনুষ্ঠিত", "Not happened": "হয়নি",
  "Hidden from students": "ছাত্রদের কাছ থেকে লুকানো", "Published to students": "ছাত্রদের জন্য প্রকাশিত", "Publish results": "ফলাফল প্রকাশ করুন", "Hide results": "ফলাফল লুকান", "Marks stay hidden until a teacher with publish permission, or the admin, publishes.": "প্রকাশের অনুমতিপ্রাপ্ত শিক্ষক বা অ্যাডমিন প্রকাশ না করা পর্যন্ত নম্বর লুকানো থাকবে।",
  "out of {n}": "পূর্ণমান {n}", "Held + blank = Absent (0). Not happened is left out.": "অনুষ্ঠিত + ফাঁকা = অনুপস্থিত (০)। না-হওয়া বিষয় বাদ।", "Absent (0)": "অনুপস্থিত (০)", "Save marks": "নম্বর সংরক্ষণ", "Delete exam": "পরীক্ষা মুছুন",
  "Ranks": "র‍্যাঙ্ক", "No exam yet.": "এখনো কোনো পরীক্ষা নেই।", "Add a name and subjects like: Bangla 100, English 50": "নাম ও বিষয় দিন, যেমন: Bangla 100, English 50", "{n}: total marks must be between 10 and 200": "{n}: পূর্ণমান ১০ থেকে ২০০ এর মধ্যে হতে হবে",
  "Write each subject like: Bangla 100, English 50.5": "প্রতিটি বিষয় এভাবে লিখুন: Bangla 100, English 50.5", "Total marks of each subject: 10 to 200 (decimals allowed, e.g. 55.5)": "প্রতিটি বিষয়ের পূর্ণমান: ১০ থেকে ২০০ (দশমিক চলবে, যেমন ৫৫.৫)", "Marks saved": "নম্বর সংরক্ষিত হয়েছে",
  "Result published: {n}": "ফল প্রকাশিত: {n}", "Delete the exam {n} and its marks?": "পরীক্ষা {n} ও এর নম্বর মুছবেন?", "No published exam yet.": "এখনো কোনো প্রকাশিত পরীক্ষা নেই।", "Exam ranks": "পরীক্ষার র‍্যাঙ্ক", "Week": "সপ্তাহ", "Month": "মাস", "Year": "বছর", "Custom": "নির্দিষ্ট তারিখ",
  "No published exam in this period.": "এই সময়ে কোনো প্রকাশিত পরীক্ষা নেই।", "No batch yet.": "এখনো কোনো ব্যাচ নেই।", "avg": "গড়", "Update student results": "ছাত্রদের ফল আপডেট করুন", "Updated": "আপডেট হয়েছে", "Group": "গ্রুপ", "All groups": "সব গ্রুপ",
  "Save progress": "অগ্রগতি সংরক্ষণ", "New topic name": "নতুন টপিকের নাম", "Add topic": "টপিক যোগ করুন", "No topics.": "কোনো টপিক নেই।", "Student confidence": "ছাত্রদের আত্মবিশ্বাস", "Nothing ticked yet.": "এখনো কিছু টিক দেওয়া হয়নি।", "No students.": "কোনো ছাত্র নেই।",
  "No syllabus for this class yet.": "এই ক্লাসের জন্য এখনো সিলেবাস নেই।", "Add extra subject": "অতিরিক্ত বিষয় যোগ করুন", "Topics / chapters, one per line": "টপিক / অধ্যায়, প্রতি লাইনে একটি", "Add subject": "বিষয় যোগ করুন", "Extra subjects": "অতিরিক্ত বিষয়", "{n} topics": "{n} টি টপিক",
  "Syllabus updated: {n}": "সিলেবাস আপডেট: {n}", "Delete?": "মুছবেন?", "Add the subject and topics": "বিষয় ও টপিক দিন", "Delete this topic?": "এই টপিকটি মুছবেন?", "Edit topic name": "টপিকের নাম বদলান", "Topic": "টপিক", "Topic name cannot be empty": "টপিকের নাম খালি হতে পারবে না",
  "No syllabus yet. Your batch class is not set.": "এখনো সিলেবাস নেই। আপনার ব্যাচের ক্লাস ঠিক করা নেই।", "finished in class": "ক্লাসে শেষ", "confident": "আত্মবিশ্বাসী", "Done in class": "ক্লাসে শেষ", "Edit": "সম্পাদনা", "Delete": "মুছুন", "Save": "সংরক্ষণ", "Date": "তারিখ", "Subject": "বিষয়",
});
