// People: students, teachers, registrations / approvals, batches, co-admin panel, and the profile popup.
import { db } from "./lib-db.js";
import {
  S, esc, t, page, act, onInput, onChange, onSubmit, pageState, refresh, isAdmin, isStaff, instName, cmp, lk, ago, fmtDate, T, money, monthLabel,
  smsHref, waHref, copyText, addBN, batchOf, uniq,
} from "./lib-core.js";
import {
  icon, avatar, tag, empty, notice, card, row, btn, chips, input, select, field, clsOptions, grpOptions, grpLabel,
  gdOptions, gdLabel, batchGdOptions, batchGdLabel, modal, ask, form, toast, closeModals,
} from "./lib-ui.js";
import { createAccount, resetPassword, removeUser, reloadPeople, recalcBatch, sendMail, logAct, notify, monthStart, ensureGenderBatches } from "./lib-svc.js";
import { findBatch, subjectsFor, feeStart, isMonth, batchTitle, isGd } from "./lib-stats.js";

const MAX_CO = 5;
const findUser = (id) => [...S.U, ...S.TC, ...S.PEND].find((u) => u.id === id);
const batchLabel = (u) => (u.role === "teacher"
  ? (u.bids || []).map((b) => { const n = (batchOf(b) || {}).name, sj = (u.sj || {})[b]; return n ? (sj && sj.length ? n + " (" + sj.join(", ") + ")" : n) : ""; }).filter(Boolean).join("; ")
  : (batchOf(u.bid) || {}).name || "");
// one box per teacher: photo, name, small roll under the name. Co-admins are gold.
const tcard = (x, right = "", act = "open-user") => `<div class="tcard ${x.ca ? "tcard--co" : ""}" data-act="${act}" data-arg="${esc(x.id)}">${avatar(x, 44)}<div class="tcard-b"><b>${esc(x.name)}</b><span class="mut">${esc(x.roll || "")}</span></div><div class="tcard-t">${right}</div></div>`;
const clsLabel = (u) => (u.cls ? t("Class {n}", { n: u.cls }) + (u.grp ? " · " + t(u.grp) : "") : "");
const countIn = (b) => S.U.filter((s) => s.bid === b.id && s.active !== false && s.ap !== false).length;
const reload = async (...bids) => { await reloadPeople(); for (const b of [...new Set(bids.filter(Boolean))]) await recalcBatch(b).catch(() => {}); refresh(); };

// ---------- login details dialog (new account / new password) ----------
function showLogin(u, roll, pw, why) {
  const text = t("{inst}: login ID {roll}, password {pw}. Please change the password after you sign in.", { inst: instName(), roll, pw });
  const phones = [u.phone, u.gphone].filter(Boolean);
  const m = modal(`<h3>${esc(why)}</h3><p>${esc(u.name)}</p>
    <div class="card card--soft stack-s"><div><span class="mut">${esc(t("Login ID"))}</span><div class="b" style="font-size:20px;user-select:all">${esc(roll)}</div></div>
    <div><span class="mut">${esc(t("Password"))}</span><div class="b" style="font-size:20px;user-select:all">${esc(pw)}</div></div></div>
    <div class="row mt"><button class="btn btn--sm" data-cp>${icon("link")}${esc(t("Copy"))}</button>
    ${phones.map((p) => `<a class="btn btn--sm" href="${esc(smsHref(p, text))}">${icon("sms")}SMS ${esc(p)}</a><a class="btn btn--sm" target="_blank" rel="noopener" href="${esc(waHref(p, text))}">${icon("phone")}WhatsApp ${esc(p)}</a>`).join("")}
    ${u.email ? `<button class="btn btn--sm" data-em>${icon("mail")}${esc(t("Email"))}</button>` : ""}</div>
    <p class="mut sm mt">${esc(t("Give this to the person. The password is shown only now."))}</p>
    <div class="mod-f"><button class="btn btn--pri" data-x>${esc(t("Done"))}</button></div>`, { sticky: true });
  m.body.addEventListener("click", async (e) => {
    if (e.target.closest("[data-x]")) m.close();
    if (e.target.closest("[data-cp]")) toast((await copyText(`${roll} / ${pw}`)) ? t("Copied") : t("Could not copy"), "ok");
    if (e.target.closest("[data-em]")) { const r = await sendMail(u.email, u.name, t("Your login details"), text); toast(r ? r : t("Email sent"), r ? "bad" : "ok"); }
  });
}

// ---------- students ----------
const stuState = () => pageState("stu");
function stuList() {
  const st = stuState(), q = lk(st.q || "");
  let L = S.U.filter((s) => (!st.cls || s.cls === st.cls) && (!st.grp || s.grp === st.grp) && (!q || [s.name, s.nick, s.roll, s.phone, s.school, s.gphone].some((v) => lk(v).includes(q))));
  L = [...L].sort((a, b) => cmp(a.cls, b.cls) || cmp(a.name, b.name));
  const n = st.n || 60;
  if (!L.length) return empty(t("No students found."), "users");
  return `<div class="list">${L.slice(0, n).map((s) => row({ av: avatar(s), title: s.name, sub: esc([s.roll, clsLabel(s), batchLabel(s)].filter(Boolean).join(" · ")), right: s.active === false ? tag(t("Inactive"), "bad") : "", act: "open-user", arg: s.id })).join("")}</div>
    ${L.length > n ? `<div class="mt tc">${btn(t("Show more") + " (" + (L.length - n) + ")", "stu-more", { sm: true })}</div>` : ""}<p class="mut sm mt">${L.length} ${esc(t("students"))}</p>`;
}
page("students", () => {
  const st = stuState();
  const cl = [{ k: "", label: t("All") }, ...[4, 5, 6, 7, 8, 9, 10, 11, 12].map((c) => ({ k: String(c), label: t("Class {n}", { n: c }) }))];
  return `<div class="inline mb"><input placeholder="${esc(t("Search by name, roll, phone"))}" value="${esc(st.q || "")}" data-input="stu-q">${btn(t("Add student"), "stu-add", { kind: "pri", ic: "plus" })}</div>
    ${chips(cl, st.cls || "", "stu-cls")}
    ${+st.cls >= 9 ? chips([{ k: "", label: t("All groups") }, ...["Science", "Commerce", "Arts"].map((g) => ({ k: g, label: t(g) }))], st.grp || "", "stu-grp") : ""}
    <div class="card" id="stu-list">${stuList()}</div>`;
}, { title: "Students" });
onInput("stu-q", (el) => { const st = stuState(); st.q = el.value; st.n = 60; const b = document.getElementById("stu-list"); if (b) b.innerHTML = stuList(); });
act("stu-cls", (el) => { const st = stuState(); st.cls = el.dataset.arg; st.grp = ""; st.n = 60; refresh(); });
act("stu-grp", (el) => { const st = stuState(); st.grp = el.dataset.arg; st.n = 60; refresh(); });
act("stu-more", () => { const st = stuState(); st.n = (st.n || 60) + 60; refresh(); });

