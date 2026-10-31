// Dependency-free QR Code generator: byte mode (UTF-8), error correction level M, versions 1-10.
// qrSvg(text) -> SVG string. qrMatrix(text) -> array of rows of booleans (true = dark).

const ECC_PER_BLOCK = [0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26]; // level M, by version
const NUM_BLOCKS = [0, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5]; // level M, by version
const ECC_FORMAT_BITS = 0; // level M

const bit = (x, i) => ((x >>> i) & 1) !== 0;

function rawModules(ver) {
  let r = (16 * ver + 128) * ver + 64;
  if (ver >= 2) {
    const na = Math.floor(ver / 7) + 2;
    r -= (25 * na - 10) * na - 55;
    if (ver >= 7) r -= 36;
  }
  return r;
}
const dataCodewords = (ver) => Math.floor(rawModules(ver) / 8) - ECC_PER_BLOCK[ver] * NUM_BLOCKS[ver];

function alignPositions(ver) {
  if (ver === 1) return [];
  const na = Math.floor(ver / 7) + 2, size = ver * 4 + 17;
  const step = Math.ceil((ver * 4 + 4) / (na * 2 - 2)) * 2;
  const r = [6];
  for (let pos = size - 7; r.length < na; pos -= step) r.splice(1, 0, pos);
  return r;
}

// ----- Reed-Solomon over GF(256), polynomial 0x11D -----
function gmul(x, y) {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z & 0xff;
}
function rsDivisor(deg) {
  const res = new Array(deg).fill(0);
  res[deg - 1] = 1;
  let root = 1;
  for (let i = 0; i < deg; i++) {
    for (let j = 0; j < deg; j++) {
      res[j] = gmul(res[j], root);
      if (j + 1 < deg) res[j] ^= res[j + 1];
    }
    root = gmul(root, 2);
  }
  return res;
}
function rsRemainder(data, div) {
  const res = div.map(() => 0);
  for (const b of data) {
    const f = b ^ res.shift();
    res.push(0);
    div.forEach((c, i) => { res[i] ^= gmul(c, f); });
  }
  return res;
}

// ----- data -> codewords (with error correction, interleaved) -----
function makeCodewords(bytes, ver) {
  const bits = [];
  const put = (v, n) => { for (let i = n - 1; i >= 0; i--) bits.push((v >>> i) & 1); };
  put(4, 4); // byte mode
  put(bytes.length, ver <= 9 ? 8 : 16);
  bytes.forEach((b) => put(b, 8));
  const cap = dataCodewords(ver) * 8;
  put(0, Math.min(4, cap - bits.length));
  while (bits.length % 8) bits.push(0);
  for (let pad = 0xec; bits.length < cap; pad ^= 0xec ^ 0x11) put(pad, 8);
  const data = [];
  for (let i = 0; i < bits.length; i += 8) { let v = 0; for (let j = 0; j < 8; j++) v = (v << 1) | bits[i + j]; data.push(v); }

  const nb = NUM_BLOCKS[ver], eccLen = ECC_PER_BLOCK[ver], raw = Math.floor(rawModules(ver) / 8);
  const nShort = nb - (raw % nb), shortLen = Math.floor(raw / nb);
  const div = rsDivisor(eccLen), blocks = [];
  for (let i = 0, k = 0; i < nb; i++) {
    const len = shortLen - eccLen + (i < nShort ? 0 : 1);
    const d = data.slice(k, k + len);
    k += len;
    const ecc = rsRemainder(d, div);
    if (i < nShort) d.push(0); // placeholder so that all blocks have the same length when interleaving
    blocks.push(d.concat(ecc));
  }
  const out = [];
  for (let i = 0; i < blocks[0].length; i++) {
    blocks.forEach((b, j) => { if (i !== shortLen - eccLen || j >= nShort) out.push(b[i]); });
  }
  return out;
}

