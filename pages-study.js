// The Study section for students: Study (home), Study planner, Focus timer and the AI assistant.
//   sp/<student id>   { tasks: [{id, ti, sb, d, tm, mn, dn, dd}], log: {date: focus minutes}, hrs: {hour: focus minutes}, ai: {d, n}, t }  (only he and the admin can read it)
// The chat answers from his own numbers with the built-in helper (lib-coach.js); open questions go to the real AI (lib-ai.js) when the admin has turned it on.
import { db } from "./lib-db.js";
import { S, esc, t, page, act, onChange, onSubmit, onInput, pageState, refresh, go, isStudent, T, addDays, fmtDate, monthLabel, instName, addBN, bnDigits, $ } from "./lib-core.js";
import { icon, avatar, card, row, btn, stat, empty, notice, tag, toast, form, input, select, ask, closeModals } from "./lib-ui.js";
import { getStats } from "./lib-svc.js";
import { myResults } from "./pages-exams.js";
import { subjectStats, attPct, tasksOn, minutesOn, streak, studyTip, detect, reply, OWN_DATA, CHIPS, dow } from "./lib-coach.js";
import { aiConfig, aiReady, askAI, aiProblem } from "./lib-ai.js";

addBN({
  "Study": "পড়াশোনা", "Study planner": "পড়ার পরিকল্পনা", "Focus timer": "ফোকাস টাইমার", "AI assistant": "এআই সহকারী",
  "The Study section is for students.": "এই অংশ শুধু শিক্ষার্থীদের জন্য।",
  "Ready to study today?": "আজ পড়তে প্রস্তুত?", "Hi, {n}": "হাই, {n}", "Focus time": "ফোকাস সময়", "Tasks done": "শেষ হওয়া কাজ", "Today": "আজ", "Streak": "ধারাবাহিকতা",
  "{n} days": "{n} দিন", "Study days in a row": "টানা পড়ার দিন", "{n} min": "{n} মিনিট", "{h}h {m}m": "{h} ঘণ্টা {m} মিনিট",
  "Study tip": "পড়ার টিপ", "Open planner": "পরিকল্পনা খুলুন", "Start focusing": "ফোকাস শুরু করুন", "Attendance": "উপস্থিতি", "Ask the assistant": "সহকারীকে জিজ্ঞেস করুন",
  "Quick actions": "দ্রুত কাজ", "Syllabus": "সিলেবাস", "Today's plan": "আজকের পরিকল্পনা", "Open": "খুলুন", "No tasks for today.": "আজকের জন্য কোনো কাজ নেই।", "Make my study plan": "আমার পড়ার পরিকল্পনা বানাও",
  "Study planner is empty": "পরিকল্পনা খালি",
  // planner
  "Previous week": "আগের সপ্তাহ", "Next week": "পরের সপ্তাহ", "To do": "করতে হবে", "Total time": "মোট সময়", "tasks": "কাজ", "Schedule": "সময়সূচি", "Add a task": "কাজ যোগ করুন", "Edit task": "কাজ বদলান", "New task": "নতুন কাজ",
  "What will you study?": "কী পড়বে?", "e.g. Physics chapter 3": "যেমন: পদার্থ তৃতীয় অধ্যায়", "No subject": "বিষয় নেই", "Date": "তারিখ", "Time (optional)": "সময় (ঐচ্ছিক)", "Minutes": "মিনিট",
  "Write what you will study.": "কী পড়বে লিখুন।", "Minutes must be between 5 and 240.": "মিনিট ৫ থেকে ২৪০ এর মধ্যে হতে হবে।",
  "Mark as done": "শেষ হয়েছে", "Mark as not done": "শেষ হয়নি", "Start focus": "ফোকাস শুরু",  "Delete this task?": "এই কাজটি মুছবেন?", "Delete": "মুছুন", "Task saved.": "কাজ সংরক্ষিত হয়েছে।", "Task deleted.": "কাজ মুছে গেছে।",
  "No tasks on this day. Tap + to add one, or ask the AI assistant for a plan.": "এই দিনে কোনো কাজ নেই। + চাপুন, অথবা এআই সহকারীর কাছ থেকে পরিকল্পনা নিন।",
  "{n} unfinished tasks from earlier days": "আগের দিনের {n}টি কাজ বাকি", "Move to today": "আজকে নিন", "Moved to today.": "আজকে নেওয়া হয়েছে।",
  "Make a plan with the assistant": "সহকারীর সাথে পরিকল্পনা করুন", "{n} tasks added to your planner.": "পরিকল্পনায় {n}টি কাজ যোগ হয়েছে।", "Added": "যোগ হয়েছে", "Add {n} tasks to my planner": "আমার পরিকল্পনায় {n}টি কাজ যোগ করো",
  // focus
  "Focus": "ফোকাস", "Break": "বিরতি", "Minutes of focus": "ফোকাসের মিনিট", "Start": "শুরু", "Pause": "বিরতি দিন", "Resume": "আবার চালু", "Reset": "রিসেট", "Finish now": "এখনই শেষ", "Task (optional)": "কাজ (ঐচ্ছিক)", "No task": "কাজ নেই",
  "Focus session done: {n} minutes saved.": "ফোকাস সেশন শেষ: {n} মিনিট সংরক্ষিত হয়েছে।", "Break is over. Ready for the next round?": "বিরতি শেষ। পরের রাউন্ডের জন্য প্রস্তুত?", "{n} minutes saved.": "{n} মিনিট সংরক্ষিত হয়েছে।",
  "Mark \"{x}\" as done?": "\"{x}\" শেষ হয়েছে বলে চিহ্নিত করবেন?", "Yes, done": "হ্যাঁ, শেষ", "Not yet": "এখনো না", "Focus today": "আজ মোট ফোকাস", "Take a 5 minute break": "৫ মিনিট বিরতি নাও",
  "The timer ended while the app was closed. It was not counted.": "অ্যাপ বন্ধ থাকার সময় টাইমার শেষ হয়ে গেছে। এটি গণনা হয়নি।", "Keep this screen open while you study. The timer keeps running if you open another page.": "পড়ার সময় এই স্ক্রিন খোলা রাখো। অন্য পাতায় গেলেও টাইমার চলবে।",
  // chat
  "AI on": "এআই চালু", "Smart helper": "স্মার্ট সহকারী", "Clear chat": "চ্যাট মুছুন", "Clear the whole chat?": "পুরো চ্যাট মুছবেন?", "Ask anything about your studies...": "পড়াশোনা নিয়ে যা খুশি জিজ্ঞেস করো...", "Send": "পাঠান",
  "AI answers can be wrong. Check important things with your teacher.": "এআই এর উত্তর ভুল হতে পারে। গুরুত্বপূর্ণ বিষয় শিক্ষকের কাছে যাচাই করো।",
  "Thinking...": "ভাবছি...",
  "The AI is busy or its daily limit is reached. The built-in helper answered instead.": "এআই এখন ব্যস্ত অথবা আজকের সীমা শেষ। তাই বিল্ট-ইন সহকারী উত্তর দিল।",
  "The AI is not set up correctly yet. The built-in helper answered instead.": "এআই এখনো ঠিকমতো সেট করা হয়নি। তাই বিল্ট-ইন সহকারী উত্তর দিল।",
  "The AI could not be reached (internet?). The built-in helper answered instead.": "এআই এর সাথে যোগাযোগ করা যায়নি (ইন্টারনেট?)। তাই বিল্ট-ইন সহকারী উত্তর দিল।",
  "The AI could not answer that. The built-in helper answered instead.": "এআই এটার উত্তর দিতে পারেনি। তাই বিল্ট-ইন সহকারী উত্তর দিল।",
  "The AI had a problem. The built-in helper answered instead.": "এআই এ সমস্যা হয়েছে। তাই বিল্ট-ইন সহকারী উত্তর দিল।",
  "You used today's {n} AI messages. The built-in helper answers until tomorrow.": "আজকের {n}টি এআই বার্তা শেষ। কাল পর্যন্ত বিল্ট-ইন সহকারী উত্তর দেবে।",
  "I could not reach the AI right now. Please try again in a little while, or try one of these:": "এখন এআই এর সাথে যোগাযোগ করা গেল না। একটু পরে আবার চেষ্টা করো, অথবা এগুলোর একটি চেষ্টা করো:",
  "Could not save. Check the internet and try again.": "সংরক্ষণ করা যায়নি। ইন্টারনেট দেখে আবার চেষ্টা করো।",
  "Study tips for exams": "পরীক্ষার জন্য পড়ার টিপস", "My weak subjects": "আমার দুর্বল বিষয়", "How is my attendance?": "আমার উপস্থিতি কেমন?", "Motivate me": "আমাকে অনুপ্রেরণা দাও",
  "Open the Focus timer": "ফোকাস টাইমার খুলুন",
  // coach texts (lib-coach.js)
  "Your attendance is {p}%. Every missed class costs marks, so try not to miss the next ones.": "তোমার উপস্থিতি {p}%। প্রতিটি ক্লাস মিস মানে নম্বর হারানো, তাই পরের ক্লাসগুলো মিস কোরো না।",
  "You have {n} unfinished tasks from earlier days. Finish one now, or move it to today.": "আগের দিনের {n}টি কাজ বাকি আছে। এখনই একটি শেষ করো, অথবা আজকে নিয়ে নাও।",
  "{s} is your lowest subject ({p}%). Give it 30 focused minutes today.": "{s} তোমার সবচেয়ে কম নম্বরের বিষয় ({p}%)। আজ এতে ৩০ মিনিট মন দিয়ে পড়ো।",
  "You focus best between {a} and {b}. Keep your hardest subject for that time.": "তুমি {a} থেকে {b} এর মধ্যে সবচেয়ে ভালো মনোযোগ দাও। কঠিন বিষয়টি ওই সময়ের জন্য রাখো।",
  "You have {n} tasks to do today. Start with the hardest one.": "আজ তোমার {n}টি কাজ বাকি। সবচেয়ে কঠিনটা দিয়ে শুরু করো।",
  "Plan before you study: add two tasks for today in the Study planner, or ask the assistant for a plan.": "পড়ার আগে পরিকল্পনা করো: পড়ার পরিকল্পনায় আজকের জন্য দুটি কাজ যোগ করো, অথবা সহকারীর কাছে পরিকল্পনা চাও।",
  "{n} days in a row! Keep it going with a short session today.": "টানা {n} দিন! আজও একটু পড়ে ধারা চালু রাখো।",
  "Study in short rounds: 25 minutes of focus, then a 5 minute break. Try the Focus timer.": "ছোট ছোট রাউন্ডে পড়ো: ২৫ মিনিট মনোযোগ, তারপর ৫ মিনিট বিরতি। ফোকাস টাইমারটি চেষ্টা করো।",
  "After you read a topic, close the book and write what you remember. It works better than reading it again.": "একটি টপিক পড়ার পর বই বন্ধ করে যা মনে আছে লিখে ফেলো। আবার পড়ার চেয়ে এটা বেশি কাজে দেয়।",
  "Solve past questions with a time limit. It shows what you really know.": "সময় ধরে আগের বছরের প্রশ্ন সমাধান করো। এতে বোঝা যায় তুমি আসলে কী জানো।",
  "Sleep well before an exam. A tired mind forgets what you studied.": "পরীক্ষার আগে ভালো করে ঘুমাও। ক্লান্ত মস্তিষ্ক যা পড়েছ তা ভুলে যায়।",
  "Start with your hardest subject, while your mind is fresh.": "মাথা সতেজ থাকতে সবচেয়ে কঠিন বিষয় দিয়ে শুরু করো।",
  "Revise {s}": "{s} রিভিশন", "Practice {s}: solve questions": "{s} অনুশীলন: প্রশ্ন সমাধান",
  "Hi! I am your study assistant. I can make a study plan, find your weak subjects, check your attendance and give exam tips. What do you need?": "হাই! আমি তোমার পড়ার সহকারী। আমি পড়ার পরিকল্পনা বানাতে, দুর্বল বিষয় খুঁজে দিতে, উপস্থিতি দেখাতে আর পরীক্ষার টিপস দিতে পারি। তোমার কী দরকার?",
  "You are welcome! Keep going, you are doing well.": "স্বাগতম! এভাবেই চালিয়ে যাও, তুমি ভালো করছ।",
  "Your planner is already full for the next 7 days. Well done!": "পরের ৭ দিনের পরিকল্পনা ইতিমধ্যে পূর্ণ। চমৎকার!",
  "I do not have subjects to plan yet. Ask your teacher to publish your exam results, or add your own tasks in the Study planner.": "পরিকল্পনা করার মতো বিষয় এখনো আমার কাছে নেই। শিক্ষককে পরীক্ষার ফল প্রকাশ করতে বলো, অথবা পড়ার পরিকল্পনায় নিজের কাজ যোগ করো।",
  "Here is a plan for the next 7 days. Weak subjects come first.": "পরের ৭ দিনের একটি পরিকল্পনা এখানে। দুর্বল বিষয় আগে।", "and {n} more": "আরও {n}টি", "Tap the button to add it to your planner.": "পরিকল্পনায় যোগ করতে বোতামে চাপ দাও।",
  "I need your published exam results to find your weak subjects. Ask your teacher to publish them.": "দুর্বল বিষয় খুঁজতে তোমার প্রকাশিত পরীক্ষার ফল দরকার। শিক্ষককে প্রকাশ করতে বলো।",
  "Your weakest subjects:": "তোমার সবচেয়ে দুর্বল বিষয়:", "Your lowest subjects (all above 60%, good work):": "তোমার সবচেয়ে কম নম্বরের বিষয় (সবই ৬০% এর ওপরে, চমৎকার):",
  "Start with {s}: revise one chapter and solve ten questions.": "{s} দিয়ে শুরু করো: একটি অধ্যায় রিভিশন দাও আর দশটি প্রশ্ন সমাধান করো।",
  "Not enough attendance is recorded yet this month.": "এই মাসে এখনো যথেষ্ট উপস্থিতি রেকর্ড হয়নি।", "Excellent! Keep it up.": "চমৎকার! এভাবেই চালিয়ে যাও।", "Good, but try not to miss any more classes.": "ভালো, তবে আর কোনো ক্লাস মিস না করার চেষ্টা করো।",
  "This is low. Missing classes costs marks, so please attend regularly.": "এটা কম। ক্লাস মিস করলে নম্বর কমে, তাই নিয়মিত ক্লাসে এসো।",
  "Your attendance this month is {p}% ({a} present, {b} absent).": "এই মাসে তোমার উপস্থিতি {p}% ({a}টি উপস্থিত, {b}টি অনুপস্থিত)।",
  "No result is published for you yet.": "তোমার জন্য এখনো কোনো ফল প্রকাশিত হয়নি।", "Your latest exam: {e} – {g} / {t} ({p}%), rank #{r} of {n}.": "তোমার সর্বশেষ পরীক্ষা: {e} – {g} / {t} ({p}%), {n} জনের মধ্যে র‍্যাঙ্ক #{r}।",
  "This month your exam rank is #{r} of {n}.": "এই মাসে তোমার পরীক্ষার র‍্যাঙ্ক #{r} ({n} জনের মধ্যে)।",
  "You have no tasks for today. Say \"make my study plan\" or add one in the Study planner.": "আজকের জন্য তোমার কোনো কাজ নেই। \"আমার পড়ার পরিকল্পনা বানাও\" বলো, অথবা পড়ার পরিকল্পনায় একটি যোগ করো।", "Your tasks for today:": "আজকের তোমার কাজ:",
  "Small steps count. Study for just 10 minutes now, and see how you feel after.": "ছোট ছোট পদক্ষেপও গণনা হয়। এখন শুধু ১০ মিনিট পড়ো, তারপর দেখো কেমন লাগে।",
  "You do not need to feel ready to start. Starting is what makes you ready.": "শুরু করার জন্য প্রস্তুত অনুভব করতে হবে না। শুরু করলেই প্রস্তুতি আসে।",
  "Every top student was once confused by the same topics you are. Keep going.": "প্রত্যেক সেরা শিক্ষার্থী একসময় তোমার মতোই এই টপিকগুলো নিয়ে দ্বিধায় ছিল। চালিয়ে যাও।",
  "Rest is part of studying. Take a short walk, drink water, then come back for one more round.": "বিশ্রামও পড়ার অংশ। একটু হাঁটো, পানি পান করো, তারপর আরেক রাউন্ডের জন্য ফিরে এসো।",
  "Put your phone away, in another room if you can.": "ফোনটা দূরে রাখো, পারলে অন্য ঘরে।", "Study one subject at a time.": "একসময়ে একটি বিষয় পড়ো।", "Use the Focus timer: 25 minutes of work, then 5 minutes of rest.": "ফোকাস টাইমার ব্যবহার করো: ২৫ মিনিট কাজ, তারপর ৫ মিনিট বিশ্রাম।",
  "Write down any distracting thought on paper and go back to the book.": "মনোযোগ নষ্ট করা চিন্তা কাগজে লিখে রেখে আবার বইয়ে ফিরে এসো।",
  "Exam tips:": "পরীক্ষার টিপস:", "Make a plan for the days left, subject by subject.": "বাকি দিনগুলোর জন্য বিষয় ধরে ধরে পরিকল্পনা করো।", "Solve past questions with a time limit.": "সময় ধরে আগের বছরের প্রশ্ন সমাধান করো।",
  "Revise your own short notes, not the whole book.": "পুরো বই নয়, নিজের ছোট নোট রিভিশন দাও।", "Sleep at least 7 hours, especially the night before.": "অন্তত ৭ ঘণ্টা ঘুমাও, বিশেষ করে আগের রাতে।", "Start with the questions you know, then the hard ones.": "যে প্রশ্ন জানো সেগুলো দিয়ে শুরু করো, তারপর কঠিনগুলো।",
  "{s}: your average is {p}%.": "{s}: তোমার গড় {p}%।",
  "Practise every day. Do not only read the solved examples.": "প্রতিদিন অনুশীলন করো। শুধু সমাধান করা উদাহরণ পড়ে থেকো না।", "Learn the reason behind each formula, not only the formula.": "শুধু সূত্র নয়, প্রতিটি সূত্রের পেছনের কারণ বোঝো।", "Keep a notebook of your mistakes and redo them every week.": "ভুলগুলোর একটি খাতা রাখো আর প্রতি সপ্তাহে সেগুলো আবার করো।",
  "Read aloud for ten minutes every day.": "প্রতিদিন দশ মিনিট জোরে জোরে পড়ো।", "Keep a list of new words and use each in a sentence.": "নতুন শব্দের তালিকা রাখো আর প্রতিটি দিয়ে বাক্য বানাও।", "Write one short paragraph a day and ask your teacher to check it.": "প্রতিদিন একটি ছোট অনুচ্ছেদ লিখে শিক্ষককে দেখাও।",
  "Make short notes and draw diagrams or tables.": "ছোট নোট বানাও আর ছবি বা ছক আঁকো।", "Test yourself with questions without looking at the book.": "বই না দেখে নিজেকে প্রশ্ন করে যাচাই করো।", "Revise the same notes again after one day and after one week.": "একই নোট একদিন পরে আর এক সপ্তাহ পরে আবার রিভিশন দাও।",
  "Finish one chapter, then solve past questions on it.": "একটি অধ্যায় শেষ করে সেটার আগের বছরের প্রশ্ন সমাধান করো।", "Write down what you could not solve and ask your teacher.": "যা সমাধান করতে পারোনি তা লিখে রেখে শিক্ষককে জিজ্ঞেস করো।", "Revise the same topic again after a few days.": "কয়েকদিন পর একই টপিক আবার রিভিশন দাও।",
  "I can help with your study plan, weak subjects, attendance, results, exam tips and focus. For other questions the AI mode must be turned on by the admin. Try one of these:": "আমি তোমার পড়ার পরিকল্পনা, দুর্বল বিষয়, উপস্থিতি, ফল, পরীক্ষার টিপস আর মনোযোগ নিয়ে সাহায্য করতে পারি। অন্য প্রশ্নের জন্য অ্যাডমিনকে এআই মোড চালু করতে হবে। এগুলোর একটি চেষ্টা করো:",
});

