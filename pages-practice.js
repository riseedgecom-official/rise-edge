// Practice sets.
//   Teacher / admin:  "AI assistant" (aitools): photo and / or a topic -> the AI makes a first draft (MCQs, short questions, notes, a solution);
//                     the teacher EDITS and checks it, then sends it to a batch.   "Practice sets" (psets) and one set with its results (pset).
//   Student:          "Practice" (practice) and one set to solve (solve): his score, which answers were wrong, why and how to get them right.
// The AI only drafts. A set exists only after a teacher / admin has checked and sent it (50% human control). Nothing here is added to the exam marks.
//   ps/<id> one set for ONE batch, pt/<setId>_<studentId> a student's latest try  (shapes: see lib-practice.js, rules: firestore.rules)
import { db } from "./lib-db.js";
import { S, esc, t, page, act, onChange, onInput, pageState, refresh, go, isStaff, isTeacher, isStudent, addBN, fmtDate, dhakaDate, ago, activeStudents, T } from "./lib-core.js";
import { icon, avatar, card, row, btn, empty, notice, tag, toast, form, info, ask, chips, meter, ring } from "./lib-ui.js";
import { timeId, notify } from "./lib-svc.js";
import { aiConfig, aiReady, askStaffAI, aiProblem } from "./lib-ai.js";
import { blankMcq, blankShort, fromAi, cleanSet, scoreSet, setStats, MAX_Q, MAX_SQ, MAX_NOTES, LIM, TASKS } from "./lib-practice.js";

