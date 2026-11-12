// Admin transfer: the main admin hands the admin role to a teacher. The password is checked again, the old admin becomes a
// co-admin (so nobody is ever left without access), and every transfer is written to a history.
import { db, confirmPassword, dbError } from "./lib-db.js";
import { S, esc, t, page, act, isAdmin, fmtDate, cmp, addBN } from "./lib-core.js";
import { icon, avatar, tag, empty, notice, card, row, btn, select, input, form, info, toast } from "./lib-ui.js";
import { transferAdmin } from "./lib-svc.js";

// who can become the admin: an approved, active teacher (co-admins too) who has signed in and chosen his own password
const eligible = () => S.TC.filter((x) => x.role === "teacher" && x.active !== false && x.ap !== false && x.mustChange !== true).sort((a, b) => cmp(a.name, b.name));
const waiting = () => S.TC.filter((x) => x.role === "teacher" && x.active !== false && x.ap !== false && x.mustChange === true);
const when = (x) => fmtDate(x.d) + (x.t ? " · " + new Date(x.t).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }) : "");

page("transfer", async () => {
  if (!isAdmin()) return notice(esc(t("Only the main admin can open this page.")), "warn");
  const H = (await db.recent("xfer", 50).catch(() => [])).sort((a, b) => (b.t || 0) - (a.t || 0));
  const L = eligible(), W = waiting();
  return `${card(t("Admin transfer"), `<div class="row-nw">${avatar(S.me, 48)}<div class="sp"><b>${esc(S.me.name)}</b><div class="mut sm">${esc(t("Current admin (you)"))}</div></div>${tag(t("Admin"), "gold")}</div>
    <p class="mt">${esc(t("Give the admin role to one of your teachers. The new admin controls everything, including fees, salary and settings."))}</p>
    <ul class="xf-list"><li>${esc(t("You become a co-admin, so you keep access to students, batches, attendance and exams."))}</li><li>${esc(t("Your password is asked again before anything changes."))}</li><li>${esc(t("Only the new admin can change this back."))}</li></ul>
    ${L.length ? `<div class="stack-s mt">${select("who", [["", t("Choose a teacher")], ...L.map((x) => [x.id, x.name + (x.roll ? " · " + x.roll : "") + (x.ca ? " · " + t("Co-admin") : "")])], "", { id: "xf-who", label: t("New admin") })}${btn(t("Transfer admin access…"), "xf-start", { kind: "pri", ic: "shield" })}</div>` : `<div class="mt">${empty(t("No teacher can be chosen yet."), "shield")}</div>`}
    ${W.length ? `<p class="mut sm mt">${esc(t("Not available yet (they must sign in once and set their own password): {n}", { n: W.map((x) => x.name).join(", ") }))}</p>` : ""}`)}
  <div class="mt">${card(t("Transfer history"), H.length ? `<div class="list">${H.map((x) => row({ titleHtml: `${esc(x.fromName || "?")} → ${esc(x.toName || "?")}`, sub: esc(when(x) + (x.toRoll ? " · " + x.toRoll : "")), right: x.wasCo ? tag(t("Co-admin"), "gold") : "" })).join("")}</div>` : empty(t("No transfer yet."), "list"))}</div>`;
}, { title: "Admin transfer" });

act("xf-start", async () => {
  if (!isAdmin()) return;
  const id = (document.getElementById("xf-who") || {}).value;
  if (!id) return toast(t("Choose a teacher"), "bad");
  const u = S.TC.find((x) => x.id === id);
  if (!u) return toast(t("Not found"), "bad");
  const key = String(u.roll || u.name).trim();
  const done = await form(t("Transfer admin access"), `<div class="notice notice--warn">${icon("alert")}<div><b>${esc(S.me.name)}</b> → <b>${esc(u.name)}</b><br>${esc(t("{n} becomes the admin right now. You become a co-admin and no longer see fees, salary or settings.", { n: u.name }))}</div></div>
    ${input("pw", { type: "password", label: t("Your password"), autocomplete: "current-password" })}${input("word", { label: t("Type the ID of the new admin ({id}) to confirm", { id: key }), autocomplete: "off", autocapitalize: "characters" })}`, {
    ok: t("Transfer now"),
    validate: (d) => (!d.pw ? t("Enter your password.") : String(d.word || "").trim().toLowerCase() !== key.toLowerCase() ? t("The ID does not match. Type {id}.", { id: key }) : ""),
    onSave: async (d) => {
      try { await confirmPassword(d.pw); } catch (e) { throw new Error(t(dbError(e))); }   // wrong password: nothing is changed
      return transferAdmin(id);
    },
  });
  if (!done) return;
  await info(t("Done. {n} is now the admin. You are a co-admin. The app will reload now.", { n: done.toName }) + (done.toRoll ? " " + t("Their login ID is now {id}.", { id: done.toRoll }) : ""), t("Admin transferred"));
  location.hash = "#/dashboard";
  location.reload();
});

