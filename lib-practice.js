// Practice sets: the pure part (no DOM, no network, no translation): what the AI is asked, how its answer is read and cleaned,
// how a set is checked before it is sent, and how a student's answers are scored.
//   ps/<id>  { bid, ti, sb, by, bn, d, u, nt, qs: [{id, q, o: [2-4 options], a (index of the right one), e (why), h (how to solve), ed?}], sq: [{id, q, a}], ai }
//   pt/<setId>_<studentId>  { sid, qid, bid, a: {questionId: chosen index}, n, t, k (tries), fl: {questionId: true} (reported as wrong) }
// A set is always checked and sent by a teacher / admin; marks of a set are NOT part of the exams.
export const MAX_Q = 40;        // multiple-choice questions in one set
export const MAX_SQ = 30;       // short questions in one set
export const MAX_NOTES = 6000;  // characters of notes
export const LIM = { ti: 120, sb: 60, q: 500, opt: 200, ex: 700, how: 700, ans: 900 };

const str = (v, n) => String(v == null ? "" : v).replace(/\r/g, "").trim().slice(0, n);
export const qid = () => "q" + Math.random().toString(36).slice(2, 7) + Date.now().toString(36).slice(-2);
export const blankMcq = () => ({ id: qid(), q: "", o: ["", "", "", ""], a: 0, e: "", h: "" });
export const blankShort = () => ({ id: qid(), q: "", a: "" });

// the model is told to answer with JSON only, but may add a code fence or a sentence around it
export function parseJson(text) {
  let s = String(text || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  const o = s.indexOf("{"), a = s.indexOf("["), first = o < 0 ? a : a < 0 ? o : Math.min(o, a);
  if (first < 0) throw Object.assign(new Error("The AI did not answer with a list."), { code: "empty" });
  const open = s[first], close = open === "{" ? "}" : "]", end = s.lastIndexOf(close);
  if (end <= first) throw Object.assign(new Error("The AI answer was cut off."), { code: "empty" });
  let v;
  try { v = JSON.parse(s.slice(first, end + 1)); } catch (e) { throw Object.assign(new Error("The AI answer could not be read."), { code: "empty" }); }
  return Array.isArray(v) ? { questions: v } : v;
}

const LETTER = { a: 0, b: 1, c: 2, d: 3, "ক": 0, "খ": 1, "গ": 2, "ঘ": 3 };
const optText = (x) => str(x, LIM.opt).replace(/^\(?[A-Da-d]\)?[.)]\s+/, "").replace(/^\(?[ক-ঘ]\)?[.)]\s+/, "").trim();

// one question as the AI may have written it -> { id, q, o[4], a, e, h } or null
function oneMcq(x) {
  if (!x || typeof x !== "object") return null;
  const q = str(x.q || x.question, LIM.q);
  let o = x.o || x.options || x.choices;
  if (!q || !Array.isArray(o)) return null;
  o = o.map(optText).filter(Boolean);
  if (o.length < 2) return null;
  let a = x.a !== undefined ? x.a : x.answer !== undefined ? x.answer : x.correct;
  let i = -1;
  if (typeof a === "number") i = a;
  else if (typeof a === "string") {
    const s = a.trim();
    if (/^\d+$/.test(s)) i = +s;
    else if (s.length <= 3 && LETTER[s.replace(/[().\s]/g, "").toLowerCase()] !== undefined) i = LETTER[s.replace(/[().\s]/g, "").toLowerCase()];
    else i = o.findIndex((z) => z === optText(s));
  }
  if (!Number.isInteger(i) || i < 0 || i >= o.length || i > 3) return null;
  o = o.slice(0, 4);
  if (new Set(o).size !== o.length) return null;   // two identical options: the question is not clear
  while (o.length < 4) o.push("");
  return { id: qid(), q, o, a: i, e: str(x.e || x.explanation || x.why, LIM.ex), h: str(x.h || x.how || x.steps, LIM.how) };
}
export const mcqFrom = (list) => (Array.isArray(list) ? list : []).map(oneMcq).filter(Boolean).slice(0, MAX_Q);
export const shortFrom = (list) => (Array.isArray(list) ? list : []).map((x) => {
  if (!x || typeof x !== "object") return null;
  const q = str(x.q || x.question, LIM.q), a = str(x.a || x.answer, LIM.ans);
  return q && a ? { id: qid(), q, a } : null;
}).filter(Boolean).slice(0, MAX_SQ);

// what came back for a task -> { title, qs, sq, nt }; throws (code "empty" | "unreadable") when there is nothing to use
export function fromAi(task, raw) {
  const obj = typeof raw === "string" ? parseJson(raw) : raw;
  if (!obj || typeof obj !== "object") throw Object.assign(new Error("empty"), { code: "empty" });
  if (obj.error) throw Object.assign(new Error(str(obj.error, 80)), { code: "unreadable" });
  const out = { title: str(obj.title, LIM.ti), qs: [], sq: [], nt: "" };
  if (task === "mcq") out.qs = mcqFrom(obj.questions || obj.mcq || obj.items);
  else if (task === "short") out.sq = shortFrom(obj.questions || obj.short || obj.items);
  else out.nt = str(obj.notes || obj.summary || obj.text || obj.answer, MAX_NOTES);
  if (!out.qs.length && !out.sq.length && !out.nt) throw Object.assign(new Error("empty"), { code: "empty" });
  return out;
}

