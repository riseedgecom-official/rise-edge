// Profile, ID cards (new design, with QR) and the admin's settings.
import { db } from "./lib-db.js";
import { changePassword, dbError } from "./lib-db.js";
import {
  S, esc, t, page, act, onChange, onSubmit, formData, pageState, refresh, isStaff, isAdmin, isTeacher, isStudent, instName, addBN, batchOf, activeStudents, isEmail, cmp, ago,
} from "./lib-core.js";
import { icon, avatar, tag, empty, notice, card, row, btn, chips, input, textarea, select, batchPicker, form, toast, showDoc, ask, info } from "./lib-ui.js";
import { aiConfig, dropAiConfig, testAI, appCheckText, DEFAULT_MODEL, DEFAULT_LIMIT } from "./lib-ai.js";
import { rulesCurrent, reloadMe, saveInst, squarePhoto, mailCfg, sendMail, adminIdPlan, claimAdminId } from "./lib-svc.js";
import { noticeList, SPEEDS, THEMES, MAX_NOTICES, MAX_TEXT } from "./ticker.js";
import { qrSvg, qrMatrix } from "./lib-qr.js";
import { fitLink } from "./lib-idq.js";
import { ADMIN_ID } from "./lib-stats.js";

const BLOOD = ["", "A+", "A-", "B+", "B-", "O+", "O-", "AB+", "AB-"];
const phoneOk = (v) => !v || /^01\d{9}$/.test(String(v).replace(/[\s-]/g, ""));
const roleName = (u) => (u.role === "student" ? t("Student") : u.role === "admin" ? t("Admin") : u.ca ? t("Co-admin") : t("Teacher"));

