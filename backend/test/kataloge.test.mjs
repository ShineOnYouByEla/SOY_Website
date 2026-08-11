import assert from "node:assert/strict";
import { test } from "node:test";

import {
  baueKataloge,
  katalogBase,
  katalogId,
  katalogTitel,
  manifestVon,
  serialisiereEintraege,
} from "../../shared/kataloge.mjs";

/* ---------- Namen und Kennungen ---------- */

test("katalogId erzeugt kurze, url-sichere Kennungen", () => {
  assert.equal(katalogId("Frühjahr 2026"), "fruehjahr-2026");
  assert.equal(katalogId("Symbiontische Reinigung - SR_Magazin 6 2026 DE"), "symbiontische-reinigung-sr-magazin-6-2026-de");
  assert.equal(katalogId("!!!"), "katalog");
});

test("katalogTitel leitet einen lesbaren Namen ab", () => {
  assert.equal(katalogTitel("fruehjahr-2026"), "Fruehjahr 2026");
  // Fuehrendes Sortier-Praefix taucht im Namen nicht auf.
  assert.equal(katalogTitel("01_wellness-und-wohlbefinden"), "Wellness Und Wohlbefinden");
});

test("katalogBase entfernt nur die Endung", () => {
  assert.equal(katalogBase("Sommer 2026.PDF"), "Sommer 2026");
  assert.equal(katalogBase("a.pdf.pdf"), "a.pdf");
});

/* ---------- Liste ---------- */

test("baueKataloge nimmt nur PDFs und sortiert nach Dateinamen", () => {
  const liste = baueKataloge(["b.pdf", "a.pdf", "titel.json", "manifest.json"]);
  assert.deepEqual(
    liste.map((e) => e.name),
    ["a.pdf", "b.pdf"]
  );
  assert.deepEqual(liste[0], {
    name: "a.pdf",
    base: "a",
    id: "a",
    datei: "kataloge/a.pdf",
    titel: "A",
    autoTitel: "A",
    eigenerTitel: "",
    position: null,
    versteckt: false,
  });
});

test("titel.json in Kurzschreibweise setzt den Anzeigenamen", () => {
  const [eintrag] = baueKataloge(["fruehjahr-2026.pdf"], { "fruehjahr-2026": "Frühjahr 2026" });
  assert.equal(eintrag.titel, "Frühjahr 2026");
  assert.equal(eintrag.eigenerTitel, "Frühjahr 2026");
});

test("Anzeigename wird auch unter altem Schlüssel mit .pdf gefunden", () => {
  // So hat das Admin die Datei frueher geschrieben – solche Eintraege
  // duerfen nicht stillschweigend wirkungslos werden.
  const [eintrag] = baueKataloge(["sommer.pdf"], { "sommer.pdf": "Sommer" });
  assert.equal(eintrag.titel, "Sommer");
});

test("Position bestimmt die Reihenfolge, der Rest folgt nach Dateinamen", () => {
  const liste = baueKataloge(["a.pdf", "b.pdf", "c.pdf"], { c: { position: 1 }, b: { position: 2 } });
  assert.deepEqual(
    liste.map((e) => e.name),
    ["c.pdf", "b.pdf", "a.pdf"]
  );
});

test("Kennungen bleiben unabhängig von der Reihenfolge stabil", () => {
  const ohne = baueKataloge(["a.pdf", "b.pdf"]);
  const mit = baueKataloge(["a.pdf", "b.pdf"], { b: { position: 1 } });
  assert.equal(mit.find((e) => e.name === "a.pdf").id, ohne.find((e) => e.name === "a.pdf").id);
});

test("gleiche Kennung aus zwei Dateinamen bleibt eindeutig", () => {
  const liste = baueKataloge(["Sommer 2026.pdf", "sommer-2026.pdf"]);
  const ids = liste.map((e) => e.id);
  assert.equal(new Set(ids).size, 2);
  assert.ok(ids.includes("sommer-2026"));
});

test("manifestVon lässt ausgeblendete Kataloge weg", () => {
  const liste = baueKataloge(["a.pdf", "b.pdf"], { b: { versteckt: true } });
  assert.deepEqual(manifestVon(liste), {
    kataloge: [{ id: "a", titel: "A", datei: "kataloge/a.pdf" }],
  });
});

test("kaputte oder fremde Einträge in titel.json stören nicht", () => {
  const [eintrag] = baueKataloge(["a.pdf"], { a: 42, weg: "Datei gibt es nicht mehr" });
  assert.equal(eintrag.titel, "A");
});

/* ---------- Zurückschreiben ---------- */

test("serialisiereEintraege schreibt nur das Nötige", () => {
  const liste = baueKataloge(["a.pdf", "b.pdf", "c.pdf"], {
    a: "Anders",
    b: { titel: "Bee", position: 2, versteckt: true },
  });
  assert.deepEqual(serialisiereEintraege(liste), {
    a: "Anders",
    b: { titel: "Bee", position: 2, versteckt: true },
  });
});

test("Serialisieren und Lesen ergibt wieder dieselbe Liste", () => {
  const dateien = ["a.pdf", "b.pdf", "c.pdf"];
  const vorher = baueKataloge(dateien, { a: { position: 3 }, b: "Bee", c: { titel: "Cee", versteckt: true } });
  const nachher = baueKataloge(dateien, serialisiereEintraege(vorher));
  assert.deepEqual(nachher, vorher);
});
