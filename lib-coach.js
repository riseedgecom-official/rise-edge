// The built-in study helper: plain functions over the student's own numbers (no network, no DOM, no AI).
// Used by the Study pages (pages-study.js) and tested on its own (test/coach.mjs).
// Every text goes through `t` (the app's translate function) so that Bangla works; `t` is a parameter so the tests can pass a plain one.

const pad = (n) => String(n).padStart(2, "0");
const iso = (d) => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
export const addDays = (day, n) => { const x = new Date(day + "T00:00:00"); x.setDate(x.getDate() + n); return iso(x); };
export const dow = (day) => new Date(day + "T00:00:00").getDay();   // 0 = Sunday ... 5 = Friday (the weekly holiday in Bangladesh)

// ---------- numbers from the student's data ----------
// results = the student's published exam reports (users/<id>/reports, ty "ex"), each with subs: [{n, t, m, ab}]
export function subjectStats(results) {
  const by = {};
  for (const r of results || []) for (const s of r.subs || []) {
    if (s.ab || !(+s.t > 0)) continue;
    const o = (by[s.n] = by[s.n] || { n: s.n, g: 0, t: 0, c: 0 });
    o.g += +s.m || 0; o.t += +s.t; o.c++;
  }
  return Object.values(by).map((o) => ({ ...o, p: Math.round((o.g / o.t) * 100) })).sort((a, b) => a.p - b.p);
}
export const attPct = (att) => (att && att.p + att.a >= 5 ? Math.round((att.p / (att.p + att.a)) * 100) : null);
export const tasksOn = (sp, day) => ((sp && sp.tasks) || []).filter((x) => x.d === day).sort((a, b) => (a.tm || "99").localeCompare(b.tm || "99") || (a.id > b.id ? 1 : -1));
export const minutesOn = (sp, day) => Math.round(+((sp && sp.log) || {})[day] || 0);
// a "study day" = some focus time or a finished task that day
const studied = (sp, day) => minutesOn(sp, day) > 0 || ((sp && sp.tasks) || []).some((x) => x.dn && x.dd === day);
export function streak(sp, today) {
  let d = studied(sp, today) ? today : addDays(today, -1), n = 0;   // today may still be ahead of him: yesterday keeps the streak alive
  while (studied(sp, d) && n < 400) { n++; d = addDays(d, -1); }
  return n;
}
// the two-hour window (start hour) where most of his focus time falls; needs an hour of focus first
export function bestHour(sp) {
  const h = (sp && sp.hrs) || {}, tot = Object.values(h).reduce((a, v) => a + (+v || 0), 0);
  if (tot < 60) return null;
  let best = -1, at = 0;
  for (let i = 0; i < 24; i++) { const v = (+h[i] || 0) + (+h[(i + 1) % 24] || 0); if (v > best) { best = v; at = i; } }
  return at;
}
const hourName = (h) => (h % 12 || 12) + (h < 12 ? " AM" : " PM");

