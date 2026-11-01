// Signed-out screens: sign in, register, forgot password, first-time setup. Also the forced
// "choose a new password" box and the "config.js is not filled" screen.
import { db, signIn, sendReset, changePassword, withNewAccount, isEmailInUse, authEmail, dbError } from "./lib-db.js";
import { S, $, esc, t, act, onSubmit, onChange, formData, lk, isEmail, addBN, instName } from "./lib-core.js";
import { icon, input, select, notice, toast, form, chips, clsOptions, grpOptions } from "./lib-ui.js";
import { loadInst, selfRegister, sendMail } from "./lib-svc.js";

const $app = () => document.getElementById("app");
let redraw = () => {};
export const authRedraw = () => redraw();

const langSw = () => `<div class="lang"><div class="langsw" role="group" aria-label="Language"><button class="${S.lang === "en" ? "on" : ""}" data-act="lang" data-arg="en">EN</button><button class="${S.lang === "bn" ? "on" : ""}" data-act="lang" data-arg="bn">বাংলা</button></div></div>`;
const art = () => `<div class="auth-art"><img src="logo.jpg" alt=""><h1>${esc(instName())}</h1><p>${esc(t("Student, teacher and admin portal"))}</p></div>`;
const frame = (inner) => `<div class="auth">${langSw()}${art()}<div class="auth-box">${inner}</div></div>`;
const pwField = (name, label, auto = "current-password") =>
  `<label class="fld"><span>${esc(label)}</span><div class="pw"><input type="password" name="${name}" autocomplete="${auto}" required><button type="button" class="btn btn--sm" data-act="pw-toggle" data-free="1">${esc(t("Show"))}</button></div></label>`;
act("pw-toggle", (el) => {
  const i = el.parentElement.querySelector("input");
  i.type = i.type === "password" ? "text" : "password";
  el.textContent = i.type === "password" ? t("Show") : t("Hide");
});
const err = (m) => { const e = $("#au-err"); if (e) { e.textContent = m || ""; e.hidden = !m; } };

// ---------- not configured ----------
export function renderNotConfigured() {
  redraw = renderNotConfigured;
  $app().innerHTML = frame(`<div class="card stack"><h2>${esc(t("Almost ready"))}</h2>
    <p>${esc(t("The app is not connected to a database yet. Open config.js on GitHub, paste the Firebase values (README, step 3) and save."))}</p>
    <a class="btn btn--pri" href="check.html">${icon("shield")}${esc(t("Open the setup check"))}</a></div>`);
}

// ---------- sign in ----------
let cap = { a: 0, b: 0 };
export async function renderLogin(msg = "") {
  redraw = () => renderLogin(msg);
  cap = { a: 2 + Math.floor(Math.random() * 8), b: 1 + Math.floor(Math.random() * 8) };
  $app().innerHTML = frame(`<form class="card stack" data-submit="login" novalidate>
    <h2>${esc(t("Sign in"))}</h2>
    ${msg ? notice(esc(msg), "warn") : ""}
    <p class="bad sm" id="au-err" hidden role="alert"></p>
    ${input("u", { label: t("Roll number or email"), autocapitalize: "none", autocomplete: "username", autocorrect: "off", spellcheck: "false" })}
    ${pwField("p", t("Password"))}
    ${input("cp", { label: t("Solve: {a} + {b} = ?", cap), inputmode: "numeric", autocomplete: "off" })}
    <button type="submit" class="btn btn--pri btn--block">${esc(t("Sign in"))}</button>
    <div class="row"><button type="button" class="btn btn--ghost btn--sm" data-act="reg-open">${esc(t("New registration"))}</button>
    <button type="button" class="btn btn--ghost btn--sm" data-act="fp-open">${esc(t("Forgot password?"))}</button>
    <button type="button" class="btn btn--ghost btn--sm" data-act="setup-open" id="setup-btn" hidden>${esc(t("First-time setup (admin only)"))}</button></div>
  </form>`);
  // the institute name and the "first-time setup" link come from public settings
  loadInst().then(() => { const h = document.querySelector(".auth-art h1"); if (h) h.textContent = instName(); }).catch(() => {});
  db.get("config/init").then((d) => { const b = $("#setup-btn"); if (!d && b) b.hidden = false; }).catch(() => {});
}
onSubmit("login", async (el) => {
  const f = formData(el.closest("form"));
  if (+String(f.cp || "").trim() !== cap.a + cap.b) return err(t("Wrong answer to the sum. Please try again."));
  const key = lk(f.u);
  if (!key || !f.p) return err(t("Enter your roll number (or email) and password."));
  err("");
  let emails = [];
  if (key.includes("@")) emails = [key];
  else {
    try { const l = await db.get("login/" + key); if (l) emails = l.es || (l.e ? [l.e] : []); } catch (e) { /* ignore */ }
    if (!emails.length) emails = [authEmail(key)];
  }
  for (const e of emails) {
    try { await signIn(e, f.p); return; }
    catch (x) {
      if (x && x.code === "auth/too-many-requests") return err(dbError(x));
      if (x && /network|api-key|operation-not-allowed|configuration/i.test(x.code || "")) return err(dbError(x));
    }
  }
  err(t("Wrong roll number / email or password. Forgot it? Use \"Forgot password?\"."));
});

