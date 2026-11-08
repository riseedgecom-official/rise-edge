// Pure calculation helpers (no DOM, no database): ranks, grades, fees, syllabus lists.
// Kept dependency-free so they can be tested in plain Node.
import { SYL } from "./data-syllabus.js";

const n2 = (v) => Math.round(v * 100) / 100;

// "same score = same rank" (1,1,2,2,3)
function denseRank(rows, key) {
  const vals = [...new Set(rows.filter((r) => r[key] != null).map((r) => Math.round(r[key] * 100)))].sort((x, y) => y - x);
  return (r) => (r[key] == null ? null : vals.indexOf(Math.round(r[key] * 100)) + 1);
}

// Attendance %, exam %, performance %, overall % and ranks of every student of a batch for a period.
// students: [{id,...}]  att: [{date,A,E}]  exams: [{date,pub,title,subs}]  perf: published assessments [{date,max,m:{studentId:marks}}]
export function calcBatch({ students, att = [], exams = [], perf = [], from, to = "9999-12-31" }) {
  const A = att.filter((d) => d.date >= from && d.date <= to);
  const E = exams.filter((e) => e.date >= from && e.date <= to && e.pub !== false);
  const H = perf.filter((h) => h.date >= from && h.date <= to && +h.max > 0 && h.pub !== false);
  const rows = students.map((s) => {
    let p = 0, a = 0, g = 0, tot = 0;
    const items = [];
    for (const d of A) {
      if ((d.A || []).includes(s.id)) a++;
      else if (!(d.E || []).includes(s.id)) p++;
    }
    for (const e of E) {
      for (const u of e.subs || []) {
        if (!counted(u)) continue;
        const m = +((u.m || {})[s.id] || 0);
        tot += u.total; g += m;
        items.push({ ex: e.title, n: u.n, d: e.date, g: m, t: u.total });
      }
    }
    const at = p + a ? (p / (p + a)) * 100 : null;
    const pv = H.filter((h) => (h.m || {})[s.id] != null && Number.isFinite(+h.m[s.id])).map((h) => Math.min(100, Math.max(0, (+h.m[s.id] / h.max) * 100)));
    const pfp = pv.length ? pv.reduce((x, y) => x + y) / pv.length : null;
    const pr = [at, pfp].filter((v) => v != null);
    return {
      id: s.id, s, items, p, a, days: A.length, at, pf: pfp,
      ex: tot ? (g / tot) * 100 : null,
      ov: pr.length ? pr.reduce((x, y) => x + y) / pr.length : null,
      gt: n2(g), tt: n2(tot),
    };
  });
  const re = denseRank(rows, "ex"), ro = denseRank(rows, "ov");
  return rows.map((r) => ({ ...r, er: re(r), or: ro(r), n: rows.length }));
}

// compact row stored in bstat/{batch} (what a student is allowed to see)
export const statRow = (r) => ({ ex: r.ex, er: r.er, ov: r.ov, or: r.or, p: r.p, a: r.a, pf: r.pf });

// A subject counts in ranks, reports and results only when it was held AND its marks are final.
// ws: "d" draft | "s" submitted, waiting for approval | "a" approved (no ws = old data = final).
export const counted = (u) => u.st === "H" && (!u.ws || u.ws === "a");

// Rank list for ONE exam (all counted subjects added together)
export function examRows(exam, students) {
  const held = (exam.subs || []).filter(counted);
  if (!held.length) return [];
  const t = n2(held.reduce((a, u) => a + u.total, 0));
  const R = students.map((s) => ({ s, g: n2(held.reduce((a, u) => a + (+(u.m || {})[s.id] || 0), 0)) }));
  const vs = [...new Set(R.map((r) => r.g))].sort((a, b) => b - a);
  return R.map((r) => ({
    s: r.s, g: r.g, t, rk: vs.indexOf(r.g) + 1, n: R.length,
    subs: held.map((u) => {
      const x = { n: u.n, t: u.total, m: +((u.m || {})[r.s.id] || 0), ab: (u.m || {})[r.s.id] == null };
      if (u.pm > 0) x.pm = u.pm;
      if (Array.isArray(u.dv) && u.dv.length) { const d = (u.dm || {})[r.s.id] || {}; x.pt = u.dv.map((p) => ({ n: p.n, t: p.t, m: +d[p.n] || 0 })); }
      return x;
    }),
  })).sort((a, b) => a.rk - b.rk);
}

