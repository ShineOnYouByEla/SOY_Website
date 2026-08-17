#!/usr/bin/env node
/* ============================================================
   Einstieg für den Betrieb unter Node (Docker im Homelab)
   ------------------------------------------------------------
   Baut aus Umgebungsvariablen und einer SQLite-Datei dieselbe
   Umgebung, die der Cloudflare Worker über seine Bindings
   bekommt — die Anwendung in app.js merkt keinen Unterschied.
   ============================================================ */

import { readFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { serve } from "@hono/node-server";

import app, { cleanup } from "./app.js";
import { createAssets } from "./assets-fs.js";
import { openDatabase } from "./db-sqlite.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

/* ---------- Konfiguration ---------- */

const config = {
  // Ausserhalb von Docker 8080, weil ein normaler Nutzer Port 80 nicht
  // belegen darf. Im Container setzt das Image PORT=80 – dort bringt die
  // node-Binary die noetige Berechtigung mit.
  port: Number(process.env.PORT || 8080),
  host: process.env.HOST || "0.0.0.0",
  databasePath: process.env.DATABASE_PATH || join(root, "data", "soy-admin.db"),

  GITHUB_REPO: process.env.GITHUB_REPO || "ShineOnYouByEla/SOY_Website",
  GITHUB_BRANCH: process.env.GITHUB_BRANCH || "main",
  // Branch der Testseite: dorthin geht jedes „Speichern", damit sich der
  // Stand im Heimnetz anschauen laesst, bevor er live geht.
  GITHUB_TESTING_BRANCH: process.env.GITHUB_TESTING_BRANCH || "Testing",
  GITHUB_TOKEN: process.env.GITHUB_TOKEN || "",
  SITE_URL: process.env.SITE_URL || "https://shineonyou.de",
  // Adresse der Testseite im Heimnetz — nur fuer den Link im Admin.
  TESTING_URL: process.env.TESTING_URL || "",
  ADMIN_ORIGIN: process.env.ADMIN_ORIGIN || "",
  PBKDF2_ITERATIONS: process.env.PBKDF2_ITERATIONS || "600000",
  SETUP_ENABLED: process.env.SETUP_ENABLED || "false",
  SETUP_TOKEN: process.env.SETUP_TOKEN || "",
  MFA_ISSUER: process.env.MFA_ISSUER || "Shine On You",
  // Im eigenen Netz ohne TLS muss das Secure-Flag am Cookie weg.
  COOKIE_SECURE: process.env.COOKIE_SECURE || "true",
};

/* ADMIN_ORIGIN darf mehrere Adressen enthalten, durch Komma getrennt —
   im Heimnetz ist dasselbe Backend oft per IP und per DNS-Name erreichbar. */
const origins = config.ADMIN_ORIGIN.split(",")
  .map((o) => o.trim().replace(/\/+$/, ""))
  .filter(Boolean);

if (!origins.length) {
  console.error(
    "✗ ADMIN_ORIGIN ist nicht gesetzt. Bitte auf die Adresse(n) setzen, unter\n" +
      "  denen das Admin aufgerufen wird — mit Schema und Port, mehrere durch\n" +
      "  Komma getrennt, z. B.:\n" +
      "    ADMIN_ORIGIN=http://admin.shineonyou.de,http://192.168.178.13\n" +
      "  Sonst lehnt der CSRF-Schutz jeden Schreibzugriff ab."
  );
  process.exit(1);
}

for (const origin of origins) {
  try {
    const u = new URL(origin);
    if (u.origin !== origin) throw new Error();
  } catch {
    console.error(
      `✗ „${origin}" ist keine gültige Herkunft. Erwartet wird Schema, Host und\n` +
        "  ggf. Port, aber ohne Pfad, z. B. http://admin.shineonyou.de"
    );
    process.exit(1);
  }
}

const insecure = origins.filter((o) => o.startsWith("http://"));
if (config.COOKIE_SECURE !== "false" && insecure.length) {
  console.error(
    `✗ ADMIN_ORIGIN enthält http-Adressen (${insecure.join(", ")}), COOKIE_SECURE\n` +
      "  steht aber auf true. Der Browser würde den Sitzungs-Cookie nie\n" +
      "  zurücksenden. Entweder COOKIE_SECURE=false setzen (nur im\n" +
      "  vertrauenswürdigen Netz!) oder TLS über einen Reverse Proxy davorschalten."
  );
  process.exit(1);
}

// Normalisiert weiterreichen, damit die App nicht erneut trimmen muss.
config.ADMIN_ORIGIN = origins.join(",");

/* ---------- Datenbank ---------- */

await mkdir(dirname(config.databasePath), { recursive: true });
const db = openDatabase(config.databasePath);

// Das Schema ist zwischen D1 und SQLite identisch und wird bei jedem Start
// angewandt (alle Anweisungen sind IF NOT EXISTS).
db.exec(readFileSync(join(root, "schema.sql"), "utf8"));

/* ---------- Umgebung wie bei Cloudflare ---------- */

const env = {
  ...config,
  DB: db,
  ASSETS: createAssets(join(root, "public")),
};

/* ---------- Aufräumen ---------- */

const CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000;
const cleanupTimer = setInterval(() => {
  cleanup(env, Date.now()).catch((err) => console.error("Aufräumen fehlgeschlagen:", err.message));
}, CLEANUP_INTERVAL_MS);
cleanupTimer.unref();
await cleanup(env, Date.now()).catch(() => {});

/* ---------- Server ---------- */

const server = serve({ fetch: (request) => app.fetch(request, env), port: config.port, hostname: config.host }, (info) => {
  console.log(`Shine On You Admin läuft auf http://${config.host}:${info.port}`);
  console.log(`  Datenbank:     ${config.databasePath}`);
  console.log(`  Repository:    ${config.GITHUB_REPO} (${config.GITHUB_BRANCH})`);
  console.log(
    `  Testseite:     ${
      config.GITHUB_TESTING_BRANCH && config.GITHUB_TESTING_BRANCH !== config.GITHUB_BRANCH
        ? `Branch ${config.GITHUB_TESTING_BRANCH}${config.TESTING_URL ? ` · ${config.TESTING_URL}` : ""}`
        : "keine (Speichern bleibt im Entwurf)"
    }`
  );
  console.log(`  Admin-Adresse: ${config.ADMIN_ORIGIN}`);
  if (config.COOKIE_SECURE === "false") {
    console.log("  Hinweis: Cookie ohne Secure-Flag – nur im eigenen Netz betreiben.");
  }
  if (!config.GITHUB_TOKEN) {
    console.log("  Achtung: GITHUB_TOKEN fehlt – Veröffentlichen ist nicht möglich.");
  }
  if (config.SETUP_ENABLED === "true") {
    console.log("  Achtung: Ersteinrichtung ist offen. Nach dem ersten Konto abschalten.");
  }
});

/* Sauber beenden, damit Docker nicht 10 Sekunden auf SIGKILL wartet. */
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    console.log(`\n${signal} empfangen, fahre herunter …`);
    server.close(() => {
      db.close();
      process.exit(0);
    });
  });
}
