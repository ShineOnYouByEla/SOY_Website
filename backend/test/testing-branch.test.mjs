/* ============================================================
   Speichern auf die Testseite, Veroeffentlichen auf Live
   ------------------------------------------------------------
   Geprüft wird der Weg der Inhalte durch die beiden Branches:
   „Speichern" landet auf dem Testing-Branch, der Live-Branch
   bleibt unberührt. Erst „Veröffentlichen" schreibt live — und
   zieht die Testseite anschließend wieder nach.
   ============================================================ */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { after, beforeEach, test } from "node:test";
import { fileURLToPath } from "node:url";

import app from "../src/app.js";
import { sha256Hex } from "../src/crypto.js";
import { openDatabase } from "../src/db-sqlite.js";
import { fakeGitHub } from "./helpers/fake-github.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const ORIGIN = "http://admin.test";
const TOKEN = "test-token";

const inhalte = JSON.parse(readFileSync(join(root, "..", "content", "site.json"), "utf8"));

/* ---------- Umgebung ---------- */

const db = openDatabase(":memory:");
db.exec(readFileSync(join(root, "schema.sql"), "utf8"));

const env = {
  DB: db,
  GITHUB_REPO: "test/repo",
  GITHUB_BRANCH: "main",
  GITHUB_TESTING_BRANCH: "Testing",
  GITHUB_TOKEN: "geheim",
  SITE_URL: "https://example.test",
  TESTING_URL: "http://testing.example.test",
  ADMIN_ORIGIN: ORIGIN,
  COOKIE_SECURE: "false",
};

/** Dieselbe Umgebung, aber ohne Testseite — so lief es vor dieser Änderung. */
const ohneTesting = { ...env, GITHUB_TESTING_BRANCH: "" };

db.exec(
  `INSERT INTO users (id, email, name, password_hash, totp_enabled, disabled, created_at)
   VALUES ('u1', 'admin@example.test', 'Admin', 'x', 1, 0, 0)`
);
db.exec(
  `INSERT INTO sessions (id, user_id, created_at, expires_at, last_seen, mfa_done)
   VALUES ('${await sha256Hex(TOKEN)}', 'u1', 0, ${Date.now() + 3_600_000}, 0, 1)`
);

after(() => db.close());

const echtesFetch = globalThis.fetch;
after(() => {
  globalThis.fetch = echtesFetch;
});

let hub;

function starte(optionen) {
  hub = fakeGitHub(
    {
      "content/site.json": JSON.stringify(inhalte, null, 2) + "\n",
      "index.html": "<!doctype html><title>alt</title>",
      "js/config.js": "// alt",
    },
    optionen
  );
  globalThis.fetch = hub.fetchImpl;
}

beforeEach(() => {
  db.exec("DELETE FROM draft; DELETE FROM pending_media");
  starte();
});

/** Anfrage im Namen eines angemeldeten Admins. */
function anfrage(method, pfad, { json: koerper, body, env: umgebung = env } = {}) {
  const headers = { Cookie: `soy_session=${TOKEN}` };
  if (method !== "GET") headers.Origin = ORIGIN;
  if (koerper !== undefined) headers["Content-Type"] = "application/json";
  return app.fetch(
    new Request(`${ORIGIN}${pfad}`, {
      method,
      headers,
      body: koerper !== undefined ? JSON.stringify(koerper) : body,
    }),
    umgebung
  );
}

/** Antwort einmal lesen: Status prüfen und den Inhalt zurückgeben. */
async function daten(res, erwartet = 200) {
  const text = await res.text();
  assert.equal(res.status, erwartet, text);
  return text ? JSON.parse(text) : null;
}

/** Entwurf mit geändertem Seitentitel ablegen — wie das Speichern im Admin. */
async function entwurfAblegen(titel = "Neuer Titel") {
  const content = JSON.parse(JSON.stringify(inhalte));
  content.site.title = titel;
  await daten(await anfrage("PUT", "/api/content", { json: { content } }));
  return content;
}

/* ---------- Speichern ---------- */

test("Speichern legt den Entwurf nur ab — erst der zweite Schritt geht auf die Testseite", async () => {
  await entwurfAblegen("Nur Entwurf");
  // Der reine Entwurf fasst kein Repository an.
  assert.deepEqual(hub.branches(), ["main"]);
  assert.ok(!hub.inhalt("main", "content/site.json").includes("Nur Entwurf"));
});

test("Auf die Testseite stellen commitet nur auf den Testing-Branch", async () => {
  await entwurfAblegen("Stand zum Anschauen");
  const liveVorher = hub.head("main");

  const data = await daten(await anfrage("POST", "/api/content/testing"));

  assert.equal(data.branch, "Testing");
  assert.equal(data.commit.branch, "Testing");
  assert.equal(data.testingUrl, "http://testing.example.test");

  // Der Testing-Branch entsteht dabei von selbst und trägt den neuen Stand …
  assert.deepEqual(hub.branches(), ["Testing", "main"]);
  assert.ok(hub.inhalt("Testing", "content/site.json").includes("Stand zum Anschauen"));
  // … samt der daraus gebauten Seite.
  assert.ok(hub.inhalt("Testing", "index.html").includes("Stand zum Anschauen"));

  // … und live bleibt alles, wie es war.
  assert.equal(hub.head("main"), liveVorher);
  assert.ok(!hub.inhalt("main", "content/site.json").includes("Stand zum Anschauen"));
});

test("Zweimal derselbe Stand erzeugt keinen zweiten Commit", async () => {
  await entwurfAblegen("Einmal reicht");
  const erste = await daten(await anfrage("POST", "/api/content/testing"));
  const zweite = await daten(await anfrage("POST", "/api/content/testing"));

  assert.equal(zweite.commit.unchanged, true);
  assert.equal(zweite.commit.sha, erste.commit.sha);
  assert.equal(hub.head("Testing"), erste.commit.sha);
});

