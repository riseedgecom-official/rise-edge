// Profile, ID cards (new design, with QR) and the admin's settings.
import { db } from "./lib-db.js";
import { changePassword, dbError } from "./lib-db.js";
import {
  S, esc, t, page, act, onChange, onSubmit, formData, pageState, refresh, isStaff, isAdmin, isTeacher, isStudent, instName, addBN, batchOf, activeStudents, isEmail, cmp,
} from "./lib-core.js";
import { icon, avatar, tag, empty, notice, card, row, btn, chips, input, textarea, select, batchPicker, form, toast, showDoc } from "./lib-ui.js";
import { reloadMe, saveInst, squarePhoto, mailCfg, sendMail } from "./lib-svc.js";
import { qrSvg } from "./lib-qr.js";

const BLOOD = ["", "A+", "A-", "B+", "B-", "O+", "O-", "AB+", "AB-"];
const phoneOk = (v) => !v || /^01\d{9}$/.test(String(v).replace(/[\s-]/g, ""));
const roleName = (u) => (u.role === "student" ? t("Student") : u.role === "admin" ? t("Admin") : u.ca ? t("Co-admin") : t("Teacher"));

// ================= ID card =================
const clsText = (u) => {
  const b = batchOf(u.bid) || {}, c = u.cls || b.cls, g = u.grp || b.grp;
  return c ? t("Class {n}", { n: c }) + (g ? " · " + t(g) : "") : "–";
};
function frontHtml(u) {
  const st = u.role === "student", b = batchOf(u.bid) || {};
  const rows = st
    ? [[t("Name"), u.name], [t("Roll"), u.roll], [t("Class"), clsText(u)], [t("Batch"), b.name || "–"], [t("Guardian Name"), u.gname || "–"], [t("Guardian Phone"), u.gphone || "–"]]
    : [[t("Name"), u.name], [t("ID"), u.roll], [t("Subject"), u.subject || "–"], [t("Phone"), u.phone || "–"], [t("Blood group"), u.bg || "–"]];
  const yr = (String(u.roll || "").match(/-(\d{4})-/) || [])[1] || "";
  return `<div class="idc"><div class="idc-frame"><i></i><i></i><i></i><i></i></div><div class="idc-in">
    <img class="idc-logo" src="logo.jpg" alt="">
    <div class="idc-name">${esc(instName().toUpperCase())}</div>
    <div class="idc-tag">${esc(S.INST.tag || t("Student, teacher and admin portal"))}</div>
    <div class="idc-role">${esc(st ? t("STUDENT ID CARD") : t("TEACHER ID CARD"))}</div>
    <div class="idc-main"><div class="idc-l"><div class="idc-photo">${u.pic ? `<img src="${esc(u.pic)}" alt="">` : esc([...(u.name || "?")][0])}</div><div class="idc-qr">${qrSvg(u.roll || u.id, { margin: 0 })}</div></div>
      <div class="idc-r">${rows.map(([l, v]) => `<div class="idc-f"><small>${esc(l)}</small><b>${esc(v)}</b></div>`).join("")}</div></div>
    <div class="idc-foot"><span>${esc(S.INST.phone || "")}</span><span>${esc(yr ? t("Session") + " " + yr : "")}</span></div></div></div>`;
}
function backHtml(u) {
  return `<div class="idc idc--back"><div class="idc-frame"><i></i><i></i><i></i><i></i></div><div class="idc-in">
    <img class="idc-logo" src="logo.jpg" alt="" style="align-self:center">
    <div class="idc-name" style="align-self:center">${esc(instName().toUpperCase())}</div>
    <p>${esc(t("This card is the property of {n}. It must be shown when asked.", { n: instName() }))}</p>
    <p>${esc(t("If found, please return it to the academy."))}</p>
    ${S.INST.addr ? `<p><b>${esc(S.INST.addr)}</b></p>` : ""}${S.INST.phone ? `<p><b>${esc(t("Phone"))}: ${esc(S.INST.phone)}</b></p>` : ""}
    ${u.bg ? `<p>${esc(t("Blood group"))}: <b>${esc(u.bg)}</b></p>` : ""}
    <div style="margin-top:28px;align-self:center;border-top:1px solid #0a1636;padding-top:4px;font-size:11px;min-width:150px">${esc(S.INST.owner || t("Authorized signature"))}</div></div></div>`;
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
  if (st.k === "t" && isStaff()) {
    return `${tabs}${card(t("Teachers"), S.TC.length ? `<div class="list">${S.TC.filter((x) => x.active !== false).sort((a, b) => cmp(a.name, b.name)).map((x) => row({ av: avatar(x, 36), title: x.name, sub: esc(x.roll || ""), right: btn(t("ID card"), "id-show", { arg: x.id, sm: true, ic: "idcard" }) })).join("")}</div>` : empty(t("No teacher yet."), "cap"))}`;
  }
  const L = activeStudents().sort((a, b) => cmp(a.roll, b.roll));
  return `${tabs}${batchPicker()}${isTeacher() ? `<div class="mb">${btn(t("My ID card"), "id-show", { arg: S.pid, sm: true, ic: "idcard" })}</div>` : ""}
    ${card(t("Students") + ` (${L.length})`, L.length ? `<div class="list">${L.map((s) => row({ av: avatar(s, 36), title: s.name, sub: esc(s.roll || ""), right: btn(t("ID card"), "id-show", { arg: s.id, sm: true, ic: "idcard" }) })).join("")}</div><div class="mt">${btn(t("Print all cards of this batch"), "id-all", { ic: "print" })}</div>` : empty(t("No students in this batch."), "users"))}`;
}, { title: "ID card" });
act("id-tab", (el) => { IC().k = el.dataset.arg; refresh(); });

