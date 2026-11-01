// Monthly cycle, past-month records, progress reports (monthly / yearly) and the result-sheet poster.
import { db } from "./lib-db.js";
import {
  S, esc, t, page, act, onChange, onSubmit, formData, pageState, refresh, isStaff, isStudent, canPublish, instName, T, fmtDate, addBN,
  activeStudents, curBatch, f1, n2, cmp, $, $$, batchOf,
} from "./lib-core.js";
import { icon, avatar, tag, empty, card, row, btn, chips, input, select, batchPicker, ask, toast, showDoc } from "./lib-ui.js";
import { batchData, recalcBatch, getStats, notify, logAct } from "./lib-svc.js";
import { calcBatch, statRow, grade } from "./lib-stats.js";

const noBatch = () => empty(isStudent() ? t("You are not in a batch yet.") : t("Add a batch first."), "layers");
const MN3 = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const BM = ["জানুয়ারি", "ফেব্রুয়ারি", "মার্চ", "এপ্রিল", "মে", "জুন", "জুলাই", "আগস্ট", "সেপ্টেম্বর", "অক্টোবর", "নভেম্বর", "ডিসেম্বর"];
const ZCL = { 4: "৪র্থ", 5: "৫ম", 6: "৬ষ্ঠ", 7: "৭ম", 8: "৮ম", 9: "৯ম", 10: "১০ম", 11: "একাদশ", 12: "দ্বাদশ" };
const ZGP = { Science: "বিজ্ঞান", Commerce: "ব্যবসায় শিক্ষা", Arts: "মানবিক" };
const bd = (n) => String(n).replace(/\d/g, (c) => "০১২৩৪৫৬৭৮৯"[c]);
const gchip = (p) => { const g = grade(p); return `<span style="background:${g.bg};color:${g.fg};padding:2px 9px;border-radius:6px;font-weight:800">${g.g}</span>`; };

// ======================= month =======================
page("month", async () => {
  if (!S.bid) return noBatch();
  const b = curBatch(), st = await getStats(S.bid), stu = activeStudents();
  const rows = stu.map((s) => ({ s, r: (st.rows || {})[s.id] || {} })).sort((a, c) => (a.r.or || 999) - (c.r.or || 999) || cmp(a.s.name, c.s.name));
  const att = (r) => (r.p + r.a ? (r.p / (r.p + r.a)) * 100 : null);
  return `${batchPicker()}
  ${card(t("This month"), `<p class="mut">${esc(t("Month started on {d}", { d: fmtDate(b.start) }))}</p><div class="row">${btn(t("Recalculate"), "mo-recalc", { sm: true, ic: "refresh" })}${btn(t("Start new month"), "mo-new", { kind: "pri", sm: true, ic: "calendar" })}</div>
    <p class="mut sm mt">${esc(t("Starting a new month saves this month's results in Records and begins a fresh count today."))}</p>`)}
  <div class="card mt"><div class="tw"><table class="tbl"><tr><th>${esc(t("Name"))}</th><th class="n">${esc(t("Attendance"))}</th><th class="n">${esc(t("Exam"))}</th><th class="n">${esc(t("Homework"))}</th><th class="n">${esc(t("Overall"))}</th><th class="n">#</th></tr>
  ${rows.map(({ s, r }) => `<tr><td>${esc(s.name)}</td><td class="n">${f1(att(r))}</td><td class="n">${f1(r.ex)}</td><td class="n">${f1(r.hw)}</td><td class="n"><b>${f1(r.ov)}</b></td><td class="n">${r.or || "–"}</td></tr>`).join("") || `<tr><td colspan="6">${esc(t("No students in this batch."))}</td></tr>`}</table></div></div>`;
}, { title: "Month" });
act("mo-recalc", async () => { await recalcBatch(S.bid); toast(t("Recalculated"), "ok"); refresh(); });
act("mo-new", async () => {
  const b = curBatch();
  if (!(await ask(t("Close this month and start a new one today?"), { ok: t("Start new month") }))) return;
  const rows = await recalcBatch(S.bid), to = T();
  const ops = [{ set: ["records/" + db.newId("records"), { bid: b.id, bn: b.name, from: b.start, to, rows: rows.map((r) => ({ name: r.s.name, roll: r.s.roll, ...statRow(r) })) }] }];
  rows.forEach((r) => ops.push({ set: ["users/" + r.s.id + "/hist/" + db.newId("users/" + r.s.id + "/hist"), { bid: b.id, bn: b.name, from: b.start, to, ...statRow(r) }] }));
  ops.push({ upd: ["batches/" + b.id, { start: to }] });
  await db.batch(ops);
  b.start = to;
  await recalcBatch(b.id);
  logAct("Started a new month");
  toast(t("New month started"), "ok");
  refresh();
});