// ---------- the student's own study document ----------
const blank = () => ({ tasks: [], log: {}, hrs: {}, ai: { d: "", n: 0 }, t: 0 });
let SP = null, SPid = "", saving = Promise.resolve();
async function sp() {
  if (SP && SPid === S.pid) return SP;
  let d = null;
  try { d = await db.get("sp/" + S.pid); } catch (e) { d = null; }
  SP = { ...blank(), ...(d || {}) };
  if (!Array.isArray(SP.tasks)) SP.tasks = [];
  for (const k of ["log", "hrs", "ai"]) if (!SP[k] || typeof SP[k] !== "object" || Array.isArray(SP[k])) SP[k] = blank()[k];
  SPid = S.pid;
  return SP;
}
async function writeSP() {
  const today = T(), keepFrom = addDays(today, -30), logFrom = addDays(today, -120);
  SP.tasks = SP.tasks.filter((x) => !x.dn || x.d >= keepFrom).slice(-150);
  for (const k of Object.keys(SP.log)) if (k < logFrom) delete SP.log[k];
  SP.t = Date.now();
  await db.set("sp/" + S.pid, { tasks: SP.tasks, log: SP.log, hrs: SP.hrs, ai: SP.ai, t: SP.t });
}
// saves one after the other, so two quick taps can never overwrite each other
const persist = () => (saving = saving.then(writeSP).catch((e) => { console.error(e); toast(t("Could not save. Check the internet and try again."), "bad"); }));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 5);