const personFields = (u = {}, isNew = false) => `
  ${input("name", { label: t("Full name"), value: u.name || "" })}
  ${isAdmin() || isNew ? input("nick", { label: t("Nickname"), value: u.nick || "" }) : ""}
  ${u.role === "teacher" ? `${input("subject", { label: t("Subject"), value: u.subject || "" })}${select("cls", clsOptions(), u.cls || "", { label: t("Class (optional)") })}`
    : `${select("cls", clsOptions(), u.cls || "", { label: t("Class") })}${select("grp", grpOptions(), u.grp || "", { label: t("Group (Class 9-12)") })}${select("gd", gdOptions(), u.gd || "", { label: t("Gender"), hint: t("Decides the Boys or the Girls batch.") })}${input("school", { label: t("School / college"), value: u.school || "" })}`}
  ${input("phone", { label: t("Phone"), type: "tel", value: u.phone || "", placeholder: "01XXXXXXXXX" })}
  ${u.role === "teacher" ? "" : `${input("gname", { label: t("Guardian name"), value: u.gname || "" })}${input("gphone", { label: t("Guardian's phone"), type: "tel", value: u.gphone || "", placeholder: "01XXXXXXXXX" })}${input("gem", { label: t("Guardian's email"), type: "email", value: u.gem || "" })}`}
  ${input("addr", { label: t("Address"), value: u.addr || "" })}
  ${input("email", { label: t("Email"), type: "email", value: u.email || "" })}`;
const cleanData = (d, role) => {
  const o = {};
  for (const k of ["name", "nick", "subject", "cls", "grp", "gd", "school", "phone", "gname", "gphone", "gem", "addr", "email"]) if (d[k] !== undefined) o[k] = String(d[k]).trim();
  if (role !== "teacher" && +o.cls < 9) o.grp = "";
  if (role === "teacher") delete o.gd;
  else if (o.gd !== undefined && !isGd(o.gd)) o.gd = "";
  return o;
};
const checkPerson = (d, role, needGd = false) => (!d.name.trim() ? t("Enter the name.") : role !== "teacher" && !d.cls ? t("Choose the class.") : role !== "teacher" && +d.cls >= 9 && !d.grp ? t("Choose the group (Science / Commerce / Arts).") : role !== "teacher" && needGd && !isGd(d.gd) ? t("Choose the gender (Male / Female).") : "");

act("stu-add", async () => {
  if (!S.B.length) return toast(t("Add a batch first."), "bad");
  let made = null;
  await form(t("Add student"), personFields({ role: "student" }, true), {
    validate: (d) => checkPerson(d, "student", true),
    onSave: async (d) => {
      const x = cleanData(d, "student"), b = findBatch(S.B, x.cls, x.grp, x.gd);
      made = { u: { ...x, role: "student" }, r: await createAccount("student", { ...x, bid: b ? b.id : "" }), bid: b && b.id };
    },
  });
  if (!made) return;
  logAct("Added student " + made.u.name);
  await reload(made.bid);
  showLogin(made.u, made.r.roll, made.r.pw, t("Student added"));
});

// ---------- teacher: add a student to one of HIS OWN batches ----------
// Same as the admin's Add student (a new account with a login ID and a temporary password), but the batch is chosen from the
// teacher's own batches only (S.B is just those); class / group come from the batch. The teacher then gives the ID and password to the student.
const tchAddFields = () => `${select("bid", S.B.map((b) => [b.id, b.name]), S.B[0] ? S.B[0].id : "", { label: t("Batch") })}
  ${input("name", { label: t("Full name") })}${input("nick", { label: t("Nickname") })}
  ${select("gd", gdOptions(), "", { label: t("Gender"), hint: t("Leave empty for a Boys or Girls batch: the batch decides.") })}
  ${input("school", { label: t("School / college") })}${input("phone", { label: t("Phone"), type: "tel", placeholder: "01XXXXXXXXX" })}
  ${input("gname", { label: t("Guardian name") })}${input("gphone", { label: t("Guardian's phone"), type: "tel", placeholder: "01XXXXXXXXX" })}${input("gem", { label: t("Guardian's email"), type: "email" })}
  ${input("addr", { label: t("Address") })}${input("email", { label: t("Email"), type: "email" })}`;
export async function teacherAddStudent() {
  if (!S.B.length) return toast(t("No batch assigned yet."), "bad");
  let made = null;
  await form(t("Add student"), tchAddFields(), {
    validate: (d) => {
      const b = S.B.find((x) => x.id === d.bid);
      return !b ? t("Choose the batch.") : !String(d.name || "").trim() ? t("Enter the name.") : isGd(d.gd) && isGd(b.gd) && d.gd !== b.gd ? t("This batch is for {w} only.", { w: batchGdLabel(b.gd) }) : "";
    },
    onSave: async (d) => {
      const b = S.B.find((x) => x.id === d.bid);
      if (!b) throw new Error(t("Choose the batch."));   // only his own batches
      const x = cleanData({ ...d, cls: b.cls || "", grp: b.grp || "", gd: isGd(d.gd) ? d.gd : b.gd || "" }, "student");
      made = { u: { ...x, role: "student" }, r: await createAccount("student", { ...x, bid: b.id }), b };
    },
  });
  if (!made) return;
  notify("admin", S.me.name + ": Added student " + made.u.name + " (" + made.r.roll + ") - " + made.b.name, made.b.id);
  await reload(made.b.id);
  showLogin(made.u, made.r.roll, made.r.pw, t("Student added"));
}