// ---------- forgot password ----------
act("fp-open", async () => {
  await form(t("Forgot password?"), `${input("who", { label: t("Roll number or email"), autocapitalize: "none" })}${input("name", { label: t("Your name") })}${input("phone", { label: t("Phone number"), type: "tel", inputmode: "tel" })}`, {
    ok: t("Send request"),
    hint: t("Students and teachers: the admin will give you a new password. Admin: a reset link is sent to your email."),
    validate: (d) => (!d.who.trim() ? t("Enter your roll number or email.") : ""),
    onSave: async (d) => {
      const w = d.who.trim();
      if (isEmail(w) && !/@rise\.local$/i.test(w)) {
        try { await sendReset(w); } catch (e) { if (!/user-not-found|invalid-email/.test((e && e.code) || "")) throw e; }
        toast(t("If this email has an account, a reset link is on its way."), "ok");
        return true;
      }
      if (!d.name.trim() || !d.phone.trim()) throw new Error(t("Enter your name and phone number too."));
      await db.add("fp", { roll: w.slice(0, 30), name: d.name.trim().slice(0, 100), phone: d.phone.trim().slice(0, 30), st: "new", t: Date.now() });
      toast(t("Request sent. The admin will contact you."), "ok");
      return true;
    },
  });
});

// ---------- first-time setup ----------
act("setup-open", () => renderSetup());
function renderSetup() {
  redraw = renderSetup;
  $app().innerHTML = frame(`<form class="card stack" data-submit="setup" novalidate>
    <h2>${esc(t("First-time setup"))}</h2>
    ${notice(esc(t("This creates the main admin account. Use a real email: it is how you reset your password later.")), "info")}
    <p class="bad sm" id="au-err" hidden role="alert"></p>
    ${input("name", { label: t("Admin name") })}
    ${input("email", { label: t("Email"), type: "email", autocapitalize: "none", autocomplete: "username" })}
    ${pwField("p1", t("Password (min 6 characters)"), "new-password")}
    ${pwField("p2", t("Repeat password"), "new-password")}
    <button type="submit" class="btn btn--pri btn--block">${esc(t("Create admin"))}</button>
    <button type="button" class="btn btn--ghost btn--sm" data-act="back-login">${esc(t("Back to sign in"))}</button>
  </form>`);
}
act("back-login", () => renderLogin());
onSubmit("setup", async (el) => {
  const f = formData(el.closest("form")), name = f.name.trim(), email = f.email.trim().toLowerCase();
  if (!name) return err(t("Enter the admin name."));
  if (!isEmail(email)) return err(t("Enter a valid email."));
  if (f.p1.length < 6) return err(t("The password needs at least 6 characters."));
  if (f.p1 !== f.p2) return err(t("The two passwords are different."));
  err("");
  if (await db.get("config/init").catch(() => null)) { err(t("Setup is already done. Please sign in.")); return; }
  try {
    // the order matters: the profile first, then the "setup done" mark (the rules allow this only once)
    await withNewAccount(email, f.p1, async (uid, tdb) => {
      await tdb.set("users/" + uid, { role: "admin", name, email, active: true });
      await tdb.set("config/init", { t: Date.now() });
    });
  } catch (e) { return err(isEmailInUse(e) ? t("This email already has an account. Try signing in.") : dbError(e)); }
  await signIn(email, f.p1);
  db.set("login/" + lk(name), { es: [email] }).catch(() => {});
});

