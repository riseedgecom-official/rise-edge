// Small UI toolkit: icons, form fields, cards, dialogs. Everything returns HTML strings
// (or promises, for dialogs) so pages stay short.
import { esc, t, $, $$, formData, S } from "./lib-core.js";

// ---------- icons (24x24, stroke) ----------
const IC = {
  home: '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>',
  users: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><circle cx="17" cy="9" r="2.4"/><path d="M17 14c2.5 0 4.5 2 4.5 4.5"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8"/>',
  cap: '<path d="M2 9l10-5 10 5-10 5z"/><path d="M6 11.5V16c0 1.5 3 3 6 3s6-1.5 6-3v-4.5"/><path d="M22 9v6"/>',
  layers: '<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>',
  calcheck: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18"/><path d="M9 15l2 2 4-4"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  book: '<path d="M12 6c-1.5-1.5-4-2-8-2v14c4 0 6.5.5 8 2 1.5-1.5 4-2 8-2V4c-4 0-6.5.5-8 2z"/><path d="M12 6v14"/>',
  file: '<path d="M14 3H6a1 1 0 00-1 1v16a1 1 0 001 1h12a1 1 0 001-1V8z"/><path d="M14 3v5h5M8 13h8M8 17h6"/>',
  bell: '<path d="M6 17V11a6 6 0 1112 0v6l1.5 2h-15z"/><path d="M10 21a2 2 0 004 0"/>',
  wallet: '<rect x="3" y="6" width="18" height="14" rx="2"/><path d="M3 10h18"/><circle cx="16.5" cy="15" r="1.2"/>',
  chart: '<path d="M4 20V4"/><path d="M4 20h16"/><path d="M8 16v-5M12 16V8M16 16v-8"/>',
  trophy: '<path d="M8 4h8v5a4 4 0 01-8 0z"/><path d="M8 6H4v1a3 3 0 003 3M16 6h4v1a3 3 0 01-3 3"/><path d="M12 13v4M8 20h8M10 17h4"/>',
  shield: '<path d="M12 3l8 3v6c0 4.5-3.2 8-8 9-4.8-1-8-4.5-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
  cog: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>',
  logout: '<path d="M9 4H5a1 1 0 00-1 1v14a1 1 0 001 1h4"/><path d="M16 8l4 4-4 4M20 12H9"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/><path d="M10 11v6M14 11v6"/>',
  edit: '<path d="M4 20l1-4L16 5l3 3L8 19z"/><path d="M14 7l3 3"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  upload: '<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v3a1 1 0 001 1h14a1 1 0 001-1v-3"/>',
  download: '<path d="M12 4v12M7 11l5 5 5-5"/><path d="M4 16v3a1 1 0 001 1h14a1 1 0 001-1v-3"/>',
  print: '<path d="M7 9V4h10v5"/><rect x="4" y="9" width="16" height="8" rx="1.5"/><path d="M7 14h10v6H7z"/>',
  phone: '<path d="M6 3h3l2 5-2.5 1.5a11 11 0 005 5L15 12l5 2v3a2 2 0 01-2 2A15 15 0 014 5a2 2 0 012-2z"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
  idcard: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="11" r="2.2"/><path d="M5.5 16c.6-1.8 2-2.6 3.5-2.6s2.9.8 3.5 2.6M15 10h4M15 13h3"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="1.7"/><path d="M4 18l5-5 4 4 3-3 4 4"/>',
  link: '<path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 00-5.7 0l-3 3A4 4 0 0011 18.7l1-1"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M16 7l3 3M14 9l2 2"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>',
  mega: '<path d="M4 10v4h3l8 4V6L7 10z"/><path d="M18 9a4 4 0 010 6"/>',
  clip: '<rect x="5" y="5" width="14" height="16" rx="2"/><path d="M9 5V3h6v2M9 11h6M9 15h4"/>',
  star: '<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8L3.5 9.7l5.9-.9z"/>',
  alert: '<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18v.01"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.01"/>',
  right: '<path d="M9 5l7 7-7 7"/>',
  down: '<path d="M5 9l7 7 7-7"/>',
  back: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  refresh: '<path d="M20 11a8 8 0 00-14-4L4 9M4 5v4h4M4 13a8 8 0 0014 4l2-2M20 19v-4h-4"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
  share: '<circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="M8.2 11l7.6-4M8.2 13l7.6 4"/>',
  sms: '<path d="M4 5h16v11H9l-5 4z"/>',
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/>',
  list: '<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/>',
  inbox: '<path d="M3 13l3-8h12l3 8v6H3z"/><path d="M3 13h5l1 3h6l1-3h5"/>',
  doc: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h4"/>',
};
export const icon = (n, cls = "") => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${IC[n] || IC.info}</svg>`;

// ---------- small pieces ----------
const AV_COLORS = ["#1469e8", "#0b9a6b", "#6a4cf0", "#c77700", "#0a9aa8", "#d6294a", "#2f4b9a"];
export function avatar(u, size = 40) {
  const s = `width:${size}px;height:${size}px;font-size:${Math.round(size / 2.3)}px`;
  if (u && u.pic) return `<img class="av" src="${esc(u.pic)}" alt="" style="${s}">`;
  const name = (u && u.name) || "?";
  let h = 0; for (const c of name) h = (h * 31 + c.codePointAt(0)) % 997;
  return `<span class="av" style="${s};background:${AV_COLORS[h % AV_COLORS.length]}">${esc([...name][0] || "?")}</span>`;
}
export const tag = (text, kind = "info") => `<span class="tag tag--${kind}">${esc(text)}</span>`;
export const empty = (msg, ic = "inbox") => `<div class="empty">${icon(ic)}<div>${esc(msg)}</div></div>`;
export const notice = (html, kind = "info", ic) => `<div class="notice notice--${kind}">${icon(ic || (kind === "warn" || kind === "bad" ? "alert" : kind === "ok" ? "check" : "info"))}<div>${html}</div></div>`;
export const meter = (pct, color) => `<div class="meter" style="${color ? "--c:" + color : ""}"><i style="width:${Math.max(0, Math.min(100, Math.round(pct || 0)))}%"></i></div>`;

export function ring(v, label, color = "var(--blue)", size = 88) {
  const p = v == null ? 0 : Math.max(0, Math.min(100, v)), R = 34, C = 2 * Math.PI * R;
  return `<div class="tc"><svg class="ring" viewBox="0 0 84 84" width="${size}" height="${size}" role="img" aria-label="${esc(label)} ${v == null ? "" : Math.round(v) + "%"}"><circle cx="42" cy="42" r="${R}" fill="none" stroke="var(--soft)" stroke-width="9"/><circle cx="42" cy="42" r="${R}" fill="none" stroke="${color}" stroke-width="9" stroke-linecap="round" stroke-dasharray="${((p / 100) * C).toFixed(1)} ${C.toFixed(1)}" transform="rotate(-90 42 42)"/><text x="42" y="47" text-anchor="middle" font-size="16" font-weight="800" fill="var(--ink)">${v == null ? "–" : Math.round(v) + "%"}</text></svg><div class="mut">${esc(label)}</div></div>`;
}
export function donut(parts, top, sub) {
  const R = 42, C = 2 * Math.PI * R, tot = parts.reduce((a, p) => a + p.v, 0) || 1;
  let off = 0;
  const arcs = parts.map((p) => {
    const l = (p.v / tot) * C;
    const e = `<circle cx="55" cy="55" r="${R}" fill="none" stroke="${p.c}" stroke-width="14" stroke-dasharray="${l.toFixed(1)} ${(C - l).toFixed(1)}" stroke-dashoffset="${(-off).toFixed(1)}" transform="rotate(-90 55 55)"/>`;
    off += l; return e;
  }).join("");
  return `<svg viewBox="0 0 110 110" width="130" height="130" role="img"><circle cx="55" cy="55" r="${R}" fill="none" stroke="var(--soft)" stroke-width="14"/>${arcs}<text x="55" y="55" text-anchor="middle" font-size="16" font-weight="800" fill="var(--ink)">${esc(top)}</text><text x="55" y="69" text-anchor="middle" font-size="8.5" fill="var(--ink-2)">${esc(sub || "")}</text></svg>`;
}

export function stat({ ic, label, value, sub, color, act, arg }) {
  const inner = `<span class="stat-top">${icon(ic)}${esc(label)}</span><span class="stat-v">${esc(value)}</span><span class="stat-s">${esc(sub || " ")}</span>`;
  const st = color ? ` style="--c:${color}"` : "";
  return act ? `<button class="stat" data-act="${act}" ${arg != null ? `data-arg="${esc(arg)}"` : ""}${st}>${inner}</button>` : `<div class="stat"${st}>${inner}</div>`;
}

export function card(title, body, { right = "", cls = "" } = {}) {
  return `<section class="card ${cls}">${title || right ? `<div class="card-h">${title ? `<h3>${esc(title)}</h3>` : ""}${right}</div>` : ""}${body}</section>`;
}

// list row: {av, title, sub, right, act, arg}
export function row({ av = "", title, sub = "", right = "", act, arg, titleHtml }) {
  const click = act ? ` item--click" data-act="${act}" data-arg="${esc(arg ?? "")}` : "";
  return `<div class="item${click}">${av}<div class="item-b"><b class="item-t">${titleHtml || esc(title)}</b>${sub ? `<span class="mut">${sub}</span>` : ""}</div>${right ? `<div class="item-a">${right}</div>` : ""}</div>`;
}

export const btn = (label, act, { arg, kind = "", ic = "", sm = false, xs = false, extra = "" } = {}) =>
  `<button type="button" class="btn ${kind ? "btn--" + kind : ""} ${sm ? "btn--sm" : ""} ${xs ? "btn--xs" : ""}" data-act="${act}" ${arg != null ? `data-arg="${esc(arg)}"` : ""} ${extra}>${ic ? icon(ic) : ""}${esc(label)}</button>`;

// chips: items [{k, label}] -> row of pills, data-act=act data-arg=k
export function chips(items, cur, actName) {
  return `<div class="chips" role="tablist">${items.map((i) => `<button type="button" class="chip ${String(i.k) === String(cur) ? "on" : ""}" data-act="${actName}" data-arg="${esc(i.k)}" role="tab" aria-selected="${String(i.k) === String(cur)}">${esc(i.label)}</button>`).join("")}</div>`;
}

// ---------- form fields ----------
const attrs = (o) => Object.entries(o).filter(([, v]) => v !== undefined && v !== false && v !== null).map(([k, v]) => (v === true ? k : `${k}="${esc(v)}"`)).join(" ");
export function field(label, control, hint = "") {
  return `<label class="fld"><span>${esc(label)}</span>${control}${hint ? `<small>${esc(hint)}</small>` : ""}</label>`;
}
export function input(name, { label, type = "text", value = "", placeholder = "", hint = "", ...rest } = {}) {
  const c = `<input name="${name}" type="${type}" value="${esc(value)}" ${placeholder ? `placeholder="${esc(placeholder)}"` : ""} ${attrs(rest)}>`;
  return label ? field(label, c, hint) : c;
}
export function textarea(name, { label, value = "", placeholder = "", rows = 4, hint = "" } = {}) {
  const c = `<textarea name="${name}" rows="${rows}" ${placeholder ? `placeholder="${esc(placeholder)}"` : ""}>${esc(value)}</textarea>`;
  return label ? field(label, c, hint) : c;
}
// options: [value, label] or "value"
export function select(name, options, value = "", { label, hint = "", ...rest } = {}) {
  const o = options.map((x) => { const [v, l] = Array.isArray(x) ? x : [x, x]; return `<option value="${esc(v)}" ${String(v) === String(value) ? "selected" : ""}>${esc(l)}</option>`; }).join("");
  const c = `<select name="${name}" ${attrs(rest)}>${o}</select>`;
  return label ? field(label, c, hint) : c;
}
export const clsOptions = () => [["", t("Class")], ...[4, 5, 6, 7, 8, 9, 10, 11, 12].map((c) => [String(c), t("Class {n}", { n: c })])];
export const grpOptions = (allLabel) => [["", allLabel || t("Group")], ["Science", t("Science")], ["Commerce", t("Commerce")], ["Arts", t("Arts")]];
export const grpLabel = (g) => (g ? t(g) : "");

// Batch chooser used at the top of most pages. Changing it fires the "pick-batch" handler (app.js) and redraws.
export function batchPicker() {
  if (!S.B.length) return "";
  if (S.B.length === 1) return `<div class="row mb">${tag(S.B[0].name, "info")}</div>`;
  const o = S.B.map((b) => `<option value="${esc(b.id)}" ${b.id === S.bid ? "selected" : ""}>${esc(b.name)}</option>`).join("");
  return `<div class="mb"><select data-change="pick-batch" aria-label="${esc(t("Batch"))}">${o}</select></div>`;
}

// ---------- dialogs ----------
let mods = [];
export function modal(html, { sticky = false } = {}) {
  const el = document.createElement("div");
  el.className = "mod";
  el.innerHTML = `<div class="mod-b" role="dialog" aria-modal="true">${html}</div>`;
  const api = { el, body: el.firstElementChild, close() { el.remove(); mods = mods.filter((m) => m !== api); } };
  if (!sticky) el.addEventListener("mousedown", (e) => { if (e.target === el) api.close(); });
  document.body.appendChild(el);
  mods.push(api);
  const first = el.querySelector("input:not([type=hidden]),select,textarea");
  if (first && !/Mobi|Android/i.test(navigator.userAgent)) first.focus();
  return api;
}
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && mods.length) mods[mods.length - 1].close(); });
export const closeModals = () => { [...mods].forEach((m) => m.close()); };

// yes / no question -> Promise<boolean>
export function ask(message, { title = "", ok = t("OK"), cancel = t("Cancel"), danger = false, noCancel = false } = {}) {
  return new Promise((res) => {
    const m = modal(`${title ? `<h3>${esc(title)}</h3>` : ""}<p>${esc(message)}</p><div class="mod-f">${noCancel ? "" : `<button class="btn" data-r="0">${esc(cancel)}</button>`}<button class="btn ${danger ? "btn--bad" : "btn--pri"}" data-r="1">${esc(ok)}</button></div>`, { sticky: true });
    m.body.addEventListener("click", (e) => { const b = e.target.closest("[data-r]"); if (b) { m.close(); res(b.dataset.r === "1"); } });
  });
}
export const info = (message, title = "") => ask(message, { title, noCancel: true });

// general form dialog. `fields` = html with named inputs. validate(data) -> error text or "".
// onSave(data) may be async; throw to keep the dialog open and show the error. Resolves with the onSave result, or null if cancelled.
export function form(title, fields, { ok = t("Save"), cancel = t("Cancel"), validate, onSave, hint = "" } = {}) {
  return new Promise((res) => {
    const m = modal(`<form novalidate><h3>${esc(title)}</h3>${hint ? `<p class="mut">${esc(hint)}</p>` : ""}${fields}<p class="bad sm" data-err hidden></p><div class="mod-f"><button type="button" class="btn" data-r="0">${esc(cancel)}</button><button type="submit" class="btn btn--pri">${esc(ok)}</button></div></form>`, { sticky: true });
    const f = m.body.querySelector("form"), er = m.body.querySelector("[data-err]");
    const show = (s) => { er.textContent = s; er.hidden = !s; };
    m.body.querySelector("[data-r]").onclick = () => { m.close(); res(null); };
    f.addEventListener("submit", async (e) => {
      e.preventDefault();
      const data = formData(f);
      const bad = validate ? validate(data) : "";
      if (bad) return show(bad);
      const b = f.querySelector("button[type=submit]");
      b.disabled = true; show("");
      try { const out = onSave ? await onSave(data) : data; m.close(); res(out === undefined ? true : out); }
      catch (x) { show((x && x.message) || String(x)); b.disabled = false; }
    });
  });
}
export const askText = (title, { label = "", value = "", placeholder = "", type = "text", multiline = false, ok = t("Save"), hint = "" } = {}) =>
  form(title, multiline ? textarea("v", { label, value, placeholder }) : input("v", { label, value, placeholder, type }), { ok, hint, onSave: (d) => d.v.trim() }).then((r) => (r === null || r === true ? null : r));

// ---------- toast ----------
let toastEl, toastT;
export function toast(msg, kind = "") {
  if (!toastEl) { toastEl = document.createElement("div"); toastEl.setAttribute("role", "status"); document.body.appendChild(toastEl); }
  toastEl.className = "toast" + (kind ? " toast--" + kind : "");
  toastEl.textContent = msg;
  toastEl.hidden = false;
  clearTimeout(toastT);
  toastT = setTimeout(() => { toastEl.hidden = true; }, kind === "bad" ? 5200 : 2600);
}

// ---------- full-screen document (report / receipt / ID card) ----------
let docEl = null;
export function showDoc(html, { extra = "", title = "" } = {}) {
  closeDoc();
  docEl = document.createElement("div");
  docEl.className = "doc";
  docEl.innerHTML = `<div class="doc-bar"><button class="btn btn--pri" data-act="doc-print">${icon("print")}${esc(t("Print / Save PDF"))}</button>${extra}<button class="btn" data-act="doc-close">${icon("x")}${esc(t("Close"))}</button></div><div class="doc-pg">${html}</div>`;
  document.body.appendChild(docEl);
  docEl.scrollTop = 0;
  return docEl;
}
export function closeDoc() { if (docEl) { docEl.remove(); docEl = null; } }
export const docRoot = () => docEl;