// Bangladesh style grade from a percentage
export function grade(p) {
  if (p == null) return { g: "–", bg: "#b0b8c4", fg: "#333" };
  if (p >= 80) return { g: "A+", bg: "#1d9a5b", fg: "#fff" };
  if (p >= 70) return { g: "A", bg: "#cfe3ff", fg: "#0b3a8a" };
  if (p >= 60) return { g: "A-", bg: "#dbeaff", fg: "#0b3a8a" };
  if (p >= 50) return { g: "B", bg: "#ffe08a", fg: "#5a4300" };
  if (p >= 40) return { g: "C", bg: "#ffd0a0", fg: "#6a3500" };
  if (p >= 33) return { g: "D", bg: "#ffc4b0", fg: "#6a2000" };
  return { g: "F", bg: "#f5b5b0", fg: "#7a0f0f" };
}

// ---------- fees ----------
export const DEFAULT_FEE = 2500;
// personal fee > published fee of that month > batch fee > default fee
export function feeFor(student, batch, month, { INST = {}, BF = {} } = {}) {
  if (+student.fo > 0) return +student.fo;
  const pub = BF[(student.bid || (batch || {}).id) + "_" + month];
  if (+pub > 0) return +pub;
  if (batch && +batch.fee > 0) return +batch.fee;
  return +INST.fee > 0 ? +INST.fee : DEFAULT_FEE;
}
export const paidIn = (pays, sid, m) => n2(pays.filter((p) => p.sid === sid && p.m === m).reduce((a, p) => a + (+p.amt || 0), 0));

// ---- month arithmetic on "YYYY-MM" strings (December -> January rolls the year) ----
const MRE = /^\d{4}-\d{2}$/;
export const isMonth = (m) => MRE.test(m || "");
export function nextMonth(m, n = 1) {
  const y = +m.slice(0, 4), mo = +m.slice(5, 7) - 1 + n;
  const yy = y + Math.floor(mo / 12), mm = ((mo % 12) + 12) % 12;
  return yy + "-" + String(mm + 1).padStart(2, "0");
}
// the month of a time stamp, in Bangladesh time (Asia/Dhaka)
export function monthOfTime(ms) {
  if (!(+ms > 0)) return "";
  try {
    const p = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dhaka", year: "numeric", month: "2-digit" }).formatToParts(new Date(+ms));
    return p.find((x) => x.type === "year").value + "-" + p.find((x) => x.type === "month").value;
  } catch (e) {
    const d = new Date(+ms);
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
  }
}