const first = () => String((S.me && (S.me.nick || S.me.name)) || "").split(" ")[0];
const clsName = () => (S.me && S.me.cls ? t("Class {n}", { n: S.me.cls }) + (S.me.grp ? " " + t(S.me.grp) : "") : "");
const hm = (m) => { m = Math.round(m || 0); return m >= 60 ? t("{h}h {m}m", { h: num(Math.floor(m / 60)), m: num(m % 60) }) : t("{n} min", { n: num(m) }); };
const num = (n) => (S.lang === "bn" ? bnDigits(n) : String(n));
const t12 = (x) => { if (!x) return ""; const [h, m] = x.split(":").map(Number); return num(h % 12 || 12) + ":" + num(String(m).padStart(2, "0")) + " " + (h < 12 ? "AM" : "PM"); };
const wkName = (d) => new Date(d + "T00:00:00").toLocaleDateString(S.lang === "bn" ? "bn-BD" : "en-GB", { weekday: "short" });
const dayLabel = (d) => new Date(d + "T00:00:00").toLocaleDateString(S.lang === "bn" ? "bn-BD" : "en-GB", { weekday: "long", day: "numeric", month: "long" });

// everything the helper and the pages need to know about him, in one go
async function ctx() {
  const me = S.me, [d, results, st] = await Promise.all([sp(), myResults().catch(() => []), me.bid ? getStats(me.bid) : { rows: {} }]);
  const r = ((st && st.rows) || {})[S.pid] || {};
  let subjects = [];
  try { const { SYL } = await import("./data-syllabus.js"); const c = SYL[me.cls] || {}; subjects = (c[me.grp || ""] || c[""] || []).map((x) => x.s); } catch (e) { /* no syllabus data: the helper uses his results */ }
  return { today: T(), cls: clsName(), grp: me.grp || "", sp: d, results, subjects, att: r.p != null || r.a != null ? { p: +r.p || 0, a: +r.a || 0 } : null, rank: { er: r.er, or: r.or, ov: r.ov, n: st && st.n } };
}
const guard = () => (isStudent() ? "" : card("", empty(t("The Study section is for students."), "spark")));