// ----- the matrix -----
export function qrMatrix(text) {
  const bytes = Array.from(new TextEncoder().encode(String(text)));
  let ver = 1;
  for (; ver <= 10; ver++) {
    const used = 4 + (ver <= 9 ? 8 : 16) + bytes.length * 8;
    if (used <= dataCodewords(ver) * 8) break;
  }
  if (ver > 10) throw new Error("QR text is too long");
  const size = ver * 4 + 17;
  const mod = Array.from({ length: size }, () => new Array(size).fill(false));
  const fn = Array.from({ length: size }, () => new Array(size).fill(false));
  const setFn = (x, y, d) => { mod[y][x] = d; fn[y][x] = true; };

  const drawFinder = (cx, cy) => {
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const d = Math.max(Math.abs(dx), Math.abs(dy)), x = cx + dx, y = cy + dy;
      if (x >= 0 && x < size && y >= 0 && y < size) setFn(x, y, d !== 2 && d !== 4);
    }
  };
  const drawAlign = (cx, cy) => {
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) setFn(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  };
  const drawFormat = (mask) => {
    const data = (ECC_FORMAT_BITS << 3) | mask;
    let rem = data;
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    const bits = ((data << 10) | rem) ^ 0x5412;
    for (let i = 0; i <= 5; i++) setFn(8, i, bit(bits, i));
    setFn(8, 7, bit(bits, 6));
    setFn(8, 8, bit(bits, 7));
    setFn(7, 8, bit(bits, 8));
    for (let i = 9; i < 15; i++) setFn(14 - i, 8, bit(bits, i));
    for (let i = 0; i < 8; i++) setFn(size - 1 - i, 8, bit(bits, i));
    for (let i = 8; i < 15; i++) setFn(8, size - 15 + i, bit(bits, i));
    setFn(8, size - 8, true); // the always-dark module
  };
  const drawVersion = () => {
    if (ver < 7) return;
    let rem = ver;
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    const bits = (ver << 12) | rem;
    for (let i = 0; i < 18; i++) {
      const c = bit(bits, i), a = size - 11 + (i % 3), b = Math.floor(i / 3);
      setFn(a, b, c);
      setFn(b, a, c);
    }
  };

  for (let i = 0; i < size; i++) { setFn(6, i, i % 2 === 0); setFn(i, 6, i % 2 === 0); }
  drawFinder(3, 3); drawFinder(size - 4, 3); drawFinder(3, size - 4);
  const ap = alignPositions(ver), n = ap.length;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    if ((i === 0 && j === 0) || (i === 0 && j === n - 1) || (i === n - 1 && j === 0)) continue;
    drawAlign(ap[i], ap[j]);
  }
  drawFormat(0);
  drawVersion();

  // place the data bits in the zig-zag order
  const cw = makeCodewords(bytes, ver);
  let k = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j, up = ((right + 1) & 2) === 0, y = up ? size - 1 - vert : vert;
        if (!fn[y][x] && k < cw.length * 8) { mod[y][x] = bit(cw[k >>> 3], 7 - (k & 7)); k++; }
      }
    }
  }

  const applyMask = (m) => {
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      if (fn[y][x]) continue;
      let inv;
      switch (m) {
        case 0: inv = (x + y) % 2 === 0; break;
        case 1: inv = y % 2 === 0; break;
        case 2: inv = x % 3 === 0; break;
        case 3: inv = (x + y) % 3 === 0; break;
        case 4: inv = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0; break;
        case 5: inv = ((x * y) % 2) + ((x * y) % 3) === 0; break;
        case 6: inv = (((x * y) % 2) + ((x * y) % 3)) % 2 === 0; break;
        default: inv = (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
      }
      if (inv) mod[y][x] = !mod[y][x];
    }
  };
  const penalty = () => {
    let p = 0;
    const lines = [];
    for (let y = 0; y < size; y++) lines.push(mod[y].map((v) => (v ? "1" : "0")).join(""));
    for (let x = 0; x < size; x++) lines.push(mod.map((r) => (r[x] ? "1" : "0")).join(""));
    for (const s of lines) {
      let run = 1;
      for (let i = 1; i <= s.length; i++) {
        if (i < s.length && s[i] === s[i - 1]) run++;
        else { if (run >= 5) p += 3 + (run - 5); run = 1; }
      }
      for (const pat of ["10111010000", "00001011101"]) {
        let at = s.indexOf(pat);
        while (at >= 0) { p += 40; at = s.indexOf(pat, at + 1); }
      }
    }
    for (let y = 0; y < size - 1; y++) for (let x = 0; x < size - 1; x++) {
      const c = mod[y][x];
      if (c === mod[y][x + 1] && c === mod[y + 1][x] && c === mod[y + 1][x + 1]) p += 3;
    }
    let dark = 0;
    mod.forEach((r) => r.forEach((v) => { if (v) dark++; }));
    const tot = size * size;
    p += (Math.ceil(Math.abs(dark * 20 - tot * 10) / tot) - 1) * 10;
    return p;
  };

  let best = 0, bestP = Infinity;
  for (let m = 0; m < 8; m++) {
    applyMask(m); drawFormat(m);
    const p = penalty();
    if (p < bestP) { best = m; bestP = p; }
    applyMask(m); // undo
  }
  applyMask(best);
  drawFormat(best);
  return mod;
}

export function qrSvg(text, { margin = 2, dark = "#0a1636", light = "#fff" } = {}) {
  const m = qrMatrix(text), n = m.length, N = n + margin * 2;
  let d = "";
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n;) {
      if (!m[y][x]) { x++; continue; }
      let e = x;
      while (e < n && m[y][e]) e++;
      d += `M${x + margin} ${y + margin}h${e - x}v1h-${e - x}z`;
      x = e;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${N} ${N}" width="100%" height="100%" shape-rendering="crispEdges" role="img" aria-label="QR code"><rect width="${N}" height="${N}" fill="${light}"/><path d="${d}" fill="${dark}"/></svg>`;
}
