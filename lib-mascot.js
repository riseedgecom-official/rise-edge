// The avatar on the sign-in and registration screens. It changes its picture to match what the person does:
//   idle     - nothing is happening, or a plain box (name, phone ...) is focused; also while the password is shown
//   think    - the Login ID box is focused / being typed in; also while the sign-in is being checked
//   hide     - a password box is focused: one hand over the eyes
//   angry    - wrong ID or input: empty box, wrong sum, a roll number nobody has, an invalid registration form
//   sad      - the login failed: the ID is there but the password / sign-in was refused
//   confused - it cannot make sense of the ID (not a roll number, not an email, nobody has it); also "Forgot password?" is open
//   happy    - the login worked (shown for a moment before the page opens); the registration is done
// One picture per state: av-<name>.webp (400 x 600; idle is the round profile picture). To change a picture, upload a new file with the same name.
// Only the look of the screen changes; nothing is sent anywhere.

const PICS = ["idle", "think", "happy", "hide", "angry", "sad", "confused"];
const PIC = { idle: "idle", watch: "idle", think: "think", happy: "happy", hide: "hide", angry: "angry", sad: "sad", confused: "confused" };

export const mascotHtml = (mood = "idle") => `<div class="mc" data-mc="${mood}" data-im="${PIC[mood] || "idle"}" aria-hidden="true">${PICS.map((n) => `<img class="mc-i mc-${n}" src="av-${n}.webp" alt="" width="400" height="600" decoding="async" draggable="false">`).join("")}</div>`;

// ---------- state ----------
let timer = 0;
const mc = () => document.querySelector(".mc");
// Show a state. With `hold` (ms) it goes back to what the focused box asks for once the time is up.
export function mascot(state, hold = 0) {
  const m = mc();
  if (!m || !PIC[state]) return;
  clearTimeout(timer);
  m.dataset.mc = state;
  m.dataset.im = PIC[state];
  if (hold) timer = setTimeout(settle, hold);
}
function settle() {
  const a = document.activeElement;
  if (isBox(a)) react(a); else mascot("idle");
}

// does it look like a login ID? A roll (REAS-2026-101, REAT-2026-003) or an email
export const idLooksRight = (v) => { const s = String(v || "").trim(); return /^REA[ST]-\d{4}-\d{3,6}$/i.test(s) || /^[^\s@\/]+@[^\s@\/]+\.[^\s@\/]+$/.test(s); };

// only the boxes of the sign-in / registration page itself (not the boxes in a pop-up)
const isBox = (e) => !!e && /^(INPUT|SELECT|TEXTAREA)$/.test(e.tagName) && e.type !== "checkbox" && e.type !== "radio" && e.type !== "hidden" && !!e.closest(".auth");
function react(e) {
  if (!mc() || !isBox(e)) return;
  if (e.closest(".pw")) return mascot(e.type === "password" ? "hide" : "watch");
  if (e.name === "u") return mascot("think");
  mascot("watch");
}
if (typeof document !== "undefined") {
  let leave = 0;
  document.addEventListener("focusin", (ev) => { clearTimeout(leave); react(ev.target); });
  document.addEventListener("input", (ev) => react(ev.target));
  document.addEventListener("focusout", () => {
    clearTimeout(leave);
    leave = setTimeout(() => {
      const a = document.activeElement, m = mc();
      if (!m || isBox(a) || (a && a.closest && a.closest(".pw"))) return;      // moved to another box, or to the Show button
      if (!["angry", "sad", "confused", "happy"].includes(m.dataset.mc)) mascot("idle");
    }, 90);
  });
}

// A successful login: show the happy picture for a moment before the page opens.
// pages-auth.js arms it before it signs in (and disarms it when the sign-in fails); app.js waits for it when the user arrives.
let armed = false;
export const armCelebration = () => { armed = true; };
export const disarmCelebration = () => { armed = false; };
export function celebration(ms = 1100) {
  if (!armed || !mc()) { armed = false; return Promise.resolve(); }
  armed = false;
  mascot("happy");
  return new Promise((r) => setTimeout(r, ms));
}
