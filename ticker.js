// Notice ticker under the top bar (design: Live_Notice_Ticker): a coloured bar, an amber "Notice" badge with a pulsing dot,
// notices scrolling right to left, paused on hover / touch. The admin publishes, hides, edits and deletes them on the "News ticker" page.
//   config/inst.ticker   [{id, t, on, c}]  (older versions saved plain strings: they still work and count as live)
//   config/inst.tkSpeed  "slow" | "normal" | "fast"      config/inst.tkTheme  "blue" | "red" | "green" | "dark"
// Plus the latest notices of the person's batch (last 30 days). With nothing to show the ticker is not drawn at all.
// This file brings its own CSS (and the theme CSS of the dashboard and Study pages, see THEME) and the layout is also set inline, so a missing stylesheet can never break the page.
import { S, esc, t } from "./lib-core.js";
import { getNotices } from "./lib-svc.js";

export const SPEEDS = { slow: 35, normal: 60, fast: 100 };      // pixels a second
export const THEMES = ["blue", "red", "green", "dark"];
export const MAX_NOTICES = 30;
export const MAX_TEXT = 200;
const MAX_AGE = 30 * 864e5;                                     // an old batch notice is not "news"

// the admin's notices, old or new format: [{id, t, on, c}]
export function noticeList(inst = S.INST) {
  const a = Array.isArray(inst && inst.ticker) ? inst.ticker : [];
  return a.map((x, i) => {
    if (typeof x === "string") return { id: "L" + i, t: x.trim(), on: true, c: 0 };
    if (x && typeof x === "object") return { id: String(x.id || "L" + i), t: String(x.t || "").trim(), on: x.on !== false, c: +x.c || 0 };
    return null;
  }).filter((x) => x && x.t);
}
const speed = () => (SPEEDS[S.INST && S.INST.tkSpeed] ? S.INST.tkSpeed : "normal");
const theme = () => (THEMES.includes(S.INST && S.INST.tkTheme) ? S.INST.tkTheme : "blue");
const live = () => noticeList().filter((x) => x.on).map((x) => x.t);

const CSS = `
.nt{position:sticky;top:var(--topH,59px);z-index:5;display:flex;align-items:center;height:44px;padding:0 8px;overflow:hidden;color:#fff;background:#4338ca;box-shadow:0 2px 8px rgba(15,23,42,.18);transition:background .3s}
.nt-red{background:#be123c}.nt-green{background:#047857}.nt-dark{background:#0f172a}
.nt-badge{flex:none;display:flex;align-items:center;gap:8px;margin-right:10px;padding:6px 12px;border-radius:10px;background:#fbbf24;color:#0f172a;font-weight:700;font-size:12px;line-height:1;box-shadow:0 1px 2px rgba(0,0,0,.18);position:relative;z-index:1}
.nt-red .nt-badge{background:#fff;color:#be123c}.nt-green .nt-badge{background:#fcd34d}.nt-dark .nt-badge{background:#6366f1;color:#fff}
.nt-dot{position:relative;flex:none;width:10px;height:10px;border-radius:50%;background:#dc2626}
.nt-dot::after{content:"";position:absolute;inset:0;border-radius:50%;background:#dc2626;animation:nt-ping 1.5s cubic-bezier(0,0,.2,1) infinite}
@keyframes nt-ping{0%{transform:scale(1);opacity:.75}75%,100%{transform:scale(2.5);opacity:0}}
.nt-win{flex:1;min-width:0;height:100%;overflow:hidden;display:flex;align-items:center;cursor:pointer}
.nt-track{display:inline-flex;white-space:nowrap;will-change:transform;animation:nt-run 30s linear infinite}
.nt-win:hover .nt-track,.nt-win:active .nt-track{animation-play-state:paused}
@keyframes nt-run{from{transform:translateX(0)}to{transform:translateX(-50%)}}
.nt-set{display:inline-flex;flex:none;align-items:center}
.nt-i{display:inline-flex;align-items:center;margin:0 22px;font-size:14px;font-weight:500;letter-spacing:.01em}
.nt-i svg{flex:none;width:14px;height:14px;margin-right:9px;color:#fcd34d}
.nt-sep{opacity:.4;user-select:none}
.nt-hint{display:none;flex:none;align-items:center;gap:6px;margin-left:8px;padding-left:12px;border-left:1px solid rgba(255,255,255,.22);font-size:12px;color:rgba(255,255,255,.75)}
.nt-hint svg{width:11px;height:11px}
@media (min-width:768px){.nt-hint{display:flex}}
@media (prefers-reduced-motion:reduce){.nt-track{animation:none}.nt-dup{display:none!important}.nt-win{overflow-x:auto}}
@media print{.nt{display:none!important}}`;

