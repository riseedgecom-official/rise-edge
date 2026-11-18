// The real AI (Gemini) through Firebase AI Logic: optional. The admin turns it on in Settings > AI study assistant (config/ai).
// There is no key in the app: Firebase AI Logic holds the Gemini access, App Check (reCAPTCHA Enterprise = "Fraud Defense") proves the call comes from this site.
// Until it is on (or when a call fails) the Study pages answer with the built-in helper (lib-coach.js).
import { cfg } from "./config.js";
import { db } from "./lib-db.js";
import { t, addBN } from "./lib-core.js";
import { acHint, staffSystem, staffPrompt, tutorSystem, tutorPrompt, regenPrompt, cardsPrompt, REGEN_SYSTEM, CARDS_SYSTEM, MCQ_SCHEMA, ONE_SCHEMA, CARDS_SCHEMA } from "./lib-practice.js";

const SDK = "12.14.0", CDN = "https://www.gstatic.com/firebasejs/" + SDK + "/";
export const DEFAULT_MODEL = "gemini-3.8-flash";
export const DEFAULT_LIMIT = 20;
const TIMEOUT = 30000;

// config/ai = { on, appId (a WEB app of this Firebase project), key (reCAPTCHA Enterprise / Fraud Defense score-based SITE key), model, lim (messages per student per day) }
let C = null, ct = 0;
export async function aiConfig(force = false) {
  if (!force && C && Date.now() - ct < 120000) return C;
  let d = null;
  try { d = await db.get("config/ai"); } catch (e) { d = null; }
  d = d || {};
  C = { on: d.on === true, gk: String(d.gk || "").trim(), appId: String(d.appId || "").trim(), key: String(d.key || "").trim(), model: String(d.model || "").trim() || DEFAULT_MODEL, lim: Math.max(1, Math.min(200, Math.round(+d.lim) || DEFAULT_LIMIT)) };
  ct = Date.now();
  return C;
}
export const dropAiConfig = () => { C = null; ct = 0; M = null; A = null; };
const hook = () => (typeof window !== "undefined" && typeof window.__aiMock === "function" ? window.__aiMock : null);   // tests only
export const aiReady = (c) => !!(c && c.on && (hook() || c.gk || (c.appId && c.key)));

// what the model is told. No name, phone or address of the student is ever sent: only his class and his lowest subjects.
export function systemText({ inst, cls, subjects }) {
  return [
    "You are the study assistant of " + inst + ", a coaching centre in Bangladesh. You help students of classes 4 to 12 (NCTB curriculum) with their studies.",
    "Rules:",
    "- Only help with studying: school subjects, exam preparation, study habits, planning and motivation. If asked about anything else, say kindly that you can only help with studies.",
    "- Reply in the language the student writes in (Bangla or English). Use simple words and short answers (under 150 words unless asked for more).",
    "- For maths and science, explain step by step and give the reasoning, not only the final answer. Do not just do graded homework or an exam for the student; guide them to do it.",
    "- Be kind and suitable for children. Never ask for or repeat personal details (name, phone, address, passwords).",
    "- If a student seems upset, unsafe or in trouble, encourage them to talk to a parent or a teacher.",
    "- If you are not sure of a fact, say so.",
    cls ? "The student is in " + cls + "." : "",
    subjects && subjects.length ? "Their lowest subjects so far: " + subjects.join(", ") + "." : "",
  ].filter(Boolean).join("\n");
}

