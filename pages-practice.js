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
import { aiConfig, aiReady, askStaffAI, askTutor, askCards, aiProblem, appCheckText } from "./lib-ai.js";
import { withAiBudget } from "./pages-study.js";
import { blankMcq, blankShort, fromAi, cardsFrom, mergeRefined, weakTopics, cleanSet, scoreSet, setStats, MAX_Q, MAX_SQ, MAX_NOTES, LIM, TASKS, DIFS, KINDS, LVLS, LANGS, COUNTS, DIF_LABEL, KIND_LABEL, LVL_LABEL, LANG_LABEL } from "./lib-practice.js";

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
  // the new choices, files, changing the draft
  "Photos or files (up to 4)": "ছবি বা ফাইল (সর্বোচ্চ ৪টি)", "PDF or text file": "পিডিএফ বা টেক্সট ফাইল", "Remove file": "ফাইল সরান",
  "Up to 4 files.": "সর্বোচ্চ ৪টি ফাইল।", "Use a photo, a PDF or a text file.": "ছবি, পিডিএফ বা টেক্সট ফাইল দিন।", "That PDF is too big (4 MB at most).": "পিডিএফটি অনেক বড় (সর্বোচ্চ ৪ এমবি)।",
  "Add a photo, a file or write a topic first.": "আগে একটি ছবি বা ফাইল যোগ করুন, অথবা বিষয় লিখুন।",
  "Use the files": "ফাইল ব্যবহার", "Together with my words": "আমার লেখার সাথে", "Only what is in the files": "শুধু ফাইলে যা আছে",
  "More options": "আরও অপশন", "How hard?": "কতটা কঠিন?", "Easy": "সহজ", "Medium": "মধ্যম", "Hard": "কঠিন", "Board exam standard": "বোর্ড পরীক্ষার মান",
  "Kind of question": "প্রশ্নের ধরন", "Normal MCQ": "সাধারণ এমবিসিকিউ", "With a stimulus (উদ্দীপক)": "উদ্দীপকসহ", "True or false": "সত্য বা মিথ্যা",
  "Thinking level": "চিন্তার স্তর", "All levels": "সব স্তর", "Knowledge (জ্ঞান)": "জ্ঞানমূলক", "Understanding (অনুধাবন)": "অনুধাবনমূলক", "Application (প্রয়োগ)": "প্রয়োগমূলক", "Higher order (উচ্চতর দক্ষতা)": "উচ্চতর দক্ষতা",
  "You can write in Bangla, English or Banglish.": "বাংলা, ইংরেজি বা ব্যাংলিশে লিখতে পারেন।",
  "The AI understood:": "এআই যা বুঝেছে:", "Undo the AI change": "এআই এর পরিবর্তন ফিরিয়ে নিন", "The AI change was undone.": "এআই এর পরিবর্তন ফিরিয়ে নেওয়া হয়েছে।", "Undo the AI change? Anything you changed by hand since then is lost too.": "এআই এর পরিবর্তন ফিরিয়ে নেবেন? এরপর আপনি নিজে যা বদলেছেন সেটিও হারিয়ে যাবে।",
  "Ask the AI to change this set": "এআইকে দিয়ে এই সেট বদলান", "Write what to change first.": "আগে কী বদলাতে হবে তা লিখুন।", "Change": "বদলান",
  "e.g. make question 2 harder, add 2 math questions, write the explanations in Bangla": "যেমন: ২ নম্বর প্রশ্ন কঠিন করুন, ২টি অঙ্কের প্রশ্ন যোগ করুন, ব্যাখ্যা বাংলায় লিখুন",
  "Make the questions harder": "প্রশ্নগুলো আরও কঠিন করুন", "Add 2 more questions": "আরও ২টি প্রশ্ন যোগ করুন", "Write all explanations in simple Bangla": "সব ব্যাখ্যা সহজ বাংলায় লিখুন", "Add one question with a stimulus (উদ্দীপক)": "উদ্দীপকসহ একটি প্রশ্ন যোগ করুন",
  "The AI changed the set ({a} to {b} questions). Check what changed.": "এআই সেটটি বদলেছে ({a}টি থেকে {b}টি প্রশ্ন)। কী বদলেছে দেখে নিন।", "The AI changed the set. Check what changed.": "এআই সেটটি বদলেছে। কী বদলেছে দেখে নিন।",
  "Move up": "উপরে নিন", "Move down": "নিচে নিন", "Make this question again with the AI": "এআই দিয়ে এই প্রশ্নটি নতুন করে বানান", "The question was made again. Check it.": "প্রশ্নটি নতুন করে বানানো হয়েছে। যাচাই করুন।",
  "Topic (optional), e.g. Newton's second law": "বিষয় (ঐচ্ছিক), যেমন: নিউটনের দ্বিতীয় সূত্র", "Topic": "টপিক",
  // the AI Co-Pilot (the ShikkhaAI way): one chat for a new set and for changes, the choices, flashcards
  "AI Co-Pilot": "এআই কো-পাইলট", "New topic": "নতুন বিষয়", "Count": "সংখ্যা", "Difficulty": "কাঠিন্য", "Question type": "প্রশ্নের ধরন", "Bloom's level": "ব্লুমের স্তর", "Language": "ভাষা", "Send": "পাঠান",
  "Write in Banglish, Bangla or English, or upload a book page, notes or a PDF. The AI makes the questions, the common mistakes and the solutions. You check them before they go to students.": "ব্যাংলিশ, বাংলা বা ইংরেজিতে লিখুন, অথবা বইয়ের পাতা, নোট বা পিডিএফ দিন। এআই প্রশ্ন, সাধারণ ভুলের কারণ ও সমাধান বানাবে। শিক্ষার্থীদের কাছে যাওয়ার আগে আপনি যাচাই করবেন।",
  "Assalamu alaikum! I am your AI Co-Pilot. Write in messy Banglish, in Bangla or English, or upload a book page, notes or a PDF, and I make the questions. For example: \"bhai class 9 physics er bol o goti niye 4ta math mcq banao banglay\"": "আসসালামু আলাইকুম! আমি আপনার এআই কো-পাইলট। এলোমেলো ব্যাংলিশ, বাংলা বা ইংরেজিতে লিখুন, অথবা বইয়ের পাতা, নোট বা পিডিএফ দিন, আমি প্রশ্ন বানিয়ে দেব। যেমন: \"bhai class 9 physics er bol o goti niye 4ta math mcq banao banglay\"",
  "Try one in Banglish:": "ব্যাংলিশে একটি চেষ্টা করুন:", "Ask the AI to change the set:": "এআইকে দিয়ে সেট বদলান:", "Your words to the AI": "এআইকে আপনার কথা",
  "e.g. \"2 number ta hard koro\"": "যেমন: \"2 number ta hard koro\"", "e.g. class 9 biology cell 5ta mcq": "যেমন: class 9 biology cell 5ta mcq",
  "The AI is reading your words and files and making the questions...": "এআই আপনার লেখা ও ফাইল পড়ে প্রশ্ন বানাচ্ছে...", "Make important questions from the uploaded files.": "আপলোড করা ফাইল থেকে গুরুত্বপূর্ণ প্রশ্ন বানাও।",
  "{n} questions are ready. Check them below and send them to the batch.": "{n}টি প্রশ্ন তৈরি। নিচে যাচাই করে ব্যাচে পাঠান।", "Why students get this wrong (optional)": "শিক্ষার্থীরা কেন ভুল করে (ঐচ্ছিক)", "Why students get this wrong": "শিক্ষার্থীরা কেন ভুল করে",
  "The AI could not answer right now. Remember simply: the right answer is \"{a}\". Reason: {r}": "এআই এখন উত্তর দিতে পারেনি। সহজভাবে মনে রাখুন: সঠিক উত্তর \"{a}\"। কারণ: {r}", "The AI could not answer right now. Remember simply: the right answer is \"{a}\".": "এআই এখন উত্তর দিতে পারেনি। সহজভাবে মনে রাখুন: সঠিক উত্তর \"{a}\"।",
  "AI revision cards": "এআই রিভিশন কার্ড", "Write a topic and the AI makes 4 short cards for revision. Tap a card to see the other side.": "একটি টপিক লিখুন, এআই রিভিশনের জন্য ৪টি ছোট কার্ড বানাবে। উল্টো পিঠ দেখতে কার্ডে চাপুন।",
  "e.g. Organic chemistry / Tense": "যেমন: জৈব রসায়ন / Tense", "Make 4 cards": "৪টি কার্ড বানান", "Write a topic first.": "আগে একটি টপিক লিখুন।", "New revision cards are ready.": "নতুন রিভিশন কার্ড তৈরি।",
  "The AI could not make the cards right now. Try again later.": "এআই এখন কার্ড বানাতে পারেনি। পরে আবার চেষ্টা করুন।", "Answer": "উত্তর", "Question": "প্রশ্ন", "AI can be wrong. Check important facts with your teacher or your book.": "এআই ভুল করতে পারে। গুরুত্বপূর্ণ তথ্য শিক্ষক বা বইয়ের সাথে মিলিয়ে নিন।",
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
  "e.g. Physics": "যেমন: পদার্থবিজ্ঞান", "Take photo": "ছবি তুলুন", "Choose photo": "ছবি বাছুন", "Remove photo": "ছবি সরান",
  "Topic or instruction (optional)": "বিষয় বা নির্দেশ (ঐচ্ছিক)", "e.g. Chapter 3, Newton's laws, make it a bit hard": "যেমন: তৃতীয় অধ্যায়, নিউটনের সূত্র, একটু কঠিন করুন", "What should the AI make?": "এআই কী বানাবে?", "How many questions?": "কয়টি প্রশ্ন?",
  "The AI is working...": "এআই কাজ করছে...", "Details:": "বিস্তারিত:", "App Check could not verify this website. In Google Cloud > Fraud Defense add \"{host}\" to the domains of your score-based key, and check that the same key is registered for the Web app in Firebase Console > App Check > Apps and is pasted in Settings. Then try again.": "App Check এই ওয়েবসাইটকে যাচাই করতে পারেনি। Google Cloud > Fraud Defense এ আপনার score-based কী-র ডোমেইনে \"{host}\" যোগ করুন, আর Firebase Console > App Check > Apps এ Web অ্যাপে এবং Settings এ একই কী আছে কিনা দেখুন। তারপর আবার চেষ্টা করুন।", "Firebase AI Logic is not turned on in your Firebase project yet. Open Firebase Console > Build > AI Logic > Get started and choose the Gemini Developer API.": "Firebase AI Logic আপনার Firebase প্রজেক্টে এখনো চালু করা হয়নি। Firebase Console > Build > AI Logic > Get started খুলে Gemini Developer API বেছে নিন।", "Make a draft": "খসড়া বানান", "Photos, files and your words go to Google's AI. Do not include students' names or phone numbers.": "ছবি, ফাইল ও আপনার লেখা গুগলের এআই এর কাছে যায়। শিক্ষার্থীদের নাম বা ফোন নম্বর দেবেন না।",
  
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
  // the student: topics and the AI tutor
  "Topic: {n}": "টপিক: {n}", "Revise these topics:": "এই টপিকগুলো আবার পড়ুন:", "Ask the AI about this": "এআইকে জিজ্ঞেস করুন", "Ask": "জিজ্ঞেস করুন",
  "e.g. Please explain it in an easier way": "যেমন: আরও সহজ করে বুঝিয়ে দিন", "Write your question first.": "আগে আপনার প্রশ্ন লিখুন।",
  "AI answers can be wrong. If you think the marked answer is wrong, tap \"This answer looks wrong\".": "এআই এর উত্তর ভুল হতে পারে। চিহ্নিত উত্তরটি ভুল মনে হলে \"এই উত্তর ভুল মনে হচ্ছে\" চাপুন।",
  "The AI could not answer right now. Read the explanation above, or try again later.": "এআই এখন উত্তর দিতে পারেনি। ওপরের ব্যাখ্যাটি পড়ুন, অথবা পরে আবার চেষ্টা করুন।",
  "You used today's {n} AI messages. Try again tomorrow.": "আজকের {n}টি এআই বার্তা শেষ। কাল আবার চেষ্টা করুন।", "AI tutor": "এআই শিক্ষক", "You": "আপনি",
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
const clearAi = () => Object.assign(pageState("pr"), { ph: [], undo: null, chat: [], tx: "" });   // the files, the chat with the AI and the undo of the last AI change
const keep = () => { try { localStorage.setItem(dkey(), JSON.stringify(D)); } catch (e) { /* private mode: the draft stays while the app is open */ } };
const reset = () => { D = blankD(); Dpid = S.pid; keep(); };
// before the AI changes the draft: what it looks like now, so that the teacher can take the change back
const snap = () => { const d = draft(); return JSON.stringify({ ti: d.ti, nt: d.nt, qs: d.qs, sq: d.sq, ai: d.ai }); };

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