// ---------- the request ----------
export function staffSystem({ inst, cls, grp }) {
  return [
    "You help the teachers of " + inst + ", a coaching centre in Bangladesh (NCTB curriculum, classes 4 to 12), to prepare practice material for their students.",
    "You may be given photos of a book page, a question paper or handwritten notes. Read them carefully. If a photo cannot be read or is not study material, answer {\"error\":\"unreadable\"}.",
    "Answer with ONE JSON object only. No other text, no markdown.",
    "Write in the language of the material or of the teacher's request (Bangla or English). Use simple words that suit the class.",
    "Be accurate. Never invent facts. If you are not sure of an answer, leave that question out.",
    "Never include names, phone numbers or other personal details.",
    cls ? "Class: " + cls + (grp ? " " + grp : "") + "." : "",
  ].filter(Boolean).join("\n");
}
export const TASKS = ["mcq", "short", "summary", "solve"];
export function staffPrompt({ task, count = 10, subject = "", text = "", photos = 0 }) {
  const n = Math.max(1, Math.min(task === "short" ? MAX_SQ : MAX_Q, Math.round(+count) || 10));
  const how = {
    mcq: "Make " + n + " multiple-choice questions. Reply with: {\"title\":\"a short title\",\"questions\":[{\"q\":\"the question\",\"o\":[\"option 1\",\"option 2\",\"option 3\",\"option 4\"],\"a\":0,\"e\":\"why the right option is right and why the others are wrong, under 60 words\",\"h\":\"for a calculation: the steps to solve it, otherwise an empty string\"}]}. Exactly 4 different options. \"a\" is the zero-based index (0 to 3) of the right option. Vary which option is right. Do not use \"all of the above\".",
    short: "Make " + n + " short questions with model answers. Reply with: {\"title\":\"a short title\",\"questions\":[{\"q\":\"the question\",\"a\":\"the model answer, under 60 words\"}]}.",
    summary: "Summarise the topic as study notes for students: short headings, bullet points, key definitions and formulas, under 250 words. Reply with: {\"title\":\"a short title\",\"notes\":\"the notes as plain text with line breaks\"}.",
    solve: "Solve and explain the question or questions step by step so that a student learns the method. Reply with: {\"title\":\"a short title\",\"notes\":\"the solution as plain text with line breaks\"}.",
  }[task] || "";
  return [how, subject ? "Subject: " + subject + "." : "", photos ? "The material is in the " + (photos > 1 ? photos + " photos" : "photo") + " attached." : "", text ? "Teacher's request or topic: " + String(text).slice(0, 1000) : ""].filter(Boolean).join("\n");
}

// ---------- checking a set before it is sent ----------
// d = { ti, sb, nt, qs, sq } as the teacher edited it -> { set, problems: [{ code, n }] }. Empty option boxes are dropped and the right answer follows its option.
export function cleanSet(d) {
  const problems = [], used = new Set();
  const id = (x) => { let k = x && /^[a-z0-9]{1,24}$/i.test(x) ? x : qid(); while (used.has(k)) k = qid(); used.add(k); return k; };
  const ti = str(d.ti, LIM.ti);
  if (!ti) problems.push({ code: "title" });
  const qs = [];
  (d.qs || []).forEach((x, i) => {
    const q = str(x.q, LIM.q), opts = (x.o || []).map((z) => str(z, LIM.opt));
    if (!q) return problems.push({ code: "q", n: i + 1 });
    const keep = opts.map((z, k) => [z, k]).filter(([z]) => z);
    if (keep.length < 2) return problems.push({ code: "opts", n: i + 1 });
    const r = keep.findIndex(([, k]) => k === x.a);
    if (r < 0) return problems.push({ code: "ans", n: i + 1 });
    if (new Set(keep.map(([z]) => z)).size !== keep.length) return problems.push({ code: "dup", n: i + 1 });
    const out = { id: id(x.id), q, o: keep.map(([z]) => z), a: r, e: str(x.e, LIM.ex), h: str(x.h, LIM.how) };
    if (x.ed) out.ed = +x.ed || 0;
    qs.push(out);
  });
  const sq = [];
  (d.sq || []).forEach((x, i) => {
    const q = str(x.q, LIM.q), a = str(x.a, LIM.ans);
    if (!q || !a) return problems.push({ code: "short", n: i + 1 });
    sq.push({ id: id(x.id), q, a });
  });
  const nt = str(d.nt, MAX_NOTES);
  if (!qs.length && !sq.length && !nt && !problems.length) problems.push({ code: "none" });
  return { set: { ti, sb: str(d.sb, LIM.sb), nt, qs, sq }, problems };
}

// ---------- marks of a try (never added to the exams) ----------
// a = { questionId: chosen index }. A question left empty counts as wrong.
export function scoreSet(set, a = {}) {
  const rows = (set.qs || []).map((q, i) => {
    const pick = Number.isInteger(a[q.id]) ? a[q.id] : -1;
    return { id: q.id, i, pick, right: q.a, ok: pick === q.a };
  });
  const got = rows.filter((r) => r.ok).length, total = rows.length;
  return { got, total, pct: total ? Math.round((got / total) * 100) : 0, rows };
}

// the teacher's view: tries = every student's latest try of this set
export function setStats(set, tries) {
  const T = (tries || []).filter((x) => x && x.a);
  const per = (set.qs || []).map((q) => {
    const right = T.filter((x) => x.a[q.id] === q.a).length;
    const flags = T.filter((x) => x.fl && x.fl[q.id] && (+x.t || 0) >= (+q.ed || 0)).length;
    const pct = T.length ? Math.round((right / T.length) * 100) : null;
    return { id: q.id, right, flags, pct, check: (T.length >= 3 && pct < 35) || flags >= 2 };
  });
  const sc = T.map((x) => scoreSet(set, x.a).pct);
  return { n: T.length, avg: sc.length ? Math.round(sc.reduce((p, c) => p + c, 0) / sc.length) : null, per };
}