// ================= ID card =================
const clsText = (u) => {
  const b = batchOf(u.bid) || {}, c = u.cls || b.cls, g = u.grp || b.grp;
  return c ? t("Class {n}", { n: c }) + (g ? " · " + t(g) : "") : "–";
};
// The card background is an SVG drawn inside the card (not a CSS background), so the gradients and shapes also print when the
// browser's "background graphics" option is off. Colours come from the logo: deep navy, electric blue, gold.
let bgN = 0;
function idBg(back, pro) {
  const k = "idb" + ++bgN, tall = back || pro, yl = tall ? 238 : 204, yr = tall ? 170 : 168, fl = back ? 496 : 490, fr = back ? 486 : 478;
  const dots = []; for (let x = 232; x <= 320; x += 14) for (let y = 22; y <= 64; y += 14) dots.push(`<circle cx="${x}" cy="${y}" r="1.5"/>`);
  const hex = (cx, cy, r) => [0, 1, 2, 3, 4, 5].map((i) => (cx + r * Math.cos(Math.PI / 3 * i + Math.PI / 6)).toFixed(1) + "," + (cy + r * Math.sin(Math.PI / 3 * i + Math.PI / 6)).toFixed(1)).join(" ");
  return `<svg class="idc-bg" viewBox="0 0 340 540" preserveAspectRatio="none" aria-hidden="true"><defs>
    <linearGradient id="${k}h" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="340" y2="${yl}"><stop offset="0" stop-color="#050b1f"/><stop offset=".55" stop-color="#0a2a6b"/><stop offset="1" stop-color="#1469e8"/></linearGradient>
    <linearGradient id="${k}g" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="340" y2="0"><stop offset="0" stop-color="#b9790a"/><stop offset=".5" stop-color="#f2b01e"/><stop offset="1" stop-color="#ffd36b"/></linearGradient>
    <linearGradient id="${k}p" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="540"><stop offset="0" stop-color="#ffffff"/><stop offset=".6" stop-color="#f1f6ff"/><stop offset="1" stop-color="#dfeaff"/></linearGradient>
    <linearGradient id="${k}f" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="340" y2="0"><stop offset="0" stop-color="#050b1f"/><stop offset="1" stop-color="#0d3c9c"/></linearGradient></defs>
    <rect width="340" height="540" fill="url(#${k}p)"/>
    <g fill="none" stroke="#1469e8" stroke-opacity=".08" stroke-width="1.6"><polygon points="${hex(296, 300, 46)}"/><polygon points="${hex(318, 352, 30)}"/><polygon points="${hex(40, tall ? 330 : 470, 38)}"/></g>
    <circle cx="14" cy="${tall ? 330 : 440}" r="72" fill="#f2b01e" fill-opacity=".1"/><polygon points="340,${tall ? 236 : 236} 340,${tall ? 340 : 340} 250,${tall ? 340 : 340}" fill="#1469e8" fill-opacity=".05"/>
    <path d="M0 0H340V${yr}L0 ${yl}Z" fill="url(#${k}h)"/>
    <circle cx="310" cy="14" r="76" fill="#fff" fill-opacity=".06"/><circle cx="310" cy="14" r="50" fill="none" stroke="#ffd36b" stroke-opacity=".4" stroke-width="1.4"/><polygon points="0,0 96,0 0,96" fill="#2f86ff" fill-opacity=".28"/>
    <polygon points="${hex(36, tall ? 190 : 160, 24)}" fill="none" stroke="#ffd36b" stroke-opacity=".45" stroke-width="1.4"/><g fill="#fff" fill-opacity=".35">${dots.join("")}</g>
    <path d="M0 ${yl}L340 ${yr}V${yr + 7}L0 ${yl + 7}Z" fill="url(#${k}g)"/><path d="M0 ${yl + 12}L340 ${yr + 12}" stroke="#2f86ff" stroke-opacity=".55" stroke-width="1.5"/>
    <path d="M0 540V${fl}L340 ${fr}V540Z" fill="url(#${k}f)"/><path d="M0 ${fl}L340 ${fr}" stroke="url(#${k}g)" stroke-width="3"/>
    <rect x="10" y="10" width="320" height="520" rx="14" fill="none" stroke="#2f86ff" stroke-width="2.5"/><rect x="15.5" y="15.5" width="309" height="509" rx="10" fill="none" stroke="#f2b01e" stroke-opacity=".75" stroke-width="1"/>
    <g fill="none" stroke="#f2b01e" stroke-width="5" stroke-linecap="round"><path d="M10 44V24a14 14 0 0 1 14-14H44"/><path d="M296 10h20a14 14 0 0 1 14 14v20"/><path d="M10 496v20a14 14 0 0 0 14 14h20"/><path d="M330 496v20a14 14 0 0 1-14 14h-20"/></g></svg>`;
}
// What the card's QR holds: a link to verify.html with what is printed on the card (see lib-idq.js).
// If that is too long for one QR it says less; as a last resort the QR is just the ID.
// The admin's card always shows ADMIN_ID (REAT-2026-001), whatever the admin's own login is.
const cardKind = (u) => (u.role === "student" ? "S" : u.role === "admin" ? "A" : "T");
const idOf = (u) => (u.role === "admin" ? ADMIN_ID : u.roll || u.id);
const yearOf = (u) => (String(idOf(u)).match(/-(\d{4})-/) || [])[1] || "";
const signName = () => S.INST.owner || "Noman Islam Raj";
function idQrText(u) {
  const st = u.role === "student", ad = u.role === "admin", b = batchOf(u.bid) || {}, c0 = u.cls || b.cls, g = u.grp || b.grp;
  const card = { k: cardKind(u), id: idOf(u), name: u.name, a: st ? (c0 ? "Class " + c0 + (g ? " · " + g : "") : "") : ad ? "Admin" : (u.subject || ""), b: st ? (b.name || "") : "", y: yearOf(u) };
  const fits = (l) => { try { qrMatrix(l); return true; } catch (e) { return false; } };
  return fitLink(new URL("verify.html", location.href).href, card, fits) || String(idOf(u));
}
// Student: photo and QR on the left, the details on the right.
// Teacher and admin: a big photo in the middle and the details in boxes; their QR is on the back.
function frontHtml(u) {
  const st = u.role === "student", ad = u.role === "admin", b = batchOf(u.bid) || {};
  const yr = yearOf(u);
  if (!st) {
    const subj = u.subject || "–", phone = u.phone || "–", bg = u.bg || "–";
    const bx = (l, v, c = "") => `<div class="idc-bx ${c}"><small>${esc(l)}</small><b>${esc(v)}</b></div>`;
    return `<div class="idc idc--pro">${idBg(false, true)}<div class="idc-in">
      <img class="idc-logo idc-logo--lg" src="logo.jpg" alt="">
      <div class="idc-name idc-name--lg">${esc(instName().toUpperCase())}</div>
      <div class="idc-role idc-role--lg">${esc(ad ? t("ADMIN ID CARD") : t("TEACHER ID CARD"))}</div>
      <div class="idc-ph">${u.pic ? `<img src="${esc(u.pic)}" alt="">` : esc([...(u.name || "?")][0])}</div>
      <div class="idc-bxs">${bx(t("Name").toUpperCase(), u.name, String(u.name || "").length > 26 ? "idc-bx--s" : "")}
        <div class="idc-bx2">${bx(t("ID"), idOf(u))}${bx(t("Blood group").replace("group", "Group"), bg)}</div>
        ${ad ? bx(t("Phone"), phone) : `<div class="idc-bx2">${bx(t("Subject"), subj, String(subj).length > 14 ? "idc-bx--s" : "")}${bx(t("Phone"), phone)}</div>`}</div>
      <div class="idc-foot idc-foot--end"><span>${esc(yr ? t("Session") + ": " + yr : "")}</span></div></div></div>`;
  }
  const rows = [[t("Name"), u.name], [t("Roll"), u.roll], [t("Class"), clsText(u)], [t("Batch"), b.name || "–"], [t("Guardian Name"), u.gname || "–"], [t("Guardian Phone"), u.gphone || "–"]];
  return `<div class="idc">${idBg(false)}<div class="idc-in">
    <img class="idc-logo" src="logo.jpg" alt="">
    <div class="idc-name">${esc(instName().toUpperCase())}</div>
    <div class="idc-tag">${esc(S.INST.tag || t("Student, teacher and admin portal"))}</div>
    <div class="idc-role">${esc(t("STUDENT ID CARD"))}</div>
    <div class="idc-main"><div class="idc-l"><div class="idc-photo">${u.pic ? `<img src="${esc(u.pic)}" alt="">` : esc([...(u.name || "?")][0])}</div><div class="idc-qr">${qrSvg(idQrText(u), { margin: 0 })}</div><div class="idc-scan">${esc(t("Scan to verify"))}</div></div>
      <div class="idc-r">${rows.map(([l, v]) => `<div class="idc-f${String(v).length > 34 ? " idc-f--xs" : String(v).length > 22 ? " idc-f--s" : ""}"><small>${esc(l)}</small><b>${esc(v)}</b></div>`).join("")}</div></div>
    <div class="idc-foot"><span>${esc(S.INST.phone || "")}</span><span>${esc(yr ? t("Session") + " " + yr : "")}</span></div></div></div>`;
}
// The back is the same for everybody: the notice, then the QR (teacher / admin; a student's QR is on the front, so a student gets the academy's
// contact details here), the signature with the name under it, and the ID in the corner.
function backHtml(u) {
  const st = u.role === "student";
  const mid = st
    ? `<div class="idc-qrb idc-qrb--info">${S.INST.phone ? `<p><small>${esc(t("Phone"))}</small><b>${esc(S.INST.phone)}</b></p>` : ""}${S.INST.addr ? `<p><small>${esc(t("Address"))}</small><b>${esc(S.INST.addr)}</b></p>` : ""}${u.bg ? `<p><small>${esc(t("Blood group"))}</small><b>${esc(u.bg)}</b></p>` : ""}</div>`
    : `<div class="idc-qrb">${qrSvg(idQrText(u), { margin: 0 })}</div>`;
  return `<div class="idc idc--back">${idBg(true)}<div class="idc-in idc-in--back">
    <div class="idc-bk">
      <p>${esc(t("This card is the property of {n}. It must be shown when asked.", { n: instName() }))}</p>
      <i class="idc-gold"></i>
      <p>${esc(t("If found, please return it to the academy."))}</p></div>
    ${mid}
    <div class="idc-sg"><img src="sign.webp" alt=""><i></i><b>${esc(signName())}</b></div>
    <div class="idc-idb">${esc("ID: " + idOf(u))}</div></div></div>`;
}
const sheet = (list, backs = true) => `<div class="idc-sheet">${list.map((u) => frontHtml(u) + (backs ? backHtml(u) : "")).join("")}</div>`;
export function showIdCard(u) { showDoc(sheet([u]), { title: u.name }); }
act("id-show", (el) => {
  const u = [...S.U, ...S.TC, S.me].find((x) => x && x.id === el.dataset.arg);
  if (u) showIdCard(u);
});
act("id-all", () => {
  const L = activeStudents().sort((a, b) => cmp(a.roll, b.roll));
  if (!L.length) return toast(t("No students."), "bad");
  showDoc(sheet(L));
});