addBN({
  // menu and page names
  "Practice": "অনুশীলন", "Practice sets": "অনুশীলন সেট", "Score": "স্কোর", "AI assistant": "এআই সহকারী",
  "The practice sets are for students.": "অনুশীলন সেট শুধু শিক্ষার্থীদের জন্য।", "This page is for teachers and the admin.": "এই পেজ শিক্ষক ও অ্যাডমিনের জন্য।",
  // the AI
  "The AI is not turned on yet.": "এআই এখনো চালু করা হয়নি।",
  "The AI could not read the photo. Take it again in good light and closer to the page.": "এআই ছবিটি পড়তে পারেনি। ভালো আলোয় পেজের আরও কাছ থেকে আবার তুলুন।",
  "The AI did not give anything usable. Try again with a clearer photo or a topic.": "এআই কাজে লাগার মতো কিছু দেয়নি। আরও পরিষ্কার ছবি বা বিষয় দিয়ে আবার চেষ্টা করুন।",
  "The AI is busy or its daily limit is reached. Try again later.": "এআই এখন ব্যস্ত অথবা আজকের সীমা শেষ। পরে আবার চেষ্টা করুন।",
  "The AI is not set up correctly yet. Ask the admin to check Settings > AI study assistant.": "এআই এখনো ঠিকমতো সেট করা হয়নি। অ্যাডমিনকে সেটিংস > এআই পড়ার সহকারী দেখতে বলুন।",
  "The AI could not answer that. Change the photo or the words and try again.": "এআই এটার উত্তর দিতে পারেনি। ছবি বা লেখা বদলে আবার চেষ্টা করুন।",
  "The AI could not be reached (internet?).": "এআই এর সাথে যোগাযোগ করা যায়নি (ইন্টারনেট?)।",
  // checking a set
  "Write a title for the set.": "সেটের একটি শিরোনাম লিখুন।", "Question {n} has no text.": "প্রশ্ন {n} এ কোনো লেখা নেই।", "Question {n} needs at least 2 options.": "প্রশ্ন {n} এ অন্তত ২টি অপশন লাগবে।",
  "Question {n}: tick the right answer, and it must not be an empty option.": "প্রশ্ন {n}: সঠিক উত্তরে টিক দিন, আর সেটি ফাঁকা অপশন হতে পারবে না।", "Question {n} has two equal options.": "প্রশ্ন {n} এ দুটি অপশন একই।",
  "Short question {n} needs a question and an answer.": "ছোট প্রশ্ন {n} এ প্রশ্ন ও উত্তর দুটোই লাগবে।", "Add at least one question, or some notes.": "অন্তত একটি প্রশ্ন বা কিছু নোট যোগ করুন।", "Please fix this first": "আগে এটি ঠিক করুন",
  // the editor
  "Question {n}": "প্রশ্ন {n}", "{n} reported": "{n} জন জানিয়েছে", "The question": "প্রশ্ন", "Right answer": "সঠিক উত্তর", "Option {n}": "অপশন {n}", "Tick the right answer.": "সঠিক উত্তরে টিক দিন।",
  "Why is this the right answer? Students read it after they solve.": "এটি কেন সঠিক উত্তর? শিক্ষার্থীরা সমাধানের পর এটি পড়বে।", "How to solve it (optional)": "কীভাবে সমাধান করতে হয় (ঐচ্ছিক)",
  "Short question {n}": "ছোট প্রশ্ন {n}", "The model answer": "আদর্শ উত্তর", "Edit this set": "এই সেট সম্পাদনা", "Your set": "আপনার সেট",
  "This set was sent to {b}. Students see your changes at once.": "এই সেট {b} এ পাঠানো হয়েছে। আপনার পরিবর্তন শিক্ষার্থীরা সাথে সাথে দেখবে।",
  "e.g. Physics chapter 3 practice": "যেমন: পদার্থ তৃতীয় অধ্যায় অনুশীলন", "Notes (optional)": "নোট (ঐচ্ছিক)", "A summary or a solution students can read before they practise.": "সারসংক্ষেপ বা সমাধান, যা শিক্ষার্থীরা অনুশীলনের আগে পড়তে পারবে।",
  "Nothing here yet. Ask the AI above, or add a question by hand.": "এখনো কিছু নেই। উপরে এআইকে বলুন, অথবা নিজে প্রশ্ন যোগ করুন।", "Add MCQ": "এমসিকিউ যোগ করুন", "Add short question": "ছোট প্রশ্ন যোগ করুন",
  "Save changes": "পরিবর্তন সংরক্ষণ", "Send to batch": "ব্যাচে পাঠান", "Clear": "মুছে ফেলুন", "The AI can make mistakes. Check every answer before you send.": "এআই ভুল করতে পারে। পাঠানোর আগে প্রতিটি উত্তর যাচাই করুন।",
  // ask the AI
  "MCQ questions": "এমসিকিউ প্রশ্ন", "Short questions": "ছোট প্রশ্ন", "Summary notes": "সারসংক্ষেপ নোট", "Solve and explain": "সমাধান ও ব্যাখ্যা",
  "Turn it on in Settings > AI study assistant. Until then you can write questions by hand below.": "সেটিংস > এআই পড়ার সহকারী থেকে চালু করুন। ততক্ষণ নিচে নিজে প্রশ্ন লিখতে পারেন।",
  "Ask the admin to turn it on. Until then you can write questions by hand below.": "অ্যাডমিনকে চালু করতে বলুন। ততক্ষণ নিচে নিজে প্রশ্ন লিখতে পারেন।", "Ask the AI": "এআইকে বলুন",
  "Take a photo of a book page, a question paper or your notes, or write a topic. The AI makes a first draft and you check it before it goes to students.": "বইয়ের পাতা, প্রশ্নপত্র বা নোটের ছবি তুলুন, অথবা একটি বিষয় লিখুন। এআই প্রথম খসড়া বানাবে, শিক্ষার্থীদের কাছে যাওয়ার আগে আপনি যাচাই করবেন।",
  "e.g. Physics": "যেমন: পদার্থবিজ্ঞান", "Photos (up to 3)": "ছবি (সর্বোচ্চ ৩টি)", "Take photo": "ছবি তুলুন", "Choose photo": "ছবি বাছুন", "Remove photo": "ছবি সরান",
  "Topic or instruction (optional)": "বিষয় বা নির্দেশ (ঐচ্ছিক)", "e.g. Chapter 3, Newton's laws, make it a bit hard": "যেমন: তৃতীয় অধ্যায়, নিউটনের সূত্র, একটু কঠিন করুন", "What should the AI make?": "এআই কী বানাবে?", "How many questions?": "কয়টি প্রশ্ন?",
  "The AI is working...": "এআই কাজ করছে...", "Make a draft": "খসড়া বানান", "Photos and your words go to Google's AI. Do not include students' names or phone numbers.": "ছবি ও আপনার লেখা গুগলের এআই এর কাছে যায়। শিক্ষার্থীদের নাম বা ফোন নম্বর দেবেন না।",
  "Up to 3 photos.": "সর্বোচ্চ ৩টি ছবি।", "That file is not a photo.": "এই ফাইল ছবি নয়।", "Add a photo or write a topic first.": "আগে একটি ছবি যোগ করুন বা বিষয় লিখুন।",
  "You used today's {n} AI requests. Try again tomorrow, or write the questions by hand.": "আজকের {n}টি এআই অনুরোধ শেষ। কাল আবার চেষ্টা করুন, অথবা নিজে প্রশ্ন লিখুন।",
  "{n} questions added. Check every answer before you send.": "{n}টি প্রশ্ন যোগ হয়েছে। পাঠানোর আগে প্রতিটি উত্তর যাচাই করুন।", "Notes added. Read them before you send.": "নোট যোগ হয়েছে। পাঠানোর আগে পড়ে নিন।",
  "At most {n} questions.": "সর্বোচ্চ {n}টি প্রশ্ন।", "At most {n} short questions.": "সর্বোচ্চ {n}টি ছোট প্রশ্ন।", "Delete this question?": "এই প্রশ্নটি মুছবেন?", "Clear the whole set and start again?": "পুরো সেট মুছে নতুন করে শুরু করবেন?",
  // sending
  "You have no batch yet.": "আপনার এখনো কোনো ব্যাচ নেই।", "The students of the batches you choose will see this in Study > Practice.": "আপনার বাছা ব্যাচের শিক্ষার্থীরা এটি পড়াশোনা > অনুশীলনে দেখবে।",
  "I have checked the questions and the answers.": "আমি প্রশ্ন ও উত্তর যাচাই করেছি।", "Choose at least one batch.": "অন্তত একটি ব্যাচ বাছুন।", "Tick that you have checked the questions and the answers.": "প্রশ্ন ও উত্তর যাচাই করেছেন বলে টিক দিন।",
  "New practice set: {ti}, from {n}": "নতুন অনুশীলন সেট: {ti}, {n} এর কাছ থেকে", "Sent to {n} batches.": "{n}টি ব্যাচে পাঠানো হয়েছে।", "Sent to 1 batch.": "১টি ব্যাচে পাঠানো হয়েছে।", "Notes only": "শুধু নোট",
  "It could not be saved. Only the teacher who made a set (or the admin) can change it.": "সংরক্ষণ করা যায়নি। সেটটি যিনি বানিয়েছেন সেই শিক্ষক (বা অ্যাডমিন) ছাড়া কেউ বদলাতে পারবেন না।", "Saved. Students see the new version.": "সংরক্ষিত হয়েছে। শিক্ষার্থীরা নতুন সংস্করণ দেখবে।",
  // the sets and their results
  "Yours": "আপনার", "What you sent to your batches. Open a set to see who tried it and which questions need a check.": "আপনি ব্যাচে যা পাঠিয়েছেন। কে চেষ্টা করেছে ও কোন প্রশ্ন যাচাই দরকার তা দেখতে সেট খুলুন।", "New set": "নতুন সেট",
  "No practice sets yet. Make one with the AI assistant, or write it by hand.": "এখনো কোনো অনুশীলন সেট নেই। এআই সহকারী দিয়ে বানান, অথবা নিজে লিখুন।", "This set was not found.": "এই সেটটি পাওয়া যায়নি।",
  "Not tried yet": "এখনো কেউ চেষ্টা করেনি", "{n}% got it right": "{n}% সঠিক করেছে", "Check this answer": "এই উত্তর যাচাই করুন", "By {n}": "{n} এর পক্ষ থেকে", "AI draft, checked": "এআই খসড়া, যাচাইকৃত",
  "Notes": "নোট", "Edit questions and answers": "প্রশ্ন ও উত্তর সম্পাদনা", "Tried": "চেষ্টা করেছে", "of those who tried": "যারা চেষ্টা করেছে তাদের", "Questions": "প্রশ্ন",
  "A question that few students get right, or that students report, may have a wrong answer. Check it and fix it.": "যে প্রশ্ন কম শিক্ষার্থী সঠিক করে বা শিক্ষার্থীরা যেটির কথা জানায়, তার উত্তর ভুল হতে পারে। যাচাই করে ঠিক করুন।",
  "Not tried": "চেষ্টা করেনি", "Students will not see it any more, and their tries are removed.": "শিক্ষার্থীরা আর এটি দেখবে না, এবং তাদের চেষ্টাগুলোও মুছে যাবে।", "Delete this set?": "এই সেটটি মুছবেন?",
  "It could not be deleted. Only the teacher who made a set (or the admin) can delete it.": "মোছা যায়নি। সেটটি যিনি বানিয়েছেন সেই শিক্ষক (বা অ্যাডমিন) ছাড়া কেউ মুছতে পারবেন না।", "Deleted.": "মুছে ফেলা হয়েছে।",
  "{n} question": "{n}টি প্রশ্ন", "{n} questions": "{n}টি প্রশ্ন",
  // the student
  "Questions your teachers send to your batch. Solve them, see what went wrong and why. These are for practice: the marks are not added to your exams.": "শিক্ষকরা আপনার ব্যাচে যে প্রশ্ন পাঠান। সমাধান করুন, কী ভুল হলো ও কেন তা দেখুন। এগুলো অনুশীলনের জন্য: নম্বর আপনার পরীক্ষায় যোগ হয় না।",
  "No practice sets yet. Your teachers will send them here.": "এখনো কোনো অনুশীলন সেট নেই। শিক্ষকরা এখানে পাঠাবেন।", "You are not in a batch yet.": "আপনি এখনো কোনো ব্যাচে নেই।", "New": "নতুন",
  "Checked by {n}": "{n} যাচাই করেছেন", "Written questions": "লিখিত প্রশ্ন", "Write the answer in your notebook, then tap Show answer.": "খাতায় উত্তর লিখুন, তারপর উত্তর দেখুন চাপুন।", "Model answer": "আদর্শ উত্তর", "Show answer": "উত্তর দেখুন",
  "Answered {a} of {n}": "{n}টির মধ্যে {a}টির উত্তর দিয়েছেন", "Submit answers": "উত্তর জমা দিন", "Practice only. The marks are not added to your exams.": "শুধু অনুশীলন। নম্বর আপনার পরীক্ষায় যোগ হয় না।",
  "Correct": "সঠিক", "Not answered": "উত্তর দেননি", "Wrong": "ভুল", "You did not answer this one.": "এটির উত্তর দেননি।", "Your answer: {a}": "আপনার উত্তর: {a}", "Right answer: {a}": "সঠিক উত্তর: {a}",
  "Why this is right": "এটি কেন সঠিক", "Why it was wrong": "কেন ভুল হলো", "How to solve it": "কীভাবে সমাধান করবেন", "Reported to your teacher": "শিক্ষককে জানানো হয়েছে", "Undo": "ফিরিয়ে নিন", "This answer looks wrong": "এই উত্তরটি ভুল মনে হচ্ছে",
  "You got {a} out of {n}": "আপনি {n} এর মধ্যে {a} পেয়েছেন", "{n} to learn from. Read why below.": "{n}টি থেকে শেখার আছে। নিচে কেন তা পড়ুন।", "All correct. Well done!": "সব সঠিক। চমৎকার!", "Nothing here.": "এখানে কিছু নেই।",
  "You left {n} questions empty. They count as wrong. Submit anyway?": "আপনি {n}টি প্রশ্ন ফাঁকা রেখেছেন। সেগুলো ভুল ধরা হবে। তবুও জমা দেবেন?", "Submit": "জমা দিন", "Go back": "ফিরে যান",
  "Your answers could not be saved. Check the internet and try again.": "আপনার উত্তর সংরক্ষণ করা যায়নি। ইন্টারনেট দেখে আবার চেষ্টা করুন।", "It could not be sent. Try again.": "পাঠানো যায়নি। আবার চেষ্টা করুন।",
  "Thank you. Your teacher will check this answer.": "ধন্যবাদ। আপনার শিক্ষক এই উত্তর যাচাই করবেন।", "Report removed.": "জানানো প্রত্যাহার করা হয়েছে।",
});

