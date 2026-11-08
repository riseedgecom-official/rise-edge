// The link inside the QR of an ID card, and how verify.html reads it back.
// Only what is printed on the card goes in: name, ID, class (or subject), batch, session.
// No phone numbers, no address, no blood group: anyone who finds or photographs a card can scan it.
// The text is: 1 | S, T or A | ID | name | class or subject | batch | session   (UTF-8, then base64url, in ?d=)

const SEP = "|";
const clean = (v) => String(v ?? "").replace(/[|\r\n]/g, " ").replace(/\s+/g, " ").trim();
export const b64u = (s) => { let o = ""; for (const x of new TextEncoder().encode(s)) o += String.fromCharCode(x); return btoa(o).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); };
export const unb64u = (s) => { s = String(s).replace(/-/g, "+").replace(/_/g, "/"); while (s.length % 4) s += "="; const r = atob(s), b = new Uint8Array(r.length); for (let i = 0; i < r.length; i++) b[i] = r.charCodeAt(i); return new TextDecoder().decode(b); };

// c = { k: "S" (student) | "T" (teacher) | "A" (admin), id, name, a: class or subject, b: batch, y: session }
export const cardLink = (base, c) => base + "?d=" + b64u(["1", c.k, c.id, c.name, c.a, c.b, c.y].map(clean).join(SEP));

// -> the same fields, or null when it is not a card of ours
export function readCard(d) {
  try {
    const p = unb64u(d).split(SEP);
    if (p[0] !== "1" || (p[1] !== "S" && p[1] !== "T" && p[1] !== "A") || !clean(p[2])) return null;
    return { k: p[1], id: clean(p[2]), name: clean(p[3]), a: clean(p[4]), b: clean(p[5]), y: clean(p[6]) };
  } catch (e) { return null; }
}

// The most it can say and still be one QR: the batch goes first, then the class / subject, then the name. `fits(link)` says if the QR can hold it.
export function fitLink(base, c, fits) {
  for (const x of [c, { ...c, b: "" }, { ...c, b: "", a: "" }, { ...c, b: "", a: "", name: "" }]) {
    const l = cardLink(base, x);
    if (fits(l)) return l;
  }
  return null;
}
