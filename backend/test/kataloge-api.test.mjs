/* ============================================================
   Katalogverwaltung im Admin — von der Anfrage bis zum Commit
   ------------------------------------------------------------
   Geprüft wird der ganze Weg: HTTP-Route → GitHub-API → das, was
   danach im Repository liegt. Anschließend läuft dieselbe Logik
   darüber, die beim Deploy manifest.json erzeugt — nur so fällt
   auf, wenn das Admin etwas schreibt, das der Build nicht liest.
   ============================================================ */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { after, beforeEach, test } from "node:test";
import { fileURLToPath } from "node:url";

import app from "../src/app.js";
import { sha256Hex } from "../src/crypto.js";
import { openDatabase } from "../src/db-sqlite.js";
import { baueKataloge, manifestVon } from "../../shared/kataloge.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const ORIGIN = "http://admin.test";
const TOKEN = "test-token";

/* ---------- Nachbau des GitHub-Teils, den das Backend benutzt ---------- */

/**
 * Haelt einen Dateibestand im Speicher und beantwortet damit genau die
 * Aufrufe aus src/github.js: Verzeichnis lesen, Datei lesen, Blob anlegen,
 * Baum schreiben, Commit setzen.
 */
function fakeGitHub(dateien) {
  const repo = new Map();
  const blobs = new Map(); // sha -> Inhalt
  let zaehler = 0;

  const schreibe = (pfad, inhalt) => {
    const sha = `blob${++zaehler}`;
    blobs.set(sha, inhalt);
    repo.set(pfad, { sha, content: inhalt });
  };
  for (const [pfad, inhalt] of Object.entries(dateien)) schreibe(pfad, inhalt);

  const aufrufe = [];
  const json = (data, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

  const fetchImpl = async (url, init = {}) => {
    const u = new URL(typeof url === "string" ? url : url.url);
    const pfad = decodeURIComponent(u.pathname);
    const method = init.method || "GET";
    const body = init.body ? JSON.parse(init.body) : null;
    aufrufe.push(`${method} ${pfad}`);

    const contents = pfad.match(/^\/repos\/[^/]+\/[^/]+\/contents\/(.*)$/);
    if (contents && method === "GET") {
      const ziel = contents[1];
      if (repo.has(ziel)) {
        const f = repo.get(ziel);
        return json({ type: "file", sha: f.sha, size: f.content.length, content: btoa(f.content) });
      }
      const kinder = [...repo.keys()].filter((k) => k.startsWith(`${ziel}/`) && !k.slice(ziel.length + 1).includes("/"));
      if (kinder.length) {
        return json(
          kinder.map((k) => ({
            type: "file",
            name: k.split("/").pop(),
            path: k,
            size: repo.get(k).content.length,
            sha: repo.get(k).sha,
          }))
        );
      }
      return json({ message: "Not Found" }, 404);
    }

    if (/\/git\/ref\/heads\//.test(pfad)) return json({ object: { sha: "commit0" } });
    if (/\/git\/commits\/commit0$/.test(pfad)) return json({ tree: { sha: "tree0" } });

    if (/\/git\/blobs$/.test(pfad) && method === "POST") {
      const sha = `blob${++zaehler}`;
      blobs.set(sha, body.encoding === "base64" ? atob(body.content) : body.content);
      return json({ sha });
    }

    if (/\/git\/trees$/.test(pfad) && method === "POST") {
      for (const eintrag of body.tree) {
        if (eintrag.sha === null) {
          repo.delete(eintrag.path);
          continue;
        }
        assert.ok(blobs.has(eintrag.sha), `unbekannter Blob ${eintrag.sha}`);
        repo.set(eintrag.path, { sha: eintrag.sha, content: blobs.get(eintrag.sha) });
      }
      return json({ sha: `tree${++zaehler}` });
    }

    if (/\/git\/commits$/.test(pfad) && method === "POST") return json({ sha: `commit${++zaehler}` });
    if (/\/git\/refs\/heads\//.test(pfad) && method === "PATCH") return json({});

    throw new Error(`Nicht nachgebaut: ${method} ${pfad}`);
  };

  return {
    fetchImpl,
    aufrufe,
    dateien: () => [...repo.keys()].sort(),
    inhalt: (pfad) => repo.get(pfad)?.content ?? null,
    titel: () => JSON.parse(repo.get("kataloge/titel.json").content),
    /** Die Liste, die beim Deploy aus dem Bestand entstünde. */
    manifest: () => {
      const namen = [...repo.keys()].filter((k) => k.startsWith("kataloge/")).map((k) => k.slice("kataloge/".length));
      const titel = repo.has("kataloge/titel.json") ? JSON.parse(repo.get("kataloge/titel.json").content) : {};
      return manifestVon(baueKataloge(namen, titel));
    },
  };
}

/* ---------- Umgebung ---------- */

const db = openDatabase(":memory:");
db.exec(readFileSync(join(root, "schema.sql"), "utf8"));

const env = {
  DB: db,
  GITHUB_REPO: "test/repo",
  GITHUB_BRANCH: "main",
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

after(() => db.close());

const echtesFetch = globalThis.fetch;
after(() => {
  globalThis.fetch = echtesFetch;
});

let hub;

beforeEach(() => {
  hub = fakeGitHub({
    "content/site.json": "{}",
    "kataloge/sommer.pdf": "%PDF-1.4 sommer",
    "kataloge/winter.pdf": "%PDF-1.4 winter",
    "kataloge/titel.json": JSON.stringify({ sommer: "Sommer-Shopping" }, null, 2) + "\n",
  });
  globalThis.fetch = hub.fetchImpl;
});

/** Anfrage im Namen eines angemeldeten Admins. */
function anfrage(method, pfad, { json: koerper, body } = {}) {
  const headers = { Cookie: `soy_session=${TOKEN}` };
  if (method !== "GET") headers.Origin = ORIGIN;
  if (koerper !== undefined) headers["Content-Type"] = "application/json";
  return app.fetch(
    new Request(`${ORIGIN}${pfad}`, {
      method,
      headers,
      body: koerper !== undefined ? JSON.stringify(koerper) : body,
    }),
    env
  );
}

const pdfFormular = (name, inhalt, titel) => {
  const form = new FormData();
  form.append("file", new File([`%PDF-1.4 ${inhalt}`], name, { type: "application/pdf" }));
  form.append("filename", name);
  if (titel !== undefined) form.append("title", titel);
  return form;
};

/* ---------- Lesen ---------- */

test("Liste zeigt Anzeigename, Kennung und Reihenfolge wie die spätere Seite", async () => {
  const res = await anfrage("GET", "/api/kataloge");
  assert.equal(res.status, 200);
  const data = await res.json();

  assert.deepEqual(
    data.files.map((f) => [f.name, f.title, f.id, f.hidden]),
    [
      ["sommer.pdf", "Sommer-Shopping", "sommer", false],
      ["winter.pdf", "Winter", "winter", false],
    ]
  );
  // Nur der abweichende Name steht in titel.json – der abgeleitete nicht.
  assert.equal(data.files[0].customTitle, "Sommer-Shopping");
  assert.equal(data.files[1].customTitle, "");
  assert.equal(data.files[1].autoTitle, "Winter");
});

/* ---------- Hochladen ---------- */

test("Hochladen legt den Anzeigenamen so ab, dass der Build ihn findet", async () => {
  const res = await anfrage("POST", "/api/kataloge", { body: pdfFormular("herbst.pdf", "herbst", "Herbst-Shopping") });
  assert.equal(res.status, 200);

  assert.equal(hub.inhalt("kataloge/herbst.pdf"), "%PDF-1.4 herbst");
  // Schluessel ohne .pdf – genau so liest ihn scripts/build-katalog-manifest.mjs.
  assert.deepEqual(hub.titel(), { sommer: "Sommer-Shopping", herbst: "Herbst-Shopping" });
  assert.ok(hub.manifest().kataloge.some((k) => k.titel === "Herbst-Shopping"));
});

test("Hochladen ohne Anzeigenamen fasst titel.json nicht an", async () => {
  const vorher = hub.inhalt("kataloge/titel.json");
  const res = await anfrage("POST", "/api/kataloge", { body: pdfFormular("herbst.pdf", "herbst") });
  assert.equal(res.status, 200);
  assert.equal(hub.inhalt("kataloge/titel.json"), vorher);
});

test("Andere Dateitypen kommen nicht in den Katalogordner", async () => {
  const form = new FormData();
  form.append("file", new File(["<html>"], "seite.html", { type: "text/html" }));
  form.append("filename", "seite.html");
  const res = await anfrage("POST", "/api/kataloge", { body: form });
  assert.equal(res.status, 400);
  assert.deepEqual(hub.dateien().filter((d) => d.endsWith(".html")), []);
});

/* ---------- Umbenennen ---------- */

test("Anzeigename ändern schreibt nur titel.json", async () => {
  const res = await anfrage("PATCH", "/api/kataloge/winter.pdf", { json: { title: "Winter-Zauber" } });
  assert.equal(res.status, 200);

  assert.deepEqual(hub.titel(), { sommer: "Sommer-Shopping", winter: "Winter-Zauber" });
  assert.deepEqual(hub.manifest().kataloge, [
    { id: "sommer", titel: "Sommer-Shopping", datei: "kataloge/sommer.pdf" },
    { id: "winter", titel: "Winter-Zauber", datei: "kataloge/winter.pdf" },
  ]);
});

test("Leerer Anzeigename fällt auf den Namen aus der Datei zurück", async () => {
  const res = await anfrage("PATCH", "/api/kataloge/sommer.pdf", { json: { title: "" } });
  assert.equal(res.status, 200);
  assert.deepEqual(hub.titel(), {});
  assert.equal(hub.manifest().kataloge[0].titel, "Sommer");
});

test("Datei umbenennen verschiebt PDF und Eintrag in einem Zug", async () => {
  const res = await anfrage("PATCH", "/api/kataloge/sommer.pdf", { json: { filename: "sommer-2026.pdf" } });
  assert.equal(res.status, 200);

  assert.deepEqual(hub.dateien(), [
    "content/site.json",
    "kataloge/sommer-2026.pdf",
    "kataloge/titel.json",
    "kataloge/winter.pdf",
  ]);
  // Inhalt unveraendert – und nur ein einziger neuer Blob (titel.json):
  // die PDF wandert im Baum weiter, statt erneut hochgeladen zu werden.
  assert.equal(hub.inhalt("kataloge/sommer-2026.pdf"), "%PDF-1.4 sommer");
  assert.equal(hub.aufrufe.filter((a) => a.endsWith("/git/blobs")).length, 1);
  assert.deepEqual(hub.titel(), { "sommer-2026": "Sommer-Shopping" });
  assert.equal(hub.manifest().kataloge[0].id, "sommer-2026");
});

test("Umbenennen auf einen belegten Dateinamen wird abgelehnt", async () => {
  const res = await anfrage("PATCH", "/api/kataloge/sommer.pdf", { json: { filename: "winter.pdf" } });
  assert.equal(res.status, 409);
  assert.equal(hub.inhalt("kataloge/sommer.pdf"), "%PDF-1.4 sommer");
  assert.equal(hub.inhalt("kataloge/winter.pdf"), "%PDF-1.4 winter");
});

test("Umbenennen kann den Katalogordner nicht verlassen", async () => {
  const res = await anfrage("PATCH", "/api/kataloge/sommer.pdf", {
    json: { filename: "../../.github/workflows/deploy-pages.yml" },
  });
  assert.equal(res.status, 400);
  assert.equal(hub.inhalt("kataloge/sommer.pdf"), "%PDF-1.4 sommer");
});

test("Unbekannter Katalog liefert 404 statt eines leeren Commits", async () => {
  const res = await anfrage("PATCH", "/api/kataloge/gibtsnicht.pdf", { json: { title: "Egal" } });
  assert.equal(res.status, 404);
});

/* ---------- Aus- und einblenden ---------- */

test("Ausgeblendete Kataloge verschwinden aus der Liste, die Datei bleibt", async () => {
  assert.equal((await anfrage("PATCH", "/api/kataloge/winter.pdf", { json: { hidden: true } })).status, 200);

  assert.equal(hub.inhalt("kataloge/winter.pdf"), "%PDF-1.4 winter");
  assert.deepEqual(hub.manifest().kataloge.map((k) => k.id), ["sommer"]);

  assert.equal((await anfrage("PATCH", "/api/kataloge/winter.pdf", { json: { hidden: false } })).status, 200);
  assert.deepEqual(hub.manifest().kataloge.map((k) => k.id), ["sommer", "winter"]);
});

/* ---------- Reihenfolge ---------- */

test("Reihenfolge aus dem Admin ist die Reihenfolge auf der Seite", async () => {
  const res = await anfrage("PUT", "/api/kataloge/reihenfolge", { json: { names: ["winter.pdf", "sommer.pdf"] } });
  assert.equal(res.status, 200);

  assert.deepEqual(hub.manifest().kataloge.map((k) => k.id), ["winter", "sommer"]);
  // Die Kennungen bleiben stabil, damit geteilte Links weiter stimmen.
  assert.equal(hub.manifest().kataloge[0].datei, "kataloge/winter.pdf");
});

test("Reihenfolge mit unbekanntem Katalog wird abgelehnt", async () => {
  const res = await anfrage("PUT", "/api/kataloge/reihenfolge", { json: { names: ["winter.pdf", "weg.pdf"] } });
  assert.equal(res.status, 409);
});

/* ---------- Löschen ---------- */

test("Löschen entfernt PDF und Eintrag gemeinsam", async () => {
  const res = await anfrage("DELETE", "/api/kataloge/sommer.pdf");
  assert.equal(res.status, 200);

  assert.deepEqual(hub.dateien(), ["content/site.json", "kataloge/titel.json", "kataloge/winter.pdf"]);
  assert.deepEqual(hub.titel(), {});
  assert.deepEqual(hub.manifest().kataloge.map((k) => k.id), ["winter"]);
});

test("Löschen eines unbekannten Katalogs ändert nichts", async () => {
  const res = await anfrage("DELETE", "/api/kataloge/weg.pdf");
  assert.equal(res.status, 404);
  assert.deepEqual(hub.dateien().length, 4);
});

/* ---------- Zugriff ---------- */

test("Ohne Anmeldung geht nichts", async () => {
  const res = await app.fetch(new Request(`${ORIGIN}/api/kataloge`), env);
  assert.equal(res.status, 401);
});

test("Schreibende Zugriffe von fremder Herkunft werden abgewiesen", async () => {
  const res = await app.fetch(
    new Request(`${ORIGIN}/api/kataloge/sommer.pdf`, {
      method: "DELETE",
      headers: { Cookie: `soy_session=${TOKEN}`, Origin: "https://boese.test" },
    }),
    env
  );
  assert.equal(res.status, 403);
  assert.equal(hub.inhalt("kataloge/sommer.pdf"), "%PDF-1.4 sommer");
});
