// Fees: admin panel (student fees, add fee, payment requests, teacher salary) and the student's "my fees".
// Co-admins and teachers never see any of this (canFees() = main admin only).
import { db } from "./lib-db.js";
import {
  S, esc, t, page, act, onInput, onChange, onSubmit, formData, pageState, refresh, go, canFees, isStudent, isTeacher, instName, T, fmtDate, ago, money, addBN,
  activeStudents, curBatch, n2, num, monthLabel, batchOf,
} from "./lib-core.js";
import { icon, avatar, tag, empty, notice, card, row, btn, chips, input, select, batchPicker, ask, askText, form, toast, showDoc, stat, modal, closeModals, donut } from "./lib-ui.js";
import { notify, saveInst, defaultFee, shrinkImage } from "./lib-svc.js";
import { feeFor, paidIn, feeStart, feePlan, monthStatus, nextMonth, manualState, manualDue } from "./lib-stats.js";

const F = () => pageState("fe");
const ctx = (BF) => ({ INST: S.INST, BF });
const bfMap = (list) => { const o = {}; list.forEach((x) => { o[x.bid + "_" + x.m] = x.amt; }); return o; };
// one month: [css class, word]
const WORD = { paid: ["ok", "Paid"], partial: ["warn", "Partial"], unpaid: ["bad", "Unpaid"], soon: ["", "Not due yet"], none: ["", "Not registered yet"] };
const stateOf = (r) => (r.pend ? ["warn", t("Waiting for approval")] : [WORD[r.state][0], t(WORD[r.state][1])]);

page("fees", async () => {
  if (isStudent()) return studentFees();
  if (!canFees()) return notice(esc(t("Only the admin can open Fees.")), "warn");
  const st = F(); st.tab = st.tab || "s";
  const tabs = chips([{ k: "s", label: t("Student fees") }, { k: "a", label: t("Add fee") }, { k: "p", label: t("Payment") }], st.tab, "fe-tab");
  return tabs + (st.tab === "a" ? await addFeeTab() : st.tab === "p" ? await salaryTab() : await studentsTab());
}, { title: "Fees" });
act("fe-tab", (el) => { F().tab = el.dataset.arg; refresh(); });

// ---------- admin: student fees + payment requests ----------
let BFADM = {};
async function studentsTab() {
  const st = F(), cur = T().slice(0, 7);
  st.m = st.m || nextMonth(cur, -1);   // the month whose fee became due on the 1st of this month
  const [R, P, bf] = await Promise.all([db.list("pr", ["st", "==", "new"]).catch(() => []), db.list("pay", ["m", "==", st.m]).catch(() => []), db.list("bf").catch(() => [])]);
  BFADM = bfMap(bf);
  const reqs = R.sort((a, b) => a.t - b.t);
  const L = S.bid ? activeStudents() : [];
  const lines = L.map((s) => { const start = feeStart(s, P); return { s, unset: !start, r: monthStatus(s, curBatch(), st.m, T(), ctx(BFADM), P, start || cur) }; });
  const billed = lines.filter((x) => x.r.state !== "none"), got = n2(billed.reduce((a, x) => a + x.r.paid, 0)), tot = n2(billed.reduce((a, x) => a + x.r.fee, 0));
  const unpaid = billed.filter((x) => x.r.state === "unpaid" || x.r.state === "partial").length;
  return `${reqs.length ? card(t("Payment requests") + ` (${reqs.length})`, `<div class="stack">${reqs.map((r) => `<div class="card"><b>${esc(r.name)}</b> <span class="mut sm">${esc(t("Roll {r}", { r: r.roll }))}</span><div class="mut">${esc(monthLabel(r.m))} · ${esc(r.k === "online" ? t("Online") : t("Cash"))}${r.tx ? " · " + esc(r.tx) : ""} · ${ago(r.t)}</div>
      <div class="inline mt"><input type="number" step="any" min="1" id="pa-${esc(r.id)}" value="${r.amt}" inputmode="decimal">${r.hi ? btn(t("Screenshot"), "fe-shot", { arg: r.id, ic: "image" }) : ""}</div>
      <div class="row mt">${btn(t("Approve"), "fe-ok", { arg: r.id, kind: "pri", sm: true, ic: "check" })}${btn(t("Reject"), "fe-no", { arg: r.id, kind: "bad", sm: true, ic: "x" })}</div></div>`).join("")}</div>`) : ""}
  <div class="mt">${batchPicker()}</div>
  ${input("m", { type: "month", value: st.m, "data-change": "fe-month", label: t("Month"), hint: t("The fee of a month is due from the 1st day of the next month.") })}
  ${S.bid ? `<form class="card stack-s mt" data-submit="fe-pay"><h3>${esc(t("Student payment"))}</h3>${select("sid", L.map((s) => [s.id, s.name]), "", { label: t("Student") })}
    <div class="grid g2">${input("amt", { type: "number", step: "any", min: "1", label: t("Amount (৳)"), inputmode: "decimal" })}${select("method", [["Cash", t("Cash")], ["bKash", "bKash"], ["Nagad", "Nagad"], ["Rocket", "Rocket"], ["Bank", t("Bank")], ["Other", t("Other")]], "Cash", { label: t("Method") })}</div>
    ${input("tx", { label: t("Transaction ID (optional)") })}<button class="btn btn--pri" type="submit">${icon("check")}${esc(t("Add payment"))}</button></form>
  <div class="card mt"><div class="card-h"><h3>${esc(monthLabel(st.m))}</h3></div>
    ${billed.length ? `<p class="mut sm">${esc(t("Collected {a} of {b}", { a: money(got), b: money(tot) }))}${unpaid ? ` · <b class="bad">${esc(t("{n} not fully paid", { n: unpaid }))}</b>` : ""}</p>` : ""}
    <div class="list">${lines.map(({ s, r, unset }) => {
    const x = r.state === "none" ? ["", unset ? t("Set first fee month") : t("Not registered yet")] : stateOf(r);
    const sub = r.state === "none" ? (unset ? t("The first fee month is not known. Open the student and set it.") : t("No fee for this month")) : `${money(r.paid)} / ${money(r.fee)}${r.state === "soon" ? " · " + t("Due from {d}", { d: fmtDate(r.dueOn) }) : ""}`;
    const word = r.paid > 0 && r.state !== "none" ? `<button type="button" class="fe-st fe-st--${x[0] === "ok" ? "ok" : "warn"}" data-act="fe-st" data-arg="${esc(s.id + "|" + st.m + "|")}">${esc(x[1])}${icon("down")}</button>` : `<b class="${x[0] || (unset ? "warn" : "mut")}">${esc(x[1])}</b>`;
    return row({ av: avatar(s, 36), title: s.name, sub, right: `${r.paid > 0 ? btn(t("Receipt"), "fe-rcpt", { arg: s.id, sm: true, ic: "doc" }) : ""}${word}`, act: "open-user", arg: s.id });
  }).join("") || empty(t("No students."), "users")}</div></div>` : ""}`;
}
onChange("fe-month", (el) => { if (el.value) { F().m = el.value; refresh(); } });
onSubmit("fe-pay", async (el) => {
  const f = formData(el.closest("form")), a = num(f.amt), st = F(), tx = f.tx.trim();
  if (!(a > 0)) return toast(t("Enter the amount"), "bad");
  if (tx && (await db.list("pay", ["tx", "==", tx])).length) return toast(t("This Transaction ID is already used"), "bad");
  await db.add("pay", { sid: f.sid, m: st.m, amt: a, method: f.method, tx, d: T(), t: Date.now() });
  notify(f.sid, t("Payment received: ৳{a} ({m})", { a, m: st.m }));
  toast(t("Saved"), "ok"); refresh();
});
act("fe-shot", async (el) => {
  const d = await db.get("pi/" + el.dataset.arg);
  if (!d) return toast(t("Screenshot not found"), "bad");
  showDoc(`<div class="paper tc"><img src="${esc(d.img)}" alt="" style="max-width:100%"></div>`);
});
act("fe-ok", async (el) => {
  const id = el.dataset.arg, q = await db.get("pr/" + id);
  if (!q || q.st !== "new") return toast(t("Already handled"), "bad");
  const a = num((document.getElementById("pa-" + id) || {}).value);
  if (!(a > 0)) return toast(t("Enter the amount"), "bad");
  if (q.tx && (await db.list("pay", ["tx", "==", q.tx])).length) return toast(t("This Transaction ID is already used"), "bad");
  await db.add("pay", { sid: q.sid, m: q.m, amt: a, method: q.k === "online" ? "Online" : "Cash", tx: q.tx || "", d: T(), t: Date.now() });
  await db.upd("pr/" + id, { st: "ok", amt: a, by: S.me.name, at: Date.now() });
  notify(q.sid, t("Payment approved: ৳{a} ({m})", { a, m: q.m }));
  refresh();
});
act("fe-no", async (el) => {
  const id = el.dataset.arg, q = await db.get("pr/" + id);
  if (!q || q.st !== "new") return toast(t("Already handled"), "bad");
  const r = await askText(t("Reason (optional)"), { ok: t("Reject") });
  if (r === null) return;
  await db.upd("pr/" + id, { st: "no", rp: r, by: S.me.name, at: Date.now() });
  notify(q.sid, t("Payment not approved: {m}", { m: q.m }) + (r ? " - " + r : ""));
  refresh();
});