const IC = () => pageState("idc");
page("idcard", async () => {
  if (isStudent() || (!isStaff() && !isTeacher())) return `<div class="tc"><div class="idc-sheet">${frontHtml(S.me)}${backHtml(S.me)}</div><div class="mt">${btn(t("Print / Save PDF"), "id-show", { arg: S.pid, kind: "pri", ic: "print" })}</div></div>`;
  const st = IC(); st.k = st.k || "s";
  const tabs = isStaff() ? chips([{ k: "s", label: t("Students") }, { k: "t", label: t("Teachers") }], st.k, "id-tab") : "";
  const mine = isAdmin() || isTeacher() ? `<div class="mb">${btn(t("My ID card"), "id-show", { arg: S.pid, sm: true, kind: isAdmin() ? "pri" : "", ic: "idcard" })}</div>` : "";   // the admin and every teacher can open their own card
  if (st.k === "t" && isStaff()) {
    return `${tabs}${mine}${card(t("Teachers"), S.TC.length ? `<div class="list">${S.TC.filter((x) => x.active !== false).sort((a, b) => cmp(a.name, b.name)).map((x) => row({ av: avatar(x, 36), title: x.name, sub: esc(x.roll || ""), right: btn(t("ID card"), "id-show", { arg: x.id, sm: true, ic: "idcard" }) })).join("")}</div>` : empty(t("No teacher yet."), "cap"))}`;
  }
  const L = activeStudents().sort((a, b) => cmp(a.roll, b.roll));
  return `${tabs}${mine}${batchPicker()}
    ${card(t("Students") + ` (${L.length})`, L.length ? `<div class="list">${L.map((s) => row({ av: avatar(s, 36), title: s.name, sub: esc(s.roll || ""), right: btn(t("ID card"), "id-show", { arg: s.id, sm: true, ic: "idcard" }) })).join("")}</div><div class="mt">${btn(t("Print all cards of this batch"), "id-all", { ic: "print" })}</div>` : empty(t("No students in this batch."), "users"))}`;
}, { title: "ID card" });
act("id-tab", (el) => { IC().k = el.dataset.arg; refresh(); });

// the admin takes REAT-2026-001 (see adminIdPlan in lib-svc.js)
act("pf-adminid", async () => {
  const u = S.me;
  if (!u || u.role !== "admin" || u.co) return;
  let plan;
  try { plan = await adminIdPlan(await db.get("users/" + S.pid)); } catch (e) { return toast(t(dbError(e)), "bad"); }
  if (!plan) { toast(t("Your ID is already {b}", { b: ADMIN_ID }), "ok"); return refresh(); }
  const msg = plan.swap
    ? t("{n} has {b} now. You and {n} swap IDs: you get {b}, {n} gets {a}. Both of you sign in with the new ID from now on.", { n: plan.swap.name || plan.swap.id, a: u.roll, b: ADMIN_ID })
    : t("Your login ID changes from {a} to {b}. Sign in with {b} from now on.", { a: u.roll, b: ADMIN_ID });
  if (!(await ask(msg, { title: t("Change my ID"), ok: t("Change ID") }))) return;
  try { await claimAdminId(); } catch (e) { return toast(t(dbError(e)), "bad"); }
  toast(t("Your ID is now {b}", { b: ADMIN_ID }), "ok");
  refresh();
});

// ================= profile =================
page("profile", async () => {
  const u = S.me, st = u.role === "student", b = batchOf(u.bid) || {};
  const info = [[t("Login ID"), u.roll || u.email || "–"], [t("Role"), roleName(u)]];
  if (st) info.push([t("Class"), clsText(u)], [t("Batch"), b.name || "–"], [t("School / college"), u.school || "–"]);
  if (!st && u.subject) info.push([t("Subject"), u.subject]);
  if (u.email) info.push([t("Email"), u.email]);
  const pend = u.ap === false;
  const fixId = u.role === "admin" && !u.co && u.roll && u.roll !== ADMIN_ID;   // an admin who was a teacher before keeps the old teacher ID
  return `${fixId ? `<div style="margin-bottom:12px">` + notice(`<b>${esc(t("Your login ID is {a}, but the admin's ID is {b}.", { a: u.roll, b: ADMIN_ID }))}</b><div class="mt">${btn(t("Make my ID {b}", { b: ADMIN_ID }), "pf-adminid", { sm: true })}</div>`, "warn", "idcard") + "</div>" : ""}${pend ? notice(`<b>${esc(t("Waiting for admin approval"))}</b><br>${esc(t("Your account is created. The admin or a co-admin must approve it before you can open the other pages."))}`, "warn", "clock") : ""}
  <div class="card tc"><div style="display:flex;justify-content:center">${avatar(u, 92)}</div><h2 style="margin:10px 0 2px">${esc(u.name)}</h2>${tag(roleName(u), "info")}
    <div class="mt"><label class="btn btn--sm" style="cursor:pointer">${icon("camera")}${esc(t("Change photo"))}<input type="file" accept="image/*" data-change="pf-pic" hidden></label></div></div>
  <div class="mt">${card(t("My information"), `<div class="list">${info.map(([l, v]) => row({ title: v, sub: esc(l) })).join("")}${row({ title: u.phone || "–", sub: esc(t("Phone")) })}${row({ title: u.addr || "–", sub: esc(t("Address")) })}${row({ title: u.bg || "–", sub: esc(t("Blood group")) })}${st ? row({ title: u.gname || "–", sub: esc(t("Guardian Name")) }) + row({ title: u.gphone || "–", sub: esc(t("Guardian's phone")) }) + row({ title: u.gem || "–", sub: esc(t("Guardian's email")) }) : ""}</div><div class="row mt">${btn(t("Edit"), "pf-edit", { ic: "edit" })}${u.role === "admin" ? btn(t("My ID card"), "id-show", { arg: S.pid, ic: "idcard" }) : ""}</div>`)}</div>
  <div class="mt">${card(t("Account"), `<div class="row">${btn(t("Change password"), "pf-pw", { ic: "key" })}${btn("English", "lang", { arg: "en", sm: true, kind: S.lang === "en" ? "pri" : "" })}${btn("বাংলা", "lang", { arg: "bn", sm: true, kind: S.lang === "bn" ? "pri" : "" })}${btn(t("Logout"), "logout", { ic: "logout", kind: "bad" })}</div>`)}</div>`;
}, { title: "Profile" });

