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

import { KATALOG_DIR, TITEL_DATEI, baueKataloge, manifestVon } from "../shared/kataloge.mjs";

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
const manifest = manifestVon(eintraege);

writeFileSync(join(KATALOG_DIR, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");

console.log(`manifest.json erzeugt: ${manifest.kataloge.length} Katalog(e)`);
for (const e of eintraege) {
  console.log(`  ${e.versteckt ? "◦" : "•"} ${e.titel}  ->  ${e.datei}${e.versteckt ? "  (ausgeblendet)" : ""}`);
}
