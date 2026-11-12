/* ============================================================
   Entwurf und Live-Stand auseinandergelaufen
   ------------------------------------------------------------
   Nachgestellt wird 4cb5b1c: Ein Entwurf entsteht, danach
   landen Pull Requests auf main, und erst dann wird der Entwurf
   veroeffentlicht. Frueher schrieb das den alten Stand
   kommentarlos ueber main. Jetzt muss das Backend
   - Aenderungen ohne Ueberschneidung zusammenfuehren,
   - echte Konflikte melden und nichts veroeffentlichen,
   - bei unbekannter Basis jeden Unterschied vorlegen.
   ============================================================ */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { after, beforeEach, test } from "node:test";
import { fileURLToPath } from "node:url";

import app from "../src/app.js";
import { sha256Hex } from "../src/crypto.js";
import { openDatabase } from "../src/db-sqlite.js";
import { migrate } from "../src/migrate.js";
import { fakeGitHub } from "./helpers/fake-github.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const ORIGIN = "http://admin.test";
const TOKEN = "test-token";

const inhalte = JSON.parse(readFileSync(join(root, "..", "content", "site.json"), "utf8"));
const kopie = () => JSON.parse(JSON.stringify(inhalte));
const alsDatei = (x) => JSON.stringify(x, null, 2) + "\n";

const db = openDatabase(":memory:");
db.exec(readFileSync(join(root, "schema.sql"), "utf8"));

const env = {
  DB: db,
  GITHUB_REPO: "test/repo",
  GITHUB_BRANCH: "main",
  GITHUB_TESTING_BRANCH: "Testing",
  GITHUB_TOKEN: "geheim",
  SITE_URL: "https://example.test",
  ADMIN_ORIGIN: ORIGIN,
  COOKIE_SECURE: "false",
};

db.exec(
  `INSERT INTO users (id, email, name, password_hash, totp_enabled, disabled, created_at)
   VALUES ('u1', 'admin@example.test', 'Admin', 'x', 1, 0, 0)`
);
db.exec(
  `INSERT INTO sessions (id, user_id, created_at, expires_at, last_seen, mfa_done)
   VALUES ('${await sha256Hex(TOKEN)}', 'u1', 0, ${Date.now() + 3_600_000}, 0, 1)`
);

const echtesFetch = globalThis.fetch;
after(() => {
  globalThis.fetch = echtesFetch;
  db.close();
});

let hub;
beforeEach(() => {
  db.exec("DELETE FROM draft; DELETE FROM pending_media");
  hub = fakeGitHub({
    "content/site.json": alsDatei(inhalte),
    "index.html": "<!doctype html><title>alt</title>",
    "js/config.js": "// alt",
  });
  globalThis.fetch = hub.fetchImpl;
});

function anfrage(method, pfad, koerper) {
  const headers = { Cookie: `soy_session=${TOKEN}` };
  if (method !== "GET") headers.Origin = ORIGIN;
  if (koerper !== undefined) headers["Content-Type"] = "application/json";
  return app.fetch(
    new Request(`${ORIGIN}${pfad}`, { method, headers, body: koerper !== undefined ? JSON.stringify(koerper) : undefined }),
    env
  );
}

async function daten(res, erwartet = 200) {
  const text = await res.text();
  assert.equal(res.status, erwartet, text);
  return text ? JSON.parse(text) : null;
}

const liveInhalt = () => JSON.parse(hub.inhalt("main", "content/site.json"));

/** Entwurf mit neuem Seitentitel — wie die Oberfläche, mit der Basis, auf der sie geladen hat. */
async function entwurf(titel = "Titel aus dem Entwurf") {
  const geladen = await daten(await anfrage("GET", "/api/content"));
  const content = geladen.content;
  content.site.title = titel;
  await daten(await anfrage("PUT", "/api/content", { content, base: geladen.base }));
  return geladen.base;
}

/** Ein Pull Request landet auf main und ändert site.json. */
function prAufMain(aendern) {
  const neu = liveInhalt();
  aendern(neu);
  return hub.commitAuf("main", { "content/site.json": alsDatei(neu) });
}

const basisInDb = () => db.prepare("SELECT base_sha FROM draft WHERE id = 1").first().then((r) => r?.base_sha ?? null);

/* ---------- Basis festhalten ---------- */

test("Der erste Entwurf merkt sich den Commit, auf dem er beruht — und behält ihn", async () => {
  const start = hub.head("main");
  assert.equal(await entwurf("Eins"), start);
  assert.equal(await basisInDb(), start);

  // Ein weiterer Commit auf main und ein zweites Speichern ändern die Basis nicht.
  prAufMain((x) => (x.site.description = "Neu von main"));
  const content = kopie();
  content.site.title = "Zwei";
  await daten(await anfrage("PUT", "/api/content", { content, base: start }));
  assert.equal(await basisInDb(), start);
});