// ---------- the study tip (top of the Study page) ----------
const GENERAL = [
  "Study in short rounds: 25 minutes of focus, then a 5 minute break. Try the Focus timer.",
  "After you read a topic, close the book and write what you remember. It works better than reading it again.",
  "Solve past questions with a time limit. It shows what you really know.",
  "Sleep well before an exam. A tired mind forgets what you studied.",
  "Start with your hardest subject, while your mind is fresh.",
];
export function studyTip(ctx, t) {
  const { today, sp } = ctx, ap = attPct(ctx.att), st = subjectStats(ctx.results), today_ = tasksOn(sp, today);
  const late = ((sp && sp.tasks) || []).filter((x) => !x.dn && x.d < today).length, pend = today_.filter((x) => !x.dn).length, sk = streak(sp, today), bh = bestHour(sp);
  if (ap != null && ap < 75) return { key: "att", text: t("Your attendance is {p}%. Every missed class costs marks, so try not to miss the next ones.", { p: ap }), go: "attendance" };
  if (late) return { key: "late", text: t("You have {n} unfinished tasks from earlier days. Finish one now, or move it to today.", { n: late }), go: "planner" };
  if (st.length && st[0].p < 60) return { key: "weak", text: t("{s} is your lowest subject ({p}%). Give it 30 focused minutes today.", { s: st[0].n, p: st[0].p }), go: "focus" };
  if (bh != null) return { key: "hour", text: t("You focus best between {a} and {b}. Keep your hardest subject for that time.", { a: hourName(bh), b: hourName((bh + 2) % 24) }), go: "planner" };
  if (pend) return { key: "pend", text: t("You have {n} tasks to do today. Start with the hardest one.", { n: pend }), go: "planner" };
  if (!today_.length) return { key: "empty", text: t("Plan before you study: add two tasks for today in the Study planner, or ask the assistant for a plan."), go: "planner" };
  if (sk >= 3) return { key: "streak", text: t("{n} days in a row! Keep it going with a short session today.", { n: sk }), go: "focus" };
  const i = Math.floor(new Date(today + "T00:00:00").getTime() / 864e5) % GENERAL.length;
  return { key: "gen", text: t(GENERAL[i]), go: "focus" };
}

// ---------- a 7-day plan from the weak subjects ----------
// returns tasks {ti, sb, d, tm, mn}; days that already have two open tasks are left alone, and Friday gets one
export function makePlan(ctx, t, days = 7) {
  const { today, sp } = ctx, st = subjectStats(ctx.results), weak = st.filter((x) => x.p < 60).map((x) => x.n), rest = (st.length ? st.map((x) => x.n) : ctx.subjects || []).filter((n) => !weak.includes(n));
  const order = [...weak, ...rest, ...weak, ...rest, ...weak];
  if (!order.length) return [];
  const open = {}, has = new Set();
  for (const x of (sp && sp.tasks) || []) { if (!x.dn) open[x.d] = (open[x.d] || 0) + 1; has.add(x.d + "|" + x.sb); }
  const out = []; let k = 0;
  for (let i = 0; i < days; i++) {
    const d = addDays(today, i), slots = (dow(d) === 5 ? 1 : 2) - (open[d] || 0);
    for (let j = 0; j < slots; j++) {
      let n = 0, sb = order[k++ % order.length];
      while (has.has(d + "|" + sb) && n++ < order.length) sb = order[k++ % order.length];
      if (has.has(d + "|" + sb)) continue;
      has.add(d + "|" + sb);
      const w = weak.includes(sb);
      out.push({ ti: w ? t("Revise {s}", { s: sb }) : t("Practice {s}: solve questions", { s: sb }), sb, d, tm: "", mn: w ? 40 : 30 });
    }
  }
  return out;
}

