# Shine On You – Website

Statische Landing- & Kontaktseite für den Direktvertrieb von proWIN-Produkten.
Gebaut mit reinem HTML, CSS und JavaScript.

Die Inhalte stehen in **`content/site.json`**; daraus entsteht `index.html`.
Gepflegt werden sie entweder direkt in der Datei oder bequem über das
**Admin-Backend** mit Anmeldung und Zwei-Faktor-Bestätigung → [`backend/`](backend/README.md).
Das läuft wahlweise als Docker-Container im Heimnetz (nicht öffentlich erreichbar)
oder als Cloudflare Worker.

## Vorschau / lokal starten

```bash
node scripts/build-site.mjs   # index.html + js/config.js aus content/site.json
python3 -m http.server 8000
# danach http://localhost:8000 öffnen
```

> `index.html` und `js/config.js` werden **erzeugt** – Änderungen darin gehen beim
> nächsten Build verloren. Inhalte gehören nach `content/site.json` (oder ins Admin).
> Die CI schlägt Alarm, wenn die erzeugten Dateien nicht zum Inhalt passen.

## Projektstruktur

```
.
├── content/site.json # ALLE Inhalte: Texte, Kontaktdaten, Bilder, Sektionen
├── shared/render.mjs # erzeugt daraus das HTML (läuft in Node und im Worker)
├── shared/icons.mjs  # die Inline-SVGs unter sprechenden Namen
├── scripts/          # Build-Skripte und Qualitätsprüfungen
├── backend/          # Admin-Backend (Cloudflare Worker) – siehe backend/README.md
├── index.html        # ERZEUGT aus content/site.json – nicht von Hand ändern
├── js/config.js      # ERZEUGT – Kontaktdaten und Dienste für script.js
├── css/styles.css    # Styles & Markenfarben
├── js/script.js      # Mobile-Menü, Terminbuchung (.ics), Formulare
├── assets/img/       # aus dem Iconset abgeleitete Logos & Favicons
└── kataloge/         # PDF-Kataloge
```

## Anpassen

Am bequemsten geht das über das **Admin-Backend** – dort gibt es Formulare,
eine Live-Vorschau und einen Veröffentlichen-Knopf: [`backend/README.md`](backend/README.md).

Wer lieber direkt in der Datei arbeitet, findet alles in `content/site.json`:

```jsonc
{
  "contact": {
    "email": "prowin.ela@web.de",     // Empfangsadresse
    "phone": "+49 1551 0279357",      // Mobil (Anzeige)
    "phoneHref": "+4915510279357"     // Mobil für tel:-Link
  },
  "services": {
    "web3formsKey": "…",              // echter Formularversand
    "calLink": "…"                    // Online-Terminbuchung
  },
  "sections": [ /* Reihenfolge und "enabled" steuern den Seitenaufbau */ ]
}
```

Danach `node scripts/build-site.mjs` ausführen und beides committen.
E-Mail und Telefon landen automatisch überall auf der Seite – im Kontaktblock,
in `js/config.js` und in den strukturierten Daten für Suchmaschinen.

## Funktionen

- **Kontaktformular & Terminbuchung** funktionieren in zwei Stufen:
  - **Ohne Einrichtung (Fallback):** Kontaktformular öffnet eine vorausgefüllte
    E-Mail; die Terminbuchung erzeugt zusätzlich eine `.ics`-Kalenderdatei.
  - **Mit Einrichtung:** echter Versand im Hintergrund (Web3Forms) und echte
    Online-Buchung mit Verfügbarkeit + Apple-Kalender-Sync (Cal.com).

Die Stufen schalten sich **automatisch** frei, sobald die jeweiligen Schlüssel in
`js/script.js` (`CONFIG`) eingetragen sind – sonst bleibt der Fallback aktiv.

### Echter Formularversand mit Web3Forms

Funktioniert auf jedem Hosting, großzügiges Gratis-Kontingent, kein Konto-Login nötig.

