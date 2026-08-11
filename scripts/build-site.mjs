#!/usr/bin/env node
/* ============================================================
   Baut index.html und js/config.js aus content/site.json.
   Wird im CI und beim Deploy ausgefuehrt — und lokal per
   `node scripts/build-site.mjs`.
   ============================================================ */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { renderPage, renderConfigJs } from "../shared/render.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const contentPath = join(root, "content", "site.json");
let content;
try {
  content = JSON.parse(readFileSync(contentPath, "utf8"));
} catch (err) {
  console.error(`✗ content/site.json konnte nicht gelesen werden: ${err.message}`);
  process.exit(1);
}

const targets = [
  ["index.html", renderPage(content)],
  [join("js", "config.js"), renderConfigJs(content)],
];

let changed = 0;
for (const [rel, next] of targets) {
  const path = join(root, rel);
  let prev = null;
  try {
    prev = readFileSync(path, "utf8");
  } catch {
    /* Datei existiert noch nicht */
  }
  if (prev === next) {
    console.log(`· ${rel} unverändert`);
    continue;
  }
  writeFileSync(path, next, "utf8");
  console.log(`✓ ${rel} geschrieben`);
  changed += 1;
}

const enabled = (content.sections || []).filter((s) => s.enabled !== false).length;
console.log(`  ${enabled} von ${(content.sections || []).length} Sektionen aktiv, ${changed} Datei(en) aktualisiert.`);
