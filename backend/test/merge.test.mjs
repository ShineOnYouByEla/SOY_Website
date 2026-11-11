/* ============================================================
   Drei-Wege-Merge der Inhalte (src/merge.js)
   ------------------------------------------------------------
   Der Fall, um den es geht: Ein Entwurf entsteht auf Stand A,
   main bekommt danach per Pull Request neue Felder, und der
   Entwurf wird veroeffentlicht. Die neuen Felder muessen bleiben.
   ============================================================ */

import assert from "node:assert/strict";
import { test } from "node:test";

import { mergeContent, sameContent } from "../src/merge.js";

const basis = {
  site: { title: "Alt", description: "Text" },
  sections: [
    { id: "hero", type: "hero", data: { heading: "Hallo" } },
    { id: "ueber", type: "cards", data: { cards: [{ title: "A" }, { title: "B" }] } },
  ],
  business: { sameAs: ["https://a.example"] },
};
const kopie = (x) => JSON.parse(JSON.stringify(x));

test("Neue Felder auf main bleiben erhalten, wenn der Entwurf anderes ändert", () => {
  const theirs = kopie(basis);
  theirs.site.chat = { enabled: true };
  theirs.shopUrl = "https://shop.example";
  const ours = kopie(basis);
  ours.site.title = "Neu";

  const { result, conflicts } = mergeContent(basis, theirs, ours);
  assert.deepEqual(conflicts, []);
  assert.equal(result.site.title, "Neu");
  assert.deepEqual(result.site.chat, { enabled: true });
  assert.equal(result.shopUrl, "https://shop.example");
});

test("Bereiche werden über ihre id zugeordnet, nicht über die Position", () => {
  const theirs = kopie(basis);
  theirs.sections.splice(1, 0, { id: "neu", type: "flow", data: {} });
  const ours = kopie(basis);
  ours.sections[1].data.cards[1].title = "B2";

  const { result, conflicts } = mergeContent(basis, theirs, ours);
  assert.deepEqual(conflicts, []);
  assert.deepEqual(result.sections.map((s) => s.id), ["hero", "neu", "ueber"]);
  assert.equal(result.sections[2].data.cards[1].title, "B2");
});

test("Löschen auf einer Seite gilt, solange die andere den Eintrag nicht geändert hat", () => {
  const theirs = kopie(basis);
  delete theirs.site.description;
  const ours = kopie(basis);
  ours.sections = ours.sections.filter((s) => s.id !== "ueber");

  const { result, conflicts } = mergeContent(basis, theirs, ours);
  assert.deepEqual(conflicts, []);
  assert.equal("description" in result.site, false);
  assert.deepEqual(result.sections.map((s) => s.id), ["hero"]);
});

test("Dieselbe Stelle verschieden geändert ist ein Konflikt", () => {
  const theirs = kopie(basis);
  theirs.site.title = "Von main";
  const ours = kopie(basis);
  ours.site.title = "Vom Entwurf";

  const { conflicts } = mergeContent(basis, theirs, ours);
  assert.deepEqual(conflicts, [{ path: "site.title", base: "Alt", theirs: "Von main", ours: "Vom Entwurf" }]);
});

test("Gleich geändert ist kein Konflikt", () => {
  const theirs = kopie(basis);
  theirs.site.title = "Beide";
  const ours = kopie(theirs);
  assert.deepEqual(mergeContent(basis, theirs, ours).conflicts, []);
});

test("Geändert gegen gelöscht ist ein Konflikt — mit Pfad über die Bereichs-id", () => {
  const theirs = kopie(basis);
  theirs.sections = theirs.sections.filter((s) => s.id !== "ueber");
  const ours = kopie(basis);
  ours.sections[1].data.cards[0].title = "A2";

  const { conflicts } = mergeContent(basis, theirs, ours);
  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0].path, "sections[#ueber]");
  assert.equal(conflicts[0].theirs, undefined);
});

test("Listen ohne id und mit neuer Länge auf beiden Seiten werden nicht geraten", () => {
  const theirs = kopie(basis);
  theirs.business.sameAs.push("https://b.example");
  const ours = kopie(basis);
  ours.business.sameAs.push("https://c.example");

  const { conflicts } = mergeContent(basis, theirs, ours);
  assert.deepEqual(conflicts.map((k) => k.path), ["business.sameAs"]);
});

test("Entscheidungen lösen Konflikte je Pfad auf", () => {
  const theirs = kopie(basis);
  theirs.site.title = "Von main";
  theirs.site.description = "Neu von main";
  const ours = kopie(basis);
  ours.site.title = "Vom Entwurf";

  const live = mergeContent(basis, theirs, ours, { resolve: { "site.title": "theirs" } });
  assert.deepEqual(live.conflicts, []);
  assert.equal(live.result.site.title, "Von main");
  assert.equal(live.result.site.description, "Neu von main");

  const entwurf = mergeContent(basis, theirs, ours, { resolve: { "site.title": "ours" } });
  assert.equal(entwurf.result.site.title, "Vom Entwurf");
});

test("Ohne bekannte Basis ist jeder Unterschied ein Konflikt", () => {
  const theirs = kopie(basis);
  theirs.shopUrl = "https://shop.example";
  const ours = kopie(basis);
  ours.site.title = "Neu";

  const { conflicts } = mergeContent(null, theirs, ours);
  assert.deepEqual(conflicts.map((k) => k.path).sort(), ["shopUrl", "site.title"]);
});

test("sameContent ignoriert die Reihenfolge der Schlüssel", () => {
  assert.equal(sameContent({ a: 1, b: [1, { c: 2 }] }, { b: [1, { c: 2 }], a: 1 }), true);
  assert.equal(sameContent({ a: 1 }, { a: 1, b: undefined }), false);
});
