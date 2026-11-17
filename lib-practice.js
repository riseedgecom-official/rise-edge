// Practice sets: the pure part (no DOM, no network, no translation): what the AI is asked, how its answer is read and cleaned,
// how a set is checked before it is sent, and how a student's answers are scored.
//   ps/<id>  { bid, ti, sb, by, bn, d, u, nt, qs: [{id, q, o: [2-4 options], a (index of the right one), c (topic), b (Bloom level), e (why it is right), w (why students get it wrong), h (how to solve), ed?}], sq: [{id, q, a}], ai }
//   pt/<setId>_<studentId>  { sid, qid, bid, a: {questionId: chosen index}, n, t, k (tries), fl: {questionId: true} (reported as wrong) }
// A set is always checked and sent by a teacher / admin; marks of a set are NOT part of the exams.
export const MAX_Q = 40;        // multiple-choice questions in one set
export const MAX_SQ = 30;       // short questions in one set
export const MAX_NOTES = 6000;  // characters of notes
export const LIM = { ti: 120, sb: 60, q: 500, opt: 200, ex: 700, how: 700, ans: 900, c: 80, why: 700, b: 40 };

const str = (v, n) => String(v == null ? "" : v).replace(/\r/g, "").trim().slice(0, n);
export const qid = () => "q" + Math.random().toString(36).slice(2, 7) + Date.now().toString(36).slice(-2);
export const blankMcq = () => ({ id: qid(), q: "", o: ["", "", "", ""], a: 0, c: "", b: "", e: "", w: "", h: "" });
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

// the number the AI gives to a question of the draft it changed (0 = a new question)
const nOf = (x) => { const n = Math.round(+(x && (x.n !== undefined ? x.n : x.number))); return n > 0 && n <= 99 ? n : 0; };

// one question as the AI may have written it -> { id, q, o[2-4 + empty], a, c (topic), b (Bloom level), e (why it is right), w (why students get it wrong), h (how to solve) } or null (keepN: also the number of the draft question it is based on)
function oneMcq(x, keepN) {
  if (!x || typeof x !== "object") return null;
  const q = str(x.q || x.question, LIM.q);
  let o = x.o || x.options || x.choices;
  if (!q || !Array.isArray(o)) return null;
  o = o.map(optText).filter(Boolean);
  if (o.length < 2) return null;
  let a = x.a !== undefined ? x.a : x.correctIndex !== undefined ? x.correctIndex : x.answer !== undefined ? x.answer : x.correct;
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
  const out = { id: qid(), q, o, a: i, c: str(x.c || x.concept || x.topic, LIM.c), b: str(x.b || x.bloomLevel || x.bloom, LIM.b), e: str(x.e || x.explanation || x.why, LIM.ex), w: str(x.w || x.whyWrong, LIM.why), h: str(x.h || x.how || x.steps || x.stepByStep, LIM.how) };
  if (keepN) out.n = nOf(x);
  return out;
}
export const mcqFrom = (list, keepN = false) => (Array.isArray(list) ? list : []).map((x) => oneMcq(x, keepN)).filter(Boolean).slice(0, MAX_Q);
export const shortFrom = (list, keepN = false) => (Array.isArray(list) ? list : []).map((x) => {
  if (!x || typeof x !== "object") return null;
  const q = str(x.q || x.question, LIM.q), a = str(x.a || x.answer, LIM.ans);
  if (!q || !a) return null;
  return keepN ? { id: qid(), q, a, n: nOf(x) } : { id: qid(), q, a };
}).filter(Boolean).slice(0, MAX_SQ);

// the AI changed the teacher's draft: orig = the questions of the draft, ret = what came back (each with n: the number of the draft question it is based on, 0 = new).
// A question keeps the id of the one it came from, so the tries and the reports of the students still belong to it. When the AI sent mostly new
// questions instead of the changed whole list, they are added after the old ones and nothing is lost.
export function mergeRefined(orig, ret) {
  const strip = ({ n, ...x }) => x;
  const known = ret.filter((x) => x.n >= 1 && x.n <= orig.length).length;
  if (orig.length && known < Math.ceil(orig.length / 2)) return [...orig, ...ret.filter((x) => !(x.n >= 1 && x.n <= orig.length)).map(strip)];
  const used = new Set();
  return ret.map((x) => {
    const o = x.n >= 1 && x.n <= orig.length && !used.has(x.n) ? orig[x.n - 1] : null;
    if (o) used.add(x.n);
    return o ? { ...strip(x), id: o.id } : strip(x);
  });
}