// ---------- registration ----------
let REG = null; // what the person typed so far
act("reg-open", () => { REG = REG || { role: "student" }; renderRegister(); });
async function renderRegister(review = false) {
  redraw = () => renderRegister(review);
  const r = REG;
  let closed = false;
  try { const c = await db.get("config/reg"); closed = !!c && c.open === false; } catch (e) { /* ignore */ }
  if (closed) {
    $app().innerHTML = frame(`<div class="card stack"><h2>${esc(t("New registration"))}</h2>${notice(esc(t("Registration is closed right now. Please contact the academy.")), "warn")}<button class="btn" data-act="back-login">${esc(t("Back to sign in"))}</button></div>`);
    return;
  }
  if (review) return renderReview();
  const st = r.role === "student";
  $app().innerHTML = frame(`<form class="card stack" data-submit="reg-review" novalidate>
    <h2>${esc(t("New registration"))}</h2>
    ${chips([{ k: "student", label: t("Student") }, { k: "teacher", label: t("Teacher") }], r.role, "reg-role")}
    <p class="bad sm" id="au-err" hidden role="alert"></p>
    ${input("name", { label: t("Full name"), value: r.name || "", autocomplete: "name" })}
    ${input("nick", { label: t("Nickname (optional)"), value: r.nick || "" })}
    ${st ? `${select("cls", clsOptions(), r.cls || "", { label: t("Class"), "data-change": "reg-cls" })}
      <div id="grp-box" ${+r.cls >= 9 ? "" : "hidden"}>${select("grp", grpOptions(), r.grp || "", { label: t("Group (Class 9-12)") })}</div>
      ${input("school", { label: t("School / college"), value: r.school || "" })}`
      : `${input("subject", { label: t("Subject you teach"), value: r.subject || "" })}${select("cls", clsOptions(), r.cls || "", { label: t("Class you teach (optional)") })}`}
    ${input("phone", { label: st ? t("Your phone number") : t("Phone number"), type: "tel", inputmode: "tel", value: r.phone || "", placeholder: "01XXXXXXXXX" })}
    ${st ? `${input("gphone", { label: t("Guardian's phone number"), type: "tel", inputmode: "tel", value: r.gphone || "", placeholder: "01XXXXXXXXX" })}
      ${input("gem", { label: t("Guardian's email (optional)"), type: "email", value: r.gem || "", autocapitalize: "none" })}` : ""}
    ${input("addr", { label: t("Address (optional)"), value: r.addr || "" })}
    ${input("email", { label: t("Email (optional)"), type: "email", value: r.email || "", autocapitalize: "none", hint: t("We send your login ID here.") })}
    ${pwField("pw", t("Choose a password (min 6 characters)"), "new-password")}
    ${pwField("pw2", t("Repeat password"), "new-password")}
    <button type="submit" class="btn btn--pri btn--block">${esc(t("Review"))}</button>
    <button type="button" class="btn btn--ghost btn--sm" data-act="back-login">${esc(t("Back to sign in"))}</button>
  </form>`);
}
const keep = () => { const f = $("form[data-submit]"); if (f) REG = { ...REG, ...formData(f) }; };
act("reg-role", (el) => { keep(); REG.role = el.dataset.arg; renderRegister(); });
onChange("reg-cls", (el) => { const b = $("#grp-box"); if (b) b.hidden = !(+el.value >= 9); });
const phoneOk = (p) => /^(\+?88)?01\d{9}$/.test(String(p || "").replace(/[\s-]/g, ""));
onSubmit("reg-review", (el) => {
  keep();
  const r = REG, st = r.role === "student";
  const bad = !r.name || !r.name.trim() ? t("Enter your full name.")
    : st && !r.cls ? t("Choose your class.")
    : st && +r.cls >= 9 && !r.grp ? t("Choose your group (Science / Commerce / Arts).")
    : !phoneOk(r.phone) ? t("Enter a valid phone number (01XXXXXXXXX).")
    : st && !phoneOk(r.gphone) ? t("Enter a valid guardian phone number (01XXXXXXXXX).")
    : r.email && !isEmail(r.email) ? t("The email looks wrong.")
    : st && r.gem && !isEmail(r.gem) ? t("The guardian email looks wrong.")
    : !r.pw || r.pw.length < 6 ? t("The password needs at least 6 characters.")
    : r.pw !== r.pw2 ? t("The two passwords are different.") : "";
  if (bad) return err(bad);
  renderReview();
});
function renderReview() {
  redraw = renderReview;
  const r = REG, st = r.role === "student";
  const rows = [[t("Name"), r.name], [t("Nickname"), r.nick], st ? [t("Class"), r.cls ? t("Class {n}", { n: r.cls }) + (r.grp ? " · " + t(r.grp) : "") : ""] : [t("Subject"), r.subject],
    st ? [t("School / college"), r.school] : [t("Class"), r.cls ? t("Class {n}", { n: r.cls }) : ""], [t("Phone"), r.phone], st ? [t("Guardian's phone"), r.gphone] : null, st ? [t("Guardian's email"), r.gem] : null,
    [t("Address"), r.addr], [t("Email"), r.email]].filter((x) => x && x[1]);
  $app().innerHTML = frame(`<div class="card stack"><h2>${esc(t("Check your details"))}</h2>
    <div class="list">${rows.map(([k, v]) => `<div class="item"><div class="item-b"><span class="mut">${esc(k)}</span><b>${esc(v)}</b></div></div>`).join("")}</div>
    ${notice(esc(t("After you register you get a login ID. The admin must approve your registration before everything opens.")), "info")}
    <p class="bad sm" id="au-err" hidden role="alert"></p>
    <button class="btn btn--pri btn--block" data-act="reg-send">${icon("check")}${esc(t("Confirm and register"))}</button>
    <button class="btn btn--block" data-act="reg-edit">${icon("edit")}${esc(t("Edit"))}</button></div>`);
}
act("reg-edit", () => renderRegister());
act("reg-send", async () => {
  const r = REG;
  err("");
  let out;
  try {
    out = await selfRegister({ ...r, name: r.name.trim(), nick: (r.nick || "").trim(), phone: r.phone.replace(/\s/g, ""), gphone: (r.gphone || "").replace(/\s/g, ""), email: (r.email || "").trim() });
  } catch (e) { return err(dbError(e)); }
  const em = (r.email || "").trim(), gem = (r.gem || "").trim();
  const msg = t("Welcome to {n}! Your login ID is {id}. The admin will approve your registration soon.", { n: instName(), id: out.roll });
  if (em) sendMail(em, r.name, t("Your login ID"), msg).catch(() => {});
  if (gem && r.role === "student") sendMail(gem, r.name, t("Registration received"), t("{name} registered at {n}. Login ID: {id}.", { name: r.name, n: instName(), id: out.roll })).catch(() => {});
  REG = null;
  redraw = () => {};
  $app().innerHTML = frame(`<div class="card stack tc"><div class="medal" style="margin:0 auto">${icon("check")}</div><h2>${esc(t("Registered!"))}</h2>
    <p>${esc(t("Your login ID is"))}</p><div class="b" style="font-size:26px;letter-spacing:.02em;user-select:all">${esc(out.roll)}</div>
    <p class="mut">${esc(t("Write it down. Sign in with this ID and the password you chose. You will see everything after the admin approves you."))}</p>
    <button class="btn btn--pri btn--block" data-act="back-login">${esc(t("Go to sign in"))}</button></div>`);
});

