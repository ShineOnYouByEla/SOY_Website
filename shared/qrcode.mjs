/* ============================================================
   Shine On You — QR-Code
   ------------------------------------------------------------
   Erzeugt aus einem Text (hier: die Kanal-Adresse) die Modul-
   Matrix eines QR-Codes und daraus ein Inline-SVG.
   Bewusst ohne Abhaengigkeiten und ohne Node-APIs geschrieben:
   dieselbe Datei laeuft im Build-Script und im Cloudflare Worker.

   Umfang: Byte-Modus, Fehlerkorrektur M, Versionen 1–40.
   Das reicht fuer Adressen bis rund 2300 Zeichen; laengere
   Eingaben liefern null, dann faellt der QR-Code einfach weg.
   ============================================================ */

/* Fehlerkorrektur-Bytes je Block, Index = Version (Stufe M). */
const ECC_PER_BLOCK = [
  0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26,
  26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28,
];
/* Anzahl der Bloecke, Index = Version (Stufe M). */
const NUM_BLOCKS = [
  0, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18,
  20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49,
];

/* Strafpunkte der vier Regeln aus der Norm (Auswahl der Maske). */
const PENALTY_N1 = 3;
const PENALTY_N2 = 3;
const PENALTY_N3 = 40;
const PENALTY_N4 = 10;

/* ---------- Rechnen in GF(2^8) fuer die Fehlerkorrektur ---------- */

/** Multiplikation im Galois-Feld des QR-Standards (Modulus 0x11D). */
function gfMul(x, y) {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z & 0xff;
}

/** Generatorpolynom fuer die gewuenschte Anzahl Korrektur-Bytes. */
function rsDivisor(degree) {
  const result = new Uint8Array(degree);
  result[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < degree; j++) {
      result[j] = gfMul(result[j], root);
      if (j + 1 < degree) result[j] ^= result[j + 1];
    }
    root = gfMul(root, 0x02);
  }
  return result;
}

/** Rest der Polynomdivision – das sind die Korrektur-Bytes eines Blocks. */
function rsRemainder(data, divisor) {
  const result = new Uint8Array(divisor.length);
  for (const b of data) {
    const factor = b ^ result[0];
    result.copyWithin(0, 1);
    result[result.length - 1] = 0;
    for (let i = 0; i < divisor.length; i++) result[i] ^= gfMul(divisor[i], factor);
  }
  return result;
}

/* ---------- Kapazitaeten ---------- */

/** Rohe Datenmodule einer Version (ohne Funktionsmuster). */
function rawDataModules(ver) {
  let result = (16 * ver + 128) * ver + 64;
  if (ver >= 2) {
    const numAlign = Math.floor(ver / 7) + 2;
    result -= (25 * numAlign - 10) * numAlign - 55;
    if (ver >= 7) result -= 36;
  }
  return result;
}

/** Nutzbare Datenbytes einer Version auf Stufe M. */
function dataCodewords(ver) {
  return Math.floor(rawDataModules(ver) / 8) - ECC_PER_BLOCK[ver] * NUM_BLOCKS[ver];
}

/** Text als UTF-8-Bytes – ohne TextEncoder, damit es ueberall laeuft. */
function utf8Bytes(text) {
  const out = [];
  for (const ch of String(text)) {
    let cp = ch.codePointAt(0);
    if (cp < 0x80) out.push(cp);
    else if (cp < 0x800) out.push(0xc0 | (cp >> 6), 0x80 | (cp & 0x3f));
    else if (cp < 0x10000) out.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
    else {
      out.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3f), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
    }
  }
  return out;
}

/* ---------- Datenteil ---------- */