// ================= profile =================
page("profile", async () => {
  const u = S.me, st = u.role === "student", b = batchOf(u.bid) || {};
  const info = [[t("Login ID"), u.roll || u.email || "–"], [t("Role"), roleName(u)]];
  if (st) info.push([t("Class"), clsText(u)], [t("Batch"), b.name || "–"], [t("School / college"), u.school || "–"]);
  if (!st && u.subject) info.push([t("Subject"), u.subject]);
  if (u.email) info.push([t("Email"), u.email]);
  const pend = u.ap === false;
  return `${pend ? notice(`<b>${esc(t("Waiting for admin approval"))}</b><br>${esc(t("Your account is created. The admin or a co-admin must approve it before you can open the other pages."))}`, "warn", "clock") : ""}
  <div class="card tc"><div style="display:flex;justify-content:center">${avatar(u, 92)}</div><h2 style="margin:10px 0 2px">${esc(u.name)}</h2>${tag(roleName(u), "info")}
    <div class="mt"><label class="btn btn--sm" style="cursor:pointer">${icon("camera")}${esc(t("Change photo"))}<input type="file" accept="image/*" data-change="pf-pic" hidden></label></div></div>
  <div class="mt">${card(t("My information"), `<div class="list">${info.map(([l, v]) => row({ title: v, sub: esc(l) })).join("")}${row({ title: u.phone || "–", sub: esc(t("Phone")) })}${row({ title: u.addr || "–", sub: esc(t("Address")) })}${row({ title: u.bg || "–", sub: esc(t("Blood group")) })}${st ? row({ title: u.gname || "–", sub: esc(t("Guardian Name")) }) + row({ title: u.gphone || "–", sub: esc(t("Guardian's phone")) }) + row({ title: u.gem || "–", sub: esc(t("Guardian's email")) }) : ""}</div><div class="row mt">${btn(t("Edit"), "pf-edit", { ic: "edit" })}</div>`)}</div>
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
  "STUDENT ID CARD": "ছাত্র আইডি কার্ড", "TEACHER ID CARD": "শিক্ষক আইডি কার্ড", "Roll": "রোল", "Class": "ক্লাস", "Batch": "ব্যাচ", "Guardian Name": "অভিভাবকের নাম", "Guardian Phone": "অভিভাবকের ফোন", "ID": "আইডি", "Blood group": "রক্তের গ্রুপ", "Session": "সেশন",
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
