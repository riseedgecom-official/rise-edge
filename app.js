// Rise Edge Academy - app start, signed-in shell (menu, top bar, tab bar) and page router.
// Pages live in pages-*.js and register themselves with page(name, render).
import { configured, db, onAuth, signOutNow, dbError } from "./lib-db.js";
import {
  S, $, $$, esc, t, act, onChange, onInput, startEvents, setErrorSink, initLang, setLang, go, parseHash,
  PAGES, setRefresher, isStaff, isAdmin, isTeacher, isStudent, instName, lk,
} from "./lib-core.js";
import { icon, avatar, toast, closeDoc, closeModals, modal, notice, empty, btn } from "./lib-ui.js";
import { setMe, loadCore, getNotices, unseenCount, ensureDefaultBatches, saveInst, loadInst } from "./lib-svc.js";
import { renderLogin, renderNotConfigured, forceNewPassword, authRedraw } from "./pages-auth.js";

const $app = () => document.getElementById("app");
const roleCode = () => (isAdmin() ? "a" : isStaff() ? "c" : isTeacher() ? "t" : "s");
const roleName = () => ({ a: t("Admin"), c: t("Co-admin"), t: t("Teacher"), s: t("Student") }[roleCode()]);

// ---------- menu ----------
// k = page name, r = who sees it (a admin, c co-admin, t teacher, s student), tab = also on the phone tab bar
const NAV = [
  { k: "dashboard", ic: "home", l: "Dashboard", r: "actss", tab: 1, g: "" },
  { k: "students", ic: "users", l: "Students", r: "ac", g: "People" },
  { k: "teachers", ic: "cap", l: "Teachers", r: "ac", g: "People" },
  { k: "approvals", ic: "inbox", l: "Registrations", r: "ac", g: "People", badge: "pend" },
  { k: "batches", ic: "layers", l: "Batches", r: "ac", g: "People" },
  { k: "attendance", ic: "calcheck", l: "Attendance", r: "acts", tab: 1, g: "Class" },
  { k: "routine", ic: "clock", l: "Routine", r: "acts", g: "Class" },
  { k: "homework", ic: "book", l: "Homework", r: "acts", g: "Class" },
  { k: "exams", ic: "clip", l: "Exams", r: "acts", tab: 1, g: "Class" },
  { k: "marks", ic: "check", l: "Marks approval", r: "ac", g: "Class" },
  { k: "guardian", ic: "sms", l: "Guardian results", r: "act", g: "Class" },
  { k: "syllabus", ic: "list", l: "Syllabus", r: "acts", g: "Class" },
  { k: "month", ic: "calendar", l: "Month", r: "act", g: "Results" },
  { k: "reports", ic: "chart", l: "Report", r: "acts", g: "Results" },
  { k: "resultsheet", ic: "trophy", l: "Result sheet", r: "acts", g: "Results" },
  { k: "records", ic: "doc", l: "Records", r: "act", g: "Results" },
  { k: "fees", ic: "wallet", l: "Fees", r: "as", tab: 1, g: "Money" },
  { k: "suggestions", ic: "file", l: "Suggestions", r: "acts", g: "Library" },
  { k: "solutions", ic: "doc", l: "Exam solutions", r: "acts", g: "Library" },
  { k: "alerts", ic: "bell", l: "Alerts", r: "acts", g: "Account", badge: "bell" },
  { k: "requests", ic: "mega", l: "Requests", r: "acts", g: "Account" },
  { k: "idcard", ic: "idcard", l: "ID card", r: "acts", g: "Account" },
  { k: "coadmin", ic: "shield", l: "Co-admin panel", r: "a", g: "Account" },
  { k: "settings", ic: "cog", l: "Settings", r: "a", g: "Account" },
  { k: "profile", ic: "user", l: "Profile", r: "acts", g: "Account" },
];
// pages that exist but are not in the menu
const HIDDEN = { share: "act" };
const navFor = () => NAV.filter((n) => n.r.includes(roleCode()));
const pendingOnly = () => !!S.me && S.me.ap === false; // registered, waiting for the admin
const allowed = (k) => {
  if (pendingOnly()) return k === "dashboard" || k === "profile";
  const n = NAV.find((x) => x.k === k);
  return n ? n.r.includes(roleCode()) : !!(HIDDEN[k] && HIDDEN[k].includes(roleCode()));
};
const badge = (n) => (n.badge === "pend" ? (isStaff() ? S.PEND.length : 0) : n.badge === "bell" ? S.unseen || 0 : 0);