// receipt (admin for any student, student for himself)
async function receipt(u, m) {
  const P = (await db.list("pay", ["sid", "==", u.id], ["m", "==", m])).sort((x, y) => (x.t || 0) - (y.t || 0));
  if (!P.length) return toast(t("No payment found for this month"), "bad");
  const b = batchOf(u.bid) || {}, bf = bfMap(await db.list("bf", ["bid", "==", u.bid]).catch(() => []));
  const tot = n2(P.reduce((a, p) => a + p.amt, 0)), fee = feeFor(u, b, m, ctx(bf)), due = Math.max(0, n2(fee - tot));
  const BX = "border:1px solid #9fb6d1;border-radius:6px;padding:10px 12px;margin:0 0 10px", TD = "padding:6px 4px;border-top:1px solid #d5dfec", RW = "display:flex;justify-content:space-between";
  showDoc(`<div class="paper" style="max-width:460px;font-family:Georgia,'Anek Bangla',serif;border:2px solid #13294b;border-radius:12px"><div style="display:flex;align-items:center;gap:12px;margin-bottom:10px"><img src="logo.jpg" alt="" style="width:58px;height:58px;border-radius:50%"><div style="flex:1;text-align:center"><div style="font-size:19px;font-weight:800;text-transform:uppercase">${esc(instName())}</div><div style="letter-spacing:.2em;font-size:12px">${esc(t("FEE RECEIPT"))}</div></div></div>
  <div style="${BX};display:grid;grid-template-columns:1fr 1fr;gap:4px 14px"><div><b>${esc(t("Receipt no"))}:</b> ${esc("RE-" + m.replace("-", "") + "-" + (u.roll || ""))}</div><div><b>${esc(t("Date"))}:</b> ${T()}</div><div><b>${esc(t("Student"))}:</b> ${esc(u.name)}</div><div><b>${esc(t("Roll"))}:</b> ${esc(u.roll)}</div><div><b>${esc(t("Batch"))}:</b> ${esc(b.name || "")}</div><div><b>${esc(t("Month"))}:</b> ${esc(monthLabel(m))}</div></div>
  <table style="width:100%;border-collapse:collapse;margin:0 0 10px"><tr><th align="left">${esc(t("Date"))}</th><th align="left">${esc(t("Method"))}</th><th align="left">Trx ID</th><th align="right">${esc(t("Amount"))}</th></tr>${P.map((p) => `<tr><td style="${TD}">${esc(p.d || "–")}</td><td style="${TD}">${esc(p.method || "")}</td><td style="${TD}">${esc(p.tx || "")}</td><td style="${TD}" align="right">৳${p.amt}</td></tr>`).join("")}</table>
  <div style="${BX}"><div style="${RW}"><span>${esc(t("Monthly fee"))}</span><b>৳${fee}</b></div><div style="${RW}"><span>${esc(t("Total paid"))}</span><b>৳${tot}</b></div><div style="${RW}"><span>${esc(t("Due"))}</span><b>৳${due}</b></div><div style="text-align:center;margin-top:8px;font-weight:800;letter-spacing:.12em;color:${due ? "#b3261e" : "#1d7a46"}">${esc(due ? t("PARTLY PAID") : t("PAID"))}</div></div>
  <div style="display:flex;justify-content:space-between;align-items:flex-end;margin-top:26px;font-size:12px"><span>${esc(S.INST.phone || "")}</span><span style="border-top:1px solid #13294b;padding-top:4px">${esc(S.INST.owner || t("Authorized signature"))}</span></div></div>`);
}
act("fe-rcpt", async (el) => { const u = S.U.find((x) => x.id === el.dataset.arg); if (u) await receipt(u, F().m); });

// ---------- admin: add fee (default / batch / published monthly fee) ----------
async function addFeeTab() {
  const st = F(), bf = await db.list("bf").catch(() => []), m = st.afm || T().slice(0, 7), b0 = batchOf(st.fb);
  BFADM = bfMap(bf);
  const pl = b0 ? bf.filter((x) => x.bid === b0.id).sort((a, b) => (b.m > a.m ? 1 : -1)) : [];
  return `${card(t("Fee settings"), `<div class="inline">${input("dfee", { type: "number", value: defaultFee(), min: "0", step: "any", inputmode: "decimal", label: t("Default monthly fee (all students)") })}${btn(t("Save"), "fe-dfee", { kind: "pri" })}</div><p class="mut sm">${esc(t("Order used: personal fee, then the published fee of that month, then the batch fee, then the default fee."))}</p>`)}
  <div class="mt">${card(t("Add fee"), `<p class="mut">${esc(t("Tap a batch, then choose the month and the amount. Publishing shows the fee on the dashboard of every student in that batch."))}</p>
    <div class="list">${S.B.map((b) => row({ title: b.name, sub: b.fee > 0 ? t("Batch fee {a}", { a: money(b.fee) }) : "", right: icon(st.fb === b.id ? "down" : "right"), act: "fe-batch", arg: b.id })).join("")}</div>
    ${b0 ? `<div class="card mt stack-s"><b>${esc(b0.name)}</b>${input("afm", { type: "month", value: m, "data-change": "fe-afm", label: t("Month") })}${input("afa", { type: "number", min: "1", step: "any", value: BFADM[b0.id + "_" + m] || "", label: t("Amount (৳)"), inputmode: "decimal" })}
      <div class="row">${btn(t("Publish"), "fe-pub", { kind: "pri", ic: "upload" })}${btn(t("Set as batch fee"), "fe-bfee", { ic: "layers" })}</div>
      ${pl.length ? `<div class="list">${pl.map((x) => row({ title: monthLabel(x.m), sub: money(x.amt), right: btn(t("Remove"), "fe-bfdel", { arg: x.m, sm: true, kind: "bad" }) })).join("")}</div>` : ""}</div>` : ""}`)}</div>`;
}
act("fe-dfee", async (el) => { const v = num(el.parentElement.querySelector("input").value); if (!(v >= 0)) return; await saveInst({ fee: v }); toast(t("Saved"), "ok"); refresh(); });
act("fe-batch", (el) => { const st = F(); st.fb = st.fb === el.dataset.arg ? "" : el.dataset.arg; refresh(); });
onChange("fe-afm", (el) => { F().afm = el.value; refresh(); });
act("fe-pub", async () => {
  const st = F(), m = (document.querySelector('[name="afm"]') || {}).value || st.afm, a = num((document.querySelector('[name="afa"]') || {}).value);
  if (!st.fb) return;
  if (!/^\d{4}-\d{2}$/.test(m)) return toast(t("Choose the month"), "bad");
  if (!(a > 0)) return toast(t("Enter the amount"), "bad");
  await db.set("bf/" + st.fb + "_" + m, { bid: st.fb, m, amt: a, t: Date.now(), by: S.me.name });
  notify("batch", t("Fee published: {m} ৳{a}", { m: monthLabel(m), a }), st.fb);
  toast(t("Published"), "ok"); refresh();
});
act("fe-bfee", async () => {
  const st = F(), a = num((document.querySelector('[name="afa"]') || {}).value), b = batchOf(st.fb);
  if (!b || !(a >= 0)) return;
  await db.upd("batches/" + b.id, { fee: a }); b.fee = a;
  toast(t("Saved"), "ok"); refresh();
});
act("fe-bfdel", async (el) => {
  if (!(await ask(t("Remove this fee? The default fee will apply again."), { danger: true, ok: t("Remove") }))) return;
  await db.del("bf/" + F().fb + "_" + el.dataset.arg); refresh();
});