test("Ohne Angabe der Oberfläche nimmt der erste Entwurf den aktuellen Head", async () => {
  const content = kopie();
  content.site.title = "Ohne Basis";
  await daten(await anfrage("PUT", "/api/content", { content }));
  assert.equal(await basisInDb(), hub.head("main"));
});

/* ---------- Veroeffentlichen ---------- */

test("Ein veralteter Entwurf mit Konflikt wird nicht veröffentlicht", async () => {
  await entwurf("Titel aus dem Entwurf");
  const prHead = prAufMain((x) => (x.site.title = "Titel aus einem Pull Request"));

  const res = await anfrage("POST", "/api/content/publish", { message: "x" });
  const data = await daten(res, 409);

  assert.equal(data.code, "live_changed");
  assert.match(data.error, /Live-Seite hat sich seit Beginn deines Entwurfs geändert/);
  assert.deepEqual(
    data.live.conflicts.map((k) => [k.path, k.theirs, k.ours]),
    [["site.title", "Titel aus einem Pull Request", "Titel aus dem Entwurf"]]
  );
  // main bleibt, wie es der Pull Request hinterlassen hat — und der Entwurf ist noch da.
  assert.equal(hub.head("main"), prHead);
  assert.equal(liveInhalt().site.title, "Titel aus einem Pull Request");
  assert.equal((await daten(await anfrage("GET", "/api/content"))).source, "draft");
});

test("Änderungen ohne Überschneidung werden beim Veröffentlichen zusammengeführt", async () => {
  await entwurf("Titel aus dem Entwurf");
  // Wie #101/#107/#110: main bekommt neue Felder, die der Entwurf nicht kennt.
  prAufMain((x) => {
    x.site.description = "Beschreibung aus einem Pull Request";
    x.contact.zusatz = "Neues Feld";
  });

  const data = await daten(await anfrage("POST", "/api/content/publish", { message: "x" }));
  assert.equal(data.merged, true);

  const live = liveInhalt();
  assert.equal(live.site.title, "Titel aus dem Entwurf");
  assert.equal(live.site.description, "Beschreibung aus einem Pull Request");
  assert.equal(live.contact.zusatz, "Neues Feld");
  // Die erzeugte Seite stammt aus dem zusammengeführten Stand.
  assert.ok(hub.inhalt("main", "index.html").includes("Titel aus dem Entwurf"));
  // Die Oberfläche bekommt den zusammengeführten Stand zurück.
  assert.equal(data.content.site.description, "Beschreibung aus einem Pull Request");
});

test("Das Veröffentlichungsdatum ist kein Konflikt", async () => {
  // Zwei Veröffentlichungen hintereinander: main trägt dann jeweils ein
  // eigenes site.contentUpdated, der Entwurf der Oberfläche keins.
  await entwurf("Erster");
  const veroeffentlicht = await daten(await anfrage("POST", "/api/content/publish", {}));

  // Die Oberfläche arbeitet danach mit ihrem Stand weiter — ohne den Stempel.
  const weiter = kopie();
  delete weiter.site.contentUpdated;
  weiter.site.title = "Zweiter";
  await daten(await anfrage("PUT", "/api/content", { content: weiter, base: veroeffentlicht.commit.sha }));
  prAufMain((x) => (x.site.contentUpdated = "2000-01-01"));
  const data = await daten(await anfrage("POST", "/api/content/publish", {}));
  assert.equal(liveInhalt().site.title, "Zweiter");
  assert.match(liveInhalt().site.contentUpdated, /^\d{4}-\d{2}-\d{2}$/);
  assert.notEqual(liveInhalt().site.contentUpdated, "2000-01-01");
  assert.ok(data.ok);
});

test("Bewegt sich main nur außerhalb der Inhalte, wird wie gewohnt veröffentlicht", async () => {
  await entwurf("Nur der Titel");
  hub.commitAuf("main", { "backend/package.json": "{}" });

  const data = await daten(await anfrage("POST", "/api/content/publish", {}));
  assert.equal(data.merged, false);
  assert.equal(liveInhalt().site.title, "Nur der Titel");
  assert.equal(hub.inhalt("main", "backend/package.json"), "{}");
});