// ---------- profile popup ----------
act("open-user", (el) => {
  const u = findUser(el.dataset.arg);
  if (!u) return toast(t("Not found"), "bad");
  closeModals();
  const st = u.role === "student", pend = u.ap === false, co = u.co || u.ca === true;
  const kv = (k, v) => (v ? `<div class="item"><div class="item-b"><span class="mut">${esc(k)}</span><b>${esc(v)}</b></div></div>` : "");
  const bn = batchLabel(u);
  const B = (label, a, o = {}) => btn(label, a, { arg: u.id, sm: true, ...o });
  modal(`<div class="row-nw">${avatar(u, 56)}<div class="sp"><h3 style="margin:0">${esc(u.name)}</h3><span class="mut">${esc(u.roll || "")}</span><div class="row" style="gap:4px;margin-top:4px">
      ${st ? tag(t("Student")) : tag(t("Teacher"))}${pend ? tag(t("Waiting for approval"), "warn") : ""}${u.active === false ? tag(t("Inactive"), "bad") : ""}${co ? tag(t("Co-admin"), "gold") : ""}${u.pub ? tag(t("Can publish"), "ok") : ""}</div></div></div>
    <div class="list mt">${kv(t("Nickname"), u.nick)}${kv(t("Class"), clsLabel(u))}${st ? kv(t("Gender"), gdLabel(u.gd)) : ""}${kv(st ? t("Batch") : t("Batches"), bn)}${kv(t("School / college"), u.school)}${kv(t("Subject"), u.subject)}${kv(t("Phone"), u.phone)}${kv(t("Guardian name"), u.gname)}${kv(t("Guardian's phone"), u.gphone)}${kv(t("Guardian's email"), u.gem)}${kv(t("Blood group"), u.bg)}${kv(t("Address"), u.addr)}${kv(t("Email"), u.email)}${st && isAdmin() && +u.fo > 0 ? kv(t("Personal monthly fee"), money(u.fo)) : ""}${st && isAdmin() ? kv(t("First fee month"), feeStart(u) ? monthLabel(feeStart(u)) : t("Not set")) : ""}</div>
    <div class="row mt">
      ${pend ? B(t("Approve"), "ap-yes", { kind: "pri", ic: "check" }) + B(t("Reject"), "ap-no", { kind: "bad", ic: "x" }) : ""}
      ${B(t("Edit"), "pu-edit", { ic: "edit" })}${B(t("ID card"), "pu-id", { ic: "idcard" })}
      ${st ? B(t("Move batch"), "pu-move", { ic: "layers" }) : B(t("Batches"), "tch-bids", { ic: "layers" })}
      ${st && isAdmin() ? B(t("+ Add Fee"), "fee-add", { kind: "pri" }) + B(t("Fee history"), "fee-hist", { ic: "clock" }) + B(t("Personal fee"), "pu-fee", { ic: "wallet" }) : ""}
      ${!st && isAdmin() ? B(co ? t("Remove co-admin") : t("Make co-admin"), "tch-co", { ic: "shield" }) + B(u.pub ? t("Stop publish rights") : t("Allow publishing"), "tch-pub", { ic: "eye" }) : ""}
      ${!pend ? B(t("New password"), "pu-pw", { ic: "key" }) + B(u.active === false ? t("Reactivate") : t("Deactivate"), "pu-act", { ic: "lock" }) : ""}
      ${B(t("Delete"), "pu-del", { kind: "bad", ic: "trash" })}
    </div><div class="mod-f"><button class="btn" data-act="pu-close">${esc(t("Close"))}</button></div>`);
});
act("pu-close", () => closeModals());
const target = (el) => { const u = findUser(el.dataset.arg); if (!u) throw new Error(t("Not found")); return u; };

act("pu-edit", async (el) => {
  const u = target(el);
  closeModals();
  await form(t("Edit"), personFields(u), {
    validate: (d) => checkPerson(d, u.role, u.role === "student" && !!u.gd),
    onSave: async (d) => {
      const p = cleanData(d, u.role), old = u.bid;
      if (u.role === "student") {
        // a change of class / group, or of gender inside the student's own class batch, moves him to the matching batch
        const cur = batchOf(u.bid), clsChg = p.cls !== u.cls || (p.grp || "") !== (u.grp || ""), gdChg = (p.gd || "") !== (u.gd || "");
        if (clsChg || (gdChg && (!cur || (String(cur.cls) === p.cls && (cur.grp || "") === (p.grp || ""))))) { const b = findBatch(S.B, p.cls, p.grp, p.gd); if (b && b.id !== u.bid) p.bid = b.id; }
      }
      await db.upd("users/" + u.id, p);
      logAct("Edited " + u.name);
      await reload(old, p.bid);
    },
  });
});
act("pu-move", async (el) => {
  const u = target(el);
  closeModals();
  await form(t("Move batch"), select("bid", S.B.map((b) => [b.id, b.name]), u.bid || "", { label: t("Batch") }), {
    onSave: async (d) => {
      const b = batchOf(d.bid);
      await db.upd("users/" + u.id, { bid: b.id, cls: b.cls || u.cls || "", grp: b.grp || "" });
      logAct("Moved " + u.name + " to " + b.name);
      await reload(u.bid, b.id);
    },
  });
});
act("pu-fee", async (el) => {
  const u = target(el);
  closeModals();
  await form(t("Personal monthly fee"), input("fo", { label: t("Amount (৳). Leave 0 to use the batch / default fee."), type: "number", value: u.fo || 0, min: "0", step: "any", inputmode: "decimal" })
    + input("fm", { label: t("First fee month"), type: "month", value: isMonth(u.fm) ? u.fm : "", hint: t("Leave empty to use the month the student registered. No fee is made for earlier months.") }), {
    validate: (d) => (d.fm && !isMonth(d.fm) ? t("Choose the month") : ""),
    onSave: async (d) => { await db.upd("users/" + u.id, { fo: Math.max(0, +d.fo || 0), fm: d.fm || "" }); await reload(); },
  });
});
act("pu-id", async (el) => {
  const u = target(el);
  closeModals();
  const m = await import("./pages-account.js");
  m.showIdCard(u);
});
act("pu-pw", async (el) => {
  const u = target(el);
  if (!(await ask(t("Make a new temporary password for {n}? The old password stops working.", { n: u.name }), { ok: t("Make new password") }))) return;
  const pw = await resetPassword(u);
  logAct("Reset password of " + u.name);
  closeModals();
  await reloadPeople();
  showLogin(u, u.roll, pw, t("New password"));
});
act("pu-act", async (el) => {
  const u = target(el), on = u.active === false;
  await db.upd("users/" + u.id, { active: on });
  logAct((on ? "Reactivated " : "Deactivated ") + u.name);
  closeModals();
  await reload(u.bid);
});
act("pu-del", async (el) => {
  const u = target(el);
  if (!(await ask(t("Delete {n} for good? This cannot be undone.", { n: u.name }), { danger: true, ok: t("Delete") }))) return;
  await removeUser(u);
  logAct("Deleted " + u.name);
  closeModals();
  await reload(u.bid);
  toast(t("Deleted"), "ok");
});