// ---------- admin: teacher salary ----------
async function salaryTab() {
  const st = F(), m = st.sm || T().slice(0, 7), TL = S.TC.filter((x) => x.active !== false);
  const P = await db.list("sal", ["m", "==", m]).catch(() => []);
  return `${TL.length ? `<form class="card stack-s" data-submit="fe-sal"><h3>${esc(t("Add payment"))}</h3>${select("tid", TL.map((x) => [x.id, x.name + (x.subject ? " · " + x.subject : "")]), "", { label: t("Teacher") })}
    <div class="grid g2">${input("amt", { type: "number", min: "1", step: "any", label: t("Amount (৳)"), inputmode: "decimal" })}${input("m", { type: "month", value: m, label: t("Month") })}</div><button class="btn btn--pri" type="submit">${icon("check")}${esc(t("Payment done"))}</button></form>` : ""}
  <div class="card mt"><div class="card-h"><h3>${esc(t("Teacher payment status"))}</h3></div>${input("sm", { type: "month", value: m, "data-change": "fe-sm" })}
    <div class="list mt">${TL.map((x) => { const p = P.filter((y) => y.tid === x.id), sum = n2(p.reduce((a, y) => a + y.amt, 0)); return `<div class="item"><div class="item-b"><b>${esc(x.name)}</b><span class="mut">${esc(x.subject || "")}</span>${p.map((y) => `<span class="mut sm">${esc(y.d || "")} · ${money(y.amt)} ${btn(t("Delete"), "fe-saldel", { arg: y.id, sm: true, kind: "bad" })}</span>`).join("")}</div><b class="${p.length ? "ok" : "bad"}">${p.length ? t("Paid") + " " + money(sum) : t("Not paid")}</b></div>`; }).join("") || empty(t("No teacher yet."), "cap")}</div></div>`;
}
onChange("fe-sm", (el) => { if (el.value) { F().sm = el.value; refresh(); } });
onSubmit("fe-sal", async (el) => {
  const f = formData(el.closest("form")), tc = S.TC.find((x) => x.id === f.tid), a = num(f.amt);
  if (!tc) return;
  if (!(a > 0)) return toast(t("Enter the amount"), "bad");
  if (!/^\d{4}-\d{2}$/.test(f.m)) return toast(t("Choose the month"), "bad");
  await db.add("sal", { tid: tc.id, name: tc.name, m: f.m, amt: a, d: T(), t: Date.now(), by: S.me.name });
  notify(tc.id, t("Payment received: ৳{a} for {m}", { a, m: monthLabel(f.m) }));
  F().sm = f.m; toast(t("Payment done"), "ok"); refresh();
});
act("fe-saldel", async (el) => { if (!(await ask(t("Delete this payment?"), { danger: true, ok: t("Delete") }))) return; await db.del("sal/" + el.dataset.arg); refresh(); });

// ---------- student: my fees ----------
let FP = { bf: [], pay: [], pr: [], sf: [], map: {} };
async function loadMine() {
  const [bf, pay, pr, sf] = await Promise.all([db.list("bf", ["bid", "==", S.me.bid]).catch(() => []), db.list("pay", ["sid", "==", S.pid]).catch(() => []), db.list("pr", ["sid", "==", S.pid]).catch(() => []), db.list("sf", ["sid", "==", S.pid]).catch(() => [])]);
  FP = { bf, pay, pr, sf: sf.sort((a, b) => (b.t || 0) - (a.t || 0)), map: bfMap(bf) };
}
const myPlan = () => feePlan({ ...S.me, id: S.pid }, batchOf(S.me.bid) || {}, T(), ctx(FP.map), FP.pay, FP.pr);
const monthLine = (r) => {
  if (r.state === "paid") return money(r.fee) + (r.last ? " · " + t("Paid on {d}", { d: fmtDate(r.last) }) : "");
  if (r.state === "partial") return `${money(r.fee)} · ${t("Paid {a}", { a: money(r.paid) })} · ${t("Left {a}", { a: money(r.left) })}`;
  return `${money(r.fee)} · ${t("Due from {d}", { d: fmtDate(r.dueOn) })}`;
};
const extraRows = (list) => list.map((f) => {
  const m = manualState(f), s = WORD[m.state];
  return `<div class="item fee-row ${m.state !== "paid" ? "fee-row--bad" : ""}"><div class="item-b"><b class="item-t">${esc(f.note)}</b><span class="mut">${money(f.amt)}${m.paid > 0 ? " · " + esc(t("Paid {a}", { a: money(m.paid) })) : ""}${m.left > 0 && m.paid > 0 ? " · " + esc(t("Left {a}", { a: money(m.left) })) : ""}${f.t ? " · " + esc(fmtDate(new Date(f.t).toISOString().slice(0, 10))) : ""}</span></div><div class="item-a"><b class="${s[0]}">${esc(t(s[1]))}</b></div></div>`;
}).join("");
async function studentFees() {
  if (!S.me.bid) return empty(t("You are not in a batch yet."), "layers");
  await loadMine();
  const st = F(), p = myPlan(), L = p.rows, mDue = manualDue(FP.sf), due = n2(p.outstanding + mDue);
  return `${card(t("My fees"), `<div class="grid g2"><div class="stat" style="--c:${due ? "var(--bad)" : "var(--ok)"}"><span class="stat-top">${icon("wallet")}${esc(t("Outstanding balance"))}</span><span class="stat-v">${money(due)}</span></div>
      ${p.prev > 0 ? `<div class="stat" style="--c:var(--bad)"><span class="stat-top">${icon("alert")}${esc(t("Previous unpaid"))}</span><span class="stat-v">${money(p.prev)}</span><span class="mut sm">${esc(t("{n} month(s)", { n: p.prevN }))}</span></div>` : ""}</div>
    ${L.length ? "" : `<div class="mt">${notice(esc(t("No monthly fee is due yet. The fee of {m} will be due on {d}.", { m: monthLabel(p.nextDue.m), d: fmtDate(p.nextDue.on) })), "info")}</div>`}
    <div class="list mt">${L.map((x) => {
      const s = stateOf(x), go2 = x.due > 0 && !x.pend, open = st.m === x.m;
      return `<div class="item fee-row ${x.due > 0 ? "fee-row--bad" : ""} ${go2 ? "item--click" : ""}" ${go2 ? `data-act="fe-sel" data-arg="${x.m}"` : ""}><div class="item-b"><b class="item-t">${esc(monthLabel(x.m))}</b><span class="mut">${esc(monthLine(x))}${x.rej && go2 ? " · " + esc(t("Rejected")) + (x.rej.rp ? ": " + esc(x.rej.rp) : "") : ""}</span>${open && go2 ? payPanel(x) : ""}</div><div class="item-a">${x.paid > 0 ? btn(t("Receipt"), "fe-mine", { arg: x.m, sm: true, ic: "doc" }) : ""}<b class="${s[0]}">${esc(s[1])}</b></div></div>`;
    }).join("")}</div>`)}
  ${FP.sf.length ? `<div class="mt">${card(t("Other fees"), `<div class="list">${extraRows(FP.sf)}</div><p class="mut sm mt">${esc(t("Pay these to the admin. They will update the status."))}</p>`)}</div>` : ""}`;
}
const payPanel = (x) => {
  const st = F(), k = st.k || "";
  if (!k) return `<div class="card mt" data-stop><b>${esc(t("How did you pay?"))}</b><div class="row mt">${btn(t("Cash"), "fe-k", { arg: "cash", sm: true })}${btn(t("Online"), "fe-k", { arg: "online", sm: true })}</div></div>`;
  if (k === "cash") return `<div class="card mt" data-stop><b>${esc(t("Cash"))} · ${money(x.due)}</b><p class="mut sm">${esc(t("The admin will check and approve it."))}</p><div class="row">${btn(t("Send for approval"), "fe-send", { kind: "pri", sm: true })}${btn(t("Back"), "fe-k", { arg: "", sm: true })}</div></div>`;
  return `<div class="card mt" data-stop><b>${esc(t("Online"))} · ${money(x.due)}</b>${input("ptx", { placeholder: t("Transaction ID (optional)"), value: st.tx || "", "data-input": "fe-tx" })}
    <label class="fld mt"><span>${esc(t("Payment screenshot"))}</span><input type="file" accept="image/*" data-change="fe-img"></label>${st.img ? `<img src="${esc(st.img)}" alt="" style="max-height:160px;border-radius:8px;margin-bottom:8px">` : ""}
    <div class="row">${btn(t("Send for approval"), "fe-send", { kind: "pri", sm: true })}${btn(t("Back"), "fe-k", { arg: "", sm: true })}</div></div>`;
};
act("fe-sel", (el, e) => { if (e.target.closest("[data-stop]")) return; const st = F(); st.m = st.m === el.dataset.arg ? "" : el.dataset.arg; st.k = ""; st.img = ""; st.tx = ""; refresh(); });
act("fe-k", (el, e) => { e.stopPropagation(); F().k = el.dataset.arg; refresh(); });
onInput("fe-tx", (el) => { F().tx = el.value; });
onChange("fe-img", async (el) => { if (el.files[0]) { F().img = await shrinkImage(el.files[0]); refresh(); } });
act("fe-send", async (el, e) => {
  e.stopPropagation();
  const st = F(), x = myPlan().rows.find((y) => y.m === st.m);
  if (!x || !(x.due > 0) || x.pend || (st.k !== "cash" && st.k !== "online")) return;
  if (st.k === "online" && !st.img) return toast(t("Upload the payment screenshot"), "bad");
  const id = await db.add("pr", { sid: S.pid, name: S.me.name, roll: S.me.roll, bid: S.me.bid, m: x.m, amt: x.due, k: st.k, tx: st.k === "online" ? (st.tx || "").trim().slice(0, 60) : "", st: "new", t: Date.now(), hi: st.k === "online" ? 1 : 0 });
  if (st.k === "online") await db.set("pi/" + id, { sid: S.pid, img: st.img });
  st.m = ""; st.k = ""; st.img = ""; st.tx = "";
  toast(t("Sent. The admin will check and approve it."), "ok"); refresh();
});
act("fe-mine", (el, e) => { e.stopPropagation(); return receipt(S.me, el.dataset.arg); });

