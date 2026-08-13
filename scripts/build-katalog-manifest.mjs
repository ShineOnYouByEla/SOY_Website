/* ============================================================
   Erzeugt kataloge/manifest.json aus den PDF-Dateien im Ordner kataloge/.
   Wird beim Deploy (GitHub Actions) automatisch ausgeführt – kann aber
   auch lokal aufgerufen werden:  node scripts/build-katalog-manifest.mjs

   Die eigentliche Logik (Namen, Reihenfolge, ids) steckt in
   shared/kataloge.mjs, damit das Admin dieselbe Liste anzeigt, die
   hier später gebaut wird.
   ============================================================ */
import { readdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { KATALOG_DIR, TITEL_DATEI, SEITEN_DIR, baueKataloge, manifestVon } from "../shared/kataloge.mjs";

/* Optionale Angaben aus kataloge/titel.json: Anzeigename, Reihenfolge,
   Ausblenden. Siehe kataloge/README.md. */
let overrides = {};
if (existsSync(TITEL_DATEI)) {
  try {
    overrides = JSON.parse(readFileSync(TITEL_DATEI, "utf8")) || {};
  } catch {
    console.warn(`Warnung: ${TITEL_DATEI} ist kein gültiges JSON – wird ignoriert.`);
  }
}

const eintraege = baueKataloge(readdirSync(KATALOG_DIR), overrides);

/* Angaben zu den gerenderten Seiten einsammeln (scripts/build-katalog-seiten.mjs).
   Fehlen sie, kommt der Katalog ohne Seitenbilder ins Manifest – die Seite
   sagt dann, dass er noch aufbereitet wird, statt kaputt auszusehen. */
const seitenInfos = {};
for (const e of eintraege) {
  const datei = join(SEITEN_DIR, e.id, "info.json");
  if (!existsSync(datei)) continue;
  try {
    seitenInfos[e.id] = JSON.parse(readFileSync(datei, "utf8"));
  } catch {
    console.warn(`Warnung: ${datei} ist kein gültiges JSON – wird ignoriert.`);
  }
}

const manifest = manifestVon(eintraege, seitenInfos);

writeFileSync(join(KATALOG_DIR, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");

const ohneBilder = eintraege.filter((e) => !e.versteckt && !seitenInfos[e.id]);
console.log(`manifest.json erzeugt: ${manifest.kataloge.length} Katalog(e)`);
for (const e of eintraege) {
  const info = seitenInfos[e.id];
  const seiten = info ? `${info.seiten} Seiten` : "noch keine Seitenbilder";
  console.log(`  ${e.versteckt ? "◦" : "•"} ${e.titel}  ->  ${e.datei}  (${seiten})${e.versteckt ? "  (ausgeblendet)" : ""}`);
}
if (ohneBilder.length) {
  console.warn(`Hinweis: ${ohneBilder.length} Katalog(e) ohne Seitenbilder. ` +
    "Bitte 'node scripts/build-katalog-seiten.mjs' ausführen.");
}