const staffOk = () => !!S.me && (isStaff() || isTeacher());
const noAccess = (who) => notice(esc(who === "s" ? t("The practice sets are for students.") : t("This page is for teachers and the admin.")), "warn");
const myBatches = () => (isStaff() ? S.B : S.B.filter((b) => (S.me.bids || []).includes(b.id)));
const batchName = (id) => { const b = S.B.find((x) => x.id === id); return b ? b.name : "";};
const dayOf = (ms) => (ms ? fmtDate(dhakaDate(new Date(ms))) : "");
const nQ = (x) => (x.qs || []).length + (x.sq || []).length;
const qWord = (n) => (n ? t(n === 1 ? "{n} question" : "{n} questions", { n }) : t("Notes only"));

// ================= the teacher's draft =================
// kept on this phone while he works (photos are not kept): { ti, sb, cls, nt, qs, sq, editId, bid, ai, orig }
let D = null, Dpid = null;
const dkey = () => "rise-pdraft-" + S.pid;
const blankD = () => ({ ti: "", sb: "", cls: "", nt: "", qs: [], sq: [], editId: "", bid: "", ai: false, orig: null });
function draft() {
  if (D && Dpid === S.pid) return D;
  Dpid = S.pid;
  try { const j = JSON.parse(localStorage.getItem(dkey()) || "null"); D = j && typeof j === "object" ? { ...blankD(), ...j } : blankD(); } catch (e) { D = blankD(); }
  if (!Array.isArray(D.qs)) D.qs = [];
  if (!Array.isArray(D.sq)) D.sq = [];
  return D;
}
const keep = () => { try { localStorage.setItem(dkey(), JSON.stringify(D)); } catch (e) { /* private mode: the draft stays while the app is open */ } };
const reset = () => { D = blankD(); Dpid = S.pid; keep(); };

// requests to the AI a day (this phone): the AI of the whole school shares one free quota, so a runaway tap is stopped here
const DAILY = 40;
const capKey = () => "rise-aistaff-" + S.pid + "-" + T();
const used = () => { try { return +localStorage.getItem(capKey()) || 0; } catch (e) { return 0; } };
const bump = () => { try { localStorage.setItem(capKey(), String(used() + 1)); } catch (e) { /* ignore */ } };

async function subjectNames(cls) {
  try {
    const { SYL } = await import("./data-syllabus.js");
    const c = SYL[cls] || {};
    return [...new Set(Object.values(c).filter(Array.isArray).flat().map((x) => x.s))];
  } catch (e) { return []; }
}

// a photo: shrunk in the phone (the longest side 1280 px, JPEG) so that it is small to send and cheap for the AI
async function shrink(file, max = 1280) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error("image")); i.src = url; });
    const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const cv = document.createElement("canvas");
    cv.width = Math.max(1, Math.round(img.naturalWidth * k)); cv.height = Math.max(1, Math.round(img.naturalHeight * k));
    cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
    return { mime: "image/jpeg", data: cv.toDataURL("image/jpeg", 0.82).split(",")[1] };
  } finally { URL.revokeObjectURL(url); }
}

const problemText = (e) => {
  if (e && e.code === "off") return t("The AI is not turned on yet.");
  if (e && e.code === "unreadable") return t("The AI could not read the photo. Take it again in good light and closer to the page.");
  if (e && e.code === "empty") return t("The AI did not give anything usable. Try again with a clearer photo or a topic.");
  return ({
    quota: t("The AI is busy or its daily limit is reached. Try again later."),
    setup: t("The AI is not set up correctly yet. Ask the admin to check Settings > AI study assistant."),
    net: t("The AI could not be reached (internet?)."),
    blocked: t("The AI could not answer that. Change the photo or the words and try again."),
  })[aiProblem(e)] || t("The AI could not answer that. Change the photo or the words and try again.");
};
const PROB = {
  title: (p) => t("Write a title for the set."),
  q: (p) => t("Question {n} has no text.", { n: p.n }),
  opts: (p) => t("Question {n} needs at least 2 options.", { n: p.n }),
  ans: (p) => t("Question {n}: tick the right answer, and it must not be an empty option.", { n: p.n }),
  dup: (p) => t("Question {n} has two equal options.", { n: p.n }),
  short: (p) => t("Short question {n} needs a question and an answer.", { n: p.n }),
  none: () => t("Add at least one question, or some notes."),
};