// ======================================================= Study (home)
const GO = { attendance: "Attendance", planner: "Open planner", focus: "Start focusing" };
page("study", async () => {
  const g = guard(); if (g) return g;
  restoreTimer();
  const c = await ctx(), tip = studyTip(c, t), L = tasksOn(c.sp, c.today), done = L.filter((x) => x.dn).length;
  const b = S.B.find((x) => x.id === S.me.bid);
  let classes = "";
  try { const { todayClasses } = await import("./pages-attendance.js"); classes = await todayClasses(); } catch (e) { classes = ""; }
  return `<section class="hero"><div class="welcome">${avatar(S.me, 56)}<div><h2>${esc(t("Ready to study today?"))}</h2><p class="mut">${esc(t("Hi, {n}", { n: first() }) + (b ? " · " + b.name : ""))}</p></div></div></section>
  <div class="tiles tiles-3">
    ${stat({ ic: "timer", label: t("Focus time"), value: hm(minutesOn(c.sp, c.today)), sub: t("Today"), color: "var(--blue)", act: "nav", arg: "focus" })}
    ${stat({ ic: "check", label: t("Tasks done"), value: num(done) + " / " + num(L.length), sub: t("Today"), color: "var(--ok)", act: "nav", arg: "planner" })}
    ${stat({ ic: "trend", label: t("Streak"), value: t("{n} days", { n: num(streak(c.sp, c.today)) }), sub: t("Study days in a row"), color: "var(--gold-ink)" })}
  </div>
  <section class="card sp-tip mt">${icon("spark")}<div><b>${esc(t("Study tip"))}</b><p>${esc(tip.text)}</p>
    <div class="sp-btns">${btn(t(GO[tip.go] || "Open planner"), "nav", { arg: tip.go || "planner", sm: true })}${btn(t("Ask the assistant"), "nav", { arg: "aichat", sm: true, kind: "pri" })}</div></div></section>
  <div class="sec-t">${esc(t("Quick actions"))}</div>
  <div class="tiles">${[["aichat", "bot", "AI assistant"], ["focus", "timer", "Focus timer"], ["planner", "calcheck", "Study planner"], ["practice", "clip", "Practice"]].map(([pg, ic, l]) => `<button class="stat" data-act="nav" data-arg="${pg}"><span class="stat-top">${icon(ic)}${esc(t(l))}</span></button>`).join("")}</div>
  <div class="mt">${card(t("Today's plan"), L.length ? `<div class="list">${L.map((x) => taskRow(x)).join("")}</div>` : `<p class="mut">${esc(t("No tasks for today."))}</p>${btn(t("Make my study plan"), "st-plan", { sm: true, kind: "pri" })}`, { right: btn(t("Open"), "nav", { arg: "planner", xs: true }) })}</div>
  ${classes ? `<div class="mt">${classes}</div>` : ""}`;
});
act("st-plan", () => { pageState("ai").pend = { intent: "plan", text: t("Make my study plan") }; go("aichat"); });

