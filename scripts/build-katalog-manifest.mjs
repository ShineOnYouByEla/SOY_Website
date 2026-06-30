/* ============================================================
   Erzeugt kataloge/manifest.json aus den PDF-Dateien im Ordner kataloge/.
   Wird beim Deploy (GitHub Actions) automatisch ausgeführt – kann aber
   auch lokal aufgerufen werden:  node scripts/build-katalog-manifest.mjs
   ============================================================ */
import { readdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const DIR = "kataloge";

/* Optionale Anzeigenamen aus kataloge/titel.json
   (Schlüssel = Dateiname ohne .pdf ODER die erzeugte id) */
let overrides = {};
const overridesPath = join(DIR, "titel.json");
if (existsSync(overridesPath)) {
  try {
    overrides = JSON.parse(readFileSync(overridesPath, "utf8")) || {};
  } catch (e) {
    console.warn("Warnung: kataloge/titel.json ist kein gültiges JSON – wird ignoriert.");
  }
}

/* Dateiname -> kurze, url-sichere id */
function toId(name) {
  return name
    .toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .normalize("NFD").replace(/[̀-ͯ]/g, "") // restliche Akzente entfernen
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/* Dateiname -> lesbarer Anzeigename */
function toTitle(name) {
  let s = name.replace(/^\d+\s*[-_. ]+\s*/, ""); // führendes Sortier-Präfix wie "01_" entfernen
  s = s.replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
  return s.replace(/\b\p{L}/gu, (c) => c.toUpperCase());
}

const files = readdirSync(DIR)
  .filter((f) => f.toLowerCase().endsWith(".pdf"))
  .sort((a, b) => a.localeCompare(b, "de"));

const seen = new Set();
const kataloge = files.map((file) => {
  const base = file.replace(/\.pdf$/i, "");
  const id = toId(base) || "katalog";
  // id eindeutig halten
  let uid = id, n = 2;
  while (seen.has(uid)) { uid = id + "-" + n++; }
  seen.add(uid);
  const titel = overrides[base] || overrides[uid] || overrides[id] || toTitle(base);
  return { id: uid, titel, datei: `${DIR}/${file}` };
});

writeFileSync(join(DIR, "manifest.json"), JSON.stringify({ kataloge }, null, 2) + "\n");
console.log(`manifest.json erzeugt: ${kataloge.length} Katalog(e)`);
kataloge.forEach((k) => console.log(`  • ${k.titel}  ->  ${k.datei}`));
