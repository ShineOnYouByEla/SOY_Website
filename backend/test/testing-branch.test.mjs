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

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const ORIGIN = "http://admin.test";
const TOKEN = "test-token";

const inhalte = JSON.parse(readFileSync(join(root, "..", "content", "site.json"), "utf8"));

/* ---------- Nachbau des GitHub-Teils, diesmal mit mehreren Branches ---------- */

/**
 * Wie in kataloge-api.test.mjs, aber jeder Branch hat seinen eigenen Stand:
 * Nur so faellt auf, wenn ein Commit auf dem falschen landet. Nachgebaut sind
 * Referenzen, Blobs, Bäume, Commits und die Merge-API.
 */
function fakeGitHub(startDateien, { mergeKonflikt = false } = {}) {
  let zaehler = 0;
  const blobs = new Map(); // sha -> Inhalt
  const baeume = new Map(); // sha -> Map(pfad -> blobSha)
  const commits = new Map(); // sha -> baumSha
  const branches = new Map(); // name -> commitSha

  const blobKennungen = new Map();
  const neuerBlob = (inhalt) => {
    if (blobKennungen.has(inhalt)) return blobKennungen.get(inhalt);
    const sha = `blob${++zaehler}`;
    blobs.set(sha, inhalt);
    blobKennungen.set(inhalt, sha);
    return sha;
  };
  /* Wie bei Git haengt die Kennung am Inhalt: derselbe Bestand ergibt
     denselben Baum. Nur so faellt auf, wenn das Backend einen leeren Commit
     anlegt. */
  const baumKennungen = new Map();
  const neuerBaum = (eintraege) => {
    const liste = [...eintraege].sort(([a], [b]) => (a < b ? -1 : 1));
    const kennung = JSON.stringify(liste);
    if (baumKennungen.has(kennung)) return baumKennungen.get(kennung);
    const sha = `tree${++zaehler}`;
    baeume.set(sha, new Map(liste));
    baumKennungen.set(kennung, sha);
    return sha;
  };
  const neuerCommit = (baumSha) => {
    const sha = `commit${++zaehler}`;
    commits.set(sha, baumSha);
    return sha;
  };

  const baumVon = (branch) => baeume.get(commits.get(branches.get(branch)));
  branches.set("main", neuerCommit(neuerBaum(Object.entries(startDateien).map(([p, i]) => [p, neuerBlob(i)]))));

  const json = (data, status = 200) =>
    new Response(data === null ? null : JSON.stringify(data), {
      status: data === null ? 204 : status,
      headers: { "Content-Type": "application/json" },
    });

  const fetchImpl = async (url, init = {}) => {
    const u = new URL(typeof url === "string" ? url : url.url);
    const pfad = decodeURIComponent(u.pathname);
    const method = init.method || "GET";
    const body = init.body ? JSON.parse(init.body) : null;

    /* --- Referenzen --- */
    const ref = pfad.match(/\/git\/refs?\/heads\/(.+)$/);
    if (ref && method === "GET") {
      const branch = ref[1];
      return branches.has(branch)
        ? json({ object: { sha: branches.get(branch) } })
        : json({ message: "Branch not found" }, 404);
    }
    if (ref && method === "PATCH") {
      branches.set(ref[1], body.sha);
      return json({});
    }
    if (/\/git\/refs$/.test(pfad) && method === "POST") {
      branches.set(body.ref.replace("refs/heads/", ""), body.sha);
      return json({});
    }

    /* --- Inhalt eines Branches --- */
    const contents = pfad.match(/^\/repos\/[^/]+\/[^/]+\/contents\/(.*)$/);
    if (contents && method === "GET") {
      const baum = baumVon(u.searchParams.get("ref") || "main");
      const blobSha = baum?.get(contents[1]);
      if (!blobSha) return json({ message: "Not Found" }, 404);
      const inhalt = blobs.get(blobSha);
      // Wie GitHub: base64 der UTF-8-Bytes — die Inhalte enthalten Umlaute.
      return json({
        type: "file",
        sha: blobSha,
        size: inhalt.length,
        content: Buffer.from(inhalt, "utf8").toString("base64"),
      });
    }

    /* --- Commit bauen --- */
    const commitLesen = pfad.match(/\/git\/commits\/(commit\d+)$/);
    if (commitLesen && method === "GET") return json({ tree: { sha: commits.get(commitLesen[1]) } });

    if (/\/git\/blobs$/.test(pfad) && method === "POST") {
      return json({ sha: neuerBlob(body.encoding === "base64" ? atob(body.content) : body.content) });
    }

    if (/\/git\/trees$/.test(pfad) && method === "POST") {
      const eintraege = new Map(baeume.get(body.base_tree));
      for (const e of body.tree) {
        if (e.sha === null) eintraege.delete(e.path);
        else eintraege.set(e.path, e.sha);
      }
      return json({ sha: neuerBaum(eintraege) });
    }

    if (/\/git\/commits$/.test(pfad) && method === "POST") return json({ sha: neuerCommit(body.tree) });

    /* --- Merge (Testseite nachziehen) --- */
    if (/\/merges$/.test(pfad) && method === "POST") {
      if (mergeKonflikt) return json({ message: "Merge conflict" }, 409);
      const basis = baumVon(body.base);
      const quelle = baumVon(body.head);
      if (commits.get(branches.get(body.base)) === commits.get(branches.get(body.head))) return json(null);
      const gemischt = new Map([...basis, ...quelle]);
      const sha = neuerCommit(neuerBaum(gemischt));
      branches.set(body.base, sha);
      return json({ sha });
    }

    throw new Error(`Nicht nachgebaut: ${method} ${pfad}`);
  };

  return {
    fetchImpl,
    branches: () => [...branches.keys()].sort(),
    head: (branch) => branches.get(branch) || null,
    dateien: (branch) => [...(baumVon(branch)?.keys() || [])].sort(),
    inhalt: (branch, pfad) => {
      const sha = baumVon(branch)?.get(pfad);
      return sha ? blobs.get(sha) : null;
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