// The look of the dashboard hero, the Study pages and the practice sets used to live in theme.css. A phone that never got
// that file (or a portal.html without its link) showed them unstyled (a huge bot icon), so the CSS is added from here:
// this file is loaded by app.js on every screen, before anything is drawn. There is no theme.css any more.
const THEME = `
/* Rise Edge Academy - theme layer on top of app.css: news ticker and the dashboard hero. */
:root{--grad:linear-gradient(135deg,#2563eb,#7c3aed)}

[hidden]{display:none!important}

/* the news ticker brings its own CSS (ticker.js) */

/* ---------- dashboard hero ---------- */
.hero{background:var(--grad);color:#fff;border-radius:20px;padding:20px;
  box-shadow:0 10px 30px rgba(37,99,235,.25);margin-bottom:16px}
.hero .welcome{margin-bottom:0}
.hero .welcome h2{color:#fff}
.hero .mut{color:rgba(255,255,255,.86)}
.hero-rings{--ink:#14213d;--ink-2:#4a5878;--soft:#e3e9f6;margin-top:14px;
  background:rgba(255,255,255,.95);color:#14213d;border-radius:16px;padding:12px}
.hero-rings .rings{grid-template-columns:repeat(auto-fit,minmax(84px,1fr));gap:8px}   /* three rings stay in one row on a phone */
.hero-rings .mut{color:#4a5878}
.sec-t{font-weight:700;font-size:15px;margin:20px 0 10px}

/* ---------- Study section (pages-study.js) ---------- */
.sp-tip{display:flex;gap:12px;align-items:flex-start;background:color-mix(in srgb,var(--violet) 8%,var(--card));border-color:color-mix(in srgb,var(--violet) 40%,var(--line))}
.sp-tip>svg{width:26px;height:26px;flex:none;color:var(--violet);margin-top:2px}
.sp-tip p{margin:4px 0 10px;line-height:1.5}
.sp-btns{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}
.ib{width:36px;height:36px;display:grid;place-items:center;border:0;background:none;border-radius:10px;cursor:pointer;color:var(--ink-2);flex:none}
.ib:hover{background:var(--soft);color:var(--blue)}
.ib svg{width:19px;height:19px}
.item-a{display:flex;align-items:center;gap:2px}
.chk{width:28px;height:28px;border-radius:50%;border:2px solid var(--line-2);background:var(--card);display:grid;place-items:center;cursor:pointer;color:#fff;flex:none;padding:0}
.chk svg{width:16px;height:16px;stroke-width:3}
.chk.on{background:var(--ok);border-color:var(--ok)}
.chk:focus-visible,.ib:focus-visible,.wk button:focus-visible{outline:3px solid var(--blue);outline-offset:2px}
.sp-done{text-decoration:line-through;color:var(--ink-2)}
.pl-top{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:10px}
.wk{display:grid;grid-template-columns:repeat(7,1fr);gap:6px}
.wk button{position:relative;border:1.5px solid var(--line);background:var(--card);border-radius:14px;padding:8px 0 10px;display:flex;flex-direction:column;align-items:center;gap:2px;cursor:pointer;font-size:12px;color:var(--ink-2);font-family:inherit}
.wk button b{font-size:17px;color:var(--ink)}
.wk button.td:not(.on){border-color:var(--blue)}
.wk button.on{background:var(--grad);border-color:transparent;color:#fff}
.wk button.on b{color:#fff}
.wk i{position:absolute;bottom:4px;width:5px;height:5px;border-radius:50%;background:var(--blue)}
.wk button.on i{background:#fff}
/* focus timer */
.ft{display:flex;flex-direction:column;align-items:center;gap:6px}
.ft .chips{justify-content:center;margin-bottom:0;max-width:100%}
.ft-ring{position:relative;width:min(240px,70vw);aspect-ratio:1;margin:8px 0}
.ft-ring svg{width:100%;height:100%}
.ft-bg{fill:none;stroke:var(--soft);stroke-width:14}
.ft-fg{fill:none;stroke:var(--blue);stroke-width:14;stroke-linecap:round;transition:stroke-dashoffset .5s linear}
.ft-fg.break{stroke:var(--ok)}
.ft-in{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center}
.ft-t{font-size:44px;font-weight:800;letter-spacing:-.02em;font-variant-numeric:tabular-nums}
.ft .fld{width:100%;max-width:340px}
.ft-btns{display:flex;gap:8px;flex-wrap:wrap;justify-content:center;margin:6px 0}
.ft-sum{display:flex;align-items:center;gap:10px;font-size:22px}.ft-sum svg{width:24px;height:24px;color:var(--blue)}
@media (prefers-reduced-motion:reduce){.ft-fg{transition:none}}
/* chat */
.ch-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:10px}
.ch{padding-bottom:6px}
.ch-list{display:flex;flex-direction:column;gap:12px}
.msg{display:flex;gap:8px;max-width:92%}
.msg--me{align-self:flex-end}
.msg-av{width:30px;height:30px;border-radius:50%;background:var(--grad);color:#fff;display:grid;place-items:center;flex:none}
.msg-av svg{width:17px;height:17px}
.msg-b{padding:10px 13px;border-radius:16px;line-height:1.55;overflow-wrap:anywhere;min-width:0}
.msg--bot .msg-b{background:var(--card);border:1.5px solid var(--line);border-top-left-radius:4px}
.msg--me .msg-b{background:var(--grad);color:#fff;border-top-right-radius:4px}
.msg-b small{display:block;margin-top:8px;font-size:12px}
.typing{display:flex;gap:5px;align-items:center;min-height:24px}
.typing i{width:7px;height:7px;border-radius:50%;background:var(--ink-2);opacity:.5;animation:sp-dot 1s infinite}
.typing i:nth-child(2){animation-delay:.15s}.typing i:nth-child(3){animation-delay:.3s}
@keyframes sp-dot{0%,80%,100%{opacity:.25;transform:translateY(0)}40%{opacity:1;transform:translateY(-3px)}}
@media (prefers-reduced-motion:reduce){.typing i{animation:none;opacity:.6}}
.chat-in-w{position:sticky;bottom:calc(74px + env(safe-area-inset-bottom,0px));background:var(--paper);padding-top:8px;z-index:6}
@media (min-width:980px){.chat-in-w{bottom:0;padding-bottom:12px}}
.chat-in{display:flex;gap:8px;align-items:flex-end}
.chat-in textarea{flex:1;min-height:44px;max-height:120px;resize:none;border:1.5px solid var(--line-2);background:var(--card);color:var(--ink);border-radius:14px;padding:10px 12px;font:inherit}
.chat-in textarea:focus{outline:3px solid color-mix(in srgb,var(--blue) 40%,transparent);border-color:var(--blue)}
.chat-in .btn{min-height:44px;min-width:48px}

/* three tiles on a phone: the last one takes the whole row instead of standing alone */
@media(max-width:559px){.tiles-3>:last-child{grid-column:1/-1}}
`;
function css() {
  if (typeof document === "undefined") return;
  [["nt-css", CSS], ["theme-css", THEME]].forEach(([id, text]) => {
    if (document.getElementById(id)) return;
    const s = document.createElement("style");
    s.id = id; s.textContent = text;
    document.head.appendChild(s);   // after app.css, so it wins where both say something
  });
}
css();

