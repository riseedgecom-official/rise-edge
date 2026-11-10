// A receipt as a PDF FILE that can be shared on WhatsApp. No library: the receipt is drawn on a canvas, and the picture is put on one
// page of a minimal PDF. shareFile() opens the phone's share sheet with the file (WhatsApp is in it); where files cannot be shared
// (a computer) the PDF is saved instead.

// ---------- drawing ----------
const NAVY = "#13294b", LINE = "#d5dfec", BOX = "#9fb6d1", OK = "#1d7a46", BAD = "#b3261e";
const SERIF = "Georgia, 'Anek Bangla', 'Noto Sans Bengali', serif";
const ascii = (s) => /^[\x20-\x7e]*$/.test(s);

function loadImg(src) {
  return new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });
}
async function fontsFor(texts) {
  try {
    const s = texts.join(" ");
    await Promise.race([Promise.all([document.fonts.load("400 14px 'Anek Bangla'", s), document.fonts.load("700 14px 'Anek Bangla'", s), document.fonts.ready]), new Promise((r) => setTimeout(r, 1800))]);
  } catch (e) { /* the system font is used */ }
}

// d = { inst, title, head: [[label, value] x 6], cols: [4 labels], pay: [[a, b, c, d]...], sum: [[label, value]...], status, bad, phone, sign, logo }
export async function drawReceipt(d) {
  const W = 460, S = 3, PAD = 18, IN = W - PAD * 2;
  const texts = [d.inst, d.title, d.status, d.sign, ...d.head.flat(), ...d.cols, ...d.pay.flat(), ...d.sum.flat()].map(String);
  await fontsFor(texts);
  const logo = await loadImg(d.logo || "logo.jpg");
  const rows = d.pay.length, HR = 1 + Math.ceil((d.head.length - 1) / 2), HB = HR * 28 + 6, H = PAD + 70 + HB + 14 + 20 + rows * 28 + 12 + (d.sum.length * 24 + 46) + 40 + PAD;
  const cv = document.createElement("canvas"); cv.width = W * S; cv.height = H * S;
  const c = cv.getContext("2d");
  c.scale(S, S); c.fillStyle = "#fff"; c.fillRect(0, 0, W, H);
  const rr = (x, y, w, h, r) => { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); };
  const font = (px, w = 400) => { c.font = w + " " + px + "px " + SERIF; };
  const fit = (s, max) => { s = String(s); if (c.measureText(s).width <= max) return s; while (s.length > 1 && c.measureText(s + "…").width > max) s = s.slice(0, -1); return s + "…"; };
  const spaced = (s, cx, y, gap) => {   // letter-spaced text (Latin only: spacing would break Bangla letters)
    s = String(s); if (!ascii(s)) { c.textAlign = "center"; c.fillText(s, cx, y); return; }
    const w = [...s].reduce((a, ch) => a + c.measureText(ch).width + gap, -gap); let x = cx - w / 2; c.textAlign = "left";
    for (const ch of s) { c.fillText(ch, x, y); x += c.measureText(ch).width + gap; }
  };
  c.textBaseline = "alphabetic";
  // frame
  c.strokeStyle = NAVY; c.lineWidth = 2; rr(1, 1, W - 2, H - 2, 12); c.stroke();
  // header: logo, institute name, title
  let y = PAD;
  if (logo) { c.save(); c.beginPath(); c.arc(PAD + 29, y + 29, 29, 0, Math.PI * 2); c.clip(); c.drawImage(logo, PAD, y, 58, 58); c.restore(); }
  c.fillStyle = "#000"; c.textAlign = "center"; font(19, 800);
  c.fillText(fit(String(d.inst).toUpperCase(), IN - 70), PAD + 58 + 12 + (IN - 70) / 2, y + 26);
  font(12); spaced(d.title, PAD + 58 + 12 + (IN - 70) / 2, y + 48, 2.4);
  // student details: two columns
  y += 58 + 12;
  c.strokeStyle = BOX; c.lineWidth = 1; rr(PAD + 0.5, y + 0.5, IN - 1, HB, 6); c.stroke();
  const cw = (IN - 24) / 2;
  d.head.forEach(([k, v], i) => {
    // the first one (the receipt number) has the whole line, the others are two to a line
    const j = i - 1, x = PAD + 12 + (i === 0 ? 0 : (j % 2) * cw), ry = y + 22 + (i === 0 ? 0 : 1 + Math.floor(j / 2)) * 28, room = (i === 0 ? IN - 24 : cw);
    c.textAlign = "left"; font(13, 700); c.fillStyle = "#000"; const kw = c.measureText(k + ": ").width; c.fillText(k + ": ", x, ry);
    font(13); c.fillText(fit(v, room - kw - 8), x + kw, ry);
  });
  y += HB + 14;
  // payments table
  const cx = [PAD + 4, PAD + 4 + IN * 0.27, PAD + 4 + IN * 0.5, PAD + IN - 4], cwid = [IN * 0.25, IN * 0.21, IN * 0.17, 0];
  c.fillStyle = "#000"; font(13, 700); d.cols.forEach((k, i) => { c.textAlign = i === 3 ? "right" : "left"; c.fillText(k, cx[i], y + 12); });
  y += 20;
  font(13);
  d.pay.forEach((r) => {
    c.strokeStyle = LINE; c.beginPath(); c.moveTo(PAD, y + 0.5); c.lineTo(PAD + IN, y + 0.5); c.stroke();
    r.forEach((v, i) => { c.textAlign = i === 3 ? "right" : "left"; c.fillStyle = "#000"; c.fillText(i === 3 ? String(v) : fit(v, cwid[i]), cx[i], y + 18); });
    y += 28;
  });
  y += 12;
  // totals
  const bh = d.sum.length * 24 + 16 + 30;
  c.strokeStyle = BOX; rr(PAD + 0.5, y + 0.5, IN - 1, bh, 6); c.stroke();
  d.sum.forEach(([k, v], i) => { const ry = y + 24 + i * 24; c.textAlign = "left"; font(13); c.fillStyle = "#000"; c.fillText(k, PAD + 12, ry); c.textAlign = "right"; font(13, 700); c.fillText(v, PAD + IN - 12, ry); });
  c.fillStyle = d.bad ? BAD : OK; font(15, 800); spaced(d.status, PAD + IN / 2, y + 24 + d.sum.length * 24 + 12, 1.8);
  // footer: phone, signature line
  y += bh + 40;
  c.fillStyle = "#000"; c.textAlign = "left"; font(12); c.fillText(d.phone || "", PAD, y);
  c.textAlign = "right"; const sg = fit(d.sign, IN * 0.5), sw = c.measureText(sg).width;
  c.strokeStyle = NAVY; c.beginPath(); c.moveTo(PAD + IN - sw - 6, y - 16); c.lineTo(PAD + IN, y - 16); c.stroke();
  c.fillText(sg, PAD + IN, y);
  return cv;
}