// ---------- teachers ----------
page("teachers", () => {
  const st = pageState("tch"), f = st.b || "";
  const L = S.TC.filter((x) => !f || (x.bids || []).includes(f)).sort((a, b) => cmp(a.name, b.name));
  return `<div class="inline mb"><div class="sp"></div>${btn(t("Add teacher"), "tch-add", { kind: "pri", ic: "plus" })}</div>
    ${chips([{ k: "", label: t("All") }, ...S.B.map((b) => ({ k: b.id, label: b.name }))], f, "tch-f")}
    ${L.length ? `<div class="stack-s">${L.map((x) => tcard(x, `${x.ca ? tag(t("Co-admin"), "gold") : ""}${x.pub ? tag(t("Can publish"), "ok") : ""}${x.active === false ? tag(t("Inactive"), "bad") : ""}`)).join("")}</div>` : `<div class="card">${empty(t("No teachers yet."), "cap")}</div>`}`;
}, { title: "Teachers" });
act("tch-f", (el) => { pageState("tch").b = el.dataset.arg; refresh(); });
act("tch-add", async () => {
  let made = null;
  await form(t("Add teacher"), personFields({ role: "teacher" }, true), {
    validate: (d) => checkPerson(d, "teacher"),
    onSave: async (d) => { const x = cleanData(d, "teacher"); made = { u: { ...x, role: "teacher" }, r: await createAccount("teacher", { ...x, bids: [] }) }; },
  });
  if (!made) return;
  logAct("Added teacher " + made.u.name);
  await reload();
  showLogin(made.u, made.r.roll, made.r.pw, t("Teacher added"));
});
act("tch-bids", async (el) => {
  const u = target(el);
  closeModals();
  const SDs = Object.fromEntries((await db.list("sd").catch(() => [])).map((d) => [d.id, d]));
  const sj = u.sj || {}, names = {};
  const boxes = S.B.map((b) => {
    const on = (u.bids || []).includes(b.id), cur = sj[b.id] || [], base = subjectsFor(b.cls, b.grp, SDs[b.id]).map((x) => x.s);
    const all = names[b.id] = uniq([...base, ...cur]);
    return `<div class="tb"><label class="check"><input type="checkbox" name="b_${esc(b.id)}" data-change="tb-on" ${on ? "checked" : ""}><span><b>${esc(b.name)}</b></span></label>
      <div class="tb-s" ${on ? "" : "hidden"}><p class="mut sm">${esc(t("Tick the subjects this teacher takes in this batch. None ticked = all subjects."))}</p>
        ${all.map((n, i) => `<label class="check"><input type="checkbox" name="s_${esc(b.id)}_${i}" ${cur.includes(n) ? "checked" : ""}><span>${esc(n)}</span></label>`).join("")}
        <input name="o_${esc(b.id)}" placeholder="${esc(t("Other subject names, separated by commas"))}"></div></div>`;
  }).join("");
  await form(t("Batches of {n}", { n: u.name }), `<p class="mut sm">${esc(t("The teacher can enter marks and update the syllabus only for the ticked subjects."))}</p><div style="max-height:55vh;overflow:auto">${boxes || esc(t("Add a batch first."))}</div>`, {
    onSave: async (d) => {
      const bids = S.B.filter((b) => d["b_" + b.id]).map((b) => b.id), nsj = {};
      for (const b of bids) {
        const pick = (names[b] || []).filter((n, i) => d["s_" + b + "_" + i]);
        const other = String(d["o_" + b] || "").split(",").map((x) => x.trim()).filter(Boolean);
        const all = uniq([...pick, ...other]);
        if (all.length) nsj[b] = all;
      }
      await db.upd("users/" + u.id, { bids, sj: nsj });
      logAct("Batches of " + u.name);
      await reload();
    },
  });
});
onChange("tb-on", (el) => { const b = el.closest(".tb"), x = b && b.querySelector(".tb-s"); if (x) x.hidden = !el.checked; });
act("tch-pub", async (el) => { const u = target(el); await db.upd("users/" + u.id, { pub: !u.pub }); closeModals(); await reload(); });
act("tch-co", async (el) => {
  const u = target(el), on = !u.ca;
  if (on && S.TC.filter((x) => x.ca).length >= MAX_CO) return toast(t("At most {n} co-admins.", { n: MAX_CO }), "bad");
  if (on && !(await ask(t("{n} will be able to manage students, batches, attendance and results (not fees).", { n: u.name }), { ok: t("Make co-admin") }))) return;
  await db.upd("users/" + u.id, { ca: on });
  closeModals();
  await reload();
});

