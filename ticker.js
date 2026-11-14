// News ticker under the top bar: the institute's own headlines (Settings > News ticker) and the latest notices of the person's batch.
// Rebuilt by drawShell() in app.js (tickerHtml) and filled in afterwards (mountTicker): it never blocks a page.
import { S, esc, t, instName } from "./lib-core.js";
import { getNotices } from "./lib-svc.js";

const MAX_AGE = 30 * 864e5;   // an old notice is not "news"
const welcome = () => t("Welcome to {n}", { n: instName() });
const own = () => (Array.isArray(S.INST && S.INST.ticker) ? S.INST.ticker : []).map((x) => String(x || "").trim()).filter(Boolean);
const itemsHtml = (list) => list.map((x) => `<span class="tk-i">${esc(x)}</span>`).join("");

export function tickerHtml() {
  return `<div class="ticker" id="ticker" role="marquee" aria-label="${esc(t("News"))}">
    <span class="tk-badge">${esc(t("News"))}</span>
    <div class="tk-win"><div class="tk-track" id="tkTrack"><span class="tk-set">${itemsHtml([...own(), welcome()])}</span></div></div>
  </div>`;
}

// the track holds the list twice so the loop has no gap; the list is repeated until one copy is wider than the window
function fill(track, list) {
  const one = itemsHtml(list), win = track.parentElement ? track.parentElement.clientWidth || 360 : 360;
  let n = 1;
  track.innerHTML = `<span class="tk-set">${one}</span>`;
  while (track.firstElementChild.offsetWidth < win && n < 12) { n++; track.firstElementChild.innerHTML = one.repeat(n); }
  const set = track.firstElementChild.innerHTML, w = track.firstElementChild.offsetWidth;
  track.innerHTML = `<span class="tk-set">${set}</span><span class="tk-set tk-dup" aria-hidden="true">${set}</span>`;
  track.style.animationDuration = Math.max(20, Math.round((w || win) / 55)) + "s";   // about 55 px a second, whatever the length
}

// the sticky ticker sits right under the top bar: take the real height of the bar
let ro = null;
function fit() {
  const h = document.querySelector(".top");
  if (h) document.documentElement.style.setProperty("--topH", h.offsetHeight + "px");
}

export async function mountTicker() {
  const track = document.getElementById("tkTrack");
  if (!track) return;
  fit();
  if (typeof ResizeObserver === "function") {
    if (ro) ro.disconnect();
    ro = new ResizeObserver(fit);
    const h = document.querySelector(".top");
    if (h) ro.observe(h);
  }
  let live = [];
  try {
    const now = Date.now();
    live = ((await getNotices()) || [])
      .filter((n) => n && n.to === "batch" && typeof n.t === "string" && n.t.trim() && now - (n.d || 0) < MAX_AGE)
      .slice(0, 5)
      .map((n) => n.t.trim().slice(0, 140));
  } catch (e) { /* the fixed headlines stay */ }
  if (!track.isConnected) return;   // the shell was drawn again meanwhile
  fill(track, [...own(), ...live, welcome()]);
}
