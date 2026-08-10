#!/usr/bin/env node
/* ============================================================
   Legt das erste Admin-Konto an.
   ------------------------------------------------------------
   Laeuft genau einmal — danach lehnt das Backend weitere
   Einrichtungen ab. Aufruf:  npm run setup
   ============================================================ */

import { createInterface } from "node:readline/promises";
import { stdin, stdout, argv, exit } from "node:process";
import { Writable } from "node:stream";

/* Ohne Terminal (Eingabe per Pipe) kann readline nicht Frage fuer Frage
   lesen: der Datenstrom endet, bevor alle Fragen gestellt sind. Dann lesen
   wir alles auf einmal und beantworten die Fragen daraus der Reihe nach. */
const interactive = Boolean(stdin.isTTY);

let piped = null;
if (!interactive) {
  const chunks = [];
  for await (const chunk of stdin) chunks.push(chunk);
  piped = Buffer.concat(chunks).toString("utf8").split(/\r?\n/);
}
let pipedIndex = 0;

/* Ausgabe, die sich stummschalten laesst. Nur so bleibt eine Eingabe
   wirklich unsichtbar: readline echot im Terminal jedes Zeichen selbst,
   ein blosser Raw-Modus reicht dagegen nicht. */
const output = new Writable({
  write(chunk, encoding, callback) {
    if (!output.muted) stdout.write(chunk, encoding);
    callback();
  },
});
output.muted = false;

const rl = interactive ? createInterface({ input: stdin, output, terminal: true }) : null;

/** Sichtbare Frage. */
async function ask(question) {
  if (!interactive) return piped[pipedIndex++] ?? "";
  return rl.question(question);
}

/** Eingabe ohne Bildschirmausgabe (fuer Passwoerter und Schluessel). */
async function secret(question) {
  if (!interactive) return piped[pipedIndex++] ?? "";

  // Frage selbst schreiben, dann stummschalten – so ist der Zeitpunkt
  // eindeutig und die Frage bleibt trotzdem lesbar.
  stdout.write(question);
  output.muted = true;
  try {
    return await rl.question("");
  } finally {
    output.muted = false;
    // Das Enter wurde mitgeschluckt.
    stdout.write("\n");
  }
}

const baseUrl = (
  argv[2] ||
  (await ask(
    "Adresse des Backends\n" +
      "  Homelab:    http://admin.shineonyou.de:8080  (der Port gehört dazu!)\n" +
      "  Cloudflare: https://soy-admin.deinname.workers.dev\n" +
      "> "
  ))
)
  .trim()
  .replace(/\/+$/, "");

let parsed;
try {
  parsed = new URL(baseUrl);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error();
} catch {
  console.error(
    "✗ Das ist keine gültige Adresse.\n" +
      "  Sie muss mit http:// oder https:// beginnen, z. B.:\n" +
      "    http://admin.shineonyou.de:8080\n" +
      "    http://192.168.178.13:8080\n" +
      "    https://soy-admin.deinname.workers.dev"
  );
  exit(1);
}

/* Erst pruefen, ob ueberhaupt noch eingerichtet werden darf. */
const status = await fetch(`${baseUrl}/api/setup/status`)
  .then((r) => r.json())
  .catch(() => null);

if (!status) {
  console.error(`✗ ${baseUrl} ist nicht erreichbar.`);
  // Haeufigster Grund im Heimnetz: der Port fehlt. Der Container lauscht
  // auf 8080, ohne Angabe landet der Aufruf auf 80 bzw. 443.
  if (!parsed.port) {
    const withPort = `${parsed.protocol}//${parsed.hostname}:8080`;
    console.error(
      `\n  Es ist kein Port angegeben – der Aufruf ging damit an Port ` +
        `${parsed.protocol === "https:" ? "443" : "80"}.\n` +
        `  Der Container lauscht auf 8080. Versuch es mit:\n    ${withPort}`
    );
  } else {
    console.error(
      "\n  Läuft der Container? Auf dem Docker-Host prüfen mit:\n" +
        "    docker ps --filter name=s-lx04-soy-admin\n" +
        "    docker logs s-lx04-soy-admin"
    );
  }
  exit(1);
}
if (!status.needsSetup) {
  console.error("✗ Es gibt bereits ein Konto. Die Ersteinrichtung ist damit abgeschlossen.");
  console.error('  Zur Sicherheit jetzt SETUP_ENABLED auf "false" setzen und neu starten.');
  exit(1);
}
if (!status.setupEnabled) {
  console.error(
    '✗ SETUP_ENABLED steht auf "false". Zum Einrichten kurz auf "true" setzen\n' +
      "  (Portainer: Stack → Environment variables) und den Stack neu starten."
  );
  exit(1);
}

console.log("\nErstes Admin-Konto anlegen\n");

const name = (await ask("Anzeigename: ")).trim();
const email = (await ask("E-Mail: ")).trim();
const password = await secret("Passwort (min. 12 Zeichen, Groß/Klein + Ziffer): ");
const repeat = await secret("Passwort wiederholen: ");

if (password !== repeat) {
  console.error("\n✗ Die Passwörter stimmen nicht überein.");
  exit(1);
}

console.log(
  "\nDer SETUP_TOKEN ist ein selbst gewählter Wert – kein generierter Schlüssel,\n" +
    "den man irgendwo abholt. Er muss genau so im Container hinterlegt sein:\n" +
    "  Homelab:    Portainer → Stack → Environment variables → SETUP_TOKEN\n" +
    "  Cloudflare: wrangler secret put SETUP_TOKEN\n" +
    "Noch keinen? Dann einen erzeugen mit:  openssl rand -base64 32\n"
);
const setupToken = await secret("SETUP_TOKEN: ");
rl?.close();

const res = await fetch(`${baseUrl}/api/setup`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Origin: baseUrl },
  body: JSON.stringify({ setupToken, email, password, name }),
});

const data = await res.json().catch(() => ({}));
if (!res.ok) {
  console.error(`\n✗ ${data.error || `Fehler ${res.status}`}`);
  // Der CSRF-Schutz vergleicht den Origin-Header mit ADMIN_ORIGIN. Weicht die
  // hier eingegebene Adresse davon ab, scheitert jeder Schreibzugriff.
  if (res.status === 403 && /Herkunft/i.test(data.error || "")) {
    console.error(
      `\n  ADMIN_ORIGIN im Container muss exakt dieser Adresse entsprechen:\n` +
        `    ADMIN_ORIGIN=${baseUrl}\n` +
        "  Nach dem Ändern den Stack neu starten. Das gilt auch für den Browser:\n" +
        "  das Admin nur unter genau dieser Adresse aufrufen."
    );
  }
  exit(1);
}

console.log(`
✓ Konto angelegt.

Nächste Schritte:
  1. ${baseUrl} im Browser öffnen und anmelden.
  2. Beim ersten Login wird die Zwei-Faktor-App eingerichtet — die
     Wiederherstellungscodes danach sicher aufbewahren.
  3. SETUP_ENABLED wieder auf "false" setzen (Homelab: Stack-Variable in
     Portainer, dann neu starten; Cloudflare: wrangler.toml + npm run deploy),
     damit niemand sonst ein Konto anlegen kann.
`);
