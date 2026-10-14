#!/usr/bin/env node
/* ============================================================
   Baut aus content/site.json:
     index.html   — die Seite
     js/config.js — Laufzeit-Einstellungen fuer script.js und webmcp.js
     llms.txt     — Kurzprofil fuer KI-Assistenten
     pricing.md   — maschinenlesbare Preisauskunft
     sitemap.xml  — alle auslieferbaren Seiten
     index.md     — die Startseite als Markdown
     about/contact/privacy.html — Einstiegsseiten unter sprechenden Adressen
     en/index.html, en/about|contact|privacy.html — die englische Fassung
     auth.md      — warum es hier nichts anzumelden gibt
     .well-known/ard.json               — Katalog der agentischen Ressourcen
     .well-known/agent-skills/…/SKILL.md — Kurzanleitung fuer Agenten
     .well-known/agent-skills/index.json — Verzeichnis dazu
   Wird im CI und beim Deploy ausgefuehrt — und lokal per
   `node scripts/build-site.mjs`.
   ============================================================ */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { renderPage, renderConfigJs } from "../shared/render.mjs";
import { INFO_PAGES, renderInfoPage } from "../shared/infopages.mjs";
import { DEFAULT_LANG, HAND_PAGES, availableLangs, langDir, langScript, localize } from "../shared/i18n.mjs";
import {
  ARD_PATH,
  SKILLS_INDEX_PATH,
  SKILL_PATH,
  renderAgentSkill,
  renderAgentSkillsIndex,
  renderArdCatalog,
  renderAuthMd,
  renderIndexMd,
  renderLlmsTxt,
  renderPricingMd,
  renderSitemap,
} from "../shared/agents.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const contentPath = join(root, "content", "site.json");
let content;
try {
  content = JSON.parse(readFileSync(contentPath, "utf8"));
} catch (err) {
  console.error(`✗ content/site.json konnte nicht gelesen werden: ${err.message}`);
  process.exit(1);
}

/* Die englische Fassung entsteht nur, wenn site.json eine Uebersetzung
   mitbringt — ohne sie gaebe es nur deutsche Texte unter /en/. */
const translated = availableLangs(content).filter((l) => l !== DEFAULT_LANG);

const targets = [
  ["index.html", renderPage(content)],
  ...translated.flatMap((lang) => [
    [join(langDir(lang), "index.html"), renderPage(content, lang)],
    ...INFO_PAGES.map((pg) => [join(langDir(lang), pg.path), renderInfoPage(content, pg.slug, lang)]),
  ]),
  [join("js", "config.js"), renderConfigJs(content)],
  ["llms.txt", renderLlmsTxt(content)],
  ["pricing.md", renderPricingMd(content)],
  ["sitemap.xml", renderSitemap(content)],
  ["index.md", renderIndexMd(content)],
  ...INFO_PAGES.map((pg) => [pg.path, renderInfoPage(content, pg.slug)]),
  ["auth.md", renderAuthMd(content)],
  [ARD_PATH, renderArdCatalog(content)],
  [SKILL_PATH, renderAgentSkill(content)],
  [SKILLS_INDEX_PATH, renderAgentSkillsIndex(content)],
];

/* Impressum und Datenschutz sind von Hand gepflegt, tragen aber dasselbe
   Spracherkennungs-Skript wie die erzeugten Seiten. Nur dieser eine Block
   wird hier ersetzt — der Rest der Datei bleibt, wie er ist. */
const DETECT_BLOCK = /( *)<script id="soy-lang-detect">[\s\S]*?<\/script>/;
for (const lang of availableLangs(content)) {
  const local = localize(content, lang);
  for (const page of HAND_PAGES) {
    const rel = join(langDir(lang), page);
    let html;
    try {
      html = readFileSync(join(root, rel), "utf8");
    } catch {
      continue; /* Fassung gibt es (noch) nicht */
    }
    const block = langScript(local, page);
    if (!DETECT_BLOCK.test(html)) {
      console.error(`✗ ${rel}: Block <script id="soy-lang-detect"> fehlt.`);
      process.exit(1);
    }
    const next = html.replace(DETECT_BLOCK, (m, pad) => block.split("\n").map((l) => pad + l).join("\n"));
    targets.push([rel, next]);
  }
}

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
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, next, "utf8");
  console.log(`✓ ${rel} geschrieben`);
  changed += 1;
}

const enabled = (content.sections || []).filter((s) => s.enabled !== false).length;
console.log(`  ${enabled} von ${(content.sections || []).length} Sektionen aktiv, ${changed} Datei(en) aktualisiert.`);
