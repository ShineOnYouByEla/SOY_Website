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
};
```

E-Mail und Telefon werden daraus automatisch in die Seite geschrieben.

## Funktionen

- **Terminbuchung:** erzeugt eine `.ics`-Kalenderdatei (öffnet sich per Doppelklick
  in Apple Kalender, Google Kalender, Outlook) **und** öffnet eine vorausgefüllte
  E-Mail-Anfrage an dich.
- **Kontaktformular & Nachricht senden:** öffnet das E-Mail-Programm mit
  vorausgefüllter Nachricht (kein Server nötig).

### Optional: Formulare ohne E-Mail-Programm versenden

Für echten Versand im Hintergrund lässt sich z. B. [Formspree](https://formspree.io)
oder, beim Hosting über [Netlify](https://www.netlify.com), das eingebaute
Formular-Feature anbinden. Sag Bescheid, dann richte ich das ein.

### Optional: Zwei-Wege-Sync mit Apple Kalender

Aktuell wird pro Anfrage eine `.ics`-Datei erzeugt. Für eine echte Online-Buchung
mit Verfügbarkeitsabgleich direkt in deinem Apple Kalender eignet sich ein Dienst
wie [Cal.com](https://cal.com) oder Calendly (lässt sich mit Apple Kalender
verbinden) – kann später als „Termin buchen“-Link integriert werden.

## Hosting

Die Seite ist statisch und läuft u. a. auf **GitHub Pages**, **Netlify** oder
**Cloudflare Pages** ohne weitere Konfiguration.

## ⚠️ Noch zu ergänzen (rechtlich)

Für eine geschäftliche Website in Deutschland sind **Impressum** und
**Datenschutzerklärung** verpflichtend. Die Links im Footer sind aktuell nur
Platzhalter.