// ---------- forced new password (temporary password from the admin) ----------
export function forceNewPassword() {
  form(t("Choose your own password"), `${pwField("cur", t("Current (temporary) password"))}${pwField("n1", t("New password (min 6 characters)"), "new-password")}${pwField("n2", t("Repeat new password"), "new-password")}`, {
    ok: t("Save password"), cancel: t("Later"),
    hint: t("You are using a temporary password. Please set your own now."),
    validate: (d) => (d.n1.length < 6 ? t("The password needs at least 6 characters.") : d.n1 !== d.n2 ? t("The two passwords are different.") : d.n1 === d.cur ? t("The new password must be different.") : ""),
    onSave: async (d) => {
      try { await changePassword(d.cur, d.n1); } catch (e) { throw new Error(/wrong-password|invalid-credential/.test((e && e.code) || "") ? t("The current password is wrong.") : dbError(e)); }
      await db.upd("users/" + S.pid, { mustChange: false });
      S.me.mustChange = false;
      toast(t("Password changed."), "ok");
    },
  });
}

addBN({
  "Student, teacher and admin portal": "ছাত্র, শিক্ষক ও অ্যাডমিন পোর্টাল", "Almost ready": "প্রায় তৈরি",
  "The app is not connected to a database yet. Open config.js on GitHub, paste the Firebase values (README, step 3) and save.": "অ্যাপ এখনো ডাটাবেসের সাথে যুক্ত হয়নি। GitHub এ config.js খুলে Firebase এর মানগুলো (README, ধাপ ৩) বসিয়ে সেভ করুন।",
  "Open the setup check": "সেটআপ চেক খুলুন", "Sign in": "সাইন ইন", "Roll number or email": "রোল নম্বর বা ইমেইল", "Solve: {a} + {b} = ?": "যোগফল কত: {a} + {b} = ?",
  "First-time setup (admin only)": "প্রথমবার সেটআপ (শুধু অ্যাডমিন)", "Wrong answer to the sum. Please try again.": "যোগফল ভুল হয়েছে। আবার চেষ্টা করুন।",
  "Enter your roll number (or email) and password.": "রোল নম্বর (বা ইমেইল) ও পাসওয়ার্ড দিন।", "Wrong roll number / email or password. Forgot it? Use \"Forgot password?\".": "রোল নম্বর / ইমেইল বা পাসওয়ার্ড ভুল। ভুলে গেলে \"পাসওয়ার্ড ভুলে গেছেন?\" ব্যবহার করুন।",
  "Your name": "আপনার নাম", "Phone number": "ফোন নম্বর", "Send request": "অনুরোধ পাঠান", "Students and teachers: the admin will give you a new password. Admin: a reset link is sent to your email.": "ছাত্র ও শিক্ষক: অ্যাডমিন নতুন পাসওয়ার্ড দেবেন। অ্যাডমিন: ইমেইলে রিসেট লিংক যাবে।",
  "Enter your roll number or email.": "রোল নম্বর বা ইমেইল দিন।", "If this email has an account, a reset link is on its way.": "এই ইমেইলে অ্যাকাউন্ট থাকলে রিসেট লিংক পাঠানো হয়েছে।",
  "Enter your name and phone number too.": "নাম ও ফোন নম্বরও দিন।", "Request sent. The admin will contact you.": "অনুরোধ পাঠানো হয়েছে। অ্যাডমিন যোগাযোগ করবেন।",
  "First-time setup": "প্রথমবার সেটআপ", "This creates the main admin account. Use a real email: it is how you reset your password later.": "এটি প্রধান অ্যাডমিন অ্যাকাউন্ট বানায়। আসল ইমেইল দিন: পরে পাসওয়ার্ড রিসেটে লাগবে।",
  "Admin name": "অ্যাডমিনের নাম", "Email": "ইমেইল", "Password (min 6 characters)": "পাসওয়ার্ড (কমপক্ষে ৬ অক্ষর)", "Repeat password": "পাসওয়ার্ড আবার দিন", "Create admin": "অ্যাডমিন তৈরি করুন", "Back to sign in": "সাইন ইনে ফিরুন",
  "Enter the admin name.": "অ্যাডমিনের নাম দিন।", "Enter a valid email.": "সঠিক ইমেইল দিন।", "The password needs at least 6 characters.": "পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে।", "The two passwords are different.": "দুইটি পাসওয়ার্ড মেলেনি।",
  "Setup is already done. Please sign in.": "সেটআপ আগেই হয়ে গেছে। সাইন ইন করুন।", "This email already has an account. Try signing in.": "এই ইমেইলে আগেই অ্যাকাউন্ট আছে। সাইন ইন করুন।",
  "Registration is closed right now. Please contact the academy.": "এখন রেজিস্ট্রেশন বন্ধ আছে। অনুগ্রহ করে একাডেমির সাথে যোগাযোগ করুন।", "Student": "ছাত্র", "Teacher": "শিক্ষক", "Admin": "অ্যাডমিন", "Co-admin": "কো-অ্যাডমিন",
  "Full name": "পূর্ণ নাম", "Nickname (optional)": "ডাকনাম (ঐচ্ছিক)", "Group (Class 9-12)": "বিভাগ (ক্লাস ৯-১২)", "School / college": "স্কুল / কলেজ", "Subject you teach": "যে বিষয় পড়ান", "Class you teach (optional)": "যে ক্লাসে পড়ান (ঐচ্ছিক)",
  "Your phone number": "আপনার ফোন নম্বর", "Guardian's phone number": "অভিভাবকের ফোন নম্বর", "Guardian's email (optional)": "অভিভাবকের ইমেইল (ঐচ্ছিক)", "Address (optional)": "ঠিকানা (ঐচ্ছিক)", "Email (optional)": "ইমেইল (ঐচ্ছিক)",
  "We send your login ID here.": "আপনার লগইন আইডি এখানে পাঠানো হবে।", "Choose a password (min 6 characters)": "পাসওয়ার্ড বেছে নিন (কমপক্ষে ৬ অক্ষর)", "Review": "পর্যালোচনা",
  "Enter your full name.": "পুরো নাম দিন।", "Choose your class.": "ক্লাস বেছে নিন।", "Choose your group (Science / Commerce / Arts).": "বিভাগ বেছে নিন (বিজ্ঞান / ব্যবসায় শিক্ষা / মানবিক)।",
  "Enter a valid phone number (01XXXXXXXXX).": "সঠিক ফোন নম্বর দিন (01XXXXXXXXX)।", "Enter a valid guardian phone number (01XXXXXXXXX).": "অভিভাবকের সঠিক ফোন নম্বর দিন (01XXXXXXXXX)।",
  "The email looks wrong.": "ইমেইলটি ঠিক মনে হচ্ছে না।", "The guardian email looks wrong.": "অভিভাবকের ইমেইলটি ঠিক মনে হচ্ছে না।", "Check your details": "তথ্য যাচাই করুন",
  "Name": "নাম", "Nickname": "ডাকনাম", "Subject": "বিষয়", "Phone": "ফোন", "Guardian's phone": "অভিভাবকের ফোন", "Guardian's email": "অভিভাবকের ইমেইল", "Address": "ঠিকানা",
  "After you register you get a login ID. The admin must approve your registration before everything opens.": "রেজিস্ট্রেশনের পর আপনি একটি লগইন আইডি পাবেন। অ্যাডমিন অনুমোদন দিলে সবকিছু খুলবে।",
  "Confirm and register": "নিশ্চিত করে রেজিস্ট্রেশন করুন", "Edit": "সম্পাদনা", "Welcome to {n}! Your login ID is {id}. The admin will approve your registration soon.": "{n} এ স্বাগতম! আপনার লগইন আইডি {id}। অ্যাডমিন শীঘ্রই আপনার রেজিস্ট্রেশন অনুমোদন করবেন।",
  "Your login ID": "আপনার লগইন আইডি", "Registration received": "রেজিস্ট্রেশন গ্রহণ করা হয়েছে", "{name} registered at {n}. Login ID: {id}.": "{name} {n} এ রেজিস্ট্রেশন করেছে। লগইন আইডি: {id}।",
  "Registered!": "রেজিস্ট্রেশন সম্পন্ন!", "Your login ID is": "আপনার লগইন আইডি", "Write it down. Sign in with this ID and the password you chose. You will see everything after the admin approves you.": "এটি লিখে রাখুন। এই আইডি ও আপনার দেওয়া পাসওয়ার্ড দিয়ে সাইন ইন করুন। অ্যাডমিন অনুমোদন দিলে সবকিছু দেখতে পাবেন।",
  "Go to sign in": "সাইন ইনে যান", "Choose your own password": "নিজের পাসওয়ার্ড বেছে নিন", "Current (temporary) password": "বর্তমান (অস্থায়ী) পাসওয়ার্ড", "New password (min 6 characters)": "নতুন পাসওয়ার্ড (কমপক্ষে ৬ অক্ষর)", "Repeat new password": "নতুন পাসওয়ার্ড আবার দিন",
  "Save password": "পাসওয়ার্ড সেভ করুন", "Later": "পরে", "You are using a temporary password. Please set your own now.": "আপনি অস্থায়ী পাসওয়ার্ড ব্যবহার করছেন। এখনই নিজের পাসওয়ার্ড দিন।",
  "The new password must be different.": "নতুন পাসওয়ার্ড আলাদা হতে হবে।", "The current password is wrong.": "বর্তমান পাসওয়ার্ড ভুল।", "Password changed.": "পাসওয়ার্ড বদলানো হয়েছে।",
  "Menu": "মেনু", "Logout": "লগআউট", "Search student / teacher": "ছাত্র / শিক্ষক খুঁজুন", "Search": "খুঁজুন", "Nothing found": "কিছু পাওয়া যায়নি", "Alerts": "বার্তা", "Something went wrong": "কিছু একটা ভুল হয়েছে", "Try again": "আবার চেষ্টা করুন",
  "Opening your page…": "আপনার পাতা খুলছে…", "This account is switched off. Please ask the admin.": "এই অ্যাকাউন্ট বন্ধ আছে। অ্যাডমিনকে জানান।", "No account found for this login. Ask the admin, or register.": "এই লগইনের কোনো অ্যাকাউন্ট নেই। অ্যাডমিনকে জানান অথবা রেজিস্ট্রেশন করুন।",
  "Show": "দেখাও", "Hide": "লুকাও", "Co-admin panel": "কো-অ্যাডমিন প্যানেল", "Settings": "সেটিংস", "Month": "মাস", "Class": "ক্লাস",
});