let M = null;   // { key, model }: built once per configuration, system text and generation settings
let A = null;   // { key, ai, getGenerativeModel }: the Firebase app, App Check and AI of one configuration (made once; a model is cheap to make from it)
const CHAT_GEN = { maxOutputTokens: 700, temperature: 0.5 };
const STAFF_GEN = { maxOutputTokens: 16000, temperature: 0.4, responseMimeType: "application/json" };   // practice material: JSON, long (Bangla takes many tokens)
const TUTOR_GEN = { maxOutputTokens: 600, temperature: 0.4 };
const CARDS_GEN = { maxOutputTokens: 2000, temperature: 0.5, responseMimeType: "application/json", responseSchema: CARDS_SCHEMA };
async function client(c) {
  const key = c.appId + "|" + c.key;
  if (A && A.key === key) return A;
  const [{ initializeApp, getApps, deleteApp }, { initializeAppCheck, ReCaptchaEnterpriseProvider, getToken }, { getAI, getGenerativeModel, GoogleAIBackend }] = await Promise.all([
    import(CDN + "firebase-app.js"), import(CDN + "firebase-app-check.js"), import(CDN + "firebase-ai.js"),
  ]);
  // its own app: the web app id of this project (config.js may hold an Android id, which App Check cannot use)
  for (const a of getApps()) if (a.name === "ai") await deleteApp(a).catch(() => {});
  const app = initializeApp({ ...cfg, appId: c.appId }, "ai");
  const check = initializeAppCheck(app, { provider: new ReCaptchaEnterpriseProvider(c.key), isTokenAutoRefreshEnabled: true });
  // limited-use App Check tokens (SDK 12.14+): they are also accepted when "replay protection" is on in the Firebase Console
  A = { key, ai: getAI(app, { backend: new GoogleAIBackend(), useLimitedUseAppCheckTokens: true }), getGenerativeModel, check, getToken, app, c };
  return A;
}
// THE SIMPLE WAY: Google's Gemini API with an API key from Google AI Studio (config/ai.gk). No Firebase AI Logic, no App Check, no Web app ID.
// It answers like the SDK's model does (generateContent(parts) -> { response: { text() } }), so the rest of this file does not care which way is used.
// When the chosen model is overloaded (503), has no quota left (429) or is not there for this key (404), the next model of this list answers instead (free-tier limits are per model).
const FALLBACK_MODELS = ["gemini-3.5-flash-lite"];
function direct(c, system, gen) {
  const once = async (model, body) => {
    const r = await fetch("https://generativelanguage.googleapis.com/v1beta/models/" + encodeURIComponent(model) + ":generateContent",
      { method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": c.gk }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      const er = (j && j.error) || {}, msg = er.message || r.statusText || "error";
      throw Object.assign(new Error("[" + r.status + "] " + msg + (er.status ? " (" + er.status + ")" : "")), { code: "gemini/" + r.status, other: [404, 429, 500, 502, 503, 504].includes(r.status) || /high demand|overloaded|unavailable/i.test(msg) });
    }
    const cand = (j.candidates || [])[0] || {};
    const text = ((cand.content && cand.content.parts) || []).filter((p) => p && typeof p.text === "string" && !p.thought).map((p) => p.text).join("");
    if (!text) {
      const why = (j.promptFeedback && j.promptFeedback.blockReason) || cand.finishReason || "";
      throw new Error(why ? "Response was blocked due to " + why : "The AI gave an empty answer");
    }
    return { response: { text: () => text } };
  };
  return {
    async generateContent(parts) {
      const body = { contents: [{ role: "user", parts: (Array.isArray(parts) ? parts : [parts]).map((p) => (typeof p === "string" ? { text: p } : p)) }], generationConfig: gen };
      if (system) body.systemInstruction = { parts: [{ text: system }] };
      let first;
      for (const m of [c.model, ...FALLBACK_MODELS.filter((x) => x !== c.model)]) {
        try { return await once(m, body); }
        catch (e) { first = first || e; if (!e.other) throw e; }
      }
      throw first;     // the answer of the model the admin chose says most
    },
  };
}
async function load(c, system, gen = CHAT_GEN) {
  if (c.gk) return direct(c, system, gen);
  const key = [c.appId, c.key, c.model, system, JSON.stringify(gen)].join("|");
  if (M && M.key === key) return M.model;
  const a = await client(c);
  const model = a.getGenerativeModel(a.ai, { model: c.model, systemInstruction: system, generationConfig: gen });
  M = { key, model };
  return model;
}

// what went wrong, in one word the page can turn into a sentence: quota | setup | net | blocked | other
export function aiProblem(e) {
  const s = ((e && (e.code || "")) + " " + ((e && e.message) || e || "")).toLowerCase();
  if (e && e.code === "timeout") return "net";
  if (/\b429\b|quota|resource.?exhausted|rate.?limit|too many/.test(s)) return "quota";
  if (/app.?check|\b403\b|permission|api key|not.?found|\b404\b|disabled|not enabled|unauthor|forbidden|invalid.?argument|\b400\b|api.?not.?enabled|not.?enabled|requires the firebase ai api|enable this api|service.?disabled/.test(s)) return "setup";
  if (/safety|blocked|prohibited/.test(s)) return "blocked";
  if (/network|offline|failed to fetch|load failed|unavailable|\b5\d\d\b|dynamically imported|importing a module/.test(s)) return "net";
  return "other";
}
// What the admin has to do for each answer of acHint (lib-practice.js); shown by the Co-Pilot and by Settings > Test the AI
const AC_TEXT = {
 "ok": "App Check works now, but this browser tab still remembers the old failure. Close the app tab and open it again, then try.",
 "referrer": "Your Firebase API key does not allow this website. Google Cloud > APIs & Services > Credentials > open the Browser key > Websites: add {host}/* (or choose no website restriction). Save, wait 2 minutes, then try again.",
 "apiblocked": "Your Firebase API key does not allow the Firebase App Check API. Google Cloud > APIs & Services > Credentials > open the Browser key > API restrictions: add Firebase App Check API and Firebase AI Logic API (or choose Don't restrict key). Save, wait 2 minutes, then try again.",
 "disabled": "The Firebase App Check API is switched off. Google Cloud > APIs & Services > Library > Firebase App Check API > Enable. Then try again.",
 "apikey": "The Firebase API key is not valid. Compare apiKey in config.js with Firebase Console > Project settings > Your apps.",
 "key": "reCAPTCHA does not accept the site key on this website. In Google Cloud > Fraud Defense the key must be a Web, score-based key with {host} in its domains, and Settings must hold the same key.",
 "register": "Firebase App Check does not accept this key for this app. In Firebase Console > App Check > Apps open the Web app whose App ID is in Settings and register it with Fraud Defense (reCAPTCHA Enterprise) and the same site key."
};
const AC_BN = {
 "ok": "App Check এখন কাজ করছে, কিন্তু এই ব্রাউজার ট্যাব পুরনো ব্যর্থতা মনে রেখেছে। অ্যাপের ট্যাবটি বন্ধ করে আবার খুলুন, তারপর চেষ্টা করুন।",
 "referrer": "আপনার Firebase API key এই ওয়েবসাইটকে অনুমতি দেয়নি। Google Cloud > APIs & Services > Credentials > Browser key খুলুন > Websites এ {host}/* যোগ করুন (বা ওয়েবসাইট সীমাবদ্ধতা তুলে দিন)। Save করে ২ মিনিট অপেক্ষা করুন, তারপর চেষ্টা করুন।",
 "apiblocked": "আপনার Firebase API key Firebase App Check API-কে অনুমতি দেয়নি। Google Cloud > APIs & Services > Credentials > Browser key খুলুন > API restrictions এ Firebase App Check API ও Firebase AI Logic API যোগ করুন (বা Don't restrict key বাছুন)। Save করে ২ মিনিট অপেক্ষা করুন, তারপর চেষ্টা করুন।",
 "disabled": "Firebase App Check API বন্ধ আছে। Google Cloud > APIs & Services > Library > Firebase App Check API > Enable করুন। তারপর চেষ্টা করুন।",
 "apikey": "Firebase API key সঠিক নয়। config.js এর apiKey Firebase Console > Project settings > Your apps এর সাথে মিলিয়ে দেখুন।",
 "key": "reCAPTCHA এই ওয়েবসাইটে সাইট কী গ্রহণ করছে না। Google Cloud > Fraud Defense এ কী-টি Web ধরনের score-based হতে হবে এবং ডোমেইনে {host} থাকতে হবে, আর Settings এ একই কী থাকতে হবে।",
 "register": "Firebase App Check এই অ্যাপের জন্য এই কী গ্রহণ করছে না। Firebase Console > App Check > Apps এ Settings এর App ID-র Web অ্যাপটি খুলে Fraud Defense (reCAPTCHA Enterprise) ও একই সাইট কী দিয়ে রেজিস্টার করুন।"
};
addBN(Object.fromEntries(Object.keys(AC_TEXT).map((k) => [AC_TEXT[k], AC_BN[k]])));
export const appCheckText = (hint, host) => (AC_TEXT[hint] ? t(AC_TEXT[hint], { host }) : "");
// App Check says only "403 error" when its token call is refused. Do the same call here by hand, to read the answer Google gives (which key, which API, which website is refused).
const WAIT = (ms) => new Promise((ok) => setTimeout(ok, ms));
const recaptcha = (key) => new Promise((ok, no) => {
  const go = () => (window.grecaptcha && window.grecaptcha.enterprise) ? window.grecaptcha.enterprise.ready(() => ok(window.grecaptcha.enterprise)) : no(new Error("reCAPTCHA did not load"));
  if (window.grecaptcha && window.grecaptcha.enterprise) return go();
  const s = document.createElement("script");
  s.src = "https://www.google.com/recaptcha/enterprise.js?render=" + encodeURIComponent(key);
  s.onload = go; s.onerror = () => no(new Error("reCAPTCHA script blocked"));
  document.head.appendChild(s);
});
async function probe() {
  const o = A.app.options, c = A.c;
  let token;
  try { token = await (await recaptcha(c.key)).execute(c.key, { action: "fire_app_check" }); }
  catch (x) { return { hint: "key", text: "reCAPTCHA: " + String((x && x.message) || x).slice(0, 160) }; }
  const r = await fetch("https://content-firebaseappcheck.googleapis.com/v1/projects/" + o.projectId + "/apps/" + c.appId + ":exchangeRecaptchaEnterpriseToken?key=" + encodeURIComponent(o.apiKey),
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ recaptcha_enterprise_token: token }) });
  const j = await r.json().catch(() => ({}));
  const er = (j && j.error) || {}, reason = ((er.details || []).find((d) => d && d.reason) || {}).reason || "";
  return { hint: acHint(r.status, reason, er.message), text: "Token call: HTTP " + r.status + (er.status ? " " + er.status : "") + (reason ? " " + reason : "") + (er.message ? " - " + String(er.message).slice(0, 160) : "") };
}
// An App Check problem (HTTP 401 "token is invalid"): ask App Check itself why it could not make a token and add that to the error, so the real reason is on the screen.
async function why(e) {
  try {
    const s = String((e && e.message) || e);
    if (!/app.?check|\b401\b/i.test(s) || /\| App Check/.test(s) || !A || !A.check || (C && C.gk)) return e;
    let note = "";
    try { await A.getToken(A.check, true); note = " | App Check made a token fine here: check that the Web app is registered in Firebase Console > App Check > Apps and that replay protection is not blocking it."; }
    catch (x) { note = " | App Check: " + String((x && x.code) || "") + " " + String((x && x.message) || x).slice(0, 160); }
    try { const p = await Promise.race([probe(), WAIT(9000).then(() => null)]); if (p) { note += " | " + p.text; e.hint = p.hint; } } catch (_) { /* the note above is enough */ }
    e.message = s + note;
  } catch (_) { /* the original error is thrown */ }
  return e;
}
// A busy or unreachable AI is tried again after 1, 2 and 4 seconds (as ShikkhaAI does). Not tried again: a quota, a setup problem, a blocked answer, a timeout.
const DELAYS = [1000, 2000, 4000];
const transient = (e) => {
  if (!e || e.code === "timeout" || e.code === "off") return false;
  const s = ((e.code || "") + " " + (e.message || e)).toLowerCase();
  return /unavailable|overload|high demand|\b5\d\d\b|network|failed to fetch|load failed|deadline|internal/.test(s) && !/quota|\b429\b|rate.?limit|safety|blocked/.test(s);
};
async function retrying(run) {
  const delays = hook() ? [20, 40, 80] : DELAYS;   // the tests do not wait seconds
  for (let i = 0; ; i++) {
    try { return await run(); } catch (e) {
      if (i >= delays.length || !transient(e)) throw await why(e);
      await new Promise((r) => setTimeout(r, delays[i]));
    }
  }
}
const race = (p, ms = TIMEOUT) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(Object.assign(new Error("The AI did not answer in time."), { code: "timeout" })), ms))]);

