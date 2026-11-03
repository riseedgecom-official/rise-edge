// Performance: two kinds of record, both marked out of 10 -- Class Performance and Exam Performance. A teacher picks a batch, a kind and a
// date, types the marks of the students, saves a draft or publishes. Students see their own published marks and how they change over time.
//   pa/<bid>_<c|e>_<date>_<teacherId>   the record + ALL marks of the batch (teacher, admin, co-admin only)
//   pf/<same id>_<sid>                  one student's own mark of a PUBLISHED record (the student can read only these)
// The id is made from batch + kind + date + teacher, so saving twice (or double-tapping) can never make a second copy.
import { db } from "./lib-db.js";
import { S, esc, t, page, act, onInput, onChange, pageState, refresh, isStaff, isStudent, T, n2, num, f1, addBN, activeStudents, curBatch, uniq } from "./lib-core.js";
import { icon, avatar, tag, empty, notice, card, btn, input, select, batchPicker, ask, toast, meter, chips } from "./lib-ui.js";
import { notify, logAct, recalcBatch } from "./lib-svc.js";

const P = () => pageState("pf");
const MAXM = 10;                                                    // both kinds are out of 10
const KINDS = { c: "Class Performance", e: "Exam Performance" };
const kindName = (x) => (x.ty && KINDS[x.ty] ? t(KINDS[x.ty]) : x.title || t("Performance"));   // old records (made before the two kinds) keep their own title
const short = (d) => (d ? d.slice(8, 10) + "/" + d.slice(5, 7) : "");
const long = (d) => { try { return new Date(d + "T00:00:00").toLocaleDateString(S.lang === "bn" ? "bn-BD" : "en-GB", { day: "numeric", month: "short", year: "numeric" }); } catch (e) { return d || ""; } };
const newest = (a, b) => ((b.date || "") > (a.date || "") ? 1 : (b.date || "") < (a.date || "") ? -1 : a.id < b.id ? -1 : 1);
const pct = (m, max) => (max > 0 ? Math.min(100, Math.max(0, (m / max) * 100)) : 0);
const colorOf = (p) => (p >= 80 ? "var(--ok)" : p >= 60 ? "var(--blue)" : p >= 40 ? "var(--gold)" : "var(--bad)");
// one typed mark: blank | {bad} | {x: number}
const val = (v, max = MAXM) => {
  if (v === "" || v == null) return { blank: true };
  const x = Number(v);
  return !Number.isFinite(x) || x < 0 || x > max ? { bad: true } : { x: n2(x) };
};
const strMarks = (a) => Object.fromEntries(Object.entries(a.m || {}).map(([k, v]) => [k, String(v)]));
const recId = (st) => st.bid + "_" + st.ty + "_" + st.date + "_" + st.by;

// ---------- teacher / admin: enter marks ----------
// The record on screen is the one with this kind + date + teacher. Change one of them and the matching saved record (if any) opens.
const findRec = (st) => (st.ty ? st.list.find((x) => x.ty === st.ty && x.date === st.date && x.by === st.by) : st.list.find((x) => x.id === st.leg));
function sync(st) {
  const key = [st.bid, st.ty, st.date, st.by, st.leg].join("|");
  if (st.key === key) return;
  st.key = key;
  const a = findRec(st);
  st.m = a ? strMarks(a) : st.has ? {} : st.m;      // typed marks of a new record survive a date change; a saved record's marks never leak into another
  st.has = !!a;
}
const label = (a) => `${kindName(a)} · ${short(a.date)} · ${a.pub ? t("Published") : t("Draft")}${a.by !== S.pid && a.tn ? " · " + a.tn : ""}`;

