/* ============================================================
   Lesbare Konfliktpfade im Admin (public/js/konfliktpfad.js)
   ------------------------------------------------------------
   Der Konfliktdialog soll nennen, was im Admin an der Stelle
   steht — nicht den Pfad in site.json. Geprüft gegen die echten
   Inhalte, damit eine umbenannte Maske hier auffällt.
   ============================================================ */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { lesbarerPfad } from "../public/js/konfliktpfad.js";
import { SECTION_SCHEMA, SETTINGS_PANELS } from "../public/js/schema.js";
import { mergeContent } from "../src/merge.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const inhalte = JSON.parse(readFileSync(join(root, "..", "content", "site.json"), "utf8"));
const text = (pfad) => lesbarerPfad(pfad, inhalte).text;

test("Einstellungen heißen wie Bereich und Feld im Admin", () => {
  assert.equal(text("site.title"), "Titel & Suchmaschinen › Seitentitel");
  assert.equal(text("chat.quickReplies"), "WhatsApp-Chat unten rechts › Fertige Gesprächsanfänge");
  assert.equal(text("header"), "Kopfbereich (gesamt)");
});

test("Felder ohne Eingabemaske bekommen trotzdem einen Namen", () => {
  assert.equal(text("business.shopUrl"), "Angaben für Suchmaschinen › Adresse des Onlineshops");
  // Tiefer als bekannt: der Rest bleibt technisch stehen.
  assert.equal(text("business.person.description"), "Angaben für Suchmaschinen › Angaben zur Person › description");
});

test("Bereiche heißen wie in der Seitenleiste, Felder wie in ihrer Maske", () => {
  const ueber = inhalte.sections.find((s) => s.id === "ueber");
  const feld = SECTION_SCHEMA[ueber.type].fields[0];
  assert.equal(text(`sections[ueber].data.${feld.k}`), `Bereich „${ueber.title}“ › ${feld.label}`);
  assert.equal(text("sections[ueber]"), `Bereich „${ueber.title}“ (ganzer Bereich)`);
  assert.equal(text("sections[ueber].title"), `Bereich „${ueber.title}“ › Name in der Seitenleiste`);
});

test("Die englische Fassung ist als solche gekennzeichnet", () => {
  assert.equal(text("translations.en.site.title"), "Englische Fassung › Titel & Suchmaschinen › Seitentitel");
  const kontakt = inhalte.sections.find((s) => s.id === "kontakt");
  assert.match(text("translations.en.sections[kontakt].data.heading"), new RegExp(`^Englische Fassung › Bereich „${kontakt.title}“ › `));
});

test("Unbekanntes wird nicht geraten", () => {
  assert.deepEqual(lesbarerPfad("version", inhalte), { text: "version", technisch: true });
  // Bereich, den es im Entwurf nicht mehr gibt: die id bleibt stehen.
  assert.equal(text("sections[weg].data.x"), "Bereich „weg“ › x");
});

test("Jede Maske im Schema lässt sich auflösen", () => {
  for (const panel of SETTINGS_PANELS) {
    for (const f of panel.fields) {
      assert.equal(text(`${panel.path}.${f.k}`), `${panel.title} › ${f.label}`);
    }
  }
});

test("Passt zu den Pfaden, die merge.js wirklich meldet", () => {
  const basis = structuredClone(inhalte);
  const entwurf = structuredClone(inhalte);
  const live = structuredClone(inhalte);
  entwurf.site.title = "E";
  live.site.title = "L";
  entwurf.sections[1].data.heading = "E";
  live.sections[1].data.heading = "L";
  const { konflikte } = mergeContent(basis, entwurf, live);
  assert.equal(konflikte.length, 2);
  for (const pfad of konflikte) assert.equal(lesbarerPfad(pfad, inhalte).technisch, false, pfad);
  assert.match(text(konflikte[1]), /^Bereich „.+“ › Überschrift$/);
});