// ---------- shell ----------
function drawShell() {
  const items = pendingOnly() ? NAV.filter((n) => n.k === "dashboard" || n.k === "profile") : navFor();
  let lastG = null, nav = "";
  for (const n of items) {
    if (n.g !== lastG && n.g) nav += `<div class="nav-h">${esc(t(n.g))}</div>`;
    lastG = n.g;
    const c = badge(n);
    nav += `<button class="nav-i" data-nav="${n.k}" data-act="nav" data-arg="${n.k}">${icon(n.ic)}<span>${esc(t(n.l))}</span>${c ? `<span class="cnt">${c}</span>` : ""}</button>`;
  }
  const tabs = items.filter((n) => n.tab).slice(0, 4);
  const more = `<button data-act="menu" aria-label="${esc(t("Menu"))}">${icon("menu")}<span>${esc(t("Menu"))}</span></button>`;
  const lang = `<div class="langsw" role="group" aria-label="Language"><button class="${S.lang === "en" ? "on" : ""}" data-act="lang" data-arg="en">EN</button><button class="${S.lang === "bn" ? "on" : ""}" data-act="lang" data-arg="bn">বাংলা</button></div>`;
  $app().innerHTML = `<div class="shell">
  <aside class="side" id="side" aria-label="Menu">
    <button class="brand" data-act="nav" data-arg="dashboard"><img src="logo.jpg" alt=""><div><b>${esc(instName())}</b><span>${esc(roleName())}</span></div></button>
    <nav class="nav">${nav}</nav>
    <div class="side-f">${lang}<button class="btn" data-act="logout">${icon("logout")}${esc(t("Logout"))}</button></div>
  </aside>
  <div class="scrim" data-act="menu"></div>
  <header class="top">
    <button class="icon-btn menu-btn" data-act="menu" aria-label="${esc(t("Menu"))}">${icon("menu")}</button>
    <h1 id="ttl"></h1>
    ${isStaff() ? `<div class="gs">${icon("search")}<input id="gs" data-input="gs" placeholder="${esc(t("Search student / teacher"))}" autocomplete="off"><div class="gs-r" id="gs-r" hidden></div></div><button class="icon-btn gs-btn" data-act="search-open" aria-label="${esc(t("Search"))}">${icon("search")}</button>` : ""}
    ${pendingOnly() ? "" : `<button class="icon-btn" data-act="nav" data-arg="alerts" aria-label="${esc(t("Alerts"))}">${icon("bell")}<span class="dot" id="bell" ${S.unseen ? "" : "hidden"}>${S.unseen || ""}</span></button>`}
    <button class="who" data-act="nav" data-arg="profile" aria-label="${esc(t("Profile"))}">${avatar(S.me, 38)}</button>
  </header>
  <main class="main" id="view" tabindex="-1"></main>
  <nav class="tabbar" aria-label="Tabs">${tabs.map((n) => `<button data-nav="${n.k}" data-act="nav" data-arg="${n.k}">${icon(n.ic)}<span>${esc(t(n.l))}</span></button>`).join("")}${more}</nav>
</div>`;
  markNav();
}
function markNav() {
  $$("[data-nav]").forEach((b) => b.classList.toggle("on", b.dataset.nav === S.page));
  const n = NAV.find((x) => x.k === S.page), P = PAGES[S.page];
  const ttl = $("#ttl");
  if (ttl) ttl.textContent = t((P && P.title) || (n && n.l) || instName());
  document.title = (ttl ? ttl.textContent + " · " : "") + instName();
}
const setBell = () => {
  const b = $("#bell");
  if (b) { b.hidden = !S.unseen; b.textContent = S.unseen || ""; }
  const n = NAV.find((x) => x.k === "alerts"), nb = $('.nav-i[data-nav="alerts"]');
  if (nb) { let c = nb.querySelector(".cnt"); if (S.unseen) { if (!c) { c = document.createElement("span"); c.className = "cnt"; nb.appendChild(c); } c.textContent = S.unseen; } else if (c) c.remove(); }
  return n;
};
// the number on the bell: loaded in the background, never blocks a page
export async function refreshBell() {
  if (pendingOnly()) return;
  try { S.unseen = unseenCount(await getNotices()); } catch (e) { S.unseen = 0; }
  setBell();
}