// ---------- registrations / approvals ----------
async function approve(u) {
  const p = { ap: true, ad: Date.now() };
  if (u.role === "student" && !u.bid) { const b = findBatch(S.B, u.cls, u.grp, u.gd); if (b) p.bid = b.id; }
  await db.upd("users/" + u.id, p);
  if (u.email) sendMail(u.email, u.name, t("Registration approved"), t("Your registration at {n} is approved. Login ID: {id}. You can use everything now.", { n: instName(), id: u.roll })).catch(() => {});
  logAct("Approved " + u.name);
  return p.bid || u.bid;
}
act("ap-yes", async (el) => { const u = target(el); closeModals(); const b = await approve(u); await reload(b); toast(t("Approved"), "ok"); });
act("ap-no", async (el) => {
  const u = target(el);
  if (!(await ask(t("Reject {n}? The account is deleted.", { n: u.name }), { danger: true, ok: t("Reject") }))) return;
  await removeUser(u); closeModals(); await reload(); toast(t("Rejected"), "ok");
});
page("approvals", async () => {
  const [fps, regs, rc] = await Promise.all([db.list("fp", ["st", "==", "new"]).catch(() => []), db.recent("reg", 30).catch(() => []), db.get("config/reg").catch(() => null)]);
  const open = !rc || rc.open !== false;
  const pend = S.PEND.map((u) => row({ av: avatar(u), title: u.name, sub: esc([u.role === "teacher" ? t("Teacher") : t("Student"), u.roll, clsLabel(u), u.phone].filter(Boolean).join(" · ")), right: `${btn(t("Approve"), "ap-yes", { arg: u.id, kind: "pri", sm: true })}${btn(t("Reject"), "ap-no", { arg: u.id, kind: "bad", sm: true })}`, act: "open-user", arg: u.id })).join("");
  const fp = fps.sort((a, b) => b.t - a.t).map((r) => row({ title: r.name || r.roll, sub: esc([r.roll, r.phone, ago(r.t)].filter(Boolean).join(" · ")), right: `${btn(t("New password"), "ap-fp", { arg: r.id, kind: "pri", sm: true })}${btn(t("Dismiss"), "ap-fpx", { arg: r.id, sm: true })}`, })).join("");
  const rg = regs.sort((a, b) => b.t - a.t).slice(0, 30).map((r) => row({ title: r.name, sub: esc([r.role === "teacher" ? t("Teacher") : t("Student"), r.roll, r.phone, ago(r.t)].filter(Boolean).join(" · ")) })).join("");
  return `${card(t("Self-registration"), `<div class="check" style="border:0"><span><b>${esc(open ? t("Registration open") : t("Registration closed"))}</b><span class="mut sm"> ${esc(t("New people can register on the sign-in page."))}</span></span><button class="sw" aria-pressed="${open}" data-act="ap-open" aria-label="${esc(t("Self-registration"))}"></button></div>`)}
    <div class="mt">${card(t("Waiting for approval") + " (" + S.PEND.length + ")", pend ? `<div class="list">${pend}</div>` : empty(t("Nobody is waiting."), "check"))}</div>
    <div class="mt">${card(t("Forgot password requests") + " (" + fps.length + ")", fp ? `<div class="list">${fp}</div>` : empty(t("No requests."), "key"))}</div>
    <div class="mt">${card(t("Recent registrations"), rg ? `<div class="list">${rg}</div>` : empty(t("Nothing yet."), "inbox"))}</div>`;
}, { title: "Registrations" });
act("ap-open", async (el) => { const on = el.getAttribute("aria-pressed") !== "true"; await db.set("config/reg", { open: on }); refresh(); });
act("ap-fp", async (el) => {
  const r = await db.get("fp/" + el.dataset.arg);
  if (!r) return refresh();
  const key = lk(r.roll), u = [...S.U, ...S.TC].find((x) => lk(x.roll) === key || lk(x.email) === key);
  if (!u) return toast(t("No account with this ID: {id}", { id: r.roll }), "bad");
  const pw = await resetPassword(u);
  await db.upd("fp/" + r.id, { st: "done" }).catch(() => {});
  logAct("Reset password of " + u.name);
  await reloadPeople();
  refresh();
  showLogin(u, u.roll, pw, t("New password"));
});
act("ap-fpx", async (el) => { await db.del("fp/" + el.dataset.arg); refresh(); });

