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
  port: Number(process.env.PORT || 8080),
  host: process.env.HOST || "0.0.0.0",
  databasePath: process.env.DATABASE_PATH || join(root, "data", "soy-admin.db"),

  GITHUB_REPO: process.env.GITHUB_REPO || "ShineOnYouByEla/SOY_Website",
  GITHUB_BRANCH: process.env.GITHUB_BRANCH || "main",
  GITHUB_TOKEN: process.env.GITHUB_TOKEN || "",
  SITE_URL: process.env.SITE_URL || "https://shineonyou.de",
  ADMIN_ORIGIN: process.env.ADMIN_ORIGIN || "",
  PBKDF2_ITERATIONS: process.env.PBKDF2_ITERATIONS || "600000",
  SETUP_ENABLED: process.env.SETUP_ENABLED || "false",
  SETUP_TOKEN: process.env.SETUP_TOKEN || "",
  MFA_ISSUER: process.env.MFA_ISSUER || "Shine On You",
  // Im eigenen Netz ohne TLS muss das Secure-Flag am Cookie weg.
  COOKIE_SECURE: process.env.COOKIE_SECURE || "true",
};

if (!config.ADMIN_ORIGIN) {
  console.error(
    "✗ ADMIN_ORIGIN ist nicht gesetzt. Bitte auf die Adresse setzen, unter der\n" +
      "  das Admin aufgerufen wird, z. B. http://192.168.178.13:8080 — sonst\n" +
      "  lehnt der CSRF-Schutz jeden Schreibzugriff ab."
  );
  process.exit(1);
}
if (config.COOKIE_SECURE !== "false" && config.ADMIN_ORIGIN.startsWith("http://")) {
  console.error(
    "✗ ADMIN_ORIGIN ist eine http-Adresse, COOKIE_SECURE steht aber auf true.\n" +
      "  Der Browser würde den Sitzungs-Cookie nie zurücksenden. Entweder\n" +
      "  COOKIE_SECURE=false setzen (nur im vertrauenswürdigen Netz!) oder TLS\n" +
      "  über einen Reverse Proxy davorschalten."
  );
  process.exit(1);
}

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