// ================= teacher / admin: AI assistant =================
const mcqCard = (x, i, flags) => `<div class="pq" id="pq-m${i}">
  <div class="pq-h"><b>${esc(t("Question {n}", { n: i + 1 }))}</b>${flags ? tag(t("{n} reported", { n: flags }), "warn") : ""}<button type="button" class="btn btn--xs btn--bad" data-act="pr-delq" data-arg="m:${i}" aria-label="${esc(t("Delete"))}">${icon("trash")}</button></div>
  <textarea rows="2" maxlength="${LIM.q}" data-input="pr-q" data-arg="m:${i}:q" placeholder="${esc(t("The question"))}">${esc(x.q)}</textarea>
  <div class="pq-o">${[0, 1, 2, 3].map((j) => `<label class="pq-opt ${x.a === j ? "ok" : ""}"><input type="radio" name="ans-${i}" value="${j}" data-change="pr-ans" data-arg="${i}" ${x.a === j ? "checked" : ""} aria-label="${esc(t("Right answer"))}"><input type="text" maxlength="${LIM.opt}" data-input="pr-q" data-arg="m:${i}:o:${j}" value="${esc((x.o || [])[j] || "")}" placeholder="${esc(t("Option {n}", { n: j + 1 }))}"></label>`).join("")}</div>
  <small class="mut">${esc(t("Tick the right answer."))}</small>
  <textarea rows="2" maxlength="${LIM.ex}" data-input="pr-q" data-arg="m:${i}:e" placeholder="${esc(t("Why is this the right answer? Students read it after they solve."))}">${esc(x.e || "")}</textarea>
  <textarea rows="2" maxlength="${LIM.how}" data-input="pr-q" data-arg="m:${i}:h" placeholder="${esc(t("How to solve it (optional)"))}">${esc(x.h || "")}</textarea>
</div>`;
const shortCard = (x, i) => `<div class="pq" id="pq-s${i}">
  <div class="pq-h"><b>${esc(t("Short question {n}", { n: i + 1 }))}</b><button type="button" class="btn btn--xs btn--bad" data-act="pr-delq" data-arg="s:${i}" aria-label="${esc(t("Delete"))}">${icon("trash")}</button></div>
  <textarea rows="2" maxlength="${LIM.q}" data-input="pr-q" data-arg="s:${i}:q" placeholder="${esc(t("The question"))}">${esc(x.q)}</textarea>
  <textarea rows="3" maxlength="${LIM.ans}" data-input="pr-q" data-arg="s:${i}:a" placeholder="${esc(t("The model answer"))}">${esc(x.a)}</textarea>
</div>`;

function draftCard(d, flagsOf) {
  const n = d.qs.length + d.sq.length, edit = !!d.editId;
  return `<section class="card stack-s" id="pr-draft">
    <div class="card-h"><h3>${esc(edit ? t("Edit this set") : t("Your set"))}</h3>${n ? tag(qWord(n), "info") : ""}</div>
    ${edit ? notice(esc(t("This set was sent to {b}. Students see your changes at once.", { b: batchName(d.bid) })), "info") : ""}
    <label class="fld"><span>${esc(t("Title"))}</span><input type="text" maxlength="${LIM.ti}" value="${esc(d.ti)}" data-input="pr-f" data-arg="ti" placeholder="${esc(t("e.g. Physics chapter 3 practice"))}"></label>
    <label class="fld"><span>${esc(t("Notes (optional)"))}</span><textarea rows="${d.nt ? 6 : 3}" maxlength="${MAX_NOTES}" data-input="pr-f" data-arg="nt" placeholder="${esc(t("A summary or a solution students can read before they practise."))}">${esc(d.nt)}</textarea></label>
    ${n || d.nt ? "" : `<p class="mut">${esc(t("Nothing here yet. Ask the AI above, or add a question by hand."))}</p>`}
    ${d.qs.map((x, i) => mcqCard(x, i, flagsOf ? flagsOf(x.id) : 0)).join("")}
    ${d.sq.map(shortCard).join("")}
    <div class="row" style="gap:8px;flex-wrap:wrap">${btn(t("Add MCQ"), "pr-addq", { ic: "plus", sm: true })}${btn(t("Add short question"), "pr-adds", { ic: "plus", sm: true })}</div>
    <div class="row" style="gap:8px;flex-wrap:wrap;margin-top:4px">
      <button type="button" class="btn btn--pri" data-act="${edit ? "pr-save" : "pr-send"}">${icon(edit ? "check" : "send")}${esc(edit ? t("Save changes") : t("Send to batch"))}</button>
      ${edit ? btn(t("Cancel"), "pr-cancel") : n || d.nt || d.ti ? btn(t("Clear"), "pr-clear", { ic: "trash" }) : ""}
    </div>
    <small class="mut">${esc(t("The AI can make mistakes. Check every answer before you send."))}</small>
  </section>`;
}

page("aitools", async () => {
  if (!staffOk()) return noAccess();
  const d = draft(), u = pageState("pr"), c = await aiConfig(), ready = aiReady(c), mine = myBatches();
  if (!d.cls) d.cls = (mine[0] && mine[0].cls) || "";
  if (!TASKS.includes(u.task)) u.task = "mcq";
  u.cnt = u.cnt || 10; u.ph = u.ph || [];
  const names = await subjectNames(d.cls), flagsOf = d.editId ? await flagCounts(d) : null;
  const clsOpt = [["", t("Class")], ...[4, 5, 6, 7, 8, 9, 10, 11, 12].map((x) => [String(x), t("Class {n}", { n: x })])].map(([v, l]) => `<option value="${v}" ${v === String(d.cls) ? "selected" : ""}>${esc(l)}</option>`).join("");
  const kinds = [{ k: "mcq", label: t("MCQ questions") }, { k: "short", label: t("Short questions") }, { k: "summary", label: t("Summary notes") }, { k: "solve", label: t("Solve and explain") }];
  const cnt = [5, 10, 15, 20, 30].map((x) => `<option value="${x}" ${x === u.cnt ? "selected" : ""}>${x}</option>`).join("");
  return `<div class="stack">
  ${ready ? "" : notice(`<b>${esc(t("The AI is not turned on yet."))}</b><br>${esc(isStaff() && !isTeacher() ? t("Turn it on in Settings > AI study assistant. Until then you can write questions by hand below.") : t("Ask the admin to turn it on. Until then you can write questions by hand below."))}`, "warn")}
  <section class="card stack-s">
    <div class="card-h"><h3>${esc(t("Ask the AI"))}</h3>${ready ? tag(t("AI on"), "ok") : ""}</div>
    <p class="mut">${esc(t("Take a photo of a book page, a question paper or your notes, or write a topic. The AI makes a first draft and you check it before it goes to students."))}</p>
    <div class="grid2" style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
      <label class="fld"><span>${esc(t("Class"))}</span><select data-change="pr-cls">${clsOpt}</select></label>
      <label class="fld"><span>${esc(t("Subject"))}</span><input type="text" list="pr-sb" maxlength="${LIM.sb}" value="${esc(d.sb)}" data-input="pr-f" data-arg="sb" placeholder="${esc(t("e.g. Physics"))}"><datalist id="pr-sb">${names.map((x) => `<option value="${esc(x)}">`).join("")}</datalist></label>
    </div>
    <div class="fld"><span>${esc(t("Photos (up to 3)"))}</span>
      <div class="row" style="gap:8px;flex-wrap:wrap">
        <label class="btn btn--sm" for="pr-cam">${icon("camera")}${esc(t("Take photo"))}</label><input id="pr-cam" type="file" accept="image/*" capture="environment" hidden data-change="pr-photo">
        <label class="btn btn--sm" for="pr-gal">${icon("image")}${esc(t("Choose photo"))}</label><input id="pr-gal" type="file" accept="image/*" multiple hidden data-change="pr-photo">
      </div>
      ${u.ph.length ? `<div class="pthumbs">${u.ph.map((p, i) => `<div class="pthumb"><img alt="" src="data:${p.mime};base64,${p.data}"><button type="button" data-act="pr-rm" data-arg="${i}" aria-label="${esc(t("Remove photo"))}">${icon("x")}</button></div>`).join("")}</div>` : ""}
    </div>
    <label class="fld"><span>${esc(t("Topic or instruction (optional)"))}</span><textarea rows="2" maxlength="1000" data-input="pr-tx" placeholder="${esc(t("e.g. Chapter 3, Newton's laws, make it a bit hard"))}">${esc(u.tx || "")}</textarea></label>
    <div class="fld"><span>${esc(t("What should the AI make?"))}</span>${chips(kinds, u.task, "pr-task")}</div>
    ${u.task === "mcq" || u.task === "short" ? `<label class="fld"><span>${esc(t("How many questions?"))}</span><select data-change="pr-cnt">${cnt}</select></label>` : ""}
    <button type="button" class="btn btn--pri" data-act="pr-go" ${u.busy ? "disabled" : ""}>${icon("spark")}${esc(u.busy ? t("The AI is working...") : t("Make a draft"))}</button>
    <small class="mut">${esc(t("Photos and your words go to Google's AI. Do not include students' names or phone numbers."))}</small>
  </section>
  ${draftCard(d, flagsOf)}
  </div>`;
}, { title: "AI assistant" });