const saved = async (patch) => {
  await db.upd("users/" + S.pid, patch);
  await reloadMe();
  window.dispatchEvent(new Event("rise-me"));
};
onChange("pf-pic", async (el) => {
  const f = el.files[0];
  if (!f) return;
  await saved({ pic: await squarePhoto(f, 160) });
  toast(t("Saved"), "ok");
});
act("pf-edit", async () => {
  const u = S.me, st = u.role === "student";
  await form(t("Edit"), `${input("name", { label: t("Name"), value: u.name, maxlength: "100" })}${input("phone", { label: t("Phone"), value: u.phone || "", type: "tel", inputmode: "tel" })}${input("addr", { label: t("Address"), value: u.addr || "", maxlength: "200" })}${select("bg", BLOOD.map((x) => [x, x || "–"]), u.bg || "", { label: t("Blood group") })}
    ${st ? `${input("gname", { label: t("Guardian Name"), value: u.gname || "", maxlength: "100" })}${input("gphone", { label: t("Guardian's phone"), value: u.gphone || "", type: "tel", inputmode: "tel" })}${input("gem", { label: t("Guardian's email"), value: u.gem || "", type: "email" })}` : ""}`, {
    validate: (d) => (!d.name.trim() ? t("Enter your full name.") : !phoneOk(d.phone) ? t("Enter a valid phone number (01XXXXXXXXX).") : st && !phoneOk(d.gphone) ? t("Enter a valid guardian phone number (01XXXXXXXXX).") : st && d.gem.trim() && !isEmail(d.gem.trim()) ? t("The guardian email looks wrong.") : ""),
    onSave: async (d) => {
      const p = { name: d.name.trim(), phone: d.phone.trim(), addr: d.addr.trim(), bg: d.bg };
      if (st) Object.assign(p, { gname: d.gname.trim(), gphone: d.gphone.trim(), gem: d.gem.trim() });
      await saved(p);
      toast(t("Saved"), "ok");
    },
  });
});
const pw = (name, label, ac = "new-password") => input(name, { label, type: "password", autocomplete: ac });
act("pf-pw", async () => {
  await form(t("Change password"), `${pw("cur", t("Current password"), "current-password")}${pw("n1", t("New password (min 6 characters)"))}${pw("n2", t("Repeat new password"))}`, {
    ok: t("Save password"),
    validate: (d) => (d.n1.length < 6 ? t("The password needs at least 6 characters.") : d.n1 !== d.n2 ? t("The two passwords are different.") : d.n1 === d.cur ? t("The new password must be different.") : ""),
    onSave: async (d) => {
      try { await changePassword(d.cur, d.n1); } catch (e) { throw new Error(/wrong-password|invalid-credential/.test((e && e.code) || "") ? t("The current password is wrong.") : dbError(e)); }
      if (S.me.mustChange) { await saved({ mustChange: false }); }
      toast(t("Password changed."), "ok");
    },
  });
});

// ================= news ticker (admin) =================
// config/inst.ticker [{id, t, on, c}], tkSpeed, tkTheme  - the bar itself is drawn by ticker.js
const tkUid = () => "n" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
const SPEED_L = { slow: "Slow", normal: "Normal", fast: "Fast" }, THEME_L = { blue: "Blue", red: "Red", green: "Green", dark: "Dark" };
const THEME_C = { blue: "#4338ca", red: "#be123c", green: "#047857", dark: "#0f172a" };
const saveTicker = async (patch) => {
  await saveInst(patch);
  window.dispatchEvent(new Event("rise-me"));   // redraws the shell, so the bar at the top changes at once
};
page("ticker", async () => {
  const I = S.INST, L = noticeList(I), st = pageState("tk"), ed = st.edit ? L.find((x) => x.id === st.edit) : null;
  const sp = SPEEDS[I.tkSpeed] ? I.tkSpeed : "normal", th = THEMES.includes(I.tkTheme) ? I.tkTheme : "blue", liveN = L.filter((x) => x.on).length;
  const item = (x) => `<div class="card tk-row ${x.on ? "" : "tk-off"}" style="${x.on ? "" : "opacity:.72"}">
    <div class="row" style="gap:8px;flex-wrap:wrap">${tag(x.on ? t("Live") : t("Hidden"), x.on ? "ok" : "gold")}${x.c ? `<span class="mut sm">${esc(ago(x.c))}</span>` : ""}</div>
    <p style="margin:8px 0 10px;overflow-wrap:anywhere"><b>${esc(x.t)}</b></p>
    <div class="row" style="gap:8px;flex-wrap:wrap;justify-content:flex-end">
      ${btn(x.on ? t("Hide") : t("Show"), "tk-toggle", { arg: x.id, sm: true, ic: x.on ? "eyeoff" : "eye" })}
      ${btn(t("Edit"), "tk-edit", { arg: x.id, sm: true, ic: "edit" })}
      ${btn(t("Delete"), "tk-del", { arg: x.id, sm: true, kind: "bad", ic: "trash" })}</div></div>`;
  return `<form class="card stack-s" data-submit="tk-save"><h3>${esc(ed ? t("Edit notice") : t("New notice"))}</h3>
    ${textarea("t", { label: t("Notice text"), rows: 3, value: ed ? ed.t : "", placeholder: t("Example: Class 10 exam starts on 20 November.") })}
    <small class="mut">${esc(t("Up to {n} characters. It scrolls at the top of every screen, for everybody.", { n: MAX_TEXT }))}</small>
    <label class="check"><span>${esc(t("Show on the ticker (Live)"))}</span><input type="checkbox" name="on" ${!ed || ed.on ? "checked" : ""}></label>
    <div class="row" style="gap:8px;flex-wrap:wrap"><button class="btn btn--pri" type="submit">${icon(ed ? "check" : "send")}${esc(ed ? t("Update") : t("Publish"))}</button>${ed ? btn(t("Cancel"), "tk-cancel") : ""}</div></form>
  <section class="card mt stack-s"><h3>${esc(t("Look of the ticker"))}</h3>
    <div class="fld"><span>${esc(t("Scroll speed"))}</span>${chips(Object.keys(SPEEDS).map((k) => ({ k, label: t(SPEED_L[k]) })), sp, "tk-speed")}</div>
    <div class="fld"><span>${esc(t("Bar colour"))}</span><div class="chips" role="tablist">${THEMES.map((k) => `<button type="button" class="chip ${k === th ? "on" : ""}" data-act="tk-theme" data-arg="${k}" role="tab" aria-selected="${k === th}"><i style="display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:6px;background:${THEME_C[k]}"></i>${esc(t(THEME_L[k]))}</button>`).join("")}</div></div>
    <small class="mut">${esc(t("The ticker at the top of this screen shows the change at once."))}</small></section>
  <div class="mt">${card(t("Published notices"), L.length ? `<div class="stack-s">${L.map(item).join("")}</div>` : empty(t("No notices yet. Write one above and press Publish."), "inbox"), { right: tag(t("{n} notices, {m} live", { n: L.length, m: liveN }), "info") })}</div>
  <p class="mut sm mt">${esc(t("Notices sent to a class also run here for that class's students, for 30 days."))}</p>`;
}, { title: "News ticker" });
onSubmit("tk-save", async (b) => {
  const f = formData(b.closest("form")), text = String(f.t || "").trim().replace(/\s+/g, " ").slice(0, MAX_TEXT), st = pageState("tk");
  if (!text) return toast(t("Write the notice first."), "bad");
  const L = noticeList();
  if (st.edit && L.some((x) => x.id === st.edit)) {
    await saveTicker({ ticker: L.map((x) => (x.id === st.edit ? { ...x, t: text, on: !!f.on } : x)) });
    toast(t("Notice updated."), "ok");
  } else {
    if (L.length >= MAX_NOTICES) return toast(t("There are {n} notices already. Delete an old one first.", { n: MAX_NOTICES }), "bad");
    await saveTicker({ ticker: [{ id: tkUid(), t: text, on: !!f.on, c: Date.now() }, ...L] });
    toast(t("Notice published."), "ok");
  }
  st.edit = null; refresh();
});
act("tk-edit", (el) => { pageState("tk").edit = el.dataset.arg; refresh(); window.scrollTo({ top: 0, behavior: "smooth" }); });
act("tk-cancel", () => { pageState("tk").edit = null; refresh(); });
act("tk-toggle", async (el) => {
  const L = noticeList(), x = L.find((n) => n.id === el.dataset.arg); if (!x) return;
  await saveTicker({ ticker: L.map((n) => (n.id === x.id ? { ...n, on: !n.on } : n)) });
  toast(x.on ? t("Hidden from the ticker.") : t("Live on the ticker."), "ok"); refresh();
});
act("tk-del", async (el) => {
  const L = noticeList(), x = L.find((n) => n.id === el.dataset.arg); if (!x) return;
  if (!(await ask(t("It will be removed from the ticker for good."), { title: t("Delete this notice?"), ok: t("Yes, delete"), danger: true }))) return;
  await saveTicker({ ticker: L.filter((n) => n.id !== x.id) });
  const st = pageState("tk"); if (st.edit === x.id) st.edit = null;
  toast(t("Notice deleted."), "ok"); refresh();
});
act("tk-speed", async (el) => { if (!SPEEDS[el.dataset.arg]) return; await saveTicker({ tkSpeed: el.dataset.arg }); toast(t("Speed changed."), "ok"); refresh(); });
act("tk-theme", async (el) => { if (!THEMES.includes(el.dataset.arg)) return; await saveTicker({ tkTheme: el.dataset.arg }); toast(t("Colour changed."), "ok"); refresh(); });