// ---------- batches ----------
const batchSub = (b) => [clsLabel(b), batchGdLabel(b.gd), t("{n} students", { n: countIn(b) }), t("Month from {d}", { d: fmtDate(b.start) })].filter(Boolean).join(" · ");
const batchTags = (b) => `${b.gd ? tag(batchGdLabel(b.gd), b.gd === "M" ? "info" : "gold") : ""}${b.off ? tag(t("Closed"), "bad") : ""}`;
page("batches", () => {
  const q = lk(pageState("bat").q || "");
  const L = S.B.filter((b) => !q || lk(b.name).includes(q));
  return `<div class="inline mb"><input placeholder="${esc(t("Search batch"))}" value="${esc(pageState("bat").q || "")}" data-input="bat-q">${btn(t("Add batch"), "bat-add", { kind: "pri", ic: "plus" })}</div>
    <div class="mb">${btn(t("Make Boys & Girls batches"), "bat-gd", { sm: true, ic: "users" })}</div>
    <div class="card" id="bat-list">${batchList(L)}</div>`;
}, { title: "Batches" });
const batchList = (L) => (L.length ? `<div class="list">${L.map((b) => row({ title: b.name, sub: esc(batchSub(b)), right: batchTags(b) + icon("right"), act: "bat-open", arg: b.id })).join("")}</div>` : empty(t("No batch found."), "layers"));
onInput("bat-q", (el) => {
  pageState("bat").q = el.value;
  const q = lk(el.value), b = document.getElementById("bat-list");
  if (b) b.innerHTML = batchList(S.B.filter((x) => !q || lk(x.name).includes(q)));
});
act("bat-add", async () => {
  await form(t("Add batch"), `${input("name", { label: t("Batch name (optional)"), hint: t("Left empty, the name is made from the class, group and Boys / Girls.") })}${select("cls", clsOptions(), "", { label: t("Class") })}${select("grp", grpOptions(), "", { label: t("Group (Class 9-12)") })}${select("gd", batchGdOptions(), "", { label: t("For") })}`, {
    validate: (d) => (!d.name.trim() && !d.cls ? t("Enter the batch name or choose a class.") : ""),
    onSave: async (d) => {
      const cls = d.cls || "", grp = +cls >= 9 ? d.grp || "" : "", gd = isGd(d.gd) ? d.gd : "", name = d.name.trim() || batchTitle(cls, grp, gd);
      await db.add("batches", { name, cls, grp, gd, start: monthStart() });
      logAct("Added batch " + name); await reloadPeople(); refresh();
    },
  });
});
act("bat-gd", async () => {
  if (!(await ask(t("For every class that has a batch, make the missing Boys batch and Girls batch. Nobody is moved. New students then go to the right one."), { ok: t("Make batches") }))) return;
  const n = await ensureGenderBatches();
  logAct("Made Boys and Girls batches");
  toast(n ? t("{n} batches made.", { n }) : t("Nothing to add. They already exist."), n ? "ok" : "");
  refresh();
});
act("bat-open", (el) => {
  const b = batchOf(el.dataset.arg);
  if (!b) return;
  const L = S.U.filter((s) => s.bid === b.id).sort((x, y) => cmp(x.name, y.name));
  modal(`<h3>${esc(b.name)}</h3><div class="row" style="gap:4px;margin:6px 0">${tag(t("{n} students", { n: countIn(b) }), "ok")}${batchTags(b)}${b.cls ? tag(clsLabel(b)) : ""}</div><p class="mut">${esc(t("Month from {d}", { d: fmtDate(b.start) }))}</p>
    <div class="list" style="max-height:44vh;overflow:auto">${L.map((s) => row({ av: avatar(s, 34), title: s.name, sub: esc([s.roll, s.nick, s.phone].filter(Boolean).join(" · ")), right: s.active === false ? tag(t("Inactive"), "bad") : "", act: "open-user", arg: s.id })).join("") || empty(t("No students yet."), "users")}</div>
    <div class="row mt">${btn(t("Edit batch"), "bat-edit", { arg: b.id, sm: true, ic: "edit" })}${btn(t("Month start date"), "bat-start", { arg: b.id, sm: true, ic: "calendar" })}${btn(b.off ? t("Reopen batch") : t("Close batch"), "bat-off", { arg: b.id, sm: true, ic: "lock" })}${btn(t("Delete batch"), "bat-del", { arg: b.id, sm: true, kind: "bad", ic: "trash" })}</div>
    <div class="mod-f"><button class="btn" data-act="pu-close">${esc(t("Close"))}</button></div>`);
});
act("bat-edit", async (el) => {
  const b = batchOf(el.dataset.arg);
  if (!b) return;
  closeModals();
  await form(t("Edit batch"), `${input("name", { label: t("Batch name"), value: b.name })}${select("gd", batchGdOptions(), b.gd || "", { label: t("For"), hint: t("Students already in the batch stay in it.") })}`, {
    validate: (d) => (!d.name.trim() ? t("Enter the batch name.") : ""),
    onSave: async (d) => { const gd = isGd(d.gd) ? d.gd : ""; await db.upd("batches/" + b.id, { name: d.name.trim(), gd }); b.name = d.name.trim(); b.gd = gd; logAct("Edited batch " + b.name); await reloadPeople(); refresh(); },
  });
});
act("bat-off", async (el) => {
  const b = batchOf(el.dataset.arg);
  if (!b) return;
  const off = !b.off;
  if (off && !(await ask(t("Close {n}? New registrations will not be added to it. Its students stay.", { n: b.name }), { ok: t("Close batch") }))) return;
  await db.upd("batches/" + b.id, { off });
  logAct((off ? "Closed batch " : "Reopened batch ") + b.name);
  closeModals();
  await reloadPeople();
  refresh();
});
act("bat-start", async (el) => {
  const b = batchOf(el.dataset.arg);
  closeModals();
  await form(t("Month start date"), input("d", { label: t("The month started on (changing it recalculates ranks)"), type: "date", value: b.start }), {
    validate: (d) => (!d.d ? t("Choose a date.") : ""),
    onSave: async (d) => { await db.upd("batches/" + b.id, { start: d.d }); b.start = d.d; await recalcBatch(b.id); logAct("Month start of " + b.name); refresh(); },
  });
});
act("bat-del", async (el) => {
  const b = batchOf(el.dataset.arg), n = S.U.filter((s) => s.bid === b.id).length;
  if (n) { closeModals(); return toast(t("Move or delete its {n} students first.", { n }), "bad"); }
  if (!(await ask(t("Delete batch {n}?", { n: b.name }), { danger: true, ok: t("Delete") }))) return;
  await db.del("batches/" + b.id);
  await db.del("bstat/" + b.id).catch(() => {});
  logAct("Deleted batch " + b.name);
  closeModals();
  await reloadPeople();
  refresh();
});

// ---------- dashboard: Batch Overview (one card per batch, click = its students) ----------
const BO_COLOR = { Science: "var(--blue)", Commerce: "var(--gold)", Arts: "var(--violet)" };
export function batchOverview() {
  if (!S.B.length) return "";
  const counts = S.B.map(countIn), total = counts.reduce((a, n) => a + n, 0);
  const cards = S.B.map((b, i) => {
    const n = counts[i], st = b.off ? ["bad", t("Closed")] : n ? ["ok", t("Active")] : ["warn", t("No students")];
    return `<button type="button" class="bo" style="--c:${BO_COLOR[b.grp] || (b.cls && +b.cls < 9 ? "var(--teal)" : "var(--blue)")}" data-act="bat-open" data-arg="${esc(b.id)}">
      <span class="bo-n">${esc(b.name)}</span>
      <span class="bo-m">${esc([clsLabel(b), batchGdLabel(b.gd)].filter(Boolean).join(" · ") || "–")}</span>
      <span class="bo-c"><b>${n}</b><small>${esc(t("Total students"))}</small></span>
      <span class="bo-s bo-s--${st[0]}">${esc(st[1])}</span></button>`;
  }).join("");
  return card(t("Batch Overview"), `<div class="bo-grid">${cards}</div>`, { cls: "bo-card", right: `<span class="row" style="gap:6px">${tag(t("{n} batches", { n: S.B.length }))}${tag(t("{n} students", { n: total }), "ok")}${btn(t("Manage"), "nav", { arg: "batches", sm: true })}</span>` });
}