// reports of the students on a set that is being edited: { questionId: count }
async function flagCounts(d) {
  try {
    const tries = await db.list("pt", ["qid", "==", d.editId], ["bid", "==", d.bid]);
    const st = setStats({ qs: d.qs }, tries);
    const m = {}; st.per.forEach((p) => { if (p.flags) m[p.id] = p.flags; });
    return (id) => m[id] || 0;
  } catch (e) { return null; }
}

onInput("pr-f", (el) => { const d = draft(); d[el.dataset.arg] = el.value; keep(); });
onInput("pr-tx", (el) => { pageState("pr").tx = el.value; });
onInput("pr-q", (el) => {
  const [k, i, f, j] = el.dataset.arg.split(":"), d = draft(), x = (k === "m" ? d.qs : d.sq)[+i];
  if (!x) return;
  if (f === "o") { x.o = x.o || ["", "", "", ""]; x.o[+j] = el.value; } else x[f] = el.value;
  keep();
});
onChange("pr-ans", (el) => {
  const d = draft(), x = d.qs[+el.dataset.arg];
  if (!x) return;
  x.a = +el.value; keep();
  el.closest(".pq-o").querySelectorAll(".pq-opt").forEach((o, j) => o.classList.toggle("ok", j === x.a));
});
onChange("pr-cls", (el) => { draft().cls = el.value; keep(); refresh(); });
onChange("pr-cnt", (el) => { pageState("pr").cnt = +el.value || 10; });
act("pr-task", (el) => { pageState("pr").task = el.dataset.arg; refresh(); });
onChange("pr-photo", async (el) => {
  const u = pageState("pr"), files = [...(el.files || [])];
  el.value = "";
  u.ph = u.ph || [];
  for (const f of files) {
    if (u.ph.length >= 3) { toast(t("Up to 3 photos."), "bad"); break; }
    try { u.ph.push(await shrink(f)); } catch (e) { toast(t("That file is not a photo."), "bad"); }
  }
  refresh();
});
act("pr-rm", (el) => { const u = pageState("pr"); u.ph.splice(+el.dataset.arg, 1); refresh(); });

act("pr-go", async () => {
  const d = draft(), u = pageState("pr");
  if (u.busy) return;
  if (!u.ph.length && !String(u.tx || "").trim()) return toast(t("Add a photo or write a topic first."), "bad");
  if (!aiReady(await aiConfig())) return toast(t("The AI is not turned on yet."), "bad");
  if (used() >= DAILY) return toast(t("You used today's {n} AI requests. Try again tomorrow, or write the questions by hand.", { n: DAILY }), "bad");
  u.busy = true; refresh();
  try {
    const raw = await askStaffAI({ task: u.task, cls: d.cls || "", subject: d.sb, count: u.cnt, text: u.tx || "", images: u.ph, inst: "Rise Edge Academy" });
    const r = fromAi(u.task, raw);
    bump();
    if (r.title && !d.ti) d.ti = r.title;
    d.qs = [...d.qs, ...r.qs].slice(0, MAX_Q);
    d.sq = [...d.sq, ...r.sq].slice(0, MAX_SQ);
    if (r.nt) d.nt = ((d.nt ? d.nt + "\n\n" : "") + r.nt).slice(0, MAX_NOTES);
    d.ai = true; keep();
    u.ph = [];
    toast(r.qs.length || r.sq.length ? t("{n} questions added. Check every answer before you send.", { n: r.qs.length + r.sq.length }) : t("Notes added. Read them before you send."), "ok");
    setTimeout(() => { const el = document.getElementById("pr-draft"); if (el) el.scrollIntoView({ behavior: "smooth", block: "start" }); }, 350);
  } catch (e) { toast(problemText(e), "bad"); }
  finally { u.busy = false; refresh(); }
});

act("pr-addq", () => { const d = draft(); if (d.qs.length >= MAX_Q) return toast(t("At most {n} questions.", { n: MAX_Q }), "bad"); d.qs.push(blankMcq()); keep(); refresh(); setTimeout(() => { const el = document.getElementById("pq-m" + (d.qs.length - 1)); if (el) { el.scrollIntoView({ block: "center" }); const f = el.querySelector("textarea"); if (f) f.focus({ preventScroll: true }); } }, 300); });
act("pr-adds", () => { const d = draft(); if (d.sq.length >= MAX_SQ) return toast(t("At most {n} short questions.", { n: MAX_SQ }), "bad"); d.sq.push(blankShort()); keep(); refresh(); setTimeout(() => { const el = document.getElementById("pq-s" + (d.sq.length - 1)); if (el) { el.scrollIntoView({ block: "center" }); const f = el.querySelector("textarea"); if (f) f.focus({ preventScroll: true }); } }, 300); });
act("pr-delq", async (el) => {
  const [k, i] = el.dataset.arg.split(":"), d = draft(), L = k === "m" ? d.qs : d.sq;
  if (!(await ask(t("Delete this question?"), { danger: true, ok: t("Delete") }))) return;
  L.splice(+i, 1); keep(); refresh();
});
act("pr-clear", async () => {
  if (!(await ask(t("Clear the whole set and start again?"), { danger: true, ok: t("Clear") }))) return;
  reset(); pageState("pr").ph = []; refresh();
});
act("pr-cancel", () => { reset(); go("psets"); });

const checked = () => {
  const d = draft(), { set, problems } = cleanSet(d);
  if (problems.length) { info(problems.slice(0, 6).map((p) => PROB[p.code](p)).join("\n"), t("Please fix this first")); return null; }
  return set;
};