// ---------- admin: one student's extra fees ("+ Add Fee") and payment history ----------
// Extra fees live in their own collection (sf). They have no month, so they can never repeat or replace the automatic monthly fees.
const studentOf = (id) => S.U.find((x) => x.id === id);
const stuName = (id) => (studentOf(id) || {}).name || "";
const statusSel = (v = "u") => select("st", [["u", t("Unpaid")], ["p", t("Partial")], ["a", t("Paid")]], v, { label: t("Status"), "data-change": "sf-st" });
const payFields = () => `<div class="sf-p stack-s" hidden>${input("pa", { type: "number", step: "any", min: "0", label: t("Amount paid (৳)"), inputmode: "decimal" })}${input("d", { type: "date", value: T(), label: t("Payment date") })}</div>`;
onChange("sf-st", (el) => { const f = el.closest("form"), box = f && f.querySelector(".sf-p"); if (!box) return; box.hidden = el.value === "u"; const pa = box.querySelector('[name="pa"]'); if (pa) pa.closest(".fld").hidden = el.value !== "p"; });
const noteOf = (v) => String(v || "").trim().slice(0, 120);

act("fee-add", async (el) => {
  if (!canFees()) return;
  const u = studentOf(el.dataset.arg);
  if (!u) return toast(t("Not found"), "bad");
  closeModals();
  const done = await form(t("Add fee") + " · " + u.name, `${input("amt", { type: "number", step: "any", min: "1", label: t("Fee amount (৳)"), inputmode: "decimal" })}${input("note", { label: t("Note / description"), placeholder: t("Admission, exam fee, book…"), maxlength: "120" })}${statusSel("u")}${payFields()}`, {
    ok: t("Save fee"), hint: t("For extra charges only. Monthly fees are added automatically."),
    onSave: async (d) => {
      const amt = num(d.amt), note = noteOf(d.note);
      if (!(amt > 0)) throw new Error(t("Enter the amount"));
      if (!note) throw new Error(t("Write a short note"));
      const day = /^\d{4}-\d{2}-\d{2}$/.test(d.d || "") ? d.d : T();
      let pays = [];
      if (d.st === "a") pays = [{ a: amt, d: day, t: Date.now(), by: S.me.name }];
      if (d.st === "p") {
        const a = num(d.pa);
        if (!(a > 0 && a < amt)) throw new Error(t("For Partial, the paid amount must be more than 0 and less than the fee."));
        pays = [{ a, d: day, t: Date.now(), by: S.me.name }];
      }
      await db.add("sf", { sid: u.id, bid: u.bid || "", amt, note, pays, t: Date.now(), by: S.me.name });
      notify(u.id, t("New fee added: ৳{a} ({n})", { a: amt, n: note }));
      return true;
    },
  });
  if (done) toast(t("Saved"), "ok");
  await openHistory(u.id);
});
act("fee-edit", async (el) => {
  if (!canFees()) return;
  const f = await db.get("sf/" + el.dataset.arg);
  if (!f) return toast(t("Not found"), "bad");
  closeModals();
  const paid = manualState(f).paid;
  const done = await form(t("Edit fee") + " · " + stuName(f.sid), `${input("amt", { type: "number", step: "any", min: "1", value: f.amt, label: t("Fee amount (৳)"), inputmode: "decimal" })}${input("note", { label: t("Note / description"), value: f.note, maxlength: "120" })}`, {
    onSave: async (d) => {
      const amt = num(d.amt), note = noteOf(d.note);
      if (!(amt > 0)) throw new Error(t("Enter the amount"));
      if (!note) throw new Error(t("Write a short note"));
      if (amt < paid) throw new Error(t("The fee cannot be less than the {a} already paid.", { a: money(paid) }));
      await db.upd("sf/" + f.id, { amt, note, ut: Date.now(), ub: S.me.name });
      return true;
    },
  });
  if (done) toast(t("Saved"), "ok");
  await openHistory(f.sid);
});
act("fee-pay", async (el) => {
  if (!canFees()) return;
  const f = await db.get("sf/" + el.dataset.arg);
  if (!f) return toast(t("Not found"), "bad");
  closeModals();
  const m = manualState(f);
  const done = await form(t("Record payment") + " · " + f.note, `<p class="mut">${esc(t("Fee {a}, left {b}", { a: money(f.amt), b: money(m.left) }))}</p>${input("a", { type: "number", step: "any", min: "1", value: m.left || "", label: t("Amount paid (৳)"), inputmode: "decimal" })}${input("d", { type: "date", value: T(), label: t("Payment date") })}`, {
    onSave: async (d) => {
      const a = num(d.a);
      if (!(a > 0)) throw new Error(t("Enter the amount"));
      if (a > m.left) throw new Error(t("That is more than the {a} left.", { a: money(m.left) }));
      const day = /^\d{4}-\d{2}-\d{2}$/.test(d.d || "") ? d.d : T();
      await db.upd("sf/" + f.id, { pays: [...(f.pays || []), { a, d: day, t: Date.now(), by: S.me.name }] });
      notify(f.sid, t("Payment received: ৳{a} ({m})", { a, m: f.note }));
      return true;
    },
  });
  if (done) toast(t("Saved"), "ok");
  await openHistory(f.sid);
});
act("fee-pdel", async (el) => {
  if (!canFees()) return;
  const [id, i] = String(el.dataset.arg).split("|"), f = await db.get("sf/" + id);
  if (!f || !(f.pays || [])[+i]) return toast(t("Not found"), "bad");
  if (!(await ask(t("Remove this payment of {a}?", { a: money(f.pays[+i].a) }), { danger: true, ok: t("Remove") }))) return;
  await db.upd("sf/" + id, { pays: f.pays.filter((_, k) => k !== +i) });
  await openHistory(f.sid);
});
act("fee-del", async (el) => {
  if (!canFees()) return;
  const f = await db.get("sf/" + el.dataset.arg);
  if (!f) return toast(t("Not found"), "bad");
  if (!(await ask(t("Delete the fee “{n}” of {a}? Its payments are removed too.", { n: f.note, a: money(f.amt) }), { danger: true, ok: t("Delete") }))) return;
  await db.del("sf/" + f.id);
  toast(t("Deleted"), "ok");
  await openHistory(f.sid);
});
act("fee-hist", (el) => openHistory(el.dataset.arg));