const HORN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 10v4h3l8 4V6L7 10z"/><path d="M18 9a4 4 0 010 6"/></svg>';
const PAUSE = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>';
const item = (x) => `<span class="nt-i">${HORN}<span>${esc(x)}</span></span><span class="nt-sep">•</span>`;
const setHtml = (list) => list.map(item).join("");
// layout that must never depend on the stylesheet (inline); the look comes from the CSS above
const BOX = "display:flex;align-items:center;height:44px;overflow:hidden";
const SET = "display:inline-flex;flex:none;align-items:center";
const set = (inner, dup) => `<span class="nt-set${dup ? " nt-dup" : ""}" ${dup ? 'aria-hidden="true" ' : ""}style="${SET}">${inner}</span>`;

export function tickerHtml() {
  const list = live();
  return `<div class="nt nt-${theme()}" id="ticker" role="marquee" aria-label="${esc(t("Notice"))}" style="${list.length ? BOX : "display:none"}">
    <span class="nt-badge"><span class="nt-dot"></span><span>${esc(t("Notice"))}</span></span>
    <div class="nt-win" title="${esc(t("Hover to pause"))}" style="flex:1;min-width:0;overflow:hidden;display:flex;align-items:center"><div class="nt-track" id="tkTrack" style="display:inline-flex;white-space:nowrap">${set(setHtml(list))}</div></div>
    <span class="nt-hint">${PAUSE}${esc(t("Hover to pause"))}</span>
  </div>`;
}