act("pr-send", async () => {
  const d = draft(), set = checked();
  if (!set) return;
  const bs = myBatches();
  if (!bs.length) return toast(t("You have no batch yet."), "bad");
  const fit = (b) => bs.length === 1 || (d.cls && String(b.cls) === String(d.cls));
  const fields = `<p class="mut">${esc(t("The students of the batches you choose will see this in Study > Practice."))}</p>
    ${bs.map((b) => `<label class="check"><span>${esc(b.name)}</span><input type="checkbox" name="b_${esc(b.id)}" ${fit(b) ? "checked" : ""}></label>`).join("")}
    <label class="check"><span><b>${esc(t("I have checked the questions and the answers."))}</b></span><input type="checkbox" name="ok"></label>`;
  await form(t("Send to batch"), fields, {
    ok: t("Send"),
    validate: (f) => (!bs.some((b) => f["b_" + b.id]) ? t("Choose at least one batch.") : !f.ok ? t("Tick that you have checked the questions and the answers.") : ""),
    onSave: async (f) => {
      const to = bs.filter((b) => f["b_" + b.id]), now = Date.now();
      for (const b of to) {
        await db.set("ps/" + timeId(), { bid: b.id, ...set, by: S.pid, bn: S.me.name, d: now, u: now, ai: !!d.ai });
        notify("batch", t("New practice set: {ti}, from {n}", { ti: set.ti, n: S.me.name }), b.id);
      }
      reset(); pageState("pr").ph = [];
      toast(to.length === 1 ? t("Sent to 1 batch.") : t("Sent to {n} batches.", { n: to.length }), "ok");
      go("psets");
    },
  });
});

act("pr-save", async () => {
  const d = draft(), set = checked();
  if (!set || !d.orig) return;
  const old = new Map((d.orig.qs || []).map((q) => [q.id, q])), now = Date.now();
  const qs = set.qs.map((q) => {
    const o = old.get(q.id);
    return o && o.q === q.q && o.a === q.a && JSON.stringify(o.o) === JSON.stringify(q.o) && (o.e || "") === q.e && (o.h || "") === q.h ? q : { ...q, ed: now };
  });
  try {
    await db.set("ps/" + d.editId, { bid: d.orig.bid, ...set, qs, by: d.orig.by, bn: d.orig.bn, d: d.orig.d, u: now, ai: !!d.orig.ai });
  } catch (e) { return toast(t("It could not be saved. Only the teacher who made a set (or the admin) can change it."), "bad"); }
  const id = d.editId;
  reset(); toast(t("Saved. Students see the new version."), "ok");
  go("pset", { id });
});

// ================= teacher / admin: the sets and their results =================
page("psets", async () => {
  if (!staffOk()) return noAccess();
  let L = [];
  if (isStaff()) L = await db.recent("ps", 80);
  else L = (await Promise.all(myBatches().map((b) => db.recent("ps", 40, ["bid", "==", b.id])))).flat();
  L.sort((a, b) => (b.u || b.d || 0) - (a.u || a.d || 0));
  const rows = L.map((x) => row({
    title: x.ti,
    sub: esc([batchName(x.bid), x.sb, qWord(nQ(x)), dayOf(x.u || x.d)].filter(Boolean).join(" · ")),
    right: x.by === S.pid ? tag(t("Yours"), "info") : "",
    act: "ps-open", arg: x.id,
  })).join("");
  return `<div class="stack">
    <section class="card stack-s"><div class="row" style="gap:8px;flex-wrap:wrap;justify-content:space-between;align-items:center"><div><h3>${esc(t("Practice sets"))}</h3><p class="mut" style="margin:0">${esc(t("What you sent to your batches. Open a set to see who tried it and which questions need a check."))}</p></div>${btn(t("New set"), "ps-new", { ic: "spark", kind: "pri", sm: true })}</div></section>
    ${L.length ? `<div class="list">${rows}</div>` : card("", empty(t("No practice sets yet. Make one with the AI assistant, or write it by hand."), "inbox"))}
  </div>`;
}, { title: "Practice sets" });
act("ps-open", (el) => go("pset", { id: el.dataset.arg }));
act("ps-new", () => { const d = draft(); if (d.editId) reset(); go("aitools"); });

page("pset", async (params) => {
  if (!staffOk()) return noAccess();
  const set = await db.get("ps/" + params.id);
  if (!set || (!isStaff() && !(S.me.bids || []).includes(set.bid))) return notice(esc(t("This set was not found.")) + `<div class="mt">${btn(t("Back"), "ps-back", { sm: true, ic: "back" })}</div>`, "warn");
  const mine = isStaff() || set.by === S.pid;
  let tries = [];
  try { tries = await db.list("pt", ["qid", "==", set.id], ["bid", "==", set.bid]); } catch (e) { tries = []; }
  const st = setStats(set, tries), kids = activeStudents(set.bid), byId = new Map(tries.map((x) => [x.sid, x]));
  const rows = kids.map((k) => ({ k, tr: byId.get(k.id), sc: byId.get(k.id) ? scoreSet(set, byId.get(k.id).a) : null }))
    .sort((a, b) => (b.sc ? b.sc.pct : -1) - (a.sc ? a.sc.pct : -1) || String(a.k.name).localeCompare(String(b.k.name)));
  const qRows = (set.qs || []).map((q, i) => {
    const p = st.per[i];
    return `<div class="item"><div class="item-b"><b class="item-t">${esc(t("Question {n}", { n: i + 1 }))}: ${esc(q.q.length > 90 ? q.q.slice(0, 90) + "…" : q.q)}</b>
      <span class="mut">${p.pct === null ? esc(t("Not tried yet")) : esc(t("{n}% got it right", { n: p.pct }))}${p.flags ? " · " + esc(t("{n} reported", { n: p.flags })) : ""}</span>
      ${p.pct === null ? "" : meter(p.pct, p.pct < 35 ? "var(--bad)" : p.pct < 70 ? "var(--warn)" : "var(--ok)")}</div>
      ${p.check ? `<div class="item-a">${tag(t("Check this answer"), "bad")}</div>` : ""}</div>`;
  }).join("");
  return `<div class="stack">
    <section class="card stack-s">
      <div class="row" style="gap:8px;justify-content:space-between;align-items:flex-start;flex-wrap:wrap"><div style="min-width:0"><h3 style="overflow-wrap:anywhere">${esc(set.ti)}</h3>
      <p class="mut" style="margin:4px 0 0">${esc([batchName(set.bid), set.sb, qWord(nQ(set)), t("By {n}", { n: set.bn || "" }), dayOf(set.u || set.d)].filter(Boolean).join(" · "))}</p></div>${set.ai ? tag(t("AI draft, checked"), "info") : ""}</div>
      ${set.nt ? `<div class="pq-why"><b>${esc(t("Notes"))}</b>${esc(set.nt.length > 300 ? set.nt.slice(0, 300) + "…" : set.nt).replace(/\n/g, "<br>")}</div>` : ""}
      <div class="row" style="gap:8px;flex-wrap:wrap">${mine ? btn(t("Edit questions and answers"), "ps-edit", { arg: set.id, ic: "edit", kind: "pri", sm: true }) : ""}${mine ? btn(t("Delete"), "ps-del", { arg: set.id, ic: "trash", kind: "bad", sm: true }) : ""}${btn(t("Back"), "ps-back", { ic: "back", sm: true })}</div>
    </section>
    ${(set.qs || []).length ? `<div class="tiles"><div class="stat"><span class="stat-top">${esc(t("Tried"))}</span><span class="stat-v">${st.n} / ${kids.length}</span><span class="stat-s">${esc(t("students"))}</span></div><div class="stat"><span class="stat-top">${esc(t("Average"))}</span><span class="stat-v">${st.avg === null ? "-" : st.avg + "%"}</span><span class="stat-s">${esc(t("of those who tried"))}</span></div></div>` : ""}
    ${qRows ? card(t("Questions"), `<div class="list">${qRows}</div><p class="mut sm" style="margin-top:8px">${esc(t("A question that few students get right, or that students report, may have a wrong answer. Check it and fix it."))}</p>`) : ""}
    ${(set.qs || []).length ? card(t("Students"), rows.length ? `<div class="list">${rows.map(({ k, sc }) => row({ av: avatar(k, 36), title: k.nick || k.name, sub: esc(k.roll || ""), right: sc ? tag(sc.got + "/" + sc.total + " (" + sc.pct + "%)", sc.pct >= 70 ? "ok" : sc.pct >= 40 ? "gold" : "bad") : `<span class="mut">${esc(t("Not tried"))}</span>` })).join("")}</div>` : empty(t("No students in this batch."), "inbox")) : ""}
  </div>`;
}, { title: "Practice sets" });
act("ps-back", () => go("psets"));
act("ps-edit", async (el) => {
  const set = await db.get("ps/" + el.dataset.arg);
  if (!set) return toast(t("This set was not found."), "bad");
  const pad = (o) => [...(o || []), "", "", "", ""].slice(0, 4);
  Object.assign(draft(), { ti: set.ti, sb: set.sb || "", cls: (S.B.find((b) => b.id === set.bid) || {}).cls || "", nt: set.nt || "", qs: (set.qs || []).map((q) => ({ ...q, o: pad(q.o), e: q.e || "", h: q.h || "" })), sq: (set.sq || []).map((q) => ({ ...q })), editId: set.id, bid: set.bid, ai: !!set.ai, orig: set });
  keep(); go("aitools");
});
act("ps-del", async (el) => {
  const set = await db.get("ps/" + el.dataset.arg);
  if (!set) return;
  if (!(await ask(t("Students will not see it any more, and their tries are removed."), { title: t("Delete this set?"), danger: true, ok: t("Yes, delete") }))) return;
  try {
    const L = await db.list("pt", ["qid", "==", set.id], ["bid", "==", set.bid]).catch(() => []);
    await db.batch([...L.map((x) => ({ del: "pt/" + x.id })), { del: "ps/" + set.id }]);
  } catch (e) { return toast(t("It could not be deleted. Only the teacher who made a set (or the admin) can delete it."), "bad"); }
  toast(t("Deleted."), "ok"); go("psets");
});