// history = [{ me: bool, text }] (the last few turns), question = the new text. Returns the answer text; throws on any problem.
export async function askAI({ question, history = [], ctx = {}, inst = "Rise Edge Academy" }) {
  const c = await aiConfig();
  if (!aiReady(c)) throw Object.assign(new Error("The AI is not turned on."), { code: "off" });
  const system = systemText({ inst, cls: ctx.cls, subjects: ctx.weak });
  const convo = history.slice(-8).map((m) => (m.me ? "Student: " : "Assistant: ") + String(m.text).slice(0, 600)).join("\n");
  const prompt = (convo ? "Conversation so far:\n" + convo + "\n\n" : "") + "Student: " + String(question).slice(0, 1000) + "\nAssistant:";
  const h = hook();
  if (h) return String(await h({ prompt, system, question })).trim();
  const model = await race(load(c, system));
  const res = await race(model.generateContent(prompt));
  const text = String(res.response.text() || "").trim();
  if (!text) throw Object.assign(new Error("The AI returned nothing."), { code: "blocked" });
  return text;
}

// A teacher / admin talks to the Co-Pilot: his words, photos, a PDF, a text file (up to 4 files) and / or his draft (task "mcq" makes a new set or changes the draft;
// "short", "summary", "solve" make that; "regen" makes one question again). The system text, the message and the answer's schema are the ShikkhaAI Co-Pilot's (lib-practice.js).
// files = [{ kind: "img" | "pdf" | "txt", name, mime, data (base64) | text }]; more = the teacher's choices (grade, dif, kind, level, lang, strict, draft) for staffPrompt, or { title, grade, dif, question, lang } for "regen".
// Returns the answer text (JSON, read with fromAi in lib-practice.js); throws on any problem. Only the class, subject, the teacher's words, his draft and the files are sent: no student data.
export async function askStaffAI({ task, cls = "", grp = "", subject = "", count = 10, text = "", files = [], inst = "Rise Edge Academy", ...more }) {
  const c = await aiConfig();
  if (!aiReady(c)) throw Object.assign(new Error("The AI is not turned on."), { code: "off" });
  const inline = files.filter((f) => f.data).slice(0, 4), docs = files.filter((f) => !f.data && f.text).slice(0, 4);
  const regen = task === "regen";
  const system = regen ? REGEN_SYSTEM : staffSystem({ inst, cls, grp, task, strict: more.strict, kind: more.kind, level: more.level, lang: more.lang });
  const prompt = regen ? regenPrompt(more) : staffPrompt({ task, count, subject, text, ...more });
  const schema = regen ? ONE_SCHEMA : task === "mcq" ? MCQ_SCHEMA : null;
  const h = hook();
  if (h) return String(await retrying(() => h({ prompt, system, question: String(regen ? more.question || "" : text || ""), task, images: inline.length, docs: docs.length, files: files.map((f) => f.kind), json: true, schema: !!schema }))).trim();
  const parts = [
    ...docs.map((f) => ({ text: "[Uploaded File: " + String(f.name || "file").slice(0, 80) + "]\n" + String(f.text).slice(0, 35000) + "\n[End of File]" })),
    ...inline.map((f) => ({ inlineData: { mimeType: f.mime || "image/jpeg", data: f.data } })),
    { text: prompt },
  ];
  const run = async (withSchema) => {
    const model = await race(load(c, system, withSchema && schema ? { ...STAFF_GEN, responseSchema: schema } : STAFF_GEN));
    const res = await race(model.generateContent(parts), 90000);
    const out = String(res.response.text() || "").trim();
    if (!out) throw Object.assign(new Error("The AI returned nothing."), { code: "blocked" });
    return out;
  };
  try { return await retrying(() => run(true)); }
  catch (e) {   // the SDK or the model did not like the schema: the same request again, with the format only described
    if (schema && (/schema|invalid.?argument|\b400\b/i.test(String((e && e.message) || e)) || aiProblem(e) === "other")) return await retrying(() => run(false));
    throw e;
  }
}

