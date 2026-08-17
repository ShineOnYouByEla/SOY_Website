/* ============================================================
   Rendert die Katalog-PDFs zu Seitenbildern (WebP).

   Warum: Bis hierher hat jedes Endgerät die PDF-Seiten selbst zu Bildern
   gerechnet. Auf einem Mittelklasse-Handy dauerte das beim 56-Seiten-
   Magazin rund 51 Sekunden – zusätzlich zu den 16 Sekunden, die das PDF
   zum Herunterladen brauchte. Gerechnet wird deshalb jetzt einmal hier
   beim Veröffentlichen; die Geräte bekommen fertige Bilder und laden nur
   die Seiten, die sie wirklich anzeigen.

   Aufruf:  node scripts/build-katalog-seiten.mjs [--force]
   Abhängigkeiten:  npm ci --prefix scripts

   Ergebnis je Katalog:
     kataloge/seiten/<id>/s-001.webp        Buchansicht
     kataloge/seiten/<id>/s-001@gross.webp  Vollbild und Lupe
     kataloge/seiten/<id>/info.json         Seitenzahl, Seitenverhältnis, Quell-Hash

   Unverändertes wird übersprungen: info.json merkt sich den Hash der PDF
   und die Render-Einstellungen. Nur was sich geändert hat, wird neu
   gerechnet – ein Deploy ohne neue Kataloge kostet dadurch nichts.
   ============================================================ */
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

import { KATALOG_DIR, TITEL_DATEI, baueKataloge } from "../shared/kataloge.mjs";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";

const require = createRequire(import.meta.url);
const { createCanvas } = require("canvas");
const sharp = require("sharp");

/* ---------- Einstellungen ----------
   Gerendert wird einmal in der großen Breite; die kleine entsteht daraus
   durch Verkleinern. Das ist nicht nur schneller als zweimal rendern,
   sondern sieht auch besser aus (das Verkleinern mittelt die Kanten). */
const GROSS_BREITE = 2400;   // Vollbild und Lupe
const KLEIN_BREITE = 1500;   // Buchansicht
const QUALITAET    = 80;     // WebP
const SEITEN_DIR   = join(KATALOG_DIR, "seiten");
/* Fließt in info.json ein: Ändert sich hier etwas, wird neu gerendert,
   auch wenn die PDF dieselbe geblieben ist. */
const REZEPT = `webp-q${QUALITAET}-${KLEIN_BREITE}-${GROSS_BREITE}-v1`;

const force = process.argv.includes("--force");

/* ---------- Hilfen ---------- */
const hashVon = (buf) => createHash("sha256").update(buf).digest("hex").slice(0, 16);
const seitenName = (n) => `s-${String(n).padStart(3, "0")}`;

/** Eine PDF-Seite auf ein Canvas rendern und die rohen Bildpunkte liefern. */
async function renderSeite(pdf, nummer, breite) {
  const page = await pdf.getPage(nummer);
  const un = page.getViewport({ scale: 1 });
  const vp = page.getViewport({ scale: breite / un.width });
  const w = Math.ceil(vp.width);
  const h = Math.ceil(vp.height);
  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext("2d");
  // weißer Grund für PDFs ohne eigenen Hintergrund
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  await page.render({ canvasContext: ctx, viewport: vp }).promise;
  page.cleanup();
  /* Rohe Bildpunkte statt eines PNG-Umwegs an sharp geben: spart je Seite
     das Kodieren und wieder Dekodieren. */
  return { daten: Buffer.from(ctx.getImageData(0, 0, w, h).data), breite: w, hoehe: h };
}

/** Einen Katalog vollständig rendern. */
async function rendereKatalog(eintrag, pdfBytes, hash, ziel) {
  rmSync(ziel, { recursive: true, force: true });
  mkdirSync(ziel, { recursive: true });

  const pdf = await pdfjs.getDocument({ data: new Uint8Array(pdfBytes) }).promise;
  const anzahl = pdf.numPages;
  let ratio = 1 / Math.SQRT2;

  for (let n = 1; n <= anzahl; n++) {
    const roh = await renderSeite(pdf, n, GROSS_BREITE);
    if (n === 1) ratio = roh.breite / roh.hoehe;

    const bild = sharp(roh.daten, { raw: { width: roh.breite, height: roh.hoehe, channels: 4 } });
    const name = seitenName(n);
    await bild.clone().webp({ quality: QUALITAET }).toFile(join(ziel, `${name}@gross.webp`));
    await bild.clone().resize({ width: KLEIN_BREITE }).webp({ quality: QUALITAET })
      .toFile(join(ziel, `${name}.webp`));

    if (n % 10 === 0 || n === anzahl) process.stdout.write(`    ${n}/${anzahl}\r`);
  }
  await pdf.destroy();

  const info = { hash, rezept: REZEPT, seiten: anzahl, ratio: Number(ratio.toFixed(6)) };
  writeFileSync(join(ziel, "info.json"), JSON.stringify(info, null, 2) + "\n");
  return info;
}

/* ---------- Lauf ---------- */
let overrides = {};
if (existsSync(TITEL_DATEI)) {
  try { overrides = JSON.parse(readFileSync(TITEL_DATEI, "utf8")) || {}; } catch {}
}
// Dieselbe Liste (und vor allem dieselben ids) wie das Manifest.
const eintraege = baueKataloge(readdirSync(KATALOG_DIR), overrides);

mkdirSync(SEITEN_DIR, { recursive: true });
let gerendert = 0, uebersprungen = 0;

for (const eintrag of eintraege) {
  const ziel = join(SEITEN_DIR, eintrag.id);
  const pdfBytes = readFileSync(eintrag.datei);
  const hash = hashVon(pdfBytes);
  const infoDatei = join(ziel, "info.json");

  if (!force && existsSync(infoDatei)) {
    try {
      const alt = JSON.parse(readFileSync(infoDatei, "utf8"));
      if (alt.hash === hash && alt.rezept === REZEPT) {
        console.log(`  = ${eintrag.titel} (unverändert, ${alt.seiten} Seiten)`);
        uebersprungen++;
        continue;
      }
    } catch { /* kaputte info.json -> neu rendern */ }
  }

  console.log(`  + ${eintrag.titel}`);
  const info = await rendereKatalog(eintrag, pdfBytes, hash, ziel);
  console.log(`    ${info.seiten} Seiten gerendert`);
  gerendert++;
}

/* Ordner von Katalogen aufräumen, die es nicht mehr gibt. */
const bekannt = new Set(eintraege.map((e) => e.id));
for (const name of readdirSync(SEITEN_DIR)) {
  if (!bekannt.has(name)) {
    rmSync(join(SEITEN_DIR, name), { recursive: true, force: true });
    console.log(`  - ${name} entfernt (kein Katalog mehr)`);
  }
}

console.log(`Seitenbilder: ${gerendert} Katalog(e) gerendert, ${uebersprungen} unverändert.`);
