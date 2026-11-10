// Dashboards: admin / co-admin, teacher, student, and the "waiting for approval" screen.
import { db } from "./lib-db.js";
import { S, esc, t, page, act, refresh, isTeacher, isStudent, canFees, T, f1, addBN, batchOf, fmtDate, ago, monthLabel } from "./lib-core.js";
import { icon, avatar, empty, notice, card, row, btn, ring, stat } from "./lib-ui.js";
import { getStats, getNotices, active } from "./lib-svc.js";
import { feeFor, paidIn, feeStart, nextMonth } from "./lib-stats.js";

// other page modules are optional: a broken one must not break the dashboard
const lazy = async (mod, fn, ...a) => { try { const m = await import("./" + mod); return m[fn] ? await m[fn](...a) : ""; } catch (e) { console.warn(mod, e); return ""; } };
const tiles = (list) => `<div class="tiles">${list.join("")}</div>`;
const nav = (pg) => ({ act: "nav", arg: pg });
const today = () => new Date().toLocaleDateString(S.lang === "bn" ? "bn-BD" : "en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
const welcome = (sub) => `<div class="welcome">${avatar(S.me, 56)}<div><h2>${esc(t("Welcome back, {n}!", { n: S.me.name }))}</h2><p class="mut">${esc(sub || today())}</p></div></div>`;

// ---------- small cards ----------
const standalone = () => { try { return window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true; } catch (e) { return false; } };
const installCard = () => {
  if (standalone()) return "";
  try { if (localStorage.getItem("hide-install") === "1") return ""; } catch (e) { /* ignore */ }
  const p = window.__installPrompt, ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  if (!p && !ios) return "";
  return card(t("Install the app"), `<p class="mut">${esc(p ? t("Add this app to your home screen. It opens like a normal app.") : t("On iPhone: tap Share, then Add to Home Screen."))}</p><div class="row">${p ? btn(t("Install"), "hm-install", { kind: "pri", ic: "download" }) : ""}${btn(t("Not now"), "hm-noinst", { sm: true })}</div>`);
};
act("hm-install", async () => {
  const p = window.__installPrompt;
  if (!p) return;
  p.prompt();
  try { await p.userChoice; } catch (e) { /* ignore */ }
  window.__installPrompt = null;
  refresh();
});
act("hm-noinst", () => { try { localStorage.setItem("hide-install", "1"); } catch (e) { /* ignore */ } refresh(); });
const pwNote = () => (S.me.mustChange ? `<div class="mb">${notice(`${esc(t("You are using a temporary password."))} ${btn(t("Change password"), "pf-pw", { sm: true, ic: "key" })}`, "warn", "key")}</div>` : "");

const pendingCard = () => `<div class="stack">${welcome(t("Your account is created"))}${notice(`<b>${esc(t("Waiting for admin approval"))}</b><br>${esc(t("The admin or a co-admin must approve your registration. Until then only the dashboard and your profile are open."))}<br><span class="mut">${esc(t("Your login ID"))}: <b>${esc(S.me.roll || "–")}</b></span><div class="mt">${btn(t("Check again"), "hm-check", { sm: true, ic: "refresh" })}</div>`, "warn", "clock")}</div>`;
act("hm-check", async () => {
  const d = await db.get("users/" + S.pid);
  if (d && d.ap !== false) { location.reload(); return; }
  const { toast } = await import("./lib-ui.js");
  toast(t("Not approved yet. Please wait."), "");
});

const quick = (list) => tiles(list.map(([pg, ic, label]) => `<button class="stat" data-act="nav" data-arg="${pg}"><span class="stat-top">${icon(ic)}${esc(t(label))}</span></button>`));

const noticeCard = async () => {
  try {
    const L = (await getNotices()).slice(0, 4);
    if (!L.length) return "";
    return card(t("Latest notices"), `<div class="list">${L.map((n) => row({ title: n.t, sub: esc(ago(n.d)) })).join("")}</div>`, { right: btn(t("All"), "nav", { arg: "alerts", sm: true }) });
  } catch (e) { return ""; }
};

// ---------- admin / co-admin ----------
async function staffHome() {
  const d = T(), m = nextMonth(d.slice(0, 7), -1), A = S.U.filter(active), fees = canFees();   // m = the month whose fee fell due on the 1st of this month
  const [docs, P, BF, fp, rq, ranks, pr, mk] = await Promise.all([
    Promise.all(S.B.map((b) => db.get("att/" + b.id + "_" + d).catch(() => null))),
    fees ? db.list("pay", ["m", "==", m]).catch(() => []) : [],
    fees ? db.list("bf", ["m", "==", m]).catch(() => []) : [],
    db.list("fp", ["st", "==", "new"]).catch(() => []),
    lazy("pages-content.js", "pendingRequests"),
    lazy("pages-exams.js", "ranksBox"),
    fees ? lazy("pages-fees.js", "payRequestsCard") : "",
    lazy("pages-marks.js", "pendingMarks"),
  ]);
  let pres = 0, ab = 0;
  docs.forEach((x, i) => {
    if (!x) return;
    A.filter((s) => s.bid === S.B[i].id).forEach((s) => { if ((x.A || []).includes(s.id)) ab++; else if (!(x.E || []).includes(s.id)) pres++; });
  });
  const map = {};
  BF.forEach((x) => { map[x.bid + "_" + x.m] = x.amt; });
  const billed = A.filter((s) => s.bid && (feeStart(s, P) || d.slice(0, 7)) <= m), due = billed.filter((s) => feeFor(s, batchOf(s.bid), m, { INST: S.INST, BF: map }) > paidIn(P, s.id, m)).length;
  const teachers = S.TC.filter(active).length;
  // fee overview (admin only), batch overview and today's absent students; they reuse what was just read
  const [fo, bo, abs] = await Promise.all([fees ? lazy("pages-fees.js", "feeOverviewCard", { m, P, BF }) : "", lazy("pages-people.js", "batchOverview"), lazy("pages-attendance.js", "absentToday", docs)]);
  return `${welcome()}${pwNote()}${installCard()}
  <div class="card mt"><div class="rings">${ring(pres + ab ? (pres / (pres + ab)) * 100 : null, t("Attendance today"), "var(--ok)")}${fees ? ring(billed.length ? ((billed.length - due) / billed.length) * 100 : null, t("Fees paid"), "var(--blue)") : ""}</div></div>
  <div class="mt">${tiles([
    stat({ ic: "users", label: t("Students"), value: A.length, color: "var(--blue)", ...nav("students") }),
    stat({ ic: "check", label: t("Present today"), value: pres, color: "var(--ok)", ...nav("attendance") }),
    stat({ ic: "x", label: t("Absent today"), value: ab, color: "var(--bad)", ...nav("attendance") }),
    ...(fees ? [stat({ ic: "wallet", label: t("Unpaid fees: {m}", { m: monthLabel(m) }), value: due, color: "var(--gold-ink)", ...nav("fees") })] : []),
    stat({ ic: "mega", label: t("Pending requests"), value: rq || 0, color: "#6a4cf0", ...nav("requests") }),
    stat({ ic: "cap", label: t("Teachers"), value: teachers, color: "#0a9aa8", ...nav("teachers") }),
  ])}</div>
  ${S.PEND.length || fp.length ? `<div class="mt">${notice(`${S.PEND.length ? `${esc(t("Registrations waiting for approval"))}: <b>${S.PEND.length}</b>. ` : ""}${fp.length ? `${esc(t("Password help requests"))}: <b>${fp.length}</b>. ` : ""}${btn(t("Open"), "nav", { arg: "approvals", sm: true })}`, "warn", "user")}</div>` : ""}
  ${mk ? `<div class="mt">${notice(`${esc(t("Marks waiting for approval"))}: <b>${mk}</b>. ${btn(t("Open"), "nav", { arg: "marks", sm: true })}`, "info")}</div>` : ""}
  ${pr ? `<div class="mt">${pr}</div>` : ""}${fo ? `<div class="mt">${fo}</div>` : ""}${bo ? `<div class="mt">${bo}</div>` : ""}${ranks ? `<div class="mt">${ranks}</div>` : ""}${abs ? `<div class="mt">${abs}</div>` : ""}`;
}

// ---------- teacher ----------
async function teacherHome() {
  const d = T(), A = S.U.filter(active);
  const [docs, sal, cls, ranks] = await Promise.all([
    Promise.all(S.B.map((b) => db.get("att/" + b.id + "_" + d).catch(() => null))),
    lazy("pages-fees.js", "salaryCard"),
    lazy("pages-attendance.js", "todayClasses"),
    lazy("pages-exams.js", "ranksBox"),
  ]);
  const done = docs.filter(Boolean).length;
  const rowOf = (b, i) => {
    const L = A.filter((s) => s.bid === b.id), x = docs[i];
    const pc = x && L.length ? Math.round(((L.length - L.filter((s) => (x.A || []).includes(s.id) || (x.E || []).includes(s.id)).length) / L.length) * 100) + "%" : t("Not taken");
    const sj = (S.me.sj || {})[b.id];
    return row({ title: b.name, sub: esc(t("{n} students", { n: L.length }) + (sj && sj.length ? " · " + sj.join(", ") : "")), right: `<b class="${x ? "ok" : "warn"}">${esc(pc)}</b>${btn(t("Attendance"), "hm-att", { arg: b.id, sm: true, ic: "calcheck" })}` });
  };
  return `${welcome(t("Here is an overview of your classes today."))}${pwNote()}${installCard()}
  <div class="mt">${tiles([
    stat({ ic: "users", label: t("Students"), value: A.length, color: "var(--blue)", sub: t("Your classes") }),
    stat({ ic: "layers", label: t("My batches"), value: S.B.length, color: "var(--ok)" }),
    stat({ ic: "check", label: t("Attendance taken"), value: `${done} / ${S.B.length}`, color: "var(--gold-ink)", sub: t("Today"), ...nav("attendance") }),
    stat({ ic: "plus", label: t("Add student"), value: "+", sub: t("New registration"), color: "#6a4cf0", act: "tch-addstu" }),
  ])}</div>
  <div class="mt">${card(t("My classes"), S.B.length ? `<div class="list">${S.B.map(rowOf).join("")}</div>` : empty(t("No batch assigned yet."), "layers"))}</div>
  ${cls ? `<div class="mt">${cls}</div>` : ""}${sal ? `<div class="mt">${sal}</div>` : ""}
  <div class="mt">${quick([["attendance", "calcheck", "Attendance"], ["exams", "clip", "Exams"], ["performance", "trend", "Performance"], ["syllabus", "list", "Syllabus"]])}</div>
  ${ranks ? `<div class="mt">${ranks}</div>` : ""}`;
}
act("hm-att", (el) => { S.bid = el.dataset.arg; location.hash = "#/attendance"; });
act("tch-addstu", async () => { const m = await import("./pages-people.js"); await m.teacherAddStudent(); });

// ---------- student ----------
async function studentHome() {
  const me = S.me, b = S.B[0] || null;
  if (!me.bid || !b) return `${welcome()}${pwNote()}${installCard()}<div class="mt">${empty(t("You are not in a batch yet. The admin will add you to one."), "layers")}</div>`;
  const [st, fee, cls, nts, rr, pf] = await Promise.all([getStats(me.bid), lazy("pages-fees.js", "feeSummaryCard"), lazy("pages-attendance.js", "todayClasses"), noticeCard(), lazy("pages-exams.js", "recentResults"), lazy("pages-perf.js", "recentPerf")]);
  const r = (st.rows || {})[S.pid] || {}, n = st.n || 0;
  const att = (r.p || 0) + (r.a || 0) ? ((r.p || 0) / ((r.p || 0) + (r.a || 0))) * 100 : null;
  return `${welcome(`${b.name} · ${today()}`)}${pwNote()}${installCard()}
  <div class="card mt"><div class="card-h"><h3>${esc(t("This month"))}</h3>${st.from ? `<span class="mut sm">${esc(t("Counted from {d}.", { d: fmtDate(st.from) }))}</span>` : ""}</div>
    <div class="rings">${ring(att, t("Attendance"), "var(--ok)")}${ring(r.ex, t("Exam average"), "#6a4cf0")}${ring(r.pf, t("Performance"), "var(--gold)")}</div>
    <div class="tiles mt">${stat({ ic: "trophy", label: t("Exam rank"), value: r.er ? "#" + r.er : "–", sub: n ? t("of {n} students", { n }) : "", color: "#6a4cf0", ...nav("exams") })}${stat({ ic: "star", label: t("Overall"), value: f1(r.ov), sub: r.or ? t("Rank #{r} of {n}", { r: r.or, n }) : "", color: "var(--blue)", ...nav("reports") })}</div></div>
  ${rr ? `<div class="mt">${rr}</div>` : ""}${pf ? `<div class="mt">${pf}</div>` : ""}${cls ? `<div class="mt">${cls}</div>` : ""}${fee ? `<div class="mt">${fee}</div>` : ""}${nts ? `<div class="mt">${nts}</div>` : ""}
  <div class="mt">${quick([["performance", "trend", "Performance"], ["exams", "clip", "Results"], ["syllabus", "list", "Syllabus"], ["reports", "chart", "Report"], ["requests", "mega", "Requests"], ["idcard", "idcard", "ID card"]])}</div>`;
}

page("dashboard", async () => {
  if (S.me.ap === false) return pendingCard();
  if (isStudent()) return studentHome();
  if (isTeacher()) return teacherHome();
  return staffHome();
}, { title: "Dashboard" });

addBN({
  "Welcome back, {n}!": "স্বাগতম, {n}!", "Install the app": "অ্যাপ ইনস্টল করুন", "Add this app to your home screen. It opens like a normal app.": "এই অ্যাপটি হোম স্ক্রিনে যোগ করুন। সাধারণ অ্যাপের মতো খুলবে।", "On iPhone: tap Share, then Add to Home Screen.": "আইফোনে: Share চাপুন, তারপর Add to Home Screen।",
  "Install": "ইনস্টল", "Not now": "এখন নয়", "You are using a temporary password.": "আপনি অস্থায়ী পাসওয়ার্ড ব্যবহার করছেন।", "Change password": "পাসওয়ার্ড বদলান", "Your account is created": "আপনার অ্যাকাউন্ট তৈরি হয়েছে",
  "The admin or a co-admin must approve your registration. Until then only the dashboard and your profile are open.": "অ্যাডমিন বা কো-অ্যাডমিন আপনার রেজিস্ট্রেশন অনুমোদন করবেন। ততক্ষণ শুধু ড্যাশবোর্ড ও প্রোফাইল খোলা থাকবে।", "Your login ID": "আপনার লগইন আইডি", "Check again": "আবার দেখুন", "Not approved yet. Please wait.": "এখনো অনুমোদন হয়নি। একটু অপেক্ষা করুন।",
  "Latest notices": "সর্বশেষ নোটিশ", "All": "সব", "Attendance today": "আজকের উপস্থিতি", "Fees paid": "ফি পরিশোধ", "Students": "ছাত্র", "Present today": "আজ উপস্থিত", "Absent today": "আজ অনুপস্থিত", "Fees due this month": "এই মাসে বাকি ফি", "Pending requests": "অপেক্ষমাণ অনুরোধ", "Teachers": "শিক্ষক",
  "Registrations waiting for approval": "অনুমোদনের অপেক্ষায় রেজিস্ট্রেশন", "Password help requests": "পাসওয়ার্ড সাহায্যের অনুরোধ", "Open": "খুলুন", "{n} students": "{n} জন ছাত্র", "Attendance": "উপস্থিতি", "Not taken": "নেওয়া হয়নি", "Here is an overview of your classes today.": "আজকের ক্লাসের সারসংক্ষেপ।",
  "Your classes": "আপনার ক্লাস", "My batches": "আমার ব্যাচ", "Attendance taken": "উপস্থিতি নেওয়া হয়েছে", "Today": "আজ", "My classes": "আমার ক্লাস", "No batch assigned yet.": "এখনো কোনো ব্যাচ দেওয়া হয়নি।", "Exams": "পরীক্ষা", "Homework": "হোমওয়ার্ক", "Syllabus": "সিলেবাস",
  "You are not in a batch yet. The admin will add you to one.": "আপনি এখনো কোনো ব্যাচে নেই। অ্যাডমিন আপনাকে একটি ব্যাচে যোগ করবেন।", "This month": "এই মাস", "Counted from {d}.": "{d} থেকে গণনা।", "Exam average": "পরীক্ষার গড়", "Exam rank": "পরীক্ষার র‍্যাঙ্ক", "of {n} students": "{n} জনের মধ্যে",
  "Marks waiting for approval": "অনুমোদনের অপেক্ষায় নম্বর", "Overall": "সার্বিক", "Rank #{r} of {n}": "র‍্যাঙ্ক #{r} / {n}", "Results": "ফলাফল", "Report": "রিপোর্ট", "Requests": "অনুরোধ", "ID card": "আইডি কার্ড",
});
