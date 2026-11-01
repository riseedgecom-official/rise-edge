// Exams (create, marks, publish, result sheets), the dashboard "Exam ranks" box, and the syllabus.
import { db } from "./lib-db.js";
import {
  S, esc, t, page, act, onInput, onChange, onSubmit, formData, pageState, refresh, isStaff, isAdmin, isStudent, canPublish, instName, T, addDays, fmtDate,
  addBN, activeStudents, curBatch, f1, n2, batchOf, $, $$, mySubjects, subjectOk, ago,
} from "./lib-core.js";
import { icon, avatar, tag, empty, notice, card, row, btn, chips, input, select, textarea, batchPicker, meter, ask, form, askText, toast, showDoc } from "./lib-ui.js";
import { recalcBatch, notify, logAct, dropBatchCache } from "./lib-svc.js";
import { examRows, grade, subjectsFor, counted } from "./lib-stats.js";
import { readTable, toCSV } from "./lib-sheet.js";

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
  ${(d.subs || []).map((x) => { const fail = x.pm > 0 && x.m < x.pm, red = fail ? ";color:#b3261e;font-weight:700" : ""; return `<tr><td style="${TD}">${esc(x.n)}${x.pt ? `<div style="font-size:11px;color:#44547a;font-weight:400">${esc(x.pt.map((p) => p.n + " " + n2(p.m) + "/" + n2(p.t)).join(" · "))}</div>` : ""}</td><td style="${TD}${red}">${x.ab ? esc(t("Absent")) : n2(x.m)}${fail ? " (F)" : ""}</td><td style="${TD}">${n2(x.t)}</td><td style="${TD}">${x.t ? f1((x.m / x.t) * 100) : "–"}</td></tr>`; }).join("")}
  <tr><td style="${TD};font-weight:800">${esc(t("Total"))}</td><td style="${TD};font-weight:800">${n2(d.g)}</td><td style="${TD};font-weight:800">${n2(d.t)}</td><td style="${TD};font-weight:800">${f1(p)}</td></tr></table></div>
  <div style="display:flex;gap:16px;align-items:center;margin-top:14px;border:1.5px solid #cdd8ee;border-radius:10px;padding:12px"><div style="flex:1"><b>${esc(t("Grade"))}:</b> ${gradeChip(p)}</div><div style="flex:1;border-left:1px solid #cdd8ee;padding-left:16px"><b>${esc(t("Rank"))}:</b> #${d.rk} / ${d.n}</div></div>
  ${(d.subs || []).some((x) => x.pm > 0) ? (() => { const f = d.subs.filter((x) => x.pm > 0 && x.m < x.pm); return `<div style="margin-top:10px;font-weight:700;color:${f.length ? "#b3261e" : "#1d7a46"}">${esc(t("Result"))}: ${f.length ? esc(t("Failed in {n}", { n: f.map((x) => x.n).join(", ") })) : esc(t("Passed"))}</div>`; })() : ""}
  <div style="display:flex;justify-content:space-between;font-size:12px;margin-top:14px;color:#44547a"><span>${esc([S.INST.owner, S.INST.phone].filter(Boolean).join(" "))}</span><span>${esc(t("Generated"))}: ${T()}</span></div></div>`;
}

// ---------- publishing: each student gets his own copy of the result ----------
const rowDoc = (e, r) => ({ ty: "ex", eid: e.id, bid: e.bid, bn: (batchOf(e.bid) || {}).name || "", title: e.title, date: e.date, name: r.s.name, roll: r.s.roll, g: r.g, t: r.t, rk: r.rk, n: r.n, subs: r.subs });
export async function syncExam(e, remove) {
  const L = S.U.filter((s) => s.bid === e.bid && s.active !== false), R = remove ? [] : examRows(e, L);
  const ops = R.length ? R.map((r) => ({ set: ["users/" + r.s.id + "/reports/ex_" + e.id, rowDoc(e, r)] })) : L.map((s) => ({ del: "users/" + s.id + "/reports/ex_" + e.id }));
  await db.batch(ops);
}

// ---------- exams ----------
// A subject of an exam: {n, total, pm (pass marks), dv: [{n, t}] (parts, e.g. Written / MCQ), st: "H"|"NH",
//   m: {studentId: total marks}, dm: {studentId: {part: marks}}, ws: "d" draft | "s" submitted | "a" approved, sb/sbu/sa (who/when submitted), ap/at (who/when approved), rn (note when sent back)}.
// Marks of a subject count (ranks, reports, results) only when its ws is "a" (or missing = old data). See counted() in lib-stats.js.
const X = () => pageState("ex");
let E = [];
const approver = () => canPublish();                       // admin, co-admin, or a teacher with "Can publish"
const wsOf = (u) => u.ws || "a";
const isLocked = (u) => !approver() && (u.ws === "s" || (u.ws === "a" && !!u.at));   // a plain teacher cannot change submitted / approved marks
const partsOf = (u) => (Array.isArray(u.dv) && u.dv.length ? u.dv : null);
const WS = { d: ["Draft", "warn"], s: ["Submitted - waiting for approval", "info"], a: ["Approved", "ok"] };
const stateWord = (u) => (u.st !== "H" ? t("Not happened") : u.ws === "d" ? t("Draft") : u.ws === "s" ? t("Submitted") : u.ws === "a" && u.at ? t("Approved") : t("Held"));

// "Written 70, MCQ 30" -> [{n, t}] or null when it is not written like that
const parseParts = (str) => {
  const L = String(str || "").split(",").map((x) => x.trim()).filter(Boolean).map((x) => x.match(/^(.+?)\s+(\d+(?:\.\d+)?)$/));
  return L.length && L.every(Boolean) ? L.map((m) => ({ n: m[1].trim(), t: +m[2] })) : null;
};
// checks total / pass marks / parts typed as text. Returns {error} or {total, pm, dv}
function checkSetup(totalS, pmS, dvS) {
  const total = +totalS;
  if (!(total >= 10 && total <= 200)) return { error: t("Total marks must be between 10 and 200") };
  const pm = String(pmS).trim() === "" ? Math.round(total * 33) / 100 : +pmS;
  if (!(pm >= 0 && pm <= total)) return { error: t("Pass marks must be between 0 and the total") };
  let dv = null;
  if (String(dvS).trim()) {
    dv = parseParts(dvS);
    if (!dv) return { error: t("Write the parts like: Written 70, MCQ 30") };
    if (new Set(dv.map((p) => p.n.toLowerCase())).size < dv.length) return { error: t("A part is listed twice") };
    if (dv.some((p) => !(p.t > 0))) return { error: t("Each part needs marks above 0") };
    if (Math.abs(dv.reduce((a, p) => a + p.t, 0) - total) > 0.001) return { error: t("The parts must add up to the total ({n})", { n: n2(total) }) };
  }
  return { total, pm, dv };
}


// Saves ONE subject of an exam on top of the newest copy, so two teachers saving different subjects never overwrite each other.
async function putSubject(e, si) {
  const u = e.subs[si];
  if (!subjectOk(e.bid, u.n)) throw new Error(t("This subject is not yours."));
  const cur = await db.get("exams/" + e.id);
  if (!cur || !cur.subs || !cur.subs[si] || cur.subs[si].n !== u.n) throw new Error(t("This exam was changed by someone else. Please open it again."));
  cur.subs[si] = u;
  cur.pw = cur.subs.some((x) => x.ws === "s");
  await db.upd("exams/" + e.id, { subs: cur.subs, pw: cur.pw });
  await recalcBatch(e.bid);
  if (cur.pub !== false) await syncExam(cur).catch(() => {});
  return cur;
}
page("exams", async () => {
  if (!S.bid) return noBatch();
  return isStudent() ? studentExams() : staffExams();
}, { title: "Exams", after: () => paintAll() });

const EXAM_NAMES = ["First Term", "Mid Term", "Final", "Pre-test", "Model Test", "Monthly Test", "Weekly Test", "Class Test", "Quiz"];

async function staffExams() {
  const st = X();
  E = (await db.list("exams", ["bid", "==", S.bid])).sort((a, b) => (b.date > a.date ? 1 : b.date < a.date ? -1 : 0));
  const e0 = E.find((x) => x.id === st.eid) || E[0];
  if (e0 && st.loaded !== e0.id) { st.loaded = e0.id; st.E = JSON.parse(JSON.stringify(e0)); st.si = 0; }
  if (!e0) st.E = null;
  const e = st.E, stu = activeStudents();
  const mine = e ? e.subs.map((x, i) => i).filter((i) => subjectOk(S.bid, e.subs[i].n)) : [];   // subjects this user may change
  if (e && !mine.includes(st.si)) st.si = mine[0] == null ? -1 : mine[0];
  const u = e && mine.includes(st.si) ? e.subs[st.si] : null;
  const limited = !!mySubjects(S.bid);
  const sd = await loadSD(S.bid), bt = curBatch() || {};
  const choices = limited ? mySubjects(S.bid) : subjectsFor(bt.cls, bt.grp || "", sd).map((x) => x.s);
  const hidden = e && e.pub === false;
  const rows = e && e.subs.some(counted) ? examRows(e, stu) : [];
  const waiting = e ? e.subs.filter((x) => x.st === "H" && !counted(x)).length : 0;
  return `${batchPicker()}
  <details class="card exnew" ${e ? "" : "open"}><summary><h3 style="display:inline">${esc(t("New exam"))}</h3></summary>
  <form class="stack-s mt" data-submit="ex-add"><datalist id="exnames">${EXAM_NAMES.map((n) => `<option value="${esc(n)}">`).join("")}</datalist><div class="grid g2">${input("title", { label: t("Exam name"), list: "exnames", placeholder: t("First Term, Mid Term, Quiz…"), autocomplete: "off" })}${input("date", { type: "date", value: T(), label: t("Date") })}</div>
    <div class="fld"><span>${esc(t("Subjects and marks"))}</span>
      ${choices.length ? `<div class="pick">${choices.map((n, i) => `<div class="sxr"><label class="check"><input type="checkbox" name="sx${i}" value="${esc(n)}" data-change="sx-on"><span>${esc(n)}</span></label>
        <div class="sx-cfg" hidden><label><span>${esc(t("Total"))}</span><input type="number" name="sm${i}" value="100" min="10" max="200" step="any" inputmode="decimal"></label><label><span>${esc(t("Pass marks"))}</span><input type="number" name="sp${i}" step="any" inputmode="decimal" placeholder="33%"></label><label class="sx-pt"><span>${esc(t("Parts (optional)"))}</span><input name="sv${i}" placeholder="Written 70, MCQ 30"></label></div></div>`).join("")}</div>` : ""}
      ${limited ? "" : input("subs", { label: choices.length ? t("Other subjects (optional)") : "", placeholder: "Bangla 100, English 50.5", hint: t("Total marks of each subject: 10 to 200 (decimals allowed, e.g. 55.5)") })}</div>
    <button class="btn btn--pri" type="submit">${icon("plus")}${esc(t("Create exam"))}</button></form></details>
  ${e ? `<div class="mt">${select("eid", E.map((x) => [x.id, x.title + " · " + x.date]), e.id, { "data-change": "ex-pick" })}</div>
  <div class="mt">${mine.length ? chips(mine.map((i) => ({ k: i, label: e.subs[i].n + " · " + stateWord(e.subs[i]) })), st.si, "ex-sub") : notice(esc(t("This exam has none of your subjects.")), "info")}</div>
  <div class="card ${hidden ? "card--warn" : ""}"><div class="card-h"><h3>${esc(hidden ? t("Hidden from students") : t("Published to students"))}</h3>${canPublish() ? btn(hidden ? t("Publish results") : t("Hide results"), "ex-pub", { sm: true, kind: hidden ? "pri" : "", ic: hidden ? "eye" : "lock" }) : ""}</div>
    ${canPublish() ? "" : `<p class="mut sm">${esc(t("Marks stay hidden until a teacher with publish permission, or the admin, publishes."))}</p>`}
    ${waiting ? `<p class="warn sm">${esc(t("{n} subject(s) are not approved yet. They are left out of the ranks and results.", { n: waiting }))}</p>` : ""}</div>
  ${u ? marksCard(e, u, stu) : ""}
  ${rows.length ? `<div class="mt">${card(t("Ranks"), `<div class="list">${rows.map((r, i) => row({ av: `<span class="medal ${r.rk > 3 ? "medal--n" : "medal--" + r.rk}">${r.rk}</span>`, title: r.s.name, sub: esc(`${n2(r.g)} / ${n2(r.t)} (${f1(r.t ? (r.g / r.t) * 100 : null)})`), right: gradeChip(r.t ? (r.g / r.t) * 100 : null), act: "ex-sheet", arg: r.s.id })).join("")}</div>`)}</div>` : ""}` : `<div class="mt">${empty(t("No exam yet."), "clip")}</div>`}`;
}
onChange("sx-on", (el) => { const c = el.closest(".sxr").querySelector(".sx-cfg"); if (c) c.hidden = !el.checked; });

// ----- the marks table of one subject -----
const numOf = (v) => (String(v).trim() === "" ? null : Number(v));
function inputState(el) {
  const v = numOf(el.value), max = +el.dataset.max;
  if (v === null) return { v: null, bad: "" };
  if (!isFinite(v) || v < 0) return { v, bad: t("Enter a number from 0 to {n}", { n: n2(max) }) };
  if (v > max) return { v, bad: t("{v} is more than the maximum {n}", { v: n2(v), n: n2(max) }) };
  return { v, bad: "" };
}
function marksCard(e, u, stu) {
  const parts = partsOf(u), ws = wsOf(u), lock = isLocked(u), held = u.st === "H", dis = !held || lock ? "disabled" : "";
  const row1 = (s) => {
    const sid = esc(s.id), head = `<div class="omr-n"><b>${esc(s.name)}</b><span class="mut sm">${esc(s.roll || "")}</span><span class="bad sm omr-e" hidden></span></div>`;
    if (!parts) return `<div class="omr" data-sid="${sid}">${head}<input class="mk" type="number" inputmode="decimal" min="0" max="${u.total}" step="any" ${dis} placeholder="${esc(t("Absent (0)"))}" value="${u.m && u.m[s.id] != null ? u.m[s.id] : ""}" data-input="ex-m" data-max="${u.total}"></div>`;
    const d = (u.dm || {})[s.id] || {};
    return `<div class="omr omr--p" data-sid="${sid}">${head}<div class="omr-parts">${parts.map((p, i) => `<label class="mk-p"><span>${esc(p.n)} / ${n2(p.t)}</span><input class="mk" type="number" inputmode="decimal" min="0" max="${p.t}" step="any" ${dis} value="${d[p.n] != null ? d[p.n] : ""}" data-input="ex-m" data-max="${p.t}" data-p="${i}"></label>`).join("")}<b class="omr-t"></b></div></div>`;
  };
  const info = [t("out of {n}", { n: n2(u.total) }), u.pm > 0 ? t("Pass marks: {n}", { n: n2(u.pm) }) : "", parts ? parts.map((p) => p.n + " " + n2(p.t)).join(" + ") : ""].filter(Boolean).join(" · ");
  const keepDraft = !lock && !(approver() && ws === "a");
  const buttons = lock
    ? (ws === "s" ? btn(t("Withdraw submission"), "ex-withdraw", { ic: "x" }) : `<p class="mut sm">${esc(t("Approved and locked. Ask the admin to open it again."))}</p>`)
    : `${keepDraft ? btn(t("Save draft"), "ex-draft", { ic: "file" }) : ""}${approver() ? btn(t("Save & approve"), "ex-final", { kind: "pri", ic: "check" }) : btn(t("Submit for approval"), "ex-submit", { kind: "pri", ic: "check" })}
       ${approver() && (ws === "s" || (ws === "a" && u.at)) ? btn(t("Send back"), "ex-back", { kind: "bad", ic: "x" }) : ""}`;
  return `<div class="card mt"><div class="check" style="border:0"><span><b>${esc(u.n)}</b> <span class="mut">${esc(info)}</span><span class="hint">${esc(t("Held + blank = Absent (0). Not happened is left out."))}</span></span><button class="sw" aria-pressed="${held}" data-act="ex-held" ${lock ? "disabled" : ""} aria-label="${esc(t("Held"))}"></button></div>
    <div class="row" style="gap:6px;margin:2px 0 6px">${tag(t(WS[ws][0]), WS[ws][1])}${u.at && ws === "a" ? `<span class="mut sm">${esc(u.ap || "")} · ${esc(ago(u.at))}</span>` : ""}${ws === "s" ? `<span class="mut sm">${esc(u.sb || "")} · ${esc(ago(u.sa))}</span>` : ""}${!lock ? btn(t("Setup"), "ex-setup", { sm: true, ic: "cog" }) : ""}</div>
    ${u.rn && ws === "d" ? notice(`<b>${esc(t("Sent back"))}:</b> ${esc(u.rn)}`, "warn") : ""}
    ${held && !lock ? `<div class="row" style="gap:6px;margin-bottom:6px">${btn(t("Template (CSV)"), "ex-tpl", { sm: true, ic: "file" })}<label class="btn btn--sm">${icon("plus")}${esc(t("Upload Excel / CSV"))}<input type="file" accept=".csv,.xlsx,.txt,text/csv" data-change="ex-up" hidden></label></div><div id="ex-up-msg"></div>` : ""}
    <p class="mut sm" id="ex-cnt"></p>
    <div id="ex-marks" data-pm="${u.pm > 0 ? u.pm : 0}" data-total="${u.total}">${stu.map(row1).join("")}</div>
    <div class="row mt">${buttons}${isStaff() ? btn(t("Delete exam"), "ex-del", { kind: "bad", ic: "trash" }) : ""}</div></div>`;
}
// after the table is drawn / a number is typed: red warnings, live totals, counters
function paintRow(r) {
  const parts = r.classList.contains("omr--p"), pm = +($("#ex-marks") || {}).dataset?.pm || 0;
  let any = false, sum = 0, msg = "";
  r.querySelectorAll("input.mk").forEach((el) => {
    const s = inputState(el);
    el.classList.toggle("err", !!s.bad);
    if (s.bad && !msg) msg = s.bad;
    if (s.v !== null) { any = true; if (!s.bad) sum += s.v; }
  });
  const m = r.querySelector(".omr-e"); if (m) { m.textContent = msg; m.hidden = !msg; }
  const tt = r.querySelector(".omr-t");
  if (tt) { tt.textContent = any ? n2(sum) : ""; tt.classList.toggle("bad", any && pm > 0 && sum < pm); }
  else if (!parts) { const el = r.querySelector("input.mk"); if (el) el.classList.toggle("low", any && pm > 0 && sum < pm && !msg); }
}
function paintAll() {
  const rs = $$("#ex-marks .omr");
  rs.forEach(paintRow);
  const c = $("#ex-cnt");
  if (!c) return;
  const entered = rs.filter((r) => [...r.querySelectorAll("input.mk")].some((el) => el.value.trim() !== "")).length, errs = rs.filter((r) => r.querySelector("input.err")).length, pm = +($("#ex-marks") || {}).dataset?.pm || 0;
  c.innerHTML = `${esc(t("Entered {a} of {b}", { a: entered, b: rs.length }))}${errs ? ` · <b class="bad">${esc(t("{n} wrong", { n: errs }))}</b>` : ""}${pm ? ` · <span class="bad">${esc(t("Red = below pass marks"))}</span>` : ""}`;
}
export const afterExams = () => paintAll();
onInput("ex-m", (el) => { paintRow(el.closest(".omr")); paintAll(); });

// read the table into the subject; returns how many entries are wrong
function collect(u) {
  const parts = partsOf(u);
  let bad = 0;
  u.m = {}; if (parts) u.dm = {};
  $$("#ex-marks .omr").forEach((r) => {
    let any = false, sum = 0; const d = {};
    r.querySelectorAll("input.mk").forEach((el) => {
      const s = inputState(el);
      if (s.bad) { bad++; return; }
      if (s.v === null) return;
      any = true; sum += s.v;
      if (parts) d[parts[+el.dataset.p].n] = n2(s.v);
    });
    if (any) { u.m[r.dataset.sid] = n2(sum); if (parts) u.dm[r.dataset.sid] = d; }
  });
  return bad;
}
async function saveSubject(kind) {            // "d" draft | "s" submit | "a" approve
  const st = X(), e = st.E, u = e.subs[st.si];
  if (isLocked(u)) return toast(t("Marks are locked."), "bad");
  if (collect(u)) { toast(t("Some numbers are wrong (red). Fix them first."), "bad"); const f = $("#ex-marks .err"); if (f) f.scrollIntoView({ block: "center" }); return; }
  if (kind !== "d") {
    if (u.st !== "H") return toast(t("Turn on Held first."), "bad");
    const blank = activeStudents().filter((s) => u.m[s.id] == null).length;
    if (blank && !(await ask(t("{n} students have no marks. They count as absent (0). Continue?", { n: blank }), { ok: t("Continue") }))) return;
  }
  const what = u.n + " - " + e.title;
  if (kind === "d") u.ws = "d";
  else if (kind === "s") { u.ws = "s"; u.sb = S.me.name; u.sbu = S.pid; u.sa = Date.now(); u.rn = ""; }
  else { u.ws = "a"; u.ap = S.me.name; u.at = Date.now(); u.rn = ""; }
  await putSubject(e, st.si);
  if (kind === "s") { logAct("Submitted marks for approval: " + what); toast(t("Submitted. The admin will check it."), "ok"); }
  else if (kind === "a") {
    logAct("Approved marks: " + what);
    if (u.sbu && u.sbu !== S.pid) notify(u.sbu, t("Your marks were approved: {n}", { n: what }));
    toast(t("Saved and approved"), "ok");
  } else toast(t("Draft saved"), "ok");
  st.loaded = ""; refresh();
}
act("ex-draft", () => saveSubject("d"));
act("ex-submit", () => saveSubject("s"));
act("ex-final", () => saveSubject("a"));
act("ex-withdraw", async () => {
  const st = X(), e = st.E, u = e.subs[st.si];
  u.ws = "d";
  await putSubject(e, st.si);
  logAct("Took back the submitted marks: " + u.n + " - " + e.title);
  toast(t("Back to draft"), "ok"); st.loaded = ""; refresh();
});
act("ex-back", async () => {
  const st = X(), e = st.E, u = e.subs[st.si];
  const note = await askText(t("Note for the teacher (optional)"), { label: t("Why is it sent back?"), ok: t("Send back") });
  if (note === null) return;
  u.ws = "d"; u.rn = note || t("Please check the marks again."); u.at = 0; u.ap = "";
  await putSubject(e, st.si);
  if (u.sbu && u.sbu !== S.pid) notify(u.sbu, t("Your marks were sent back: {n}", { n: u.n + " - " + e.title }) + (note ? " - " + note : ""));
  logAct("Sent back marks: " + u.n + " - " + e.title);
  toast(t("Sent back"), "ok"); st.loaded = ""; refresh();
});

// total marks / pass marks / parts of the open subject
act("ex-setup", async () => {
  const st = X(), e = st.E, u = e.subs[st.si];
  if (collect(u)) return toast(t("Some numbers are wrong (red). Fix them first."), "bad");
  await form(t("Subject setup") + ": " + u.n, `${input("total", { label: t("Total marks"), type: "number", value: u.total, step: "any", inputmode: "decimal" })}${input("pm", { label: t("Pass marks"), type: "number", value: u.pm || "", step: "any", inputmode: "decimal", hint: t("Leave empty for 33% of the total.") })}${input("dv", { label: t("Parts (optional)"), value: (u.dv || []).map((p) => p.n + " " + p.t).join(", "), placeholder: "Written 70, MCQ 30", hint: t("Write the parts like: Written 70, MCQ 30") })}`, {
    validate: (d) => checkSetup(d.total, d.pm, d.dv).error || "",
    onSave: async (d) => {
      const c = checkSetup(d.total, d.pm, d.dv), was = JSON.stringify(u.dv || null), now = JSON.stringify(c.dv);
      if (was !== now) {
        if (Object.keys(u.m || {}).length && !(await ask(t("Changing the parts clears the marks of this subject. Continue?"), { danger: true, ok: t("Continue") }))) throw new Error(t("Not changed"));
        u.m = {}; u.dm = {};
      } else if (Object.values(u.m || {}).some((v) => v > c.total)) throw new Error(t("Some entered marks are above the new total."));
      u.total = c.total; u.pm = c.pm;
      if (c.dv) u.dv = c.dv; else delete u.dv;
      if (!c.dv) delete u.dm;
      await putSubject(e, st.si);
      logAct("Changed the setup of " + u.n + " - " + e.title);
    },
  }).then((r) => { if (r) { st.loaded = ""; refresh(); } });
});

// ----- Excel / CSV: template and upload -----
act("ex-tpl", () => {
  const st = X(), e = st.E, u = e.subs[st.si], parts = partsOf(u);
  const rows = [["Roll", "Name", ...(parts ? parts.map((p) => p.n) : ["Marks"])]];
  $$("#ex-marks .omr").forEach((r) => {
    const s = activeStudents().find((x) => x.id === r.dataset.sid) || {};
    rows.push([s.roll || "", s.name || "", ...[...r.querySelectorAll("input.mk")].map((el) => el.value)]);
  });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([toCSV(rows)], { type: "text/csv" }));
  a.download = (e.title + "-" + u.n).replace(/[^\p{L}\p{N}]+/gu, "_") + ".csv";
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 800);
});
const norm = (x) => String(x == null ? "" : x).trim().toLowerCase();
const ROLL_H = /^(roll|id|roll no\.?|roll number|student id)$/, NAME_H = /^(name|student name|student)$/;
function importMarks(rows, u, stu) {
  const parts = partsOf(u), hi = rows.findIndex((r) => r.some((c) => ROLL_H.test(norm(c))));
  if (hi < 0) return { err: t("The header row (Roll, Name, …) was not found. Use the template.") };
  const H = rows[hi].map(norm), rc = H.findIndex((c) => ROLL_H.test(c)), nc = H.findIndex((c) => NAME_H.test(c));
  let cols;
  if (parts) {
    cols = parts.map((p) => H.findIndex((c) => c === norm(p.n) || c.startsWith(norm(p.n))));
    const miss = parts.filter((p, i) => cols[i] < 0).map((p) => p.n);
    if (miss.length) return { err: t("Columns not found: {n}", { n: miss.join(", ") }) };
  } else {
    let c = H.findIndex((x, i) => i !== rc && i !== nc && /^(marks?|number|numbers|obtained|score|total)/.test(x));
    if (c < 0) c = H.findIndex((x, i) => i !== rc && i !== nc && x !== "");
    if (c < 0) return { err: t("The marks column was not found. Use the template.") };
    cols = [c];
  }
  const byRoll = new Map(stu.map((s) => [norm(s.roll), s])), byName = new Map(stu.map((s) => [norm(s.name), s]));
  let done = 0; const problems = [];
  for (const r of rows.slice(hi + 1)) {
    const rollv = norm(r[rc]), namev = nc >= 0 ? norm(r[nc]) : "";
    let s = byRoll.get(rollv);
    if (!s && rollv) { const m = stu.filter((x) => norm(x.roll).endsWith("-" + rollv)); if (m.length === 1) s = m[0]; }
    if (!s && namev) s = byName.get(namev);
    if (!s) { if (rollv || namev) problems.push((r[rc] || r[nc]) + ": " + t("student not found")); continue; }
    const rowEl = document.querySelector(`#ex-marks .omr[data-sid="${s.id}"]`);
    if (!rowEl) continue;
    let touched = false;
    cols.forEach((ci, j) => {
      const el = rowEl.querySelector(parts ? `input.mk[data-p="${j}"]` : "input.mk"), raw = String(r[ci] == null ? "" : r[ci]).trim();
      if (!el || raw === "") return;
      if (/^(a|ab|abs|absent)$/i.test(raw)) el.value = "";
      else if (!isFinite(Number(raw))) { problems.push(s.name + ": " + t("'{v}' is not a number", { v: raw })); return; }
      else el.value = raw;
      touched = true;
    });
    if (touched) done++;
  }
  return { done, problems };
}
onChange("ex-up", async (el) => {
  const f = el.files && el.files[0];
  if (!f) return;
  const st = X(), u = st.E.subs[st.si], box = $("#ex-up-msg");
  let rows;
  try { rows = await readTable(f); } catch (x) {
    el.value = "";
    return toast(/OLD_XLS/.test(x.message) ? t("Old .xls files are not supported. Save the sheet as .xlsx or CSV.") : /NO_INFLATE/.test(x.message) ? t("This browser cannot open .xlsx. Save the sheet as CSV and upload that.") : t("Could not read this file. Use the template (CSV or .xlsx)."), "bad");
  }
  el.value = "";
  const r = importMarks(rows, u, activeStudents());
  if (r.err) return toast(r.err, "bad");
  paintAll();
  const over = $$("#ex-marks input.err").length;
  const list = r.problems.slice(0, 8).map((x) => `<li>${esc(x)}</li>`).join("") + (r.problems.length > 8 ? `<li>…</li>` : "");
  if (box) box.innerHTML = notice(`<b>${esc(t("{n} students filled from the file.", { n: r.done }))}</b> ${esc(t("Check the numbers, then save."))}${over ? ` <span class="bad">${esc(t("{n} numbers are above the maximum (red).", { n: over }))}</span>` : ""}${list ? `<ul style="margin:6px 0 0 18px">${list}</ul>` : ""}`, r.problems.length || over ? "warn" : "ok");
  toast(t("{n} students filled from the file.", { n: r.done }), "ok");
});

