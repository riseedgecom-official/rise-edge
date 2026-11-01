// Reads a table from a CSV or an Excel (.xlsx) file in the browser, and writes a CSV. No library needed.
// readTable(file) -> array of rows (each row = array of strings)

// ---------- CSV ----------
export function parseCSV(text) {
  text = String(text || "").replace(/^﻿/, "");
  const first = text.split(/\r?\n/, 1)[0] || "";
  const count = (c) => first.split(c).length - 1;
  const delim = count("\t") > count(",") && count("\t") >= count(";") ? "\t" : count(";") > count(",") ? ";" : ",";
  const rows = [];
  let row = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c;
    } else if (c === '"') q = true;
    else if (c === delim) { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += c;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows.map((r) => r.map((x) => x.trim())).filter((r) => r.some((x) => x !== ""));
}

const cell = (v) => { v = String(v ?? ""); return /[",\n\r;]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
// rows -> CSV text with a BOM so Excel shows Bangla names correctly
export const toCSV = (rows) => "﻿" + rows.map((r) => r.map(cell).join(",")).join("\r\n");

// ---------- XLSX (a zip of xml files) ----------
async function inflate(bytes) {
  if (typeof DecompressionStream === "undefined") throw new Error("NO_INFLATE");
  const ds = new DecompressionStream("deflate-raw");
  const out = new Response(new Blob([bytes]).stream().pipeThrough(ds));
  return new Uint8Array(await out.arrayBuffer());
}
async function unzip(buf, want) {
  const dv = new DataView(buf), u8 = new Uint8Array(buf);
  let e = u8.length - 22;
  while (e >= 0 && dv.getUint32(e, true) !== 0x06054b50) e--;
  if (e < 0) throw new Error("NOT_ZIP");
  const n = dv.getUint16(e + 10, true);
  let p = dv.getUint32(e + 16, true);
  const dec = new TextDecoder(), files = {};
  for (let i = 0; i < n; i++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true), csz = dv.getUint32(p + 20, true), nl = dv.getUint16(p + 28, true), el = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), off = dv.getUint32(p + 42, true);
    const name = dec.decode(u8.subarray(p + 46, p + 46 + nl));
    p += 46 + nl + el + cl;
    if (!want(name)) continue;
    const lnl = dv.getUint16(off + 26, true), lel = dv.getUint16(off + 28, true), start = off + 30 + lnl + lel;
    const raw = u8.subarray(start, start + csz);
    files[name] = dec.decode(method === 0 ? raw : await inflate(raw));
  }
  return files;
}
const colIndex = (ref) => { let n = 0; for (const c of ref.replace(/[0-9]/g, "")) n = n * 26 + (c.charCodeAt(0) - 64); return n - 1; };
async function readXlsx(file) {
  const files = await unzip(await file.arrayBuffer(), (n) => /^xl\/(sharedStrings\.xml|worksheets\/sheet\d+\.xml)$/.test(n));
  const sheet = Object.keys(files).filter((n) => n.startsWith("xl/worksheets/")).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))[0];
  if (!sheet) throw new Error("NO_SHEET");
  const parse = (x) => new DOMParser().parseFromString(x, "application/xml");
  const shared = files["xl/sharedStrings.xml"] ? [...parse(files["xl/sharedStrings.xml"]).getElementsByTagName("si")].map((si) => [...si.getElementsByTagName("t")].map((t) => t.textContent).join("")) : [];
  const rows = [];
  for (const r of parse(files[sheet]).getElementsByTagName("row")) {
    const out = [];
    for (const c of r.getElementsByTagName("c")) {
      const t = c.getAttribute("t"), v = c.getElementsByTagName("v")[0];
      let val = "";
      if (t === "s" && v) val = shared[+v.textContent] ?? "";
      else if (t === "inlineStr") val = [...c.getElementsByTagName("t")].map((x) => x.textContent).join("");
      else if (v) val = v.textContent;
      out[colIndex(c.getAttribute("r") || "A1")] = String(val).trim();
    }
    const row = Array.from(out, (x) => x ?? "");
    if (row.some((x) => x !== "")) rows.push(row);
  }
  return rows;
}

export async function readTable(file) {
  const name = String(file.name || "").toLowerCase();
  if (/\.xlsx$/.test(name)) return readXlsx(file);
  if (/\.xls$/.test(name)) throw new Error("OLD_XLS");
  return parseCSV(await file.text());
}