async function openHistory(sid) {
  const u = studentOf(sid);
  if (!u || !canFees()) return;
  const [pays, sf, bf, prs] = await Promise.all([db.list("pay", ["sid", "==", sid]).catch(() => []), db.list("sf", ["sid", "==", sid]).catch(() => []), db.list("bf", ["bid", "==", u.bid || "_"]).catch(() => []), db.list("pr", ["sid", "==", sid]).catch(() => [])]);
  const extra = sf.sort((a, b) => (b.t || 0) - (a.t || 0)), p = feePlan(u, batchOf(u.bid) || {}, T(), ctx(bfMap(bf)), pays, prs), mDue = manualDue(extra), due = n2(p.outstanding + mDue);
  const events = [...pays.map((x) => ({ d: x.d || "", t: x.t || 0, what: monthLabel(x.m), via: x.method || "", a: +x.amt || 0 })), ...extra.flatMap((f) => (f.pays || []).map((x) => ({ d: x.d || "", t: x.t || 0, what: f.note, via: "", a: +x.a || 0 })))].sort((a, b) => (b.d > a.d ? 1 : b.d < a.d ? -1 : (b.t || 0) - (a.t || 0)));
  closeModals();
  modal(`<div class="row-nw">${avatar(u, 48)}<div class="sp"><h3 style="margin:0">${esc(u.name)}</h3><span class="mut">${esc(u.roll || "")}</span></div></div>
    <div class="grid g2 mt"><div class="stat" style="--c:${due ? "var(--bad)" : "var(--ok)"}"><span class="stat-top">${icon("wallet")}${esc(t("Outstanding balance"))}</span><span class="stat-v">${money(due)}</span></div>
      <div class="stat" style="--c:var(--blue)"><span class="stat-top">${icon("clock")}${esc(t("First fee month"))}</span><span class="stat-v" style="font-size:16px">${p.start && feeStart(u, pays, prs) ? esc(monthLabel(p.start)) : esc(t("Not set"))}</span></div></div>
    <div class="row mt">${btn(t("+ Add Fee"), "fee-add", { arg: sid, kind: "pri", sm: true })}</div>
    <h4 class="mt">${esc(t("Other fees"))}</h4>
    ${extra.length ? `<div class="stack-s">${extra.map((f) => {
      const m = manualState(f), s = WORD[m.state];
      return `<div class="card fee-row ${m.state !== "paid" ? "fee-row--bad" : ""}"><div class="row" style="justify-content:space-between;gap:8px"><b>${esc(f.note)}</b><b class="${s[0]}">${esc(t(s[1]))}</b></div>
        <div class="mut sm">${money(f.amt)} · ${esc(t("Paid {a}", { a: money(m.paid) }))} · ${esc(t("Left {a}", { a: money(m.left) }))}${f.t ? " · " + esc(fmtDate(new Date(f.t).toISOString().slice(0, 10))) : ""}${f.by ? " · " + esc(f.by) : ""}</div>
        ${(f.pays || []).map((x, i) => `<div class="row sm" style="gap:6px"><span class="mut">${esc(fmtDate(x.d))}</span><b>${money(x.a)}</b>${btn(t("Remove"), "fee-pdel", { arg: f.id + "|" + i, xs: true, kind: "bad" })}</div>`).join("")}
        <div class="row mt">${m.left > 0 ? btn(t("Record payment"), "fee-pay", { arg: f.id, sm: true, kind: "pri", ic: "check" }) : ""}${btn(t("Edit"), "fee-edit", { arg: f.id, sm: true, ic: "edit" })}${btn(t("Delete"), "fee-del", { arg: f.id, sm: true, kind: "bad", ic: "trash" })}</div></div>`;
    }).join("")}</div>` : `<p class="mut sm">${esc(t("No extra fee yet."))}</p>`}
    <h4 class="mt">${esc(t("Monthly fees"))}</h4>
    ${p.rows.length ? `<div class="list">${p.rows.slice(0, 24).map((r) => { const s = stateOf(r); return `<div class="item fee-row ${r.due > 0 ? "fee-row--bad" : ""}"><div class="item-b"><b class="item-t">${esc(monthLabel(r.m))}</b><span class="mut">${esc(monthLine(r))}</span></div><div class="item-a"><b class="${s[0]}">${esc(s[1])}</b></div></div>`; }).join("")}</div>` : `<p class="mut sm">${esc(t("No monthly fee is due yet. The fee of {m} will be due on {d}.", { m: monthLabel(p.nextDue.m), d: fmtDate(p.nextDue.on) }))}</p>`}
    <h4 class="mt">${esc(t("Payment history"))}</h4>
    ${events.length ? `<div class="list">${events.slice(0, 60).map((e) => `<div class="item"><div class="item-b"><b>${esc(e.what)}</b><span class="mut">${esc(fmtDate(e.d) || "–")}${e.via ? " · " + esc(e.via) : ""}</span></div><div class="item-a"><b class="ok">${money(e.a)}</b></div></div>`).join("")}</div>` : `<p class="mut sm">${esc(t("No payment yet."))}</p>`}
    <div class="mod-f"><button class="btn" data-act="pu-close">${esc(t("Close"))}</button></div>`);
}

// ---------- dashboard cards ----------
export async function feeSummaryCard() {
  if (!isStudent() || !S.me.bid) return "";
  try {
    await loadMine();
    const p = myPlan(), mDue = manualDue(FP.sf), due = n2(p.outstanding + mDue);
    return `<button class="card card--click" data-act="nav" data-arg="fees" style="text-align:left;width:100%;font:inherit;color:inherit"><div class="card-h"><h3>${esc(t("Fees"))}</h3><b class="${due ? "bad" : "ok"}">${due ? t("Due") + " " + money(due) : p.rows.length || FP.sf.length ? t("All paid") : t("Nothing due yet")}</b></div>
      ${p.rows.length ? p.rows.slice(0, 3).map((x) => { const s = stateOf(x); return `<div class="row" style="justify-content:space-between;padding:3px 0"><span>${esc(monthLabel(x.m))}</span><b class="${s[0]}">${esc(s[1])}</b></div>`; }).join("") : `<p class="mut sm" style="margin:0">${esc(t("The fee of {m} will be due on {d}.", { m: monthLabel(p.nextDue.m), d: fmtDate(p.nextDue.on) }))}</p>`}
      ${mDue > 0 ? `<div class="row" style="justify-content:space-between;padding:3px 0"><span>${esc(t("Other fees"))}</span><b class="bad">${money(mDue)}</b></div>` : ""}</button>`;
  } catch (e) { return ""; }
}
export async function payRequestsCard() {
  if (!canFees()) return "";
  try {
    const R = (await db.list("pr", ["st", "==", "new"])).sort((a, b) => a.t - b.t);
    if (!R.length) return "";
    return `<button class="card card--warn card--click" data-act="fe-go" style="text-align:left;width:100%;font:inherit;color:inherit"><div class="card-h"><h3>${esc(t("Payment requests"))}</h3><span class="tag tag--warn">${R.length}</span></div>${R.slice(0, 3).map((r) => `<div class="mut">${esc(r.name)} · ${esc(monthLabel(r.m))} · ${money(r.amt)}</div>`).join("")}</button>`;
  } catch (e) { return ""; }
}
act("fe-go", () => { F().tab = "s"; go("fees"); });
export async function salaryCard() {
  if (!isTeacher()) return "";
  try {
    const P = (await db.list("sal", ["tid", "==", S.pid])).sort((a, b) => b.t - a.t), m = T().slice(0, 7), cur = P.filter((p) => p.m === m), sum = n2(cur.reduce((a, p) => a + p.amt, 0));
    return card(t("Salary"), `${cur.length ? `<b class="ok" style="font-size:18px">✔ ${esc(monthLabel(m))}: ${esc(t("Paid"))} ${money(sum)}</b>` : `<b class="warn">${esc(monthLabel(m))}: ${esc(t("Not paid yet"))}</b>`}<div class="list mt">${P.slice(0, 5).map((p) => row({ title: monthLabel(p.m), sub: p.d || "", right: `<b class="ok">${money(p.amt)}</b>` })).join("")}</div>`);
  } catch (e) { return ""; }
}

