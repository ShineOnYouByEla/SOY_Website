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
  assert.equal(text("business.person"), "Angaben für Suchmaschinen › Angaben zur Person");
});

test("Unterfelder werden mitübersetzt", () => {
  // Objekte ohne Maske, über die Zusatzliste
  assert.equal(text("business.person.description"), "Angaben für Suchmaschinen › Angaben zur Person › Beschreibung");
  assert.equal(text("business.address.postalCode"), "Angaben für Suchmaschinen › Anschrift › Postleitzahl");
  assert.equal(text("business.offer.name"), "Angaben für Suchmaschinen › Angebot › Bezeichnung");
  // Teile eines Bildes, beschriftet wie im Bildwähler
  assert.equal(text("header.logo.alt"), "Kopfbereich › Logo › Alternativtext");
  assert.equal(text("chat.avatar.src"), "WhatsApp-Chat unten rechts › Bild im Chatfenster › Bilddatei");
  // Maske als Liste, im Inhalt ein einzelnes Objekt
  assert.equal(text("header.cta.label"), "Kopfbereich › Button im Kopfbereich › Beschriftung");
});

test("Unterfelder in Bereichen folgen deren Maske", () => {
  const mitBild = inhalte.sections.find((s) => s.data?.image && typeof s.data.image === "object");
  assert.ok(mitBild, "die Inhalte haben einen Bereich mit Bild");
  const bildFeld = SECTION_SCHEMA[mitBild.type].fields.find((f) => f.k === "image");
  assert.equal(text(`sections[${mitBild.id}].data.image.alt`), `Bereich „${mitBild.title}“ › ${bildFeld.label} › Alternativtext`);
});

test("Jedes vorhandene Unterfeld der Firmenangaben hat einen Namen", () => {
  // Gegen die echten Inhalte: kommt per Pull Request ein Feld dazu, fällt
  // hier auf, dass ihm im Konfliktdialog noch der Name fehlt.
  for (const objekt of ["person", "address", "offer"]) {
    for (const k of Object.keys(inhalte.business[objekt])) {
      const t = text(`business.${objekt}.${k}`);
      assert.ok(!t.endsWith(` › ${k}`), `${objekt}.${k} bleibt technisch: ${t}`);
    }
  }
});

test("Hinter dem Bekannten bleibt es technisch", () => {
  assert.equal(text("business.person.unbekannt"), "Angaben für Suchmaschinen › Angaben zur Person › unbekannt");
  assert.equal(text("business.address.x.y"), "Angaben für Suchmaschinen › Anschrift › x › y");
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