// up to 4 files; a PDF: at most 4 MB (it is sent as it is); a text file: the first 35 000 characters
const MAX_FILES = 4, MAX_PDF = 4 * 1024 * 1024, MAX_TXT = 35000;
const readAs = (file, how) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(new Error("read")); r[how](file); });
async function takeFile(f) {
  const name = String(f.name || "file").slice(0, 60), type = String(f.type || "").toLowerCase(), ext = (name.split(".").pop() || "").toLowerCase();
  if (type.startsWith("image/")) return { kind: "img", name, ...(await shrink(f)) };
  if (type === "application/pdf" || ext === "pdf") {
    if (f.size > MAX_PDF) throw Object.assign(new Error("big"), { code: "big" });
    return { kind: "pdf", name, mime: "application/pdf", data: String(await readAs(f, "readAsDataURL")).split(",")[1] };
  }
  if (type.startsWith("text/") || ["txt", "md", "csv"].includes(ext)) {
    const text = String(await readAs(f, "readAsText")).slice(0, MAX_TXT).trim();
    if (!text) throw new Error("empty");
    return { kind: "txt", name, text };
  }
  throw new Error("kind");
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
  if (e && e.hint && appCheckText(e.hint, location.hostname)) return appCheckText(e.hint, location.hostname);
  if (/app.?check|appcheck\//i.test(String((e && e.message) || ""))) return t("App Check could not verify this website. In Google Cloud > Fraud Defense add \"{host}\" to the domains of your score-based key, and check that the same key is registered for the Web app in Firebase Console > App Check > Apps and is pasted in Settings. Then try again.", { host: location.hostname });
  if (/api.?not.?enabled|requires the firebase ai api/i.test(String((e && (e.code + " " + e.message)) || ""))) return t("Firebase AI Logic is not turned on in your Firebase project yet. Open Firebase Console > Build > AI Logic > Get started and choose the Gemini Developer API.");
  return ({
    quota: t("The AI is busy or its daily limit is reached. Try again later."),
    setup: t("The AI is not set up correctly yet. Ask the admin to check Settings > AI study assistant."),
    net: t("The AI could not be reached (internet?)."),
    blocked: t("The AI could not answer that. Change the photo or the words and try again."),
  })[aiProblem(e)] || t("The AI could not answer that. Change the photo or the words and try again.");
};
// the real reason, for the teacher / admin to read out or send as a screenshot (links are cut: they hold the project id)
const errDetail = (e) => String(((e && e.code) ? e.code + ": " : "") + ((e && e.message) || e || "")).replace(/https?:\/\/\S+/g, "...").replace(/\s+/g, " ").trim().slice(0, 420);
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
// the buttons of a question: up, down, make it again with the AI, delete
const qTools = (k, i, len, ready, busy) => `<button type="button" class="btn btn--xs pq-up" data-act="pr-mv" data-arg="${k}:${i}:-1" aria-label="${esc(t("Move up"))}" ${i === 0 ? "disabled" : ""}>${icon("down")}</button><button type="button" class="btn btn--xs" data-act="pr-mv" data-arg="${k}:${i}:1" aria-label="${esc(t("Move down"))}" ${i === len - 1 ? "disabled" : ""}>${icon("down")}</button>${ready ? `<button type="button" class="btn btn--xs" data-act="pr-regen" data-arg="${k}:${i}" aria-label="${esc(t("Make this question again with the AI"))}" ${busy ? "disabled" : ""}>${icon("refresh")}</button>` : ""}<button type="button" class="btn btn--xs btn--bad" data-act="pr-delq" data-arg="${k}:${i}" aria-label="${esc(t("Delete"))}">${icon("trash")}</button>`;
const mcqCard = (x, i, flags, len, ready, busy) => `<div class="pq" id="pq-m${i}">
  <div class="pq-h"><b>${esc(t("Question {n}", { n: i + 1 }))}</b>${x.b ? `<span class="pq-topic">${esc(x.b)}</span>` : ""}${flags ? tag(t("{n} reported", { n: flags }), "warn") : ""}${qTools("m", i, len, ready, busy)}</div>
  <textarea rows="2" maxlength="${LIM.q}" data-input="pr-q" data-arg="m:${i}:q" placeholder="${esc(t("The question"))}">${esc(x.q)}</textarea>
  <input type="text" class="pq-c" maxlength="${LIM.c}" data-input="pr-q" data-arg="m:${i}:c" value="${esc(x.c || "")}" placeholder="${esc(t("Topic (optional), e.g. Newton's second law"))}" aria-label="${esc(t("Topic"))}">
  <div class="pq-o">${[0, 1, 2, 3].map((j) => `<label class="pq-opt ${x.a === j ? "ok" : ""}"><input type="radio" name="ans-${i}" value="${j}" data-change="pr-ans" data-arg="${i}" ${x.a === j ? "checked" : ""} aria-label="${esc(t("Right answer"))}"><input type="text" maxlength="${LIM.opt}" data-input="pr-q" data-arg="m:${i}:o:${j}" value="${esc((x.o || [])[j] || "")}" placeholder="${esc(t("Option {n}", { n: j + 1 }))}"></label>`).join("")}</div>
  <small class="mut">${esc(t("Tick the right answer."))}</small>
  <textarea rows="2" maxlength="${LIM.ex}" data-input="pr-q" data-arg="m:${i}:e" placeholder="${esc(t("Why is this the right answer? Students read it after they solve."))}">${esc(x.e || "")}</textarea>
  <textarea rows="2" maxlength="${LIM.why}" data-input="pr-q" data-arg="m:${i}:w" placeholder="${esc(t("Why students get this wrong (optional)"))}">${esc(x.w || "")}</textarea>
  <textarea rows="2" maxlength="${LIM.how}" data-input="pr-q" data-arg="m:${i}:h" placeholder="${esc(t("How to solve it (optional)"))}">${esc(x.h || "")}</textarea>
</div>`;
const shortCard = (x, i, len, ready, busy) => `<div class="pq" id="pq-s${i}">
  <div class="pq-h"><b>${esc(t("Short question {n}", { n: i + 1 }))}</b>${qTools("s", i, len, ready, busy)}</div>
  <textarea rows="2" maxlength="${LIM.q}" data-input="pr-q" data-arg="s:${i}:q" placeholder="${esc(t("The question"))}">${esc(x.q)}</textarea>
  <textarea rows="3" maxlength="${LIM.ans}" data-input="pr-q" data-arg="s:${i}:a" placeholder="${esc(t("The model answer"))}">${esc(x.a)}</textarea>
</div>`;

// the Co-Pilot: its first words, the example commands (the same as ShikkhaAI's: a first command, and changes to a draft), the chat
const CHIPS_NEW = ["bhai class 9 physics bol o goti niye 4ta math mcq banao banglay", "photosynthesis niye 4ta tricky mcq banao jate student confuse hoy", "english grammar tense theke 5ta tricky question dao"];
const CHIPS_EDIT = ["2 number question ta ektu hard koro", "aro 2ta math problem add koro", "shob banglay translate koro", "uddipok (scenario) add koro"];
const chatHtml = (u) => {
  const msgs = [{ text: t("Assalamu alaikum! I am your AI Co-Pilot. Write in messy Banglish, in Bangla or English, or upload a book page, notes or a PDF, and I make the questions. For example: \"bhai class 9 physics er bol o goti niye 4ta math mcq banao banglay\"") }, ...(u.chat || [])];
  return msgs.map((m) => `<div class="pr-msg ${m.me ? "me" : "ai"}${m.err ? " err" : ""}">
    ${m.files && m.files.length ? `<div class="pr-msg-f">${m.files.map((n) => `<span>${icon("file")}${esc(n)}</span>`).join("")}</div>` : ""}
    ${m.badge ? `<div class="pr-badge">${icon("spark")} <b>${esc(t("The AI understood:"))}</b> ${esc(m.badge)}</div>` : ""}
    <div>${esc(m.text).replace(/\n/g, "<br>")}</div>${m.detail ? `<small class="pr-det">${esc(t("Details:"))} ${esc(m.detail)}</small>` : ""}</div>`).join("") +
    (u.busy ? `<div class="pr-msg ai"><div>${icon("refresh")} ${esc(t("The AI is reading your words and files and making the questions..."))}</div></div>` : "");
};

// ready of the AI; busy: a request is running; u: the page state (the undo of the last AI change)
function draftCard(d, flagsOf, ready, u) {
  const n = d.qs.length + d.sq.length, edit = !!d.editId, busy = !!u.busy;
  return `<section class="card stack-s" id="pr-draft">
    <div class="card-h"><h3>${esc(edit ? t("Edit this set") : t("Your set"))}</h3>${n ? tag(qWord(n), "info") : ""}</div>
    ${edit ? notice(esc(t("This set was sent to {b}. Students see your changes at once.", { b: batchName(d.bid) })), "info") : ""}
    ${u.undo ? `<div>${btn(t("Undo the AI change"), "pr-undo", { sm: true, ic: "back" })}</div>` : ""}
    <label class="fld"><span>${esc(t("Title"))}</span><input type="text" maxlength="${LIM.ti}" value="${esc(d.ti)}" data-input="pr-f" data-arg="ti" placeholder="${esc(t("e.g. Physics chapter 3 practice"))}"></label>
    <label class="fld"><span>${esc(t("Notes (optional)"))}</span><textarea rows="${d.nt ? 6 : 3}" maxlength="${MAX_NOTES}" data-input="pr-f" data-arg="nt" placeholder="${esc(t("A summary or a solution students can read before they practise."))}">${esc(d.nt)}</textarea></label>
    ${n || d.nt ? "" : `<p class="mut">${esc(t("Nothing here yet. Ask the AI above, or add a question by hand."))}</p>`}
    ${d.qs.map((x, i) => mcqCard(x, i, flagsOf ? flagsOf(x.id) : 0, d.qs.length, ready, busy)).join("")}
    ${d.sq.map((x, i) => shortCard(x, i, d.sq.length, ready, busy)).join("")}
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
  if (!COUNTS.includes(u.cnt)) u.cnt = 4;
  u.ph = u.ph || []; u.chat = u.chat || [];
  if (!DIFS.includes(u.dif)) u.dif = "medium";
  if (!KINDS.includes(u.kind)) u.kind = "mcq";
  if (!LVLS.includes(u.lvl)) u.lvl = "mixed";
  if (!LANGS.includes(u.lang)) u.lang = "auto";
  if (u.src !== "strict") u.src = "mix";
  const names = await subjectNames(d.cls), flagsOf = d.editId ? await flagCounts(d) : null;
  const clsOpt = [["", t("Class")], ...[4, 5, 6, 7, 8, 9, 10, 11, 12].map((x) => [String(x), t("Class {n}", { n: x })])].map(([v, l]) => `<option value="${v}" ${v === String(d.cls) ? "selected" : ""}>${esc(l)}</option>`).join("");
  const kinds = [{ k: "mcq", label: t("MCQ questions") }, { k: "short", label: t("Short questions") }, { k: "summary", label: t("Summary notes") }, { k: "solve", label: t("Solve and explain") }];
  const sel = (arg, cur, list) => `<select data-change="pr-opt" data-arg="${arg}">${list.map(([v, l]) => `<option value="${v}" ${String(v) === String(cur) ? "selected" : ""}>${esc(l)}</option>`).join("")}</select>`;
  const isQ = u.task === "mcq" || u.task === "short", hasDraft = d.qs.length > 0, started = hasDraft || d.sq.length || d.nt || u.chat.length;
  const quick = u.task === "mcq" ? (hasDraft ? CHIPS_EDIT : CHIPS_NEW) : [];
  return `<div class="stack">
  ${ready ? "" : notice(`<b>${esc(t("The AI is not turned on yet."))}</b><br>${esc(isStaff() && !isTeacher() ? t("Turn it on in Settings > AI study assistant. Until then you can write questions by hand below.") : t("Ask the admin to turn it on. Until then you can write questions by hand below."))}`, "warn")}
  <section class="card stack-s pr-co">
    <div class="card-h"><h3>${esc(t("AI Co-Pilot"))}</h3><span class="row" style="gap:6px">${ready ? tag(t("AI on"), "ok") : ""}${started ? btn(t("New topic"), "pr-clear", { xs: true, ic: "plus" }) : ""}</span></div>
    <p class="mut" style="margin:0">${esc(t("Write in Banglish, Bangla or English, or upload a book page, notes or a PDF. The AI makes the questions, the common mistakes and the solutions. You check them before they go to students."))}</p>
    <div class="pr-set">
      <label class="fld"><span>${esc(t("Class"))}</span><select data-change="pr-cls">${clsOpt}</select></label>
      <label class="fld"><span>${esc(t("Subject"))}</span><input type="text" list="pr-sb" maxlength="${LIM.sb}" value="${esc(d.sb)}" data-input="pr-f" data-arg="sb" placeholder="${esc(t("e.g. Physics"))}"><datalist id="pr-sb">${names.map((x) => `<option value="${esc(x)}">`).join("")}</datalist></label>
      ${isQ ? `<label class="fld"><span>${esc(t("Count"))}</span>${sel("cnt", u.cnt, COUNTS.map((x) => [x, String(x)]))}</label>
      <label class="fld"><span>${esc(t("Difficulty"))}</span>${sel("dif", u.dif, DIFS.map((x) => [x, DIF_LABEL[x]]))}</label>` : ""}
      ${u.task === "mcq" ? `<label class="fld pr-wide"><span>${esc(t("Question type"))}</span>${sel("kind", u.kind, KINDS.map((x) => [x, KIND_LABEL[x]]))}</label>
      <label class="fld pr-wide"><span>${esc(t("Bloom's level"))}</span>${sel("lvl", u.lvl, LVLS.map((x) => [x, LVL_LABEL[x]]))}</label>` : ""}
      <label class="fld pr-wide"><span>${esc(t("Language"))}</span>${sel("lang", u.lang, LANGS.map((x) => [x, LANG_LABEL[x]]))}</label>
    </div>
    <div class="fld"><span>${esc(t("Photos or files (up to 4)"))}</span>
      <div class="row" style="gap:8px;flex-wrap:wrap">
        <label class="btn btn--sm" for="pr-cam">${icon("camera")}${esc(t("Take photo"))}</label><input id="pr-cam" type="file" accept="image/*" capture="environment" hidden data-change="pr-photo">
        <label class="btn btn--sm" for="pr-gal">${icon("image")}${esc(t("Choose photo"))}</label><input id="pr-gal" type="file" accept="image/*" multiple hidden data-change="pr-photo">
        <label class="btn btn--sm" for="pr-doc">${icon("file")}${esc(t("PDF or text file"))}</label><input id="pr-doc" type="file" accept="application/pdf,.pdf,text/plain,.txt,.md,.csv" multiple hidden data-change="pr-photo">
      </div>
      ${u.ph.length ? `<div class="pthumbs">${u.ph.map((p, i) => `<div class="pthumb ${p.kind === "img" ? "" : "pthumb-doc"}" title="${esc(p.name || "")}">${p.kind === "img" ? `<img alt="" src="data:${p.mime};base64,${p.data}">` : `${icon("file")}<span>${esc(String(p.name || "").slice(0, 18))}</span>`}<button type="button" data-act="pr-rm" data-arg="${i}" aria-label="${esc(t("Remove file"))}">${icon("x")}</button></div>`).join("")}</div>
      <label class="fld"><span>${esc(t("Use the files"))}</span>${sel("src", u.src, [["mix", t("Together with my words")], ["strict", t("Only what is in the files")]])}</label>` : ""}
    </div>
    <div class="fld"><span>${esc(t("What should the AI make?"))}</span>${chips(kinds, u.task, "pr-task")}</div>
    ${quick.length ? `<div class="fld"><span>${esc(hasDraft ? t("Ask the AI to change the set:") : t("Try one in Banglish:"))}</span><div class="chips pr-fixchips">${quick.map((x, i) => `<button type="button" class="chip" data-act="pr-chip" data-arg="${i}" ${u.busy ? "disabled" : ""}>${esc(x)}</button>`).join("")}</div></div>` : ""}
    <div class="pr-chat" id="pr-chat" aria-live="polite">${chatHtml(u)}</div>
    <div class="chat-in"><textarea id="pr-tx" rows="2" maxlength="1000" data-input="pr-tx" placeholder="${esc(hasDraft && u.task === "mcq" ? t("e.g. \"2 number ta hard koro\"") : t("e.g. class 9 biology cell 5ta mcq"))}" aria-label="${esc(t("Your words to the AI"))}">${esc(u.tx || "")}</textarea><button type="button" class="btn btn--pri" data-act="pr-go" ${u.busy ? "disabled" : ""} aria-label="${esc(t("Send"))}">${icon("send")}${esc(t("Send"))}</button></div>
    <small class="mut">${esc(t("Photos, files and your words go to Google's AI. Do not include students' names or phone numbers."))}</small>
  </section>
  ${draftCard(d, flagsOf, ready, u)}
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
onChange("pr-opt", (el) => {
  const u = pageState("pr"), k = el.dataset.arg;
  if (k === "cnt") u.cnt = +el.value || 4;
  else if (k === "dif" || k === "kind" || k === "lvl" || k === "lang" || k === "src") u[k] = el.value;
});
act("pr-task", (el) => { pageState("pr").task = el.dataset.arg; refresh(); });
onChange("pr-photo", async (el) => {
  const u = pageState("pr"), files = [...(el.files || [])];
  el.value = "";
  u.ph = u.ph || [];
  for (const f of files) {
    if (u.ph.length >= MAX_FILES) { toast(t("Up to 4 files."), "bad"); break; }
    try { u.ph.push(await takeFile(f)); }
    catch (e) { toast(e && e.code === "big" ? t("That PDF is too big (4 MB at most).") : t("Use a photo, a PDF or a text file."), "bad"); }
  }
  refresh();
});
act("pr-rm", (el) => { const u = pageState("pr"); u.ph.splice(+el.dataset.arg, 1); refresh(); });