test("Ein Entwurf ohne bekannte Basis legt jeden Unterschied zur Entscheidung vor", async () => {
  // So liegen Entwürfe aus der Zeit vor der Spalte base_sha in der Datenbank.
  const alt = kopie();
  alt.site.title = "Uralter Entwurf";
  await db
    .prepare("INSERT INTO draft (id, content, updated_at, updated_by, base_sha) VALUES (1, ?, 0, 'x', NULL)")
    .bind(JSON.stringify(alt))
    .run();
  prAufMain((x) => (x.contact.zusatz = "Neu"));

  const data = await daten(await anfrage("POST", "/api/content/publish", {}), 409);
  assert.equal(data.live.unknownBase, true);
  assert.deepEqual(data.live.conflicts.map((k) => k.path).sort(), ["contact.zusatz", "site.title"]);
  assert.equal(liveInhalt().site.title, inhalte.site.title);
});

/* ---------- Anzeige und Abgleich ---------- */

test("Beim Laden meldet das Backend, dass die Live-Seite weiter ist", async () => {
  await entwurf("Entwurf");
  let data = await daten(await anfrage("GET", "/api/content"));
  assert.equal(data.live.changed, false);

  prAufMain((x) => (x.site.title = "Konkurrenz"));
  data = await daten(await anfrage("GET", "/api/content"));
  assert.equal(data.live.changed, true);
  assert.equal(data.live.conflicts.length, 1);
  assert.equal(data.content.site.title, "Entwurf", "Laden ändert den Entwurf nicht");
});

test("Konflikte lassen sich je Stelle entscheiden, danach geht der Entwurf raus", async () => {
  await entwurf("Entwurf");
  const prHead = prAufMain((x) => {
    x.site.title = "Konkurrenz";
    x.site.description = "Ohne Konflikt";
  });

  // Ohne Entscheidung: nichts passiert.
  await daten(await anfrage("POST", "/api/content/rebase", {}), 409);

  const data = await daten(await anfrage("POST", "/api/content/rebase", { resolve: { "site.title": "ours" } }));
  assert.equal(data.base, prHead);
  assert.equal(data.content.site.title, "Entwurf");
  assert.equal(data.content.site.description, "Ohne Konflikt");
  assert.equal(await basisInDb(), prHead);

  await daten(await anfrage("POST", "/api/content/publish", {}));
  assert.equal(liveInhalt().site.title, "Entwurf");
  assert.equal(liveInhalt().site.description, "Ohne Konflikt");
});

test("Ein Tab mit altem Stand kann den abgeglichenen Entwurf nicht zurückdrehen", async () => {
  const alteBasis = await entwurf("Entwurf");
  prAufMain((x) => (x.site.description = "Von main"));
  await daten(await anfrage("POST", "/api/content/rebase", {}));

  const veraltet = kopie();
  veraltet.site.title = "Aus dem alten Tab";
  const data = await daten(await anfrage("PUT", "/api/content", { content: veraltet, base: alteBasis }), 409);
  assert.equal(data.code, "draft_moved");
});

/* ---------- Testseite ---------- */

test("Auf die Testseite kommt bei Konflikt nichts, ohne Konflikt der zusammengeführte Stand", async () => {
  await entwurf("Entwurf");
  prAufMain((x) => (x.site.title = "Konkurrenz"));
  await daten(await anfrage("POST", "/api/content/testing"), 409);
  assert.deepEqual(hub.branches(), ["main"]);

  // Konflikt zugunsten des Entwurfs entschieden, danach kommt noch etwas auf main.
  await daten(await anfrage("POST", "/api/content/rebase", { resolve: { "site.title": "ours" } }));
  const prHead = prAufMain((x) => (x.site.description = "Später von main"));

  const data = await daten(await anfrage("POST", "/api/content/testing"));
  assert.equal(data.merged, true);
  assert.equal(data.base, prHead);
  const testing = JSON.parse(hub.inhalt("Testing", "content/site.json"));
  assert.equal(testing.site.title, "Entwurf");
  assert.equal(testing.site.description, "Später von main");
  // Der Entwurf selbst ist mitgezogen.
  assert.equal(await basisInDb(), prHead);
});

/* ---------- Migration ---------- */

test("Die Migration ergänzt base_sha in einer alten Datenbank und lässt sich wiederholen", async () => {
  const alt = openDatabase(":memory:");
  alt.exec(`CREATE TABLE draft (id INTEGER PRIMARY KEY CHECK (id = 1), content TEXT NOT NULL,
            updated_at INTEGER NOT NULL, updated_by TEXT)`);
  alt.exec(`INSERT INTO draft VALUES (1, '{}', 0, 'x')`);

  await migrate(alt);
  await migrate(alt);

  const row = await alt.prepare("SELECT content, base_sha FROM draft WHERE id = 1").first();
  assert.deepEqual(row, { content: "{}", base_sha: null });
  alt.close();
});