// A student asks about one question he got wrong. q = the question { q, o, a, e, h }, pick = the option he chose (-1 = none), doubt = his words.
// Returns the answer text; throws on any problem. Sent: the question, his chosen answer and his words - no name, no phone.
export async function askTutor({ q, pick = -1, doubt = "", cls = "", inst = "Rise Edge Academy" }) {
  const c = await aiConfig();
  if (!aiReady(c)) throw Object.assign(new Error("The AI is not turned on."), { code: "off" });
  const system = tutorSystem({ inst, cls }), prompt = tutorPrompt({ q: q.q, o: q.o, pick, right: q.a, w: q.w, e: q.e, h: q.h, doubt });
  const h = hook();
  if (h) return String(await retrying(() => h({ prompt, system, question: String(doubt || ""), task: "tutor", json: false }))).trim();
  return retrying(async () => {
    const model = await race(load(c, system, TUTOR_GEN));
    const res = await race(model.generateContent(prompt));
    const out = String(res.response.text() || "").trim();
    if (!out) throw Object.assign(new Error("The AI returned nothing."), { code: "blocked" });
    return out;
  });
}

// A student asks for revision flashcards of a topic (the AI Smart Flashcards of ShikkhaAI). Returns the answer text (a JSON list, read with cardsFrom); throws on any problem.
export async function askCards({ topic, cls = "" }) {
  const c = await aiConfig();
  if (!aiReady(c)) throw Object.assign(new Error("The AI is not turned on."), { code: "off" });
  const system = CARDS_SYSTEM + (cls ? "\nThe student is in " + cls + "." : ""), prompt = cardsPrompt(topic);
  const h = hook();
  if (h) return String(await retrying(() => h({ prompt, system, question: String(topic || ""), task: "cards", json: true, schema: true }))).trim();
  return retrying(async () => {
    const model = await race(load(c, system, CARDS_GEN));
    const res = await race(model.generateContent(prompt));
    const out = String(res.response.text() || "").trim();
    if (!out) throw Object.assign(new Error("The AI returned nothing."), { code: "blocked" });
    return out;
  });
}

// the admin's "Test the AI" button: { ok, text | problem, detail }
export async function testAI(c) {
  const saved = C; C = { ...c, on: true }; ct = Date.now(); M = null;
  try { const text = await askAI({ question: "Reply with the single word OK.", inst: "Rise Edge Academy" }); return { ok: true, text }; }
  catch (e) { await why(e); return { ok: false, problem: aiProblem(e), hint: e && e.hint, detail: String((e && e.message) || e).slice(0, 520) }; }
  finally { C = saved; M = null; }
}
