# Website-Admin (Backend)

Ein kleines Backend, mit dem sich die Inhalte von [shineonyou.de](https://shineonyou.de)
im Browser bearbeiten lassen – mit Anmeldung, Zwei-Faktor-Bestätigung und
Live-Vorschau.

## Wie es funktioniert

```
Admin (Browser)  ──►  Backend  ──►  GitHub-Repository  ──►  GitHub Pages
     Login + MFA        Entwurf         ein Commit           Live-Seite
```

Das Backend läuft wahlweise **im Homelab als Docker-Container** (Standard) oder
**als Cloudflare Worker**. Der Anwendungscode ist derselbe; unterschiedlich sind
nur der Einstiegspunkt und die Datenbank:

| | Homelab (empfohlen) | Cloudflare |
|---|---|---|
| Einstieg | `src/node.js` | `src/worker.js` |
| Datenbank | SQLite-Datei im Volume | D1 |
| Erreichbarkeit | nur LAN/VPN | öffentlich |
| Passwort-Hashing | volle 600 000 Runden | Paid-Plan nötig, sonst weniger Runden |
| Kosten | keine | 5 $/Monat für den Paid-Plan |
| Voraussetzung | Docker-Host muss laufen | – |

Weil das Admin nur von zuhause oder über VPN benutzt wird, braucht die
Homelab-Variante **keine öffentliche Erreichbarkeit**. Ausgehend muss der
Container nur die GitHub-API erreichen.

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
| Sitzungen | Serverseitig in der Datenbank, jederzeit widerrufbar; Cookie `HttpOnly` + `SameSite=Strict` (+ `Secure`, sofern TLS) |
| Passwort-Raten | Sperre nach 8 Fehlversuchen je E-Mail **und** je IP, 15 Minuten |
| CSRF | `SameSite=Strict` plus Prüfung des `Origin`-Headers bei jedem Schreibzugriff |
| Schreibrechte | Nur `content/site.json`, `assets/img/` und `kataloge/` – Workflows und Skripte sind unerreichbar |
| Protokoll | Anmeldungen, Fehlversuche und Veröffentlichungen landen im Audit-Log |

> **Zum CPU-Limit (nur Cloudflare):** 600 000 PBKDF2-Runden brauchen den
> **Workers-Paid-Plan** (5 $/Monat, 30 s CPU pro Anfrage). Der Free-Plan erlaubt
> nur 10 ms CPU – dort schlägt der Login fehl. Wer beim Free-Plan bleiben will,
> setzt `PBKDF2_ITERATIONS` niedriger (z. B. `50000`) und nimmt in Kauf, dass ein
> gestohlener Datenbankabzug leichter angreifbar wäre. **Im Homelab gibt es das
> Limit nicht** – dort laufen die vollen Runden.

> **Zum Betrieb ohne TLS:** Wird das Admin im Heimnetz per `http://` aufgerufen,
> muss `COOKIE_SECURE=false` gesetzt sein – sonst sendet der Browser den
> Sitzungs-Cookie nie zurück und die Anmeldung schlägt still fehl. Der Server
> weigert sich zu starten, wenn beides nicht zusammenpasst. `SameSite=Strict`
> und der CSRF-Schutz wirken auch ohne TLS; im eigenen Netz ist das vertretbar.
> Wer TLS möchte, stellt den NGINX Proxy Manager davor und lässt
> `COOKIE_SECURE` auf `true`.

## Einrichtung A: Homelab (Docker)

Vorausgesetzt: der Docker-Host `s-lx04-docker` und ein GitHub-Token.

### 1. GitHub-Token anlegen

Unter **GitHub → Settings → Developer settings → Personal access tokens →
Fine-grained tokens**. Nur dieses eine Repository auswählen, als einzige
Berechtigung **Contents: Read and write**. Ablaufdatum setzen und notieren –
läuft der Token ab, meldet das Admin beim Öffnen „GitHub-Zugriff nicht möglich".

### 2. Volume anlegen

Auf `s-lx04-docker`:

```bash
docker volume create soy-admin-data
```

### 3. Stack deployen

Zwei Wege. Der erste spart den manuellen Build und ist deshalb der bequemere.

#### Weg A: Portainer baut selbst (empfohlen)

**Stacks → Add Stack → Repository**, Stack-Name `s-lx04-soy-admin`:

| Feld | Wert |
|---|---|
| Repository URL | `https://github.com/ShineOnYouByEla/SOY_Website` |
| Repository reference | `refs/heads/main` |
| Compose path | `backend/docker-compose.build.yml` |

Portainer klont das Repository auf den Docker-Host, findet den Quellcode neben
dem Compose-File und baut das Image dort. Updates laufen danach über
**Pull and redeploy**.

#### Weg B: Image von Hand bauen

Der Build muss **auf dem Docker-Host** laufen, nicht auf dem eigenen Rechner:
ein auf einem Apple-Silicon-Mac gebautes Image ist `arm64` und startet auf einem
x86-Host gar nicht.

```bash
ssh s-lx04-docker
git clone https://github.com/ShineOnYouByEla/SOY_Website.git
cd SOY_Website
docker build -f backend/Dockerfile -t soy-admin:latest .
```

Der Punkt am Ende ist wichtig: Der Build-Kontext ist das
**Repo-Wurzelverzeichnis**, nicht `backend/` – der Renderer unter `shared/` muss
mit ins Image.

Danach `backend/docker-compose.yml` unter **Stacks → Add Stack → Web editor**
einfügen. Diese Datei enthält bewusst keinen `build:`-Block: ein Web-Editor-Stack
liegt unter `/data/compose/<id>/` und hat keinen Quellcode neben sich, ein
Build-Versuch scheitert dort zwangsläufig.

#### In beiden Fällen

Unter **Environment variables** eintragen (nicht ins Compose-File schreiben):

| Variable | Wert |
|---|---|
| `GITHUB_TOKEN` | der Token aus Schritt 1 |
| `SETUP_TOKEN` | **selbst gewählt** – kein Wert, den man irgendwo abholt. Erzeugen z. B. mit `openssl rand -base64 32`. Er verhindert nur, dass in dem kurzen Zeitfenster mit offener Ersteinrichtung jemand anders ein Konto anlegt. |

Für die Ersteinrichtung `SETUP_ENABLED` einmalig auf `true` setzen.

**`ADMIN_ORIGIN` muss zur Adresse in der Browserzeile passen** – mit Schema und
Port. Im Heimnetz ist dasselbe Backend meist über zwei Wege erreichbar; dann
beide eintragen, durch Komma getrennt:

```
ADMIN_ORIGIN=http://admin.shineonyou.de:8080,http://192.168.178.13:8080
```

Was hier nicht steht, lehnt der CSRF-Schutz ab – die Fehlermeldung im Admin
nennt dann, welche Adressen erlaubt wären.

**`GITHUB_BRANCH` muss auf den Branch zeigen, in dem `content/site.json`
liegt.** Solange die Inhalte nur auf einem Testbranch liegen, meldet das Admin
beim Öffnen, die Datei sei nicht zu finden. Und: veröffentlicht wird in genau
diesen Branch – die Live-Seite baut sich nur aus `main`.

### 4. Erstes Konto anlegen

Von einem Rechner im selben Netz:

```bash
cd backend
npm install
npm run setup
```

Das Skript fragt zuerst die Adresse des Backends ab – **mit Port**:
`http://admin.shineonyou.de:8080` oder `http://192.168.178.13:8080`. Ohne Port
geht der Aufruf an Port 80 und läuft ins Leere.

Danach `SETUP_ENABLED` wieder auf `false` und den Stack neu starten.

### 5. Anmelden

`http://admin.shineonyou.de:8080` bzw. `http://192.168.178.13:8080` im Browser
öffnen – genau die Adresse, die in `ADMIN_ORIGIN` steht. Beim ersten Login wird die
Zwei-Faktor-App eingerichtet: QR-Code scannen, Code eingeben, die zehn
Wiederherstellungscodes ausdrucken oder in den Passwortmanager legen.

### Umgebungsvariablen

| Variable | Bedeutung |
|---|---|
| `ADMIN_ORIGIN` | Adresse(n), unter denen das Admin aufgerufen wird – mit Schema und Port. **Pflicht**. Mehrere durch Komma trennen. |
| `COOKIE_SECURE` | `false` beim Betrieb ohne TLS. Standard `true`. |
| `GITHUB_TOKEN` | Token mit Schreibrecht auf das Repository. |
| `GITHUB_REPO` / `GITHUB_BRANCH` | Ziel der Veröffentlichung. Standard `ShineOnYouByEla/SOY_Website` / `main`. |
| `SITE_URL` | Adresse der Live-Seite – wird für die Vorschau gebraucht. |
| `PBKDF2_ITERATIONS` | Rechenaufwand des Passwort-Hashings. Standard `600000`. |
| `SETUP_ENABLED` / `SETUP_TOKEN` | Nur für die Ersteinrichtung. |
| `DATABASE_PATH` | Standard `/data/soy-admin.db`. |
| `PORT` / `HOST` | Standard `8080` / `0.0.0.0`. Für eine Adresse ohne Port `PORT=80` setzen und im Stack `cap_add: NET_BIND_SERVICE` einkommentieren – der Container läuft als normaler Nutzer. |

### Aktualisieren

Watchtower greift hier nicht – das Image wird selbst gebaut:

Bei Weg A: in Portainer **Pull and redeploy** – mehr ist nicht nötig.

Bei Weg B auf dem Docker-Host:

```bash
cd SOY_Website && git pull
docker build -f backend/Dockerfile -t soy-admin:latest .
# danach in Portainer: Stack → Update (Re-pull deaktiviert lassen)
```

---

## Einrichtung B: Cloudflare Worker

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
npx wrangler secret put GITHUB_TOKEN   # Token wie oben unter A.1 beschrieben
npx wrangler secret put SETUP_TOKEN    # lange Zufallszeichenkette
```

### 4. Zum ersten Mal veröffentlichen

```bash
npm run deploy
```

Wrangler nennt danach die Adresse, z. B.
`https://soy-admin.deinname.workers.dev`. Diese Adresse in `wrangler.toml` bei
`ADMIN_ORIGIN` eintragen und **noch einmal** `npm run deploy` ausführen – sonst
lehnt der CSRF-Schutz alle Schreibzugriffe ab.

### 4. Erstes Konto anlegen

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
```

**Node-Variante lokal** (ab Node 22.13 ohne Flag; auf Node 22 gibt es noch
eine ExperimentalWarning, ab Node 24 auch die nicht mehr):

```bash
ADMIN_ORIGIN=http://localhost:8080 COOKIE_SECURE=false \
  SETUP_ENABLED=true SETUP_TOKEN=lokal PBKDF2_ITERATIONS=50000 \
  node src/node.js
```

**Cloudflare-Variante lokal:**

```bash
npm run db:init:local
printf 'SETUP_TOKEN=lokal\nGITHUB_TOKEN=lokal\n' > .dev.vars   # nicht ins Repo
npm run dev
```

In `wrangler.toml` dafür `ADMIN_ORIGIN` auf `http://localhost:8787` und
`PBKDF2_ITERATIONS` auf einen kleinen Wert setzen. Ohne echten `GITHUB_TOKEN`
funktioniert in beiden Fällen alles außer dem Veröffentlichen.

## Aufbau

```
backend/
├── Dockerfile          Image für den Homelab-Betrieb
├── docker-compose.yml  Portainer-Stack
├── wrangler.toml       Konfiguration der Cloudflare-Variante
├── schema.sql          Tabellen – identisch für SQLite und D1
├── src/
│   ├── app.js          die Anwendung: Routen, Sicherheits-Header, Publish
│   ├── node.js         Einstieg für Node/Docker
│   ├── worker.js       Einstieg für Cloudflare
│   ├── db-sqlite.js    SQLite im Gewand der D1-API
│   ├── assets-fs.js    statische Dateien von der Platte (Ersatz für ASSETS)
│   ├── auth.js         Sitzungen, Sperren, Protokoll
│   ├── crypto.js       Passwort-Hashing, Zufall, Vergleiche
│   ├── totp.js         Zweiter Faktor nach RFC 6238
│   ├── github.js       Commits über die Git-Data-API
│   └── content.js      Prüfung der Inhalte und Vorschau
├── public/             Admin-Oberfläche (kein Build-Schritt)
└── test/               Tests
```

`app.js` weiß nichts von der Plattform. Alles Unterschiedliche kommt über
`c.env` herein – `env.DB` im Stil der D1-API und `env.ASSETS` für die
Auslieferung der Oberfläche. Deshalb gibt es nur eine Anwendung, nicht zwei.

Der Renderer liegt bewusst außerhalb unter `../shared/` – dieselbe Datei erzeugt
die Vorschau im Worker und `index.html` im Build.

## Wenn etwas klemmt

| Meldung | Ursache |
|---|---|
| „GitHub-Zugriff nicht möglich: Bad credentials" | `GITHUB_TOKEN` fehlt, ist falsch oder abgelaufen |
| „Anfrage von einer fremden Herkunft" | `ADMIN_ORIGIN` passt nicht zur aufgerufenen Adresse |
| „Exceeded CPU limit" beim Login | Cloudflare Free-Plan – `PBKDF2_ITERATIONS` senken oder auf Paid wechseln |
| Anmeldung springt zurück zum Login | Cookie kommt nicht an: bei `http://` muss `COOKIE_SECURE=false` gesetzt sein |
| Server startet nicht, meckert über ADMIN_ORIGIN | Adresse fehlt oder passt nicht zum `COOKIE_SECURE`-Wert – die Meldung sagt, was zu tun ist |
| Container startet, aber `/api/ping` antwortet nicht | Healthcheck prüft Port 8080 im Container; bei geändertem `PORT` auch den Healthcheck anpassen |
| Portainer: „lstat /data/compose/backend: no such file or directory" | Ein Web-Editor-Stack versucht zu bauen. Entweder `docker-compose.yml` verwenden und das Image vorher bauen (Weg B), oder auf einen Repository-Stack wechseln (Weg A) |
| Portainer: „pull access denied for soy-admin" | Das Image ist auf dem Host noch nicht gebaut – siehe A.3, Weg B |
| „Cannot connect to the Docker daemon at unix:///Users/…" | Der Befehl lief auf dem eigenen Rechner statt auf dem Docker-Host |
| Container startet nicht, „exec format error" | Das Image wurde für die falsche Architektur gebaut (z. B. auf einem Apple-Silicon-Mac). Auf dem Docker-Host bauen |
| Portainer: „volume soy-admin-data declared as external, but could not be found" | `docker volume create soy-admin-data` fehlt – siehe A.2 |
| `npm run setup`: „… ist nicht erreichbar" | Meist fehlt der Port. Der Container lauscht auf 8080: `http://admin.shineonyou.de:8080` |
| „SETUP_TOKEN ist nicht gesetzt" | Die Stack-Variable `SETUP_TOKEN` fehlt im Container |
| „Anfrage von einer fremden Herkunft wurde abgelehnt" | Die aufgerufene Adresse steht nicht in `ADMIN_ORIGIN`. Die Meldung nennt, was erlaubt wäre – fehlende Adresse dort ergänzen (Komma-getrennt) |
| „content/site.json wurde in … nicht gefunden" | `GITHUB_BRANCH` zeigt auf einen Branch ohne die Datei. Auf den richtigen Branch stellen oder die Inhalte dorthin mergen |
| „Das Repository wurde zwischenzeitlich geändert" | Jemand hat parallel committet: Seite neu laden, erneut veröffentlichen |
| Handy verloren | Mit einem Wiederherstellungscode anmelden, im Menü unter „Konto & Sicherheit" neu einrichten |
| Alle Zugänge verloren | `SETUP_ENABLED` kurz auf `true`, Benutzer per `wrangler d1 execute` löschen, `npm run setup` |