// ---------- what he typed ----------
const SUB = {
  math: ["math", "গণিত", "ম্যাথ", "অঙ্ক"], english: ["english", "ইংরেজি", "ইংলিশ"], bangla: ["bangla", "বাংলা"], physics: ["physics", "পদার্থ"], chemistry: ["chemistry", "রসায়ন", "কেমিস্ট্রি"],
  biology: ["biology", "জীব"], science: ["science", "বিজ্ঞান"], ict: ["ict", "আইসিটি"], accounting: ["accounting", "হিসাব"], economics: ["economics", "অর্থনীতি"], bgs: ["bgs", "বাংলাদেশ ও বিশ্ব", "bangladesh"],
};
const FAMILY = { math: "calc", physics: "calc", chemistry: "calc", accounting: "calc", science: "calc", ict: "calc", english: "lang", bangla: "lang", biology: "mem", economics: "mem", bgs: "mem" };
const has = (s, list) => list.some((k) => s.includes(k));
export function subjectIn(text, names = []) {
  const s = String(text || "").toLowerCase();
  for (const [k, w] of Object.entries(SUB)) if (has(s, w)) return k;
  for (const n of names) if (n && s.includes(String(n).toLowerCase())) return String(n).toLowerCase();
  return "";
}
// the order matters: the first match wins. "unknown" = something the helper cannot answer from his data
export function detect(text) {
  const s = String(text || "").toLowerCase().trim();
  if (!s) return "unknown";
  if (has(s, ["plan", "routine", "schedule", "timetable", "পরিকল্পনা", "রুটিন", "প্ল্যান"])) return "plan";
  if (has(s, ["weak", "lowest", "improve", "দুর্বল", "উন্নতি"])) return "weak";
  if (has(s, ["attendance", "absent", "উপস্থিতি", "অনুপস্থিত"])) return "attendance";
  if (has(s, ["my result", "my rank", "my marks", "my score", "ranking", "ফলাফল", "র‍্যাঙ্ক", "আমার নম্বর"])) return "result";
  if (has(s, ["today", "my task", "to-do", "todo", "আজকের", "আমার কাজ"])) return "today";
  if (has(s, ["motivat", "tired", "bored", "lazy", "stress", "give up", "অনুপ্রেরণা", "ক্লান্ত", "ভালো লাগে না", "হাল ছেড়ে"])) return "motivate";
  if (has(s, ["focus", "concentrat", "pomodoro", "distract", "মনোযোগ", "ফোকাস"])) return "focus";
  if (has(s, ["tip", "exam", "prepare", "how to study", "পরীক্ষা", "টিপস", "কীভাবে পড়", "কিভাবে পড়"])) return "tips";
  if (subjectIn(s)) return "subject";
  if (/^(hi|hello|hey|salam|assalam|হ্যালো|হাই|সালাম|আসসালাম)/.test(s)) return "hello";
  if (has(s, ["thank", "thanks", "ধন্যবাদ"])) return "thanks";
  return "unknown";
}
// the ones the helper answers from HIS numbers (a real AI is not needed, and nothing about him leaves the app)
export const OWN_DATA = ["plan", "weak", "attendance", "result", "today", "hello", "thanks"];
export const CHIPS = [["tips", "Study tips for exams"], ["plan", "Make my study plan"], ["weak", "My weak subjects"], ["attendance", "How is my attendance?"], ["motivate", "Motivate me"]];

const MOTIVATION = [
  "Small steps count. Study for just 10 minutes now, and see how you feel after.",
  "You do not need to feel ready to start. Starting is what makes you ready.",
  "Every top student was once confused by the same topics you are. Keep going.",
  "Rest is part of studying. Take a short walk, drink water, then come back for one more round.",
];
const FAM_TIPS = {
  calc: ["Practise every day. Do not only read the solved examples.", "Learn the reason behind each formula, not only the formula.", "Keep a notebook of your mistakes and redo them every week."],
  lang: ["Read aloud for ten minutes every day.", "Keep a list of new words and use each in a sentence.", "Write one short paragraph a day and ask your teacher to check it."],
  mem: ["Make short notes and draw diagrams or tables.", "Test yourself with questions without looking at the book.", "Revise the same notes again after one day and after one week."],
  gen: ["Finish one chapter, then solve past questions on it.", "Write down what you could not solve and ask your teacher.", "Revise the same topic again after a few days."],
};

