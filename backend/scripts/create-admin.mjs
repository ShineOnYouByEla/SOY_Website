#!/usr/bin/env node
/* ============================================================
   Legt das erste Admin-Konto an.
   ------------------------------------------------------------
   Laeuft genau einmal — danach lehnt das Backend weitere
   Einrichtungen ab. Aufruf:  npm run setup
   ============================================================ */

import { createInterface } from "node:readline/promises";
import { stdin, stdout, argv, exit } from "node:process";

const rl = createInterface({ input: stdin, output: stdout });

/** Eingabe ohne Bildschirmausgabe (fuer Passwoerter und Schluessel). */
async function secret(question) {
  stdout.write(question);
  const wasRaw = stdin.isRaw;
  stdin.setRawMode?.(true);

  return new Promise((resolve) => {
    let value = "";
    const onData = (chunk) => {
      const ch = chunk.toString("utf8");
      if (ch === "\n" || ch === "\r" || ch === "") {
        stdin.setRawMode?.(wasRaw ?? false);
        stdin.removeListener("data", onData);
        stdout.write("\n");
        resolve(value);
      } else if (ch === "") {
        stdout.write("\n");
        exit(1);
      } else if (ch === "" || ch === "\b") {
        value = value.slice(0, -1);
      } else {
        value += ch;
      }
    };
    stdin.on("data", onData);
  });
}

const baseUrl = (argv[2] || (await rl.question("Adresse des Backends (z. B. https://soy-admin.deinname.workers.dev): ")))
  .trim()
  .replace(/\/+$/, "");

if (!/^https?:\/\//.test(baseUrl)) {
  console.error("✗ Bitte eine vollständige Adresse mit https:// angeben.");
  exit(1);
}

/* Erst pruefen, ob ueberhaupt noch eingerichtet werden darf. */
const status = await fetch(`${baseUrl}/api/setup/status`)
  .then((r) => r.json())
  .catch(() => null);

if (!status) {
  console.error(`✗ ${baseUrl} ist nicht erreichbar.`);
  exit(1);
}
if (!status.needsSetup) {
  console.error("✗ Es gibt bereits ein Konto. Die Ersteinrichtung ist damit abgeschlossen.");
  console.error("  Zur Sicherheit jetzt SETUP_ENABLED in wrangler.toml auf \"false\" setzen und neu deployen.");
  exit(1);
}
if (!status.setupEnabled) {
  console.error('✗ SETUP_ENABLED steht auf "false". Zum Einrichten kurz auf "true" setzen und deployen.');
  exit(1);
}

console.log("\nErstes Admin-Konto anlegen\n");

const name = (await rl.question("Anzeigename: ")).trim();
const email = (await rl.question("E-Mail: ")).trim();
const password = await secret("Passwort (min. 12 Zeichen, Groß/Klein + Ziffer): ");
const repeat = await secret("Passwort wiederholen: ");

if (password !== repeat) {
  console.error("\n✗ Die Passwörter stimmen nicht überein.");
  exit(1);
}

const setupToken = await secret("SETUP_TOKEN (der Wert aus `wrangler secret put SETUP_TOKEN`): ");
rl.close();

const res = await fetch(`${baseUrl}/api/setup`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Origin: baseUrl },
  body: JSON.stringify({ setupToken, email, password, name }),
});

const data = await res.json().catch(() => ({}));
if (!res.ok) {
  console.error(`\n✗ ${data.error || `Fehler ${res.status}`}`);
  exit(1);
}

console.log(`
✓ Konto angelegt.

Nächste Schritte:
  1. ${baseUrl} im Browser öffnen und anmelden.
  2. Beim ersten Login wird die Zwei-Faktor-App eingerichtet — die
     Wiederherstellungscodes danach sicher aufbewahren.
  3. In wrangler.toml SETUP_ENABLED auf "false" setzen und
     \`npm run deploy\` ausführen, damit niemand sonst einrichten kann.
`);