// ======================================================= Study planner
const PL = () => pageState("pl");
const weekStart = (d) => addDays(d, -((dow(d) + 1) % 7));   // the week runs Saturday to Friday
const taskRow = (x) => row({
  av: `<button type="button" class="chk ${x.dn ? "on" : ""}" data-act="pl-tick" data-arg="${esc(x.id)}" aria-label="${esc(t(x.dn ? "Mark as not done" : "Mark as done"))}" aria-pressed="${!!x.dn}">${x.dn ? icon("check") : ""}</button>`,
  titleHtml: `<span class="${x.dn ? "sp-done" : ""}">${esc(x.ti)}</span>`,
  sub: esc([x.sb, t12(x.tm), x.mn ? t("{n} min", { n: num(x.mn) }) : ""].filter(Boolean).join(" · ")),
  right: `${x.dn ? "" : `<button type="button" class="ib" data-act="pl-focus" data-arg="${esc(x.id)}" aria-label="${esc(t("Start focus"))}">${icon("timer")}</button>`}<button type="button" class="ib" data-act="pl-edit" data-arg="${esc(x.id)}" aria-label="${esc(t("Edit"))}">${icon("edit")}</button>`,
});

page("planner", async () => {
  const g = guard(); if (g) return g;
  const c = await ctx(), P = PL(), today = T();
  P.day = P.day || today;
  const ws = weekStart(P.day), days = Array.from({ length: 7 }, (_, i) => addDays(ws, i)), L = tasksOn(c.sp, P.day), open = L.filter((x) => !x.dn);
  const late = c.sp.tasks.filter((x) => !x.dn && x.d < today);
  return `<div class="pl-top"><button type="button" class="ib" data-act="pl-wk" data-arg="-1" aria-label="${esc(t("Previous week"))}">${icon("back")}</button>
    <button type="button" class="chip on" data-act="pl-today">${esc(monthLabel(P.day.slice(0, 7)))}</button>
    <button type="button" class="ib" data-act="pl-wk" data-arg="1" aria-label="${esc(t("Next week"))}">${icon("right")}</button></div>
  <div class="wk" role="tablist">${days.map((d) => `<button type="button" role="tab" class="${d === P.day ? "on" : ""} ${d === today ? "td" : ""}" data-act="pl-day" data-arg="${d}" aria-selected="${d === P.day}"><span>${esc(wkName(d))}</span><b>${num(+d.slice(8))}</b>${c.sp.tasks.some((x) => x.d === d) ? "<i></i>" : ""}</button>`).join("")}</div>
  <div class="tiles mt">
    ${stat({ ic: "clock", label: t("To do"), value: num(open.length), sub: t("tasks"), color: "var(--gold-ink)" })}
    ${stat({ ic: "timer", label: t("Total time"), value: hm(L.reduce((a, x) => a + (+x.mn || 0), 0)), sub: dayLabel(P.day), color: "var(--violet)" })}
  </div>
  ${late.length && P.day === today ? `<div class="mt">${notice(`${esc(t("{n} unfinished tasks from earlier days", { n: num(late.length) }))} ${btn(t("Move to today"), "pl-late", { sm: true })}`, "warn")}</div>` : ""}
  <div class="mt">${card(t("Schedule"), L.length ? `<div class="list">${L.map(taskRow).join("")}</div>` : `<p class="mut">${esc(t("No tasks on this day. Tap + to add one, or ask the AI assistant for a plan."))}</p>${btn(t("Make a plan with the assistant"), "st-plan", { sm: true })}`, { right: `<button type="button" class="btn btn--pri btn--sm" data-act="pl-add" aria-label="${esc(t("Add a task"))}">${icon("plus")}${esc(t("Add a task"))}</button>` })}</div>`;
});
act("pl-day", (el) => { PL().day = el.dataset.arg; refresh(); });
act("pl-wk", (el) => { const P = PL(); P.day = addDays(P.day || T(), 7 * +el.dataset.arg); refresh(); });
act("pl-today", () => { PL().day = T(); refresh(); });
act("pl-tick", async (el) => {
  const d = await sp(), x = d.tasks.find((q) => q.id === el.dataset.arg);
  if (!x) return;
  x.dn = !x.dn; x.dd = x.dn ? T() : "";
  await persist(); refresh();
});
act("pl-focus", (el) => { restoreTimer(); if (!FT.run) FT.task = el.dataset.arg; saveTimer(); go("focus"); });
act("pl-late", async () => {
  const d = await sp(), today = T();
  d.tasks.forEach((x) => { if (!x.dn && x.d < today) x.d = today; });
  await persist(); toast(t("Moved to today."), "ok"); refresh();
});
async function taskForm(x) {
  const c = await ctx(), edit = !!x, subs = [...c.subjects, ...(x && x.sb && !c.subjects.includes(x.sb) ? [x.sb] : [])];
  const v = x || { ti: "", sb: "", d: PL().day || T(), tm: "", mn: 30 };
  return form(edit ? t("Edit task") : t("New task"),
    `${input("ti", { label: t("What will you study?"), value: v.ti, placeholder: t("e.g. Physics chapter 3"), maxlength: 80 })}
    ${select("sb", [["", t("No subject")], ...subs.map((s) => [s, s])], v.sb, { label: t("Subject") })}
    ${input("d", { type: "date", label: t("Date"), value: v.d })}
    ${input("tm", { type: "time", label: t("Time (optional)"), value: v.tm })}
    ${input("mn", { type: "number", label: t("Minutes"), value: v.mn, min: 5, max: 240, step: 5 })}
    ${edit ? `<button type="button" class="btn btn--bad btn--sm" data-act="pl-del" data-arg="${esc(x.id)}">${icon("trash")}${esc(t("Delete"))}</button>` : ""}`,
    {
      validate: (f) => (!f.ti.trim() ? t("Write what you will study.") : !/^\d{4}-\d\d-\d\d$/.test(f.d) ? t("Choose a date.") : !(+f.mn >= 5 && +f.mn <= 240) ? t("Minutes must be between 5 and 240.") : ""),
      onSave: async (f) => {
        const d = await sp(), rec = { id: edit ? x.id : uid(), ti: f.ti.trim().slice(0, 80), sb: f.sb || "", d: f.d, tm: f.tm || "", mn: Math.round(+f.mn), dn: edit ? !!x.dn : false, dd: edit ? x.dd || "" : "" };
        const i = d.tasks.findIndex((q) => q.id === rec.id);
        if (i >= 0) d.tasks[i] = rec; else d.tasks.push(rec);
        await persist(); PL().day = rec.d; refresh(); toast(t("Task saved."), "ok");
      },
    });
}
act("pl-add", () => taskForm(null));
act("pl-edit", async (el) => { const d = await sp(), x = d.tasks.find((q) => q.id === el.dataset.arg); if (x) taskForm(x); });
act("pl-del", async (el) => {
  if (!(await ask(t("Delete this task?"), { ok: t("Delete"), danger: true }))) return;
  const d = await sp(); d.tasks = d.tasks.filter((q) => q.id !== el.dataset.arg);
  closeModals(); await persist(); refresh(); toast(t("Task deleted."), "ok");
});

