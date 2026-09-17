import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import {
  ValidationError,
  isEditablePath,
  katalogPath,
  mediaPath,
  previewHtml,
  publishFiles,
  renderOrThrow,
  validateContent,
} from "../src/content.js";
import { renderConfigJs, renderPage } from "../../shared/render.mjs";
import { INFO_PAGES, renderInfoPage } from "../../shared/infopages.mjs";
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
} from "../../shared/agents.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const live = () => JSON.parse(readFileSync(join(root, "content", "site.json"), "utf8"));

/* ---------- Pfade ---------- */

test("mediaPath räumt Dateinamen auf", () => {
  assert.equal(mediaPath("Mein Bild.WEBP"), "assets/img/mein-bild.webp");
  assert.equal(mediaPath("foto.jpg"), "assets/img/foto.jpg");
});

test("mediaPath lässt kein Ausbrechen aus dem Bilderordner zu", () => {
  // Verzeichnisanteile werden abgeschnitten, nicht durchgereicht.
  assert.equal(mediaPath("../../.github/workflows/evil.png"), "assets/img/evil.png");
  assert.equal(mediaPath("/etc/passwd.png"), "assets/img/passwd.png");
});

test("mediaPath lehnt gefährliche Endungen ab", () => {
  for (const bad of ["skript.js", "seite.html", "datei.yml", "ohne-endung", ""]) {
    assert.throws(() => mediaPath(bad), ValidationError, `Datei: ${bad}`);
  }
});

test("katalogPath verlangt eine PDF und behält Leerzeichen", () => {
  assert.equal(katalogPath("Sommer Katalog 2026.pdf"), "kataloge/Sommer Katalog 2026.pdf");
  assert.equal(katalogPath("../../index.pdf"), "kataloge/index.pdf");
  assert.throws(() => katalogPath("katalog.exe"), ValidationError);
});

test("isEditablePath erlaubt nur die vorgesehenen Bereiche", () => {
  assert.equal(isEditablePath("content/site.json"), true);
  assert.equal(isEditablePath("assets/img/foto.webp"), true);
  assert.equal(isEditablePath("kataloge/a.pdf"), true);
  assert.equal(isEditablePath(".github/workflows/deploy-pages.yml"), false);
  assert.equal(isEditablePath("js/script.js"), false);
  assert.equal(isEditablePath("assets/img/../../js/script.js"), false);
});

/* ---------- Pruefung ---------- */

test("Die echten Inhalte sind gültig", () => {
  assert.deepEqual(validateContent(live()), []);
});

test("Fehlender Seitentitel wird bemängelt", () => {
  const content = live();
  content.site.title = "";
  assert.ok(validateContent(content).some((e) => e.includes("Seitentitel")));
});

test("Ungültige E-Mail wird bemängelt", () => {
  const content = live();
  content.contact.email = "keine-adresse";
  assert.ok(validateContent(content).some((e) => e.includes("E-Mail")));
});

test("Doppelte Sektionskennungen fallen auf", () => {
  const content = live();
  content.sections[2].id = content.sections[1].id;
  assert.ok(validateContent(content).some((e) => e.includes("mehrfach")));
});

test("Unbekannte Symbole fallen auf", () => {
  const content = live();
  content.sections.find((s) => s.type === "cards").data.cards[0].icon = "gibt-es-nicht";
  assert.ok(validateContent(content).some((e) => e.includes("Symbol")));
});

test("Fehlender Alternativtext fällt auf", () => {
  const content = live();
  content.sections.find((s) => s.type === "about").data.image.alt = "";
  assert.ok(validateContent(content).some((e) => e.includes("Alternativtext")));
});

test("Bilder von fremden Servern werden abgelehnt", () => {
  const content = live();
  content.sections.find((s) => s.type === "about").data.image.src = "https://fremd.example/bild.jpg";
  assert.ok(validateContent(content).some((e) => e.includes("aus dem Projekt")));
});

test("Eine krumme Nummer für den WhatsApp-Chat fällt auf", () => {
  const content = live();
  content.chat = { ...content.chat, phoneHref: "0151 abc" };
  assert.ok(validateContent(content).some((e) => e.includes("WhatsApp-Chat")));
});

test("Der Chat-Knopf landet mit wa.me-Link im HTML", () => {
  const html = renderPage(live());
  assert.match(html, /class="chat-dock"/);
  assert.match(html, /https:\/\/wa\.me\/4915510279357\?text=/);
});

test("Ohne Chat-Block bleibt der Knopf weg", () => {
  const content = live();
  content.chat = { ...content.chat, enabled: false };
  assert.equal(renderPage(content).includes("chat-dock"), false);
});