// the AI may be asked: it is on, and this phone has not used up today's requests
async function gate() {
  if (!aiReady(await aiConfig())) { toast(t("The AI is not turned on yet."), "bad"); return false; }
  if (used() >= DAILY) { toast(t("You used today's {n} AI requests. Try again tomorrow, or write the questions by hand.", { n: DAILY }), "bad"); return false; }
  return true;
}
const inst = "Rise Edge Academy";
const grade = (d) => (d.cls ? "Class " + d.cls : "");
const toBottom = () => setTimeout(() => { const el = document.getElementById("pr-chat"); if (el) el.scrollTop = el.scrollHeight; }, 60);
const say = (u, m) => { u.chat = [...(u.chat || []), m].slice(-30); };

// One box for everything, as in ShikkhaAI's Co-Pilot: the teacher's words (Banglish too), the choices and the files go to the AI; when there is a draft already, it is sent
// along and the AI changes it ("2 number ta hard koro", "aro 2ta math add koro", "shob banglay translate koro"), otherwise it makes a new one.
async function send(raw) {
  const d = draft(), u = pageState("pr");
  if (u.busy) return;
  const text = String(raw == null ? u.tx || "" : raw).trim();
  if (!u.ph.length && !text) return toast(t("Add a photo, a file or write a topic first."), "bad");
  if (!(await gate())) return;
  const cmd = text || "Make important questions from the uploaded files.", edit = u.task === "mcq" && d.qs.length > 0;
  say(u, { me: true, text: text || t("Make important questions from the uploaded files."), files: u.ph.map((f) => f.name) });
  u.tx = ""; u.busy = true; refresh(); toBottom();
  try {
    const out = await askStaffAI({ task: u.task, cls: d.cls || "", subject: d.sb, count: u.cnt, text: cmd, files: u.ph, grade: grade(d), dif: u.dif, kind: u.kind, level: u.lvl, lang: u.lang, strict: u.src === "strict", draft: edit ? { qs: d.qs } : null, inst });
    const r = fromAi(u.task, out, edit);
    bump();
    const before = snap(), a = d.qs.length;
    if (r.title && !d.ti) d.ti = r.title;
    if (r.sb && !d.sb) d.sb = r.sb;
    d.qs = (edit ? mergeRefined(d.qs, r.qs) : [...d.qs, ...r.qs]).slice(0, MAX_Q);
    d.sq = [...d.sq, ...r.sq].slice(0, MAX_SQ);
    if (r.nt) d.nt = ((d.nt ? d.nt + "\n\n" : "") + r.nt).slice(0, MAX_NOTES);
    d.ai = true; keep();
    u.undo = before;
    say(u, { text: r.say || (r.nt ? t("Notes added. Read them before you send.") : t("{n} questions are ready. Check them below and send them to the batch.", { n: r.qs.length + r.sq.length })), badge: r.und });
    toast(r.nt && !r.qs.length && !r.sq.length ? t("Notes added. Read them before you send.")
      : edit && a !== d.qs.length ? t("The AI changed the set ({a} to {b} questions). Check what changed.", { a, b: d.qs.length })
      : edit ? t("The AI changed the set. Check what changed.") : t("{n} questions added. Check every answer before you send.", { n: r.qs.length + r.sq.length }), "ok");
  } catch (e) {
    say(u, { err: true, text: (e && e.say ? e.say + "\n" : "") + problemText(e), detail: errDetail(e) });
    toast(problemText(e), "bad");
  } finally { u.busy = false; refresh(); toBottom(); }
}
act("pr-go", () => send());
act("pr-chip", (el) => { send((draft().qs.length ? CHIPS_EDIT : CHIPS_NEW)[+el.dataset.arg]); });
act("pr-undo", async () => {
  const u = pageState("pr");
  if (!u.undo) return;
  if (!(await ask(t("Undo the AI change? Anything you changed by hand since then is lost too."), { ok: t("Undo") }))) return;
  try { Object.assign(draft(), JSON.parse(u.undo)); keep(); } catch (e) { return; }
  u.undo = null;
  refresh(); toast(t("The AI change was undone."), "ok");
});

