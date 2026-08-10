# Website-Admin (Backend)

Ein kleines Backend, mit dem sich die Inhalte von [shineonyou.de](https://shineonyou.de)
im Browser bearbeiten lassen – mit Anmeldung, Zwei-Faktor-Bestätigung und
Live-Vorschau. Läuft als Cloudflare Worker.

## Wie es funktioniert

```
Admin (Browser)  ──►  Cloudflare Worker  ──►  GitHub-Repository  ──►  GitHub Pages
     Login + MFA          Entwurf in D1          ein Commit             Live-Seite
```

Beim Bearbeiten landet alles zunächst als **Entwurf** in der Datenbank – die
Live-Seite bleibt unberührt. Erst „Veröffentlichen" schreibt `content/site.json`
(und neu hochgeladene Bilder) in **einem Commit** ins Repository. Der bestehende
Pages-Workflow baut daraus `index.html` und stellt sie online; das dauert etwa
eine Minute.

Daraus ergeben sich zwei angenehme Eigenschaften:

- **Die Website hängt nicht vom Backend ab.** Sie bleibt rein statisch. Ist das
  Backend aus oder kaputt, läuft die Seite trotzdem weiter.
- **Jede Änderung steht in der Git-Historie** und lässt sich zurückrollen.

## Sicherheit

| Bereich | Umsetzung |
|---|---|
| Passwörter | PBKDF2-HMAC-SHA256, 600 000 Runden, eigenes Salt je Konto |
| Zweiter Faktor | TOTP nach RFC 6238 (jede Authenticator-App), **Pflicht** |
| Wiedereinspielen | Ein TOTP-Code funktioniert nur ein einziges Mal |
| Notfallzugang | 10 Wiederherstellungscodes, einzeln verwendbar, nur gehasht gespeichert |
| Sitzungen | Serverseitig in D1, jederzeit widerrufbar; Cookie `HttpOnly` + `Secure` + `SameSite=Strict` |
| Passwort-Raten | Sperre nach 8 Fehlversuchen je E-Mail **und** je IP, 15 Minuten |
| CSRF | `SameSite=Strict` plus Prüfung des `Origin`-Headers bei jedem Schreibzugriff |
| Schreibrechte | Nur `content/site.json`, `assets/img/` und `kataloge/` – Workflows und Skripte sind unerreichbar |
| Protokoll | Anmeldungen, Fehlversuche und Veröffentlichungen landen im Audit-Log |

> **Zum CPU-Limit:** 600 000 PBKDF2-Runden brauchen den **Workers-Paid-Plan**
> (5 $/Monat, 30 s CPU pro Anfrage). Der Free-Plan erlaubt nur 10 ms CPU – dort
> schlägt der Login fehl. Wer beim Free-Plan bleiben will, setzt
> `PBKDF2_ITERATIONS` deutlich niedriger (z. B. `50000`) und nimmt in Kauf, dass
> ein gestohlener Datenbankabzug leichter angreifbar wäre. Der zweite Faktor
> schützt in diesem Fall weiterhin die Anmeldung selbst.

## Einrichtung

Vorausgesetzt: ein Cloudflare-Konto und Node 22.

### 1. Abhängigkeiten und Anmeldung

```bash
cd backend
npm install
npx wrangler login
```

### 2. Datenbank anlegen

```bash
npx wrangler d1 create soy-admin
```

Die ausgegebene `database_id` in `wrangler.toml` bei `HIER_DATABASE_ID_EINTRAGEN`
eintragen, dann die Tabellen erzeugen:

```bash
npm run db:init
```

### 3. Geheimnisse setzen

```bash
# Feingranularer GitHub-Token mit Zugriff NUR auf dieses Repository
# und der Berechtigung "Contents: Read and write".
npx wrangler secret put GITHUB_TOKEN

# Einmalschlüssel für die Ersteinrichtung – irgendeine lange Zufallszeichenkette.
npx wrangler secret put SETUP_TOKEN
```

Den GitHub-Token gibt es unter **Settings → Developer settings →
Personal access tokens → Fine-grained tokens**. Wichtig: nur dieses eine
Repository auswählen und als einzige Berechtigung **Contents: Read and write**
vergeben. Ein Ablaufdatum setzen und den Termin notieren – läuft der Token ab,
meldet der Admin beim Öffnen „GitHub-Zugriff nicht möglich".

### 4. Zum ersten Mal veröffentlichen

```bash
npm run deploy
```

Wrangler nennt danach die Adresse, z. B.
`https://soy-admin.deinname.workers.dev`. Diese Adresse in `wrangler.toml` bei
`ADMIN_ORIGIN` eintragen und **noch einmal** `npm run deploy` ausführen – sonst
lehnt der CSRF-Schutz alle Schreibzugriffe ab.

### 5. Erstes Konto anlegen

```bash
npm run setup
```

Das Skript fragt Name, E-Mail, Passwort und den `SETUP_TOKEN` ab.

### 6. Ersteinrichtung schließen

In `wrangler.toml` `SETUP_ENABLED = "false"` setzen und `npm run deploy`
ausführen. Danach kann niemand mehr ein Konto anlegen.

### 7. Anmelden

Die Worker-Adresse im Browser öffnen. Beim ersten Login wird die
Zwei-Faktor-App eingerichtet: QR-Code scannen, Code eingeben, die zehn
Wiederherstellungscodes ausdrucken oder in den Passwortmanager legen.

### Optional: eigene Adresse

Statt `*.workers.dev` lässt sich unter **Cloudflare → Workers → Custom Domains**
z. B. `admin.shineonyou.de` einrichten. Dann `ADMIN_ORIGIN` entsprechend ändern
und neu deployen.

## Bedienung

| Aufgabe | Weg |
|---|---|
| Texte ändern | Bereich links auswählen, Felder ausfüllen |
| Bereich aus-/einblenden | Auge-Symbol in der Seitenleiste |
| Reihenfolge ändern | Bereich am Griff `⠿` nach oben oder unten ziehen |
| Bild tauschen | Im Bildfeld auf „Bild wählen" – wird beim Hochladen automatisch verkleinert |
| Katalog-PDF verwalten | Seitenleiste unten unter „Dateien" |
| Änderungen sichern | „Speichern" (passiert auch automatisch) |
| Änderungen zurücknehmen | „Verwerfen" – setzt auf den veröffentlichten Stand zurück |
| Live schalten | „Veröffentlichen" |

Bei Texten sind `<strong>fett</strong>`, `<em>kursiv</em>`, `<br />` und
`<a href="datenschutz.html">Link</a>` erlaubt. Alles andere wird beim Rendern
unschädlich gemacht – auch dann, wenn der Zugang kompromittiert wäre.

**Kataloge sind die Ausnahme:** PDF-Uploads gehen sofort live, weil sie nicht
zum Seitenentwurf gehören.

## Entwicklung

```bash
npm test          # 37 Tests: TOTP, Passwort-Hashing, Inhaltsprüfung, Rendern
npm run dev       # lokal auf http://localhost:8787
```

Für den lokalen Betrieb:

```bash
npm run db:init:local
printf 'SETUP_TOKEN=lokal\nGITHUB_TOKEN=lokal\n' > .dev.vars   # nicht ins Repo
```

In `wrangler.toml` `ADMIN_ORIGIN` auf `http://localhost:8787` und
`PBKDF2_ITERATIONS` auf einen kleinen Wert setzen. Ohne echten `GITHUB_TOKEN`
funktioniert alles außer dem Veröffentlichen.

## Aufbau

```
backend/
├── wrangler.toml       Konfiguration und Variablen
├── schema.sql          Tabellen der D1-Datenbank
├── src/
│   ├── index.js        Routen, Sicherheits-Header, Publish-Ablauf
│   ├── auth.js         Sitzungen, Sperren, Protokoll
│   ├── crypto.js       Passwort-Hashing, Zufall, Vergleiche
│   ├── totp.js         Zweiter Faktor nach RFC 6238
│   ├── github.js       Commits über die Git-Data-API
│   └── content.js      Prüfung der Inhalte und Vorschau
├── public/             Admin-Oberfläche (kein Build-Schritt)
└── test/               Tests
```

Der Renderer liegt bewusst außerhalb unter `../shared/` – dieselbe Datei erzeugt
die Vorschau im Worker und `index.html` im Build.

## Wenn etwas klemmt

| Meldung | Ursache |
|---|---|
| „GitHub-Zugriff nicht möglich: Bad credentials" | `GITHUB_TOKEN` fehlt, ist falsch oder abgelaufen |
| „Anfrage von einer fremden Herkunft" | `ADMIN_ORIGIN` passt nicht zur aufgerufenen Adresse |
| „Exceeded CPU limit" beim Login | Free-Plan – `PBKDF2_ITERATIONS` senken oder auf Paid wechseln |
| „Das Repository wurde zwischenzeitlich geändert" | Jemand hat parallel committet: Seite neu laden, erneut veröffentlichen |
| Handy verloren | Mit einem Wiederherstellungscode anmelden, im Menü unter „Konto & Sicherheit" neu einrichten |
| Alle Zugänge verloren | `SETUP_ENABLED` kurz auf `true`, Benutzer per `wrangler d1 execute` löschen, `npm run setup` |