// ---------- router ----------
let rid = 0, lastPage = "";
async function render() {
  if (!S.me) return;
  const my = ++rid;
  let { page, params } = parseHash();
  if (!page || !allowed(page)) page = "dashboard";
  S.page = page; S.params = params;
  markNav();
  document.body.classList.remove("menu-open");
  const view = $("#view");
  if (!view) return;
  const same = lastPage === page, y = window.scrollY;
  if (!same) view.innerHTML = `<div class="loading"><div class="spin"></div></div>`;
  let html;
  try {
    const P = PAGES[page];
    if (!P) throw new Error("This page is not available (" + page + "). " + (S.moduleErrors || []).join(" | "));
    html = await P.render(params);
    if (my !== rid) return; // a newer page was asked for meanwhile
    view.innerHTML = html;
    if (P.after) await P.after(params);
  } catch (e) {
    if (my !== rid) return;
    console.error(e);
    view.innerHTML = notice(`<b>${esc(t("Something went wrong"))}</b><br>${esc(dbError(e))}<div class="mt">${btn(t("Try again"), "retry", { ic: "refresh", sm: true })}</div>`, "bad");
  }
  lastPage = page;
  if (same) window.scrollTo(0, y); else { window.scrollTo(0, 0); view.focus({ preventScroll: true }); }
}

// ---------- global actions ----------
function registerActions() {
  act("menu", () => document.body.classList.toggle("menu-open"));
  act("nav", (el) => { document.body.classList.remove("menu-open"); closeDoc(); go(el.dataset.arg); });
  act("retry", () => render());
  act("logout", async () => { closeDoc(); closeModals(); await signOutNow(); });
  act("lang", (el) => {
    setLang(el.dataset.arg);
    if (S.me) { drawShell(); lastPage = ""; render(); } else authRedraw();
  });
  act("doc-print", () => window.print());
  act("doc-close", () => closeDoc());
  onChange("pick-batch", (el) => { S.bid = el.value; render(); });
  window.addEventListener("rise-seen", () => { S.unseen = 0; setBell(); });
  window.addEventListener("rise-me", () => { if (S.me) { drawShell(); lastPage = ""; render(); } });

  // search (admin / co-admin): name, nickname, roll, phone, guardian phone, school
  const results = (q) => {
    q = lk(q);
    if (q.length < 2) return "";
    const all = [...S.U, ...S.TC, ...S.PEND].filter((u) => [u.name, u.nick, u.roll, u.phone, u.gphone, u.school].some((v) => lk(v).includes(q))).slice(0, 8);
    if (!all.length) return `<div class="mut" style="padding:12px 14px">${esc(t("Nothing found"))}</div>`;
    return all.map((u) => `<button data-act="open-user" data-arg="${esc(u.id)}" data-close="1"><b>${esc(u.name)}</b> <span class="mut">${esc(u.roll || "")} · ${esc(u.role === "teacher" ? t("Teacher") : (S.B.find((b) => b.id === u.bid) || {}).name || t("Student"))}</span></button>`).join("");
  };
  onInput("gs", (el) => {
    const box = el.parentElement.querySelector(".gs-r"), h = results(el.value);
    box.innerHTML = h; box.hidden = !h;
  });
  act("search-open", () => {
    const m = modal(`<div class="gs" style="display:block;max-width:none;flex:none">${icon("search")}<input data-input="gs" placeholder="${esc(t("Search student / teacher"))}" autocomplete="off"><div class="gs-r" hidden style="position:static;margin-top:8px"></div></div>`);
    m.body.addEventListener("click", (e) => { if (e.target.closest("[data-act=open-user]")) m.close(); });
  });
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".gs")) { const b = $("#gs-r"); if (b) b.hidden = true; }
    if (e.target.closest("#gs-r [data-act=open-user]")) { const b = $("#gs-r"), i = $("#gs"); if (b) b.hidden = true; if (i) i.value = ""; }
  });
}

