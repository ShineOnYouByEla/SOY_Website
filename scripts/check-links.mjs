// Prüft alle internen Verweise der statischen Seite:
//  - href/src/poster in den HTML-Dateien (relative Pfade müssen existieren)
//  - Anker (#id) müssen im Zieldokument vorhanden sein
//  - url(...) in den CSS-Dateien (Fonts, Bilder)
// Externe Links (http/https, mailto, tel) werden bewusst nicht geprüft,
// damit die CI nicht von fremden Servern abhängt.
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { dirname, join, normalize } from "node:path";

const errors = [];

function idsIn(html) {
  return new Set([...html.matchAll(/\bid=["']([^"']+)["']/g)].map((m) => m[1]));
}

const htmlFiles = readdirSync(".").filter((f) => f.endsWith(".html"));
const htmlContent = Object.fromEntries(htmlFiles.map((f) => [f, readFileSync(f, "utf8")]));

for (const [file, html] of Object.entries(htmlContent)) {
  const refs = [...html.matchAll(/\b(?:href|src|poster)=["']([^"']+)["']/g)].map((m) => m[1]);
  for (const ref of refs) {
    if (/^(https?:)?\/\//.test(ref) || ref.startsWith("mailto:") || ref.startsWith("tel:") || ref.startsWith("data:")) continue;

    const [pathPart, fragment] = ref.split("#");
    const target = pathPart.split("?")[0];

    if (target) {
      const resolved = normalize(join(dirname(file), target));
      if (!existsSync(resolved)) {
        errors.push(`${file}: Ziel fehlt: ${ref}`);
        continue;
      }
      if (fragment && resolved.endsWith(".html")) {
        const targetHtml = htmlContent[resolved] ?? readFileSync(resolved, "utf8");
        if (!idsIn(targetHtml).has(fragment)) errors.push(`${file}: Anker #${fragment} fehlt in ${resolved}`);
      }
    } else if (fragment) {
      if (!idsIn(html).has(fragment)) errors.push(`${file}: Anker #${fragment} fehlt`);
    }
  }
}

for (const cssFile of readdirSync("css").filter((f) => f.endsWith(".css"))) {
  const css = readFileSync(join("css", cssFile), "utf8");
  for (const m of css.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)) {
    const ref = m[1];
    if (/^(https?:)?\/\//.test(ref) || ref.startsWith("data:")) continue;
    const resolved = normalize(join("css", ref.split("?")[0].split("#")[0]));
    if (!existsSync(resolved)) errors.push(`css/${cssFile}: Ziel fehlt: ${ref}`);
  }
}

if (errors.length) {
  for (const e of errors) console.error(`FEHLER ${e}`);
  console.error(`${errors.length} kaputte(r) Verweis(e) gefunden.`);
  process.exit(1);
}
console.log("Alle internen Verweise in HTML und CSS sind gültig.");
