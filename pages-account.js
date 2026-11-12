// Profile, ID cards (new design, with QR) and the admin's settings.
import { db } from "./lib-db.js";
import { changePassword, dbError } from "./lib-db.js";
import {
  S, esc, t, page, act, onChange, onSubmit, formData, pageState, refresh, isStaff, isAdmin, isTeacher, isStudent, instName, addBN, batchOf, activeStudents, isEmail, cmp,
} from "./lib-core.js";
import { icon, avatar, tag, empty, notice, card, row, btn, chips, input, textarea, select, batchPicker, form, toast, showDoc, ask } from "./lib-ui.js";
import { reloadMe, saveInst, squarePhoto, mailCfg, sendMail, adminIdPlan, claimAdminId } from "./lib-svc.js";
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

// ================= settings (admin) =================
page("settings", async () => {
  const m = await mailCfg(), I = S.INST;
  return `<form class="card stack-s" data-submit="st-inst"><h3>${esc(t("Institute"))}</h3>
    ${input("name", { label: t("Institute name"), value: I.name || "Rise Edge Academy", maxlength: "80" })}
    ${input("tag", { label: t("Tagline (shown on the ID card)"), value: I.tag || "", maxlength: "80" })}
    ${input("owner", { label: t("Owner / principal name"), value: I.owner || "", maxlength: "80" })}
    ${input("phone", { label: t("Phone"), value: I.phone || "", type: "tel" })}
    ${input("addr", { label: t("Address"), value: I.addr || "", maxlength: "200" })}
    <button class="btn btn--pri" type="submit">${icon("check")}${esc(t("Save"))}</button></form>
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
  "Current password": "বর্তমান পাসওয়ার্ড", "Institute": "প্রতিষ্ঠান", "Institute name": "প্রতিষ্ঠানের নাম", "Tagline (shown on the ID card)": "ট্যাগলাইন (আইডি কার্ডে দেখাবে)", "Owner / principal name": "মালিক / অধ্যক্ষের নাম", "Email (EmailJS)": "ইমেইল (EmailJS)",
  "Optional and free. It sends absent alerts and results to guardians' emails. See the README for the 5-minute setup.": "ঐচ্ছিক ও বিনামূল্যে। অভিভাবকের ইমেইলে অনুপস্থিতির বার্তা ও ফল পাঠায়। ৫ মিনিটের সেটআপ README তে আছে।", "Public key": "পাবলিক কি", "Service ID": "সার্ভিস আইডি", "Template ID": "টেমপ্লেট আইডি",
  "The template uses {{to_email}}, {{to_name}}, {{subject}}, {{message}}.": "টেমপ্লেটে {{to_email}}, {{to_name}}, {{subject}}, {{message}} ব্যবহার করুন।", "Send test email": "টেস্ট ইমেইল পাঠান", "Enter the institute name": "প্রতিষ্ঠানের নাম দিন", "Your profile has no email address.": "আপনার প্রোফাইলে ইমেইল ঠিকানা নেই।",
  "Test email": "টেস্ট ইমেইল", "This is a test email from {n}.": "এটি {n} থেকে একটি টেস্ট ইমেইল।", "Email sent": "ইমেইল পাঠানো হয়েছে", "Student": "ছাত্র", "Teacher": "শিক্ষক", "Admin": "অ্যাডমিন", "Co-admin": "কো-অ্যাডমিন", "Save": "সংরক্ষণ",
});