// ======================================================= Focus timer
// state lives here (and in localStorage) so the timer keeps running while he looks at another page
const FKEY = () => "rise-focus-" + S.pid;
let FT = { pid: "", mode: "focus", len: 25, total: 1500, left: 1500, end: 0, start: 0, run: false, task: "" }, tickId = 0, WL = null, expired = false;
const saveTimer = () => { try { localStorage.setItem(FKEY(), JSON.stringify({ ...FT, pid: S.pid })); } catch (e) { /* private mode */ } };
function restoreTimer() {
  if (FT.pid === S.pid) return;
  FT = { pid: S.pid, mode: "focus", len: 25, total: 1500, left: 1500, end: 0, start: 0, run: false, task: "" };
  try {
    const o = JSON.parse(localStorage.getItem(FKEY()) || "null");
    if (o && o.pid === S.pid && o.total > 0) {
      FT = { ...FT, ...o };
      if (FT.run) {
        if (FT.end > Date.now()) startTick();
        else { FT.run = false; FT.left = FT.total; FT.start = 0; expired = true; saveTimer(); }
      }
    }
  } catch (e) { /* ignore */ }
}
const left = () => (FT.run ? Math.max(0, Math.round((FT.end - Date.now()) / 1000)) : FT.left);
const mmss = (s) => num(String(Math.floor(s / 60)).padStart(2, "0")) + ":" + num(String(s % 60).padStart(2, "0"));
const CIRC = 2 * Math.PI * 96;
function paint() {
  const el = $("#ft-time"); if (!el) return;
  const l = left();
  el.textContent = mmss(l);
  const r = $("#ft-ring"); if (r) r.setAttribute("stroke-dashoffset", String(CIRC * (1 - (FT.total ? l / FT.total : 0))));
  const f = $("#ft-finish"); if (f) f.hidden = !(FT.mode === "focus" && FT.total - l >= 60);
}
function startTick() { clearInterval(tickId); tickId = setInterval(() => { if (!FT.run) return; paint(); if (left() <= 0) finishTimer(false); }, 500); }
async function lock() { try { if ("wakeLock" in navigator && !WL) { WL = await navigator.wakeLock.request("screen"); WL.addEventListener("release", () => { WL = null; }); } } catch (e) { /* not allowed: fine */ } }
const unlock = () => { try { if (WL) WL.release(); } catch (e) { /* ignore */ } WL = null; };
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && FT.run) lock(); });
const dhakaHour = (ts) => +new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Dhaka", hour: "numeric", hourCycle: "h23" }).format(ts) % 24;
async function finishTimer(early) {
  const l = left(), secs = FT.total - (early ? l : 0), mins = early ? Math.floor(secs / 60) : Math.round(FT.total / 60), wasFocus = FT.mode === "focus", task = FT.task, began = FT.start || Date.now() - secs * 1000;
  clearInterval(tickId); unlock();
  FT.run = false; FT.start = 0; FT.end = 0;
  if (wasFocus && !early) { FT.mode = "break"; FT.total = FT.left = 300; }
  else if (!wasFocus) { FT.mode = "focus"; FT.total = FT.left = FT.len * 60; }
  else FT.left = FT.total;
  saveTimer();
  if (wasFocus && mins >= 1) {
    const d = await sp(), day = T(), h = String(dhakaHour(began));
    d.log[day] = (d.log[day] || 0) + mins; d.hrs[h] = (d.hrs[h] || 0) + mins;
    await persist();
  }
  if (!early) { try { navigator.vibrate && navigator.vibrate([200, 100, 200]); } catch (e) { /* ignore */ } }
  const msg = wasFocus ? (mins >= 1 ? t("Focus session done: {n} minutes saved.", { n: num(mins) }) : "") : t("Break is over. Ready for the next round?");
  if (msg) toast(msg, "ok");
  refresh();
  if (wasFocus && !early && task) {
    const d = await sp(), x = d.tasks.find((q) => q.id === task);
    if (x && !x.dn && (await ask(t("Mark \"{x}\" as done?", { x: x.ti }), { ok: t("Yes, done"), cancel: t("Not yet") }))) { x.dn = true; x.dd = T(); await persist(); refresh(); }
  }
}
page("focus", async () => {
  const g = guard(); if (g) return g;
  restoreTimer();
  const d = await sp(), today = T(), open = tasksOn(d, today).filter((x) => !x.dn), l = left();
  const ex = expired; expired = false;
  setTimeout(paint, 0);
  return `${ex ? notice(esc(t("The timer ended while the app was closed. It was not counted.")), "warn") : ""}
  <section class="card ft">
    <div class="chips">${chips2([["focus", t("Focus")], ["break", t("Break")]], FT.mode, "ft-mode")}</div>
    <div class="ft-ring"><svg viewBox="0 0 220 220" aria-hidden="true"><circle cx="110" cy="110" r="96" class="ft-bg"/><circle id="ft-ring" cx="110" cy="110" r="96" class="ft-fg ${FT.mode}" stroke-dasharray="${CIRC}" stroke-dashoffset="${CIRC * (1 - (FT.total ? l / FT.total : 0))}" transform="rotate(-90 110 110)"/></svg>
      <div class="ft-in"><div id="ft-time" class="ft-t" role="timer" aria-live="off">${mmss(l)}</div><div class="mut">${esc(FT.mode === "focus" ? t("Focus") : t("Break"))}</div></div></div>
    ${FT.mode === "focus" ? `<div class="chips ft-len" aria-label="${esc(t("Minutes of focus"))}">${[15, 25, 45, 60].map((m) => `<button type="button" class="chip ${FT.len === m && !FT.run ? "on" : ""}" data-act="ft-len" data-arg="${m}" ${FT.run ? "disabled" : ""}>${esc(t("{n} min", { n: num(m) }))}</button>`).join("")}</div>
    ${open.length ? `<label class="fld"><span>${esc(t("Task (optional)"))}</span><select data-change="ft-task" ${FT.run ? "disabled" : ""}><option value="">${esc(t("No task"))}</option>${open.map((x) => `<option value="${esc(x.id)}" ${FT.task === x.id ? "selected" : ""}>${esc(x.ti)}</option>`).join("")}</select></label>` : ""}` : ""}
    <div class="ft-btns">${btn(FT.run ? t("Pause") : FT.left < FT.total ? t("Resume") : t("Start"), "ft-go", { kind: "pri", ic: FT.run ? "pause" : "play" })}${btn(t("Reset"), "ft-reset", { ic: "refresh" })}<button type="button" class="btn" id="ft-finish" data-act="ft-finish" ${FT.mode === "focus" && FT.total - l >= 60 ? "" : "hidden"}>${icon("check")}${esc(t("Finish now"))}</button></div>
    <p class="mut sm tc">${esc(t("Keep this screen open while you study. The timer keeps running if you open another page."))}</p>
  </section>
  <div class="mt">${card(t("Focus today"), `<div class="ft-sum">${icon("timer")}<b>${esc(hm(minutesOn(d, today)))}</b></div>`)}</div>`;
});
const chips2 = (items, cur, a) => items.map(([k, l]) => `<button type="button" class="chip ${k === cur ? "on" : ""}" data-act="${a}" data-arg="${k}" ${FT.run ? "disabled" : ""}>${esc(l)}</button>`).join("");
act("ft-mode", (el) => { if (FT.run) return; FT.mode = el.dataset.arg; FT.total = FT.left = (FT.mode === "break" ? 5 : FT.len) * 60; FT.start = 0; saveTimer(); refresh(); });
act("ft-len", (el) => { if (FT.run) return; FT.len = +el.dataset.arg; FT.total = FT.left = FT.len * 60; FT.start = 0; saveTimer(); refresh(); });
onChange("ft-task", (el) => { FT.task = el.value; saveTimer(); });
act("ft-go", async () => {
  if (FT.run) { FT.left = left(); FT.run = false; clearInterval(tickId); unlock(); saveTimer(); return refresh(); }
  if (FT.left <= 0) FT.left = FT.total;
  if (FT.left === FT.total) FT.start = Date.now();
  FT.end = Date.now() + FT.left * 1000; FT.run = true; saveTimer(); startTick(); lock(); refresh();
});
act("ft-reset", () => { clearInterval(tickId); unlock(); FT.run = false; FT.start = 0; FT.left = FT.total; saveTimer(); refresh(); });
act("ft-finish", () => finishTimer(true));