page("performance", async () => {
  if (isStudent()) return studentPerf();
  if (!S.B.length || !S.bid) return empty(t("Add a batch first."), "layers");
  const st = P();
  if (st.bid !== S.bid) Object.assign(st, { bid: S.bid, list: null, ty: "c", leg: "", date: T(), by: S.pid, m: {}, has: false, key: "" });
  if (!st.list) { st.list = (await db.list("pa", ["bid", "==", S.bid])).sort(newest); st.key = ""; }
  sync(st);
  const a = findRec(st) || null, old = !!a && !a.ty;
  const L = activeStudents().sort((x, y) => String(x.nick || x.name).localeCompare(String(y.nick || y.name), undefined, { numeric: true, sensitivity: "base" }));
  const ro = !!a && !isStaff() && a.by !== S.pid;      // somebody else's record: look only
  const lock = ro || old, max = old ? num(a.max) : MAXM, entered = L.filter((s) => val(st.m[s.id], max).x != null).length;
  const saved = st.list.length ? select("pick", [["", t("Choose a saved record")], ...st.list.map((x) => [x.id, label(x)])], a ? a.id : "", { label: t("Saved records"), "data-change": "pf-pick" }) : "";
  return `${batchPicker()}
  <div class="card stack-s pf-head">
    <div class="card-h"><h3>${esc(t("Performance"))}</h3>${a ? (a.pub ? tag(t("Published"), "ok") : tag(t("Draft"), "warn")) : tag(t("New"), "info")}</div>
    ${saved}
    ${ro ? notice(esc(t("Made by {n}. Only they or the admin can change it.", { n: a.tn || "" })), "info") : ""}
    ${old ? notice(esc(t("An old record. It can only be deleted.")), "info") : `<div class="fld"><span>${esc(t("Type"))}</span>${chips(Object.entries(KINDS).map(([k, n]) => ({ k, label: t(n) })), st.ty, "pf-ty")}</div>`}
    ${input("date", { label: t("Assessment date"), type: "date", value: old ? a.date : st.date || T(), "data-change": "pf-date", disabled: old })}
    ${old ? "" : `<p class="mut sm" style="margin:0">${esc(t("Marks are out of {n}.", { n: MAXM }))}</p>`}
  </div>
  <div class="card mt"><div class="card-h"><h3>${esc(t("Students"))}</h3><span class="mut sm" id="pf-cnt">${esc(t("{a} of {b} marks entered", { a: entered, b: L.length }))}</span></div>
    ${L.length ? `<div class="pf-list">${L.map((s) => {
      const v = st.m[s.id] ?? "", r = val(v, max);
      return `<div class="pf-c ${r.bad ? "pf-bad" : ""}" data-sid="${esc(s.id)}">${avatar(s, 44)}<div class="pf-n"><b>${esc(s.nick || s.name)}</b><span class="mut sm">${esc(s.roll || "")}</span></div>
        <div class="pf-m"><input type="number" inputmode="decimal" min="0" max="${max}" step="any" value="${esc(v)}" placeholder="–" data-input="pf-mark" data-sid="${esc(s.id)}" aria-label="${esc(t("Marks of {n}", { n: s.nick || s.name }))}" ${lock ? "disabled" : ""}><span class="pf-of">/ <span class="pf-max">${esc(n2(max))}</span></span></div></div>`;
    }).join("")}</div>
    ${ro ? "" : `<div class="pf-bar">${old ? "" : btn(t("Save Draft"), "pf-save", { arg: "draft", ic: "doc" }) + btn(t("Save & Publish"), "pf-save", { arg: "pub", kind: "pri", ic: "upload" })}</div>
      ${a ? `<div class="tc mt">${btn(t("Delete this record"), "pf-del", { sm: true, kind: "bad", ic: "trash" })}</div>` : ""}
      ${old ? "" : `<p class="mut sm mt">${esc(t("Empty = no mark (not counted, the student does not see it). Draft marks are not shown to students."))}</p>`}` }` : empty(t("No students in this batch."), "users")}</div>`;
}, { title: "Performance" });

onChange("pf-pick", (el) => {
  const st = P(), a = el.value ? (st.list || []).find((x) => x.id === el.value) : null;
  if (!a) return;
  Object.assign(st, { ty: a.ty || "", leg: a.ty ? "" : a.id, date: a.date, by: a.by, key: "" });
  refresh();
});
act("pf-ty", (el) => { const st = P(); Object.assign(st, { ty: el.dataset.arg, leg: "", by: S.pid }); refresh(); });
onChange("pf-date", (el) => { const st = P(); Object.assign(st, { date: el.value, ty: st.ty || "c", leg: "", by: S.pid }); refresh(); });
// typed mark: remembered at once (no redraw, so the keyboard stays open)
function recheck() {
  const st = P(), L = activeStudents();
  let n = 0;
  document.querySelectorAll(".pf-c").forEach((c) => {
    const r = val(st.m[c.dataset.sid]);
    c.classList.toggle("pf-bad", !!r.bad);
    if (r.x != null) n++;
  });
  const e = document.getElementById("pf-cnt");
  if (e) e.textContent = t("{a} of {b} marks entered", { a: n, b: L.length });
}
onInput("pf-mark", (el) => { P().m[el.dataset.sid] = el.value; recheck(); });

