// The real AI (Gemini) through Firebase AI Logic: optional. The admin turns it on in Settings > AI study assistant (config/ai).
// There is no key in the app: Firebase AI Logic holds the Gemini access, App Check (reCAPTCHA Enterprise) proves the call comes from this site.
// Until it is on (or when a call fails) the Study pages answer with the built-in helper (lib-coach.js).
import { cfg } from "./config.js";
import { db } from "./lib-db.js";
import { staffSystem, staffPrompt } from "./lib-practice.js";

const SDK = "12.14.0", CDN = "https://www.gstatic.com/firebasejs/" + SDK + "/";
export const DEFAULT_MODEL = "gemini-3.8-flash";
export const DEFAULT_LIMIT = 20;
const TIMEOUT = 30000;

// config/ai = { on, appId (a WEB app of this Firebase project), key (reCAPTCHA Enterprise site key), model, lim (messages per student per day) }
let C = null, ct = 0;
export async function aiConfig(force = false) {
  if (!force && C && Date.now() - ct < 120000) return C;
  let d = null;
  try { d = await db.get("config/ai"); } catch (e) { d = null; }
  d = d || {};
  C = { on: d.on === true, appId: String(d.appId || "").trim(), key: String(d.key || "").trim(), model: String(d.model || "").trim() || DEFAULT_MODEL, lim: Math.max(1, Math.min(200, Math.round(+d.lim) || DEFAULT_LIMIT)) };
  ct = Date.now();
  return C;
}
export const dropAiConfig = () => { C = null; ct = 0; M = null; };
const hook = () => (typeof window !== "undefined" && typeof window.__aiMock === "function" ? window.__aiMock : null);   // tests only
export const aiReady = (c) => !!(c && c.on && (hook() || (c.appId && c.key)));

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

let M = null;   // { key, model }: built once per configuration
const CHAT_GEN = { maxOutputTokens: 700, temperature: 0.5 };
const STAFF_GEN = { maxOutputTokens: 8000, temperature: 0.4, responseMimeType: "application/json" };   // practice material: JSON, long
async function load(c, system, gen = CHAT_GEN) {
  const key = [c.appId, c.key, c.model, system, JSON.stringify(gen)].join("|");
  if (M && M.key === key) return M.model;
  const [{ initializeApp, getApps, deleteApp }, { initializeAppCheck, ReCaptchaEnterpriseProvider }, { getAI, getGenerativeModel, GoogleAIBackend }] = await Promise.all([
    import(CDN + "firebase-app.js"), import(CDN + "firebase-app-check.js"), import(CDN + "firebase-ai.js"),
  ]);
  // its own app: the web app id of this project (config.js may hold an Android id, which App Check cannot use)
  for (const a of getApps()) if (a.name === "ai") await deleteApp(a).catch(() => {});
  const app = initializeApp({ ...cfg, appId: c.appId }, "ai");
  initializeAppCheck(app, { provider: new ReCaptchaEnterpriseProvider(c.key), isTokenAutoRefreshEnabled: true });
  const ai = getAI(app, { backend: new GoogleAIBackend() });
  const model = getGenerativeModel(ai, { model: c.model, systemInstruction: system, generationConfig: gen });
  M = { key, model };
  return model;
}

// what went wrong, in one word the page can turn into a sentence: quota | setup | net | blocked | other
export function aiProblem(e) {
  const s = ((e && (e.code || "")) + " " + ((e && e.message) || e || "")).toLowerCase();
  if (e && e.code === "timeout") return "net";
  if (/\b429\b|quota|resource.?exhausted|rate.?limit|too many/.test(s)) return "quota";
  if (/app.?check|\b403\b|permission|api key|not.?found|\b404\b|disabled|not enabled|unauthor|forbidden|invalid.?argument|\b400\b/.test(s)) return "setup";
  if (/safety|blocked|prohibited/.test(s)) return "blocked";
  if (/network|offline|failed to fetch|load failed|unavailable|\b5\d\d\b|dynamically imported|importing a module/.test(s)) return "net";
  return "other";
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

// A teacher / admin asks for practice material from photos and / or a topic. images = [{ mime, data (base64) }]. Returns the answer text (JSON,
// read with fromAi in lib-practice.js); throws on any problem. Only the class, subject, the teacher's words and the photos are sent: no student data.
export async function askStaffAI({ task, cls = "", grp = "", subject = "", count = 10, text = "", images = [], inst = "Rise Edge Academy" }) {
  const c = await aiConfig();
  if (!aiReady(c)) throw Object.assign(new Error("The AI is not turned on."), { code: "off" });
  const system = staffSystem({ inst, cls, grp }), prompt = staffPrompt({ task, count, subject, text, photos: images.length });
  const h = hook();
  if (h) return String(await h({ prompt, system, question: String(text || ""), task, images: images.length, json: true })).trim();
  const model = await race(load(c, system, STAFF_GEN));
  const parts = [{ text: prompt }, ...images.slice(0, 3).map((im) => ({ inlineData: { mimeType: im.mime || "image/jpeg", data: im.data } }))];
  const res = await race(model.generateContent(parts), 90000);
  const out = String(res.response.text() || "").trim();
  if (!out) throw Object.assign(new Error("The AI returned nothing."), { code: "blocked" });
  return out;
}

// the admin's "Test the AI" button: { ok, text | problem, detail }
export async function testAI(c) {
  const saved = C; C = { ...c, on: true }; ct = Date.now(); M = null;
  try { const text = await askAI({ question: "Reply with the single word OK.", inst: "Rise Edge Academy" }); return { ok: true, text }; }
  catch (e) { return { ok: false, problem: aiProblem(e), detail: String((e && e.message) || e).slice(0, 300) }; }
  finally { C = saved; M = null; }
}