// the topics of the questions that went wrong (for "Revise these"), at most 5
export const weakTopics = (set, rows) => [...new Set((rows || []).filter((r) => !r.ok).map((r) => ((set.qs || [])[r.i] || {}).c).filter(Boolean))].slice(0, 5);

// ---------- what the teacher chooses (the same choices as the ShikkhaAI Co-Pilot; the labels are what the AI reads) ----------
export const DIFS = ["easy", "medium", "hard", "board"];            // how hard
export const KINDS = ["mcq", "scenario", "tf"];                      // what kind of multiple-choice question
export const LVLS = ["mixed", "know", "under", "apply", "hots"];     // the thinking level (Bloom; NCTB: জ্ঞান, অনুধাবন, প্রয়োগ, উচ্চতর দক্ষতা)
export const LANGS = ["auto", "bn", "en"];                           // the language of the questions
export const COUNTS = [3, 4, 5, 8, 10, 15, 20, 30];
export const DIF_LABEL = { easy: "Easy", medium: "Medium", hard: "Hard", board: "Board Standard" };
export const KIND_LABEL = { mcq: "MCQ (4 Options)", scenario: "উদ্দীপক ভিত্তিক (Scenario)", tf: "True / False" };
export const LVL_LABEL = { mixed: "Mixed (Knowledge to Application)", know: "Knowledge (জ্ঞানমূলক)", under: "Comprehension (অনুধাবন)", apply: "Application (প্রয়োগমূলক)", hots: "Higher-Order (উচ্চতর দক্ষতা)" };
export const LANG_LABEL = { auto: "Auto-Detect (Clean Bengali / English)", bn: "বাংলা (Bengali)", en: "English" };
const oneLine = (v, n) => String(v == null ? "" : v).replace(/\s+/g, " ").trim().slice(0, n);

// the structured answer the AI must give (the schema of the ShikkhaAI Co-Pilot, Gemini's own format). "number" is the one addition: it is the number
// the question had in the draft (0 = a new one), so that a question that stays keeps its id (the tries and the reports of the students belong to it).
const QFIELDS = {
  question: { type: "STRING" }, options: { type: "ARRAY", items: { type: "STRING" } }, correctIndex: { type: "INTEGER" }, concept: { type: "STRING" },
  bloomLevel: { type: "STRING" }, whyWrong: { type: "STRING" }, stepByStep: { type: "STRING" }, explanation: { type: "STRING" },
};
const QREQ = ["question", "options", "correctIndex", "concept", "bloomLevel", "whyWrong", "stepByStep", "explanation"];
export const MCQ_SCHEMA = {
  type: "OBJECT",
  properties: {
    title: { type: "STRING" }, subject: { type: "STRING" }, detectedIntentSummary: { type: "STRING" }, assistantReply: { type: "STRING" },
    questions: { type: "ARRAY", items: { type: "OBJECT", properties: { ...QFIELDS, number: { type: "INTEGER" } }, required: QREQ } },
  },
  required: ["title", "subject", "detectedIntentSummary", "assistantReply", "questions"],
};
export const ONE_SCHEMA = { type: "OBJECT", properties: QFIELDS, required: QREQ };
export const CARDS_SCHEMA = { type: "ARRAY", items: { type: "OBJECT", properties: { front: { type: "STRING" }, back: { type: "STRING" } }, required: ["front", "back"] } };