// ================= student: Practice =================
// the page of one set keeps its state while the app is open: { set, tr (his latest try), a (chosen options now), redo, f (filter), open (short answers shown) }
const solveState = (id) => { const u = pageState("solve"); return (u[id] = u[id] || {}); };

page("practice", async () => {
  if (!isStudent()) return noAccess("s");
  const me = S.me;
  const [sets, tries] = await Promise.all([me.bid ? db.recent("ps", 40, ["bid", "==", me.bid]).catch(() => []) : [], db.list("pt", ["sid", "==", S.pid]).catch(() => [])]);
  sets.sort((a, b) => (b.u || b.d || 0) - (a.u || a.d || 0));
  const tr = new Map(tries.map((x) => [x.qid, x]));
  const rows = sets.map((x) => {
    const mine = tr.get(x.id), sc = mine && (x.qs || []).length ? scoreSet(x, mine.a) : null;
    return row({
      title: x.ti,
      sub: esc([x.sb, qWord(nQ(x)), x.bn ? t("By {n}", { n: x.bn }) : "", dayOf(x.u || x.d)].filter(Boolean).join(" · ")),
      right: sc ? tag(sc.got + "/" + sc.total, sc.pct >= 70 ? "ok" : sc.pct >= 40 ? "gold" : "bad") : (x.qs || []).length ? tag(t("New"), "info") : tag(t("Notes"), "info"),
      act: "sv-open", arg: x.id,
    });
  }).join("");
  return `<div class="stack">
    <section class="card stack-s"><h3>${esc(t("Practice"))}</h3><p class="mut" style="margin:0">${esc(t("Questions your teachers send to your batch. Solve them, see what went wrong and why. These are for practice: the marks are not added to your exams."))}</p></section>
    ${sets.length ? `<div class="list">${rows}</div>` : card("", empty(me.bid ? t("No practice sets yet. Your teachers will send them here.") : t("You are not in a batch yet."), "inbox"))}
  </div>`;
}, { title: "Practice" });
act("sv-open", (el) => { const u = pageState("solve"); u[el.dataset.arg] = {}; go("solve", { id: el.dataset.arg }); });
act("sv-back", () => go("practice"));