1. Auf [web3forms.com](https://web3forms.com) die Empfänger-E-Mail
   (`prowin.ela@web.de`) eintragen.
2. Den **Access Key** aus der Bestätigungs-E-Mail kopieren.
3. In `js/script.js` eintragen:

   ```js
   web3formsKey: "DEIN-ACCESS-KEY",
   ```

Danach werden **Kontakt- und Terminanfragen direkt versendet** (kein
E-Mail-Programm mehr nötig) und es erscheint eine Erfolgsmeldung.

> Alternative: Beim Hosting über Netlify ginge auch
> [Netlify Forms](https://docs.netlify.com/forms/setup/) – sag Bescheid.

### Online-Terminbuchung mit Apple-Kalender-Sync (Cal.com)

1. Konto auf [cal.com](https://cal.com) anlegen.
2. Unter **Apps/Calendars** den **Apple Calendar** verbinden
   (Verfügbarkeit wird abgeglichen, bestätigte Termine landen automatisch dort).
3. Einen **Event-Typ** anlegen, z. B. „Beratung, 30 Min“.
4. Den Link `benutzername/event` (steht in der Buchungs-URL
   `https://cal.com/benutzername/event`) in `js/script.js` eintragen:

   ```js
   calLink: "benutzername/beratung",
   ```

Dann erscheint das **Buchungs-Widget direkt auf der Seite**; das `.ics`-Formular
wird automatisch ausgeblendet.

> Alternative: Calendly-Embed lässt sich genauso einbinden – sag Bescheid.

## Hosting über GitHub Pages

Die Seite wird per GitHub Actions automatisch auf GitHub Pages veröffentlicht
(`.github/workflows/deploy-pages.yml`). **Einmalige Einrichtung im Repo:**

1. **Settings → Pages** öffnen.
2. Unter **Build and deployment → Source** „**GitHub Actions**" auswählen.
3. Sobald der Branch nach `main` gemergt ist, läuft der Workflow automatisch und
   veröffentlicht die Seite. Die URL erscheint danach unter **Settings → Pages**
   (Format: `https://shineonyoubyela.github.io/SOY_Website/`).

Jeder weitere Push auf `main` aktualisiert die Live-Seite automatisch.

### Eigene Domain (später)

Wenn `shineonyou.de` (z. B. bei united-domains) auf GitHub Pages zeigen soll:
Domain unter **Settings → Pages → Custom domain** eintragen und beim Domain-Anbieter
die DNS-Einträge setzen. **Wichtig:** Wechselt der Hoster, muss der Abschnitt
„Hosting" in `datenschutz.html` angepasst werden (aktuell: GitHub Pages).

> Hinweis: Der Datenschutz-Abschnitt „Hosting" nennt derzeit **GitHub, Inc. (USA)**
> als Hoster, da die Seite zunächst über GitHub Pages läuft.

## Datenschutz / Recht

- **Schriften** sind **lokal eingebunden** (`assets/fonts/`, `css/fonts.css`) –
  es gibt keinen externen Aufruf bei Google Fonts.
- **Einwilligungs-Checkbox** (DSGVO) ist Pflicht vor dem Absenden beider Formulare.
- **Impressum** (`impressum.html`) und **Datenschutzerklärung** (`datenschutz.html`)
  sind mit den echten Angaben befüllt (Inhaberin, Anschrift, Kleinunternehmer-Hinweis,
  Hoster GitHub Pages, Web3Forms, Cal.com) und im Footer verlinkt.
- **Cal.com-Embed** wird über eine **2-Klick-Lösung** eingebunden: Das externe
  Widget lädt erst, nachdem die Besucherin/der Besucher aktiv auf
  „Online-Terminbuchung laden" klickt (DSGVO-konforme Einwilligung).

### Noch offen

- **Web3Forms Access Key** in `js/script.js` eintragen (siehe oben) – bis dahin
  greift beim Kontaktformular der mailto-Fallback.
