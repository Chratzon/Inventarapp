/* Roadcase – Codeerzeugung: QR (Byte-Modus, Version 1–10) und Code 128 B.
   Bewusst ohne Fremdbibliothek, damit die App offline vollständig funktioniert. */
'use strict';

const QR = (function () {
  /* Blockaufteilung je Version und Fehlerkorrekturstufe:
     [EC-Codewörter je Block, Blöcke Gruppe 1, Datenwörter Gruppe 1, Blöcke Gruppe 2, Datenwörter Gruppe 2] */
  const RS = {
    1: { L: [7, 1, 19, 0, 0], M: [10, 1, 16, 0, 0], Q: [13, 1, 13, 0, 0], H: [17, 1, 9, 0, 0] },
    2: { L: [10, 1, 34, 0, 0], M: [16, 1, 28, 0, 0], Q: [22, 1, 22, 0, 0], H: [28, 1, 16, 0, 0] },
    3: { L: [15, 1, 55, 0, 0], M: [26, 1, 44, 0, 0], Q: [18, 2, 17, 0, 0], H: [22, 2, 13, 0, 0] },
    4: { L: [20, 1, 80, 0, 0], M: [18, 2, 32, 0, 0], Q: [26, 2, 24, 0, 0], H: [16, 4, 9, 0, 0] },
    5: { L: [26, 1, 108, 0, 0], M: [24, 2, 43, 0, 0], Q: [18, 2, 15, 2, 16], H: [22, 2, 11, 2, 12] },
    6: { L: [18, 2, 68, 0, 0], M: [16, 4, 27, 0, 0], Q: [24, 4, 19, 0, 0], H: [28, 4, 15, 0, 0] },
    7: { L: [20, 2, 78, 0, 0], M: [18, 4, 31, 0, 0], Q: [18, 2, 14, 4, 15], H: [26, 4, 13, 1, 14] },
    8: { L: [24, 2, 97, 0, 0], M: [22, 2, 38, 2, 39], Q: [22, 4, 18, 2, 19], H: [26, 4, 14, 2, 15] },
    9: { L: [30, 2, 116, 0, 0], M: [22, 3, 36, 2, 37], Q: [20, 4, 16, 4, 17], H: [24, 4, 12, 4, 13] },
    10: { L: [18, 2, 68, 2, 69], M: [26, 4, 43, 1, 44], Q: [24, 6, 19, 2, 20], H: [28, 6, 15, 2, 16] }
  };
  const ALIGN = {
    1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30],
    6: [6, 34], 7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50]
  };
  const ECBITS = { L: 1, M: 0, Q: 3, H: 2 };
  const REMAINDER = { 1: 0, 2: 7, 3: 7, 4: 7, 5: 7, 6: 7, 7: 0, 8: 0, 9: 0, 10: 0 };

  /* Galoisfeld GF(256) */
  const EXP = new Uint8Array(512), LOG = new Uint8Array(256);
  (function () {
    let x = 1;
    for (let i = 0; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 0x100) x ^= 0x11d; }
    for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
  })();
  const mul = (a, b) => (a === 0 || b === 0) ? 0 : EXP[LOG[a] + LOG[b]];

  /* Generatorpolynom, Index 0 ist der höchste Grad */
  function genPoly(n) {
    let g = [1];
    for (let i = 0; i < n; i++) {
      const ng = new Array(g.length + 1).fill(0);
      for (let j = 0; j < g.length; j++) {
        ng[j] ^= g[j];                    /* mal x */
        ng[j + 1] ^= mul(g[j], EXP[i]);   /* mal Alpha hoch i */
      }
      g = ng;
    }
    return g;
  }
  function ecc(data, n) {
    const g = genPoly(n), res = new Array(n).fill(0);
    for (const d of data) {
      const f = d ^ res[0];
      res.shift(); res.push(0);
      if (f !== 0) for (let i = 0; i < n; i++) res[i] ^= mul(g[i + 1], f);
    }
    return res;
  }

  const utf8 = s => Array.from(new TextEncoder().encode(s));
  const dataCapacity = (v, l) => { const r = RS[v][l]; return r[1] * r[2] + r[3] * r[4]; };

  function encode(text, level, forcedVersion) {
    const bytes = utf8(text);
    let v = forcedVersion || 0;
    if (!v) {
      for (let i = 1; i <= 10; i++) {
        const cci = i < 10 ? 8 : 16;
        if (dataCapacity(i, level) * 8 >= 4 + cci + bytes.length * 8) { v = i; break; }
      }
    }
    if (!v) throw new Error('Inhalt zu lang für QR-Version 10');

    const cci = v < 10 ? 8 : 16;
    const bits = [];
    const push = (val, len) => { for (let i = len - 1; i >= 0; i--) bits.push((val >> i) & 1); };
    push(4, 4); push(bytes.length, cci);
    bytes.forEach(b => push(b, 8));

    const cap = dataCapacity(v, level) * 8;
    for (let i = 0; i < 4 && bits.length < cap; i++) bits.push(0);
    while (bits.length % 8) bits.push(0);
    const pads = [0xec, 0x11];
    for (let i = 0; bits.length < cap; i++) push(pads[i % 2], 8);

    const words = [];
    for (let i = 0; i < bits.length; i += 8) {
      let b = 0; for (let j = 0; j < 8; j++) b = (b << 1) | bits[i + j];
      words.push(b);
    }

    /* Blöcke bilden, Fehlerkorrektur rechnen, verschachteln */
    const [ecPer, g1, d1, g2, d2] = RS[v][level];
    const blocks = [], ecs = [];
    let p = 0;
    for (let i = 0; i < g1; i++) { const b = words.slice(p, p + d1); p += d1; blocks.push(b); ecs.push(ecc(b, ecPer)); }
    for (let i = 0; i < g2; i++) { const b = words.slice(p, p + d2); p += d2; blocks.push(b); ecs.push(ecc(b, ecPer)); }

    const out = [];
    const maxData = Math.max(d1, d2);
    for (let i = 0; i < maxData; i++) for (const b of blocks) if (i < b.length) out.push(b[i]);
    for (let i = 0; i < ecPer; i++) for (const e of ecs) out.push(e[i]);

    const stream = [];
    out.forEach(b => { for (let i = 7; i >= 0; i--) stream.push((b >> i) & 1); });
    for (let i = 0; i < REMAINDER[v]; i++) stream.push(0);
    return { version: v, stream };
  }

  function skeleton(v) {
    const n = 17 + 4 * v;
    const m = Array.from({ length: n }, () => new Array(n).fill(null));
    const fixed = Array.from({ length: n }, () => new Array(n).fill(false));
    const set = (r, c, val) => { m[r][c] = val; fixed[r][c] = true; };

    const finder = (r0, c0) => {
      for (let r = -1; r <= 7; r++) for (let c = -1; c <= 7; c++) {
        const r1 = r0 + r, c1 = c0 + c;
        if (r1 < 0 || c1 < 0 || r1 >= n || c1 >= n) continue;
        const on = (r >= 0 && r <= 6 && (c === 0 || c === 6)) ||
          (c >= 0 && c <= 6 && (r === 0 || r === 6)) ||
          (r >= 2 && r <= 4 && c >= 2 && c <= 4);
        set(r1, c1, on ? 1 : 0);
      }
    };
    finder(0, 0); finder(0, n - 7); finder(n - 7, 0);

    for (let i = 8; i < n - 8; i++) { const on = i % 2 === 0 ? 1 : 0; set(6, i, on); set(i, 6, on); }

    const al = ALIGN[v];
    for (const r of al) for (const c of al) {
      if ((r <= 8 && c <= 8) || (r <= 8 && c >= n - 9) || (r >= n - 9 && c <= 8)) continue;
      for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++)
        set(r + dr, c + dc, (Math.abs(dr) === 2 || Math.abs(dc) === 2 || (dr === 0 && dc === 0)) ? 1 : 0);
    }

    set(n - 8, 8, 1); /* dunkles Modul */

    /* Formatbereiche reservieren */
    for (let i = 0; i <= 8; i++) { if (!fixed[8][i]) set(8, i, 0); if (!fixed[i][8]) set(i, 8, 0); }
    for (let i = 0; i < 8; i++) { if (!fixed[8][n - 1 - i]) set(8, n - 1 - i, 0); if (!fixed[n - 1 - i][8]) set(n - 1 - i, 8, 0); }
    if (v >= 7) {
      for (let i = 0; i < 6; i++) for (let j = 0; j < 3; j++) { set(n - 11 + j, i, 0); set(i, n - 11 + j, 0); }
    }
    return { n, m, fixed };
  }

  function placeData(sk, stream) {
    const { n, m, fixed } = sk;
    let idx = 0, up = true;
    for (let col = n - 1; col > 0; col -= 2) {
      if (col === 6) col--;
      for (let i = 0; i < n; i++) {
        const row = up ? n - 1 - i : i;
        for (const c of [col, col - 1]) {
          if (fixed[row][c]) continue;
          m[row][c] = idx < stream.length ? stream[idx] : 0;
          idx++;
        }
      }
      up = !up;
    }
  }

  const maskFn = [
    (r, c) => (r + c) % 2 === 0,
    r => r % 2 === 0,
    (r, c) => c % 3 === 0,
    (r, c) => (r + c) % 3 === 0,
    (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
    (r, c) => (r * c) % 2 + (r * c) % 3 === 0,
    (r, c) => ((r * c) % 2 + (r * c) % 3) % 2 === 0,
    (r, c) => ((r + c) % 2 + (r * c) % 3) % 2 === 0
  ];

  function applyMask(sk, mask) {
    const { n, m, fixed } = sk;
    const out = m.map(r => r.slice());
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++)
      if (!fixed[r][c] && maskFn[mask](r, c)) out[r][c] ^= 1;
    return out;
  }

  function formatBits(level, mask) {
    const data = (ECBITS[level] << 3) | mask;
    let rem = data << 10;
    for (let i = 14; i >= 10; i--) if ((rem >> i) & 1) rem ^= 0x537 << (i - 10);
    return ((data << 10) | (rem & 0x3ff)) ^ 0x5412;
  }
  function versionBits(v) {
    let rem = v << 12;
    for (let i = 17; i >= 12; i--) if ((rem >> i) & 1) rem ^= 0x1f25 << (i - 12);
    return (v << 12) | (rem & 0xfff);
  }

  function drawFormat(m, n, level, mask) {
    const f = formatBits(level, mask);
    const bit = i => (f >> i) & 1;
    for (let i = 0; i <= 5; i++) m[i][8] = bit(i);
    m[7][8] = bit(6); m[8][8] = bit(7); m[8][7] = bit(8);
    for (let i = 9; i <= 14; i++) m[8][14 - i] = bit(i);
    for (let i = 0; i <= 7; i++) m[8][n - 1 - i] = bit(i);
    for (let i = 8; i <= 14; i++) m[n - 15 + i][8] = bit(i);
    m[n - 8][8] = 1;
  }
  function drawVersion(m, n, v) {
    if (v < 7) return;
    const bits = versionBits(v);
    for (let i = 0; i < 18; i++) {
      const b = (bits >> i) & 1, r = Math.floor(i / 3), c = i % 3;
      m[n - 11 + c][r] = b; m[r][n - 11 + c] = b;
    }
  }

  function penalty(m, n) {
    let p = 0;
    /* Regel 1: Reihen gleicher Farbe */
    for (let k = 0; k < 2; k++) {
      for (let i = 0; i < n; i++) {
        let run = 1;
        for (let j = 1; j < n; j++) {
          const a = k ? m[j][i] : m[i][j], b = k ? m[j - 1][i] : m[i][j - 1];
          if (a === b) run++; else { if (run >= 5) p += run - 2; run = 1; }
        }
        if (run >= 5) p += run - 2;
      }
    }
    /* Regel 2: gleichfarbige 2×2-Blöcke */
    for (let r = 0; r < n - 1; r++) for (let c = 0; c < n - 1; c++)
      if (m[r][c] === m[r][c + 1] && m[r][c] === m[r + 1][c] && m[r][c] === m[r + 1][c + 1]) p += 3;
    /* Regel 3: Suchmuster-ähnliche Folgen */
    const pat1 = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0], pat2 = [0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1];
    for (let i = 0; i < n; i++) for (let j = 0; j <= n - 11; j++) {
      let h1 = true, h2 = true, v1 = true, v2 = true;
      for (let k = 0; k < 11; k++) {
        if (m[i][j + k] !== pat1[k]) h1 = false;
        if (m[i][j + k] !== pat2[k]) h2 = false;
        if (m[j + k][i] !== pat1[k]) v1 = false;
        if (m[j + k][i] !== pat2[k]) v2 = false;
      }
      if (h1) p += 40; if (h2) p += 40; if (v1) p += 40; if (v2) p += 40;
    }
    /* Regel 4: Verhältnis dunkler Module */
    let dark = 0;
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) dark += m[r][c];
    const pct = dark * 100 / (n * n);
    p += Math.floor(Math.abs(pct - 50) / 5) * 10;
    return p;
  }

  /* Modulmatrix erzeugen. mask: 0–7 erzwingt eine Maske, sonst beste Wahl. */
  function matrix(text, opts) {
    opts = opts || {};
    const level = opts.level || 'M';
    const { version, stream } = encode(text, level, opts.version);
    const sk = skeleton(version);
    placeData(sk, stream);

    let best = null;
    const masks = (opts.mask === 0 || opts.mask) ? [opts.mask] : [0, 1, 2, 3, 4, 5, 6, 7];
    for (const mk of masks) {
      const m = applyMask(sk, mk);
      drawFormat(m, sk.n, level, mk);
      drawVersion(m, sk.n, version);
      const score = masks.length === 1 ? 0 : penalty(m, sk.n);
      if (!best || score < best.score) best = { m, score, mask: mk };
    }
    return { size: sk.n, modules: best.m, version, mask: best.mask, level };
  }

  /* SVG-Zeichnung, quiet zone 4 Module */
  function svg(text, opts) {
    opts = opts || {};
    const q = opts.quiet == null ? 4 : opts.quiet;
    const { size, modules } = matrix(text, opts);
    const total = size + 2 * q;
    let path = '';
    for (let r = 0; r < size; r++) {
      let c = 0;
      while (c < size) {
        if (!modules[r][c]) { c++; continue; }
        let run = 0;
        while (c + run < size && modules[r][c + run]) run++;
        path += `M${c + q} ${r + q}h${run}v1h-${run}z`;
        c += run;
      }
    }
    const px = opts.px ? ` width="${opts.px}" height="${opts.px}"` : '';
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}"${px} shape-rendering="crispEdges" role="img" aria-label="QR-Code">` +
      `<rect width="${total}" height="${total}" fill="#fff"/><path d="${path}" fill="#000"/></svg>`;
  }

  return { matrix, svg };
})();

