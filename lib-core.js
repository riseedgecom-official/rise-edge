// Shared helpers: tiny DOM utils, app state, language, click handling, routing.
import { BN } from "./lib-bn.js";

// ---------- DOM + formatting ----------
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const uniq = (a) => [...new Set(a)];
export const cmp = (a, b) => String(a ?? "").localeCompare(String(b ?? ""), undefined, { numeric: true, sensitivity: "base" });
export const lk = (x) => String(x || "").trim().toLowerCase().replace(/\s+/g, " ").replace(/\//g, " ");
export const n2 = (v) => Math.round(v * 100) / 100;
export const num = (v) => { const x = parseFloat(v); return Number.isFinite(x) ? x : 0; };
export const f1 = (v) => (v == null || Number.isNaN(v) ? "–" : Math.round(v * 10) / 10 + "%");
export const money = (v) => "৳" + (Math.round(num(v) * 100) / 100).toLocaleString("en-US");
export const debounce = (fn, ms = 200) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// dates are plain "YYYY-MM-DD" strings. "Today" always follows Bangladesh time (Asia/Dhaka), whatever the device clock says.
const pad = (n) => String(n).padStart(2, "0");
export const isoOf = (d) => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
const DHAKA = (() => { try { return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dhaka", year: "numeric", month: "2-digit", day: "2-digit" }); } catch (e) { return null; } })();
export const dhakaDate = (d = new Date()) => {
  if (DHAKA) { const p = DHAKA.formatToParts(d), g = (k) => p.find((x) => x.type === k).value; return g("year") + "-" + g("month") + "-" + g("day"); }
  return isoOf(d);
};
export const T = () => dhakaDate();
export const mon = (d = T()) => d.slice(0, 7);
export const addDays = (d, n) => { const x = new Date(d + "T00:00:00"); x.setDate(x.getDate() + n); return isoOf(x); };
export const monthEnd = (m) => { const [y, mo] = m.split("-").map(Number); return m + "-" + pad(new Date(y, mo, 0).getDate()); };
export const addMonths = (m, n) => { const [y, mo] = m.split("-").map(Number); const d = new Date(y, mo - 1 + n, 1); return d.getFullYear() + "-" + pad(d.getMonth() + 1); };
export const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export const MONTHS_BN = ["জানুয়ারি", "ফেব্রুয়ারি", "মার্চ", "এপ্রিল", "মে", "জুন", "জুলাই", "আগস্ট", "সেপ্টেম্বর", "অক্টোবর", "নভেম্বর", "ডিসেম্বর"];
export const monthLabel = (m) => (S.lang === "bn" ? MONTHS_BN[+m.slice(5, 7) - 1] : MONTHS[+m.slice(5, 7) - 1]) + " " + m.slice(0, 4);
export const fmtDate = (d) => {
  if (!d) return "";
  const x = new Date(d + "T00:00:00");
  return x.getDate() + " " + (S.lang === "bn" ? MONTHS_BN : MONTHS)[x.getMonth()].slice(0, S.lang === "bn" ? 99 : 3) + " " + x.getFullYear();
};
export const ago = (ms) => {
  const m = Math.round((Date.now() - ms) / 6e4);
  if (m < 1) return t("just now");
  if (m < 60) return t("{n} min ago", { n: m });
  if (m < 1440) return t("{n} h ago", { n: Math.round(m / 60) });
  return t("{n} d ago", { n: Math.round(m / 1440) });
};
export const bnDigits = (v) => String(v).replace(/\d/g, (c) => "০১২৩৪৫৬৭৮৯"[c]);
// Bangladesh mobile numbers -> international form for sms:/wa.me links
export const intlPhone = (n) => {
  const d = String(n || "").replace(/\D/g, "");
  if (!d) return "";
  return d.startsWith("880") ? d : d.startsWith("0") ? "88" + d : d;
};
export const isEmail = (s) => /^[^\s@\/]+@[^\s@\/]+\.[^\s@\/]+$/.test(s || "");

// ---------- state ----------
export const S = {
  lang: "en",
  me: null,        // signed-in profile (role: admin | teacher | student)
  pid: null,       // profile id (document id in users/)
  B: [],           // batches visible to me
  U: [],           // approved students visible to me
  TC: [],          // approved teachers (admin / co-admin only)
  PEND: [],        // students/teachers waiting for approval (admin / co-admin only)
  INST: {},        // institute info (name, owner, phone, default fee)
  bid: null,       // selected batch
  page: "",
  params: {},
  q: {},           // per-page remembered UI state
};
export const isStaff = () => !!S.me && (S.me.role === "admin" || S.me.co);
export const isAdmin = () => !!S.me && S.me.role === "admin" && !S.me.co;
// A plain teacher can be limited to some subjects of a batch (users/<id>.sj = {batchId: [subject, ...]}).
// null = not limited (admin, co-admin, or no subject ticked for that batch).
export const mySubjects = (bid) => {
  const m = S.me, a = m && m.role === "teacher" && !m.co && m.sj && m.sj[bid];
  return Array.isArray(a) && a.length ? a : null;
};
const sjKey = (x) => String(x == null ? "" : x).trim().toLowerCase();
export const subjectOk = (bid, name) => { const a = mySubjects(bid); return !a || a.some((x) => sjKey(x) === sjKey(name)); };
export const isTeacher = () => !!S.me && S.me.role === "teacher" && !S.me.co; // a plain teacher (not a co-admin)
export const canPublish = () => isStaff() || (isTeacher() && S.me.pub === true); // may publish exam results / reports
export const canFees = () => isAdmin();
export const isStudent = () => !!S.me && S.me.role === "student";
export const batchOf = (id) => S.B.find((b) => b.id === id);
export const curBatch = () => batchOf(S.bid);
export const activeStudents = (bid = S.bid) => S.U.filter((s) => s.bid === bid && s.active !== false && s.ap !== false);
export const batchName = (id) => (batchOf(id) || {}).name || "";
export const instName = () => S.INST.name || "Rise Edge Academy";

// add (merge) Bangla translations: addBN({"English text": "বাংলা"})
export const addBN = (o) => Object.assign(BN, o);

// ---------- language ----------
export function initLang() {
  let l = null;
  try { l = localStorage.getItem("lg"); } catch (e) { /* ignore */ }
  if (!l) l = /^bn/i.test(navigator.language || "") ? "bn" : "en";
  S.lang = l === "bn" ? "bn" : "en";
  document.documentElement.lang = S.lang;
}
export function setLang(l) {
  try { localStorage.setItem("lg", l); } catch (e) { /* ignore */ }
  S.lang = l;
  document.documentElement.lang = l;
}
// t("English text", {vars}) -> text in the chosen language. English text is the key.
export function t(key, vars) {
  let s = (S.lang === "bn" && BN[key]) || key;
  if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? vars[k] : m));
  return s;
}

// ---------- click / input handling ----------
// Markup uses data-act="name" (click), data-input="name", data-change="name", data-submit="name".
// Register handlers with act("name", (el, event) => ...).
const H = { act: {}, input: {}, change: {}, submit: {} };
export const act = (name, fn) => { H.act[name] = fn; };
export const onInput = (name, fn) => { H.input[name] = fn; };
export const onChange = (name, fn) => { H.change[name] = fn; };
export const onSubmit = (name, fn) => { H.submit[name] = fn; };

let errorSink = (e) => console.error(e);
export const setErrorSink = (fn) => { errorSink = fn; };

async function run(fn, el, ev) {
  const busy = el && el.tagName === "BUTTON" && !el.dataset.free;
  if (busy) { if (el.disabled) return; el.disabled = true; }
  try { await fn(el, ev); } catch (e) { errorSink(e); } finally { if (busy && el.isConnected) el.disabled = false; }
}
export function startEvents() {
  document.addEventListener("click", (e) => {
    const el = e.target.closest("[data-act]");
    if (!el || el.disabled) return;
    const fn = H.act[el.dataset.act];
    if (!fn) { console.warn("No action", el.dataset.act); return; }
    if (el.tagName === "A" && !el.dataset.href) e.preventDefault();
    run(fn, el, e);
  });
  document.addEventListener("input", (e) => {
    const el = e.target.closest("[data-input]");
    if (el && H.input[el.dataset.input]) run(H.input[el.dataset.input], el, e);
  });
  document.addEventListener("change", (e) => {
    const el = e.target.closest("[data-change]");
    if (el && H.change[el.dataset.change]) run(H.change[el.dataset.change], el, e);
  });
  document.addEventListener("submit", (e) => {
    const el = e.target.closest("[data-submit]");
    if (!el) return;
    e.preventDefault();
    if (H.submit[el.dataset.submit]) run(H.submit[el.dataset.submit], el.querySelector("button[type=submit]") || el, e);
  });
}
// read all named fields of a container as {name: value}
export function formData(root) {
  const o = {};
  $$("[name]", root).forEach((el) => {
    if (el.type === "checkbox") o[el.name] = el.checked;
    else if (el.type === "radio") { if (el.checked) o[el.name] = el.value; }
    else o[el.name] = el.value;
  });
  return o;
}

// ---------- routing ----------
export function go(page, params) {
  const q = params && Object.keys(params).length ? "?" + new URLSearchParams(params).toString() : "";
  const h = "#/" + page + q;
  if (location.hash === h) window.dispatchEvent(new HashChangeEvent("hashchange"));
  else location.hash = h;
}
export function parseHash() {
  const h = location.hash.replace(/^#\/?/, "");
  const [page, q = ""] = h.split("?");
  return { page, params: Object.fromEntries(new URLSearchParams(q)) };
}
// remembered per-page UI state: pageState("att") -> object kept while the app is open
export const pageState = (k) => (S.q[k] = S.q[k] || {});

// ---------- pages ----------
// A page module calls page("students", async (params) => htmlString, {title: "Students"}).
// app.js shows the returned HTML inside the shell. refresh() draws the current page again.
export const PAGES = {};
export const page = (name, render, opt = {}) => { PAGES[name] = { render, ...opt }; };
let refresher = () => {};
export const setRefresher = (fn) => { refresher = fn; };
export const refresh = () => refresher();

// ---------- phone links (open the user's own SMS / WhatsApp app) ----------
export const smsHref = (phone, text) => "sms:" + intlPhone(phone) + "?body=" + encodeURIComponent(text);
export const waHref = (phone, text) => "https://wa.me/" + intlPhone(phone) + "?text=" + encodeURIComponent(text);
export const copyText = async (s) => { try { await navigator.clipboard.writeText(s); return true; } catch (e) { return false; } };