// ================= settings (admin) =================
page("settings", async () => {
  const m = await mailCfg(), I = S.INST, A = await aiConfig(true);
  return `<form class="card stack-s" data-submit="st-inst"><h3>${esc(t("Institute"))}</h3>
    ${input("name", { label: t("Institute name"), value: I.name || "Rise Edge Academy", maxlength: "80" })}
    ${input("tag", { label: t("Tagline (shown on the ID card)"), value: I.tag || "", maxlength: "80" })}
    ${input("owner", { label: t("Owner / principal name"), value: I.owner || "", maxlength: "80" })}
    ${input("phone", { label: t("Phone"), value: I.phone || "", type: "tel" })}
    ${input("addr", { label: t("Address"), value: I.addr || "", maxlength: "200" })}
    <button class="btn btn--pri" type="submit">${icon("check")}${esc(t("Save"))}</button></form>
  <form class="card stack-s mt" data-submit="st-ai"><h3>${esc(t("AI study assistant"))}</h3>
    <p class="mut sm">${esc(t("Students always have the built-in study helper (plan, weak subjects, attendance, tips). Turn the AI on to let them ask any study question. It uses Google Gemini; the free plan has daily limits. The simple way needs only a Gemini API key."))}</p>
    ${select("on", [["0", t("Off")], ["1", t("On")]], A.on ? "1" : "0", { label: t("AI chat") })}
    ${input("gk", { label: t("Gemini API key (the simple way)"), value: A.gk, type: "password", autocomplete: "off", placeholder: "AQ... or AIza...", hint: t("From aistudio.google.com/apikey. If you fill this in, the Web app ID and the site key below are not needed.") })}
    <p class="mut sm">${esc(t("Or the Firebase way (more steps, the key stays hidden):"))}</p>
    ${input("appId", { label: t("Web app ID"), value: A.appId, placeholder: "1:1234567890:web:abcdef", hint: t("The App ID of the Web app of this Firebase project (not the Android one).") })}
    ${input("key", { label: t("reCAPTCHA Enterprise site key"), value: A.key, hint: t("The score-based website key made in Google Cloud > Fraud Defense (reCAPTCHA Enterprise). It must be the same key registered in Firebase Console > App Check.") })}
    ${input("model", { label: t("Model"), value: A.model, hint: t("Leave it as it is unless Google renames the model.") })}
    ${input("lim", { label: t("Messages per student per day"), type: "number", value: A.lim, min: "1", max: "200" })}
    <div class="row"><button class="btn btn--pri" type="submit">${icon("check")}${esc(t("Save"))}</button>${btn(t("Test the AI"), "st-ai-test", { ic: "spark" })}</div>
    <details><summary><b>${esc(t("How to set it up (once)"))}</b></summary>
      <p class="sm"><b>${esc(t("The simple way (2 minutes)"))}</b></p>
      <ol class="sm">
        <li>${esc(t("Open aistudio.google.com/apikey, sign in with Google and press Create API key."))}</li>
        <li>${esc(t("Google Cloud > APIs & Services > Credentials > open that key: under Website restrictions add {host}/* , and under API restrictions choose Generative Language API. Do not turn on billing for the project.", { host: location.hostname }))}</li>
        <li>${esc(t("Paste the key in Gemini API key, set AI chat to On, press Save, then Test the AI. Everybody who is signed in to this app can read the key from the database, so use a key made only for this."))}</li>
      </ol>
      <p class="sm"><b>${esc(t("The Firebase way (App Check)"))}</b></p>
      <ol class="sm">
        <li>${esc(t("Firebase Console > Project settings > Your apps: add a Web app (</>) if there is none, and copy its App ID."))}</li>
        <li>${esc(t("Firebase Console > Build > AI Logic > Get started: choose the Gemini Developer API (it has a free plan)."))}</li>
        <li>${esc(t("Google Cloud > Fraud Defense (formerly reCAPTCHA Enterprise): make a score-based key of type Web with your site's domain (for example riseedgecom-official.github.io, without https://). In Firebase Console > App Check > Apps, register the Web app with Fraud Defense (reCAPTCHA Enterprise) and that same key, then paste the key in the field above."))}</li>
        <li>${esc(t("Google Cloud > APIs & Services > Credentials: open your browser API key and, if it is restricted, allow the Firebase AI Logic API."))}</li>
        <li>${esc(t("Paste the App ID and the site key here, set AI chat to On, press Save, then Test the AI."))}</li>
      </ol></details></form>
  <form class="card stack-s mt" data-submit="st-mail"><h3>${esc(t("Email (EmailJS)"))}</h3>
    <p class="mut sm">${esc(t("Optional and free. It sends absent alerts and results to guardians' emails. See the README for the 5-minute setup."))}</p>
    ${input("pk", { label: t("Public key"), value: m.pk || "" })}${input("sid", { label: t("Service ID"), value: m.sid || "" })}${input("t2", { label: t("Template ID"), value: m.t2 || "", hint: t("The template uses {{to_email}}, {{to_name}}, {{subject}}, {{message}}.") })}
    <div class="row"><button class="btn btn--pri" type="submit">${icon("check")}${esc(t("Save"))}</button>${btn(t("Send test email"), "st-test", { ic: "mail" })}</div></form>`;
}, { title: "Settings" });
onSubmit("st-inst", async (b) => {
  const f = formData(b.closest("form"));
  if (!f.name.trim()) return toast(t("Enter the institute name"), "bad");
  await saveInst({ name: f.name.trim(), tag: f.tag.trim(), owner: f.owner.trim(), phone: f.phone.trim(), addr: f.addr.trim() });
  window.dispatchEvent(new Event("rise-me"));
  toast(t("Saved"), "ok");
});
const aiForm = (b) => { const f = formData(b.closest("form")); return { on: f.on === "1", gk: String(f.gk || "").trim(), appId: String(f.appId || "").trim(), key: String(f.key || "").trim(), model: String(f.model || "").trim() || DEFAULT_MODEL, lim: Math.max(1, Math.min(200, Math.round(+f.lim) || DEFAULT_LIMIT)) }; };
onSubmit("st-ai", async (b) => {
  const c = aiForm(b);
  if (c.on && !c.gk && (!c.appId || !c.key)) return toast(t("Fill in the Gemini API key, or the Web app ID and the site key, before turning the AI on."), "bad");
  if (c.gk && !/^[\w.-]{20,300}$/.test(c.gk)) return toast(t("The Gemini API key looks wrong: it is one long word with no spaces (it starts with AIza or AQ.)."), "bad");
  if (c.gk && (await rulesCurrent()) !== true) return toast(t("First publish the latest firestore.rules (Firebase Console > Firestore Database > Rules), so the key is not readable by visitors who are not signed in."), "bad");
  if (c.appId && !/^\d+:\d+:web:[0-9a-f]+$/i.test(c.appId)) return toast(t("The Web app ID looks like 1:1234567890:web:abcdef. An Android ID cannot be used."), "bad");
  await db.set("config/ai", c);
  dropAiConfig();
  toast(t("Saved"), "ok");
});
act("st-ai-test", async (b) => {
  const c = aiForm(b);
  if (!c.gk && (!c.appId || !c.key)) return toast(t("Fill in the Gemini API key, or the Web app ID and the site key, before turning the AI on."), "bad");
  toast(t("Testing... this can take a few seconds."));
  const r = await testAI(c);
  const why = { quota: t("The daily limit is reached or Google says too many requests."), setup: t("Setup problem: check the Web app ID, the site key, App Check and the API key (see the steps above)."), net: t("The AI could not be reached (internet?)."), blocked: t("The AI refused to answer."), other: t("Something else went wrong.") };
  await info(r.ok ? t("It works. The AI answered: {x}", { x: r.text.slice(0, 80) }) : (appCheckText(r.hint, location.hostname) || why[r.problem] || why.other) + "\n\n" + r.detail, r.ok ? t("AI test passed") : t("AI test failed"));
});
onSubmit("st-mail", async (b) => {
  const f = formData(b.closest("form"));
  await db.set("config/mail", { pk: f.pk.trim(), sid: f.sid.trim(), t2: f.t2.trim() });
  toast(t("Saved"), "ok");
});
act("st-test", async () => {
  const to = S.me.email;
  if (!to) return toast(t("Your profile has no email address."), "bad");
  const r = await sendMail(to, S.me.name, t("Test email"), t("This is a test email from {n}.", { n: instName() }));
  toast(r || t("Email sent"), r ? "bad" : "ok");
});