// what came back for a task -> { title, sb, qs, sq, nt, und (what the AI understood), say (its reply to the teacher) }; throws (code "empty" | "unreadable") when there is nothing to use.
// edit = the AI was given a draft: qs then carry n (the number of the draft question each is based on, 0 = new). The error then has .say: what the AI answered.
export function fromAi(task, raw, edit = false) {
  const obj = typeof raw === "string" ? parseJson(raw) : raw;
  if (!obj || typeof obj !== "object") throw Object.assign(new Error("empty"), { code: "empty" });
  if (obj.error) throw Object.assign(new Error(str(obj.error, 80)), { code: "unreadable" });
  const out = { title: str(obj.title, LIM.ti), sb: str(obj.subject, LIM.sb), qs: [], sq: [], nt: "", und: str(obj.understood || obj.detectedIntentSummary, 200), say: str(obj.reply || obj.assistantReply, 400) };
  const empty = () => Object.assign(new Error("empty"), { code: "empty", say: out.say });
  if (task === "regen") {
    const one = oneMcq(Array.isArray(obj.questions) ? obj.questions[0] : obj);
    if (!one) throw empty();
    out.qs = [one];
    return out;
  }
  if (task === "mcq") out.qs = mcqFrom(obj.questions || obj.mcq || obj.items, edit);
  else if (task === "short") out.sq = shortFrom(obj.questions || obj.short || obj.items);
  else out.nt = str(obj.notes || obj.summary || obj.text || obj.answer, MAX_NOTES);
  if (!out.qs.length && !out.sq.length && !out.nt) throw empty();
  return out;
}

// flashcards of a topic (a student asks): [{ front, back }]
export function cardsFrom(raw) {
  const obj = typeof raw === "string" ? parseJson(raw) : raw;
  const list = Array.isArray(obj) ? obj : obj && (obj.questions || obj.cards || obj.flashcards || obj.items);
  const cards = (Array.isArray(list) ? list : []).map((x) => ({ front: str(x && x.front, 200), back: str(x && x.back, 500) })).filter((x) => x.front && x.back).slice(0, 8);
  if (!cards.length) throw Object.assign(new Error("empty"), { code: "empty" });
  return cards;
}

// ---------- the request ----------
// The system instruction of the Co-Pilot: the four parts of ShikkhaAI's (Banglish, files, the draft, quality) with the choices of the teacher put in.
// opts: inst, cls, grp, task, strict (only from the files), kind, level, lang
export function staffSystem({ inst, cls, grp, task = "mcq", strict = false, kind = "mcq", level = "mixed", lang = "auto" }) {
  const q = task === "mcq";
  return [
    "You are the Live Gemini Academic Co-Pilot of " + inst + ", a coaching centre in Bangladesh (NCTB curriculum, classes 4 to 12), for its Teachers & Admins.",
    "1. **Messy Banglish & Unstructured Text Mastery**:",
    "   - Teachers write in messy Banglish (e.g., \"bhai class 9 physics bol o goti niye 4ta math mcq banao banglay\", \"english tense theke 5ta tricky question dao\").",
    "   - Decode their exact academic intent, requested count, math/trick needs, and output clean, publication-grade Bengali (বাংলা) or English (never output broken Banglish in the final questions).",
    "   - Small hints: \"math thake\" = include calculations, \"student ra confuse hoy\" = use tricky wrong options, \"uddipok\" = a question with a stimulus, \"banglay\" = write in Bangla, \"ektu hard\" = a bit harder.",
    "2. **Multimodal Vision & File Reading**:",
    "   - If images (textbook pages, handwritten notes, diagrams) or documents (PDF, TXT, CSV) are attached, extract concepts directly from them. Read all text, formulas, tables and diagrams carefully.",
    "   - Source Mode: " + (strict ? "Strictly generate questions ONLY from the uploaded file/image." : "Combine uploaded file/image content with the teacher prompt."),
    q ? "3. **Conversational Draft Co-Pilot**:" : "3. **Draft**:",
    q ? "   - If EXISTING DRAFT QUESTIONS are provided and the teacher gives a follow-up edit command (e.g. \"2 number ta hard koro\", \"aro 2ta math add koro\", \"shob banglay translate koro\"), update the existing draft accordingly! Otherwise create a fresh assessment."
      : "   - Make new material for the request. Do not repeat what the teacher already has.",
    "4. **Pedagogical Quality**:",
    q ? "   - Question Type: " + (KIND_LABEL[kind] || KIND_LABEL.mcq) + (kind === "tf" ? " (Each question is a statement to judge. Use exactly 2 options: [\"True\",\"False\"], in Bangla [\"সত্য\",\"মিথ্যা\"])." : " (Always provide 4 different options; for Scenario/উদ্দীপক ভিত্তিক, include a short 2-3 line scenario stem inside 'question').") : "",
    q ? "   - Target Bloom's Level: " + (LVL_LABEL[level] || LVL_LABEL.mixed) + "." : "",
    "   - Output Language Preference: " + (LANG_LABEL[lang] || LANG_LABEL.auto) + ".",
    q ? "   - Every question MUST include 'whyWrong' (why students get tricked) and 'stepByStep' (numbered solution steps)." : "   - Be clear and exact. Short questions have a model answer; notes are short and well ordered.",
    "Answer with ONE JSON object only. No other text, no markdown. Be accurate. Never invent facts: if you are not sure of an answer, leave that question out. Never include names, phone numbers or other personal details.",
    "If nothing can be read, or it is not study material, give no questions and say so in assistantReply.",
    cls ? "Class: " + cls + (grp ? " " + grp : "") + "." : "",
  ].filter(Boolean).join("\n");
}
export const TASKS = ["mcq", "short", "summary", "solve"];