test("Ein Kanal-Link ohne http(s) fällt auf", () => {
  const content = live();
  content.sections.find((s) => s.type === "channel").data.href = "whatsapp.com/channel/abc";
  assert.ok(validateContent(content).some((e) => e.includes("http")));
});

test("Alle Sektionen ausgeblendet ist nicht erlaubt", () => {
  const content = live();
  content.sections.forEach((s) => (s.enabled = false));
  assert.ok(validateContent(content).some((e) => e.includes("sichtbar")));
});

/* ---------- Rendern ---------- */

test("renderOrThrow erzeugt eine vollständige Seite", () => {
  const { html, configJs } = renderOrThrow(live());
  assert.ok(html.startsWith("<!DOCTYPE html>"));
  assert.ok(html.includes("</html>"));
  assert.ok(html.includes("Natürlich sauber."));
  assert.ok(configJs.includes("window.SOY_CONFIG"));
  /* Der QR-Code des Kanals steckt als Inline-SVG in der Seite. */
  assert.ok(html.includes('class="channel-qr-code"'));
});

test("Veröffentlichen nimmt die gebauten Dateien mit", () => {
  const content = live();
  /* Das Datum wird beim Veroeffentlichen gestempelt - hier fest vorgeben,
     sonst haengt der Test am Kalender. */
  const tag = new Date("2026-09-16T12:00:00Z");
  const stamped = { ...content, site: { ...content.site, contentUpdated: "2026-09-16" } };
  const files = publishFiles(content, tag);
  assert.deepEqual(
    files.map((f) => f.path),
    [
      "content/site.json",
      "index.html",
      "js/config.js",
      "llms.txt",
      "pricing.md",
      "sitemap.xml",
      "index.md",
      "about.html",
      "contact.html",
      "privacy.html",
      "auth.md",
      ARD_PATH,
      SKILL_PATH,
      SKILLS_INDEX_PATH,
    ]
  );

  // Byte-gleich mit dem, was scripts/build-site.mjs schreibt. Weicht es ab,
  // meldet die CI nach jeder Veröffentlichung „Gebaute Dateien sind aktuell"
  // als Fehler.
  const byPath = Object.fromEntries(files.map((f) => [f.path, f.content]));
  assert.equal(byPath["index.html"], renderPage(stamped));
  assert.equal(byPath["js/config.js"], renderConfigJs(stamped));
  assert.equal(byPath["llms.txt"], renderLlmsTxt(stamped));
  assert.equal(byPath["pricing.md"], renderPricingMd(stamped));
  assert.equal(byPath["sitemap.xml"], renderSitemap(stamped));
  assert.equal(byPath["index.md"], renderIndexMd(stamped));
  for (const pg of INFO_PAGES) assert.equal(byPath[pg.path], renderInfoPage(stamped, pg.slug));
  assert.equal(byPath["auth.md"], renderAuthMd(stamped));
  assert.equal(byPath[ARD_PATH], renderArdCatalog(stamped));
  assert.equal(byPath[SKILL_PATH], renderAgentSkill(stamped));
  assert.equal(byPath[SKILLS_INDEX_PATH], renderAgentSkillsIndex(stamped));
  assert.deepEqual(JSON.parse(byPath["content/site.json"]), stamped);
  assert.ok(files.every((f) => f.encoding === "utf-8"));
});

test("Ausgeblendete Bereiche verschwinden samt Navigationspunkt", () => {
  const content = live();
  const target = content.sections.find((s) => s.id === "mitmachen");
  target.enabled = false;

  const { html } = renderOrThrow(content);
  assert.ok(!html.includes('id="mitmachen"'));
  assert.ok(!html.includes('href="#mitmachen"'));
  // Die übrigen Bereiche bleiben unangetastet.
  assert.ok(html.includes('id="produkte"'));
});

test("Die Vorschau lädt Vorlagen von der Live-Seite und schaltet Formulare ab", () => {
  const html = previewHtml(live(), "https://shineonyou.de", [], "https://admin.example");
  assert.ok(html.includes('<base href="https://shineonyou.de/" />'));
  assert.ok(!html.includes('src="js/script.js"'));
  assert.ok(html.includes("preventDefault"));
});

test("Noch nicht veröffentlichte Bilder kommen in der Vorschau aus dem Backend", () => {
  const content = live();
  content.sections.find((s) => s.type === "about").data.image.src = "assets/img/neu.webp";

  const html = previewHtml(content, "https://shineonyou.de", ["assets/img/neu.webp"], "https://admin.example");
  assert.ok(html.includes("https://admin.example/api/media/pending/assets%2Fimg%2Fneu.webp"));
});
