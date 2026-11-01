// Marks approval: the marks teachers submitted, for the admin / co-admin to check, approve, or send back.
import { db } from "./lib-db.js";
import { S, esc, t, page, act, refresh, isStaff, ago, addBN, batchOf, n2, f1, go, pageState } from "./lib-core.js";
import { tag, empty, card, btn, askText, toast } from "./lib-ui.js";
import { recalcBatch, notify, logAct } from "./lib-svc.js";
import { syncExam } from "./pages-exams.js";

const waiting = async () => {
  const L = isStaff() ? await db.list("exams", ["pw", "==", true]).catch(() => []) : [];
  return L.flatMap((e) => (e.subs || []).map((u, i) => ({ e, u, i })).filter((x) => x.u.ws === "s"));
};
// number of subjects waiting for approval (dashboard)
export async function pendingMarks() { try { return (await waiting()).length; } catch (x) { return 0; } }

function stats(u, stu) {
  const parts = Array.isArray(u.dv) && u.dv.length ? u.dv : null;
  const got = stu.filter((s) => (u.m || {})[s.id] != null).map((s) => +u.m[s.id]);
  return {
    n: stu.length, entered: got.length, absent: stu.length - got.length,
    avg: got.length ? got.reduce((a, b) => a + b, 0) / got.length : null, hi: got.length ? Math.max(...got) : null, lo: got.length ? Math.min(...got) : null,
    fail: u.pm > 0 ? stu.filter((s) => !((u.m || {})[s.id] >= u.pm)).length : null, parts,
  };
}
let ML = [];
page("marks", async () => {
  ML = await waiting();
  if (!ML.length) return empty(t("No marks are waiting for approval."), "check");
  return `<p class="mut">${esc(t("Check what the teachers submitted. Approved marks count in ranks and results. Publish the exam from the Exams page when you are ready."))}</p>
  <div class="stack">${ML.map(({ e, u, i }) => {
    const stu = S.U.filter((s) => s.bid === e.bid && s.active !== false).sort((a, b) => String(a.roll).localeCompare(String(b.roll))), z = stats(u, stu), id = esc(e.id + "|" + i);
    return `<div class="card"><div class="card-h"><div><b>${esc(u.n)}</b> <span class="mut">${esc(e.title)} · ${esc((batchOf(e.bid) || {}).name || "")}</span></div>${tag(t("Submitted"), "info")}</div>
      <p class="mut sm">${esc(u.sb || "")} · ${esc(ago(u.sa))}</p>
      <p class="sm">${esc(t("Entered {a} of {b}", { a: z.entered, b: z.n }))} · ${esc(t("Absent"))} ${z.absent}${z.avg != null ? ` · ${esc(t("Average"))} ${f1(z.avg)}` : ""}${z.hi != null ? ` · ${esc(t("Highest"))} ${n2(z.hi)} · ${esc(t("Lowest"))} ${n2(z.lo)}` : ""}${z.fail != null ? ` · <span class="${z.fail ? "bad" : "ok"}">${esc(t("Below pass marks"))}: ${z.fail}</span>` : ""}</p>
      <details class="mt"><summary>${esc(t("View marks"))} (${n2(u.total)})</summary><div class="list mt">${stu.map((s) => { const d = (u.dm || {})[s.id] || {}, m = (u.m || {})[s.id]; return `<div class="item"><div class="item-b"><b>${esc(s.name)}</b><span class="mut">${esc(s.roll || "")}${z.parts && m != null ? " · " + esc(z.parts.map((p) => p.n + " " + n2(d[p.n] || 0)).join(", ")) : ""}</span></div><div class="item-a"><b class="${m != null && u.pm > 0 && m < u.pm ? "bad" : ""}">${m == null ? esc(t("Absent")) : n2(m)}</b></div></div>`; }).join("")}</div></details>
      <div class="row mt">${btn(t("Approve"), "mk-ok", { arg: e.id + "|" + i, kind: "pri", sm: true, ic: "check" })}${btn(t("Send back"), "mk-back", { arg: e.id + "|" + i, kind: "bad", sm: true, ic: "x" })}${btn(t("Open in Exams"), "mk-open", { arg: e.id + "|" + i, sm: true, ic: "clip" })}</div></div>`;
  }).join("")}</div>`;
}, { title: "Marks approval" });

async function setWs(arg, patch) {
  const [id, i] = arg.split("|"), e = await db.get("exams/" + id);
  if (!e || !e.subs || !e.subs[+i]) throw new Error(t("Not found"));
  Object.assign(e.subs[+i], patch);
  e.pw = e.subs.some((x) => x.ws === "s");
  await db.upd("exams/" + id, { subs: e.subs, pw: e.pw });
  await recalcBatch(e.bid);
  if (e.pub !== false) await syncExam(e).catch(() => {});
  return { e, u: e.subs[+i] };
}
act("mk-ok", async (el) => {
  const { e, u } = await setWs(el.dataset.arg, { ws: "a", ap: S.me.name, at: Date.now(), rn: "" });
  const what = u.n + " - " + e.title;
  logAct("Approved marks: " + what);
  if (u.sbu && u.sbu !== S.pid) notify(u.sbu, t("Your marks were approved: {n}", { n: what }));
  toast(t("Approved"), "ok"); refresh();
});
act("mk-back", async (el) => {
  const note = await askText(t("Note for the teacher (optional)"), { label: t("Why is it sent back?"), ok: t("Send back") });
  if (note === null) return;
  const { e, u } = await setWs(el.dataset.arg, { ws: "d", rn: note || t("Please check the marks again."), at: 0, ap: "" });
  const what = u.n + " - " + e.title;
  logAct("Sent back marks: " + what);
  if (u.sbu && u.sbu !== S.pid) notify(u.sbu, t("Your marks were sent back: {n}", { n: what }) + (note ? " - " + note : ""));
  toast(t("Sent back"), "ok"); refresh();
});
act("mk-open", (el) => {
  const [id] = el.dataset.arg.split("|"), e = (ML.find((x) => x.e.id === id) || {}).e;
  if (!e) return;
  S.bid = e.bid; const st = pageState("ex"); st.eid = id; st.loaded = ""; go("exams");
});

addBN({
  "No marks are waiting for approval.": "অনুমোদনের অপেক্ষায় কোনো নম্বর নেই।", "Check what the teachers submitted. Approved marks count in ranks and results. Publish the exam from the Exams page when you are ready.": "শিক্ষকদের জমা দেওয়া নম্বর দেখুন। অনুমোদিত নম্বর র‍্যাঙ্ক ও ফলাফলে গণ্য হয়। প্রস্তুত হলে পরীক্ষা পেজ থেকে ফল প্রকাশ করুন।",
  "Average": "গড়", "Highest": "সর্বোচ্চ", "Lowest": "সর্বনিম্ন", "Below pass marks": "পাস নম্বরের নিচে", "View marks": "নম্বর দেখুন", "Open in Exams": "পরীক্ষা পেজে খুলুন", "Approve": "অনুমোদন", "Approved": "অনুমোদিত", "Send back": "ফেরত পাঠান", "Submitted": "জমা দেওয়া হয়েছে",
});
