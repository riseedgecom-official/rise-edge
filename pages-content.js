// Library (suggestions, exam solutions), "Send to portal" (Android share), alerts and student requests.
import { db } from "./lib-db.js";
import {
  S, esc, t, page, act, onInput, onChange, onSubmit, formData, pageState, refresh, go, isStaff, isTeacher, isStudent, T, fmtDate, ago, addBN, uniq, batchOf, instName,
} from "./lib-core.js";
import { icon, avatar, tag, empty, notice, card, row, btn, chips, input, textarea, select, batchPicker, ask, toast, grpLabel } from "./lib-ui.js";
import { putFile, delFile, downloadFile, MAX_FILE, notify, timeId, getNotices, markSeen, seenKey, reloadPeople, recalcBatch } from "./lib-svc.js";
import { subjectsFor, findBatch } from "./lib-stats.js";
import { myResults } from "./pages-exams.js";

const noBatch = () => empty(isStudent() ? t("You are not in a batch yet.") : t("Add a batch first."), "layers");
const kb = (n) => (n >= 1048576 ? (n / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(n / 1024)) + " KB");
const canUpload = () => isStaff() || isTeacher();

// ================= library: suggestions and exam solutions =================
const KIND = {
  sug: { pg: "suggestions", head: "Suggestions", pre: "New suggestion: ", none: "No suggestions yet." },
  sol: { pg: "solutions", head: "Exam solutions", pre: "New exam solution: ", none: "No exam solutions yet." },
};
async function library(kind) {
  if (!S.bid) return noBatch();
  const K = KIND[kind];
  const L = (await db.list("fl", ["bid", "==", S.bid], ["kind", "==", kind])).sort((a, b) => b.t - a.t);
  const up = canUpload() ? `${batchPicker()}<form class="card stack-s mb" data-submit="lib-up" data-kind="${kind}"><h3>${esc(t("Upload"))}</h3>
      ${input("title", { label: t("Title"), maxlength: "120" })}
      ${input("link", { label: t("Link (Google Drive etc.)"), type: "url", placeholder: "https://", hint: t("Or choose a file below.") })}
      <label class="fld"><span>${esc(t("File (PDF or photo)"))}</span><input type="file" accept="application/pdf,image/*"><small>${esc(t("Up to {n} MB. Big files take time: keep the app open until it says Saved.", { n: Math.round(MAX_FILE / 1048576) }))}</small></label>
      ${S.B.length > 1 ? `<div class="fld"><span>${esc(t("Send to batches"))}</span><div class="card" style="padding:4px 12px">${S.B.map((b) => `<label class="check"><span>${esc(b.name)}</span><input type="checkbox" name="b_${esc(b.id)}" ${b.id === S.bid ? "checked" : ""}></label>`).join("")}</div></div>` : ""}
      <button class="btn btn--pri" type="submit">${icon("upload")}${esc(t("Upload"))}</button></form>` : "";
  return `${up}${card(t(K.head), L.length ? `<div class="list">${L.map((x) => row({
    title: x.title,
    sub: `${esc(ago(x.t))}${x.link ? " · " + esc(t("Link")) : x.size ? " · " + kb(x.size) : ""}`,
    right: `${btn(x.link ? t("Open") : t("Download"), "lib-open", { arg: x.id, sm: true, ic: x.link ? "link" : "download" })}${isStaff() ? btn(t("Delete"), "lib-del", { arg: x.id, sm: true, kind: "bad", ic: "trash" }) : ""}`,
  })).join("")}</div>` : empty(t(K.none), "file"))}`;
}
page("suggestions", () => library("sug"), { title: "Suggestions" });
page("solutions", () => library("sol"), { title: "Exam solutions" });