page("solve", async (params) => {
  if (!isStudent()) return noAccess("s");
  const id = params.id, st = solveState(id);
  if (!st.set) {
    st.set = await db.get("ps/" + id).catch(() => null);
    st.tr = st.set ? await db.get("pt/" + id + "_" + S.pid).catch(() => null) : null;
  }
  const set = st.set;
  if (!set || set.bid !== S.me.bid) return notice(esc(t("This set was not found.")) + `<div class="mt">${btn(t("Back"), "sv-back", { sm: true, ic: "back" })}</div>`, "warn");
  const hasQ = (set.qs || []).length > 0, review = hasQ && st.tr && !st.redo;
  const head = `<section class="card stack-s"><div class="row" style="gap:8px;justify-content:space-between;align-items:flex-start;flex-wrap:wrap"><div style="min-width:0"><h3 style="overflow-wrap:anywhere">${esc(set.ti)}</h3><p class="mut" style="margin:4px 0 0">${esc([set.sb, set.bn ? t("Checked by {n}", { n: set.bn }) : "", dayOf(set.u || set.d)].filter(Boolean).join(" · "))}</p></div>${btn(t("Back"), "sv-back", { ic: "back", sm: true })}</div>
    ${set.nt ? `<div class="pq-why"><b>${esc(t("Notes"))}</b>${esc(set.nt).replace(/\n/g, "<br>")}</div>` : ""}</section>`;
  const shorts = (set.sq || []).length ? card(t("Written questions"), `<p class="mut sm">${esc(t("Write the answer in your notebook, then tap Show answer."))}</p><div class="stack-s">${set.sq.map((x, i) => `<div class="pq"><b>${esc(t("Short question {n}", { n: i + 1 }))}</b><div>${esc(x.q).replace(/\n/g, "<br>")}</div>${st.open && st.open[x.id] || review ? `<div class="pq-why"><b>${esc(t("Model answer"))}</b>${esc(x.a).replace(/\n/g, "<br>")}</div>` : btn(t("Show answer"), "sv-show", { arg: x.id, sm: true, ic: "eye" })}</div>`).join("")}</div>`) : "";
  if (!hasQ) return `<div class="stack">${head}${shorts}</div>`;
  if (!review) {
    st.a = st.a || {};
    const done = set.qs.filter((q) => Number.isInteger(st.a[q.id])).length;
    return `<div class="stack">${head}
      ${set.qs.map((q, i) => `<div class="pq"><b>${esc(t("Question {n}", { n: i + 1 }))}</b><div>${esc(q.q).replace(/\n/g, "<br>")}</div>
        <div class="pq-o">${q.o.map((o, j) => `<button type="button" class="pq-opt ${st.a[q.id] === j ? "on" : ""}" data-act="sv-pick" data-arg="${esc(q.id)}:${j}" aria-pressed="${st.a[q.id] === j}"><span class="pq-mk">${"ABCD"[j]}</span><span>${esc(o)}</span></button>`).join("")}</div></div>`).join("")}
      ${shorts}
      <section class="card stack-s"><div class="row" style="gap:8px;justify-content:space-between;align-items:center;flex-wrap:wrap"><span class="mut">${esc(t("Answered {a} of {n}", { a: done, n: set.qs.length }))}</span><button type="button" class="btn btn--pri" data-act="sv-submit">${icon("check")}${esc(t("Submit answers"))}</button></div><small class="mut">${esc(t("Practice only. The marks are not added to your exams."))}</small></section></div>`;
  }
  const sc = scoreSet(set, st.tr.a), f = st.f || "all";
  const shown = sc.rows.filter((r) => f === "all" || (f === "bad" ? !r.ok : r.ok));
  const fl = st.tr.fl || {};
  const view = shown.map((r) => {
    const q = set.qs[r.i], right = r.ok;
    return `<div class="pq ${right ? "is-ok" : "is-bad"}"><div class="pq-h"><b>${esc(t("Question {n}", { n: r.i + 1 }))}</b>${right ? tag(t("Correct"), "ok") : tag(r.pick < 0 ? t("Not answered") : t("Wrong"), "bad")}</div>
      <div>${esc(q.q).replace(/\n/g, "<br>")}</div>
      <div class="pq-o">${q.o.map((o, j) => `<div class="pq-opt ${j === q.a ? "ok" : j === r.pick ? "bad" : ""}"><span class="pq-mk">${j === q.a ? "✓" : j === r.pick ? "✗" : "ABCD"[j]}</span><span>${esc(o)}</span></div>`).join("")}</div>
      ${right ? "" : `<p class="mut" style="margin:0">${esc(r.pick < 0 ? t("You did not answer this one.") : t("Your answer: {a}", { a: q.o[r.pick] }))}<br>${esc(t("Right answer: {a}", { a: q.o[q.a] }))}</p>`}
      ${q.e ? `<div class="pq-why"><b>${esc(right ? t("Why this is right") : t("Why it was wrong"))}</b>${esc(q.e).replace(/\n/g, "<br>")}</div>` : ""}
      ${q.h ? `<div class="pq-why pq-how"><b>${esc(t("How to solve it"))}</b>${esc(q.h).replace(/\n/g, "<br>")}</div>` : ""}
      <div>${fl[q.id] ? `<span class="mut sm">${icon("check")} ${esc(t("Reported to your teacher"))}</span> ${btn(t("Undo"), "sv-flag", { arg: q.id, xs: true })}` : btn(t("This answer looks wrong"), "sv-flag", { arg: q.id, xs: true, ic: "alert" })}</div></div>`;
  }).join("");
  const nBad = sc.total - sc.got;
  return `<div class="stack">${head}
    <section class="card"><div class="sc">${ring(sc.pct, t("Score"), sc.pct >= 70 ? "var(--ok)" : sc.pct >= 40 ? "var(--warn)" : "var(--bad)", 88)}<div><b style="font-size:18px">${esc(t("You got {a} out of {n}", { a: sc.got, n: sc.total }))}</b><p class="mut" style="margin:4px 0 0">${esc(nBad ? t("{n} to learn from. Read why below.", { n: nBad }) : t("All correct. Well done!"))}</p><p class="mut sm" style="margin:4px 0 0">${esc(t("Practice only. The marks are not added to your exams."))}</p></div></div>
      <div class="row" style="gap:8px;flex-wrap:wrap;margin-top:10px">${btn(t("Try again"), "sv-redo", { ic: "refresh", kind: "pri", sm: true })}</div></section>
    ${chips([{ k: "all", label: t("All") + " (" + sc.total + ")" }, { k: "bad", label: t("Wrong") + " (" + nBad + ")" }, { k: "ok", label: t("Correct") + " (" + sc.got + ")" }], f, "sv-filter")}
    ${view || card("", empty(t("Nothing here."), "inbox"))}
    ${shorts}</div>`;
}, { title: "Practice" });

act("sv-pick", (el) => {
  const [id, j] = el.dataset.arg.split(":"), st = solveState(S.params.id);
  st.a = st.a || {}; st.a[id] = +j;
  const box = el.closest(".pq-o");
  box.querySelectorAll(".pq-opt").forEach((b, k) => { b.classList.toggle("on", k === +j); b.setAttribute("aria-pressed", String(k === +j)); });
  const n = (st.set.qs || []).filter((q) => Number.isInteger(st.a[q.id])).length, c = document.querySelector('[data-act="sv-submit"]');
  if (c && c.previousElementSibling) c.previousElementSibling.textContent = t("Answered {a} of {n}", { a: n, n: st.set.qs.length });
});
act("sv-show", (el) => { const st = solveState(S.params.id); st.open = st.open || {}; st.open[el.dataset.arg] = true; refresh(); });
act("sv-filter", (el) => { solveState(S.params.id).f = el.dataset.arg; refresh(); });
act("sv-redo", () => { const st = solveState(S.params.id); st.redo = true; st.a = {}; st.f = "all"; refresh(); window.scrollTo(0, 0); });
act("sv-submit", async () => {
  const id = S.params.id, st = solveState(id), set = st.set, a = st.a || {};
  const left = set.qs.filter((q) => !Number.isInteger(a[q.id])).length;
  if (left && !(await ask(t("You left {n} questions empty. They count as wrong. Submit anyway?", { n: left }), { ok: t("Submit"), cancel: t("Go back") }))) return;
  const doc = { sid: S.pid, qid: id, bid: set.bid, a: Object.fromEntries(Object.entries(a).filter(([k]) => set.qs.some((q) => q.id === k))), n: set.qs.length, t: Date.now(), k: ((st.tr && st.tr.k) || 0) + 1, fl: {} };
  try { await db.set("pt/" + id + "_" + S.pid, doc); }
  catch (e) { return toast(t("Your answers could not be saved. Check the internet and try again."), "bad"); }
  st.tr = doc; st.redo = false; st.f = "all";
  refresh(); window.scrollTo(0, 0);
});
act("sv-flag", async (el) => {
  const id = S.params.id, st = solveState(id), q = el.dataset.arg, fl = { ...((st.tr && st.tr.fl) || {}) };
  if (fl[q]) delete fl[q]; else fl[q] = true;
  try { await db.upd("pt/" + id + "_" + S.pid, { fl }); } catch (e) { return toast(t("It could not be sent. Try again."), "bad"); }
  st.tr = { ...st.tr, fl };
  toast(fl[q] ? t("Thank you. Your teacher will check this answer.") : t("Report removed."), "ok");
  refresh();
});