/** Bitfolge aus Modus, Laenge, Nutzdaten, Abschluss und Fuellbytes. */
function buildCodewords(bytes, ver) {
  const capacityBits = dataCodewords(ver) * 8;
  const bits = [];
  const push = (value, len) => {
    for (let i = len - 1; i >= 0; i--) bits.push((value >>> i) & 1);
  };

  push(0b0100, 4); // Byte-Modus
  push(bytes.length, ver <= 9 ? 8 : 16);
  for (const b of bytes) push(b, 8);

  /* Abschluss und Auffuellen bis zur vollen Kapazitaet. */
  for (let i = 0; i < 4 && bits.length < capacityBits; i++) bits.push(0);
  while (bits.length % 8 !== 0) bits.push(0);

  const words = [];
  for (let i = 0; i < bits.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j++) byte = (byte << 1) | bits[i + j];
    words.push(byte);
  }
  for (let pad = 0xec; words.length < capacityBits / 8; pad ^= 0xec ^ 0x11) words.push(pad);
  return words;
}

/** Bloecke bilden, Korrektur-Bytes anhaengen und alles verschachteln. */
function addEccAndInterleave(data, ver) {
  const numBlocks = NUM_BLOCKS[ver];
  const eccLen = ECC_PER_BLOCK[ver];
  const rawCodewords = Math.floor(rawDataModules(ver) / 8);
  const numShort = numBlocks - (rawCodewords % numBlocks);
  const shortLen = Math.floor(rawCodewords / numBlocks);

  const divisor = rsDivisor(eccLen);
  const blocks = [];
  for (let i = 0, k = 0; i < numBlocks; i++) {
    const len = shortLen - eccLen + (i < numShort ? 0 : 1);
    const dat = data.slice(k, k + len);
    k += len;
    const ecc = Array.from(rsRemainder(dat, divisor));
    /* Kurze Bloecke bekommen einen Platzhalter, damit die Spalten passen. */
    if (i < numShort) dat.push(0);
    blocks.push(dat.concat(ecc));
  }

  const result = [];
  for (let i = 0; i < blocks[0].length; i++) {
    for (let j = 0; j < blocks.length; j++) {
      if (i !== shortLen - eccLen || j >= numShort) result.push(blocks[j][i]);
    }
  }
  return result;
}

/* ---------- Matrix ---------- */

/** Mittelpunkte der Ausrichtungsmuster einer Version. */
function alignmentPositions(ver) {
  if (ver === 1) return [];
  const numAlign = Math.floor(ver / 7) + 2;
  const size = ver * 4 + 17;
  const step = ver === 32 ? 26 : Math.ceil((ver * 4 + 4) / (numAlign * 2 - 2)) * 2;
  const result = [6];
  for (let pos = size - 7; result.length < numAlign; pos -= step) result.splice(1, 0, pos);
  return result;
}

/** Baut Modul- und Funktionsraster einer Version auf. */
function newGrid(ver) {
  const size = ver * 4 + 17;
  const modules = [];
  const isFunction = [];
  for (let y = 0; y < size; y++) {
    modules.push(new Array(size).fill(false));
    isFunction.push(new Array(size).fill(false));
  }
  return { size, modules, isFunction };
}

const getBit = (value, i) => ((value >>> i) & 1) !== 0;

/** Alle festen Muster: Sucher, Takt, Ausrichtung, Format, Version. */
function drawFunctionPatterns(g, ver) {
  const { size, modules, isFunction } = g;
  const set = (x, y, dark) => {
    modules[y][x] = dark;
    isFunction[y][x] = true;
  };

  /* Taktlinien in Zeile und Spalte 6 */
  for (let i = 0; i < size; i++) {
    set(6, i, i % 2 === 0);
    set(i, 6, i % 2 === 0);
  }

  /* Sucherquadrate in drei Ecken, jeweils mit Trennrand */
  for (const [cx, cy] of [[3, 3], [size - 4, 3], [3, size - 4]]) {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        if (x < 0 || x >= size || y < 0 || y >= size) continue;
        const dist = Math.max(Math.abs(dx), Math.abs(dy));
        set(x, y, dist !== 2 && dist !== 4);
      }
    }
  }

  /* Ausrichtungsmuster – nicht dort, wo schon ein Sucher sitzt */
  const pos = alignmentPositions(ver);
  const last = pos.length - 1;
  for (let i = 0; i <= last; i++) {
    for (let j = 0; j <= last; j++) {
      if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) continue;
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          set(pos[i] + dx, pos[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
        }
      }
    }
  }

  /* Platz fuer die Formatangaben belegen (Inhalt folgt mit der Maske) */
  drawFormatBits(g, 0);
  drawVersionBits(g, ver);
}