// ----- creating an exam -----
onSubmit("ex-add", async (el) => {
  const f = formData(el.closest("form")), title = f.title.trim(), fm = el.closest("form");
  const P = [];
  fm.querySelectorAll('input[type=checkbox][name^="sx"]').forEach((c) => { if (c.checked) { const i = c.name.slice(2); P.push({ n: c.value, total: f["sm" + i], pm: f["sp" + i] || "", dv: f["sv" + i] || "" }); } });
  if (f.subs) for (const x of f.subs.split(",").map((y) => y.trim()).filter(Boolean)) { const m = x.match(/^(.+?)\s+(\d+(?:\.\d+)?)$/); if (!m) return toast(t("Write each subject like: Bangla 100, English 50.5"), "bad"); P.push({ n: m[1].trim(), total: m[2], pm: "", dv: "" }); }
  if (!title || !P.length) return toast(t("Add a name and tick or write the subjects"), "bad");
  if (new Set(P.map((x) => x.n.toLowerCase())).size < P.length) return toast(t("A subject is listed twice"), "bad");
  const subs = [];
  for (const x of P) {
    const c = checkSetup(x.total, x.pm, x.dv);
    if (c.error) return toast(x.n + ": " + c.error, "bad");
    subs.push({ n: x.n, total: c.total, pm: c.pm, ...(c.dv ? { dv: c.dv, dm: {} } : {}), st: "NH", ws: "d", m: {} });
  }
  const id = await db.add("exams", { bid: S.bid, title, date: f.date || T(), subs, pub: false, pw: false });
  X().eid = id; X().loaded = "";
  logAct("Created exam " + title);
  refresh();
});
onChange("ex-pick", (el) => { const st = X(); st.eid = el.value; st.loaded = ""; refresh(); });
act("ex-sub", (el) => { const st = X(); st.si = +el.dataset.arg; refresh(); });
act("ex-held", async () => {
  const st = X(), e = st.E, u = e.subs[st.si];
  if (isLocked(u)) return;
  collect(u);
  u.st = u.st === "H" ? "NH" : "H";
  await putSubject(e, st.si);
  st.loaded = ""; refresh();
});
act("ex-pub", async () => {
  const e = X().E, on = e.pub === false;
  await db.upd("exams/" + e.id, { pub: on });
  e.pub = on;
  await recalcBatch(e.bid);
  const cur = await db.get("exams/" + e.id);
  if (!on) await syncExam(cur, true).catch(() => {});
  else { await syncExam(cur).catch(() => {}); notify("batch", t("Result published: {n}", { n: e.title }), e.bid); }
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
export async function myResults(force) {
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
// ---------- student dashboard: latest results, each with a small "need recheck" link ----------
let RRL = [];
export async function recentResults() {
  if (!isStudent()) return "";
  RRL = (await myResults()).sort((a, b) => (b.date > a.date ? 1 : b.date < a.date ? -1 : 0)).slice(0, 3);
  if (!RRL.length) return "";
  const done = pageState("rc").done || {};
  return `<section class="card"><div class="card-h"><h3>${esc(t("Latest results"))}</h3>${btn(t("See all"), "nav", { arg: "exams", sm: true, kind: "ghost" })}</div>
    <div class="list">${RRL.map((x, i) => `<div class="item item--click" data-act="rr-open" data-arg="${i}"><div class="item-b"><b class="item-t">${esc(x.title)}</b><span class="mut">${esc(fmtDate(x.date))} · ${n2(x.g)} / ${n2(x.t)} (${f1(x.t ? (x.g / x.t) * 100 : null)})</span>${done[x.eid] ? `<span class="rc rc--ok">${icon("check")}${esc(t("Recheck requested"))}</span>` : `<button type="button" class="rc" data-act="rc-ask" data-arg="${esc(x.eid)}">${icon("edit")}${esc(t("Need recheck"))}</button>`}</div><div class="item-a"><span class="tag tag--gold">#${x.rk} / ${x.n}</span></div></div>`).join("")}</div></section>`;
}
act("rr-open", (el) => { const x = RRL[+el.dataset.arg]; if (x) showDoc(resultSheet(x)); });
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
  ZLIST = subjectsFor(b.cls, g, SD).filter((x) => subjectOk(S.bid, x.s));
  const limited = !!mySubjects(S.bid);
  if (!ZLIST.some((x) => x.s === st.sj)) st.sj = (ZLIST[0] || {}).s;
  const y = ZLIST.find((x) => x.s === st.sj), dn = y ? SD.done[y.s] || [] : [];
  const stu = activeStudents().filter((s) => !g || !s.grp || s.grp === g);
  if (limited && !ZLIST.length) return `${batchPicker()}${empty(t("None of your subjects has a syllabus here yet. Ask the admin."), "list")}`;
  return `${batchPicker()}
  ${b.grp ? "" : `<div class="mb">${select("grp", [["", t("All groups")], ["Science", t("Science")], ["Commerce", t("Commerce")], ["Arts", t("Arts")]], st.grp || "", { "data-change": "sy-grp", label: t("Group") })}</div>`}
  ${y ? `<div class="mb">${select("sj", ZLIST.map((x) => x.s), st.sj, { "data-change": "sy-sj", label: t("Subject") })}</div>
  <div class="card"><div class="card-h"><h3>${esc(y.s)}</h3><span class="mut sm">${dn.length} / ${y.t.length}</span></div>${meter(y.t.length ? (dn.length / y.t.length) * 100 : 0, "var(--ok)")}
    <div class="mt">${y.t.map((x, i) => `<div class="check"><input type="checkbox" class="zt" value="${i}" ${dn.includes(i) ? "checked" : ""}><span>${esc(x)}</span>${canEdit() ? `<button class="icon-btn" style="width:34px;height:34px" data-act="sy-edit" data-arg="${i}" aria-label="${esc(t("Edit"))}">${icon("edit")}</button><button class="icon-btn" style="width:34px;height:34px" data-act="sy-del" data-arg="${i}" aria-label="${esc(t("Delete"))}">${icon("trash")}</button>` : ""}</div>`).join("") || `<p class="mut">${esc(t("No topics."))}</p>`}</div>
    <div class="row mt">${btn(t("Save progress"), "sy-save", { kind: "pri", ic: "check" })}</div>
    ${canEdit() ? `<div class="inline mt"><input id="sy-new" placeholder="${esc(t("New topic name"))}">${btn(t("Add topic"), "sy-add", { ic: "plus" })}</div>` : ""}</div>
  <div class="mt">${card(t("Student confidence") + " · " + y.s, stu.map((s) => { const c = (((M.find((m) => m.sid === s.id) || {}).c || {})[y.s]) || []; return `<details><summary>${esc(s.name)} · ${c.length} / ${y.t.length}</summary>${c.map((i) => `<div class="mut sm">✔ ${esc(y.t[i] || "")}</div>`).join("") || `<p class="mut sm">${esc(t("Nothing ticked yet."))}</p>`}</details>`; }).join("") || `<p class="mut">${esc(t("No students."))}</p>`)}</div>` : empty(t("No syllabus for this class yet."), "list")}
  ${isStaff() ? `<form class="card stack-s mt" data-submit="sy-extra"><h3>${esc(t("Add extra subject"))}</h3>${input("s", { label: t("Subject") })}${select("g", [["", t("All groups")], ["Science", t("Science")], ["Commerce", t("Commerce")], ["Arts", t("Arts")]], "", { label: t("Group") })}${textarea("t", { label: t("Topics / chapters, one per line"), rows: 5 })}<button class="btn btn--pri" type="submit">${icon("plus")}${esc(t("Add subject"))}</button></form>` : ""}
  ${SD.cx.length && isStaff() ? card(t("Extra subjects"), `<div class="list">${SD.cx.map((c, i) => row({ title: c.s, sub: t("{n} topics", { n: c.t.length }) + (c.g ? " · " + t(c.g) : ""), right: btn(t("Delete"), "sy-xdel", { arg: i, sm: true, kind: "bad" }) })).join("")}</div>`) : ""}`;
}
onChange("sy-grp", (el) => { Z().grp = el.value; refresh(); });
onChange("sy-sj", (el) => { Z().sj = el.value; refresh(); });
const putSD = (patch) => db.set("sd/" + S.bid, { bid: S.bid, ...patch }, true);
act("sy-save", async () => {
  const sj = Z().sj;
  if (!subjectOk(S.bid, sj)) return toast(t("This subject is not yours."), "bad");
  SD.done[sj] = $$(".zt").filter((b) => b.checked).map((b) => +b.value);
  await putSD({ done: mySubjects(S.bid) ? { [sj]: SD.done[sj] } : SD.done });
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
  "Subjects and marks": "বিষয় ও নম্বর", "Total": "মোট", "Pass marks": "পাস নম্বর", "Parts (optional)": "বিভাগ (ঐচ্ছিক)", "First Term, Mid Term, Quiz…": "ফার্স্ট টার্ম, মিড টার্ম, কুইজ…", "Draft": "খসড়া", "Held": "হয়েছে", "Not happened": "হয়নি",
  "Submitted - waiting for approval": "জমা - অনুমোদনের অপেক্ষায়", "Total marks must be between 10 and 200": "পূর্ণমান ১০ থেকে ২০০ এর মধ্যে হতে হবে", "Pass marks must be between 0 and the total": "পাস নম্বর ০ থেকে পূর্ণমানের মধ্যে হতে হবে",
  "Write the parts like: Written 70, MCQ 30": "বিভাগ এভাবে লিখুন: Written 70, MCQ 30", "A part is listed twice": "একটি বিভাগ দুইবার আছে", "Each part needs marks above 0": "প্রতিটি বিভাগে ০ এর বেশি নম্বর লাগবে", "The parts must add up to the total ({n})": "বিভাগের নম্বরের যোগফল পূর্ণমানের ({n}) সমান হতে হবে",
  "This exam was changed by someone else. Please open it again.": "এই পরীক্ষা অন্য কেউ বদলেছেন। আবার খুলুন।", "{n} subject(s) are not approved yet. They are left out of the ranks and results.": "{n}টি বিষয় এখনো অনুমোদিত নয়। এগুলো র‍্যাঙ্ক ও ফলাফলে ধরা হয়নি।",
  "Enter a number from 0 to {n}": "০ থেকে {n} এর মধ্যে সংখ্যা দিন", "{v} is more than the maximum {n}": "{v} সর্বোচ্চ {n} এর চেয়ে বেশি", "Pass marks: {n}": "পাস নম্বর: {n}", "Withdraw submission": "জমা ফিরিয়ে নিন", "Approved and locked. Ask the admin to open it again.": "অনুমোদিত ও তালাবদ্ধ। অ্যাডমিনকে আবার খুলে দিতে বলুন।",
  "Save draft": "খসড়া সংরক্ষণ", "Save & approve": "সংরক্ষণ ও অনুমোদন", "Submit for approval": "অনুমোদনের জন্য জমা দিন", "Setup": "সেটআপ", "Sent back": "ফেরত পাঠানো হয়েছে", "Template (CSV)": "টেমপ্লেট (CSV)", "Upload Excel / CSV": "Excel / CSV আপলোড",
  "Entered {a} of {b}": "{b} জনের মধ্যে {a} জনের নম্বর দেওয়া", "{n} wrong": "{n}টি ভুল", "Red = below pass marks": "লাল = পাস নম্বরের নিচে", "Marks are locked.": "নম্বর তালাবদ্ধ।", "Some numbers are wrong (red). Fix them first.": "কিছু সংখ্যা ভুল (লাল)। আগে ঠিক করুন।",
  "Turn on Held first.": "আগে “হয়েছে” চালু করুন।", "{n} students have no marks. They count as absent (0). Continue?": "{n} জনের নম্বর নেই। তারা অনুপস্থিত (০) ধরা হবে। চালিয়ে যাবেন?", "Continue": "চালিয়ে যান", "Submitted. The admin will check it.": "জমা হয়েছে। অ্যাডমিন যাচাই করবেন।",
  "Your marks were approved: {n}": "আপনার নম্বর অনুমোদিত হয়েছে: {n}", "Saved and approved": "সংরক্ষিত ও অনুমোদিত", "Draft saved": "খসড়া সংরক্ষিত", "Back to draft": "খসড়ায় ফিরেছে", "Note for the teacher (optional)": "শিক্ষকের জন্য নোট (ঐচ্ছিক)", "Why is it sent back?": "কেন ফেরত পাঠানো হচ্ছে?",
  "Please check the marks again.": "নম্বর আবার দেখুন।", "Your marks were sent back: {n}": "আপনার নম্বর ফেরত পাঠানো হয়েছে: {n}", "Subject setup": "বিষয়ের সেটআপ", "Leave empty for 33% of the total.": "খালি রাখলে পূর্ণমানের ৩৩%।", "Changing the parts clears the marks of this subject. Continue?": "বিভাগ বদলালে এই বিষয়ের নম্বর মুছে যাবে। চালিয়ে যাবেন?",
  "Not changed": "বদলানো হয়নি", "Some entered marks are above the new total.": "কিছু দেওয়া নম্বর নতুন পূর্ণমানের চেয়ে বেশি।", "The header row (Roll, Name, …) was not found. Use the template.": "হেডার সারি (Roll, Name, …) পাওয়া যায়নি। টেমপ্লেট ব্যবহার করুন।", "Columns not found: {n}": "কলাম পাওয়া যায়নি: {n}",
  "The marks column was not found. Use the template.": "নম্বরের কলাম পাওয়া যায়নি। টেমপ্লেট ব্যবহার করুন।", "student not found": "ছাত্র পাওয়া যায়নি", "'{v}' is not a number": "‘{v}’ সংখ্যা নয়", "Old .xls files are not supported. Save the sheet as .xlsx or CSV.": "পুরনো .xls ফাইল চলে না। .xlsx বা CSV করে সংরক্ষণ করুন।",
  "This browser cannot open .xlsx. Save the sheet as CSV and upload that.": "এই ব্রাউজার .xlsx খুলতে পারে না। CSV করে আপলোড করুন।", "Could not read this file. Use the template (CSV or .xlsx).": "ফাইলটি পড়া যায়নি। টেমপ্লেট (CSV বা .xlsx) ব্যবহার করুন।", "{n} students filled from the file.": "ফাইল থেকে {n} জনের নম্বর বসানো হয়েছে।",
  "Check the numbers, then save.": "সংখ্যাগুলো দেখে নিন, তারপর সংরক্ষণ করুন।", "{n} numbers are above the maximum (red).": "{n}টি সংখ্যা সর্বোচ্চের চেয়ে বেশি (লাল)।", "Result": "ফল", "Failed in {n}": "{n} এ অকৃতকার্য", "Passed": "উত্তীর্ণ",
  "This exam has none of your subjects.": "এই পরীক্ষায় আপনার কোনো বিষয় নেই।", "Other subjects (optional)": "অন্যান্য বিষয় (ঐচ্ছিক)", "Total marks": "পূর্ণমান", "Add a name and tick or write the subjects": "নাম লিখুন এবং বিষয়ে টিক দিন বা বিষয় লিখুন", "A subject is listed twice": "একটি বিষয় দুইবার আছে",
  "None of your subjects has a syllabus here yet. Ask the admin.": "আপনার কোনো বিষয়ের সিলেবাস এখানে এখনো নেই। অ্যাডমিনকে বলুন।", "This subject is not yours.": "এই বিষয়টি আপনার নয়।",
  "Latest results": "সর্বশেষ ফলাফল", "See all": "সব দেখুন", "Need recheck": "রিচেক দরকার", "Recheck requested": "রিচেকের অনুরোধ করা হয়েছে",
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