addBN({
  "Their login ID is now {id}.": "তাঁর লগইন আইডি এখন {id}।", "Your login ID is now {id}.": "আপনার লগইন আইডি এখন {id}।",
  "Only the main admin can open this page.": "শুধু প্রধান অ্যাডমিন এই পাতা খুলতে পারেন।", "Admin transfer": "অ্যাডমিন হস্তান্তর", "Current admin (you)": "বর্তমান অ্যাডমিন (আপনি)",
  "Give the admin role to one of your teachers. The new admin controls everything, including fees, salary and settings.": "আপনার একজন শিক্ষককে অ্যাডমিনের দায়িত্ব দিন। নতুন অ্যাডমিন ফি, বেতন ও সেটিংস সহ সবকিছু নিয়ন্ত্রণ করবেন।",
  "You become a co-admin, so you keep access to students, batches, attendance and exams.": "আপনি কো-অ্যাডমিন হবেন, তাই ছাত্র, ব্যাচ, উপস্থিতি ও পরীক্ষার অ্যাক্সেস থাকবে।",
  "Your password is asked again before anything changes.": "কিছু বদলানোর আগে আপনার পাসওয়ার্ড আবার চাওয়া হবে।", "Only the new admin can change this back.": "শুধু নতুন অ্যাডমিনই এটি আবার বদলাতে পারবেন।",
  "New admin": "নতুন অ্যাডমিন", "Transfer admin access…": "অ্যাডমিন অ্যাক্সেস হস্তান্তর…", "No teacher can be chosen yet.": "এখনো কোনো শিক্ষককে বেছে নেওয়া যাচ্ছে না।",
  "Not available yet (they must sign in once and set their own password): {n}": "এখনো বেছে নেওয়া যাবে না (একবার সাইন ইন করে নিজের পাসওয়ার্ড দিতে হবে): {n}",
  "Transfer history": "হস্তান্তরের ইতিহাস", "No transfer yet.": "এখনো কোনো হস্তান্তর হয়নি।", "Transfer admin access": "অ্যাডমিন অ্যাক্সেস হস্তান্তর",
  "{n} becomes the admin right now. You become a co-admin and no longer see fees, salary or settings.": "{n} এখনই অ্যাডমিন হবেন। আপনি কো-অ্যাডমিন হবেন এবং ফি, বেতন বা সেটিংস আর দেখবেন না।",
  "Your password": "আপনার পাসওয়ার্ড", "Type the ID of the new admin ({id}) to confirm": "নিশ্চিত করতে নতুন অ্যাডমিনের আইডি ({id}) লিখুন", "Transfer now": "এখনই হস্তান্তর করুন",
  "Enter your password.": "পাসওয়ার্ড দিন।", "The ID does not match. Type {id}.": "আইডি মেলেনি। {id} লিখুন।", "Wrong password.": "পাসওয়ার্ড ভুল।",
  "Done. {n} is now the admin. You are a co-admin. The app will reload now.": "সম্পন্ন। {n} এখন অ্যাডমিন। আপনি কো-অ্যাডমিন। অ্যাপ এখন আবার লোড হবে।", "Admin transferred": "অ্যাডমিন হস্তান্তর হয়েছে",
  "Only the main admin can transfer admin access.": "শুধু প্রধান অ্যাডমিন অ্যাডমিন অ্যাক্সেস হস্তান্তর করতে পারেন।", "Choose another person.": "অন্য একজনকে বেছে নিন।", "You are not the admin any more. Reload the page.": "আপনি আর অ্যাডমিন নন। পাতাটি আবার লোড করুন।",
  "Only a teacher can become the admin.": "শুধু একজন শিক্ষকই অ্যাডমিন হতে পারেন।", "This account is not active.": "এই অ্যাকাউন্ট সক্রিয় নয়।", "This teacher has not signed in and set a password yet.": "এই শিক্ষক এখনো সাইন ইন করে পাসওয়ার্ড দেননি।",
  "You are now the admin of {n}. Reload the app to see the admin menu.": "আপনি এখন {n} এর অ্যাডমিন। অ্যাডমিন মেনু দেখতে অ্যাপ আবার লোড করুন।", "The transfer could not be confirmed. Open the Admin transfer page and check the history.": "হস্তান্তর নিশ্চিত করা যায়নি। অ্যাডমিন হস্তান্তর পাতায় ইতিহাস দেখুন।",
});