// ---------- dashboard: Fee Collection Overview (admin only) ----------
// One month at a time. Expected = the fee of every student who owes that month, Collected = what was paid for it (a payment
// above the fee is not counted twice), Pending = what is still open (a part payment leaves the rest pending). It is worked out
// with the same rules as the Fees page, from the real fee and payment records.
const FO = () => pageState("fo");
let FOD = null;   // the month shown now, for the detailed report
function collect(m, P, BF) {
  const cx = ctx(bfMap(BF)), today = T(), cur = today.slice(0, 7), rows = [];
  for (const s of S.U.filter((x) => x.active !== false && x.ap !== false && x.bid)) {
    const start = feeStart(s, P) || cur, r = monthStatus(s, batchOf(s.bid), m, today, cx, P, start);
    if (r.state === "none") continue;
    rows.push({ s, r, got: Math.min(r.paid, r.fee), left: Math.max(0, n2(r.fee - r.paid)) });
  }
  const sum = (L, k) => n2(L.reduce((a, x) => a + x[k], 0));
  const exp = n2(rows.reduce((a, x) => a + x.r.fee, 0)), got = sum(rows, "got"), left = sum(rows, "left");
  const per = {};
  rows.forEach((x) => { const b = (per[x.s.bid] = per[x.s.bid] || { b: batchOf(x.s.bid) || { name: "?" }, n: 0, exp: 0, got: 0, left: 0 }); b.n++; b.exp += x.r.fee; b.got += x.got; b.left += x.left; });
  return { m, rows, exp, got, left, rate: exp > 0 ? (got / exp) * 100 : null, per: Object.values(per).map((b) => ({ ...b, exp: n2(b.exp), got: n2(b.got), left: n2(b.left) })), due: m < cur };
}
export async function feeOverviewCard(pre) {
  if (!canFees()) return "";
  try {
    const st = FO(), cur = T().slice(0, 7), m = st.m || nextMonth(cur, -1);
    let P, BF;
    if (pre && pre.m === m) ({ P, BF } = pre);
    else [P, BF] = await Promise.all([db.list("pay", ["m", "==", m]).catch(() => []), db.list("bf", ["m", "==", m]).catch(() => [])]);
    const d = (FOD = collect(m, P, BF)), pend = d.exp > 0 ? 100 - d.rate : 0;
    const nav = `<span class="row" style="gap:4px;flex-wrap:nowrap"><button type="button" class="icon-btn" data-act="fo-m" data-arg="-1" aria-label="${esc(t("Earlier month"))}">${icon("back")}</button><b class="nowrap">${esc(monthLabel(m))}</b><button type="button" class="icon-btn" data-act="fo-m" data-arg="1" aria-label="${esc(t("Later month"))}" ${m >= cur ? "disabled" : ""}>${icon("right")}</button></span>`;
    const body = d.exp > 0
      ? `<div class="fo-grid"><div class="fo-chart">${donut([{ v: d.got, c: "var(--ok)" }, { v: d.left, c: "var(--bad)" }], Math.round(d.rate) + "%", t("collected"))}</div>
        <div class="fo-sum"><button type="button" class="fo-s fo-s--ok" data-act="fo-list" data-arg="ok"><span>${icon("check")}${esc(t("Collected"))}${icon("right", "fo-go")}</span><b>${esc(money(d.got))}</b><small>${esc(f1c(d.rate))} ${esc(t("of expected"))} · ${esc(t("{n} students", { n: d.rows.filter((x) => x.got > 0).length }))}</small></button>
        <button type="button" class="fo-s fo-s--bad" data-act="fo-list" data-arg="bad"><span>${icon("clock")}${esc(t("Pending amount"))}${icon("right", "fo-go")}</span><b>${esc(money(d.left))}</b><small>${esc(f1c(pend))} ${esc(t("of expected"))} · ${esc(t("{n} students", { n: d.rows.filter((x) => x.left > 0).length }))}</small></button></div></div>
        <div class="fo-tot"><span>${esc(t("Total expected"))}</span><b>${esc(money(d.exp))}</b><span class="mut sm">${esc(t("Collection rate"))}: <b>${esc(f1c(d.rate))}</b></span></div>
        <div class="fo-leg"><span><i style="background:var(--ok)"></i>${esc(t("Collected"))}</span><span><i style="background:var(--bad)"></i>${esc(t("Pending amount"))}</span>${d.due ? "" : `<span class="warn">${esc(t("This month is not due yet."))}</span>`}</div>`
      : empty(t("No fees to collect for {m}.", { m: monthLabel(m) }), "wallet");
    return card(t("Fee Collection Overview"), `${body}<div class="row mt">${btn(t("Detailed report"), "fo-report", { ic: "doc", kind: "pri", sm: true })}${btn(t("Open Fees"), "nav", { arg: "fees", ic: "wallet", sm: true })}</div>`, { right: nav, cls: "fo" });
  } catch (e) { console.warn(e); return ""; }
}
const f1c = (v) => (v == null ? "–" : Math.round(v * 10) / 10 + "%");
act("fo-m", (el) => {
  const st = FO(), cur = T().slice(0, 7), m = nextMonth(st.m || nextMonth(cur, -1), +el.dataset.arg);
  if (m > cur) return;
  st.m = m; refresh();
});
// every student of the month + the extra fees, as a printable table / CSV
act("fo-report", () => openReport());
async function openReport() {
  const d = FOD;
  if (!d) return;
  const sf = await db.list("sf").catch(() => []), ex = sf.map((f) => ({ f, ...manualState(f) })), exAll = ex.slice().sort((a, b) => (b.left > 0) - (a.left > 0) || b.left - a.left || (b.f.t || 0) - (a.f.t || 0));
  const old = document.getElementById("fo-sc"), keep = old ? old.scrollTop : 0;
  closeModals();
  const exSum = (k) => n2(ex.reduce((a, x) => a + (k === "amt" ? +x.f.amt || 0 : x[k]), 0));
  const open = d.rows.filter((x) => x.left > 0).sort((a, b) => b.left - a.left);
  const rate = (a, b) => (b > 0 ? f1c((a / b) * 100) : "–");
  const TD = "padding:6px 6px;border-top:1px solid var(--line)";
  modal(`<h3>${esc(t("Fee collection report"))}: ${esc(monthLabel(d.m))}</h3>
    <div class="tiles mt"><div class="stat" style="--c:var(--blue)"><span class="stat-top">${esc(t("Expected"))}</span><span class="stat-v">${esc(money(d.exp))}</span></div><div class="stat" style="--c:var(--ok)"><span class="stat-top">${esc(t("Collected"))}</span><span class="stat-v">${esc(money(d.got))}</span></div><div class="stat" style="--c:var(--bad)"><span class="stat-top">${esc(t("Pending amount"))}</span><span class="stat-v">${esc(money(d.left))}</span></div><div class="stat" style="--c:var(--gold-ink)"><span class="stat-top">${esc(t("Collection rate"))}</span><span class="stat-v">${esc(f1c(d.rate))}</span></div></div>
    <div id="fo-sc" style="max-height:52vh;overflow:auto">
    <h4 class="mt">${esc(t("By batch"))}</h4>
    ${d.per.length ? `<div class="tw"><table class="tbl"><tr><th>${esc(t("Batch"))}</th><th class="n">${esc(t("Students"))}</th><th class="n">${esc(t("Expected"))}</th><th class="n">${esc(t("Collected"))}</th><th class="n">${esc(t("Due"))}</th><th class="n">%</th></tr>${d.per.map((b) => `<tr><td>${esc(b.b.name)}</td><td class="n">${b.n}</td><td class="n">${esc(money(b.exp))}</td><td class="n">${esc(money(b.got))}</td><td class="n">${esc(money(b.left))}</td><td class="n">${esc(rate(b.got, b.exp))}</td></tr>`).join("")}</table></div>` : empty(t("Nothing to show."), "wallet")}
    <h4 class="mt">${esc(t("Students with fees pending"))} (${open.length})</h4>
    ${open.length ? `<div class="list">${open.map(({ s, r, left }) => row({ av: avatar(s, 34), title: s.name, sub: esc([batchOf(s.bid) ? batchOf(s.bid).name : "", s.roll].filter(Boolean).join(" · ") + " · " + money(r.paid) + " / " + money(r.fee)), right: `<b class="${r.state === "partial" ? "warn" : "bad"}">${esc(money(left))}</b>`, act: "open-user", arg: s.id })).join("")}</div>` : empty(t("Everybody has paid."), "check")}
    ${ex.length ? `<h4 class="mt">${esc(t("Extra fees (all months)"))}</h4><p class="mut sm">${esc(t("Expected"))} ${esc(money(exSum("amt")))} · ${esc(t("Collected"))} ${esc(money(exSum("paid")))} · ${esc(t("Pending amount"))} <b class="${exSum("left") ? "bad" : "ok"}">${esc(money(exSum("left")))}</b></p>
      <div class="list">${exAll.slice(0, 60).map(({ f, left }) => { const s = S.U.find((u) => u.id === f.sid); return row({ av: avatar(s || { name: "?" }, 30), title: s ? s.nick || s.name : t("Student not found"), sub: esc([f.note || "", money(f.amt)].filter(Boolean).join(" · ")), right: `<b class="${left > 0 ? "bad" : "ok"}">${esc(left > 0 ? money(left) : t("Paid"))}</b>${btn(t("Delete"), "fo-xdel", { arg: f.id, xs: true, kind: "bad", ic: "trash" })}`, act: s ? "open-user" : undefined, arg: f.sid }); }).join("")}</div>` : ""}</div>
    <div class="row mt">${btn(t("Download CSV"), "fo-csv", { sm: true, ic: "download" })}</div>
    <div class="mod-f"><button class="btn" data-act="pu-close">${esc(t("Close"))}</button></div>`);
  if (keep) { const n = document.getElementById("fo-sc"); if (n) n.scrollTop = keep; }
}
// a wrong or leftover extra fee (even one whose student is gone) can be deleted right here
act("fo-xdel", async (el) => {
  if (!canFees()) return;
  const f = await db.get("sf/" + el.dataset.arg);
  if (!f) { toast(t("Not found"), "bad"); return openReport(); }
  const s = S.U.find((u) => u.id === f.sid);
  if (!(await ask(t("Delete the fee “{n}” of {a} for {s}? Its payments are removed too.", { n: f.note || "", a: money(f.amt), s: s ? s.nick || s.name : t("Student not found") }), { danger: true, ok: t("Delete") }))) return;
  await db.del("sf/" + f.id);
  toast(t("Deleted"), "ok");
  await openReport();
});