// ---------- PDF ----------
// one page, the canvas as a JPEG picture. Page width 420 pt (A5 wide), height follows the picture.
export async function canvasPdf(cv, quality = 0.92) {
  const blob = await new Promise((r) => cv.toBlob(r, "image/jpeg", quality));
  if (!blob) throw new Error("The picture could not be made.");
  const jpg = new Uint8Array(await blob.arrayBuffer());
  const PW = 420, PH = Math.round((PW * cv.height) / cv.width * 100) / 100;
  const enc = new TextEncoder(), parts = [], off = [];
  let len = 0;
  const push = (x) => { const u = typeof x === "string" ? enc.encode(x) : x; parts.push(u); len += u.length; };
  const obj = (n, body) => { off[n] = len; push(n + " 0 obj\n" + body + "\nendobj\n"); };
  push("%PDF-1.4\n"); push(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));
  obj(1, "<</Type/Catalog/Pages 2 0 R>>");
  obj(2, "<</Type/Pages/Kids[3 0 R]/Count 1>>");
  obj(3, `<</Type/Page/Parent 2 0 R/MediaBox[0 0 ${PW} ${PH}]/Resources<</XObject<</Im0 4 0 R>>>>/Contents 5 0 R>>`);
  off[4] = len; push(`4 0 obj\n<</Type/XObject/Subtype/Image/Width ${cv.width}/Height ${cv.height}/ColorSpace/DeviceRGB/BitsPerComponent 8/Filter/DCTDecode/Length ${jpg.length}>>\nstream\n`); push(jpg); push("\nendstream\nendobj\n");
  const draw = `q ${PW} 0 0 ${PH} 0 0 cm /Im0 Do Q`;
  obj(5, `<</Length ${draw.length}>>\nstream\n${draw}\nendstream`);
  const xr = len;
  let x = "xref\n0 6\n0000000000 65535 f \n";
  for (let i = 1; i <= 5; i++) x += String(off[i]).padStart(10, "0") + " 00000 n \n";
  push(x + `trailer\n<</Size 6/Root 1 0 R>>\nstartxref\n${xr}\n%%EOF\n`);
  const out = new Uint8Array(len); let p = 0;
  for (const u of parts) { out.set(u, p); p += u.length; }
  return out;
}

export async function receiptPdf(d, name) {
  const bytes = await canvasPdf(await drawReceipt(d));
  return new File([bytes], name, { type: "application/pdf" });
}

// ---------- sharing ----------
export function saveFile(file) {
  const a = document.createElement("a"); a.href = URL.createObjectURL(file); a.download = file.name; a.rel = "noopener";
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 8000);
}
// "shared" (the share sheet took it), "cancelled", or "saved" (this device cannot share files: the PDF was saved instead)
export async function shareFile(file, { text = "", title = "" } = {}) {
  try {
    if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title, text }); return "shared"; }
  } catch (e) { if (e && e.name === "AbortError") return "cancelled"; }
  saveFile(file);
  return "saved";
}
