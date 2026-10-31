// Fees: admin panel (student fees, add fee, payment requests, teacher salary) and the student's "my fees".
// Co-admins and teachers never see any of this (canFees() = main admin only).
import { db } from "./lib-db.js";
import {
  S, esc, t, page, act, onInput, onChange, onSubmit, formData, pageState, refresh, go, canFees, isStudent, isTeacher, instName, T, fmtDate, ago, money, addBN,
  activeStudents, curBatch, n2, num, monthLabel, batchOf,
} from "./lib-core.js";
import { icon, avatar, tag, empty, notice, card, row, btn, chips, input, select, batchPicker, ask, askText, form, toast, showDoc, stat } from "./lib-ui.js";
import { notify, saveInst, defaultFee, shrinkImage, logAct } from "./lib-svc.js";
import { feeFor, paidIn, feeMonths } from "./lib-stats.js";

const F = () => pageState("fe");
const ctx = (BF) => ({ INST: S.INST, BF });
const bfMap = (list) => { const o = {}; list.forEach((x) => { o[x.bid + "_" + x.m] = x.amt; }); return o; };
const stateOf = (fee, paid, pend) => (paid >= fee ? ["ok", t("Paid")] : pend ? ["warn", t("Waiting for approval")] : paid > 0 ? ["warn", t("Partial")] : ["bad", t("Due")]);

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
  const st = F(); st.m = st.m || T().slice(0, 7);
  const [R, P, bf] = await Promise.all([db.list("pr", ["st", "==", "new"]).catch(() => []), db.list("pay", ["m", "==", st.m]).catch(() => []), db.list("bf").catch(() => [])]);
  BFADM = bfMap(bf);
  const reqs = R.sort((a, b) => a.t - b.t);
  const L = S.bid ? activeStudents() : [];
  return `${reqs.length ? card(t("Payment requests") + ` (${reqs.length})`, `<div class="stack">${reqs.map((r) => `<div class="card"><b>${esc(r.name)}</b> <span class="mut sm">${esc(t("Roll {r}", { r: r.roll }))}</span><div class="mut">${esc(monthLabel(r.m))} · ${esc(r.k === "online" ? t("Online") : t("Cash"))}${r.tx ? " · " + esc(r.tx) : ""} · ${ago(r.t)}</div>
      <div class="inline mt"><input type="number" step="any" min="1" id="pa-${esc(r.id)}" value="${r.amt}" inputmode="decimal">${r.hi ? btn(t("Screenshot"), "fe-shot", { arg: r.id, ic: "image" }) : ""}</div>
      <div class="row mt">${btn(t("Approve"), "fe-ok", { arg: r.id, kind: "pri", sm: true, ic: "check" })}${btn(t("Reject"), "fe-no", { arg: r.id, kind: "bad", sm: true, ic: "x" })}</div></div>`).join("")}</div>`) : ""}
  <div class="mt">${batchPicker()}</div>
  ${input("m", { type: "month", value: st.m, "data-change": "fe-month", label: t("Month") })}
  ${S.bid ? `<form class="card stack-s mt" data-submit="fe-pay"><h3>${esc(t("Student payment"))}</h3>${select("sid", L.map((s) => [s.id, s.name]), "", { label: t("Student") })}
    <div class="grid g2">${input("amt", { type: "number", step: "any", min: "1", label: t("Amount (৳)"), inputmode: "decimal" })}${select("method", [["Cash", t("Cash")], ["bKash", "bKash"], ["Nagad", "Nagad"], ["Rocket", "Rocket"], ["Bank", t("Bank")], ["Other", t("Other")]], "Cash", { label: t("Method") })}</div>
    ${input("tx", { label: t("Transaction ID (optional)") })}<button class="btn btn--pri" type="submit">${icon("check")}${esc(t("Add payment"))}</button></form>
  <div class="card mt"><div class="card-h"><h3>${esc(monthLabel(st.m))}</h3></div>${L.map((s) => {
    const fee = feeFor(s, curBatch(), st.m, ctx(BFADM)), pd = paidIn(P, s.id, st.m), x = fee ? stateOf(fee, pd, false) : ["", t("No fee")];
    return row({ av: avatar(s, 36), title: s.name, sub: `${money(pd)} / ${money(fee)}`, right: `${pd > 0 ? btn(t("Receipt"), "fe-rcpt", { arg: s.id, sm: true, ic: "doc" }) : ""}<b class="${x[0]}">${esc(x[1])}</b>` });
  }).join("") || empty(t("No students."), "users")}</div>` : ""}`;
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
let FP = { bf: [], pay: [], pr: [], map: {} };
async function loadMine() {
  const [bf, pay, pr] = await Promise.all([db.list("bf", ["bid", "==", S.me.bid]).catch(() => []), db.list("pay", ["sid", "==", S.pid]).catch(() => []), db.list("pr", ["sid", "==", S.pid]).catch(() => [])]);
  FP = { bf, pay, pr, map: bfMap(bf) };
}
function months() {
  const b = batchOf(S.me.bid) || {};
  return feeMonths(T(), [...FP.pay.map((p) => p.m), ...FP.pr.map((r) => r.m), ...FP.bf.map((x) => x.m)]).map((m) => {
    const fee = feeFor(S.me, b, m, ctx(FP.map)), paid = paidIn(FP.pay, S.pid, m), pend = FP.pr.find((r) => r.m === m && r.st === "new"), rej = FP.pr.filter((r) => r.m === m && r.st === "no").sort((a, c) => c.t - a.t)[0];
    return { m, fee, paid, pend, rej, ok: paid >= fee, due: Math.max(0, n2(fee - paid)) };
  });
}
async function studentFees() {
  if (!S.me.bid) return empty(t("You are not in a batch yet."), "layers");
  await loadMine();
  const st = F(), L = months(), due = n2(L.filter((x) => !x.ok).reduce((a, x) => a + x.due, 0));
  return `${card(t("My fees"), `<div class="grid g2"><div class="stat" style="--c:${due ? "var(--bad)" : "var(--ok)"}"><span class="stat-top">${icon("wallet")}${esc(t("Total due"))}</span><span class="stat-v">${money(due)}</span></div></div>
    <div class="list mt">${L.map((x) => {
      const s = stateOf(x.fee, x.paid, x.pend), go2 = !x.ok && !x.pend, open = st.m === x.m;
      return `<div class="item ${go2 ? "item--click" : ""}" ${go2 ? `data-act="fe-sel" data-arg="${x.m}"` : ""}><div class="item-b"><b class="item-t">${esc(monthLabel(x.m))}</b><span class="mut">${money(x.paid)} / ${money(x.fee)}${x.rej && go2 ? " · " + esc(t("Rejected")) + (x.rej.rp ? ": " + esc(x.rej.rp) : "") : ""}</span>${open && go2 ? payPanel(x) : ""}</div><div class="item-a">${x.paid > 0 ? btn(t("Receipt"), "fe-mine", { arg: x.m, sm: true, ic: "doc" }) : ""}<b class="${s[0]}">${esc(s[1])}</b></div></div>`;
    }).join("")}</div>`)}`;
}
const payPanel = (x) => {
  const st = F(), k = st.k || "";
  if (!k) return `<div class="card mt" data-stop><b>${esc(t("How did you pay?"))}</b><div class="row mt">${btn(t("Cash"), "fe-k", { arg: "cash", sm: true })}${btn(t("Online"), "fe-k", { arg: "online", sm: true })}</div></div>`;
  if (k === "cash") return `<div class="card mt"><b>${esc(t("Cash"))} · ${money(x.due)}</b><p class="mut sm">${esc(t("The admin will check and approve it."))}</p><div class="row">${btn(t("Send for approval"), "fe-send", { kind: "pri", sm: true })}${btn(t("Back"), "fe-k", { arg: "", sm: true })}</div></div>`;
  return `<div class="card mt"><b>${esc(t("Online"))} · ${money(x.due)}</b>${input("ptx", { placeholder: t("Transaction ID (optional)"), value: st.tx || "", "data-input": "fe-tx" })}
    <label class="fld mt"><span>${esc(t("Payment screenshot"))}</span><input type="file" accept="image/*" data-change="fe-img"></label>${st.img ? `<img src="${esc(st.img)}" alt="" style="max-height:160px;border-radius:8px;margin-bottom:8px">` : ""}
    <div class="row">${btn(t("Send for approval"), "fe-send", { kind: "pri", sm: true })}${btn(t("Back"), "fe-k", { arg: "", sm: true })}</div></div>`;
};
act("fe-sel", (el, e) => { if (e.target.closest(".card")) return; const st = F(); st.m = st.m === el.dataset.arg ? "" : el.dataset.arg; st.k = ""; st.img = ""; st.tx = ""; refresh(); });
act("fe-k", (el, e) => { e.stopPropagation(); F().k = el.dataset.arg; refresh(); });
onInput("fe-tx", (el) => { F().tx = el.value; });
onChange("fe-img", async (el) => { if (el.files[0]) { F().img = await shrinkImage(el.files[0]); refresh(); } });
act("fe-send", async (el, e) => {
  e.stopPropagation();
  const st = F(), x = months().find((y) => y.m === st.m);
  if (!x || !(x.due > 0) || (st.k !== "cash" && st.k !== "online")) return;
  if (st.k === "online" && !st.img) return toast(t("Upload the payment screenshot"), "bad");
  const id = await db.add("pr", { sid: S.pid, name: S.me.name, roll: S.me.roll, bid: S.me.bid, m: x.m, amt: x.due, k: st.k, tx: st.k === "online" ? (st.tx || "").trim().slice(0, 60) : "", st: "new", t: Date.now(), hi: st.k === "online" ? 1 : 0 });
  if (st.k === "online") await db.set("pi/" + id, { sid: S.pid, img: st.img });
  st.m = ""; st.k = ""; st.img = ""; st.tx = "";
  toast(t("Sent. The admin will check and approve it."), "ok"); refresh();
});
act("fe-mine", (el, e) => { e.stopPropagation(); return receipt(S.me, el.dataset.arg); });