// ---------- the lists behind the Collected / Pending amount tiles ----------
// photo, nickname (name if there is none), the ID under it and the batch on the right
const nameKey = (s) => String((batchOf(s.bid) || {}).name || "") + "\u0001" + String(s.nick || s.name || "");
async function reloadFOD() {
  if (!FOD) return;
  const [P, BF] = await Promise.all([db.list("pay", ["m", "==", FOD.m]).catch(() => []), db.list("bf", ["m", "==", FOD.m]).catch(() => [])]);
  FOD = collect(FOD.m, P, BF);
}
function openList(kind) {
  const d = FOD;
  if (!d) return;
  const ok = kind === "ok", L = d.rows.filter((x) => (ok ? x.got > 0 : x.left > 0)).sort((a, b) => nameKey(a.s).localeCompare(nameKey(b.s), undefined, { numeric: true, sensitivity: "base" }));
  const tot = n2(L.reduce((a, x) => a + (ok ? x.got : x.left), 0));
  closeModals();
  modal(`<h3>${esc(ok ? t("Collected") : t("Pending amount"))}: ${esc(monthLabel(d.m))}</h3>
    <p class="mut sm">${esc(t("{n} students", { n: L.length }))} · <b class="${ok ? "ok" : "bad"}">${esc(money(tot))}</b></p>
    <div class="list fo-lst">${L.map(({ s, r, got, left }) => {
      const b = batchOf(s.bid), sub = ok
        ? `<button type="button" class="fe-st fe-st--${r.state === "paid" ? "ok" : "warn"}" data-act="fe-st" data-arg="${esc(s.id + "|" + d.m + "|ok")}">${esc(r.state === "paid" ? t("Paid") : t("Partial"))} ${esc(money(got))}${icon("down")}</button>`
        : `<small class="${r.state === "partial" ? "warn" : "bad"}">${esc(r.state === "partial" ? t("Left {a}", { a: money(left) }) : t("Due") + " " + money(left))}</small>`;
      return row({ av: avatar(s, 40), titleHtml: esc(s.nick || s.name), sub: esc(s.roll || ""), right: `<div class="fo-r"><b>${esc(b ? b.name : "")}</b>${sub}</div>`, act: "open-user", arg: s.id });
    }).join("") || empty(ok ? t("Nobody has paid yet.") : t("Everybody has paid."), ok ? "wallet" : "check")}</div>
    <div class="mod-f"><button class="btn" data-act="pu-close">${esc(t("Close"))}</button></div>`);
}
act("fo-list", (el) => openList(el.dataset.arg));

