/* ============================================================
   Drei-Wege-Vergleich von Entwurf und Live-Stand
   ============================================================ */

import assert from "node:assert/strict";
import { test } from "node:test";

import { mergeContent } from "../src/merge.js";

test("Nur live geändert: der Live-Stand gewinnt", () => {
  const { ergebnis, konflikte } = mergeContent({ a: 1, b: 1 }, { a: 1, b: 1 }, { a: 1, b: 2 });
  assert.deepEqual(ergebnis, { a: 1, b: 2 });
  assert.deepEqual(konflikte, []);
});

test("Beide Seiten an verschiedenen Stellen: beides bleibt", () => {
  const { ergebnis, konflikte } = mergeContent({ a: 1, b: 1 }, { a: 2, b: 1 }, { a: 1, b: 3 });
  assert.deepEqual(ergebnis, { a: 2, b: 3 });
  assert.deepEqual(konflikte, []);
});

test("Live neu angelegter Block landet an seiner Stelle, nicht am Ende", () => {
  const { ergebnis } = mergeContent(
    { site: 1, header: 1, sections: 1 },
    { site: 2, header: 1, sections: 1 },
    { site: 1, header: 1, chat: { enabled: true }, sections: 1 }
  );
  assert.deepEqual(Object.keys(ergebnis), ["site", "header", "chat", "sections"]);
  assert.equal(ergebnis.site, 2);
});

test("Gelöscht auf einer Seite, unverändert auf der anderen: bleibt gelöscht", () => {
  const { ergebnis, konflikte } = mergeContent({ a: 1, chat: { x: 1 } }, { a: 1 }, { a: 2, chat: { x: 1 } });
  assert.deepEqual(ergebnis, { a: 2 });
  assert.deepEqual(konflikte, []);
});

test("Gelöscht auf einer Seite, geändert auf der anderen: Konflikt", () => {
  const { konflikte } = mergeContent({ chat: { x: 1 } }, {}, { chat: { x: 2 } });
  assert.deepEqual(konflikte, ["chat"]);
});

test("Beide gleich geändert ist kein Konflikt", () => {
  const { ergebnis, konflikte } = mergeContent({ a: 1 }, { a: 5 }, { a: 5 });
  assert.deepEqual(ergebnis, { a: 5 });
  assert.deepEqual(konflikte, []);
});

test("Sektionen werden über ihre Kennung zusammengeführt", () => {
  const basis = { sections: [{ id: "hero", t: "a" }, { id: "about", t: "a" }] };
  const entwurf = { sections: [{ id: "hero", t: "Entwurf" }, { id: "about", t: "a" }] };
  const live = { sections: [{ id: "hero", t: "a" }, { id: "about", t: "Live" }, { id: "neu", t: "Live" }] };
  const { ergebnis, konflikte } = mergeContent(basis, entwurf, live);
  assert.deepEqual(konflikte, []);
  assert.deepEqual(ergebnis.sections, [
    { id: "hero", t: "Entwurf" },
    { id: "about", t: "Live" },
    { id: "neu", t: "Live" },
  ]);
});

test("Umsortiert im Entwurf: dessen Reihenfolge gilt", () => {
  const basis = { s: [{ id: "a" }, { id: "b" }] };
  const entwurf = { s: [{ id: "b" }, { id: "a" }] };
  const live = { s: [{ id: "a" }, { id: "b", x: 1 }] };
  const { ergebnis } = mergeContent(basis, entwurf, live);
  assert.deepEqual(ergebnis.s, [{ id: "b", x: 1 }, { id: "a" }]);
});

test("Listen ohne Kennung sind ein Ganzes: beidseitig geändert ist ein Konflikt", () => {
  const { ergebnis, konflikte } = mergeContent({ l: [1, 2] }, { l: [1, 2, 3] }, { l: [0, 1, 2] });
  assert.deepEqual(konflikte, ["l"]);
  // Bei Konflikten steht der Entwurf im Ergebnis.
  assert.deepEqual(ergebnis.l, [1, 2, 3]);
});