// ======================= records =======================
page("records", async () => {
  if (!S.bid) return noBatch();
  const R = (await db.list("records", ["bid", "==", S.bid])).sort((x, y) => (y.to > x.to ? 1 : -1));
  return `${batchPicker()}${card(t("Past months"), R.map((r) => `<details><summary><b>${fmtDate(r.from)} – ${fmtDate(r.to)}</b></summary><div class="tw"><table class="tbl"><tr><th>${esc(t("Name"))}</th><th class="n">${esc(t("Exam"))}</th><th class="n">#</th><th class="n">${esc(t("Overall"))}</th><th class="n">#</th></tr>${(r.rows || []).slice().sort((x, y) => (x.er || 999) - (y.er || 999)).map((x) => `<tr><td>${esc(x.name || t("Roll {r}", { r: x.roll }))}</td><td class="n">${f1(x.ex)}</td><td class="n">${x.er || "–"}</td><td class="n">${f1(x.ov)}</td><td class="n">${x.or || "–"}</td></tr>`).join("")}</table></div></details>`).join("") || empty(t("Closed months are saved here automatically."), "doc"))}`;
}, { title: "Records" });

// ======================= progress reports =======================
const Rp = () => pageState("rp");
const zsb = (x) => x.sb || String(x.n).split(" – ").slice(1).join(" – ") || x.n;
const zagg = (it) => {
  const m = {};
  it.forEach((x) => { const k = zsb(x), o = (m[k] = m[k] || { n: k, c: 0, g: 0, t: 0, hi: null }); o.c++; o.g += x.g; o.t += x.t; if (!o.hi || (x.t && x.g / x.t > o.hi.g / (o.hi.t || 1))) o.hi = x; });
  return Object.values(m).map((o) => ({ ...o, g: n2(o.g), t: n2(o.t) }));
};
const ZC = "#0b3a8a", BX = "border:1px solid #c9d8ee;background:#f4f8fe;border-radius:10px;padding:12px 14px", TD = "padding:9px 8px;border:0;border-top:1px solid #dbe5f3", TH = "padding:9px 8px;border:0;background:#e6efff;color:#0b2a5c;text-align:left";
const H = (x) => `<div style="display:flex;align-items:center;gap:8px;margin:18px 0 8px"><span style="width:5px;height:22px;background:#1a73e8;border-radius:2px"></span><b style="font-size:18px;color:${ZC}">${x}</b></div>`;
const lb = (l, v) => `<div><div style="font-size:11px;color:#5b6b80">${esc(l)}</div><b>${esc(v)}</b></div>`;
function reportHtml(d) {
  const yearly = d.ty === "y", A = zagg(d.it || []);
  const top = `<div style="display:flex;align-items:center;gap:12px;border-bottom:3px solid ${ZC};padding-bottom:10px"><img src="logo.jpg" alt="" style="width:66px;height:66px;border-radius:50%"><div style="flex:1"><div style="font-size:22px;font-weight:900;color:${ZC}">${esc(instName())}</div><div style="font-size:13px;color:#33507a">${esc(yearly ? t("Yearly progress report") : t("Monthly progress report"))}</div></div><div style="text-align:right;font-size:12px;color:#33507a">${fmtDate(d.from)} – ${fmtDate(d.to)}</div></div>
  <div style="${BX};display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin-top:14px">${lb(t("Student name"), d.name)}${lb(t("Roll"), d.roll)}${lb(t("Batch"), d.bn)}${lb(t("Class"), (d.cls ? t("Class {n}", { n: d.cls }) : "") + (d.grp ? " · " + t(d.grp) : ""))}</div>`;
  const cards = `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px">
    <div style="${BX};background:#fff"><div style="color:#33507a">${esc(t("Class attendance"))}</div><div style="font-size:28px;font-weight:800">${f1(d.at)}</div><div style="font-size:12px">${d.p || 0} ${esc(t("present"))} · ${d.a || 0} ${esc(t("absent"))} · ${d.days || 0} ${esc(t("days"))}</div></div>
    <div style="${BX};background:#fff"><div style="color:#33507a">${esc(t("Homework"))}</div><div style="font-size:28px;font-weight:800">${f1(d.hw)}</div></div>
    <div style="${BX};background:#fff"><div style="color:#33507a">${esc(t("Exam rank"))}</div><div style="font-size:28px;font-weight:800">${d.er ? "#" + d.er : "–"}</div><div style="font-size:12px">${esc(t("of {n} students", { n: d.n || 0 }))}</div></div>
    <div style="${BX};background:#fff"><div style="color:#33507a">${esc(t("Overall"))}</div><div style="font-size:28px;font-weight:800">${f1(d.ov)}</div><div style="font-size:12px">${esc(t("Rank"))} ${d.or ? "#" + d.or : "–"}</div></div></div>`;
  const sig = `<div style="display:flex;gap:16px;margin-top:40px;text-align:center;font-size:13px">${[t("Class teacher"), t("Guardian"), t("Principal")].map((x) => `<div style="flex:1;border-top:1px solid #33507a;padding-top:6px">${esc(x)}</div>`).join("")}</div><div style="font-size:11px;color:#5b6b80;text-align:right;margin-top:10px">${esc(t("Generated"))}: ${esc(d.date || "")}</div>`;
  const comment = `<div style="${BX};min-height:70px"><b>${esc(yearly ? t("Recommendation") : t("Strengths and areas to improve"))}</b><div style="margin-top:4px">${esc(d.cm || "")}</div></div>`;
  if (!yearly) {
    return `<div class="paper">${top}${H(esc(t("Academic performance (exams and tests)")))}<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;border:1px solid #c9d8ee"><tr><th style="${TH}">${esc(t("Subject"))}</th><th style="${TH}">${esc(t("Exams"))}</th><th style="${TH}">${esc(t("Best"))}</th><th style="${TH}">${esc(t("Total"))}</th><th style="${TH}">%</th><th style="${TH}">${esc(t("Grade"))}</th></tr>
    ${A.map((x) => { const p = x.t ? (x.g / x.t) * 100 : null; return `<tr><td style="${TD}"><b>${esc(x.n)}</b></td><td style="${TD}">${x.c}</td><td style="${TD}">${x.hi.g} / ${x.hi.t}</td><td style="${TD}">${x.g} / ${x.t}</td><td style="${TD}">${f1(p)}</td><td style="${TD}">${gchip(p)}</td></tr>`; }).join("") || `<tr><td colspan="6" style="${TD}">${esc(t("No exam in this period"))}</td></tr>`}</table></div>
    <p style="margin:6px 0 0"><b>${esc(t("Overall exam"))}:</b> ${f1(d.ex)} · <b>${esc(t("Grade"))}:</b> ${gchip(d.ex)}</p>${H(esc(t("Attendance and overview")))}${cards}${H(esc(t("Teacher's comment")))}${comment}${sig}</div>`;
  }
  const mp = {};
  (d.it || []).forEach((x) => { if (!x.d) return; const k = +x.d.slice(5, 7) - 1; mp[k] = mp[k] || [0, 0]; mp[k][0] += x.g; mp[k][1] += x.t; });
  const ks = Object.keys(mp).map(Number).sort((a, b) => a - b), pc = (k) => (mp[k][1] ? (mp[k][0] / mp[k][1]) * 100 : 0);
  const Q = (s, q) => { const L = (d.it || []).filter((x) => zsb(x) === s && x.d && Math.floor((+x.d.slice(5, 7) - 1) / 3) === q), g = L.reduce((a, x) => a + x.g, 0), tt = L.reduce((a, x) => a + x.t, 0); return tt ? (g / tt) * 100 : null; };
  const verdict = (s, p) => { const q = [0, 1, 2, 3].map((i) => Q(s, i)).filter((v) => v != null); return q.length > 1 && q[q.length - 1] - q[0] >= 5 ? t("Steady improvement") : p >= 80 ? t("Consistently outstanding") : p >= 70 ? t("Consistent") : p >= 50 ? t("Satisfactory") : t("Needs focused practice"); };
  return `<div class="paper">${top}${H(esc(t("Overall performance growth (month by month)")))}<div style="${BX};background:#fff"><div style="display:flex;align-items:flex-end;gap:8px;height:170px;border-bottom:1px solid #9fb2d8;padding:0 4px">${ks.map((k) => `<div style="flex:1;text-align:center"><div style="font-size:11px;font-weight:700">${Math.round(pc(k))}%</div><div style="height:${Math.max(4, pc(k) * 1.2)}px;background:#1a73e8;border-radius:4px 4px 0 0"></div></div>`).join("") || `<div class="mut">${esc(t("No exam this year"))}</div>`}</div><div style="display:flex;gap:8px;padding:4px">${ks.map((k) => `<div style="flex:1;text-align:center;font-size:11px">${MN3[k]}</div>`).join("")}</div></div>
  ${H(esc(t("Annual subject mastery")))}<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;border:1px solid #c9d8ee"><tr><th style="${TH}">${esc(t("Subject"))}</th><th style="${TH}">Jan–Mar</th><th style="${TH}">Apr–Jun</th><th style="${TH}">Jul–Sep</th><th style="${TH}">Oct–Dec</th><th style="${TH}">${esc(t("Year"))}</th><th style="${TH}">${esc(t("Assessment"))}</th></tr>
  ${A.map((x) => { const p = x.t ? (x.g / x.t) * 100 : 0; return `<tr><td style="${TD}"><b>${esc(x.n)}</b></td>${[0, 1, 2, 3].map((q) => `<td style="${TD}">${Q(x.n, q) == null ? "–" : Math.round(Q(x.n, q)) + "%"}</td>`).join("")}<td style="${TD}"><b>${Math.round(p)}%</b></td><td style="${TD}">${esc(verdict(x.n, p))}</td></tr>`; }).join("") || `<tr><td colspan="7" style="${TD}">${esc(t("No exam this year"))}</td></tr>`}</table></div>
  ${H(esc(t("Attendance, homework and rank (year)")))}${cards}${H(esc(t("Final recommendation")))}${comment}${sig}</div>`;
}
const snapOf = (r, cm, ty, from, to) => {
  const b = curBatch() || {};
  return { ty, bn: b.name || "", cls: b.cls || "", grp: r.s.grp || b.grp || "", from, to, name: r.s.name, roll: r.s.roll, it: r.items.map((x) => ({ n: x.ex + " – " + x.n, sb: x.n, d: x.d, g: x.g, t: x.t })), p: r.p, a: r.a, days: r.days, at: r.at, hw: r.hw, ex: r.ex, er: r.er, ov: r.ov, or: r.or, n: r.n, cm, date: T() };
};
let RR = [], RD = null;
const period = () => { const st = Rp(), b = curBatch(); return st.ty === "y" ? [(st.ry || T().slice(0, 4)) + "-01-01", (st.ry || T().slice(0, 4)) + "-12-31"] : [st.mf || b.start, st.mt || T()]; };
page("reports", async () => {
  if (!S.bid) return noBatch();
  if (isStudent()) return studentReports();
  const st = Rp(); st.ty = st.ty || "m"; st.ry = st.ry || T().slice(0, 4);
  const [from, to] = period(), key = S.bid + "_" + from + "_" + to;
  const d = await batchData(S.bid);
  RR = calcBatch({ students: activeStudents(), ...d, from, to });
  RD = (await db.get("rep/" + key).catch(() => null)) || { c: {} };
  return `${batchPicker()}${chips([{ k: "m", label: t("Monthly report") }, { k: "y", label: t("Yearly report") }], st.ty, "rp-ty")}
  <div class="card stack-s">${st.ty === "y" ? input("ry", { type: "number", label: t("Year"), value: st.ry, "data-change": "rp-year", min: "2000", max: "2100" }) : `<div class="grid g2">${input("mf", { type: "date", label: t("From"), value: from, "data-change": "rp-from" })}${input("mt", { type: "date", label: t("To"), value: to, "data-change": "rp-to" })}</div>`}
    <p class="mut sm">${esc(t("Only published exams are counted. One comment per student; it is printed on the report."))}</p></div>
  <div class="card mt">${RR.map((r, i) => `<div class="stack-s" style="padding:10px 0;border-top:1px solid var(--line)"><div class="row"><b class="sp">${esc(r.s.name)} <span class="mut sm">${esc(t("Roll {r}", { r: r.s.roll }))}</span></b><span class="mut sm">${esc(t("Exam"))} ${f1(r.ex)} · ${esc(t("Overall"))} ${f1(r.ov)}</span></div>
    <input class="cm" data-id="${esc(r.s.id)}" placeholder="${esc(st.ty === "y" ? t("Recommendation") : t("Teacher's comment"))}" value="${esc((RD.c || {})[r.s.id] || "")}">${btn(t("Preview"), "rp-view", { arg: i, sm: true, ic: "eye" })}</div>`).join("") || empty(t("No students in this batch."), "users")}
    <div class="row mt">${btn(t("Save comments"), "rp-save", { ic: "check" })}${canPublish() ? btn(t("Publish to students"), "rp-pub", { kind: "pri", ic: "upload" }) : ""}</div></div>`;
}, { title: "Report" });
act("rp-ty", (el) => { Rp().ty = el.dataset.arg; refresh(); });
onChange("rp-year", (el) => { Rp().ry = el.value; refresh(); });
onChange("rp-from", (el) => { Rp().mf = el.value; refresh(); });
onChange("rp-to", (el) => { Rp().mt = el.value; refresh(); });
const comments = () => { const c = {}; $$(".cm").forEach((i) => { if (i.value.trim()) c[i.dataset.id] = i.value.trim(); }); return c; };
act("rp-view", (el) => { const r = RR[+el.dataset.arg], [f, to] = period(); if (r) showDoc(reportHtml(snapOf(r, comments()[r.s.id] || "", Rp().ty, f, to))); });
const saveComments = async () => { const [f, to] = period(), c = comments(); await db.set("rep/" + S.bid + "_" + f + "_" + to, { bid: S.bid, from: f, to, c }); return c; };
act("rp-save", async () => { await saveComments(); toast(t("Comments saved"), "ok"); });
act("rp-pub", async () => {
  const [f, to] = period(), c = await saveComments(), ty = Rp().ty;
  await db.batch(RR.map((r) => ({ set: ["users/" + r.s.id + "/reports/" + f + "_" + to, snapOf(r, c[r.s.id] || "", ty, f, to)] })));
  notify("batch", ty === "y" ? t("Yearly progress report published") : t("Monthly progress report published"), S.bid);
  logAct("Published progress reports");
  toast(t("Published to students"), "ok");
});
let SR = [];
async function studentReports() {
  const [rep, hist] = await Promise.all([db.list("users/" + S.pid + "/reports").catch(() => []), db.list("users/" + S.pid + "/hist").catch(() => [])]);
  SR = rep.filter((x) => x.ty !== "ex").sort((a, b) => (b.to > a.to ? 1 : -1));
  const H2 = hist.sort((a, b) => (b.to > a.to ? 1 : -1));
  return `${card(t("My reports"), SR.length ? `<div class="list">${SR.map((x, i) => row({ title: (x.ty === "y" ? t("Yearly report") : t("Monthly report")) + " · " + (x.bn || ""), sub: `${fmtDate(x.from)} – ${fmtDate(x.to)}`, right: icon("right"), act: "rp-mine", arg: i })).join("")}</div>` : empty(t("No report has been published yet."), "chart"))}
  ${H2.length ? `<div class="mt">${card(t("Past months"), `<div class="tw"><table class="tbl"><tr><th>${esc(t("Month"))}</th><th class="n">${esc(t("Exam"))}</th><th class="n">#</th><th class="n">${esc(t("Overall"))}</th><th class="n">#</th></tr>${H2.map((x) => `<tr><td>${fmtDate(x.from)} – ${fmtDate(x.to)}</td><td class="n">${f1(x.ex)}</td><td class="n">${x.er || "–"}</td><td class="n">${f1(x.ov)}</td><td class="n">${x.or || "–"}</td></tr>`).join("")}</table></div>`)}</div>` : ""}`;
}
act("rp-mine", (el) => { const x = SR[+el.dataset.arg]; if (x) showDoc(reportHtml(x)); });

// ======================= result-sheet poster =======================
const Y = () => pageState("ys");
const yKey = () => (Y().m === "y" ? Y().yy : Y().mo);
async function buildPoster(b, y, mo) {
  const from = mo ? mo + "-01" : y + "-01-01", to = mo ? mo + "-31" : y + "-12-31", d = await batchData(b.id);
  const R = calcBatch({ students: S.U.filter((s) => s.bid === b.id && s.active !== false), ...d, from, to }).filter((r) => r.ex != null).sort((p, q) => q.ex - p.ex);
  const sm = (r) => r.items.reduce((a, x) => [a[0] + x.g, a[1] + x.t], [0, 0]).map(n2);
  return { bid: b.id, bn: b.name, cls: b.cls || "", year: y, mon: mo || "", top: R.slice(0, 3).map((r) => { const [g, tt] = sm(r); return { name: r.s.name, grp: r.s.grp || "", pic: r.s.pic || "", g, t: tt, ex: r.ex }; }), n: R.length, ap: R.filter((r) => r.ex >= 80).length, a: R.filter((r) => r.ex >= 70 && r.ex < 80).length, pass: R.length ? Math.round((R.filter((r) => r.ex >= 33).length / R.length) * 100) : 0 };
}
export function posterHtml(d) {
  const pl = ["১ম", "২য়", "৩য়"], gd = "linear-gradient(180deg,#ffe066,#f4b400)";
  const card1 = (x, i) => x ? `<div style="flex:1;min-width:0;text-align:center"><div style="width:110px;height:110px;margin:0 auto;border-radius:50%;padding:5px;background:${gd};box-shadow:0 0 0 4px #fff,0 6px 16px rgba(0,0,0,.25)">${x.pic ? `<img src="${esc(x.pic)}" alt="" style="width:100%;height:100%;border-radius:50%;object-fit:cover;display:block">` : `<div style="width:100%;height:100%;border-radius:50%;background:#0b2a80;color:#ffd84d;display:grid;place-items:center;font-size:44px;font-weight:800">${esc([...x.name][0] || "?")}</div>`}</div><div style="margin:-12px auto 0;position:relative;width:86%;background:linear-gradient(180deg,#e53935,#b71c1c);color:#fff;font-weight:800;font-size:18px;padding:4px 0;border-radius:6px">${pl[i]} স্থান</div><div style="background:${gd};border-radius:10px;margin-top:8px;padding:8px 4px;color:#0b1f5c"><div style="font-weight:800;font-size:16px">${esc(x.name)}</div><div style="font-size:12px">শ্রেণি: ${ZCL[d.cls] || esc(d.cls || "–")}${x.grp ? " | বিভাগ: " + (ZGP[x.grp] || esc(x.grp)) : ""}</div><div style="background:#0b2a80;color:#fff;border-radius:999px;margin:6px 6px 0;padding:3px 0;font-size:13px;font-weight:700">মোট নম্বর: ${bd(x.g)} / ${bd(x.t)}</div></div></div>` : '<div style="flex:1"></div>';
  const tile = (l, v, s) => `<div style="flex:1;background:#0b2a80;color:#fff;border-radius:10px;padding:8px 4px;text-align:center"><div style="font-size:12px">${l}</div><div style="font-size:26px;font-weight:800;color:#ffd84d">${v}</div><div style="font-size:11px">${s}</div></div>`;
  const name = instName();
  return `<div style="max-width:640px;margin:auto;background:radial-gradient(circle at 30% 0,#1a47c7,#0b1f5c 70%);color:#fff;border-radius:14px;padding:22px 16px;font-family:'Anek Bangla','Hind Siliguri','Noto Sans Bengali',system-ui,sans-serif">
  <div style="display:flex;align-items:center;gap:10px"><img src="logo.jpg" alt="" style="width:62px;height:62px;border-radius:50%;border:2px solid #ffd84d"><div><div style="font-size:22px;font-weight:900;letter-spacing:.03em">${esc(name.toUpperCase())}</div><div style="font-size:11px;letter-spacing:.2em;color:#ffd84d">LEARN | GROW | EXCEL</div></div></div>
  <div style="text-align:center;margin:14px 0 4px"><div style="font-size:30px;font-weight:900">${d.mon ? "মাসিক" : "বার্ষিক"}</div><div style="font-size:${d.mon ? 44 : 58}px;line-height:1;font-weight:900;font-style:italic;background:${gd};-webkit-background-clip:text;background-clip:text;color:transparent">RESULT ${d.mon ? MN3[+d.mon.slice(5, 7) - 1] + " " : ""}${esc(d.year)}</div><div style="margin-top:8px;font-size:16px">— পরিশ্রমের ফল, সাফল্যের পথ —</div><div style="font-size:13px;color:#ffd84d;margin-top:2px">${d.mon ? BM[+d.mon.slice(5, 7) - 1] + " " + bd(d.year) + " · " : ""}${esc(d.bn)}</div></div>
  <div style="background:#fff;border:4px solid #ffd84d;border-radius:16px;padding:18px 10px 12px;margin-top:14px"><div style="display:flex;gap:8px">${[0, 1, 2].map((i) => card1(d.top[i], i)).join("")}</div><div style="display:flex;gap:6px;margin-top:14px">${tile("মোট শিক্ষার্থী", bd(d.n), d.mon ? "এই মাসে" : "এই বছর")}${tile("A+ পেয়েছে", bd(d.ap), "জন")}${tile("A গ্রেড", bd(d.a), "জন")}${tile("পাশের হার", bd(d.pass) + "%", d.mon ? "এই মাসে" : "এই বছর")}</div></div>
  <div style="display:flex;align-items:center;gap:12px;margin-top:16px;flex-wrap:wrap"><div style="font-size:42px;font-weight:900;color:#ffd84d">অভিনন্দন</div><div><div style="font-size:15px">তোমাদের সাফল্যই আমাদের অনুপ্রেরণা!</div><div style="font-size:14px;color:#ffd84d;font-style:italic">Together towards a brighter future</div></div></div>
  <div style="background:${gd};color:#0b1f5c;border-radius:999px;padding:8px 16px;margin-top:12px;font-weight:700">Powered by ${esc(name)}<div style="font-size:11px;font-weight:500">Result • Student Progress • Better Tomorrow</div></div></div>`;
}
const yLabel = (d) => (d.mon ? MN3[+d.mon.slice(5, 7) - 1] + " " + d.year : d.year);
let YR = null, YD = null, ZY = [];
page("resultsheet", async () => {
  if (!S.bid) return noBatch();
  if (isStudent()) {
    ZY = (await db.list("yr", ["bid", "==", S.me.bid], ["pub", "==", true]).catch(() => [])).sort((a, b) => ((b.mon || b.year) > (a.mon || a.year) ? 1 : -1));
    return card(t("Result sheet"), ZY.length ? `<div class="list">${ZY.map((d, i) => row({ title: yLabel(d) + " · " + d.bn, right: btn(t("View"), "ys-mine", { arg: i, sm: true, kind: "pri" }) })).join("")}</div>` : empty(t("Not published yet."), "trophy"));
  }
  const st = Y(), b = curBatch(), mo = st.m !== "y";
  st.mo = st.mo || T().slice(0, 7); st.yy = st.yy || T().slice(0, 4); st.m = st.m || "m";
  YD = await db.get("yr/" + S.bid + "_" + yKey()).catch(() => null);
  YR = await buildPoster(b, st.m === "m" ? st.mo.slice(0, 4) : st.yy, st.m === "m" ? st.mo : "");
  return `${batchPicker()}${chips([{ k: "m", label: t("Monthly result") }, { k: "y", label: t("Yearly result") }], st.m, "ys-m")}
  <div class="card stack-s">${st.m === "m" ? input("mo", { type: "month", value: st.mo, label: t("Month"), "data-change": "ys-mo" }) : input("yy", { type: "number", value: st.yy, label: t("Year"), "data-change": "ys-yy" })}
    <p class="mut sm">${esc(t("Top 3 students by exam %, A+ / A counts and the pass rate. Only published exams count."))}</p>
    <div class="row">${btn(t("Preview"), "ys-prev", { ic: "eye" })}${canPublish() ? (YD && YD.pub ? btn(t("Unpublish"), "ys-pub", { arg: 0, ic: "lock" }) + btn(t("Update published sheet"), "ys-pub", { arg: 1, kind: "pri", ic: "upload" }) : btn(t("Publish to students"), "ys-pub", { arg: 1, kind: "pri", ic: "upload" })) : ""}</div>
    <div>${YD && YD.pub ? tag(t("Published"), "ok") : tag(t("Not published"), "warn")}</div></div>`;
}, { title: "Result sheet" });
act("ys-m", (el) => { Y().m = el.dataset.arg; refresh(); });
onChange("ys-mo", (el) => { if (el.value) { Y().mo = el.value; refresh(); } });
onChange("ys-yy", (el) => { Y().yy = el.value; refresh(); });
act("ys-prev", () => showDoc(posterHtml(YR)));
act("ys-mine", (el) => { const d = ZY[+el.dataset.arg]; if (d) showDoc(posterHtml(d)); });
act("ys-pub", async (el) => {
  const k = S.bid + "_" + yKey();
  if (el.dataset.arg === "1") {
    if (!YR.top.length) return toast(t("No exam marks in this period."), "bad");
    await db.set("yr/" + k, { ...YR, pub: true, t: Date.now() });
    notify("batch", (Y().m === "m" ? t("Monthly result {k} published", { k: yKey() }) : t("Yearly result {k} published", { k: yKey() })), S.bid);
    toast(t("Published"), "ok");
  } else { await db.upd("yr/" + k, { pub: false }); toast(t("Unpublished"), "ok"); }
  refresh();
});

addBN({
  "This month": "এই মাস", "Month started on {d}": "মাস শুরু {d}", "Recalculate": "আবার হিসাব", "Start new month": "নতুন মাস শুরু", "Starting a new month saves this month's results in Records and begins a fresh count today.": "নতুন মাস শুরু করলে এই মাসের ফল Records এ জমা হবে এবং আজ থেকে নতুন গণনা শুরু হবে।",
  "Name": "নাম", "Attendance": "উপস্থিতি", "Exam": "পরীক্ষা", "Homework": "হোমওয়ার্ক", "Overall": "সার্বিক", "No students in this batch.": "এই ব্যাচে কোনো ছাত্র নেই।", "Recalculated": "আবার হিসাব হয়েছে",
  "Close this month and start a new one today?": "এই মাস বন্ধ করে আজ থেকে নতুন মাস শুরু করবেন?", "New month started": "নতুন মাস শুরু হয়েছে", "Past months": "আগের মাসগুলো", "Closed months are saved here automatically.": "শেষ হওয়া মাসগুলো এখানে নিজে থেকেই জমা হয়।",
  "Yearly progress report": "বার্ষিক অগ্রগতি প্রতিবেদন", "Monthly progress report": "মাসিক অগ্রগতি প্রতিবেদন", "Student name": "ছাত্রের নাম", "Roll": "রোল", "Batch": "ব্যাচ", "Class attendance": "ক্লাসে উপস্থিতি", "present": "উপস্থিত", "absent": "অনুপস্থিত", "days": "দিন",
  "Exam rank": "পরীক্ষার র‍্যাঙ্ক", "of {n} students": "{n} জনের মধ্যে", "Rank": "র‍্যাঙ্ক", "Class teacher": "শ্রেণি শিক্ষক", "Guardian": "অভিভাবক", "Principal": "অধ্যক্ষ", "Generated": "তৈরি", "Recommendation": "সুপারিশ", "Strengths and areas to improve": "শক্তির দিক ও উন্নতির জায়গা",
  "Academic performance (exams and tests)": "একাডেমিক পারফরম্যান্স (পরীক্ষা)", "Subject": "বিষয়", "Exams": "পরীক্ষা", "Best": "সর্বোচ্চ", "Total": "মোট", "Grade": "গ্রেড", "No exam in this period": "এই সময়ে কোনো পরীক্ষা নেই", "Overall exam": "সামগ্রিক পরীক্ষা",
  "Attendance and overview": "উপস্থিতি ও সারসংক্ষেপ", "Teacher's comment": "শিক্ষকের মন্তব্য", "Steady improvement": "ধারাবাহিক উন্নতি", "Consistently outstanding": "ধারাবাহিকভাবে অসাধারণ", "Consistent": "ধারাবাহিক", "Satisfactory": "সন্তোষজনক", "Needs focused practice": "মনোযোগী অনুশীলন দরকার",
  "Overall performance growth (month by month)": "সামগ্রিক অগ্রগতি (মাস ধরে)", "No exam this year": "এ বছর কোনো পরীক্ষা নেই", "Annual subject mastery": "বার্ষিক বিষয়ভিত্তিক দক্ষতা", "Year": "বছর", "Assessment": "মূল্যায়ন", "Attendance, homework and rank (year)": "উপস্থিতি, হোমওয়ার্ক ও র‍্যাঙ্ক (বছর)", "Final recommendation": "চূড়ান্ত সুপারিশ",
  "Monthly report": "মাসিক রিপোর্ট", "Yearly report": "বার্ষিক রিপোর্ট", "From": "থেকে", "To": "পর্যন্ত", "Only published exams are counted. One comment per student; it is printed on the report.": "শুধু প্রকাশিত পরীক্ষা গণনা হয়। প্রতি ছাত্রের একটি মন্তব্য; রিপোর্টে ছাপা হবে।", "Roll {r}": "রোল {r}",
  "Preview": "প্রিভিউ", "Save comments": "মন্তব্য সংরক্ষণ", "Publish to students": "ছাত্রদের জন্য প্রকাশ করুন", "Comments saved": "মন্তব্য সংরক্ষিত", "Yearly progress report published": "বার্ষিক অগ্রগতি রিপোর্ট প্রকাশিত", "Monthly progress report published": "মাসিক অগ্রগতি রিপোর্ট প্রকাশিত", "Published to students": "ছাত্রদের জন্য প্রকাশিত",
  "My reports": "আমার রিপোর্ট", "No report has been published yet.": "এখনো কোনো রিপোর্ট প্রকাশিত হয়নি।", "Month": "মাস", "Result sheet": "ফলাফল শিট", "View": "দেখুন", "Not published yet.": "এখনো প্রকাশিত হয়নি।", "Monthly result": "মাসিক ফলাফল", "Yearly result": "বার্ষিক ফলাফল",
  "Top 3 students by exam %, A+ / A counts and the pass rate. Only published exams count.": "পরীক্ষার % অনুযায়ী সেরা ৩ জন, A+ / A সংখ্যা ও পাশের হার। শুধু প্রকাশিত পরীক্ষা গণনা হয়।", "Unpublish": "প্রকাশ বন্ধ", "Update published sheet": "প্রকাশিত পত্র আপডেট", "Published": "প্রকাশিত", "Not published": "প্রকাশিত নয়",
  "No exam marks in this period.": "এই সময়ে কোনো পরীক্ষার নম্বর নেই।", "Monthly result {k} published": "মাসিক ফল {k} প্রকাশিত", "Yearly result {k} published": "বার্ষিক ফল {k} প্রকাশিত", "Unpublished": "প্রকাশ বন্ধ করা হয়েছে", "Student": "ছাত্র", "Class": "ক্লাস", "Class {n}": "ক্লাস {n}",
});