// one question again, by the AI: a multiple-choice question with its own request (ShikkhaAI's), a true / false or a short question with the same topic
act("pr-regen", async (el) => {
  const [k, i] = el.dataset.arg.split(":"), d = draft(), u = pageState("pr"), L = k === "m" ? d.qs : d.sq, x = L[+i];
  if (!x || u.busy || !(await gate())) return;
  u.busy = true; refresh();
  const two = k === "m" && (x.o || []).filter(Boolean).length === 2;
  try {
    let nx;
    if (k === "m" && !two) {
      const out = await askStaffAI({ task: "regen", cls: d.cls || "", files: u.ph, title: d.ti || d.sb || "", grade: grade(d), dif: u.dif, question: x.q, lang: u.lang, inst });
      nx = fromAi("regen", out).qs[0];
    } else {
      const text = "Make ONE new question on the same topic as the set \"" + (d.ti || d.sb || "") + "\", a different question from this one: " + String(x.q).slice(0, 300) + (x.c ? " (topic: " + x.c + ")" : "");
      const out = await askStaffAI({ task: k === "m" ? "mcq" : "short", cls: d.cls || "", subject: d.sb, count: 1, text, grade: grade(d), dif: u.dif, kind: two ? "tf" : "mcq", level: u.lvl, lang: u.lang, inst });
      const r = fromAi(k === "m" ? "mcq" : "short", out);
      nx = (k === "m" ? r.qs : r.sq)[0];
    }
    if (!nx) throw Object.assign(new Error("empty"), { code: "empty" });
    bump();
    const before = snap();
    L[+i] = nx; d.ai = true; keep();
    u.undo = before;
    toast(t("The question was made again. Check it."), "ok");
  } catch (e) { toast(problemText(e), "bad"); }
  finally { u.busy = false; refresh(); }
});
act("pr-mv", (el) => {
  const [k, i, dir] = el.dataset.arg.split(":"), d = draft(), L = k === "m" ? d.qs : d.sq, a = +i, b = a + (+dir);
  if (!L[a] || !L[b]) return;
  [L[a], L[b]] = [L[b], L[a]]; keep(); refresh();
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
  reset(); clearAi(); refresh();
});
act("pr-cancel", () => { reset(); clearAi(); go("psets"); });

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
      reset(); clearAi();
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
  reset(); clearAi(); toast(t("Saved. Students see the new version."), "ok");
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
  keep(); clearAi(); go("aitools");
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
    ${aiReady(await aiConfig()) ? cardsCard() : ""}
  </div>`;
}, { title: "Practice" });
// revision cards: the student writes a topic, the AI makes 4 cards (kept while the page is open, not saved). It uses his daily AI messages.
const cardsCard = () => {
  const c = pageState("cards"), cards = c.cards || [];
  return `<section class="card stack-s"><div class="card-h"><h3>${esc(t("AI revision cards"))}</h3>${tag(t("AI on"), "ok")}</div>
    <p class="mut" style="margin:0">${esc(t("Write a topic and the AI makes 4 short cards for revision. Tap a card to see the other side."))}</p>
    <div class="chat-in"><input type="text" id="cd-topic" maxlength="120" data-input="cd-topic" value="${esc(c.topic || "")}" placeholder="${esc(t("e.g. Organic chemistry / Tense"))}" aria-label="${esc(t("Topic"))}"><button type="button" class="btn btn--pri" data-act="cd-go" ${c.busy ? "disabled" : ""}>${icon("spark")}${esc(c.busy ? t("The AI is working...") : t("Make 4 cards"))}</button></div>
    ${cards.length ? `<div class="fcards">${cards.map((x, i) => { const b = !!(c.flip && c.flip[i]); return `<button type="button" class="fcard ${b ? "back" : ""}" data-act="cd-flip" data-arg="${i}" aria-pressed="${b}"><small>${esc(b ? t("Answer") : t("Question"))}</small><span>${esc(b ? x.back : x.front).replace(/\n/g, "<br>")}</span></button>`; }).join("")}</div>
    <small class="mut">${esc(t("AI can be wrong. Check important facts with your teacher or your book."))}</small>` : ""}
  </section>`;
};
onInput("cd-topic", (el) => { pageState("cards").topic = el.value; });
act("cd-flip", (el) => { const c = pageState("cards"); c.flip = c.flip || {}; c.flip[el.dataset.arg] = !c.flip[el.dataset.arg]; refresh(); });
act("cd-go", async () => {
  const c = pageState("cards"), topic = String(c.topic || "").trim();
  if (c.busy) return;
  if (!topic) return toast(t("Write a topic first."), "bad");
  c.busy = true; refresh();
  try {
    c.cards = await withAiBudget(async () => cardsFrom(await askCards({ topic, cls: S.me.cls ? "Class " + S.me.cls + (S.me.grp ? " " + S.me.grp : "") : "" })));
    c.flip = {};
    toast(t("New revision cards are ready."), "ok");
  } catch (e) { toast(e && e.code === "limit" ? t("You used today's {n} AI messages. Try again tomorrow.", { n: e.lim }) : t("The AI could not make the cards right now. Try again later."), "bad"); }
  finally { c.busy = false; refresh(); }
});
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
  const sc = scoreSet(set, st.tr.a), f = st.f || "all", aiOn = aiReady(await aiConfig()), weak = weakTopics(set, sc.rows);
  const shown = sc.rows.filter((r) => f === "all" || (f === "bad" ? !r.ok : r.ok));
  const fl = st.tr.fl || {};
  const view = shown.map((r) => {
    const q = set.qs[r.i], right = r.ok;
    return `<div class="pq ${right ? "is-ok" : "is-bad"}"><div class="pq-h"><b>${esc(t("Question {n}", { n: r.i + 1 }))}</b>${right ? tag(t("Correct"), "ok") : tag(r.pick < 0 ? t("Not answered") : t("Wrong"), "bad")}${q.c ? `<span class="pq-topic">${esc(t("Topic: {n}", { n: q.c }))}</span>` : ""}${q.b ? `<span class="pq-topic">${esc(q.b)}</span>` : ""}</div>
      <div>${esc(q.q).replace(/\n/g, "<br>")}</div>
      <div class="pq-o">${q.o.map((o, j) => `<div class="pq-opt ${j === q.a ? "ok" : j === r.pick ? "bad" : ""}"><span class="pq-mk">${j === q.a ? "✓" : j === r.pick ? "✗" : "ABCD"[j]}</span><span>${esc(o)}</span></div>`).join("")}</div>
      ${right ? "" : `<p class="mut" style="margin:0">${esc(r.pick < 0 ? t("You did not answer this one.") : t("Your answer: {a}", { a: q.o[r.pick] }))}<br>${esc(t("Right answer: {a}", { a: q.o[q.a] }))}</p>`}
      ${!right && q.w ? `<div class="pq-why pq-wrong"><b>${esc(t("Why students get this wrong"))}</b>${esc(q.w).replace(/\n/g, "<br>")}</div>` : ""}
      ${q.e ? `<div class="pq-why"><b>${esc(right || q.w ? t("Why this is right") : t("Why it was wrong"))}</b>${esc(q.e).replace(/\n/g, "<br>")}</div>` : ""}
      ${q.h ? `<div class="pq-why pq-how"><b>${esc(t("How to solve it"))}</b>${esc(q.h).replace(/\n/g, "<br>")}</div>` : ""}
      <div class="row" style="gap:8px;flex-wrap:wrap">${fl[q.id] ? `<span class="mut sm">${icon("check")} ${esc(t("Reported to your teacher"))}</span> ${btn(t("Undo"), "sv-flag", { arg: q.id, xs: true })}` : btn(t("This answer looks wrong"), "sv-flag", { arg: q.id, xs: true, ic: "alert" })}${!right && aiOn ? btn(t("Ask the AI about this"), "sv-ask", { arg: q.id, xs: true, ic: "spark" }) : ""}</div>
      ${!right && aiOn && st.ask === q.id ? tutorBox(st, q) : ""}</div>`;
  }).join("");
  const nBad = sc.total - sc.got;
  return `<div class="stack">${head}
    <section class="card"><div class="sc">${ring(sc.pct, t("Score"), sc.pct >= 70 ? "var(--ok)" : sc.pct >= 40 ? "var(--warn)" : "var(--bad)", 88)}<div><b style="font-size:18px">${esc(t("You got {a} out of {n}", { a: sc.got, n: sc.total }))}</b><p class="mut" style="margin:4px 0 0">${esc(nBad ? t("{n} to learn from. Read why below.", { n: nBad }) : t("All correct. Well done!"))}</p>${weak.length ? `<p style="margin:6px 0 0"><b>${esc(t("Revise these topics:"))}</b> ${esc(weak.join(", "))}</p>` : ""}<p class="mut sm" style="margin:4px 0 0">${esc(t("Practice only. The marks are not added to your exams."))}</p></div></div>
      <div class="row" style="gap:8px;flex-wrap:wrap;margin-top:10px">${btn(t("Try again"), "sv-redo", { ic: "refresh", kind: "pri", sm: true })}</div></section>
    ${chips([{ k: "all", label: t("All") + " (" + sc.total + ")" }, { k: "bad", label: t("Wrong") + " (" + nBad + ")" }, { k: "ok", label: t("Correct") + " (" + sc.got + ")" }], f, "sv-filter")}
    ${view || card("", empty(t("Nothing here."), "inbox"))}
    ${shorts}</div>`;
}, { title: "Practice" });

// the AI tutor of one wrong question: his doubts and the answers (kept while the page is open; not saved)
const tutorBox = (st, q) => {
  const th = (st.tut && st.tut[q.id]) || [], busy = st.tbusy === q.id;
  return `<div class="pq-ai stack-s">
    ${th.map((m) => `<div class="pq-bub ${m.me ? "me" : "ai"}"><b>${esc(m.me ? t("You") : t("AI tutor"))}</b>${esc(m.text).replace(/\n/g, "<br>")}</div>`).join("")}
    ${busy ? `<div class="pq-bub ai"><b>${esc(t("AI tutor"))}</b>${esc(t("The AI is working..."))}</div>` : ""}
    <div class="chat-in"><textarea id="sv-doubt" rows="2" maxlength="300" placeholder="${esc(t("e.g. Please explain it in an easier way"))}" aria-label="${esc(t("Ask the AI about this"))}"></textarea><button type="button" class="btn btn--pri" data-act="sv-ask-go" data-arg="${esc(q.id)}" ${busy ? "disabled" : ""}>${icon("send")}${esc(t("Ask"))}</button></div>
    <small class="mut">${esc(t("AI answers can be wrong. If you think the marked answer is wrong, tap \"This answer looks wrong\"."))}</small>
  </div>`;
};
act("sv-ask", (el) => { const st = solveState(S.params.id); st.ask = st.ask === el.dataset.arg ? "" : el.dataset.arg; refresh(); });
act("sv-ask-go", async (el) => {
  const id = S.params.id, st = solveState(id), qid = el.dataset.arg, q = (st.set.qs || []).find((x) => x.id === qid), box = document.getElementById("sv-doubt");
  const doubt = String(box ? box.value : "").trim();
  if (!q || st.tbusy) return;
  if (!doubt) return toast(t("Write your question first."), "bad");
  st.tut = st.tut || {}; st.tut[qid] = [...(st.tut[qid] || []), { me: true, text: doubt }];
  st.tbusy = qid; refresh();
  const pick = Number.isInteger(st.tr && st.tr.a && st.tr.a[qid]) ? st.tr.a[qid] : -1;
  try {
    const text = await withAiBudget(() => askTutor({ q, pick, doubt, cls: S.me.cls ? "Class " + S.me.cls + (S.me.grp ? " " + S.me.grp : "") : "", inst: "Rise Edge Academy" }));
    st.tut[qid].push({ text });
  } catch (e) {
    if (e && e.code === "limit") { st.tut[qid].pop(); toast(t("You used today's {n} AI messages. Try again tomorrow.", { n: e.lim }), "bad"); }
    else {   // the teacher's own note instead (as ShikkhaAI does): the right answer and why
      const why = q.h || q.e || q.w || "";
      st.tut[qid].push({ fb: true, text: why ? t("The AI could not answer right now. Remember simply: the right answer is \"{a}\". Reason: {r}", { a: q.o[q.a], r: why }) : t("The AI could not answer right now. Remember simply: the right answer is \"{a}\".", { a: q.o[q.a] }) });
    }
  }
  st.tbusy = ""; refresh();
});
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
