/* Der QR-Code entsteht beim Bauen aus der Kanal-Adresse. Fehler daran
   fallen niemandem auf – ein falscher Code sieht aus wie ein richtiger.
   Deshalb hier feste Vergleichswerte: die Matrix unten wurde mit einem
   unabhaengigen Decoder (jsQR) gegengelesen. */

import assert from "node:assert/strict";
import { test } from "node:test";

import { qrMatrix, qrSvg } from "../../shared/qrcode.mjs";

const CHANNEL = "https://whatsapp.com/channel/0029VbClTooIiRp0MGUxjS3F";
const asRows = (m) => m.map((row) => row.map((dark) => (dark ? "1" : "0")).join(""));

test("Die Kanal-Adresse ergibt unveraendert denselben QR-Code", () => {
  const rows = asRows(qrMatrix(CHANNEL));
  assert.equal(rows.length, 33, "Version 4 ergibt 33x33 Module");
  assert.equal(rows[0], "111111100001001000111101001111111");
  assert.equal(rows[16], "100001100101001101000010010110001");
  const dark = rows.join("").split("").filter((c) => c === "1").length;
  assert.equal(dark, 579);
});

test("Sucherquadrate sitzen in drei Ecken", () => {
  const m = qrMatrix(CHANNEL);
  const size = m.length;
  for (const [ox, oy] of [[0, 0], [size - 7, 0], [0, size - 7]]) {
    for (let dy = 0; dy < 7; dy++) {
      for (let dx = 0; dx < 7; dx++) {
        const dist = Math.max(Math.abs(dx - 3), Math.abs(dy - 3));
        assert.equal(m[oy + dy][ox + dx], dist !== 2, `Sucher bei ${ox},${oy} – Modul ${dx},${dy}`);
      }
    }
  }
});

test("Laengere Adressen waehlen eine groessere Version", () => {
  assert.equal(qrMatrix("https://a.de").length, 21);
  assert.equal(qrMatrix("x".repeat(200)).length, 57);
  assert.equal(qrMatrix("Grüße aus Peiting – äöüß").length, 29);
});

test("Was nicht passt, liefert nichts statt eines kaputten Codes", () => {
  assert.equal(qrMatrix(""), null);
  assert.equal(qrMatrix("x".repeat(3000)), null);
  assert.equal(qrSvg(""), "");
});

test("Das SVG bringt Ruhezone und weissen Grund mit", () => {
  const svg = qrSvg(CHANNEL);
  /* 33 Module + zweimal 2 Module Rand */
  assert.match(svg, /viewBox="0 0 37 37"/);
  assert.match(svg, /<rect width="37" height="37" fill="#ffffff"\/>/);
  assert.match(svg, /shape-rendering="crispEdges"/);
});

test("Zusatzangaben landen im SVG-Tag", () => {
  const svg = qrSvg(CHANNEL, { attrs: 'class="x" role="img" aria-label="Test"' });
  assert.match(svg, /<svg viewBox="[^"]+" shape-rendering="crispEdges" class="x" role="img" aria-label="Test">/);
});