act("pf-save", async (el) => {
  const st = P(), mode = el.dataset.arg, b = curBatch();
  if (!b || st.saving || !st.ty) return;
  const L = activeStudents();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(st.date || "")) return toast(t("Choose the assessment date."), "bad");
  const m = {};
  let over = null;
  for (const s of L) { const r = val(st.m[s.id]); if (r.bad && !over) over = s; if (r.x != null) m[s.id] = r.x; }
  if (over) { const c = document.querySelector('.pf-c[data-sid="' + over.id + '"]'); if (c) c.scrollIntoView({ block: "center" }); return toast(t("Check the marks of {n}. They must be between 0 and {max}.", { n: over.nick || over.name, max: MAXM }), "bad"); }
  const a = findRec(st), pub = mode === "pub", got = Object.keys(m).length;
  if (a && !isStaff() && a.by !== S.pid) return;
  if (pub && !got) return toast(t("Enter at least one mark before publishing."), "bad");
  if (pub && !(await ask(t("Publish these marks? {n} students will see their marks right away.", { n: got }) + (got < L.length ? " " + t("{k} students have no mark and will not see this one.", { k: L.length - got }) : ""), { title: t("Publish"), ok: t("Publish") }))) return;
  if (!pub && a && a.pub && !(await ask(t("Saving as a draft hides these marks from the students. Continue?"), { ok: t("Save Draft") }))) return;
  if (st.saving) return;
  st.saving = true;
  try {
    const aid = a ? a.id : recId(st), now = Date.now(), by = a ? a.by : S.pid, tn = a ? a.tn : S.me.name, title = KINDS[st.ty];
    const ops = [{ set: ["pa/" + aid, { bid: S.bid, ty: st.ty, title, max: MAXM, date: st.date, by, tn, pub, m, t: now }] }];
    const had = a && a.pub ? Object.keys(a.m || {}) : [];   // the student copies that exist now
    if (pub) for (const s of L) if (m[s.id] != null) ops.push({ set: ["pf/" + aid + "_" + s.id, { aid, sid: s.id, sn: s.name, bid: S.bid, ty: st.ty, title, max: MAXM, m: m[s.id], date: st.date, by, tn, t: now }] });
    for (const id of had) if (!pub || m[id] == null) ops.push({ del: "pf/" + aid + "_" + id });
    await db.batch(ops);
    st.by = by; st.has = true; st.list = null;
    if (pub || (a && a.pub)) await recalcBatch(S.bid).catch(() => {});      // the numbers on the students' dashboard
    if (pub && !(a && a.pub)) notify("batch", t("Performance published: {n}", { n: t(title) }), S.bid);
    logAct((pub ? "Published performance: " : "Saved performance draft: ") + title + " " + st.date);
    toast(pub ? t("Published. Students can see their marks now.") : t("Draft saved."), "ok");
  } finally { st.saving = false; }
  refresh();
});

act("pf-del", async () => {
  const st = P(), a = findRec(st);
  if (!a) return;
  if (!(await ask(t("Delete \"{n}\" and all its marks? Students lose it too.", { n: kindName(a) + " · " + short(a.date) }), { danger: true, ok: t("Delete") }))) return;
  const ops = [{ del: "pa/" + a.id }];
  if (a.pub) for (const id of Object.keys(a.m || {})) ops.push({ del: "pf/" + a.id + "_" + id });
  await db.batch(ops);
  logAct("Deleted performance: " + kindName(a) + " " + a.date);
  Object.assign(st, { list: null, m: {}, has: false, key: "", leg: "", ty: a.ty || "c", by: S.pid });
  if (a.pub) await recalcBatch(S.bid).catch(() => {});
  toast(t("Deleted"), "ok");
  refresh();
});

