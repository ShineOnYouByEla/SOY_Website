# Shine On You – Website

Statische Landing- & Kontaktseite für den Direktvertrieb von proWin-Produkten.
Gebaut mit reinem HTML, CSS und JavaScript – kein Build-Schritt nötig.

## Vorschau / lokal starten

Einfach `index.html` im Browser öffnen, oder einen kleinen Server starten:

```bash
python3 -m http.server 8000
# danach http://localhost:8000 öffnen
```

## Projektstruktur

```
.
├── index.html        # Seiteninhalt (Hero, Über, Produkte, Termin, Kontakt)
├── css/styles.css    # Styles & Markenfarben
├── js/script.js      # Mobile-Menü, Terminbuchung (.ics), Formulare
├── assets/img/       # aus dem Iconset abgeleitete Logos & Favicons
└── iconset/          # Original-Logodateien
```

## Anpassen

**Kontaktdaten** stehen zentral oben in `js/script.js` im `CONFIG`-Objekt:

```js
const CONFIG = {
  ownerName: "Manuela Zimmert",
  email: "manuela@shineonyou.de",  // Empfangsadresse
  phone: "+49 173 2008319",        // Telefon (Anzeige)
  phoneHref: "+491732008319",      // Telefon für tel:-Link
  web3formsKey: "",                // Web3Forms Access Key -> echter Formularversand
  calLink: "",                     // Cal.com-Link -> Online-Terminbuchung
};
```

E-Mail und Telefon werden daraus automatisch in die Seite geschrieben.
`web3formsKey` und `calLink` schalten die erweiterten Funktionen frei (siehe unten).

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
   (`manuela@shineonyou.de`) eintragen.
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

## Hosting

Die Seite ist statisch und läuft u. a. auf **GitHub Pages**, **Netlify** oder
**Cloudflare Pages** ohne weitere Konfiguration.

## Datenschutz / Recht

- **Schriften** sind **lokal eingebunden** (`assets/fonts/`, `css/fonts.css`) –
  es gibt keinen externen Aufruf bei Google Fonts.
- **Einwilligungs-Checkbox** (DSGVO) ist Pflicht vor dem Absenden beider Formulare.
- **Impressum** (`impressum.html`) und **Datenschutzerklärung** (`datenschutz.html`)
  sind mit den echten Angaben befüllt (Inhaberin, Anschrift, Kleinunternehmer-Hinweis,
  Hoster united-domains, Web3Forms, Cal.com) und im Footer verlinkt.

### Noch offen

- **Web3Forms Access Key** und **Cal.com-Link** in `js/script.js` eintragen
  (siehe oben) – bis dahin greift der mailto-/`.ics`-Fallback.

> Empfehlung: Die Datenschutzerklärung vor dem Live-Gang zusätzlich mit einem
> Generator (z. B. e-Recht24) oder anwaltlich prüfen lassen – die Verantwortung für
> die Richtigkeit liegt bei der Betreiberin.