// ---- smart monthly fee ----
// The fee of month M is DUE on the 1st day of month M+1. A student never owes a month before his first fee month
// (= the month he registered). Nothing is stored for the automatic fees: they are worked out from the start month,
// the amount rules (feeFor) and the payments, so they can never be created twice and a payment only touches its own month.
// first fee month: the admin's own choice (fm) > the month the account was made (createdAt) > the month it was approved (ad)
export function feeStart(u, pays = [], prs = []) {
  if (isMonth(u.fm)) return u.fm;
  const c = monthOfTime(u.createdAt) || monthOfTime(u.ad);
  if (c) return c;
  const own = [...pays, ...prs].filter((x) => x.sid === u.id && isMonth(x.m)).map((x) => x.m).sort();
  return own[0] || "";   // unknown -> the plan starts this month, so nothing old is invented
}
// one month of one student. state: none (before he joined) | soon (not due yet) | unpaid | partial | paid
export function monthStatus(u, batch, m, today, ctx, pays, start) {
  const cur = today.slice(0, 7), paid = paidIn(pays, u.id, m);
  const last = pays.filter((p) => p.sid === u.id && p.m === m).map((p) => p.d || "").sort().pop() || "";
  if (start && m < start && paid <= 0) return { m, fee: 0, paid: 0, due: 0, state: "none", last: "", dueOn: nextMonth(m) + "-01" };
  const fee = start && m < start ? paid : feeFor(u, batch, m, ctx);    // money taken before the first fee month is kept, but no fee is invented
  const dueNow = m < cur, left = Math.max(0, n2(fee - paid));
  const state = paid >= fee && (paid > 0 || fee === 0) ? "paid" : paid > 0 ? "partial" : dueNow ? "unpaid" : "soon";
  return { m, fee, paid, due: dueNow ? left : 0, left, state, last, dueNow, dueOn: nextMonth(m) + "-01" };
}
// the whole picture of a student: rows newest first, what he owes, and what was already owed before the latest month
export function feePlan(u, batch, today, ctx, pays = [], prs = []) {
  const cur = today.slice(0, 7), start = feeStart(u, pays, prs) || cur, lastDue = nextMonth(cur, -1);
  const all = [];
  for (let m = start, i = 0; m <= lastDue && i < 120; m = nextMonth(m), i++) all.push(m);
  // money or a pending request for this month / a later month: show that month too (paid in advance)
  const early = new Set([...pays, ...prs].filter((x) => x.sid === u.id && isMonth(x.m) && x.m >= cur).map((x) => x.m));
  [...early].sort().forEach((m) => all.push(m));
  const rows = all.map((m) => {
    const r = monthStatus(u, batch, m, today, ctx, pays, start);
    return { ...r, pend: prs.find((x) => x.sid === u.id && x.m === m && x.st === "new"), rej: prs.filter((x) => x.sid === u.id && x.m === m && x.st === "no").sort((a, c) => c.t - a.t)[0], ok: r.state === "paid" };
  }).reverse();
  const owing = rows.filter((r) => r.due > 0);
  const outstanding = n2(owing.reduce((a, r) => a + r.due, 0));
  const prev = n2(owing.filter((r) => r.m !== lastDue).reduce((a, r) => a + r.due, 0));
  return { rows, start, cur, lastDue, outstanding, prev, prevN: owing.filter((r) => r.m !== lastDue).length, owingN: owing.length, nextDue: start <= cur ? { m: cur, on: nextMonth(cur) + "-01" } : { m: start, on: nextMonth(start) + "-01" } };
}

// ---- extra fees the admin adds to one student (collection "sf"): {sid, amt, note, pays:[{a,d}]} ----
export const manualPaid = (f) => n2((f.pays || []).reduce((a, p) => a + (+p.a || 0), 0));
export function manualState(f) {
  const paid = manualPaid(f), amt = +f.amt || 0;
  return { paid, left: Math.max(0, n2(amt - paid)), state: paid >= amt && amt > 0 ? "paid" : paid > 0 ? "partial" : "unpaid" };
}
export const manualDue = (list) => n2((list || []).reduce((a, f) => a + manualState(f).left, 0));

// ---------- roll ids ----------
export const rollPrefix = (role, year) => "REA" + (role === "student" ? "S" : "T") + "-" + year + "-";
export const rollOf = (role, year, n) => rollPrefix(role, year) + String(n).padStart(3, "0");
export const counterKey = (role, year) => (role === "student" ? "S" : "T") + year;