// the track holds the list twice so the loop has no gap; the list is repeated until one copy is wider than the window
function fill(box, track, list) {
  if (!list.length) { box.style.display = "none"; return; }
  box.style.cssText = BOX;
  const one = setHtml(list), win = (track.parentElement && track.parentElement.clientWidth) || 360;
  track.innerHTML = set(one);
  const first = track.firstElementChild;
  let n = 1;
  while (first.offsetWidth > 0 && first.offsetWidth < win && n < 10) { n++; first.innerHTML = one.repeat(n); }
  const inner = first.innerHTML, w = first.offsetWidth;
  track.innerHTML = set(inner) + set(inner, true);
  track.style.animationDuration = Math.max(8, Math.round((w || win) / SPEEDS[speed()])) + "s";
}

// the sticky ticker sits right under the top bar: take the real height of the bar
let ro = null, rz = 0, last = [];
function fit() {
  const h = document.querySelector(".top");
  if (h) document.documentElement.style.setProperty("--topH", h.offsetHeight + "px");
}

export async function mountTicker() {
  const box = document.getElementById("ticker"), track = document.getElementById("tkTrack");
  if (!box || !track) return;
  fit();
  if (typeof ResizeObserver === "function") {
    if (ro) ro.disconnect();
    ro = new ResizeObserver(fit);
    const h = document.querySelector(".top");
    if (h) ro.observe(h);
  }
  if (!rz) {   // turning the phone: the window is wider or narrower, so fill the track again
    let to = 0;
    window.addEventListener("resize", () => { clearTimeout(to); to = setTimeout(() => { const b = document.getElementById("ticker"), k = document.getElementById("tkTrack"); if (b && k && last.length) fill(b, k, last); }, 250); });
    rz = 1;
  }
  let batch = [];
  try {
    const now = Date.now();
    batch = ((await getNotices()) || [])
      .filter((n) => n && n.to === "batch" && typeof n.t === "string" && n.t.trim() && now - (n.d || 0) < MAX_AGE)
      .slice(0, 5)
      .map((n) => n.t.trim().slice(0, 140));
  } catch (e) { /* the admin's notices stay */ }
  if (!track.isConnected) return;   // the shell was drawn again meanwhile
  last = [...live(), ...batch];
  fill(box, track, last);
}