// ======================================================= AI assistant (chat)
let CH = [], CHpid = "", BUSY = false, TYPING = false;
const CKEY = () => "rise-chat-" + S.pid;
function loadChat() {
  if (CHpid === S.pid) return;
  CHpid = S.pid; CH = [];
  try { const o = JSON.parse(localStorage.getItem(CKEY()) || "[]"); if (Array.isArray(o)) CH = o.filter((m) => m && typeof m.text === "string").slice(-30); } catch (e) { CH = []; }
}
const saveChat = () => { try { localStorage.setItem(CKEY(), JSON.stringify(CH.slice(-30))); } catch (e) { /* private mode */ } };
const body = (s) => esc(s).replace(/\n/g, "<br>");
function bubbles() {
  const out = CH.map((m, i) => m.me
    ? `<div class="msg msg--me"><div class="msg-b">${body(m.text)}</div></div>`
    : `<div class="msg msg--bot"><span class="msg-av">${icon("bot")}</span><div class="msg-b">${body(m.text)}${m.note ? `<small class="mut">${esc(m.note)}</small>` : ""}
      ${m.add && m.add.length ? (m.done ? `<div class="sp-btns">${tag(t("Added"), "ok")}</div>` : `<div class="sp-btns">${btn(t("Add {n} tasks to my planner", { n: num(m.add.length) }), "ai-add", { arg: i, sm: true, kind: "pri" })}</div>`) : ""}
      ${m.go ? `<div class="sp-btns">${btn(t("Open the Focus timer"), "nav", { arg: m.go, sm: true })}</div>` : ""}</div></div>`).join("");
  return out + (TYPING ? `<div class="msg msg--bot"><span class="msg-av">${icon("bot")}</span><div class="msg-b typing" role="status" aria-label="${esc(t("Thinking..."))}"><i></i><i></i><i></i></div></div>` : "");
}
const lastChips = () => { const m = [...CH].reverse().find((x) => !x.me && x.chips); return (m && m.chips) || CHIPS; };
function chipsHtml() { return lastChips().map(([k, l]) => `<button type="button" class="chip" data-act="ai-chip" data-arg="${k}" ${BUSY ? "disabled" : ""}>${esc(t(l))}</button>`).join(""); }
function paintChat() {
  const l = $("#ch-list"); if (!l) return;
  l.innerHTML = bubbles();
  const c = $("#ch-chips"); if (c) c.innerHTML = chipsHtml();
  const w = $("#ch-wrap"); if (w) w.scrollTop = w.scrollHeight;
  window.scrollTo(0, document.body.scrollHeight);
}
page("aichat", async () => {
  const g = guard(); if (g) return g;
  loadChat();
  const cfg = await aiConfig(), ai = aiReady(cfg);
  if (!CH.length) { const r = reply("hello", await ctx(), t); CH.push({ text: r.text, chips: r.chips }); saveChat(); }
  const pend = pageState("ai").pend; pageState("ai").pend = null;
  if (pend) setTimeout(() => send(pend.text, pend.intent), 60);
  setTimeout(paintChat, 0);
  return `<div class="ch-head">${ai ? tag(t("AI on"), "ok") : tag(t("Smart helper"), "info")}<button type="button" class="btn btn--sm" data-act="ai-clear">${icon("trash")}${esc(t("Clear chat"))}</button></div>
  <div class="ch" id="ch-wrap"><div id="ch-list" class="ch-list" aria-live="polite">${bubbles()}</div>${ai ? `<p class="mut sm tc">${esc(t("AI answers can be wrong. Check important things with your teacher."))}</p>` : ""}</div>
  <div class="chat-in-w"><div class="chips" id="ch-chips">${chipsHtml()}</div>
  <form class="chat-in" data-submit="ai-send"><textarea id="ch-q" name="q" rows="1" maxlength="500" data-input="ai-grow" placeholder="${esc(t("Ask anything about your studies..."))}" aria-label="${esc(t("Ask anything about your studies..."))}"></textarea><button class="btn btn--pri" type="submit" aria-label="${esc(t("Send"))}">${icon("send")}</button></form></div>`;
});
const problemText = (k) => t({ quota: "The AI is busy or its daily limit is reached. The built-in helper answered instead.", setup: "The AI is not set up correctly yet. The built-in helper answered instead.", net: "The AI could not be reached (internet?). The built-in helper answered instead.", blocked: "The AI could not answer that. The built-in helper answered instead." }[k] || "The AI had a problem. The built-in helper answered instead.");
async function send(text, intent) {
  text = String(text || "").trim().slice(0, 500);
  if (!text || BUSY) return;
  loadChat();
  BUSY = true;
  const history = CH.filter((m) => m.text).slice(-8).map((m) => ({ me: !!m.me, text: m.text }));
  CH.push({ me: true, text }); TYPING = true; paintChat();
  try {
    const c = await ctx(), cfg = await aiConfig(), d = c.sp, k = intent || detect(text), used = d.ai && d.ai.d === c.today ? d.ai.n : 0;
    let out = null, note = "";
    if (aiReady(cfg) && !OWN_DATA.includes(k)) {
      if (used >= cfg.lim) note = t("You used today's {n} AI messages. The built-in helper answers until tomorrow.", { n: num(cfg.lim) });
      else {
        try {
          const weak = subjectStats(c.results).slice(0, 3).map((x) => x.n);
          const a = await askAI({ question: text, history, ctx: { cls: S.me.cls ? "Class " + S.me.cls + (S.me.grp ? " " + S.me.grp : "") : "", weak }, inst: instName() });
          out = { text: a, ai: true };
          d.ai = { d: c.today, n: used + 1 }; await persist();
        } catch (e) { note = problemText(aiProblem(e)); }
      }
    }
    if (!out) {
      const r = reply(k, c, t, text);
      out = { text: note && r.unknown ? t("I could not reach the AI right now. Please try again in a little while, or try one of these:") : r.text, chips: r.chips, add: r.add, go: r.go, note };
    }
    CH.push(out);
  } catch (e) { console.error(e); CH.push({ text: t("The AI had a problem. The built-in helper answered instead.") }); }
  TYPING = false; BUSY = false; saveChat(); paintChat();
}
onSubmit("ai-send", async () => {
  const q = $("#ch-q"); if (!q) return;
  const v = q.value; q.value = ""; q.style.height = "";
  await send(v);
});
onInput("ai-grow", (el) => { el.style.height = "auto"; el.style.height = Math.min(el.scrollHeight, 120) + "px"; });
document.addEventListener("keydown", (e) => {   // Enter sends, Shift+Enter makes a new line
  if (e.key === "Enter" && !e.shiftKey && !e.isComposing && e.target && e.target.id === "ch-q") { e.preventDefault(); const f = e.target.closest("form"); if (f && f.requestSubmit) f.requestSubmit(); }
});
act("ai-chip", (el) => { const k = el.dataset.arg, c = CHIPS.find((x) => x[0] === k); return send(c ? t(c[1]) : k, k); });
act("ai-add", async (el) => {
  const m = CH[+el.dataset.arg]; if (!m || !m.add || m.done) return;
  const d = await sp();
  m.add.forEach((x) => d.tasks.push({ id: uid(), ti: x.ti, sb: x.sb || "", d: x.d, tm: x.tm || "", mn: x.mn || 30, dn: false, dd: "" }));
  m.done = true; await persist(); saveChat(); paintChat();
  toast(t("{n} tasks added to your planner.", { n: num(m.add.length) }), "ok");
});
act("ai-clear", async () => {
  if (!(await ask(t("Clear the whole chat?"), { ok: t("Clear chat"), danger: true }))) return;
  CH = []; saveChat(); refresh();
});