/* ------------------------------------------------------------------ Code 128 B */
const Code128 = (function () {
  const P = ['212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213',
    '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132',
    '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211',
    '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
    '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331',
    '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111',
    '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214',
    '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
    '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
    '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141',
    '114131', '311141', '411131', '211412', '211214', '211232', '2331112'];
  const START_B = 104, STOP = 106;

  function values(text) {
    const v = [START_B];
    for (const ch of text) {
      const code = ch.charCodeAt(0);
      if (code < 32 || code > 126) throw new Error('Zeichen für Code 128 B nicht darstellbar: ' + ch);
      v.push(code - 32);
    }
    let sum = START_B;
    for (let i = 1; i < v.length; i++) sum += v[i] * i;
    v.push(sum % 103, STOP);
    return v;
  }

  /* SVG mit Strichbreiten in Modulen; height in Modulen, quiet zone 10 Module */
  function svg(text, opts) {
    opts = opts || {};
    const h = opts.height || 30, q = opts.quiet == null ? 10 : opts.quiet;
    const widths = values(text).map(v => P[v]).join('');
    let x = q, bars = '', dark = true;
    for (const w of widths) {
      const n = parseInt(w, 10);
      if (dark) bars += `<rect x="${x}" y="0" width="${n}" height="${h}"/>`;
      x += n; dark = !dark;
    }
    const total = x + q;
    const px = opts.px ? ` width="${opts.px}"` : '';
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${h}"${px} preserveAspectRatio="none" shape-rendering="crispEdges" role="img" aria-label="Barcode ${text}">` +
      `<rect width="${total}" height="${h}" fill="#fff"/><g fill="#000">${bars}</g></svg>`;
  }
  return { svg, values };
})();

if (typeof module !== 'undefined') module.exports = { QR, Code128 };