/** Formatangaben (Fehlerkorrektur + Maske) an beiden Stellen eintragen. */
function drawFormatBits(g, mask) {
  const { size, modules, isFunction } = g;
  const set = (x, y, dark) => {
    modules[y][x] = dark;
    isFunction[y][x] = true;
  };

  const data = mask; // Stufe M entspricht 0b00 vor der Maske
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  const bits = ((data << 10) | rem) ^ 0x5412;

  for (let i = 0; i <= 5; i++) set(8, i, getBit(bits, i));
  set(8, 7, getBit(bits, 6));
  set(8, 8, getBit(bits, 7));
  set(7, 8, getBit(bits, 8));
  for (let i = 9; i < 15; i++) set(14 - i, 8, getBit(bits, i));

  for (let i = 0; i < 8; i++) set(size - 1 - i, 8, getBit(bits, i));
  for (let i = 8; i < 15; i++) set(8, size - 15 + i, getBit(bits, i));
  set(8, size - 8, true); // immer dunkles Modul
}

/** Versionsangabe – erst ab Version 7 vorhanden. */
function drawVersionBits(g, ver) {
  if (ver < 7) return;
  const { size, modules, isFunction } = g;
  let rem = ver;
  for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
  const bits = (ver << 12) | rem;

  for (let i = 0; i < 18; i++) {
    const dark = getBit(bits, i);
    const a = size - 11 + (i % 3);
    const b = Math.floor(i / 3);
    modules[b][a] = dark;
    isFunction[b][a] = true;
    modules[a][b] = dark;
    isFunction[a][b] = true;
  }
}

/** Datenbytes im Zickzack von rechts unten nach oben einfuellen. */
function drawCodewords(g, data) {
  const { size, modules, isFunction } = g;
  let i = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? size - 1 - vert : vert;
        if (!isFunction[y][x] && i < data.length * 8) {
          modules[y][x] = getBit(data[i >>> 3], 7 - (i & 7));
          i++;
        }
      }
    }
  }
}

/** Maske auf alle Datenmodule anwenden (zweimal aufgerufen = rueckgaengig). */
function applyMask(g, mask) {
  const { size, modules, isFunction } = g;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (isFunction[y][x]) continue;
      let invert = false;
      switch (mask) {
        case 0: invert = (x + y) % 2 === 0; break;
        case 1: invert = y % 2 === 0; break;
        case 2: invert = x % 3 === 0; break;
        case 3: invert = (x + y) % 3 === 0; break;
        case 4: invert = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0; break;
        case 5: invert = ((x * y) % 2) + ((x * y) % 3) === 0; break;
        case 6: invert = (((x * y) % 2) + ((x * y) % 3)) % 2 === 0; break;
        default: invert = (((x + y) % 2) + ((x * y) % 3)) % 2 === 0; break;
      }
      if (invert) modules[y][x] = !modules[y][x];
    }
  }
}

/* Sucher-aehnliche Folge 1:1:3:1:1 mit hellem Rand – Regel 3. */
const FINDER_LIKE = [true, false, true, true, true, false, true, false, false, false, false];

function matchesAt(line, start) {
  for (let i = 0; i < FINDER_LIKE.length; i++) {
    if (line[start + i] !== FINDER_LIKE[i]) return false;
  }
  return true;
}