// what the AI sees of the teacher's draft (numbered from 1): the fields of the schema
export const draftJson = (d) => JSON.stringify((d.qs || []).map((x, i) => ({
  number: i + 1, question: x.q, options: (x.o || []).filter(Boolean), correctIndex: x.a, concept: x.c || "", bloomLevel: x.b || "",
  whyWrong: x.w || "", stepByStep: x.h || "", explanation: x.e || "",
})));

// The user message. mcq = the Co-Pilot (a new set, or the changes asked for when there is a draft); short / summary / solve = our extras.
// opts: task, count, subject, text (the teacher's words), grade, dif, kind, level, lang, draft ({qs})
export function staffPrompt({ task, count = 10, subject = "", text = "", grade = "", dif = "medium", kind = "mcq", level = "mixed", lang = "auto", draft = null }) {
  const n = Math.max(1, Math.min(task === "short" ? MAX_SQ : MAX_Q, Math.round(+count) || 10));
  const cmd = "Teacher's Command: \"" + String(text || "").replace(/"/g, "'").slice(0, 1000) + "\"";
  const set = (extra) => [
    "Default Settings (Override if teacher specified different count/language/difficulty inside their prompt):",
    grade ? "- Grade: " + grade : "", subject ? "- Subject: " + subject : "",
    "- Difficulty: " + (DIF_LABEL[dif] || DIF_LABEL.medium),
    "- Question Count: " + n,
    ...extra,
    "- Language: " + (LANG_LABEL[lang] || LANG_LABEL.auto),
  ].filter(Boolean);
  if (task === "mcq") {
    const has = draft && draft.qs && draft.qs.length;
    return [
      cmd,
      ...set(["- Format: " + (KIND_LABEL[kind] || KIND_LABEL.mcq), "- Bloom's Level: " + (LVL_LABEL[level] || LVL_LABEL.mixed)]),
      has ? "\nEXISTING DRAFT QUESTIONS (Update this list if user is requesting edits/additions/translations, or replace if asking for a brand new topic). \"number\" is the number of the question in this draft:\n" + draftJson(draft) : "",
      "Reply with: {\"title\":\"a short title\",\"subject\":\"the subject\",\"detectedIntentSummary\":\"one short sentence: what you understood\",\"assistantReply\":\"one short sentence to the teacher\",\"questions\":[{" + (has ? "\"number\":1," : "") + "\"question\":\"...\",\"options\":[\"...\"],\"correctIndex\":0,\"concept\":\"the topic, under 8 words\",\"bloomLevel\":\"...\",\"whyWrong\":\"why students get it wrong\",\"stepByStep\":\"numbered steps\",\"explanation\":\"why the right option is right, under 60 words\"}]}. \"correctIndex\" is the zero-based index of the right option." + (has ? " Return the COMPLETE list the draft should become, in order: the questions that stay (copy them exactly, with their number), the ones you changed (with their number), new ones (number 0). If the teacher asks for a brand new topic, return only new questions (number 0)." : ""),
    ].filter(Boolean).join("\n");
  }
  const how = {
    short: "Make " + n + " short questions with model answers. Reply with: {\"title\":\"a short title\",\"subject\":\"the subject\",\"detectedIntentSummary\":\"one short sentence: what you understood\",\"assistantReply\":\"one short sentence to the teacher\",\"questions\":[{\"question\":\"the question\",\"answer\":\"the model answer, under 60 words\"}]}.",
    summary: "Summarise the topic as study notes for students: short headings, bullet points, key definitions and formulas, under 250 words. Reply with: {\"title\":\"a short title\",\"detectedIntentSummary\":\"one short sentence: what you understood\",\"assistantReply\":\"one short sentence to the teacher\",\"notes\":\"the notes as plain text with line breaks\"}.",
    solve: "Solve and explain the question or questions step by step so that a student learns the method. Reply with: {\"title\":\"a short title\",\"detectedIntentSummary\":\"one short sentence: what you understood\",\"assistantReply\":\"one short sentence to the teacher\",\"notes\":\"the solution as plain text with line breaks\"}.",
  }[task] || "";
  return [cmd, ...set([]), how].filter(Boolean).join("\n");
}

// one question again (the Co-Pilot's own request)
export const REGEN_SYSTEM = "Output 1 valid MCQ with 4 options, whyWrong misconception note, and stepByStep solution.\nAnswer with ONE JSON object only. Be accurate. Never invent facts. Never include names, phone numbers or other personal details.";
export const regenPrompt = ({ title = "", grade = "", dif = "medium", question = "", lang = "auto" }) =>
  "Generate 1 fresh alternative question for \"" + oneLine(title, 120) + "\" (" + [oneLine(grade, 40), DIF_LABEL[dif] || DIF_LABEL.medium].filter(Boolean).join(", ") + "). Make it different from: \"" + oneLine(question, LIM.q) + "\". Language: " + (LANG_LABEL[lang] || LANG_LABEL.auto) + ".";

// what the AI tutor of one question is told (a student asks about a question he got wrong): the tutor of ShikkhaAI, with our safety lines
export function tutorSystem({ inst, cls }) {
  return [
    "You are a kind, encouraging Academic AI Tutor helping a student understand their mistake. Answer in clear, easy-to-follow Bengali (with English scientific/technical terms in brackets where useful). Keep it concise and step-by-step.",
    "The student is of " + inst + ", a coaching centre in Bangladesh. If the student writes in English, answer in English. Under 150 words. Explain the method; do not just repeat the answer.",
    "The answer marked as right was written or checked by the teacher. If you are sure it is wrong, say so politely and tell the student to press \"This answer looks wrong\" so that the teacher checks it.",
    "Only talk about this question and its topic. Never ask for or repeat personal details.",
    cls ? "The student is in " + cls + "." : "",
  ].filter(Boolean).join("\n");
}
export function tutorPrompt({ q, o = [], pick = -1, right = 0, w = "", e = "", h = "", doubt = "" }) {
  const opts = o.filter(Boolean);
  return [
    "Question: \"" + oneLine(q, LIM.q) + "\"",
    "Student's Answer: \"" + (pick >= 0 && opts[pick] != null ? oneLine(opts[pick], LIM.opt) : "Skipped (উত্তর দেওয়া হয়নি)") + "\"",
    "Correct Answer: \"" + (opts[right] != null ? oneLine(opts[right], LIM.opt) : "") + "\"",
    "Why Wrong Note: \"" + oneLine(w || e, LIM.ex) + "\"",
    "Step-by-Step Solution: \"" + oneLine(h || e, LIM.how) + "\"",
    "",
    "Student's Follow-up Doubt: \"" + oneLine(doubt, 300) + "\"",
  ].join("\n");
}

// flashcards of a topic (the AI Smart Flashcards of ShikkhaAI)
export const CARDS_SYSTEM = "Create short Q&A or Concept/Definition revision flashcards.\nOnly study content. Answer with the JSON list only. Never ask for or include personal details.";
export const cardsPrompt = (topic) => "Create 4 concise, high-yield study flashcards on \"" + oneLine(topic, 120).replace(/"/g, "'") + "\" in Bengali with English key terms.";

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
    const c = str(x.c, LIM.c); if (c) out.c = c;
    const b = str(x.b, LIM.b); if (b) out.b = b;
    const w = str(x.w, LIM.why); if (w) out.w = w;
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