onSubmit("lib-up", async (b) => {
  const form = b.closest("form"), kind = form.dataset.kind, f = formData(form), file = form.querySelector("input[type=file]").files[0];
  const title = f.title.trim(), link = f.link.trim();
  if (!title || (!link && !file)) return toast(t("Add a title and a link or a file"), "bad");
  if (link && !/^https?:\/\//i.test(link)) return toast(t("The link must start with http:// or https://"), "bad");
  if (!link && file.size > MAX_FILE) return toast(t("This file is too big (max {n} MB)", { n: Math.round(MAX_FILE / 1048576) }), "bad");
  const bids = S.B.length > 1 ? S.B.filter((x) => f["b_" + x.id]).map((x) => x.id) : [S.bid];
  if (!bids.length) return toast(t("Choose at least one batch"), "bad");
  let k = 0;
  for (const bid of bids) {
    k++;
    if (!link) await putFile(bid, kind, title, file, file.name, (i, n) => toast(t("Uploading {k}/{m}: part {i}/{n}. Keep the app open.", { k, m: bids.length, i, n })));
    else await db.set("fl/" + db.newId("fl"), { bid, kind, title, link, name: "", t: Date.now() });
    notify("batch", KIND[kind].pre + title, bid);
  }
  toast(t("Saved"), "ok"); refresh();
});
act("lib-open", (el) => downloadFile(el.dataset.arg, (i, n) => n > 1 && toast(t("Downloading {i}/{n}…", { i, n }))));
act("lib-del", async (el) => {
  if (!(await ask(t("Delete this file?"), { danger: true, ok: t("Delete") }))) return;
  await delFile(el.dataset.arg); refresh();
});

// ================= Android "Share" -> Rise Edge =================
// sw.js keeps the shared files in the cache "rise-share"; here the teacher chooses what they are and for which batches.
let SH = null;
async function sharedFiles() {
  try {
    const c = await caches.open("rise-share"), ks = (await c.keys()).sort((a, b) => a.url.localeCompare(b.url, undefined, { numeric: true })), out = [];
    for (const k of ks) {
      const r = await c.match(k);
      if (r) out.push({ name: decodeURIComponent(r.headers.get("X-Name") || "file"), blob: await r.blob() });
    }
    return out;
  } catch (e) { return []; }
}
const shClear = () => { try { return caches.delete("rise-share").catch(() => {}); } catch (e) { return null; } };
const SHK = [["sug", "Suggestion", "file"], ["sol", "Exam solution", "doc"]];
page("share", async () => {
  if (!SH || !SH.files.length) {
    const files = await sharedFiles();
    SH = { files, kind: "", sel: [], title: files.length === 1 ? files[0].name.replace(/\.[^.]+$/, "") : "" };
  }
  if (!SH.files.length) return `${empty(t("Nothing to send. Open a file in another app, tap Share, then choose this app."), "upload")}<div class="tc mt">${btn(t("Dashboard"), "nav", { arg: "dashboard", kind: "pri" })}</div>`;
  return `<div class="card stack-s"><h3>${esc(t("Send to portal"))}</h3>
    <div class="list">${SH.files.map((x) => row({ title: x.name, sub: kb(x.blob.size) })).join("")}</div>
    ${SH.files.length === 1 ? input("title", { label: t("Title"), value: SH.title, "data-input": "sh-title", maxlength: "120" }) : ""}
    <div class="fld"><span>${esc(t("1. What is it?"))}</span><div class="row">${SHK.map(([k, l, ic]) => btn(t(l), "sh-kind", { arg: k, ic, kind: SH.kind === k ? "pri" : "" })).join("")}</div></div>
    ${SH.kind ? `<div class="fld"><span>${esc(t("2. Choose batch (one or more)"))}</span>${btn(t("All batches"), "sh-all", { sm: true })}<div class="card" style="padding:4px 12px;margin-top:8px">${S.B.map((b) => `<label class="check"><span>${esc(b.name)}</span><input type="checkbox" data-change="sh-batch" data-arg="${esc(b.id)}" ${SH.sel.includes(b.id) ? "checked" : ""}></label>`).join("") || `<div class="mut" style="padding:10px 0">${esc(t("No batch."))}</div>`}</div></div>` : ""}
    <div class="row">${SH.kind && SH.sel.length ? btn(t("Send"), "sh-send", { kind: "pri", ic: "upload" }) : ""}${btn(t("Cancel"), "sh-cancel", { ic: "x" })}</div>
    <p class="mut sm" id="sh-msg"></p></div>`;
}, { title: "Send to portal" });
onInput("sh-title", (el) => { if (SH) SH.title = el.value; });
act("sh-kind", (el) => { SH.kind = el.dataset.arg; refresh(); });
onChange("sh-batch", (el) => { const i = SH.sel.indexOf(el.dataset.arg); i < 0 ? SH.sel.push(el.dataset.arg) : SH.sel.splice(i, 1); refresh(); });
act("sh-all", () => { SH.sel = SH.sel.length === S.B.length ? [] : S.B.map((b) => b.id); refresh(); });
act("sh-cancel", async () => { await shClear(); SH = null; go("dashboard"); });
act("sh-send", async () => {
  const s = SH;
  if (!s || !s.kind || !s.sel.length) return;
  const msg = document.getElementById("sh-msg"), items = s.files.map((x) => ({ name: x.name, blob: x.blob, title: s.files.length === 1 && s.title.trim() ? s.title.trim() : x.name.replace(/\.[^.]+$/, "") }));
  const total = items.length * s.sel.length, pre = { sug: KIND.sug.pre, sol: KIND.sol.pre }[s.kind];
  if (items.some((x) => x.blob.size > MAX_FILE)) return toast(t("This file is too big (max {n} MB)", { n: Math.round(MAX_FILE / 1048576) }), "bad");
  let k = 0;
  for (const bid of s.sel) {
    for (const x of items) {
      k++;
      const id = await putFile(bid, s.kind, x.title, x.blob, x.name, (i, n) => { if (msg) msg.textContent = t("Sending {k}/{m} (part {i}/{n})… keep the app open", { k, m: total, i, n }); });
      notify("batch", pre + x.title, bid);
    }
  }
  await shClear();
  S.bid = s.sel[0];
  const pg = { sug: "suggestions", sol: "solutions" }[s.kind];
  SH = null;
  toast(t("Sent"), "ok");
  go(pg);
});

// ================= alerts =================
page("alerts", async () => {
  const L = await getNotices(true);
  let seen = 0;
  try { seen = +localStorage.getItem(seenKey()) || 0; } catch (e) { /* ignore */ }
  const staff = isStaff() || isTeacher();
  let sent = [];
  if (isStaff() && S.bid) sent = (await db.recent("nt", 20, ["to", "==", "batch"], ["bid", "==", S.bid]).catch(() => [])).sort((a, b) => b.d - a.d);
  const ids = new Set(L.map((n) => n.id));
  const nrow = (n) => row({ title: n.t, sub: `${esc(new Date(n.d).toLocaleString())}`, right: `${n.d > seen ? tag(t("NEW"), "bad") : ""}${isStaff() ? btn(t("Delete"), "al-del", { arg: n.id, sm: true, kind: "bad", ic: "trash" }) : ""}` });
  return `${staff ? `<form class="card stack-s mb" data-submit="al-send"><h3>${esc(t("Send notice to a batch"))}</h3>
      ${textarea("text", { placeholder: t("Write the notice"), rows: 3 })}
      ${S.B.length > 1 ? select("to", [...S.B.map((b) => [b.id, b.name]), ["__all", t("All batches")]], S.bid || "") : ""}
      <button class="btn btn--pri" type="submit">${icon("mega")}${esc(t("Send"))}</button></form>` : ""}
    ${card(t("Notifications"), L.length ? `<div class="list">${L.map(nrow).join("")}</div>` : empty(t("No notifications."), "bell"))}
    ${sent.filter((n) => !ids.has(n.id)).length ? `<div class="mt">${card(t("Sent to this batch"), `<div class="list">${sent.filter((n) => !ids.has(n.id)).map(nrow).join("")}</div>`)}</div>` : ""}`;
}, { title: "Alerts", after: () => { markSeen(); window.dispatchEvent(new Event("rise-seen")); } });
onSubmit("al-send", async (b) => {
  const f = formData(b.closest("form")), text = (f.text || "").trim();
  if (!text) return toast(t("Write the notice"), "bad");
  const bids = S.B.length > 1 ? (f.to === "__all" ? S.B.map((x) => x.id) : [f.to]) : [S.bid];
  for (const bid of bids) await db.set("nt/" + timeId(), { to: "batch", t: text, d: Date.now(), bid });
  toast(t("Sent"), "ok"); refresh();
});
act("al-del", async (el) => { await db.del("nt/" + el.dataset.arg); refresh(); });

// ================= requests =================
const RT = { topic: "Topic review", recheck: "Recheck", leave: "Leave application", subject: "Change group", school: "Change school / college" };
const RS = { new: ["Not seen yet", "warn"], seen: ["Seen - awaiting decision", "warn"], approved: ["Approved", "ok"], rejected: ["Rejected", "bad"] };
const rqTxt = (q) => (q.type === "leave" ? `${fmtDate(q.from)} → ${fmtDate(q.to)}${q.d ? " · " + q.d : ""}` : q.type === "subject" || q.type === "school" ? `${q.old ? t(q.old) : "–"} → ${t(q.nv)}${q.d ? " · " + q.d : ""}` : q.d || "");
const RQ = () => pageState("rq");
let RQL = [];
const stBox = (q) => { const z = RS[q.st] || RS.new; return `<b class="${z[1]}">${esc(t(z[0]))}</b>`; };

page("requests", async () => (isStudent() ? studentRequests() : staffRequests()), { title: "Requests" });

async function studentRequests() {
  if (!S.me.bid) return empty(t("You are not in a batch yet."), "layers");
  const st = RQ(); st.k = st.k || "topic";
  const b = S.B[0] || {}, [L, sd, XR] = await Promise.all([db.list("rq", ["sid", "==", S.pid]), st.k === "topic" ? db.get("sd/" + S.me.bid).catch(() => null) : null, st.k === "recheck" ? myResults(true) : null]);
  L.sort((a, c) => c.t - a.t);
  const grp = S.me.grp || b.grp || "";
  let fields = "";
  if (st.k === "topic") {
    const subs = subjectsFor(b.cls, grp, sd);
    const cur = subs.find((x) => x.s === st.subj) || subs[0];
    if (cur) st.subj = cur.s;
    const pick = (st.pick = st.pick || {});
    fields = subs.length ? `<p class="mut">${esc(t("Choose the subject, then tick every topic you want reviewed."))}</p>${select("subj", subs.map((x) => x.s), cur.s, { "data-change": "rq-subj" })}
      <div class="pick">${cur.t.map((x) => `<label class="check"><input type="checkbox" data-change="rq-top" value="${esc(x)}" ${(pick[cur.s] || []).includes(x) ? "checked" : ""}><span>${esc(x)}</span></label>`).join("")}</div>
      <p class="mut sm" id="rq-cnt">${esc(pickedText())}</p>${input("d", { placeholder: t("Note (optional)") })}`
      : `<p class="mut">${esc(t("No syllabus for this batch yet."))}</p>${input("d", { placeholder: t("Subject and topic") })}`;
  } else if (st.k === "recheck") {
    const wait = new Set(L.filter((q) => q.type === "recheck" && (q.st === "new" || q.st === "seen")).map((q) => q.eid));
    const X = XR.sort((a, c) => (c.date > a.date ? 1 : c.date < a.date ? -1 : 0));
    fields = X.length ? `<p class="mut">${esc(t("Choose the exam you want rechecked."))}</p>
      <div class="pick">${X.map((x) => `<label class="check"><input type="radio" name="ex" data-change="rq-ex" value="${esc(x.eid)}" ${wait.has(x.eid) ? "disabled" : ""} ${st.ex === x.eid ? "checked" : ""}><span><b>${esc(x.title)}</b><span class="mut sm" style="display:block">${esc(fmtDate(x.date))}</span></span>${wait.has(x.eid) ? tag(t("Requested"), "warn") : ""}</label>`).join("")}</div>
      ${input("d", { placeholder: t("Subject and reason (optional)") })}`
      : `<p class="mut">${esc(t("No published exam yet."))}</p>`;
  }
  else if (st.k === "leave") fields = `<div class="grid g2">${input("from", { type: "date", label: t("From"), value: T() })}${input("to", { type: "date", label: t("To") })}</div>${input("d", { placeholder: t("Reason") })}`;
  else if (st.k === "subject") fields = `<p class="mut">${esc(t("Current group"))}: ${esc(grp ? t(grp) : "–")}</p>${select("nv", ["Science", "Commerce", "Arts"].map((g) => [g, t(g)]))}${input("d", { placeholder: t("Reason (optional)") })}`;
  else fields = `<p class="mut">${esc(t("Current"))}: ${esc(S.me.school || "–")}</p>${input("nv", { placeholder: t("New school / college name") })}${input("d", { placeholder: t("Note (optional)") })}`;
  return `${chips(Object.keys(RT).map((k) => ({ k, label: t(RT[k]) })), st.k, "rq-kind")}
    <form class="card stack-s" data-submit="rq-send"><h3>${esc(t(RT[st.k]))}</h3>${fields}<button class="btn btn--pri" type="submit" ${st.k === "recheck" && !XR.length ? "disabled" : ""}>${icon("check")}${esc(t("Send request"))}</button></form>
    <div class="mt">${card(t("My requests"), L.length ? `<div class="list">${L.map((q) => `<div class="item"><div class="item-b"><b class="item-t">${esc(t(RT[q.type] || q.type))} ${stBox(q)}</b><span class="mut">${esc(rqTxt(q))} · ${esc(ago(q.t))}</span>${q.rp ? `<span><b>${esc(t("Reply"))}:</b> ${esc(q.rp)}</span>` : ""}</div></div>`).join("")}</div>` : empty(t("No requests yet."), "inbox"))}</div>`;
}
act("rq-kind", (el) => { const st = RQ(); st.k = el.dataset.arg; st.subj = ""; st.ex = ""; refresh(); });
onChange("rq-subj", (el) => { RQ().subj = el.value; refresh(); });
const pickedN = () => Object.values(RQ().pick || {}).reduce((n, a) => n + a.length, 0);
const pickedText = () => (pickedN() ? t("{n} topics selected", { n: pickedN() }) : t("No topic selected yet."));
onChange("rq-top", (el) => {
  const st = RQ(), a = ((st.pick = st.pick || {})[st.subj] = (st.pick || {})[st.subj] || []);
  const i = a.indexOf(el.value);
  if (el.checked && i < 0) a.push(el.value);
  if (!el.checked && i >= 0) a.splice(i, 1);
  const c = document.getElementById("rq-cnt"); if (c) c.textContent = pickedText();
});
onChange("rq-ex", (el) => { RQ().ex = el.value; });

// one recheck request for one exam (used by the Requests page and by the dashboard link)
async function sendRecheck(x, note = "") {
  const me = S.me, rc = pageState("rc");
  rc.done = rc.done || {};
  const mine = await db.list("rq", ["sid", "==", S.pid]);
  if (mine.some((q) => q.type === "recheck" && q.eid === x.eid && (q.st === "new" || q.st === "seen"))) { rc.done[x.eid] = 1; toast(t("You already asked for a recheck of this exam."), "bad"); return false; }
  await db.add("rq", { sid: S.pid, name: me.name, roll: me.roll, bid: me.bid, type: "recheck", h: "t", eid: x.eid, d: (x.title + " · " + fmtDate(x.date) + (note ? " · " + note : "")).slice(0, 400), st: "new", rp: "", t: Date.now() });
  rc.done[x.eid] = 1;
  toast(t("Recheck request sent"), "ok");
  return true;
}
act("rc-ask", async (el) => {
  const x = (await myResults()).find((r) => r.eid === el.dataset.arg);
  if (!x) return toast(t("Not found"), "bad");
  await sendRecheck(x);
  refresh();
});
onSubmit("rq-send", async (b) => {
  const f = formData(b.closest("form")), k = RQ().k, me = S.me;
  if (k === "recheck") {
    const x = (await myResults()).find((r) => r.eid === f.ex);
    if (!x) return toast(t("Choose the exam"), "bad");
    if (await sendRecheck(x, (f.d || "").trim().slice(0, 200))) { RQ().ex = ""; refresh(); }
    return;
  }
  const q = { sid: S.pid, name: me.name, roll: me.roll, bid: me.bid, type: k, h: k === "topic" ? "t" : "a", d: (f.d || "").trim().slice(0, 300), st: "new", rp: "", t: Date.now() };
  if (k === "topic") {
    const parts = Object.entries(RQ().pick || {}).filter(([, a]) => a.length).map(([sub, a]) => sub + ": " + a.join(", "));
    if (!parts.length) { if (!q.d) return toast(t("Tick at least one topic"), "bad"); } else q.d = (parts.join(" · ") + (q.d ? " · " + q.d : "")).slice(0, 800);
  } else if (k === "leave") {
    q.from = f.from; q.to = f.to || f.from;
    if (!q.from) return toast(t("Choose the leave date"), "bad");
    if (q.to < q.from) return toast(t("The end date is before the start date"), "bad");
  } else if (k === "subject") { q.nv = f.nv; q.old = me.grp || ""; }
  else if (k === "school") {
    q.nv = (f.nv || "").trim().slice(0, 120); q.old = me.school || "";
    if (!q.nv) return toast(t("Write the new school/college name"), "bad");
  } else if (!q.d) return toast(t("Write the details"), "bad");
  await db.add("rq", q);
  if (k === "topic") RQ().pick = {};
  toast(t("Request sent"), "ok"); refresh();
});

async function staffRequests() {
  const st = RQ(); st.f = st.f || "open";
  RQL = isTeacher() ? (await Promise.all(S.B.map((b) => db.list("rq", ["bid", "==", b.id], ["h", "==", "t"])))).flat() : await db.list("rq");
  RQL.sort((a, b) => b.t - a.t);
  const open = RQL.filter((q) => q.st === "new" || q.st === "seen");
  await Promise.all(open.filter((q) => q.st === "new").map((q) => db.upd("rq/" + q.id, { st: "seen" }).then(() => { q.st = "seen"; }).catch(() => {})));
  const L = st.f === "open" ? open : RQL.filter((q) => q.st === "approved" || q.st === "rejected");
  return `${chips([{ k: "open", label: `${t("Pending")} (${open.length})` }, { k: "done", label: t("Done") }], st.f, "rq-filter")}
    ${L.length ? `<div class="stack">${L.map((q) => {
      const done = q.st === "approved" || q.st === "rejected", u = S.U.find((x) => x.id === q.sid);
      return `<div class="card"><div class="row" style="justify-content:space-between"><div><b>${esc(q.name)}</b> <span class="mut sm">${esc(t("Roll {r}", { r: q.roll }))}${u ? " · " + esc((batchOf(u.bid) || {}).name || "") : ""}</span></div>${stBox(q)}</div>
        <div class="mt"><b>${esc(t(RT[q.type] || q.type))}</b><div class="mut">${esc(rqTxt(q))} · ${esc(ago(q.t))}</div></div>
        ${done ? (q.rp ? `<p><b>${esc(t("Reply"))}:</b> ${esc(q.rp)}</p>` : "") : `<div class="stack-s mt"><input id="rr-${esc(q.id)}" placeholder="${esc(t("Reply (optional)"))}" maxlength="200"><div class="row">${btn(t("Approve"), "rq-ok", { arg: q.id, kind: "pri", sm: true, ic: "check" })}${btn(t("Reject"), "rq-no", { arg: q.id, kind: "bad", sm: true, ic: "x" })}</div></div>`}</div>`;
    }).join("")}</div>` : empty(st.f === "open" ? t("No pending requests.") : t("No requests yet."), "inbox")}`;
}
act("rq-filter", (el) => { RQ().f = el.dataset.arg; refresh(); });

// what an approved request changes (admin / co-admin only; a teacher only answers topic and recheck requests)
async function applyRequest(q) {
  const u = S.U.find((x) => x.id === q.sid) || (await db.get("users/" + q.sid)) || {};
  if (q.type === "school") await db.upd("users/" + q.sid, { school: q.nv });
  else if (q.type === "leave") {
    const ds = [];
    for (let d = new Date(q.from + "T00:00:00"), e = new Date((q.to || q.from) + "T00:00:00"); d <= e && ds.length < 31; d.setDate(d.getDate() + 1)) ds.push(d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"));
    await db.upd("users/" + q.sid, { lv: uniq([...(u.lv || []), ...ds]) });
  } else if (q.type === "subject") {
    const old = batchOf(u.bid), nb = old ? findBatch(S.B, old.cls, q.nv, u.gd || old.gd) : null, patch = { grp: q.nv };
    if (nb && nb.id !== u.bid) { patch.bid = nb.id; patch.cls = nb.cls || u.cls || ""; }
    await db.upd("users/" + q.sid, patch);
    await reloadPeople();
    if (patch.bid) { await recalcBatch(old.id); await recalcBatch(nb.id); }
  }
}
async function decide(id, ok) {
  const q = RQL.find((x) => x.id === id);
  if (!q || q.st === "approved" || q.st === "rejected") return;
  const rp = ((document.getElementById("rr-" + id) || {}).value || "").trim();
  if (ok && isStaff()) await applyRequest(q);
  await db.upd("rq/" + id, { st: ok ? "approved" : "rejected", rp });
  notify(q.sid, t(ok ? "Request approved: {r}" : "Request rejected: {r}", { r: t(RT[q.type] || q.type) }) + (rp ? " - " + rp : ""));
  refresh();
}
act("rq-ok", (el) => decide(el.dataset.arg, true));
act("rq-no", (el) => decide(el.dataset.arg, false));

// number of requests waiting (for the dashboard)
export async function pendingRequests() {
  try {
    const L = isTeacher() ? (await Promise.all(S.B.map((b) => db.list("rq", ["bid", "==", b.id], ["h", "==", "t"])))).flat() : isStaff() ? await db.list("rq") : [];
    return L.filter((q) => q.st === "new" || q.st === "seen").length;
  } catch (e) { return 0; }
}

addBN({
  "Choose the subject, then tick every topic you want reviewed.": "বিষয় বেছে নিন, তারপর যতগুলো টপিক রিভিউ চান সবকটিতে টিক দিন।", "{n} topics selected": "{n}টি টপিক বাছা হয়েছে", "No topic selected yet.": "এখনো কোনো টপিক বাছা হয়নি।", "Tick at least one topic": "অন্তত একটি টপিকে টিক দিন",
  "Choose the exam you want rechecked.": "যে পরীক্ষা রিচেক করাতে চান সেটি বেছে নিন।", "Requested": "অনুরোধ করা হয়েছে", "Subject and reason (optional)": "বিষয় ও কারণ (ঐচ্ছিক)", "Choose the exam": "পরীক্ষা বেছে নিন",
  "Recheck request sent": "রিচেকের অনুরোধ পাঠানো হয়েছে", "You already asked for a recheck of this exam.": "এই পরীক্ষার রিচেক আপনি আগেই চেয়েছেন।",
  "Upload": "আপলোড", "Title": "শিরোনাম", "Link (Google Drive etc.)": "লিংক (গুগল ড্রাইভ ইত্যাদি)", "Or choose a file below.": "অথবা নিচে ফাইল বেছে নিন।", "File (PDF or photo)": "ফাইল (PDF বা ছবি)",
  "Up to {n} MB. Big files take time: keep the app open until it says Saved.": "সর্বোচ্চ {n} MB। বড় ফাইলে সময় লাগে: “সংরক্ষিত” না দেখা পর্যন্ত অ্যাপ খোলা রাখুন।", "Send to batches": "যেসব ব্যাচে পাঠাবেন",
  "Suggestions": "সাজেশন", "Exam solutions": "পরীক্ষার সমাধান", "Link": "লিংক", "Open": "খুলুন", "Download": "ডাউনলোড", "No suggestions yet.": "এখনো কোনো সাজেশন নেই।", "No exam solutions yet.": "এখনো কোনো সমাধান নেই।",
  "Add a title and a link or a file": "শিরোনাম এবং লিংক বা ফাইল দিন", "The link must start with http:// or https://": "লিংক http:// বা https:// দিয়ে শুরু হতে হবে", "This file is too big (max {n} MB)": "ফাইলটি অনেক বড় (সর্বোচ্চ {n} MB)",
  "Choose at least one batch": "অন্তত একটি ব্যাচ বেছে নিন", "Uploading {k}/{m}: part {i}/{n}. Keep the app open.": "আপলোড হচ্ছে {k}/{m}: অংশ {i}/{n}। অ্যাপ খোলা রাখুন।", "Downloading {i}/{n}…": "ডাউনলোড হচ্ছে {i}/{n}…", "Delete this file?": "এই ফাইল মুছবেন?",
  "Nothing to send. Open a file in another app, tap Share, then choose this app.": "পাঠানোর মতো কিছু নেই। অন্য অ্যাপে ফাইল খুলে Share চাপুন, তারপর এই অ্যাপ বেছে নিন।", "Dashboard": "ড্যাশবোর্ড", "Send to portal": "পোর্টালে পাঠান",
  "1. What is it?": "১. এটি কী?", "Homework": "হোমওয়ার্ক", "Suggestion": "সাজেশন", "Exam solution": "পরীক্ষার সমাধান", "2. Choose batch (one or more)": "২. ব্যাচ বেছে নিন (এক বা একাধিক)", "All batches": "সব ব্যাচ", "No batch.": "কোনো ব্যাচ নেই।",
  "Send": "পাঠান", "Cancel": "বাতিল", "Sending {k}/{m} (part {i}/{n})… keep the app open": "পাঠানো হচ্ছে {k}/{m} (অংশ {i}/{n})… অ্যাপ খোলা রাখুন", "Sent": "পাঠানো হয়েছে",
  "Send notice to a batch": "ব্যাচে নোটিশ পাঠান", "Write the notice": "নোটিশ লিখুন", "Notifications": "নোটিফিকেশন", "No notifications.": "কোনো নোটিফিকেশন নেই।", "Sent to this batch": "এই ব্যাচে পাঠানো", "NEW": "নতুন",
  "Topic review": "টপিক রিভিউ", "Recheck": "রিচেক", "Leave application": "ছুটির আবেদন", "Change group": "গ্রুপ পরিবর্তন", "Change school / college": "স্কুল / কলেজ বদল",
  "Not seen yet": "এখনো দেখা হয়নি", "Seen - awaiting decision": "দেখা হয়েছে - সিদ্ধান্তের অপেক্ষায়", "Approved": "অনুমোদিত", "Rejected": "বাতিল হয়েছে",
  "Choose the subject and the topic you want reviewed.": "যে বিষয় ও টপিক রিভিউ চান তা বেছে নিন।", "Note (optional)": "নোট (ঐচ্ছিক)", "No syllabus for this batch yet.": "এই ব্যাচের সিলেবাস এখনো নেই।", "Subject and topic": "বিষয় ও টপিক",
  "Exam name, subject and reason": "পরীক্ষার নাম, বিষয় ও কারণ", "From": "থেকে", "To": "পর্যন্ত", "Reason": "কারণ", "Current group": "বর্তমান গ্রুপ", "Reason (optional)": "কারণ (ঐচ্ছিক)", "Current": "বর্তমান", "New school / college name": "নতুন স্কুল / কলেজের নাম",
  "Send request": "অনুরোধ পাঠান", "My requests": "আমার অনুরোধ", "Reply": "উত্তর", "No requests yet.": "এখনো কোনো অনুরোধ নেই।", "Write the details": "বিস্তারিত লিখুন", "Choose the leave date": "ছুটির তারিখ বেছে নিন", "The end date is before the start date": "শেষের তারিখ শুরুর আগে",
  "Write the new school/college name": "নতুন স্কুল/কলেজের নাম লিখুন", "Request sent": "অনুরোধ পাঠানো হয়েছে", "Pending": "অপেক্ষায়", "Done": "সম্পন্ন", "Reply (optional)": "উত্তর (ঐচ্ছিক)", "No pending requests.": "কোনো অপেক্ষমাণ অনুরোধ নেই।",
  "Request approved: {r}": "অনুরোধ অনুমোদিত: {r}", "Request rejected: {r}": "অনুরোধ বাতিল: {r}", "Science": "বিজ্ঞান", "Commerce": "ব্যবসায় শিক্ষা", "Arts": "মানবিক",
});