// ---------- dashboard cards ----------
export async function feeSummaryCard() {
  if (!isStudent() || !S.me.bid) return "";
  try {
    await loadMine();
    const L = months(), due = n2(L.filter((x) => !x.ok).reduce((a, x) => a + x.due, 0));
    return `<button class="card card--click tl" data-act="nav" data-arg="fees" style="text-align:left;width:100%;font:inherit;color:inherit"><div class="card-h"><h3>${esc(t("Fees"))}</h3><b class="${due ? "bad" : "ok"}">${due ? t("Due") + " " + money(due) : t("All paid")}</b></div>
      ${L.slice(0, 3).map((x) => { const s = stateOf(x.fee, x.paid, x.pend); return `<div class="row" style="justify-content:space-between;padding:3px 0"><span>${esc(monthLabel(x.m))}</span><b class="${s[0]}">${esc(s[1])}</b></div>`; }).join("")}</button>`;
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

addBN({
  "Only the admin can open Fees.": "শুধু অ্যাডমিন ফি খুলতে পারেন।", "Student fees": "ছাত্রদের ফি", "Add fee": "ফি যোগ করুন", "Payment": "পেমেন্ট", "Paid": "পরিশোধিত", "Waiting for approval": "অনুমোদনের অপেক্ষায়", "Partial": "আংশিক", "Due": "বাকি",
  "Payment requests": "পেমেন্টের অনুরোধ", "Roll {r}": "রোল {r}", "Online": "অনলাইন", "Cash": "ক্যাশ", "Screenshot": "স্ক্রিনশট", "Approve": "অনুমোদন", "Reject": "বাতিল", "Month": "মাস", "Student payment": "ছাত্রের পেমেন্ট", "Student": "ছাত্র",
  "Amount (৳)": "পরিমাণ (৳)", "Method": "মাধ্যম", "Bank": "ব্যাংক", "Other": "অন্যান্য", "Transaction ID (optional)": "ট্রানজেকশন আইডি (ঐচ্ছিক)", "Add payment": "পেমেন্ট যোগ করুন", "Receipt": "রসিদ", "No fee": "ফি নেই", "No students.": "কোনো ছাত্র নেই।",
  "Enter the amount": "পরিমাণ দিন", "This Transaction ID is already used": "এই ট্রানজেকশন আইডি আগেই ব্যবহার হয়েছে", "Payment received: ৳{a} ({m})": "পেমেন্ট গৃহীত: ৳{a} ({m})", "Saved": "সংরক্ষিত", "Screenshot not found": "স্ক্রিনশট পাওয়া যায়নি",
  "Already handled": "আগেই সম্পন্ন হয়েছে", "Payment approved: ৳{a} ({m})": "পেমেন্ট অনুমোদিত: ৳{a} ({m})", "Reason (optional)": "কারণ (ঐচ্ছিক)", "Payment not approved: {m}": "পেমেন্ট অনুমোদিত হয়নি: {m}", "No payment found for this month": "এই মাসে কোনো পেমেন্ট পাওয়া যায়নি",
  "FEE RECEIPT": "ফি রসিদ", "Receipt no": "রসিদ নং", "Date": "তারিখ", "Roll": "রোল", "Batch": "ব্যাচ", "Amount": "পরিমাণ", "Monthly fee": "মাসিক ফি", "Total paid": "মোট পরিশোধ", "PARTLY PAID": "আংশিক পরিশোধ", "PAID": "পরিশোধিত", "Authorized signature": "অনুমোদিত স্বাক্ষর",
  "Fee settings": "ফি সেটিংস", "Default monthly fee (all students)": "সাধারণ মাসিক ফি (সব ছাত্র)", "Save": "সংরক্ষণ", "Order used: personal fee, then the published fee of that month, then the batch fee, then the default fee.": "প্রযোজ্য ক্রম: ব্যক্তিগত ফি, তারপর ওই মাসের প্রকাশিত ফি, তারপর ব্যাচ ফি, তারপর সাধারণ ফি।",
  "Tap a batch, then choose the month and the amount. Publishing shows the fee on the dashboard of every student in that batch.": "একটি ব্যাচ চাপুন, মাস ও পরিমাণ বেছে নিন। প্রকাশ করলে ওই ব্যাচের সব ছাত্রের ড্যাশবোর্ডে ফি দেখা যাবে।",
  "Batch fee {a}": "ব্যাচ ফি {a}", "Publish": "প্রকাশ", "Set as batch fee": "ব্যাচ ফি হিসেবে সেট", "Remove": "সরান", "Choose the month": "মাস বেছে নিন", "Fee published: {m} ৳{a}": "ফি প্রকাশিত: {m} ৳{a}", "Published": "প্রকাশিত", "Remove this fee? The default fee will apply again.": "এই ফি সরাবেন? সাধারণ ফি আবার প্রযোজ্য হবে।",
  "Teacher": "শিক্ষক", "Payment done": "পেমেন্ট সম্পন্ন", "Teacher payment status": "শিক্ষকদের পেমেন্টের অবস্থা", "Not paid": "পরিশোধিত নয়", "Delete": "মুছুন", "No teacher yet.": "এখনো কোনো শিক্ষক নেই।", "Payment received: ৳{a} for {m}": "পেমেন্ট গৃহীত: ৳{a}, {m} এর জন্য", "Delete this payment?": "এই পেমেন্ট মুছবেন?",
  "You are not in a batch yet.": "আপনি এখনো কোনো ব্যাচে নেই।", "My fees": "আমার ফি", "Total due": "মোট বাকি", "Rejected": "বাতিল হয়েছে", "How did you pay?": "কীভাবে পরিশোধ করেছেন?", "The admin will check and approve it.": "অ্যাডমিন যাচাই করে অনুমোদন দেবেন।", "Send for approval": "অনুমোদনের জন্য পাঠান", "Back": "পেছনে",
  "Transaction ID": "ট্রানজেকশন আইডি", "Payment screenshot": "পেমেন্টের স্ক্রিনশট", "Upload the payment screenshot": "পেমেন্টের স্ক্রিনশট দিন", "Sent. The admin will check and approve it.": "পাঠানো হয়েছে। অ্যাডমিন যাচাই করে অনুমোদন দেবেন।", "Fees": "ফি", "All paid": "সব পরিশোধিত", "Salary": "বেতন", "Not paid yet": "এখনো পরিশোধিত নয়",
});