// ---------- start ----------
let started = 0;
async function start(u) {
  const my = ++started;
  if (!u) {
    S.me = null; S.pid = null; S.B = []; S.U = []; S.TC = []; S.PEND = []; S.bid = null; S.unseen = 0; lastPage = "";
    document.body.classList.remove("menu-open");
    window.__riseReady = true;
    await renderLogin(S.loginMsg || ""); S.loginMsg = "";
    return;
  }
  $app().innerHTML = `<div class="loading"><img src="logo.jpg" alt=""><div class="spin"></div><div>${esc(t("Opening your page…"))}</div></div>`;
  let prof = null;
  try {
    // after an admin password reset the login has a different uid: map/<uid> points to the real profile
    const mp = await db.get("map/" + u.uid).catch(() => null);
    const pid = mp ? mp.sid : u.uid;
    if (pid !== "_") { const d = await db.get("users/" + pid); if (d) prof = { pid, d }; }
  } catch (e) { S.loginMsg = dbError(e); }
  if (my !== started) return;
  if (!prof || prof.d.active === false) {
    S.loginMsg = S.loginMsg || (prof ? t("This account is switched off. Please ask the admin.") : t("No account found for this login. Ask the admin, or register."));
    await signOutNow();
    return;
  }
  setMe(prof.pid, prof.d);
  S.q = {};
  if (pendingOnly()) { await loadInst(); S.B = []; S.U = []; S.TC = []; S.PEND = []; }
  else await loadCore();
  if (my !== started) return;
  if (isAdmin() && !S.INST.seeded && !S.B.length) {
    try { await ensureDefaultBatches(); await saveInst({ seeded: true }); } catch (e) { console.warn(e); }
  }
  drawShell();
  window.__riseReady = true;
  const share = /[?&]share=1/.test(location.search);
  if (share) history.replaceState(null, "", location.pathname + (isStudent() ? "#/dashboard" : "#/share"));
  else if (!parseHash().page) location.hash = "#/dashboard";
  lastPage = "";
  await render();
  refreshBell();
  if (S.me.mustChange) forceNewPassword();
}

// ---------- boot ----------
async function boot() {
  initLang();
  startEvents();
  setErrorSink((e) => { console.error(e); toast(dbError(e), "bad"); });
  registerActions();
  window.addEventListener("hashchange", render);
  setRefresher(render);
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); window.__installPrompt = e; });
  if (!configured) { window.__riseReady = true; return renderNotConfigured(); }
  // page modules: one broken file must not stop the others
  S.moduleErrors = [];
  const mods = ["pages-home.js", "pages-people.js", "pages-account.js", "pages-attendance.js", "pages-exams.js", "pages-results.js", "pages-fees.js", "pages-content.js", "pages-marks.js"];
  // one after the other, in a fixed order, so the texts of the modules are always added in the same order (the files are preloaded in index.html)
  for (const m of mods) await import("./" + m).catch((e) => { console.error(m, e); S.moduleErrors.push(m + ": " + (e && e.message)); });
  onAuth((u) => { start(u).catch((e) => { console.error(e); S.loginMsg = dbError(e); signOutNow().catch(() => {}); }); });
  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
}
boot();
