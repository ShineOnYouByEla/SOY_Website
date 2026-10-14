import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import { asset, availableLangs, localize, overlay } from "../../shared/i18n.mjs";
import { renderPage } from "../../shared/render.mjs";
import { renderInfoPage } from "../../shared/infopages.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const live = () => JSON.parse(readFileSync(join(root, "content", "site.json"), "utf8"));

/* ---------- Mischen ---------- */

test("Übersetzung ersetzt nur Texte, die es auf Deutsch gibt", () => {
  const out = overlay({ a: "Hallo", b: { c: "Welt", n: 3 } }, { a: "Hello", b: { c: "World", neu: "x" }, z: "y" });
  assert.deepEqual(out, { a: "Hello", b: { c: "World", n: 3 } });
});

test("Leere oder falsch geformte Übersetzungen lassen den deutschen Text stehen", () => {
  assert.deepEqual(overlay({ a: "Hallo", b: ["x"] }, { a: "  ", b: "kein Array" }), { a: "Hallo", b: ["x"] });
  assert.equal(overlay("Hallo", 5), "Hallo");
});

test("Sektionen werden über ihre Kennung zugeordnet, nicht über die Position", () => {
  const base = { sections: [{ id: "a", data: { t: "A" } }, { id: "b", data: { t: "B" } }] };
  const tr = { sections: [{ id: "b", data: { t: "Bee" } }] };
  assert.deepEqual(overlay(base, tr).sections, [
    { id: "a", data: { t: "A" } },
    { id: "b", data: { t: "Bee" } },
  ]);
});

test("Andere Listen werden über die Position zugeordnet; fehlende Einträge bleiben deutsch", () => {
  assert.deepEqual(overlay(["eins", "zwei", "drei"], ["one", {}]), ["one", "zwei", "drei"]);
});

/* ---------- Sprachfassung ---------- */

test("localize setzt Sprache und Weg zur Wurzel", () => {
  const de = localize(live(), "de");
  const en = localize(live(), "en");
  assert.equal(de.site.lang, "de");
  assert.equal(de.page.root, "");
  assert.equal(en.site.lang, "en");
  assert.equal(en.page.root, "../");
  assert.equal(en.translations, undefined);
  assert.deepEqual(en.page.langs, ["de", "en"]);
  // Fakten kommen weiter aus der deutschen Fassung.
  assert.equal(en.contact.email, live().contact.email);
});

test("asset() verlängert nur Projektpfade", () => {
  const en = localize(live(), "en");
  assert.equal(asset(en, "assets/img/x.webp"), "../assets/img/x.webp");
  for (const p of ["https://x.de/a.png", "/abs.png", "#top", "mailto:a@b.de", "../schon.png"]) {
    assert.equal(asset(en, p), p);
  }
});

test("availableLangs kennt nur Sprachen mit Übersetzung", () => {
  const { translations, ...ohne } = live();
  assert.deepEqual(availableLangs(ohne), ["de"]);
  assert.deepEqual(availableLangs(live()), ["de", "en"]);
});

/* ---------- Gerenderte Seiten ---------- */

test("Die englische Startseite ist englisch und verweist richtig nach oben", () => {
  const html = renderPage(live(), "en");
  assert.ok(html.includes('<html lang="en">'));
  assert.ok(html.includes('<link rel="canonical" href="https://shineonyou.de/en/" />'));
  assert.ok(html.includes('href="../css/styles.css"'));
  assert.ok(html.includes('src="../js/script.js"'));
  assert.ok(html.includes('src="../assets/img/manuela.webp"'));
  // Umschalter zurück auf Deutsch, mit gemerkter Wahl
  assert.ok(html.includes('href="../" hreflang="de" lang="de" data-lang="de"'));
  // Keine festen deutschen Bedienelemente mehr
  for (const de of ["Hauptnavigation", "Menü öffnen", "Bitte nicht ausfüllen", "Footer-Navigation"]) {
    assert.ok(!html.includes(de), de);
  }
});

test("Der Kontaktgrund hinter einem Knopf passt zu einer Option im Formular", () => {
  /* script.js waehlt den Grund vor; stimmt der Text nicht ueberein,
     bleibt das Feld leer. Gilt fuer jede Sprache. */
  for (const lang of ["de", "en"]) {
    const html = renderPage(live(), lang);
    const options = new Set([...html.matchAll(/<option value="([^"]+)">/g)].map((m) => m[1]));
    const reasons = [...html.matchAll(/data-contact-reason="([^"]+)"/g)].map((m) => m[1]);
    assert.ok(reasons.length > 0);
    for (const r of reasons) assert.ok(options.has(r), `${lang}: ${r}`);
  }
});

test("Beide Fassungen nennen einander per hreflang", () => {
  for (const lang of ["de", "en"]) {
    const html = renderPage(live(), lang);
    assert.ok(html.includes('hreflang="de" href="https://shineonyou.de/"'));
    assert.ok(html.includes('hreflang="en" href="https://shineonyou.de/en/"'));
    assert.ok(html.includes('hreflang="x-default" href="https://shineonyou.de/"'));
  }
});

test("Die Spracherkennung lässt Crawler und interne Links in Ruhe", () => {
  const html = renderPage(live());
  assert.ok(html.includes('<script id="soy-lang-detect">'));
  assert.ok(/bot\|crawl/.test(html));
  assert.ok(html.includes("document.referrer"));
});

test("Die englischen Einstiegsseiten sind englisch", () => {
  for (const slug of ["about", "contact", "privacy"]) {
    const html = renderInfoPage(live(), slug, "en");
    assert.ok(html.includes('<html lang="en">'), slug);
    assert.ok(html.includes('href="../css/styles.css"'), slug);
    assert.ok(!html.includes("Zur Startseite"), slug);
  }
});