// ---------- co-admin panel (admin only) ----------
page("coadmin", async () => {
  const cos = S.TC.filter((x) => x.ca), others = S.TC.filter((x) => !x.ca && x.active !== false);
  const log = (await db.recent("log", 100).catch(() => [])).sort((a, b) => b.t - a.t);
  return `${card(t("Co-admins") + ` (${cos.length}/${MAX_CO})`, `${cos.length ? `<div class="stack-s">${cos.map((x) => tcard(x, btn(t("Remove"), "tch-co", { arg: x.id, sm: true, kind: "bad" }))).join("")}</div>` : empty(t("No co-admin yet."), "shield")}
      ${cos.length < MAX_CO && others.length ? `<div class="inline mt">${select("who", [["", t("Choose a teacher")], ...others.map((x) => [x.id, x.name])], "", { id: "ca-who" })}${btn(t("Make co-admin"), "ca-make", { kind: "pri" })}</div>` : ""}
      <p class="mut sm mt">${esc(t("Co-admins manage students, batches, attendance, exams and results. They never see fees or salary."))}</p>`)}
    <div class="mt">${card(t("Activity log"), log.length ? `<div class="list">${log.map((l) => row({ title: l.msg, sub: esc(l.by + " · " + ago(l.t)) })).join("")}</div>` : empty(t("No activity yet."), "list"))}</div>`;
}, { title: "Co-admin panel" });
act("ca-make", async () => {
  const id = (document.getElementById("ca-who") || {}).value;
  if (!id) return toast(t("Choose a teacher"), "bad");
  await db.upd("users/" + id, { ca: true });
  await reloadPeople();
  refresh();
});