// ---------- student: my performance ----------
async function studentPerf() {
  if (!S.me.bid) return empty(t("You are not in a batch yet."), "layers");
  const st = P();
  const L = (await db.list("pf", ["sid", "==", S.pid])).sort(newest);
  if (!L.length) return card(t("My performance"), empty(t("No performance marks are published yet."), "trend"));
  const kinds = uniq(L.map((x) => x.ty || "o")), f = kinds.includes(st.f) ? st.f : "";
  const V = f ? L.filter((x) => (x.ty || "o") === f) : L;
  const P1 = (x) => pct(x.m, x.max), avg = V.reduce((s, x) => s + P1(x), 0) / V.length, best = Math.max(...V.map(P1));
  const bar = kinds.length > 1 ? chips([{ k: "", label: t("All") }, ...kinds.map((k) => ({ k, label: KINDS[k] ? t(KINDS[k]) : t("Other") }))], f, "pf-sub") : "";
  const cards = V.map((x, i) => {
    const p = P1(x), old = V.slice(i + 1).find((y) => (y.ty || "o") === (x.ty || "o")), d = old ? p - P1(old) : null;
    return `<div class="pf-rec"><div class="pf-rec-h"><div><b>${esc(kindName(x))}</b><div class="mut sm">${esc([x.subj, long(x.date), x.tn].filter(Boolean).join(" · "))}</div></div>
      <div class="pf-rec-m"><b>${esc(n2(x.m))}</b><span class="mut"> / ${esc(n2(x.max))}</span></div></div>
      ${meter(p, colorOf(p))}<div class="pf-rec-f"><b style="color:${colorOf(p)}">${esc(f1(p))}</b>${d == null ? "" : `<span class="${d >= 0 ? "ok" : "bad"}">${d >= 0 ? "▲ +" : "▼ "}${esc(Math.round(d * 10) / 10)}%</span>`}</div></div>`;
  }).join("");
  return `${bar ? `<div class="mb">${bar}</div>` : ""}
  <div class="tiles">
    <div class="stat" style="--c:var(--blue)"><span class="stat-top">${icon("trend")}${esc(t("Average"))}</span><span class="stat-v">${esc(f1(avg))}</span><span class="stat-s">${esc(V.length === 1 ? t("1 record") : t("{n} records", { n: V.length }))}</span></div>
    <div class="stat" style="--c:var(--ok)"><span class="stat-top">${icon("star")}${esc(t("Best"))}</span><span class="stat-v">${esc(f1(best))}</span><span class="stat-s">&nbsp;</span></div>
  </div>
  <div class="card mt"><div class="card-h"><h3>${esc(t("My progress"))}</h3></div>${trend(V.slice(0, 12).reverse())}</div>
  <div class="mt stack-s">${cards}</div>`;
}
act("pf-sub", (el) => { P().f = el.dataset.arg; refresh(); });

// bar chart of the percentages, oldest to newest
function trend(list) {
  const W = 300, H = 128, pad = 14, n = list.length, w = (W - 2 * pad) / n, bw = Math.min(28, w * 0.62), top = 18, bot = 22;
  const bars = list.map((x, i) => {
    const p = pct(x.m, x.max), h = (p / 100) * (H - top - bot), xx = pad + i * w + (w - bw) / 2, y = H - bot - h;
    return `<rect x="${xx.toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(2, h).toFixed(1)}" rx="4" fill="${colorOf(p)}"/><text x="${(xx + bw / 2).toFixed(1)}" y="${(y - 4).toFixed(1)}" text-anchor="middle" font-size="8.5" font-weight="700" fill="var(--ink)">${Math.round(p)}</text><text x="${(xx + bw / 2).toFixed(1)}" y="${H - 8}" text-anchor="middle" font-size="7.5" fill="var(--ink-2)">${esc(short(x.date))}</text>`;
  }).join("");
  return `<svg class="pf-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(t("Marks in percent, oldest to newest"))}"><line x1="${pad}" y1="${H - bot}" x2="${W - pad}" y2="${H - bot}" stroke="var(--line)"/>${bars}</svg>`;
}