// ---------- ready-made batches ----------
// A batch belongs to a class (+ group for class 9-12) and may be for Boys ("M"), Girls ("F") or everybody ("" = mixed, the old kind).
export const GROUPS = ["Science", "Commerce", "Arts"];
export const GD_WORD = { M: "Boys", F: "Girls" };
export const isGd = (g) => g === "M" || g === "F";
export const batchTitle = (cls, grp, gd) => (cls ? "Class " + cls : "Batch") + (+cls >= 9 && grp ? " " + grp : "") + (isGd(gd) ? " – " + GD_WORD[gd] : "");
const autoId = (cls, grp, gd) => "auto-c" + cls + (grp ? "-" + grp.toLowerCase() : "") + (isGd(gd) ? "-" + gd.toLowerCase() : "");
export const batchSpec = (cls, grp, gd) => ({ id: autoId(cls, grp, gd), name: batchTitle(cls, grp, gd), cls: "" + cls, grp: grp || "", gd: isGd(gd) ? gd : "" });
// the batches a new academy starts with: every class (and group), one for the boys and one for the girls
export function defaultBatches() {
  const L = [];
  for (const c of [4, 5, 6, 7, 8]) for (const gd of ["M", "F"]) L.push(batchSpec(c, "", gd));
  for (const c of [9, 10, 11, 12]) for (const g of GROUPS) for (const gd of ["M", "F"]) L.push(batchSpec(c, g, gd));
  return L;
}
// is there already a batch with exactly this class / group / gender?
export const hasBatch = (list, cls, grp, gd) => (list || []).some((b) => String(b.cls || "") === String(cls) && (b.grp || "") === (grp || "") && (b.gd || "") === (isGd(gd) ? gd : ""));
// every class / group that has a batch, once: [{cls, grp}]
export function classGroups(list) {
  const seen = new Set(), out = [];
  for (const b of list || []) {
    const cls = String(b.cls || ""), grp = +cls >= 9 ? b.grp || "" : "";
    if (!cls || (+cls >= 9 && !grp) || seen.has(cls + "|" + grp)) continue;
    seen.add(cls + "|" + grp); out.push({ cls, grp });
  }
  return out;
}
// Find the batch for a class (+ group for class 9-12) and gender. A boy goes to the Boys batch, a girl to the Girls batch;
// when there is no batch for that gender yet, the old mixed batch of the class is used. Closed batches (off) are never chosen.
// Without a known gender only a mixed batch fits (so nobody lands in the wrong batch).
export function findBatch(list, cls, grp, gd) {
  cls = String(cls || "");
  if (!cls) return null;
  const g = +cls >= 9 ? grp || "" : "";
  if (+cls >= 9 && !g) return null;
  const M = (list || []).filter((b) => String(b.cls || "") === cls && (b.grp || "") === g && b.off !== true);
  const pick = (L) => L.find((b) => b.auto) || L[0] || null;
  if (isGd(gd)) return pick(M.filter((b) => b.gd === gd)) || pick(M.filter((b) => !isGd(b.gd)));
  return pick(M.filter((b) => !isGd(b.gd)));
}

// ---------- syllabus ----------
// "All" ticked in a subject: a -1 inside the ticked list means every topic (the subject counts as 100%, even when it has no topics yet).
// It lives in the same list (sd.done[subject] for the class, ms.c[subject] for a student), so no new field is needed.
export const ALL = -1;
export const picked = (a, n = Infinity) => [...new Set((a || []).filter((i) => i >= 0 && i < n))];
export const allOn = (a, n) => (a || []).includes(ALL) || (n > 0 && picked(a, n).length >= n);
export const doneN = (a, n) => (allOn(a, n) ? n : picked(a, n).length);
export const donePct = (a, n) => (allOn(a, n) ? 100 : n ? (picked(a, n).length / n) * 100 : 0);
export const doneText = (a, n) => (n ? doneN(a, n) + " / " + n : allOn(a, n) ? "100%" : "0%");
// sd = syllabus doc of the batch: {done:{subject:[idx]}, tl:{subject:[topics]}, cx:[{s,t,g}]}
// -> [{s, t:[topics], custom:boolean}]
export function subjectsFor(cls, grp, sd) {
  const c = String(cls || "");
  const tl = (sd && sd.tl) || {};
  const base = ((SYL[c] || {})[+c >= 9 ? grp || "" : ""] || []).map((x) => ({ s: x.s, t: Array.isArray(tl[x.s]) ? tl[x.s] : x.t, custom: false }));
  const extra = ((sd && sd.cx) || []).filter((x) => !x.g || !grp || x.g === grp).map((x) => ({ s: x.s, t: x.t, custom: true, g: x.g || "" }));
  return [...base, ...extra];
}