/** Strafpunkte einer Maske – je weniger, desto besser lesbar. */
function penaltyScore(g) {
  const { size, modules } = g;
  let result = 0;

  /* Regel 1: lange Reihen gleicher Farbe. Regel 3: Sucher-Attrappen. */
  for (let i = 0; i < size; i++) {
    const row = modules[i];
    const col = modules.map((r) => r[i]);
    for (const line of [row, col]) {
      let runLen = 1;
      for (let k = 1; k < size; k++) {
        if (line[k] === line[k - 1]) {
          runLen++;
          if (runLen === 5) result += PENALTY_N1;
          else if (runLen > 5) result++;
        } else runLen = 1;
      }
      /* Die Folge zaehlt in beiden Richtungen und auch am Rand. */
      const padded = [false, false, false, false, ...line, false, false, false, false];
      for (let k = 0; k + FINDER_LIKE.length <= padded.length; k++) {
        if (matchesAt(padded, k)) result += PENALTY_N3;
        if (matchesAt(padded.slice(k, k + FINDER_LIKE.length).reverse(), 0)) result += PENALTY_N3;
      }
    }
  }

  /* Regel 2: gleichfarbige 2x2-Bloecke */
  for (let y = 0; y < size - 1; y++) {
    for (let x = 0; x < size - 1; x++) {
      const c = modules[y][x];
      if (c === modules[y][x + 1] && c === modules[y + 1][x] && c === modules[y + 1][x + 1]) {
        result += PENALTY_N2;
      }
    }
  }

  /* Regel 4: Verhaeltnis heller zu dunkler Flaeche */
  let dark = 0;
  for (const row of modules) for (const m of row) if (m) dark++;
  const total = size * size;
  const k = Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1;
  result += k * PENALTY_N4;

  return result;
}

/* ---------- Oeffentliche Schnittstelle ---------- */

/**
 * Modul-Matrix eines QR-Codes (Byte-Modus, Stufe M).
 * Gibt ein Array von Zeilen mit true = dunkel zurueck – oder null,
 * wenn der Text in keine Version passt.
 */
export function qrMatrix(text) {
  const bytes = utf8Bytes(text);
  if (!bytes.length) return null;

  let ver = 0;
  for (let v = 1; v <= 40; v++) {
    /* 4 Bit Modus + 8 bzw. 16 Bit Laengenangabe kommen zu den Daten dazu. */
    const overhead = v <= 9 ? 2 : 3;
    if (bytes.length + overhead <= dataCodewords(v)) {
      ver = v;
      break;
    }
  }
  if (!ver) return null;

  const codewords = addEccAndInterleave(buildCodewords(bytes, ver), ver);

  const g = newGrid(ver);
  drawFunctionPatterns(g, ver);
  drawCodewords(g, codewords);

  /* Beste der acht Masken auswaehlen */
  let bestMask = 0;
  let bestScore = Infinity;
  for (let mask = 0; mask < 8; mask++) {
    applyMask(g, mask);
    drawFormatBits(g, mask);
    const score = penaltyScore(g);
    if (score < bestScore) {
      bestScore = score;
      bestMask = mask;
    }
    applyMask(g, mask); // zuruecksetzen
  }
  applyMask(g, bestMask);
  drawFormatBits(g, bestMask);

  return g.modules;
}

/**
 * QR-Code als Inline-SVG. Der Rahmen (Ruhezone) gehoert zum Standard –
 * ohne ihn erkennen viele Kameras den Code nicht.
 */
export function qrSvg(text, opts = {}) {
  const matrix = qrMatrix(text);
  if (!matrix) return "";

  const quiet = opts.quiet ?? 2;
  const size = matrix.length + quiet * 2;
  const attrs = opts.attrs ? " " + opts.attrs : "";

  /* Ein einziger Pfad statt tausender Rechtecke – deutlich kleineres SVG. */
  const parts = [];
  for (let y = 0; y < matrix.length; y++) {
    for (let x = 0; x < matrix.length; x++) {
      if (matrix[y][x]) parts.push(`M${x + quiet} ${y + quiet}h1v1h-1z`);
    }
  }

  return (
    `<svg viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges"${attrs}>` +
    `<rect width="${size}" height="${size}" fill="#ffffff"/>` +
    `<path fill="#0c373d" d="${parts.join("")}"/>` +
    "</svg>"
  );
}
