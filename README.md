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
  email: "christoph@zeitler.tech", // Empfangsadresse
  phone: "+49 (0) 000 000 000",    // Telefon (Anzeige)
  phoneHref: "+490000000000",      // Telefon für tel:-Link
  instagram: "https://instagram.com/",
  formspreeId: "",                 // Formspree-ID -> echter Formularversand
  calLink: "",                     // Cal.com-Link -> Online-Terminbuchung
};
```

E-Mail und Telefon werden daraus automatisch in die Seite geschrieben.
`formspreeId` und `calLink` schalten die erweiterten Funktionen frei (siehe unten).

## Funktionen

- **Kontaktformular & Terminbuchung** funktionieren in zwei Stufen:
  - **Ohne Einrichtung (Fallback):** Kontaktformular öffnet eine vorausgefüllte
    E-Mail; die Terminbuchung erzeugt zusätzlich eine `.ics`-Kalenderdatei.
  - **Mit Einrichtung:** echter Versand im Hintergrund (Formspree) und echte
    Online-Buchung mit Verfügbarkeit + Apple-Kalender-Sync (Cal.com).

Die Stufen schalten sich **automatisch** frei, sobald die jeweiligen IDs in
`js/script.js` (`CONFIG`) eingetragen sind – sonst bleibt der Fallback aktiv.

### Echter Formularversand mit Formspree (empfohlen)

Funktioniert auf jedem Hosting (auch GitHub Pages), Gratis-Kontingent reicht für
den Anfang.

1. Konto auf [formspree.io](https://formspree.io) anlegen.
2. Neues Formular erstellen → Empfänger-E-Mail bestätigen.
3. Die Form-ID aus der Endpoint-URL `https://formspree.io/f/XXXXXXXX` kopieren.
4. In `js/script.js` eintragen:

   ```js
   formspreeId: "XXXXXXXX",
   ```

Danach werden **Kontakt- und Terminanfragen direkt versendet** (kein
E-Mail-Programm mehr nötig) und es erscheint eine Erfolgsmeldung.

> Alternativen: [Web3Forms](https://web3forms.com) (nur Access-Key) oder, beim
> Hosting über Netlify, [Netlify Forms](https://docs.netlify.com/forms/setup/).
> Beide lassen sich analog in `sendViaFormspree()` anbinden – sag Bescheid.

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
  sind als Entwurf vorhanden und im Footer verlinkt.

### ⚠️ Vor dem Live-Gang ausfüllen

Beide Rechtsseiten enthalten **Platzhalter** (farbig als `[…]` markiert), die mit den
echten Angaben ersetzt werden müssen:

- Name, ladungsfähige Anschrift, Telefon, E-Mail
- USt-IdNr. **oder** Hinweis auf Kleinunternehmer-Regelung (§ 19 UStG)
- Name und Anschrift des **Webhosters** (in der Datenschutzerklärung)

> Empfehlung: Die Datenschutzerklärung zusätzlich mit einem Generator
> (z. B. e-Recht24) oder anwaltlich prüfen lassen – die Verantwortung für die
> Richtigkeit liegt bei der Betreiberin.
