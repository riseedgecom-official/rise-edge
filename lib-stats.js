// Pure calculation helpers (no DOM, no database): ranks, grades, fees, syllabus lists.
// Kept dependency-free so they can be tested in plain Node.
import { SYL } from "./data-syllabus.js";

const n2 = (v) => Math.round(v * 100) / 100;

// "same score = same rank" (1,1,2,2,3)
function denseRank(rows, key) {
  const vals = [...new Set(rows.filter((r) => r[key] != null).map((r) => Math.round(r[key] * 100)))].sort((x, y) => y - x);
  return (r) => (r[key] == null ? null : vals.indexOf(Math.round(r[key] * 100)) + 1);
}

// Attendance %, exam %, homework %, overall % and ranks of every student of a batch for a period.
// students: [{id,...}]  att: [{date,A,E}]  exams: [{date,pub,title,subs}]  hw: [{date,D}]
export function calcBatch({ students, att = [], exams = [], hw = [], from, to = "9999-12-31" }) {
  const A = att.filter((d) => d.date >= from && d.date <= to);
  const E = exams.filter((e) => e.date >= from && e.date <= to && e.pub !== false);
  const H = hw.filter((h) => h.date >= from && h.date <= to);
  const rows = students.map((s) => {
    let p = 0, a = 0, g = 0, tot = 0;
    const items = [];
    for (const d of A) {
      if ((d.A || []).includes(s.id)) a++;
      else if (!(d.E || []).includes(s.id)) p++;
    }
    for (const e of E) {
      for (const u of e.subs || []) {
        if (u.st !== "H") continue;
        const m = +((u.m || {})[s.id] || 0);
        tot += u.total; g += m;
        items.push({ ex: e.title, n: u.n, d: e.date, g: m, t: u.total });
      }
    }
    const at = p + a ? (p / (p + a)) * 100 : null;
    const hwp = H.length ? (H.filter((h) => (h.D || []).includes(s.id)).length / H.length) * 100 : null;
    const pr = [at, hwp].filter((v) => v != null);
    return {
      id: s.id, s, items, p, a, days: A.length, at, hw: hwp,
      ex: tot ? (g / tot) * 100 : null,
      ov: pr.length ? pr.reduce((x, y) => x + y) / pr.length : null,
      gt: n2(g), tt: n2(tot),
    };
  });
  const re = denseRank(rows, "ex"), ro = denseRank(rows, "ov");
  return rows.map((r) => ({ ...r, er: re(r), or: ro(r), n: rows.length }));
}

// compact row stored in bstat/{batch} (what a student is allowed to see)
export const statRow = (r) => ({ ex: r.ex, er: r.er, ov: r.ov, or: r.or, p: r.p, a: r.a, hw: r.hw });

// Rank list for ONE exam (all held subjects added together)
export function examRows(exam, students) {
  const held = (exam.subs || []).filter((u) => u.st === "H");
  if (!held.length) return [];
  const t = n2(held.reduce((a, u) => a + u.total, 0));
  const R = students.map((s) => ({ s, g: n2(held.reduce((a, u) => a + (+(u.m || {})[s.id] || 0), 0)) }));
  const vs = [...new Set(R.map((r) => r.g))].sort((a, b) => b - a);
  return R.map((r) => ({
    s: r.s, g: r.g, t, rk: vs.indexOf(r.g) + 1, n: R.length,
    subs: held.map((u) => ({ n: u.n, t: u.total, m: +((u.m || {})[r.s.id] || 0), ab: (u.m || {})[r.s.id] == null })),
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

// last 12 months (newest first), from the first month with any fee activity up to this month
export function feeMonths(today, extra = []) {
  const cur = today.slice(0, 7);
  const ks = [...extra, cur].filter((m) => /^\d{4}-\d{2}$/.test(m || "")).sort();
  const last = ks[ks.length - 1] > cur ? ks[ks.length - 1] : cur;
  const out = [];
  let y = +ks[0].slice(0, 4), m = +ks[0].slice(5, 7);
  while (y + "-" + String(m).padStart(2, "0") <= last && out.length < 60) {
    out.push(y + "-" + String(m).padStart(2, "0"));
    if (++m > 12) { m = 1; y++; }
  }
  return out.reverse().slice(0, 12);
}

// ---------- roll ids ----------
export const rollPrefix = (role, year) => "REA" + (role === "student" ? "S" : "T") + "-" + year + "-";
export const rollOf = (role, year, n) => rollPrefix(role, year) + String(n).padStart(3, "0");
export const counterKey = (role, year) => (role === "student" ? "S" : "T") + year;

// ---------- ready-made batches ----------
export const GROUPS = ["Science", "Commerce", "Arts"];
export function defaultBatches() {
  const L = [4, 5, 6, 7, 8].map((c) => ({ id: "auto-c" + c, name: "Class " + c, cls: "" + c, grp: "" }));
  for (const c of [9, 10, 11, 12]) for (const g of GROUPS) L.push({ id: "auto-c" + c + "-" + g.toLowerCase(), name: "Class " + c + " " + g, cls: "" + c, grp: g });
  return L;
}
// find the batch for a class (+ group for class 9-12)
export function findBatch(list, cls, grp) {
  cls = String(cls || "");
  if (!cls) return null;
  const g = +cls >= 9 ? grp || "" : "";
  if (+cls >= 9 && !g) return null;
  const M = (list || []).filter((b) => String(b.cls || "") === cls && (b.grp || "") === g);
  return M.find((b) => b.auto) || M[0] || null;
}

// ---------- syllabus ----------
// sd = syllabus doc of the batch: {done:{subject:[idx]}, tl:{subject:[topics]}, cx:[{s,t,g}]}
// -> [{s, t:[topics], custom:boolean}]
export function subjectsFor(cls, grp, sd) {
  const c = String(cls || "");
  const tl = (sd && sd.tl) || {};
  const base = ((SYL[c] || {})[+c >= 9 ? grp || "" : ""] || []).map((x) => ({ s: x.s, t: Array.isArray(tl[x.s]) ? tl[x.s] : x.t, custom: false }));
  const extra = ((sd && sd.cx) || []).filter((x) => !x.g || !grp || x.g === grp).map((x) => ({ s: x.s, t: x.t, custom: true, g: x.g || "" }));
  return [...base, ...extra];
}
