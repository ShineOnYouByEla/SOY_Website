// Prüft, ob alle <script type="application/ld+json">-Blöcke gültiges JSON
// enthalten. Ein einziges überzähliges Komma reicht, damit Suchmaschinen die
// kompletten strukturierten Daten ignorieren – genau das soll hier auffallen,
// bevor es live geht.
import { readFileSync, readdirSync } from "node:fs";

const htmlFiles = readdirSync(".").filter((f) => f.endsWith(".html"));
const blockRe = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

let blocks = 0;
let errors = 0;

for (const file of htmlFiles) {
  const html = readFileSync(file, "utf8");
  for (const match of html.matchAll(blockRe)) {
    blocks++;
    try {
      JSON.parse(match[1]);
      console.log(`OK   ${file}: JSON-LD-Block gültig`);
    } catch (err) {
      errors++;
      console.error(`FEHLER ${file}: ungültiges JSON-LD – ${err.message}`);
    }
  }
}

console.log(`${blocks} JSON-LD-Block/Blöcke geprüft, ${errors} Fehler.`);
if (errors > 0) process.exit(1);