// ---------- a payment entered by mistake: Paid -> Unpaid ----------
// Removes that month's payment record(s) of the student, so the month is open again. The student gets a message.
act("fe-st", async (el) => {
  if (!canFees()) return;
  const [sid, m, from] = String(el.dataset.arg).split("|"), u = S.U.find((x) => x.id === sid);
  if (!u) return;
  const P = (await db.list("pay", ["sid", "==", sid], ["m", "==", m]).catch(() => [])).sort((x, y) => (x.t || 0) - (y.t || 0));
  if (!P.length) return toast(t("No payment found for this month"), "bad");
  const dlg = modal(`<div class="row-nw">${avatar(u, 44)}<div class="sp"><h3 style="margin:0">${esc(u.nick || u.name)}</h3><span class="mut">${esc(u.roll || "")} · ${esc(monthLabel(m))}</span></div></div>
    <div class="list mt">${P.map((p) => `<div class="item"><div class="item-b"><b>${esc(p.method || "")}</b><span class="mut">${esc(fmtDate(p.d) || "–")}${p.tx ? " · " + esc(p.tx) : ""}</span></div><div class="item-a"><b class="ok">${esc(money(p.amt))}</b></div></div>`).join("")}</div>
    <p class="mut sm mt">${esc(t("Mark as Unpaid removes the payment above, so this month is unpaid again. The student is told."))}</p>
    <div class="mod-f"><button type="button" class="btn" data-r="0">${esc(t("Cancel"))}</button>${btn(t("Mark as Unpaid"), "fe-unpaid", { arg: el.dataset.arg, kind: "bad", ic: "x" })}</div>`);
  dlg.body.addEventListener("click", (e) => { if (e.target.closest('[data-r="0"]')) dlg.close(); });   // Cancel closes only this dialog, the list below stays
});
act("fe-unpaid", async (el) => {
  if (!canFees()) return;
  const [sid, m, from] = String(el.dataset.arg).split("|");
  const P = await db.list("pay", ["sid", "==", sid], ["m", "==", m]).catch(() => []);
  if (P.length) {
    const tot = n2(P.reduce((a, p) => a + (+p.amt || 0), 0));
    for (const p of P) await db.del("pay/" + p.id);
    notify(sid, t("Payment of ৳{a} for {m} was removed by the admin. The fee is unpaid again.", { a: tot, m }));
    toast(t("Marked as unpaid"), "ok");
  }
  closeModals();
  refresh();
  if (from === "ok" || from === "bad") { await reloadFOD(); openList(from); }
});
act("fo-csv", () => {
  const d = FOD;
  if (!d) return;
  const q = (v) => '"' + String(v ?? "").replace(/"/g, '""') + '"';
  const lines = [["Batch", "Student", "Roll", "Month", "Fee", "Paid", "Pending", "Status"].map(q).join(",")];
  d.rows.slice().sort((a, b) => String(batchOf(a.s.bid).name).localeCompare(String(batchOf(b.s.bid).name)) || String(a.s.name).localeCompare(String(b.s.name))).forEach(({ s, r, left }) => lines.push([batchOf(s.bid).name, s.name, s.roll, d.m, r.fee, r.paid, left, r.state].map(q).join(",")));
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob(["\ufeff" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" }));
  a.download = "fees-" + d.m + ".csv";
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
});

addBN({
  "Only the admin can open Fees.": "শুধু অ্যাডমিন ফি খুলতে পারেন।", "Student fees": "ছাত্রদের ফি", "Add fee": "ফি যোগ করুন", "Payment": "পেমেন্ট", "Paid": "পরিশোধিত", "Waiting for approval": "অনুমোদনের অপেক্ষায়", "Partial": "আংশিক", "Due": "বাকি",
  "Payment requests": "পেমেন্টের অনুরোধ", "Roll {r}": "রোল {r}", "Online": "অনলাইন", "Cash": "ক্যাশ", "Screenshot": "স্ক্রিনশট", "Approve": "অনুমোদন", "Reject": "বাতিল", "Month": "মাস", "Student payment": "ছাত্রের পেমেন্ট", "Student": "ছাত্র",
  "Amount (৳)": "পরিমাণ (৳)", "Method": "মাধ্যম", "Bank": "ব্যাংক", "Other": "অন্যান্য", "Transaction ID (optional)": "ট্রানজেকশন আইডি (ঐচ্ছিক)", "Add payment": "পেমেন্ট যোগ করুন", "Receipt": "রসিদ", "No fee": "ফি নেই", "No students.": "কোনো ছাত্র নেই।",
  "Enter the amount": "পরিমাণ দিন", "This Transaction ID is already used": "এই ট্রানজেকশন আইডি আগেই ব্যবহার হয়েছে", "Payment received: ৳{a} ({m})": "পেমেন্ট গৃহীত: ৳{a} ({m})", "Saved": "সংরক্ষিত", "Screenshot not found": "স্ক্রিনশট পাওয়া যায়নি",
  "Already handled": "আগেই সম্পন্ন হয়েছে", "Payment approved: ৳{a} ({m})": "পেমেন্ট অনুমোদিত: ৳{a} ({m})", "Reason (optional)": "কারণ (ঐচ্ছিক)", "Payment not approved: {m}": "পেমেন্ট অনুমোদিত হয়নি: {m}", "No payment found for this month": "এই মাসে কোনো পেমেন্ট পাওয়া যায়নি",
  "FEE RECEIPT": "ফি রসিদ", "Receipt no": "রসিদ নং", "Date": "তারিখ", "Roll": "রোল", "Batch": "ব্যাচ", "Amount": "টাকার পরিমাণ", "Monthly fee": "মাসিক ফি", "Total paid": "মোট পরিশোধ", "PARTLY PAID": "আংশিক পরিশোধ", "PAID": "পরিশোধিত", "Authorized signature": "অনুমোদিত স্বাক্ষর",
  "Fee settings": "ফি সেটিংস", "Default monthly fee (all students)": "সাধারণ মাসিক ফি (সব ছাত্র)", "Save": "সংরক্ষণ", "Order used: personal fee, then the published fee of that month, then the batch fee, then the default fee.": "প্রযোজ্য ক্রম: ব্যক্তিগত ফি, তারপর ওই মাসের প্রকাশিত ফি, তারপর ব্যাচ ফি, তারপর সাধারণ ফি।",
  "Tap a batch, then choose the month and the amount. Publishing shows the fee on the dashboard of every student in that batch.": "একটি ব্যাচ চাপুন, মাস ও পরিমাণ বেছে নিন। প্রকাশ করলে ওই ব্যাচের সব ছাত্রের ড্যাশবোর্ডে ফি দেখা যাবে।",
  "Batch fee {a}": "ব্যাচ ফি {a}", "Publish": "প্রকাশ করুন", "Set as batch fee": "ব্যাচ ফি হিসেবে সেট", "Remove": "সরান", "Choose the month": "মাস বেছে নিন", "Fee published: {m} ৳{a}": "ফি প্রকাশিত: {m} ৳{a}", "Published": "প্রকাশিত", "Remove this fee? The default fee will apply again.": "এই ফি সরাবেন? সাধারণ ফি আবার প্রযোজ্য হবে।",
  "Teacher": "শিক্ষক", "Payment done": "পেমেন্ট সম্পন্ন", "Teacher payment status": "শিক্ষকদের পেমেন্টের অবস্থা", "Not paid": "পরিশোধ হয়নি", "Delete": "মুছুন", "No teacher yet.": "এখনো কোনো শিক্ষক নেই।", "Payment received: ৳{a} for {m}": "পেমেন্ট গৃহীত: ৳{a}, {m} এর জন্য", "Delete this payment?": "এই পেমেন্ট মুছবেন?",
  "You are not in a batch yet.": "আপনি এখনো কোনো ব্যাচে নেই।", "My fees": "আমার ফি", "Total due": "মোট বাকি", "Rejected": "বাতিল হয়েছে", "How did you pay?": "কীভাবে পরিশোধ করেছেন?", "The admin will check and approve it.": "অ্যাডমিন যাচাই করে অনুমোদন দেবেন।", "Send for approval": "অনুমোদনের জন্য পাঠান", "Back": "ফিরে যান",
  "Transaction ID": "ট্রানজেকশন আইডি", "Payment screenshot": "পেমেন্টের স্ক্রিনশট", "Upload the payment screenshot": "পেমেন্টের স্ক্রিনশট দিন", "Sent. The admin will check and approve it.": "পাঠানো হয়েছে। অ্যাডমিন যাচাই করে অনুমোদন দেবেন।", "Fees": "ফি", "All paid": "সব পরিশোধিত", "Salary": "বেতন", "Not paid yet": "এখনো পরিশোধিত নয়",
});

addBN({
  "Unpaid": "অপরিশোধিত", "Not due yet": "এখনো দেয় হয়নি", "Not registered yet": "এখনো ভর্তি হয়নি", "The fee of a month is due from the 1st day of the next month.": "কোনো মাসের ফি পরের মাসের ১ তারিখ থেকে বকেয়া হয়।",
  "Collected {a} of {b}": "{b} এর মধ্যে {a} আদায়", "{n} not fully paid": "{n} জন পুরো দেননি", "Set first fee month": "প্রথম ফি-র মাস ঠিক করুন", "The first fee month is not known. Open the student and set it.": "প্রথম ফি-র মাস জানা নেই। ছাত্রকে খুলে ঠিক করে দিন।",
  "No fee for this month": "এই মাসে কোনো ফি নেই", "Due from {d}": "{d} থেকে বকেয়া", "Paid on {d}": "{d} তারিখে পরিশোধ", "Paid {a}": "পরিশোধ {a}", "Left {a}": "বাকি {a}",
  "Outstanding balance": "মোট বকেয়া", "Previous unpaid": "আগের বকেয়া", "{n} month(s)": "{n} মাস", "No monthly fee is due yet. The fee of {m} will be due on {d}.": "এখনো কোনো মাসিক ফি বকেয়া নেই। {m} মাসের ফি {d} থেকে বকেয়া হবে।",
  "Other fees": "অন্যান্য ফি", "Pay these to the admin. They will update the status.": "এগুলো অ্যাডমিনকে দিন। তিনি অবস্থা হালনাগাদ করবেন।", "The fee of {m} will be due on {d}.": "{m} মাসের ফি {d} থেকে বকেয়া হবে।", "Nothing due yet": "এখনো কিছু বকেয়া নেই",
  "Status": "অবস্থা", "Amount paid (৳)": "পরিশোধিত পরিমাণ (৳)", "Payment date": "পরিশোধের তারিখ", "Fee amount (৳)": "ফি-র পরিমাণ (৳)", "Note / description": "নোট / বিবরণ", "Admission, exam fee, book…": "ভর্তি, পরীক্ষার ফি, বই…",
  "Save fee": "ফি সংরক্ষণ", "For extra charges only. Monthly fees are added automatically.": "শুধু অতিরিক্ত ফি-র জন্য। মাসিক ফি নিজে থেকেই যোগ হয়।", "Write a short note": "সংক্ষেপে একটি নোট লিখুন",
  "For Partial, the paid amount must be more than 0 and less than the fee.": "আংশিক হলে পরিশোধিত পরিমাণ ০ এর বেশি ও ফি-র কম হতে হবে।", "New fee added: ৳{a} ({n})": "নতুন ফি যোগ হয়েছে: ৳{a} ({n})",
  "Edit fee": "ফি সম্পাদনা", "The fee cannot be less than the {a} already paid.": "ফি, আগে পরিশোধ করা {a} এর কম হতে পারবে না।", "Record payment": "পেমেন্ট লিখুন", "Fee {a}, left {b}": "ফি {a}, বাকি {b}", "That is more than the {a} left.": "এটি বাকি {a} এর চেয়ে বেশি।",
  "Remove this payment of {a}?": "{a} এর এই পেমেন্ট সরাবেন?", "Delete the fee “{n}” of {a}? Its payments are removed too.": "“{n}” ফি ({a}) মুছবেন? এর পেমেন্টগুলোও মুছে যাবে।",
  "First fee month": "প্রথম ফি-র মাস", "Not set": "ঠিক করা নেই", "+ Add Fee": "+ ফি যোগ করুন", "Monthly fees": "মাসিক ফি", "Payment history": "পেমেন্টের ইতিহাস", "No extra fee yet.": "এখনো কোনো অতিরিক্ত ফি নেই।", "No payment yet.": "এখনো কোনো পেমেন্ট নেই।",
  "Fee history": "ফি-র ইতিহাস", "Unpaid fees: {m}": "{m} এর বাকি ফি", "Leave empty to use the month the student registered. No fee is made for earlier months.": "খালি রাখলে ছাত্র যে মাসে রেজিস্ট্রেশন করেছে সেটি ধরা হবে। আগের মাসের কোনো ফি তৈরি হয় না।",
  "Not found": "পাওয়া যায়নি", "Deleted": "মুছে ফেলা হয়েছে",
});
addBN({
  "Fee Collection Overview": "ফি সংগ্রহের সারসংক্ষেপ", "Earlier month": "আগের মাস", "Later month": "পরের মাস", "collected": "আদায়", "Pending amount": "বাকি টাকা", "of expected": "প্রত্যাশিত থেকে",
  "Total expected": "মোট প্রত্যাশিত", "Collection rate": "আদায়ের হার", "This month is not due yet.": "এই মাসের ফি এখনো দেয় হয়নি।", "No fees to collect for {m}.": "{m} এ আদায়ের কোনো ফি নেই।",
  "Detailed report": "বিস্তারিত রিপোর্ট", "Open Fees": "ফি পাতা খুলুন", "Fee collection report": "ফি আদায় রিপোর্ট", "Expected": "প্রত্যাশিত", "By batch": "ব্যাচ অনুযায়ী", "Nothing to show.": "দেখানোর কিছু নেই।",
  "Students with fees pending": "যাদের ফি বাকি", "Everybody has paid.": "সবাই পরিশোধ করেছে।", "Extra fees (all months)": "অতিরিক্ত ফি (সব মাস)", "Download CSV": "CSV ডাউনলোড",
});
addBN({
  "Nobody has paid yet.": "এখনো কেউ পরিশোধ করেনি।", "Student not found": "ছাত্র পাওয়া যায়নি", "Mark as Unpaid": "অপরিশোধিত করুন", "Marked as unpaid": "অপরিশোধিত করা হয়েছে",
  "Mark as Unpaid removes the payment above, so this month is unpaid again. The student is told.": "অপরিশোধিত করলে উপরের পেমেন্ট সরে যায়, ফলে এই মাস আবার বাকি হয়ে যায়। ছাত্রকে জানানো হয়।",
  "Payment of ৳{a} for {m} was removed by the admin. The fee is unpaid again.": "{m} মাসের ৳{a} পেমেন্ট অ্যাডমিন সরিয়ে দিয়েছেন। ফি আবার বাকি।",
  "Delete the fee “{n}” of {a} for {s}? Its payments are removed too.": "{s} এর “{n}” ফি ({a}) মুছবেন? এর পেমেন্টগুলোও মুছে যাবে।",
});