addBN({
  "Tick the subjects this teacher takes in this batch. None ticked = all subjects.": "এই ব্যাচে শিক্ষক যে বিষয়গুলো নেন সেগুলোতে টিক দিন। কিছু না দিলে সব বিষয়।", "Other subject names, separated by commas": "অন্য বিষয়ের নাম, কমা দিয়ে লিখুন",
  "The teacher can enter marks and update the syllabus only for the ticked subjects.": "শিক্ষক শুধু টিক দেওয়া বিষয়ের নম্বর তুলতে ও সিলেবাস আপডেট করতে পারবেন।",
  "Registration open": "রেজিস্ট্রেশন চালু", "Registration closed": "রেজিস্ট্রেশন বন্ধ",
  "{inst}: login ID {roll}, password {pw}. Please change the password after you sign in.": "{inst}: লগইন আইডি {roll}, পাসওয়ার্ড {pw}। সাইন ইনের পর পাসওয়ার্ড বদলে নিন।",
  "Login ID": "লগইন আইডি", "Copy": "কপি", "Copied": "কপি হয়েছে", "Could not copy": "কপি করা গেল না", "Email sent": "ইমেইল পাঠানো হয়েছে", "Your login details": "আপনার লগইন তথ্য",
  "Leave empty for a Boys or Girls batch: the batch decides.": "ছেলেদের বা মেয়েদের ব্যাচ হলে ফাঁকা রাখুন: ব্যাচই ঠিক করবে।", "This batch is for {w} only.": "এই ব্যাচ শুধু {w}-দের জন্য।", "Choose the batch.": "ব্যাচ বেছে নিন।",
  "Give this to the person. The password is shown only now.": "এটি ব্যক্তিকে দিন। পাসওয়ার্ড শুধু এখনই দেখা যাবে।", "Done": "সম্পন্ন", "Student added": "ছাত্র যোগ হয়েছে", "Teacher added": "শিক্ষক যোগ হয়েছে",
  "No students found.": "কোনো ছাত্র পাওয়া যায়নি।", "students": "জন ছাত্র", "Show more": "আরও দেখান", "Search by name, roll, phone": "নাম, রোল, ফোন দিয়ে খুঁজুন", "All": "সব", "All groups": "সব গ্রুপ",
  "Guardian name": "অভিভাবকের নাম", "Class (optional)": "ক্লাস (ঐচ্ছিক)", "Enter the name.": "নাম দিন।", "Choose the class.": "ক্লাস বেছে নিন।", "Choose the group (Science / Commerce / Arts).": "বিভাগ বেছে নিন (বিজ্ঞান / ব্যবসায় শিক্ষা / মানবিক)।",
  "Not found": "পাওয়া যায়নি", "Can publish": "প্রকাশ করতে পারে", "Waiting for approval": "অনুমোদনের অপেক্ষায়", "Inactive": "নিষ্ক্রিয়", "Blood group": "রক্তের গ্রুপ", "Personal monthly fee": "ব্যক্তিগত মাসিক ফি",
  "Approve": "অনুমোদন", "Reject": "বাতিল", "Edit": "সম্পাদনা", "ID card": "আইডি কার্ড", "Move batch": "ব্যাচ বদলান", "Batches": "ব্যাচ", "Personal fee": "ব্যক্তিগত ফি", "Remove co-admin": "কো-অ্যাডমিন সরান", "Make co-admin": "কো-অ্যাডমিন বানান",
  "Stop publish rights": "প্রকাশের অধিকার বন্ধ", "Allow publishing": "প্রকাশের অনুমতি দিন", "New password": "নতুন পাসওয়ার্ড", "Deactivate": "নিষ্ক্রিয় করুন", "Reactivate": "আবার চালু করুন", "Delete": "মুছুন", "Close": "বন্ধ করুন",
  "Amount (৳). Leave 0 to use the batch / default fee.": "পরিমাণ (৳)। ০ রাখলে ব্যাচ / সাধারণ ফি প্রযোজ্য।", "Make a new temporary password for {n}? The old password stops working.": "{n} এর জন্য নতুন অস্থায়ী পাসওয়ার্ড বানাবেন? পুরনো পাসওয়ার্ড আর চলবে না।",
  "Make new password": "নতুন পাসওয়ার্ড বানান", "Delete {n} for good? This cannot be undone.": "{n} কে চিরতরে মুছবেন? এটি ফেরানো যাবে না।", "Deleted": "মুছে ফেলা হয়েছে", "No teachers yet.": "এখনো কোনো শিক্ষক নেই।", "Add teacher": "শিক্ষক যোগ করুন",
  "Batches of {n}": "{n} এর ব্যাচ", "At most {n} co-admins.": "সর্বোচ্চ {n} জন কো-অ্যাডমিন।", "{n} will be able to manage students, batches, attendance and results (not fees).": "{n} ছাত্র, ব্যাচ, উপস্থিতি ও ফলাফল পরিচালনা করতে পারবেন (ফি নয়)।",
  "Registration approved": "রেজিস্ট্রেশন অনুমোদিত", "Your registration at {n} is approved. Login ID: {id}. You can use everything now.": "{n} এ আপনার রেজিস্ট্রেশন অনুমোদিত হয়েছে। লগইন আইডি: {id}। এখন সবকিছু ব্যবহার করতে পারবেন।",
  "Approved": "অনুমোদিত", "Reject {n}? The account is deleted.": "{n} কে বাতিল করবেন? অ্যাকাউন্ট মুছে যাবে।", "Rejected": "বাতিল হয়েছে", "Self-registration": "নিজে রেজিস্ট্রেশন", "Open": "খুলুন", "Closed": "বন্ধ",
  "New people can register on the sign-in page.": "নতুন মানুষ সাইন ইন পাতা থেকে রেজিস্ট্রেশন করতে পারে।", "Nobody is waiting.": "কেউ অপেক্ষায় নেই।", "Forgot password requests": "পাসওয়ার্ড ভোলার অনুরোধ", "No requests.": "কোনো অনুরোধ নেই।",
  "Recent registrations": "সাম্প্রতিক রেজিস্ট্রেশন", "Nothing yet.": "এখনো কিছু নেই।", "Dismiss": "বাদ দিন", "No account with this ID: {id}": "এই আইডির কোনো অ্যাকাউন্ট নেই: {id}", "Search batch": "ব্যাচ খুঁজুন", "Add batch": "ব্যাচ যোগ করুন",
  "{n} students": "{n} জন ছাত্র", "Month from {d}": "মাস শুরু {d}", "No batch found.": "কোনো ব্যাচ পাওয়া যায়নি।", "Batch name": "ব্যাচের নাম", "Enter the batch name.": "ব্যাচের নাম দিন।", "Month start date": "মাসের শুরুর তারিখ",
  "The month started on (changing it recalculates ranks)": "মাস শুরু হয়েছে (বদলালে র‍্যাঙ্ক আবার হিসাব হবে)", "Choose a date.": "তারিখ বেছে নিন।", "Move or delete its {n} students first.": "আগে এর {n} জন ছাত্রকে সরান বা মুছুন।",
  "Delete batch {n}?": "ব্যাচ {n} মুছবেন?", "Delete batch": "ব্যাচ মুছুন", "Co-admins": "কো-অ্যাডমিন", "No co-admin yet.": "এখনো কোনো কো-অ্যাডমিন নেই।", "Choose a teacher": "একজন শিক্ষক বেছে নিন", "Remove": "সরান",
  "Co-admins manage students, batches, attendance, exams and results. They never see fees or salary.": "কো-অ্যাডমিন ছাত্র, ব্যাচ, উপস্থিতি, পরীক্ষা ও ফলাফল পরিচালনা করেন। তারা কখনো ফি বা বেতন দেখেন না।",
  "Activity log": "কার্যকলাপ লগ", "No activity yet.": "এখনো কোনো কার্যকলাপ নেই।",
});
addBN({
  "Decides the Boys or the Girls batch.": "ছেলেদের না মেয়েদের ব্যাচ হবে তা ঠিক করে।", "Choose the gender (Male / Female).": "লিঙ্গ বেছে নিন (ছেলে / মেয়ে)।",
  "Make Boys & Girls batches": "ছেলে ও মেয়েদের ব্যাচ বানান", "Batch name (optional)": "ব্যাচের নাম (ঐচ্ছিক)", "Left empty, the name is made from the class, group and Boys / Girls.": "খালি রাখলে ক্লাস, বিভাগ ও ছেলে/মেয়ে দিয়ে নাম হবে।",
  "For": "কাদের জন্য", "Enter the batch name or choose a class.": "ব্যাচের নাম দিন অথবা ক্লাস বেছে নিন।",
  "For every class that has a batch, make the missing Boys batch and Girls batch. Nobody is moved. New students then go to the right one.": "যে ক্লাসের ব্যাচ আছে তার জন্য ছেলেদের ও মেয়েদের ব্যাচ (যেটা নেই) বানানো হবে। কাউকে সরানো হবে না। নতুন শিক্ষার্থী সঠিক ব্যাচে যাবে।",
  "Make batches": "ব্যাচ বানান", "{n} batches made.": "{n}টি ব্যাচ বানানো হয়েছে।", "Nothing to add. They already exist.": "নতুন কিছু নেই। সব ব্যাচ আগেই আছে।",
  "Edit batch": "ব্যাচ সম্পাদনা", "Batch name": "ব্যাচের নাম", "Students already in the batch stay in it.": "ব্যাচে যারা আছে তারা সেখানেই থাকবে।", "Closed": "বন্ধ",
  "Close batch": "ব্যাচ বন্ধ করুন", "Reopen batch": "ব্যাচ আবার খুলুন", "Close {n}? New registrations will not be added to it. Its students stay.": "{n} বন্ধ করবেন? নতুন রেজিস্ট্রেশন এতে যুক্ত হবে না। এর ছাত্রছাত্রীরা থাকবে।",
});
addBN({
  "Batch Overview": "ব্যাচ ওভারভিউ", "Active": "সক্রিয়", "No students": "কোনো ছাত্র নেই", "{n} batches": "{n}টি ব্যাচ", "Manage": "পরিচালনা",
});