// the answer for one intent: { text, chips: [[intent, label]], add: [tasks] }
export function reply(intent, ctx, t, text = "") {
  const st = subjectStats(ctx.results), ap = attPct(ctx.att), fmt = (d) => d.slice(8) + "/" + d.slice(5, 7);
  const chips = CHIPS.filter(([k]) => k !== intent);
  switch (intent) {
    case "hello": return { text: t("Hi! I am your study assistant. I can make a study plan, find your weak subjects, check your attendance and give exam tips. What do you need?"), chips: CHIPS };
    case "thanks": return { text: t("You are welcome! Keep going, you are doing well."), chips };
    case "plan": {
      const tasks = makePlan(ctx, t);
      if (!tasks.length) return { text: ctx.results && ctx.results.length ? t("Your planner is already full for the next 7 days. Well done!") : t("I do not have subjects to plan yet. Ask your teacher to publish your exam results, or add your own tasks in the Study planner."), chips };
      const lines = tasks.slice(0, 8).map((x) => "• " + fmt(x.d) + " – " + x.ti + " (" + t("{n} min", { n: x.mn }) + ")").join("\n");
      return { text: t("Here is a plan for the next 7 days. Weak subjects come first.") + "\n" + lines + (tasks.length > 8 ? "\n" + t("and {n} more", { n: tasks.length - 8 }) : "") + "\n" + t("Tap the button to add it to your planner."), chips, add: tasks };
    }
    case "weak": {
      if (!st.length) return { text: t("I need your published exam results to find your weak subjects. Ask your teacher to publish them."), chips };
      const w = st.slice(0, 3).map((x) => "• " + x.n + " – " + x.p + "%").join("\n");
      return { text: (st[0].p < 60 ? t("Your weakest subjects:") : t("Your lowest subjects (all above 60%, good work):")) + "\n" + w + "\n" + t("Start with {s}: revise one chapter and solve ten questions.", { s: st[0].n }), chips };
    }
    case "attendance": {
      if (ap == null) return { text: t("Not enough attendance is recorded yet this month."), chips };
      const adv = ap >= 90 ? t("Excellent! Keep it up.") : ap >= 75 ? t("Good, but try not to miss any more classes.") : t("This is low. Missing classes costs marks, so please attend regularly.");
      return { text: t("Your attendance this month is {p}% ({a} present, {b} absent).", { p: ap, a: ctx.att.p, b: ctx.att.a }) + " " + adv, chips };
    }
    case "result": {
      const last = [...(ctx.results || [])].sort((a, b) => (b.date > a.date ? 1 : -1))[0], r = ctx.rank || {};
      if (!last && !r.er) return { text: t("No result is published for you yet."), chips };
      return { text: (last ? t("Your latest exam: {e} – {g} / {t} ({p}%), rank #{r} of {n}.", { e: last.title, g: last.g, t: last.t, p: last.t ? Math.round((last.g / last.t) * 100) : 0, r: last.rk, n: last.n }) + " " : "") + (r.er ? t("This month your exam rank is #{r} of {n}.", { r: r.er, n: r.n || "" }) : ""), chips };
    }
    case "today": {
      const L = tasksOn(ctx.sp, ctx.today);
      if (!L.length) return { text: t("You have no tasks for today. Say \"make my study plan\" or add one in the Study planner."), chips };
      return { text: t("Your tasks for today:") + "\n" + L.map((x) => (x.dn ? "✓ " : "• ") + x.ti + " (" + t("{n} min", { n: x.mn || 0 }) + ")").join("\n"), chips };
    }
    case "motivate": return { text: t(MOTIVATION[Math.floor(Date.now() / 6e4) % MOTIVATION.length]), chips };
    case "focus": return { text: [t("Put your phone away, in another room if you can."), t("Study one subject at a time."), t("Use the Focus timer: 25 minutes of work, then 5 minutes of rest."), t("Write down any distracting thought on paper and go back to the book.")].map((x) => "• " + x).join("\n"), chips, go: "focus" };
    case "tips": return { text: t("Exam tips:") + "\n" + [t("Make a plan for the days left, subject by subject."), t("Solve past questions with a time limit."), t("Revise your own short notes, not the whole book."), t("Sleep at least 7 hours, especially the night before."), t("Start with the questions you know, then the hard ones.")].map((x) => "• " + x).join("\n"), chips };
    case "subject": {
      const k = subjectIn(text, (ctx.subjects || []).concat(st.map((x) => x.n))), mine = st.find((x) => x.n.toLowerCase().includes(k) || (SUB[k] || []).some((w) => x.n.toLowerCase().includes(w)));
      const fam = FAM_TIPS[FAMILY[k] || "gen"];
      return { text: (mine ? t("{s}: your average is {p}%.", { s: mine.n, p: mine.p }) + "\n" : "") + fam.map((x) => "• " + t(x)).join("\n"), chips };
    }
    default: return { text: t("I can help with your study plan, weak subjects, attendance, results, exam tips and focus. For other questions the AI mode must be turned on by the admin. Try one of these:"), chips: CHIPS, unknown: true };
  }
}