addBN({
  "Your login ID is {a}, but the admin's ID is {b}.": "আপনার লগইন আইডি {a}, কিন্তু অ্যাডমিনের আইডি {b}।", "Make my ID {b}": "আমার আইডি {b} করুন", "Change my ID": "আইডি বদলান", "Change ID": "আইডি বদলান",
  "Your ID is already {b}": "আপনার আইডি আগে থেকেই {b}", "Your ID is now {b}": "আপনার আইডি এখন {b}",
  "{n} has {b} now. You and {n} swap IDs: you get {b}, {n} gets {a}. Both of you sign in with the new ID from now on.": "{b} এখন {n}-এর কাছে আছে। আপনি আর {n} আইডি অদলবদল করবেন: আপনি {b} পাবেন, {n} পাবেন {a}। এখন থেকে দুজনেই নতুন আইডি দিয়ে লগইন করবেন।",
  "Your login ID changes from {a} to {b}. Sign in with {b} from now on.": "আপনার লগইন আইডি {a} থেকে বদলে {b} হবে। এখন থেকে {b} দিয়ে লগইন করবেন।",
  "Only the main admin can do this.": "শুধু প্রধান অ্যাডমিন এটা করতে পারেন।", "The change could not be confirmed. Reload the page.": "পরিবর্তনটা নিশ্চিত করা যায়নি। পেজ রিলোড করুন।", "Your login ID is now {id}.": "আপনার লগইন আইডি এখন {id}।",
  "Scan to verify": "যাচাই করতে স্ক্যান করুন",
  "ADMIN ID CARD": "অ্যাডমিন আইডি কার্ড", "STUDENT ID CARD": "ছাত্র আইডি কার্ড", "TEACHER ID CARD": "শিক্ষক আইডি কার্ড", "Roll": "রোল", "Class": "ক্লাস", "Batch": "ব্যাচ", "Guardian Name": "অভিভাবকের নাম", "Guardian Phone": "অভিভাবকের ফোন", "ID": "আইডি", "Blood group": "রক্তের গ্রুপ", "Session": "সেশন",
  "This card is the property of {n}. It must be shown when asked.": "এই কার্ডটি {n} এর সম্পত্তি। চাইলে দেখাতে হবে।", "If found, please return it to the academy.": "পাওয়া গেলে দয়া করে একাডেমিতে ফেরত দিন।", "Phone": "ফোন", "Authorized signature": "অনুমোদিত স্বাক্ষর",
  "No students.": "কোনো ছাত্র নেই।", "Print / Save PDF": "প্রিন্ট / PDF সেভ", "Students": "ছাত্র", "Teachers": "শিক্ষক", "ID card": "আইডি কার্ড", "No teacher yet.": "এখনো কোনো শিক্ষক নেই।", "My ID card": "আমার আইডি কার্ড", "Print all cards of this batch": "এই ব্যাচের সব কার্ড প্রিন্ট করুন", "No students in this batch.": "এই ব্যাচে কোনো ছাত্র নেই।",
  "Login ID": "লগইন আইডি", "Role": "ভূমিকা", "School / college": "স্কুল / কলেজ", "Subject": "বিষয়", "Email": "ইমেইল", "Waiting for admin approval": "অ্যাডমিনের অনুমোদনের অপেক্ষায়", "Your account is created. The admin or a co-admin must approve it before you can open the other pages.": "আপনার অ্যাকাউন্ট তৈরি হয়েছে। অন্য পেজ খোলার আগে অ্যাডমিন বা কো-অ্যাডমিনকে অনুমোদন দিতে হবে।",
  "Change photo": "ছবি বদলান", "My information": "আমার তথ্য", "Address": "ঠিকানা", "Guardian's phone": "অভিভাবকের ফোন", "Guardian's email": "অভিভাবকের ইমেইল", "Edit": "সম্পাদনা", "Account": "অ্যাকাউন্ট", "Change password": "পাসওয়ার্ড বদলান", "Logout": "লগআউট", "Saved": "সংরক্ষিত", "Name": "নাম",
  "Enter your full name.": "পুরো নাম দিন।", "Enter a valid phone number (01XXXXXXXXX).": "সঠিক ফোন নম্বর দিন (01XXXXXXXXX)।", "Enter a valid guardian phone number (01XXXXXXXXX).": "অভিভাবকের সঠিক ফোন নম্বর দিন (01XXXXXXXXX)।", "The guardian email looks wrong.": "অভিভাবকের ইমেইলটি ঠিক মনে হচ্ছে না।",
  "Notice": "নোটিশ", "Hover to pause": "হোভার করলে থামবে", "Live": "চালু", "Hidden": "লুকানো", "Hide": "লুকাও", "Edit notice": "নোটিশ সম্পাদনা", "New notice": "নতুন নোটিশ", "Notice text": "নোটিশের লেখা", "Example: Class 10 exam starts on 20 November.": "যেমন: দশম শ্রেণির পরীক্ষা ২০ নভেম্বর থেকে শুরু।", "Up to {n} characters. It scrolls at the top of every screen, for everybody.": "সর্বোচ্চ {n} অক্ষর। এটি সবার স্ক্রিনের উপরে চলতে থাকবে।", "Show on the ticker (Live)": "টিকারে দেখাও (চালু)", "Update": "আপডেট", "Look of the ticker": "টিকারের চেহারা", "Scroll speed": "চলার গতি", "Slow": "ধীর", "Normal": "স্বাভাবিক", "Fast": "দ্রুত", "Bar colour": "বারের রং", "Blue": "নীল", "Red": "লাল", "Green": "সবুজ", "Dark": "ডার্ক", "The ticker at the top of this screen shows the change at once.": "এই স্ক্রিনের উপরের টিকারে পরিবর্তন সাথে সাথেই দেখা যাবে।", "Published notices": "প্রকাশিত নোটিশ", "No notices yet. Write one above and press Publish.": "এখনো কোনো নোটিশ নেই। উপরে লিখে প্রকাশ করো।", "{n} notices, {m} live": "{n}টি নোটিশ, {m}টি চালু", "Notices sent to a class also run here for that class's students, for 30 days.": "ক্লাসে পাঠানো নোটিশও সেই ক্লাসের শিক্ষার্থীদের জন্য ৩০ দিন এখানে চলে।", "Write the notice first.": "আগে নোটিশটি লেখো।", "Notice updated.": "নোটিশ আপডেট হয়েছে।", "There are {n} notices already. Delete an old one first.": "ইতিমধ্যে {n}টি নোটিশ আছে। আগে একটি পুরনো নোটিশ মুছে ফেলো।", "Notice published.": "নোটিশ প্রকাশিত হয়েছে।", "Hidden from the ticker.": "টিকার থেকে লুকানো হয়েছে।", "Live on the ticker.": "টিকারে চালু হয়েছে।", "It will be removed from the ticker for good.": "এটি টিকার থেকে স্থায়ীভাবে মুছে যাবে।", "Delete this notice?": "নোটিশটি মুছবে?", "Yes, delete": "হ্যাঁ, মুছো", "Notice deleted.": "নোটিশ মুছে ফেলা হয়েছে।", "Speed changed.": "গতি বদলানো হয়েছে।", "Colour changed.": "রং বদলানো হয়েছে।",
  "Gemini API key (the simple way)": "Gemini API key (সহজ উপায়)", "From aistudio.google.com/apikey. If you fill this in, the Web app ID and the site key below are not needed.": "aistudio.google.com/apikey থেকে নিন। এটি দিলে নিচের Web app ID ও সাইট কী লাগবে না।", "Or the Firebase way (more steps, the key stays hidden):": "অথবা Firebase উপায় (ধাপ বেশি, কী লুকানো থাকে):", "The simple way (2 minutes)": "সহজ উপায় (২ মিনিট)", "Open aistudio.google.com/apikey, sign in with Google and press Create API key.": "aistudio.google.com/apikey খুলুন, Google দিয়ে সাইন ইন করে Create API key চাপুন।", "Google Cloud > APIs & Services > Credentials > open that key: under Website restrictions add {host}/* , and under API restrictions choose Generative Language API. Do not turn on billing for the project.": "Google Cloud > APIs & Services > Credentials > ওই কী খুলুন: Website restrictions এ {host}/* যোগ করুন, আর API restrictions এ Generative Language API বাছুন। প্রজেক্টে billing চালু করবেন না।", "Paste the key in Gemini API key, set AI chat to On, press Save, then Test the AI. Everybody who is signed in to this app can read the key from the database, so use a key made only for this.": "কীটি Gemini API key ঘরে বসান, AI chat On করুন, Save চেপে Test the AI চাপুন। এই অ্যাপে সাইন ইন করা সবাই ডাটাবেস থেকে কীটি পড়তে পারে, তাই শুধু এই কাজের জন্য আলাদা কী বানান।", "The Firebase way (App Check)": "Firebase উপায় (App Check)", "Fill in the Gemini API key, or the Web app ID and the site key, before turning the AI on.": "এআই চালু করার আগে Gemini API key, অথবা Web app ID ও সাইট কী দিন।", "The Gemini API key looks wrong: it is one long word with no spaces (it starts with AIza or AQ.).": "Gemini API key ঠিক মনে হচ্ছে না: এটি ফাঁকা ছাড়া একটি লম্বা শব্দ (AIza বা AQ. দিয়ে শুরু)।", "First publish the latest firestore.rules (Firebase Console > Firestore Database > Rules), so the key is not readable by visitors who are not signed in.": "আগে সর্বশেষ firestore.rules পাবলিশ করুন (Firebase Console > Firestore Database > Rules), যাতে সাইন ইন না করা কেউ কীটি পড়তে না পারে।",
  "Current password": "বর্তমান পাসওয়ার্ড", "Institute": "প্রতিষ্ঠান", "News ticker": "সংবাদ টিকার", "AI study assistant": "এআই পড়ার সহকারী", "Students always have the built-in study helper (plan, weak subjects, attendance, tips). Turn the AI on to let them ask any study question. It uses Google Gemini; the free plan has daily limits. The simple way needs only a Gemini API key.": "শিক্ষার্থীরা সবসময় বিল্ট-ইন পড়ার সহকারী পায় (পরিকল্পনা, দুর্বল বিষয়, উপস্থিতি, টিপস)। এআই চালু করলে তারা পড়াশোনার যেকোনো প্রশ্ন করতে পারবে। এটি Google Gemini ব্যবহার করে; ফ্রি প্ল্যানে দৈনিক সীমা আছে। সহজ উপায়ে শুধু একটি Gemini API key লাগে।", "Off": "বন্ধ", "On": "চালু", "AI chat": "এআই চ্যাট", "Web app ID": "ওয়েব অ্যাপ আইডি", "The App ID of the Web app of this Firebase project (not the Android one).": "এই Firebase প্রজেক্টের Web অ্যাপের App ID (Android এরটা নয়)।", "reCAPTCHA Enterprise site key": "reCAPTCHA Enterprise সাইট কী", "The score-based website key made in Google Cloud > Fraud Defense (reCAPTCHA Enterprise). It must be the same key registered in Firebase Console > App Check.": "Google Cloud > Fraud Defense (reCAPTCHA Enterprise) এ বানানো score-based ওয়েবসাইট কী। Firebase Console > App Check এ যে কী রেজিস্টার করা, এখানেও সেই একই কী হতে হবে।", "Model": "মডেল", "Leave it as it is unless Google renames the model.": "Google মডেলের নাম না বদলালে যেমন আছে তেমন রাখুন।", "Messages per student per day": "প্রতি শিক্ষার্থীর দৈনিক বার্তা", "Test the AI": "এআই পরীক্ষা করুন", "How to set it up (once)": "কীভাবে চালু করবেন (একবারই)",
  "Firebase Console > Project settings > Your apps: add a Web app (</>) if there is none, and copy its App ID.": "Firebase Console > Project settings > Your apps: Web অ্যাপ (</>) না থাকলে যোগ করুন, আর তার App ID কপি করুন।", "Firebase Console > Build > AI Logic > Get started: choose the Gemini Developer API (it has a free plan).": "Firebase Console > Build > AI Logic > Get started: Gemini Developer API বাছাই করুন (এতে ফ্রি প্ল্যান আছে)।", "Google Cloud > Fraud Defense (formerly reCAPTCHA Enterprise): make a score-based key of type Web with your site's domain (for example riseedgecom-official.github.io, without https://). In Firebase Console > App Check > Apps, register the Web app with Fraud Defense (reCAPTCHA Enterprise) and that same key, then paste the key in the field above.": "Google Cloud > Fraud Defense (আগের নাম reCAPTCHA Enterprise): আপনার সাইটের ডোমেইন (যেমন riseedgecom-official.github.io, https:// ছাড়া) দিয়ে Web ধরনের একটি score-based কী বানান। Firebase Console > App Check > Apps এ Web অ্যাপটি Fraud Defense (reCAPTCHA Enterprise) ও ওই একই কী দিয়ে রেজিস্টার করুন, তারপর কীটি ওপরের ঘরে বসান।", "Google Cloud > APIs & Services > Credentials: open your browser API key and, if it is restricted, allow the Firebase AI Logic API.": "Google Cloud > APIs & Services > Credentials: ব্রাউজার API কী খুলুন, আর সীমাবদ্ধ থাকলে Firebase AI Logic API অনুমতি দিন।", "Paste the App ID and the site key here, set AI chat to On, press Save, then Test the AI.": "App ID আর সাইট কী এখানে বসান, এআই চ্যাট চালু করুন, সংরক্ষণ চাপুন, তারপর এআই পরীক্ষা করুন।", "Fill in the Web app ID and the site key before turning the AI on.": "এআই চালু করার আগে Web অ্যাপ আইডি আর সাইট কী পূরণ করুন।", "The Web app ID looks like 1:1234567890:web:abcdef. An Android ID cannot be used.": "Web অ্যাপ আইডি দেখতে 1:1234567890:web:abcdef এর মতো। Android আইডি চলবে না।", "Testing... this can take a few seconds.": "পরীক্ষা চলছে... কয়েক সেকেন্ড লাগতে পারে।", "The daily limit is reached or Google says too many requests.": "দৈনিক সীমা শেষ, অথবা Google বলছে অনেক বেশি অনুরোধ।", "Setup problem: check the Web app ID, the site key, App Check and the API key (see the steps above).": "সেটআপে সমস্যা: Web অ্যাপ আইডি, সাইট কী, App Check আর API কী দেখুন (ওপরের ধাপগুলো দেখুন)।", "The AI could not be reached (internet?).": "এআই এর সাথে যোগাযোগ করা যায়নি (ইন্টারনেট?)।", "The AI refused to answer.": "এআই উত্তর দিতে রাজি হয়নি।", "Something else went wrong.": "অন্য কোনো সমস্যা হয়েছে।", "It works. The AI answered: {x}": "কাজ করছে। এআই উত্তর দিয়েছে: {x}", "AI test passed": "এআই পরীক্ষা সফল", "AI test failed": "এআই পরীক্ষা ব্যর্থ", "News": "খবর", "Welcome to {n}": "{n} এ স্বাগতম", "Institute name": "প্রতিষ্ঠানের নাম", "Tagline (shown on the ID card)": "ট্যাগলাইন (আইডি কার্ডে দেখাবে)", "Owner / principal name": "মালিক / অধ্যক্ষের নাম", "Email (EmailJS)": "ইমেইল (EmailJS)",
  "Optional and free. It sends absent alerts and results to guardians' emails. See the README for the 5-minute setup.": "ঐচ্ছিক ও বিনামূল্যে। অভিভাবকের ইমেইলে অনুপস্থিতির বার্তা ও ফল পাঠায়। ৫ মিনিটের সেটআপ README তে আছে।", "Public key": "পাবলিক কি", "Service ID": "সার্ভিস আইডি", "Template ID": "টেমপ্লেট আইডি",
  "The template uses {{to_email}}, {{to_name}}, {{subject}}, {{message}}.": "টেমপ্লেটে {{to_email}}, {{to_name}}, {{subject}}, {{message}} ব্যবহার করুন।", "Send test email": "টেস্ট ইমেইল পাঠান", "Enter the institute name": "প্রতিষ্ঠানের নাম দিন", "Your profile has no email address.": "আপনার প্রোফাইলে ইমেইল ঠিকানা নেই।",
  "Test email": "টেস্ট ইমেইল", "This is a test email from {n}.": "এটি {n} থেকে একটি টেস্ট ইমেইল।", "Email sent": "ইমেইল পাঠানো হয়েছে", "Student": "ছাত্র", "Teacher": "শিক্ষক", "Admin": "অ্যাডমিন", "Co-admin": "কো-অ্যাডমিন", "Save": "সংরক্ষণ",
});