test("Der Entwurf bleibt nach der Testseite bestehen und lässt sich veröffentlichen", async () => {
  await entwurfAblegen("Zweistufig");
  await anfrage("POST", "/api/content/testing");

  const data = await daten(await anfrage("GET", "/api/content"));
  assert.equal(data.source, "draft");
  assert.equal(data.content.site.title, "Zweistufig");
});

test("Ohne Entwurf gibt es auf der Testseite nichts zu tun", async () => {
  const data = await daten(await anfrage("POST", "/api/content/testing"));
  assert.equal(data.unchanged, true);
  assert.deepEqual(hub.branches(), ["main"]);
});

test("Fehlerhafte Inhalte kommen nicht einmal auf die Testseite", async () => {
  const content = JSON.parse(JSON.stringify(inhalte));
  content.site.title = "";
  // Der Entwurf selbst wird schon abgelehnt – nichts wandert ins Repository.
  await daten(await anfrage("PUT", "/api/content", { json: { content } }), 400);
  assert.deepEqual(hub.branches(), ["main"]);
});

test("Ohne eingerichteten Testing-Branch bleibt es beim Entwurf", async () => {
  await entwurfAblegen();
  await daten(await anfrage("POST", "/api/content/testing", { env: ohneTesting }), 503);
  assert.deepEqual(hub.branches(), ["main"]);
});

/* ---------- Veroeffentlichen ---------- */

test("Veröffentlichen schreibt live und zieht die Testseite nach", async () => {
  await entwurfAblegen("Jetzt live");
  await anfrage("POST", "/api/content/testing");

  const data = await daten(await anfrage("POST", "/api/content/publish", { json: { message: "Titel geändert" } }));

  assert.equal(data.commit.branch, "main");
  assert.ok(hub.inhalt("main", "content/site.json").includes("Jetzt live"));
  assert.ok(hub.inhalt("main", "index.html").includes("Jetzt live"));

  // Die Testseite zeigt danach denselben Stand wie die Live-Seite.
  assert.equal(data.testing.branch, "Testing");
  assert.ok(!data.testing.error, data.testing.error);
  assert.equal(hub.inhalt("Testing", "content/site.json"), hub.inhalt("main", "content/site.json"));

  // Der Entwurf ist damit erledigt.
  const stand = await daten(await anfrage("GET", "/api/content"));
  assert.equal(stand.source, "live");
});

test("Veröffentlichen ohne Umweg über die Testseite legt sie trotzdem auf den Live-Stand", async () => {
  await entwurfAblegen("Direkt live");

  const data = await daten(await anfrage("POST", "/api/content/publish", { json: {} }));
  assert.equal(data.testing.branch, "Testing");
  assert.ok(hub.inhalt("Testing", "content/site.json").includes("Direkt live"));
});

test("Lässt sich die Testseite nicht mischen, wird sie hart auf den Live-Stand gesetzt", async () => {
  starte({ mergeKonflikt: true });
  await entwurfAblegen("Nach dem Konflikt");
  await anfrage("POST", "/api/content/testing");

  const data = await daten(await anfrage("POST", "/api/content/publish", { json: {} }));

  assert.equal(data.testing.mode, "reset");
  // Entscheidend: beide Branches zeigen danach auf denselben Commit.
  assert.equal(hub.head("Testing"), hub.head("main"));
});

test("Ohne Testing-Branch veröffentlicht der Admin wie bisher", async () => {
  await entwurfAblegen("Ohne Testseite");
  const data = await daten(await anfrage("POST", "/api/content/publish", { json: {}, env: ohneTesting }));
  assert.equal(data.testing, null);
  assert.deepEqual(hub.branches(), ["main"]);
  assert.ok(hub.inhalt("main", "content/site.json").includes("Ohne Testseite"));
});

/* ---------- Kataloge ---------- */

test("Ein hochgeladener Katalog liegt sofort auf beiden Branches", async () => {
  const form = new FormData();
  form.append("file", new File(["%PDF-1.4 herbst"], "herbst.pdf", { type: "application/pdf" }));
  form.append("filename", "herbst.pdf");

  await daten(await anfrage("POST", "/api/kataloge", { body: form }));

  // Kataloge gehen ohne Entwurf direkt live – die Testseite darf deshalb
  // nicht hinterherhinken, sonst fehlt dort die PDF bis zur nächsten
  // Veröffentlichung.
  assert.equal(hub.inhalt("main", "kataloge/herbst.pdf"), "%PDF-1.4 herbst");
  assert.equal(hub.inhalt("Testing", "kataloge/herbst.pdf"), "%PDF-1.4 herbst");
});

/* ---------- Verwerfen ---------- */

test("Verwerfen holt die Testseite auf den Live-Stand zurück", async () => {
  await entwurfAblegen("Doch nicht");
  await anfrage("POST", "/api/content/testing");
  assert.ok(hub.inhalt("Testing", "content/site.json").includes("Doch nicht"));

  const data = await daten(await anfrage("DELETE", "/api/content"));
  assert.ok(!data.testing.error);
  assert.ok(!hub.inhalt("Testing", "content/site.json").includes("Doch nicht"));
});

/* ---------- Statusanzeige ---------- */

test("Die Statusanzeige nennt beide Branches und die Adresse der Testseite", async () => {
  const data = await daten(await anfrage("GET", "/api/health"));
  assert.equal(data.branch, "main");
  assert.equal(data.testingBranch, "Testing");
  assert.equal(data.testingUrl, "http://testing.example.test");

  const ohne = await daten(await anfrage("GET", "/api/health", { env: ohneTesting }));
  assert.equal(ohne.testingBranch, null);
});