// the last three marks, for the student's dashboard
export async function recentPerf() {
  if (!S.me || S.me.role !== "student" || !S.me.bid) return "";
  const L = (await db.recent("pf", 3, ["sid", "==", S.pid]).catch(() => [])).sort(newest);
  if (!L.length) return "";
  return card(t("My performance"), `<div class="list">${L.map((x) => { const p = pct(x.m, x.max); return `<div class="item"><div class="item-b"><b class="item-t">${esc(kindName(x))}</b><span class="mut">${esc([x.subj, long(x.date)].filter(Boolean).join(" · "))}</span>${meter(p, colorOf(p))}</div><div class="item-a"><b>${esc(n2(x.m))}<span class="mut"> / ${esc(n2(x.max))}</span></b></div></div>`; }).join("")}</div>`, { right: btn(t("All"), "nav", { arg: "performance", sm: true }) });
}

addBN({
  "Performance": "পারফরম্যান্স", "New": "নতুন", "Draft": "খসড়া", "Published": "প্রকাশিত", "Assessment date": "তারিখ",
  "Class Performance": "ক্লাস পারফরম্যান্স", "Exam Performance": "পরীক্ষা পারফরম্যান্স", "Type": "ধরন", "Other": "অন্যান্য", "Marks are out of {n}.": "নম্বর {n} এর মধ্যে দিতে হবে।",
  "Saved records": "সেভ করা রেকর্ড", "Choose a saved record": "একটি সেভ করা রেকর্ড বেছে নিন", "An old record. It can only be deleted.": "পুরোনো রেকর্ড। এটি শুধু মোছা যাবে।", "Delete this record": "এই রেকর্ড মুছুন",
  "{a} of {b} marks entered": "{b} জনের মধ্যে {a} জনের নম্বর দেওয়া হয়েছে", "Marks of {n}": "{n} এর নম্বর",
  "Save Draft": "খসড়া সেভ", "Save & Publish": "সেভ ও প্রকাশ", "Empty = no mark (not counted, the student does not see it). Draft marks are not shown to students.": "খালি = নম্বর নেই (গণনায় ধরা হয় না, ছাত্র দেখবে না)। খসড়া নম্বর ছাত্রদের দেখানো হয় না।",
  "Made by {n}. Only they or the admin can change it.": "{n} এটি বানিয়েছেন। শুধু তিনি বা অ্যাডমিন বদলাতে পারবেন।", "Choose the assessment date.": "তারিখ বেছে নিন।",
  "Check the marks of {n}. They must be between 0 and {max}.": "{n} এর নম্বর দেখুন। এটি ০ থেকে {max} এর মধ্যে হতে হবে।",
  "Enter at least one mark before publishing.": "প্রকাশের আগে অন্তত একজনের নম্বর দিন।", "Publish these marks? {n} students will see their marks right away.": "এই নম্বর প্রকাশ করবেন? {n} জন ছাত্র সঙ্গে সঙ্গে নিজের নম্বর দেখবে।",
  "{k} students have no mark and will not see this one.": "{k} জনের নম্বর নেই, তারা এটি দেখবে না।", "Publish": "প্রকাশ করুন", "Saving as a draft hides these marks from the students. Continue?": "খসড়া হিসেবে সেভ করলে নম্বর ছাত্রদের কাছ থেকে লুকানো হবে। চালিয়ে যাবেন?",
  "Performance published: {n}": "পারফরম্যান্স প্রকাশিত: {n}", "Published. Students can see their marks now.": "প্রকাশ হয়েছে। ছাত্ররা এখন নম্বর দেখতে পাবে।", "Draft saved.": "খসড়া সেভ হয়েছে।",
  "Delete \"{n}\" and all its marks? Students lose it too.": "\"{n}\" ও এর সব নম্বর মুছবেন? ছাত্ররাও আর দেখবে না।", "No performance marks are published yet.": "এখনো কোনো পারফরম্যান্সের নম্বর প্রকাশ হয়নি।",
  "My performance": "আমার পারফরম্যান্স", "My progress": "আমার অগ্রগতি", "Average": "গড়", "1 record": "১টি রেকর্ড", "{n} records": "{n}টি রেকর্ড", "Marks in percent, oldest to newest": "শতকরা নম্বর, পুরোনো থেকে নতুন",
});
